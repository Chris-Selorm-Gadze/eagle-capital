"""
Delta Engine — MT5 Connector
Encapsulates MetaTrader 5 Python integration.
Provides a clean interface for initializing, logging in, fetching state, and executing orders.
"""

import math
import time
import structlog
from typing import Optional, List, Dict, Any, Tuple

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None
    print("Warning: MetaTrader5 package not found or running on non-Windows OS.")

logger = structlog.get_logger()


class MT5Connector:
    def __init__(self, login: int, password: str, server: str, terminal_path: Optional[str] = None):
        self.login = login
        self.password = password
        self.server = server
        self.terminal_path = terminal_path
        self.connected = False
        # Static per-symbol spec cache (digits/volume steps/filling flags). These
        # do not change intraday, so cache them to avoid a symbol_info() round
        # trip on every lot-normalize and filling lookup. (TTL guards rare spec
        # changes / symbol re-selection.)
        self._symbol_info_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._symbol_info_ttl_s: float = 600.0
        # Remembered filling mode that last filled per symbol — tried first so a
        # repeat order skips the reject/retry dance.
        self._good_filling: Dict[str, int] = {}
        # Resolved follower symbol per master symbol (filled by SymbolMapper).
        self._resolved_symbols: Dict[str, str] = {}

    def last_error(self) -> Optional[Tuple[int, str]]:
        if mt5 is None:
            return None
        return mt5.last_error()

    def initialize(self, timeout_ms: int = 120_000) -> bool:
        """Initialize connection to the MT5 terminal and authorize the account."""
        if mt5 is None:
            logger.error("mt5_import_failed", reason="Module not available")
            return False

        init_kwargs: dict = {
            "login": self.login,
            "password": self.password,
            "server": self.server,
            "timeout": timeout_ms,
        }
        if self.terminal_path:
            init_kwargs["path"] = self.terminal_path

        if not mt5.initialize(**init_kwargs):
            error = mt5.last_error()
            logger.error("mt5_initialize_failed", error=error)
            return False

        self.connected = True
        logger.info("mt5_initialize_success", login=self.login, server=self.server)
        return True

    def login_account(self) -> bool:
        """Log in to the specific trading account (or confirm already logged in)."""
        info = mt5.account_info()
        if info is not None and info.login == self.login and info.server == self.server:
            self.connected = True
            logger.info("mt5_already_logged_in", login=self.login, server=self.server)
            return True

        if not mt5.login(login=self.login, password=self.password, server=self.server):
            error = mt5.last_error()
            logger.error("mt5_login_failed", login=self.login, server=self.server, error=error)
            return False

        self.connected = True
        logger.info("mt5_login_success", login=self.login, server=self.server)
        return True

    def shutdown(self):
        """Cleanly shut down the MT5 connection."""
        if mt5 is not None:
            mt5.shutdown()
        self.connected = False
        logger.info("mt5_shutdown", login=self.login)

    def get_account_info(self) -> Optional[Dict[str, Any]]:
        """Fetch basic account information."""
        account_info = mt5.account_info()
        if account_info is None:
            logger.error("mt5_get_account_info_failed", error=mt5.last_error())
            return None
        return account_info._asdict()

    def get_symbol_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetch and select symbol information (static spec; short-TTL cached).

        Callers use this for existence checks, lot normalization, and filling
        flags — none read live bid/ask from here (prices come from
        ``symbol_info_tick``), so a short cache is safe and removes a hot-path
        round-trip to the terminal on every order.
        """
        cached = self._symbol_info_cache.get(symbol)
        if cached is not None and (time.monotonic() - cached[0]) < self._symbol_info_ttl_s:
            return cached[1]

        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            logger.error("mt5_symbol_not_found", symbol=symbol)
            return None

        # Ensure the symbol is selected in the Market Watch
        if not symbol_info.visible:
            if not mt5.symbol_select(symbol, True):
                logger.error("mt5_symbol_select_failed", symbol=symbol)
                return None

        info = symbol_info._asdict()
        self._symbol_info_cache[symbol] = (time.monotonic(), info)
        return info

    def normalize_lot(self, symbol: str, volume: float) -> Optional[float]:
        """Round volume to broker min/max/step."""
        info = self.get_symbol_info(symbol)
        if not info:
            return None

        vmin = float(info.get("volume_min", 0.01))
        vmax = float(info.get("volume_max", 100.0))
        vstep = float(info.get("volume_step", 0.01))

        volume = max(vmin, min(vmax, volume))
        if vstep > 0:
            steps = round((volume - vmin) / vstep)
            volume = vmin + steps * vstep
            volume = round(volume, int(max(0, -math.log10(vstep))))

        if volume < vmin:
            return None
        return volume

    def _filling_candidates(self, symbol: str) -> list[int]:
        """Return order filling modes to try (symbol flags != order enum values)."""
        info = self.get_symbol_info(symbol)
        fallback = [
            mt5.ORDER_FILLING_RETURN,
            mt5.ORDER_FILLING_FOK,
            mt5.ORDER_FILLING_IOC,
        ]
        if not info:
            return fallback

        filling = int(info.get("filling_mode", 0))
        candidates: list[int] = []
        if filling & 1:
            candidates.append(mt5.ORDER_FILLING_FOK)
        if filling & 2:
            candidates.append(mt5.ORDER_FILLING_IOC)
        if filling & 4:
            candidates.append(mt5.ORDER_FILLING_RETURN)
        candidates = candidates or fallback

        # Try the mode that last filled this symbol first to skip the
        # reject/retry loop on repeat orders.
        good = self._good_filling.get(symbol)
        if good is not None and good in candidates:
            candidates = [good] + [c for c in candidates if c != good]
        return candidates

    def _resolve_filling_mode(self, symbol: str) -> int:
        """Pick the first supported order filling mode for the symbol."""
        return self._filling_candidates(symbol)[0]

    def get_open_positions(self) -> List[Dict[str, Any]]:
        """Fetch all open positions."""
        positions = mt5.positions_get()
        if positions is None:
            logger.error("mt5_get_positions_failed", error=mt5.last_error())
            return []
        return [p._asdict() for p in positions]

    def place_market_order(
        self, symbol: str, order_type: int, volume: float, sl: float = 0.0, tp: float = 0.0, deviation: int = 10, magic: int = 0, comment: str = "Delta Engine Copy"
    ) -> Optional[Dict[str, Any]]:
        """
        Place a market order (ORDER_TYPE_BUY or ORDER_TYPE_SELL).
        order_type should be mt5.ORDER_TYPE_BUY or mt5.ORDER_TYPE_SELL.
        """
        symbol_info = self.get_symbol_info(symbol)
        if not symbol_info:
            return None

        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            logger.error("mt5_no_tick", symbol=symbol, error=mt5.last_error())
            return None

        # Determine price based on order type
        if order_type == mt5.ORDER_TYPE_BUY:
            price = tick.ask
        elif order_type == mt5.ORDER_TYPE_SELL:
            price = tick.bid
        else:
            logger.error("invalid_order_type", order_type=order_type)
            return None

        if not price or price <= 0:
            logger.error("mt5_invalid_price", symbol=symbol, price=price)
            return None

        want_sl = float(sl)
        want_tp = float(tp)

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(volume),
            "type": order_type,
            "price": price,
            "sl": want_sl,
            "tp": want_tp,
            "deviation": deviation,
            "magic": magic,
            "comment": (comment or "Delta Engine Copy")[:31],
            "type_time": mt5.ORDER_TIME_GTC,
        }

        last_result = None
        stops_stripped = False
        for filling in self._filling_candidates(symbol):
            request["type_filling"] = filling
            result = mt5.order_send(request)
            if result is None:
                logger.error("mt5_order_send_none", symbol=symbol, error=mt5.last_error())
                continue
            last_result = result

            # Market-execution brokers (e.g. Exness) reject SL/TP on the opening
            # deal. Strip the stops, open clean, then apply them via SLTP below.
            if (
                result.retcode == mt5.TRADE_RETCODE_INVALID_STOPS
                and not stops_stripped
                and (want_sl or want_tp)
            ):
                logger.info("mt5_open_retry_without_stops", symbol=symbol)
                request["sl"] = 0.0
                request["tp"] = 0.0
                stops_stripped = True
                result = mt5.order_send(request)
                if result is None:
                    logger.error("mt5_order_send_none", symbol=symbol, error=mt5.last_error())
                    continue
                last_result = result

            if result.retcode == mt5.TRADE_RETCODE_DONE:
                self._good_filling[symbol] = filling
                payload = result._asdict()
                position_ticket = int(
                    getattr(result, "position", 0)
                    or getattr(result, "position_id", 0)
                    or 0
                )
                if not position_ticket:
                    for pos in mt5.positions_get(symbol=symbol) or []:
                        if int(pos.magic) == int(magic):
                            position_ticket = int(pos.ticket)
                            break
                if position_ticket:
                    payload["position_ticket"] = position_ticket
                    # Guarantee SL/TP land even when the broker stripped or
                    # silently ignored them on the opening deal.
                    if want_sl or want_tp:
                        self._ensure_position_stops(
                            position_ticket, symbol, want_sl, want_tp
                        )
                logger.info(
                    "mt5_order_send_success",
                    ticket=result.order,
                    position_ticket=position_ticket or None,
                    symbol=symbol,
                    volume=volume,
                    type=order_type,
                    filling=filling,
                )
                return payload

        logger.error("mt5_order_send_failed", result=last_result._asdict() if last_result else None)
        return last_result._asdict() if last_result else None

    def _ensure_position_stops(
        self, ticket: int, symbol: str, sl: float, tp: float
    ) -> None:
        """Apply SL/TP to a freshly opened position when the broker dropped them."""
        try:
            positions = mt5.positions_get(ticket=ticket)
            if not positions:
                return
            pos = positions[0]
            cur_sl = float(getattr(pos, "sl", 0) or 0)
            cur_tp = float(getattr(pos, "tp", 0) or 0)
            need = (sl and abs(cur_sl - sl) > 1e-9) or (tp and abs(cur_tp - tp) > 1e-9)
            if not need:
                return
            res = mt5.order_send(
                {
                    "action": mt5.TRADE_ACTION_SLTP,
                    "position": int(ticket),
                    "symbol": symbol,
                    "sl": float(sl),
                    "tp": float(tp),
                }
            )
            if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
                logger.error(
                    "mt5_open_sltp_apply_failed",
                    ticket=ticket,
                    error=(mt5.last_error() if res is None else res._asdict()),
                )
            else:
                logger.info("mt5_open_sltp_applied", ticket=ticket, sl=sl, tp=tp)
        except Exception as exc:
            logger.error("mt5_ensure_stops_error", ticket=ticket, error=str(exc))

    def close_position(
        self,
        ticket: int,
        deviation: int = 10,
        *,
        symbol: str | None = None,
        volume: float | None = None,
        side: str | None = None,
        magic: int = 0,
    ) -> Optional[Dict[str, Any]]:
        """Close an open position fully.

        Fast path: when ``symbol``, ``volume`` and ``side`` are supplied from a
        cached ticket link we skip the ``positions_get`` round-trip. If the
        broker rejects the request (wrong filling mode, stale cached volume,
        etc.) we fall back to a live ``positions_get`` and retry with the same
        filling-mode loop used for opens.
        """
        if mt5 is None:
            return None

        ticket = int(ticket)

        def _send_close(
            pos_symbol: str,
            pos_volume: float,
            position_type: int,
            pos_magic: int,
        ) -> Optional[Dict[str, Any]]:
            tick = mt5.symbol_info_tick(pos_symbol)
            if tick is None:
                logger.error(
                    "mt5_close_no_tick",
                    ticket=ticket,
                    symbol=pos_symbol,
                    error=mt5.last_error(),
                )
                return None

            if position_type == mt5.ORDER_TYPE_BUY:
                close_type = mt5.ORDER_TYPE_SELL
                price = tick.bid
            else:
                close_type = mt5.ORDER_TYPE_BUY
                price = tick.ask

            if not price or price <= 0:
                logger.error(
                    "mt5_close_invalid_price",
                    ticket=ticket,
                    symbol=pos_symbol,
                    price=price,
                )
                return None

            base_request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": pos_symbol,
                "volume": float(pos_volume),
                "type": close_type,
                "position": ticket,
                "price": price,
                "deviation": deviation,
                "magic": int(pos_magic or 0),
                "comment": "Delta Engine Close",
                "type_time": mt5.ORDER_TIME_GTC,
            }

            last_result = None
            for filling in self._filling_candidates(pos_symbol):
                request = {**base_request, "type_filling": filling}
                result = mt5.order_send(request)
                if result is None:
                    logger.error(
                        "mt5_close_order_send_none",
                        ticket=ticket,
                        symbol=pos_symbol,
                        error=mt5.last_error(),
                    )
                    continue
                last_result = result
                if result.retcode == mt5.TRADE_RETCODE_DONE:
                    self._good_filling[pos_symbol] = filling
                    logger.info(
                        "mt5_close_position_success",
                        ticket=ticket,
                        symbol=pos_symbol,
                    )
                    return result._asdict()

            if last_result is not None:
                logger.error(
                    "mt5_close_position_failed",
                    ticket=ticket,
                    symbol=pos_symbol,
                    result=last_result._asdict(),
                )
                return last_result._asdict()
            return None

        # Fast path from cached ticket link (skip positions_get).
        if symbol and volume and side:
            position_type = (
                mt5.ORDER_TYPE_BUY
                if str(side).lower() == "buy"
                else mt5.ORDER_TYPE_SELL
            )
            result = _send_close(symbol, float(volume), position_type, magic)
            if result is not None and result.get("retcode") == mt5.TRADE_RETCODE_DONE:
                return result
            logger.info(
                "mt5_close_fast_path_retry_positions_get",
                ticket=ticket,
                symbol=symbol,
                retcode=result.get("retcode") if result else None,
            )

        position = mt5.positions_get(ticket=ticket)
        if position is None or len(position) == 0:
            logger.info("mt5_close_position_already_flat", ticket=ticket)
            return {
                "retcode": mt5.TRADE_RETCODE_DONE,
                "comment": "already_closed",
                "position": ticket,
            }

        pos = position[0]
        return _send_close(
            pos.symbol,
            float(pos.volume),
            int(pos.type),
            int(getattr(pos, "magic", 0) or 0),
        )

    def _clamp_stops_for_side(
        self,
        symbol: str,
        side: str,
        sl: float,
        tp: float,
        *,
        bid: float,
        ask: float,
    ) -> tuple[float, float]:
        """Clamp SL/TP to broker minimum stop distance to avoid rc=10016."""
        info = self.get_symbol_info(symbol)
        if not info:
            return sl, tp

        point = float(info.get("point", 0) or 0)
        if point <= 0:
            return sl, tp

        stops_level = int(info.get("trade_stops_level", 0) or 0)
        min_dist = stops_level * point
        digits = int(info.get("digits", 5) or 5)
        is_buy = str(side).lower() == "buy"

        out_sl = float(sl or 0)
        out_tp = float(tp or 0)

        if out_sl > 0 and min_dist > 0:
            if is_buy:
                max_sl = bid - min_dist
                if out_sl > max_sl:
                    out_sl = max_sl
            else:
                min_sl = ask + min_dist
                if out_sl < min_sl:
                    out_sl = min_sl
            out_sl = round(out_sl, digits)

        if out_tp > 0 and min_dist > 0:
            if is_buy:
                min_tp = ask + min_dist
                if out_tp < min_tp:
                    out_tp = min_tp
            else:
                max_tp = bid - min_dist
                if out_tp > max_tp:
                    out_tp = max_tp
            out_tp = round(out_tp, digits)

        return out_sl, out_tp

    def get_position_stops(self, ticket: int) -> tuple[float, float] | None:
        """Return current SL/TP for an open position, or None if flat."""
        if mt5 is None:
            return None
        position = mt5.positions_get(ticket=int(ticket))
        if position is None or len(position) == 0:
            return None
        pos = position[0]
        return float(getattr(pos, "sl", 0) or 0), float(getattr(pos, "tp", 0) or 0)

    def modify_position(
        self,
        ticket: int,
        sl: float = 0.0,
        tp: float = 0.0,
        *,
        symbol: str | None = None,
        side: str | None = None,
    ) -> Optional[Dict[str, Any]]:
        """Modify SL/TP on an open position.

        Fast path: ``TRADE_ACTION_SLTP`` only needs the position ticket and the
        symbol, so when the caller passes a cached ``symbol`` we skip the
        ``positions_get`` round-trip. Stops are clamped to broker min distance.
        """
        position_type = None
        if not symbol or side is None:
            position = mt5.positions_get(ticket=ticket)
            if position is None or len(position) == 0:
                logger.error("mt5_modify_position_not_found", ticket=ticket)
                return None
            pos = position[0]
            symbol = symbol or pos.symbol
            position_type = int(pos.type)
            side = "buy" if position_type == mt5.ORDER_TYPE_BUY else "sell"

        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            logger.error("mt5_modify_no_tick", ticket=ticket, symbol=symbol)
            return None

        clamped_sl, clamped_tp = self._clamp_stops_for_side(
            symbol,
            side or "buy",
            sl,
            tp,
            bid=float(tick.bid),
            ask=float(tick.ask),
        )

        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": int(ticket),
            "symbol": symbol,
            "sl": clamped_sl,
            "tp": clamped_tp,
        }

        result = mt5.order_send(request)
        if result is None:
            logger.error("mt5_modify_order_send_none", ticket=ticket, error=mt5.last_error())
            return None
        ok_codes = {mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_NO_CHANGES}
        if result.retcode not in ok_codes:
            logger.error("mt5_modify_position_failed", result=result._asdict())
            return result._asdict()

        logger.info(
            "mt5_modify_position_success",
            ticket=ticket,
            sl=clamped_sl,
            tp=clamped_tp,
            retcode=result.retcode,
        )
        return result._asdict()
