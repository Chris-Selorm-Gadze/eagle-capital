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
import threading
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
    return float(os.environ.get("WORKER_POSITION_SYNC_SECONDS", "2"))


def should_report_positions(now: Optional[float] = None) -> bool:
    """Rate-limits the idle sweep only -- the master rides the copier's cycle."""
    global _last_report
    moment = time.time() if now is None else now
    if moment - _last_report < report_interval_seconds():
        return False
    _last_report = moment
    return True


def reset_state() -> None:
    global _last_report, _sweep_thread, _last_balance_report
    _last_report = 0.0
    _sweep_thread = None
    _last_balance_report = 0.0


def request_report() -> None:
    """Report on the next loop instead of at the next interval -- after the
    worker closes something, so the Live Trading page drops it at once."""
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


def position_row(
    pos: dict[str, Any],
    digits: Optional[int] = None,
    time_offset: int = 0,
) -> Optional[dict[str, Any]]:
    """One MT5 position as the wire shape, or None if it is not identifiable.

    A position without a ticket or a symbol cannot be rendered or reconciled
    against anything, so it is dropped rather than shown as a blank row.

    ``time_offset`` is how far the broker's clock runs ahead of UTC. MT5 gives
    a position's open time in that clock, so on a GMT+3 server a position
    opened a minute ago read as opening three hours in the future, and its age
    sat at "0s" for three hours.
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
        "opened_at": (
            int(opened_at) - int(time_offset or 0)
            if isinstance(opened_at, (int, float)) and opened_at
            else None
        ),
        # The broker's own price precision. Without it the page has to guess,
        # and a guess shows 1.085 where the instrument quotes 1.08500 -- digits
        # appearing and vanishing as the price moves, which on a screen someone
        # watches is the difference between an instrument and a toy.
        "digits": int(digits) if isinstance(digits, int) else None,
    }


def positions_from_mt5(
    positions: Iterable[dict[str, Any]],
    digits_lookup: Optional[Any] = None,
    time_offset: int = 0,
) -> list[dict[str, Any]]:
    def digits_for(symbol: str) -> Optional[int]:
        if digits_lookup is None or not symbol:
            return None
        try:
            return digits_lookup(symbol)
        except Exception:
            return None

    rows = [
        position_row(p, digits_for(str(p.get("symbol") or "")), time_offset)
        for p in positions
    ]
    return [r for r in rows if r is not None]


def account_payload(
    trading_account_id: str,
    positions: Iterable[dict[str, Any]],
    info: Optional[dict[str, Any]] = None,
    digits_lookup: Optional[Any] = None,
    time_offset: int = 0,
) -> dict[str, Any]:
    """One account's snapshot. ``info`` is MT5's account info when it was read
    on the same visit -- omitted, the gateway leaves the stored figures alone
    rather than blanking them."""
    payload: dict[str, Any] = {
        "trading_account_id": trading_account_id,
        "positions": positions_from_mt5(positions, digits_lookup, time_offset),
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


def sweep_deadline_seconds() -> float:
    """How long a sweep may take before its stragglers are abandoned.

    Anything still unread when this expires keeps its previous snapshot, which
    is the honest outcome: the page shows that account's age growing rather than
    a number nobody actually read.
    """
    return float(os.environ.get("WORKER_POSITION_SWEEP_DEADLINE_SECONDS", "4"))


def _pool_job(account: Any) -> dict[str, Any]:
    """The account shape the isolated reader needs, and nothing more."""
    return {
        "terminal_path": account.terminal_path,
        "account": {
            "id": account.id,
            "label": account.label,
            "role": account.role,
            "login": str(account.login),
            "password": account.password,
            "server": account.server,
            "platform": account.platform,
            "terminal_path": account.terminal_path,
        },
    }


def payload_from_result(result: Any) -> Optional[dict[str, Any]]:
    """One pool worker's answer, or None when it could not read the account.

    A failed read is dropped rather than sent as an empty account: the gateway
    replaces whatever it is given, so [] would erase a live position from the
    page and claim it had closed.
    """
    if not isinstance(result, dict) or not result.get("ok"):
        return None
    account_id = result.get("trading_account_id")
    if not account_id:
        return None
    # Digits arrived with the row: the pool worker looked them up where the
    # terminal is, so nothing here needs MT5.
    return account_payload(
        str(account_id),
        result.get("positions") or [],
        result.get("info"),
        digits_lookup=lambda symbol: (result.get("digits") or {}).get(symbol),
        time_offset=int(result.get("time_offset") or 0),
    )


def sweepable(accounts: list[Any], pool: Any, master_id: Optional[str] = None) -> list[Any]:
    """Accounts this sweep can read without touching the shared MT5 attach.

    Only pool-routed accounts qualify. The main process holds one MT5 login for
    the copy loop, and switching it from the sweep's thread would let a read
    land on whichever account the copier had just attached -- which is not a
    stale number, it is one account's positions shown under another's name.
    Anything unrouted is left to the balance sweep, which runs inline on the
    copy loop's own thread and is therefore serialised with it.
    """
    if pool is None:
        return []
    out = []
    for account in accounts:
        if not account.enabled or account.id == master_id:
            continue
        try:
            if pool.has(account.id):
                out.append(account)
        except Exception:
            continue
    return out


def sweep_positions(
    accounts: list[Any],
    pool: Any,
    master_snapshot: Optional[tuple[str, list[dict[str, Any]]]] = None,
    master_offset: int = 0,
) -> int:
    """Read every pool-routed account at once and report what was seen.

    All reads are submitted before any is waited on, so brokers on separate
    terminals are read concurrently instead of one shutdown+initialize after
    another. Each pool worker owns its terminal and keeps a warm session, so a
    repeat read of the same account costs no switch at all.

    ``master_snapshot`` is the copier's own poll of the master, already in hand
    and therefore free -- carrying it here means one report covers every account
    rather than the master arriving on a schedule of its own.
    """
    payloads: list[dict[str, Any]] = []
    master_id = None
    if master_snapshot is not None:
        master_id, master_positions = master_snapshot
        payloads.append(
            account_payload(master_id, master_positions, time_offset=master_offset)
        )

    pending: dict[str, Any] = {}
    for account in sweepable(accounts, pool, master_id):
        try:
            future = pool.submit_read(account.id, _pool_job(account))
        except Exception as exc:
            logger.debug("position_sweep_submit_failed", account=account.id, error=str(exc))
            continue
        if future is not None:
            pending[account.id] = future

    deadline = time.monotonic() + sweep_deadline_seconds()
    balances: list[dict[str, Any]] = []
    for account_id, future in pending.items():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            logger.debug("position_sweep_deadline", account=account_id)
            continue
        try:
            result = future.result(timeout=remaining)
        except Exception as exc:
            logger.debug("position_sweep_read_failed", account=account_id, error=str(exc))
            continue
        payload = payload_from_result(result)
        if payload is not None:
            payloads.append(payload)
            row = balance_row(payload)
            if row is not None:
                balances.append(row)

    reported = report_accounts(payloads)
    report_balances(balances)
    return reported


def balance_row(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    """The account-balances row a successful sweep read implies, if it read one."""
    if payload.get("balance") is None and payload.get("equity") is None:
        return None
    row: dict[str, Any] = {
        "trading_account_id": payload["trading_account_id"],
        "balance": payload.get("balance"),
        "equity": payload.get("equity"),
        # The read succeeded, so the account is reachable -- which is what the
        # inline balance sweep used to establish by logging in to it.
        "connection_status": "connected",
    }
    if payload.get("currency"):
        row["currency"] = payload["currency"]
    return row


_last_balance_report: float = 0.0


def report_balances(rows: list[dict[str, Any]], now: Optional[float] = None) -> int:
    """Hand pool-read balances to the gateway, at the balance cadence.

    These accounts are no longer visited by the inline balance sweep (see
    balance_sync.accounts_to_visit), so this is how their balance, equity,
    connection status and daily opening snapshot stay current. Throttled to the
    same interval that sweep used: the positions report every two seconds
    already carries live figures for the page, and trading_accounts is streamed
    to the Trade Copier page, which would otherwise reload on every sweep.
    """
    global _last_balance_report
    if not rows:
        return 0
    moment = time.time() if now is None else now
    interval = float(os.environ.get("WORKER_BALANCE_SYNC_SECONDS", "90"))
    if moment - _last_balance_report < interval:
        return 0

    from engine.api_client import get_api_client

    client = get_api_client()
    if not client.enabled or not client.user_id:
        return 0
    try:
        client.post_account_balances(rows)
    except Exception as exc:
        logger.debug("pooled_balance_report_failed", count=len(rows), error=str(exc))
        return 0
    _last_balance_report = moment
    return len(rows)


_sweep_thread: Optional[threading.Thread] = None
_sweep_lock = threading.Lock()


def sweep_in_background(
    accounts: list[Any],
    pool: Any,
    master_snapshot: Optional[tuple[str, list[dict[str, Any]]]] = None,
    master_offset: int = 0,
) -> bool:
    """Start a sweep off the copy loop's thread, if one is not already running.

    The copy loop polls every 50ms and a sweep can take seconds, so running it
    inline would put broker round-trips directly into copy latency -- the one
    thing this system is measured on. One sweep at a time: a second would queue
    behind the first on the same pool workers and report nothing newer.

    Safe off-thread only because sweep_positions touches nothing the copy loop
    owns -- every read happens in a pool subprocess with its own MT5 attach.
    """
    global _sweep_thread

    with _sweep_lock:
        if _sweep_thread is not None and _sweep_thread.is_alive():
            return False

        def run() -> None:
            try:
                sweep_positions(accounts, pool, master_snapshot, master_offset)
            except Exception as exc:
                logger.debug("position_sweep_failed", error=str(exc))

        _sweep_thread = threading.Thread(
            target=run, name="position-sweep", daemon=True
        )
        _sweep_thread.start()
        return True
