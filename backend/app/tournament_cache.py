"""Persistent cache for aoe2recs tournaments and parsed draft tendencies."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

from sqlalchemy import select
from sqlalchemy.orm import Session

from .aoe2recs import (
    fetch_tournament,
    fetch_tournaments,
    iter_tournament_matches,
    match_participant_names,
    search_tournaments_by_query,
)
from .database import SessionLocal
from .history_scope import SECONDS_PER_YEAR
from .models import CachedDraftAnalysis, CachedTournament
from .name_utils import names_match

CATALOG_SCAN_LIMIT = 40
DEFAULT_HISTORY_SECONDS = SECONDS_PER_YEAR
RECS_FETCH_CONCURRENCY = 8
_ELO_SLUG_CACHE: dict[str, str | None] = {}


def extract_tournament_players(tournament: dict[str, Any]) -> list[str]:
    names: set[str] = set()
    for _, _, match in iter_tournament_matches(tournament):
        names.update(match_participant_names(match))
    return sorted(names)


def tournament_is_live(tournament: dict[str, Any]) -> bool:
    for _, _, match in iter_tournament_matches(tournament):
        if not match.get("finished"):
            return True
    return False


def tournament_id_from_payload(tournament: dict[str, Any], fallback: str) -> str:
    return str(tournament.get("tournament_id") or tournament.get("id") or fallback)


def _player_in_tournament(tournament: dict[str, Any], player_name: str) -> bool:
    return any(names_match(name, player_name) for name in extract_tournament_players(tournament))


def upsert_tournament_cache(db: Session, tournament_id: str, tournament: dict[str, Any]) -> CachedTournament:
    players = extract_tournament_players(tournament)
    row = db.get(CachedTournament, tournament_id)
    payload = json.dumps(tournament, ensure_ascii=True)
    player_json = json.dumps(players, ensure_ascii=True)
    live = tournament_is_live(tournament)
    name = str(tournament.get("name") or tournament_id)

    if row is None:
        row = CachedTournament(
            tournament_id=tournament_id,
            name=name,
            data_json=payload,
            player_names_json=player_json,
            is_live=live,
        )
        db.add(row)
    else:
        row.name = name
        row.data_json = payload
        row.player_names_json = player_json
        row.is_live = live
    db.commit()
    db.refresh(row)
    return row


def get_cached_tournament(db: Session, tournament_id: str) -> dict[str, Any] | None:
    row = db.get(CachedTournament, tournament_id)
    if row is None:
        return None
    return json.loads(row.data_json)


def list_cached_tournaments_for_player(db: Session, player_name: str) -> list[CachedTournament]:
    rows = db.scalars(select(CachedTournament).order_by(CachedTournament.updated_at.desc())).all()
    matched: list[CachedTournament] = []
    for row in rows:
        try:
            players = json.loads(row.player_names_json)
        except json.JSONDecodeError:
            continue
        if any(names_match(name, player_name) for name in players):
            matched.append(row)
    return matched


def get_or_fetch_tournament(db: Session, tournament_id: str, *, force_refresh: bool = False) -> dict[str, Any]:
    cached = db.get(CachedTournament, tournament_id)
    if cached and not force_refresh and not cached.is_live:
        return json.loads(cached.data_json)

    tournament = fetch_tournament(tournament_id)
    resolved_id = tournament_id_from_payload(tournament, tournament_id)
    upsert_tournament_cache(db, resolved_id, tournament)
    return tournament


def get_or_fetch_tournament_isolated(tournament_id: str, *, force_refresh: bool = False) -> dict[str, Any]:
    db = SessionLocal()
    try:
        return get_or_fetch_tournament(db, tournament_id, force_refresh=force_refresh)
    finally:
        db.close()


def try_tournament_from_db_cache(tournament_id: str, player_name: str) -> str | None:
    """Return resolved tournament id if cached locally and player participated."""
    db = SessionLocal()
    try:
        slug = _slugify(tournament_id)
        row = db.get(CachedTournament, tournament_id)

        if row is None:
            for cached_row in list_cached_tournaments_for_player(db, player_name):
                if cached_row.is_live:
                    continue
                payload = json.loads(cached_row.data_json)
                resolved = tournament_id_from_payload(payload, cached_row.tournament_id)
                if (
                    cached_row.tournament_id == tournament_id
                    or resolved == tournament_id
                    or _slugify(resolved) == slug
                    or _slugify(cached_row.name) == slug
                ):
                    row = cached_row
                    break

        if row is None or row.is_live:
            return None

        tournament = json.loads(row.data_json)
        if not _player_in_tournament(tournament, player_name):
            return None
        return tournament_id_from_payload(tournament, row.tournament_id)
    finally:
        db.close()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug


def _slug_tokens(value: str) -> set[str]:
    parts = re.split(r"[^a-z0-9]+", value.lower())
    return {part for part in parts if len(part) >= 3}


def _edition_tokens(value: str) -> set[str]:
    matches = re.findall(r"\b(?:[ivxlc]+|\d+)\b", value.lower())
    return {token for token in matches if token}


def tournament_names_match(expected: str, actual: str) -> bool:
    expected_tokens = _slug_tokens(expected)
    actual_tokens = _slug_tokens(actual)
    if not expected_tokens or not actual_tokens:
        return False

    expected_editions = _edition_tokens(expected)
    actual_editions = _edition_tokens(actual)
    if expected_editions and actual_editions and not expected_editions.intersection(actual_editions):
        return False

    overlap = expected_tokens.intersection(actual_tokens)
    if _normalize_display(expected) == _normalize_display(actual):
        return True
    required = max(1, min(len(expected_tokens), 2))
    return len(overlap) >= required


def tournament_ids_equivalent(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    return _slugify(left) == _slugify(right)


def _normalize_display(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def resolve_recs_slug_for_elo_tournament(tournament_name: str) -> str | None:
    name = tournament_name.strip()
    if not name:
        return None
    cache_key = name.lower()
    if cache_key in _ELO_SLUG_CACHE:
        return _ELO_SLUG_CACHE[cache_key]

    resolved: str | None = None
    suggestions = search_tournaments_by_query(name, limit=5)
    for suggestion in suggestions:
        if int(suggestion.get("score") or 0) < 5:
            continue
        tournament_id = str(suggestion["tournamentId"])
        recs_name = str(suggestion.get("name") or tournament_id)
        if tournament_names_match(name, recs_name):
            resolved = tournament_id
            break

    if resolved is None:
        slug = _slugify(name)
        if slug:
            try:
                tournament = fetch_tournament(slug)
                recs_name = str(tournament.get("name") or slug)
                if tournament_names_match(name, recs_name):
                    resolved = tournament_id_from_payload(tournament, slug)
            except Exception:
                pass

    _ELO_SLUG_CACHE[cache_key] = resolved
    return resolved


def discover_tournament_ids_for_player(
    db: Session,
    player_name: str,
    *,
    exclude_tournament_id: str | None = None,
    elo_tournaments: list[dict[str, Any]] | None = None,
    catalog_scan_limit: int = CATALOG_SCAN_LIMIT,
) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()

    def add_id(tournament_id: str) -> None:
        if not tournament_id or tournament_id in seen:
            return
        if exclude_tournament_id and tournament_id == exclude_tournament_id:
            seen.add(tournament_id)
            return
        seen.add(tournament_id)
        ids.append(tournament_id)

    for row in list_cached_tournaments_for_player(db, player_name):
        add_id(row.tournament_id)

    if elo_tournaments:
        total = len(elo_tournaments)
        logger.info("Matching %d aoe-elo events to aoe2recs for %s", total, player_name)
        for index, entry in enumerate(elo_tournaments, start=1):
            name = str(entry.get("name") or "")
            slug = resolve_recs_slug_for_elo_tournament(name)
            if not slug:
                if index == 1 or index % 5 == 0 or index == total:
                    logger.info("  [%d/%d] no aoe2recs match: %s", index, total, name)
                continue
            try:
                tournament = get_or_fetch_tournament(db, slug)
            except Exception:
                logger.info("  [%d/%d] fetch failed: %s (%s)", index, total, name, slug)
                continue
            resolved_id = tournament_id_from_payload(tournament, slug)
            if not _player_in_tournament(tournament, player_name):
                continue
            add_id(resolved_id)
            logger.info("  [%d/%d] resolved: %s -> %s", index, total, name, resolved_id)

    # Catalog scan is slow (websocket per tournament). Skip when aoe-elo already gave candidates.
    if elo_tournaments:
        return ids

    try:
        catalog = fetch_tournaments(limit=catalog_scan_limit)
    except Exception:
        return ids

    for entry in catalog:
        tournament_id = str(entry.get("id") or entry.get("tournament_id") or "")
        if not tournament_id:
            continue

        cached = db.get(CachedTournament, tournament_id)
        if cached:
            resolved_id = cached.tournament_id
            players = json.loads(cached.player_names_json)
            if any(names_match(name, player_name) for name in players):
                add_id(resolved_id)
            continue

        if tournament_id in seen:
            continue

        try:
            tournament = fetch_tournament(tournament_id)
        except Exception:
            continue

        resolved_id = tournament_id_from_payload(tournament, tournament_id)
        upsert_tournament_cache(db, resolved_id, tournament)
        if _player_in_tournament(tournament, player_name):
            add_id(resolved_id)

    return ids


async def discover_tournament_ids_for_player_async(
    db: Session,
    player_name: str,
    *,
    exclude_tournament_id: str | None = None,
    elo_tournaments: list[dict[str, Any]] | None = None,
    catalog_scan_limit: int = CATALOG_SCAN_LIMIT,
) -> list[str]:
    """Parallel aoe-elo → aoe2recs tournament discovery."""
    ids: list[str] = []
    seen: set[str] = set()

    def add_id(tournament_id: str) -> None:
        if not tournament_id or tournament_id in seen:
            return
        if exclude_tournament_id and tournament_id == exclude_tournament_id:
            seen.add(tournament_id)
            return
        seen.add(tournament_id)
        ids.append(tournament_id)

    for row in list_cached_tournaments_for_player(db, player_name):
        add_id(row.tournament_id)

    if elo_tournaments:
        total = len(elo_tournaments)
        logger.info("Matching %d aoe-elo events to aoe2recs for %s (parallel)", total, player_name)
        semaphore = asyncio.Semaphore(RECS_FETCH_CONCURRENCY)

        async def resolve_entry(index: int, entry: dict[str, Any]) -> str | None:
            name = str(entry.get("name") or "")
            async with semaphore:
                slug = await asyncio.to_thread(resolve_recs_slug_for_elo_tournament, name)
                if not slug:
                    if index == 1 or index % 10 == 0 or index == total:
                        logger.info("  [%d/%d] no aoe2recs match: %s", index, total, name)
                    return None

                cached_id = await asyncio.to_thread(try_tournament_from_db_cache, slug, player_name)
                if cached_id:
                    logger.info("  [%d/%d] cache hit: %s -> %s", index, total, name, cached_id)
                    return cached_id

                try:
                    tournament = await asyncio.to_thread(get_or_fetch_tournament_isolated, slug)
                except Exception:
                    logger.info("  [%d/%d] fetch failed: %s (%s)", index, total, name, slug)
                    return None
                resolved_id = tournament_id_from_payload(tournament, slug)
                if not _player_in_tournament(tournament, player_name):
                    return None
                logger.info("  [%d/%d] resolved: %s -> %s", index, total, name, resolved_id)
                return resolved_id

        results = await asyncio.gather(
            *(resolve_entry(index, entry) for index, entry in enumerate(elo_tournaments, start=1))
        )
        for resolved_id in results:
            if resolved_id:
                add_id(resolved_id)
        return ids

    return discover_tournament_ids_for_player(
        db,
        player_name,
        exclude_tournament_id=exclude_tournament_id,
        elo_tournaments=elo_tournaments,
        catalog_scan_limit=catalog_scan_limit,
    )


async def load_tournaments_map_async(
    db: Session,
    tournament_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """Load tournament payloads in parallel; returns id → payload map."""
    unique_ids = list(dict.fromkeys(tournament_ids))
    if not unique_ids:
        return {}

    cached_map: dict[str, dict[str, Any]] = {}
    to_fetch: list[str] = []
    for tournament_id in unique_ids:
        row = db.get(CachedTournament, tournament_id)
        if row and not row.is_live:
            payload = json.loads(row.data_json)
            resolved_id = tournament_id_from_payload(payload, tournament_id)
            cached_map[tournament_id] = payload
            cached_map[resolved_id] = payload
        else:
            to_fetch.append(tournament_id)

    if not to_fetch:
        return cached_map

    semaphore = asyncio.Semaphore(RECS_FETCH_CONCURRENCY)

    async def fetch_one(tournament_id: str) -> tuple[str, str, dict[str, Any] | None]:
        async with semaphore:
            try:
                payload = await asyncio.to_thread(get_or_fetch_tournament_isolated, tournament_id)
                resolved_id = tournament_id_from_payload(payload, tournament_id)
                return tournament_id, resolved_id, payload
            except Exception:
                return tournament_id, tournament_id, None

    fetched = await asyncio.gather(*(fetch_one(tid) for tid in to_fetch))
    for requested_id, resolved_id, payload in fetched:
        if payload is not None:
            cached_map[requested_id] = payload
            cached_map[resolved_id] = payload
    return cached_map


def load_tournaments_by_ids(db: Session, tournament_ids: list[str]) -> list[dict[str, Any]]:
    tournaments: list[dict[str, Any]] = []
    for tournament_id in tournament_ids:
        try:
            tournaments.append(get_or_fetch_tournament(db, tournament_id))
        except Exception:
            continue
    return tournaments


def get_cached_draft_analysis(
    db: Session,
    draft_id: str,
    player_name: str,
    draft_type: str,
) -> dict[str, dict[str, int]] | None:
    row = db.scalar(
        select(CachedDraftAnalysis).where(
            CachedDraftAnalysis.draft_id == draft_id,
            CachedDraftAnalysis.player_name == player_name,
            CachedDraftAnalysis.draft_type == draft_type,
        )
    )
    if row is None:
        return None
    return {
        "pickCounts": json.loads(row.pick_counts_json),
        "banCounts": json.loads(row.ban_counts_json),
    }


def store_draft_analysis(
    db: Session,
    draft_id: str,
    player_name: str,
    draft_type: str,
    pick_counts: dict[str, int],
    ban_counts: dict[str, int],
) -> None:
    row = db.scalar(
        select(CachedDraftAnalysis).where(
            CachedDraftAnalysis.draft_id == draft_id,
            CachedDraftAnalysis.player_name == player_name,
            CachedDraftAnalysis.draft_type == draft_type,
        )
    )
    if row is None:
        row = CachedDraftAnalysis(
            id=str(uuid.uuid4()),
            draft_id=draft_id,
            player_name=player_name,
            draft_type=draft_type,
            pick_counts_json=json.dumps(pick_counts, ensure_ascii=True),
            ban_counts_json=json.dumps(ban_counts, ensure_ascii=True),
        )
        db.add(row)
    else:
        row.pick_counts_json = json.dumps(pick_counts, ensure_ascii=True)
        row.ban_counts_json = json.dumps(ban_counts, ensure_ascii=True)
    db.commit()


def match_played_timestamp(match: dict[str, Any]) -> int | None:
    played = match.get("played")
    if isinstance(played, (int, float)) and played > 0:
        return int(played)
    return None


def match_within_history_window(
    match: dict[str, Any],
    *,
    window_seconds: int | None = DEFAULT_HISTORY_SECONDS,
) -> bool:
    if window_seconds is None:
        return True
    played = match_played_timestamp(match)
    if played is None:
        return True
    return time.time() - played <= window_seconds
