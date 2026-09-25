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
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Iterable, Optional

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

# Positions already journalled as fully closed, per account, in this process.
# The read window is deliberately generous (see trade_sync.server_window), so
# without this every pass would re-read and re-post hours of finished trades.
# A partial close is never added: it has to be re-read when the rest closes.
_journalled: dict[str, set[int]] = {}
_JOURNALLED_CAP = 5000

# When each account's mark last reached the gateway. A pass that found nothing
# only posts to move the stored mark along, and that does not need doing every
# ten seconds: a stored mark a few minutes stale just means a restart re-reads
# a few minutes more. Every post is an Edge Function invocation.
_mark_posted_at: dict[str, float] = {}

# One-time repair of trades journalled in the broker's clock.
#
# Until the worker measured each broker's UTC offset (mt5_connector
# server_time_offset), every trade it journalled carried MT5's server-time
# stamps -- two or three hours late on most brokers. Journalling only reads
# forward from the stored mark, so those rows were never looked at again: a
# Friday-evening close stayed filed on Saturday, and evening trades on the next
# day. The first read of each account by this version therefore reaches back
# REPAIR_DAYS and re-posts every position; the gateway upserts on external_id,
# so each row's times are corrected in place and nothing is duplicated. A file
# per account records that it is done, so it happens once per account per
# machine, and survives restarts.
_REPAIR_DIR = Path(__file__).resolve().parent.parent / "logs" / "journal-time-repair"


def _repair_days() -> int:
    return int(os.environ.get("WORKER_JOURNAL_REPAIR_DAYS", "45"))


def _repair_pending(account_id: str) -> bool:
    return _repair_days() > 0 and not (_REPAIR_DIR / account_id).exists()


def _repair_done(account_id: str) -> None:
    try:
        _REPAIR_DIR.mkdir(parents=True, exist_ok=True)
        (_REPAIR_DIR / account_id).touch()
    except OSError as exc:
        # Worst case the repair runs again next start, which is harmless.
        logger.warning("journal_repair_marker_failed", account=account_id, error=str(exc))


def _resume_mark(acc: AccountConfig) -> Optional[str]:
    """Where this account's next read starts.

    This process's own progress first; then, for an account not yet repaired,
    far enough back to rewrite every trade journalled in the broker's clock;
    otherwise the mark stored on the account.
    """
    if acc.id in _marks:
        return _marks[acc.id]
    if _repair_pending(acc.id):
        start = datetime.now(timezone.utc) - timedelta(days=_repair_days())
        logger.info("journal_time_repair", account=acc.id, days=_repair_days())
        return start.isoformat()
    return acc.history_synced_to


_pooled_thread: Optional[threading.Thread] = None
_pooled_lock = threading.Lock()


def _interval() -> float:
    # The steady beat. A close the copier handled itself does not wait for it
    # -- see request_trade_sync.
    return float(os.environ.get("WORKER_TRADE_SYNC_SECONDS", "10"))


def _mark_post_interval() -> float:
    return float(os.environ.get("WORKER_TRADE_MARK_POST_SECONDS", "300"))


def should_sync_trades() -> bool:
    global _last_sync
    now = time.time()
    if now - _last_sync < _interval():
        return False
    _last_sync = now
    return True


def request_trade_sync(delay_seconds: float = 1.5) -> None:
    """Journal again in ``delay_seconds``, instead of at the next beat.

    Called when the worker knows a position has just closed -- it copied the
    close, or it placed it on a command from the app. Without this a close
    waited for the next scheduled pass, and the dashboard's P&L lagged the
    Live Trading page by that much every time. The delay lets the closing deal
    land in the terminal's history before it is read.
    """
    global _last_sync
    target = time.time() - _interval() + max(0.0, delay_seconds)
    # Only ever brings the next pass forward, never pushes it back.
    if target < _last_sync:
        _last_sync = target


def reset_state() -> None:
    """Forget the throttle, the marks and the cursor. For tests."""
    global _last_sync, _cursor, _pooled_thread
    _last_sync = 0.0
    _cursor = 0
    _marks.clear()
    _journalled.clear()
    _mark_posted_at.clear()
    _pooled_thread = None


def _known_tickets(account_id: str) -> list[int]:
    return sorted(_journalled.get(account_id, ()))


def _remember(account_id: str, tickets: Iterable[int]) -> None:
    known = _journalled.setdefault(account_id, set())
    known.update(int(t) for t in tickets if t)
    if len(known) > _JOURNALLED_CAP:
        # Drop the oldest tickets; MT5 tickets increase over time. Anything
        # forgotten is only re-read, and the gateway's upsert absorbs a repeat.
        for ticket in sorted(known)[: len(known) - _JOURNALLED_CAP]:
            known.discard(ticket)


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
    *,
    background: bool = False,
) -> int:
    """Journal linked accounts' finished positions. Returns trades written.

    Accounts the terminal pool can route are all read at once, each in the
    subprocess that already owns its terminal and holds a warm session, so the
    read costs no switch. With ``background`` that whole batch runs on its own
    thread: waiting on it here held the copy loop for as long as the slowest
    read (up to the 30s deadline), and a master that is not being polled is a
    master whose trades are not being copied.

    Anything unrouted is read in THIS process, because reading history means
    the process's own MT5 attach. A master is read every pass -- the copy loop
    keeps it attached, so its read costs no switch. Anything else unrouted
    still goes one per pass, round-robin, for the original reason: reading it
    means re-attaching MetaTrader to another account, the same switch that
    shows up as ``switch_ms`` on a copy.
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
    if background:
        _sync_pooled_in_background(pooled, pool)
        written = 0
    else:
        written = _sync_pooled(pooled, pool)

    if not unrouted:
        return written

    attached = [a for a in unrouted if a.role == "master"]
    rotating = [a for a in unrouted if a.role != "master"]
    batch = list(attached)
    if rotating:
        batch.append(rotating[_cursor % len(rotating)])
        _cursor = (_cursor + 1) % len(rotating)

    for acc in batch:
        try:
            written += _sync_one(acc, sessions.get(acc.id))
        except Exception as exc:
            # Never fatal. A journal that falls behind catches up on the next
            # pass; a worker that stops copying because a history read failed
            # is not what anyone connected it for.
            logger.warning("trade_journal_failed", account=acc.id, error=str(exc))
    return written


def _sync_pooled_in_background(accounts: list[AccountConfig], pool: Optional[object]) -> bool:
    """Run _sync_pooled off the copy loop's thread, one batch at a time.

    Safe off-thread for the same reason the position sweep is: every read
    happens in a pool subprocess with its own MT5 attach, so nothing here
    touches the attach the copy loop is using. A batch still running when the
    next is due is left to finish rather than doubled up behind it.
    """
    global _pooled_thread
    if not accounts or pool is None:
        return False
    with _pooled_lock:
        if _pooled_thread is not None and _pooled_thread.is_alive():
            return False

        def run() -> None:
            try:
                _sync_pooled(accounts, pool)
            except Exception as exc:
                logger.warning("trade_journal_pooled_failed", error=str(exc))

        _pooled_thread = threading.Thread(target=run, name="trade-journal", daemon=True)
        _pooled_thread.start()
        return True


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
        "synced_to": _resume_mark(acc),
        "skip_tickets": _known_tickets(acc.id),
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
            result.get("complete_tickets") or [],
        )
    return written


def _post_result(
    account_id: str,
    label: str,
    synced_to: Optional[str],
    payloads: list[dict],
    complete_tickets: Iterable[int] = (),
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
    # Monday morning re-reads the whole weekend. Not on every pass, though: the
    # local mark carries this process, and the stored one only has to be
    # recent enough for a restart.
    if not payloads:
        last = _mark_posted_at.get(account_id)
        if last is not None and time.time() - last < _mark_post_interval():
            _marks[account_id] = synced_to
            return 0

    response = get_api_client().post_closed_trades(account_id, payloads, synced_to)

    if response.get("linked") is False:
        # Unlinked between the config reload and now. The mark is left alone so
        # re-linking still picks these trades up.
        logger.info("trade_journal_not_linked", account=account_id)
        return 0

    _marks[account_id] = synced_to
    _mark_posted_at[account_id] = time.time()
    _remember(account_id, complete_tickets)
    # Any successful post from this version began at the repair mark, because
    # _resume_mark hands it out until _marks holds this account.
    if _repair_pending(account_id):
        _repair_done(account_id)

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

    mark = parse_mark(_resume_mark(acc))
    result = sync_account(
        session.connector, acc.id, mark, skip_tickets=_known_tickets(acc.id)
    )

    return _post_result(
        acc.id,
        acc.label,
        result.synced_to.isoformat() if result.synced_to else None,
        [t.to_payload() for t in result.trades],
        result.complete_tickets,
    )
