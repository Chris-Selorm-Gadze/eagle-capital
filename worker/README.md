# EagleCapital worker

The process that actually places trades. It runs on a Windows machine with the
broker MT5 terminals installed, and it is the **only** thing in the system that
can reach a broker — the browser can't, and the gateway can't.

That single fact explains most of how this behaves. A newly connected account
reads *Disconnected* until this worker says otherwise. **Test connection** in the
dashboard writes a row and returns; nothing happens until this picks it up.

Everything is outbound. No port forwarding, no static IP, no inbound firewall
rule — the worker dials the gateway, never the reverse.

---

## What this is

The copy engine extracted from `delta_engine`, with its FastAPI backend and its
separate Supabase project dropped. Both were replaced by
`supabase/functions/copier-gateway` in this repo, which implements the twelve
`/internal/*` endpoints the worker calls.

It lives here rather than in its own repo because the worker and the gateway are
one system with one contract. A change to either that breaks the other should be
visible in a single diff.

Nothing outside this folder is needed to run it. Copy the folder to the Windows
machine, or clone this repo there and work in `worker/` — both work.

---

## Setup

```powershell
.\setup.ps1          # venv + dependencies + .env
notepad .env         # WORKER_API_KEY and WORKER_USER_ID
.\show-config.ps1    # confirms the control plane sees you
```

`show-config.ps1` is the diagnostic worth running before anything else. It
separates the three failures that look identical from the dashboard: a wrong
`API_URL`, a wrong `WORKER_API_KEY`, and a wrong `WORKER_USER_ID` — the last of
which connects, authenticates, then reports zero accounts.

Then harden the machine, once, if it is going to stay on:

```powershell
# As Administrator
.\prepare-host.ps1 -Mt5Root "C:\Program Files"
```

Sleep and hibernate off on mains power, USB selective suspend off, Windows
Update active hours widened, Defender exclusions. It prints what it could not
do — read that rather than assuming it worked.

---

## Running

### While setting accounts up

```powershell
.\test-connections.ps1
```

Registers, heartbeats, answers **Test connection**. Needs no copy link. Verify
every login here **before** arming anything, because arming is the step that
starts placing real orders.

### Once a link is armed

```powershell
.\run.ps1
```

Supervises the copier and restarts it if it dies, with backoff. Services
commands itself, so stop `test-connections.ps1` first.

### Surviving reboots

```powershell
.\install-autostart.ps1
Start-ScheduledTask -TaskName EagleCapitalCopier
```

A scheduled task, **not** a Windows Service. MT5 is a GUI application that needs
a real desktop session; services run in Session 0 without one, and MT5 under
that is a well-known source of flaky behaviour.

Watch it:

```powershell
Get-Content .\logs\supervisor.log -Wait -Tail 20
```

---

## Layout

```
engine/       the copier itself
adapters/     non-MT5 platforms (DXtrade, cTrader, Tradovate, MT4 bridge)
scripts/      the four entry points the .ps1 wrappers call
tests/        pytest; the only safety net the copy logic has
mql5/         optional event-driven signal bus EA for the master terminal
config/       *.example.yaml — only used if you fall back to DELTA_CONFIG_SOURCE=yaml
```

---

## Terminal paths matter more than they look

**Every broker ships its own MT5 build and they are not interchangeable.** An
FTMO account opened through the Exness terminal fails to log in, and the error
reads like a wrong password. If an account sticks on *Login rejected*, check the
terminal path before you touch the credentials.

Accounts sharing one `terminal_path` share one pool worker with `max_workers=1`,
because MT5 allows a single login per terminal. Their copies **queue** — the
worker logs into each in turn, and the last one waits for every switch ahead of
it. The cost scales with follower count, it is not flat.

To run them in parallel, give each account its own copy of that broker's MT5:

```powershell
.\clone-terminals.ps1 -Broker all -Count 5
```

**You do not assign them.** The worker scans `C:\MT5` and `Program Files`
(override with `WORKER_TERMINAL_ROOTS`), matches folders to brokers by name, and
claims a free one for each account on its first successful connection test. The
choice is written back to the database and kept — reassigning would reset the
warm session and make MT5 re-download history.

When every terminal for a broker is taken, the account's test fails with
*"All 5 terminals for this broker are already in use"* rather than silently
sharing one. Run `clone-terminals.ps1` again to add capacity.

The Copy log's **Login switching** figure is the measurement — zero means each
account has its own install.

**A master and a follower must never share an install.** Two accounts queueing is
slow; a master and its follower on one terminal is *unsafe* — the master monitor
and the follower's pool worker race over that terminal's single login, and a lost
race sends the copy to the master, opening a second trade there instead of
copying to the follower. The worker now refuses to trade when the terminal is
logged into the wrong account, so this fails loudly instead of silently, but the
fix is separate folders.

---

## Changes from upstream `delta_engine`

Four, all deliberate, all permanent here:

- **`master_supervisor.py`** — registers and heartbeats *before* looking for
  work, then idle-polls instead of raising. Upstream fetched runtime-config,
  got `404 no enabled copier relations`, retried three times and died. Correct
  for a fixed deployment, wrong for a product: a user with no armed link cannot
  start a worker, and therefore cannot test a login, and therefore has to arm
  live order execution before verifying anything. It also services
  `test_connection` while idle.
- **`api_client.py`** — sends `X-User-Id` when registering. Without it the
  `worker_nodes` row has no owner, row-level security hides it from the person
  who owns it, and the dashboard reads *"No worker"* while this process
  heartbeats perfectly well.
- **`env_loader.py`** — reads this folder's `.env` only. Upstream read the repo
  root's file first and then overrode it, so a stale root value could silently
  win.
- **`command_processor.py`** — the adapter `sys.path` insert pointed one level
  too high (`parents[2]`, the old repo root, which never contained `adapters/`).
  It only worked because the entry-point scripts already had the worker folder
  on the path.

Dropped: `backend/` and `supabase/` (replaced by the gateway), the numbered
bring-up scripts for a YAML-config flow that no longer applies, and
`11_seed_supabase.py`, which wrote to the old paused project.

---

## Credentials

`ENCRYPTION_KEY` is **not** on this machine and must never be. The gateway
decrypts broker passwords and hands the worker plaintext over TLS, so the key
exists in exactly one place.

`.env` is gitignored. `.env.example` is the tracked template.
