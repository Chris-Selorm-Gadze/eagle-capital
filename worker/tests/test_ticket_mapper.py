"""Unit tests for ticket mapper deduplication."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.ticket_mapper import TicketMapper


def test_has_for_follower_blocks_second_copier():
    mapper = TicketMapper()
    mapper.add(
        "copier-a",
        100,
        200,
        "EURUSD",
        "buy",
        follower_account_id="follower-1",
    )
    assert mapper.has("copier-b", 100) is False
    assert mapper.has_for_follower("follower-1", 100) is True
