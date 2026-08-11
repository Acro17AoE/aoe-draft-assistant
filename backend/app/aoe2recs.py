import json
import re
import threading
import time
from collections import Counter, defaultdict

import websocket

from .name_utils import names_match

WS_URL = "wss://aoe2recs.com/dashboard/api/"
WS_CONNECT_TIMEOUT = 15
WS_RECV_TIMEOUT = 20
_CATALOG_CACHE: tuple[float, list[dict]] | None = None
_CATALOG_TTL_SECONDS = 300.0
_CATALOG_WARM_LOCK = threading.RLock()


def ensure_tournament_catalog(limit: int = 80) -> None:
    """Load aoe2recs tournament catalog once (thread-safe, cached 5 min)."""
    fetch_tournaments(limit)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug


def _connect():
    try:
        ws = websocket.create_connection(
            WS_URL,
            header=["Origin: https://aoe2recs.com", "User-Agent: AoE-Draft-Assistant/1.0"],
            timeout=WS_CONNECT_TIMEOUT,
        )
    except Exception as exc:
        message = str(exc).strip() or exc.__class__.__name__
        raise RuntimeError(
            f"Could not reach aoe2recs.com ({message}). "
            "Draft history needs outbound WebSocket access from the API host."
        ) from exc
    ws.settimeout(WS_RECV_TIMEOUT)
    return ws


def _tournament_id_matches(requested: str, payload: dict) -> bool:
    returned = str(payload.get("tournament_id") or payload.get("id") or "")
    if not returned:
        return False
    if returned == requested:
        return True
    return _slugify(returned) == _slugify(requested)


def fetch_tournament(tournament_id: str) -> dict:
    ws = _connect()
    deadline = time.time() + 25
    try:
        _recv_json(ws, deadline)
        ws.send(
            json.dumps(
                {
                    "tournament": {
                        "page": 0,
                        "size": 0,
                        "props": {
                            "series_id": None,
                            "tournament_id": tournament_id,
                        },
                    }
                }
            )
        )

        for _ in range(15):
            if time.time() > deadline:
                break
            message = _recv_json(ws, deadline)
            if message is None:
                break
            if message.get("cls") != 3:
                continue
            for item in message.get("data", []):
                if item.get("cls") not in (11, 30):
                    continue
                data = item.get("data")
                if not isinstance(data, dict):
                    continue
                if data.get("type") != "tournament":
                    continue
                if not _tournament_id_matches(tournament_id, data):
                    continue
                return data
        raise ValueError(f"Tournament '{tournament_id}' not found on aoe2recs.com")
    finally:
        ws.close()


def _recv_json(ws, deadline: float) -> dict | None:
    if time.time() > deadline:
        return None
    try:
        remaining = max(1.0, deadline - time.time())
        ws.settimeout(min(WS_RECV_TIMEOUT, remaining))
        raw = ws.recv()
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        return None


def _extract_tournament_catalog(messages: list[dict]) -> list[dict]:
    catalog: list[dict] = []
    seen: set[str] = set()

    for message in messages:
        if message.get("cls") != 3:
            continue
        for item in message.get("data", []):
            data = item.get("data")
            if not isinstance(data, dict):
                continue

            if data.get("type") == "tournaments":
                entries = data.get("tournaments", [])
                if isinstance(entries, list):
                    for entry in entries:
                        if isinstance(entry, dict):
                            catalog.append(entry)
                continue

            entries = data.get("tournaments")
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                entry_id = str(entry.get("id") or entry.get("tournament_id") or "")
                if entry_id and entry_id in seen:
                    continue
                if entry_id:
                    seen.add(entry_id)
                catalog.append(entry)

    return catalog


def fetch_tournaments(limit: int = 50) -> list[dict]:
    global _CATALOG_CACHE
    now = time.time()
    if _CATALOG_CACHE and now - _CATALOG_CACHE[0] < _CATALOG_TTL_SECONDS:
        return _CATALOG_CACHE[1][:limit]

    with _CATALOG_WARM_LOCK:
        now = time.time()
        if _CATALOG_CACHE and now - _CATALOG_CACHE[0] < _CATALOG_TTL_SECONDS:
            return _CATALOG_CACHE[1][:limit]

        ws = _connect()
        deadline = time.time() + 30
        try:
            _recv_json(ws, deadline)
            ws.send(json.dumps({"tournaments": {"page": 0, "size": max(limit, 80)}}))

            messages: list[dict] = []
            for _ in range(40):
                if time.time() > deadline:
                    break
                message = _recv_json(ws, deadline)
                if message is None:
                    break
                messages.append(message)
                catalog = _extract_tournament_catalog(messages)
                if len(catalog) >= max(limit, 80):
                    break

            catalog = _extract_tournament_catalog(messages)
            _CATALOG_CACHE = (time.time(), catalog)
            return catalog[:limit]
        finally:
            ws.close()


def _normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def _slug_tokens(value: str) -> set[str]:
    parts = re.split(r"[^a-z0-9]+", value.lower())
    return {part for part in parts if len(part) >= 3}


def suggest_tournaments(
    preset_name: str,
    host: str,
    guest: str,
    limit: int = 5,
) -> list[dict[str, object]]:
    tournaments = fetch_tournaments()
    preset_tokens = _slug_tokens(preset_name)
    participant_tokens = _slug_tokens(f"{host} {guest}")

    scored: list[tuple[int, dict[str, object]]] = []
    for tournament in tournaments:
        tournament_id = (
            tournament.get("tournament_id")
            or tournament.get("id")
            or tournament.get("slug")
            or ""
        )
        name = tournament.get("name") or tournament.get("title") or tournament_id
        if not tournament_id:
            continue

        name_tokens = _slug_tokens(f"{name} {tournament_id}")
        overlap = len(preset_tokens.intersection(name_tokens))
        participant_overlap = len(participant_tokens.intersection(name_tokens))

        score = overlap * 4 + participant_overlap * 2
        if "cup" in preset_tokens and "cup" in name_tokens:
            score += 2
        if overlap == 0 and participant_overlap == 0:
            continue

        reasons: list[str] = []
        if overlap:
            reasons.append("Preset name matches tournament")
        if participant_overlap:
            reasons.append("Player names match tournament")

        scored.append(
            (
                score,
                {
                    "tournamentId": tournament_id,
                    "name": name,
                    "score": score,
                    "reason": "; ".join(reasons) or "Possible match",
                },
            )
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in scored[:limit]]


def _player_names(series: dict) -> list[str]:
    names: list[str] = []
    for key in ("players", "player_names", "names"):
        value = series.get(key)
        if isinstance(value, list):
            names.extend(str(item) for item in value)
    teams = series.get("teams")
    if isinstance(teams, list):
        for team in teams:
            if isinstance(team, dict):
                for key in ("name", "player", "players"):
                    entry = team.get(key)
                    if isinstance(entry, str):
                        names.append(entry)
                    elif isinstance(entry, list):
                        names.extend(str(item) for item in entry)
    title = series.get("name") or series.get("title") or ""
    if " vs " in title:
        names.extend(part.strip() for part in title.split(" vs ", 1))
    return names


def _game_map_name(game: dict) -> str | None:
    for key in ("map", "map_name", "mapName"):
        value = game.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _game_players(game: dict) -> list[str]:
    players: list[str] = []
    for key in ("players", "player_names"):
        value = game.get(key)
        if isinstance(value, list):
            players.extend(str(item) for item in value)
    return players


def iter_tournament_matches(tournament: dict):
    """Yield (round_name, match_id, match) from legacy series or modern rounds layout."""
    rounds = tournament.get("rounds")
    if isinstance(rounds, dict):
        for round_name, matches in rounds.items():
            if not isinstance(matches, dict):
                continue
            for match_id, match in matches.items():
                if isinstance(match, dict):
                    yield str(round_name), str(match_id), match

    series_list = tournament.get("series", [])
    if isinstance(series_list, list):
        for index, series in enumerate(series_list):
            if isinstance(series, dict):
                match_id = str(series.get("id") or series.get("series_id") or index)
                yield f"Series {index + 1}", match_id, series


def match_participant_names(match: dict) -> list[str]:
    names: list[str] = []
    participants = match.get("participants")
    if isinstance(participants, list):
        for entry in participants:
            if not isinstance(entry, dict):
                continue
            player = entry.get("player")
            if isinstance(player, dict):
                name = player.get("name")
                if isinstance(name, str) and name.strip():
                    names.append(name.strip())
    names.extend(_player_names(match))
    deduped: list[str] = []
    seen: set[str] = set()
    for name in names:
        key = _normalize_name(name)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(name)
    return deduped


def match_participant_scores(match: dict) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    participants = match.get("participants")
    if not isinstance(participants, list):
        return rows
    for entry in participants:
        if not isinstance(entry, dict):
            continue
        player = entry.get("player")
        if not isinstance(player, dict):
            continue
        name = player.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        rows.append(
            {
                "name": name.strip(),
                "score": entry.get("score"),
                "winner": entry.get("winner"),
            }
        )
    return rows


def match_draft_links(match: dict) -> list[dict[str, str]]:
    drafts: list[dict[str, str]] = []
    for entry in match.get("drafts") or []:
        if not isinstance(entry, dict):
            continue
        url = entry.get("url")
        draft_type = entry.get("type")
        preset = entry.get("preset")
        if isinstance(url, str) and url.strip():
            drafts.append(
                {
                    "type": str(draft_type or "unknown"),
                    "url": url.strip(),
                    "preset": str(preset or ""),
                }
            )
    return drafts


def _names_include_player(names: list[str], player_name: str) -> bool:
    return any(names_match(name, player_name) for name in names)


def search_tournaments_by_query(query: str, *, limit: int = 8) -> list[dict[str, object]]:
    query = query.strip()
    if not query:
        return []

    tournaments = fetch_tournaments(limit=80)
    query_tokens = _slug_tokens(query)
    if not query_tokens:
        return []

    scored: list[tuple[int, dict[str, object]]] = []
    for tournament in tournaments:
        tournament_id = (
            tournament.get("tournament_id")
            or tournament.get("id")
            or tournament.get("slug")
            or ""
        )
        name = tournament.get("name") or tournament.get("title") or tournament_id
        if not tournament_id:
            continue

        name_tokens = _slug_tokens(f"{name} {tournament_id}")
        overlap = len(query_tokens.intersection(name_tokens))
        if overlap == 0:
            continue

        score = overlap * 5
        if _normalize_name(query) in _normalize_name(str(name)):
            score += 10
        if _normalize_name(query) in _normalize_name(str(tournament_id)):
            score += 8

        scored.append(
            (
                score,
                {
                    "tournamentId": str(tournament_id),
                    "name": name,
                    "score": score,
                },
            )
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in scored[:limit]]


def resolve_tournament_slug(query: str) -> tuple[str | None, list[dict[str, object]]]:
    """Resolve a tournament name or slug to an aoe2recs tournament id."""
    query = query.strip()
    if not query:
        return None, []

    suggestions = search_tournaments_by_query(query)
    if suggestions:
        return str(suggestions[0]["tournamentId"]), suggestions

    candidates = [query, _slugify(query)]
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        try:
            tournament = fetch_tournament(candidate)
        except Exception:
            continue
        tournament_id = str(
            tournament.get("tournament_id")
            or tournament.get("id")
            or candidate
        )
        name = tournament.get("name") or query
        return tournament_id, [
            {
                "tournamentId": tournament_id,
                "name": name,
                "score": 100,
            }
        ]

    return None, suggestions


def collect_player_matches(
    tournament: dict,
    player_name: str,
) -> list[dict[str, object]]:
    matches: list[dict[str, object]] = []
    for round_name, match_id, match in iter_tournament_matches(tournament):
        names = match_participant_names(match)
        if not _names_include_player(names, player_name):
            continue

        matches.append(
            {
                "round": round_name,
                "matchId": match_id,
                "participants": match_participant_scores(match),
                "finished": bool(match.get("finished")),
                "drafts": match_draft_links(match),
                "played": match.get("played"),
            }
        )
    return matches


def find_head_to_head_matches(
    tournament: dict,
    player_a: str,
    player_b: str,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for round_name, match_id, match in iter_tournament_matches(tournament):
        names = match_participant_names(match)
        if not (_names_include_player(names, player_a) and _names_include_player(names, player_b)):
            continue
        results.append(
            {
                "round": round_name,
                "matchId": match_id,
                "participants": match_participant_scores(match),
                "finished": bool(match.get("finished")),
                "drafts": match_draft_links(match),
            }
        )
    return results


def scan_recent_head_to_head(
    player_a: str,
    player_b: str,
    *,
    scan_limit: int = 20,
) -> list[dict[str, object]]:
    """Scan recent aoe2recs tournaments for direct matchups between two players."""
    tournaments = fetch_tournaments(limit=scan_limit)
    results: list[dict[str, object]] = []

    for tournament in tournaments:
        tournament_id = (
            tournament.get("tournament_id")
            or tournament.get("id")
            or tournament.get("slug")
            or ""
        )
        if not tournament_id:
            continue
        try:
            full = fetch_tournament(str(tournament_id))
        except Exception:
            continue

        h2h = find_head_to_head_matches(full, player_a, player_b)
        if not h2h:
            continue

        tournament_name = full.get("name") or tournament.get("name") or tournament_id
        for match in h2h:
            results.append(
                {
                    "tournamentId": str(tournament_id),
                    "tournamentName": tournament_name,
                    **match,
                }
            )

    return results


def compute_map_play_counts(
    tournament: dict,
    opponent_names: list[str],
) -> dict[str, object]:
    normalized_opponents = {_normalize_name(name) for name in opponent_names if name.strip()}
    per_player: dict[str, Counter[str]] = defaultdict(Counter)
    per_map: Counter[str] = Counter()

    for _, _, series in iter_tournament_matches(tournament):
        series_players = {_normalize_name(name) for name in match_participant_names(series)}
        if normalized_opponents and not normalized_opponents.intersection(series_players):
            continue

        for game in series.get("games", []):
            if not isinstance(game, dict):
                continue
            map_name = _game_map_name(game)
            if not map_name:
                continue

            game_players = {_normalize_name(name) for name in _game_players(game)}
            matched = normalized_opponents.intersection(game_players) if normalized_opponents else series_players
            if not matched:
                continue

            per_map[map_name] += 1
            for player in matched:
                for original in opponent_names:
                    if _normalize_name(original) == player:
                        per_player[original][map_name] += 1

    return {
        "totalByMap": dict(per_map),
        "byOpponent": {name: dict(counts) for name, counts in per_player.items()},
    }
