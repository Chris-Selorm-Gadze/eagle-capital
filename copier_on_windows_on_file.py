"""Step 9: Production-style continuous copier loop (alias of step 7/8)."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.env_loader import load_worker_env
from engine.master_supervisor import run_all_masters


if __name__ == "__main__":
    import multiprocessing as mp

    mp.freeze_support()
    load_worker_env()
    print("Delta Engine copier loop — Ctrl+C to stop")
    source = os.environ.get("DELTA_CONFIG_SOURCE", "yaml")
    print(f"Config source: {source}")
    run_all_masters()
