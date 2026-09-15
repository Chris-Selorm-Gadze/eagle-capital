"""
Symbol mapping between master and follower brokers.
"""

from __future__ import annotations

from typing import List, Optional, TYPE_CHECKING

from engine.config_loader import SymbolMapping

if TYPE_CHECKING:
    from engine.mt5_connector import MT5Connector


class SymbolMapper:
    def __init__(self, mappings: List[SymbolMapping]):
        self._map = {m.master_symbol: m.follower_symbol for m in mappings}

    def map_symbol(self, master_symbol: str) -> str:
        """Configured alias only — does not guess broker suffixes."""
        if master_symbol in self._map:
            return self._map[master_symbol]
        if master_symbol.endswith("m") and len(master_symbol) > 4:
            base = master_symbol[:-1]
            if base in self._map:
                return self._map[base]
        return master_symbol

    def resolve_for_follower(
        self,
        master_symbol: str,
        connector: "MT5Connector",
    ) -> Optional[str]:
        """
        Pick a symbol that exists on the follower terminal.
        Tries explicit mapping, master name, then common suffix variants.
        """
        # Resolution is stable per (terminal, master_symbol): the follower symbol
        # that exists doesn't change between signals, so cache it on the warm
        # connector to skip the candidate-probing symbol_info() calls.
        resolved_cache = getattr(connector, "_resolved_symbols", None)
        if resolved_cache is not None:
            hit = resolved_cache.get(master_symbol)
            if hit is not None:
                return hit

        mapped = self.map_symbol(master_symbol)
        candidates: list[str] = []
        for sym in (mapped, master_symbol):
            if sym and sym not in candidates:
                candidates.append(sym)
        if master_symbol.endswith("m") and len(master_symbol) > 4:
            base = master_symbol[:-1]
            for sym in (base, f"{base}m"):
                if sym not in candidates:
                    candidates.append(sym)
        elif not master_symbol.endswith("m"):
            suffixed = f"{master_symbol}m"
            if suffixed not in candidates:
                candidates.append(suffixed)

        for sym in candidates:
            if connector.get_symbol_info(sym) is not None:
                if resolved_cache is not None:
                    resolved_cache[master_symbol] = sym
                return sym
        return None
