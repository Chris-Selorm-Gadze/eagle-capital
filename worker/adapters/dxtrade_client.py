"""
DXtrade REST client (session token auth).

Auth: POST {base}/login with username, domain, password
Header: Authorization: DXAPI {sessionToken}

Broker-specific base URLs — set per account via api_base_url or DXTRADE_API_BASE_URL.
Docs: https://demo.dx.trade/developers/ | https://demo-xt.dx.trade/specs/dxRegister.html
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urljoin

import httpx
import structlog

logger = structlog.get_logger()

DEFAULT_LOGIN_PATH = os.environ.get("DXTRADE_LOGIN_PATH", "/login")
DEFAULT_PING_PATH = os.environ.get("DXTRADE_PING_PATH", "/ping")


@dataclass
class DXtradeSession:
    session_token: str
    timeout_ms: int
    account_id: Optional[str] = None


class DXtradeClient:
    def __init__(
        self,
        base_url: str,
        *,
        login_path: str = DEFAULT_LOGIN_PATH,
        ping_path: str = DEFAULT_PING_PATH,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.login_path = login_path
        self.ping_path = ping_path
        self._session: Optional[DXtradeSession] = None

    def _auth_header(self) -> dict[str, str]:
        if not self._session:
            raise RuntimeError("Not logged in")
        return {"Authorization": f"DXAPI {self._session.session_token}"}

    def login(
        self,
        username: str,
        password: str,
        domain: str,
        *,
        account_id: Optional[str] = None,
    ) -> DXtradeSession:
        payload = {"username": username, "domain": domain, "password": password}
        paths = [
            self.login_path,
            "/dxweb-rest/login",
            "/api/login",
        ]
        data = None
        last_err: Exception | None = None
        with httpx.Client(timeout=30.0) as client:
            for path in paths:
                url = urljoin(self.base_url + "/", path.lstrip("/"))
                try:
                    response = client.post(url, json=payload)
                    response.raise_for_status()
                    data = response.json()
                    self.login_path = path
                    break
                except Exception as exc:
                    last_err = exc
                    continue
        if data is None:
            raise last_err or RuntimeError("DXtrade login failed on all known paths")

        token = data.get("sessionToken") or data.get("session_token")
        if not token:
            raise RuntimeError(f"Login response missing sessionToken: {data}")

        timeout_ms = int(data.get("timeout") or data.get("sessionTimeout") or 300_000)
        self._session = DXtradeSession(
            session_token=token,
            timeout_ms=timeout_ms,
            account_id=account_id or data.get("accountId"),
        )
        logger.info("dxtrade_login_ok", base=self.base_url, domain=domain)
        return self._session

    def ping(self) -> None:
        if not self._session:
            return
        url = urljoin(self.base_url + "/", self.ping_path.lstrip("/"))
        with httpx.Client(timeout=15.0) as client:
            response = client.post(url, headers=self._auth_header())
            response.raise_for_status()
            data = response.json()
            if data.get("sessionToken"):
                self._session.session_token = data["sessionToken"]
            if data.get("timeout"):
                self._session.timeout_ms = int(data["timeout"])

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> Any:
        if not self._session:
            raise RuntimeError("Not logged in")
        url = urljoin(self.base_url + "/", path.lstrip("/"))
        with httpx.Client(timeout=30.0) as client:
            response = client.request(
                method,
                url,
                headers={**self._auth_header(), "Content-Type": "application/json"},
                json=json,
                params=params,
            )
            response.raise_for_status()
            if response.status_code == 204:
                return None
            return response.json()

    def get_accounts(self) -> list[dict[str, Any]]:
        """List accounts — path varies by broker; try common routes."""
        for path in (
            "accounts",
            "api/accounts",
            "dxweb-rest/api/accounts",
        ):
            try:
                data = self._request("GET", path)
                if isinstance(data, list):
                    return data
                if isinstance(data, dict) and "accounts" in data:
                    return data["accounts"]
            except httpx.HTTPError:
                continue
        return []

    def get_open_positions(self, account_key: str) -> list[dict[str, Any]]:
        """Fetch open positions for account (domain:user or account id)."""
        encoded = account_key.replace(":", "%3A")
        candidates = [
            f"accounts/{encoded}/positions",
            f"api/accounts/{encoded}/positions",
            f"dxweb-rest/api/accounts/{encoded}/positions",
            f"accounts/{account_key}/positions",
        ]
        for path in candidates:
            try:
                data = self._request("GET", path)
                if isinstance(data, list):
                    return self._normalize_positions(data)
                if isinstance(data, dict):
                    rows = data.get("positions") or data.get("items") or []
                    return self._normalize_positions(rows)
            except httpx.HTTPError as exc:
                logger.debug("dxtrade_positions_path_miss", path=path, error=str(exc))
        return []

    def place_market_order(
        self,
        account_key: str,
        *,
        symbol: str,
        side: str,
        quantity: float,
        order_code: Optional[str] = None,
    ) -> dict[str, Any]:
        code = order_code or f"cm-{int(time.time() * 1000)}"
        body = {
            "orderCode": code,
            "type": "MARKET",
            "instrument": symbol,
            "quantity": quantity,
            "side": side.upper(),
            "tif": "GTC",
        }
        encoded = account_key.replace(":", "%3A")
        for path in (
            f"accounts/{encoded}/orders",
            f"api/accounts/{encoded}/orders",
            f"dxweb-rest/api/accounts/{encoded}/orders",
        ):
            try:
                return self._request("POST", path, json=body) or {"orderCode": code}
            except httpx.HTTPError:
                continue
        raise RuntimeError("Failed to place DXtrade order on all known paths")

    def close_position(
        self,
        account_key: str,
        position_code: str,
        *,
        quantity: Optional[float] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"positionCode": position_code}
        if quantity is not None:
            body["quantity"] = quantity
        encoded = account_key.replace(":", "%3A")
        for path in (
            f"accounts/{encoded}/positions/{position_code}/close",
            f"api/accounts/{encoded}/positions/close",
        ):
            try:
                return self._request("POST", path, json=body) or {}
            except httpx.HTTPError:
                continue
        # Fallback: opposing market order
        return {}

    @staticmethod
    def _normalize_positions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for row in rows:
            symbol = row.get("symbol") or row.get("instrument") or row.get("instrumentSymbol")
            side_raw = (row.get("side") or row.get("positionSide") or "BUY").upper()
            side = "buy" if side_raw in ("BUY", "LONG") else "sell"
            ticket = row.get("positionCode") or row.get("id") or row.get("ticket")
            volume = float(row.get("quantity") or row.get("volume") or 0)
            normalized.append(
                {
                    "ticket": ticket,
                    "symbol": symbol,
                    "type": 0 if side == "buy" else 1,
                    "volume": volume,
                    "price_open": float(row.get("openPrice") or row.get("price") or 0),
                    "sl": float(row.get("stopLoss") or 0),
                    "tp": float(row.get("takeProfit") or 0),
                    "raw": row,
                }
            )
        return normalized


def resolve_base_url(
    *,
    api_base_url: Optional[str] = None,
    broker_server: Optional[str] = None,
) -> str:
    if api_base_url and api_base_url.startswith("http"):
        return api_base_url.rstrip("/")
    if broker_server and broker_server.startswith("http"):
        return broker_server.rstrip("/")
    env = os.environ.get("DXTRADE_API_BASE_URL", "").strip()
    if env:
        return env.rstrip("/")
    raise ValueError(
        "DXtrade API base URL required. Set trading_accounts.api_base_url, "
        "broker_server to https://your-broker.com, or DXTRADE_API_BASE_URL."
    )


def account_key(domain: str, username: str, explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    return f"{domain}:{username}"
