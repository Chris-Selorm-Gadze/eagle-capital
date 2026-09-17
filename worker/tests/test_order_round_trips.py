"""How many broker round trips one copy costs.

Latency on a distant broker is dominated by round trips, not by anything the
copier computes. An Exness terminal measures ~285 ms to its trade server, so a
copy that sends three orders where two would do is a third of a second slower
for no gain.

Market-execution brokers refuse SL/TP on the opening deal. The connector has
always handled that by sending, being rejected, stripping the stops and sending
again -- correct, but it rediscovered the refusal on every single copy. These
tests pin both halves of the fix: the rejected send stops happening, and the
stops still end up on the position.
"""

from __future__ import annotations

import os
import sys
from typing import Any, Optional

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine import mt5_connector as mc
from engine.mt5_connector import MT5Connector

LOGIN = 5001


class Rec:
    """Stands in for MetaTrader's namedtuple results."""

    def __init__(self, **kw: Any) -> None:
        self.__dict__.update(kw)

    def _asdict(self) -> dict:
        return dict(self.__dict__)


class StubMT5:
    """A terminal and a broker, with a switch for how the broker handles stops.

    ``market_execution`` is the Exness-shaped behaviour: SL/TP on the opening
    deal is rejected outright and has to be applied to the position afterwards.
    """

    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    TRADE_ACTION_DEAL = 1
    TRADE_ACTION_SLTP = 6
    ORDER_TIME_GTC = 0
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_RETURN = 2
    TRADE_RETCODE_DONE = 10009
    TRADE_RETCODE_INVALID_STOPS = 10016
    TRADE_RETCODE_NO_CHANGES = 10025

    def __init__(self, market_execution: bool) -> None:
        self.market_execution = market_execution
        self.sent: list[dict] = []
        self.positions: dict[int, Rec] = {}
        self._next_ticket = 900

    # -- reads the connector makes locally (no broker round trip) -------------
    def account_info(self) -> Rec:
        return Rec(login=LOGIN, server="Stub-Demo")

    def last_error(self) -> tuple:
        return (0, "ok")

    def symbol_info(self, symbol: str) -> Rec:
        return Rec(
            name=symbol,
            visible=True,
            digits=5,
            filling_mode=2,  # IOC only, so one filling candidate
            volume_min=0.01,
            volume_max=100.0,
            volume_step=0.01,
            trade_stops_level=0,
            point=0.00001,
        )

    def symbol_select(self, symbol: str, enable: bool) -> bool:
        return True

    def symbol_info_tick(self, symbol: str) -> Rec:
        return Rec(bid=1.1000, ask=1.1002)

    def positions_get(self, ticket: Optional[int] = None, symbol: Optional[str] = None):
        if ticket is not None:
            pos = self.positions.get(int(ticket))
            return (pos,) if pos else ()
        return tuple(self.positions.values())

    # -- the one call that actually goes to the broker ------------------------
    def order_send(self, request: dict) -> Rec:
        self.sent.append(dict(request))

        if request["action"] == self.TRADE_ACTION_SLTP:
            pos = self.positions[int(request["position"])]
            pos.sl = float(request.get("sl", 0) or 0)
            pos.tp = float(request.get("tp", 0) or 0)
            return Rec(retcode=self.TRADE_RETCODE_DONE, order=0, position=pos.ticket)

        has_stops = bool(request.get("sl") or request.get("tp"))
        if self.market_execution and has_stops:
            return Rec(retcode=self.TRADE_RETCODE_INVALID_STOPS, order=0, position=0)

        self._next_ticket += 1
        ticket = self._next_ticket
        self.positions[ticket] = Rec(
            ticket=ticket,
            symbol=request["symbol"],
            type=request["type"],
            volume=request["volume"],
            magic=request.get("magic", 0),
            sl=float(request.get("sl", 0) or 0),
            tp=float(request.get("tp", 0) or 0),
        )
        return Rec(retcode=self.TRADE_RETCODE_DONE, order=ticket, position=ticket)


@pytest.fixture
def stub(monkeypatch):
    def _make(market_execution: bool) -> StubMT5:
        s = StubMT5(market_execution)
        monkeypatch.setattr(mc, "mt5", s)
        return s

    return _make


def _connector() -> MT5Connector:
    return MT5Connector(login=LOGIN, password="x", server="Stub-Demo")


def _deals(s: StubMT5) -> list[dict]:
    return [r for r in s.sent if r["action"] == StubMT5.TRADE_ACTION_DEAL]


def _buy(conn: MT5Connector, s: StubMT5, symbol: str = "EURUSD"):
    return conn.place_market_order(
        symbol=symbol,
        order_type=s.ORDER_TYPE_BUY,
        volume=0.1,
        sl=1.0950,
        tp=1.1100,
    )


class TestMarketExecutionBroker:
    def test_the_first_copy_still_pays_to_discover_the_refusal(self, stub):
        s = stub(market_execution=True)
        conn = _connector()

        assert _buy(conn, s) is not None

        # deal-with-stops (rejected), deal-clean, then SLTP.
        assert len(s.sent) == 3
        assert len(_deals(s)) == 2

    def test_the_next_copy_skips_the_send_it_knows_will_be_refused(self, stub):
        s = stub(market_execution=True)
        conn = _connector()

        _buy(conn, s)
        s.sent.clear()
        _buy(conn, s)

        # One deal instead of two: a whole broker round trip removed, which on
        # an Exness terminal is ~285 ms off every copy after the first.
        assert len(_deals(s)) == 1
        assert len(s.sent) == 2

    def test_the_stops_still_land_on_both_copies(self, stub):
        s = stub(market_execution=True)
        conn = _connector()

        first = _buy(conn, s)
        second = _buy(conn, s)

        for result in (first, second):
            pos = s.positions[int(result["position_ticket"])]
            assert (pos.sl, pos.tp) == (1.0950, 1.1100)

    def test_the_refusal_is_remembered_per_symbol_not_globally(self, stub):
        s = stub(market_execution=True)
        conn = _connector()

        _buy(conn, s, "EURUSD")
        s.sent.clear()
        _buy(conn, s, "GBPUSD")

        # A symbol the connector has not seen refused still tries stops first,
        # because "this broker refuses" is only ever an observation about the
        # symbol it was observed on.
        assert len(_deals(s)) == 2

    def test_an_order_with_no_stops_is_one_round_trip_either_way(self, stub):
        s = stub(market_execution=True)
        conn = _connector()

        _buy(conn, s)
        s.sent.clear()
        conn.place_market_order(
            symbol="EURUSD", order_type=s.ORDER_TYPE_BUY, volume=0.1
        )

        assert len(s.sent) == 1


class TestInstantExecutionBroker:
    def test_a_broker_that_accepts_stops_sends_once(self, stub):
        s = stub(market_execution=False)
        conn = _connector()

        result = _buy(conn, s)

        assert len(s.sent) == 1
        pos = s.positions[int(result["position_ticket"])]
        assert (pos.sl, pos.tp) == (1.0950, 1.1100)

    def test_and_is_never_marked_as_refusing_them(self, stub):
        s = stub(market_execution=False)
        conn = _connector()

        _buy(conn, s)
        _buy(conn, s)

        assert conn._stops_rejected_on_open == set()
        assert len(s.sent) == 2


def test_a_terminal_on_the_wrong_login_sends_nothing(stub):
    """The guard that stopped copies landing on the master, still holding."""
    s = stub(market_execution=True)
    conn = MT5Connector(login=LOGIN + 1, password="x", server="Stub-Demo")

    assert _buy(conn, s) is None
    assert s.sent == []
    assert conn.last_send_error is not None
