"""
Multi-master supervisor.

MetaTrader5's Python binding is a process-global singleton: one
``mt5.initialize()`` per process connects the whole module to a single
terminal. The terminal manager, API client, event batcher and terminal pool
are likewise process-wide. That makes it impossible to drive two master
accounts concurrently inside one process without constantly tearing down and
re-initializing the connection.

To run several masters at the same time we therefore launch one OS process per
master, each running the existing single-master ``CopierEngine.run(master_id=)``
with its own warm terminal connection, pool and ticket map. The supervisor
spawns, monitors and restarts those child processes.

Behaviour:
- 0 masters  -> run in-process so the engine emits its usual clear error.
- 1 master   -> run in-process (zero behaviour change vs. the old entrypoint).
- 2+ masters -> spawn one child process per master and supervise them.
"""

from __future__ import annotations

import multiprocessing as mp
import os
import sys
import time

import structlog

# Ensure the worker root is importable in spawned children that re-import this
# module by its qualified name (``engine.master_supervisor``).
_WORKER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _WORKER_ROOT not in sys.path:
    sys.path.insert(0, _WORKER_ROOT)

from engine.config_loader import (  # noqa: E402
    AccountConfig,
    CopierConfig,
    dedupe_copiers_by_follower,
    get_account,
    get_copiers_for_master,
    load_accounts,
    load_copiers,
)
from engine.platform_capabilities import is_mt5  # noqa: E402
from engine.terminal_session_manager import normalize_terminal_path  # noqa: E402

logger = structlog.get_logger()

# Restart backoff for crashed master processes.
_RESTART_MIN_BACKOFF_S = 3.0
_RESTART_MAX_BACKOFF_S = 60.0
_MONITOR_INTERVAL_S = 5.0


def discover_active_masters() -> tuple[list[AccountConfig], list[AccountConfig], list[CopierConfig]]:
    """Return (active_masters, accounts, copiers).

    A master is "active" when it is enabled and has at least one enabled copier
    pointing at a distinct follower.
    """
    from engine.ownership import active_master_ids

    accounts = load_accounts()
    copiers = load_copiers()
    # One definition of "active", shared with engine/ownership.py, so the set of
    # processes spawned and the set that divides the accounts cannot differ.
    active_ids = set(active_master_ids(accounts, copiers))
    active = [a for a in accounts if a.id in active_ids]
    return active, accounts, copiers


def _terminal_paths_for_master(
    master: AccountConfig,
    accounts: list[AccountConfig],
    copiers: list[CopierConfig],
) -> set[str]:
    """All MT5 terminal paths a master's process will drive (master + followers)."""
    paths: set[str] = set()
    if is_mt5(master.platform) and master.terminal_path:
        paths.add(normalize_terminal_path(master.terminal_path))
    for copier in dedupe_copiers_by_follower(get_copiers_for_master(copiers, master.id)):
        try:
            follower = get_account(accounts, copier.follower_id)
        except KeyError:
            continue
        if is_mt5(follower.platform) and follower.terminal_path:
            paths.add(normalize_terminal_path(follower.terminal_path))
    return {p for p in paths if p}


def _warn_terminal_overlaps(
    masters: list[AccountConfig],
    accounts: list[AccountConfig],
    copiers: list[CopierConfig],
) -> None:
    """Warn when two masters would drive the same physical MT5 terminal.

    Two independent processes logging into the same terminal will fight over the
    single account-per-terminal connection. Distinct broker terminals per master
    group are safe; this only flags genuinely conflicting topologies.
    """
    owned: dict[str, set[str]] = {
        m.id: _terminal_paths_for_master(m, accounts, copiers) for m in masters
    }
    for i, a in enumerate(masters):
        for b in masters[i + 1 :]:
            shared = owned[a.id] & owned[b.id]
            if shared:
                logger.warning(
                    "master_terminal_overlap",
                    master_a=a.label or a.id,
                    master_b=b.label or b.id,
                    shared_terminals=sorted(shared),
                    hint=(
                        "Two masters drive the same MT5 terminal. Give each broker "
                        "its own terminal install/path to avoid login contention."
                    ),
                )


def _run_master_process(master_id: str, worker_name: str) -> None:
    """Child-process entrypoint: isolated engine for a single master.

    Runs in its own interpreter with a dedicated MT5 connection, terminal
    manager, API client and pool.
    """
    os.environ["WORKER_NAME"] = worker_name
    os.environ["WORKER_MASTER_ID"] = master_id

    from engine.env_loader import load_worker_env

    load_worker_env()
    # Re-assert after env load so a WORKER_NAME in .env can't clobber the suffix.
    os.environ["WORKER_NAME"] = worker_name

    from engine.copier_engine import CopierEngine

    try:
        CopierEngine().run(master_id=master_id)
    except KeyboardInterrupt:
        pass
    except Exception as exc:  # pragma: no cover - surfaced via exit code
        logger.error("master_process_crashed", master=master_id, error=str(exc), exc_info=True)
        raise


def _spawn(ctx, master: AccountConfig, base_name: str) -> mp.process.BaseProcess:
    worker_name = f"{base_name}:{master.label or master.id}"
    proc = ctx.Process(
        target=_run_master_process,
        args=(master.id, worker_name),
        name=worker_name,
        daemon=False,
    )
    proc.start()
    logger.info("master_process_started", master=master.id, label=master.label, pid=proc.pid)
    return proc


def _serve_commands_while_idle(accounts: list[AccountConfig] | None = None) -> None:
    """Handle dashboard commands that do not need a running copier.

    `test_connection` explicitly works without an active session, and it is the
    one thing someone setting up their first account needs: connect an account,
    press Test connection, see whether the broker accepts the login. Without
    this, that button does nothing until a copy link is armed — which is exactly
    backwards, because you want to verify an account BEFORE arming anything that
    places real orders.

    Closing positions is the same. A trader who is not copying still has open
    trades, and Close on the Live Trading page used to sit pending forever
    unless a copy link happened to be armed. Closes run through the idle
    terminal pool, which already holds each account's terminal.
    """
    from engine.api_client import get_api_client
    from engine.command_processor import process_command

    client = get_api_client()
    if not client.enabled:
        return
    try:
        commands = client.fetch_pending_commands()
    except Exception as exc:
        logger.warning("idle_command_poll_failed", error=str(exc))
        return

    enabled = [a for a in (accounts or []) if a.enabled]

    for cmd in commands:
        kind = cmd.get("command_type")
        try:
            if kind == "test_connection":
                result = process_command(cmd, {}, master_session=None)
            elif kind in ("close_position", "flatten") and enabled:
                result = process_command(
                    cmd,
                    _idle_sessions(enabled),
                    pool=_idle_terminal_pool(enabled),
                )
            else:
                # reload_config is handled by the discovery loop simply by
                # looking again; the engine completes it once work appears.
                continue
            client.complete_command(
                cmd["id"],
                success=bool(result.get("success")),
                result=result,
                error=result.get("error"),
            )
        except Exception as exc:
            logger.warning("idle_command_failed", command=cmd.get("id"), error=str(exc))


def _journal_while_idle(accounts: list[AccountConfig]) -> None:
    """Journal closed trades even when no copy link is armed.

    Journalling is not conditional on copying. Someone who connected an account
    so its history reaches the dashboard, and has not armed a copy link, still
    expects their trades to appear -- and the periodic pass normally runs inside
    CopierEngine, which never starts without an armed link. Without this, that
    user's dashboard stays empty forever with nothing on screen explaining why.

    Building an AccountSession is just config; the terminal work happens in
    connect(), which sync_all_trades calls for the one account it picks.
    """
    from engine.trade_journal import journallable, should_sync_trades, sync_all_trades

    if not should_sync_trades():
        return

    candidates = journallable(accounts)
    if not candidates:
        return

    # The pool is built from every enabled account, the same set the position
    # feed and idle commands use. Building it from `candidates` gave it a
    # different fingerprint, so each alternation between the feed and this
    # pass shut every terminal subprocess down and started them again.
    enabled = [a for a in accounts if a.enabled]
    try:
        sync_all_trades(
            candidates, _idle_sessions(candidates), _idle_terminal_pool(enabled)
        )
    except Exception as exc:
        logger.warning("idle_trade_journal_failed", error=str(exc))


def _idle_sessions(accounts: list[AccountConfig]) -> dict:
    """Sessions for accounts the supervisor drives directly while nothing copies.

    Building one is just config -- the terminal work happens in connect(), which
    each caller does for only the accounts it actually reads.
    """
    from engine.account_session import AccountSession

    return {
        a.id: AccountSession(
            account_id=a.id,
            label=a.label,
            role=a.role,
            login=a.login,
            password=a.password,
            server=a.server,
            terminal_path=a.terminal_path,
            platform=a.platform,
            api_base_url=a.api_base_url,
        )
        for a in accounts
    }


_idle_pool = None
_idle_pool_fingerprint = ""


def _idle_terminal_pool(accounts: list[AccountConfig]):
    """Terminal subprocesses for an idle worker, rebuilt when the accounts change.

    An idle worker has no CopierEngine and therefore none of its pool, so
    without this every live-position read would go through this process's single
    MT5 attach -- one shutdown+initialize per broker, serially, for a page that
    is meant to update every couple of seconds.
    """
    global _idle_pool, _idle_pool_fingerprint
    from engine.terminal_pool import TerminalPool, pool_plan_fingerprint
    from engine.terminal_session_manager import normalize_terminal_path

    routed = {
        a.id: normalize_terminal_path(a.terminal_path)
        for a in accounts
        if a.enabled and is_mt5(a.platform) and a.terminal_path
    }

    fingerprint = pool_plan_fingerprint(routed)
    if _idle_pool is not None and fingerprint == _idle_pool_fingerprint:
        return _idle_pool

    if _idle_pool is not None:
        try:
            _idle_pool.shutdown()
        except Exception:
            pass

    _idle_pool = TerminalPool(routed)
    _idle_pool_fingerprint = fingerprint
    logger.info("idle_terminal_pool_ready", accounts_routed=len(routed),
                workers=_idle_pool.worker_count())
    return _idle_pool


def _shutdown_idle_pool() -> None:
    """Stop the idle terminal workers and forget them."""
    global _idle_pool, _idle_pool_fingerprint
    if _idle_pool is None:
        return
    try:
        _idle_pool.shutdown()
    except Exception as exc:
        logger.warning("idle_terminal_pool_shutdown_failed", error=str(exc))
    _idle_pool = None
    _idle_pool_fingerprint = ""


def _feed_positions_while_idle(accounts: list[AccountConfig]) -> None:
    """Live positions for a worker with no copy link armed.

    Same gap as _journal_while_idle and _sync_state_while_idle: this runs inside
    CopierEngine normally, which never starts without an armed link, so someone
    who connected accounts purely to watch them saw the Live Trading page go
    stale between 90-second balance sweeps.
    """
    from engine.position_feed import should_report_positions, sweep_in_background

    enabled = [a for a in accounts if a.enabled]
    if not enabled or not should_report_positions():
        return

    try:
        sweep_in_background(enabled, _idle_terminal_pool(enabled))
    except Exception as exc:
        logger.warning("idle_position_sweep_failed", error=str(exc))


def _idle_wait(seconds: float, accounts: list[AccountConfig]) -> None:
    """Wait out the idle interval, sweeping positions while it passes.

    Commands and journalling are fine on a 15-second beat; a live P&L is not.
    Rather than shortening the whole idle loop -- which would also poll the
    gateway for commands thirty times a minute for a worker doing nothing --
    the sweep gets its own tighter beat inside the wait.
    """
    step = float(os.environ.get("WORKER_IDLE_SWEEP_STEP_SECONDS", "0.5"))
    # Commands get a beat of their own too: a Close clicked on the Live Trading
    # page should not wait out the whole fifteen-second idle interval.
    command_every = float(os.environ.get("WORKER_IDLE_COMMAND_POLL_SECONDS", "3"))
    next_commands = time.time() + command_every
    end = time.time() + seconds
    while True:
        _feed_positions_while_idle(accounts)
        if time.time() >= next_commands:
            _serve_commands_while_idle(accounts)
            next_commands = time.time() + command_every
        # Its own throttle decides; checking here is what lets a close served
        # just above reach the dashboard in seconds rather than next cycle.
        _journal_while_idle(accounts)
        remaining = end - time.time()
        if remaining <= 0:
            return
        time.sleep(min(step, remaining))


def _sync_state_while_idle(accounts: list[AccountConfig]) -> None:
    """Balances and open positions for a worker with no copy link armed.

    Same reason as _journal_while_idle: this sweep normally runs inside
    CopierEngine, which never starts without an armed link, so a user who
    connected accounts purely to watch them saw stale balances and an empty
    Live Trading page indefinitely. The terminal is otherwise unused here, so
    the switches this costs compete with nothing.
    """
    from engine.balance_sync import should_sync_balances, sync_all_balances

    enabled = [a for a in accounts if a.enabled]
    if not enabled or not should_sync_balances():
        return

    try:
        # Nothing is copying, so there is no latency to protect: visit every
        # unrouted account each pass. Routed ones report through the idle sweep.
        sync_all_balances(
            enabled, _idle_sessions(enabled), _idle_terminal_pool(enabled), rotate=False
        )
    except Exception as exc:
        logger.warning("idle_balance_sync_failed", error=str(exc))


def run_all_masters() -> None:
    """Entrypoint used by the production copier loop.

    Registers and starts heartbeating BEFORE looking for work, then WAITS for
    work instead of exiting when there is none.

    The original behaviour was to fetch config up to three times and then raise.
    That is right for a fixed deployment and wrong for a product: a user who has
    just signed up has no armed copy links, so the control plane correctly
    answers "nothing to run" — and the worker died on it. A dead worker cannot
    be seen in the dashboard and cannot answer a test-connection command, so the
    user's first impression is a broken system, and the only way out is to arm a
    live copy link before ever verifying that the accounts connect.
    """
    idle_poll_s = float(os.environ.get("WORKER_IDLE_POLL_SECONDS", "15"))

    # Announce ourselves before needing any config, so the fleet shows this
    # machine as online while it waits. register_worker() upserts on the control
    # plane and start_heartbeat_loop() returns early if already running, so
    # CopierEngine.run() calling both again once work appears is harmless.
    from engine.api_client import get_api_client

    client = get_api_client()
    if client.enabled:
        try:
            client.register_worker()
            client.start_heartbeat_loop()
        except Exception as exc:
            logger.warning("worker_register_failed", error=str(exc))

    active: list[AccountConfig] = []
    accounts: list[AccountConfig] = []
    copiers: list[CopierConfig] = []
    idle_logged = False

    while True:
        try:
            active, accounts, copiers = discover_active_masters()
        except Exception as exc:
            logger.warning(
                "config_fetch_failed_retrying",
                error=str(exc),
                retry_s=idle_poll_s,
                api_url=os.environ.get("API_URL", "http://localhost:8000"),
            )
            _serve_commands_while_idle(accounts)
            time.sleep(idle_poll_s)
            continue

        if active:
            # Hand the terminals back before CopierEngine builds its own pool on
            # the same paths. These subprocesses hold live MT5 attachments, and
            # leaving them running would put two processes on one terminal
            # install -- which is the one thing MT5 does not allow.
            _shutdown_idle_pool()
            break

        # Logged once rather than every poll: having no armed copy link is a
        # normal state for a new account, not a fault worth a repeating warning.
        if not idle_logged:
            logger.info(
                "worker_idle",
                reason="no armed copy links for this user",
                retry_s=idle_poll_s,
                hint="Connect accounts and arm a copy link; this picks it up automatically.",
            )
            idle_logged = True
        _serve_commands_while_idle(accounts)
        # Accounts are known here even though no master is armed, so anything
        # pointed at a dashboard account still gets journalled.
        _journal_while_idle(accounts)
        _sync_state_while_idle(accounts)
        _idle_wait(idle_poll_s, accounts)

    from engine.copier_engine import CopierEngine

    always_isolate = os.environ.get("WORKER_ALWAYS_ISOLATE_MASTERS", "0") == "1"

    if len(active) <= 1 and not always_isolate:
        # 0 masters -> CopierEngine.run() raises the usual descriptive error.
        # 1 master  -> run in-process unless WORKER_ALWAYS_ISOLATE_MASTERS=1.
        master_id = active[0].id if active else None
        if master_id:
            logger.info("single_master_mode", master=master_id)
        CopierEngine().run(master_id=master_id)
        return

    logger.info(
        "multi_master_mode",
        masters=[{"id": m.id, "label": m.label} for m in active],
        count=len(active),
    )
    _warn_terminal_overlaps(active, accounts, copiers)

    base_name = os.environ.get("WORKER_NAME", "worker-local-01")
    ctx = mp.get_context("spawn")
    procs: dict[str, mp.process.BaseProcess] = {}
    backoff: dict[str, float] = {m.id: _RESTART_MIN_BACKOFF_S for m in active}
    next_restart_at: dict[str, float] = {m.id: 0.0 for m in active}
    by_id = {m.id: m for m in active}

    for master in active:
        procs[master.id] = _spawn(ctx, master, base_name)

    try:
        while True:
            time.sleep(_MONITOR_INTERVAL_S)
            now = time.time()
            for master_id, master in by_id.items():
                proc = procs.get(master_id)
                if proc is not None and proc.is_alive():
                    backoff[master_id] = _RESTART_MIN_BACKOFF_S
                    continue
                if proc is not None:
                    logger.error(
                        "master_process_died",
                        master=master_id,
                        exitcode=proc.exitcode,
                    )
                    next_restart_at[master_id] = now + backoff[master_id]
                    backoff[master_id] = min(
                        backoff[master_id] * 2, _RESTART_MAX_BACKOFF_S
                    )
                    procs[master_id] = None  # type: ignore[assignment]
                    continue
                if now >= next_restart_at[master_id]:
                    logger.info("master_process_restarting", master=master_id)
                    procs[master_id] = _spawn(ctx, master, base_name)
    except KeyboardInterrupt:
        logger.info("supervisor_stopping", masters=len(procs))
    finally:
        for proc in procs.values():
            if proc is not None and proc.is_alive():
                proc.terminate()
        for proc in procs.values():
            if proc is not None:
                proc.join(timeout=10)
        logger.info("supervisor_stopped")
