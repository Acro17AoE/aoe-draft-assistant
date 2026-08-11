"""Liquipedia LPDB v3 client (free API) for Age of Empires data.

Uses the official LiquipediaDB API — never scrapes HTML pages.
Requires LIQUIPEDIA_API_KEY. Free-tier limit: 60 requests / hour — cache aggressively.

Attribution (CC-BY-SA): any UI that surfaces this data must credit Liquipedia
with a backlink. See https://liquipedia.net/commons/Liquipedia:Copyrights
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Any
from urllib.parse import quote

import httpx

from .tournament_registry import liquipedia_attribution, resolve_registry_entry

logger = logging.getLogger(__name__)

LPDB_BASE = "https://api.liquipedia.net/api/v3"
AOE_WIKI = "ageofempires"
LIQUIPEDIA_AOE_BASE = "https://liquipedia.net/ageofempires"

MAX_REQUESTS_PER_HOUR = 55
MIN_GAP_SECONDS = 1.5
CACHE_TTL_SECONDS = 6 * 60 * 60
NEGATIVE_CACHE_TTL = 15 * 60
REQUEST_TIMEOUT = 20.0

_lock = asyncio.Lock()
_request_times: list[float] = []
_cache: dict[str, tuple[float, Any]] = {}

# Common Liquipedia civ short codes → display names used in DRAFT.
CIV_CODE_TO_NAME: dict[str, str] = {
    "arm": "Armenians",
    "azt": "Aztecs",
    "ben": "Bengalis",
    "ber": "Berbers",
    "boh": "Bohemians",
    "bri": "Britons",
    "bul": "Bulgarians",
    "bur": "Burgundians",
    "bye": "Byzantines",
    "byz": "Byzantines",
    "cel": "Celts",
    "chi": "Chinese",
    "cum": "Cumans",
    "dra": "Dravidians",
    "eth": "Ethiopians",
    "fra": "Franks",
    "geo": "Georgians",
    "got": "Goths",
    "gur": "Gurjaras",
    "hin": "Hindustanis",
    "hun": "Huns",
    "inc": "Incas",
    "ita": "Italians",
    "jap": "Japanese",
    "jur": "Jurchens",
    "khm": "Khmer",
    "khi": "Khitans",
    "kor": "Koreans",
    "lit": "Lithuanians",
    "mag": "Magyars",
    "mal": "Malians",
    "mly": "Malay",
    "may": "Mayans",
    "mon": "Mongols",
    "per": "Persians",
    "pol": "Poles",
    "por": "Portuguese",
    "rom": "Romans",
    "sar": "Saracens",
    "sic": "Sicilians",
    "sla": "Slavs",
    "spa": "Spanish",
    "tat": "Tatars",
    "teu": "Teutons",
    "tur": "Turks",
    "vie": "Vietnamese",
    "vik": "Vikings",
    "shu": "Shu",
    "wei": "Wei",
    "wu": "Wu",
}

CANONICAL_CIV_NAMES: frozenset[str] = frozenset(CIV_CODE_TO_NAME.values())

# Free-text / aoe2cm spellings → canonical civ name (mirrors frontend CIV_NAME_ALIASES).
CIV_NAME_ALIASES: dict[str, str] = {
    "maya": "Mayans",
    "inca": "Incas",
    "aztec": "Aztecs",
    "hindustani": "Hindustanis",
    "hindustan": "Hindustanis",
    "italian": "Italians",
    "viking": "Vikings",
    "mongol": "Mongols",
    "frank": "Franks",
    "briton": "Britons",
    "korean": "Koreans",
    "spanish": "Spanish",
    "turk": "Turks",
    "saracen": "Saracens",
    "persian": "Persians",
    "persians": "Persians",
    "hun": "Huns",
    "goth": "Goths",
    "celt": "Celts",
    "slav": "Slavs",
    "magyar": "Magyars",
    "malian": "Malians",
    "malay": "Malay",
    "khmer": "Khmer",
    "burmese": "Burmese",
    "vietnamese": "Vietnamese",
    "bengali": "Bengalis",
    "dravidian": "Dravidians",
    "gurjara": "Gurjaras",
    "roman": "Romans",
    "armenian": "Armenians",
    "georgian": "Georgians",
    "bohemian": "Bohemians",
    "burgundian": "Burgundians",
    "sicilian": "Sicilians",
    "bulgarian": "Bulgarians",
    "lithuanian": "Lithuanians",
    "polish": "Poles",
    "portuguese": "Portuguese",
    "teuton": "Teutons",
    "tatar": "Tatars",
    "cuman": "Cumans",
    "mayans": "Mayans",
    "incas": "Incas",
}


def _civ_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


# LPDB v3 projection fields (aligned with https://api.liquipedia.net/documentation/api/v3
# / liquipydia models). Avoid legacy columns such as tournament.series or match.matchid.
TOURNAMENT_QUERY = (
    "pagename,name,shortname,tickername,startdate,enddate,seriespage,"
    "game,type,status,liquipediatier,liquipediatiertype"
)
MATCH_QUERY = (
    "match2id,match2bracketid,parent,tournament,date,winner,walkover,finished,"
    "extradata,mode,type,game,series,links,match2opponents,match2games"
)
PLAYER_QUERY = (
    "pagename,id,alternateid,name,status,teampagename,nationality,type"
)


def liquipedia_api_key() -> str | None:
    key = (os.getenv("LIQUIPEDIA_API_KEY") or os.getenv("LPDB_API_KEY") or "").strip()
    return key or None


def liquipedia_configured() -> bool:
    return liquipedia_api_key() is not None


def _friendly_api_error(status_code: int, body: str) -> str:
    lower = body.lower()
    if status_code in (401, 403) or "not valid" in lower or ("invalid" in lower and "key" in lower):
        return (
            "Liquipedia API key is missing or invalid. "
            "Set a valid LIQUIPEDIA_API_KEY from https://liquipedia.net/api "
            "in your local .env (or host secrets) and restart the API."
        )
    if status_code == 429:
        return "Liquipedia rate limit reached (free plan: ~60 requests/hour). Retry later."
    if "does not exist" in lower or "invalid column" in lower:
        return (
            "Liquipedia rejected a query column (schema mismatch). "
            f"Details: {body.replace(chr(10), ' ').strip()[:180]}"
        )
    snippet = body.replace("\n", " ").strip()[:180]
    return f"Liquipedia API error {status_code}: {snippet}"


async def validate_liquipedia_access() -> dict[str, Any]:
    """Single cheap auth check (1 LPDB call)."""
    if not liquipedia_configured():
        return {"ok": False, "configured": False, "detail": "LIQUIPEDIA_API_KEY is not set."}
    try:
        await lpdb_query(
            "tournament",
            query="pagename,name",
            limit=1,
            use_cache=False,
        )
        return {"ok": True, "configured": True, "detail": None}
    except Exception as exc:
        return {"ok": False, "configured": True, "detail": str(exc)}


def liquipedia_user_agent() -> str:
    configured = (os.getenv("LIQUIPEDIA_USER_AGENT") or "").strip()
    if configured:
        return configured
    contact = (os.getenv("LIQUIPEDIA_CONTACT") or "https://github.com").strip()
    return f"DRAFT-AoE2/1.0 ({contact}; community draft assistant)"


def player_page_url(pagename: str) -> str:
    slug = pagename.replace(" ", "_")
    return f"{LIQUIPEDIA_AOE_BASE}/{quote(slug, safe='_/%()')}"


def tournament_page_url(pagename: str) -> str:
    slug = pagename.replace(" ", "_")
    return f"{LIQUIPEDIA_AOE_BASE}/{quote(slug, safe='_/%()')}"


def to_pagename(value: str) -> str:
    """Normalize a free-text name to a Liquipedia pagename (underscores).

    Handles spaces and CamelCase presets such as ``TheLeague`` → ``The_League``.
    """
    text = value.strip().replace(" ", "_")
    # Insert underscores at CamelCase / PascalCase boundaries.
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", text)
    text = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", text)
    text = re.sub(r"_+", "_", text)
    return text


def from_pagename(value: str) -> str:
    return value.strip().replace("_", " ")


def _compact_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _pick_best_tournament(rows: list[dict[str, Any]], needle: str) -> dict[str, Any]:
    """Prefer Ongoing / exact compact-name matches / shallower parent pages."""
    needle_key = _compact_key(needle)
    page_key = _compact_key(to_pagename(needle))

    def score(row: dict[str, Any]) -> tuple[int, int, str]:
        status = str(row.get("status") or "").lower()
        pagename = str(row.get("pagename") or "")
        name = str(row.get("name") or "")
        keys = {_compact_key(pagename), _compact_key(name), _compact_key(from_pagename(pagename))}
        points = 0
        if status == "ongoing":
            points += 100
        if needle_key and needle_key in keys:
            points += 80
        if page_key and page_key in keys:
            points += 70
        if needle_key and any(needle_key in key or key in needle_key for key in keys if key):
            points += 25
        # Prefer root tournament pages over deep subpages.
        points -= pagename.count("/") * 8
        return (points, -pagename.count("/"), pagename)

    return max(rows, key=score)


def civ_display_name(raw: str | None) -> str | None:
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    code = re.sub(r"[^a-z]", "", text.lower())
    if code in CIV_CODE_TO_NAME:
        return CIV_CODE_TO_NAME[code]
    slug = _civ_slug(text)
    alias = CIV_NAME_ALIASES.get(slug)
    if alias:
        return alias
    for civ in CANONICAL_CIV_NAMES:
        if civ.lower() == text.lower():
            return civ
    if slug:
        for civ in CANONICAL_CIV_NAMES:
            civ_slug = _civ_slug(civ)
            if civ_slug == slug:
                return civ
            if len(slug) >= 3 and (civ_slug.startswith(slug) or slug.startswith(civ_slug)):
                return civ
    if text[:1].isupper() and len(text) > 3:
        return text
    return text.title()


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if time.time() > expires_at:
        _cache.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any, ttl: float = CACHE_TTL_SECONDS) -> None:
    _cache[key] = (time.time() + ttl, value)


def _escape_condition_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())


async def _throttle() -> None:
    async with _lock:
        now = time.time()
        cutoff = now - 3600.0
        while _request_times and _request_times[0] < cutoff:
            _request_times.pop(0)

        if len(_request_times) >= MAX_REQUESTS_PER_HOUR:
            wait = max(1.0, 3600.0 - (now - _request_times[0]) + 1.0)
            raise RuntimeError(
                f"Liquipedia free-plan budget exhausted (~{MAX_REQUESTS_PER_HOUR}/hour). "
                f"Retry in about {int(wait // 60) + 1} minute(s). Cached data is still available."
            )

        if _request_times:
            gap = MIN_GAP_SECONDS - (now - _request_times[-1])
            if gap > 0:
                await asyncio.sleep(gap)

        _request_times.append(time.time())


async def lpdb_query(
    table: str,
    *,
    conditions: str | None = None,
    query: str | None = None,
    limit: int = 20,
    offset: int = 0,
    order_by: str | None = None,
    group_by: str | None = None,
    use_cache: bool = True,
) -> list[dict[str, Any]]:
    api_key = liquipedia_api_key()
    if not api_key:
        raise RuntimeError(
            "LIQUIPEDIA_API_KEY is not set. Add it to your local .env (never commit the key)."
        )

    cache_key = f"{table}|{conditions}|{query}|{limit}|{offset}|{order_by}|{group_by}"
    if use_cache:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    params: dict[str, str | int] = {
        "wiki": AOE_WIKI,
        "limit": max(1, min(limit, 50)),
        "offset": max(0, offset),
    }
    if conditions:
        params["conditions"] = conditions
    if query:
        params["query"] = query
    if order_by:
        params["order"] = order_by
    if group_by:
        params["groupby"] = group_by

    await _throttle()

    headers = {
        "Authorization": f"Apikey {api_key}",
        "User-Agent": liquipedia_user_agent(),
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
    }

    url = f"{LPDB_BASE}/{table}"
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, headers=headers) as client:
        response = await client.get(url, params=params)
        if response.status_code == 429:
            raise RuntimeError(_friendly_api_error(429, response.text))
        if response.status_code >= 400:
            raise RuntimeError(_friendly_api_error(response.status_code, response.text))
        payload = response.json()

    if isinstance(payload, dict) and payload.get("error"):
        err = payload["error"]
        err_text = err if isinstance(err, str) else str(err)
        raise RuntimeError(_friendly_api_error(403 if "key" in err_text.lower() else 400, err_text))

    rows = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        rows = []

    cleaned = [row for row in rows if isinstance(row, dict)]
    if use_cache:
        _cache_set(cache_key, cleaned)
    return cleaned


async def find_player(name: str) -> dict[str, Any] | None:
    trimmed = _normalize_name(name)
    if not trimmed:
        return None

    cache_key = f"player:{trimmed.lower()}"
    if cache_key in _cache:
        expires_at, value = _cache[cache_key]
        if time.time() <= expires_at:
            return value
        _cache.pop(cache_key, None)

    variants = {
        trimmed,
        to_pagename(trimmed),
        from_pagename(trimmed),
        trimmed.title(),
    }
    # One request with OR across common id/pagename variants (minimize LPDB calls).
    parts: list[str] = []
    seen: set[str] = set()
    for variant in variants:
        escaped = _escape_condition_value(variant)
        if not escaped or escaped.lower() in seen:
            continue
        seen.add(escaped.lower())
        parts.append(
            f"[[pagename::{escaped}]] OR [[id::{escaped}]] OR [[alternateid::{escaped}]]"
        )
    if not parts:
        return None
    conditions = " OR ".join(parts)
    try:
        rows = await lpdb_query(
            "player",
            conditions=conditions,
            query=PLAYER_QUERY,
            limit=5,
        )
    except Exception as exc:
        logger.warning("Liquipedia player lookup failed for %s: %s", trimmed, exc)
        return None
    if rows:
        logger.info("Liquipedia player matched %s -> %s", trimmed, rows[0].get("pagename") or rows[0].get("id"))
        _cache_set(cache_key, rows[0])
        return rows[0]

    _cache_set(cache_key, None, ttl=NEGATIVE_CACHE_TTL)
    return None


def tournament_from_registry(name: str) -> dict[str, Any] | None:
    """Build a tournament stub from the local registry without an LPDB call."""
    resolved = resolve_registry_entry(name)
    if not resolved:
        return None
    _, entry = resolved
    parent = str(entry.get("liquipediaParent") or "").strip()
    if not parent:
        return None
    return {
        "pagename": parent,
        "name": str(entry.get("displayName") or from_pagename(parent)),
        "status": "Ongoing",
        "seriespage": parent,
        "_fromRegistry": True,
    }


async def find_tournament(name: str) -> dict[str, Any] | None:
    trimmed = _normalize_name(name)
    if not trimmed:
        return None

    cache_key = f"tournament:{trimmed.lower()}"
    if cache_key in _cache:
        expires_at, value = _cache[cache_key]
        if time.time() <= expires_at:
            return value
        _cache.pop(cache_key, None)

    # Prefer local registry — zero LPDB calls for known presets like TheLeague.
    registry_hit = tournament_from_registry(trimmed)
    if registry_hit:
        _cache_set(cache_key, registry_hit)
        return registry_hit

    page = to_pagename(trimmed)
    display = from_pagename(page)
    candidates = [page, trimmed, display]
    seen: set[str] = set()
    ordered: list[str] = []
    for item in candidates:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)

    # Single OR query covering pagename/name variants.
    parts: list[str] = []
    for candidate in ordered:
        escaped = _escape_condition_value(candidate)
        parts.append(f"[[pagename::{escaped}]] OR [[name::{escaped}]]")
    conditions = " OR ".join(parts)
    try:
        rows = await lpdb_query(
            "tournament",
            conditions=conditions,
            query=TOURNAMENT_QUERY,
            limit=15,
            order_by="startdate DESC",
        )
    except Exception as exc:
        logger.warning("Liquipedia tournament lookup failed for %s: %s", trimmed, exc)
        rows = []

    if rows:
        best = _pick_best_tournament(rows, trimmed)
        logger.info("Liquipedia tournament matched %s -> %s", trimmed, best.get("pagename"))
        _cache_set(cache_key, best)
        return best

    alt = await _search_tournament_alternatives(trimmed, page)
    if alt:
        logger.info("Liquipedia tournament fuzzy matched %s -> %s", trimmed, alt.get("pagename"))
        _cache_set(cache_key, alt)
        return alt

    _cache_set(cache_key, None, ttl=NEGATIVE_CACHE_TTL)
    return None


async def _search_tournament_alternatives(trimmed: str, page: str) -> dict[str, Any] | None:
    """One Ongoing scan when exact tournament lookup misses (no invalid series column)."""
    try:
        rows = await lpdb_query(
            "tournament",
            conditions="[[status::Ongoing]]",
            query=TOURNAMENT_QUERY,
            limit=40,
            order_by="startdate DESC",
        )
    except Exception as exc:
        logger.warning("Liquipedia Ongoing tournament search failed: %s", exc)
        return None

    if not rows:
        return None

    needle_key = _compact_key(trimmed)
    page_key = _compact_key(page)
    scored = [
        row
        for row in rows
        if needle_key
        and (
            needle_key in _compact_key(str(row.get("pagename") or ""))
            or needle_key in _compact_key(str(row.get("name") or ""))
            or page_key in _compact_key(str(row.get("pagename") or ""))
            or needle_key in _compact_key(str(row.get("seriespage") or ""))
            or _compact_key(str(row.get("pagename") or "")) in needle_key
            or _compact_key(str(row.get("name") or "")) in needle_key
        )
    ]
    if not scored:
        return None
    return _pick_best_tournament(scored, trimmed)


async def list_tournament_stages(parent_pagename: str) -> list[dict[str, Any]]:
    """List tournament rows under a parent pagename prefix (1 LPDB call)."""
    parent = to_pagename(parent_pagename)
    escaped = _escape_condition_value(parent)
    return await lpdb_query(
        "tournament",
        conditions=f"[[pagename::{escaped}]] OR [[pagename::{escaped}/%]]",
        query=TOURNAMENT_QUERY,
        limit=50,
        order_by="startdate ASC",
    )


async def fetch_matches_for_parents(
    pagenames: list[str],
    *,
    offset: int = 0,
    limit: int = 50,
    since_date: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch matches for one or more tournament parents in a single LPDB call."""
    parents = []
    seen: set[str] = set()
    for raw in pagenames:
        page = to_pagename(str(raw or ""))
        if not page or page.lower() in seen:
            continue
        seen.add(page.lower())
        parents.append(page)
    if not parents:
        return []

    conditions = " OR ".join(
        f"[[parent::{_escape_condition_value(page)}]]" for page in parents
    )
    if since_date:
        conditions = f"({conditions}) AND [[date::>{_escape_condition_value(since_date)}]]"

    rows = await lpdb_query(
        "match",
        conditions=conditions,
        query=MATCH_QUERY,
        limit=limit,
        offset=offset,
        order_by="date ASC",
        use_cache=False,
    )
    for row in rows:
        row["_lpdb_table"] = "match"
    return rows


async def fetch_matches_for_page(
    pagename: str,
    *,
    offset: int = 0,
    limit: int = 50,
    since_date: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch match rows for a single tournament parent page."""
    return await fetch_matches_for_parents(
        [pagename],
        offset=offset,
        limit=limit,
        since_date=since_date,
    )


def match_opponent_names(match: dict[str, Any]) -> tuple[str | None, str | None]:
    opps = match.get("match2opponents") or []
    names: list[str] = []
    if isinstance(opps, list):
        for opp in opps[:2]:
            if isinstance(opp, dict):
                label = str(opp.get("name") or opp.get("id") or "").strip()
                names.append(label)
            else:
                names.append(str(opp).strip())
    left = names[0] if len(names) > 0 and names[0] else None
    right = names[1] if len(names) > 1 and names[1] else None
    return left, right


def extract_draft_ids_from_match(match: dict[str, Any]) -> tuple[str | None, str | None]:
    """Return (civ_draft_id, map_draft_id) from match extradata / links / nested payloads."""

    def parse_obj(value: Any) -> Any:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("{") or text.startswith("["):
                try:
                    import json

                    return json.loads(text)
                except Exception:
                    return value
        return value

    extradata = parse_obj(match.get("extradata") or {})
    if not isinstance(extradata, dict):
        extradata = {}
    links = parse_obj(match.get("links") or {})
    if not isinstance(links, dict):
        links = {}

    def clean(value: Any) -> str | None:
        if not value:
            return None
        text = str(value).strip()
        if not text:
            return None
        found = re.search(r"aoe2cm\.net/draft/([^/?#\s]+)", text, flags=re.I)
        if found:
            return found.group(1)
        # Liquipedia editors often store only the short id (e.g. VcLUF).
        if re.fullmatch(r"[A-Za-z0-9_-]{4,32}", text):
            return text
        return None

    draft_keys = {
        "draft",
        "civdraft",
        "civ_draft",
        "civdraftid",
        "draftid",
        "civ_draft_id",
    }
    map_keys = {"mapdraft", "map_draft", "mapdraftid", "map_draft_id"}

    civ: str | None = None
    map_draft: str | None = None

    # Prefer explicit Liquipedia template fields used by The League (|civdraft= / |mapdraft=).
    for key in ("civdraft", "civ_draft", "draft"):
        if civ is None and key in extradata:
            civ = clean(extradata.get(key))
    for key in ("mapdraft", "map_draft"):
        if map_draft is None and key in extradata:
            map_draft = clean(extradata.get(key))

    def visit(node: Any, *, prefer: str | None = None) -> None:
        nonlocal civ, map_draft
        node = parse_obj(node)
        if isinstance(node, dict):
            for key, value in node.items():
                key_l = str(key).lower()
                if key_l in draft_keys and civ is None:
                    civ = clean(value)
                elif key_l in map_keys and map_draft is None:
                    map_draft = clean(value)
                else:
                    visit(value, prefer=prefer)
        elif isinstance(node, list):
            for item in node:
                visit(item, prefer=prefer)
        elif isinstance(node, str):
            found = clean(node)
            if not found:
                return
            if "mapdraft" in node.lower() and map_draft is None:
                map_draft = found
            elif civ is None and ("draft" in node.lower() or "aoe2cm" in node.lower()):
                # Ambiguous aoe2cm link: prefer civ draft unless explicitly map.
                if prefer == "map":
                    map_draft = map_draft or found
                else:
                    civ = found

    visit(extradata)
    visit(links)
    visit(match.get("match2bracketdata"))
    # Games occasionally carry draft refs in comments / extradata.
    visit(match.get("match2games"))

    if civ is None:
        civ = clean(match.get("draft"))
    if map_draft is None:
        map_draft = clean(match.get("mapdraft"))

    return civ, map_draft


def player_summary(player: dict[str, Any] | None) -> dict[str, Any] | None:
    if not player:
        return None
    pagename = str(player.get("pagename") or player.get("id") or "").strip()
    if not pagename:
        return None
    return {
        "pagename": pagename,
        "id": player.get("id"),
        "name": player.get("name") or player.get("id") or pagename,
        "status": player.get("status"),
        "team": player.get("teampagename") or player.get("team"),
        "nationality": player.get("nationality"),
        "type": player.get("type"),
        "url": player_page_url(pagename),
        "source": "liquipedia",
    }


def tournament_summary(tournament: dict[str, Any] | None) -> dict[str, Any] | None:
    if not tournament:
        return None
    pagename = str(tournament.get("pagename") or tournament.get("name") or "").strip()
    if not pagename:
        return None
    return {
        "pagename": pagename,
        "name": tournament.get("name") or from_pagename(pagename),
        "startDate": tournament.get("startdate"),
        "endDate": tournament.get("enddate"),
        "series": tournament.get("seriespage") or tournament.get("series"),
        "game": tournament.get("game"),
        "type": tournament.get("type"),
        "status": tournament.get("status"),
        "tier": tournament.get("liquipediatier"),
        "url": tournament_page_url(pagename),
        "source": "liquipedia",
    }


async def enrich_matchup(
    reference_name: str,
    opponent_name: str,
    tournament_query: str | None = None,
) -> dict[str, Any]:
    attribution = liquipedia_attribution()
    if not liquipedia_configured():
        return {
            "configured": False,
            "attribution": None,
            "reference": None,
            "opponent": None,
            "tournament": None,
        }

    try:
        ref_raw = await find_player(reference_name)
        opp_raw = await find_player(opponent_name)
        tour_raw = None
        if tournament_query and tournament_query.strip():
            tour_raw = await find_tournament(tournament_query.strip())
    except Exception as exc:
        logger.warning("Liquipedia enrichment skipped: %s", exc)
        return {
            "configured": True,
            "error": str(exc),
            "attribution": attribution,
            "reference": None,
            "opponent": None,
            "tournament": None,
        }

    return {
        "configured": True,
        "attribution": attribution,
        "reference": player_summary(ref_raw),
        "opponent": player_summary(opp_raw),
        "tournament": tournament_summary(tour_raw),
    }


def liquipedia_status() -> dict[str, Any]:
    return {
        "configured": liquipedia_configured(),
        "wiki": AOE_WIKI,
        "api": "lpdb-v3",
        "rateLimitHint": "Free plan: max 60 requests/hour; responses are cached locally",
        "attributionRequired": True,
        "copyrightUrl": "https://liquipedia.net/commons/Liquipedia:Copyrights",
        "hint": (
            "Tournament page mapping can work from the local registry even when the API key "
            "is invalid; match/draft sync requires a working LIQUIPEDIA_API_KEY."
        ),
    }
