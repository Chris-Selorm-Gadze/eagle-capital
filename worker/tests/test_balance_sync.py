"""Which accounts the inline balance sweep may log in to, and who reports the rest."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine import balance_sync, position_feed  # noqa: E402
from engine.config_loader import AccountConfig  # noqa: E402


def acc(acc_id, role="follower", platform="mt5", enabled=True):
    return AccountConfig(
        id=acc_id, label=acc_id, role=role, login="1", password="x",
        server="S", platform=platform, enabled=enabled,
    )


class Pool:
    def __init__(self, routed):
        self.routed = set(routed)

    def has(self, account_id):
        return account_id in self.routed


@pytest.fixture(autouse=True)
def clean():
    balance_sync.reset_state()
    position_feed.reset_state()


class TestAccountsToVisit:
    def test_pool_routed_accounts_are_never_logged_into_inline(self):
        accounts = [acc("m", "master"), acc("f1"), acc("f2")]
        visit = balance_sync.accounts_to_visit(accounts, Pool(["f1", "f2"]))
        assert [a.id for a in visit] == ["m"]

    def test_unrouted_mt5_accounts_take_turns(self):
        accounts = [acc("m", "master"), acc("b"), acc("a")]
        passes = [
            [a.id for a in balance_sync.accounts_to_visit(accounts, Pool([]))]
            for _ in range(3)
        ]
        assert passes == [["m", "a"], ["m", "b"], ["m", "a"]]

    def test_dxtrade_costs_no_switch_so_is_always_read(self):
        accounts = [acc("d", platform="dxtrade"), acc("x")]
        visit = balance_sync.accounts_to_visit(accounts, None)
        assert {a.id for a in visit} == {"d", "x"}

    def test_without_rotation_every_unrouted_account_is_read(self):
        accounts = [acc("a"), acc("b"), acc("c")]
        visit = balance_sync.accounts_to_visit(accounts, None, rotate=False)
        assert [a.id for a in visit] == ["a", "b", "c"]

    def test_disabled_accounts_are_left_alone(self):
        visit = balance_sync.accounts_to_visit([acc("a", enabled=False)], None)
        assert visit == []


class TestPooledBalancesFromTheSweep:
    def test_a_read_with_figures_becomes_a_balance_row(self):
        row = position_feed.balance_row({
            "trading_account_id": "f1", "positions": [],
            "balance": 1000.0, "equity": 1010.0, "currency": "USD",
        })
        assert row == {
            "trading_account_id": "f1", "balance": 1000.0, "equity": 1010.0,
            "connection_status": "connected", "currency": "USD",
        }

    def test_a_read_without_figures_reports_no_balance(self):
        assert position_feed.balance_row({"trading_account_id": "f1", "positions": []}) is None

    def test_balances_are_reported_at_the_balance_cadence_not_every_sweep(self, monkeypatch):
        posted = []

        class Client:
            enabled = True
            user_id = "u"

            def post_account_balances(self, rows):
                posted.append(rows)

        monkeypatch.setattr("engine.api_client.get_api_client", lambda: Client())
        rows = [{"trading_account_id": "f1", "balance": 1.0}]
        assert position_feed.report_balances(rows, now=1000.0) == 1
        assert position_feed.report_balances(rows, now=1002.0) == 0
        assert position_feed.report_balances(rows, now=1091.0) == 1
        assert len(posted) == 2
