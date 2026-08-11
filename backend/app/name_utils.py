"""Player name normalization and fuzzy matching."""

from __future__ import annotations

import re


def normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def compact_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_name(name))


_TEAM_SUFFIXES = ("esports", "esport", "gaming")


def team_core_compact(name: str) -> str:
    """Compact team identity with common org suffixes stripped (eSports, Gaming, Team)."""
    compact = compact_name(name)
    if compact.startswith("team") and len(compact) > 6:
        compact = compact[4:]
    for suffix in _TEAM_SUFFIXES:
        if compact.endswith(suffix) and len(compact) > len(suffix) + 2:
            compact = compact[: -len(suffix)]
            break
    return compact


def names_match(left: str, right: str) -> bool:
    a = normalize_name(left)
    b = normalize_name(right)
    if not a or not b:
        return False
    if a == b:
        return True
    compact_a = compact_name(left)
    compact_b = compact_name(right)
    if compact_a and compact_b and (compact_a in compact_b or compact_b in compact_a):
        return True
    for token in re.split(r"[.\s_|]+", a):
        if len(token) >= 4 and token == b:
            return True
    for token in re.split(r"[.\s_|]+", b):
        if len(token) >= 4 and token == a:
            return True
    for token in re.split(r"[.\s_|]+", a):
        if len(token) >= 4 and token in b:
            return True
    for token in re.split(r"[.\s_|]+", b):
        if len(token) >= 4 and token in a:
            return True
    return False


def team_names_match(left: str, right: str) -> bool:
    """Strict team identity for tournament filtering (no cross-team fuzzy matches)."""
    a = normalize_name(left)
    b = normalize_name(right)
    if not a or not b:
        return False
    if a == b:
        return True
    compact_a = compact_name(left)
    compact_b = compact_name(right)
    if compact_a and compact_b and compact_a == compact_b:
        return True
    core_a = team_core_compact(left)
    core_b = team_core_compact(right)
    return bool(core_a and core_b and core_a == core_b)