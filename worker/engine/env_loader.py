"""
Load the worker's environment from its own .env.

This used to live inside the delta_engine repo and read that repo's root .env
first, then worker/.env with override=True. Nothing shares this folder any
more, so there is one file and no override chain to reason about — which also
removes the failure mode where a stale value in the root file silently won and
the worker looked misconfigured for no visible reason.
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

WORKER_ROOT = Path(__file__).resolve().parent.parent


def load_worker_env() -> None:
    env_file = WORKER_ROOT / ".env"
    if env_file.exists():
        # The file wins over the ambient environment: this is a dedicated
        # appliance folder, and "why is it using a different API_URL than the
        # one in .env" is not a question anyone should have to ask.
        load_dotenv(env_file, override=True)
