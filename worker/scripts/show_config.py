#!/usr/bin/env python3
"""Print what the control plane hands this worker.

The fastest way to tell a wrong WORKER_USER_ID from a wrong API_URL from a
wrong key: a worker with the wrong user id connects, authenticates, and then
reports zero accounts, which looks nothing like a misconfiguration.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.env_loader import load_worker_env
from engine.config_loader import load_accounts, load_copiers, get_config_source


REQUIRED = ("API_URL", "WORKER_API_KEY", "WORKER_USER_ID")
OPTIONAL = ("DELTA_CONFIG_SOURCE", "WORKER_NAME", "WORKER_REGION", "WORKER_CAPACITY")
SECRET = ("WORKER_API_KEY",)


def _show(name: str) -> str:
    """Print a value, masking anything secret. A key that is present but wrong
    and a key that is absent need to look different, so masking still shows the
    length and the last four characters."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return "(not set)"
    if name in SECRET:
        return f"set, {len(raw)} chars, ends ...{raw[-4:]}" if len(raw) > 4 else "set (very short)"
    return raw


def main() -> int:
    from engine.env_loader import WORKER_ROOT

    env_file = WORKER_ROOT / ".env"
    print(f".env: {env_file}")
    if not env_file.exists():
        print("  MISSING. Run .\\setup.ps1, then fill it in.")
        return 1
    print(f"  found, {env_file.stat().st_size} bytes")

    load_worker_env()

    print("\nRequired:")
    for name in REQUIRED:
        print(f"  {name:18} {_show(name)}")
    print("Optional:")
    for name in OPTIONAL:
        print(f"  {name:18} {_show(name)}")

    missing = [n for n in REQUIRED if not os.environ.get(n)]
    if missing:
        plural = "they are" if len(missing) > 1 else "it is"
        print(f"\nFAILED: {', '.join(missing)} not set in .env.")
        print(f"Nothing else can work until {plural}. Check for a typo in the key")
        print("name, a line that got commented out, or a stray blank after the '='.")
        return 1

    source = get_config_source()

    if source != "api":
        print("\nSet DELTA_CONFIG_SOURCE=api in .env to use dashboard copiers.")
        return 1

    # Identity first. runtime-config answers 404 both when nothing is armed AND
    # when the user id does not exist, so asking it "who am I" is useless -- and
    # a wrong WORKER_USER_ID is the mistake that otherwise stays hidden until a
    # live copy link is armed.
    from engine.api_client import get_api_client

    client = get_api_client()
    try:
        me = client.whoami()
    except Exception as exc:
        print(f"\nFAILED: cannot reach the control plane: {exc}")
        print("Check API_URL, then that WORKER_API_KEY matches the Supabase secret.")
        return 1

    if not me.get("known_user"):
        print("\nFAILED: no user with this WORKER_USER_ID.")
        print("It is your EagleCapital auth.users id, not a delta_engine one:")
        print("  select id, email from auth.users where email = 'you@example.com';")
        return 1

    print(f"\nSigned in as: {me.get('email') or me['user_id']}")

    remote_accounts = me.get("accounts") or []
    if not remote_accounts:
        print("\nNo accounts connected to this user.")
        print("Connect one in the dashboard: Trade Copier -> Connect an account.")
        print("Make sure the browser is signed in as the SAME user shown above.")
        return 1

    print(f"\nAccounts ({len(remote_accounts)}):")
    for a in remote_accounts:
        print(f"  {a['label']:<24} {a['platform']:<8} {a['connection_status']:<22} "
              f"{a.get('terminal_path') or 'no terminal path'}")

    enabled = me.get("enabled_relations", 0)
    total = me.get("relations", 0)
    print(f"\nCopy links: {total} total, {enabled} armed")

    if enabled == 0:
        # Not a failure. This is the correct state before the first link is
        # armed, and the worker is designed to idle through it.
        print("\nOK -- everything is configured. Nothing is armed yet, which is")
        print("expected at this stage and is NOT an error.")
        print("\nNext: .\\test-connections.ps1, then press Test connection in the")
        print("dashboard on each account above.")
        return 0

    try:
        accounts = load_accounts()
        copiers = load_copiers()
    except Exception as exc:
        print(f"\nFAILED: {exc}")
        print("Check: API_URL reachable, WORKER_API_KEY matches the Supabase secret,")
        print("       WORKER_USER_ID = your EagleCapital auth.users id.")
        return 1

    print(f"\nAccounts ({len(accounts)}):")
    for a in accounts:
        print(
            f"  {a.id[:8]}… {a.role:8} login={a.login} server={a.server} "
            f"terminal={a.terminal_path or 'auto'}"
        )

    print(f"\nCopiers ({len(copiers)}):")
    for c in copiers:
        print(
            f"  {c.id[:8]}… master={c.master_id[:8]}… "
            f"follower={c.follower_id[:8]}… enabled={c.enabled}"
        )

    paths = {a.terminal_path for a in accounts if a.terminal_path}
    if len(paths) > 1:
        print("\nNote: Multiple MT5 terminal paths — copier will switch terminals per copy.")

    print("\nNext: .\\test-connections.ps1   then   .\\run.ps1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
