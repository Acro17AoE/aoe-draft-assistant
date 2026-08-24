"""Parse Age of Empires II DE replay files in memory (no persistence)."""

from __future__ import annotations

import json
import pkgutil
import re
import struct
import zlib
from collections import defaultdict
from importlib import metadata
from io import BytesIO
from typing import Any

from mgz import fast
from mgz.fast.header import decompress, parse as parse_header
from mgz.fast.header import parse_de, parse_version
from mgz.model import parse_match
from mgz.reference import get_consts, get_dataset
from mgz.util import Version

from .name_utils import names_match

# Dataset / parser spellings → canonical civ names used in the app.
CIV_NAME_ALIASES: dict[str, str] = {
    "maya": "Mayans",
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
}

MAX_REPLAY_BYTES = 20 * 1024 * 1024
MIN_REPLAY_BYTES = 256
VALID_EXTENSIONS = (".aoe2record", ".mgz", ".mgx", ".mgl")
ZLIB_WBITS = -15
DE_STRING_MAGIC = b"\x60\x0a"

_MAP_PATTERNS = (
    re.compile(r"Location:\s*([^\n\r]+)", re.IGNORECASE),
    re.compile(r"Karte:\s*([^\n\r]+)", re.IGNORECASE),
    re.compile(r"Map Name:\s*([^\n\r]+)", re.IGNORECASE),
    re.compile(r"Map:\s*([^\n\r]+)", re.IGNORECASE),
)


def get_replay_parser_info() -> dict[str, str]:
    info: dict[str, str] = {}
    for package in ("mgz", "construct", "aocref"):
        try:
            info[package] = metadata.version(package)
        except metadata.PackageNotFoundError:
            info[package] = "missing"
    return info


def _normalize_map_name(raw: str | None) -> str:
    if not raw:
        return ""
    text = raw.strip()
    if "\x00" in text:
        text = text.split("\x00", 1)[0].strip()
    if not text or not all(ch.isprintable() or ch.isspace() for ch in text):
        return ""
    if text.lower().endswith(".rms"):
        text = text[:-4]
    return text


def _map_from_instructions(instructions: bytes | str | None) -> str:
    if not instructions:
        return ""
    if isinstance(instructions, bytes):
        text = instructions.decode("utf-8", errors="ignore")
    else:
        text = instructions
    for pattern in _MAP_PATTERNS:
        match = pattern.search(text)
        if match:
            map_name = _normalize_map_name(match.group(1))
            if map_name:
                return map_name
    return ""


def _format_parse_error(exc: Exception) -> str:
    messages: list[str] = []
    current: BaseException | None = exc
    while current is not None:
        text = str(current).strip()
        if text and text not in messages:
            messages.append(text)
        elif not text and current.__class__.__name__ not in messages:
            messages.append(current.__class__.__name__)
        current = current.__cause__ or current.__context__
    if messages:
        return " → ".join(messages)
    return exc.__class__.__name__


def _diagnose_content(content: bytes, *, expected_size: int | None = None) -> str:
    if expected_size is not None and expected_size > 0 and len(content) != expected_size:
        return (
            f"upload size mismatch (browser sent {expected_size} bytes, "
            f"server received {len(content)} bytes)"
        )
    if not content:
        return "server received 0 bytes — replay upload did not reach the API"
    sniff = content[:32].lstrip()
    if sniff.startswith(b"<!DOCTYPE") or sniff.startswith(b"<html") or sniff.startswith(b"<"):
        return "server received HTML instead of a replay (proxy or API routing issue)"
    if sniff.startswith(b"{") or sniff.startswith(b"["):
        return "server received JSON instead of a replay"
    if content[:2] == b"PK":
        return "server received a ZIP archive — extract the .aoe2record file first"
    return f"server received {len(content)} bytes (header {content[:4].hex()})"


def _player_payload(name: str, civ: str, won: bool) -> dict[str, Any]:
    return {"name": name.strip(), "civ": _normalize_civ_name(civ), "won": won}


def _normalize_civ_name(raw: str) -> str:
    text = raw.strip()
    if not text:
        return ""
    slug = re.sub(r"[^a-z0-9]+", "", text.lower())
    return CIV_NAME_ALIASES.get(slug, text)


def _civ_name(dataset: dict[str, Any], civilization_id: int | str) -> str:
    civ = dataset.get("civilizations", {}).get(str(civilization_id))
    if isinstance(civ, dict):
        return _normalize_civ_name(str(civ.get("name") or ""))
    return ""


def _decode_name(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, bytes):
        name = raw.decode("utf-8", errors="ignore").strip()
    else:
        name = str(raw).strip()
    # DE lobby names sometimes use acute accents / curly quotes as apostrophes.
    return (
        name.replace("\u00b4", "'")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u02bc", "'")
    )


def _validation_quality(result: dict[str, Any]) -> tuple[int, int, int, int]:
    """Lower tuple = better candidate when choosing among failed/successful parses."""
    teams = result.get("teams") or []
    sizes = [len(team.get("members") or []) for team in teams]
    total_players = sum(sizes)
    named_civs = sum(
        1
        for team in teams
        for member in team.get("members") or []
        if str(member.get("civ") or "").strip()
    )
    if result.get("error") is None:
        return (0, -total_players, -named_civs, 0)

    error = str(result.get("error") or "")
    balanced_two = len(sizes) == 2 and sizes[0] == sizes[1] and sizes[0] > 0
    if balanced_two and "expects" in error and "players per side" in error:
        return (1, -sizes[0], -named_civs, 0)
    if "different player counts" in error:
        imbalance = abs(sizes[0] - sizes[1]) if len(sizes) == 2 else 9
        # Strongly prefer balanced team splits over uneven binary scans.
        return (5, -total_players, -named_civs, imbalance)
    if "Expected 2 teams" in error:
        return (3, -total_players, -named_civs, abs(len(sizes) - 2))
    return (4, -total_players, -named_civs, 0)


def _is_human_lobby_name(name: str) -> bool:
    cleaned = name.strip()
    if len(cleaned) < 2:
        return False
    if cleaned.lower() in {"gaia", "open", "closed", "player"}:
        return False
    # Reject mostly-control / replacement-character garbage from bad scans.
    if cleaned.count("\ufffd") > 0:
        return False
    printable = sum(1 for ch in cleaned if ch.isprintable())
    return printable >= max(2, len(cleaned) - 1)


def _merge_de_player_lists(*sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge DE lobby players by slot number, preferring complete team/civ metadata."""
    merged: dict[int, dict[str, Any]] = {}
    for source in sources:
        for player in source:
            if not isinstance(player, dict):
                continue
            number = int(player.get("number", -1))
            if not 1 <= number <= 8:
                continue
            name = _decode_name(player.get("name"))
            if not _is_human_lobby_name(name):
                continue
            team_id = int(player.get("team_id") or 0)
            civ_id = player.get("civilization_id", "")
            try:
                civ_id_int = int(civ_id) if civ_id not in ("", None) else 0
            except (TypeError, ValueError):
                civ_id_int = 0

            existing = merged.get(number)
            if existing is None:
                merged[number] = {
                    "number": number,
                    "name": name,
                    "team_id": team_id,
                    "civilization_id": civ_id_int or civ_id,
                }
                continue

            if len(name) > len(str(existing.get("name") or "")):
                existing["name"] = name
            existing_team = int(existing.get("team_id") or 0)
            if team_id > 1 and existing_team <= 1:
                existing["team_id"] = team_id
            elif team_id > 1:
                existing["team_id"] = team_id
            # Later parser passes (lightweight/header) override binary civ guesses.
            if civ_id_int > 0:
                existing["civilization_id"] = civ_id_int

    return [merged[number] for number in sorted(merged)]


def _teams_from_match(match: Any) -> list[dict[str, Any]]:
    teams: list[dict[str, Any]] = []
    for team_players in getattr(match, "teams", None) or []:
        members = [
            _player_payload(
                _decode_name(getattr(player, "name", "")),
                str(getattr(player, "civilization", "") or ""),
                bool(getattr(player, "winner", False)),
            )
            for player in team_players
            if _is_human_lobby_name(_decode_name(getattr(player, "name", "")))
        ]
        if members:
            teams.append({"members": members, "won": any(member["won"] for member in members)})
    return teams


def _resigned_player_numbers(content: bytes, *, body_pos: int | None = None) -> set[int]:
    resigned: set[int] = set()
    handle = BytesIO(content)
    if body_pos is None:
        try:
            parse_header(handle)
        except Exception:
            return resigned
        body_pos = handle.tell() - 4

    handle.seek(body_pos)
    try:
        fast.meta(handle)
    except Exception:
        return resigned

    while True:
        try:
            op_type, op_data = fast.operation(handle)
        except EOFError:
            break
        except Exception:
            break
        if op_type is not fast.Operation.ACTION:
            continue
        action_type, action_data = op_data
        if action_type is fast.Action.RESIGN and isinstance(action_data, dict):
            player_id = action_data.get("player_id")
            if isinstance(player_id, int):
                resigned.add(player_id)
    return resigned


def _decompress_header_bytes(content: bytes) -> bytes:
    handle = BytesIO(content)
    prefix_size = 8
    header_len, _chapter_address = struct.unpack("<II", handle.read(prefix_size))
    zlib_header = handle.read(header_len - prefix_size)
    return zlib.decompress(zlib_header, wbits=ZLIB_WBITS)


def _body_offset_after_header_prefix(content: bytes) -> int | None:
    handle = BytesIO(content)
    prefix_size = 8
    header_len, _chapter_address = struct.unpack("<II", handle.read(prefix_size))
    handle.read(header_len - prefix_size)
    handle.read(4)  # log version
    return handle.tell() - 4


def _read_de_string(buf: bytes, pos: int) -> tuple[str | None, int]:
    if buf[pos : pos + 2] != DE_STRING_MAGIC:
        return None, pos + 1
    if pos + 4 > len(buf):
        return None, pos + 1
    length = struct.unpack_from("<h", buf, pos + 2)[0]
    if length < 1 or pos + 4 + length > len(buf):
        return None, pos + 1
    text = buf[pos + 4 : pos + 4 + length].split(b"\x00", 1)[0]
    try:
        name = text.decode("utf-8")
    except UnicodeDecodeError:
        try:
            name = text.decode("latin-1")
        except UnicodeDecodeError:
            return None, pos + 1
    return _decode_name(name) or None, pos + 4 + length


def _guess_team_and_civ(window: bytes) -> tuple[int | None, int | None]:
    team_id: int | None = None
    civilization_id: int | None = None
    if len(window) < 15:
        return None, None
    for offset in range(len(window) - 14, 5, -1):
        candidate_team = window[offset]
        if not 1 <= candidate_team <= 8:
            continue
        candidate_civ = struct.unpack_from("<I", window, offset + 10)[0]
        if 1 <= candidate_civ <= 80:
            team_id = candidate_team
            civilization_id = candidate_civ
            break
    return team_id, civilization_id


def _scan_de_players_from_header(decompressed: bytes) -> list[dict[str, Any]]:
    players: dict[int, dict[str, Any]] = {}
    pos = 0
    limit = len(decompressed) - 20
    while pos < limit:
        if decompressed[pos : pos + 2] != DE_STRING_MAGIC:
            pos += 1
            continue

        name, next_pos = _read_de_string(decompressed, pos)
        if not name or not _is_human_lobby_name(name):
            pos += 1
            continue

        cursor = next_pos
        duplicate_name, after_duplicate = _read_de_string(decompressed, cursor)
        if duplicate_name == name:
            cursor = after_duplicate

        if cursor + 16 > len(decompressed):
            pos += 1
            continue

        player_type = struct.unpack_from("<I", decompressed, cursor)[0]
        player_number = struct.unpack_from("<i", decompressed, cursor + 12)[0]
        if player_type != 2 or not 1 <= player_number <= 8:
            pos += 1
            continue

        # Look farther back — special-character names shift nearby fields.
        lookback = decompressed[max(0, pos - 96) : pos]
        team_id, civilization_id = _guess_team_and_civ(lookback)
        # Some layouts place civ/team markers after the name block.
        if team_id is None or civilization_id is None:
            lookahead = decompressed[cursor : min(len(decompressed), cursor + 64)]
            team_id2, civilization_id2 = _guess_team_and_civ(lookahead)
            team_id = team_id or team_id2
            civilization_id = civilization_id or civilization_id2

        existing = players.get(player_number)
        candidate = {
            "number": player_number,
            "name": name,
            "team_id": int(team_id or 0),
            "civilization_id": int(civilization_id or 0),
        }
        if existing is None:
            players[player_number] = candidate
        else:
            # Keep the richest record if the same slot is scanned twice.
            players[player_number] = _merge_de_player_lists([existing], [candidate])[0]
        pos = cursor + 16

    return [players[number] for number in sorted(players)]


def _load_de_dataset(mod: Any = "") -> dict[str, Any]:
    try:
        _dataset_id, dataset = get_dataset(Version.DE, mod)
        if isinstance(dataset, dict):
            return dataset
    except Exception:
        pass

    try:
        raw = pkgutil.get_data("aocref", "data/datasets/100.json")
        if raw:
            loaded = json.loads(raw)
            if isinstance(loaded, dict):
                return loaded
    except Exception:
        pass
    return {}


def _try_binary_de_parse(content: bytes) -> tuple[dict[str, Any] | None, str | None]:
    """Stdlib-only DE parse: zlib header decompress + lobby player scan."""
    try:
        decompressed = _decompress_header_bytes(content)
    except Exception as exc:
        return None, f"binary decompress failed: {_format_parse_error(exc)}"

    de_players = _scan_de_players_from_header(decompressed)
    if len(de_players) < 2:
        return None, f"binary player scan found {len(de_players)} players"

    map_name = _map_from_decompressed_bytes(decompressed)
    body_pos = _body_offset_after_header_prefix(content)
    resigned: set[int] = set()
    if body_pos is not None:
        try:
            resigned = _resigned_player_numbers(content, body_pos=body_pos)
        except Exception:
            resigned = set()

    dataset = _load_de_dataset()
    teams = _teams_from_de_players(de_players, dataset, resigned)
    if not teams:
        return None, "No teams built from binary player scan"

    return {
        "map": map_name,
        "teams": teams,
        "players": de_players,
        "resigned": resigned,
        "parser": "binary-de",
    }, None


def _map_from_decompressed_bytes(decompressed: bytes) -> str:
    return _map_from_instructions(decompressed)


def _teams_from_de_players(
    de_players: list[dict[str, Any]],
    dataset: dict[str, Any],
    resigned: set[int],
) -> list[dict[str, Any]]:
    players = [
        player
        for player in de_players
        if isinstance(player, dict)
        and int(player.get("number", -1)) > 0
        and _is_human_lobby_name(_decode_name(player.get("name")))
    ]
    if not players:
        return []

    def build(by_team: dict[int, list[tuple[int, dict[str, Any]]]]) -> list[dict[str, Any]]:
        teams: list[dict[str, Any]] = []
        for members_numbered in by_team.values():
            numbers = [number for number, _ in members_numbered]
            team_won = bool(resigned) and not any(number in resigned for number in numbers)
            members = [{**member, "won": team_won} for _number, member in members_numbered]
            teams.append({"members": members, "won": team_won})
        teams.sort(key=lambda team: min((member["name"] for member in team["members"]), default=""))
        return teams

    # Prefer explicit lobby teams (team_id > 1). Solo buckets are a fallback for FFA/random.
    explicit: dict[int, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    solo: dict[int, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    for player in players:
        number = int(player["number"])
        team_id = int(player.get("team_id") or 0)
        civ = _civ_name(dataset, player.get("civilization_id", ""))
        payload = (
            number,
            _player_payload(_decode_name(player.get("name")), civ, False),
        )
        if team_id > 1:
            explicit[team_id].append(payload)
        else:
            solo[number + 9].append(payload)

    if len(explicit) >= 2:
        teams = build(explicit)
        sizes = [len(team["members"]) for team in teams]
        if len(teams) == 2 and sizes[0] == sizes[1]:
            return teams
        # If explicit teams are uneven, still prefer them over solo-splitting everyone.
        if len(teams) == 2:
            return teams

    combined = defaultdict(list)
    for team_id, members in explicit.items():
        combined[team_id].extend(members)
    for team_id, members in solo.items():
        combined[team_id].extend(members)
    return build(combined)


def _try_lightweight_de_parse(content: bytes) -> tuple[dict[str, Any] | None, str | None]:
    """Parse DE replays via decompress + parse_de only (skips heavy parse_players)."""
    handle = BytesIO(content)
    header_io = decompress(handle)
    version, _game, _save, _log = parse_version(header_io, handle)
    if version is not Version.DE:
        return None, None

    de = parse_de(header_io, version, _save)
    de_players = de.get("players") if isinstance(de, dict) else None
    if not isinstance(de_players, list) or not de_players:
        return None, "No DE players in lightweight parse"

    map_name = _map_from_decompressed_bytes(header_io.getvalue())
    body_pos = handle.tell() - 4
    resigned = _resigned_player_numbers(content, body_pos=body_pos)
    _dataset_id, dataset = get_dataset(version, de.get("mod"))
    teams = _teams_from_de_players(de_players, dataset, resigned)
    if not teams:
        return None, "No teams built from DE players"

    return {
        "map": map_name,
        "teams": teams,
        "players": de_players,
        "resigned": resigned,
        "save_version": _save,
        "parser": "lightweight-de",
    }, None


def _teams_from_header(content: bytes, header: dict[str, Any]) -> list[dict[str, Any]]:
    de = header.get("de") or {}
    de_players = [
        player
        for player in de.get("players", [])
        if isinstance(player, dict)
        and int(player.get("number", -1)) > 0
        and _is_human_lobby_name(_decode_name(player.get("name")))
    ]
    if not de_players:
        return []

    _dataset_id, dataset = get_dataset(header.get("version"), header.get("mod"))
    resigned = _resigned_player_numbers(content)
    return _teams_from_de_players(de_players, dataset, resigned)


def _header_de_players(header: dict[str, Any]) -> list[dict[str, Any]]:
    de = header.get("de") or {}
    return [
        player
        for player in de.get("players", [])
        if isinstance(player, dict) and int(player.get("number", -1)) > 0
    ]


def _validate_teams(
    teams: list[dict[str, Any]],
    map_name: str,
    filename: str,
    *,
    expected_per_side: int | None,
    bytes_received: int,
    expected_bytes: int | None,
) -> dict[str, Any]:
    base = {
        "fileName": filename,
        "bytesReceived": bytes_received,
        "expectedBytes": expected_bytes,
    }

    if len(teams) != 2:
        sizes = ", ".join(str(len(team.get("members", []))) for team in teams) or "none"
        return {
            **base,
            "error": f"Expected 2 teams, found {len(teams)} (sizes: {sizes})",
            "map": map_name,
            "playersPerSide": 0,
            "teams": teams,
        }

    per_side_a = len(teams[0]["members"])
    per_side_b = len(teams[1]["members"])
    if per_side_a != per_side_b:
        return {
            **base,
            "error": f"Teams have different player counts ({per_side_a} vs {per_side_b})",
            "map": map_name,
            "playersPerSide": 0,
            "teams": teams,
        }

    per_side = per_side_a
    if expected_per_side is not None and per_side != expected_per_side:
        return {
            **base,
            "error": (
                f"Tournament format expects {expected_per_side} players per side, "
                f"but replay has {per_side}. Check tournament format or pick other replays."
            ),
            "map": map_name,
            "playersPerSide": per_side,
            "teams": teams,
        }

    return {
        **base,
        "error": None,
        "map": map_name,
        "playersPerSide": per_side,
        "teams": teams,
    }


def _invalid_file_result(
    filename: str,
    error: str,
    *,
    bytes_received: int = 0,
    expected_bytes: int | None = None,
) -> dict[str, Any]:
    return {
        "fileName": filename,
        "error": error,
        "map": "",
        "playersPerSide": 0,
        "teams": [],
        "bytesReceived": bytes_received,
        "expectedBytes": expected_bytes,
    }


def parse_replay_bytes(
    content: bytes,
    filename: str,
    *,
    expected_per_side: int | None = None,
    expected_bytes: int | None = None,
) -> dict[str, Any]:
    bytes_received = len(content)
    lowered = filename.lower()
    if not any(lowered.endswith(ext) for ext in VALID_EXTENSIONS):
        return _invalid_file_result(
            filename,
            "Unsupported file type — use .aoe2record",
            bytes_received=bytes_received,
            expected_bytes=expected_bytes,
        )

    if bytes_received < MIN_REPLAY_BYTES:
        detail = _diagnose_content(content, expected_size=expected_bytes)
        return _invalid_file_result(
            filename,
            f"Uploaded file is empty or incomplete — {detail}",
            bytes_received=bytes_received,
            expected_bytes=expected_bytes,
        )

    if content[:2] == b"PK":
        return _invalid_file_result(
            filename,
            "This looks like a ZIP archive. Extract the .aoe2record files first",
            bytes_received=bytes_received,
            expected_bytes=expected_bytes,
        )

    if bytes_received > MAX_REPLAY_BYTES:
        return _invalid_file_result(
            filename,
            f"Replay too large (max {MAX_REPLAY_BYTES // (1024 * 1024)} MB)",
            bytes_received=bytes_received,
            expected_bytes=expected_bytes,
        )

    header_error: str | None = None
    model_error: str | None = None
    lightweight_error: str | None = None
    binary_error: str | None = None
    candidates: list[dict[str, Any]] = []
    player_sources: list[list[dict[str, Any]]] = []
    map_candidates: list[str] = []
    resigned_sets: list[set[int]] = []

    def _consider(result: dict[str, Any]) -> None:
        candidates.append(result)

    def _note_players(players: list[dict[str, Any]] | None, map_name: str = "", resigned: set[int] | None = None) -> None:
        if players:
            player_sources.append(players)
        if map_name:
            map_candidates.append(map_name)
        if resigned:
            resigned_sets.append(resigned)

    # Try multiple parsers and keep the best balanced result.
    # Binary scan is fast but can drop lobby names with special characters.
    try:
        binary, binary_error = _try_binary_de_parse(content)
        if binary:
            _note_players(
                binary.get("players") or [],
                str(binary.get("map") or ""),
                set(binary.get("resigned") or set()),
            )
            if binary.get("teams"):
                _consider(
                    _validate_teams(
                        binary["teams"],
                        str(binary.get("map") or ""),
                        filename,
                        expected_per_side=expected_per_side,
                        bytes_received=bytes_received,
                        expected_bytes=expected_bytes,
                    )
                )
    except Exception as exc:
        binary_error = _format_parse_error(exc)

    try:
        lightweight, lightweight_error = _try_lightweight_de_parse(content)
        if lightweight:
            _note_players(
                lightweight.get("players") or [],
                str(lightweight.get("map") or ""),
                set(lightweight.get("resigned") or set()),
            )
            if lightweight.get("teams"):
                _consider(
                    _validate_teams(
                        lightweight["teams"],
                        str(lightweight.get("map") or ""),
                        filename,
                        expected_per_side=expected_per_side,
                        bytes_received=bytes_received,
                        expected_bytes=expected_bytes,
                    )
                )
    except Exception as exc:
        lightweight_error = _format_parse_error(exc)

    try:
        header = parse_header(BytesIO(content))
        map_name = _map_from_instructions((header.get("scenario") or {}).get("instructions"))
        if not map_name:
            map_name = _normalize_map_name(str((header.get("scenario") or {}).get("map_id") or ""))
        header_players = _header_de_players(header)
        _note_players(header_players, map_name)
        teams = _teams_from_header(content, header)
        if teams:
            _consider(
                _validate_teams(
                    teams,
                    map_name,
                    filename,
                    expected_per_side=expected_per_side,
                    bytes_received=bytes_received,
                    expected_bytes=expected_bytes,
                )
            )
        else:
            header_error = "No player teams found in replay header"
    except Exception as exc:
        header_error = _format_parse_error(exc)

    try:
        match = parse_match(BytesIO(content))
        map_name = _normalize_map_name(getattr(getattr(match, "map", None), "name", None))
        if map_name:
            map_candidates.append(map_name)
        teams = _teams_from_match(match)
        if teams:
            _consider(
                _validate_teams(
                    teams,
                    map_name,
                    filename,
                    expected_per_side=expected_per_side,
                    bytes_received=bytes_received,
                    expected_bytes=expected_bytes,
                )
            )
        else:
            model_error = "No player teams found in replay"
    except Exception as exc:
        model_error = _format_parse_error(exc)

    # Cross-parser merge: fill missing slots/team ids from any successful source.
    if player_sources:
        try:
            merged_players = _merge_de_player_lists(*player_sources)
            resigned: set[int] = set()
            for item in resigned_sets:
                resigned |= item
            if not resigned:
                try:
                    resigned = _resigned_player_numbers(content)
                except Exception:
                    resigned = set()
            dataset = _load_de_dataset()
            merged_teams = _teams_from_de_players(merged_players, dataset, resigned)
            if merged_teams:
                merged_map = next((name for name in map_candidates if name), "")
                _consider(
                    _validate_teams(
                        merged_teams,
                        merged_map,
                        filename,
                        expected_per_side=expected_per_side,
                        bytes_received=bytes_received,
                        expected_bytes=expected_bytes,
                    )
                )
        except Exception:
            pass

    if candidates:
        successes = [item for item in candidates if item.get("error") is None]
        pool = successes or candidates
        return min(pool, key=_validation_quality)

    detail_parts = [
        part
        for part in (binary_error, lightweight_error, header_error, model_error)
        if part
    ]
    detail = "; ".join(detail_parts) if detail_parts else "unknown parse failure"
    detail = f"{detail}. {_diagnose_content(content, expected_size=expected_bytes)}"

    return _invalid_file_result(
        filename,
        f"Could not parse replay: {detail}",
        bytes_received=bytes_received,
        expected_bytes=expected_bytes,
    )


def find_your_team_index(teams: list[dict[str, Any]], your_name: str) -> int | None:
    trimmed = your_name.strip()
    if not trimmed:
        return None
    for index, team in enumerate(teams):
        for member in team.get("members", []):
            if names_match(str(member.get("name", "")), trimmed):
                return index
    return None
