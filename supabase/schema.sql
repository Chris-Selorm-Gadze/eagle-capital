-- EagleCapital — Supabase schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run in full anytime — every statement is idempotent (IF NOT EXISTS / DROP...IF EXISTS
-- guards), so adding a new table later just means re-running this whole file again.
--
-- This project is shared with Delta Engine (github.com/richmondazadze/delta_engine) for auth —
-- one Supabase project, one login. Delta Engine's own migration 001_create_users.sql already
-- creates a `tc_users` table + `handle_new_user()`/`on_auth_user_created` trigger to auto-provision
-- a profile row on signup — that table is Delta Engine's own, not shared here. EagleCapital's
-- display-name/username (see eaglecapital_profiles near the bottom of this file) is deliberately
-- a separate, app-scoped identity rather than reading/writing tc_users, since this file can't see
-- (or safely migrate) a table owned by another repo.

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  broker_id text not null,       -- e.g. 'tradovate', 'rithmic', 'mt4', 'other'
  label text not null,           -- e.g. "Tradovate — main account"
  status text not null default 'pending', -- 'pending' | 'connected' | 'error' | 'disconnected'
  created_at timestamptz default now()
);
alter table public.broker_connections enable row level security;
drop policy if exists "own connections" on public.broker_connections;
create policy "own connections" on public.broker_connections for all using (auth.uid() = user_id);

-- Broker sync: links a connection to a specific prop account and tracks live sync state.
-- account_id is nullable — a connection can exist before being pointed at a specific Account row.
-- unique(account_id) stops two connections fighting over the same account's balance.
alter table public.broker_connections add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.broker_connections add column if not exists last_synced_at timestamptz;
alter table public.broker_connections add column if not exists last_error text;
create unique index if not exists broker_connections_account_id_key on public.broker_connections(account_id) where account_id is not null;

-- Broker login material (Tradovate username/password/API key, etc.) — never exposed to the
-- anon-key browser client, not even to the row's own owning user. RLS is enabled but
-- deliberately has ZERO policies: only a service-role key (held only by the broker-sync backend,
-- which legitimately bypasses RLS) can read/write this table. The stored payload is also
-- application-layer AES-256-GCM encrypted — RLS lockout alone isn't treated as sufficient for
-- real broker login credentials.
create table if not exists public.broker_credentials (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.broker_connections(id) on delete cascade not null unique,
  user_id uuid references auth.users(id) on delete cascade not null, -- defense-in-depth only; no policy grants access via it
  ciphertext text not null, -- base64 AES-256-GCM ciphertext of the JSON credential payload
  iv text not null,         -- base64, random 12 bytes per encryption
  auth_tag text not null,   -- base64 GCM auth tag
  key_version integer not null default 1, -- lets the backend's encryption key be rotated later without a big-bang migration
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.broker_credentials enable row level security;
-- intentionally no create policy — see comment above

-- CopyFactory trade copier: MetaApi's own accountId/server/login for a connection, populated
-- once at credential-intake time so copier routes don't need to decrypt broker_credentials on
-- every request. Only populated for MT5 (MetaApi) connections — Tradovate rows leave these null.
alter table public.broker_connections add column if not exists metaapi_account_id text;
alter table public.broker_connections add column if not exists broker_server text;
alter table public.broker_connections add column if not exists account_login text;

-- CopyFactory itself is the source of truth for strategies/subscriptions — this table only
-- stores what CopyFactory has no field for: a human label, and "temporarily disabled but
-- remembered" local bookkeeping (a CopyFactory subscription either exists or is gone entirely).
create table if not exists public.copier_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  master_connection_id uuid references public.broker_connections(id) on delete cascade not null,
  follower_connection_id uuid references public.broker_connections(id) on delete cascade not null,
  label text,
  risk_mode text not null default 'multiplier',  -- 'multiplier' | 'risk_percent' only
  multiplier numeric,
  max_trade_risk numeric,                         -- CopyFactory fraction-of-1
  is_enabled boolean not null default false,       -- local bookkeeping: should this exist in
                                                    -- CopyFactory right now (see disable/enable)
  created_at timestamptz default now(),
  unique (master_connection_id, follower_connection_id)
);
alter table public.copier_links enable row level security;
drop policy if exists "own copier links" on public.copier_links;
create policy "own copier links" on public.copier_links for all using (auth.uid() = user_id);

-- Prop-firm cockpit data — was browser-local Dexie/IndexedDB, moved here so each signed-in
-- user gets their own accounts/history instead of sharing one browser's local database.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  firm_id text,
  custom_firm_name text,
  label text not null,
  account_number text,
  size numeric not null,
  balance numeric not null,
  highest_balance numeric not null,
  currency text default 'USD',
  stage text not null,
  max_drawdown numeric,
  daily_loss_limit numeric,
  profit_target numeric,
  trailing_drawdown boolean,
  min_trading_days integer,
  funded_date date,
  active boolean not null default true,
  notes text,
  cost numeric,
  blown_reason text,
  firm text,
  model text,
  platform text,
  qualifying_cycles integer,
  scale_events integer,
  payouts_done integer,
  cumulative_paid numeric,
  created_at timestamptz default now()
);
alter table public.accounts enable row level security;
drop policy if exists "own accounts" on public.accounts;
create policy "own accounts" on public.accounts for all using (auth.uid() = user_id);

-- 'live' stage accounts (real/personal broker accounts, not under any prop firm's rules) have no
-- firm at all — safe to re-run, a no-op once already nullable.
alter table public.accounts alter column firm_id drop not null;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  date date not null,
  pnl numeric not null,
  trades integer not null,
  consecutive_losses integer not null,
  highest_unrealized numeric,
  rules_followed boolean not null,
  notes text,
  created_at timestamptz default now()
);
alter table public.sessions enable row level security;
drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions for all using (auth.uid() = user_id);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  date date not null,
  requested numeric not null,
  received numeric not null,
  created_at timestamptz default now()
);
alter table public.payouts enable row level security;
drop policy if exists "own payouts" on public.payouts;
create policy "own payouts" on public.payouts for all using (auth.uid() = user_id);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  date date not null,
  growth_pct numeric not null,
  created_at timestamptz default now()
);
alter table public.rewards enable row level security;
drop policy if exists "own rewards" on public.rewards;
create policy "own rewards" on public.rewards for all using (auth.uid() = user_id);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete cascade not null,
  date date not null,
  symbol text not null,
  side text not null,
  qty numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  entry_time timestamptz not null,
  exit_time timestamptz not null,
  fees numeric,
  pnl numeric not null,
  notes text,
  stop_loss numeric,
  profit_target numeric,
  rating smallint,
  tags text[],
  created_at timestamptz default now()
);
alter table public.trades add column if not exists stop_loss numeric;
alter table public.trades add column if not exists profit_target numeric;
alter table public.trades add column if not exists rating smallint;
alter table public.trades add column if not exists tags text[];
alter table public.trades enable row level security;
drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades for all using (auth.uid() = user_id);

-- Tracks the trader, not a specific prop-firm account — one card per user per day.
create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  day_of_week text,
  instrument text,
  session text,
  trade_ids uuid[], -- real logged trades this report is written about
  image_urls text[], -- screenshots of the attached trades
  trades_taken integer,
  wins integer,
  losses integer,
  net_pnl text,
  largest_win text,
  largest_loss text,
  max_consecutive_losses integer,
  rule_1 boolean, rule_2 boolean, rule_3 boolean, rule_4 boolean, rule_5 boolean,
  rule_6 boolean, rule_7 boolean, rule_8 boolean, rule_9 boolean, rule_10 boolean,
  grade text,
  fit_state text,
  plan_or_feelings text,
  why_problem text,
  why_1 text, why_2 text, why_3 text, why_4 text, why_5 text,
  root_cause text,
  counter_measure text,
  did_well text,
  must_improve text,
  passed_setup text,
  allowed_tomorrow text,
  note_to_tomorrow text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, date)
);
alter table public.report_cards add column if not exists trade_ids uuid[];
alter table public.report_cards add column if not exists image_urls text[];

-- Replaces the fixed rule_1..rule_10 checklist (generic text hardcoded in the app, same for every
-- user) with a map keyed by the user's own trading_rules.id — {"<rule-id>": true/false}. The old
-- rule_1..rule_10 columns are left in place (not dropped) so already-saved entries keep their
-- historical data at the database level; the app just no longer reads/writes them, since that
-- data has no way to map onto a user's own rules (the old checklist wasn't tied to any rule
-- identity, just fixed positions).
alter table public.report_cards add column if not exists rule_checks jsonb not null default '{}'::jsonb;

alter table public.report_cards enable row level security;
drop policy if exists "own report cards" on public.report_cards;
create policy "own report cards" on public.report_cards for all using (auth.uid() = user_id);

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  grade text, -- 'A+' | 'A' | 'B' | 'C'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.playbooks enable row level security;
drop policy if exists "own playbooks" on public.playbooks;
create policy "own playbooks" on public.playbooks for all using (auth.uid() = user_id);

create table if not exists public.playbook_examples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  playbook_id uuid references public.playbooks(id) on delete cascade not null,
  trade_id uuid references public.trades(id) on delete set null, -- optional link to a real logged trade
  note text,
  image_url text, -- Supabase Storage public URL, optional
  created_at timestamptz default now()
);
alter table public.playbook_examples enable row level security;
drop policy if exists "own playbook examples" on public.playbook_examples;
create policy "own playbook examples" on public.playbook_examples for all using (auth.uid() = user_id);

-- Storage bucket for playbook example screenshots. Public bucket (simplest — <img src>
-- works with no signed-URL plumbing) but objects live under a per-user folder with a random
-- filename, and RLS still restricts who can upload/delete to that folder's owner.
insert into storage.buckets (id, name, public) values ('playbook-images', 'playbook-images', true) on conflict (id) do nothing;

drop policy if exists "own playbook images read" on storage.objects;
create policy "own playbook images read" on storage.objects for select using (bucket_id = 'playbook-images' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "own playbook images write" on storage.objects;
create policy "own playbook images write" on storage.objects for insert with check (bucket_id = 'playbook-images' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "own playbook images delete" on storage.objects;
create policy "own playbook images delete" on storage.objects for delete using (bucket_id = 'playbook-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Personal trading rules — under Trader Management. Independent of any prop firm's rules.
create table if not exists public.trading_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  is_core boolean not null default false,
  created_at timestamptz default now()
);
alter table public.trading_rules enable row level security;
drop policy if exists "own trading rules" on public.trading_rules;
create policy "own trading rules" on public.trading_rules for all using (auth.uid() = user_id);

-- AI Trading Insights — on-demand coaching digests generated from the user's own trade/report
-- card/playbook history. One row per "Generate Insights" click, never edited after generation.
create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  range_start date not null,
  range_end date not null,
  range_preset text not null, -- 'last_30' | 'last_60' | 'last_90' | 'all_time'

  trade_count integer not null,
  report_card_count integer not null,

  model text not null, -- exact Claude model string used, captured per-row for correct attribution
  response jsonb not null, -- {summary, painPoints[], strengths[], recommendations[]}
  request_payload jsonb, -- the aggregated payload sent — kept for later traceability

  created_at timestamptz default now()
);
alter table public.ai_insights enable row level security;
drop policy if exists "own ai insights" on public.ai_insights;
create policy "own ai insights" on public.ai_insights for all using (auth.uid() = user_id);

-- Editable display username shown in the top nav (avatar + name), auto-generated from the
-- email's local part on first login and editable afterward. App-scoped on purpose — see the note
-- at the top of this file on why this doesn't read/write Delta Engine's tc_users.
create table if not exists public.eaglecapital_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz default now()
);
alter table public.eaglecapital_profiles enable row level security;
-- Readable by any signed-in user (not just the owner) so the client can check "is this username
-- taken" before saving — usernames are a public-ish display handle, not sensitive data.
drop policy if exists "read profiles" on public.eaglecapital_profiles;
create policy "read profiles" on public.eaglecapital_profiles for select using (auth.role() = 'authenticated');
drop policy if exists "insert own profile" on public.eaglecapital_profiles;
create policy "insert own profile" on public.eaglecapital_profiles for insert with check (auth.uid() = user_id);
drop policy if exists "update own profile" on public.eaglecapital_profiles;
create policy "update own profile" on public.eaglecapital_profiles for update using (auth.uid() = user_id);

-- Splits "one login/session" (broker_connections, unchanged above) from "one tradeable account
-- under that session". MT4/5 has exactly one account per login, so those connections keep using
-- the direct metaapi_account_id/broker_server/account_login columns added earlier in this file —
-- one row here would just duplicate that. Futures brokers (Tradovate, Topstep, Rithmic) don't fit
-- that shape: you authenticate once and the broker hands back a *list* of accounts under that same
-- login, so one connection needs to fan out to many rows here. Asset class itself isn't stored —
-- it's derived from broker_connections.broker_id via BROKERS in brokerCatalog.ts, so there's one
-- source of truth instead of a column that can drift out of sync with the catalog.
create table if not exists public.broker_connection_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  connection_id uuid references public.broker_connections(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete set null,
  external_account_id text not null,  -- the broker's own account id/name, e.g. Tradovate's numeric id
  external_label text,                -- e.g. "APEX-12345-01", as the broker itself names it
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  unique (connection_id, external_account_id)
);
alter table public.broker_connection_accounts enable row level security;
drop policy if exists "own broker connection accounts" on public.broker_connection_accounts;
create policy "own broker connection accounts" on public.broker_connection_accounts for all using (auth.uid() = user_id);
