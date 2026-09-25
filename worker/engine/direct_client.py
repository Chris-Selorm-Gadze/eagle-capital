"""
The worker's direct connection to the database.

Every call the worker used to make to the copier-gateway Edge Function has a
twin here: a SECURITY DEFINER function in the `worker_api` schema
(supabase/migrations-worker-direct.sql), called over one pooled Postgres
connection as the `copier_worker` role. Same inputs, same results -- so
ControlApiClient can use either path for any call, and does: this one first,
the gateway whenever this one cannot answer.

Why: the gateway charged an Edge Function invocation per call, and the worker
made ~110,000 of them a day per armed master. A pooled connection costs none,
and a call on it is ~10-40 ms instead of ~100-300 ms plus the occasional cold
start.

Enabled by WORKER_DATABASE_URL. Without it nothing here runs and the worker
behaves exactly as before.
"""

from __future__ import annotations

import json
import math
import os
import threading
import time
from typing import Any, Callable, Optional

import structlog

from engine.credentials import CredentialError, decrypt_password, parse_key

logger = structlog.get_logger()


class DirectUnavailable(Exception):
    """This call cannot be served directly; ask the gateway instead."""


class DirectRejected(Exception):
    """The database gave a real answer, and it is no. Asking the gateway would
    get the same answer, so this is raised to the caller as-is."""


class NothingToRun(DirectRejected):
    """The gateway's 404 from /internal/runtime-config: no enabled account is
    in a copy link or journalled. A normal state for a new user."""


# Errors that mean the path is down (network, pool, auth) or not installed
# (migration not run, role lacks a grant) rather than that this one call was
# bad. They pause the direct path for a while instead of retrying every call.
_OUTAGE_SQLSTATE_PREFIXES = ("08", "28", "53", "57", "3D", "3F")
_NOT_INSTALLED_SQLSTATES = {"42883", "42501", "3F000"}


def _clean(value: Any) -> Any:
    """JSON-safe: NaN and infinities become null. Python's json emits them as
    bare NaN, which Postgres rightly refuses -- failing the whole batch."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


def _dumps(value: Any) -> str:
    return json.dumps(_clean(value), default=str)


def _num(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    return n if math.isfinite(n) else default


# ── Runtime config, shaped exactly as the gateway shapes it ────────────────


def _derive_roles(copiers: list[dict[str, Any]]) -> dict[str, str]:
    """First mention wins, master before follower within a link."""
    roles: dict[str, str] = {}
    for row in copiers:
        roles.setdefault(str(row.get("master_account_id")), "master")
        roles.setdefault(str(row.get("follower_account_id")), "follower")
    return roles


def runtime_account(row: dict[str, Any], role: str, key: bytes) -> dict[str, Any]:
    return {
        "id": row["id"],
        "label": row.get("account_label") or str(row.get("account_number")),
        "role": role,
        "login": str(row.get("account_number")),
        "password": decrypt_password(row.get("encrypted_password") or "", key),
        "server": row.get("broker_server"),
        "terminal_path": row.get("terminal_path"),
        "broker_slug": row.get("broker_slug"),
        "api_base_url": row.get("api_base_url"),
        "platform": str(row.get("platform") or "mt5"),
        "enabled": True if row.get("is_enabled") is None else bool(row.get("is_enabled")),
        "journal_account_id": row.get("account_id"),
        "history_synced_to": row.get("history_synced_to"),
    }


def runtime_payload(user_id: str, rows: dict[str, Any], key: bytes) -> dict[str, Any]:
    """The /internal/runtime-config response, from worker_api.config_rows."""
    copiers = rows.get("copiers") or []
    linked = {
        str(r.get(k)) for r in copiers for k in ("master_account_id", "follower_account_id")
    }
    # Accounts in a link, armed or not, plus every account journalled to the
    # dashboard -- the second set keeps the journal and Live Trading running for
    # an account nobody is copying.
    accounts = [
        a for a in rows.get("accounts") or []
        if str(a.get("id")) in linked or a.get("account_id")
    ]
    if not accounts:
        raise NothingToRun("No enabled trading accounts to run for this user")

    roles = _derive_roles(copiers)
    return {
        "user_id": user_id,
        "accounts": [
            runtime_account(a, roles.get(str(a["id"]), "standalone"), key) for a in accounts
        ],
        "copiers": [
            {
                "id": r["id"],
                "master_id": r.get("master_account_id"),
                "follower_id": r.get("follower_account_id"),
                "enabled": True if r.get("is_enabled") is None else bool(r.get("is_enabled")),
                "risk_mode": r.get("risk_mode") or "multiplier",
                "multiplier": _num(r.get("multiplier"), 1.0),
                "fixed_lot_size": _num(r.get("fixed_lot_size"), 0.01),
                "copy_sl": r.get("copy_sl", True) is not False,
                "copy_tp": r.get("copy_tp", True) is not False,
                "copy_closes": r.get("copy_closes", True) is not False,
                "copy_modifications": r.get("copy_modifications", True) is not False,
                "max_signal_age_ms": int(_num(r.get("max_signal_age_ms"), 3000.0) or 0),
            }
            for r in copiers
        ],
        "symbol_mappings": [
            {
                "master_symbol": m.get("master_symbol"),
                "follower_symbol": m.get("follower_symbol"),
                "master_account_id": m.get("master_account_id"),
                "follower_account_id": m.get("follower_account_id"),
            }
            for m in rows.get("symbol_mappings") or []
        ],
        "risk_profiles": [
            {
                "id": p.get("id"),
                "account_id": p.get("account_id"),
                "max_daily_loss": _num(p.get("max_daily_loss")),
                "max_total_loss": _num(p.get("max_total_loss")),
                "min_equity": _num(p.get("min_equity")),
                "max_lot_per_trade": _num(p.get("max_lot_per_trade")),
                "max_open_positions": p.get("max_open_positions"),
                "max_trades_per_day": p.get("max_trades_per_day"),
                "allowed_symbols": p.get("allowed_symbols"),
                "blocked_symbols": p.get("blocked_symbols"),
                "is_locked": bool(p.get("is_locked") or False),
                "locked_reason": p.get("locked_reason"),
                "daily_loss_accumulated": _num(p.get("daily_loss_accumulated"), 0.0),
                "daily_trades_count": int(_num(p.get("daily_trades_count"), 0.0) or 0),
            }
            for p in rows.get("risk_profiles") or []
        ],
    }


# ── The client ──────────────────────────────────────────────────────────────


def connection_kwargs() -> dict[str, Any]:
    """Settings for every connection, the listener's included.

    autocommit: each worker_api call is its own transaction, so nothing ever
    sits idle in one. prepare_threshold=None: Supabase's pooler cannot carry
    server-side prepared statements across its connections. Keepalives: a NAT
    on the Windows side must not silently drop the listener."""
    return {
        "autocommit": True,
        "prepare_threshold": None,
        "connect_timeout": int(os.environ.get("WORKER_DB_CONNECT_TIMEOUT_SECONDS", "10")),
        "application_name": "eagle-worker",
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
    }


class DirectDbClient:
    """Calls worker_api.* over a small connection pool.

    Thread-safe: the copy loop, the heartbeat thread, the journal and the
    position sweep all call in from their own threads, each on its own pooled
    connection, so a slow journal write never queues a command fetch behind it.
    """

    def __init__(
        self,
        dsn: str,
        user_id: str,
        *,
        encryption_key: Optional[bytes] = None,
        pool_factory: Optional[Callable[[], Any]] = None,
    ) -> None:
        self.dsn = dsn
        self.user_id = user_id
        self._key = encryption_key
        self._pool_factory = pool_factory
        self._pool: Any = None
        self._pool_lock = threading.Lock()
        self._down_until = 0.0
        self._down = False
        self._retry_s = float(os.environ.get("WORKER_DB_RETRY_SECONDS", "15"))
        self._not_installed_retry_s = 300.0

    @classmethod
    def from_env(cls, user_id: str) -> Optional["DirectDbClient"]:
        dsn = os.environ.get("WORKER_DATABASE_URL", "").strip()
        if not dsn or not user_id:
            return None
        try:
            import psycopg  # noqa: F401
            import psycopg_pool  # noqa: F401
        except ImportError as exc:
            import sys

            logger.warning(
                "direct_db_driver_missing",
                error=str(exc),
                python=sys.executable,
                hint=(
                    "venv\\Scripts\\python.exe -m pip install -r requirements.txt "
                    "-- falling back to the gateway until then"
                ),
            )
            return None
        key = None
        try:
            key = parse_key(os.environ.get("ENCRYPTION_KEY"))
        except CredentialError as exc:
            logger.warning("direct_db_encryption_key_invalid", error=str(exc))
        if key is None:
            logger.info(
                "direct_db_config_via_gateway",
                reason="ENCRYPTION_KEY not set on the worker",
                hint="Runtime config is still read through the gateway; everything else is direct.",
            )
        return cls(dsn, user_id, encryption_key=key)

    # ── Health ──────────────────────────────────────────────────────────────

    @property
    def can_decrypt(self) -> bool:
        return self._key is not None

    def available(self) -> bool:
        return time.monotonic() >= self._down_until

    def mark_down(self, operation: str, exc: BaseException) -> None:
        sqlstate = getattr(exc, "sqlstate", None) or ""
        not_installed = sqlstate in _NOT_INSTALLED_SQLSTATES
        pause = self._not_installed_retry_s if not_installed else self._retry_s
        self._down_until = time.monotonic() + pause
        if not self._down:
            self._down = True
            error = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
            reason = self._why_no_connection(exc)
            logger.warning(
                "direct_db_unavailable",
                operation=operation,
                error=error,
                reason=reason,
                sqlstate=sqlstate or None,
                retry_s=pause,
                hint=(
                    "Run supabase/migrations-worker-direct.sql and grant the role a password."
                    if not_installed
                    else "Falling back to the copier-gateway until the database answers again."
                ),
            )

    def _why_no_connection(self, exc: BaseException) -> Optional[str]:
        """The real cause behind a pool timeout, which only says it gave up.

        Once per outage (mark_down logs only on the transition), a single plain
        connect: its error names the wrong password or the unreachable host."""
        try:
            import psycopg
            from psycopg_pool import PoolTimeout
        except ImportError:  # pragma: no cover
            return None
        if not isinstance(exc, PoolTimeout):
            return None
        try:
            kwargs = {**connection_kwargs(), "connect_timeout": 5}
            with psycopg.connect(self.dsn, **kwargs):
                return "a direct connect succeeds -- the pool may be exhausted"
        except Exception as probe:
            return " ".join(str(probe).split()) or type(probe).__name__

    def mark_up(self) -> None:
        if self._down:
            self._down = False
            logger.info("direct_db_restored")

    @staticmethod
    def is_outage(exc: BaseException) -> bool:
        """Whether an error means the path is down, as opposed to one bad call."""
        try:
            import psycopg
            from psycopg_pool import PoolTimeout
        except ImportError:  # pragma: no cover
            return True
        if isinstance(exc, (psycopg.OperationalError, psycopg.InterfaceError, PoolTimeout)):
            return True
        sqlstate = getattr(exc, "sqlstate", None) or ""
        return sqlstate in _NOT_INSTALLED_SQLSTATES or sqlstate.startswith(_OUTAGE_SQLSTATE_PREFIXES)

    # ── Plumbing ────────────────────────────────────────────────────────────

    def _get_pool(self) -> Any:
        if self._pool is not None:
            return self._pool
        with self._pool_lock:
            if self._pool is None:
                if self._pool_factory is not None:
                    self._pool = self._pool_factory()
                else:
                    from psycopg_pool import ConnectionPool

                    pool = ConnectionPool(
                        self.dsn,
                        min_size=1,
                        # Small on purpose: every process holds one of these plus a
                        # listener, and the Session pooler caps connections per
                        # role -- three masters at 3+1 each would crowd it.
                        max_size=int(os.environ.get("WORKER_DB_POOL_SIZE", "2")),
                        kwargs=connection_kwargs(),
                        timeout=float(os.environ.get("WORKER_DB_POOL_TIMEOUT_SECONDS", "5")),
                        max_idle=300,
                        name="worker-direct",
                        open=False,
                    )
                    pool.open(wait=False)
                    self._pool = pool
        return self._pool

    def close(self) -> None:
        pool, self._pool = self._pool, None
        if pool is not None:
            try:
                pool.close(timeout=2)
            except Exception:
                pass

    def call(self, function: str, *args: Any) -> Any:
        """``select worker_api.<function>(args...)`` -> the single value.

        One retry on a broken connection: a pooled connection the pooler closed
        while idle fails its first use, and a fresh one from the pool is the
        fix -- not a trip to the gateway.
        """
        import psycopg
        from psycopg.types.json import Jsonb

        params = [Jsonb(a, dumps=_dumps) if isinstance(a, (dict, list)) else a for a in args]
        placeholders = ", ".join(["%s"] * len(params))
        sql = f"select worker_api.{function}({placeholders})"
        for attempt in (1, 2):
            try:
                with self._get_pool().connection() as conn:
                    row = conn.execute(sql, params).fetchone()
                return row[0] if row else None
            except psycopg.errors.NoDataFound as exc:
                raise DirectRejected(str(exc).strip()) from exc
            except (psycopg.OperationalError, psycopg.InterfaceError):
                if attempt == 2:
                    raise
        return None  # pragma: no cover

    # ── The gateway's routes ────────────────────────────────────────────────

    def fetch_runtime_config(self) -> dict[str, Any]:
        if self._key is None:
            raise DirectUnavailable("ENCRYPTION_KEY not set on the worker")
        rows = self.call("config_rows", self.user_id) or {}
        try:
            return runtime_payload(self.user_id, rows, self._key)
        except CredentialError as exc:
            # Loud: every account under a wrong key is unusable. The gateway
            # has its own copy of the key, so asking it still works meanwhile.
            logger.error("direct_db_decrypt_failed", error=str(exc))
            raise DirectUnavailable(str(exc)) from exc

    def fetch_trading_account(self, account_id: str) -> dict[str, Any]:
        if self._key is None:
            raise DirectUnavailable("ENCRYPTION_KEY not set on the worker")
        row = self.call("trading_account", self.user_id, account_id)
        if not row:
            raise DirectRejected("Account not found")
        try:
            return runtime_account(row, "master", self._key)
        except CredentialError as exc:
            logger.error("direct_db_decrypt_failed", error=str(exc))
            raise DirectUnavailable(str(exc)) from exc

    def whoami(self) -> dict[str, Any]:
        return self.call("whoami", self.user_id) or {}

    def fetch_open_links(self) -> list[dict[str, Any]]:
        return self.call("open_links", self.user_id) or []

    def insert_events(self, events: list[dict[str, Any]]) -> int:
        return int(self.call("insert_events", self.user_id, events) or 0)

    def register_worker(self, payload: dict[str, Any]) -> str:
        worker_id = self.call(
            "register_worker",
            self.user_id,
            payload.get("worker_name"),
            payload.get("region"),
            payload.get("host_identifier"),
            payload.get("capacity"),
            payload.get("metadata") or {},
        )
        return str(worker_id)

    def heartbeat(self, worker_id: str, active_sessions: int, metadata: dict[str, Any]) -> None:
        self.call("heartbeat", self.user_id, worker_id, active_sessions, metadata)

    def session_started(
        self, worker_id: str, account_id: str, terminal_path: Optional[str], pid: Optional[int]
    ) -> None:
        self.call("session_started", self.user_id, worker_id, account_id, terminal_path, pid)

    def session_failed(self, worker_id: str, account_id: str, error: str) -> None:
        self.call("session_failed", self.user_id, worker_id, account_id, error)

    def pending_commands(self) -> list[dict[str, Any]]:
        return self.call("pending_commands", self.user_id) or []

    def complete_command(
        self, command_id: str, success: bool, result: dict[str, Any], error: Optional[str]
    ) -> None:
        self.call("complete_command", self.user_id, command_id, success, result or {}, error)

    def update_balances(self, accounts: list[dict[str, Any]]) -> None:
        self.call("update_balances", self.user_id, accounts)

    def update_positions(self, accounts: list[dict[str, Any]]) -> None:
        self.call("update_positions", self.user_id, accounts)

    def journal_trades(
        self, account_id: str, trades: list[dict[str, Any]], synced_to: Optional[str]
    ) -> dict[str, Any]:
        return self.call("journal_trades", self.user_id, account_id, trades, synced_to) or {}
