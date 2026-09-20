"""Tests for terminal pool routing (shared path vs dedicated workers)."""

import os
from engine.terminal_pool import SHARED_PREFIX, build_pool_plan, pool_plan_fingerprint, routable_accounts
from engine.terminal_session_manager import normalize_terminal_path


def _norm(path: str) -> str:
    return normalize_terminal_path(path)


def test_build_pool_plan_dedicated_per_unique_path():
    paths = {
        "acc-a": "C:/MT5/Exness/terminal64.exe",
        "acc-b": "C:/MT5/Fusion/terminal64.exe",
    }
    workers, routes = build_pool_plan(paths)
    assert workers == {k: _norm(v) for k, v in paths.items()}
    assert routes == {"acc-a": "acc-a", "acc-b": "acc-b"}


def test_build_pool_plan_shared_when_same_path():
    shared = "C:/MT5/Exness/terminal64.exe"
    paths = {
        "acc-1": shared,
        "acc-2": shared,
        "acc-3": shared,
    }
    workers, routes = build_pool_plan(paths)
    pool_key = f"{SHARED_PREFIX}{_norm(shared)}"
    assert workers == {pool_key: _norm(shared)}
    assert routes == {
        "acc-1": pool_key,
        "acc-2": pool_key,
        "acc-3": pool_key,
    }


def test_build_pool_plan_mixed_shared_and_dedicated():
    shared = "C:/MT5/Exness/terminal64.exe"
    unique = "C:/MT5/FTMO/portable-1/terminal64.exe"
    paths = {
        "ex-1": shared,
        "ex-2": shared,
        "ftmo-1": unique,
    }
    workers, routes = build_pool_plan(paths)
    shared_key = f"{SHARED_PREFIX}{_norm(shared)}"
    assert workers[shared_key] == _norm(shared)
    assert workers["ftmo-1"] == _norm(unique)
    assert routes["ex-1"] == shared_key
    assert routes["ex-2"] == shared_key
    assert routes["ftmo-1"] == "ftmo-1"


def test_pool_fingerprint_changes_when_routing_changes():
    base = {"a": "C:/MT5/shared/terminal64.exe", "b": "C:/MT5/shared/terminal64.exe"}
    unique = {"a": "C:/MT5/a/terminal64.exe", "b": "C:/MT5/b/terminal64.exe"}
    assert pool_plan_fingerprint(base) != pool_plan_fingerprint(unique)



class TestRoutableAccounts:
    """Reads may not slow down copies."""

    def test_an_account_alone_on_its_terminal_is_routed(self):
        routed = routable_accounts({"watch-1": "C:/mt5/a"}, {})
        assert routed == {"watch-1": _norm("C:/mt5/a")}

    def test_a_follower_is_always_routed(self):
        # Reading an account the pool worker is already pinned to costs nothing.
        routed = routable_accounts({"f1": "C:/mt5/a"}, {"f1": "C:/mt5/a"})
        assert "f1" in routed

    def test_a_watcher_sharing_a_followers_terminal_is_left_out(self):
        # Adding it would turn the follower's dedicated, pinned worker into a
        # shared one that switches login per job -- so every copy would then pay
        # the switch the last read left it on.
        routed = routable_accounts(
            {"f1": "C:/mt5/a", "watch-1": "C:/mt5/a"},
            {"f1": "C:/mt5/a"},
        )
        assert "watch-1" not in routed
        assert "f1" in routed

    def test_a_watcher_on_its_own_terminal_survives_alongside(self):
        routed = routable_accounts(
            {"f1": "C:/mt5/a", "watch-1": "C:/mt5/a", "watch-2": "C:/mt5/b"},
            {"f1": "C:/mt5/a"},
        )
        assert set(routed) == {"f1", "watch-2"}

    def test_followers_sharing_one_terminal_are_both_kept(self):
        # They already share it for copying; that is a copier arrangement, not
        # something a read introduced.
        routed = routable_accounts(
            {"f1": "C:/mt5/a", "f2": "C:/mt5/a"},
            {"f1": "C:/mt5/a", "f2": "C:/mt5/a"},
        )
        assert set(routed) == {"f1", "f2"}

    def test_an_account_with_no_terminal_path_is_not_routed(self):
        # Nothing to pin it to; the inline balance sweep reads it instead.
        assert routable_accounts({"a": ""}, {}) == {}

    def test_path_comparison_is_normalised(self):
        # The same install written two ways is one terminal, so a watcher cannot
        # slip onto a copy path by spelling it differently. Case and separator
        # folding is normalize_terminal_path's job and is Windows-only, so this
        # asserts the part that holds on every platform.
        routed = routable_accounts(
            {"f1": "C:/mt5/a", "watch-1": "C:/mt5/./a/"},
            {"f1": "C:/mt5/a"},
        )
        assert "watch-1" not in routed
