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


_ROSTER_TAG_RE = re.compile(r"[\s_]+[A-Za-z]$")


def strip_roster_tag(name: str) -> str:
    """Strip trailing captain-mode roster letters: 'NOC A' / 'NOC_B' → 'NOC'."""
    trimmed = name.strip()
    if not trimmed:
        return trimmed
    return _ROSTER_TAG_RE.sub("", trimmed).strip() or trimmed


def draft_seat_matches(seat: str, org_name: str) -> bool:
    """Match aoe2cm host/guest seats to Liquipedia org names.

    Handles short tags ('NOC A' ↔ 'Nocturna_eSports') and longer seat labels
    ('Onimaru Barbetacos' ↔ 'Onimaru_Esports') without merging distinct orgs
    like Nocturna vs Nocturna_eSports_B in Liquipedia match filters.
    """
    if team_names_match(seat, org_name):
        return True
    seat_core = team_core_compact(strip_roster_tag(seat))
    org_core = team_core_compact(org_name)
    if not seat_core or not org_core:
        return False
    if seat_core == org_core:
        return True
    # Short captain-mode tags: NOC / NOC A
    if 3 <= len(seat_core) <= 4 and org_core.startswith(seat_core):
        return True
    # Seat uses a longer label that still starts with the org core
    if len(org_core) >= 4 and seat_core.startswith(org_core):
        return True
    return False
