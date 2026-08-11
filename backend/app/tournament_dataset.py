"""Incremental Liquipedia + aoe2cm tournament dataset sync and queries."""

from __future__ import annotations

import json
import logging
import re
from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .aoe2cm import extract_draft_id, fetch_draft
from .auth_utils import new_id
from .liquipedia import (
    civ_display_name,
    extract_draft_ids_from_match,
    fetch_matches_for_parents,
    find_tournament,
    from_pagename,
    list_tournament_stages,
    liquipedia_configured,
    match_opponent_names,
    to_pagename,
    validate_liquipedia_access,
)
from .models import (
    TournamentCivDraftAgg,
    TournamentDataset,
    TournamentDraftRow,
    TournamentMapCivAgg,
    TournamentMatchRow,
    utcnow,
)
from .tournament_registry import (
    list_meta_registry_entries,
    liquipedia_attribution,
    resolve_registry_entry,
)

logger = logging.getLogger(__name__)

# Stay under Liquipedia free tier (~60 req/h). aoe2cm draft fetches do not count.
LPDB_MAX_REQUESTS_PER_SYNC = 55
META_TOP_N = 3
META_MIN_MAP_CIV_SAMPLE = 2
# Bump when draft event parsing / civ label normalization changes (triggers re-fetch).
DRAFT_ANALYSIS_REVISION = 2


def _normalize_map_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())


def _draft_pair_count(rows: list[TournamentMatchRow], *, played_only: bool = False) -> int:
    """Matches with both civ and map aoe2cm drafts linked on Liquipedia."""
    total = 0
    for row in rows:
        if played_only and not _match_has_result(row):
            continue
        if row.civ_draft_id and row.map_draft_id:
            total += 1
    return total


def _match_has_result(row: TournamentMatchRow) -> bool:
    """True when Liquipedia lists a finished match (series or game winner)."""
    if str(row.winner or "").strip() in ("1", "2"):
        return True
    try:
        games = json.loads(row.games_json or "[]")
    except json.JSONDecodeError:
        games = []
    for game in games:
        if isinstance(game, dict) and str(game.get("winner") or "").strip() in ("1", "2"):
            return True
    return False


def _count_played_matches(rows: list[TournamentMatchRow]) -> int:
    return sum(1 for row in rows if _match_has_result(row))


def _is_admin_pick_event(event: dict) -> bool:
    player = str(event.get("player") or "NONE").upper()
    executing = str(event.get("executingPlayer") or "NONE").upper()
    return player == "NONE" and executing == "NONE"


def _pending_draft_fetches(db: Session, slug: str) -> int:
    """aoe2cm draft rows still missing for this dataset (civ + map counted separately)."""
    known = {
        (d.draft_id, d.draft_type)
        for d in db.scalars(select(TournamentDraftRow)).all()
    }
    pending: set[tuple[str, str]] = set()
    for row in db.scalars(select(TournamentMatchRow).where(TournamentMatchRow.dataset_slug == slug)).all():
        if row.civ_draft_id:
            key = (extract_draft_id(row.civ_draft_id), "civ")
            if key not in known:
                pending.add(key)
        if row.map_draft_id:
            key = (extract_draft_id(row.map_draft_id), "map")
            if key not in known:
                pending.add(key)
    return len(pending)


def _maps_match(a: str, b: str) -> bool:
    left = re.sub(r"[^a-z0-9]+", " ", a.lower()).strip()
    right = re.sub(r"[^a-z0-9]+", " ", b.lower()).strip()
    if not left or not right:
        return False
    return left == right or left in right or right in left


def _pool_from_draft(draft: dict[str, Any]) -> list[str]:
    options = (draft.get("preset") or {}).get("draftOptions") or []
    names: list[str] = []
    for option in options:
        if isinstance(option, dict):
            label = str(option.get("name") or option.get("id") or "").strip()
        else:
            label = str(option or "").strip()
        if label:
            names.append(label)
    return names


def _option_labels_from_draft(draft: dict[str, Any]) -> dict[str, str]:
    """Map aoe2cm option id / name → display label from preset draftOptions."""
    labels: dict[str, str] = {}
    for option in (draft.get("preset") or {}).get("draftOptions") or []:
        if not isinstance(option, dict):
            continue
        option_id = str(option.get("id") or "").strip()
        name = str(option.get("name") or option_id).strip()
        if option_id:
            labels[option_id] = name
        if name:
            labels[name] = name
    return labels


def _resolve_event_label(
    raw: str,
    option_labels: dict[str, str] | None,
    *,
    normalize_civ: bool,
) -> str:
    text = str(raw).strip()
    if not text:
        return text
    label = (option_labels or {}).get(text) or text
    if normalize_civ:
        return civ_display_name(label) or label
    return label


def _normalize_civ_count_dict(data: dict[str, Any]) -> dict[str, int]:
    totals: Counter[str] = Counter()
    for key, value in data.items():
        label = civ_display_name(str(key)) or str(key)
        totals[label] += int(value or 0)
    return dict(totals)


def _normalize_civ_order_dict(data: dict[str, Any], weights: dict[str, int]) -> dict[str, float]:
    """Merge per-draft order averages when alias keys collapse to one civ."""
    order_sum: dict[str, float] = defaultdict(float)
    order_weight: Counter[str] = Counter()
    for key, value in data.items():
        label = civ_display_name(str(key)) or str(key)
        weight = int(weights.get(str(key)) or weights.get(label) or 1)
        order_sum[label] += float(value) * weight
        order_weight[label] += weight
    return {
        civ: order_sum[civ] / order_weight[civ]
        for civ in order_weight
        if order_weight[civ]
    }


def _remove_from_remaining(remaining: dict[str, str], option: str) -> None:
    """Remove option from remaining pool keyed by normalized name → display name."""
    needle = re.sub(r"[^a-z0-9]+", " ", option.lower()).strip()
    if not needle:
        return
    if needle in remaining:
        del remaining[needle]
        return
    for key in list(remaining):
        if needle in key or key in needle:
            del remaining[key]
            return


def analyze_draft_events_all_sides(
    events: list[dict],
    *,
    pool_options: list[str] | None = None,
    option_labels: dict[str, str] | None = None,
    normalize_civ: bool = False,
) -> dict[str, Any]:
    """Aggregate picks/bans, order indices, and map admin-pick (neutral) leftovers."""
    pick_counts: Counter[str] = Counter()
    ban_counts: Counter[str] = Counter()
    pick_order_sum: dict[str, float] = defaultdict(float)
    pick_order_count: Counter[str] = Counter()
    ban_order_sum: dict[str, float] = defaultdict(float)
    ban_order_count: Counter[str] = Counter()
    pick_index = 0
    ban_index = 0
    is_map_draft = pool_options is not None

    remaining: dict[str, str] = {}
    for name in pool_options or []:
        key = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
        if key:
            remaining[key] = name

    neutral_counts: Counter[str] = Counter()

    for event in events:
        action = (event.get("actionType") or event.get("action") or "").lower()
        option = event.get("chosenOptionId") or event.get("option")
        if not option:
            continue
        label = _resolve_event_label(str(option), option_labels, normalize_civ=normalize_civ)
        if not label:
            continue

        if action in ("pick", "steal"):
            if is_map_draft and _is_admin_pick_event(event):
                neutral_counts[label] += 1
                if remaining:
                    _remove_from_remaining(remaining, label)
                continue
            pick_index += 1
            pick_counts[label] += 1
            pick_order_sum[label] += pick_index
            pick_order_count[label] += 1
            if remaining:
                _remove_from_remaining(remaining, label)
        elif action in ("ban", "snipe"):
            ban_index += 1
            ban_counts[label] += 1
            ban_order_sum[label] += ban_index
            ban_order_count[label] += 1
            if remaining:
                _remove_from_remaining(remaining, label)

    avg_pick_order = {
        civ: (pick_order_sum[civ] / pick_order_count[civ])
        for civ in pick_order_count
        if pick_order_count[civ]
    }
    avg_ban_order = {
        civ: (ban_order_sum[civ] / ban_order_count[civ])
        for civ in ban_order_count
        if ban_order_count[civ]
    }
    # Fallback: single leftover pool option after bans/picks (no explicit admin event).
    if is_map_draft and not neutral_counts and len(remaining) == 1:
        neutral_counts[next(iter(remaining.values()))] += 1

    return {
        "pickCounts": dict(pick_counts),
        "banCounts": dict(ban_counts),
        "pickOrderAvg": avg_pick_order,
        "banOrderAvg": avg_ban_order,
        "neutralCounts": dict(neutral_counts),
        "eventCount": len(events),
    }


def _parse_match_games(match: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract map/civ/winner rows from LPDB match payloads (match or match2)."""
    games: list[dict[str, Any]] = []

    def civs_from_side(side: Any) -> list[str]:
        names: list[str] = []
        if isinstance(side, list):
            for item in side:
                if isinstance(item, dict):
                    raw = item.get("civ") or item.get("faction") or item.get("name")
                    label = civ_display_name(str(raw) if raw else "")
                    if label:
                        names.append(label)
                else:
                    label = civ_display_name(str(item) if item else "")
                    if label:
                        names.append(label)
            return names
        if isinstance(side, dict):
            players = side.get("players") or side.get("match2players") or []
            if isinstance(players, list) and players:
                return civs_from_side(players)
            raw = side.get("civ") or side.get("faction")
            label = civ_display_name(str(raw) if raw else "")
            return [label] if label else []
        if side:
            label = civ_display_name(str(side))
            return [label] if label else []
        return []

    def civs_from_participants(participants: Any, side: str) -> list[str]:
        """AoE LPDB often uses participants keys like ``1_1`` / ``2_1`` (side_slot)."""
        if not isinstance(participants, dict):
            return []
        names: list[str] = []
        prefix = f"{side}_"
        for key, value in participants.items():
            if not str(key).startswith(prefix):
                continue
            if isinstance(value, dict):
                raw = value.get("civ") or value.get("faction") or value.get("champion")
            else:
                raw = value
            label = civ_display_name(str(raw) if raw else "")
            if label:
                names.append(label)
        return names

    # match2 style
    match2games = match.get("match2games") or match.get("games")
    if isinstance(match2games, str):
        try:
            match2games = json.loads(match2games)
        except Exception:
            match2games = None
    if isinstance(match2games, list):
        for index, game in enumerate(match2games, start=1):
            if not isinstance(game, dict):
                continue
            map_name = game.get("map") or game.get("mapname") or game.get("mapDisplayName")
            winners = game.get("winner")
            extradata = game.get("extradata") or {}
            if isinstance(extradata, str):
                try:
                    extradata = json.loads(extradata)
                except Exception:
                    extradata = {}
            if not isinstance(extradata, dict):
                extradata = {}

            opponents = game.get("opponents") or game.get("match2opponents") or []
            civs1: list[str] = []
            civs2: list[str] = []
            if isinstance(opponents, list) and opponents:
                if len(opponents) > 0:
                    civs1 = civs_from_side(opponents[0])
                if len(opponents) > 1:
                    civs2 = civs_from_side(opponents[1])

            if not civs1:
                civs1 = civs_from_side(
                    game.get("civs1")
                    or extradata.get("civs1")
                    or extradata.get("opponent1civ")
                    or extradata.get("t1c1")
                )
            if not civs2:
                civs2 = civs_from_side(
                    game.get("civs2")
                    or extradata.get("civs2")
                    or extradata.get("opponent2civ")
                    or extradata.get("t2c1")
                )

            participants = game.get("participants") or extradata.get("participants")
            if not civs1:
                civs1 = civs_from_participants(participants, "1")
            if not civs2:
                civs2 = civs_from_participants(participants, "2")

            # 3v3 team templates often store t1c1..t1c3 / t2c1..t2c3
            if not civs1:
                civs1 = [
                    c
                    for slot in range(1, 4)
                    for c in [civ_display_name(str(extradata.get(f"t1c{slot}") or ""))]
                    if c
                ]
            if not civs2:
                civs2 = [
                    c
                    for slot in range(1, 4)
                    for c in [civ_display_name(str(extradata.get(f"t2c{slot}") or ""))]
                    if c
                ]

            winner_side = None
            if winners in (1, "1", 2, "2"):
                winner_side = str(int(winners))
            games.append(
                {
                    "index": index,
                    "map": _normalize_map_name(str(map_name or "")),
                    "civs1": civs1,
                    "civs2": civs2,
                    "winner": winner_side,
                }
            )
        return [g for g in games if g.get("map")]

    # Legacy map1/map2 fields on extradata
    extradata = match.get("extradata") or {}
    if isinstance(extradata, str):
        try:
            extradata = json.loads(extradata)
        except Exception:
            extradata = {}
    if isinstance(extradata, dict):
        for index in range(1, 13):
            map_name = extradata.get(f"map{index}") or extradata.get(f"map{index}name")
            if not map_name:
                continue
            civ1 = extradata.get(f"map{index}p1civ") or extradata.get(f"map{index}civ1")
            civ2 = extradata.get(f"map{index}p2civ") or extradata.get(f"map{index}civ2")
            win = extradata.get(f"map{index}win") or extradata.get(f"map{index}winner")
            winner_side = str(int(win)) if win in (1, "1", 2, "2") else None
            games.append(
                {
                    "index": index,
                    "map": _normalize_map_name(str(map_name)),
                    "civs1": [c for c in [civ_display_name(str(civ1) if civ1 else "")] if c],
                    "civs2": [c for c in [civ_display_name(str(civ2) if civ2 else "")] if c],
                    "winner": winner_side,
                }
            )
    return games


def _match_key(match: dict[str, Any], stage: str) -> str:
    raw = (
        match.get("match2id")
        or match.get("matchid")
        or match.get("objectname")
        or match.get("pagename")
        or ""
    )
    date = str(match.get("date") or "")
    opp1 = str(match.get("opponent1") or match.get("opponent1name") or "")
    opp2 = str(match.get("opponent2") or match.get("opponent2name") or "")
    base = str(raw).strip() or f"{stage}|{date}|{opp1}|{opp2}"
    return base[:160]


def ensure_dataset(db: Session, name: str) -> tuple[TournamentDataset, dict[str, Any]]:
    resolved = resolve_registry_entry(name)
    if not resolved:
        # Synthetic slug from free text; stages = [parent guess]
        slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-") or "unknown"
        parent = to_pagename(name)
        entry = {
            "displayName": from_pagename(parent) if parent else name.strip(),
            "liquipediaParent": parent,
            "stages": [parent],
            "aliases": [name.strip()],
        }
    else:
        slug, entry = resolved

    row = db.get(TournamentDataset, slug)
    if row is None:
        row = TournamentDataset(
            slug=slug,
            display_name=str(entry.get("displayName") or name),
            liquipedia_parent=str(entry.get("liquipediaParent") or ""),
            stages_json=json.dumps(entry.get("stages") or [], ensure_ascii=True),
            status="idle",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    else:
        row.display_name = str(entry.get("displayName") or row.display_name)
        row.liquipedia_parent = str(entry.get("liquipediaParent") or row.liquipedia_parent)
        row.stages_json = json.dumps(entry.get("stages") or json.loads(row.stages_json or "[]"), ensure_ascii=True)
        db.commit()
        db.refresh(row)
    return row, entry


async def sync_tournament_dataset(
    db: Session,
    name: str,
    *,
    force: bool = False,
) -> dict[str, Any]:
    if not liquipedia_configured():
        raise RuntimeError("LIQUIPEDIA_API_KEY is not configured on this server.")

    access = await validate_liquipedia_access()
    if not access.get("ok"):
        raise RuntimeError(str(access.get("detail") or "Liquipedia API access failed."))

    # Capture previous stages before ensure_dataset overwrites from registry.
    resolved_preview = resolve_registry_entry(name)
    preview_slug = None
    previous_stages: list[str] = []
    if resolved_preview:
        preview_slug = resolved_preview[0]
        existing = db.get(TournamentDataset, preview_slug)
        if existing:
            previous_stages = [
                to_pagename(str(s)) for s in json.loads(existing.stages_json or "[]") if s
            ]

    dataset, entry = ensure_dataset(db, name)
    dataset.status = "syncing"
    dataset.status_detail = "Resolving Liquipedia tournament…"
    db.commit()

    stages = list(entry.get("stages") or [entry.get("liquipediaParent")])
    stages = [to_pagename(str(s)) for s in stages if s]

    # Registry stages are authoritative — avoid extra LPDB tournament calls.
    if not resolve_registry_entry(name):
        try:
            found = await find_tournament(name)
            if found and found.get("pagename"):
                parent = to_pagename(str(found["pagename"]))
                if "/" in parent:
                    parent = parent.split("/", 1)[0]
                dataset.liquipedia_parent = parent
                # Keep a stable series label, not a single tab title like "Division 1".
                dataset.display_name = str(
                    entry.get("displayName") or from_pagename(parent)
                )
                child_pages = await list_tournament_stages(parent)
                stage_names = [
                    to_pagename(str(row.get("pagename")))
                    for row in child_pages
                    if row.get("pagename")
                ]
                stages = stage_names or [parent]
                dataset.stages_json = json.dumps(stages, ensure_ascii=True)
                entry = {
                    **entry,
                    "displayName": dataset.display_name,
                    "liquipediaParent": parent,
                    "stages": stages,
                }
                db.commit()
        except Exception as exc:
            logger.warning("Tournament resolve during sync failed for %s: %s", name, exc)
    else:
        # Always keep registry display name (The League), not Div1 page title.
        dataset.display_name = str(entry.get("displayName") or dataset.display_name)
        dataset.stages_json = json.dumps(stages, ensure_ascii=True)
        db.commit()

    stages_changed = set(previous_stages) != set(stages)

    # If DB already lists all registry stages but matches only cover Div1, restage.
    existing_match_stages = {
        to_pagename(str(stage))
        for stage in db.scalars(
            select(TournamentMatchRow.stage).where(TournamentMatchRow.dataset_slug == dataset.slug)
        ).all()
        if stage
    }
    missing_stages = [stage for stage in stages if stage not in existing_match_stages]
    needs_restage = force or stages_changed or bool(missing_stages)

    # When stages expand / coverage is incomplete / manual force refresh, drop the
    # date watermark so Qualifier/Div2 and newly linked drafts are not skipped.
    since = None if needs_restage else (dataset.last_match_date or None)
    stage_order = (
        list(dict.fromkeys([*missing_stages, *stages]))
        if missing_stages
        else stages
    )

    dataset.status_detail = (
        f"Fetching matches for {len(stage_order)} stage(s)"
        + (" (force refresh)" if force else " (full restage)" if needs_restage else "")
        + "…"
    )
    db.commit()

    new_matches = 0
    new_drafts = 0
    errors: list[str] = []
    latest_date = None if needs_restage else dataset.last_match_date
    pages_used = 0
    lpdb_capped = False

    try:
        existing_keys = {
            key
            for key in db.scalars(
                select(TournamentMatchRow.match_key).where(TournamentMatchRow.dataset_slug == dataset.slug)
            ).all()
        }

        # Per-stage pagination; global LPDB budget only (aoe2cm is fetched separately).
        for stage in stage_order:
            offset = 0
            while True:
                if pages_used >= LPDB_MAX_REQUESTS_PER_SYNC:
                    lpdb_capped = True
                    break
                pages_used += 1
                rows = await fetch_matches_for_parents(
                    [stage],
                    offset=offset,
                    limit=50,
                    since_date=since,
                )
                if not rows:
                    break
                for match in rows:
                    key = _match_key(match, stage)
                    games = _parse_match_games(match)
                    civ_draft_id, map_draft_id = extract_draft_ids_from_match(match)
                    match_date = str(match.get("date") or "")[:32] or None
                    if match_date and (latest_date is None or match_date > latest_date):
                        latest_date = match_date
                    opp1, opp2 = match_opponent_names(match)
                    if key in existing_keys:
                        # Backfill draft links if editors added them later / parser improved.
                        existing = db.scalars(
                            select(TournamentMatchRow).where(
                                TournamentMatchRow.dataset_slug == dataset.slug,
                                TournamentMatchRow.match_key == key,
                            )
                        ).first()
                        if existing:
                            changed = False
                            if civ_draft_id and not existing.civ_draft_id:
                                existing.civ_draft_id = civ_draft_id
                                changed = True
                            if map_draft_id and not existing.map_draft_id:
                                existing.map_draft_id = map_draft_id
                                changed = True
                            if changed:
                                db.add(existing)
                        continue
                    db.add(
                        TournamentMatchRow(
                            id=new_id(),
                            dataset_slug=dataset.slug,
                            match_key=key,
                            stage=to_pagename(str(match.get("parent") or stage)),
                            match_date=match_date,
                            opponent1=(opp1 or "")[:160] or None,
                            opponent2=(opp2 or "")[:160] or None,
                            winner=str(match.get("winner") or "")[:16] or None,
                            games_json=json.dumps(games, ensure_ascii=True),
                            civ_draft_id=civ_draft_id,
                            map_draft_id=map_draft_id,
                            raw_json=json.dumps(
                                {
                                    k: match.get(k)
                                    for k in (
                                        "match2id",
                                        "parent",
                                        "tournament",
                                        "date",
                                        "extradata",
                                        "links",
                                    )
                                    if k in match
                                },
                                ensure_ascii=True,
                                default=str,
                            ),
                        )
                    )
                    existing_keys.add(key)
                    new_matches += 1
                db.commit()
                if len(rows) < 50:
                    break
                offset += 50
            if lpdb_capped:
                break

        # Fetch all missing aoe2cm drafts (no Liquipedia quota cost).
        draft_ids: list[tuple[str, str]] = []
        for row in db.scalars(
            select(TournamentMatchRow).where(TournamentMatchRow.dataset_slug == dataset.slug)
        ).all():
            if row.civ_draft_id:
                draft_ids.append((extract_draft_id(row.civ_draft_id), "civ"))
            if row.map_draft_id:
                draft_ids.append((extract_draft_id(row.map_draft_id), "map"))

        known_rows = {
            (d.draft_id, d.draft_type): d for d in db.scalars(select(TournamentDraftRow)).all()
        }
        unique_drafts = list(dict.fromkeys(draft_ids))
        pending: list[tuple[str, str]] = []
        for did, dtype in unique_drafts:
            existing = known_rows.get((did, dtype))
            if existing is None:
                pending.append((did, dtype))
                continue
            if force:
                pending.append((did, dtype))
                continue
            # Backfill map admin-pick neutrals / ban order for older cached rows.
            if dtype == "map" and (
                (existing.neutral_counts_json or "{}") in ("{}", "")
                or (existing.ban_order_json or "{}") in ("{}", "")
            ):
                pending.append((did, dtype))
            if dtype == "civ":
                if int(getattr(existing, "analysis_revision", 0) or 0) < DRAFT_ANALYSIS_REVISION:
                    pending.append((did, dtype))
                elif (existing.ban_order_json or "{}") in ("{}", ""):
                    pending.append((did, dtype))

        dataset.status_detail = f"Fetching {len(pending)} aoe2cm draft(s)…"
        db.commit()

        for draft_id, draft_type in pending:
            try:
                draft = await fetch_draft(draft_id)
                events = list(draft.get("events") or [])
                option_labels = _option_labels_from_draft(draft)
                pool = _pool_from_draft(draft) if draft_type == "map" else None
                analysis = analyze_draft_events_all_sides(
                    events,
                    pool_options=pool,
                    option_labels=option_labels,
                    normalize_civ=(draft_type == "civ"),
                )
                existing = known_rows.get((draft_id, draft_type))
                if existing:
                    existing.pick_counts_json = json.dumps(analysis["pickCounts"], ensure_ascii=True)
                    existing.ban_counts_json = json.dumps(analysis["banCounts"], ensure_ascii=True)
                    existing.pick_order_json = json.dumps(analysis["pickOrderAvg"], ensure_ascii=True)
                    existing.ban_order_json = json.dumps(analysis["banOrderAvg"], ensure_ascii=True)
                    existing.neutral_counts_json = json.dumps(
                        analysis["neutralCounts"], ensure_ascii=True
                    )
                    existing.event_count = int(analysis["eventCount"])
                    existing.analysis_revision = DRAFT_ANALYSIS_REVISION
                    existing.fetched_at = utcnow()
                    db.add(existing)
                else:
                    row = TournamentDraftRow(
                        id=new_id(),
                        draft_id=draft_id,
                        draft_type=draft_type,
                        pick_counts_json=json.dumps(analysis["pickCounts"], ensure_ascii=True),
                        ban_counts_json=json.dumps(analysis["banCounts"], ensure_ascii=True),
                        pick_order_json=json.dumps(analysis["pickOrderAvg"], ensure_ascii=True),
                        ban_order_json=json.dumps(analysis["banOrderAvg"], ensure_ascii=True),
                        neutral_counts_json=json.dumps(analysis["neutralCounts"], ensure_ascii=True),
                        event_count=int(analysis["eventCount"]),
                        analysis_revision=DRAFT_ANALYSIS_REVISION,
                    )
                    db.add(row)
                    known_rows[(draft_id, draft_type)] = row
                new_drafts += 1
                db.commit()
            except Exception as exc:
                logger.warning("aoe2cm draft %s failed: %s", draft_id, exc)
                errors.append(f"{draft_id}: {exc}")

        recompute_aggregates(db, dataset.slug)

        match_rows = list(
            db.scalars(
                select(TournamentMatchRow).where(TournamentMatchRow.dataset_slug == dataset.slug)
            ).all()
        )
        draft_pairs = _draft_pair_count(match_rows, played_only=True)
        played_matches = _count_played_matches(match_rows)
        pending_after = _pending_draft_fetches(db, dataset.slug)

        dataset.match_count = played_matches
        dataset.draft_count = draft_pairs
        dataset.last_match_date = latest_date
        dataset.last_synced_at = utcnow()
        dataset.status = "ready"
        if lpdb_capped:
            dataset.status_detail = "Partial sync (Liquipedia quota); sync again for remaining matches"
        elif pending_after > 0:
            dataset.status_detail = f"{pending_after} draft(s) still pending; sync again"
        elif errors:
            dataset.status_detail = f"{len(errors)} draft fetch error(s)"
        else:
            dataset.status_detail = None
        db.commit()
    except Exception as exc:
        dataset.status = "error"
        dataset.status_detail = str(exc)
        db.commit()
        raise

    return dataset_status(db, dataset.slug)


def recompute_aggregates(db: Session, slug: str) -> None:
    db.execute(delete(TournamentMapCivAgg).where(TournamentMapCivAgg.dataset_slug == slug))
    db.execute(delete(TournamentCivDraftAgg).where(TournamentCivDraftAgg.dataset_slug == slug))
    db.commit()

    map_civ_plays: dict[tuple[str, str], int] = Counter()
    map_civ_wins: dict[tuple[str, str], int] = Counter()

    for row in db.scalars(select(TournamentMatchRow).where(TournamentMatchRow.dataset_slug == slug)).all():
        try:
            games = json.loads(row.games_json or "[]")
        except json.JSONDecodeError:
            games = []
        for game in games:
            if not isinstance(game, dict):
                continue
            map_name = _normalize_map_name(str(game.get("map") or ""))
            if not map_name:
                continue
            winner = game.get("winner")
            for civ in game.get("civs1") or []:
                civ_name = civ_display_name(str(civ)) or str(civ)
                key = (map_name, civ_name)
                map_civ_plays[key] += 1
                if winner == "1":
                    map_civ_wins[key] += 1
            for civ in game.get("civs2") or []:
                civ_name = civ_display_name(str(civ)) or str(civ)
                key = (map_name, civ_name)
                map_civ_plays[key] += 1
                if winner == "2":
                    map_civ_wins[key] += 1

    for (map_name, civ_name), plays in map_civ_plays.items():
        db.add(
            TournamentMapCivAgg(
                id=new_id(),
                dataset_slug=slug,
                map_name=map_name,
                civ_name=civ_name,
                plays=plays,
                wins=map_civ_wins.get((map_name, civ_name), 0),
            )
        )

    # Draft aggs: only civ drafts linked to this dataset
    linked_civ_drafts = {
        extract_draft_id(row.civ_draft_id)
        for row in db.scalars(select(TournamentMatchRow).where(TournamentMatchRow.dataset_slug == slug)).all()
        if row.civ_draft_id
    }
    pick_counts: Counter[str] = Counter()
    ban_counts: Counter[str] = Counter()
    order_sum: dict[str, float] = defaultdict(float)
    order_count: Counter[str] = Counter()

    if linked_civ_drafts:
        for draft in db.scalars(
            select(TournamentDraftRow).where(
                TournamentDraftRow.draft_id.in_(list(linked_civ_drafts)),
                TournamentDraftRow.draft_type == "civ",
            )
        ).all():
            picks = _normalize_civ_count_dict(json.loads(draft.pick_counts_json or "{}"))
            bans = _normalize_civ_count_dict(json.loads(draft.ban_counts_json or "{}"))
            orders = _normalize_civ_order_dict(
                json.loads(draft.pick_order_json or "{}"),
                {**{k: v for k, v in picks.items()}, **{k: v for k, v in bans.items()}},
            )
            for civ, count in picks.items():
                pick_counts[str(civ)] += int(count)
            for civ, count in bans.items():
                ban_counts[str(civ)] += int(count)
            for civ, avg in orders.items():
                weight = int(picks.get(civ) or 0)
                if weight:
                    order_sum[str(civ)] += float(avg) * weight
                    order_count[str(civ)] += weight

    civs = set(pick_counts) | set(ban_counts) | set(order_sum)
    for civ in civs:
        db.add(
            TournamentCivDraftAgg(
                id=new_id(),
                dataset_slug=slug,
                civ_name=civ,
                picks=int(pick_counts.get(civ, 0)),
                bans=int(ban_counts.get(civ, 0)),
                pick_order_sum=float(order_sum.get(civ, 0.0)),
                pick_order_count=int(order_count.get(civ, 0)),
            )
        )
    db.commit()


def dataset_status(db: Session, slug: str) -> dict[str, Any]:
    row = db.get(TournamentDataset, slug)
    if not row:
        return {"found": False, "slug": slug, "attribution": liquipedia_attribution()}
    stages = json.loads(row.stages_json or "[]")
    # Keep registry stages authoritative in API responses (avoids stale 1-stage caches).
    resolved = resolve_registry_entry(row.display_name) or resolve_registry_entry(slug)
    if resolved:
        _, entry = resolved
        registry_stages = [to_pagename(str(s)) for s in (entry.get("stages") or []) if s]
        if registry_stages and set(registry_stages) != {to_pagename(str(s)) for s in stages if s}:
            stages = registry_stages
            row.stages_json = json.dumps(stages, ensure_ascii=True)
            row.display_name = str(entry.get("displayName") or row.display_name)
            db.commit()
    pending_drafts = _pending_draft_fetches(db, slug) if row.status == "ready" else 0
    match_rows = list(
        db.scalars(select(TournamentMatchRow).where(TournamentMatchRow.dataset_slug == slug)).all()
    )
    draft_pairs = _draft_pair_count(match_rows, played_only=True)
    played_matches = _count_played_matches(match_rows)
    if draft_pairs != row.draft_count or played_matches != row.match_count:
        row.draft_count = draft_pairs
        row.match_count = played_matches
        db.commit()
    return {
        "found": True,
        "slug": row.slug,
        "displayName": row.display_name,
        "liquipediaParent": row.liquipedia_parent,
        "liquipediaUrl": f"https://liquipedia.net/ageofempires/{row.liquipedia_parent}",
        "stages": stages,
        "status": row.status,
        "statusDetail": row.status_detail,
        "lastSyncedAt": row.last_synced_at.isoformat() if row.last_synced_at else None,
        "lastMatchDate": row.last_match_date,
        "matchCount": played_matches,
        "draftCount": draft_pairs,
        "draftPairCount": draft_pairs,
        "pendingDraftCount": pending_drafts,
        "attribution": liquipedia_attribution(),
    }


def resolve_tournament_stats(db: Session, name: str) -> dict[str, Any]:
    resolved = resolve_registry_entry(name)
    dataset, entry = ensure_dataset(db, name)
    status = dataset_status(db, dataset.slug)
    status["registryHit"] = resolved is not None
    status["aliases"] = list(entry.get("aliases") or [])
    return status


def map_stats(db: Session, slug: str, map_name: str, *, limit: int = 8) -> dict[str, Any]:
    rows = db.scalars(
        select(TournamentMapCivAgg).where(TournamentMapCivAgg.dataset_slug == slug)
    ).all()
    matched = [row for row in rows if _maps_match(row.map_name, map_name)]
    if not matched:
        # try exact normalized
        needle = _normalize_map_name(map_name).lower()
        matched = [row for row in rows if row.map_name.lower() == needle]

    stats = []
    for row in matched:
        wr = (row.wins / row.plays) if row.plays else 0.0
        stats.append(
            {
                "civ": row.civ_name,
                "plays": row.plays,
                "wins": row.wins,
                "winRate": round(wr * 100, 1),
            }
        )
    by_plays = sorted(stats, key=lambda item: (-item["plays"], -item["winRate"], item["civ"]))
    eligible_wr = [item for item in stats if item["plays"] >= 2]
    by_wr_high = sorted(eligible_wr or stats, key=lambda item: (-item["winRate"], -item["plays"]))
    by_wr_low = sorted(eligible_wr or stats, key=lambda item: (item["winRate"], -item["plays"]))

    return {
        "slug": slug,
        "mapName": map_name,
        "mostPicked": by_plays[:limit],
        "highestWinRate": by_wr_high[:3],
        "lowestWinRate": by_wr_low[:3],
        "attribution": liquipedia_attribution(),
    }


def draft_stats(db: Session, slug: str, *, full: bool = False, limit: int = 12) -> dict[str, Any]:
    rows = db.scalars(
        select(TournamentCivDraftAgg).where(TournamentCivDraftAgg.dataset_slug == slug)
    ).all()
    items = []
    for row in rows:
        avg_order = (row.pick_order_sum / row.pick_order_count) if row.pick_order_count else None
        items.append(
            {
                "civ": row.civ_name,
                "picks": row.picks,
                "bans": row.bans,
                "avgPickOrder": round(avg_order, 2) if avg_order is not None else None,
            }
        )

    most_banned = sorted(items, key=lambda item: (-item["bans"], -item["picks"], item["civ"]))
    most_picked = sorted(items, key=lambda item: (-item["picks"], -item["bans"], item["civ"]))
    earliest = sorted(
        [item for item in items if item["avgPickOrder"] is not None],
        key=lambda item: (item["avgPickOrder"], -item["picks"]),
    )

    payload = {
        "slug": slug,
        "mostBanned": most_banned[:limit],
        "mostPicked": most_picked[:limit],
        "earliestPicks": earliest[:limit],
        "attribution": liquipedia_attribution(),
    }
    if full:
        payload["all"] = sorted(items, key=lambda item: item["civ"])
    return payload


def _top_named_counts(counter: Counter[str], *, n: int = META_TOP_N, reverse: bool = True) -> list[dict[str, Any]]:
    if not counter:
        return []
    items = sorted(counter.items(), key=lambda item: (-item[1], item[0]) if reverse else (item[1], item[0]))
    return [{"name": name, "count": int(count)} for name, count in items[:n]]


def _sum_json_counts(rows: list[TournamentDraftRow], field: str) -> Counter[str]:
    totals: Counter[str] = Counter()
    for draft in rows:
        raw = getattr(draft, field, None) or "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        for key, value in data.items():
            totals[str(key)] += int(value or 0)
    return totals


def _sum_civ_json_counts(rows: list[TournamentDraftRow], field: str) -> Counter[str]:
    totals: Counter[str] = Counter()
    for draft in rows:
        raw = getattr(draft, field, None) or "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        normalized = _normalize_civ_count_dict(data)
        for key, value in normalized.items():
            totals[key] += int(value or 0)
    return totals


def list_meta_events(db: Session) -> dict[str, Any]:
    events = []
    for slug, entry in list_meta_registry_entries():
        status = dataset_status(db, slug)
        if not status.get("found"):
            # Ensure a dataset row exists so UI can sync by slug/display name.
            ensure_dataset(db, slug)
            status = dataset_status(db, slug)
        events.append(
            {
                "slug": slug,
                "displayName": str(entry.get("displayName") or slug),
                "liquipediaParent": str(entry.get("liquipediaParent") or ""),
                "liquipediaUrl": f"https://liquipedia.net/ageofempires/{entry.get('liquipediaParent')}",
                "stages": list(entry.get("stages") or []),
                "aliases": list(entry.get("aliases") or []),
                "status": status.get("status"),
                "statusDetail": status.get("statusDetail"),
                "lastSyncedAt": status.get("lastSyncedAt"),
                "matchCount": status.get("matchCount") or 0,
                "draftCount": status.get("draftCount") or 0,
                "draftPairCount": status.get("draftPairCount") or status.get("draftCount") or 0,
                "pendingDraftCount": status.get("pendingDraftCount") or 0,
            }
        )
    return {"events": events, "attribution": liquipedia_attribution()}


def meta_overview(db: Session, slug: str) -> dict[str, Any]:
    status = dataset_status(db, slug)
    if not status.get("found"):
        return {
            "found": False,
            "slug": slug,
            "maps": {},
            "civs": {},
            "perMap": [],
            "attribution": liquipedia_attribution(),
        }

    matches = list(
        db.scalars(select(TournamentMatchRow).where(TournamentMatchRow.dataset_slug == slug)).all()
    )
    map_plays: Counter[str] = Counter()
    civ_plays: Counter[str] = Counter()
    civ_wins: Counter[str] = Counter()

    linked_civ: set[str] = set()
    linked_map: set[str] = set()
    for row in matches:
        if row.civ_draft_id:
            linked_civ.add(extract_draft_id(row.civ_draft_id))
        if row.map_draft_id:
            linked_map.add(extract_draft_id(row.map_draft_id))
        try:
            games = json.loads(row.games_json or "[]")
        except json.JSONDecodeError:
            games = []
        for game in games:
            if not isinstance(game, dict):
                continue
            map_name = _normalize_map_name(str(game.get("map") or ""))
            if map_name:
                map_plays[map_name] += 1
            winner = game.get("winner")
            for civ in game.get("civs1") or []:
                label = civ_display_name(str(civ)) or str(civ)
                civ_plays[label] += 1
                if winner == "1":
                    civ_wins[label] += 1
            for civ in game.get("civs2") or []:
                label = civ_display_name(str(civ)) or str(civ)
                civ_plays[label] += 1
                if winner == "2":
                    civ_wins[label] += 1

    map_drafts = (
        list(
            db.scalars(
                select(TournamentDraftRow).where(
                    TournamentDraftRow.draft_id.in_(list(linked_map) or ["__none__"]),
                    TournamentDraftRow.draft_type == "map",
                )
            ).all()
        )
        if linked_map
        else []
    )
    civ_drafts = (
        list(
            db.scalars(
                select(TournamentDraftRow).where(
                    TournamentDraftRow.draft_id.in_(list(linked_civ) or ["__none__"]),
                    TournamentDraftRow.draft_type == "civ",
                )
            ).all()
        )
        if linked_civ
        else []
    )

    map_bans = _sum_json_counts(map_drafts, "ban_counts_json")
    map_picks = _sum_json_counts(map_drafts, "pick_counts_json")
    map_neutrals = _sum_json_counts(map_drafts, "neutral_counts_json")
    civ_bans = _sum_civ_json_counts(civ_drafts, "ban_counts_json")
    civ_picks = _sum_civ_json_counts(civ_drafts, "pick_counts_json")

    map_draft_n = max(len(map_drafts), 1)
    civ_draft_n = max(len(civ_drafts), 1)

    pick_order_sum: dict[str, float] = defaultdict(float)
    pick_order_count: Counter[str] = Counter()
    ban_order_sum: dict[str, float] = defaultdict(float)
    ban_order_count: Counter[str] = Counter()
    for draft in civ_drafts:
        picks = _normalize_civ_count_dict(json.loads(draft.pick_counts_json or "{}"))
        bans = _normalize_civ_count_dict(json.loads(draft.ban_counts_json or "{}"))
        pick_orders = _normalize_civ_order_dict(
            json.loads(draft.pick_order_json or "{}"),
            picks,
        )
        ban_orders = _normalize_civ_order_dict(
            json.loads(draft.ban_order_json or "{}"),
            bans,
        )
        for civ, avg in pick_orders.items():
            weight = int(picks.get(civ) or 0)
            if weight:
                pick_order_sum[civ] += float(avg) * weight
                pick_order_count[civ] += weight
        for civ, avg in ban_orders.items():
            weight = int(bans.get(civ) or 0)
            if weight:
                ban_order_sum[civ] += float(avg) * weight
                ban_order_count[civ] += weight

    # Global civ rates table
    civ_names = set(civ_plays) | set(civ_bans) | set(civ_picks)
    rates: list[dict[str, Any]] = []
    for civ in sorted(civ_names):
        plays = int(civ_plays.get(civ, 0))
        wins = int(civ_wins.get(civ, 0))
        picks = int(civ_picks.get(civ, 0))
        bans = int(civ_bans.get(civ, 0))
        avg_pick = (
            round(pick_order_sum[civ] / pick_order_count[civ], 2)
            if pick_order_count.get(civ)
            else None
        )
        avg_ban = (
            round(ban_order_sum[civ] / ban_order_count[civ], 2)
            if ban_order_count.get(civ)
            else None
        )
        rates.append(
            {
                "civ": civ,
                "plays": plays,
                "wins": wins,
                "winRate": round((wins / plays) * 100, 1) if plays else None,
                "picks": picks,
                "bans": bans,
                "pickRate": round((picks / civ_draft_n) * 100, 1),
                "banRate": round((bans / civ_draft_n) * 100, 1),
                "avgPickOrder": avg_pick,
                "avgBanOrder": avg_ban,
            }
        )
    rates.sort(key=lambda item: (-(item["bans"] or 0), -(item["picks"] or 0), item["civ"]))

    highest_wr = sorted(
        [row for row in rates if (row["plays"] or 0) >= META_MIN_MAP_CIV_SAMPLE and row["winRate"] is not None],
        key=lambda item: (-float(item["winRate"]), -(item["plays"] or 0), item["civ"]),
    )[:META_TOP_N]

    # Per-map top/bottom civs
    map_civ_rows = list(
        db.scalars(select(TournamentMapCivAgg).where(TournamentMapCivAgg.dataset_slug == slug)).all()
    )
    by_map: dict[str, list[TournamentMapCivAgg]] = defaultdict(list)
    for row in map_civ_rows:
        by_map[row.map_name].append(row)

    per_map: list[dict[str, Any]] = []
    for map_name in sorted(by_map.keys(), key=lambda name: (-map_plays.get(name, 0), name)):
        stats = []
        for row in by_map[map_name]:
            wr = (row.wins / row.plays) if row.plays else 0.0
            stats.append(
                {
                    "civ": row.civ_name,
                    "plays": row.plays,
                    "wins": row.wins,
                    "winRate": round(wr * 100, 1),
                }
            )
        eligible = [item for item in stats if item["plays"] >= META_MIN_MAP_CIV_SAMPLE]
        pool = eligible or stats
        top = sorted(pool, key=lambda item: (-item["winRate"], -item["plays"], item["civ"]))[:META_TOP_N]
        bottom = sorted(pool, key=lambda item: (item["winRate"], -item["plays"], item["civ"]))[:META_TOP_N]
        per_map.append({"mapName": map_name, "topPicks": top, "bottomPicks": bottom})

    return {
        "found": True,
        "slug": slug,
        "status": status,
        "maps": {
            "mostPlayed": _top_named_counts(map_plays, reverse=True),
            "leastPlayed": _top_named_counts(map_plays, reverse=False),
            "mostBanned": _top_named_counts(map_bans, reverse=True),
            "mostPicked": _top_named_counts(map_picks, reverse=True),
            "mostNeutral": _top_named_counts(map_neutrals, reverse=True),
            "mapDraftCount": len(map_drafts),
        },
        "civs": {
            "mostPlayed": _top_named_counts(civ_plays, reverse=True),
            "leastPlayed": _top_named_counts(civ_plays, reverse=False),
            "mostBanned": _top_named_counts(civ_bans, reverse=True),
            "mostPicked": _top_named_counts(civ_picks, reverse=True),
            "highestWinRate": [
                {"name": row["civ"], "count": row["plays"], "winRate": row["winRate"]}
                for row in highest_wr
            ],
            "rates": rates,
            "civDraftCount": len(civ_drafts),
        },
        "perMap": per_map,
        "attribution": liquipedia_attribution(),
    }
