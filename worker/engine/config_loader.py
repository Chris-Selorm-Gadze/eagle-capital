"""
Load local dev configuration from YAML files in worker/config/.
When DELTA_CONFIG_SOURCE=api, load from FastAPI /internal/runtime-config.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import yaml

from engine.env_loader import load_worker_env

WORKER_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_DIR = WORKER_ROOT / "config"

# Short-lived cache so a single config reload (which builds accounts, copiers,
# symbol mappings, and the risk engine) results in ONE HTTP fetch instead of 3-4.
_PAYLOAD_CACHE_TTL_S = float(os.environ.get("WORKER_RUNTIME_CACHE_SECONDS", "1.0"))
_payload_cache: dict[str, Any] | None = None
_payload_cache_at: float = 0.0


def invalidate_runtime_cache() -> None:
    global _payload_cache, _payload_cache_at
    _payload_cache = None
    _payload_cache_at = 0.0


def get_config_dir() -> Path:
    override = os.environ.get("DELTA_CONFIG_DIR")
    if override:
        return Path(override)
    return DEFAULT_CONFIG_DIR


def get_config_source() -> str:
    load_worker_env()
    return os.environ.get("DELTA_CONFIG_SOURCE", "yaml").lower()


def _load_yaml(name: str) -> dict[str, Any]:
    path = get_config_dir() / name
    if not path.exists():
        raise FileNotFoundError(
            f"Missing config file: {path}\n"
            f"Copy {name.replace('.yaml', '.example.yaml')} to {name} and fill in credentials."
        )
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data


@dataclass
class AccountConfig:
    id: str
    label: str
    role: str
    login: str
    password: str
    server: str
    terminal_path: Optional[str] = None
    api_base_url: Optional[str] = None
    platform: str = "mt5"
    enabled: bool = True


@dataclass
class CopierConfig:
    id: str
    master_id: str
    follower_id: str
    enabled: bool = True
    risk_mode: str = "multiplier"
    multiplier: float = 1.0
    fixed_lot_size: float = 0.01
    copy_sl: bool = True
    copy_tp: bool = True
    copy_closes: bool = True
    copy_modifications: bool = True
    max_signal_age_ms: int = 3000


@dataclass
class SymbolMapping:
    master_symbol: str
    follower_symbol: str
    master_account_id: Optional[str] = None
    follower_account_id: Optional[str] = None


def _runtime_payload() -> dict[str, Any]:
    from engine.api_client import get_api_client
    from engine.runtime_context import RuntimeContext, get_runtime_context, set_runtime_context

    global _payload_cache, _payload_cache_at

    client = get_api_client()
    if not client.enabled:
        raise RuntimeError(
            "DELTA_CONFIG_SOURCE=api requires WORKER_API_KEY and WORKER_USER_ID in .env"
        )

    now = time.monotonic()
    if _payload_cache is not None and (now - _payload_cache_at) < _PAYLOAD_CACHE_TTL_S:
        return _payload_cache

    payload = client.fetch_runtime_config()
    _payload_cache = payload
    _payload_cache_at = now
    copier_accounts = {
        row["id"]: (row["master_id"], row["follower_id"])
        for row in payload.get("copiers", [])
    }
    ctx = RuntimeContext(
        user_id=payload["user_id"],
        worker_id=client.worker_id,
        copier_accounts=copier_accounts,
    )
    if get_runtime_context() is None:
        set_runtime_context(ctx)
    else:
        existing = get_runtime_context()
        if existing:
            existing.copier_accounts = copier_accounts
            existing.user_id = payload["user_id"]
            existing.worker_id = client.worker_id
    return payload


def load_accounts() -> list[AccountConfig]:
    if get_config_source() == "api":
        payload = _runtime_payload()
        return [
            AccountConfig(
                id=row["id"],
                label=row["label"],
                role=row["role"],
                login=str(row["login"]),
                password=str(row["password"]),
                server=row["server"],
                terminal_path=row.get("terminal_path"),
                api_base_url=row.get("api_base_url"),
                platform=str(row.get("platform") or "mt5"),
                enabled=row.get("enabled", True),
            )
            for row in payload.get("accounts", [])
        ]

    data = _load_yaml("accounts.yaml")
    accounts = []
    for row in data.get("accounts", []):
        accounts.append(
            AccountConfig(
                id=row["id"],
                label=row.get("label", row["id"]),
                role=row["role"],
                login=str(row["login"]),
                password=str(row["password"]),
                server=row["server"],
                terminal_path=row.get("terminal_path"),
                enabled=row.get("enabled", True),
            )
        )
    return accounts


def load_copiers() -> list[CopierConfig]:
    if get_config_source() == "api":
        payload = _runtime_payload()
        return [
            CopierConfig(
                id=row["id"],
                master_id=row["master_id"],
                follower_id=row["follower_id"],
                enabled=row.get("enabled", True),
                risk_mode=row.get("risk_mode", "multiplier"),
                multiplier=float(row.get("multiplier", 1.0)),
                fixed_lot_size=float(row.get("fixed_lot_size", 0.01)),
                copy_sl=row.get("copy_sl", True),
                copy_tp=row.get("copy_tp", True),
                copy_closes=row.get("copy_closes", True),
                copy_modifications=row.get("copy_modifications", True),
                max_signal_age_ms=int(row.get("max_signal_age_ms", 3000)),
            )
            for row in payload.get("copiers", [])
        ]

    data = _load_yaml("copiers.yaml")
    copiers = []
    for row in data.get("copiers", []):
        copiers.append(
            CopierConfig(
                id=row["id"],
                master_id=row["master_id"],
                follower_id=row["follower_id"],
                enabled=row.get("enabled", True),
                risk_mode=row.get("risk_mode", "multiplier"),
                multiplier=float(row.get("multiplier", 1.0)),
                fixed_lot_size=float(row.get("fixed_lot_size", 0.01)),
                copy_sl=row.get("copy_sl", True),
                copy_tp=row.get("copy_tp", True),
                copy_closes=row.get("copy_closes", True),
                copy_modifications=row.get("copy_modifications", True),
                max_signal_age_ms=int(row.get("max_signal_age_ms", 3000)),
            )
        )
    return copiers


def load_symbol_mappings() -> list[SymbolMapping]:
    if get_config_source() == "api":
        payload = _runtime_payload()
        return [
            SymbolMapping(
                master_symbol=row["master_symbol"],
                follower_symbol=row["follower_symbol"],
                master_account_id=row.get("master_account_id"),
                follower_account_id=row.get("follower_account_id"),
            )
            for row in payload.get("symbol_mappings", [])
        ]

    data = _load_yaml("symbol_map.yaml")
    mappings = []
    for row in data.get("mappings", []):
        mappings.append(
            SymbolMapping(
                master_symbol=row["master_symbol"],
                follower_symbol=row["follower_symbol"],
            )
        )
    return mappings


def get_account(accounts: list[AccountConfig], account_id: str) -> AccountConfig:
    for acc in accounts:
        if acc.id == account_id:
            return acc
    raise KeyError(f"Account not found: {account_id}")


def get_master_accounts(accounts: list[AccountConfig]) -> list[AccountConfig]:
    return [a for a in accounts if a.role == "master" and a.enabled]


def get_follower_accounts(accounts: list[AccountConfig]) -> list[AccountConfig]:
    return [a for a in accounts if a.role == "follower" and a.enabled]


def get_copiers_for_master(copiers: list[CopierConfig], master_id: str) -> list[CopierConfig]:
    return [
        c for c in copiers if c.master_id == master_id and c.enabled
    ]


def dedupe_copiers_by_follower(copiers: list[CopierConfig]) -> list[CopierConfig]:
    """One active copier row per follower account — avoids double copies to the same terminal."""
    seen: set[str] = set()
    out: list[CopierConfig] = []
    for copier in copiers:
        if copier.follower_id in seen:
            continue
        seen.add(copier.follower_id)
        out.append(copier)
    return out
