"""Unit tests for state-diff engine (Phase 1)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.state_diff import StateDiffEngine


def _pos(ticket: int, symbol: str = "EURUSD", volume: float = 0.1, sl: float = 0, tp: float = 0):
    return {
        "ticket": ticket,
        "symbol": symbol,
        "type": 0,
        "volume": volume,
        "price_open": 1.1,
        "sl": sl,
        "tp": tp,
    }


def test_bootstrap_emits_nothing():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([_pos(1)])
    events = engine.diff([_pos(1)])
    assert events == []


def test_detects_open():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([])
    events = engine.diff([_pos(42)])
    assert len(events) == 1
    assert events[0].event_type == "position_opened"
    assert events[0].ticket == 42


def test_detects_close():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([_pos(1)])
    events = engine.diff([])
    assert len(events) == 1
    assert events[0].event_type == "position_closed"


def test_detects_sl_modify():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([_pos(1, sl=0)])
    events = engine.diff([_pos(1, sl=1.05)])
    types = {e.event_type for e in events}
    assert "sl_modified" in types


def test_combined_sl_tp_modify_coalesces_to_single_signal():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([_pos(1, sl=0, tp=0)])
    events = engine.diff([_pos(1, sl=1.05, tp=1.20)])
    assert len(events) == 1
    assert events[0].event_type == "sltp_modified"
    assert events[0].sl == 1.05
    assert events[0].tp == 1.20


def test_resync_emits_nothing():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([_pos(1)])
    engine.resync([_pos(2)])
    events = engine.diff([_pos(2)])
    assert events == []


def test_suppress_closes():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([_pos(1)])
    events = engine.diff([], suppress_closes=True)
    assert events == []
    assert 1 not in engine._snapshot
