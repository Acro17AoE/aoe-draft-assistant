"""Aggregate pro player analysis from aoe-elo, aoe2recs, aoe2cm, and local cache."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import Counter, defaultdict
from typing import Any

logger = logging.getLogger(__name__)

from sqlalchemy.orm import Session

from .aoe2cm import extract_draft_id, fetch_draft
from .aoe2recs import (
    collect_player_matches,
    ensure_tournament_catalog,
    find_head_to_head_matches,
    resolve_tournament_slug,
)
from .aoe_elo import (
    career_summary,
    fetch_all_tournaments,
    resolve_player,
    scoped_elo_tournaments_for_player,
)
from .database import SessionLocal
from .history_scope import HistoryScope, parse_history_scope
from .liquipedia import enrich_matchup
from .map_analysis import analyze_map_draft_events
from .map_archetypes import aggregate_archetype_counts, top_archetypes
from .tournament_cache import (
    discover_tournament_ids_for_player_async,
    get_cached_draft_analysis,
    get_or_fetch_tournament,
    list_cached_tournaments_for_player,
    load_tournaments_map_async,
    match_within_history_window,
    names_match,
    store_draft_analysis,
    tournament_id_from_payload,
    tournament_ids_equivalent,
    upsert_tournament_cache,
)

HISTORICAL_DRAFT_LIMIT = 36
TOURNAMENT_DRAFT_LIMIT = 12
DRAFT_FETCH_CONCURRENCY = 16


def _normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def _compact_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _normalize_name(name))


def _opponent_side_from_draft(draft: dict, opponent_name: str) -> str | None:
    host = (draft.get("nameHost") or "").strip()
    guest = (draft.get("nameGuest") or "").strip()
    if names_match(host, opponent_name):
        return "HOST"
    if names_match(guest, opponent_name):
        return "GUEST"
    return None


def _side_from_event(event: dict) -> str:
    return (event.get("executingPlayer") or event.get("player") or "").upper()


def analyze_civ_draft_events(events: list[dict], opponent_side: str) -> dict[str, object]:
    opponent = opponent_side.upper()
    pick_counts: Counter[str] = Counter()
    ban_counts: Counter[str] = Counter()
    pick_order_sum: dict[str, float] = defaultdict(float)
    pick_order_count: Counter[str] = Counter()
    ban_order_sum: dict[str, float] = defaultdict(float)
    ban_order_count: Counter[str] = Counter()
    pick_index = 0
    ban_index = 0

    for event in events:
        action = (event.get("actionType") or event.get("action") or "").lower()
        player = _side_from_event(event)
        option = event.get("chosenOptionId")
        if not option or player == "NONE":
            continue
        if action in ("pick", "steal") and player == opponent:
            pick_index += 1
            pick_counts[option] += 1
            pick_order_sum[option] += pick_index
            pick_order_count[option] += 1
        elif action in ("ban", "snipe") and player == opponent:
            ban_index += 1
            ban_counts[option] += 1
            ban_order_sum[option] += ban_index
            ban_order_count[option] += 1

    return {
        "pickCounts": dict(pick_counts),
        "banCounts": dict(ban_counts),
        "topPicks": [name for name, _ in pick_counts.most_common(6)],
        "topBans": [name for name, _ in ban_counts.most_common(6)],
        "pickOrderAvg": {
            key: pick_order_sum[key] / pick_order_count[key]
            for key in pick_order_count
            if pick_order_count[key]
        },
        "banOrderAvg": {
            key: ban_order_sum[key] / ban_order_count[key]
            for key in ban_order_count
            if ban_order_count[key]
        },
    }


def _extract_played_picks(events: list[dict], opponent_side: str) -> list[str]:
    opponent = opponent_side.upper()
    played: list[str] = []
    for event in events:
        action = (event.get("actionType") or event.get("action") or "").lower()
        player = _side_from_event(event)
        option = event.get("chosenOptionId")
        if action == "pick" and player == opponent and option:
            played.append(str(option))
    return played


def _merge_draft_aggregates(items: list[dict[str, object]]) -> dict[str, object]:
    pick_counts: Counter[str] = Counter()
    ban_counts: Counter[str] = Counter()
    played_counts: Counter[str] = Counter()
    draft_count = 0

    for item in items:
        draft_count += 1
        pick_counts.update(item.get("pickCounts") or {})
        ban_counts.update(item.get("banCounts") or {})
        for option in item.get("playedOptions") or []:
            played_counts[str(option)] += 1

    pick_dict = dict(pick_counts)
    ban_dict = dict(ban_counts)
    played_dict = dict(played_counts)
    return {
        "draftCount": draft_count,
        "pickCounts": pick_dict,
        "banCounts": ban_dict,
        "playedCounts": played_dict,
        "topPicks": [name for name, _ in pick_counts.most_common(6)],
        "topBans": [name for name, _ in ban_counts.most_common(6)],
        "topPlayed": [name for name, _ in played_counts.most_common(6)],
        "archetypePicks": aggregate_archetype_counts(pick_dict),
        "archetypeBans": aggregate_archetype_counts(ban_dict),
        "archetypePlayed": aggregate_archetype_counts(played_dict),
        "topArchetypePicks": top_archetypes(pick_dict),
        "topArchetypeBans": top_archetypes(ban_dict),
        "topArchetypePlayed": top_archetypes(played_dict),
    }


def _empty_pattern() -> dict[str, object]:
    return {
        "draftCount": 0,
        "pickCounts": {},
        "banCounts": {},
        "playedCounts": {},
        "topPicks": [],
        "topBans": [],
        "topPlayed": [],
        "archetypePicks": {},
        "archetypeBans": {},
        "archetypePlayed": {},
        "topArchetypePicks": [],
        "topArchetypeBans": [],
        "topArchetypePlayed": [],
    }


def _tournament_record(matches: list[dict[str, object]], player_name: str) -> dict[str, int]:
    wins = 0
    losses = 0
    pending = 0

    for match in matches:
        if not match.get("finished"):
            pending += 1
            continue
        row = None
        for participant in match.get("participants") or []:
            if not isinstance(participant, dict):
                continue
            if names_match(str(participant.get("name") or ""), player_name):
                row = participant
                break
        if not row:
            continue
        if row.get("winner") is True:
            wins += 1
        elif row.get("winner") is False:
            losses += 1

    return {"wins": wins, "losses": losses, "pending": pending}


def _h2h_summary(matches: list[dict[str, object]], reference_name: str) -> dict[str, object]:
    ref_wins = 0
    opp_wins = 0
    pending = 0

    for match in matches:
        if not match.get("finished"):
            pending += 1
            continue
        ref_row = None
        opp_row = None
        for participant in match.get("participants") or []:
            if not isinstance(participant, dict):
                continue
            name = str(participant.get("name") or "")
            if names_match(name, reference_name):
                ref_row = participant
            elif name.strip():
                opp_row = participant
        if not ref_row or not opp_row:
            continue
        if ref_row.get("winner") is True:
            ref_wins += 1
        elif opp_row.get("winner") is True:
            opp_wins += 1

    return {
        "referenceWins": ref_wins,
        "opponentWins": opp_wins,
        "pending": pending,
        "total": len(matches),
    }


def _format_archetypes(labels: list[str]) -> str:
    return ", ".join(label.capitalize() for label in labels)


def _build_takeaways(report: dict[str, Any]) -> list[dict[str, str]]:
    takeaways: list[dict[str, str]] = []
    ref = report.get("reference", {}).get("career") or {}
    opp = report["opponent"]["career"]
    tournament = report.get("tournament")
    h2h = report.get("headToHead", {})
    tournament_patterns = report.get("tournamentPatterns", {})
    historical_patterns = report.get("historicalPatterns", {})

    ref_elo = ref.get("elo")
    opp_elo = opp.get("elo")
    if isinstance(ref_elo, (int, float)) and isinstance(opp_elo, (int, float)):
        diff = int(opp_elo - ref_elo)
        if abs(diff) >= 80:
            leader = opp["name"] if diff > 0 else ref.get("name") or "You"
            takeaways.append(
                {
                    "category": "matchup",
                    "severity": "high" if abs(diff) >= 150 else "medium",
                    "text": (
                        f"{leader} leads Tournament Elo by {abs(diff)} points "
                        f"({max(ref_elo, opp_elo)} vs {min(ref_elo, opp_elo)})."
                    ),
                }
            )

    h2h_summary = h2h.get("summary", {})
    h2h_total = int(h2h_summary.get("total") or 0)
    if h2h_total > 0:
        ref_w = int(h2h_summary.get("referenceWins") or 0)
        opp_w = int(h2h_summary.get("opponentWins") or 0)
        window = h2h.get("windowLabel", "selected period")
        if ref_w > opp_w:
            text = f"You lead the historical H2H {ref_w}-{opp_w} ({window}, excluding this event)."
        elif opp_w > ref_w:
            text = f"{opp['name']} leads the historical H2H {opp_w}-{ref_w} ({window}, excluding this event)."
        else:
            text = f"Historical H2H is tied {ref_w}-{opp_w} ({window}, excluding this event)."
        takeaways.append({"category": "h2h", "severity": "high", "text": text})

    hist_map = historical_patterns.get("map", {})
    hist_civ = historical_patterns.get("civ", {})
    tour_map = tournament_patterns.get("map", {})
    tour_civ = tournament_patterns.get("civ", {})

    hist_map_bans = hist_map.get("topBans") or []
    hist_map_picks = hist_map.get("topPicks") or []
    hist_arch_bans = hist_map.get("topArchetypeBans") or []
    hist_arch_picks = hist_map.get("topArchetypePicks") or []

    if hist_arch_bans:
        takeaways.append(
            {
                "category": "maps",
                "severity": "high",
                "text": (
                    f"Historically, {opp['name']} most often bans {_format_archetypes(hist_arch_bans)} maps "
                    f"({hist_map.get('draftCount', 0)} map drafts, {report.get('historyScope', {}).get('label', 'selected period')})."
                ),
            }
        )
    elif hist_map_bans:
        takeaways.append(
            {
                "category": "maps",
                "severity": "high",
                "text": f"Historical map bans to expect: {', '.join(hist_map_bans[:3])}.",
            }
        )

    if hist_arch_picks:
        takeaways.append(
            {
                "category": "maps",
                "severity": "medium",
                "text": f"Historical comfort map archetypes: {_format_archetypes(hist_arch_picks)}.",
            }
        )
    elif hist_map_picks:
        takeaways.append(
            {
                "category": "maps",
                "severity": "medium",
                "text": f"Historical comfort map picks: {', '.join(hist_map_picks[:3])}.",
            }
        )

    hist_civ_picks = hist_civ.get("topPicks") or []
    hist_civ_bans = hist_civ.get("topBans") or []
    if hist_civ_picks:
        takeaways.append(
            {
                "category": "civs",
                "severity": "high",
                "text": f"Historical civ comfort: {', '.join(hist_civ_picks[:4])}.",
            }
        )
    if hist_civ_bans:
        takeaways.append(
            {
                "category": "civs",
                "severity": "medium",
                "text": f"Historically targeted civ bans: {', '.join(hist_civ_bans[:3])}.",
            }
        )

    if tournament:
        tour_map_bans = tour_map.get("topBans") or []
        tour_map_picks = tour_map.get("topPicks") or []
        tour_arch = tour_map.get("topArchetypeBans") or tour_map.get("topArchetypePicks") or []
        if tour_map_bans or tour_arch:
            detail = ", ".join(tour_map_bans[:2]) if tour_map_bans else _format_archetypes(tour_arch[:2])
            takeaways.append(
                {
                    "category": "event",
                    "severity": "high",
                    "text": f"In {tournament['name']} so far, map tendency: {detail}.",
                }
            )
        tour_civ_picks = tour_civ.get("topPicks") or []
        if tour_civ_picks:
            takeaways.append(
                {
                    "category": "event",
                    "severity": "medium",
                    "text": f"In this event, civ picks lean toward {', '.join(tour_civ_picks[:3])}.",
                }
            )

    if not takeaways:
        takeaways.append(
            {
                "category": "general",
                "severity": "low",
                "text": "Limited matchup data — run again after more tournaments are cached locally.",
            }
        )

    severity_order = {"high": 0, "medium": 1, "low": 2}
    takeaways.sort(key=lambda item: severity_order.get(item["severity"], 9))
    return takeaways[:8]


def _draft_analysis_sync(
    db: Session,
    draft_id: str,
    draft_type: str,
    opponent_name: str,
    events: list[dict],
    side: str,
) -> dict[str, object]:
    cached = get_cached_draft_analysis(db, draft_id, opponent_name, draft_type)
    played_options = _extract_played_picks(events, side)
    if cached:
        return {**cached, "playedOptions": played_options}

    if draft_type == "map":
        result = analyze_map_draft_events(events, side)
        pick_counts = result.get("pickCounts") or {}
        ban_counts = result.get("banCounts") or {}
    else:
        result = analyze_civ_draft_events(events, side)
        pick_counts = result.get("pickCounts") or {}
        ban_counts = result.get("banCounts") or {}
    played_options = _extract_played_picks(events, side)

    store_draft_analysis(
        db,
        draft_id,
        opponent_name,
        draft_type,
        {str(k): int(v) for k, v in pick_counts.items()},
        {str(k): int(v) for k, v in ban_counts.items()},
    )
    return {"pickCounts": pick_counts, "banCounts": ban_counts, "playedOptions": played_options}


async def _analyze_drafts_for_matches(
    db: Session,
    matches: list[dict[str, object]],
    opponent_name: str,
    *,
    max_drafts: int,
) -> tuple[dict[str, object], dict[str, object]]:
    jobs: list[tuple[str, str]] = []

    for match in matches:
        for draft_link in match.get("drafts") or []:
            if len(jobs) >= max_drafts:
                break
            if not isinstance(draft_link, dict):
                continue
            url = draft_link.get("url")
            draft_type = str(draft_link.get("type") or "").lower()
            if not isinstance(url, str) or not url.strip():
                continue
            if draft_type not in ("map", "civ"):
                continue
            jobs.append((extract_draft_id(url), draft_type))
        if len(jobs) >= max_drafts:
            break

    if not jobs:
        return _empty_pattern(), _empty_pattern()

    semaphore = asyncio.Semaphore(DRAFT_FETCH_CONCURRENCY)

    async def process_job(draft_id: str, draft_type: str) -> tuple[str, dict[str, object]] | None:
        async with semaphore:
            try:
                draft = await fetch_draft(draft_id)
            except Exception:
                return None

            side = _opponent_side_from_draft(draft, opponent_name)
            if not side:
                return None

            events = draft.get("events") or []

            def analyze_in_thread() -> dict[str, object]:
                thread_db = SessionLocal()
                try:
                    return _draft_analysis_sync(
                        thread_db, draft_id, draft_type, opponent_name, events, side
                    )
                finally:
                    thread_db.close()

            analysis = await asyncio.to_thread(analyze_in_thread)
            return draft_type, analysis

    results = await asyncio.gather(*(process_job(draft_id, draft_type) for draft_id, draft_type in jobs))

    map_items: list[dict[str, object]] = []
    civ_items: list[dict[str, object]] = []
    for result in results:
        if result is None:
            continue
        draft_type, analysis = result
        if draft_type == "map":
            map_items.append(analysis)
        elif draft_type == "civ":
            civ_items.append(analysis)

    return (
        _merge_draft_aggregates(map_items) if map_items else _empty_pattern(),
        _merge_draft_aggregates(civ_items) if civ_items else _empty_pattern(),
    )


def _collect_historical_h2h_from_tournaments(
    reference_name: str,
    opponent_name: str,
    *,
    exclude_tournament_id: str | None,
    tournament_ids: list[str],
    tournaments: dict[str, dict[str, Any]],
    window_seconds: int | None,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    seen: set[str] = set()

    for tournament_id in tournament_ids:
        tournament = tournaments.get(tournament_id)
        if not tournament:
            for payload in tournaments.values():
                resolved = tournament_id_from_payload(payload, tournament_id)
                if tournament_ids_equivalent(resolved, tournament_id) or tournament_ids_equivalent(
                    str(payload.get("name") or ""), tournament_id
                ):
                    tournament = payload
                    break
        if not tournament:
            continue

        resolved_id = tournament_id_from_payload(tournament, tournament_id)
        if exclude_tournament_id and tournament_ids_equivalent(resolved_id, exclude_tournament_id):
            continue

        tournament_name = str(tournament.get("name") or resolved_id)
        for match in find_head_to_head_matches(tournament, reference_name, opponent_name):
            if not match_within_history_window(match, window_seconds=window_seconds):
                continue
            key = f"{resolved_id}:{match.get('matchId')}"
            if key in seen:
                continue
            seen.add(key)
            results.append(
                {
                    "tournamentId": resolved_id,
                    "tournamentName": tournament_name,
                    "played": match.get("played"),
                    **match,
                }
            )

    results.sort(key=lambda item: int(item.get("played") or 0), reverse=True)
    return results


def _pattern_scope_from_tournaments(
    opponent_name: str,
    tournament_ids: list[str],
    tournaments: dict[str, dict[str, Any]],
    *,
    exclude_tournament_id: str | None,
) -> dict[str, object]:
    all_matches: list[dict[str, object]] = []
    used_tournaments = 0

    for tournament_id in tournament_ids:
        tournament = tournaments.get(tournament_id)
        if not tournament:
            for payload in tournaments.values():
                resolved = tournament_id_from_payload(payload, tournament_id)
                if tournament_ids_equivalent(resolved, tournament_id) or tournament_ids_equivalent(
                    str(payload.get("name") or ""), tournament_id
                ):
                    tournament = payload
                    break
        if not tournament:
            continue

        resolved_id = tournament_id_from_payload(tournament, tournament_id)
        if exclude_tournament_id and tournament_ids_equivalent(resolved_id, exclude_tournament_id):
            continue
        if exclude_tournament_id and tournament_ids_equivalent(tournament_id, exclude_tournament_id):
            continue

        matches = collect_player_matches(tournament, opponent_name)
        if not matches:
            continue
        used_tournaments += 1
        for match in matches:
            all_matches.append(
                {
                    **match,
                    "tournamentId": resolved_id,
                    "tournamentName": tournament.get("name"),
                }
            )

    return {"matches": all_matches, "tournamentCount": used_tournaments}


def _draft_pattern_total(patterns: dict[str, object]) -> int:
    return int(patterns.get("draftCount") or 0)


async def _resolve_opening_sources(
    reference_name: str,
    opponent_name: str,
    tournament_query: str | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[dict[str, Any]], dict[str, Any]]:
    """Load aoe-elo + Liquipedia with shared player roster (one network list fetch)."""
    players, all_elo_tournaments = await asyncio.gather(
        fetch_all_players(),
        fetch_all_tournaments(),
    )
    ref_player, opp_player, liquipedia = await asyncio.gather(
        resolve_player(reference_name, players=players),
        resolve_player(opponent_name, players=players),
        enrich_matchup(reference_name, opponent_name, tournament_query),
    )
    return ref_player, opp_player, all_elo_tournaments, liquipedia


def _soft_fail_detail(exc: Exception) -> str:
    return str(exc).strip() or exc.__class__.__name__


async def build_pro_analysis(
    reference_name: str,
    opponent_name: str,
    tournament_query: str | None = None,
    history_scope: str | None = None,
) -> dict[str, Any]:
    reference_name = reference_name.strip()
    opponent_name = opponent_name.strip()
    if not reference_name or not opponent_name:
        raise ValueError("Reference player and opponent are required")

    scope = parse_history_scope(history_scope)
    draft_limit = 24 if scope.mode == "last_5_tournaments" else 48 if scope.mode == "last_year" else 72
    started = time.perf_counter()
    phases: list[dict[str, object]] = []

    def phase(name: str, detail: str) -> None:
        phases.append({"name": name, "detail": detail, "elapsedMs": int((time.perf_counter() - started) * 1000)})

    ref_player, opp_player, all_elo_tournaments, liquipedia = await _resolve_opening_sources(
        reference_name,
        opponent_name,
        tournament_query,
    )

    if not opp_player:
        raise ValueError(f"Opponent '{opponent_name}' not found on aoe-elo.com")

    resolved_opp_name = str(opp_player.get("name") or opponent_name)
    resolved_ref_name = str(ref_player.get("name") or reference_name) if ref_player else reference_name

    opp_elo_tournaments = scoped_elo_tournaments_for_player(opp_player, all_elo_tournaments, scope)
    ref_elo_tournaments = (
        scoped_elo_tournaments_for_player(ref_player, all_elo_tournaments, scope) if ref_player else []
    )
    phase("players", f"Resolved players; {len(opp_elo_tournaments)} aoe-elo events in scope for opponent")
    if liquipedia.get("configured"):
        phase(
            "liquipedia",
            "Liquipedia profiles "
            + (
                "found"
                if liquipedia.get("opponent") or liquipedia.get("reference")
                else "queried (no page match)"
            ),
        )

    db = SessionLocal()
    try:
        report: dict[str, Any] = {
            "reference": {
                "query": reference_name,
                "found": ref_player is not None,
                "career": career_summary(ref_player) if ref_player else None,
            },
            "opponent": {
                "query": opponent_name,
                "found": True,
                "career": career_summary(opp_player),
            },
            "historyScope": {
                "mode": scope.mode,
                "label": scope.label,
            },
            "tournament": None,
            "referenceInTournament": False,
            "opponentTournament": None,
            "headToHead": {
                "historical": [],
                "summary": {},
                "windowLabel": scope.label,
            },
            "tournamentPatterns": {"map": _empty_pattern(), "civ": _empty_pattern()},
            "historicalPatterns": {"map": _empty_pattern(), "civ": _empty_pattern()},
            "cacheStats": {},
            "tournamentSuggestions": [],
            "keyTakeaways": [],
            "liquipedia": liquipedia,
            "analysisMeta": {"phases": phases, "durationMs": 0},
        }

        current_tournament_id: str | None = None
        recs_tournament: dict | None = None
        recs_warnings: list[str] = []

        if tournament_query and tournament_query.strip():
            try:
                tournament_id, suggestions = await asyncio.to_thread(
                    resolve_tournament_slug,
                    tournament_query.strip(),
                )
                report["tournamentSuggestions"] = suggestions
                if tournament_id:
                    current_tournament_id = tournament_id
                    recs_tournament = await asyncio.to_thread(get_or_fetch_tournament, db, tournament_id)
                    if recs_tournament:
                        upsert_tournament_cache(db, current_tournament_id, recs_tournament)
            except Exception as exc:
                detail = _soft_fail_detail(exc)
                logger.warning("Tournament resolve failed: %s", detail)
                recs_warnings.append(detail)

        try:
            await asyncio.to_thread(ensure_tournament_catalog, 80)
        except Exception as exc:
            detail = _soft_fail_detail(exc)
            logger.warning("aoe2recs catalog warm failed: %s", detail)
            recs_warnings.append(detail)

        discover_coros = [
            discover_tournament_ids_for_player_async(
                db,
                resolved_opp_name,
                elo_tournaments=opp_elo_tournaments,
            )
        ]
        if ref_player:
            discover_coros.append(
                discover_tournament_ids_for_player_async(
                    db,
                    resolved_ref_name,
                    elo_tournaments=ref_elo_tournaments,
                )
            )

        tour_draft_coro: Any = None
        opp_matches: list[dict[str, object]] = []
        ref_matches: list[dict[str, object]] = []

        if recs_tournament and current_tournament_id:
            opp_matches = collect_player_matches(recs_tournament, resolved_opp_name)
            ref_matches = collect_player_matches(recs_tournament, resolved_ref_name)
            tour_draft_coro = _analyze_drafts_for_matches(
                db,
                opp_matches,
                resolved_opp_name,
                max_drafts=TOURNAMENT_DRAFT_LIMIT,
            )

        gather_targets: list[Any] = [*discover_coros]
        if tour_draft_coro is not None:
            gather_targets.append(tour_draft_coro)

        try:
            parallel_results = await asyncio.gather(*gather_targets, return_exceptions=True)
        except Exception as exc:
            detail = _soft_fail_detail(exc)
            logger.warning("Tournament discovery failed hard: %s", detail)
            recs_warnings.append(detail)
            parallel_results = []

        historical_ids: list[str] = []
        result_index = 0
        if parallel_results:
            first = parallel_results[result_index]
            result_index += 1
            if isinstance(first, Exception):
                detail = _soft_fail_detail(first)
                logger.warning("Opponent tournament discovery failed: %s", detail)
                recs_warnings.append(detail)
            else:
                historical_ids = list(first)

            if ref_player and result_index < len(parallel_results):
                ref_ids = parallel_results[result_index]
                result_index += 1
                if isinstance(ref_ids, Exception):
                    detail = _soft_fail_detail(ref_ids)
                    logger.warning("Reference tournament discovery failed: %s", detail)
                    recs_warnings.append(detail)
                else:
                    historical_ids = list(dict.fromkeys(historical_ids + list(ref_ids)))

            if tour_draft_coro is not None and result_index < len(parallel_results):
                tour_result = parallel_results[result_index]
                if isinstance(tour_result, Exception):
                    detail = _soft_fail_detail(tour_result)
                    logger.warning("Event draft analysis failed: %s", detail)
                    recs_warnings.append(detail)
                else:
                    tour_map, tour_civ = tour_result
                    report["tournament"] = {
                        "tournamentId": current_tournament_id,
                        "name": recs_tournament.get("name") if recs_tournament else current_tournament_id,
                        "url": recs_tournament.get("url") if recs_tournament else None,
                    }
                    report["referenceInTournament"] = len(ref_matches) > 0
                    report["opponentTournament"] = {
                        "inTournament": len(opp_matches) > 0,
                        "record": _tournament_record(opp_matches, resolved_opp_name),
                        "matches": opp_matches,
                    }
                    report["tournamentPatterns"] = {"map": tour_map, "civ": tour_civ}

        phase(
            "tournaments",
            f"Resolved {len(historical_ids)} aoe2recs tournaments from aoe-elo + cache",
        )
        logger.info("Tournament discovery done: %d ids", len(historical_ids))

        try:
            tournaments_map = await load_tournaments_map_async(db, historical_ids)
        except Exception as exc:
            detail = _soft_fail_detail(exc)
            logger.warning("Tournament map load failed: %s", detail)
            recs_warnings.append(detail)
            tournaments_map = {}

        historical_scope = _pattern_scope_from_tournaments(
            resolved_opp_name,
            historical_ids,
            tournaments_map,
            exclude_tournament_id=current_tournament_id,
        )
        match_count = len(historical_scope["matches"])
        logger.info("Fetching up to %d drafts from %d matches", draft_limit, match_count)
        try:
            hist_map, hist_civ = await _analyze_drafts_for_matches(
                db,
                historical_scope["matches"],
                resolved_opp_name,
                max_drafts=draft_limit,
            )
        except Exception as exc:
            detail = _soft_fail_detail(exc)
            logger.warning("Historical draft analysis failed: %s", detail)
            recs_warnings.append(detail)
            hist_map, hist_civ = _empty_pattern(), _empty_pattern()

        historical_patterns_note: str | None = None
        if _draft_pattern_total(hist_map) + _draft_pattern_total(hist_civ) == 0 and current_tournament_id:
            widened_scope = _pattern_scope_from_tournaments(
                resolved_opp_name,
                historical_ids,
                tournaments_map,
                exclude_tournament_id=None,
            )
            if len(widened_scope["matches"]) > len(historical_scope["matches"]):
                try:
                    hist_map, hist_civ = await _analyze_drafts_for_matches(
                        db,
                        widened_scope["matches"],
                        resolved_opp_name,
                        max_drafts=draft_limit,
                    )
                    historical_scope = widened_scope
                    if _draft_pattern_total(hist_map) + _draft_pattern_total(hist_civ) > 0:
                        historical_patterns_note = (
                            "No aoe2cm drafts found outside this event — showing cached data including this event."
                        )
                except Exception as exc:
                    detail = _soft_fail_detail(exc)
                    logger.warning("Widened historical draft analysis failed: %s", detail)
                    recs_warnings.append(detail)

        if recs_warnings and _draft_pattern_total(hist_map) + _draft_pattern_total(hist_civ) == 0:
            historical_patterns_note = (
                (historical_patterns_note + " ") if historical_patterns_note else ""
            ) + (
                "Some external sources timed out or were unreachable "
                f"({recs_warnings[0]}). Career data may still be available — retry later."
            )

        report["historicalPatterns"] = {"map": hist_map, "civ": hist_civ}
        if historical_patterns_note:
            report["historicalPatternsNote"] = historical_patterns_note
        if recs_warnings:
            report["sourceWarnings"] = recs_warnings[:5]
        phase(
            "drafts",
            f"Parsed {int(hist_map.get('draftCount') or 0)} map + {int(hist_civ.get('draftCount') or 0)} civ drafts",
        )
        logger.info(
            "Draft parsing done: %s map + %s civ drafts",
            hist_map.get("draftCount"),
            hist_civ.get("draftCount"),
        )

        historical_h2h = _collect_historical_h2h_from_tournaments(
            resolved_ref_name,
            resolved_opp_name,
            exclude_tournament_id=current_tournament_id,
            tournament_ids=historical_ids,
            tournaments=tournaments_map,
            window_seconds=scope.window_seconds,
        )
        report["headToHead"]["historical"] = historical_h2h
        report["headToHead"]["summary"] = _h2h_summary(historical_h2h, resolved_ref_name)

        cached_rows = list_cached_tournaments_for_player(db, resolved_opp_name)
        report["cacheStats"] = {
            "cachedTournamentsForOpponent": len(cached_rows),
            "historicalTournamentsSampled": historical_scope["tournamentCount"],
            "historicalDraftsParsed": int(hist_map.get("draftCount") or 0) + int(hist_civ.get("draftCount") or 0),
            "eloTournamentsInScope": len(opp_elo_tournaments),
            "recsTournamentsResolved": len(historical_ids),
        }

        report["keyTakeaways"] = _build_takeaways(report)
        report["analysisMeta"] = {
            "phases": phases,
            "durationMs": int((time.perf_counter() - started) * 1000),
        }
        return report
    finally:
        db.close()
