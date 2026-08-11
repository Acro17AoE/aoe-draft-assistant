"""In-memory workspace document broadcast for connected WebSocket clients."""

from __future__ import annotations

import asyncio
import json
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from asyncio import AbstractEventLoop, Queue

_subscriptions: dict[str, WorkspaceSubscription] = {}
_sub_lock = threading.Lock()


def _safe_put(queue: Queue[str], message: str) -> None:
    try:
        queue.put_nowait(message)
    except asyncio.QueueFull:
        pass


class WorkspaceSubscription:
    def __init__(self, workspace_id: str) -> None:
        self.workspace_id = workspace_id
        self._listeners: set[tuple[Queue[str], AbstractEventLoop]] = set()
        self._listeners_lock = threading.Lock()

    def add_listener(self, queue: Queue[str], loop: AbstractEventLoop) -> None:
        with self._listeners_lock:
            self._listeners.add((queue, loop))

    def remove_listener(self, queue: Queue[str]) -> None:
        with self._listeners_lock:
            self._listeners = {(q, loop) for q, loop in self._listeners if q is not queue}

    def broadcast(self, message: str) -> None:
        with self._listeners_lock:
            listeners = list(self._listeners)
        for queue, loop in listeners:
            loop.call_soon_threadsafe(_safe_put, queue, message)


def get_workspace_subscription(workspace_id: str) -> WorkspaceSubscription:
    with _sub_lock:
        sub = _subscriptions.get(workspace_id)
        if sub is None:
            sub = WorkspaceSubscription(workspace_id)
            _subscriptions[workspace_id] = sub
        return sub


def broadcast_document_update(
    workspace_id: str,
    doc_key: str,
    content: object,
    updated_at: str,
    updated_by_user_id: str | None = None,
) -> None:
    message = json.dumps(
        {
            "key": doc_key,
            "content": content,
            "updated_at": updated_at,
            "updated_by_user_id": updated_by_user_id,
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )
    get_workspace_subscription(workspace_id).broadcast(message)
