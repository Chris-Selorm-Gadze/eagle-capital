"""
Execute copy actions on DXtrade followers (FTMO, etc.) via REST — no MT5 terminal.
"""

from __future__ import annotations

import time
from typing import Any, Optional

import structlog

from adapters.dxtrade_adapter import DXtradeAdapter
from engine.config_loader import AccountConfig, CopierConfig
from engine.execution_log import append_event
from engine.lot_sizer import calculate_lot
from engine.risk_engine import RiskEngine
from engine.signal import TradeSignal
from engine.symbol_mapper import SymbolMapper
from engine.ticket_mapper import TicketMapper

logger = structlog.get_logger()

DXTRADE_DONE = 0


class DXtradeFollowerExecutor:
    def __init__(
        self,
        follower: AccountConfig,
        symbol_mapper: SymbolMapper,
        ticket_mapper: TicketMapper,
        risk_engine: RiskEngine | None = None,
    ):
        self.follower = follower
        self.symbol_mapper = symbol_mapper
        self.ticket_mapper = ticket_mapper
        self.risk_engine = risk_engine
        self._adapter = DXtradeAdapter()

    def _ensure_connected(self) -> bool:
        return self._adapter.connect(
            {
                "username": self.follower.login,
                "password": self.follower.password,
                "domain": self.follower.server,
                "api_base_url": self.follower.api_base_url,
                "broker_server": self.follower.api_base_url,
            }
        )

    def handle(self, signal: TradeSignal, copier: CopierConfig) -> bool:
        # Staleness guard applies to opens only — closes must always be applied
        # so the follower never gets stranded with an open position.
        if (
            signal.event_type == "position_opened"
            and signal.age_ms() > copier.max_signal_age_ms
        ):
            append_event(
                {
                    "status": "skipped_slippage",
                    "copier_id": copier.id,
                    "event_type": signal.event_type,
                    "master_ticket": signal.ticket,
                    "latency_ms": signal.age_ms(),
                    "platform": "dxtrade",
                }
            )
            return False

        if not self._ensure_connected():
            append_event(
                {
                    "status": "failed",
                    "copier_id": copier.id,
                    "error": "dxtrade_connect_failed",
                    "follower": self.follower.id,
                }
            )
            return False

        if signal.event_type == "position_opened":
            if not copier.enabled:
                logger.info(
                    "copy_open_skipped_copier_paused",
                    copier=copier.id,
                    ticket=signal.ticket,
                    platform="dxtrade",
                )
                return True
            return self._copy_open(signal, copier)
        if signal.event_type == "position_closed" and copier.copy_closes:
            return self._copy_close(signal, copier)
        return True

    def _copy_open(self, signal: TradeSignal, copier: CopierConfig) -> bool:
        if self.ticket_mapper.has(copier.id, signal.ticket) or self.ticket_mapper.has_for_follower(
            self.follower.id, signal.ticket
        ):
            append_event(
                {
                    "status": "duplicate_ignored",
                    "copier_id": copier.id,
                    "master_ticket": signal.ticket,
                    "platform": "dxtrade",
                }
            )
            return True

        follower_symbol = self.symbol_mapper.map_symbol(signal.symbol)
        lot = calculate_lot_dx(follower_symbol, signal.volume, copier)
        if lot is None:
            append_event(
                {
                    "status": "rejected",
                    "copier_id": copier.id,
                    "error": "invalid_lot",
                    "symbol": follower_symbol,
                    "platform": "dxtrade",
                }
            )
            return False

        if self.risk_engine:
            open_count = len(self._adapter.get_open_positions())
            decision = self.risk_engine.check_open(
                self.follower.id,
                follower_symbol,
                lot,
                open_count,
            )
            if not decision.allowed:
                append_event(
                    {
                        "status": decision.status,
                        "copier_id": copier.id,
                        "master_ticket": signal.ticket,
                        "error_message": decision.reason,
                        "platform": "dxtrade",
                    }
                )
                return False

        t0 = time.perf_counter()
        result = self._adapter.place_market_order(
            follower_symbol,
            signal.side,
            lot,
            sl=signal.sl if copier.copy_sl else None,
            tp=signal.tp if copier.copy_tp else None,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)

        if result is None:
            append_event(
                {
                    "status": "failed",
                    "copier_id": copier.id,
                    "master_ticket": signal.ticket,
                    "platform": "dxtrade",
                }
            )
            return False

        success = int(result.get("retcode", -1)) == DXTRADE_DONE
        follower_ref = result.get("order") or result.get("orderCode") or result.get("positionCode")

        if success and follower_ref is not None:
            ticket_id: int | str
            try:
                ticket_id = int(follower_ref)
            except (TypeError, ValueError):
                ticket_id = str(follower_ref)
            self.ticket_mapper.add(
                copier.id,
                signal.ticket,
                ticket_id,
                follower_symbol,
                signal.side,
                follower_account_id=self.follower.id,
            )

        append_event(
            {
                "status": "success" if success else "rejected",
                "copier_id": copier.id,
                "event_type": signal.event_type,
                "master_ticket": signal.ticket,
                "follower_ticket": follower_ref,
                "symbol_master": signal.symbol,
                "symbol_follower": follower_symbol,
                "platform": "dxtrade",
                "latency_ms": latency_ms,
                "error_message": result.get("comment"),
            }
        )
        return success

    def _copy_close(self, signal: TradeSignal, copier: CopierConfig) -> bool:
        link = self.ticket_mapper.get(copier.id, signal.ticket)
        if not link or not self._ensure_connected():
            return True

        if not self._adapter._client or not self._adapter._account_key:
            return False

        pos_code = str(link.follower_ticket)
        t0 = time.perf_counter()
        try:
            result = self._adapter._client.close_position(
                self._adapter._account_key,
                pos_code,
            )
            success = True
        except Exception as exc:
            logger.error("dxtrade_close_failed", error=str(exc))
            result = {}
            success = False
        latency_ms = int((time.perf_counter() - t0) * 1000)

        if success:
            self.ticket_mapper.remove(
                copier.id,
                signal.ticket,
                follower_account_id=self.follower.id,
            )

        append_event(
            {
                "status": "closed" if success else "failed",
                "copier_id": copier.id,
                "master_ticket": signal.ticket,
                "follower_ticket": pos_code,
                "latency_ms": latency_ms,
                "platform": "dxtrade",
            }
        )
        return success


def calculate_lot_dx(symbol: str, master_volume: float, copier: CopierConfig) -> float | None:
    if copier.risk_mode == "fixed_lot":
        raw = copier.fixed_lot_size
    else:
        raw = master_volume * copier.multiplier
    if raw <= 0:
        return None
    return round(raw, 2)
