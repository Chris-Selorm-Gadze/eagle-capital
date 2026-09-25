"""The read that keeps the journal in step, and its two failure modes.

The dangerous mistakes here are silent ones: advancing past a window that was
never read, and building a trade from a closing deal whose opening fell outside
the window. Both would lose a trade permanently rather than late.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.trade_history import DEAL_ENTRY_IN, DEAL_ENTRY_OUT, DEAL_TYPE_SELL  # noqa: E402
from engine.trade_sync import (  # noqa: E402
    DEFAULT_OVERLAP_SECONDS,
    next_mark,
    parse_mark,
    sync_account,
    window_for,
)

ACC = "acc-1"
NOW = datetime(2026, 9, 17, 12, 0, 0, tzinfo=timezone.utc)


def deal(position: int, entry: int, *, t: datetime, profit: float = 0.0, **kw) -> dict:
    row = {
        "ticket": kw.pop("ticket", position * 10 + entry),
        "position_id": position,
        "entry": entry,
        "type": kw.pop("deal_type", 0),
        "volume": kw.pop("volume", 0.1),
        "price": kw.pop("price", 1.1),
        "profit": profit,
        "commission": 0.0,
        "swap": 0.0,
        "time": int(t.timestamp()),
        "time_msc": int(t.timestamp() * 1000),
        "symbol": kw.pop("symbol", "EURUSD"),
        "magic": 0,
    }
    row.update(kw)
    return row


class StubReader:
    """A terminal's deal history, with a switch for an unreadable window."""

    def __init__(self, deals: list[dict], *, window_readable: bool = True):
        self.deals = deals
        self.window_readable = window_readable
        self.windows: list[tuple[datetime, datetime]] = []
        self.position_reads: list[int] = []

    def history_deals_window(self, start, end):
        self.windows.append((start, end))
        if not self.window_readable:
            return None
        return [
            d for d in self.deals
            if start.timestamp() <= d["time"] <= end.timestamp()
        ]

    def history_deals_for_position(self, position_ticket):
        self.position_reads.append(int(position_ticket))
        return [d for d in self.deals if d["position_id"] == int(position_ticket)]


class TestWindow:
    def test_a_first_sync_reads_back_over_the_lookback(self):
        start, end = window_for(None, NOW, lookback_hours=72)
        assert end == NOW
        assert start == NOW - timedelta(hours=72)

    def test_a_later_sync_resumes_from_the_mark_with_an_overlap(self):
        mark = NOW - timedelta(hours=1)
        start, _ = window_for(mark, NOW, overlap_seconds=300)
        assert start == mark - timedelta(seconds=300)

    def test_reads_all_the_way_to_now_after_a_long_outage(self):
        # A worker off for a week must catch up in one read, not one cycle per
        # step, or it never catches up at all while trading continues.
        start, end = window_for(NOW - timedelta(days=7), NOW)
        assert end == NOW
        assert (end - start) > timedelta(days=6)

    def test_a_mark_in_the_future_does_not_invert_the_window(self):
        # A clock change or a bad stored value. An inverted window returns
        # nothing from every broker, silently, forever.
        start, end = window_for(NOW + timedelta(hours=5), NOW)
        assert start < end


class TestMark:
    def test_advances_to_now_less_the_overlap(self):
        assert next_mark(None, NOW) == NOW - timedelta(seconds=DEFAULT_OVERLAP_SECONDS)

    def test_never_goes_backwards(self):
        ahead = NOW + timedelta(hours=1)
        assert next_mark(ahead, NOW) == ahead

    def test_advances_even_when_nothing_closed(self):
        # Otherwise the window grows without bound on a quiet account.
        assert next_mark(NOW - timedelta(days=1), NOW) > NOW - timedelta(days=1)


class TestSync:
    def test_reports_a_closed_position_and_advances(self):
        deals = [
            deal(500, DEAL_ENTRY_IN, t=NOW - timedelta(minutes=30), price=1.1000),
            deal(
                500, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=10),
                price=1.1050, profit=42.0, deal_type=DEAL_TYPE_SELL,
            ),
        ]
        result = sync_account(StubReader(deals), ACC, None, now=NOW)

        assert [t.pnl for t in result.trades] == [42.0]
        assert result.trades[0].external_id == "mt5:acc-1:500"
        assert result.synced_to is not None

    def test_an_open_position_is_not_reported_and_does_not_block_the_mark(self):
        deals = [deal(501, DEAL_ENTRY_IN, t=NOW - timedelta(minutes=5))]
        result = sync_account(StubReader(deals), ACC, None, now=NOW)

        assert result.trades == []
        assert result.synced_to is not None

    def test_an_unreadable_window_does_not_advance_the_mark(self):
        # The important one. Advancing here steps over a window nobody looked
        # at, and every trade closed inside it is lost for good.
        reader = StubReader([], window_readable=False)
        result = sync_account(reader, ACC, None, now=NOW)

        assert result.trades == []
        assert result.synced_to is None

    def test_a_position_opened_before_the_window_is_still_reported_whole(self):
        # The bug this design exists to avoid. The opening deal is a week old,
        # so the window holds only the close -- and a trade built from that
        # alone has no entry price. Phase two asks by position and gets both.
        opened = NOW - timedelta(days=7)
        deals = [
            deal(502, DEAL_ENTRY_IN, t=opened, price=1.2000),
            deal(
                502, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=1),
                price=1.2500, profit=500.0, deal_type=DEAL_TYPE_SELL,
            ),
        ]
        reader = StubReader(deals)
        result = sync_account(reader, ACC, NOW - timedelta(hours=1), now=NOW)

        assert len(result.trades) == 1
        trade = result.trades[0]
        assert trade.entry_price == 1.2000  # from outside the window
        assert trade.exit_price == 1.2500
        assert trade.pnl == 500.0
        assert reader.position_reads == [502]

    def test_only_positions_that_closed_are_read_in_phase_two(self):
        deals = [
            deal(510, DEAL_ENTRY_IN, t=NOW - timedelta(minutes=20)),
            deal(511, DEAL_ENTRY_IN, t=NOW - timedelta(minutes=20)),
            deal(511, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=2), profit=1.0),
        ]
        reader = StubReader(deals)
        sync_account(reader, ACC, None, now=NOW)

        # 510 is still open, so asking about it would be a wasted round trip on
        # every cycle for as long as the position is held.
        assert reader.position_reads == [511]

    def test_trades_are_ordered_oldest_close_first(self):
        deals = [
            deal(520, DEAL_ENTRY_IN, t=NOW - timedelta(hours=3)),
            deal(520, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=1), profit=1.0),
            deal(521, DEAL_ENTRY_IN, t=NOW - timedelta(hours=3)),
            deal(521, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=30), profit=1.0),
        ]
        result = sync_account(StubReader(deals), ACC, None, now=NOW)
        assert [t.position_ticket for t in result.trades] == [521, 520]

    def test_each_account_keys_its_trades_separately(self):
        # Six accounts on one worker, MT5 tickets unique only per account.
        deals = [
            deal(600, DEAL_ENTRY_IN, t=NOW - timedelta(minutes=20)),
            deal(600, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=2), profit=5.0),
        ]
        a = sync_account(StubReader(deals), "acc-a", None, now=NOW)
        b = sync_account(StubReader(deals), "acc-b", None, now=NOW)
        assert a.trades[0].external_id != b.trades[0].external_id


class TestParseMark:
    def test_reads_what_postgres_returns(self):
        assert parse_mark("2026-09-17T12:00:00+00:00") == NOW

    def test_reads_a_trailing_z(self):
        assert parse_mark("2026-09-17T12:00:00Z") == NOW

    def test_assumes_utc_when_no_zone_is_given(self):
        assert parse_mark("2026-09-17T12:00:00") == NOW

    def test_nothing_and_nonsense_mean_start_from_the_lookback(self):
        assert parse_mark(None) is None
        assert parse_mark("") is None
        assert parse_mark("not a date") is None


class ServerClockReader(StubReader):
    """A terminal whose broker runs its clock ahead of UTC, as most do.

    Deals are stamped, and the window is filtered, in server time -- the stub
    applies the same filter MT5 does, on the same clock.
    """

    def __init__(self, deals, offset_seconds, **kw):
        super().__init__(deals, **kw)
        self.offset_seconds = offset_seconds

    def server_time_offset(self):
        return self.offset_seconds


def server_deal(position, entry, *, real_t, offset_hours, **kw):
    """A deal as a GMT+N server records it: its real instant, shifted by N."""
    return deal(position, entry, t=real_t + timedelta(hours=offset_hours), **kw)


class TestTheBrokersClock:
    """A trade closed a minute ago must be journalled now, not hours later.

    MT5 stamps deals in the trade server's clock. Asking a GMT+3 server for
    deals up to real-UTC now returned nothing from the last three hours, so
    those accounts' trades reached the dashboard three hours late -- while a
    GMT+0 broker's arrived at once, and one copy group looked half-recorded.
    """

    def test_a_fresh_close_on_a_gmt_plus_3_server_is_found_immediately(self):
        deals = [
            server_deal(900, DEAL_ENTRY_IN, real_t=NOW - timedelta(minutes=5), offset_hours=3),
            server_deal(900, DEAL_ENTRY_OUT, real_t=NOW - timedelta(minutes=1),
                        offset_hours=3, profit=12.5, deal_type=DEAL_TYPE_SELL),
        ]
        reader = ServerClockReader(deals, offset_seconds=3 * 3600)

        result = sync_account(reader, ACC, NOW - timedelta(minutes=2), now=NOW)

        assert [t.pnl for t in result.trades] == [12.5]

    def test_journalled_times_are_the_real_instant_not_the_servers(self):
        entry_at = NOW - timedelta(minutes=5)
        exit_at = NOW - timedelta(minutes=1)
        deals = [
            server_deal(901, DEAL_ENTRY_IN, real_t=entry_at, offset_hours=3),
            server_deal(901, DEAL_ENTRY_OUT, real_t=exit_at, offset_hours=3,
                        deal_type=DEAL_TYPE_SELL),
        ]
        reader = ServerClockReader(deals, offset_seconds=3 * 3600)

        trade = sync_account(reader, ACC, None, now=NOW).trades[0]

        assert datetime.fromisoformat(trade.entry_time) == entry_at
        assert datetime.fromisoformat(trade.exit_time) == exit_at

    def test_a_server_behind_utc_is_covered_too(self):
        deals = [
            server_deal(902, DEAL_ENTRY_IN, real_t=NOW - timedelta(minutes=30), offset_hours=-5),
            server_deal(902, DEAL_ENTRY_OUT, real_t=NOW - timedelta(minutes=3),
                        offset_hours=-5, deal_type=DEAL_TYPE_SELL),
        ]
        reader = ServerClockReader(deals, offset_seconds=-5 * 3600)

        result = sync_account(reader, ACC, NOW - timedelta(minutes=1), now=NOW)

        assert len(result.trades) == 1

    def test_an_unmeasurable_offset_still_finds_the_trade(self):
        # The weekend, or a terminal with no quotes yet: the window widens to
        # cover every timezone rather than guessing one.
        deals = [
            server_deal(903, DEAL_ENTRY_IN, real_t=NOW - timedelta(minutes=5), offset_hours=3),
            server_deal(903, DEAL_ENTRY_OUT, real_t=NOW - timedelta(minutes=1),
                        offset_hours=3, deal_type=DEAL_TYPE_SELL),
        ]
        reader = ServerClockReader(deals, offset_seconds=None)

        result = sync_account(reader, ACC, NOW - timedelta(minutes=2), now=NOW)

        assert len(result.trades) == 1
        assert result.offset_seconds is None

    def test_positions_already_journalled_are_skipped(self):
        reader = StubReader([
            deal(904, DEAL_ENTRY_IN, t=NOW - timedelta(minutes=5)),
            deal(904, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=1)),
        ])

        result = sync_account(reader, ACC, None, now=NOW, skip_tickets={904})

        assert result.trades == []
        assert reader.position_reads == []


class TestMeasuringTheOffset:
    def test_the_freshest_quote_gives_the_offset(self):
        from engine.mt5_connector import offset_from_quote_times

        now = 1_760_000_000.0
        quotes = [now + 3 * 3600 - 2, now + 3 * 3600 - 400, 0]
        assert offset_from_quote_times(quotes, now) == 3 * 3600

    def test_a_negative_offset(self):
        from engine.mt5_connector import offset_from_quote_times

        now = 1_760_000_000.0
        assert offset_from_quote_times([now - 4 * 3600 - 5], now) == -4 * 3600

    def test_stale_quotes_give_no_answer_rather_than_a_wrong_one(self):
        from engine.mt5_connector import offset_from_quote_times

        now = 1_760_000_000.0
        # Friday's last quote, on a Saturday: nowhere near a whole hour, or
        # further away than any timezone.
        assert offset_from_quote_times([now - 5 * 3600 - 1500], now) is None
        assert offset_from_quote_times([now - 30 * 3600], now) is None
        assert offset_from_quote_times([], now) is None
