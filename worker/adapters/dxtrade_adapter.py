"""
DXtrade platform adapter — REST session + positions/orders.
"""

from __future__ import annotations

from typing import Any, Optional

import structlog

from adapters.base import AdapterStatus, PlatformAdapter
from adapters.dxtrade_client import DXtradeClient, account_key, resolve_base_url

logger = structlog.get_logger()


class DXtradeAdapter(PlatformAdapter):
    platform = "dxtrade"
    status = AdapterStatus.STUB

    def __init__(self) -> None:
        self._client: Optional[DXtradeClient] = None
        self._account_key: Optional[str] = None
        self._credentials: dict[str, Any] = {}

    def documentation_path(self) -> Optional[str]:
        return "docs/integrations/dxtrade/README.md"

    def connect(self, credentials: dict[str, Any]) -> bool:
        """
        credentials:
          username, password, domain
          api_base_url (optional)
          account_id (optional explicit account key)
        """
        self._credentials = credentials
        username = str(credentials["username"])
        password = str(credentials["password"])
        domain = str(credentials.get("domain") or "default")
        base = resolve_base_url(
            api_base_url=credentials.get("api_base_url"),
            broker_server=credentials.get("broker_server"),
        )
        self._client = DXtradeClient(base)
        explicit = credentials.get("account_id")
        self._client.login(username, password, domain, account_id=explicit)
        self._account_key = explicit or account_key(domain, username)
        self.status = AdapterStatus.LIVE
        logger.info("dxtrade_adapter_connected", account_key=self._account_key)
        return True

    def get_open_positions(self) -> list[dict[str, Any]]:
        if not self._client or not self._account_key:
            return []
        return self._client.get_open_positions(self._account_key)

    def place_market_order(
        self,
        symbol: str,
        side: str,
        volume: float,
        *,
        sl: Optional[float] = None,
        tp: Optional[float] = None,
    ) -> Optional[dict[str, Any]]:
        if not self._client or not self._account_key:
            return None
        side_api = "BUY" if side.lower() == "buy" else "SELL"
        try:
            result = self._client.place_market_order(
                self._account_key,
                symbol=symbol,
                side=side_api,
                quantity=volume,
            )
            return {"retcode": 0, "order": result.get("orderId"), "comment": "ok", **result}
        except Exception as exc:
            logger.error("dxtrade_order_failed", error=str(exc))
            return {"retcode": -1, "comment": str(exc)}
