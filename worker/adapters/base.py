"""
Base platform adapter — normalize to TradeSignal / order placement (Phases 8–10).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional


class AdapterStatus(str, Enum):
    LIVE = "live"
    STUB = "stub"
    BLOCKED = "blocked"


@dataclass
class PlatformAdapter(ABC):
    platform: str
    status: AdapterStatus = AdapterStatus.STUB

    @abstractmethod
    def connect(self, credentials: dict[str, Any]) -> bool:
        ...

    @abstractmethod
    def get_open_positions(self) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    def place_market_order(
        self,
        symbol: str,
        side: str,
        volume: float,
        *,
        sl: Optional[float] = None,
        tp: Optional[float] = None,
    ) -> Optional[dict[str, Any]]:
        ...

    def documentation_path(self) -> Optional[str]:
        return None
