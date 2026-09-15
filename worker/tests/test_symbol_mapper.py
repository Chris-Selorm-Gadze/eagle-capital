"""Unit tests for symbol mapping fallbacks."""

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.config_loader import SymbolMapping
from engine.symbol_mapper import SymbolMapper


def test_explicit_mapping():
    mapper = SymbolMapper([SymbolMapping("EURUSDm", "EURUSD")])
    assert mapper.map_symbol("EURUSDm") == "EURUSD"


def test_map_symbol_keeps_suffix_without_mapping():
    mapper = SymbolMapper([])
    assert mapper.map_symbol("EURUSDm") == "EURUSDm"


def test_resolve_prefers_existing_symbol():
    connector = MagicMock()
    connector.get_symbol_info.side_effect = lambda s: None if s == "EURUSD" else {"symbol": s}
    # Prevent _resolved_symbols cache from being a MagicMock
    connector._resolved_symbols = None

    mapper = SymbolMapper([])
    assert mapper.resolve_for_follower("EURUSDm", connector) == "EURUSDm"


def test_resolve_uses_explicit_mapping_when_valid():
    connector = MagicMock()
    connector.get_symbol_info.side_effect = lambda s: {"symbol": s} if s == "EURUSD" else None
    # Prevent _resolved_symbols cache from being a MagicMock
    connector._resolved_symbols = None

    mapper = SymbolMapper([SymbolMapping("EURUSDm", "EURUSD")])
    assert mapper.resolve_for_follower("EURUSDm", connector) == "EURUSD"
