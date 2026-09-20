"""
Run a single MT5 copy job in an isolated process (one terminal path per pool worker).
"""

from __future__ import annotations

import os
import time
from typing import Any

import structlog

logger = structlog.get_logger()

_POOL_ACCOUNT_ID: str = ""
_POOL_TERMINAL_PATH: str = ""
_WARM_SESSION = None
_WARM_VERIFIED_AT: float = 0.0
_WARM_SELECTED_SYMBOLS: set[str] = set()

# Trust warm connections until an order fails — skip the account_info() probe that
# costs a remote round-trip on every job after the TTL window.
_WARM_TTL_S: float = float(os.environ.get("WORKER_POOL_WARM_TTL_SECONDS", "60"))
_OPTIMISTIC_WARM: bool = os.environ.get("WORKER_POOL_OPTIMISTIC_WARM", "1") == "1"


def _init_pool_worker(account_id: str, terminal_path: str) -> None:
    global _POOL_ACCOUNT_ID, _POOL_TERMINAL_PATH, _WARM_SESSION, _WARM_VERIFIED_AT
    _POOL_ACCOUNT_ID = account_id or ""
    _POOL_TERMINAL_PATH = terminal_path or ""
    _WARM_SESSION = None
    _WARM_VERIFIED_AT = 0.0
    _WARM_SELECTED_SYMBOLS.clear()


def invalidate_warm_session() -> None:
    """Drop the pinned warm session so the next job reconnects."""
    global _WARM_SESSION, _WARM_VERIFIED_AT
    _WARM_SESSION = None
    _WARM_VERIFIED_AT = 0.0


def _prewarm_symbols(symbol_mappings: list[dict[str, Any]]) -> None:
    """Select mapped follower symbols in MarketWatch so ticks stream early.

    First trade on a cold symbol otherwise pays a symbol_select + tick wait.
    symbol_select is a local terminal call (no broker round-trip), so warming
    once per process is cheap and removes that stall from the hot path.
    """
    try:
        import MetaTrader5 as mt5
    except ImportError:
        return
    for m in symbol_mappings:
        sym = (m.get("follower_symbol") or "").strip()
        if not sym or sym in _WARM_SELECTED_SYMBOLS:
            continue
        try:
            mt5.symbol_select(sym, True)
        except Exception:
            pass
        _WARM_SELECTED_SYMBOLS.add(sym)


def _session_for_follower(follower: dict[str, Any], path: str):
    global _POOL_ACCOUNT_ID, _WARM_SESSION, _WARM_VERIFIED_AT
    from engine.account_session import AccountSession

    account_id = follower["id"]
    now = time.perf_counter()

    if _WARM_SESSION is not None and _POOL_ACCOUNT_ID == account_id:
        if _OPTIMISTIC_WARM:
            # Optimistic warm path — send immediately; invalidate only on failure.
            return _WARM_SESSION, 0
        if (now - _WARM_VERIFIED_AT) < _WARM_TTL_S:
            return _WARM_SESSION, 0
        if _WARM_SESSION.connect():
            _WARM_VERIFIED_AT = time.perf_counter()
            return _WARM_SESSION, 0
        invalidate_warm_session()

    session = AccountSession(
        account_id=account_id,
        label=follower.get("label", ""),
        role=follower.get("role", "follower"),
        login=str(follower["login"]),
        password=str(follower["password"]),
        server=str(follower["server"]),
        terminal_path=path,
        platform=follower.get("platform", "mt5"),
    )
    t_switch = time.perf_counter()
    if not session.connect():
        return None, int((time.perf_counter() - t_switch) * 1000)
    _WARM_SESSION = session
    _POOL_ACCOUNT_ID = account_id
    _WARM_VERIFIED_AT = time.perf_counter()
    return session, int((time.perf_counter() - t_switch) * 1000)


def read_account_state(job: dict[str, Any]) -> dict[str, Any]:
    """Read one account's open positions and figures, inside this terminal's process.

    The live feed's whole latency problem is that the main process holds one MT5
    attach: sweeping seven accounts across three brokers there means three
    shutdown+initialize cycles, each with a settling window, all of it competing
    with the copy loop for the same terminal. Here each pool worker owns its own
    terminal and keeps a warm session, so a repeat read of the same account costs
    no switch at all and accounts on different brokers are read at the same time.

    Never raises: a read that fails comes back as ok=False, and the caller leaves
    that account's last good snapshot alone rather than reporting it as flat.
    """
    account = job["account"]
    account_id = account.get("id", "")
    path = job.get("terminal_path") or _POOL_TERMINAL_PATH
    started = time.perf_counter()

    try:
        session, switch_ms = _session_for_follower(account, path)
    except Exception as exc:
        invalidate_warm_session()
        return {"trading_account_id": account_id, "ok": False, "error": str(exc)}

    if session is None:
        return {
            "trading_account_id": account_id,
            "ok": False,
            "error": "connect failed",
            "switch_ms": switch_ms,
        }

    try:
        positions = session.connector.get_open_positions()
        info = session.connector.get_account_info()
    except Exception as exc:
        # A throw here usually means the warm session is pointing at a terminal
        # that went away. Drop it so the next read reconnects instead of
        # repeating the same failure every sweep.
        invalidate_warm_session()
        return {"trading_account_id": account_id, "ok": False, "error": str(exc)}

    # Price precision per symbol, looked up here because this is where the
    # terminal is. get_symbol_info caches for ten minutes, so this is one local
    # call per symbol per process, not per sweep.
    digits: dict[str, int] = {}
    for pos in positions or []:
        symbol = str(pos.get("symbol") or "")
        if not symbol or symbol in digits:
            continue
        try:
            spec = session.connector.get_symbol_info(symbol) or {}
        except Exception:
            continue
        value = spec.get("digits")
        if isinstance(value, int):
            digits[symbol] = value

    return {
        "trading_account_id": account_id,
        "ok": True,
        "positions": positions or [],
        "info": info or None,
        "digits": digits,
        "switch_ms": switch_ms,
        "read_ms": int((time.perf_counter() - started) * 1000),
    }


def read_closed_trades(job: dict[str, Any]) -> dict[str, Any]:
    """Journal one account's finished positions, inside this terminal's process.

    The whole two-phase read runs here rather than being driven across the
    process boundary: the window says which positions closed, then each is read
    whole so its opening deal is present. Split over IPC that would be one round
    trip per position; done here it is one for the account.

    This is why journalling stopped being one-account-per-pass. That rotation
    existed because a history read meant re-attaching the main process to
    another terminal, which is the same switch a copy pays -- so seven accounts
    on a two-minute beat meant a closed trade could take fourteen minutes to
    reach the dashboard. A pool worker is already on its account and keeps a
    warm session, so the read costs no switch and every account can be read at
    once.
    """
    from engine.trade_sync import parse_mark, sync_account

    account = job["account"]
    account_id = account.get("id", "")
    path = job.get("terminal_path") or account.get("terminal_path") or _POOL_TERMINAL_PATH

    try:
        session, _switch_ms = _session_for_follower(account, path)
    except Exception as exc:
        invalidate_warm_session()
        return {"trading_account_id": account_id, "ok": False, "error": str(exc)}

    if session is None:
        return {"trading_account_id": account_id, "ok": False, "error": "connect failed"}

    try:
        result = sync_account(
            session.connector, account_id, parse_mark(job.get("synced_to"))
        )
    except Exception as exc:
        invalidate_warm_session()
        return {"trading_account_id": account_id, "ok": False, "error": str(exc)}

    return {
        "trading_account_id": account_id,
        "ok": True,
        # None means the window could not be read. Kept as None so the caller
        # leaves the mark where it is and the next pass re-reads that window,
        # rather than stepping over trades nobody managed to look at.
        "synced_to": result.synced_to.isoformat() if result.synced_to else None,
        # Already the wire shape, so the caller posts what it is handed rather
        # than reconstructing dataclasses on the other side of the boundary.
        "trades": [t.to_payload() for t in result.trades],
        "positions_seen": result.positions_seen,
    }


def run_isolated_copy_job(job: dict[str, Any]) -> dict[str, Any]:
    """Execute one copy action on a dedicated terminal path process."""
    from engine.account_session import AccountSession
    from engine.config_loader import CopierConfig
    from engine.follower_executor import FollowerExecutor
    from engine.signal import TradeSignal
    from engine.symbol_mapper import SymbolMapper
    from engine.ticket_mapper import TicketMapper

    events: list[dict[str, Any]] = []

    def sink(event: dict[str, Any]) -> None:
        events.append(event)

    follower = job["follower"]
    path = job.get("terminal_path") or follower.get("terminal_path") or _POOL_TERMINAL_PATH

    session, switch_ms = _session_for_follower(follower, path)
    if session is None:
        invalidate_warm_session()
        return {
            "ok": False,
            "events": [
                {
                    "status": "failed",
                    "copier_id": job["copier"]["id"],
                    "event_type": job["signal"]["event_type"],
                    "error_message": "terminal_connect_failed",
                    "switch_ms": switch_ms,
                    "e2e_ms": _e2e(job),
                }
            ],
            "switch_ms": switch_ms,
        }

    _prewarm_symbols(job.get("symbol_mappings") or [])

    signal = _signal_from_job(job)
    copier = CopierConfig(**job["copier"])
    from engine.config_loader import SymbolMapping

    maps = [
        SymbolMapping(
            master_symbol=m["master_symbol"],
            follower_symbol=m["follower_symbol"],
        )
        for m in (job.get("symbol_mappings") or [])
    ]
    symbol_mapper = SymbolMapper(maps)
    ticket_mapper = TicketMapper()

    ft = job.get("follower_ticket_for_close")
    if ft is not None:
        # Seed with the FOLLOWER symbol/side/volume (not the master signal's),
        # so the modify/close fast paths build a valid request for this broker.
        ticket_mapper.add(
            copier.id,
            signal.ticket,
            ft,
            job.get("link_symbol") or signal.symbol,
            job.get("link_side") or signal.side,
            follower_account_id=follower["id"],
            volume=job.get("link_volume"),
        )

    risk_engine = None
    risk_profile = job.get("risk_profile")
    if risk_profile:
        from engine.risk_engine import RiskEngine

        risk_engine = RiskEngine({follower["id"]: risk_profile})

    executor = FollowerExecutor(
        session,
        symbol_mapper,
        ticket_mapper,
        risk_engine=risk_engine,
        event_sink=sink,
        switch_ms=switch_ms,
        detected_at_ms=job.get("submitted_at_ms") or job.get("detected_at_ms"),
    )
    ok = executor.handle(signal, copier)

    if not ok and _OPTIMISTIC_WARM:
        invalidate_warm_session()

    ticket_link = None
    ticket_remove = None
    link = ticket_mapper.get(copier.id, signal.ticket)
    if link and signal.event_type == "position_opened":
        ticket_link = {
            "copier_id": copier.id,
            "master_ticket": signal.ticket,
            "follower_ticket": link.follower_ticket,
            "symbol": link.symbol,
            "side": link.side,
            "follower_account_id": follower["id"],
            "volume": link.volume,
        }
    if signal.event_type == "position_closed" and ok:
        ticket_remove = {
            "copier_id": copier.id,
            "master_ticket": signal.ticket,
            "follower_account_id": follower["id"],
        }

    for ev in events:
        ev.setdefault("switch_ms", switch_ms)
        ev.setdefault("e2e_ms", _e2e(job))

    return {
        "ok": ok,
        "events": events,
        "ticket_link": ticket_link,
        "ticket_remove": ticket_remove,
        "switch_ms": switch_ms,
    }


def _e2e(job: dict[str, Any]) -> int:
    """End-to-end latency from signal detection to result (ms).

    Prefer per-follower ``submitted_at_ms`` when present so pool followers are
    not penalized for waiting on slower siblings in the dispatch barrier.
    """
    now_ms = int(time.time() * 1000)
    submitted = job.get("submitted_at_ms")
    if submitted:
        return max(0, now_ms - int(submitted))
    detected = job.get("detected_at_ms") or 0
    if not detected:
        return 0
    return max(0, now_ms - int(detected))


def _signal_from_job(job: dict[str, Any]) -> "TradeSignal":
    from engine.signal import TradeSignal

    s = job["signal"]
    return TradeSignal(
        event_type=s["event_type"],
        account_id=s.get("account_id", ""),
        ticket=int(s["ticket"]),
        symbol=s["symbol"],
        side=s["side"],
        volume=float(s["volume"]),
        open_price=s.get("open_price"),
        sl=s.get("sl"),
        tp=s.get("tp"),
        timestamp_ms=int(s.get("timestamp_ms") or job.get("detected_at_ms") or 0),
    )
