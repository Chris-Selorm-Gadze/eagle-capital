"""
Which MT5 installs exist on this machine, and which one an account should use.

A terminal path is worker infrastructure. Asking a trader to type
``C:\\MT5\\exness-3\\terminal64.exe`` leaks the machine into the product, and
getting it wrong fails the login with an error indistinguishable from a wrong
password. So the user picks a broker and the worker picks the terminal.

Assignment must hold three properties:

* **Exclusive** -- two accounts on one terminal is the problem being solved. MT5
  allows one login per terminal instance, so sharing means their copies queue,
  and a master sharing with its follower means they race for that single login.
* **Stable** -- an account keeps its terminal. Reassigning resets the warm
  session and makes MT5 re-download history, so the choice is persisted in the
  database on first connect, never recomputed.
* **Per-worker** -- ``C:\\MT5\\exness-3`` means nothing on another machine.

Everything except :func:`discover_terminals` is a pure function of its inputs,
so the selection logic is testable without Windows or MetaTrader.
"""

from __future__ import annotations

import ntpath
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

import structlog

logger = structlog.get_logger()

TERMINAL_EXE = "terminal64.exe"

# Canonical slugs, matching src/features/copier/brokerPresets.ts. Keep the two in
# step: the dialog writes these into trading_accounts.broker_slug and this is
# what reads them back.
#
# Each entry lists the fragments that identify the broker in a folder name. That
# covers both naming schemes in play: the installer's own
# ("MetaTrader 5 EXNESS", "FTMO Global Markets MT5 Terminal") and the clone
# convention from clone-terminals.ps1 ("exness-1", "ftmo-3").
_BROKER_FRAGMENTS: dict[str, tuple[str, ...]] = {
    "moneta_markets": ("moneta",),
    "ftmo": ("ftmo",),
    "exness": ("exness",),
    "fusion_markets": ("fusion",),
}

# Short names the clone script uses, and any other spelling worth accepting.
_SLUG_ALIASES: dict[str, str] = {
    "moneta": "moneta_markets",
    "monetamarkets": "moneta_markets",
    "moneta_markets": "moneta_markets",
    "ftmo": "ftmo",
    "exness": "exness",
    "fusion": "fusion_markets",
    "fusionmarkets": "fusion_markets",
    "fusion_markets": "fusion_markets",
}


@dataclass(frozen=True)
class TerminalInfo:
    """One MT5 install this worker can drive."""

    path: str
    broker_slug: Optional[str]
    folder: str


def canonical_slug(value: Optional[str]) -> Optional[str]:
    """Normalise a broker slug. Returns None when it names no known broker."""
    if not value:
        return None
    key = value.strip().lower().replace("-", "_").replace(" ", "_")
    if key in _SLUG_ALIASES:
        return _SLUG_ALIASES[key]
    # Fall back to fragment matching so an unfamiliar spelling still resolves.
    for slug, fragments in _BROKER_FRAGMENTS.items():
        if any(f in key for f in fragments):
            return slug
    return None


def slug_for_folder(folder_name: str) -> Optional[str]:
    """Which broker a terminal folder belongs to, by name.

    A convention, not proof -- the folder could contain anything. The login is
    the real verification, which is why a bad guess surfaces as a failed test
    rather than a silently wrong terminal.
    """
    if not folder_name:
        return None
    name = folder_name.strip().lower()
    for slug, fragments in _BROKER_FRAGMENTS.items():
        if any(f in name for f in fragments):
            return slug
    return None


def default_roots() -> list[str]:
    """Where to look for MT5 installs.

    ``WORKER_TERMINAL_ROOTS`` overrides, semicolon-separated, for a machine that
    keeps them somewhere else.
    """
    override = os.environ.get("WORKER_TERMINAL_ROOTS", "").strip()
    if override:
        return [p.strip() for p in override.split(";") if p.strip()]
    return [
        r"C:\MT5",
        r"C:\Program Files",
        r"C:\Program Files (x86)",
    ]


def discover_terminals(roots: Optional[Iterable[str]] = None) -> list[TerminalInfo]:
    """Every terminal64.exe one level below the given roots.

    One level only, deliberately: a full recursive walk of Program Files is slow
    and would pick up unrelated bundled terminals.
    """
    found: list[TerminalInfo] = []
    seen: set[str] = set()

    for root in roots if roots is not None else default_roots():
        try:
            base = Path(root)
            if not base.is_dir():
                continue
            for child in sorted(base.iterdir()):
                if not child.is_dir():
                    continue
                exe = child / TERMINAL_EXE
                if not exe.is_file():
                    continue
                key = _norm(str(exe))
                if key in seen:
                    continue
                seen.add(key)
                found.append(
                    TerminalInfo(
                        path=str(exe),
                        broker_slug=slug_for_folder(child.name),
                        folder=child.name,
                    )
                )
        except OSError as exc:
            # An unreadable root is not fatal -- the others may still yield a
            # terminal, and a permissions problem on Program Files (x86) should
            # not stop an account connecting.
            logger.debug("terminal_scan_root_failed", root=str(root), error=str(exc))

    return found


def _norm(path: Optional[str]) -> str:
    """Compare two spellings of the same Windows path.

    ``ntpath`` rather than ``os.path`` deliberately. These are always Windows
    paths -- MT5 runs nowhere else -- but ``os.path.normcase`` is a no-op off
    Windows, so on any other host ``C:\\MT5\\x`` and ``c:/mt5/x`` would compare
    unequal. Two accounts would then be handed the same terminal, which is the
    exact failure this module exists to prevent. ntpath applies Windows rules
    everywhere, which also makes the logic testable off Windows.
    """
    if not path:
        return ""
    return ntpath.normcase(ntpath.normpath(path.strip()))


def claim_free_terminal(
    terminals: Iterable[TerminalInfo],
    broker_slug: Optional[str],
    taken_paths: Iterable[Optional[str]],
) -> Optional[str]:
    """Pick a terminal for this broker that no other account holds.

    Returns the path, or None when every matching terminal is taken -- which is
    the honest "this worker is full for that broker" answer, not an error.
    """
    slug = canonical_slug(broker_slug)
    if slug is None:
        return None

    taken = {_norm(p) for p in taken_paths if p}
    for terminal in terminals:
        if terminal.broker_slug != slug:
            continue
        if _norm(terminal.path) in taken:
            continue
        return terminal.path
    return None


def capacity_for(
    terminals: Iterable[TerminalInfo],
    broker_slug: Optional[str],
    taken_paths: Iterable[Optional[str]],
) -> tuple[int, int]:
    """(in use, total) terminals for a broker, for a human-readable message."""
    slug = canonical_slug(broker_slug)
    if slug is None:
        return (0, 0)
    matching = [t for t in terminals if t.broker_slug == slug]
    taken = {_norm(p) for p in taken_paths if p}
    used = sum(1 for t in matching if _norm(t.path) in taken)
    return (used, len(matching))
