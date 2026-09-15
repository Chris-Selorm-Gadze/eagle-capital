"""
Maps master position tickets to follower tickets per copier relation.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Dict, Optional, Tuple


@dataclass
class TicketLink:
    copier_id: str
    master_ticket: int
    follower_ticket: int | str
    symbol: str
    side: str
    volume: float | None = None


class TicketMapper:
    """Thread-safe master→follower ticket map.

    Pool/DXtrade copy results are applied asynchronously (from executor
    callback threads) while the detection loop reads the map, so all access is
    guarded by a re-entrant lock. Individual operations are cheap dict ops.
    """

    def __init__(self):
        self._lock = threading.RLock()
        # (copier_id, master_ticket) -> TicketLink
        self._links: Dict[Tuple[str, int], TicketLink] = {}
        # (follower_account_id, master_ticket) -> prevents duplicate opens across copier rows
        self._follower_links: Dict[Tuple[str, int], TicketLink] = {}

    def has(self, copier_id: str, master_ticket: int) -> bool:
        with self._lock:
            return (copier_id, master_ticket) in self._links

    def has_for_follower(self, follower_account_id: str, master_ticket: int) -> bool:
        with self._lock:
            return (follower_account_id, master_ticket) in self._follower_links

    def add(
        self,
        copier_id: str,
        master_ticket: int,
        follower_ticket: int | str,
        symbol: str,
        side: str,
        *,
        follower_account_id: str | None = None,
        volume: float | None = None,
    ) -> None:
        link = TicketLink(
            copier_id=copier_id,
            master_ticket=master_ticket,
            follower_ticket=follower_ticket,
            symbol=symbol,
            side=side,
            volume=volume,
        )
        with self._lock:
            self._links[(copier_id, master_ticket)] = link
            if follower_account_id:
                self._follower_links[(follower_account_id, master_ticket)] = link

    def get(self, copier_id: str, master_ticket: int) -> Optional[TicketLink]:
        with self._lock:
            return self._links.get((copier_id, master_ticket))

    def remove(
        self,
        copier_id: str,
        master_ticket: int,
        *,
        follower_account_id: str | None = None,
    ) -> None:
        with self._lock:
            self._links.pop((copier_id, master_ticket), None)
            if follower_account_id:
                self._follower_links.pop((follower_account_id, master_ticket), None)
