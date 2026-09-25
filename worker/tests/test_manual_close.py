"""Closing positions from the app: which ones, where, and what counts as done."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine import command_processor  # noqa: E402
from engine.account_session import AccountSession  # noqa: E402
from engine.manual_close import (  # noqa: E402
    RETCODE_DONE,
    close_on_connector,
    requested_tickets,
)


class StubConnector:
    def __init__(self, positions, *, refuse=()):
        self.positions = positions
        self.refuse = set(refuse)
        self.closed: list[int] = []
        self.last_send_error = None

    def get_open_positions(self):
        return [p for p in self.positions if p["ticket"] not in self.closed]

    def close_position(self, ticket, deviation=10):
        if ticket in self.refuse:
            self.last_send_error = "Market closed"
            return {"retcode": 10018, "comment": "Market closed"}
        self.closed.append(ticket)
        return {"retcode": RETCODE_DONE}


def pos(ticket, symbol="EURUSD", side=0, volume=0.1):
    return {"ticket": ticket, "symbol": symbol, "type": side, "volume": volume}


class TestRequestedTickets:
    def test_a_single_ticket_arrives_as_a_string(self):
        # MT5 tickets overflow a JavaScript number, so the app sends strings.
        assert requested_tickets({"ticket": "91234567890"}) == [91234567890]

    def test_a_list(self):
        assert requested_tickets({"tickets": ["1", 2]}) == [1, 2]

    def test_no_payload_means_everything(self):
        assert requested_tickets(None) is None
        assert requested_tickets({}) is None

    def test_junk_is_dropped_not_raised(self):
        assert requested_tickets({"tickets": ["x", "3"]}) == [3]


class TestCloseOnConnector:
    def test_closes_only_the_ticket_asked_for(self):
        conn = StubConnector([pos(1), pos(2)])
        result = close_on_connector(conn, [2])
        assert conn.closed == [2]
        assert result["success"] is True
        assert result["closed"] == 1

    def test_none_closes_everything(self):
        conn = StubConnector([pos(1), pos(2)])
        result = close_on_connector(conn, None)
        assert conn.closed == [1, 2]
        assert result["closed"] == 2

    def test_a_position_already_gone_is_not_a_failure(self):
        # Closed by its stop, by the copier, or by a second click, between the
        # page's last snapshot and this one. What was asked for has happened.
        conn = StubConnector([pos(1)])
        result = close_on_connector(conn, [99])
        assert result["success"] is True
        assert result["already_closed"] == [99]
        assert conn.closed == []

    def test_a_refusal_is_reported_in_the_brokers_words(self):
        conn = StubConnector([pos(1, symbol="XAUUSD")], refuse=[1])
        result = close_on_connector(conn, [1])
        assert result["success"] is False
        assert "XAUUSD #1" in result["error"]
        assert "Market closed" in result["error"]

    def test_the_side_is_reported_in_app_vocabulary(self):
        conn = StubConnector([pos(1, side=1)])
        result = close_on_connector(conn, [1])
        assert result["closed_positions"][0]["side"] == "short"


def session(account_id="acc-1", role="follower", platform="mt5"):
    return AccountSession(
        account_id=account_id,
        label=account_id,
        role=role,
        login="1000",
        password="x",
        server="Stub-Demo",
        terminal_path="C:/mt5/a/terminal64.exe",
        platform=platform,
    )


class FakeFuture:
    def __init__(self, value):
        self.value = value

    def result(self, timeout=None):
        return self.value


class FakePool:
    def __init__(self, routed, result):
        self.routed = set(routed)
        self.result = result
        self.jobs = []

    def has(self, account_id):
        return account_id in self.routed

    def submit_close(self, account_id, job):
        self.jobs.append((account_id, job))
        return FakeFuture(self.result)


class TestProcessCommand:
    def setup_method(self):
        self.events = []
        self.synced = []

    def _quiet(self, monkeypatch):
        monkeypatch.setattr(command_processor, "append_event", self.events.append)
        monkeypatch.setattr(
            "engine.trade_journal.request_trade_sync",
            lambda *a, **k: self.synced.append(True),
        )

    def test_a_routed_account_closes_on_its_own_terminal_worker(self, monkeypatch):
        self._quiet(monkeypatch)
        done = {
            "success": True, "closed": 1, "already_closed": [],
            "closed_positions": [{"ticket": 55, "symbol": "EURUSD", "side": "long", "volume": 0.1}],
        }
        pool = FakePool(["acc-1"], done)
        cmd = {"command_type": "close_position", "trading_account_id": "acc-1",
               "payload": {"ticket": "55"}}

        result = command_processor.process_command(cmd, {"acc-1": session()}, pool=pool)

        assert result["success"] is True
        assert pool.jobs[0][1]["tickets"] == [55]
        # Journal and redraw now, not at the next scheduled pass.
        assert self.synced == [True]

    def test_a_follower_close_is_logged_as_ending_its_copy_link(self, monkeypatch):
        self._quiet(monkeypatch)
        done = {
            "success": True, "closed": 1, "already_closed": [],
            "closed_positions": [{"ticket": 55, "symbol": "EURUSD", "side": "long", "volume": 0.1}],
        }
        pool = FakePool(["acc-1"], done)
        cmd = {"command_type": "close_position", "trading_account_id": "acc-1",
               "payload": {"ticket": "55"}}

        command_processor.process_command(cmd, {"acc-1": session()}, pool=pool)

        assert self.events[0]["event_type"] == "manual_close"
        assert self.events[0]["follower_ticket"] == 55
        assert self.events[0]["follower_account_id"] == "acc-1"

    def test_flatten_asks_for_every_position(self, monkeypatch):
        self._quiet(monkeypatch)
        pool = FakePool(["acc-1"], {"success": True, "closed": 0, "already_closed": []})
        cmd = {"command_type": "flatten", "trading_account_id": "acc-1"}

        command_processor.process_command(cmd, {"acc-1": session()}, pool=pool)

        assert pool.jobs[0][1]["tickets"] is None

    def test_a_close_with_no_ticket_does_not_become_a_flatten(self, monkeypatch):
        # A malformed single close must never close the whole account.
        self._quiet(monkeypatch)
        pool = FakePool(["acc-1"], {"success": True})
        cmd = {"command_type": "close_position", "trading_account_id": "acc-1", "payload": {}}

        result = command_processor.process_command(cmd, {"acc-1": session()}, pool=pool)

        assert result["success"] is False
        assert pool.jobs == []

    def test_an_account_the_worker_is_not_running_says_so(self):
        cmd = {"command_type": "close_position", "trading_account_id": "nope",
               "payload": {"ticket": "1"}}
        result = command_processor.process_command(cmd, {})
        assert result["success"] is False
        assert "not running this account" in result["error"]

    def test_non_mt5_accounts_are_refused_plainly(self, monkeypatch):
        self._quiet(monkeypatch)
        cmd = {"command_type": "close_position", "trading_account_id": "acc-1",
               "payload": {"ticket": "1"}}
        result = command_processor.process_command(
            cmd, {"acc-1": session(platform="dxtrade")}, pool=FakePool([], {})
        )
        assert result["success"] is False
        assert "MT5" in result["error"]
