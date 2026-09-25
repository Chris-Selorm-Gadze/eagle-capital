"""Open-position reporting: what the page is allowed to believe."""

import pytest

from engine import position_feed
from engine.position_feed import (
    account_payload,
    position_row,
    positions_from_mt5,
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
        # The default interval is 2s -- a live P&L, not a background sync.
        should_report_positions(now=1000.0)
        assert should_report_positions(now=1001.0) is False

    def test_reports_again_once_the_interval_has_passed(self):
        should_report_positions(now=1000.0)
        assert should_report_positions(now=1002.5) is True

    def test_interval_is_configurable(self, monkeypatch):
        monkeypatch.setenv("WORKER_POSITION_SYNC_SECONDS", "30")
        should_report_positions(now=1000.0)
        assert should_report_positions(now=1010.0) is False
        assert should_report_positions(now=1031.0) is True


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


class FakeFuture:
    def __init__(self, value=None, raises=None, blocks=False):
        self._value = value
        self._raises = raises
        self._blocks = blocks

    def result(self, timeout=None):
        if self._blocks:
            raise TimeoutError("still reading")
        if self._raises:
            raise self._raises
        return self._value


class FakePool:
    """Stands in for TerminalPool: routes some accounts, not others."""

    def __init__(self, routed, results=None):
        self.routed = set(routed)
        self.results = results or {}
        self.submitted = []

    def has(self, account_id):
        return account_id in self.routed

    def submit_read(self, account_id, job):
        self.submitted.append((account_id, job))
        if account_id not in self.routed:
            return None
        return self.results.get(account_id, FakeFuture({"ok": False}))


class FakeAccount:
    def __init__(self, account_id, enabled=True, terminal_path="C:/mt5/a"):
        self.id = account_id
        self.label = account_id
        self.role = "follower"
        self.login = "1001"
        self.password = "pw"
        self.server = "Broker-Demo"
        self.platform = "mt5"
        self.enabled = enabled
        self.terminal_path = terminal_path


def ok_result(account_id, positions=None, info=None):
    return FakeFuture({
        "ok": True,
        "trading_account_id": account_id,
        "positions": positions if positions is not None else [mt5_position()],
        "info": info,
    })


class TestSweepable:
    def test_only_pool_routed_accounts_are_swept(self):
        # The main process holds one MT5 login for the copy loop. Switching it
        # from the sweep's thread would land a read on whichever account the
        # copier had just attached -- one account's positions under another's
        # name, which is worse than no reading at all.
        accounts = [FakeAccount("a"), FakeAccount("b")]
        assert [a.id for a in position_feed.sweepable(accounts, FakePool(["a"]))] == ["a"]

    def test_no_pool_means_nothing_is_swept(self):
        assert position_feed.sweepable([FakeAccount("a")], None) == []

    def test_the_master_is_excluded(self):
        # The copy loop owns the master's attach and already polled it.
        accounts = [FakeAccount("m"), FakeAccount("f")]
        swept = position_feed.sweepable(accounts, FakePool(["m", "f"]), master_id="m")
        assert [a.id for a in swept] == ["f"]

    def test_disabled_accounts_are_skipped(self):
        accounts = [FakeAccount("a", enabled=False), FakeAccount("b")]
        assert [a.id for a in position_feed.sweepable(accounts, FakePool(["a", "b"]))] == ["b"]


class TestPayloadFromResult:
    def test_reads_a_successful_result(self):
        payload = position_feed.payload_from_result({
            "ok": True, "trading_account_id": "a", "positions": [mt5_position()],
        })
        assert payload["trading_account_id"] == "a"
        assert len(payload["positions"]) == 1

    def test_a_failed_read_is_dropped_not_sent_as_empty(self):
        # The gateway replaces whatever it is given, so an empty account would
        # erase a live position from the page and claim it had closed.
        assert position_feed.payload_from_result({"ok": False, "trading_account_id": "a"}) is None

    def test_nonsense_from_a_worker_is_dropped(self):
        assert position_feed.payload_from_result(None) is None
        assert position_feed.payload_from_result("crashed") is None
        assert position_feed.payload_from_result({"ok": True}) is None

    def test_carries_figures_read_on_the_same_visit(self):
        payload = position_feed.payload_from_result({
            "ok": True, "trading_account_id": "a", "positions": [],
            "info": {"balance": 500.0, "equity": 505.0, "currency": "USD"},
        })
        assert payload["balance"] == 500.0
        assert payload["currency"] == "USD"


class TestSweepPositions:
    def setup_method(self):
        position_feed.reset_state()
        self.sent = []

    def _capture(self, monkeypatch):
        def fake(payloads):
            self.sent.append(payloads)
            return len(payloads)
        monkeypatch.setattr(position_feed, "report_accounts", fake)

    def test_submits_every_account_before_waiting_on_any(self, monkeypatch):
        # The whole point: three brokers read at the same time rather than one
        # shutdown+initialize after another.
        self._capture(monkeypatch)
        pool = FakePool(["a", "b", "c"], {
            "a": ok_result("a"), "b": ok_result("b"), "c": ok_result("c"),
        })
        position_feed.sweep_positions([FakeAccount(i) for i in "abc"], pool)
        assert [aid for aid, _ in pool.submitted] == ["a", "b", "c"]
        assert {p["trading_account_id"] for p in self.sent[0]} == {"a", "b", "c"}

    def test_the_master_snapshot_rides_along_for_free(self, monkeypatch):
        self._capture(monkeypatch)
        pool = FakePool(["f"], {"f": ok_result("f")})
        position_feed.sweep_positions(
            [FakeAccount("m"), FakeAccount("f")], pool,
            master_snapshot=("m", [mt5_position()]),
        )
        assert {p["trading_account_id"] for p in self.sent[0]} == {"m", "f"}
        # And it is not read a second time through the pool.
        assert [aid for aid, _ in pool.submitted] == ["f"]

    def test_one_slow_account_does_not_hold_up_the_others(self, monkeypatch):
        # A hung broker must cost that account its update, not the whole sweep.
        self._capture(monkeypatch)
        pool = FakePool(["slow", "fast"], {
            "slow": FakeFuture(blocks=True), "fast": ok_result("fast"),
        })
        position_feed.sweep_positions(
            [FakeAccount("slow"), FakeAccount("fast")], pool
        )
        assert [p["trading_account_id"] for p in self.sent[0]] == ["fast"]

    def test_a_crashed_worker_does_not_stop_the_sweep(self, monkeypatch):
        self._capture(monkeypatch)
        pool = FakePool(["bad", "good"], {
            "bad": FakeFuture(raises=RuntimeError("pool worker died")),
            "good": ok_result("good"),
        })
        position_feed.sweep_positions([FakeAccount("bad"), FakeAccount("good")], pool)
        assert [p["trading_account_id"] for p in self.sent[0]] == ["good"]

    def test_nothing_routed_reports_nothing(self, monkeypatch):
        self._capture(monkeypatch)
        position_feed.sweep_positions([FakeAccount("a")], FakePool([]))
        assert self.sent == [[]] or self.sent == []


class TestSweepInBackground:
    def setup_method(self):
        position_feed.reset_state()

    def test_runs_off_the_callers_thread(self, monkeypatch):
        import threading
        seen = {}

        def fake(accounts, pool, master_snapshot=None, master_offset=0):
            seen["thread"] = threading.current_thread().name
            return 1

        monkeypatch.setattr(position_feed, "sweep_positions", fake)
        assert position_feed.sweep_in_background([], FakePool([])) is True
        position_feed._sweep_thread.join(timeout=2)
        assert seen["thread"] != threading.current_thread().name

    def test_a_second_sweep_does_not_stack_on_a_running_one(self, monkeypatch):
        # Two sweeps would queue on the same pool workers and the second would
        # report nothing newer than the first.
        import threading
        release = threading.Event()

        def fake(accounts, pool, master_snapshot=None, master_offset=0):
            release.wait(timeout=2)
            return 1

        monkeypatch.setattr(position_feed, "sweep_positions", fake)
        assert position_feed.sweep_in_background([], FakePool([])) is True
        assert position_feed.sweep_in_background([], FakePool([])) is False
        release.set()
        position_feed._sweep_thread.join(timeout=2)

    def test_a_failing_sweep_does_not_escape_the_thread(self, monkeypatch):
        def boom(accounts, pool, master_snapshot=None):
            raise RuntimeError("gateway down")

        monkeypatch.setattr(position_feed, "sweep_positions", boom)
        assert position_feed.sweep_in_background([], FakePool([])) is True
        position_feed._sweep_thread.join(timeout=2)


class TestBrokerClock:
    """MT5 gives a position's open time in the broker's clock. On a GMT+3
    server that read three hours in the future, and the page's age column sat
    at 0s for the first three hours of every trade."""

    def test_the_open_time_is_moved_back_to_utc(self):
        row = position_feed.position_row(
            {"ticket": 1, "symbol": "EURUSD", "type": 0, "time": 1_760_010_800},
            time_offset=3 * 3600,
        )
        assert row["opened_at"] == 1_760_000_000

    def test_a_pool_read_carries_its_offset_through(self):
        payload = position_feed.payload_from_result({
            "ok": True,
            "trading_account_id": "a",
            "positions": [{"ticket": 1, "symbol": "EURUSD", "type": 0, "time": 1_760_010_800}],
            "time_offset": 3 * 3600,
        })
        assert payload["positions"][0]["opened_at"] == 1_760_000_000

    def test_no_open_time_stays_unknown(self):
        row = position_feed.position_row({"ticket": 1, "symbol": "EURUSD", "type": 0, "time": 0})
        assert row["opened_at"] is None
