"""
Periodic journalling of closed positions to the dashboard.

Sits alongside balance_sync and is throttled the same way, for the same reason:
these are background reconciliations, not part of the copy path. Nothing here
may slow down a copy -- the reads are local terminal IPC with no broker round
trip, and the whole pass is skipped for any account that has no dashboard
account linked.
"""

from __future__ import annotations

import os
import time
from typing import TYPE_CHECKING, Optional

import structlog

from engine.config_loader import AccountConfig
from engine.platform_capabilities import is_mt5
from engine.trade_sync import parse_mark, sync_account

if TYPE_CHECKING:
    from engine.account_session import AccountSession

logger = structlog.get_logger()

_last_sync: float = 0.0

# Where each account's read got to, within this process. Seeded from the
# gateway's stored mark on the first pass and advanced locally after that, so a
# config reload between passes cannot rewind it to a stale value.
_marks: dict[str, str] = {}

# Which account to journal next. See the note in sync_all_trades.
_cursor: int = 0


def should_sync_trades() -> bool:
    global _last_sync
    interval = int(os.environ.get("WORKER_TRADE_SYNC_SECONDS", "120"))
    now = time.time()
    if now - _last_sync < interval:
        return False
    _last_sync = now
    return True


def reset_state() -> None:
    """Forget the throttle, the marks and the cursor. For tests."""
    global _last_sync, _cursor
    _last_sync = 0.0
    _cursor = 0
    _marks.clear()


def journallable(accounts: list[AccountConfig]) -> list[AccountConfig]:
    """Accounts worth reading history for, in a stable order.

    Sorted by id so the round-robin cursor keeps its meaning across config
    reloads -- the API does not promise an order, and a list that reshuffles
    would let one account be read twice while another was never reached.
    """
    return sorted(
        (
            a for a in accounts
            # No dashboard account linked means nothing to journal against, so
            # the history read is skipped rather than done and discarded.
            if a.enabled and is_mt5(a.platform) and a.journal_account_id
        ),
        key=lambda a: a.id,
    )


def sync_all_trades(
    accounts: list[AccountConfig],
    sessions: dict[str, "AccountSession"],
) -> int:
    """Journal ONE linked account's finished positions. Returns trades written.

    One per pass, round-robin, rather than all of them -- which is why this is
    not called sync_every_account.

    Reading an account's history requires the process to be attached to that
    account, and ``session.connect()`` gets there through the terminal manager,
    which re-initialises MetaTrader against a different terminal and logs in.
    That is the same switch that shows up as ``switch_ms`` on a copy, and doing
    six of them every couple of minutes would spend real time on a background
    reconciliation.

    So each pass advances one account. Six accounts on a 120s interval means
    each is journalled every twelve minutes, which is the right trade for
    something feeding a journal rather than a trading decision. Set
    WORKER_TRADE_SYNC_SECONDS lower to tighten it.
    """
    global _cursor
    from engine.api_client import get_api_client

    client = get_api_client()
    if not client.enabled or not client.user_id:
        return 0

    candidates = journallable(accounts)
    if not candidates:
        return 0

    acc = candidates[_cursor % len(candidates)]
    _cursor = (_cursor + 1) % len(candidates)

    try:
        return _sync_one(acc, sessions.get(acc.id))
    except Exception as exc:
        # Never fatal. A journal that falls behind catches up on the next pass;
        # a worker that stops copying because a history read failed is not what
        # anyone connected it for.
        logger.warning("trade_journal_failed", account=acc.id, error=str(exc))
        return 0


def _sync_one(acc: AccountConfig, session: Optional["AccountSession"]) -> int:
    from engine.api_client import get_api_client

    if session is None:
        return 0
    if not session.connect():
        return 0

    mark = parse_mark(_marks.get(acc.id) or acc.history_synced_to)
    result = sync_account(session.connector, acc.id, mark)

    # An unreadable window yields no mark. Posting nothing and leaving the mark
    # where it is, is the whole point: the next pass re-reads the same window
    # rather than stepping over trades nobody managed to look at.
    if result.synced_to is None:
        return 0

    synced_to = result.synced_to.isoformat()
    # Posted even with no trades, so the stored mark still advances -- otherwise
    # a quiet account's window grows by the length of every quiet stretch, and
    # Monday morning re-reads the whole weekend.
    response = get_api_client().post_closed_trades(
        acc.id, [t.to_payload() for t in result.trades], synced_to
    )

    if response.get("linked") is False:
        # Unlinked between the config reload and now. The mark is left alone so
        # re-linking still picks these trades up.
        logger.info("trade_journal_not_linked", account=acc.id)
        return 0

    _marks[acc.id] = synced_to

    written = int(response.get("written") or 0)
    if written:
        logger.info(
            "trade_journal_written",
            account=acc.id,
            label=acc.label,
            trades=written,
            skipped=int(response.get("skipped") or 0),
        )
    return written
