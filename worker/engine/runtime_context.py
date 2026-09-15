"""
Shared worker runtime context for API-backed execution logging.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple


@dataclass
class RuntimeContext:
    user_id: str
    worker_id: Optional[str] = None
    # copier relation id -> (master_account_id, follower_account_id)
    copier_accounts: Dict[str, Tuple[str, str]] = field(default_factory=dict)


_context: Optional[RuntimeContext] = None


def set_runtime_context(ctx: RuntimeContext) -> None:
    global _context
    _context = ctx


def get_runtime_context() -> Optional[RuntimeContext]:
    return _context
