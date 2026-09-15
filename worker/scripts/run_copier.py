"""Run the copier: watch every master and mirror its trades to its followers.

Needs at least one ARMED copy link. Without one the control plane correctly
answers 404 "no enabled copier relations" — the supervisor now registers,
heartbeats and idle-polls through that instead of exiting, so it is safe to
leave running while you arm links from the dashboard.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.env_loader import load_worker_env
from engine.master_supervisor import run_all_masters


if __name__ == "__main__":
    import multiprocessing as mp

    mp.freeze_support()
    load_worker_env()
    print("EagleCapital copier — Ctrl+C to stop")
    source = os.environ.get("DELTA_CONFIG_SOURCE", "yaml")
    print(f"Config source: {source}")
    run_all_masters()
