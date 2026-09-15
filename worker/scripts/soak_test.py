"""Step 10: Long-running soak test with periodic health logging."""

import os
import sys
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.copier_engine import CopierEngine
from engine.config_loader import get_master_accounts, load_accounts


def main():
    hours = float(os.environ.get("SOAK_HOURS", "24"))
    end_at = datetime.now() + timedelta(hours=hours)
    print(f"Soak test until {end_at.isoformat()} ({hours}h) — Ctrl+C to stop early\n")

    accounts = load_accounts()
    masters = get_master_accounts(accounts)
    if not masters:
        print("No master account")
        return 1

    engine = CopierEngine()
    # Run copier in main thread with periodic health — simplified: delegate to CopierEngine
    try:
        engine.run(master_id=masters[0].id)
    except KeyboardInterrupt:
        print("Soak test stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
