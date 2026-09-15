"""
Execution audit log — local JSONL plus optional FastAPI/Supabase persistence.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import structlog

WORKER_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = WORKER_ROOT / "logs"
LOG_FILE = LOG_DIR / "execution_events.jsonl"

logger = structlog.get_logger()


def _normalize_status(raw: str) -> str:
    allowed = {
        "pending",
        "success",
        "failed",
        "rejected",
        "skipped_risk",
        "skipped_slippage",
        "duplicate_ignored",
        "partial",
        "closed",
        "modified",
    }
    return raw if raw in allowed else "failed"


def _build_api_payload(event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    from engine.runtime_context import get_runtime_context

    ctx = get_runtime_context()
    if ctx is None:
        return None

    copier_id = event.get("copier_id")
    master_account_id = None
    follower_account_id = None
    if copier_id and copier_id in ctx.copier_accounts:
        master_account_id, follower_account_id = ctx.copier_accounts[copier_id]

    status = _normalize_status(str(event.get("status", "failed")))
    payload: Dict[str, Any] = {
        "copier_relation_id": copier_id,
        "master_account_id": master_account_id,
        "follower_account_id": follower_account_id,
        "event_type": event.get("event_type") or "unknown",
        "master_ticket": str(event["master_ticket"]) if event.get("master_ticket") else None,
        "follower_ticket": str(event["follower_ticket"]) if event.get("follower_ticket") else None,
        "symbol_master": event.get("symbol_master") or event.get("symbol"),
        "symbol_follower": event.get("symbol_follower"),
        "side": event.get("side"),
        "requested_lot": event.get("requested_lot"),
        "executed_lot": event.get("executed_lot"),
        "latency_ms": event.get("latency_ms") or event.get("e2e_ms"),
        "switch_ms": event.get("switch_ms"),
        "order_ms": event.get("order_ms"),
        "e2e_ms": event.get("e2e_ms"),
        "status": status,
        "broker_return_code": (
            str(event["broker_return_code"]) if event.get("broker_return_code") else None
        ),
        "error_message": event.get("error_message") or event.get("error"),
        "raw_payload": event,
    }
    return payload


def _write_local_jsonl(event: Dict[str, Any]) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    row = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **event,
    }
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, default=str) + "\n")


def append_event(event: Dict[str, Any]) -> None:
    api_mode = os.environ.get("DELTA_CONFIG_SOURCE", "yaml").lower() == "api"
    local_log = os.environ.get("WORKER_LOCAL_LOG", "0" if api_mode else "1") == "1"
    if local_log:
        try:
            _write_local_jsonl(event)
        except Exception as exc:
            logger.warning("execution_event_local_log_failed", error=str(exc))

    if not api_mode:
        return

    try:
        from engine.api_client import get_api_client

        client = get_api_client()
        if not client.enabled:
            return
        api_payload = _build_api_payload(event)
        if api_payload is None:
            return
        from engine.event_batcher import enqueue_api_payload

        enqueue_api_payload(api_payload)
    except Exception as exc:
        logger.warning("execution_event_api_post_failed", error=str(exc))
