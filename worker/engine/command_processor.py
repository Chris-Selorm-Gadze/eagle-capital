"""
Process worker commands (flatten, etc.) polled from the control plane.
"""

from __future__ import annotations

from typing import Any, Optional

import structlog

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None

from engine.account_session import AccountSession
from engine.execution_log import append_event
from engine.terminal_session_manager import Mt5Account, get_terminal_manager

logger = structlog.get_logger()


def flatten_account(session: AccountSession) -> dict[str, Any]:
    if mt5 is None:
        return {"success": False, "error": "MetaTrader5 not available"}

    mgr = get_terminal_manager()
    if not mgr.ensure_account(Mt5Account.from_session(session)):
        return {"success": False, "error": "Failed to login for flatten"}

    positions = session.connector.get_open_positions()
    closed = 0
    errors: list[str] = []

    for pos in positions:
        ticket = pos.get("ticket")
        symbol = pos.get("symbol")
        volume = pos.get("volume")
        side = pos.get("type")
        if ticket is None:
            continue

        close_type = mt5.ORDER_TYPE_SELL if side == 0 else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            errors.append(f"No tick for {symbol}")
            continue

        price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": close_type,
            "position": ticket,
            "price": price,
            "deviation": 20,
            "magic": 0,
            "comment": "copymorphic-flatten",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
            closed += 1
            append_event(
                {
                    "status": "closed",
                    "event_type": "flatten",
                    "master_ticket": ticket,
                    "symbol": symbol,
                    "executed_lot": volume,
                }
            )
        else:
            code = result.retcode if result else "unknown"
            errors.append(f"ticket {ticket}: retcode {code}")

    return {
        "success": len(errors) == 0,
        "closed": closed,
        "errors": errors,
    }


def test_connection_command(
    command: dict[str, Any],
    *,
    restore_account: Mt5Account | None = None,
) -> dict[str, Any]:
    """Verify broker login for a dashboard-linked account (no active copier session required)."""
    from engine.api_client import get_api_client

    account_id = command.get("trading_account_id")
    client = get_api_client()
    if not client.enabled:
        return {
            "success": False,
            "connection_status": "terminal_unavailable",
            "message": "Worker API not configured (WORKER_API_KEY / WORKER_USER_ID)",
        }

    try:
        row = client.fetch_trading_account(account_id)
    except Exception as exc:
        return {
            "success": False,
            "connection_status": "terminal_unavailable",
            "message": f"Could not load account: {exc}",
        }

    platform = str(row.get("platform") or "mt5")
    if platform == "dxtrade":
        try:
            # parents[1], not [2]: adapters/ sits beside engine/ inside the
            # worker folder. This said [2] and so inserted the old repo root,
            # which never contained adapters/ — it only ever worked because the
            # entry-point scripts already put the worker folder on sys.path.
            # Harmless there, broken the moment anything imports this directly.
            worker_root = __import__("pathlib").Path(__file__).resolve().parents[1]
            import sys

            if str(worker_root) not in sys.path:
                sys.path.insert(0, str(worker_root))
            from adapters.dxtrade_client import DXtradeClient, resolve_base_url

            base = resolve_base_url(api_base_url=row.get("api_base_url"))
            dx = DXtradeClient(base)
            dx.login(row["login"], row["password"], row["server"])
            accounts = dx.get_accounts()
            balance = None
            equity = None
            if accounts:
                first = accounts[0]
                balance = float(first.get("balance") or first.get("cashBalance") or 0)
                equity = float(first.get("equity") or balance or 0)
            return {
                "success": True,
                "message": "DXtrade session established",
                "balance": balance,
                "equity": equity,
            }
        except Exception as exc:
            return {
                "success": False,
                "connection_status": "auth_failed",
                "message": str(exc),
            }

    terminal_path = row.get("terminal_path")
    session = AccountSession(
        account_id=row["id"],
        label=row.get("label") or row["id"],
        role=row.get("role") or "master",
        login=row["login"],
        password=row["password"],
        server=row["server"],
        terminal_path=terminal_path,
    )

    mgr = get_terminal_manager()
    acc = Mt5Account.from_session(session)
    ok, msg = mgr.verify_account(acc)
    session._initialized = ok
    session._connector.connected = ok
    if ok:
        ok, msg = session.confirm_connected()
    health = session.get_health() if ok else {}

    if restore_account:
        mgr.ensure_account(restore_account)

    if ok:
        return {
            "success": True,
            "message": msg,
            "balance": health.get("balance"),
            "equity": health.get("equity"),
            "currency": health.get("currency"),
        }

    return {
        "success": False,
        "connection_status": "auth_failed",
        "message": msg,
    }


def process_command(
    command: dict[str, Any],
    sessions: dict[str, AccountSession],
    *,
    master_session: AccountSession | None = None,
) -> dict[str, Any]:
    cmd_type = command.get("command_type")
    account_id = command.get("trading_account_id")

    if cmd_type == "test_connection":
        restore = (
            Mt5Account.from_session(master_session) if master_session else None
        )
        return test_connection_command(command, restore_account=restore)

    session = sessions.get(account_id or "")

    if cmd_type == "flatten":
        if not session:
            return {"success": False, "error": f"No session for account {account_id}"}
        return flatten_account(session)

    return {"success": False, "error": f"Unknown command type: {cmd_type}"}
