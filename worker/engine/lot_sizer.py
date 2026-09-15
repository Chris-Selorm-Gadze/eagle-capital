"""
Lot sizing: fixed lot and multiplier modes with broker normalization.
"""

from __future__ import annotations

from engine.config_loader import CopierConfig
from engine.mt5_connector import MT5Connector


def calculate_lot(
    connector: MT5Connector,
    symbol: str,
    master_volume: float,
    copier: CopierConfig,
) -> float | None:
    if copier.risk_mode == "fixed_lot":
        raw = copier.fixed_lot_size
    else:
        raw = master_volume * copier.multiplier

    return connector.normalize_lot(symbol, raw)
