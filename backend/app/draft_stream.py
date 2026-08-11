"""Persistent aoe2cm Socket.IO subscriptions shared across WebSocket clients."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from typing import TYPE_CHECKING

import socketio

from .aoe2cm import AOE2CM_ORIGIN, _normalize_draft_payload, apply_player_event, extract_draft_id

if TYPE_CHECKING:
    from asyncio import AbstractEventLoop, Queue

logger = logging.getLogger(__name__)

_subscriptions: dict[str, DraftStreamSubscription] = {}
_sub_lock = threading.Lock()


def _safe_put(queue: Queue[str], message: str) -> None:
    try:
        queue.put_nowait(message)
    except asyncio.QueueFull:
        pass


class DraftStreamSubscription:
    def __init__(self, draft_id: str) -> None:
        self.draft_id = draft_id
        self._listeners: set[tuple[Queue[str], AbstractEventLoop]] = set()
        self._listeners_lock = threading.Lock()
        self._sio: socketio.Client | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.latest: dict | None = None

    def add_listener(self, queue: Queue[str], loop: AbstractEventLoop) -> None:
        with self._listeners_lock:
            self._listeners.add((queue, loop))
            latest = self.latest
            needs_thread = self._thread is None or not self._thread.is_alive()
            if needs_thread:
                self._start_socket_thread()

        if latest is not None:
            loop.call_soon_threadsafe(_safe_put, queue, json.dumps(latest))

    def remove_listener(self, queue: Queue[str]) -> None:
        with self._listeners_lock:
            self._listeners = {(q, loop) for q, loop in self._listeners if q is not queue}
            empty = not self._listeners
        if empty:
            self._stop_socket()
            with _sub_lock:
                if _subscriptions.get(self.draft_id) is self:
                    del _subscriptions[self.draft_id]

    def _broadcast(self, data: dict) -> None:
        normalized = _normalize_draft_payload(data)
        self.latest = normalized
        message = json.dumps(normalized)
        with self._listeners_lock:
            listeners = list(self._listeners)
        for queue, loop in listeners:
            loop.call_soon_threadsafe(_safe_put, queue, message)

    def _start_socket_thread(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run_socket,
            name=f"aoe2cm-stream-{self.draft_id}",
            daemon=True,
        )
        self._thread.start()

    def _run_socket(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            with self._listeners_lock:
                if not self._listeners:
                    break

            sio = socketio.Client(reconnection=False, logger=False, engineio_logger=False)
            self._sio = sio

            @sio.on("draft_state")
            def on_state(data: dict) -> None:
                self._broadcast(data)

            @sio.on("replay")
            def on_replay(data: dict) -> None:
                self._broadcast(data)

            @sio.on("playerEvent")
            def on_player_event(data: dict) -> None:
                if not isinstance(data, dict) or self.latest is None:
                    return
                self._broadcast(apply_player_event(self.latest, data))

            @sio.on("message")
            def on_message(data: str) -> None:
                logger.warning("aoe2cm message for draft %s: %s", self.draft_id, data)

            try:
                sio.connect(
                    f"{AOE2CM_ORIGIN}?draftId={self.draft_id}",
                    transports=["polling", "websocket"],
                    wait_timeout=25,
                    headers={
                        "Origin": AOE2CM_ORIGIN,
                        "User-Agent": "AoE-Draft-Assistant/1.0",
                    },
                )
                logger.info("aoe2cm socket connected for draft %s", self.draft_id)
                backoff = 1.0

                while not self._stop.is_set() and sio.connected:
                    self._stop.wait(timeout=0.5)

            except Exception:
                logger.exception("aoe2cm socket error for draft %s", self.draft_id)
            finally:
                if sio.connected:
                    try:
                        sio.disconnect()
                    except Exception:
                        pass
                self._sio = None

            if self._stop.is_set():
                break

            with self._listeners_lock:
                still_has_listeners = bool(self._listeners)
            if not still_has_listeners:
                break

            logger.info("reconnecting aoe2cm socket for draft %s in %.1fs", self.draft_id, backoff)
            self._stop.wait(timeout=backoff)
            backoff = min(backoff * 2, 15.0)

    def _stop_socket(self) -> None:
        self._stop.set()
        if self._sio and self._sio.connected:
            try:
                self._sio.disconnect()
            except Exception:
                pass


def get_subscription(draft_id: str) -> DraftStreamSubscription:
    draft_id = extract_draft_id(draft_id)
    with _sub_lock:
        sub = _subscriptions.get(draft_id)
        if sub is None:
            sub = DraftStreamSubscription(draft_id)
            _subscriptions[draft_id] = sub
        return sub
