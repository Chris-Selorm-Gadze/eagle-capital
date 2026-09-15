"""
Risk checks before follower execution (Phase 4).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class RiskDecision:
    allowed: bool
    reason: Optional[str] = None
    status: str = "skipped_risk"


class RiskEngine:
    def __init__(self, profiles_by_account: dict[str, dict[str, Any]]):
        self._profiles = profiles_by_account

    @classmethod
    def from_runtime(cls, payload: dict[str, Any]) -> "RiskEngine":
        profiles: dict[str, dict[str, Any]] = {}
        for row in payload.get("risk_profiles", []):
            profiles[row["account_id"]] = row
        return cls(profiles)

    def profile_for(self, account_id: str) -> Optional[dict[str, Any]]:
        """Serializable risk profile for one account (for cross-process dispatch)."""
        return self._profiles.get(account_id)

    def requires_open_count(self, account_id: str) -> bool:
        """Whether evaluating this account needs a live open-position count.

        Only the ``max_open_positions`` rule consults the count. When it isn't
        set we can skip the ``get_open_positions()`` round-trip on the open hot
        path entirely.
        """
        profile = self._profiles.get(account_id)
        return bool(profile and profile.get("max_open_positions") is not None)

    def check_open(
        self,
        follower_account_id: str,
        symbol: str,
        lot: float,
        open_positions: int,
    ) -> RiskDecision:
        profile = self._profiles.get(follower_account_id)
        if not profile:
            return RiskDecision(allowed=True)

        if profile.get("is_locked"):
            return RiskDecision(
                allowed=False,
                reason=profile.get("locked_reason") or "Account locked by risk profile",
            )

        allowed_symbols = profile.get("allowed_symbols") or []
        if allowed_symbols and symbol.upper() not in [s.upper() for s in allowed_symbols]:
            return RiskDecision(
                allowed=False,
                reason=f"Symbol {symbol} not in allowed list",
            )

        blocked = profile.get("blocked_symbols") or []
        if blocked and symbol.upper() in [s.upper() for s in blocked]:
            return RiskDecision(
                allowed=False,
                reason=f"Symbol {symbol} is blocked",
            )

        max_lot = profile.get("max_lot_per_trade")
        if max_lot is not None and lot > float(max_lot):
            return RiskDecision(
                allowed=False,
                reason=f"Lot {lot} exceeds max_lot_per_trade ({max_lot})",
            )

        max_open = profile.get("max_open_positions")
        if max_open is not None and open_positions >= int(max_open):
            return RiskDecision(
                allowed=False,
                reason=f"Max open positions ({max_open}) reached",
            )

        max_trades = profile.get("max_trades_per_day")
        daily_trades = int(profile.get("daily_trades_count") or 0)
        if max_trades is not None and daily_trades >= int(max_trades):
            return RiskDecision(
                allowed=False,
                reason=f"Max trades per day ({max_trades}) reached",
            )

        return RiskDecision(allowed=True)

    def record_open(self, follower_account_id: str) -> None:
        """Increment local daily trade counter after a successful open."""
        profile = self._profiles.get(follower_account_id)
        if not profile:
            return
        profile["daily_trades_count"] = int(profile.get("daily_trades_count") or 0) + 1
