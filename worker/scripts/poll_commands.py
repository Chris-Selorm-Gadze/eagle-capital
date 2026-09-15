#!/usr/bin/env python3
"""Service dashboard commands without running the copier.

Registers, heartbeats, and answers Test connection — none of which needs an
armed copy link. This is what you run when setting accounts up, so you can
verify every login BEFORE arming anything that places real orders.
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.api_client import get_api_client
from engine.command_processor import process_command
from engine.env_loader import load_worker_env


def main() -> int:
    load_worker_env()
    client = get_api_client()
    if not client.enabled:
        print(f"Not configured: {', '.join(client.missing_settings())} missing from .env")
        print("Run .\\show-config.ps1 for the full picture.")
        return 1

    client.register_worker()
    client.start_heartbeat_loop()
    interval = float(os.environ.get("WORKER_COMMAND_POLL_SECONDS", "3"))
    print(f"Polling worker commands every {interval}s (Ctrl+C to stop)")

    try:
        while True:
            try:
                commands = client.fetch_pending_commands()
                for cmd in commands:
                    result = process_command(cmd, sessions={})
                    client.complete_command(
                        cmd["id"],
                        success=bool(result.get("success")),
                        result=result,
                        error=result.get("message") or result.get("error"),
                    )
                    print(f"Completed {cmd.get('command_type')} for {cmd.get('trading_account_id')}: {result}")
            except Exception as exc:
                print(f"Poll error: {exc}")
            time.sleep(interval)
    except KeyboardInterrupt:
        client.stop_heartbeat_loop()
        print("Stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
