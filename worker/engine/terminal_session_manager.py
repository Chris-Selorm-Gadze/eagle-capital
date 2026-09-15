"""
Central MT5 terminal access — one IPC connection per process, explicit account switching.

Same broker path: mt5.login() only (no shutdown).
Different broker path: shutdown + initialize with target credentials.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Optional

import structlog

logger = structlog.get_logger()

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None


def normalize_terminal_path(path: Optional[str]) -> str:
    if not path:
        return ""
    return os.path.normcase(os.path.normpath(path.strip()))


def normalize_server(server: str) -> str:
    import re

    s = server.strip()
    if not s:
        return s
    return re.sub(r"\s*-\s*", "-", s)


@dataclass(frozen=True)
class Mt5Account:
    login: int
    password: str
    server: str
    terminal_path: Optional[str] = None

    @classmethod
    def from_session(cls, session: object) -> "Mt5Account":
        login = int(session.login) if str(session.login).isdigit() else 0
        return cls(
            login=login,
            password=str(session.password),
            server=normalize_server(str(session.server)),
            terminal_path=getattr(session, "terminal_path", None),
        )


class TerminalSessionManager:
    """Process-wide singleton for MetaTrader5 IPC."""

    _instance: Optional["TerminalSessionManager"] = None
    _singleton_lock = threading.Lock()

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._attached = False
        self._active_path: str = ""
        self._active_login: Optional[int] = None
        self._active_server: str = ""
        self._reconnect_grace_until: float = 0.0
        self._last_switch_cross_terminal: bool = False

    @classmethod
    def get(cls) -> "TerminalSessionManager":
        with cls._singleton_lock:
            if cls._instance is None:
                cls._instance = TerminalSessionManager()
            return cls._instance

    def begin_reconnect_grace(self, seconds: float = 3.0) -> None:
        self._reconnect_grace_until = time.time() + seconds

    def in_reconnect_grace(self) -> bool:
        return time.time() < self._reconnect_grace_until

    def last_switch_was_cross_terminal(self) -> bool:
        return self._last_switch_cross_terminal

    def active_login(self) -> Optional[int]:
        return self._active_login

    def ensure_account(
        self,
        account: Mt5Account,
        *,
        timeout_ms: int = 120_000,
    ) -> bool:
        if mt5 is None:
            logger.error("mt5_not_installed")
            return False

        target_path = normalize_terminal_path(account.terminal_path)
        target_server = normalize_server(account.server)

        with self._lock:
            # An empty target path means "use whichever terminal is already
            # running" (common for same-broker followers without an explicit
            # path). Treat that as the active terminal so we do a fast
            # mt5.login() switch instead of a costly shutdown + initialize.
            same_terminal = self._attached and (
                target_path == "" or self._active_path == target_path
            )

            if same_terminal and self._is_active_login(account.login, target_server):
                self._last_switch_cross_terminal = False
                return True

            if same_terminal:
                logger.info(
                    "mt5_login_switch_same_terminal",
                    from_login=self._active_login,
                    to_login=account.login,
                    path=target_path or self._active_path or "default",
                )
                if not mt5.login(
                    login=account.login,
                    password=account.password,
                    server=target_server,
                ):
                    err = mt5.last_error()
                    logger.error("mt5_login_switch_failed", login=account.login, error=err)
                    return False
                self._active_login = account.login
                self._active_server = target_server
                self._last_switch_cross_terminal = False
                return True

            if self._attached:
                logger.info(
                    "mt5_terminal_shutdown",
                    from_path=self._active_path or "default",
                    to_path=target_path or "default",
                )
                mt5.shutdown()
                self._attached = False
                self.begin_reconnect_grace(3.0)

            init_kwargs: dict = {
                "login": account.login,
                "password": account.password,
                "server": target_server,
                "timeout": timeout_ms,
            }
            if account.terminal_path:
                init_kwargs["path"] = account.terminal_path

            if not mt5.initialize(**init_kwargs):
                err = mt5.last_error()
                logger.error("mt5_initialize_failed", login=account.login, error=err)
                return False

            self._attached = True
            self._active_path = target_path
            self._active_login = account.login
            self._active_server = target_server
            self._last_switch_cross_terminal = True
            self.begin_reconnect_grace(3.0)
            logger.info(
                "mt5_initialize_success",
                login=account.login,
                server=target_server,
                path=target_path or "default",
            )
            return True

    def verify_account(self, account: Mt5Account) -> tuple[bool, str]:
        if not self.ensure_account(account):
            err = mt5.last_error() if mt5 else (-1, "MT5 unavailable")
            return False, f"Could not connect: {err}"

        info = mt5.account_info()
        if info is None:
            err = mt5.last_error()
            return False, f"account_info failed: {err}"

        if int(info.login) != account.login:
            return (
                False,
                f"Logged into account {info.login} on {info.server}, "
                f"expected {account.login} on {account.server}.",
            )

        if normalize_server(str(info.server)) != normalize_server(account.server):
            return (
                False,
                f"Server mismatch: terminal on {info.server}, expected {account.server}.",
            )

        return True, "Connected successfully"

    def release(self, *, shutdown: bool = False) -> None:
        with self._lock:
            if shutdown and self._attached and mt5 is not None:
                mt5.shutdown()
                self._attached = False
                self._active_path = ""
                self._active_login = None
                self._active_server = ""
                logger.info("mt5_released")

    def _is_active_login(self, login: int, server: str) -> bool:
        if not self._attached or mt5 is None:
            return False
        info = mt5.account_info()
        if info is None:
            return False
        return int(info.login) == login and normalize_server(str(info.server)) == server


def get_terminal_manager() -> TerminalSessionManager:
    return TerminalSessionManager.get()
