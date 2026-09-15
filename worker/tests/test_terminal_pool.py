"""Tests for terminal pool routing (shared path vs dedicated workers)."""

import os
from engine.terminal_pool import SHARED_PREFIX, build_pool_plan, pool_plan_fingerprint
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

