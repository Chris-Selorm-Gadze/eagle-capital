"""The direct database path against a real Postgres.

Skipped unless both are set:

  WORKER_TEST_ADMIN_DATABASE_URL  a superuser connection to a database with the
                                  app schema and migrations-worker-direct.sql
                                  applied (the test creates and removes its
                                  own rows)
  WORKER_TEST_DATABASE_URL        the same database as copier_worker

Everything the worker does goes through here once, as the role it will run as,
so a grant, a type or a column mismatch fails a test instead of a live copy.
"""

from __future__ import annotations

import os
import sys
import time
import uuid

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

ADMIN_URL = os.environ.get("WORKER_TEST_ADMIN_DATABASE_URL", "")
WORKER_URL = os.environ.get("WORKER_TEST_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not (ADMIN_URL and WORKER_URL), reason="no test database configured"
)

KEY = bytes(range(32))


@pytest.fixture()
def world():
    import psycopg

    from engine.credentials import encrypt_password

    admin = psycopg.connect(ADMIN_URL, autocommit=True)
    user, other = uuid.uuid4(), uuid.uuid4()
    for u in (user, other):
        admin.execute("insert into auth.users (id, email) values (%s, %s)", (u, f"{u}@t.test"))
        admin.execute(
            "insert into public.tc_users (id, email) values (%s, %s) on conflict do nothing",
            (u, f"{u}@t.test"),
        )
    dash = admin.execute(
        "insert into public.accounts (user_id, label, size, balance, highest_balance, stage)"
        " values (%s, 'Journal', 1000, 1000, 1000, 'live') returning id",
        (user,),
    ).fetchone()[0]

    def trading_account(owner, number, **extra):
        cols = {
            "user_id": owner,
            "account_number": number,
            "broker_server": "Demo-Server",
            "encrypted_password": encrypt_password(f"pw-{number}", KEY),
            **extra,
        }
        names = ", ".join(cols)
        marks = ", ".join(["%s"] * len(cols))
        return admin.execute(
            f"insert into public.trading_accounts ({names}) values ({marks}) returning id",
            list(cols.values()),
        ).fetchone()[0]

    master = trading_account(user, "1001", account_label="Master")
    follower = trading_account(user, "1002", account_id=dash)
    loose = trading_account(user, "1003")  # in no link, not journalled
    foreign = trading_account(other, "2001")
    link = admin.execute(
        "insert into public.copier_relations (user_id, master_account_id, follower_account_id)"
        " values (%s, %s, %s) returning id",
        (user, master, follower),
    ).fetchone()[0]

    yield {
        "admin": admin, "user": str(user), "other": str(other), "dash": dash,
        "master": str(master), "follower": str(follower), "loose": str(loose),
        "foreign": str(foreign), "link": str(link),
    }

    for u in (user, other):
        admin.execute("delete from public.worker_nodes where user_id = %s", (u,))
        admin.execute("delete from public.tc_users where id = %s", (u,))
        admin.execute("delete from public.accounts where user_id = %s", (u,))
        admin.execute("delete from auth.users where id = %s", (u,))
    admin.close()


@pytest.fixture()
def client(world):
    from engine.direct_client import DirectDbClient

    c = DirectDbClient(WORKER_URL, world["user"], encryption_key=KEY)
    yield c
    c.close()


def test_the_role_can_touch_no_table_directly(world):
    import psycopg

    with psycopg.connect(WORKER_URL, autocommit=True) as conn:
        for sql in (
            "select * from public.trading_accounts",
            "update public.worker_commands set status = 'x'",
            "delete from public.trades",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(sql)


def test_runtime_config_matches_the_gateway_shape(world, client):
    payload = client.fetch_runtime_config()
    by_id = {a["id"]: a for a in payload["accounts"]}
    # The loose account is in no link and not journalled; the foreign one is
    # somebody else's.
    assert set(by_id) == {world["master"], world["follower"]}
    assert by_id[world["master"]]["role"] == "master"
    assert by_id[world["master"]]["password"] == "pw-1001"
    assert by_id[world["master"]]["label"] == "Master"
    assert by_id[world["follower"]]["role"] == "follower"
    assert by_id[world["follower"]]["label"] == "1002"
    assert by_id[world["follower"]]["journal_account_id"] == str(world["dash"])
    (copier,) = payload["copiers"]
    assert copier["master_id"] == world["master"] and copier["enabled"] is True
    assert copier["multiplier"] == 1.0 and copier["max_signal_age_ms"] == 3000


def test_trading_account_is_scoped_to_the_user(world, client):
    from engine.direct_client import DirectRejected

    assert client.fetch_trading_account(world["loose"])["password"] == "pw-1003"
    with pytest.raises(DirectRejected):
        client.fetch_trading_account(world["foreign"])


def test_worker_lifecycle(world, client):
    admin = world["admin"]
    wid = client.register_worker({
        "worker_name": "t-worker", "region": "home", "host_identifier": "box",
        "capacity": 5, "metadata": {"phase": "2"},
    })
    # A restart finds the same row rather than adding a ghost.
    assert client.register_worker({"worker_name": "t-worker", "host_identifier": "box"}) == wid
    client.heartbeat(wid, 1, {"status": "running"})
    client.session_started(wid, world["master"], r"C:\MT5\a", 42)
    status = admin.execute(
        "select connection_status from public.trading_accounts where id = %s", (world["master"],)
    ).fetchone()[0]
    assert status == "connected"
    client.session_failed(wid, world["master"], "bad password")
    status, err = admin.execute(
        "select connection_status, last_error from public.trading_accounts where id = %s",
        (world["master"],),
    ).fetchone()
    assert (status, err) == ("auth_failed", "bad password")
    # Somebody else's account is out of reach.
    client.session_failed(wid, world["foreign"], "nope")
    assert admin.execute(
        "select last_error from public.trading_accounts where id = %s", (world["foreign"],)
    ).fetchone()[0] is None


def test_commands_round_trip(world, client):
    admin = world["admin"]
    cid = admin.execute(
        "insert into public.worker_commands (user_id, trading_account_id, command_type)"
        " values (%s, %s, 'test_connection') returning id",
        (world["user"], world["master"]),
    ).fetchone()[0]
    (cmd,) = client.pending_commands()
    assert cmd["id"] == str(cid) and cmd["command_type"] == "test_connection"
    client.complete_command(str(cid), True, {
        "balance": 5000.5, "equity": 5001, "currency": "USD",
        "terminal_path": r"C:\MT5\acct-1001", "ping_ms": 12,
    }, None)
    assert client.pending_commands() == []
    row = admin.execute(
        "select connection_status, balance, terminal_path, account_metadata->>'ping_ms'"
        " from public.trading_accounts where id = %s",
        (world["master"],),
    ).fetchone()
    assert row[0] == "connected" and float(row[1]) == 5000.5
    assert row[2] == r"C:\MT5\acct-1001" and row[3] == "12"


def test_balances_and_positions(world, client):
    admin = world["admin"]
    client.update_balances([
        {"trading_account_id": world["master"], "balance": 100, "equity": 101, "currency": "USD"},
        {"trading_account_id": world["foreign"], "balance": 999},
        {"trading_account_id": world["follower"], "connection_status": "not-a-status"},
    ])
    assert float(admin.execute(
        "select balance from public.trading_accounts where id = %s", (world["master"],)
    ).fetchone()[0]) == 100
    assert admin.execute(
        "select balance from public.trading_accounts where id = %s", (world["foreign"],)
    ).fetchone()[0] is None
    snaps = admin.execute(
        "select count(*) from public.account_equity_snapshots where trading_account_id = %s",
        (world["master"],),
    ).fetchone()[0]
    assert snaps == 1

    positions = [{"ticket": 1, "symbol": "EURUSD", "profit": float("nan")}]
    client.update_positions([
        {"trading_account_id": world["master"], "positions": positions, "equity": 102},
        {"trading_account_id": world["foreign"], "positions": positions},
    ])
    # A later visit that did not read the account info keeps the figures.
    client.update_positions([{"trading_account_id": world["master"], "positions": []}])
    rows = admin.execute(
        "select trading_account_id::text, positions, equity from public.live_positions"
        " where user_id in (%s, %s)",
        (world["user"], world["other"]),
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == world["master"] and rows[0][1] == [] and float(rows[0][2]) == 102


def test_journal_is_idempotent_and_validated(world, client):
    from engine.direct_client import DirectRejected

    admin = world["admin"]
    good = {
        "external_id": f"mt5:{world['follower']}:1", "symbol": "EURUSD", "side": "long",
        "qty": 0.1, "entry_price": 1.1, "exit_price": 1.2, "pnl": 10,
        "entry_time": "2026-09-18T22:00:00Z", "exit_time": "2026-09-18T23:00:00Z",
    }
    bad = {**good, "external_id": "mt5:x:2", "side": "sideways"}
    result = client.journal_trades(world["follower"], [good, bad], "2026-09-19T00:00:00Z")
    assert result == {"status": "ok", "written": 1, "skipped": 1, "linked": True}

    # The broker-clock repair: the same external id, corrected times.
    fixed = {**good, "entry_time": "2026-09-18T20:00:00Z", "exit_time": "2026-09-18T21:00:00Z"}
    client.journal_trades(world["follower"], [fixed], None)
    rows = admin.execute(
        "select exit_time, date from public.trades where user_id = %s", (world["user"],)
    ).fetchall()
    assert len(rows) == 1
    from datetime import datetime, timezone

    assert rows[0][0] == datetime(2026, 9, 18, 21, 0, tzinfo=timezone.utc)

    # An unlinked account is a skip, not an error; an unknown one is a no.
    assert client.journal_trades(world["master"], [good], None)["linked"] is False
    with pytest.raises(DirectRejected):
        client.journal_trades(world["foreign"], [good], None)


def test_events_and_open_links(world, client):
    common = {
        "copier_relation_id": world["link"], "master_account_id": world["master"],
        "follower_account_id": world["follower"], "side": "long", "executed_lot": 0.1,
    }
    client.insert_events([
        {**common, "event_type": "position_opened", "status": "success",
         "master_ticket": 11, "follower_ticket": "21", "symbol_follower": "EURUSD",
         "unexpected_key": "ignored"},
        {**common, "event_type": "position_opened", "status": "success",
         "master_ticket": "12", "follower_ticket": "22"},
    ])
    client.insert_events([
        {**common, "event_type": "manual_close", "status": "success", "follower_ticket": "22"},
    ])
    (link,) = client.fetch_open_links()
    assert link["master_ticket"] == "11" and link["follower_ticket"] == "21"
    assert link["copier_id"] == world["link"] and link["symbol"] == "EURUSD"


def test_whoami(world, client):
    me = client.whoami()
    assert me["known_user"] is True and me["relations"] == 1
    assert {a["id"] for a in me["accounts"]} == {world["master"], world["follower"], world["loose"]}


def test_a_command_insert_is_pushed_to_the_listener(world):
    from engine.control_signals import ListenerSignals

    signals = ListenerSignals(WORKER_URL, world["user"]).start()
    try:
        deadline = time.time() + 10
        while not signals.healthy() and time.time() < deadline:
            time.sleep(0.05)
        assert signals.healthy()
        # The catch-up raise on connect.
        assert signals.take_commands() and signals.take_config()
        signals.wait(0)  # drop the wake-up the catch-up left behind

        admin = world["admin"]
        started = time.perf_counter()
        admin.execute(
            "insert into public.worker_commands (user_id, trading_account_id, command_type)"
            " values (%s, %s, 'close_position')",
            (world["user"], world["master"]),
        )
        assert signals.wait(5)
        assert signals.take_commands()
        assert time.perf_counter() - started < 1.0

        # Another user's command does not wake this worker.
        admin.execute(
            "insert into public.worker_commands (user_id, trading_account_id, command_type)"
            " values (%s, %s, 'close_position')",
            (world["other"], world["foreign"]),
        )
        assert not signals.wait(0.5)

        # A balance write from the worker itself is not a config change...
        admin.execute(
            "update public.trading_accounts set balance = 1 where id = %s", (world["master"],)
        )
        assert not signals.wait(0.5)
        # ...arming a link is.
        admin.execute(
            "update public.copier_relations set is_enabled = false where id = %s", (world["link"],)
        )
        assert signals.wait(5) and signals.take_config()
    finally:
        signals.stop()


def test_the_gateway_is_used_when_the_database_is_down(world, monkeypatch):
    """End to end through ControlApiClient: a dead database URL falls back."""
    from engine import api_client as api_module

    monkeypatch.setenv("WORKER_DATABASE_URL", "postgresql://copier_worker:x@127.0.0.1:1/none")
    monkeypatch.setenv("WORKER_USER_ID", world["user"])
    monkeypatch.setenv("API_URL", "https://gateway.invalid")
    monkeypatch.setenv("WORKER_API_KEY", "k")
    monkeypatch.setenv("WORKER_DB_CONNECT_TIMEOUT_SECONDS", "1")
    monkeypatch.setenv("WORKER_DB_POOL_TIMEOUT_SECONDS", "1")
    client = api_module.ControlApiClient()
    calls = []
    monkeypatch.setattr(
        client, "_request",
        lambda method, path, **kw: calls.append(path) or type(
            "R", (), {"json": staticmethod(lambda: {"commands": [{"id": "via-gateway"}]})}
        )(),
    )
    assert client.fetch_pending_commands() == [{"id": "via-gateway"}]
    assert calls == ["/internal/worker-commands"]
    # Paused, not retried per call: the next call goes straight to the gateway.
    started = time.perf_counter()
    client.fetch_pending_commands()
    assert time.perf_counter() - started < 0.2
    client.close()


def test_the_days_opening_snapshot_fills_a_missing_figure_but_never_moves(world, client):
    admin = world["admin"]
    acc = world["master"]
    # The first report of the day read the balance but not the equity.
    client.update_balances([{"trading_account_id": acc, "balance": 100, "equity": None}])
    client.update_balances([{"trading_account_id": acc, "balance": 150, "equity": 151}])
    client.update_balances([{"trading_account_id": acc, "balance": 200, "equity": 201}])
    # A status-only report writes no snapshot at all.
    client.update_balances([{"trading_account_id": world["follower"], "connection_status": "connected"}])
    rows = admin.execute(
        "select trading_account_id::text, balance_open, equity_open"
        " from public.account_equity_snapshots where user_id = %s",
        (world["user"],),
    ).fetchall()
    assert len(rows) == 1
    _, balance_open, equity_open = rows[0]
    assert float(balance_open) == 100  # the first figure seen, never moved
    assert float(equity_open) == 151  # the gap, filled by the next report


def test_a_connection_test_without_figures_keeps_the_stored_balance(world, client):
    admin = world["admin"]
    client.update_balances([
        {"trading_account_id": world["master"], "balance": 500, "equity": 501, "currency": "USD"},
    ])
    cid = admin.execute(
        "insert into public.worker_commands (user_id, trading_account_id, command_type)"
        " values (%s, %s, 'test_connection') returning id",
        (world["user"], world["master"]),
    ).fetchone()[0]
    client.complete_command(str(cid), True, {"terminal_path": r"C:\MT5\x"}, None)
    balance, equity, currency = admin.execute(
        "select balance, equity, currency from public.trading_accounts where id = %s",
        (world["master"],),
    ).fetchone()
    assert (float(balance), float(equity), currency) == (500, 501, "USD")
