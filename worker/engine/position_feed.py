"""
What is open right now, reported to the control plane so the app can show it.

MT5 allows one login per terminal, so reading an account's open positions costs
a terminal switch -- the same switch the copier pays to place an order. This
module therefore never initiates a switch of its own. It reports from attaches
that are happening anyway:

  * the master, from the snapshot the copier already polls every cycle,
  * everyone else, from the balance sweep's visit,
  * every enabled account, while the worker sits idle and the terminal is free.

The consequence is that different accounts carry different freshness, so every
payload states when it was read and the page shows that age per account. A page
that implied one clock for all of them would be lying about the followers.
"""

from __future__ import annotations

import os
import time
from typing import Any, Iterable, Optional

import structlog

logger = structlog.get_logger()

_last_report: float = 0.0

# MT5 position types. Everything downstream -- the ledger, the P&L sign, the
# app's own trade rows -- speaks long/short, so translate at the boundary
# rather than leaking broker vocabulary into the database.
_SIDES = {0: "long", 1: "short"}


def report_interval_seconds() -> float:
    return float(os.environ.get("WORKER_POSITION_SYNC_SECONDS", "5"))


def should_report_positions(now: Optional[float] = None) -> bool:
    """Rate-limits the idle sweep only -- the master rides the copier's cycle."""
    global _last_report
    moment = time.time() if now is None else now
    if moment - _last_report < report_interval_seconds():
        return False
    _last_report = moment
    return True


def reset_state() -> None:
    global _last_report
    _last_report = 0.0


def _number(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    # -0.0 survives json.dumps as "-0.0" and renders as "-$0" on the page.
    return out + 0.0


def position_row(pos: dict[str, Any]) -> Optional[dict[str, Any]]:
    """One MT5 position as the wire shape, or None if it is not identifiable.

    A position without a ticket or a symbol cannot be rendered or reconciled
    against anything, so it is dropped rather than shown as a blank row.
    """
    ticket = pos.get("ticket")
    symbol = pos.get("symbol")
    if ticket is None or not symbol:
        return None

    opened_at = pos.get("time")
    return {
        "ticket": str(ticket),
        "symbol": str(symbol),
        "side": _SIDES.get(pos.get("type"), "long"),
        "volume": _number(pos.get("volume")) or 0.0,
        "open_price": _number(pos.get("price_open")),
        "current_price": _number(pos.get("price_current")),
        "unrealized_pnl": _number(pos.get("profit")),
        "swap": _number(pos.get("swap")),
        "sl": _number(pos.get("sl")) or None,
        "tp": _number(pos.get("tp")) or None,
        "opened_at": int(opened_at) if isinstance(opened_at, (int, float)) else None,
    }


def positions_from_mt5(positions: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [position_row(p) for p in positions]
    return [r for r in rows if r is not None]


def account_payload(
    trading_account_id: str,
    positions: Iterable[dict[str, Any]],
    info: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """One account's snapshot. ``info`` is MT5's account info when it was read
    on the same visit -- omitted, the gateway leaves the stored figures alone
    rather than blanking them."""
    payload: dict[str, Any] = {
        "trading_account_id": trading_account_id,
        "positions": positions_from_mt5(positions),
    }
    if info:
        payload["balance"] = _number(info.get("balance"))
        payload["equity"] = _number(info.get("equity"))
        currency = info.get("currency")
        if currency:
            payload["currency"] = str(currency)
    return payload


def report_accounts(payloads: list[dict[str, Any]]) -> int:
    """Hand snapshots to the gateway. Never raises -- a failed report is a
    stale page, and must not take down the copy loop that called it."""
    if not payloads:
        return 0

    from engine.api_client import get_api_client

    client = get_api_client()
    if not client.enabled or not client.user_id:
        return 0

    try:
        client.post_open_positions(payloads)
    except Exception as exc:
        logger.debug("position_feed_failed", count=len(payloads), error=str(exc))
        return 0

    logger.debug("position_feed_ok", count=len(payloads))
    return len(payloads)


def report_master(trading_account_id: str, positions: Optional[list[dict[str, Any]]]) -> int:
    """The live one: the copier already holds this snapshot, so it costs nothing.

    ``None`` means the poll itself failed. Reporting it as an empty list would
    tell the page every position had closed, so it is skipped instead.
    """
    if positions is None:
        return 0
    if not should_report_positions():
        return 0
    return report_accounts([account_payload(trading_account_id, positions)])
