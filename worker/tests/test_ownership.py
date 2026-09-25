"""Every account has exactly one owning process, and all processes agree on it."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.config_loader import AccountConfig, CopierConfig  # noqa: E402
from engine.ownership import (  # noqa: E402
    active_master_ids,
    is_primary,
    owned_account_ids,
    owners,
)


def acc(acc_id: str, role: str = "follower", enabled: bool = True) -> AccountConfig:
    return AccountConfig(
        id=acc_id, label=acc_id, role=role, login="1", password="x",
        server="S", enabled=enabled,
    )


def link(cid: str, master: str, follower: str, enabled: bool = True) -> CopierConfig:
    return CopierConfig(id=cid, master_id=master, follower_id=follower, enabled=enabled)


ACCOUNTS = [
    acc("m1", "master"), acc("m2", "master"), acc("m3", "master"),
    acc("f1"), acc("f2"), acc("shared"), acc("loose", "standalone"),
]
COPIERS = [
    link("c1", "m1", "f1"),
    link("c2", "m2", "f2"),
    link("c3", "m1", "shared"),
    link("c4", "m2", "shared"),
    link("c5", "m3", "f1", enabled=False),  # m3 is not active
]


def test_only_masters_with_an_armed_link_are_active():
    assert active_master_ids(ACCOUNTS, COPIERS) == ["m1", "m2"]


def test_every_account_has_exactly_one_owner():
    owner, primary = owners(ACCOUNTS, COPIERS)
    assert primary == "m1"
    assert set(owner) == {a.id for a in ACCOUNTS}
    by_process = [owned_account_ids(ACCOUNTS, COPIERS, m) for m in ("m1", "m2")]
    assert by_process[0].isdisjoint(by_process[1])
    assert by_process[0] | by_process[1] == {a.id for a in ACCOUNTS}


def test_a_follower_of_two_masters_goes_to_the_first():
    assert "shared" in owned_account_ids(ACCOUNTS, COPIERS, "m1")
    assert "shared" not in owned_account_ids(ACCOUNTS, COPIERS, "m2")


def test_unclaimed_accounts_go_to_the_primary():
    mine = owned_account_ids(ACCOUNTS, COPIERS, "m1")
    assert {"m3", "loose"} <= mine
    assert is_primary(ACCOUNTS, COPIERS, "m1")
    assert not is_primary(ACCOUNTS, COPIERS, "m2")


def test_each_master_owns_itself_and_its_own_followers():
    assert owned_account_ids(ACCOUNTS, COPIERS, "m2") == {"m2", "f2"}


def test_a_single_master_owns_everything():
    accounts = [acc("m", "master"), acc("a"), acc("b", "standalone")]
    assert owned_account_ids(accounts, [link("c", "m", "a")], "m") == {"m", "a", "b"}


def test_the_answer_does_not_depend_on_config_order():
    reversed_view = owned_account_ids(list(reversed(ACCOUNTS)), list(reversed(COPIERS)), "m1")
    assert reversed_view == owned_account_ids(ACCOUNTS, COPIERS, "m1")
