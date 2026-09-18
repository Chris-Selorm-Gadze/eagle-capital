"""
Keeping the journal in step with what the terminals actually did.

Every account the worker drives reports its finished positions, so the dashboard
is built from broker fills rather than from anything typed in. This is the piece
the parked broker-sync service used to do against MetaApi's cloud terminals; it
now runs against the local ones, which already have the data.

The read is deliberately a re-read rather than a stream. Deal history is
authoritative and immutable, so re-reading a window is safe, and being safe to
repeat is what makes this survive a worker restart, a lost network, or a
terminal that was closed mid-session. Duplicate suppression is the
``external_id`` unique index, not care taken here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Protocol

import structlog

from engine.trade_history import ClosedTrade, closing_position_tickets, trade_from_deals

logger = structlog.get_logger()

# How far back to look the first time an account is synced. Long enough to pick
# up a weekend's trading, short enough that a brand new account does not pull in
# months of history nobody asked to journal.
DEFAULT_LOOKBACK_HOURS = 72

# Every window is re-read this far back. A deal can land in history a moment
# after a read, and a broker's clock is not the worker's. Re-reading is free
# because the external_id index makes a repeat a no-op.
DEFAULT_OVERLAP_SECONDS = 300


class HistoryReader(Protocol):
    """The part of MT5Connector this needs. Kept narrow so tests can stub it."""

    def history_deals_window(
        self, start: datetime, end: datetime
    ) -> Optional[list[dict[str, Any]]]: ...

    def history_deals_for_position(self, position_ticket: int) -> list[dict[str, Any]]: ...


@dataclass
class SyncResult:
    """What one account's sync found, and where to resume.

    ``synced_to`` is None when the read could not be trusted -- the caller must
    then leave the stored high-water mark alone rather than skipping the window.
    """

    trades: list[ClosedTrade]
    synced_to: Optional[datetime]
    positions_seen: int = 0


def window_for(
    synced_to: Optional[datetime],
    now: datetime,
    *,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    overlap_seconds: int = DEFAULT_OVERLAP_SECONDS,
) -> tuple[datetime, datetime]:
    """The slice of deal history to read.

    From the stored mark, pulled back by the overlap; or from the lookback when
    there is no mark yet. The end is always *now* rather than the mark plus a
    fixed step, so a worker that was off for a week catches up in one read
    instead of one cycle per step.
    """
    end = now
    if synced_to is None:
        return (end - timedelta(hours=lookback_hours), end)
    start = synced_to - timedelta(seconds=overlap_seconds)
    # A mark somehow ahead of now (clock change, a bad value in the database)
    # would otherwise produce an inverted window that silently returns nothing.
    if start >= end:
        start = end - timedelta(seconds=overlap_seconds)
    return (start, end)


def next_mark(
    synced_to: Optional[datetime],
    now: datetime,
    *,
    overlap_seconds: int = DEFAULT_OVERLAP_SECONDS,
) -> datetime:
    """Where the next read should resume from after a successful one.

    ``now`` minus the overlap, never going backwards. Deliberately not "the
    latest close seen": with no closes at all that would never advance, and the
    window would grow without bound.
    """
    candidate = now - timedelta(seconds=overlap_seconds)
    if synced_to is not None and synced_to > candidate:
        return synced_to
    return candidate


def sync_account(
    reader: HistoryReader,
    trading_account_id: str,
    synced_to: Optional[datetime] = None,
    *,
    now: Optional[datetime] = None,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    overlap_seconds: int = DEFAULT_OVERLAP_SECONDS,
) -> SyncResult:
    """Finished positions for one account, and the mark to store.

    Two phases, for the reason given in ``closing_position_tickets``: the window
    says which positions closed, then each of those is read whole so its opening
    deal is included however long ago it happened.
    """
    moment = now or datetime.now(timezone.utc)
    start, end = window_for(
        synced_to, moment, lookback_hours=lookback_hours, overlap_seconds=overlap_seconds
    )

    deals = reader.history_deals_window(start, end)
    if deals is None:
        # Could not read, as distinct from nothing to read. Leaving synced_to as
        # None tells the caller not to advance -- advancing here would step over
        # a window that was never actually examined.
        logger.debug(
            "trade_sync_window_unreadable",
            account=trading_account_id,
            start=start.isoformat(),
            end=end.isoformat(),
        )
        return SyncResult(trades=[], synced_to=None)

    tickets = closing_position_tickets(deals)
    trades: list[ClosedTrade] = []
    for ticket in tickets:
        position_deals = reader.history_deals_for_position(ticket)
        if not position_deals:
            # Refusing to build a trade from the window's closing deal alone:
            # it has no entry price. Not advancing past it either -- the overlap
            # means the next cycle sees this position again.
            logger.debug(
                "trade_sync_position_unreadable",
                account=trading_account_id,
                position=ticket,
            )
            continue
        trade = trade_from_deals(position_deals, trading_account_id)
        if trade is not None:
            trades.append(trade)

    trades.sort(key=lambda t: t.exit_time)

    if trades:
        logger.info(
            "trade_sync_found",
            account=trading_account_id,
            trades=len(trades),
            pnl=round(sum(t.pnl for t in trades), 2),
        )

    return SyncResult(
        trades=trades,
        synced_to=next_mark(synced_to, moment, overlap_seconds=overlap_seconds),
        positions_seen=len(tickets),
    )


def parse_mark(value: Any) -> Optional[datetime]:
    """Read a high-water mark back out of the API's JSON.

    Postgres hands back '2026-09-17T12:00:00+00:00' and sometimes a trailing
    'Z', which fromisoformat rejected before Python 3.11. Anything unparseable
    becomes None, which means "start from the lookback" -- a slow first read
    rather than a crash in the sync loop.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        text = str(value).strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
    except ValueError:
        logger.warning("trade_sync_bad_mark", value=str(value))
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
