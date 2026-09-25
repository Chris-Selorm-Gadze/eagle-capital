"""
Push signals from the database: "a command is waiting" and "your config changed".

The worker used to find both out by asking -- pending commands every two
seconds, the whole runtime config every few -- which was most of its gateway
traffic and still left a Close click waiting up to two seconds to be seen.
supabase/migrations-worker-direct.sql adds triggers that NOTIFY instead:

  worker_commands   an insert into worker_commands (a Close, a flatten, a
                    connection test, a reload)
  worker_config     a copy link, symbol mapping, risk profile, or an account's
                    config columns changed

each with the owning user's id as the payload. This module holds one dedicated
connection LISTENing on both and turns them into two flags the copy loop and
the idle loop check every pass.

Robustness is the whole design:

  * The table is the source of truth, the NOTIFY only a doorbell. A doorbell
    rung while the connection was down is lost -- so every (re)connect raises
    both flags, and the loops re-read the table and the config at once.
  * Callers keep a safety poll. While the listener is connected it is slow
    (WORKER_COMMAND_SAFETY_POLL_SECONDS); while it is not, callers fall back to
    their old fast interval, so a dead listener degrades to the old behaviour
    rather than to silence.
  * The connection is pinged between waits, so a half-open socket is noticed
    in seconds, and reconnects back off to 30s.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Optional

import structlog

logger = structlog.get_logger()

COMMANDS_CHANNEL = "worker_commands"
CONFIG_CHANNEL = "worker_config"


def safety_poll_seconds() -> float:
    """How often callers still check the table while the listener is healthy."""
    return float(os.environ.get("WORKER_COMMAND_SAFETY_POLL_SECONDS", "30"))


class Signals:
    """The two flags, plus a wake-up for anything sleeping between passes.

    With no listener (no WORKER_DATABASE_URL) this is inert: healthy() is
    False, so every caller uses its old interval, and the flags never rise.
    """

    def __init__(self) -> None:
        self._commands = threading.Event()
        self._config = threading.Event()
        self._wake = threading.Event()

    def healthy(self) -> bool:
        return False

    def raise_commands(self) -> None:
        self._commands.set()
        self._wake.set()

    def raise_config(self) -> None:
        self._config.set()
        self._wake.set()

    def take_commands(self) -> bool:
        """True once per raise: whether commands may be waiting."""
        if self._commands.is_set():
            self._commands.clear()
            return True
        return False

    def take_config(self) -> bool:
        if self._config.is_set():
            self._config.clear()
            return True
        return False

    def wait(self, timeout: float) -> bool:
        """Sleep up to ``timeout``, returning early (True) when a signal lands --
        so an idle worker acts on a Close at once instead of at its next tick."""
        woke = self._wake.wait(max(0.0, timeout))
        self._wake.clear()
        return woke

    def stop(self) -> None:
        pass


class ListenerSignals(Signals):
    """Signals fed by a LISTEN connection on its own daemon thread."""

    def __init__(self, dsn: str, user_id: str, *, connect=None) -> None:
        super().__init__()
        self.dsn = dsn
        self.user_id = str(user_id)
        self._connect = connect
        self._connected = threading.Event()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._ping_s = float(os.environ.get("WORKER_DB_LISTEN_PING_SECONDS", "15"))

    def healthy(self) -> bool:
        return self._connected.is_set()

    def start(self) -> "ListenerSignals":
        if self._thread is None:
            self._thread = threading.Thread(
                target=self._run, name="db-listener", daemon=True
            )
            self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()

    def _open(self):
        if self._connect is not None:
            return self._connect()
        import psycopg

        from engine.direct_client import connection_kwargs

        return psycopg.connect(self.dsn, **connection_kwargs())

    def _deliver(self, channel: str, payload: str) -> None:
        if payload and payload != self.user_id:
            return  # somebody else's account
        if channel == COMMANDS_CHANNEL:
            self.raise_commands()
        elif channel == CONFIG_CHANNEL:
            self.raise_config()

    def serve_once(self, conn) -> None:
        """LISTEN on an open connection and deliver until it breaks or stop().

        Split out of _run so tests can drive it with a fake connection."""
        conn.execute(f"LISTEN {COMMANDS_CHANNEL}")
        conn.execute(f"LISTEN {CONFIG_CHANNEL}")
        self._connected.set()
        # Catch up: anything rung while we were not listening is in the table.
        self.raise_commands()
        self.raise_config()
        logger.info("db_listener_connected", channels=[COMMANDS_CHANNEL, CONFIG_CHANNEL])
        while not self._stop.is_set():
            for note in conn.notifies(timeout=self._ping_s):
                self._deliver(note.channel, note.payload)
                if self._stop.is_set():
                    break
            # Between waits: prove the socket is alive. A half-open connection
            # can otherwise sit "listening" for hours and hear nothing.
            conn.execute("select 1")

    def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            conn = None
            started = time.monotonic()
            try:
                conn = self._open()
                self.serve_once(conn)
            except Exception as exc:
                if not self._stop.is_set():
                    logger.warning(
                        "db_listener_disconnected",
                        error=str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__,
                        retry_s=backoff,
                        hint="Commands fall back to interval polling until it reconnects.",
                    )
            finally:
                self._connected.clear()
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass
            # A connection that lived a while earned a fast reconnect.
            if time.monotonic() - started > 60:
                backoff = 1.0
            if self._stop.wait(backoff):
                break
            backoff = min(backoff * 2, 30.0)


_signals: Optional[Signals] = None
_lock = threading.Lock()


def get_signals() -> Signals:
    """This process's signals, starting the listener on first use when the
    direct database path is configured."""
    global _signals
    if _signals is not None:
        return _signals
    with _lock:
        if _signals is None:
            from engine.api_client import get_api_client

            client = get_api_client()
            dsn = os.environ.get("WORKER_DATABASE_URL", "").strip()
            if dsn and client.user_id and client.direct is not None:
                _signals = ListenerSignals(dsn, client.user_id).start()
            else:
                _signals = Signals()
    return _signals


def current_signals() -> Optional[Signals]:
    """This process's signals if something has started them -- never starts
    the listener itself."""
    return _signals


def reset_signals(signals: Optional[Signals] = None) -> None:
    """Tests: install a given Signals, or clear so the next get builds one."""
    global _signals
    if _signals is not None and _signals is not signals:
        _signals.stop()
    _signals = signals
