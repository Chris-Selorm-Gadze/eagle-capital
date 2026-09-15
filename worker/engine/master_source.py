"""
Master position polling — MT5 terminal or DXtrade REST.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, List, Optional

import structlog

from engine.account_session import AccountSession
from engine.config_loader import AccountConfig
from engine.terminal_session_manager import Mt5Account, get_terminal_manager

logger = structlog.get_logger()


class MasterPositionSource(ABC):
    @abstractmethod
    def connect(self) -> bool: ...

    @abstractmethod
    def get_open_positions(self) -> List[dict]: ...

    @property
    @abstractmethod
    def platform(self) -> str: ...


class MT5MasterSource(MasterPositionSource):
    def __init__(self, session: AccountSession):
        self.session = session

    @property
    def platform(self) -> str:
        return "mt5"

    def connect(self) -> bool:
        return self.session.connect()

    def get_open_positions(self) -> List[dict]:
        mgr = get_terminal_manager()
        if not mgr.ensure_account(Mt5Account.from_session(self.session)):
            return []
        try:
            import MetaTrader5 as mt5
        except ImportError:
            return self.session.connector.get_open_positions()

        info = mt5.account_info()
        expected = int(self.session.login) if str(self.session.login).isdigit() else 0
        if info is None or int(info.login) != expected:
            logger.warning(
                "mt5_master_wrong_login",
                expected=expected,
                actual=int(info.login) if info else None,
            )
            return []
        return self.session.connector.get_open_positions()


class DXtradeMasterSource(MasterPositionSource):
    def __init__(self, account: AccountConfig):
        self.account = account
        self._adapter = None

    @property
    def platform(self) -> str:
        return "dxtrade"

    def connect(self) -> bool:
        from adapters.dxtrade_adapter import DXtradeAdapter

        self._adapter = DXtradeAdapter()
        ok = self._adapter.connect(
            {
                "username": self.account.login,
                "password": self.account.password,
                "domain": self.account.server,
                "api_base_url": self.account.api_base_url,
                "broker_server": self.account.api_base_url,
            }
        )
        if not ok:
            logger.error("dxtrade_master_connect_failed", account=self.account.id)
        return ok

    def get_open_positions(self) -> List[dict]:
        if not self._adapter:
            if not self.connect():
                return []
        return self._adapter.get_open_positions()


def build_master_source(
    account: AccountConfig,
    session: Optional[AccountSession],
) -> MasterPositionSource:
    platform = str(account.platform or "mt5").lower()
    if platform == "dxtrade":
        return DXtradeMasterSource(account)
    if not session:
        raise RuntimeError(f"MT5 master requires AccountSession for {account.id}")
    return MT5MasterSource(session)
