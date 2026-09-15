# Windows worker → EagleCapital

Clean break. The copymorphic / delta_engine project is not continuing — its copy
engine now lives in **[`worker/`](worker/) in this repo**, and the FastAPI
backend and its separate Supabase project are gone, replaced by the
`copier-gateway` Edge Function.

Accounts get re-entered, so nothing depends on the old project ever waking up.

> **The worker's own docs are [`worker/README.md`](worker/README.md)** — install,
> run, troubleshoot. This file covers the EagleCapital side and the order the two
> fit together.

> The PowerShell in `worker/` has been parse-checked and PSScriptAnalyzer-linted
> but **never executed** — there is no Windows machine on my side. Read what each
> script prints rather than assuming it worked.

---

## Step 1 — Supabase *(blocking)*

### Two secrets

Fresh keys, not the old ones. Both values are in **`.secrets.local`** (chmod 600,
gitignored):

```bash
grep -E '^(WORKER_API_KEY|ENCRYPTION_KEY)=' .secrets.local
```

Add them in **Supabase dashboard → Project Settings → Edge Functions → Secrets**:

| Name | Purpose |
|---|---|
| `WORKER_API_KEY` | What the worker presents as `X-Worker-Key`. |
| `ENCRYPTION_KEY` | AES-256-GCM for broker passwords. **Supabase only — never on the Windows machine.** |

The worker never decrypts anything; the gateway hands it plaintext over TLS. So
`ENCRYPTION_KEY` exists in exactly one place.

> **`ENCRYPTION_KEY` cannot be rotated once accounts exist.** Change it later and
> every stored broker password becomes unreadable and has to be re-entered.

### Two SQL files

**SQL Editor → New query**, run in this order. Both are idempotent.

1. `supabase/delta-engine-schema.sql` — the 11 copier tables, 5 enums, RLS, and
   a `tc_users` backfill.

   **Read its header first.** It *merges* EagleCapital's existing
   `handle_new_user()` signup trigger rather than replacing it. The upstream
   migration would have silently overwritten that function and broken profile
   creation for every new signup.

2. `supabase/migrations-copier-worker-visibility.sql` — gives `worker_nodes` an
   owner. Without it your own worker is invisible to you and the Trade Copier
   banner reads *"No worker — nothing is executing trades"* forever, no matter
   how healthily the worker is beating.

### Deploy the gateway

```bash
supabase functions deploy copier-gateway --no-verify-jwt
```

`--no-verify-jwt` is required: the worker authenticates with `X-Worker-Key`, not
a user JWT.

### Verify

```bash
export SUPABASE_URL=https://onbirijlwcxykdgxxsvy.supabase.co
export SUPABASE_ANON_KEY=<anon key>
export WORKER_API_KEY=<what you just set>
export WORKER_USER_ID=<your auth.users id>
./scripts/verify-copier-gateway.sh
```

A `404` on `runtime-config` is expected and counts as a pass — it means "nothing
armed yet".

---

## Step 2 — get the folder onto the Windows machine

Either works:

```powershell
git clone <this repo> C:\eagle-capital
cd C:\eagle-capital\worker
```

or copy just the `worker\` folder across. It is self-contained (~370 KB) and
needs nothing outside itself.

**You do not need the old `delta_engine` clone any more.** Its two worker fixes
are permanent code in `worker/` now — see *Changes from upstream* in
[`worker/README.md`](worker/README.md). Leave the old folder as a record, or
delete it; nothing reads it.

Then:

```powershell
.\setup.ps1
notepad .env          # WORKER_API_KEY and WORKER_USER_ID
.\show-config.ps1
```

`WORKER_USER_ID` is the one that catches people out: it is your **EagleCapital**
user id, not the delta_engine one.

```sql
select id, email from auth.users where email = 'you@example.com';
```

A worker with the old id connects fine, heartbeats fine, and then reports zero
accounts — which looks like a broken setup rather than a wrong id.
`show-config.ps1` exists to tell those apart.

---

## Step 3 — harden the machine

It will be on permanently now:

```powershell
# As Administrator, from C:\eagle-capital\worker
.\prepare-host.ps1 -Mt5Root "C:\Program Files"
```

It deliberately touches no firewall rule and forwards no port. The worker only
dials out, so nothing about this machine is reachable from the internet.

By hand:

- **Auto-login** — `netplwiz`, untick "Users must enter a user name and
  password", so it comes back after a reboot with nobody present. Enable
  BitLocker if the machine could be stolen.
- **Tailscale** here and on your laptop/phone, for RDP without exposing
  anything. Never port-forward 3389.

---

## Step 4 — connect the accounts

In EagleCapital: **Trade Copier → Connect an account**, once per account.

| Field | |
|---|---|
| Platform | MetaTrader 5 |
| Broker | Moneta Markets / FTMO / Exness / Fusion Markets |
| Broker server | exactly as the MT5 login dialog shows it |
| Account number | the login |
| Password | investor (read-only) is fine for a **master**; a **follower** needs the full trading password |
| Terminal path | prefilled from the broker — check it matches your install |

All four brokers you have installed are in the preset table:

| Broker | Default path |
|---|---|
| Moneta Markets | `C:\Program Files\Moneta Markets MT5 Terminal\terminal64.exe` |
| FTMO | `C:\Program Files\FTMO Global Markets MT5 Terminal\terminal64.exe` |
| Exness | `C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe` |
| Fusion Markets | `C:\Program Files\Fusion Markets MetaTrader 5\terminal64.exe` |

If a folder is named differently on your machine, edit the field — your value is
kept and never overwritten afterwards.

Terminal paths matter more than they look, and accounts sharing one install pay a
real cost. Both are explained in [`worker/README.md`](worker/README.md).

---

## Step 5 — verify the logins *before* arming anything

A new account reads **Disconnected**. That is the column default, not a verdict:
nothing in the browser or the gateway can reach a broker, so only the worker can
change it. Until a worker answers, Disconnected means *untested*.

```powershell
.\test-connections.ps1
```

Then in **Trade Copier**:

1. The banner turns **Online** with a fresh heartbeat. If it still says *No
   worker*, the Step 1 migration did not run.
2. **Test connection** on each account. The pill goes `Testing…` → `Connected`,
   or to a failure state with the broker's own words underneath it.
3. The PowerShell window prints one `Completed test_connection …` line per test.

Fix every account here — wrong terminal path, wrong server, investor password on
a follower — before anything is armed.

---

## Step 6 — arm a link, start the copier

1. Create a copy link. It is created **disarmed** on purpose.
2. Arm it — the confirmation names both accounts. Read it.
3. Stop `test-connections.ps1` (Ctrl+C) and start the copier:

```powershell
.\run.ps1
```

Then make it survive reboots:

```powershell
.\install-autostart.ps1
Start-ScheduledTask -TaskName EagleCapitalCopier
Get-Content .\logs\supervisor.log -Wait -Tail 20
```

A scheduled task, **not** a Windows Service: MT5 needs a real desktop session,
and services run in Session 0 without one.

---

## Step 7 — first copy

1. Place a trade on the master.
2. Check the **Copy log**: follower ticket present, sane latency, and
   `Login switching` at `0 ms` if each account has its own terminal.

Demo accounts until ten consecutive clean copies. Not nine — the failures worth
catching (a symbol that maps wrong, a follower that rejects a lot size) do not
show up on the first trade.

---

## Then: decommission copymorphic

Once the copier has run clean for a few days:

- Suspend the `copymorphic-api` Render service. Nothing calls it.
- Leave the paused `delta_engine` Supabase project alone, or delete it once
  you're certain nothing there is wanted. It still holds the old accounts and
  execution history.
- The old `C:\delta_engine` clone can go. Nothing reads it.

---

## Later: moving to a VPS

Nothing is rebuilt. On the VPS: copy `worker\`, run `setup.ps1`, reinstall the
broker terminals, run `prepare-host.ps1` and `install-autostart.ps1` unchanged,
copy `.env` and change only `WORKER_NAME` and `WORKER_REGION`.

Run both workers briefly and compare `e2e_ms` before retiring the home box.
`order_ms` is the number that should drop — it is the broker round trip, the only
part of the latency that distance changes. Pick a region near your broker: FTMO
is typically LD4/NY4, Fusion is AU.

---

## When something is wrong

| Symptom | Cause |
|---|---|
| `500 WORKER_API_KEY is not configured` | Step 1 secrets not set. |
| `401 Invalid worker API key` | `.env` and the Supabase secret disagree. |
| `404 No enabled copier relations` | Nothing armed. Normal — the worker registers, heartbeats and idle-polls through it. |
| Account stuck on *Disconnected* | Nothing has tested it. Only a worker can set that column — run `test-connections.ps1`. It is not a credentials verdict. |
| *Test connection* seems to do nothing | It queues a row and returns; a worker has to run it. The pill shows `Testing…` while queued. |
| Banner says *No worker* while the worker is clearly running | The Step 1 migration did not run, so the `worker_nodes` row has no owner and RLS hides it. |
| Worker runs but sees no accounts | `WORKER_USER_ID` is still the delta_engine user id. Run `show-config.ps1`. |
| *Login rejected* | Terminal path first (wrong broker's build), then server name, then password. A follower needs the trading password, not the investor one. |
| Account attaches to the wrong broker | `terminal_path` empty — the worker takes whatever terminal is running. |
| `Login switching` above 0 ms | Accounts share a terminal path; their copies are queuing. |

**Heartbeats stop but the process is alive.** The supervisor restarts a process
that *exits*; it cannot see one that hangs. The UI shows stale then offline, but
nothing pages you. Ask and I'll add a scheduled check that alerts when
`last_heartbeat_at` goes cold.
