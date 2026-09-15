"""Copier pause / close dispatch behavior."""

from engine.config_loader import CopierConfig
from engine.copier_engine import CopierEngine
from engine.signal import TradeSignal
from engine.ticket_mapper import TicketMapper


def _copier(cid: str, follower: str, *, enabled: bool = True) -> CopierConfig:
    return CopierConfig(
        id=cid,
        master_id="master-1",
        follower_id=follower,
        enabled=enabled,
    )


def test_open_only_dispatches_enabled_copiers():
    engine = CopierEngine.__new__(CopierEngine)
    engine.copiers = [_copier("c1", "f1", enabled=True), _copier("c2", "f2", enabled=False)]
    engine.ticket_mapper = TicketMapper()

    enabled = [_copier("c1", "f1", enabled=True)]
    signal = TradeSignal(
        event_type="position_opened",
        account_id="master-1",
        ticket=100,
        symbol="EURUSD",
        side="buy",
        volume=0.1,
    )

    result = CopierEngine._copiers_for_signal(engine, "master-1", enabled, signal)
    assert [c.id for c in result] == ["c1"]


def test_close_includes_paused_copier_with_ticket_link():
    engine = CopierEngine.__new__(CopierEngine)
    paused = _copier("c2", "f2", enabled=False)
    engine.copiers = [_copier("c1", "f1", enabled=True), paused]
    engine.ticket_mapper = TicketMapper()
    engine.ticket_mapper.add("c2", 100, 555, "EURUSDm", "buy", follower_account_id="f2")

    enabled = [_copier("c1", "f1", enabled=True)]
    signal = TradeSignal(
        event_type="position_closed",
        account_id="master-1",
        ticket=100,
        symbol="EURUSD",
        side="buy",
        volume=0.1,
    )

    result = CopierEngine._copiers_for_signal(engine, "master-1", enabled, signal)
    assert {c.id for c in result} == {"c1", "c2"}
