"""
Execute copy actions on follower accounts from master TradeSignals.
"""

from __future__ import annotations

import time
from typing import Callable, Optional

import structlog

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None

from engine.account_session import AccountSession
from engine.config_loader import CopierConfig
from engine.execution_log import append_event
from engine.lot_sizer import calculate_lot
from engine.signal import TradeSignal
from engine.symbol_mapper import SymbolMapper
from engine.ticket_mapper import TicketMapper
from engine.risk_engine import RiskEngine

logger = structlog.get_logger()

_OPEN_OK_RETCODES: set[int] = set()


def _open_ok_retcode(retcode: int | None) -> bool:
    if retcode is None or mt5 is None:
        return False
    if not _OPEN_OK_RETCODES:
        _OPEN_OK_RETCODES.add(mt5.TRADE_RETCODE_DONE)
        partial = getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10009)
        _OPEN_OK_RETCODES.add(partial)
    return int(retcode) in _OPEN_OK_RETCODES


class FollowerExecutor:
    def __init__(
        self,
        follower_session: AccountSession,
        symbol_mapper: SymbolMapper,
        ticket_mapper: TicketMapper,
        risk_engine: RiskEngine | None = None,
        *,
        event_sink: Callable[[dict], None] | None = None,
        switch_ms: int = 0,
        detected_at_ms: int | None = None,
    ):
        self.follower = follower_session
        self.symbol_mapper = symbol_mapper
        self.ticket_mapper = ticket_mapper
        self.risk_engine = risk_engine
        self._emit = event_sink or append_event
        self._switch_ms = switch_ms
        self._detected_at_ms = detected_at_ms

    def _timing(self, order_ms: int | None = None) -> dict:
        e2e = None
        if self._detected_at_ms:
            e2e = max(0, int(time.time() * 1000) - int(self._detected_at_ms))
        out: dict = {"switch_ms": self._switch_ms, "e2e_ms": e2e}
        if order_ms is not None:
            out["order_ms"] = order_ms
            out["latency_ms"] = e2e if e2e is not None else order_ms
        return out

    def handle(
        self,
        signal: TradeSignal,
        copier: CopierConfig,
    ) -> bool:
        if mt5 is None:
            logger.error("mt5_unavailable")
            return False

        # The staleness guard only applies to OPENS — a late entry can fill at a
        # bad price. Closes and modifies must always be applied: skipping a
        # stale close leaves the follower position open (desync/risk) and
        # skipping a modify leaves wrong stops. They reflect the latest desired
        # state at detection and are effectively idempotent, so late is fine.
        if (
            signal.event_type == "position_opened"
            and signal.age_ms() > copier.max_signal_age_ms
        ):
            self._emit(
                {
                    "status": "skipped_slippage",
                    "copier_id": copier.id,
                    "event_type": signal.event_type,
                    "master_ticket": signal.ticket,
                    **self._timing(signal.age_ms()),
                }
            )
            return False

        if signal.event_type == "position_opened":
            if not copier.enabled:
                logger.info(
                    "copy_open_skipped_copier_paused",
                    copier=copier.id,
                    ticket=signal.ticket,
                )
                return True
            return self._copy_open(signal, copier)
        if signal.event_type == "position_closed" and copier.copy_closes:
            return self._copy_close(signal, copier)
        if (
            signal.event_type in ("sl_modified", "tp_modified", "sltp_modified")
            and copier.copy_modifications
        ):
            return self._copy_modify(signal, copier)
        if signal.event_type == "volume_changed":
            # MVP: full close on volume decrease to zero handled by position_closed
            logger.info("volume_changed_ignored_mvp", ticket=signal.ticket)
            return True

        return True

    def _copy_open(self, signal: TradeSignal, copier: CopierConfig) -> bool:
        if self.ticket_mapper.has(copier.id, signal.ticket) or self.ticket_mapper.has_for_follower(
            self.follower.account_id, signal.ticket
        ):
            self._emit(
                {
                    "status": "duplicate_ignored",
                    "copier_id": copier.id,
                    "master_ticket": signal.ticket,
                }
            )
            return True

        magic = hash(copier.id) % 100000

        follower_symbol = self.symbol_mapper.resolve_for_follower(
            signal.symbol, self.follower.connector
        )
        if not follower_symbol:
            self._emit(
                {
                    "status": "rejected",
                    "copier_id": copier.id,
                    "error": "symbol_not_found",
                    "symbol_master": signal.symbol,
                }
            )
            logger.error(
                "follower_symbol_not_found",
                master_symbol=signal.symbol,
                follower=self.follower.account_id,
            )
            return False

        lot = calculate_lot(
            self.follower.connector, follower_symbol, signal.volume, copier
        )
        if lot is None:
            self._emit(
                {
                    "status": "rejected",
                    "copier_id": copier.id,
                    "error": "invalid_lot",
                    "symbol": follower_symbol,
                }
            )
            return False

        if self.risk_engine:
            # Only fetch the live position count when a max_open_positions rule
            # actually needs it — otherwise skip the terminal round-trip.
            open_count = (
                len(self.follower.connector.get_open_positions())
                if self.risk_engine.requires_open_count(self.follower.account_id)
                else 0
            )
            decision = self.risk_engine.check_open(
                self.follower.account_id,
                follower_symbol,
                lot,
                open_count,
            )
            if not decision.allowed:
                self._emit(
                    {
                        "status": decision.status,
                        "copier_id": copier.id,
                        "event_type": signal.event_type,
                        "master_ticket": signal.ticket,
                        "symbol": follower_symbol,
                        "error_message": decision.reason,
                    }
                )
                return False

        order_type = mt5.ORDER_TYPE_BUY if signal.side == "buy" else mt5.ORDER_TYPE_SELL
        sl = signal.sl if copier.copy_sl and signal.sl else 0.0
        tp = signal.tp if copier.copy_tp and signal.tp else 0.0

        t0 = time.perf_counter()
        result = self.follower.connector.place_market_order(
            symbol=follower_symbol,
            order_type=order_type,
            volume=lot,
            sl=sl or 0.0,
            tp=tp or 0.0,
            magic=magic,
            comment=f"DE:{signal.ticket}",
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)

        if result is None:
            self._emit(
                {
                    "status": "failed",
                    "copier_id": copier.id,
                    "event_type": signal.event_type,
                    "master_ticket": signal.ticket,
                    **self._timing(latency_ms),
                }
            )
            return False

        success = _open_ok_retcode(result.get("retcode"))
        follower_ticket = (
            result.get("position_ticket")
            or result.get("order")
            or result.get("deal")
        )
        executed_lot = float(result.get("volume") or lot) if success else 0.0

        if success and follower_ticket:
            self.ticket_mapper.add(
                copier.id,
                signal.ticket,
                int(follower_ticket),
                follower_symbol,
                signal.side,
                follower_account_id=self.follower.account_id,
                volume=executed_lot or lot,
            )
            if self.risk_engine:
                self.risk_engine.record_open(self.follower.account_id)

        self._emit(
            {
                "status": "success" if success else "rejected",
                "copier_id": copier.id,
                "event_type": signal.event_type,
                "master_ticket": signal.ticket,
                "follower_ticket": follower_ticket,
                "symbol_master": signal.symbol,
                "symbol_follower": follower_symbol,
                "side": signal.side,
                "requested_lot": lot,
                "executed_lot": executed_lot if success else 0,
                "broker_return_code": str(result.get("retcode")),
                "error_message": result.get("comment"),
                **self._timing(latency_ms),
            }
        )
        return success

    def _resolve_follower_ticket(
        self, signal: TradeSignal, copier: CopierConfig
    ) -> int | str | None:
        """Find the follower ticket for this master position.

        Falls back to scanning live follower positions tagged with the master
        ticket (``DE:<ticket>`` comment) so closes/modifies survive a worker
        restart even when the in-memory map was lost.
        """
        link = self.ticket_mapper.get(copier.id, signal.ticket)
        if link:
            return link.follower_ticket
        try:
            tag = f"DE:{signal.ticket}"
            for pos in self.follower.connector.get_open_positions():
                if str(pos.get("comment") or "").strip() == tag:
                    follower_ticket = int(pos["ticket"])
                    self.ticket_mapper.add(
                        copier.id,
                        signal.ticket,
                        follower_ticket,
                        str(pos.get("symbol") or signal.symbol),
                        signal.side,
                        follower_account_id=self.follower.account_id,
                        volume=float(pos.get("volume") or 0) or None,
                    )
                    logger.info(
                        "ticket_link_self_healed",
                        master_ticket=signal.ticket,
                        follower_ticket=follower_ticket,
                    )
                    return follower_ticket
        except Exception as exc:
            logger.warning("ticket_link_self_heal_failed", error=str(exc))
        return None

    def _copy_close(self, signal: TradeSignal, copier: CopierConfig) -> bool:
        follower_ticket = self._resolve_follower_ticket(signal, copier)
        if follower_ticket is None:
            logger.debug(
                "copy_close_no_link", copier=copier.id, master_ticket=signal.ticket
            )
            return True

        link = self.ticket_mapper.get(copier.id, signal.ticket)
        t0 = time.perf_counter()
        result = self.follower.connector.close_position(
            follower_ticket,
            symbol=link.symbol if link else None,
            volume=link.volume if link else None,
            side=link.side if link else None,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)

        already_flat = result is None or (
            result.get("comment") == "already_closed"
            and result.get("retcode") == mt5.TRADE_RETCODE_DONE
        )
        success = already_flat or (
            result is not None and result.get("retcode") == mt5.TRADE_RETCODE_DONE
        )
        if success:
            self.ticket_mapper.remove(
                copier.id,
                signal.ticket,
                follower_account_id=self.follower.account_id,
            )

        self._emit(
            {
                "status": "closed" if success else "failed",
                "copier_id": copier.id,
                "event_type": signal.event_type,
                "master_ticket": signal.ticket,
                "follower_ticket": follower_ticket,
                "symbol_master": signal.symbol,
                "symbol_follower": link.symbol if link else None,
                "side": link.side if link else signal.side,
                "executed_lot": link.volume if link else None,
                "broker_return_code": (
                    str(result.get("retcode")) if result else "already_closed"
                ),
                "error_message": (
                    "position_already_flat"
                    if already_flat
                    else (result.get("comment") if result else "close_failed")
                ),
                **self._timing(latency_ms),
            }
        )
        return success

    def _copy_modify(self, signal: TradeSignal, copier: CopierConfig) -> bool:
        follower_ticket = self._resolve_follower_ticket(signal, copier)
        if follower_ticket is None:
            logger.debug(
                "copy_modify_no_link", copier=copier.id, master_ticket=signal.ticket
            )
            return True

        sl = 0.0
        tp = 0.0
        stops = self.follower.connector.get_position_stops(int(follower_ticket))
        current_sl = stops[0] if stops else 0.0
        current_tp = stops[1] if stops else 0.0

        if copier.copy_sl and signal.sl is not None:
            sl = float(signal.sl)
        else:
            sl = current_sl
        if copier.copy_tp and signal.tp is not None:
            tp = float(signal.tp)
        else:
            tp = current_tp

        link = self.ticket_mapper.get(copier.id, signal.ticket)
        t0 = time.perf_counter()
        result = self.follower.connector.modify_position(
            follower_ticket,
            sl=sl or 0.0,
            tp=tp or 0.0,
            symbol=link.symbol if link else None,
            side=link.side if link else signal.side,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)
        # NO_CHANGES means the SL/TP already match (e.g. a paired SL+TP edit
        # arriving as two signals) — the desired state is in place, so treat it
        # as success rather than a failure.
        ok_codes = {mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_NO_CHANGES}
        success = result is not None and result.get("retcode") in ok_codes

        self._emit(
            {
                "status": "modified" if success else "failed",
                "copier_id": copier.id,
                "event_type": signal.event_type,
                "master_ticket": signal.ticket,
                "follower_ticket": follower_ticket,
                "broker_return_code": (
                    str(result.get("retcode")) if result else None
                ),
                "error_message": result.get("comment") if result else "modify_failed",
                **self._timing(latency_ms),
            }
        )
        return success
