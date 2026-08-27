"""Player name normalization and fuzzy matching."""

from __future__ import annotations

import re


def normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def compact_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_name(name))


_TEAM_SUFFIXES = ("esports", "esport", "gaming")

# Captain-mode seat tags only: "NOC A", "Geng_B" — short parent + single letter.
_SHORT_ROSTER_SEAT_RE = re.compile(r"^[A-Za-z0-9]{2,5}[\s_]+[A-Za-z]$")


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


def is_short_roster_seat(name: str) -> bool:
    """True for captain-mode seats like ``NOC A`` / ``Geng_B``, not ``Wonders B``."""
    return bool(_SHORT_ROSTER_SEAT_RE.match(name.strip()))


def _team_tokens(name: str) -> list[str]:
    return [token for token in re.split(r"[\s_.]+", name.strip()) if token]


def team_branch_key(name: str) -> str:
    """Sub-team discriminator that must agree for two labels to be the same org branch.

    Examples:
    - ``Wonders B`` / ``Darkside L`` → ``b`` / ``l``
    - ``Onimaru Vanguard`` → ``vanguard``
    - ``Oni.Barbetacos`` → ``barbetacos``
    - ``Nocturna eSports`` → ```` (eSports is an org suffix, not a branch)
    - ``NOC A`` → ```` (short roster seats have no branch)
    """
    trimmed = name.strip()
    if not trimmed or is_short_roster_seat(trimmed):
        return ""

    tokens = _team_tokens(trimmed)
    if len(tokens) < 2:
        return ""

    # Drop leading "Team"
    if tokens[0].lower() == "team" and len(tokens) > 2:
        tokens = tokens[1:]

    def _is_org_suffix(token: str) -> bool:
        low = token.lower()
        return low in {"esports", "esport", "gaming"} or low.rstrip("s") in {"esport", "gaming"}

    # Keep the org head; drop eSports/Gaming tokens; remaining = branch (B, L, Vanguard…).
    head, *rest = tokens
    branch_tokens = [token for token in rest if not _is_org_suffix(token)]
    if not branch_tokens:
        return ""
    return compact_name(" ".join(branch_tokens))


def team_org_base(name: str) -> str:
    """Org identity with sub-team branch removed (``Onimaru Vanguard`` → ``onimaru``)."""
    compact = team_core_compact(name)
    branch = team_branch_key(name)
    if branch and compact.endswith(branch):
        base = compact[: -len(branch)]
        return base or compact
    return compact


def _branches_compatible(left: str, right: str) -> bool:
    if left == right:
        return True
    # Soft plural: Vanguard ≈ Vanguards
    if len(left) >= 4 and len(right) >= 4 and left.rstrip("s") == right.rstrip("s"):
        return True
    return False


def _org_bases_compatible(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    # Abbreviation prefix: Oni ↔ Onimaru (min 3 chars to avoid LY/DS false friends)
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    return len(shorter) >= 3 and longer.startswith(shorter)


def team_names_match(left: str, right: str) -> bool:
    """Strict team identity for tournament filtering (no cross-branch merges)."""
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
    if core_a and core_b and core_a == core_b:
        return _branches_compatible(team_branch_key(left), team_branch_key(right))

    # Same org base after stripping branches (Onimaru Vanguard ≈ Onimaru Vanguards).
    base_a = team_org_base(left)
    base_b = team_org_base(right)
    if base_a and base_b and _org_bases_compatible(base_a, base_b):
        return _branches_compatible(team_branch_key(left), team_branch_key(right))

    return False


def strip_roster_tag(name: str) -> str:
    """Strip trailing captain-mode roster letters: 'NOC A' / 'NOC_B' → 'NOC'."""
    trimmed = name.strip()
    if not trimmed:
        return trimmed
    if not is_short_roster_seat(trimmed):
        return trimmed
    return re.sub(r"[\s_]+[A-Za-z]$", "", trimmed).strip() or trimmed


def draft_seat_matches(seat: str, org_name: str) -> bool:
    """Match aoe2cm host/guest seats to Liquipedia org names.

    Allows:
    - short captain-mode tags (``NOC A`` ↔ ``Nocturna eSports``)
    - eSports/Gaming spelling variants
    - Liquipedia org umbrellas vs aoe2cm sub-rosters
      (``Onimaru_Esports`` ↔ ``Onimaru Vanguard`` / ``Oni.Barbetacos``)

    Still does **not** merge distinct sub-teams when both sides are branched
    (``Onimaru Vanguard`` vs ``Onimaru Capybaras``, ``Wonders`` vs ``Wonders B``).
    """
    if team_names_match(seat, org_name):
        return True

    seat_label = strip_roster_tag(seat) if is_short_roster_seat(seat) else seat.strip()
    seat_core = team_core_compact(seat_label)
    org_core = team_core_compact(org_name)
    if not seat_core or not org_core:
        return False

    # After short-roster strip only: NOC == nocturna core equality already handled above.
    if seat_core == org_core:
        # Still reject if the Liquipedia org is a branched sub-team and the seat isn't.
        return _branches_compatible(team_branch_key(seat), team_branch_key(org_name))

    # Short captain-mode tags: NOC / NOC A → Nocturna_eSports (unbranched org only).
    if 3 <= len(seat_core) <= 4 and org_core.startswith(seat_core):
        if team_branch_key(org_name):
            return False
        return True

    # Liquipedia umbrella (Onimaru_Esports) ↔ aoe2cm sub-roster (Onimaru Vanguard / Oni Vanguard).
    seat_base = team_org_base(seat_label)
    org_base = team_org_base(org_name)
    if _org_bases_compatible(seat_base, org_base):
        org_branch = team_branch_key(org_name)
        if not org_branch:
            return True
        return _branches_compatible(team_branch_key(seat), org_branch)

    return False
