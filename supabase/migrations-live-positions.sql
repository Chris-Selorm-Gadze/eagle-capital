-- Live positions — run once against the live database.
-- Folded into delta-engine-schema.sql in the same change; this file is the
-- delta for a database that already exists.

-- ── live_positions — what is open right now, per account ────────────────────
-- One row per trading account, replaced whole on every report. Open positions
-- are a snapshot, not a log: a row-per-position table would need delete+insert
-- to drop what closed, and a reader landing between the two would see an
-- account half-emptied. One jsonb array per account makes each report a single
-- atomic write, and one realtime-sized event instead of N.
--
-- reported_at is the freshness the page shows, and it is deliberately not
-- assumed to be "now". MT5 lets one login attach per terminal, so the worker
-- can only read the account it is currently on: a master being copied is read
-- every cycle, while an idle follower is read when the balance sweep visits it.
-- The page states each account's age rather than implying all of it is current.
create table if not exists public.live_positions (
  id uuid primary key default gen_random_uuid(),
  trading_account_id uuid not null unique references public.trading_accounts(id) on delete cascade,
  user_id uuid not null references public.tc_users(id) on delete cascade,
  positions jsonb not null default '[]'::jsonb,
  balance numeric(14,2),
  equity numeric(14,2),
  currency varchar(20),
  reported_at timestamptz not null default now()
);

create index if not exists idx_live_positions_user on public.live_positions(user_id);


alter table public.live_positions enable row level security;

drop policy if exists "read own live positions" on public.live_positions;
create policy "read own live positions" on public.live_positions for select using (auth.uid() = user_id);
