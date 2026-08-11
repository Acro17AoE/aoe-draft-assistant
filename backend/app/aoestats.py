"""Fetch ranked-map civ stats from aoestats.io and build preset bundles."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx

AOESTATS_BASE = "https://aoestats.io/api"
AOESTATS_USER_AGENT = "AoE-Draft-Assistant/1.0"
MIN_GAMES_PER_CIV = 40

# App map name -> aoestats slug (1v1 Random Map ladder)
AOESTATS_MAPS_1V1: dict[str, str] = {
    "Arabia": "arabia",
    "Arena": "arena",
    "MegaRandom": "megarandom",
    "Haboob": "haboob",
    "Glade": "glade",
    "Hideout": "lowland",
    "Gold Rush": "graveyards",
}

# App map name -> aoestats slug (team Random Map / 4v4 ladder)
AOESTATS_MAPS_TG: dict[str, str] = {
    "African Clearing": "african_clearing",
    "Black Forest": "black_forest",
    "Arabia": "arabia",
    "Arena": "arena",
    "Nomad": "nomad",
}

AOESTATS_DEFAULT_MAPS_1V1 = list(AOESTATS_MAPS_1V1.keys())
AOESTATS_DEFAULT_MAPS_TG = list(AOESTATS_MAPS_TG.keys())

# Legacy alias
AOESTATS_DEFAULT_MAPS = AOESTATS_DEFAULT_MAPS_1V1

CIV_SLUG_TO_NAME: dict[str, str] = {
    "armenians": "Armenians",
    "aztecs": "Aztecs",
    "bengalis": "Bengalis",
    "berbers": "Berbers",
    "bohemians": "Bohemians",
    "britons": "Britons",
    "bulgarians": "Bulgarians",
    "burgundians": "Burgundians",
    "burmese": "Burmese",
    "byzantines": "Byzantines",
    "celts": "Celts",
    "chinese": "Chinese",
    "cumans": "Cumans",
    "dravidians": "Dravidians",
    "ethiopians": "Ethiopians",
    "franks": "Franks",
    "georgians": "Georgians",
    "goths": "Goths",
    "gurjaras": "Gurjaras",
    "hindustanis": "Hindustanis",
    "huns": "Huns",
    "incas": "Incas",
    "italians": "Italians",
    "japanese": "Japanese",
    "jurchens": "Jurchens",
    "khmer": "Khmer",
    "khitans": "Khitans",
    "koreans": "Koreans",
    "lithuanians": "Lithuanians",
    "magyars": "Magyars",
    "malay": "Malay",
    "malians": "Malians",
    "mayans": "Mayans",
    "mongols": "Mongols",
    "persians": "Persians",
    "poles": "Poles",
    "portuguese": "Portuguese",
    "romans": "Romans",
    "saracens": "Saracens",
    "shu": "Shu",
    "sicilians": "Sicilians",
    "slavs": "Slavs",
    "spanish": "Spanish",
    "tatars": "Tatars",
    "teutons": "Teutons",
    "turks": "Turks",
    "vietnamese": "Vietnamese",
    "vikings": "Vikings",
    "wei": "Wei",
    "wu": "Wu",
}


def _slugify_map(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


async def _fetch_json(client: httpx.AsyncClient, path: str) -> Any:
    response = await client.get(path, headers={"User-Agent": AOESTATS_USER_AGENT})
    response.raise_for_status()
    return response.json()


async def fetch_latest_patch(client: httpx.AsyncClient) -> int:
    patches = await _fetch_json(client, f"{AOESTATS_BASE}/patches/?format=json")
    published = [item for item in patches if item.get("published")]
    if not published:
        raise ValueError("No published aoestats patches found")
    return int(published[0]["number"])


def _civ_stats_valid(stats: dict[str, Any]) -> bool:
    win_rate = stats.get("win_rate")
    num_games = stats.get("num_games", 0)
    if not isinstance(win_rate, (int, float)) or win_rate <= 0:
        return False
    if not isinstance(num_games, (int, float)) or num_games < MIN_GAMES_PER_CIV:
        return False
    return True


def _by_civ_from_civ_stats(civ_stats: dict[str, Any], map_slug: str) -> dict[str, dict[str, Any]]:
    """Build per-civ map stats from civ_stats[].by_map (aoestats only fills map_stats.by_civ for Arabia)."""
    by_civ: dict[str, dict[str, Any]] = {}
    for civ_slug, civ_data in civ_stats.items():
        if civ_slug not in CIV_SLUG_TO_NAME:
            continue
        map_data = (civ_data.get("by_map") or {}).get(map_slug)
        if not isinstance(map_data, dict):
            continue
        if not _civ_stats_valid(map_data):
            continue
        by_civ[civ_slug] = map_data
    return by_civ


def _resolve_by_civ(
    map_stats: dict[str, Any],
    civ_stats: dict[str, Any],
    map_slug: str,
) -> dict[str, dict[str, Any]]:
    direct = (map_stats.get(map_slug) or {}).get("by_civ") or {}
    if isinstance(direct, dict) and direct:
        filtered = {slug: stats for slug, stats in direct.items() if _civ_stats_valid(stats)}
        if filtered:
            return filtered
    return _by_civ_from_civ_stats(civ_stats, map_slug)


def _score_civs(civ_stats: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for slug, stats in civ_stats.items():
        if slug not in CIV_SLUG_TO_NAME or not _civ_stats_valid(stats):
            continue
        rows.append(
            {
                "civId": CIV_SLUG_TO_NAME[slug],
                "win_rate": float(stats["win_rate"]),
                "play_rate": float(stats.get("play_rate") or 0),
            }
        )

    if not rows:
        return []

    min_wr = min(row["win_rate"] for row in rows)
    max_wr = max(row["win_rate"] for row in rows)
    min_pr = min(row["play_rate"] for row in rows)
    max_pr = max(row["play_rate"] for row in rows)

    for row in rows:
        wr_norm = (row["win_rate"] - min_wr) / (max_wr - min_wr) if max_wr > min_wr else 0.5
        pr_norm = (row["play_rate"] - min_pr) / (max_pr - min_pr) if max_pr > min_pr else 0.5
        row["score"] = 0.55 * wr_norm + 0.45 * pr_norm

    rows.sort(key=lambda item: item["score"], reverse=True)
    total = len(rows)
    entries: list[dict[str, Any]] = []
    tier_cutoffs = [
        ("S", 0.05),
        ("A", 0.15),
        ("B", 0.35),
        ("C", 0.65),
        ("D", 0.85),
        ("F", 1.0),
    ]
    for index, row in enumerate(rows):
        percentile = (index + 1) / total
        tier = "F"
        for label, max_pct in tier_cutoffs:
            if percentile <= max_pct:
                tier = label
                break
        wr_pct = round(row["win_rate"] * 100, 1)
        pr_pct = round(row["play_rate"] * 100, 2)
        entries.append(
            {
                "civId": row["civId"],
                "tier": tier,
                "reason": f"aoestats WR {wr_pct}% · PR {pr_pct}%",
            }
        )
    return entries


def _build_map_preset(map_name: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": f"map-{_slugify_map(map_name)}",
        "name": map_name,
        "mapName": map_name,
        "entries": entries,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


async def build_aoestats_preset_bundle(
    map_names: list[str],
    grouping: str = "random_map",
) -> dict[str, Any]:
    if grouping not in {"random_map", "team_random_map"}:
        raise ValueError(f"Unsupported grouping: {grouping}")

    slug_map = AOESTATS_MAPS_TG if grouping == "team_random_map" else AOESTATS_MAPS_1V1

    async with httpx.AsyncClient(timeout=60.0) as client:
        patch = await fetch_latest_patch(client)
        payload = await _fetch_json(
            client,
            f"{AOESTATS_BASE}/stats/?patch={patch}&grouping={grouping}&elo_range=all&format=json",
        )

    if not isinstance(payload, list) or not payload:
        raise ValueError("Unexpected aoestats stats response")

    stats = payload[0]
    map_stats: dict[str, Any] = stats.get("map_stats") or {}
    civ_stats: dict[str, Any] = stats.get("civ_stats") or {}

    presets: list[dict[str, Any]] = []

    for map_name in map_names:
        aoestats_slug = slug_map.get(map_name)
        if not aoestats_slug:
            continue

        by_civ = _resolve_by_civ(map_stats, civ_stats, aoestats_slug)
        entries = _score_civs(by_civ)
        if not entries:
            continue

        presets.append(_build_map_preset(map_name, entries))

    if not presets:
        raise ValueError("No aoestats data could be mapped to the requested maps")

    ladder_label = "4v4 Team Random Map" if grouping == "team_random_map" else "1v1 Random Map"
    return {
        "version": 1,
        "maps": [preset["mapName"] for preset in presets],
        "presets": presets,
        "meta": {
            "source": "aoestats.io",
            "patch": patch,
            "grouping": grouping,
            "elo_range": "all",
            "description": (
                f"Map-specific {ladder_label} stats (win rate + play rate). "
                "Only maps with per-map civ data are included."
            ),
        },
    }
