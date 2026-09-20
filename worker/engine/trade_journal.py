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
    # 120s was the right beat when every account cost a terminal switch in this
    # process and only one was read per pass. Routed accounts are now read in
    # parallel on their own terminals, so the interval is what decides how long
    # a closed trade waits to reach the dashboard, and nothing else.
    interval = int(os.environ.get("WORKER_TRADE_SYNC_SECONDS", "20"))
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
    pool: Optional[object] = None,
) -> int:
    """Journal linked accounts' finished positions. Returns trades written.

    Accounts the terminal pool can route are all read at once, each in the
    subprocess that already owns its terminal and holds a warm session, so the
    read costs no switch.

    Anything unrouted still goes one per pass, round-robin, for the original
    reason: reading history in THIS process means re-attaching MetaTrader to
    another terminal and logging in -- the same switch that shows up as
    ``switch_ms`` on a copy. Doing six of those every couple of minutes would
    spend real time on a background reconciliation.

    That rotation used to apply to everything, and it was slow in a way that
    mattered: seven accounts on a 120s interval meant a closed trade could take
    fourteen minutes to reach the dashboard. Give every account a terminal path
    and none of them pays that any more.
    """
    global _cursor
    from engine.api_client import get_api_client

    client = get_api_client()
    if not client.enabled or not client.user_id:
        return 0

    candidates = journallable(accounts)
    if not candidates:
        return 0

    pooled, unrouted = split_by_pool(candidates, pool)
    written = _sync_pooled(pooled, pool)

    if not unrouted:
        return written

    acc = unrouted[_cursor % len(unrouted)]
    _cursor = (_cursor + 1) % len(unrouted)

    try:
        return written + _sync_one(acc, sessions.get(acc.id))
    except Exception as exc:
        # Never fatal. A journal that falls behind catches up on the next pass;
        # a worker that stops copying because a history read failed is not what
        # anyone connected it for.
        logger.warning("trade_journal_failed", account=acc.id, error=str(exc))
        return written


def split_by_pool(
    accounts: list[AccountConfig], pool: Optional[object]
) -> tuple[list[AccountConfig], list[AccountConfig]]:
    """(read in parallel through the pool, read one-per-pass in this process)."""
    if pool is None:
        return [], list(accounts)
    pooled: list[AccountConfig] = []
    unrouted: list[AccountConfig] = []
    for acc in accounts:
        try:
            routed = bool(pool.has(acc.id))  # type: ignore[attr-defined]
        except Exception:
            routed = False
        (pooled if routed else unrouted).append(acc)
    return pooled, unrouted


def _journal_job(acc: AccountConfig) -> dict:
    return {
        "terminal_path": acc.terminal_path,
        "synced_to": _marks.get(acc.id) or acc.history_synced_to,
        "account": {
            "id": acc.id,
            "label": acc.label,
            "role": acc.role,
            "login": str(acc.login),
            "password": acc.password,
            "server": acc.server,
            "platform": acc.platform,
            "terminal_path": acc.terminal_path,
        },
    }


def _sync_pooled(accounts: list[AccountConfig], pool: Optional[object]) -> int:
    """Read every routed account's history at once, then post what came back.

    All submitted before any is waited on, so accounts on separate terminals
    are read concurrently. A read that fails or runs past the deadline simply
    does not advance that account's mark, so the next pass covers the same
    window again.
    """
    if not accounts or pool is None:
        return 0

    deadline_s = float(os.environ.get("WORKER_JOURNAL_DEADLINE_SECONDS", "30"))
    labels = {a.id: a.label for a in accounts}

    pending = {}
    for acc in accounts:
        try:
            future = pool.submit_journal(acc.id, _journal_job(acc))  # type: ignore[attr-defined]
        except Exception as exc:
            logger.debug("trade_journal_submit_failed", account=acc.id, error=str(exc))
            continue
        if future is not None:
            pending[acc.id] = future

    deadline = time.monotonic() + deadline_s
    written = 0
    for account_id, future in pending.items():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            logger.debug("trade_journal_deadline", account=account_id)
            continue
        try:
            result = future.result(timeout=remaining)
        except Exception as exc:
            logger.warning("trade_journal_read_failed", account=account_id, error=str(exc))
            continue
        if not isinstance(result, dict) or not result.get("ok"):
            logger.debug("trade_journal_unreadable", account=account_id,
                         error=(result or {}).get("error") if isinstance(result, dict) else None)
            continue
        written += _post_result(
            account_id,
            labels.get(account_id, ""),
            result.get("synced_to"),
            result.get("trades") or [],
        )
    return written


def _post_result(
    account_id: str,
    label: str,
    synced_to: Optional[str],
    payloads: list[dict],
) -> int:
    """Hand one account's finished positions to the gateway and advance its mark.

    Shared by both read paths so they cannot disagree about what a missing mark
    means, or about when the mark is safe to move.
    """
    from engine.api_client import get_api_client

    # An unreadable window yields no mark. Posting nothing and leaving the mark
    # where it is, is the whole point: the next pass re-reads the same window
    # rather than stepping over trades nobody managed to look at.
    if not synced_to:
        return 0

    # Posted even with no trades, so the stored mark still advances -- otherwise
    # a quiet account's window grows by the length of every quiet stretch, and
    # Monday morning re-reads the whole weekend.
    response = get_api_client().post_closed_trades(account_id, payloads, synced_to)

    if response.get("linked") is False:
        # Unlinked between the config reload and now. The mark is left alone so
        # re-linking still picks these trades up.
        logger.info("trade_journal_not_linked", account=account_id)
        return 0

    _marks[account_id] = synced_to

    written = int(response.get("written") or 0)
    if written:
        logger.info(
            "trade_journal_written",
            account=account_id,
            label=label,
            trades=written,
            skipped=int(response.get("skipped") or 0),
        )
    return written


def _sync_one(acc: AccountConfig, session: Optional["AccountSession"]) -> int:
    if session is None:
        return 0
    if not session.connect():
        return 0

    mark = parse_mark(_marks.get(acc.id) or acc.history_synced_to)
    result = sync_account(session.connector, acc.id, mark)

    return _post_result(
        acc.id,
        acc.label,
        result.synced_to.isoformat() if result.synced_to else None,
        [t.to_payload() for t in result.trades],
    )
