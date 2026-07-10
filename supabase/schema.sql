-- EagleCapital — Supabase schema
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run in full anytime — every statement is idempotent (IF NOT EXISTS / DROP...IF EXISTS
-- guards), so adding a new table later just means re-running this whole file again.
--
-- This project is shared with Delta Engine (github.com/richmondazadze/delta_engine) for auth —
-- one Supabase project, one login. Delta Engine's own migration 001_create_users.sql already
-- creates a `tc_users` table + `handle_new_user()`/`on_auth_user_created` trigger to auto-provision
-- a profile row on signup, so EagleCapital doesn't need its own `profiles` table/trigger here —
-- only the broker_connections table below is EagleCapital-specific.

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

-- Prop-firm cockpit data — was browser-local Dexie/IndexedDB, moved here so each signed-in
-- user gets their own accounts/history instead of sharing one browser's local database.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  firm_id text not null,
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
  created_at timestamptz default now()
);
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
