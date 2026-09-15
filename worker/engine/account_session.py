"""
Account session: connect, confirm health, and manage MT5 login lifecycle.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional

import structlog

from engine.mt5_connector import MT5Connector
from engine.terminal_session_manager import Mt5Account, get_terminal_manager

logger = structlog.get_logger()


class ConnectionStatus(str, Enum):
    connected = "connected"
    disconnected = "disconnected"
    auth_failed = "auth_failed"
    terminal_unavailable = "terminal_unavailable"
    broker_unavailable = "broker_unavailable"
    disabled = "disabled"
    locked = "locked"


@dataclass
class AccountSession:
    account_id: str
    label: str
    role: str
    login: str
    password: str
    server: str
    terminal_path: Optional[str] = None
    platform: str = "mt5"
    api_base_url: Optional[str] = None

    def __post_init__(self):
        mt5_login = int(self.login) if str(self.login).isdigit() else 0
        self._connector = MT5Connector(
            login=mt5_login,
            password=self.password,
            server=self.server,
            terminal_path=self.terminal_path,
        )
        self._initialized = False

    @property
    def connector(self) -> MT5Connector:
        return self._connector

    def connect(self, terminal_already_running: bool = False) -> bool:
        del terminal_already_running
        if self.platform == "dxtrade":
            self._initialized = True
            self._connector.connected = True
            return True
        mgr = get_terminal_manager()
        if not mgr.ensure_account(Mt5Account.from_session(self)):
            return False
        self._initialized = True
        self._connector.connected = True
        return True

    def switch_login(self) -> bool:
        """Switch to this account on the shared MT5 terminal (login or re-init)."""
        return self.connect()

    def mark_terminal_ready(self) -> None:
        """Mark session as sharing an already-initialized MT5 terminal."""
        self._initialized = True
        self._connector.connected = True

    def disconnect(self) -> None:
        """Detach session without shutting down the shared MT5 IPC connection."""
        self._initialized = False
        self._connector.connected = False

    def is_connected(self) -> bool:
        return self._connector.connected and self._connector.get_account_info() is not None

    def get_health(self) -> Dict[str, Any]:
        info = self._connector.get_account_info()
        if info is None:
            err = self._connector.last_error()
            status = ConnectionStatus.auth_failed
            if err and err[0] == -10004:
                status = ConnectionStatus.terminal_unavailable
            return {
                "account_id": self.account_id,
                "label": self.label,
                "role": self.role,
                "status": status.value,
                "login": self.login,
                "server": self.server,
                "connected": False,
                "last_error": err,
            }

        return {
            "account_id": self.account_id,
            "label": self.label,
            "role": self.role,
            "status": ConnectionStatus.connected.value,
            "login": info.get("login"),
            "server": info.get("server"),
            "name": info.get("name"),
            "balance": info.get("balance"),
            "equity": info.get("equity"),
            "currency": info.get("currency"),
            "leverage": info.get("leverage"),
            "connected": True,
            "last_error": None,
        }

    def confirm_connected(self, probe_symbol: str = "EURUSD") -> tuple[bool, str]:
        health = self.get_health()
        if not health.get("connected"):
            return False, f"Not connected: {health.get('last_error')}"

        expected_login = int(self.login) if str(self.login).isdigit() else 0
        actual_login = int(health.get("login") or 0)
        if actual_login != expected_login:
            return False, f"Login mismatch: expected {expected_login}, got {actual_login}"

        candidates = [probe_symbol]
        for sym in ("EURUSDm", "EURUSD", "XAUUSDm", "XAUUSD", "BTCUSDm", "BTCUSD"):
            if sym not in candidates:
                candidates.append(sym)

        for sym in candidates:
            if self._connector.get_symbol_info(sym) is not None:
                return True, f"Connection confirmed ({sym})"

        return False, f"Cannot load symbol {probe_symbol} (market data unavailable)"
