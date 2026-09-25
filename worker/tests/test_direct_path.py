"""The direct database path's rules, without a database.

What matters here is robustness: which errors fall back to the gateway, which
are real answers, that an outage pauses the direct path instead of costing a
slow call per request, and that pushed signals are acted on at once while a
dead listener degrades to the old polling rather than to silence.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine import control_signals  # noqa: E402
from engine.control_signals import ListenerSignals, Signals  # noqa: E402
from engine.credentials import (  # noqa: E402
    CredentialError,
    decrypt_password,
    encrypt_password,
    parse_key,
)
from engine.direct_client import (  # noqa: E402
    DirectRejected,
    DirectUnavailable,
    NothingToRun,
    _dumps,
    runtime_payload,
)

KEY = bytes(range(32))


class TestCredentials:
    def test_round_trip(self):
        assert decrypt_password(encrypt_password("s3cret", KEY), KEY) == "s3cret"

    def test_a_different_key_says_so(self):
        blob = encrypt_password("s3cret", KEY)
        with pytest.raises(CredentialError, match="ENCRYPTION_KEY"):
            decrypt_password(blob, bytes(32))

    def test_the_key_is_64_hex_characters(self):
        assert parse_key(None) is None and parse_key("  ") is None
        assert parse_key(KEY.hex()) == KEY
        for bad in ("abc", "zz" * 32):
            with pytest.raises(CredentialError):
                parse_key(bad)


class TestRuntimePayload:
    def rows(self, **overrides):
        base = {
            "copiers": [
                {"id": "c1", "master_account_id": "m", "follower_account_id": "f",
                 "is_enabled": None, "multiplier": "2.5", "copy_sl": False},
                # m is also a follower here, but its first mention wins.
                {"id": "c2", "master_account_id": "x", "follower_account_id": "m"},
            ],
            "accounts": [
                {"id": "m", "account_number": "1", "account_label": "",
                 "encrypted_password": encrypt_password("pm", KEY), "platform": "mt5"},
                {"id": "f", "account_number": "2", "account_label": "Follower",
                 "encrypted_password": encrypt_password("pf", KEY), "is_enabled": True},
                {"id": "j", "account_number": "3", "account_id": "dash",
                 "encrypted_password": encrypt_password("pj", KEY)},
                {"id": "loose", "account_number": "4",
                 "encrypted_password": encrypt_password("pl", KEY)},
            ],
            "symbol_mappings": [],
            "risk_profiles": [{"id": "r", "account_id": "m", "max_daily_loss": "100.50",
                               "daily_trades_count": None}],
        }
        base.update(overrides)
        return base

    def test_shaped_like_the_gateway(self):
        payload = runtime_payload("u", self.rows(), KEY)
        by_id = {a["id"]: a for a in payload["accounts"]}
        assert set(by_id) == {"m", "f", "j"}  # "loose" is neither linked nor journalled
        assert by_id["m"]["role"] == "master" and by_id["m"]["label"] == "1"
        assert by_id["m"]["password"] == "pm" and by_id["m"]["enabled"] is True
        assert by_id["f"]["role"] == "follower" and by_id["f"]["label"] == "Follower"
        assert by_id["j"]["role"] == "standalone" and by_id["j"]["journal_account_id"] == "dash"
        c1 = payload["copiers"][0]
        assert c1["enabled"] is True and c1["multiplier"] == 2.5
        assert c1["copy_sl"] is False and c1["copy_tp"] is True
        assert c1["max_signal_age_ms"] == 3000 and c1["fixed_lot_size"] == 0.01
        (risk,) = payload["risk_profiles"]
        assert risk["max_daily_loss"] == 100.5 and risk["daily_trades_count"] == 0

    def test_nothing_to_run_is_a_real_answer(self):
        with pytest.raises(NothingToRun):
            runtime_payload("u", self.rows(copiers=[], accounts=[]), KEY)
        assert issubclass(NothingToRun, DirectRejected)

    def test_json_never_carries_nan(self):
        assert _dumps({"p": [float("nan"), float("inf"), 1.5]}) == '{"p": [null, null, 1.5]}'


class FakeDirect:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.down = []
        self.up = 0
        self._available = True

    def available(self):
        return self._available

    def mark_down(self, operation, exc):
        self.down.append(operation)
        self._available = False

    def mark_up(self):
        self.up += 1

    @staticmethod
    def is_outage(exc):
        return isinstance(exc, ConnectionError)

    def pending_commands(self):
        return self.behaviour()

    def close(self):
        pass


@pytest.fixture()
def api(monkeypatch):
    from engine import api_client as api_module

    monkeypatch.setenv("API_URL", "https://gateway.test")
    monkeypatch.setenv("WORKER_API_KEY", "k")
    monkeypatch.setenv("WORKER_USER_ID", "u")
    client = api_module.ControlApiClient()
    client.http_calls = []

    def fake_request(method, path, **kw):
        client.http_calls.append(path)
        return SimpleNamespace(json=lambda: {"commands": [{"id": "gw"}]})

    monkeypatch.setattr(client, "_request", fake_request)
    yield client
    client.direct = None
    client.close()


class TestRouting:
    def test_direct_first(self, api):
        api.direct = FakeDirect(lambda: [{"id": "db"}])
        assert api.fetch_pending_commands() == [{"id": "db"}]
        assert api.http_calls == []

    def test_an_outage_falls_back_and_pauses_the_direct_path(self, api):
        calls = []

        def broken():
            calls.append(1)
            raise ConnectionError("server closed the connection")

        api.direct = FakeDirect(broken)
        assert api.fetch_pending_commands() == [{"id": "gw"}]
        assert api.direct.down == ["pending_commands"]
        # Paused: the next call does not try the database again.
        api.fetch_pending_commands()
        assert len(calls) == 1 and len(api.http_calls) == 2

    def test_one_bad_call_falls_back_without_pausing(self, api):
        def bad():
            raise ValueError("unexpected")

        api.direct = FakeDirect(bad)
        assert api.fetch_pending_commands() == [{"id": "gw"}]
        assert api.direct.down == [] and api.direct.available()

    def test_a_real_answer_is_not_asked_twice(self, api):
        def no():
            raise DirectRejected("Account not found")

        api.direct = FakeDirect(no)
        with pytest.raises(DirectRejected):
            api.fetch_pending_commands()
        assert api.http_calls == []

    def test_unservable_directly_goes_to_the_gateway(self, api):
        def unavailable():
            raise DirectUnavailable("ENCRYPTION_KEY not set")

        api.direct = FakeDirect(unavailable)
        assert api.fetch_pending_commands() == [{"id": "gw"}]
        assert api.direct.down == []

    def test_no_gateway_means_the_error_surfaces(self, api):
        api.base_url = ""

        def broken():
            raise ConnectionError("down")

        api.direct = FakeDirect(broken)
        with pytest.raises(ConnectionError):
            api.fetch_pending_commands()
        # And with the direct path paused, a clear message rather than a hang.
        with pytest.raises(RuntimeError, match="no gateway"):
            api.fetch_pending_commands()

    def test_direct_alone_counts_as_configured(self, api):
        api.base_url = ""
        api.worker_key = ""
        api.direct = FakeDirect(lambda: [])
        assert api.enabled and api.missing_settings() == []


class Note(SimpleNamespace):
    pass


class FakeListenConn:
    """notifies() hands out queued notes, then stops the listener."""

    def __init__(self, signals, notes):
        self.signals = signals
        self.notes = notes
        self.executed = []

    def execute(self, sql):
        self.executed.append(sql)

    def notifies(self, timeout):
        for note in self.notes:
            yield note
        self.signals.stop()


class TestListener:
    def test_connect_catches_up_and_filters_by_user(self):
        signals = ListenerSignals("dsn", "me")
        conn = FakeListenConn(signals, [])
        signals.serve_once(conn)
        assert conn.executed[:2] == ["LISTEN worker_commands", "LISTEN worker_config"]
        # Anything rung while disconnected is in the table: look now.
        assert signals.take_commands() and signals.take_config()

        signals = ListenerSignals("dsn", "me")
        signals.serve_once(FakeListenConn(signals, [
            Note(channel="worker_commands", payload="someone-else"),
            Note(channel="worker_config", payload="me"),
        ]))
        signals.take_commands()  # only the catch-up; someone-else's was ignored
        assert not signals.take_commands()
        signals._deliver("worker_commands", "me")
        assert signals.take_commands() and not signals.take_commands()
        assert signals.take_config()

    def test_a_dropped_connection_is_retried_and_unhealthy_meanwhile(self, monkeypatch):
        attempts = []
        connected = threading.Event()

        def connect():
            attempts.append(1)
            if len(attempts) == 1:
                raise OSError("network down")
            connected.set()
            return FakeListenConn(signals, [])

        signals = ListenerSignals("dsn", "me", connect=connect)
        assert not signals.healthy()
        signals.start()
        assert connected.wait(5)
        signals.stop()
        assert len(attempts) == 2

    def test_wait_wakes_on_a_signal(self):
        signals = Signals()
        threading.Timer(0.05, signals.raise_commands).start()
        started = time.perf_counter()
        assert signals.wait(5)
        assert time.perf_counter() - started < 1
        assert not signals.wait(0.01)

    def test_without_a_database_the_signals_are_inert(self):
        control_signals.reset_signals(None)
        signals = control_signals.get_signals()
        assert type(signals) is Signals and not signals.healthy()


class TestCopyLoopCommandBeat:
    def engine(self, signals, last_poll=0.0):
        from engine.copier_engine import CopierEngine

        return SimpleNamespace(
            _signals=signals, _last_command_poll=last_poll, _command_poll_interval_s=2.0,
            _commands_due=CopierEngine._commands_due,
        )

    def due(self, eng, now):
        return eng._commands_due(eng, now)

    def test_a_push_is_served_on_the_next_pass(self):
        signals = Signals()
        signals.healthy = lambda: True
        eng = self.engine(signals, last_poll=100.0)
        assert not self.due(eng, 101.0)
        signals.raise_commands()
        assert self.due(eng, 101.0)

    def test_healthy_listener_polls_only_as_a_safety_net(self, monkeypatch):
        monkeypatch.setenv("WORKER_COMMAND_SAFETY_POLL_SECONDS", "30")
        signals = Signals()
        signals.healthy = lambda: True
        eng = self.engine(signals, last_poll=100.0)
        assert not self.due(eng, 110.0)
        assert self.due(eng, 131.0)

    def test_dead_listener_falls_back_to_the_fast_poll(self):
        eng = self.engine(Signals(), last_poll=100.0)
        assert self.due(eng, 102.5)


class TestIdleLoop:
    @pytest.fixture()
    def idle(self, monkeypatch):
        from engine import master_supervisor as sup

        served = []
        monkeypatch.setattr(sup, "_feed_positions_while_idle", lambda accounts: None)
        monkeypatch.setattr(sup, "_journal_while_idle", lambda accounts: None)
        monkeypatch.setattr(sup, "_serve_commands_while_idle", lambda accounts: served.append(1))
        monkeypatch.setenv("WORKER_IDLE_SWEEP_STEP_SECONDS", "0.05")
        signals = Signals()
        control_signals.reset_signals(signals)
        return sup, signals, served

    def test_a_pushed_command_is_served_at_once(self, idle):
        sup, signals, served = idle
        threading.Timer(0.1, signals.raise_commands).start()
        sup._idle_wait(0.4, [])
        assert served

    def test_a_config_change_ends_the_wait(self, idle):
        sup, signals, _served = idle
        threading.Timer(0.05, signals.raise_config).start()
        started = time.perf_counter()
        sup._idle_wait(10, [])
        assert time.perf_counter() - started < 2

    def test_idle_completes_reload_commands(self, monkeypatch):
        from engine import master_supervisor as sup

        completed = []
        client = SimpleNamespace(
            enabled=True,
            fetch_pending_commands=lambda: [{"id": "r1", "command_type": "reload_config"}],
            complete_command=lambda cid, **kw: completed.append((cid, kw["success"])),
        )
        monkeypatch.setattr("engine.api_client.get_api_client", lambda: client)
        signals = Signals()
        control_signals.reset_signals(signals)
        sup._serve_commands_while_idle([])
        assert completed == [("r1", True)]
        assert signals.take_config()
