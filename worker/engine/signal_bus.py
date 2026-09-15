"""
MQL5 signal bus — event-driven master detection via a shared JSONL file.

The companion EA (``worker/mql5/DeltaEngineSignalBus.mq5``) writes one JSON
object per line when the master account's positions change. This module tails
that file and converts rows into ``TradeSignal`` instances so the copier engine
can react in single-digit milliseconds instead of waiting for the poll loop.

Configure with:
  WORKER_SIGNAL_BUS_ENABLED=1
  WORKER_SIGNAL_BUS_DIR=   (optional; defaults to MT5 Common Files)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import structlog

from engine.signal import TradeSignal

logger = structlog.get_logger()

_EVENT_MAP = {
    "open": "position_opened",
    "close": "position_closed",
    "sl": "sl_modified",
    "tp": "tp_modified",
    "sltp": "sltp_modified",
    "volume": "volume_changed",
}


def _default_bus_dir() -> Path:
    custom = os.environ.get("WORKER_SIGNAL_BUS_DIR", "").strip()
    if custom:
        return Path(custom)
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        return Path(appdata) / "MetaQuotes" / "Terminal" / "Common" / "Files" / "delta_engine"
    return Path.home() / "delta_engine" / "signal_bus"


def bus_file_for_master(master_login: str) -> Path:
    safe_login = "".join(c for c in str(master_login) if c.isalnum() or c in "-_")
    return _default_bus_dir() / f"signals_{safe_login}.jsonl"


class SignalBusReader:
    """Tail a master-specific JSONL signal file written by the MQL5 EA."""

    def __init__(self, master_account_id: str, master_login: str) -> None:
        self.master_account_id = master_account_id
        self.master_login = str(master_login)
        self.path = bus_file_for_master(self.master_login)
        self._offset = 0
        self._seen_keys: set[str] = set()
        self._max_seen = 5000
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_file():
            self._offset = self.path.stat().st_size
        logger.info(
            "signal_bus_ready",
            path=str(self.path),
            master=self.master_account_id,
        )

    @property
    def enabled(self) -> bool:
        return os.environ.get("WORKER_SIGNAL_BUS_ENABLED", "0") == "1"

    def drain(self) -> list[TradeSignal]:
        if not self.path.is_file():
            return []

        try:
            size = self.path.stat().st_size
            if size < self._offset:
                logger.warning(
                    "signal_bus_truncated",
                    path=str(self.path),
                    old_offset=self._offset,
                    new_size=size,
                )
                self._offset = 0
        except OSError:
            pass

        signals: list[TradeSignal] = []
        try:
            with open(self.path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(self._offset)
                chunk = f.read()
                self._offset = f.tell()
        except OSError as exc:
            logger.warning("signal_bus_read_failed", error=str(exc))
            return []

        for line in chunk.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            signal = self._row_to_signal(row)
            if signal is None:
                continue
            dedupe_key = (
                f"{signal.event_type}:{signal.ticket}:"
                f"{signal.sl}:{signal.tp}:{signal.volume}:{row.get('ts', '')}"
            )
            if dedupe_key in self._seen_keys:
                continue
            self._seen_keys.add(dedupe_key)
            if len(self._seen_keys) > self._max_seen:
                self._seen_keys.clear()
            signals.append(signal)

        if signals:
            logger.info(
                "signal_bus_drained",
                count=len(signals),
                master=self.master_account_id,
            )
        return signals

    def _row_to_signal(self, row: dict[str, Any]) -> TradeSignal | None:
        raw_event = str(row.get("event") or row.get("event_type") or "").lower()
        event_type = _EVENT_MAP.get(raw_event, raw_event)
        if event_type not in (
            "position_opened",
            "position_closed",
            "sl_modified",
            "tp_modified",
            "sltp_modified",
            "volume_changed",
        ):
            return None
        try:
            ticket = int(row["ticket"])
        except (KeyError, TypeError, ValueError):
            return None

        symbol = str(row.get("symbol") or "")
        side_raw = str(row.get("side") or "buy").lower()
        side = "buy" if side_raw in ("buy", "0", "long") else "sell"
        volume = float(row.get("volume") or 0)
        sl = row.get("sl")
        tp = row.get("tp")
        ts = row.get("ts") or row.get("timestamp_ms")
        timestamp_ms = int(ts) if ts else 0

        return TradeSignal(
            event_type=event_type,
            account_id=self.master_account_id,
            ticket=ticket,
            symbol=symbol,
            side=side,
            volume=volume,
            open_price=float(row["open_price"]) if row.get("open_price") else None,
            sl=float(sl) if sl not in (None, "", 0, 0.0) else None,
            tp=float(tp) if tp not in (None, "", 0, 0.0) else None,
            timestamp_ms=timestamp_ms,
            previous_volume=(
                float(row["previous_volume"])
                if row.get("previous_volume") is not None
                else None
            ),
        )
