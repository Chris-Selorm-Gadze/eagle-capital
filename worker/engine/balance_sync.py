"""
Periodic balance/equity sync from MT5/DXtrade to control plane.
"""

from __future__ import annotations

import os
import time
from typing import TYPE_CHECKING

import structlog

from engine.config_loader import AccountConfig
from engine.platform_capabilities import is_dxtrade, is_mt5
from engine.position_feed import account_payload, report_accounts

if TYPE_CHECKING:
    from engine.account_session import AccountSession

logger = structlog.get_logger()

_last_sync: float = 0.0


def should_sync_balances() -> bool:
    global _last_sync
    interval = int(os.environ.get("WORKER_BALANCE_SYNC_SECONDS", "90"))
    now = time.time()
    if now - _last_sync < interval:
        return False
    _last_sync = now
    return True


def sync_all_balances(
    accounts: list[AccountConfig],
    sessions: dict[str, "AccountSession"],
) -> int:
    from engine.api_client import get_api_client

    client = get_api_client()
    if not client.enabled or not client.user_id:
        return 0

    updates: list[dict] = []
    snapshots: list[dict] = []

    for acc in accounts:
        if not acc.enabled:
            continue
        try:
            session = sessions.get(acc.id)
            row = _read_balance(acc, session)
            if row:
                updates.append(row)
                # The terminal is already on this account, so its open positions
                # cost nothing to read here. For every account except the master
                # this sweep is the only visit that happens at all, which is why
                # the page shows each account's age rather than one clock.
                positions = _read_positions(acc, session)
                if positions is not None:
                    snapshots.append(account_payload(
                        acc.id, positions, row,
                        digits_lookup=lambda sym, s=session: (
                            (s.connector.get_symbol_info(sym) or {}).get("digits")
                        ),
                    ))
        except Exception as exc:
            logger.debug("balance_sync_skip", account=acc.id, error=str(exc))

    report_accounts(snapshots)

    if not updates:
        return 0

    try:
        client.post_account_balances(updates)
        logger.info("balance_sync_ok", count=len(updates))
    except Exception as exc:
        logger.warning("balance_sync_failed", error=str(exc))
        return 0

    return len(updates)


def _read_positions(
    acc: AccountConfig,
    session: "AccountSession | None",
) -> list[dict] | None:
    """Open positions for an account the sweep has just attached to.

    None means "could not read", which the feed treats as "say nothing about
    this account" -- reporting an empty list instead would tell the page every
    position had closed.
    """
    if not is_mt5(acc.platform) or not session:
        return None
    try:
        return session.connector.get_open_positions()
    except Exception as exc:
        logger.debug("position_read_skip", account=acc.id, error=str(exc))
        return None


def _read_balance(
    acc: AccountConfig,
    session: "AccountSession | None",
) -> dict | None:
    if is_dxtrade(acc.platform):
        from adapters.dxtrade_adapter import DXtradeAdapter

        adapter = DXtradeAdapter()
        if not adapter.connect(
            {
                "username": acc.login,
                "password": acc.password,
                "domain": acc.server,
                "api_base_url": acc.api_base_url,
                "broker_server": acc.api_base_url,
            }
        ):
            return None
        positions = adapter.get_open_positions()
        del positions
        return {
            "trading_account_id": acc.id,
            "connection_status": "connected",
        }

    if not is_mt5(acc.platform) or not session:
        return None

    if not session.connect():
        return None

    info = session.connector.get_account_info()
    if not info:
        return None

    return {
        "trading_account_id": acc.id,
        "balance": info.get("balance"),
        "equity": info.get("equity"),
        "currency": info.get("currency"),
        "connection_status": "connected",
    }
