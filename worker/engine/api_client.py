"""
The worker's control plane: its config, its commands, and everything it reports.

Two paths to the same data. The direct one -- a pooled Postgres connection
calling the worker_api functions (engine/direct_client.py) -- is used whenever
WORKER_DATABASE_URL is set and the database answers. The copier-gateway Edge
Function is the fallback: every public method here tries direct first and, if
the database cannot answer, makes the same call over HTTP. So a database outage
costs gateway invocations for its duration, never a lost command or trade.
"""

from __future__ import annotations

import atexit
import os
import socket
import threading
import time
from typing import Any, Optional

import httpx
import structlog

from engine.direct_client import DirectDbClient, DirectRejected, DirectUnavailable
from engine.env_loader import load_worker_env

logger = structlog.get_logger()


class ControlApiClient:
    def __init__(self) -> None:
        load_worker_env()
        # No localhost default. This worker's entire job is to talk to a remote
        # gateway; falling back to http://localhost:8000 turned a missing API_URL
        # into four "connection actively refused" retries against a machine that
        # was never going to answer, which reads as a network fault rather than a
        # one-line config mistake.
        self.base_url = os.environ.get("API_URL", "").strip().rstrip("/")
        self.worker_key = os.environ.get("WORKER_API_KEY", "")
        self.user_id = os.environ.get("WORKER_USER_ID", "")
        self.worker_name = os.environ.get("WORKER_NAME", "worker-local-01")
        self.worker_region = os.environ.get("WORKER_REGION", "local")
        self.worker_capacity = int(os.environ.get("WORKER_CAPACITY", "5"))
        self.worker_id: Optional[str] = None
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._heartbeat_stop = threading.Event()
        read_timeout = float(os.environ.get("WORKER_API_READ_TIMEOUT_SECONDS", "90"))
        connect_timeout = float(os.environ.get("WORKER_API_CONNECT_TIMEOUT_SECONDS", "15"))
        self._http = httpx.Client(
            timeout=httpx.Timeout(read_timeout, connect=connect_timeout),
            limits=httpx.Limits(max_keepalive_connections=16, max_connections=32),
        )
        self.direct: Optional[DirectDbClient] = DirectDbClient.from_env(self.user_id)
        atexit.register(self.close)

    def close(self) -> None:
        try:
            self._http.close()
        except Exception:
            pass
        if self.direct is not None:
            self.direct.close()

    @property
    def http_enabled(self) -> bool:
        return bool(self.base_url and self.worker_key and self.user_id)

    @property
    def enabled(self) -> bool:
        return self.http_enabled or bool(self.direct is not None and self.user_id)

    def missing_settings(self) -> list[str]:
        """Which required values are absent. Named so callers can say which."""
        missing = []
        if not self.user_id:
            missing.append("WORKER_USER_ID")
        if self.direct is None:
            if not self.base_url:
                missing.append("API_URL")
            if not self.worker_key:
                missing.append("WORKER_API_KEY")
        return missing

    def _route(self, operation: str, direct, http):
        """Direct first; the gateway when the database cannot answer.

        A DirectRejected is a real answer (e.g. "account not found") and is
        raised as-is -- the gateway would say the same. A DirectUnavailable is
        this one call being unservable directly (no ENCRYPTION_KEY, say) and
        simply goes to the gateway. Anything else is a failure of the path: an
        outage pauses the direct path for a while, so a dead database costs one
        slow call rather than one per request.
        """
        client = self.direct
        if client is not None and client.available():
            try:
                result = direct(client)
                client.mark_up()
                return result
            except DirectRejected:
                raise
            except DirectUnavailable:
                pass
            except Exception as exc:
                if client.is_outage(exc):
                    client.mark_down(operation, exc)
                else:
                    logger.warning(
                        "direct_db_call_failed",
                        operation=operation,
                        error=str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__,
                    )
                if not self.http_enabled:
                    raise
        if not self.http_enabled:
            raise RuntimeError(
                f"{operation}: the database is unavailable and no gateway is configured "
                "(API_URL / WORKER_API_KEY)"
            )
        return http()

    def _headers(self, *, include_user: bool = True) -> dict[str, str]:
        headers = {"X-Worker-Key": self.worker_key}
        if include_user and self.user_id:
            headers["X-User-Id"] = self.user_id
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict[str, Any]] = None,
        include_user: bool = True,
        retries: int | None = None,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        max_attempts = retries if retries is not None else 1
        retryable = (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError)
        last_exc: Exception | None = None

        for attempt in range(1, max_attempts + 1):
            try:
                response = self._http.request(
                    method,
                    url,
                    headers=self._headers(include_user=include_user),
                    json=json,
                )
                response.raise_for_status()
                return response
            except retryable as exc:
                last_exc = exc
                if attempt >= max_attempts:
                    break
                wait_s = min(2 ** attempt, 20)
                logger.warning(
                    "api_request_retry",
                    method=method,
                    path=path,
                    base_url=self.base_url,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    wait_s=wait_s,
                    error=str(exc),
                )
                time.sleep(wait_s)

        assert last_exc is not None
        logger.error(
            "api_request_failed",
            method=method,
            path=path,
            base_url=self.base_url,
            error=str(last_exc),
            hint=(
                "Check API_URL is reachable and the backend is running. "
                "Render free tier can cold-start for 60–90s on first request."
            ),
        )
        raise last_exc

    def whoami(self) -> dict[str, Any]:
        """Diagnostic only: what this worker's user id owns. Never called by the
        copier itself -- see scripts/show_config.py."""
        return self._route(
            "whoami",
            lambda d: d.whoami(),
            lambda: self._request("GET", "/internal/whoami").json(),
        )

    def fetch_runtime_config(self) -> dict[str, Any]:
        attempts = int(os.environ.get("WORKER_API_RETRY_ATTEMPTS", "4"))
        return self._route(
            "runtime_config",
            lambda d: d.fetch_runtime_config(),
            lambda: self._request(
                "GET", "/internal/runtime-config", retries=attempts
            ).json(),
        )

    def fetch_trading_account(self, account_id: str) -> dict[str, Any]:
        return self._route(
            "trading_account",
            lambda d: d.fetch_trading_account(account_id),
            lambda: self._request("GET", f"/internal/trading-accounts/{account_id}").json(),
        )

    def fetch_open_links(self) -> list[dict[str, Any]]:
        """Reconstructed still-open ticket links so a restart can resume modify/close."""
        return self._route(
            "open_links",
            lambda d: d.fetch_open_links(),
            lambda: self._request("GET", "/internal/open-links").json().get("links", []),
        )

    def post_execution_event(self, payload: dict[str, Any]) -> None:
        self._route(
            "execution_event",
            lambda d: d.insert_events([payload]),
            lambda: self._request("POST", "/internal/execution-events", json=payload),
        )

    def post_execution_events_batch(self, payloads: list[dict[str, Any]]) -> None:
        self._route(
            "execution_events",
            lambda d: d.insert_events(payloads),
            lambda: self._request(
                "POST", "/internal/execution-events/batch", json={"events": payloads}
            ),
        )

    def register_worker(self) -> str:
        payload = {
            "worker_name": self.worker_name,
            "region": self.worker_region,
            "host_identifier": socket.gethostname(),
            "capacity": self.worker_capacity,
            "metadata": {"phase": "2", "config_source": "api"},
        }
        # Declares who this worker runs for. The control plane stamps it onto the
        # worker_nodes row so the owner can see their own worker in the
        # dashboard; without it the row has no owner, row-level security hides
        # it, and the fleet banner reads "No worker" while this process is
        # heartbeating perfectly well.
        self.worker_id = self._route(
            "register_worker",
            lambda d: d.register_worker(payload),
            lambda: self._request(
                "POST", "/internal/workers/register", json=payload, include_user=True
            ).json()["id"],
        )
        logger.info("worker_registered", worker_id=self.worker_id, name=self.worker_name)
        return self.worker_id

    def send_heartbeat(self) -> None:
        if not self.worker_id:
            return
        worker_id = self.worker_id
        metadata = self._status_metadata()
        self._route(
            "heartbeat",
            lambda d: d.heartbeat(worker_id, 1, metadata),
            lambda: self._request(
                "POST",
                "/internal/workers/heartbeat",
                json={"worker_id": worker_id, "active_sessions": 1, "metadata": metadata},
                include_user=False,
            ),
        )

    def _status_metadata(self) -> dict[str, Any]:
        """What the Trade Copier page shows about this worker's connection --
        so "is it on the direct path, are commands pushed" is answerable
        without reading a log on the Windows machine."""
        from engine import control_signals

        signals = control_signals.current_signals()
        direct = self.direct is not None and self.direct.available()
        return {
            "status": "running",
            "control": "direct" if direct else "gateway",
            "push": bool(direct and signals is not None and signals.healthy()),
        }

    def start_heartbeat_loop(self) -> None:
        if not self.worker_id or self._heartbeat_thread:
            return

        interval = int(os.environ.get("WORKER_HEARTBEAT_INTERVAL_SECONDS", "30"))

        def _loop() -> None:
            while not self._heartbeat_stop.wait(interval):
                try:
                    self.send_heartbeat()
                except Exception as exc:
                    logger.warning("worker_heartbeat_failed", error=str(exc))

        self._heartbeat_thread = threading.Thread(
            target=_loop, name="worker-heartbeat", daemon=True
        )
        self._heartbeat_thread.start()

    def stop_heartbeat_loop(self) -> None:
        self._heartbeat_stop.set()

    def notify_session_started(
        self,
        trading_account_id: str,
        *,
        terminal_path: Optional[str] = None,
        process_id: Optional[int] = None,
    ) -> None:
        if not self.worker_id:
            return
        worker_id = self.worker_id
        self._route(
            "session_started",
            lambda d: d.session_started(worker_id, trading_account_id, terminal_path, process_id),
            lambda: self._request(
                "POST",
                "/internal/workers/session-started",
                json={
                    "worker_id": worker_id,
                    "trading_account_id": trading_account_id,
                    "terminal_path": terminal_path,
                    "process_id": process_id,
                },
                include_user=False,
            ),
        )

    def notify_session_failed(self, trading_account_id: str, error: str) -> None:
        if not self.worker_id:
            return
        worker_id = self.worker_id
        self._route(
            "session_failed",
            lambda d: d.session_failed(worker_id, trading_account_id, error),
            lambda: self._request(
                "POST",
                "/internal/workers/session-failed",
                json={
                    "worker_id": worker_id,
                    "trading_account_id": trading_account_id,
                    "error": error,
                },
                include_user=False,
            ),
        )

    def fetch_pending_commands(self) -> list[dict[str, Any]]:
        return self._route(
            "pending_commands",
            lambda d: d.pending_commands(),
            lambda: self._request("GET", "/internal/worker-commands").json().get("commands", []),
        )

    def complete_command(
        self,
        command_id: str,
        *,
        success: bool,
        result: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        self._route(
            "complete_command",
            lambda d: d.complete_command(command_id, success, result or {}, error),
            lambda: self._request(
                "POST",
                f"/internal/worker-commands/{command_id}/complete",
                json={"success": success, "result": result or {}, "error": error},
                include_user=False,
            ),
        )

    def post_account_balances(self, accounts: list[dict[str, Any]]) -> None:
        if not self.user_id:
            return
        self._route(
            "account_balances",
            lambda d: d.update_balances(accounts),
            lambda: self._request(
                "POST",
                "/internal/account-balances",
                json={"user_id": self.user_id, "accounts": accounts},
                include_user=False,
            ),
        )

    def post_closed_trades(
        self,
        trading_account_id: str,
        trades: list[dict[str, Any]],
        synced_to: Optional[str] = None,
    ) -> dict[str, Any]:
        """Hand finished positions to the gateway to journal.

        The control plane owns the write because only it knows which dashboard
        account this copier account is linked to.

        Returns the control plane's summary -- {written, skipped, linked} -- so the
        caller can log what actually landed rather than what was sent. An
        account with no dashboard account linked yet is a skip, not an error.
        """
        if not self.user_id:
            return {}

        def over_http() -> dict[str, Any]:
            response = self._request(
                "POST",
                "/internal/closed-trades",
                json={
                    "user_id": self.user_id,
                    "trading_account_id": trading_account_id,
                    "trades": trades,
                    "synced_to": synced_to,
                },
                include_user=False,
            )
            try:
                return response.json()
            except ValueError:
                return {}

        return self._route(
            "closed_trades",
            lambda d: d.journal_trades(trading_account_id, trades, synced_to),
            over_http,
        )

    def post_open_positions(self, accounts: list[dict[str, Any]]) -> None:
        """Replace each account's open-position snapshot in the control plane.

        Whole snapshots, not deltas: the worker cannot reliably tell a position
        that closed from one it simply could not read this cycle, so it sends
        what it saw and the gateway replaces the row. An account the worker did
        not visit is left out entirely, which keeps its last good snapshot and
        its age visible rather than blanking it.
        """
        if not self.user_id or not accounts:
            return
        self._route(
            "open_positions",
            lambda d: d.update_positions(accounts),
            lambda: self._request(
                "POST",
                "/internal/open-positions",
                json={"user_id": self.user_id, "accounts": accounts},
                include_user=False,
            ),
        )


_client: Optional[ControlApiClient] = None


def get_api_client() -> ControlApiClient:
    global _client
    if _client is None:
        _client = ControlApiClient()
    return _client
