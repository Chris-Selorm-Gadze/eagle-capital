"""Platform adapters (MT4, cTrader, DXtrade, Tradovate)."""

from adapters.base import PlatformAdapter, AdapterStatus
from adapters.mt4_bridge import MT4BridgeAdapter
from adapters.ctrader_adapter import CTraderAdapter
from adapters.dxtrade_adapter import DXtradeAdapter
from adapters.tradovate_adapter import TradovateAdapter

__all__ = [
    "PlatformAdapter",
    "AdapterStatus",
    "MT4BridgeAdapter",
    "CTraderAdapter",
    "DXtradeAdapter",
    "TradovateAdapter",
]
