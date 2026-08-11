import asyncio
import re
import threading
import time
from dataclasses import dataclass

import httpx
import socketio

AOE2CM_BASE = "https://aoe2cm.net/api"
AOE2CM_ORIGIN = "https://aoe2cm.net"
CACHE_TTL_SECONDS = 3600.0
SOCKET_RETRIES = 3

DRAFT_ID_PATTERN = re.compile(r"/draft/([^/?#]+)")
PRESET_ID_PATTERN = re.compile(r"/preset/([^/?#]+)")


@dataclass
class _CacheEntry:
    data: dict
    expires_at: float


_draft_cache: dict[str, _CacheEntry] = {}
_preset_cache: dict[str, _CacheEntry] = {}
_cache_lock = threading.Lock()
_socket_lock = threading.Lock()


def extract_draft_id(url_or_id: str) -> str:
    text = url_or_id.strip()
    match = DRAFT_ID_PATTERN.search(text)
    if match:
        return match.group(1)
    return text


def extract_preset_id(url_or_id: str) -> str:
    text = url_or_id.strip()
    match = PRESET_ID_PATTERN.search(text)
    if match:
        return match.group(1)
    return text


def _normalize_draft_payload(data: dict) -> dict:
    payload = dict(data)
    payload.pop("yourPlayerType", None)
    return payload


def apply_player_event(draft: dict, event: dict) -> dict:
    """Merge a live playerEvent from aoe2cm into the current draft snapshot."""
    updated = dict(draft)
    events = list(updated.get("events") or [])

    offset = event.get("offset")
    if offset is not None and any(item.get("offset") == offset for item in events):
        return _normalize_draft_payload(updated)

    events.append(event)
    updated["events"] = events
    updated["nextAction"] = len(events)
    return _normalize_draft_payload(updated)


def _cache_get(draft_id: str) -> dict | None:
    with _cache_lock:
        entry = _draft_cache.get(draft_id)
        if entry and entry.expires_at > time.time():
            return entry.data
    return None


def _cache_set(draft_id: str, data: dict) -> None:
    with _cache_lock:
        _draft_cache[draft_id] = _CacheEntry(
            data=data,
            expires_at=time.time() + CACHE_TTL_SECONDS,
        )


def _preset_cache_get(preset_id: str) -> dict | None:
    with _cache_lock:
        entry = _preset_cache.get(preset_id)
        if entry and entry.expires_at > time.time():
            return entry.data
    return None


def _preset_cache_set(preset_id: str, data: dict) -> None:
    with _cache_lock:
        _preset_cache[preset_id] = _CacheEntry(
            data=data,
            expires_at=time.time() + CACHE_TTL_SECONDS,
        )


def _fetch_ongoing_once(draft_id: str) -> dict:
    received: dict[str, dict] = {}
    error_message: dict[str, str] = {}
    done = threading.Event()

    sio = socketio.Client(reconnection=False, logger=False, engineio_logger=False)

    @sio.on("draft_state")
    def on_state(data: dict) -> None:
        received["data"] = data
        done.set()

    @sio.on("replay")
    def on_replay(data: dict) -> None:
        received["data"] = data
        done.set()

    @sio.on("message")
    def on_message(data: str) -> None:
        error_message["text"] = data
        done.set()

    try:
        sio.connect(
            f"{AOE2CM_ORIGIN}?draftId={draft_id}",
            transports=["polling", "websocket"],
            wait_timeout=25,
            headers={
                "Origin": AOE2CM_ORIGIN,
                "User-Agent": "AoE-Draft-Assistant/1.0",
            },
        )
        if not done.wait(timeout=25):
            raise ValueError(f"Timeout loading ongoing draft '{draft_id}'.")
        if "data" not in received:
            detail = error_message.get("text", "Draft does not exist or is not public.")
            raise ValueError(f"Draft '{draft_id}': {detail}")
        return _normalize_draft_payload(received["data"])
    finally:
        if sio.connected:
            sio.disconnect()


def fetch_ongoing_draft_via_socket(draft_id: str) -> dict:
    cached = _cache_get(draft_id)
    if cached is not None:
        return cached

    last_error: Exception | None = None
    with _socket_lock:
        cached = _cache_get(draft_id)
        if cached is not None:
            return cached

        for attempt in range(SOCKET_RETRIES):
            try:
                data = _fetch_ongoing_once(draft_id)
                _cache_set(draft_id, data)
                return data
            except Exception as exc:
                last_error = exc
                if attempt + 1 < SOCKET_RETRIES:
                    time.sleep(0.4 * (attempt + 1))

    raise ValueError(
        f"Failed to load ongoing draft '{draft_id}': {last_error}"
    ) from last_error


async def fetch_draft(draft_id: str, *, use_cache: bool = True) -> dict:
    draft_id = extract_draft_id(draft_id)

    if use_cache:
        cached = _cache_get(draft_id)
        if cached is not None:
            return cached

    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.get(f"{AOE2CM_BASE}/draft/{draft_id}")
        if response.status_code == 200:
            data = response.json()
            _cache_set(draft_id, data)
            return data
        if response.status_code == 404:
            data = await asyncio.to_thread(fetch_ongoing_draft_via_socket, draft_id)
            return data
        response.raise_for_status()
        return response.json()


async def fetch_preset(preset_id: str, *, use_cache: bool = True) -> dict:
    """Fetch an aoe2cm map/civ draft preset (e.g. /preset/EivsT)."""
    preset_id = extract_preset_id(preset_id)
    if not preset_id:
        raise ValueError("Preset id is empty.")

    if use_cache:
        cached = _preset_cache_get(preset_id)
        if cached is not None:
            return cached

    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.get(f"{AOE2CM_BASE}/preset/{preset_id}")
        if response.status_code == 404:
            raise ValueError(f"Preset '{preset_id}' was not found on aoe2cm.net.")
        response.raise_for_status()
        data = response.json()
        _preset_cache_set(preset_id, data)
        return data
