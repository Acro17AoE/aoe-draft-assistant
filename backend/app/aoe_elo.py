"""Fetch tournament player data from aoe-elo.com (no API key, ~100 req/hr)."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from .history_scope import HistoryScope, tournament_in_scope

logger = logging.getLogger(__name__)

AOE_ELO_BASE = "https://aoe-elo.com/api"
AOE_ELO_USER_AGENT = "AoE-Draft-Assistant/1.0"
CACHE_TTL_SECONDS = 3600.0

_players_cache: tuple[float, list[dict[str, Any]]] | None = None
_tournaments_cache: tuple[float, list[dict[str, Any]]] | None = None


def _normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(connect=12.0, read=45.0, write=20.0, pool=12.0),
        headers={"User-Agent": AOE_ELO_USER_AGENT},
    )


def _friendly_network_error(exc: Exception, what: str) -> RuntimeError:
    message = str(exc).strip() or exc.__class__.__name__
    if isinstance(exc, (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException)):
        return RuntimeError(
            f"Timed out reaching aoe-elo.com while loading {what}. "
            "The server hosting DRAFT may be blocked or slow to reach aoe-elo — retry in a minute."
        )
    if isinstance(exc, httpx.ConnectError):
        return RuntimeError(
            f"Could not connect to aoe-elo.com while loading {what} ({message}). "
            "Check outbound HTTPS from the API host."
        )
    return RuntimeError(f"aoe-elo.com error while loading {what}: {message}")


async def _fetch_json(client: httpx.AsyncClient, params: dict[str, str]) -> Any:
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = await client.get(AOE_ELO_BASE, params=params)
            response.raise_for_status()
            return response.json()
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_error = exc
            if attempt == 0:
                await asyncio.sleep(1.2)
                continue
            raise _friendly_network_error(exc, params.get("request", "data")) from exc
        except httpx.HTTPError as exc:
            raise _friendly_network_error(exc, params.get("request", "data")) from exc
    assert last_error is not None
    raise _friendly_network_error(last_error, params.get("request", "data"))


async def fetch_all_players(*, force: bool = False) -> list[dict[str, Any]]:
    global _players_cache
    now = time.time()
    if not force and _players_cache and now - _players_cache[0] < CACHE_TTL_SECONDS:
        return _players_cache[1]

    async with _client() as client:
        data = await _fetch_json(client, {"request": "players"})
    if not isinstance(data, list):
        raise ValueError("Unexpected aoe-elo players response")

    _players_cache = (now, data)
    return data


async def fetch_all_tournaments(*, force: bool = False) -> list[dict[str, Any]]:
    global _tournaments_cache
    now = time.time()
    if not force and _tournaments_cache and now - _tournaments_cache[0] < CACHE_TTL_SECONDS:
        return _tournaments_cache[1]

    async with _client() as client:
        data = await _fetch_json(client, {"request": "tournaments"})
    if not isinstance(data, list):
        raise ValueError("Unexpected aoe-elo tournaments response")

    _tournaments_cache = (now, data)
    return data


async def fetch_player(player_id: int) -> dict[str, Any]:
    async with _client() as client:
        data = await _fetch_json(client, {"request": "player", "id": str(player_id)})
    if not isinstance(data, dict):
        raise ValueError(f"Unexpected aoe-elo player response for id {player_id}")
    return data


async def fetch_tournament(tournament_id: int) -> dict[str, Any]:
    async with _client() as client:
        data = await _fetch_json(client, {"request": "tournament", "id": str(tournament_id)})
    if not isinstance(data, dict):
        raise ValueError(f"Unexpected aoe-elo tournament response for id {tournament_id}")
    return data


def _score_player_match(query: str, player: dict[str, Any]) -> int:
    name = str(player.get("name") or "")
    normalized_query = _normalize_name(query)
    normalized_name = _normalize_name(name)
    if not normalized_query or not normalized_name:
        return 0
    if normalized_query == normalized_name:
        return 100
    if normalized_name.startswith(normalized_query) or normalized_query.startswith(normalized_name):
        return 80
    if normalized_query in normalized_name or normalized_name in normalized_query:
        return 60
    query_parts = normalized_query.split()
    name_parts = normalized_name.split()
    if query_parts and all(part in normalized_name for part in query_parts):
        return 50
    if name_parts and all(part in normalized_query for part in name_parts):
        return 45
    return 0


async def resolve_player(
    name: str,
    *,
    players: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    query = name.strip()
    if not query:
        return None

    roster = players if players is not None else await fetch_all_players()
    scored = [(_score_player_match(query, player), player) for player in roster]
    scored = [(score, player) for score, player in scored if score > 0]
    if not scored:
        return None

    scored.sort(key=lambda item: (item[0], -(item[1].get("elo") or 0)), reverse=True)
    best_score, best = scored[0]

    profile = await fetch_player(int(best["id"]))
    profile["_matchScore"] = best_score
    profile["_resolvedFrom"] = query
    return profile


def tournament_lookup(tournaments: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    lookup: dict[int, dict[str, Any]] = {}
    for entry in tournaments:
        entry_id = entry.get("id")
        if isinstance(entry_id, int):
            lookup[entry_id] = entry
    return lookup


def scoped_elo_tournaments_for_player(
    player: dict[str, Any],
    all_tournaments: list[dict[str, Any]],
    scope: HistoryScope,
) -> list[dict[str, Any]]:
    lookup = tournament_lookup(all_tournaments)
    ids = [int(value) for value in (player.get("tournaments_list") or []) if isinstance(value, int)]
    now = time.time()

    entries: list[dict[str, Any]] = []
    for tournament_id in ids:
        entry = lookup.get(tournament_id)
        if not entry:
            continue
        start = entry.get("start_timestamp")
        start_ts = int(start) if isinstance(start, (int, float)) else None
        if not tournament_in_scope(start_ts, scope, now=now):
            continue
        entries.append(entry)

    entries.sort(key=lambda item: int(item.get("start_timestamp") or 0), reverse=True)

    if scope.max_tournaments is not None:
        return entries[: scope.max_tournaments]
    return entries


def career_summary(player: dict[str, Any]) -> dict[str, Any]:
    series_played = int(player.get("series_played") or 0)
    series_won = int(player.get("series_won") or 0)
    games_played = int(player.get("games_played") or 0)
    win_rate = round((series_won / series_played) * 100, 1) if series_played else None

    return {
        "id": player.get("id"),
        "name": player.get("name"),
        "elo": player.get("elo"),
        "peakElo": player.get("peak_elo") or player.get("peakElo"),
        "rank": player.get("rank"),
        "teamName": player.get("team_name"),
        "seriesPlayed": series_played,
        "seriesWon": series_won,
        "seriesWinRate": win_rate,
        "gamesPlayed": games_played,
        "tournamentsPlayed": int(player.get("tournaments_played") or 0),
        "firstSeriesTime": player.get("first_series_time"),
        "peakTime": player.get("peak_time"),
        "lastSeriesTime": player.get("last_series_time"),
        "inactive": bool(player.get("inactive")),
        "retired": bool(player.get("retired")),
        "url": player.get("url"),
    }
