"""Unit tests for copier follower deduplication."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.config_loader import CopierConfig, dedupe_copiers_by_follower


def test_dedupe_keeps_first_per_follower():
    copiers = [
        CopierConfig(id="c1", master_id="m", follower_id="f1"),
        CopierConfig(id="c2", master_id="m", follower_id="f1"),
        CopierConfig(id="c3", master_id="m", follower_id="f2"),
    ]
    out = dedupe_copiers_by_follower(copiers)
    assert [c.id for c in out] == ["c1", "c3"]
