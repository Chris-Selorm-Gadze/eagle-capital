"""
MT4 bridge adapter (Phase 8) — socket/EA bridge stub; implement when bridge service is deployed.
"""

from __future__ import annotations

from typing import Any, Optional

from adapters.base import AdapterStatus, PlatformAdapter


class MT4BridgeAdapter(PlatformAdapter):
    platform = "mt4"
    status = AdapterStatus.STUB

    def connect(self, credentials: dict[str, Any]) -> bool:
        raise NotImplementedError(
            "MT4 bridge not deployed. Run MT4 EA + socket bridge per docs/phases/PHASE8_MT4.md"
        )

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
