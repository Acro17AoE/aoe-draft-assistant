"""Static AoE2 game data explorer (SiegeEngineers aoe2techtree + curated synergies)."""

from __future__ import annotations

import json
import logging
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Literal

import httpx

from .liquipedia import civ_display_name

logger = logging.getLogger(__name__)

TECHTREE_DATA_URL = (
    "https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/data/data.json"
)
TECHTREE_STRINGS_URL = (
    "https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/data/locales/en/strings.json"
)
TECHTREE_SOURCE = "SiegeEngineers/aoe2techtree (MIT)"
PATCH_LABEL = "aoe2techtree snapshot"
CACHE_VERSION = 3

CACHE_TTL_SECONDS = 6 * 60 * 60
RARE_WEIGHT = 2.0
DEFAULT_WEIGHT = 1.0
COMMON_WEIGHT = 0.3

# Economy tech IDs from SiegeEngineers data.json (gathering / farms / trade / civilian).
ECO_TECH_IDS = frozenset(
    {
        "8",  # Town Watch
        "12",  # Crop Rotation
        "13",  # Heavy Plow
        "14",  # Horse Collar
        "15",  # Guilds
        "17",  # Banking
        "19",  # Cartography
        "22",  # Loom
        "23",  # Coinage
        "48",  # Caravan
        "54",  # Stone Cutting
        "55",  # Gold Mining
        "182",  # Gold Shaft Mining
        "202",  # Double-Bit Axe
        "203",  # Bow Saw
        "213",  # Wheelbarrow
        "221",  # Two-Man Saw
        "249",  # Hand Cart
        "278",  # Stone Mining
        "279",  # Stone Shaft Mining
        "280",  # Town Patrol
        "373",  # Shipwright
        "374",  # Careening
        "375",  # Dry Dock
        "906",  # Fishing Lines
    }
)

# Common eco building / unit IDs (SiegeEngineers catalog).
ECO_BUILDING_IDS = frozenset(
    {
        "45",  # Dock
        "50",  # Farm
        "68",  # Mill
        "70",  # House
        "84",  # Market
        "109",  # Town Center
        "199",  # Fish Trap
        "562",  # Lumber Camp
        "584",  # Mining Camp
        "621",  # Town Center (secondary)
    }
)
ECO_UNIT_IDS = frozenset(
    {
        "13",  # Fishing Ship
        "17",  # Trade Cog
        "83",  # Villager
        "128",  # Trade Cart
        "331",  # Fishing Ship (alt)
    }
)

DnaMode = Literal["overall", "military", "eco"]

_cache_expires_at = 0.0
_cache: dict[str, Any] | None = None

SYNERGIES_PATH = Path(__file__).resolve().parent / "data" / "synergies.json"


def _normalize_query(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _clean_display_label(label: str) -> str:
    clean = re.sub(r"<br\s*/?>", " ", label, flags=re.I)
    clean = re.sub(r"<[^>]+>", "", clean)
    return re.sub(r"\s+", " ", clean).strip()


def _entity_display_name(
    internal_name: str,
    language_name_id: int | None,
    strings: dict[str, str],
) -> str:
    if language_name_id is not None:
        # Units/buildings use +9000; techs use +10000 in the English string table.
        for offset in (9000, 10000, 0):
            raw = strings.get(str(language_name_id + offset))
            if not raw or not isinstance(raw, str):
                continue
            if raw.lstrip().lower().startswith("create ") or raw.lstrip().lower().startswith(
                "research "
            ):
                continue
            clean = _clean_display_label(raw)
            if clean:
                return clean
    return internal_name.replace("_", " ")


def _entity_domain(entity_type: str, entity_id: str) -> str:
    if entity_type == "tech":
        return "eco" if entity_id in ECO_TECH_IDS else "military"
    if entity_type == "building":
        return "eco" if entity_id in ECO_BUILDING_IDS else "military"
    if entity_type == "unit":
        return "eco" if entity_id in ECO_UNIT_IDS else "military"
    return "military"


def _load_synergies() -> list[dict[str, Any]]:
    try:
        raw = SYNERGIES_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not load synergies.json: %s", exc)
        return []
    return data if isinstance(data, list) else []


async def _fetch_json(url: str) -> Any:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": "AoE-Draft-Assistant/1.0"})
        response.raise_for_status()
        return response.json()


async def _load_techtree() -> dict[str, Any]:
    global _cache, _cache_expires_at
    now = time.time()
    if _cache and now < _cache_expires_at and _cache.get("cacheVersion") == CACHE_VERSION:
        return _cache

    raw_data, strings = await _fetch_json(TECHTREE_DATA_URL), await _fetch_json(TECHTREE_STRINGS_URL)
    if not isinstance(strings, dict):
        strings = {}

    entities: dict[str, dict[str, Any]] = {}
    civ_names: list[str] = []
    civ_entity_sets: dict[str, set[str]] = {}
    civ_eco_sets: dict[str, set[str]] = {}
    civ_military_sets: dict[str, set[str]] = {}
    tech_to_civs: dict[str, list[str]] = defaultdict(list)
    unit_to_civs: dict[str, list[str]] = defaultdict(list)
    building_to_civs: dict[str, list[str]] = defaultdict(list)

    civs_raw = raw_data.get("civs") or {}
    if not isinstance(civs_raw, dict):
        civs_raw = {}

    catalog = raw_data.get("data") or {}
    if not isinstance(catalog, dict):
        catalog = {}

    for entity_type in ("Tech", "Unit", "Building"):
        type_catalog = catalog.get(entity_type) or {}
        if not isinstance(type_catalog, dict):
            continue
        for entity_id, payload in type_catalog.items():
            if not isinstance(payload, dict):
                continue
            internal = str(payload.get("internal_name") or entity_id).strip()
            language_id = payload.get("LanguageNameId")
            language_id_int = int(language_id) if language_id is not None else None
            display = _entity_display_name(internal, language_id_int, strings)
            key = f"{entity_type}:{entity_id}"
            domain = _entity_domain(entity_type.lower(), str(entity_id))
            entities[key] = {
                "id": str(entity_id),
                "type": entity_type.lower(),
                "internalName": internal,
                "name": display,
                "domain": domain,
                "searchText": _normalize_query(f"{display} {internal}"),
            }

    for civ_name, payload in civs_raw.items():
        if not isinstance(payload, dict):
            continue
        canonical = civ_display_name(str(civ_name)) or str(civ_name)
        civ_names.append(canonical)
        tech_ids = {str(item) for item in (payload.get("Tech") or [])}
        unit_ids = {str(item) for item in (payload.get("Unit") or [])}
        building_ids = {str(item) for item in (payload.get("Building") or [])}

        entity_keys: set[str] = set()
        eco_keys: set[str] = set()
        military_keys: set[str] = set()
        for tid in tech_ids:
            key = f"Tech:{tid}"
            entity_keys.add(key)
            if _entity_domain("tech", tid) == "eco":
                eco_keys.add(key)
            else:
                military_keys.add(key)
            tech_to_civs[tid].append(canonical)
        for uid in unit_ids:
            key = f"Unit:{uid}"
            entity_keys.add(key)
            if _entity_domain("unit", uid) == "eco":
                eco_keys.add(key)
            else:
                military_keys.add(key)
            unit_to_civs[uid].append(canonical)
        for bid in building_ids:
            key = f"Building:{bid}"
            entity_keys.add(key)
            if _entity_domain("building", bid) == "eco":
                eco_keys.add(key)
            else:
                military_keys.add(key)
            building_to_civs[bid].append(canonical)

        civ_entity_sets[canonical] = entity_keys
        civ_eco_sets[canonical] = eco_keys
        civ_military_sets[canonical] = military_keys

    civ_names = sorted(set(civ_names))
    for mapping in (tech_to_civs, unit_to_civs, building_to_civs):
        for key in mapping:
            mapping[key] = sorted(set(mapping[key]))

    entity_frequency: Counter[str] = Counter()
    for entity_set in civ_entity_sets.values():
        entity_frequency.update(entity_set)

    entity_weights: dict[str, float] = {}
    civ_count = max(len(civ_names), 1)
    for entity_key, count in entity_frequency.items():
        share = count / civ_count
        if share >= 0.85:
            entity_weights[entity_key] = COMMON_WEIGHT
        elif share <= 0.25:
            entity_weights[entity_key] = RARE_WEIGHT
        else:
            entity_weights[entity_key] = DEFAULT_WEIGHT

    _cache = {
        "cacheVersion": CACHE_VERSION,
        "patchLabel": PATCH_LABEL,
        "source": TECHTREE_SOURCE,
        "civCount": len(civ_names),
        "civNames": civ_names,
        "entities": entities,
        "civEntitySets": civ_entity_sets,
        "civEcoSets": civ_eco_sets,
        "civMilitarySets": civ_military_sets,
        "techToCivs": dict(tech_to_civs),
        "unitToCivs": dict(unit_to_civs),
        "buildingToCivs": dict(building_to_civs),
        "entityWeights": entity_weights,
        "techCount": sum(1 for key in entities if key.startswith("Tech:")),
        "unitCount": sum(1 for key in entities if key.startswith("Unit:")),
        "buildingCount": sum(1 for key in entities if key.startswith("Building:")),
        "synergies": _load_synergies(),
    }
    _cache_expires_at = now + CACHE_TTL_SECONDS
    return _cache


async def overview_payload() -> dict[str, Any]:
    data = await _load_techtree()
    return {
        "patchLabel": data["patchLabel"],
        "source": data["source"],
        "civCount": data["civCount"],
        "techCount": data["techCount"],
        "unitCount": data["unitCount"],
        "buildingCount": data["buildingCount"],
        "synergyCount": len(_load_synergies()),
    }


async def search_entities(query: str, *, limit: int = 20) -> list[dict[str, Any]]:
    data = await _load_techtree()
    needle = _normalize_query(query)
    if not needle:
        return []
    results: list[dict[str, Any]] = []
    for entity in data["entities"].values():
        if needle in entity["searchText"]:
            civs = civs_for_entity(data, entity["type"], entity["id"])
            results.append(
                {
                    **entity,
                    "civCount": len(civs),
                    "totalCivs": data["civCount"],
                }
            )
    results.sort(key=lambda item: (-(1 if item["type"] == "unit" and needle in _normalize_query(item["name"]) else 0), item["civCount"], item["name"]))
    return results[:limit]


def civs_for_entity(data: dict[str, Any], entity_type: str, entity_id: str) -> list[str]:
    if entity_type == "tech":
        return list(data["techToCivs"].get(entity_id, []))
    if entity_type == "unit":
        return list(data["unitToCivs"].get(entity_id, []))
    if entity_type == "building":
        return list(data["buildingToCivs"].get(entity_id, []))
    return []


async def entity_detail(entity_type: str, entity_id: str) -> dict[str, Any] | None:
    data = await _load_techtree()
    key = f"{entity_type.capitalize()}:{entity_id}"
    entity = data["entities"].get(key)
    if not entity:
        return None
    civs = civs_for_entity(data, entity["type"], entity["id"])
    missing = sorted(set(data["civNames"]) - set(civs))
    return {
        **entity,
        "civs": civs,
        "missingCivs": missing,
        "civCount": len(civs),
        "totalCivs": data["civCount"],
        "patchLabel": data["patchLabel"],
    }


async def entity_intersection(entity_keys: list[str]) -> dict[str, Any]:
    data = await _load_techtree()
    resolved: list[dict[str, Any]] = []
    civ_sets: list[set[str]] = []
    for raw_key in entity_keys:
        parts = raw_key.split(":", 1)
        if len(parts) != 2:
            continue
        entity_type, entity_id = parts[0].lower(), parts[1]
        detail = await entity_detail(entity_type, entity_id)
        if not detail:
            continue
        resolved.append(detail)
        civ_sets.append(set(detail["civs"]))
    if not civ_sets:
        return {"entities": [], "civs": [], "civCount": 0, "totalCivs": data["civCount"]}
    intersection = sorted(set.intersection(*civ_sets))
    return {
        "entities": resolved,
        "civs": intersection,
        "civCount": len(intersection),
        "totalCivs": data["civCount"],
        "patchLabel": data["patchLabel"],
    }


def _weighted_jaccard(
    left: set[str],
    right: set[str],
    weights: dict[str, float],
) -> float:
    union = left | right
    if not union:
        return 0.0
    intersection = left & right
    inter_weight = sum(weights.get(key, DEFAULT_WEIGHT) for key in intersection)
    union_weight = sum(weights.get(key, DEFAULT_WEIGHT) for key in union)
    if union_weight <= 0:
        return 0.0
    return inter_weight / union_weight


def _sets_for_mode(data: dict[str, Any], mode: DnaMode) -> dict[str, set[str]]:
    if mode == "eco":
        return data["civEcoSets"]
    if mode == "military":
        return data["civMilitarySets"]
    return data["civEntitySets"]


async def civ_similarity(
    civ_name: str,
    *,
    limit: int = 8,
    mode: DnaMode = "overall",
) -> dict[str, Any]:
    data = await _load_techtree()
    canonical = civ_display_name(civ_name) or civ_name
    sets = _sets_for_mode(data, mode)
    source_set = sets.get(canonical)
    if source_set is None:
        return {"civ": canonical, "found": False, "neighbors": [], "mode": mode}
    weights = data["entityWeights"]
    neighbors: list[dict[str, Any]] = []
    for other in data["civNames"]:
        if other == canonical:
            continue
        score = _weighted_jaccard(source_set, sets[other], weights)
        neighbors.append({"civ": other, "similarity": round(score * 100, 1)})
    neighbors.sort(key=lambda item: (-item["similarity"], item["civ"]))
    labels = {
        "overall": "Overall tech-tree access (Jaccard)",
        "military": "Military DNA — units, military buildings & combat tech",
        "eco": "Eco DNA — economy tech, farms, trade & civilian buildings",
    }
    return {
        "civ": canonical,
        "found": True,
        "mode": mode,
        "neighbors": neighbors[:limit],
        "patchLabel": data["patchLabel"],
        "method": labels.get(mode, labels["overall"]),
    }


async def list_synergies(*, category: str | None = None) -> list[dict[str, Any]]:
    rows = _load_synergies()
    if category:
        needle = category.lower().strip()
        rows = [row for row in rows if str(row.get("category") or "").lower() == needle]
    return rows


async def list_civs() -> list[str]:
    data = await _load_techtree()
    return list(data["civNames"])
