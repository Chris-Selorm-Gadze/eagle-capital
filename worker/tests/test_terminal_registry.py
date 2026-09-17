"""Terminal assignment: the rules that keep two accounts off one MT5 install."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.terminal_registry import (  # noqa: E402
    TerminalInfo,
    canonical_slug,
    capacity_for,
    claim_free_terminal,
    discover_terminals,
    slug_for_folder,
)


def t(path: str, slug: str | None, folder: str = "") -> TerminalInfo:
    return TerminalInfo(path=path, broker_slug=slug, folder=folder or path)


class TestCanonicalSlug:
    def test_accepts_the_preset_slugs_the_dialog_writes(self):
        assert canonical_slug("moneta_markets") == "moneta_markets"
        assert canonical_slug("fusion_markets") == "fusion_markets"
        assert canonical_slug("ftmo") == "ftmo"
        assert canonical_slug("exness") == "exness"

    def test_accepts_the_short_names_clone_terminals_uses(self):
        # clone-terminals.ps1 names folders moneta-1, fusion-3; the dialog writes
        # moneta_markets, fusion_markets. Both must resolve to one slug or an
        # account never finds its terminal.
        assert canonical_slug("moneta") == "moneta_markets"
        assert canonical_slug("fusion") == "fusion_markets"

    def test_is_case_and_separator_insensitive(self):
        assert canonical_slug("Fusion-Markets") == "fusion_markets"
        assert canonical_slug("  EXNESS  ") == "exness"

    def test_unknown_and_empty_resolve_to_nothing(self):
        assert canonical_slug("pepperstone") is None
        assert canonical_slug("") is None
        assert canonical_slug(None) is None


class TestSlugForFolder:
    def test_matches_the_installers_own_folder_names(self):
        assert slug_for_folder("MetaTrader 5 EXNESS") == "exness"
        assert slug_for_folder("FTMO Global Markets MT5 Terminal") == "ftmo"
        assert slug_for_folder("Moneta Markets MT5 Terminal") == "moneta_markets"
        assert slug_for_folder("Fusion Markets MetaTrader 5") == "fusion_markets"

    def test_matches_the_clone_convention(self):
        assert slug_for_folder("exness-1") == "exness"
        assert slug_for_folder("ftmo-5") == "ftmo"

    def test_unrelated_folders_match_nothing(self):
        assert slug_for_folder("MetaTrader 5") is None
        assert slug_for_folder("") is None


class TestClaimFreeTerminal:
    def setup_method(self):
        self.terminals = [
            t(r"C:\MT5\exness-1\terminal64.exe", "exness"),
            t(r"C:\MT5\exness-2\terminal64.exe", "exness"),
            t(r"C:\MT5\ftmo-1\terminal64.exe", "ftmo"),
        ]

    def test_claims_the_first_free_match(self):
        assert claim_free_terminal(self.terminals, "exness", []) == r"C:\MT5\exness-1\terminal64.exe"

    def test_skips_one_another_account_holds(self):
        got = claim_free_terminal(self.terminals, "exness", [r"C:\MT5\exness-1\terminal64.exe"])
        assert got == r"C:\MT5\exness-2\terminal64.exe"

    def test_never_returns_a_terminal_for_a_different_broker(self):
        # The heart of it: an FTMO account driven through the Exness build fails
        # to log in with an error that reads exactly like a wrong password.
        assert claim_free_terminal(self.terminals, "ftmo", [r"C:\MT5\ftmo-1\terminal64.exe"]) is None

    def test_returns_none_when_every_match_is_taken(self):
        taken = [r"C:\MT5\exness-1\terminal64.exe", r"C:\MT5\exness-2\terminal64.exe"]
        assert claim_free_terminal(self.terminals, "exness", taken) is None

    def test_taken_comparison_ignores_case_and_separators(self):
        # Windows paths arrive spelled inconsistently -- from the database, from
        # a scan, from something a user typed. A mismatch here would hand the
        # same terminal to two accounts, which is the whole failure being
        # designed out.
        taken = ["c:/mt5/exness-1/TERMINAL64.EXE"]
        assert claim_free_terminal(self.terminals, "exness", taken) == r"C:\MT5\exness-2\terminal64.exe"

    def test_an_unknown_broker_claims_nothing(self):
        assert claim_free_terminal(self.terminals, "pepperstone", []) is None
        assert claim_free_terminal(self.terminals, None, []) is None

    def test_ignores_empty_entries_in_taken(self):
        got = claim_free_terminal(self.terminals, "exness", [None, "", "  "])
        assert got == r"C:\MT5\exness-1\terminal64.exe"


class TestCapacityFor:
    def setup_method(self):
        self.terminals = [
            t(r"C:\MT5\exness-1\terminal64.exe", "exness"),
            t(r"C:\MT5\exness-2\terminal64.exe", "exness"),
            t(r"C:\MT5\ftmo-1\terminal64.exe", "ftmo"),
        ]

    def test_reports_used_and_total_for_the_broker_only(self):
        taken = [r"C:\MT5\exness-1\terminal64.exe", r"C:\MT5\ftmo-1\terminal64.exe"]
        assert capacity_for(self.terminals, "exness", taken) == (1, 2)

    def test_zero_total_when_the_broker_has_no_install(self):
        assert capacity_for(self.terminals, "moneta_markets", []) == (0, 0)

    def test_unknown_broker_reports_nothing(self):
        assert capacity_for(self.terminals, "pepperstone", []) == (0, 0)


class TestDiscoverTerminals:
    def test_finds_terminals_one_level_down_and_tags_the_broker(self, tmp_path):
        for folder in ("exness-1", "ftmo-2", "not-a-terminal"):
            d = tmp_path / folder
            d.mkdir()
            if folder != "not-a-terminal":
                (d / "terminal64.exe").write_text("")

        found = discover_terminals([str(tmp_path)])
        by_folder = {f.folder: f.broker_slug for f in found}

        assert by_folder == {"exness-1": "exness", "ftmo-2": "ftmo"}

    def test_a_missing_root_is_skipped_not_fatal(self, tmp_path):
        d = tmp_path / "exness-1"
        d.mkdir()
        (d / "terminal64.exe").write_text("")

        found = discover_terminals([str(tmp_path / "nope"), str(tmp_path)])
        assert [f.folder for f in found] == ["exness-1"]

    def test_the_same_terminal_via_two_roots_is_listed_once(self, tmp_path):
        d = tmp_path / "exness-1"
        d.mkdir()
        (d / "terminal64.exe").write_text("")

        found = discover_terminals([str(tmp_path), str(tmp_path)])
        assert len(found) == 1
