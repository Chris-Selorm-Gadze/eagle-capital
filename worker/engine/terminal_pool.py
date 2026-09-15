"""
MT5 follower pool — parallel across brokers, serial within a shared terminal.

One ``ProcessPoolExecutor`` (single worker) is created per *pool key*:

- **Dedicated key** (one account on a terminal path): warm session stays on that
  login — fastest for a single follower on that install.
- **Shared key** (multiple accounts on the same ``terminal64.exe``): one subprocess
  serialises jobs and switches login per follower. Required because MT5 only
  supports one active login per terminal instance.

For 5–20 followers on the *same* broker with one install, jobs queue on the
shared worker (correct). For maximum parallel throughput, give each account its
own portable MT5 folder and unique ``terminal_path`` in the database.
"""

from __future__ import annotations

import hashlib
import json
import os
from concurrent.futures import Future, ProcessPoolExecutor
from typing import Any

import structlog

from engine.isolated_mt5_worker import _init_pool_worker, run_isolated_copy_job
from engine.terminal_session_manager import normalize_terminal_path

logger = structlog.get_logger()

SHARED_PREFIX = "shared:"


def build_pool_plan(
    account_paths: dict[str, str],
    *,
    log_shared: bool = True,
) -> tuple[dict[str, str], dict[str, str]]:
    """Return (pool_key → terminal_path, account_id → pool_key)."""
    by_path: dict[str, list[str]] = {}
    for account_id, raw_path in account_paths.items():
        path = normalize_terminal_path(raw_path)
        if not account_id or not path:
            continue
        by_path.setdefault(path, []).append(account_id)

    pool_workers: dict[str, str] = {}
    account_routes: dict[str, str] = {}

    force_dedicated = os.environ.get("WORKER_DEDICATED_POOL_PER_ACCOUNT", "0") == "1"
    if force_dedicated:
        shared_paths = [p for p, aids in by_path.items() if len(aids) > 1]
        if shared_paths:
            logger.warning(
                "terminal_pool_dedicated_mode_shared_paths",
                paths=len(shared_paths),
                hint=(
                    "WORKER_DEDICATED_POOL_PER_ACCOUNT=1 with multiple accounts on "
                    "the same terminal path spawns conflicting MT5 processes. Use "
                    "unique portable installs per account or disable this flag."
                ),
            )

    for path, account_ids in by_path.items():
        if len(account_ids) == 1 or force_dedicated:
            for account_id in account_ids:
                pool_workers[account_id] = path
                account_routes[account_id] = account_id
        else:
            pool_key = f"{SHARED_PREFIX}{path}"
            pool_workers[pool_key] = path
            for account_id in account_ids:
                account_routes[account_id] = pool_key
            if log_shared:
                logger.info(
                    "terminal_pool_shared_path",
                    path=path,
                    accounts=len(account_ids),
                    hint=(
                        "Multiple followers share one terminal install; copies on this "
                        "path run serially. Use a unique portable MT5 path per account "
                        "for parallel execution."
                    ),
                )

    return pool_workers, account_routes


def pool_plan_fingerprint(account_paths: dict[str, str]) -> str:
    """Stable hash of routing plan — skip pool rebuild when unchanged."""
    pool_workers, account_routes = build_pool_plan(account_paths, log_shared=False)
    payload = {
        "workers": sorted(pool_workers.items()),
        "routes": sorted(account_routes.items()),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class TerminalPool:
    """Route follower jobs to per-path or per-account warm subprocess workers."""

    def __init__(self, account_paths: dict[str, str] | None = None) -> None:
        if account_paths is None:
            account_paths = {}
        if not isinstance(account_paths, dict):
            raise TypeError(
                "TerminalPool expects dict[account_id, terminal_path], "
                f"got {type(account_paths).__name__}. Use TerminalPool({{}}) for empty."
            )

        self._enabled = os.environ.get("WORKER_PARALLEL_TERMINALS", "1") == "1"
        self._executors: dict[str, ProcessPoolExecutor] = {}
        self._paths: dict[str, str] = {}
        self._account_routes: dict[str, str] = {}

        pool_workers, self._account_routes = build_pool_plan(account_paths)

        for pool_key, path in pool_workers.items():
            self._paths[pool_key] = path
            if not self._enabled:
                continue
            if pool_key in self._executors:
                continue
            pinned_account = "" if pool_key.startswith(SHARED_PREFIX) else pool_key
            self._executors[pool_key] = ProcessPoolExecutor(
                max_workers=1,
                initializer=_init_pool_worker,
                initargs=(pinned_account, path),
            )
            logger.info(
                "terminal_pool_worker_started",
                pool_key=pool_key,
                path=path,
                dedicated=not pool_key.startswith(SHARED_PREFIX),
            )

    def worker_count(self) -> int:
        return len(self._executors)

    def routed_accounts(self) -> list[str]:
        return list(self._account_routes.keys())

    def has(self, account_id: str | None) -> bool:
        if not account_id:
            return False
        if account_id not in self._account_routes:
            return False
        if not self._enabled:
            return False
        pool_key = self._account_routes[account_id]
        return pool_key in self._executors

    def path_for(self, account_id: str) -> str:
        pool_key = self._account_routes.get(account_id, account_id)
        return self._paths.get(pool_key, "")

    def submit(self, account_id: str | None, job: dict[str, Any]) -> Future | None:
        if not account_id or account_id not in self._account_routes:
            return None
        pool_key = self._account_routes[account_id]
        if pool_key not in self._executors:
            return None
        return self._executors[pool_key].submit(run_isolated_copy_job, job)

    def shutdown(self) -> None:
        for pool_key, ex in self._executors.items():
            try:
                ex.shutdown(wait=True, cancel_futures=False)
            except Exception as exc:
                logger.warning(
                    "terminal_pool_shutdown_error",
                    pool_key=pool_key,
                    error=str(exc),
                )
        self._executors.clear()
        self._paths.clear()
        self._account_routes.clear()
