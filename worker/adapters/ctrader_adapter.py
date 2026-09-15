"""
cTrader Open API adapter (Phase 8) — research + broker access required.
"""

from __future__ import annotations

from typing import Any, Optional

from adapters.base import AdapterStatus, PlatformAdapter


class CTraderAdapter(PlatformAdapter):
    platform = "ctrader"
    status = AdapterStatus.STUB

    def connect(self, credentials: dict[str, Any]) -> bool:
        raise NotImplementedError("cTrader Open API integration pending Phase 8 spike")

    def get_open_positions(self) -> list[dict[str, Any]]:
        return []

    def place_market_order(
        self,
        symbol: str,
        side: str,
        volume: float,
        *,
        sl: Optional[float] = None,
        tp: Optional[float] = None,
    ) -> Optional[dict[str, Any]]:
        return None
