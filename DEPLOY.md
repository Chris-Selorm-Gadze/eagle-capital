# Deploy steps for this change

Two things in this change do not take effect from a `git push` alone. Until both
are done, **account deletion and the AI usage limit will fail at runtime** —
the client will try to write to tables that don't exist yet.

## 1. Run the schema

`supabase/schema.sql` is idempotent — safe to re-run in full. Paste the whole
file into **Supabase → SQL Editor → New query** and run it.

New in this revision:

| Object | Why |
|---|---|
| `account_deletions` | Holds a pending deletion and its purge date (30-day window). |
| `ai_usage` | Per-user meter for the insights function's daily quota. |
| `delete own profile` policy on `eaglecapital_profiles` | **Bug fix.** There was no DELETE policy, so erasing a profile silently did nothing — RLS turns a blocked delete into a no-op, not an error. A "deleted" account kept a username derived from its email address, readable by every signed-in user. |
| 17 indexes | Every table had only its primary key, so each RLS-filtered read was a sequential scan. |

## 2. Deploy the purge function

This is the half of deletion a browser cannot perform: removing the `auth.users`
row (service-role only) and the Storage objects (no table cascade reaches them).

```bash
supabase functions deploy purge-deleted-accounts --no-verify-jwt
```

Then set `PURGE_SECRET` **in the dashboard** — Project Settings → Edge Functions →
Secrets. `supabase secrets set` returns 403 unless you are a project owner, so the
CLI path is not usable on a non-owner account. The value is in `.secrets.local`.

Note the same value is embedded in the pg_cron job; rotating means rotating both.

`--no-verify-jwt` is required because a scheduler has no user JWT; the function
authenticates on the `x-purge-secret` header instead and returns 403 without it.

Then schedule it daily — **Supabase Dashboard → Database → Cron**, or:

```sql
select cron.schedule('purge-deleted-accounts', '17 3 * * *', $$
  select net.http_post(
    url := '<project-url>/functions/v1/purge-deleted-accounts',
    headers := '{"x-purge-secret": "<the secret>"}'::jsonb
  );
$$);
```

Until this is scheduled, deletion requests are recorded and shown to the user
correctly, and the 30-day window runs — but nothing is ever actually erased.
**Schedule it before telling anyone their data will be deleted.**

## 3. Redeploy the insights function

It now enforces a per-user daily quota, caps the request body, and times out a
stalled provider call. It reads the caller's id from the JWT, so it still needs
the default `verify_jwt` behaviour (no flag).

```bash
supabase functions deploy trading-insights
# optional — defaults to 10/user/day
supabase secrets set INSIGHTS_DAILY_LIMIT=10
```

## Verifying

```sql
-- 1. the policy that was missing
select polname from pg_policy
where polrelid = 'public.eaglecapital_profiles'::regclass;
-- expect: read profiles, insert own profile, update own profile, delete own profile

-- 2. the new tables
select to_regclass('public.account_deletions'), to_regclass('public.ai_usage');
```

Then in the app: **Settings → Delete my account** should schedule rather than
erase, sign you out, and show a "scheduled for deletion" banner with a "Keep my
account" button when you sign back in.


## 3. Wire the trade copier

Full detail in **WORKER.md**. Two steps here, neither performed by a `git push`.

1. Run `supabase/delta-engine-schema.sql` in the SQL editor. It moves Delta
   Engine's 11 tables into this Supabase project so the copier and the app share
   one login and one database. Read its header first — it deliberately *merges*
   the existing `handle_new_user()` signup trigger instead of replacing it.
2. Set two Edge Function secrets in the dashboard (Project Settings → Edge
   Functions → Secrets), both recorded in `.secrets.local`:
   - `WORKER_API_KEY` — the shared secret the Windows worker presents.
   - `ENCRYPTION_KEY` — 64 hex chars, AES-256-GCM for broker passwords. Cannot
     be rotated casually; changing it orphans every stored credential.

Then verify with `./scripts/verify-copier-gateway.sh`.

There is no separate backend to deploy any more. The copier's control plane is
the `copier-gateway` Edge Function in this project — `supabase functions deploy
copier-gateway --no-verify-jwt`. The old Render service and its paused Supabase
project are no longer in the path.

Until step 1 runs, the Trade Copier page loads and shows a read error — the
tables it reads do not exist yet. That is the intended failure, not a bug.
