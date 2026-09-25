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


# How long the command loop waits for a pool worker to finish a close. A close
# is one order per position; past this the terminal is stuck, and saying so
# beats holding the copy loop.
_CLOSE_DEADLINE_S = 30.0


def _log_closes(session: AccountSession, event_type: str, result: dict[str, Any]) -> None:
    """One execution event per position closed, on the side it belongs to.

    Recorded under ``follower_ticket`` for a follower, which is what open-links
    reads to decide a copy link is finished: a follower closed by hand from the
    app must not be restored as open after a worker restart.
    """
    side = "follower" if session.role == "follower" else "master"
    for pos in result.get("closed_positions") or []:
        append_event(
            {
                "status": "closed",
                "event_type": event_type,
                f"{side}_ticket": pos.get("ticket"),
                f"{side}_account_id": session.account_id,
                "symbol": pos.get("symbol"),
                "side": pos.get("side"),
                "executed_lot": pos.get("volume"),
            }
        )


def _pool_job(session: AccountSession, tickets: Optional[list[int]]) -> dict[str, Any]:
    return {
        "terminal_path": session.terminal_path,
        "tickets": tickets,
        "account": {
            "id": session.account_id,
            "label": session.label,
            "role": session.role,
            "login": str(session.login),
            "password": session.password,
            "server": session.server,
            "platform": session.platform,
            "terminal_path": session.terminal_path,
        },
    }


def close_positions(
    session: AccountSession,
    tickets: Optional[list[int]],
    *,
    pool: Any = None,
    event_type: str = "manual_close",
) -> dict[str, Any]:
    """Close ``tickets`` on this account, or every position for None.

    Routed through the account's own terminal worker when the pool has one --
    no switch, and the copy loop keeps its master attached. Anything unrouted
    is closed here, on this process's attach, which the copy loop re-takes on
    its next poll.
    """
    from engine.manual_close import close_on_connector
    from engine.platform_capabilities import is_mt5

    if not is_mt5(session.platform):
        return {"success": False, "error": "Closing from the app is only supported for MT5 accounts."}
    if tickets is not None and not tickets:
        return {"success": False, "error": "No position ticket was given."}

    result: Optional[dict[str, Any]] = None
    routed = False
    try:
        routed = bool(pool is not None and pool.has(session.account_id))
    except Exception:
        routed = False

    if routed:
        future = pool.submit_close(session.account_id, _pool_job(session, tickets))
        if future is not None:
            try:
                result = future.result(timeout=_CLOSE_DEADLINE_S)
            except Exception as exc:
                return {"success": False, "error": f"The terminal did not answer: {exc}"}

    if result is None:
        if mt5 is None:
            return {"success": False, "error": "MetaTrader5 not available"}
        mgr = get_terminal_manager()
        if not mgr.ensure_account(Mt5Account.from_session(session)):
            return {"success": False, "error": "Could not log in to the account to close it."}
        result = close_on_connector(session.connector, tickets)

    _log_closes(session, event_type, result)

    if result.get("closed") or result.get("already_closed"):
        # Something changed on the account: journal it and redraw Live Trading
        # now, not at the next scheduled pass.
        from engine.position_feed import request_report
        from engine.trade_journal import request_trade_sync

        request_trade_sync()
        request_report()

    return result


def flatten_account(session: AccountSession, *, pool: Any = None) -> dict[str, Any]:
    return close_positions(session, None, pool=pool, event_type="flatten")


def _folder_of(path: str) -> str:
    """`C:\\MT5\\exness-2\\terminal64.exe` -> `exness-2`, for a readable message."""
    import os

    return os.path.basename(os.path.dirname(path)) or path


def _other_account_paths(client, account_id: str) -> list[str]:
    """Terminals this user's OTHER accounts already hold.

    Exclusivity is the whole point of the assignment, so the set of taken
    terminals has to come from the control plane rather than from anything local
    -- another account may be connected but idle, holding its terminal without
    this worker having touched it.
    """
    try:
        me = client.whoami()
    except Exception as exc:
        logger.warning("terminal_assign_whoami_failed", error=str(exc))
        # Returning [] would let two accounts claim one terminal, which is the
        # exact failure being designed out. Signal "unknown" instead.
        raise

    return [
        a.get("terminal_path")
        for a in (me.get("accounts") or [])
        if a.get("terminal_path") and a.get("id") != account_id
    ]


def _assign_terminal(client, row: dict[str, Any]) -> str | None:
    """Claim a free MT5 install matching this account's broker."""
    from engine.terminal_registry import claim_free_terminal, discover_terminals

    try:
        taken = _other_account_paths(client, row.get("id"))
    except Exception:
        return None

    terminals = discover_terminals()
    chosen = claim_free_terminal(terminals, row.get("broker_slug"), taken)
    if chosen:
        logger.info(
            "terminal_assigned",
            account=row.get("id"),
            broker=row.get("broker_slug"),
            terminal=chosen,
        )
    return chosen


def _no_terminal_result(client, row: dict[str, Any]) -> dict[str, Any]:
    """Explain *why* no terminal could be assigned, in the user's terms."""
    from engine.terminal_registry import (
        canonical_slug,
        capacity_for,
        discover_terminals,
    )

    slug = row.get("broker_slug")
    terminals = discover_terminals()

    if canonical_slug(slug) is None:
        return {
            "success": False,
            "connection_status": "terminal_unavailable",
            "message": (
                "This account has no broker recorded, so no terminal could be "
                "matched to it. Reconnect the account and pick its broker."
            ),
        }

    try:
        taken = _other_account_paths(client, row.get("id"))
    except Exception:
        return {
            "success": False,
            "connection_status": "terminal_unavailable",
            "message": "Could not check which terminals are in use. Try again.",
        }

    used, total = capacity_for(terminals, slug, taken)
    if total == 0:
        return {
            "success": False,
            "connection_status": "terminal_unavailable",
            "message": (
                f"No MT5 install for this broker was found on the worker. "
                f"Install it, or run clone-terminals.ps1 to add one."
            ),
        }

    return {
        "success": False,
        "connection_status": "terminal_unavailable",
        "message": (
            f"All {total} terminal{'s' if total != 1 else ''} for this broker are "
            f"already in use by other accounts ({used}/{total}). Run "
            f"clone-terminals.ps1 on the worker to add another."
        ),
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
    claimed_path: str | None = None

    if not terminal_path:
        # No terminal yet: this is a new account, and picking one is the worker's
        # job rather than the user's. The choice is returned in the result so the
        # control plane can persist it -- an account must keep its terminal, or
        # every restart resets its warm session and re-downloads history.
        terminal_path = _assign_terminal(client, row)
        if terminal_path is None:
            return _no_terminal_result(client, row)
        claimed_path = terminal_path

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

    # Read health AND diagnostics while still attached to the account under
    # test. restore_account switches the terminal back to whatever the copier
    # was using, and anything read after that describes the restored terminal,
    # not this one -- which made every account report an identical ping.
    health = session.get_health() if ok else {}
    diag = session.connector.terminal_diagnostics() if ok else {}

    if restore_account:
        mgr.ensure_account(restore_account)

    if ok:
        result = {
            "success": True,
            "message": msg,
            "balance": health.get("balance"),
            "equity": health.get("equity"),
            "currency": health.get("currency"),
            # Round trip to this broker's trade server. Copy latency cannot go
            # below it, so it is the number that says whether a slow broker is a
            # distance problem or a configuration one.
            "ping_ms": diag.get("ping_ms"),
            "terminal_build": diag.get("terminal_build"),
        }
        if claimed_path:
            result["terminal_path"] = claimed_path
            result["message"] = f"{msg} (terminal: {_folder_of(claimed_path)})"
        return result

    # A failed login says nothing about the terminal being the wrong one, so a
    # claim is NOT persisted here. Retrying down the list of free terminals would
    # burn every slot on a single mistyped password.
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
    pool: Any = None,
) -> dict[str, Any]:
    cmd_type = command.get("command_type")
    account_id = command.get("trading_account_id")

    if cmd_type == "test_connection":
        restore = (
            Mt5Account.from_session(master_session) if master_session else None
        )
        return test_connection_command(command, restore_account=restore)

    session = sessions.get(account_id or "")

    if cmd_type in ("flatten", "close_position"):
        if not session:
            return {
                "success": False,
                "error": "The worker is not running this account. Check it is enabled on the Trade Copier page.",
            }
        if cmd_type == "flatten":
            return flatten_account(session, pool=pool)
        from engine.manual_close import requested_tickets

        tickets = requested_tickets(command.get("payload"))
        return close_positions(session, tickets or [], pool=pool)

    return {"success": False, "error": f"Unknown command type: {cmd_type}"}
