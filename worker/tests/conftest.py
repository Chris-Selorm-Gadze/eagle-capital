import pytest


@pytest.fixture(autouse=True)
def _isolated_journal_repair(tmp_path, monkeypatch):
    """Keep the journal's one-time repair markers out of the real logs folder."""
    from engine import trade_journal

    monkeypatch.setattr(trade_journal, "_REPAIR_DIR", tmp_path / "journal-time-repair")
