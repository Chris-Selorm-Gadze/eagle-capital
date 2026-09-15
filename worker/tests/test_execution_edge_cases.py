"""Execution efficiency and edge-case unit tests."""

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.copier_engine import _dedupe_open_signals, _merge_signals
from engine.risk_engine import RiskEngine
from engine.signal import TradeSignal
from engine.state_diff import StateDiffEngine
from engine.terminal_pool import pool_plan_fingerprint


def _pos(ticket: int, sl: float = 0, tp: float = 0):
    return {
        "ticket": ticket,
        "symbol": "EURUSD",
        "type": 0,
        "volume": 0.1,
        "price_open": 1.1,
        "sl": sl,
        "tp": tp,
    }


def test_state_diff_ignores_float_noise_on_stops():
    engine = StateDiffEngine("master-1")
    engine.bootstrap([_pos(1, sl=1.0500000001, tp=1.2)])
    events = engine.diff([_pos(1, sl=1.05, tp=1.20000000001)])
    assert events == []


def test_pool_fingerprint_stable_when_unchanged():
    paths = {
        "a": "C:/MT5/Exness/terminal64.exe",
        "b": "C:/MT5/FTMO/terminal64.exe",
    }
    assert pool_plan_fingerprint(paths) == pool_plan_fingerprint(dict(paths))


def test_dedupe_open_signals_keeps_one_per_ticket():
    signals = [
        TradeSignal("position_opened", "m", 1, "EURUSD", "buy", 0.1),
        TradeSignal("position_opened", "m", 1, "EURUSD", "buy", 0.1),
        TradeSignal("position_closed", "m", 1, "EURUSD", "buy", 0.1),
    ]
    out = _dedupe_open_signals(signals)
    assert len(out) == 2
    assert out[0].event_type == "position_opened"
    assert out[1].event_type == "position_closed"


def test_merge_signals_prefers_bus_modify_over_poll():
    bus = [
        TradeSignal(
            "sltp_modified",
            "m",
            5,
            "EURUSD",
            "buy",
            0.1,
            sl=1.05,
            tp=1.2,
        )
    ]
    poll = [
        TradeSignal("sl_modified", "m", 5, "EURUSD", "buy", 0.1, sl=1.05),
    ]
    merged = _merge_signals(bus, poll)
    assert len(merged) == 1
    assert merged[0].event_type == "sltp_modified"


def test_risk_engine_record_open_increments_daily_count():
    engine = RiskEngine(
        {
            "acc-1": {
                "account_id": "acc-1",
                "daily_trades_count": 2,
                "max_trades_per_day": 10,
            }
        }
    )
    engine.record_open("acc-1")
    assert engine.profile_for("acc-1")["daily_trades_count"] == 3


def test_follower_close_treats_already_flat_as_success():
    from engine.follower_executor import FollowerExecutor
    from engine.ticket_mapper import TicketMapper

    session = MagicMock()
    session.account_id = "f1"
    session.connector.close_position.return_value = {
        "retcode": 10009,
        "comment": "already_closed",
    }

    mapper = TicketMapper()
    mapper.add("c1", 99, 123, "EURUSD", "buy", follower_account_id="f1", volume=0.1)

    executor = FollowerExecutor(session, MagicMock(), mapper, event_sink=lambda _e: None)
    signal = TradeSignal("position_closed", "m", 99, "EURUSD", "buy", 0.1)
    copier = MagicMock()
    copier.id = "c1"

    try:
        import MetaTrader5 as mt5

        session.connector.close_position.return_value = {
            "retcode": mt5.TRADE_RETCODE_DONE,
            "comment": "already_closed",
        }
    except ImportError:
        pass

    ok = executor._copy_close(signal, copier)
    assert ok is True
    assert not mapper.has("c1", 99)
