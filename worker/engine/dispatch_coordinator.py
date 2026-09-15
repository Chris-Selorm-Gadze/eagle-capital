"""
Build and apply parallel follower dispatch jobs.

MT5 followers run in warm pool subprocesses. Different terminal installs run in
parallel; followers sharing one ``terminal64.exe`` route to a single serial worker
per path (login switches per job). There is no inline serial fallback in the
parent process — that blocked the master poll loop.
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import structlog

from engine.config_loader import AccountConfig, CopierConfig, get_account
from engine.execution_log import append_event
from engine.platform_capabilities import is_dxtrade, is_mt5
from engine.terminal_session_manager import normalize_terminal_path

if TYPE_CHECKING:
    from engine.copier_engine import CopierEngine
    from engine.signal import TradeSignal

logger = structlog.get_logger()


def _account_dict(a: AccountConfig) -> dict[str, Any]:
    return {
        "id": a.id,
        "label": a.label,
        "role": a.role,
        "login": a.login,
        "password": a.password,
        "server": a.server,
        "terminal_path": a.terminal_path,
        "platform": a.platform,
        "api_base_url": a.api_base_url,
    }


def _copier_dict(c: CopierConfig) -> dict[str, Any]:
    return {
        "id": c.id,
        "master_id": c.master_id,
        "follower_id": c.follower_id,
        "enabled": c.enabled,
        "risk_mode": c.risk_mode,
        "multiplier": c.multiplier,
        "fixed_lot_size": c.fixed_lot_size,
        "copy_sl": c.copy_sl,
        "copy_tp": c.copy_tp,
        "copy_closes": c.copy_closes,
        "copy_modifications": c.copy_modifications,
        "max_signal_age_ms": c.max_signal_age_ms,
    }


def _signal_dict(signal: "TradeSignal", master_id: str) -> dict[str, Any]:
    return {
        "event_type": signal.event_type,
        "account_id": master_id,
        "ticket": signal.ticket,
        "symbol": signal.symbol,
        "side": signal.side,
        "volume": signal.volume,
        "open_price": signal.open_price,
        "sl": signal.sl,
        "tp": signal.tp,
        "timestamp_ms": signal.timestamp_ms,
    }


def dispatch_to_followers(
    engine: "CopierEngine",
    signal: "TradeSignal",
    copier_list: list[CopierConfig],
    master_cfg: AccountConfig,
    master_session,
) -> None:
    detected_at_ms = int(time.time() * 1000)
    signal.timestamp_ms = detected_at_ms
    dispatch_t0 = time.perf_counter()

    pool_mt5: list[CopierConfig] = []
    dxtrade: list[CopierConfig] = []

    for copier in engine._sort_copiers_for_dispatch(copier_list, master_cfg):
        follower_cfg = get_account(engine.accounts, copier.follower_id)
        if is_dxtrade(follower_cfg.platform):
            dxtrade.append(copier)
            continue
        if not is_mt5(follower_cfg.platform):
            continue
        if not follower_cfg.terminal_path:
            logger.error(
                "follower_missing_terminal_path",
                follower=follower_cfg.id,
                copier=copier.id,
            )
            append_event(
                {
                    "status": "failed",
                    "copier_id": copier.id,
                    "event_type": signal.event_type,
                    "master_ticket": signal.ticket,
                    "error_message": "follower_terminal_path_missing",
                    "e2e_ms": 0,
                }
            )
            continue
        pool_mt5.append(copier)

    symbol_mappings = engine._symbol_mappings_cache

    futures: list[tuple[CopierConfig, Future]] = []
    for copier in pool_mt5:
        follower_cfg = get_account(engine.accounts, copier.follower_id)
        link = engine.ticket_mapper.get(copier.id, signal.ticket)
        risk_profile = (
            engine.risk_engine.profile_for(follower_cfg.id)
            if engine.risk_engine
            else None
        )
        submitted_at_ms = int(time.time() * 1000)
        sig_dict = _signal_dict(signal, master_cfg.id)
        # Per-follower age clock — queued followers on a shared terminal path
        # should not inherit staleness from earlier siblings in the batch.
        sig_dict["timestamp_ms"] = submitted_at_ms
        job = {
            "terminal_path": normalize_terminal_path(follower_cfg.terminal_path),
            "follower": _account_dict(follower_cfg),
            "copier": _copier_dict(copier),
            "signal": sig_dict,
            "symbol_mappings": symbol_mappings,
            "detected_at_ms": detected_at_ms,
            "submitted_at_ms": submitted_at_ms,
            "follower_ticket_for_close": link.follower_ticket if link else None,
            "link_symbol": link.symbol if link else None,
            "link_side": link.side if link else None,
            "link_volume": link.volume if link else None,
            "risk_profile": risk_profile,
        }
        fut = engine._terminal_pool.submit(follower_cfg.id, job)
        if fut:
            futures.append((copier, fut))
        else:
            logger.error(
                "pool_submit_failed",
                follower=follower_cfg.id,
                copier=copier.id,
            )
            append_event(
                {
                    "status": "failed",
                    "copier_id": copier.id,
                    "event_type": signal.event_type,
                    "master_ticket": signal.ticket,
                    "error_message": "pool_worker_unavailable",
                    "e2e_ms": max(0, int(time.time() * 1000) - detected_at_ms),
                }
            )

    def _run_dx(copier: CopierConfig) -> None:
        from engine.dxtrade_follower_executor import DXtradeFollowerExecutor

        follower_cfg = get_account(engine.accounts, copier.follower_id)
        executor = DXtradeFollowerExecutor(
            follower_cfg,
            engine.symbol_mapper,
            engine.ticket_mapper,
            risk_engine=engine.risk_engine,
        )
        signal.refresh_timestamp()
        executor.handle(signal, copier)

    dx_futures: list[Future] = []
    dx_pool: ThreadPoolExecutor | None = None
    if dxtrade:
        dx_pool = ThreadPoolExecutor(max_workers=min(4, len(dxtrade)))
        for c in dxtrade:
            dx_futures.append(dx_pool.submit(_run_dx, c))

    # NON-BLOCKING: Process completions as they arrive (parallel execution).
    # This reduces wall time from SUM(follower_latencies) to MAX(follower_latencies).
    copier_by_future = {fut: copier for copier, fut in futures}
    for fut in as_completed(copier_by_future.keys()):
        copier = copier_by_future[fut]
        try:
            result = fut.result(timeout=120)
            _apply_isolated_result(engine, result)
        except Exception as exc:
            logger.error("isolated_copy_failed", copier=copier.id, error=str(exc))
            append_event(
                {
                    "status": "failed",
                    "copier_id": copier.id,
                    "event_type": signal.event_type,
                    "master_ticket": signal.ticket,
                    "error_message": str(exc),
                    "e2e_ms": max(0, int(time.time() * 1000) - detected_at_ms),
                }
            )

    for fut in as_completed(dx_futures):
        try:
            fut.result()
        except Exception as exc:
            logger.error("dxtrade_copy_failed", error=str(exc))
    if dx_pool:
        dx_pool.shutdown(wait=False)

    wall_ms = int((time.perf_counter() - dispatch_t0) * 1000)
    logger.info(
        "dispatch_complete",
        event_type=signal.event_type,
        ticket=signal.ticket,
        pool=len(pool_mt5),
        dxtrade=len(dxtrade),
        wall_ms=wall_ms,
    )


def _apply_isolated_result(engine: "CopierEngine", result: dict[str, Any]) -> None:
    for ev in result.get("events") or []:
        append_event(ev)
    link = result.get("ticket_link")
    if link:
        engine.ticket_mapper.add(
            link["copier_id"],
            int(link["master_ticket"]),
            link["follower_ticket"],
            link["symbol"],
            link["side"],
            follower_account_id=link.get("follower_account_id"),
            volume=link.get("volume"),
        )
        if engine.risk_engine and link.get("follower_account_id"):
            engine.risk_engine.record_open(str(link["follower_account_id"]))
    rem = result.get("ticket_remove")
    if rem:
        engine.ticket_mapper.remove(
            rem["copier_id"],
            int(rem["master_ticket"]),
            follower_account_id=rem.get("follower_account_id"),
        )
