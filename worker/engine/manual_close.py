"""
Closing positions on request from the app.

The Live Trading page's Close buttons and the copier's Flatten both end here:
a worker command names an account and, for a single close, the position
ticket. Everything that touches MT5 goes through MT5Connector.close_position,
which already knows each broker's filling modes -- the old flatten hard-coded
IOC and was refused outright by FOK-only brokers.

Closing a master's position is not special-cased. The copier sees it close on
its next poll and closes the followers' copies exactly as if the trader had
closed it on the terminal, which is what "close" means for a copied trade.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None

# MetaTrader's TRADE_RETCODE_DONE, spelled out for the same reason trade_history
# spells out its deal constants: the module is None off Windows.
RETCODE_DONE = 10009


def _done_code() -> int:
    return int(getattr(mt5, "TRADE_RETCODE_DONE", RETCODE_DONE)) if mt5 else RETCODE_DONE


def requested_tickets(payload: Optional[dict[str, Any]]) -> Optional[list[int]]:
    """Which positions a command asks for. None means every open position.

    Accepts ``ticket`` or ``tickets``; tickets arrive as strings from the app
    because MT5 tickets overflow a JavaScript number's safe range.
    """
    if not payload:
        return None
    raw: Iterable[Any]
    if payload.get("tickets") is not None:
        raw = payload.get("tickets") or []
    elif payload.get("ticket") is not None:
        raw = [payload.get("ticket")]
    else:
        return None
    out: list[int] = []
    for value in raw:
        try:
            out.append(int(str(value).strip()))
        except (TypeError, ValueError):
            continue
    return out


def close_on_connector(connector: Any, tickets: Optional[list[int]]) -> dict[str, Any]:
    """Close ``tickets`` (or everything, for None) on the attached account.

    A ticket that is no longer open is reported, not failed: the position
    closed between the page's last snapshot and the click -- by its stop, by
    the copier, or by a second click -- and the outcome the trader asked for
    has happened.
    """
    positions = connector.get_open_positions() or []
    open_tickets = {int(p.get("ticket") or 0) for p in positions}

    if tickets is None:
        targets = positions
        already_closed: list[int] = []
    else:
        wanted = set(tickets)
        targets = [p for p in positions if int(p.get("ticket") or 0) in wanted]
        already_closed = sorted(wanted - open_tickets)

    done = _done_code()
    closed: list[dict[str, Any]] = []
    errors: list[str] = []

    for pos in targets:
        ticket = int(pos.get("ticket") or 0)
        symbol = str(pos.get("symbol") or "")
        result = connector.close_position(ticket, deviation=20)
        if result is not None and int(result.get("retcode") or 0) == done:
            if result.get("comment") == "already_closed":
                already_closed.append(ticket)
                continue
            closed.append({
                "ticket": ticket,
                "symbol": symbol,
                "volume": pos.get("volume"),
                "side": "long" if pos.get("type") == 0 else "short",
            })
            continue
        reason = getattr(connector, "last_send_error", None)
        if not reason and result is not None:
            comment = result.get("comment") or ""
            reason = f"broker returned {result.get('retcode')}" + (f" ({comment})" if comment else "")
        errors.append(f"{symbol} #{ticket}: {reason or 'the close was not accepted'}")

    return {
        "success": not errors,
        "closed": len(closed),
        "closed_positions": closed,
        "already_closed": sorted(set(already_closed)),
        "errors": errors,
        # The single-line reason the app shows when something did not close.
        "error": "; ".join(errors) if errors else None,
    }
