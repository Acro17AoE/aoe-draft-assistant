"""Map name → archetype (open / closed / hybrid / water / nomad / other)."""

from __future__ import annotations

import re

ARCHETYPES = ("open", "closed", "hybrid", "water", "nomad", "other")

# Canonical AoE2 RM map names and custom tournament maps.
MAP_ARCHETYPE: dict[str, str] = {
    "acropolis": "hybrid",
    "african clearing": "open",
    "aftermath": "open",
    "alpine lakes": "water",
    "arabia": "open",
    "arena": "hybrid",
    "araucarias": "closed",
    "atacama": "open",
    "baltic": "water",
    "black forest": "closed",
    "bog islands": "water",
    "cape of storms": "water",
    "caucasus": "hybrid",
    "coastal": "water",
    "coastal forest": "hybrid",
    "continental": "open",
    "crater lake": "water",
    "crescent": "hybrid",
    "crater": "hybrid",
    "enemy archipelago": "water",
    "festa da polvora": "hybrid",
    "fernando de noronha": "water",
    "fortified clearing": "hybrid",
    "fortress": "closed",
    "frontline": "hybrid",
    "ghost lake": "water",
    "gold rush": "open",
    "golden swamp": "water",
    "grand bara": "open",
    "greenland": "water",
    "haven": "water",
    "hideout": "closed",
    "highland": "hybrid",
    "hill fort": "closed",
    "islands": "water",
    "karsts": "hybrid",
    "land nomad": "nomad",
    "lencois maranhenses": "open",
    "lowland": "open",
    "marketplace": "hybrid",
    "mediterranean": "water",
    "mega random": "other",
    "megarandom": "other",
    "menindee": "open",
    "migration": "nomad",
    "monte pascoal": "hybrid",
    "moorea": "water",
    "mountain pass": "hybrid",
    "mountain ridge": "hybrid",
    "nile delta": "water",
    "nomad": "nomad",
    "oasis": "hybrid",
    "pantanal": "water",
    "parque-do-ipiranga": "hybrid",
    "parque do ipiranga": "hybrid",
    "pilgrims": "nomad",
    "river divide": "hybrid",
    "rivers": "hybrid",
    "runestones": "hybrid",
    "salt marsh": "water",
    "scandinavia": "water",
    "serra da carajas": "closed",
    "sertao": "open",
    "shrubland": "open",
    "socotra": "open",
    "steppe": "open",
    "team acropolis": "hybrid",
    "team islands": "water",
    "tres leches": "hybrid",
    "valley": "open",
    "water holes": "open",
    "wolf hill": "hybrid",
    "yucatan": "closed",
}


def _normalize_map_name(name: str) -> str:
    return " ".join(name.lower().replace("_", " ").replace("-", " ").split())


def map_archetype(map_name: str) -> str:
    normalized = _normalize_map_name(map_name)
    if normalized in MAP_ARCHETYPE:
        return MAP_ARCHETYPE[normalized]

    if any(token in normalized for token in ("island", "coast", "sea", "water", "noronha", "pantanal")):
        return "water"
    if "nomad" in normalized or normalized in {"migration", "pilgrims"}:
        return "nomad"
    if any(token in normalized for token in ("forest", "hideout", "fortress", "carajas")):
        return "closed"
    if any(token in normalized for token in ("arena", "fort", "oasis", "acropolis")):
        return "hybrid"
    if any(token in normalized for token in ("arabia", "rush", "clearing", "open", "sertao", "steppe")):
        return "open"
    return "other"


def aggregate_archetype_counts(map_counts: dict[str, int]) -> dict[str, int]:
    totals: dict[str, int] = {key: 0 for key in ARCHETYPES}
    for map_name, count in map_counts.items():
        archetype = map_archetype(map_name)
        totals[archetype] = totals.get(archetype, 0) + int(count)
    return {key: value for key, value in totals.items() if value > 0}


def top_archetypes(map_counts: dict[str, int], *, limit: int = 3) -> list[str]:
    ranked = sorted(aggregate_archetype_counts(map_counts).items(), key=lambda item: item[1], reverse=True)
    return [name for name, _ in ranked[:limit]]
