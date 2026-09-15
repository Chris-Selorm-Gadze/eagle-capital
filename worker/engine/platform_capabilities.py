"""Mirror of backend platform capabilities for worker routing."""

from __future__ import annotations

from typing import Optional


def supports_copy_master(platform: str) -> bool:
    return str(platform or "mt5").lower() in ("mt5", "dxtrade")


def supports_copy_follower(platform: str) -> bool:
    return str(platform or "mt5").lower() in ("mt5", "dxtrade")


def is_mt5(platform: str) -> bool:
    return str(platform or "mt5").lower() == "mt5"


def is_dxtrade(platform: str) -> bool:
    return str(platform or "mt5").lower() == "dxtrade"
