"""Tests for MQL5 signal bus JSONL parsing."""

from __future__ import annotations

import json
from pathlib import Path

from engine.signal_bus import SignalBusReader, bus_file_for_master


def test_bus_file_for_master():
    path = bus_file_for_master("12345678")
    assert path.name == "signals_12345678.jsonl"
    assert path.parent.name == "delta_engine"


def test_drain_parses_open_and_close(tmp_path, monkeypatch):
    bus_dir = tmp_path / "delta_engine"
    bus_dir.mkdir(parents=True)
    monkeypatch.setenv("WORKER_SIGNAL_BUS_DIR", str(bus_dir))
    reader = SignalBusReader("master-1", "999")
    bus_file = bus_dir / "signals_999.jsonl"
    rows = [
        {"event": "open", "ticket": 100, "symbol": "XAUUSD", "side": "buy", "volume": 0.01, "sl": 0, "tp": 0, "ts": 1},
        {"event": "sltp", "ticket": 100, "symbol": "XAUUSD", "side": "buy", "volume": 0.01, "sl": 1.1, "tp": 2.2, "ts": 2},
        {"event": "close", "ticket": 100, "symbol": "XAUUSD", "side": "buy", "volume": 0, "sl": 0, "tp": 0, "ts": 3},
    ]
    with open(bus_file, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")

    signals = reader.drain()
    assert len(signals) == 3
    assert signals[0].event_type == "position_opened"
    assert signals[1].event_type == "sltp_modified"
    assert signals[2].event_type == "position_closed"
    assert reader.drain() == []
