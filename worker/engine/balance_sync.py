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

    for acc in accounts:
        if not acc.enabled:
            continue
        try:
            row = _read_balance(acc, sessions.get(acc.id))
            if row:
                updates.append(row)
        except Exception as exc:
            logger.debug("balance_sync_skip", account=acc.id, error=str(exc))

    if not updates:
        return 0

    try:
        client.post_account_balances(updates)
        logger.info("balance_sync_ok", count=len(updates))
    except Exception as exc:
        logger.warning("balance_sync_failed", error=str(exc))
        return 0

    return len(updates)


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
