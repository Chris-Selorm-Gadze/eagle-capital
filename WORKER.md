# Wiring the Windows worker to EagleCapital

```
EagleCapital (browser)                            Worker (Windows)
        │                                                │
        │  reads + writes, RLS-scoped                    │  one outbound Postgres connection
        ▼                                                ▼  (fallback: copier-gateway over HTTPS)
   ┌─────────────────── Supabase (one project) ───────────────────┐
   │  tables: trading_accounts, copier_relations, …               │
   │  worker_api.* functions  ◀── copier_worker role ────────────┐│
   │  NOTIFY worker_commands / worker_config  ──── pushed ──────▶││
   │  copier-gateway (Edge Function)  ◀── X-Worker-Key, fallback ─┘│
   └──────────────────────────────────────────────────────────────┘
                                                         │
                                                  MT5 terminals ──▶ broker
```

There is no separate backend service. The worker talks to the database
directly, over one pooled Postgres connection, as a role that can do nothing
but call the `worker_api` functions (`supabase/migrations-worker-direct.sql`).

**Commands are pushed, not polled.** Inserting a `worker_commands` row (a Close,
a flatten, a connection test) fires a Postgres `NOTIFY`, and so does changing a
copy link, symbol mapping, risk profile or account. The worker `LISTEN`s, so a
Close clicked in the app reaches it in milliseconds and a config change is
applied the moment it is saved.

**The worker still only dials out.** The connection is outbound, like a
browser's — no port forwarding, no static IP, no inbound firewall rule.

**The copier-gateway Edge Function is the fallback.** Every call the worker
makes has a gateway twin, and the worker switches to it automatically whenever
the database does not answer, then switches back. The worst case is the old
behaviour, never a lost command. Keep `API_URL` and `WORKER_API_KEY` set.

**Why not the gateway alone:** it charged one Edge Function invocation per
call, and polling made that ~110,000 a day per armed master — 3.3M a month
against the free plan's 500k — with ~100–300 ms per round trip. The direct path
costs no invocations and ~10–40 ms per call.

---

## Why it looks like this

The worker used to talk to a FastAPI service (`delta_engine/backend`) deployed on
Render, backed by its own Supabase project. Three things were wrong with that:
the project was paused, so a live API sat in front of a dead database; each
Supabase project signs JWTs with its own secret, so an EagleCapital login could
never authenticate there; and the service slept on a free tier, cold-starting for
60–90 seconds.

Consolidating the tables into this project removed most of the reason that
service existed. The worker only ever calls **twelve** endpoints, all under
`/internal/*`, and every one is thin CRUD over tables that now live here. The
other 34 were the old dashboard's, and the browser does that work directly now
because RLS already scopes every row.

`copier-gateway` is a faithful port of exactly those twelve. Each now also has a
twin database function in `worker_api`, which the worker calls first; the
gateway remains its fallback (see the top of this file).

---

## Setup

> The worker itself — install, run, troubleshoot — is documented in
> [`worker/README.md`](worker/README.md). It lives in this repo and is
> self-contained. This section covers the EagleCapital side only.

### 1. Run the schema

`supabase/delta-engine-schema.sql` is idempotent — safe to run in full, and safe
to re-run. Paste it into **Supabase → SQL Editor → New query** and run it.

It creates the copier's 11 tables, 5 enums and their RLS policies, and backfills
a `tc_users` row for every existing account.

> **Read the header comment first.** It *merges* EagleCapital's existing
> `handle_new_user()` signup trigger rather than replacing it. The upstream Delta
> Engine migration would have silently overwritten that function and broken
> profile creation for every new signup.

### 2. Set two secrets

**Supabase dashboard → Project Settings → Edge Functions → Secrets.** Both values
are in `.secrets.local`.

| Secret | Notes |
|---|---|
| `WORKER_API_KEY` | The worker sends it as `X-Worker-Key`. Treat it like a root credential — it unlocks every broker password in `runtime-config`. |
| `ENCRYPTION_KEY` | 64 hex characters. **Cannot be rotated casually** — it encrypts stored broker passwords, and changing it makes every connected account unreadable until re-entered. |

Until both are set the gateway fails closed with
`500 {"detail":"WORKER_API_KEY is not configured."}` on every `/internal` route.
That is the intended behaviour, not a fault.

### 3. Deploy the gateway

Already deployed. To redeploy after a change:

```bash
supabase functions deploy copier-gateway --no-verify-jwt
```

`--no-verify-jwt` is required: the worker authenticates with `X-Worker-Key`, not
a user JWT. Every `/internal` route checks that key itself.

### 4. The direct database path

Run `supabase/migrations-worker-direct.sql` in the SQL editor, then give its
role a password (deliberately not in the file):

```sql
alter role copier_worker with password '<long random string>';
```

The role has **no table privileges**. Everything it can do is a `worker_api`
function scoped to one user id, and the browser's roles cannot call any of
them.

On the worker, in `worker/.env`:

```ini
# Supabase → Connect → Session pooler; user copier_worker.<project-ref>
WORKER_DATABASE_URL=postgresql://copier_worker.onbirijlwcxykdgxxsvy:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
# Same value as the Supabase secret. Lets the worker decrypt broker passwords
# itself, so config is read directly too. Without it, only config uses the gateway.
ENCRYPTION_KEY=<64 hex characters>
```

Use the **Session** pooler (port 5432). Transaction mode (6543) cannot carry
`LISTEN`, so commands would fall back to polling. The direct `db.<ref>` host
works too, if the Windows network has IPv6.

`worker\show-config.ps1` checks this path on its own — connection, decryption,
and the push channel — rather than letting the gateway fallback hide a mistake.
Once running, the Trade Copier page's worker row reads **Direct · instant
commands**.

### 5. Verify

```bash
export SUPABASE_URL=https://onbirijlwcxykdgxxsvy.supabase.co
export SUPABASE_ANON_KEY=<anon key>
export WORKER_API_KEY=<the secret you just set>
export WORKER_USER_ID=<your auth.users id>
./scripts/verify-copier-gateway.sh
```

This exercises all twelve endpoints in the shapes the worker sends them. Do this
before starting the worker — a wiring mistake is much easier to read here than
halfway through a live copy.

### 6. The Windows machine

**Prerequisites:** Windows 10+, Python 3.9–3.12, one MT5 install **per account**
(see below), "Allow algorithmic trading" enabled in each terminal.

`worker/.env`:

```ini
API_URL=https://onbirijlwcxykdgxxsvy.supabase.co/functions/v1/copier-gateway
WORKER_API_KEY=<same value as the Supabase secret>
WORKER_USER_ID=<your EagleCapital user id>
WORKER_NAME=eagle-win-01
WORKER_REGION=<where the box physically sits>
WORKER_CAPACITY=5

DELTA_CONFIG_SOURCE=api

# Event-driven master detection. Off by default upstream; turn it on once the
# EA below is installed — it replaces the 50ms poll with single-digit ms.
WORKER_SIGNAL_BUS_ENABLED=1
```

Find your user id with:

```sql
select id, email from auth.users where email = 'you@example.com';
```

> **One worker serves one user.** The worker refuses to start without a
> `WORKER_USER_ID` and sends it on every call. Multi-tenancy needs the
> orchestrator (`worker_sessions`) finished first.

---

## The latency fix — one MT5 install per account

This is the single most important choice on the machine, and the answer to "the
copier was fast but switching accounts was slow".

MT5 allows **one active login per terminal instance**. If two accounts share a
terminal path, the worker logs out and back in between them on every trade. That
swap is recorded as `switch_ms` on each execution event, and it is pure added
latency.

Give each account its own portable MT5 folder:

```
C:\MT5\acct-51234567\terminal64.exe
C:\MT5\acct-51234568\terminal64.exe
```

Set that path as the account's **Terminal path** when you connect it.
`terminal_pool.py` then allocates a dedicated warm session per distinct path and
`switch_ms` drops to zero.

The **Copy log** on the Trade Copier page shows the median switch cost and says
which case you are in. Anything above zero means two accounts share an install.

### The signal bus EA

Copy `worker/mql5/DeltaEngineSignalBus.mq5` into the **master** terminal, compile
it, attach it to any chart. It writes position changes to a JSONL file the engine
tails, making detection event-driven rather than polled.

### Keep it running

NSSM or Task Scheduler, restarting the loop on crash. A dead copier that still
looks alive is the worst state this system has — which is why the Trade Copier
page leads with worker liveness and says plainly when heartbeats stop.

---

## Bring-up order

The order matters, and an earlier version of this list had it wrong. Accounts are
connected and **verified before** anything is armed — arming is what starts
placing real orders, so it must never be a prerequisite for testing a login.

1. Run the schema, then `migrations-copier-worker-visibility.sql`, then
   `migrations-manual-close.sql` (lets the Live Trading page's **Close**
   buttons queue a `close_position` command — without it the insert is refused).
   Also run `migrations-ledger-opening.sql` (adds `accounts.opening_balance_at`,
   so broker-created accounts stop double-counting their backfilled trades),
   and `migrations-worker-direct.sql` (the worker's direct path — step 4 above).
2. Set the two secrets.
3. Run `scripts/verify-copier-gateway.sh` — all green.
4. `worker\setup.ps1` on the Windows box, fill in `.env`, then
   `worker\show-config.ps1` to confirm the control plane sees you.
5. Sign into EagleCapital, open **Trade Copier**. The banner reads
   *"Nothing is executing trades."* Correct at this stage.
6. Connect two **demo** accounts, each with its own terminal path.
7. Start `worker\test-connections.ps1`. The banner flips to **Online** within
   30 seconds. **Test connection** on each account; wait for both to read
   *Connected*. Fix every account here.
8. Create a copy link. It is created **disarmed** — deliberately.
9. Arm it. Stop `test-connections.ps1`, start `worker\run.ps1`.
10. Place a trade on the master. Watch the Copy log: follower ticket present,
    sane latency, `Login switching` reading `0 ms`.

Only after ten consecutive clean copies should a real-money account go near this.

---

## What the browser does vs. what the gateway does

Worth knowing when debugging, because "the copier is down" now has two very
different meanings.

| Action | Path |
|---|---|
| View accounts, links, risk, copy log | Direct Supabase read (RLS) |
| Create / arm / disarm / delete a copy link | Direct Supabase write (RLS) |
| Unlock a risk profile, set limits | Direct Supabase write (RLS) |
| Close, flatten, test a connection | `worker_commands` row → `NOTIFY` → worker |
| **Connect an account** | **Gateway** — needs `ENCRYPTION_KEY` |
| Everything the worker does | `worker_api.*` over its Postgres connection; **gateway** `/internal/*` as the fallback |

So the page keeps working — reads and link management included — even if the
gateway is entirely broken. Only credential entry depends on it, and the worker
only while its database connection is down.

---

## Known gaps

- **The worker can read every broker password.** On the direct path it holds
  `ENCRYPTION_KEY` and decrypts them; through the gateway it receives them as
  plaintext over TLS. Either way the Windows machine, its `.env` and its
  `copier_worker` password are as sensitive as the passwords themselves.
  Inherent to MT5 — the terminal needs the password to log in — not an artifact
  of this design. Fine while the only account is yours; not fine for customers.
- **The `copier_worker` role is scoped per call, not per user.** Its functions
  take the user id as an argument, the same trust `X-Worker-Key` carries. One
  role per customer is the step before multi-tenancy.
- **The orchestrator does not assign work.** `worker_sessions` rows exist and the
  gateway writes them, but the worker does not consume them. One worker, one
  user.
- **No alerting on heartbeat loss.** The UI shows it; nothing pages you.
