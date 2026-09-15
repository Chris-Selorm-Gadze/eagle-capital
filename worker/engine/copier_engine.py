"""
Copier engine: poll master account(s), emit signals, copy to followers.

Dev mode uses one MT5 terminal and switches login between master and follower.
"""

from __future__ import annotations

import os
import time
from typing import Dict, List

import structlog

from engine.account_session import AccountSession
from engine.config_loader import (
    AccountConfig,
    CopierConfig,
    get_account,
    dedupe_copiers_by_follower,
    get_copiers_for_master,
    load_accounts,
    load_copiers,
    load_symbol_mappings,
)
from engine.balance_sync import should_sync_balances, sync_all_balances
from engine.command_processor import process_command
from engine.dispatch_coordinator import dispatch_to_followers
from engine.master_source import MasterPositionSource, build_master_source
from engine.platform_capabilities import is_dxtrade, is_mt5
from engine.risk_engine import RiskEngine
from engine.signal_bus import SignalBusReader
from engine.state_diff import StateDiffEngine
from engine.symbol_mapper import SymbolMapper
from engine.ticket_mapper import TicketMapper
from engine.terminal_pool import TerminalPool, pool_plan_fingerprint
from engine.terminal_session_manager import get_terminal_manager, normalize_terminal_path

logger = structlog.get_logger()


class CopierEngine:
    def __init__(
        self,
        poll_interval_ms: int | None = None,
    ):
        self.poll_interval_ms = poll_interval_ms or int(
            os.environ.get("WORKER_POLL_INTERVAL_MS", "50")
        )
        self._poll_fallback_ms = int(
            os.environ.get("WORKER_POLL_FALLBACK_MS", "1000")
        )
        self._signal_bus = None
        self._last_poll_at: float = 0.0
        self._last_master_status_post: float = 0.0
        self._master_status_interval_s = float(
            os.environ.get("WORKER_MASTER_STATUS_INTERVAL_SECONDS", "30")
        )
        self._last_command_poll: float = 0.0
        self._command_poll_interval_s = float(
            os.environ.get("WORKER_COMMAND_POLL_SECONDS", "2")
        )
        self._symbol_mappings_cache: list[dict[str, str]] = []
        self.accounts = load_accounts()
        self.copiers = load_copiers()
        self.symbol_mapper = SymbolMapper(load_symbol_mappings())
        self.ticket_mapper = TicketMapper()
        self.risk_engine: RiskEngine | None = None
        self._api_client = None
        self._current_session: AccountSession | None = None
        self._open_in_flight: set[int] = set()
        self._pool_fingerprint: str | None = None
        self._last_config_reload: float = 0.0
        self._config_reload_interval_s = int(
            os.environ.get("WORKER_CONFIG_RELOAD_SECONDS", "5")
        )
        self._sessions: Dict[str, AccountSession] = {}
        self._terminal_pool = TerminalPool({})
        self._pool_master_id: str | None = None
        self._rebuild_sessions()
        self._rebuild_symbol_mappings_cache()

    def _rebuild_ticket_links_from_history(self) -> None:
        """Reload still-open master→follower ticket links after a worker restart.

        Without this, modifications and closes on positions opened in a previous
        session silently no-op because the in-memory ticket map starts empty.
        """
        if not self._api_client:
            return
        try:
            links = self._api_client.fetch_open_links()
        except Exception as exc:
            logger.warning("ticket_link_rebuild_failed", error=str(exc))
            return
        restored = 0
        for link in links:
            try:
                follower_ticket: int | str = int(link["follower_ticket"])
            except (KeyError, ValueError, TypeError):
                follower_ticket = link.get("follower_ticket")
            master_ticket = link.get("master_ticket")
            copier_id = link.get("copier_id")
            if not master_ticket or not copier_id or follower_ticket is None:
                continue
            try:
                master_ticket_int = int(master_ticket)
            except (ValueError, TypeError):
                continue
            raw_volume = link.get("volume")
            try:
                volume = float(raw_volume) if raw_volume is not None else None
            except (ValueError, TypeError):
                volume = None
            self.ticket_mapper.add(
                copier_id,
                master_ticket_int,
                follower_ticket,
                link.get("symbol") or "",
                link.get("side") or "",
                follower_account_id=link.get("follower_account_id"),
                volume=volume,
            )
            restored += 1
        if restored:
            logger.info("ticket_links_restored", count=restored)

    def _rebuild_symbol_mappings_cache(self) -> None:
        self._symbol_mappings_cache = [
            {"master_symbol": k, "follower_symbol": v}
            for k, v in self.symbol_mapper._map.items()
        ]

    def _rebuild_sessions(self) -> None:
        self._sessions = {
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
            for a in self.accounts
            if a.enabled
        }

    def _rebuild_terminal_pool(self, master_id: str) -> None:
        """Build or refresh follower subprocess pool for the active master."""
        copier_list = dedupe_copiers_by_follower(
            get_copiers_for_master(self.copiers, master_id)
        )
        follower_ids = {c.follower_id for c in copier_list}
        pool_accounts: dict[str, str] = {}
        for account in self.accounts:
            if account.id not in follower_ids or not account.enabled:
                continue
            if not is_mt5(account.platform) or not account.terminal_path:
                continue
            pool_accounts[account.id] = normalize_terminal_path(account.terminal_path)

        fingerprint = pool_plan_fingerprint(pool_accounts)
        if fingerprint == self._pool_fingerprint:
            return

        self._terminal_pool.shutdown()
        self._terminal_pool = TerminalPool(pool_accounts)
        self._pool_fingerprint = fingerprint
        logger.info(
            "terminal_pool_ready",
            followers=len(pool_accounts),
            workers=self._terminal_pool.worker_count(),
            accounts=list(pool_accounts.keys()),
        )

    def _maybe_reload_config(self) -> None:
        if os.environ.get("DELTA_CONFIG_SOURCE", "yaml").lower() != "api":
            return
        now = time.time()
        if now - self._last_config_reload < self._config_reload_interval_s:
            return
        self._force_reload_config()

    def _force_reload_config(self) -> None:
        if os.environ.get("DELTA_CONFIG_SOURCE", "yaml").lower() != "api":
            return
        self._last_config_reload = time.time()
        try:
            from engine.config_loader import invalidate_runtime_cache

            invalidate_runtime_cache()
            self.accounts = load_accounts()
            self.copiers = load_copiers()
            self.symbol_mapper = SymbolMapper(load_symbol_mappings())
            self._rebuild_symbol_mappings_cache()
            self._rebuild_sessions()
            if self._api_client:
                from engine.config_loader import _runtime_payload

                self.risk_engine = RiskEngine.from_runtime(_runtime_payload())
            logger.info(
                "runtime_config_reloaded",
                accounts=len(self.accounts),
                copiers=len(self.copiers),
                enabled_copiers=sum(1 for c in self.copiers if c.enabled),
            )
            if self._pool_master_id:
                self._rebuild_terminal_pool(self._pool_master_id)
        except Exception as exc:
            logger.warning("runtime_config_reload_failed", error=str(exc))

    def _copiers_for_signal(
        self,
        master_id: str,
        enabled_copiers: List[CopierConfig],
        signal,
    ) -> List[CopierConfig]:
        """New opens → enabled copiers only. Closes/modifies → include paused copiers with open mappings."""
        if signal.event_type == "position_opened":
            return enabled_copiers

        if signal.event_type not in (
            "position_closed",
            "sl_modified",
            "tp_modified",
            "sltp_modified",
            "volume_changed",
        ):
            return enabled_copiers

        selected = {c.id: c for c in enabled_copiers}
        for copier in self.copiers:
            if copier.master_id != master_id or copier.id in selected:
                continue
            if not self.ticket_mapper.has(copier.id, signal.ticket):
                continue
            if signal.event_type == "position_closed" and not copier.copy_closes:
                continue
            if (
                signal.event_type in ("sl_modified", "tp_modified", "sltp_modified")
                and not copier.copy_modifications
            ):
                continue
            selected[copier.id] = copier
            logger.info(
                "dispatch_includes_paused_copier",
                copier=copier.id,
                event_type=signal.event_type,
                ticket=signal.ticket,
            )

        return list(selected.values())

    def _sort_copiers_for_dispatch(
        self,
        copier_list: List[CopierConfig],
        master_cfg: AccountConfig,
    ) -> List[CopierConfig]:
        """MT5 same-terminal first, then other MT5, then DXtrade — reduces signal age timeouts."""
        from engine.terminal_session_manager import normalize_terminal_path

        master_path = (
            normalize_terminal_path(master_cfg.terminal_path)
            if is_mt5(master_cfg.platform)
            else ""
        )

        def sort_key(c: CopierConfig) -> tuple[int, int, str]:
            try:
                follower = get_account(self.accounts, c.follower_id)
            except KeyError:
                return (9, 9, c.id)
            if is_dxtrade(follower.platform):
                return (2, 0, c.id)
            if not master_path:
                return (1, 0, c.id)
            same_path = normalize_terminal_path(follower.terminal_path) == master_path
            return (0 if same_path else 1, 0, c.id)

        return sorted(copier_list, key=sort_key)

    def _master_source_for(self, master_cfg: AccountConfig) -> MasterPositionSource:
        session = self._sessions.get(master_cfg.id)
        return build_master_source(master_cfg, session)

    def _poll_master_positions(
        self,
        master_cfg: AccountConfig,
        master_source: MasterPositionSource,
    ) -> List[dict] | None:
        if is_mt5(master_cfg.platform):
            return self._read_master_positions(self._sessions.get(master_cfg.id))
        if not master_source.connect():
            return None
        return master_source.get_open_positions()

    def _resync_after_dispatch(
        self,
        master_cfg: AccountConfig,
        master_source: MasterPositionSource,
        diff: StateDiffEngine,
        master_session: AccountSession | None,
    ) -> None:
        if is_mt5(master_cfg.platform) and master_session:
            positions = self._read_master_positions(master_session)
            if positions is not None:
                diff.resync(positions)
                # Only suppress detection if returning to the master required a
                # cross-terminal shutdown+initialize (which has a stale-data
                # settling window). Same-broker fast-login switches read clean
                # data immediately, so a grace here would silently swallow
                # SL/TP/volume changes made right after another event.
                if get_terminal_manager().last_switch_was_cross_terminal():
                    get_terminal_manager().begin_reconnect_grace(1.5)
        else:
            positions = master_source.get_open_positions()
            if positions is not None:
                diff.resync(positions)

    def run(self, master_id: str | None = None) -> None:
        masters = [
            a for a in self.accounts if a.role == "master" and a.enabled
        ]
        if master_id:
            masters = [a for a in masters if a.id == master_id]
        if not masters:
            source = os.environ.get("DELTA_CONFIG_SOURCE", "yaml")
            hint = "config/accounts.yaml" if source == "yaml" else "Supabase runtime config"
            raise RuntimeError(f"No enabled master account in {hint}")

        if len(masters) > 1:
            logger.warning("multiple_masters_using_first", master_id=masters[0].id)

        master_cfg = masters[0]
        master_cfg_id = master_cfg.id
        master_session = self._sessions.get(master_cfg_id)
        master_source = self._master_source_for(master_cfg)
        copier_list = dedupe_copiers_by_follower(
            get_copiers_for_master(self.copiers, master_cfg.id)
        )
        if not copier_list:
            raise RuntimeError(f"No enabled copiers for master {master_cfg.id}")

        if (
            os.environ.get("WORKER_PARALLEL_TERMINALS", "1") != "1"
            and any(
                is_mt5(get_account(self.accounts, c.follower_id).platform)
                for c in copier_list
            )
        ):
            logger.warning(
                "parallel_terminals_disabled",
                hint=(
                    "WORKER_PARALLEL_TERMINALS=0 disables the follower pool; "
                    "MT5 copies will fail with pool_worker_unavailable."
                ),
            )

        raw_count = len(get_copiers_for_master(self.copiers, master_cfg.id))
        if raw_count > len(copier_list):
            logger.warning(
                "duplicate_copier_followers_deduped",
                raw=raw_count,
                active=len(copier_list),
                hint="Multiple copier rows pointed at the same follower; only one copy per follower is run.",
            )

        logger.info(
            "copier_engine_start",
            master=master_cfg.id,
            master_platform=master_cfg.platform,
            copiers=[c.id for c in copier_list],
            poll_ms=self.poll_interval_ms,
            config_source=os.environ.get("DELTA_CONFIG_SOURCE", "yaml"),
        )

        if os.environ.get("DELTA_CONFIG_SOURCE", "yaml").lower() == "api":
            from engine.api_client import get_api_client
            from engine.config_loader import _runtime_payload

            self._api_client = get_api_client()
            self._api_client.register_worker()
            self._api_client.start_heartbeat_loop()
            payload = _runtime_payload()
            self.risk_engine = RiskEngine.from_runtime(payload)
            self._rebuild_ticket_links_from_history()

        if not master_source.connect():
            if self._api_client:
                self._api_client.notify_session_failed(
                    master_cfg.id, "Master connect failed"
                )
            raise RuntimeError(f"Failed to connect master {master_cfg.id}")

        if self._api_client and is_mt5(master_cfg.platform):
            self._api_client.notify_session_started(
                master_cfg.id,
                terminal_path=master_cfg.terminal_path,
            )

        terminal_paths = {
            a.id: a.terminal_path for a in self.accounts if a.id in self._sessions
        }
        unique_paths = {p for p in terminal_paths.values() if p}
        if len(unique_paths) > 1:
            logger.info(
                "multi_terminal_copier",
                paths=len(unique_paths),
                hint="Master and follower use different MT5 builds; switching terminals per copy.",
            )

        diff = StateDiffEngine(master_cfg.id)
        diff.bootstrap(master_source.get_open_positions())

        self._pool_master_id = master_cfg.id
        self._rebuild_terminal_pool(master_cfg.id)

        if is_mt5(master_cfg.platform):
            bus = SignalBusReader(master_cfg.id, master_cfg.login)
            self._signal_bus = bus if bus.enabled else None
            if self._signal_bus:
                logger.info(
                    "signal_bus_enabled",
                    path=str(bus.path),
                    poll_ms=self.poll_interval_ms,
                    fallback_ms=self._poll_fallback_ms,
                )
        else:
            self._signal_bus = None

        try:
            while True:
                try:
                    self._run_once(master_cfg_id, diff)
                except KeyboardInterrupt:
                    raise
                except Exception as exc:
                    logger.error("engine_loop_error", error=str(exc), exc_info=True)
                    time.sleep(1.0)
                time.sleep(self.poll_interval_ms / 1000.0)
        except KeyboardInterrupt:
            logger.info("copier_engine_stopped")
        finally:
            self._terminal_pool.shutdown()
            try:
                from engine.event_batcher import shutdown as shutdown_event_batcher

                shutdown_event_batcher()
            except Exception:
                pass
            get_terminal_manager().release(shutdown=True)
            self._current_session = None

    def _run_once(self, master_cfg_id: str, diff: StateDiffEngine) -> None:
        master_cfg_fallback = next(
            (a for a in self.accounts if a.id == master_cfg_id), None
        )
        if master_cfg_fallback is None:
            logger.error("master_account_missing", master=master_cfg_id)
            time.sleep(2)
            return
        self._maybe_reload_config()
        master_cfg = next(
            (a for a in self.accounts if a.id == master_cfg_id),
            master_cfg_fallback,
        )
        master_session = self._sessions.get(master_cfg_id)
        master_source = self._master_source_for(master_cfg)
        if is_mt5(master_cfg.platform) and not master_session:
            logger.error("master_session_missing", master=master_cfg_id)
            time.sleep(2)
            return

        copier_list = dedupe_copiers_by_follower(
            get_copiers_for_master(self.copiers, master_cfg_id)
        )

        positions = self._poll_master_positions(master_cfg, master_source)
        if positions is None:
            logger.error("master_poll_failed", master=master_cfg_id)
            time.sleep(2)
            return

        self._mark_master_connected(master_cfg)

        mgr = get_terminal_manager()
        in_grace = mgr.in_reconnect_grace()

        bus_signals: list = []
        if self._signal_bus is not None and not in_grace:
            bus_signals = self._signal_bus.drain()

        poll_signals: list = []
        if not bus_signals or self._should_poll_fallback():
            if in_grace:
                diff.resync(positions)
            else:
                poll_signals = diff.diff(positions)

        signals = _merge_signals(bus_signals, poll_signals)

        if signals:
            batch_t0 = time.perf_counter()
            for signal in signals:
                dispatch_list = self._copiers_for_signal(
                    master_cfg_id, copier_list, signal
                )
                if signal.event_type == "position_opened":
                    if signal.ticket in self._open_in_flight:
                        logger.info(
                            "signal_open_in_flight",
                            ticket=signal.ticket,
                            symbol=signal.symbol,
                        )
                        continue
                    if dispatch_list and all(
                        self.ticket_mapper.has(c.id, signal.ticket)
                        for c in dispatch_list
                    ):
                        logger.info(
                            "signal_open_already_linked",
                            ticket=signal.ticket,
                            symbol=signal.symbol,
                        )
                        continue
                    self._open_in_flight.add(signal.ticket)

                logger.info(
                    "signal_detected",
                    event_type=signal.event_type,
                    ticket=signal.ticket,
                    symbol=signal.symbol,
                )
                try:
                    dispatch_to_followers(
                        self,
                        signal,
                        dispatch_list,
                        master_cfg,
                        master_session,
                    )
                except Exception as exc:
                    logger.error(
                        "signal_dispatch_failed",
                        event_type=signal.event_type,
                        ticket=signal.ticket,
                        symbol=signal.symbol,
                        error=str(exc),
                        exc_info=True,
                    )
                finally:
                    if signal.event_type == "position_opened":
                        self._open_in_flight.discard(signal.ticket)

            batch_ms = int((time.perf_counter() - batch_t0) * 1000)
            logger.info(
                "dispatch_batch_complete",
                signals=len(signals),
                batch_ms=batch_ms,
            )
            self._resync_after_dispatch(
                master_cfg, master_source, diff, master_session
            )

        if self._api_client:
            now = time.time()
            poll_session = master_session if is_mt5(master_cfg.platform) else None
            if poll_session and (
                now - self._last_command_poll >= self._command_poll_interval_s
            ):
                self._last_command_poll = now
                self._poll_commands(poll_session)
            if should_sync_balances():
                sync_all_balances(self.accounts, self._sessions)

        self._last_poll_at = time.time()

    def _should_poll_fallback(self) -> bool:
        """When the MQL5 signal bus is active, poll positions less often as a safety net."""
        if self._signal_bus is None:
            return True
        return (time.time() - self._last_poll_at) >= (self._poll_fallback_ms / 1000.0)

    def _mark_master_connected(self, master_cfg: AccountConfig) -> None:
        if not self._api_client:
            return
        now = time.time()
        if now - self._last_master_status_post < self._master_status_interval_s:
            return
        self._last_master_status_post = now
        try:
            self._api_client.post_account_balances(
                [
                    {
                        "trading_account_id": master_cfg.id,
                        "connection_status": "connected",
                    }
                ]
            )
        except Exception as exc:
            logger.debug("master_status_sync_failed", error=str(exc))

    def _switch_to(self, target: AccountSession) -> bool:
        """Connect target account via shared terminal manager (no per-switch shutdown)."""
        if not target.connect():
            return False
        self._current_session = target
        return True

    def _read_master_positions(
        self, master_session: AccountSession | None
    ) -> List[dict] | None:
        """Read positions only when the shared terminal is on the master login.

        Trust the terminal manager's tracked active login (set during the switch
        and verified there on the warm path) instead of issuing a second
        ``account_info()`` round-trip on every poll.
        """
        if not master_session or not self._switch_to(master_session):
            return None
        expected = int(master_session.login) if str(master_session.login).isdigit() else 0
        if expected:
            active = get_terminal_manager().active_login()
            if active is not None and int(active) != expected:
                logger.warning(
                    "master_positions_skipped_wrong_login",
                    expected=expected,
                    actual=int(active),
                )
                return None
        return master_session.connector.get_open_positions()

    def _dispatch_to_followers(
        self,
        signal,
        copier_list: List[CopierConfig],
        master_cfg: AccountConfig,
        master_session: AccountSession | None,
    ) -> None:
        """Deprecated wrapper — use dispatch_to_followers directly + batch resync."""
        dispatch_to_followers(self, signal, copier_list, master_cfg, master_session)

    def _poll_commands(self, master_session: AccountSession) -> None:
        if not self._api_client:
            return
        try:
            commands = self._api_client.fetch_pending_commands()
            reloads = [c for c in commands if c.get("command_type") == "reload_config"]
            tests = [c for c in commands if c.get("command_type") == "test_connection"]
            others = [
                c
                for c in commands
                if c.get("command_type") not in ("test_connection", "reload_config")
            ]
            for cmd in reloads:
                self._force_reload_config()
                self._api_client.complete_command(
                    cmd["id"],
                    success=True,
                    result={"reloaded": True},
                )
            for cmd in others + tests:
                result = process_command(
                    cmd, self._sessions, master_session=master_session
                )
                self._api_client.complete_command(
                    cmd["id"],
                    success=bool(result.get("success")),
                    result=result,
                    error=result.get("error"),
                )
        except Exception as exc:
            logger.warning("command_poll_failed", error=str(exc))


_MODIFY_EVENTS = frozenset(
    {"sl_modified", "tp_modified", "sltp_modified", "volume_changed"}
)


def _merge_signals(bus_signals: list, poll_signals: list) -> list:
    """Prefer EA bus events; use poll diff only for tickets not already covered."""
    if not bus_signals:
        return _dedupe_open_signals(poll_signals)
    if not poll_signals:
        return _dedupe_open_signals(bus_signals)

    covered = {(s.event_type, s.ticket) for s in bus_signals}
    open_tickets = {
        s.ticket for s in bus_signals if s.event_type == "position_opened"
    }
    modify_tickets = {
        s.ticket for s in bus_signals if s.event_type in _MODIFY_EVENTS
    }
    merged = list(bus_signals)
    for sig in poll_signals:
        if sig.event_type == "position_opened" and sig.ticket in open_tickets:
            continue
        if sig.event_type in _MODIFY_EVENTS and sig.ticket in modify_tickets:
            continue
        if (sig.event_type, sig.ticket) not in covered:
            merged.append(sig)
            if sig.event_type == "position_opened":
                open_tickets.add(sig.ticket)
            elif sig.event_type in _MODIFY_EVENTS:
                modify_tickets.add(sig.ticket)
    return _dedupe_open_signals(merged)


def _dedupe_open_signals(signals: list) -> list:
    """Keep at most one position_opened per ticket (first wins)."""
    seen_open: set[int] = set()
    out: list = []
    for sig in signals:
        if sig.event_type == "position_opened":
            if sig.ticket in seen_open:
                continue
            seen_open.add(sig.ticket)
        out.append(sig)
    return out
