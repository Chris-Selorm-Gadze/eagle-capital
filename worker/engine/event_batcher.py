"""
Async batch poster for execution events — keeps copy hot path off HTTP.
"""

from __future__ import annotations

import atexit
import os
import threading
from collections import deque
from typing import Any

import structlog

logger = structlog.get_logger()

_queue: deque[dict[str, Any]] = deque()
_lock = threading.Lock()
_started = False
_stop = threading.Event()


def _flush_loop() -> None:
    interval = float(os.environ.get("WORKER_EVENT_FLUSH_SECONDS", "0.25"))
    while not _stop.wait(interval):
        _flush_once()


def _flush_once() -> None:
    batch: list[dict[str, Any]] = []
    with _lock:
        while _queue and len(batch) < 50:
            batch.append(_queue.popleft())
    if not batch:
        return
    try:
        from engine.api_client import get_api_client

        client = get_api_client()
        if not client.enabled:
            return
        if len(batch) == 1:
            client.post_execution_event(batch[0])
        else:
            client.post_execution_events_batch(batch)
    except Exception as exc:
        logger.warning("event_batch_flush_failed", count=len(batch), error=str(exc))
        with _lock:
            for item in reversed(batch):
                _queue.appendleft(item)


def enqueue_api_payload(payload: dict[str, Any]) -> None:
    global _started
    with _lock:
        _queue.append(payload)
        if not _started:
            _started = True
            t = threading.Thread(target=_flush_loop, name="event-batcher", daemon=True)
            t.start()
            atexit.register(shutdown)


def shutdown() -> None:
    _stop.set()
    _flush_once()
