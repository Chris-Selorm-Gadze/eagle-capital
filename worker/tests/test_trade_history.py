"""Turning MT5 deal history into journal trades.

The dashboard's equity curve is built from these numbers, so the cases that
matter are the ones that would produce a plausible-looking wrong figure: a
profit recomputed from prices, a partial close counted once, a position whose
opening deal fell outside the window.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.trade_history import (  # noqa: E402
    DEAL_ENTRY_IN,
    DEAL_ENTRY_INOUT,
    DEAL_ENTRY_OUT,
    DEAL_ENTRY_OUT_BY,
    DEAL_TYPE_BUY,
    DEAL_TYPE_SELL,
    closed_trades_from_deals,
    closing_position_tickets,
    external_id_for,
    group_deals_by_position,
    trade_from_deals,
)

ACC = "11111111-2222-3333-4444-555555555555"

# 2026-09-17T12:00:00Z
T0 = 1789646400


def deal(
    *,
    ticket: int,
    position: int,
    entry: int,
    deal_type: int = DEAL_TYPE_BUY,
    volume: float = 0.10,
    price: float = 1.1000,
    profit: float = 0.0,
    commission: float = 0.0,
    swap: float = 0.0,
    t: int = T0,
    symbol: str = "EURUSD",
    magic: int = 0,
) -> dict:
    return {
        "ticket": ticket,
        "position_id": position,
        "entry": entry,
        "type": deal_type,
        "volume": volume,
        "price": price,
        "profit": profit,
        "commission": commission,
        "swap": swap,
        "time": t,
        "time_msc": t * 1000,
        "symbol": symbol,
        "magic": magic,
    }


def _round_trip(**kw) -> list[dict]:
    """One long, opened at 1.1000 and closed at 1.1050 for +50."""
    return [
        deal(ticket=1, position=900, entry=DEAL_ENTRY_IN, price=1.1000, t=T0),
        deal(
            ticket=2,
            position=900,
            entry=DEAL_ENTRY_OUT,
            deal_type=DEAL_TYPE_SELL,
            price=1.1050,
            profit=50.0,
            t=T0 + 3600,
            **kw,
        ),
    ]


class TestOneCompletedTrade:
    def test_reads_the_shape_the_dashboard_needs(self):
        trade = trade_from_deals(_round_trip(), ACC)
        assert trade is not None
        assert trade.symbol == "EURUSD"
        assert trade.side == "long"
        assert trade.qty == 0.10
        assert trade.entry_price == 1.1000
        assert trade.exit_price == 1.1050
        assert trade.entry_time.startswith("2026-09-17T12:00:00")
        assert trade.exit_time.startswith("2026-09-17T13:00:00")

    def test_a_sell_opening_deal_is_a_short(self):
        deals = [
            deal(ticket=1, position=901, entry=DEAL_ENTRY_IN, deal_type=DEAL_TYPE_SELL),
            deal(
                ticket=2, position=901, entry=DEAL_ENTRY_OUT,
                deal_type=DEAL_TYPE_BUY, profit=20.0, t=T0 + 60,
            ),
        ]
        trade = trade_from_deals(deals, ACC)
        assert trade is not None and trade.side == "short"

    def test_profit_comes_from_the_broker_not_from_the_prices(self):
        # The whole reason pnl is passed through. Price diff * qty would say
        # 0.005 * 0.1 = 0.0005 here; the broker says 50. Any instrument whose
        # contract is not 1 unit per point breaks the formula, so it is never
        # used -- see the pnlOverride note in src/db/trades.ts.
        trade = trade_from_deals(_round_trip(), ACC)
        assert trade is not None and trade.pnl == 50.0

    def test_commission_and_swap_come_off_the_profit(self):
        trade = trade_from_deals(_round_trip(commission=-3.0, swap=-1.5), ACC)
        assert trade is not None
        assert trade.pnl == 45.5  # 50 - 3 - 1.5
        assert trade.fees == 4.5  # reported positive, as a cost

    def test_costs_on_the_opening_deal_are_counted_too(self):
        deals = _round_trip()
        deals[0]["commission"] = -3.0
        trade = trade_from_deals(deals, ACC)
        assert trade is not None
        assert trade.pnl == 47.0
        assert trade.fees == 3.0


class TestPositionsThatAreNotTrades:
    def test_an_open_position_is_not_reported(self):
        # An entry with no exit yet. Journalling it would invent an exit price
        # and put a fictitious closed trade on the dashboard.
        deals = [deal(ticket=1, position=902, entry=DEAL_ENTRY_IN)]
        assert trade_from_deals(deals, ACC) is None

    def test_a_close_without_its_opening_is_not_reported(self):
        # Never silently dropped in practice -- this is exactly what phase two
        # of the read exists to prevent. If it ever does reach here, refusing is
        # the right answer: there is no entry price to report.
        deals = [deal(ticket=2, position=903, entry=DEAL_ENTRY_OUT, profit=10.0)]
        assert trade_from_deals(deals, ACC) is None

    def test_no_deals_at_all_is_not_reported(self):
        assert trade_from_deals([], ACC) is None


class TestPartialCloses:
    def test_scaling_out_reads_as_the_one_trade_it_was(self):
        deals = [
            deal(ticket=1, position=904, entry=DEAL_ENTRY_IN, volume=1.0, price=1.1000),
            deal(
                ticket=2, position=904, entry=DEAL_ENTRY_OUT, deal_type=DEAL_TYPE_SELL,
                volume=0.6, price=1.1100, profit=60.0, t=T0 + 60,
            ),
            deal(
                ticket=3, position=904, entry=DEAL_ENTRY_OUT, deal_type=DEAL_TYPE_SELL,
                volume=0.4, price=1.1200, profit=80.0, t=T0 + 120,
            ),
        ]
        trade = trade_from_deals(deals, ACC)
        assert trade is not None
        assert trade.qty == 1.0
        assert trade.pnl == 140.0
        # Volume-weighted, not a plain mean: (0.6*1.11 + 0.4*1.12) / 1.0
        assert round(trade.exit_price, 6) == 1.114
        # The exit time is the LAST close, not the first.
        assert trade.exit_time.startswith("2026-09-17T12:02:00")

    def test_scaling_in_weights_the_entry_price_by_volume(self):
        deals = [
            deal(ticket=1, position=905, entry=DEAL_ENTRY_IN, volume=0.2, price=1.1000),
            deal(ticket=2, position=905, entry=DEAL_ENTRY_IN, volume=0.8, price=1.1500, t=T0 + 30),
            deal(
                ticket=3, position=905, entry=DEAL_ENTRY_OUT, deal_type=DEAL_TYPE_SELL,
                volume=1.0, price=1.2000, profit=100.0, t=T0 + 60,
            ),
        ]
        trade = trade_from_deals(deals, ACC)
        assert trade is not None
        assert round(trade.entry_price, 6) == 1.14  # (0.2*1.10 + 0.8*1.15) / 1.0
        # The entry time is the FIRST open.
        assert trade.entry_time.startswith("2026-09-17T12:00:00")

    def test_a_close_by_opposite_position_still_closes_it(self):
        deals = [
            deal(ticket=1, position=906, entry=DEAL_ENTRY_IN),
            deal(
                ticket=2, position=906, entry=DEAL_ENTRY_OUT_BY,
                deal_type=DEAL_TYPE_SELL, profit=12.0, t=T0 + 60,
            ),
        ]
        trade = trade_from_deals(deals, ACC)
        assert trade is not None and trade.pnl == 12.0


class TestExternalId:
    def test_includes_the_account_because_tickets_repeat_across_accounts(self):
        # Six accounts on one worker; MT5 position tickets are unique only
        # within an account. Keying on the ticket alone would make one account's
        # trade overwrite another's.
        a = external_id_for("acc-a", 12345)
        b = external_id_for("acc-b", 12345)
        assert a != b
        assert a == "mt5:acc-a:12345"

    def test_is_stable_for_the_same_position(self):
        assert external_id_for(ACC, 7) == external_id_for(ACC, 7)


class TestGroupingAndWindows:
    def test_splits_a_flat_history_into_positions(self):
        deals = [
            deal(ticket=1, position=910, entry=DEAL_ENTRY_IN),
            deal(ticket=2, position=911, entry=DEAL_ENTRY_IN, symbol="GBPUSD"),
            deal(ticket=3, position=910, entry=DEAL_ENTRY_OUT, profit=5.0),
        ]
        grouped = group_deals_by_position(deals)
        assert sorted(grouped) == [910, 911]
        assert len(grouped[910]) == 2

    def test_balance_operations_are_not_positions(self):
        # A deposit has no position_id. Real money, not a trade.
        deals = [deal(ticket=1, position=0, entry=DEAL_ENTRY_IN, profit=5000.0)]
        assert group_deals_by_position(deals) == {}

    def test_closing_tickets_names_only_positions_that_finished(self):
        deals = [
            deal(ticket=1, position=920, entry=DEAL_ENTRY_IN),
            deal(ticket=2, position=921, entry=DEAL_ENTRY_OUT, profit=1.0),
            deal(ticket=3, position=922, entry=DEAL_ENTRY_INOUT, profit=2.0),
        ]
        # 920 only opened in this window, so it is not ready to journal.
        assert closing_position_tickets(deals) == [921, 922]

    def test_closing_tickets_lists_each_position_once(self):
        deals = [
            deal(ticket=1, position=930, entry=DEAL_ENTRY_OUT, volume=0.5, profit=1.0),
            deal(ticket=2, position=930, entry=DEAL_ENTRY_OUT, volume=0.5, profit=1.0),
        ]
        assert closing_position_tickets(deals) == [930]

    def test_trades_come_back_oldest_close_first(self):
        deals = [
            deal(ticket=1, position=940, entry=DEAL_ENTRY_IN, t=T0),
            deal(ticket=2, position=940, entry=DEAL_ENTRY_OUT, profit=1.0, t=T0 + 7200),
            deal(ticket=3, position=941, entry=DEAL_ENTRY_IN, t=T0),
            deal(ticket=4, position=941, entry=DEAL_ENTRY_OUT, profit=1.0, t=T0 + 60),
        ]
        trades = closed_trades_from_deals(deals, ACC)
        assert [t.position_ticket for t in trades] == [941, 940]

    def test_an_open_position_does_not_block_the_closed_ones(self):
        deals = [
            deal(ticket=1, position=950, entry=DEAL_ENTRY_IN),
            deal(ticket=2, position=951, entry=DEAL_ENTRY_IN),
            deal(ticket=3, position=951, entry=DEAL_ENTRY_OUT, profit=9.0, t=T0 + 60),
        ]
        trades = closed_trades_from_deals(deals, ACC)
        assert [t.position_ticket for t in trades] == [951]


def test_namedtuple_deals_from_metatrader_are_accepted():
    """MT5 returns namedtuples, tests pass dicts; both must work."""

    class Deal:
        def __init__(self, **kw):
            self.__dict__.update(kw)

        def _asdict(self):
            return dict(self.__dict__)

    deals = [
        Deal(**deal(ticket=1, position=960, entry=DEAL_ENTRY_IN)),
        Deal(**deal(ticket=2, position=960, entry=DEAL_ENTRY_OUT, profit=3.0, t=T0 + 60)),
    ]
    trade = trade_from_deals(deals, ACC)
    assert trade is not None and trade.pnl == 3.0
