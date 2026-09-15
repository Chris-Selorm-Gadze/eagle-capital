"""
Normalized trade signals emitted by the state-diff engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import time


@dataclass(frozen=True)
class PositionSnapshot:
    ticket: int
    symbol: str
    side: str  # buy | sell
    volume: float
    open_price: float
    sl: float
    tp: float
    magic: int = 0

    @classmethod
    def from_mt5_position(cls, pos: dict) -> "PositionSnapshot":
        # MT5 position type: 0 = buy, 1 = sell
        side = "buy" if pos.get("type") == 0 else "sell"
        return cls(
            ticket=int(pos["ticket"]),
            symbol=str(pos["symbol"]),
            side=side,
            volume=float(pos["volume"]),
            open_price=float(pos.get("price_open", 0)),
            sl=float(pos.get("sl", 0) or 0),
            tp=float(pos.get("tp", 0) or 0),
            magic=int(pos.get("magic", 0)),
        )


@dataclass
class TradeSignal:
    event_type: str
    account_id: str
    ticket: int
    symbol: str
    side: str
    volume: float
    open_price: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    timestamp_ms: int = 0
    previous_volume: Optional[float] = None

    def __post_init__(self):
        if self.timestamp_ms == 0:
            self.timestamp_ms = int(time.time() * 1000)

    def age_ms(self) -> int:
        return int(time.time() * 1000) - self.timestamp_ms

    def refresh_timestamp(self) -> None:
        """Reset age clock before fan-out to slow followers (terminal switching)."""
        self.timestamp_ms = int(time.time() * 1000)
