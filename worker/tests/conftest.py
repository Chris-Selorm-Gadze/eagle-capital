import pytest


@pytest.fixture(autouse=True)
def _isolated_journal_repair(tmp_path, monkeypatch):
    """Keep the journal's one-time repair markers out of the real logs folder."""
    from engine import trade_journal

    monkeypatch.setattr(trade_journal, "_REPAIR_DIR", tmp_path / "journal-time-repair")


@pytest.fixture(autouse=True)
def _no_direct_database(monkeypatch):
    """No test reaches a real database by accident: the direct path is off
    unless a test turns it on, and each test starts with inert signals."""
    from engine import control_signals

    monkeypatch.delenv("WORKER_DATABASE_URL", raising=False)
    control_signals.reset_signals(None)
    yield
    control_signals.reset_signals(None)
