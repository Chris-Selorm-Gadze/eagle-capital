"""Open-position reporting: what the page is allowed to believe."""

import pytest

from engine import position_feed
from engine.position_feed import (
    account_payload,
    position_row,
    positions_from_mt5,
    report_master,
    should_report_positions,
)


def mt5_position(**over):
    base = {
        "ticket": 7001,
        "symbol": "EURUSD",
        "type": 0,
        "volume": 0.25,
        "price_open": 1.0850,
        "price_current": 1.0862,
        "profit": 30.0,
        "swap": -1.2,
        "sl": 1.0800,
        "tp": 0.0,
        "time": 1789646400,
    }
    base.update(over)
    return base


class TestPositionRow:
    def test_reads_a_buy_as_long(self):
        row = position_row(mt5_position())
        assert row["side"] == "long"
        assert row["ticket"] == "7001"
        assert row["volume"] == 0.25
        assert row["unrealized_pnl"] == 30.0

    def test_reads_a_sell_as_short(self):
        assert position_row(mt5_position(type=1))["side"] == "short"

    def test_translates_broker_vocabulary_at_the_boundary(self):
        # Everything downstream -- the ledger, the P&L sign, the trade rows --
        # branches on long/short. A raw MT5 0/1 reaching the column would not
        # match any of them.
        assert position_row(mt5_position())["side"] in ("long", "short")

    def test_an_unset_target_is_absent_not_a_price_of_zero(self):
        row = position_row(mt5_position())
        assert row["tp"] is None
        assert row["sl"] == 1.0800

    def test_a_position_with_no_ticket_is_dropped(self):
        assert position_row(mt5_position(ticket=None)) is None

    def test_a_position_with_no_symbol_is_dropped(self):
        assert position_row(mt5_position(symbol="")) is None

    def test_unreadable_numbers_become_null_rather_than_zero(self):
        # Zero is a real P&L. Writing it for a figure the broker did not give
        # would show a flat position where there is no reading at all.
        row = position_row(mt5_position(price_current=None, profit="n/a"))
        assert row["current_price"] is None
        assert row["unrealized_pnl"] is None

    def test_negative_zero_is_normalised(self):
        # -0.0 serialises as "-0.0" and renders as "-$0" on the page.
        row = position_row(mt5_position(profit=-0.0))
        assert row["unrealized_pnl"] == 0.0
        assert str(row["unrealized_pnl"]) == "0.0"

    def test_missing_open_time_is_null_not_an_epoch(self):
        assert position_row(mt5_position(time=None))["opened_at"] is None


class TestPositionsFromMt5:
    def test_keeps_only_the_identifiable_ones(self):
        rows = positions_from_mt5([
            mt5_position(),
            mt5_position(ticket=None),
            mt5_position(ticket=7002, symbol="GBPUSD"),
        ])
        assert [r["symbol"] for r in rows] == ["EURUSD", "GBPUSD"]

    def test_no_positions_is_an_empty_list(self):
        assert positions_from_mt5([]) == []


class TestAccountPayload:
    def test_carries_the_account_and_its_positions(self):
        payload = account_payload("acc-1", [mt5_position()])
        assert payload["trading_account_id"] == "acc-1"
        assert len(payload["positions"]) == 1

    def test_omits_figures_that_were_not_read_on_this_visit(self):
        # The gateway leaves stored balance/equity alone when they are absent.
        # Sending nulls would blank a figure the account still has.
        payload = account_payload("acc-1", [])
        assert "balance" not in payload
        assert "equity" not in payload

    def test_includes_figures_read_on_the_same_visit(self):
        payload = account_payload(
            "acc-1", [], {"balance": 9800.0, "equity": 9830.5, "currency": "USD"}
        )
        assert payload["balance"] == 9800.0
        assert payload["equity"] == 9830.5
        assert payload["currency"] == "USD"

    def test_a_blank_currency_is_left_out(self):
        payload = account_payload("acc-1", [], {"balance": 1.0, "currency": ""})
        assert "currency" not in payload


class TestCadence:
    def setup_method(self):
        position_feed.reset_state()

    def test_first_call_reports(self):
        assert should_report_positions(now=1000.0) is True

    def test_a_second_call_inside_the_interval_does_not(self):
        should_report_positions(now=1000.0)
        assert should_report_positions(now=1002.0) is False

    def test_reports_again_once_the_interval_has_passed(self):
        should_report_positions(now=1000.0)
        assert should_report_positions(now=1010.0) is True

    def test_interval_is_configurable(self, monkeypatch):
        monkeypatch.setenv("WORKER_POSITION_SYNC_SECONDS", "30")
        should_report_positions(now=1000.0)
        assert should_report_positions(now=1010.0) is False
        assert should_report_positions(now=1031.0) is True


class TestReportMaster:
    def setup_method(self):
        position_feed.reset_state()
        self.sent = []

        def fake(payloads):
            self.sent.append(payloads)
            return len(payloads)

        self.fake = fake

    def test_a_failed_poll_is_not_reported_as_a_flat_account(self, monkeypatch):
        # None means "I could not read it". Sending [] would tell the page
        # every position had closed, which is the opposite of the truth.
        monkeypatch.setattr(position_feed, "report_accounts", self.fake)
        assert report_master("acc-1", None) == 0
        assert self.sent == []

    def test_an_account_with_nothing_open_is_reported(self, monkeypatch):
        # Genuinely flat is worth saying: it is how a closed position leaves
        # the page.
        monkeypatch.setattr(position_feed, "report_accounts", self.fake)
        assert report_master("acc-1", []) == 1
        assert self.sent[0][0]["positions"] == []

    def test_is_rate_limited(self, monkeypatch):
        monkeypatch.setattr(position_feed, "report_accounts", self.fake)
        report_master("acc-1", [mt5_position()])
        report_master("acc-1", [mt5_position()])
        assert len(self.sent) == 1


class TestReportAccounts:
    def test_nothing_to_report_makes_no_call(self):
        assert position_feed.report_accounts([]) == 0

    def test_a_failed_post_does_not_raise_into_the_copy_loop(self, monkeypatch):
        # A stale page is the acceptable failure here. Taking down the loop
        # that places orders is not.
        class Boom:
            enabled = True
            user_id = "u1"

            def post_open_positions(self, accounts):
                raise RuntimeError("gateway down")

        monkeypatch.setattr("engine.api_client.get_api_client", lambda: Boom())
        assert position_feed.report_accounts([{"trading_account_id": "a"}]) == 0
