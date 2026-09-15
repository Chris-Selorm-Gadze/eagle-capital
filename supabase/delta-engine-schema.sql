-- ============================================================================
-- Delta Engine schema, consolidated into the EagleCapital Supabase project.
--
-- WHY THIS FILE EXISTS
-- The trade copier's control plane (the FastAPI service at copymorphic-api)
-- was built against its own Supabase project, `delta_engine`. That project is
-- PAUSED and unreachable, and because each Supabase project signs JWTs with its
-- own secret, an EagleCapital session token fails there with
-- "Signature verification failed". Two projects therefore meant two user
-- identities for the same human, and a dead database behind a live API.
--
-- Consolidating removes both problems at once: the copier's tables live here,
-- alongside the rest of the app, keyed on the same auth.users. One login, one
-- database, foreign keys intact.
--
-- SOURCE
-- Derived from delta_engine/supabase/migrations/001..018. Squashed into one
-- idempotent file to match this project's existing schema.sql convention —
-- safe to re-run in full.
--
-- DELIBERATE DIFFERENCES FROM THE UPSTREAM MIGRATIONS
--   1. handle_new_user() is MERGED, not replaced. EagleCapital already had a
--      trigger of that name writing public.profiles on signup. Upstream 001
--      would have silently overwritten it and broken profile creation for every
--      new user. The function below does both inserts.
--   2. platform_enum includes 'tradovate' at creation. Upstream adds it later
--      via ALTER TYPE ADD VALUE, which cannot run in the same transaction that
--      created the type.
--   3. RLS added for worker_commands, compare_broker_profiles and
--      account_equity_snapshots. Upstream leaves these without RLS, which is
--      survivable in an isolated project but not here: PostgREST is exposed and
--      the anon key ships inside the browser bundle.
--   4. Existing auth.users are backfilled into tc_users at the end. The upstream
--      trigger only fires for new signups.
-- ============================================================================


-- ── Enums ───────────────────────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS, hence the guards.

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'platform_enum') then
    create type public.platform_enum as enum (
      'mt5', 'mt4', 'ctrader', 'dxtrade', 'matchtrader',
      'tradelocker', 'ninjatrader', 'tradingview', 'tradovate'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'connection_status_enum') then
    create type public.connection_status_enum as enum (
      'connected', 'disconnected', 'auth_failed', 'terminal_unavailable',
      'broker_unavailable', 'disabled', 'locked'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'account_mode_enum') then
    create type public.account_mode_enum as enum ('hedging', 'netting', 'unknown');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'risk_mode_enum') then
    create type public.risk_mode_enum as enum ('multiplier', 'fixed_lot', 'equity_ratio', 'risk_percent');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'execution_status_enum') then
    create type public.execution_status_enum as enum (
      'pending', 'success', 'failed', 'rejected', 'skipped_risk',
      'skipped_slippage', 'duplicate_ignored', 'partial', 'closed', 'modified'
    );
  end if;
end $$;


-- ── Shared trigger function ─────────────────────────────────────────────────

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ── tc_users — the copier's user row, 1:1 with auth.users ───────────────────

create table if not exists public.tc_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email varchar(255) unique not null,
  full_name varchar(255),
  stripe_customer_id varchar(255),
  stripe_subscription_id varchar(255),
  subscription_plan varchar(50) default 'free',
  is_active_subscriber boolean default false,
  account_limit integer default 1,
  follower_limit integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.tc_users add column if not exists stripe_subscription_id varchar(255);
alter table public.tc_users alter column account_limit set default 1;
alter table public.tc_users alter column follower_limit set default 1;

comment on column public.tc_users.account_limit is 'Max linked trading accounts; synced from Stripe subscription quantity on paid plans.';
comment on column public.tc_users.follower_limit is 'Max copier links; defaults to match account_limit on paid plans.';

create index if not exists idx_tc_users_stripe_customer on public.tc_users(stripe_customer_id) where stripe_customer_id is not null;

drop trigger if exists update_tc_users_updated_at on public.tc_users;
create trigger update_tc_users_updated_at before update on public.tc_users
  for each row execute function public.update_updated_at_column();


-- ── Signup hook — MERGED, see header note 1 ─────────────────────────────────
-- EagleCapital's original body inserted into public.profiles only. That insert
-- is preserved verbatim below; the tc_users insert is the addition. Both are
-- ON CONFLICT DO NOTHING so a replayed trigger can never fail a signup.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.tc_users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- The trigger itself already exists and is left alone; recreated only if absent.
do $$ begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
      and t.tgname = 'on_auth_user_created' and not t.tgisinternal
  ) then
    create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;


-- ── trading_accounts ────────────────────────────────────────────────────────

create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tc_users(id) on delete cascade,
  platform public.platform_enum not null default 'mt5',
  account_number varchar(64) not null,
  broker_server varchar(255) not null,
  encrypted_password text not null,
  account_label varchar(100),
  account_mode public.account_mode_enum default 'unknown',
  connection_status public.connection_status_enum default 'disconnected',
  balance numeric(14,2),
  equity numeric(14,2),
  currency varchar(20),
  leverage integer,
  last_connected_at timestamptz,
  last_error text,
  is_enabled boolean default true,
  terminal_path text,
  api_base_url text,
  account_metadata jsonb not null default '{}'::jsonb,
  last_balance_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.trading_accounts add column if not exists terminal_path text;
alter table public.trading_accounts add column if not exists api_base_url text;
alter table public.trading_accounts add column if not exists account_metadata jsonb not null default '{}'::jsonb;
alter table public.trading_accounts add column if not exists last_balance_sync_at timestamptz;

comment on column public.trading_accounts.api_base_url is 'REST API root for non-terminal platforms (e.g. https://dxtrade.ftmo.com).';
comment on column public.trading_accounts.terminal_path is 'Per-account MT5 install. A UNIQUE path per account is what removes switch_ms — see terminal_pool.py.';

create index if not exists idx_trading_accounts_user on public.trading_accounts(user_id);
create index if not exists idx_trading_accounts_status on public.trading_accounts(connection_status);
create index if not exists idx_trading_accounts_platform on public.trading_accounts(platform);
create unique index if not exists idx_trading_accounts_unique_login
  on public.trading_accounts(user_id, platform, account_number, broker_server);
create index if not exists idx_trading_accounts_metadata_firm
  on public.trading_accounts ((account_metadata->>'firm_slug')) where platform = 'dxtrade';

drop trigger if exists update_trading_accounts_updated_at on public.trading_accounts;
create trigger update_trading_accounts_updated_at before update on public.trading_accounts
  for each row execute function public.update_updated_at_column();


-- ── copier_relations ────────────────────────────────────────────────────────

create table if not exists public.copier_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tc_users(id) on delete cascade,
  master_account_id uuid not null references public.trading_accounts(id) on delete cascade,
  follower_account_id uuid not null references public.trading_accounts(id) on delete cascade,
  label varchar(100),
  risk_mode public.risk_mode_enum default 'multiplier',
  multiplier numeric(8,4) default 1.0000,
  fixed_lot_size numeric(10,2) default 0.01,
  copy_sl boolean default true,
  copy_tp boolean default true,
  copy_closes boolean default true,
  copy_modifications boolean default true,
  max_signal_age_ms integer default 3000,
  is_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_master_follower_pair unique (master_account_id, follower_account_id),
  constraint check_not_self_copy check (master_account_id <> follower_account_id)
);

create index if not exists idx_copier_relations_user on public.copier_relations(user_id);
create index if not exists idx_copier_relations_master on public.copier_relations(master_account_id);
create index if not exists idx_copier_relations_follower on public.copier_relations(follower_account_id);
create index if not exists idx_copier_relations_enabled on public.copier_relations(is_enabled) where is_enabled = true;

drop trigger if exists update_copier_relations_updated_at on public.copier_relations;
create trigger update_copier_relations_updated_at before update on public.copier_relations
  for each row execute function public.update_updated_at_column();


-- ── symbol_mappings ─────────────────────────────────────────────────────────

create table if not exists public.symbol_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tc_users(id) on delete cascade,
  master_account_id uuid references public.trading_accounts(id) on delete cascade,
  follower_account_id uuid references public.trading_accounts(id) on delete cascade,
  master_symbol varchar(50) not null,
  follower_symbol varchar(50) not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_symbol_mappings_user on public.symbol_mappings(user_id);
create index if not exists idx_symbol_mappings_master_account on public.symbol_mappings(master_account_id);
create index if not exists idx_symbol_mappings_follower_account on public.symbol_mappings(follower_account_id);
create unique index if not exists idx_symbol_mappings_unique
  on public.symbol_mappings(master_account_id, follower_account_id, master_symbol) where is_active = true;


-- ── risk_profiles ───────────────────────────────────────────────────────────

create table if not exists public.risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tc_users(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  max_daily_loss numeric(14,2),
  max_total_loss numeric(14,2),
  min_equity numeric(14,2),
  max_lot_per_trade numeric(10,2),
  max_open_positions integer default 10,
  max_trades_per_day integer,
  allowed_symbols text[],
  blocked_symbols text[],
  news_pause_enabled boolean default false,
  lock_after_loss boolean default true,
  auto_flatten_enabled boolean default true,
  is_locked boolean default false,
  locked_reason text,
  locked_at timestamptz,
  daily_loss_accumulated numeric(14,2) default 0.00,
  daily_trades_count integer default 0,
  daily_reset_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_risk_profiles_user on public.risk_profiles(user_id);
create index if not exists idx_risk_profiles_account on public.risk_profiles(account_id);
create index if not exists idx_risk_profiles_locked on public.risk_profiles(is_locked) where is_locked = true;
create unique index if not exists idx_risk_profiles_unique_account on public.risk_profiles(account_id);

drop trigger if exists update_risk_profiles_updated_at on public.risk_profiles;
create trigger update_risk_profiles_updated_at before update on public.risk_profiles
  for each row execute function public.update_updated_at_column();


-- ── execution_events — the audit trail, and the latency record ──────────────
-- switch_ms / order_ms / e2e_ms are what prove the copier's speed claims.

create table if not exists public.execution_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tc_users(id) on delete cascade,
  copier_relation_id uuid references public.copier_relations(id) on delete set null,
  master_account_id uuid references public.trading_accounts(id) on delete set null,
  follower_account_id uuid references public.trading_accounts(id) on delete set null,
  event_type varchar(50) not null,
  master_ticket varchar(100),
  follower_ticket varchar(100),
  symbol_master varchar(50),
  symbol_follower varchar(50),
  side varchar(10),
  requested_lot numeric(10,2),
  executed_lot numeric(10,2),
  requested_price numeric(18,8),
  executed_price numeric(18,8),
  slippage_points numeric(12,4),
  latency_ms integer,
  switch_ms integer,
  order_ms integer,
  e2e_ms integer,
  status public.execution_status_enum not null,
  broker_return_code varchar(100),
  error_message text,
  raw_payload jsonb,
  created_at timestamptz default now()
);
alter table public.execution_events add column if not exists switch_ms integer;
alter table public.execution_events add column if not exists order_ms integer;
alter table public.execution_events add column if not exists e2e_ms integer;

create index if not exists idx_execution_events_user on public.execution_events(user_id);
create index if not exists idx_execution_events_copier on public.execution_events(copier_relation_id);
create index if not exists idx_execution_events_master on public.execution_events(master_account_id);
create index if not exists idx_execution_events_follower on public.execution_events(follower_account_id);
create index if not exists idx_execution_events_status on public.execution_events(status);
create index if not exists idx_execution_events_created on public.execution_events(created_at desc);
create index if not exists idx_execution_events_event_type on public.execution_events(event_type);
create index if not exists idx_execution_events_user_created on public.execution_events(user_id, created_at desc);
create index if not exists idx_execution_events_e2e on public.execution_events(user_id, created_at desc, e2e_ms);


-- ── worker_nodes / worker_sessions — the fleet ──────────────────────────────

create table if not exists public.worker_nodes (
  id uuid primary key default gen_random_uuid(),
  worker_name varchar(100) not null,
  region varchar(100),
  host_identifier varchar(255),
  status varchar(50) default 'offline',
  capacity integer default 1,
  active_sessions integer default 0,
  last_heartbeat_at timestamptz,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.worker_nodes
  add column if not exists user_id uuid references public.tc_users(id) on delete set null;

create index if not exists idx_worker_nodes_status on public.worker_nodes(status);
create index if not exists idx_worker_nodes_heartbeat on public.worker_nodes(last_heartbeat_at);
create index if not exists idx_worker_nodes_user on public.worker_nodes(user_id);

drop trigger if exists update_worker_nodes_updated_at on public.worker_nodes;
create trigger update_worker_nodes_updated_at before update on public.worker_nodes
  for each row execute function public.update_updated_at_column();

create table if not exists public.worker_sessions (
  id uuid primary key default gen_random_uuid(),
  worker_node_id uuid references public.worker_nodes(id) on delete set null,
  trading_account_id uuid references public.trading_accounts(id) on delete cascade,
  session_status varchar(50) default 'starting',
  terminal_path text,
  process_id integer,
  last_heartbeat_at timestamptz,
  last_error text,
  started_at timestamptz default now(),
  stopped_at timestamptz
);

create index if not exists idx_worker_sessions_worker on public.worker_sessions(worker_node_id);
create index if not exists idx_worker_sessions_account on public.worker_sessions(trading_account_id);
create index if not exists idx_worker_sessions_status on public.worker_sessions(session_status);
create unique index if not exists idx_worker_sessions_active_account
  on public.worker_sessions(trading_account_id)
  where session_status in ('starting', 'running', 'reconnecting');


-- ── worker_commands — how the platform drives the worker ────────────────────
-- The worker polls this queue outbound; nothing is pushed to it. That is why
-- the Windows box needs no inbound port, no static IP and no firewall rule.

create table if not exists public.worker_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tc_users(id) on delete cascade,
  trading_account_id uuid not null references public.trading_accounts(id) on delete cascade,
  command_type varchar(50) not null,
  status varchar(50) default 'pending',
  payload jsonb default '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_worker_commands_account on public.worker_commands(trading_account_id);
create index if not exists idx_worker_commands_status on public.worker_commands(status) where status = 'pending';
create index if not exists idx_worker_commands_user on public.worker_commands(user_id, created_at desc);


-- ── account_equity_snapshots ────────────────────────────────────────────────

create table if not exists public.account_equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tc_users(id) on delete cascade,
  trading_account_id uuid not null references public.trading_accounts(id) on delete cascade,
  snapshot_date date not null,
  equity_open numeric(14,2),
  balance_open numeric(14,2),
  currency varchar(20),
  created_at timestamptz default now(),
  unique (trading_account_id, snapshot_date)
);

create index if not exists idx_equity_snapshots_user_date on public.account_equity_snapshots(user_id, snapshot_date);


-- ── compare_broker_profiles — public reference data ─────────────────────────

create table if not exists public.compare_broker_profiles (
  id uuid primary key default gen_random_uuid(),
  slug varchar(100) unique not null,
  name varchar(255) not null,
  platform public.platform_enum not null default 'mt5',
  category varchar(50) not null default 'prop_firm',
  region varchar(50),
  min_deposit numeric(14,2),
  max_leverage integer,
  spread_from numeric(10,4),
  commission_per_lot numeric(10,4),
  copy_trading_supported boolean default true,
  platforms_supported text[] default array['mt5'],
  rating numeric(3,1),
  highlights text[],
  is_featured boolean default false,
  is_active boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_compare_profiles_category on public.compare_broker_profiles(category);
create index if not exists idx_compare_profiles_platform on public.compare_broker_profiles(platform);

drop trigger if exists update_compare_broker_profiles_updated_at on public.compare_broker_profiles;
create trigger update_compare_broker_profiles_updated_at before update on public.compare_broker_profiles
  for each row execute function public.update_updated_at_column();

insert into public.compare_broker_profiles
  (slug, name, platform, category, region, min_deposit, max_leverage, spread_from,
   copy_trading_supported, platforms_supported, rating, highlights, is_featured)
values
  ('ftmo-mt5', 'FTMO', 'mt5', 'prop_firm', 'EU', 0, 100, 0.0, true,
   array['mt5','ctrader'], 4.6,
   array['Two-step evaluation','MT5 + cTrader','Weekend holding rules'], true),
  ('fundednext-mt5', 'FundedNext', 'mt5', 'prop_firm', 'Global', 0, 100, 0.1, true,
   array['mt5','mt4'], 4.4,
   array['Express model','MT5/MT4','Competitive profit split'], true),
  ('ic-markets-mt5', 'IC Markets', 'mt5', 'broker', 'AU', 200, 500, 0.0, true,
   array['mt5','mt4','ctrader'], 4.7,
   array['Raw spreads','Deep liquidity','Multi-platform'], false)
on conflict (slug) do nothing;


-- ── Admin helper ────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.tc_users
    where id = auth.uid() and subscription_plan = 'admin'
  );
end;
$$ language plpgsql security definer;


-- ── Row level security ──────────────────────────────────────────────────────
-- Every table below is reachable through PostgREST with the anon key that ships
-- in the browser bundle, so RLS is not optional here. Workers and the FastAPI
-- control plane use the service role, which bypasses these policies.

alter table public.tc_users                 enable row level security;
alter table public.trading_accounts         enable row level security;
alter table public.copier_relations         enable row level security;
alter table public.symbol_mappings          enable row level security;
alter table public.risk_profiles            enable row level security;
alter table public.execution_events         enable row level security;
alter table public.worker_nodes             enable row level security;
alter table public.worker_sessions          enable row level security;
alter table public.worker_commands          enable row level security;
alter table public.account_equity_snapshots enable row level security;
alter table public.compare_broker_profiles  enable row level security;

drop policy if exists "own tc_user" on public.tc_users;
create policy "own tc_user" on public.tc_users for select using (auth.uid() = id);
drop policy if exists "update own tc_user" on public.tc_users;
create policy "update own tc_user" on public.tc_users for update using (auth.uid() = id);

-- Read, relabel and remove your own accounts — but INSERT is deliberately absent.
-- encrypted_password is written by the copier-gateway function with the
-- encryption key; a browser cannot produce a valid value, and a row with a
-- garbage one looks connected and then fails to decrypt inside the worker's hot
-- path. Creation therefore goes through the gateway or not at all.
drop policy if exists "own trading accounts" on public.trading_accounts;
drop policy if exists "read own trading accounts" on public.trading_accounts;
create policy "read own trading accounts" on public.trading_accounts for select using (auth.uid() = user_id);
drop policy if exists "update own trading accounts" on public.trading_accounts;
create policy "update own trading accounts" on public.trading_accounts for update using (auth.uid() = user_id);
drop policy if exists "delete own trading accounts" on public.trading_accounts;
create policy "delete own trading accounts" on public.trading_accounts for delete using (auth.uid() = user_id);

drop policy if exists "own copier relations" on public.copier_relations;
create policy "own copier relations" on public.copier_relations for all using (auth.uid() = user_id);

drop policy if exists "own symbol mappings" on public.symbol_mappings;
create policy "own symbol mappings" on public.symbol_mappings for all using (auth.uid() = user_id);

drop policy if exists "own risk profiles" on public.risk_profiles;
create policy "own risk profiles" on public.risk_profiles for all using (auth.uid() = user_id);

-- Read-only for users: every write comes from a worker via the service role.
drop policy if exists "read own execution events" on public.execution_events;
create policy "read own execution events" on public.execution_events for select using (auth.uid() = user_id);

-- Commands are how the UI reaches the worker: "flatten this book", "start a
-- session". The worker polls them outbound, so a user has to be able to enqueue
-- one — but only against an account they actually own. Checking user_id alone
-- would let someone queue a flatten on a stranger's account under their own id.
drop policy if exists "read own worker commands" on public.worker_commands;
create policy "read own worker commands" on public.worker_commands for select using (auth.uid() = user_id);

drop policy if exists "queue own worker commands" on public.worker_commands;
create policy "queue own worker commands" on public.worker_commands for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trading_accounts ta
      where ta.id = trading_account_id and ta.user_id = auth.uid()
    )
  );

-- Exactly the three the worker implements: `flatten` and `test_connection` in
-- command_processor.process_command, and `reload_config`, which copier_engine
-- handles separately by forcing an immediate config refresh. Anything else sits
-- pending forever, looking like a queued action that silently never happens.
alter table public.worker_commands drop constraint if exists worker_commands_known_type;
alter table public.worker_commands add constraint worker_commands_known_type
  check (command_type in ('flatten', 'test_connection', 'reload_config'));

drop policy if exists "read own equity snapshots" on public.account_equity_snapshots;
create policy "read own equity snapshots" on public.account_equity_snapshots for select using (auth.uid() = user_id);

-- A user must be able to see their own worker: the fleet banner is what tells
-- them whether anything is executing at all, and the previous admin-only policy
-- made it read "No worker" forever for everyone else. Owner-scoped, like every
-- other table here. See migrations-copier-worker-visibility.sql.
drop policy if exists "admins read worker nodes" on public.worker_nodes;
drop policy if exists "read own worker nodes" on public.worker_nodes;
create policy "read own worker nodes" on public.worker_nodes for select using (
  public.is_admin() or auth.uid() = user_id
);

drop policy if exists "admins read worker sessions" on public.worker_sessions;
create policy "admins read worker sessions" on public.worker_sessions for select using (public.is_admin());

-- Reference data: readable by any signed-in user, writable by nobody but the
-- service role.
drop policy if exists "read broker profiles" on public.compare_broker_profiles;
create policy "read broker profiles" on public.compare_broker_profiles for select
  using (auth.role() = 'authenticated');


-- ── Backfill ────────────────────────────────────────────────────────────────
-- The signup trigger only fires for new users. Everyone who already had an
-- account needs a tc_users row or the copier cannot see them at all.

insert into public.tc_users (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', '')
from auth.users u
where u.email is not null
on conflict (id) do nothing;
