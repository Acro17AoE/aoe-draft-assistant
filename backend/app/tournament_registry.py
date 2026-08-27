"""Resolve preset / free-text tournament names to Liquipedia registry entries."""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REGISTRY_PATHS = [
    Path(__file__).resolve().parent / "data" / "tournament-registry.json",
    Path(__file__).resolve().parents[1] / "config" / "tournament-registry.json",
    Path(__file__).resolve().parents[2] / "config" / "tournament-registry.json",
]

_FALLBACK_REGISTRY: dict[str, Any] = {
    "the-league": {
        "displayName": "The League",
        "aliases": ["The League", "TheLeague", "TL", "RF", "the league"],
        "liquipediaParent": "The_League",
        "trackedForMeta": True,
        "stages": [
            "The_League",
            "The_League/Division_2",
            "The_League/Qualifier/1",
            "The_League/Qualifier/2",
        ],
    },
    "the-league-qualifiers": {
        "displayName": "The League Qualifiers",
        "aliases": [
            "The League Qualifiers",
            "TheLeague Qualifiers",
            "TL Qualifiers",
            "the-league-qualifiers",
        ],
        "liquipediaParent": "The_League",
        "trackedForMeta": False,
        "stages": ["The_League/Qualifier/1", "The_League/Qualifier/2"],
    },
    "warlords-5": {
        "displayName": "Warlords 5",
        "aliases": ["Warlords 5", "Warlords/5", "WL5", "Warlords V"],
        "liquipediaParent": "Warlords/5",
        "trackedForMeta": True,
        "stages": ["Warlords/5"],
    },
    "brazilian-dynasty": {
        "displayName": "Brazilian Dynasty",
        "aliases": ["Brazilian Dynasty", "Brazilian_Dynasty", "BD"],
        "liquipediaParent": "Brazilian_Dynasty",
        "trackedForMeta": False,
        "stages": [
            "Brazilian_Dynasty",
            "Brazilian_Dynasty/International_Qualifier_1",
            "Brazilian_Dynasty/International_Qualifier_2",
            "Brazilian_Dynasty/Showmatch/1",
            "Brazilian_Dynasty/Showmatch/2",
            "Brazilian_Dynasty/Showmatch/3",
        ],
    },
}


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


@lru_cache(maxsize=1)
def load_tournament_registry() -> dict[str, Any]:
    for path in _REGISTRY_PATHS:
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and data:
                    logger.info("Loaded tournament registry from %s (%s entries)", path, len(data))
                    return data
            except Exception as exc:
                logger.warning("Failed reading tournament registry %s: %s", path, exc)
    logger.warning("Tournament registry file missing — using built-in fallback")
    return dict(_FALLBACK_REGISTRY)


def list_meta_registry_entries() -> list[tuple[str, dict[str, Any]]]:
    """Return (slug, entry) for events flagged trackedForMeta."""
    registry = load_tournament_registry()
    items: list[tuple[str, dict[str, Any]]] = []
    for slug, entry in registry.items():
        if entry.get("trackedForMeta"):
            items.append((slug, entry))
    items.sort(key=lambda item: str(item[1].get("displayName") or item[0]).lower())
    return items


def resolve_registry_entry(name: str) -> tuple[str, dict[str, Any]] | None:
    """Return (slug, entry) for the best alias / display-name match."""
    trimmed = name.strip()
    if not trimmed:
        return None

    registry = load_tournament_registry()
    needle = _normalize(trimmed)

    if trimmed.lower() in registry:
        return trimmed.lower(), registry[trimmed.lower()]

    exact: list[tuple[int, str, dict[str, Any]]] = []
    fuzzy: list[tuple[int, str, dict[str, Any]]] = []

    for slug, entry in registry.items():
        aliases = [str(entry.get("displayName") or ""), slug, *list(entry.get("aliases") or [])]
        for alias in aliases:
            norm = _normalize(alias)
            if not norm:
                continue
            if norm == needle:
                # Longer alias wins so "The League Qualifiers" beats a bare "The League" collision.
                exact.append((len(norm), slug, entry))
                break
            # Avoid "The League" fuzzy-matching "The League Qualifiers" via substring.
            shorter, longer = (needle, norm) if len(needle) <= len(norm) else (norm, needle)
            if shorter in longer and len(shorter) >= max(6, int(len(longer) * 0.7)):
                fuzzy.append((len(shorter), slug, entry))

    if exact:
        exact.sort(key=lambda item: item[0], reverse=True)
        _, slug, entry = exact[0]
        return slug, entry
    if fuzzy:
        fuzzy.sort(key=lambda item: item[0], reverse=True)
        _, slug, entry = fuzzy[0]
        return slug, entry
    return None


def liquipedia_attribution() -> dict[str, str]:
    return {
        "text": "Tournament and team data provided by Liquipedia",
        "url": "https://liquipedia.net/ageofempires/Main_Page",
        "license": "CC-BY-SA",
        "licenseUrl": "https://liquipedia.net/commons/Liquipedia:Copyrights",
    }
