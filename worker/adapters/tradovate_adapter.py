"""
Tradovate adapter (Phase 10) — blocked until API docs in docs/integrations/tradovate/.
"""

from __future__ import annotations

from typing import Any, Optional

from adapters.base import AdapterStatus, PlatformAdapter


class TradovateAdapter(PlatformAdapter):
    platform = "tradovate"
    status = AdapterStatus.BLOCKED

    def documentation_path(self) -> Optional[str]:
        return "docs/integrations/tradovate/README.md"

    def connect(self, credentials: dict[str, Any]) -> bool:
        raise NotImplementedError(
            "Tradovate integration blocked — add API docs under docs/integrations/tradovate/"
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
