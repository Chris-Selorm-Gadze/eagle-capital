"""
Closed MT5 positions, as journal trades.

The dashboard reads `trades`; the copier writes `execution_events`. An execution
event records that a copy was *attempted* -- symbol, side, lot, latency -- and
carries no prices and no profit, so it can never become a trade. This module
reads the other side of the same activity: MT5's own deal history, which is the
broker's authoritative record of what actually filled and what it made.

Two decisions worth stating.

**Sourced from deal history, not from the copy path.** Hooking the close in
follower_executor would only ever see positions the copier itself closed. Deal
history sees everything -- the master's own trades, a position the trader closed
by hand on the terminal, a stop-out, and anything that happened while the worker
was down. It is also idempotent by construction: re-reading a window produces
the same trades, keyed by position ticket.

**Profit comes from the broker, never from the prices.** Computing
``(exit - entry) * qty`` assumes one unit of volume is worth one currency unit
per point, which is false for index CFDs, metals and crypto. MT5 reports the
realised figure and it is passed through untouched. src/db/trades.ts carries the
same warning on the CSV import path.

Everything here is a pure function of deal dicts, so the conversion is testable
without Windows or MetaTrader.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

import structlog

logger = structlog.get_logger()

# MetaTrader deal constants, spelled out rather than imported. The MetaTrader5
# module is Windows-only and is None everywhere else, so importing them would
# make this module -- and every test of it -- unloadable off Windows.
DEAL_TYPE_BUY = 0
DEAL_TYPE_SELL = 1

DEAL_ENTRY_IN = 0
DEAL_ENTRY_OUT = 1
DEAL_ENTRY_INOUT = 2
DEAL_ENTRY_OUT_BY = 3

# Deals that closed volume. OUT_BY is a close-by-opposite-position, which is
# still a close and still carries the profit.
_CLOSING_ENTRIES = (DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY)


@dataclass
class ClosedTrade:
    """One finished position, in the shape the gateway writes to `trades`."""

    external_id: str
    symbol: str
    side: str
    qty: float
    entry_price: float
    exit_price: float
    entry_time: str
    exit_time: str
    pnl: float
    fees: float
    position_ticket: int
    magic: int = 0
    tags: list[str] = field(default_factory=list)
    # False while the position still has volume open -- a partial close. Such a
    # trade is journalled (the realised part is real) but must be re-read and
    # re-posted when the rest closes, so it is never treated as finished.
    complete: bool = True

    def to_payload(self) -> dict[str, Any]:
        return {
            "external_id": self.external_id,
            "symbol": self.symbol,
            "side": self.side,
            "qty": self.qty,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "entry_time": self.entry_time,
            "exit_time": self.exit_time,
            "pnl": self.pnl,
            "fees": self.fees,
            "position_ticket": self.position_ticket,
            "magic": self.magic,
            "tags": self.tags,
        }


def external_id_for(trading_account_id: str, position_ticket: int) -> str:
    """The key that makes re-importing a position a no-op.

    Includes the account id because an MT5 position ticket is unique only within
    one account -- two of the six accounts can legitimately both hold 12345.
    """
    return f"mt5:{trading_account_id}:{int(position_ticket)}"


def _as_dict(deal: Any) -> dict[str, Any]:
    """Accept either a MetaTrader namedtuple or a plain dict."""
    if isinstance(deal, dict):
        return deal
    if hasattr(deal, "_asdict"):
        return deal._asdict()
    return dict(deal)


def _iso(epoch_seconds: Any, epoch_msc: Any = None, offset_seconds: int = 0) -> str:
    """MT5 deal time -> ISO 8601 UTC.

    ``time_msc`` is preferred where present: two deals inside the same second
    are common on a fast close, and second precision would order them
    arbitrarily.

    MT5 stamps deals in the trade server's clock, not UTC -- see the note on
    the broker's clock in mt5_connector. ``offset_seconds`` is how far that
    clock runs ahead, and is taken off so the journal holds the real instant.
    """
    if epoch_msc:
        seconds = float(epoch_msc) / 1000.0
    else:
        seconds = float(epoch_seconds or 0)
    return datetime.fromtimestamp(seconds - offset_seconds, tz=timezone.utc).isoformat()


def _weighted_price(entries: list[tuple[float, float]]) -> float:
    """Volume-weighted average price. Falls back to a plain mean with no volume."""
    total_volume = sum(v for v, _ in entries)
    if total_volume > 0:
        return sum(v * p for v, p in entries) / total_volume
    prices = [p for _, p in entries]
    return sum(prices) / len(prices) if prices else 0.0


def trade_from_deals(
    deals: Iterable[Any], trading_account_id: str, offset_seconds: int = 0
) -> Optional[ClosedTrade]:
    """Build one trade from every deal belonging to a single position.

    Returns None when the position is not finished -- an opening deal with no
    close yet is an open position, not a trade, and journalling it would put a
    fictitious exit price on the dashboard.

    Partial closes are folded into one trade: prices are volume-weighted and the
    profit is summed, so a position scaled out of in three pieces reads as the
    one trade it was.
    """
    rows = [_as_dict(d) for d in deals]
    if not rows:
        return None

    opening: list[tuple[float, float]] = []
    closing: list[tuple[float, float]] = []
    entry_side: Optional[str] = None
    entry_time: Optional[str] = None
    exit_time: Optional[str] = None
    profit = 0.0
    costs = 0.0
    position_ticket = 0
    symbol = ""
    magic = 0

    for row in sorted(rows, key=lambda r: (r.get("time_msc") or 0, r.get("ticket") or 0)):
        entry = int(row.get("entry", DEAL_ENTRY_IN))
        volume = float(row.get("volume", 0) or 0)
        price = float(row.get("price", 0) or 0)
        when = _iso(row.get("time"), row.get("time_msc"), offset_seconds)

        symbol = row.get("symbol") or symbol
        position_ticket = int(row.get("position_id") or position_ticket or 0)
        magic = int(row.get("magic") or magic or 0)

        # Commission and swap arrive negative when charged. They are summed into
        # the net figure and also reported separately, because the dashboard
        # shows cost alongside result.
        profit += float(row.get("profit", 0) or 0)
        costs += float(row.get("commission", 0) or 0) + float(row.get("swap", 0) or 0)

        if entry == DEAL_ENTRY_IN:
            opening.append((volume, price))
            if entry_side is None:
                # A BUY deal opening a position is a long. The closing deal is
                # the opposite type, which is why side is only ever read here.
                entry_side = "long" if int(row.get("type", DEAL_TYPE_BUY)) == DEAL_TYPE_BUY else "short"
            if entry_time is None:
                entry_time = when
        elif entry in _CLOSING_ENTRIES:
            closing.append((volume, price))
            exit_time = when
        elif entry == DEAL_ENTRY_INOUT:
            # A reversal: one deal closes the old position and opens a new one in
            # the other direction. Treated as a close of what came before --
            # the new position carries its own ticket and arrives as its own
            # trade.
            closing.append((volume, price))
            exit_time = when

    if not opening or not closing:
        return None
    if entry_side is None or entry_time is None or exit_time is None:
        return None

    opened_volume = sum(v for v, _ in opening)
    closed_volume = sum(v for v, _ in closing)

    return ClosedTrade(
        external_id=external_id_for(trading_account_id, position_ticket),
        symbol=symbol,
        side=entry_side,
        qty=round(sum(v for v, _ in closing), 8),
        entry_price=_weighted_price(opening),
        exit_price=_weighted_price(closing),
        entry_time=entry_time,
        exit_time=exit_time,
        # Net of costs, matching what the ledger sums. src/db/trades.ts computes
        # pnl as (exit - entry) * qty * dir - fees for hand-entered trades; this
        # is the authoritative equivalent and is written without recomputation.
        pnl=round(profit + costs, 6),
        # `+ 0.0` normalises the -0.0 that round() produces for a cost-free
        # trade, which would otherwise serialise into JSON as "-0.0".
        fees=round(-costs, 6) + 0.0,
        position_ticket=position_ticket,
        magic=magic,
        # Volumes are lot steps (0.01), so anything under half a step is float
        # noise rather than volume still open.
        complete=closed_volume >= opened_volume - 0.005,
    )


def group_deals_by_position(deals: Iterable[Any]) -> dict[int, list[dict[str, Any]]]:
    """Deal history as MT5 returns it, split into positions.

    ``history_deals_get`` returns a flat time-ordered list across every symbol,
    so the deals of one position are not adjacent.
    """
    grouped: dict[int, list[dict[str, Any]]] = {}
    for deal in deals:
        row = _as_dict(deal)
        position = int(row.get("position_id") or 0)
        if not position:
            # A balance operation -- deposit, withdrawal, credit. Real, but not a
            # trade, and it has no position to belong to.
            continue
        grouped.setdefault(position, []).append(row)
    return grouped


def closing_position_tickets(deals: Iterable[Any]) -> list[int]:
    """Positions that were CLOSED somewhere in this window of deal history.

    This is phase one of a two-phase read, and the phase exists because of an
    off-by-a-day bug this module would otherwise have.

    Deal history is read forward from a high-water mark. A position opened on
    Monday and closed on Friday has its opening deal *before* that mark, so a
    window only ever contains the closing deal -- and a trade built from a
    closing deal alone has no entry price, gets skipped, and is then never seen
    again, because no later window contains the close either. The trade would be
    lost permanently rather than late.

    So the window is used only to learn WHICH positions finished. Phase two asks
    MT5 for every deal belonging to each of them (``history_deals_get(position=
    ...)``), which always returns the opening deal however long ago it was.
    """
    tickets: list[int] = []
    seen: set[int] = set()
    for deal in deals:
        row = _as_dict(deal)
        entry = int(row.get("entry", DEAL_ENTRY_IN))
        if entry not in _CLOSING_ENTRIES and entry != DEAL_ENTRY_INOUT:
            continue
        position = int(row.get("position_id") or 0)
        if not position or position in seen:
            continue
        seen.add(position)
        tickets.append(position)
    return tickets


def closed_trades_from_deals(
    deals: Iterable[Any], trading_account_id: str
) -> list[ClosedTrade]:
    """Every finished position in a COMPLETE set of deals, oldest close first.

    Expects deals that include each position's opening -- the result of phase
    two, or of a full history read. Given only a time window, use
    :func:`closing_position_tickets` first; see the note there.
    """
    trades: list[ClosedTrade] = []
    for position, rows in group_deals_by_position(deals).items():
        trade = trade_from_deals(rows, trading_account_id)
        if trade is not None:
            trades.append(trade)
        else:
            logger.debug("history_position_not_closed", position=position)
    return sorted(trades, key=lambda t: t.exit_time)
