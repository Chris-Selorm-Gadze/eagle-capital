"""The journal pass as the worker runs it.

Pins the two behaviours that decide whether a trade is ever seen again: an
account with no dashboard account linked is skipped without reading history at
all, and a window that could not be read does not advance the mark past it.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import engine.api_client as api_client_module  # noqa: E402
from engine import trade_journal  # noqa: E402
from engine.config_loader import AccountConfig  # noqa: E402
from engine.trade_history import DEAL_ENTRY_IN, DEAL_ENTRY_OUT  # noqa: E402

NOW = datetime.now(timezone.utc)


def account(acc_id: str, *, journal: str | None = "dash-1", **kw) -> AccountConfig:
    return AccountConfig(
        id=acc_id,
        label=kw.pop("label", acc_id),
        role=kw.pop("role", "follower"),
        login="1000",
        password="x",
        server="Stub-Demo",
        journal_account_id=journal,
        **kw,
    )


def deal(position: int, entry: int, *, t: datetime, profit: float = 0.0) -> dict:
    return {
        "ticket": position * 10 + entry,
        "position_id": position,
        "entry": entry,
        "type": 0 if entry == DEAL_ENTRY_IN else 1,
        "volume": 0.1,
        "price": 1.1,
        "profit": profit,
        "commission": 0.0,
        "swap": 0.0,
        "time": int(t.timestamp()),
        "time_msc": int(t.timestamp() * 1000),
        "symbol": "EURUSD",
        "magic": 0,
    }


class StubConnector:
    def __init__(self, deals: list[dict], *, readable: bool = True):
        self.deals = deals
        self.readable = readable
        self.window_reads = 0

    def history_deals_window(self, start, end):
        self.window_reads += 1
        if not self.readable:
            return None
        return [d for d in self.deals if start.timestamp() <= d["time"] <= end.timestamp()]

    def history_deals_for_position(self, position_ticket):
        return [d for d in self.deals if d["position_id"] == int(position_ticket)]


class StubSession:
    def __init__(self, connector: StubConnector, *, connects: bool = True):
        self.connector = connector
        self._connects = connects

    def connect(self) -> bool:
        return self._connects


class StubClient:
    def __init__(self, *, linked: bool = True):
        self.enabled = True
        self.user_id = "user-1"
        self.linked = linked
        self.posts: list[tuple[str, list[dict], str | None]] = []

    def post_closed_trades(self, trading_account_id, trades, synced_to=None):
        self.posts.append((trading_account_id, trades, synced_to))
        if not self.linked:
            return {"status": "ok", "written": 0, "skipped": len(trades), "linked": False}
        return {"status": "ok", "written": len(trades), "skipped": 0, "linked": True}


@pytest.fixture(autouse=True)
def clean_state():
    trade_journal.reset_state()
    yield
    trade_journal.reset_state()


@pytest.fixture
def client(monkeypatch):
    stub = StubClient()
    monkeypatch.setattr(api_client_module, "get_api_client", lambda: stub)
    return stub


def _round_trip() -> list[dict]:
    return [
        deal(700, DEAL_ENTRY_IN, t=NOW - timedelta(minutes=20)),
        deal(700, DEAL_ENTRY_OUT, t=NOW - timedelta(minutes=2), profit=25.0),
    ]


class TestWhatGetsJournalled:
    def test_a_linked_account_posts_its_closed_trades(self, client):
        connector = StubConnector(_round_trip())
        sessions = {"a": StubSession(connector)}

        written = trade_journal.sync_all_trades([account("a")], sessions)

        assert written == 1
        assert len(client.posts) == 1
        account_id, trades, synced_to = client.posts[0]
        assert account_id == "a"
        assert trades[0]["pnl"] == 25.0
        assert synced_to is not None

    def test_an_unlinked_account_is_skipped_without_reading_history(self, client):
        # The read is local IPC, but it is also pointless: there is nowhere to
        # journal to. Doing it anyway on every pass, for every account someone
        # has not linked, is work that buys nothing.
        connector = StubConnector(_round_trip())
        sessions = {"a": StubSession(connector)}

        written = trade_journal.sync_all_trades([account("a", journal=None)], sessions)

        assert written == 0
        assert connector.window_reads == 0
        assert client.posts == []

    def test_a_disabled_account_is_skipped(self, client):
        connector = StubConnector(_round_trip())
        sessions = {"a": StubSession(connector)}

        trade_journal.sync_all_trades([account("a", enabled=False)], sessions)

        assert connector.window_reads == 0

    def test_a_session_that_will_not_connect_posts_nothing(self, client):
        connector = StubConnector(_round_trip())
        sessions = {"a": StubSession(connector, connects=False)}

        assert trade_journal.sync_all_trades([account("a")], sessions) == 0
        assert client.posts == []

    def test_a_quiet_account_still_posts_so_the_mark_advances(self, client):
        # Otherwise the window grows by the length of every quiet stretch, and a
        # weekend leaves Monday re-reading three days of history.
        connector = StubConnector([])
        sessions = {"a": StubSession(connector)}

        trade_journal.sync_all_trades([account("a")], sessions)

        assert len(client.posts) == 1
        _, trades, synced_to = client.posts[0]
        assert trades == []
        assert synced_to is not None


class TestNotLosingTrades:
    def test_an_unreadable_window_posts_nothing_at_all(self, client):
        # Posting a mark here would advance the stored resume point past a
        # window nobody managed to read.
        connector = StubConnector([], readable=False)
        sessions = {"a": StubSession(connector)}

        assert trade_journal.sync_all_trades([account("a")], sessions) == 0
        assert client.posts == []

    def test_a_gateway_that_reports_unlinked_does_not_advance_the_local_mark(self, monkeypatch):
        stub = StubClient(linked=False)
        monkeypatch.setattr(api_client_module, "get_api_client", lambda: stub)
        sessions = {"a": StubSession(StubConnector(_round_trip()))}

        trade_journal.sync_all_trades([account("a")], sessions)
        trade_journal._last_sync = 0.0
        trade_journal.sync_all_trades([account("a")], sessions)

        # Both passes send the same trade, because the first was never stored.
        assert len(stub.posts) == 2
        assert stub.posts[0][1][0]["external_id"] == stub.posts[1][1][0]["external_id"]

    def test_one_account_failing_does_not_stop_the_next(self, client):
        class Exploding(StubConnector):
            def history_deals_window(self, start, end):
                raise RuntimeError("terminal closed")

        sessions = {
            "a": StubSession(Exploding([])),
            "b": StubSession(StubConnector(_round_trip())),
        }
        accounts = [account("a"), account("b")]

        # "a" raises and is swallowed; the cursor still moves, so "b" is
        # reached on the next pass rather than being blocked behind it forever.
        assert trade_journal.sync_all_trades(accounts, sessions) == 0
        assert trade_journal.sync_all_trades(accounts, sessions) == 1
        assert [p[0] for p in client.posts] == ["b"]


class TestRoundRobin:
    """One account per pass.

    Reading an account's history means attaching the process to it, which is a
    terminal re-init and a login -- the same switch a copy pays as switch_ms.
    Doing all six every couple of minutes would spend real time on a background
    job, so each pass advances one.
    """

    def test_each_pass_takes_the_next_account(self, client):
        sessions = {
            k: StubSession(StubConnector(_round_trip())) for k in ("a", "b", "c")
        }
        accounts = [account("a"), account("b"), account("c")]

        for _ in range(3):
            trade_journal.sync_all_trades(accounts, sessions)

        assert [p[0] for p in client.posts] == ["a", "b", "c"]

    def test_it_wraps_around(self, client):
        sessions = {k: StubSession(StubConnector([])) for k in ("a", "b")}
        accounts = [account("a"), account("b")]

        for _ in range(5):
            trade_journal.sync_all_trades(accounts, sessions)

        assert [p[0] for p in client.posts] == ["a", "b", "a", "b", "a"]

    def test_the_order_survives_a_reshuffled_config(self, client):
        # The runtime config does not promise an order. If the cursor indexed
        # into whatever order arrived, one account could be read twice while
        # another was never reached at all.
        sessions = {k: StubSession(StubConnector([])) for k in ("a", "b", "c")}

        trade_journal.sync_all_trades([account("a"), account("b"), account("c")], sessions)
        trade_journal.sync_all_trades([account("c"), account("a"), account("b")], sessions)
        trade_journal.sync_all_trades([account("b"), account("c"), account("a")], sessions)

        assert sorted(p[0] for p in client.posts) == ["a", "b", "c"]

    def test_unlinked_accounts_are_not_in_the_rotation(self, client):
        # Otherwise a pass is spent on an account with nowhere to journal to,
        # and the linked ones are read a third as often.
        sessions = {k: StubSession(StubConnector([])) for k in ("a", "b")}
        accounts = [account("a", journal=None), account("b")]

        for _ in range(2):
            trade_journal.sync_all_trades(accounts, sessions)

        assert [p[0] for p in client.posts] == ["b", "b"]


class TestThrottle:
    def test_the_first_call_runs_and_the_next_is_held_off(self):
        assert trade_journal.should_sync_trades() is True
        assert trade_journal.should_sync_trades() is False

    def test_the_interval_is_configurable(self, monkeypatch):
        monkeypatch.setenv("WORKER_TRADE_SYNC_SECONDS", "0")
        assert trade_journal.should_sync_trades() is True
        assert trade_journal.should_sync_trades() is True
