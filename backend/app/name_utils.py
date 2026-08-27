"""Player / team name normalization and identity matching.

Tournament sides are identified by ``(org_base, branch)``:

- **org_base** — club/org after stripping eSports/Gaming and sub-team suffixes
- **branch** — sub-roster discriminator (``b``, ``l``, ``vanguard``, …) or ``""`` for main

aoe2cm draft seats win over Liquipedia names when both are present, so umbrella LP
labels like ``DarkSidE`` / ``Onimaru_Esports`` split correctly into ``Darkside L``,
``Onimaru Vanguard``, etc. Short captain tags: ``NOC A`` = main, ``NOC B`` = branch ``b``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


def normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def compact_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_name(name))


_TEAM_SUFFIXES = ("esports", "esport", "gaming")

# Captain-mode seat tags only: "NOC A", "Geng_B" — short parent + single letter.
# Longer names like "Wonders B" are full team labels, not short tags.
_SHORT_ROSTER_SEAT_RE = re.compile(r"^[A-Za-z0-9]{2,5}[\s_]+[A-Za-z]$")


def is_short_roster_seat(name: str) -> bool:
    """True for captain-mode seats like ``NOC A`` / ``Geng_B``, not ``Wonders B``."""
    return bool(_SHORT_ROSTER_SEAT_RE.match(name.strip()))


def short_roster_letter(name: str) -> str | None:
    """Trailing roster letter for seats like ``NOC A`` / ``Noc B``, else None."""
    trimmed = name.strip()
    if not is_short_roster_seat(trimmed):
        return None
    match = re.search(r"[\s_]+([A-Za-z])$", trimmed)
    return match.group(1).lower() if match else None


def strip_roster_tag(name: str) -> str:
    """Strip trailing captain-mode roster letters: 'NOC A' / 'NOC_B' → 'NOC'."""
    trimmed = name.strip()
    if not trimmed or not is_short_roster_seat(trimmed):
        return trimmed
    return re.sub(r"[\s_]+[A-Za-z]$", "", trimmed).strip() or trimmed


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


def _team_tokens(name: str) -> list[str]:
    return [token for token in re.split(r"[\s_.]+", name.strip()) if token]


def _is_org_suffix_token(token: str) -> bool:
    low = token.lower()
    return low in {"esports", "esport", "gaming"} or low.rstrip("s") in {"esport", "gaming"}


def team_branch_key(name: str) -> str:
    """Sub-team discriminator (``b``, ``l``, ``vanguard``, …) or ``""`` for main."""
    trimmed = name.strip()
    if not trimmed:
        return ""

    letter = short_roster_letter(trimmed)
    if letter is not None:
        # A = main roster seat; any other letter is a distinct sub-team.
        return "" if letter == "a" else letter

    tokens = _team_tokens(trimmed)
    if len(tokens) < 2:
        return ""

    if tokens[0].lower() == "team" and len(tokens) > 2:
        tokens = tokens[1:]

    _head, *rest = tokens
    branch_tokens = [token for token in rest if not _is_org_suffix_token(token)]
    if not branch_tokens:
        return ""
    return compact_name(" ".join(branch_tokens))


def team_org_base(name: str) -> str:
    """Org identity with sub-team branch removed (``Onimaru Vanguard`` → ``onimaru``)."""
    if is_short_roster_seat(name):
        return team_core_compact(strip_roster_tag(name))
    compact = team_core_compact(name)
    branch = team_branch_key(name)
    if branch and compact.endswith(branch):
        base = compact[: -len(branch)]
        return base or compact
    return compact


def branches_compatible(left: str, right: str) -> bool:
    """Same branch, including soft plurals (``vanguard`` ≈ ``vanguards``)."""
    if left == right:
        return True
    if len(left) >= 4 and len(right) >= 4 and left.rstrip("s") == right.rstrip("s"):
        return True
    return False


def _branches_compatible(left: str, right: str) -> bool:
    return branches_compatible(left, right)


def org_bases_compatible(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    # Abbreviation prefix: Oni ↔ Onimaru (min 3 chars; avoids LY/DS false friends)
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    return len(shorter) >= 3 and longer.startswith(shorter)


def _org_bases_compatible(left: str, right: str) -> bool:
    return org_bases_compatible(left, right)


def canonical_branch_key(branch: str) -> str:
    """Normalize branch for clustering (``vanguards`` → ``vanguard``)."""
    trimmed = (branch or "").strip().lower()
    if len(trimmed) >= 4 and trimmed.endswith("s") and not trimmed.endswith("ss"):
        return trimmed[:-1]
    return trimmed


@dataclass(frozen=True)
class TeamIdentity:
    """Stable tournament-side identity: org + optional sub-roster branch."""

    org: str
    branch: str = ""

    @property
    def cluster_key(self) -> tuple[str, str]:
        return (self.org, canonical_branch_key(self.branch))


def camel_case_initials(name: str) -> str:
    """Initialism from CamelCase / spaced names: ``LingYuan``→``ly``, ``DarkSidE``→``ds``."""
    cleaned = (name or "").replace("_", " ").replace(".", " ").strip()
    if not cleaned:
        return ""
    words = [w for w in re.split(r"\s+", cleaned) if w]
    if len(words) >= 2:
        return "".join(word[0] for word in words if word).lower()
    parts = re.findall(r"[A-Z][a-z]*", cleaned)
    significant = [part for part in parts if len(part) >= 2]
    if len(significant) >= 2:
        return (significant[0][0] + significant[1][0]).lower()
    if parts:
        return "".join(part[0] for part in parts[:3]).lower()
    return ""


def short_tag_matches_org(tag_org: str, full_org: str, *, full_name_hint: str = "") -> bool:
    """Whether a short seat tag (``DS``, ``NOC``, ``LY``) refers to ``full_org``."""
    if not tag_org or not full_org:
        return False
    if tag_org == full_org:
        return True
    if 3 <= len(tag_org) <= 4 and full_org.startswith(tag_org) and len(full_org) >= len(tag_org) + 2:
        return True
    initials = camel_case_initials(full_name_hint) if full_name_hint else ""
    if not initials and len(full_org) >= 4:
        # Fallback: no CamelCase hint — don't invent initials from compact form.
        initials = ""
    if initials and (tag_org == initials or initials.startswith(tag_org)):
        return True
    return False


def resolve_team_identity(*, lp_name: str = "", seat_name: str = "") -> TeamIdentity:
    """Build identity from Liquipedia name and/or aoe2cm seat (seat wins for branch)."""
    lp = (lp_name or "").strip()
    seat = (seat_name or "").strip()

    branch = team_branch_key(seat) if seat else ""
    if not branch and lp:
        branch = team_branch_key(lp)

    seat_org = team_org_base(seat) if seat else ""
    lp_org = team_org_base(lp) if lp else ""

    if seat_org and lp_org:
        if org_bases_compatible(seat_org, lp_org):
            org = seat_org if len(seat_org) >= len(lp_org) else lp_org
        elif short_tag_matches_org(seat_org, lp_org, full_name_hint=lp):
            org = lp_org
        else:
            org = seat_org or lp_org
    else:
        org = seat_org or lp_org

    return TeamIdentity(org=org, branch=branch)


def identities_match(left: TeamIdentity, right: TeamIdentity) -> bool:
    """True only when org and branch both agree (main ≠ B/L/Vanguard)."""
    if not left.org or not right.org:
        return False
    if not org_bases_compatible(left.org, right.org):
        return False
    return branches_compatible(left.branch, right.branch)


def team_names_match(left: str, right: str) -> bool:
    """Strict team identity for two labels (no cross-branch merges)."""
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
    return identities_match(resolve_team_identity(lp_name=left), resolve_team_identity(lp_name=right))


def _clean_display(name: str) -> str:
    return name.replace("_", " ").replace(".", " ").strip()


def _title_token(token: str) -> str:
    if len(token) <= 1:
        return token.upper()
    return token[:1].upper() + token[1:]


def _pretty_branch(branch: str) -> str:
    key = canonical_branch_key(branch)
    if len(key) == 1:
        return key.upper()
    return _title_token(key)


def _pretty_org_from_base(org: str, lp_hint: str = "") -> str:
    """Human org label from Liquipedia hint (branch stripped) or org base."""
    hint = _clean_display(lp_hint)
    if hint:
        tokens = _team_tokens(hint)
        if tokens and tokens[0].lower() == "team" and len(tokens) > 1:
            tokens = tokens[1:]
        branch = team_branch_key(lp_hint)
        if branch and len(tokens) >= 2:
            # Drop trailing branch token(s): "Wonders B" → "Wonders", "Darkside L" → "Darkside"
            last = compact_name(tokens[-1])
            if last == canonical_branch_key(branch) or (len(tokens[-1]) == 1 and last == branch):
                tokens = tokens[:-1]
            elif branches_compatible(compact_name(" ".join(tokens[1:])), branch):
                tokens = tokens[:1] + [t for t in tokens[1:] if _is_org_suffix_token(t)]
        if tokens:
            return " ".join(tokens)
    if not org:
        return ""
    return _title_token(org)


def team_display_label(*, lp_name: str = "", seat_name: str = "") -> str:
    """User-facing label for a match side (general; no per-team hardcodes)."""
    lp = (lp_name or "").strip()
    seat = (seat_name or "").strip()
    identity = resolve_team_identity(lp_name=lp, seat_name=seat)

    if not identity.branch:
        # Main side: prefer Liquipedia spelling, else seat.
        if lp:
            return _clean_display(lp)
        if seat:
            letter = short_roster_letter(seat)
            if letter == "a":
                return _clean_display(strip_roster_tag(seat))
            return _clean_display(seat)
        return ""

    # Branched: prefer LP when it already encodes the same branch (Wonders B, Nocturna_eSports_B).
    if lp and branches_compatible(team_branch_key(lp), identity.branch):
        return _clean_display(lp)

    # Else prefer the aoe2cm seat wording (Onimaru Vanguard, Darkside L, NOC B).
    if seat and branches_compatible(team_branch_key(seat), identity.branch):
        letter = short_roster_letter(seat)
        if letter and letter != "a":
            parent = strip_roster_tag(seat)
            org = _pretty_org_from_base(identity.org, lp) or parent
            return f"{org} {letter.upper()}".strip()
        return _clean_display(seat.replace(".", " "))

    org = _pretty_org_from_base(identity.org, lp)
    return f"{org} {_pretty_branch(identity.branch)}".strip()


def seat_maps_to_opponent(seat: str, lp_name: str) -> bool:
    """Whether an aoe2cm seat can be assigned onto a Liquipedia opponent slot.

    Unbranched LP umbrellas accept any seat from the same org (so ``Onimaru Vanguard``
    maps onto ``Onimaru_Esports``). Branched LP names only accept matching branches.
    """
    seat_label = (seat or "").strip()
    lp = (lp_name or "").strip()
    if not seat_label or not lp:
        return False

    seat_id = resolve_team_identity(seat_name=seat_label, lp_name=lp)
    lp_id = resolve_team_identity(lp_name=lp)
    if not seat_id.org or not lp_id.org:
        return False
    if not org_bases_compatible(seat_id.org, lp_id.org):
        return False
    if lp_id.branch:
        return branches_compatible(seat_id.branch, lp_id.branch)
    return True


def draft_label_matches_team(label: str, team_name: str) -> bool:
    """Match an aoe2cm host/guest label to the selected analysis team."""
    label_id = resolve_team_identity(lp_name=label, seat_name=label)
    team_id = resolve_team_identity(lp_name=team_name, seat_name=team_name)
    if identities_match(label_id, team_id):
        return True
    if not branches_compatible(label_id.branch, team_id.branch):
        return False
    # Short tags (DS, NOC) against a full team selection.
    return seat_maps_to_opponent(label, team_name) and branches_compatible(
        team_branch_key(label), team_id.branch
    )


def draft_seat_matches(seat: str, org_name: str) -> bool:
    """True when seat and org refer to the **same** team identity (branch-aware).

    Branched seats do **not** match unbranched org names (``Darkside L`` ≠ ``DarkSidE``).
    For assigning seats onto Liquipedia umbrella slots during sync, use
    :func:`seat_maps_to_opponent` instead.
    """
    return identities_match(
        resolve_team_identity(seat_name=seat, lp_name=org_name),
        resolve_team_identity(lp_name=org_name),
    )


# Backwards-compatible alias used by older call sites / tests.
def roster_display_name(seat: str, lp_fallback: str = "") -> str:
    return team_display_label(lp_name=lp_fallback, seat_name=seat)
