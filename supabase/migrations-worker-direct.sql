-- The worker's direct line to the database.
--
-- WHY
-- The Windows worker used to reach every table through the copier-gateway Edge
-- Function, asking on a timer: pending commands every 2s, open positions every
-- 2s, the whole runtime config every 5s, heartbeats, balances. One armed master
-- cost ~110,000 invocations a day -- 3.3M a month against a free-plan quota of
-- 500k -- and every one of those round trips paid TLS + an edge hop + a cold
-- start now and then, on the path that carries a Close click to the broker.
--
-- The worker now holds one Postgres connection and calls the functions below.
-- Nothing polls for commands any more: an insert into worker_commands fires a
-- NOTIFY, so a Close clicked in the app reaches the worker in milliseconds. A
-- change to a copy link, an account or a risk limit does the same on a second
-- channel, so the worker reloads its config the moment it changes instead of
-- re-downloading it every few seconds in case it did.
--
-- The gateway stays deployed and unchanged. It still serves the browser's
-- account creation (it holds ENCRYPTION_KEY), and the worker falls back to it
-- whenever the direct connection is down -- so the worst case is exactly the
-- old behaviour, never an outage.
--
-- SECURITY
-- The worker logs in as `copier_worker`, a role with NO table privileges at
-- all. Everything it can do is one of the SECURITY DEFINER functions in the
-- `worker_api` schema, which mirror the gateway's /internal routes one for one
-- and scope every read and write to the user id the worker runs for -- the same
-- trust the X-Worker-Key header carries today, with less reach: the role cannot
-- select, update or delete anything the functions do not do. The schema is not
-- exposed through the Data API, and PUBLIC's default EXECUTE is revoked, so the
-- browser's anon/authenticated roles cannot call any of it.
--
-- SETUP (once, in the SQL editor)
--   1. Run this file. It is idempotent; re-running it is safe.
--   2. Give the role a password -- deliberately not in this file:
--        alter role copier_worker with password '<long random string>';
--   3. On the worker, set WORKER_DATABASE_URL (see WORKER.md).

-- ── The role ────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'copier_worker') then
    -- LOGIN with no password cannot log in until step 2 above sets one.
    create role copier_worker with login noinherit;
  end if;
end
$$;

-- A runaway worker should hit a wall, not the database's connection budget.
alter role copier_worker connection limit 20;
-- A hung statement must never pin the copier's connection.
alter role copier_worker set statement_timeout = '15s';
alter role copier_worker set idle_in_transaction_session_timeout = '30s';

create schema if not exists worker_api;
revoke all on schema worker_api from public;
grant usage on schema worker_api to copier_worker;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- A JSON value as a number, or null when it is missing or not a finite number.
-- Validated rather than trusted: a bad row here becomes a wrong equity curve
-- that is hard to trace back, and a failed cast would fail the whole batch.
create or replace function worker_api.num(v jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if v is null or jsonb_typeof(v) not in ('number', 'string') then
    return null;
  end if;
  return (v #>> '{}')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function worker_api.ts(v text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if v is null or btrim(v) = '' then
    return null;
  end if;
  return v::timestamptz;
exception when others then
  return null;
end;
$$;

-- A status string as the enum, or null for anything the enum does not know --
-- an unexpected value from a newer worker must not fail the whole write.
create or replace function worker_api.connection_status(v text)
returns public.connection_status_enum
language sql
stable
set search_path = ''
as $$
  select e from unnest(enum_range(null::public.connection_status_enum)) e where e::text = v;
$$;

-- ── Runtime config ──────────────────────────────────────────────────────────

-- The raw rows behind /internal/runtime-config. The worker shapes them itself
-- (engine/direct_client.py), and decrypts passwords itself: the ciphertext is
-- all that leaves the database, exactly as it is stored.
create or replace function worker_api.config_rows(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'copiers', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.copier_relations c where c.user_id = p_user
    ), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
      from public.trading_accounts a
      where a.user_id = p_user and a.is_enabled is true
    ), '[]'::jsonb),
    'symbol_mappings', coalesce((
      select jsonb_agg(to_jsonb(m))
      from public.symbol_mappings m where m.user_id = p_user and m.is_active is true
    ), '[]'::jsonb),
    'risk_profiles', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.risk_profiles r where r.user_id = p_user
    ), '[]'::jsonb)
  );
$$;

create or replace function worker_api.trading_account(p_user uuid, p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(a) from public.trading_accounts a
  where a.id = p_account and a.user_id = p_user;
$$;

create or replace function worker_api.whoami(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p_user,
    'known_user', exists (select 1 from public.tc_users u where u.id = p_user),
    'email', (select u.email from public.tc_users u where u.id = p_user),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'label', coalesce(nullif(a.account_label, ''), a.account_number::text),
        'platform', a.platform,
        'connection_status', a.connection_status,
        'terminal_path', a.terminal_path,
        'broker_slug', a.broker_slug,
        'enabled', coalesce(a.is_enabled, true)
      ) order by a.created_at, a.id)
      from public.trading_accounts a where a.user_id = p_user
    ), '[]'::jsonb),
    'relations', (select count(*) from public.copier_relations c where c.user_id = p_user),
    'enabled_relations', (
      select count(*) from public.copier_relations c
      where c.user_id = p_user and c.is_enabled is true
    )
  );
$$;

-- ── Open ticket links ───────────────────────────────────────────────────────

-- Still-open master->follower ticket pairs, so a restarted worker keeps
-- managing positions it opened in a previous life. Same rule as the gateway:
-- the newest 5000 opens, minus anything closed, the latest open per
-- (relation, master ticket) winning.
create or replace function worker_api.open_links(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with opened as (
    select e.copier_relation_id, e.master_ticket, e.follower_ticket,
           e.follower_account_id, e.symbol_follower, e.side, e.executed_lot, e.created_at
    from public.execution_events e
    where e.user_id = p_user and e.event_type = 'position_opened' and e.status = 'success'
    order by e.created_at desc
    limit 5000
  ),
  closed as (
    select e.follower_ticket
    from public.execution_events e
    where e.user_id = p_user
      and e.event_type in ('position_closed', 'flatten', 'manual_close')
      and e.status in ('closed', 'success')
      and e.follower_ticket is not null
    order by e.created_at desc
    limit 10000
  ),
  live as (
    select distinct on (o.copier_relation_id, o.master_ticket) o.*
    from opened o
    where o.copier_relation_id is not null
      and coalesce(o.master_ticket, '') <> ''
      and coalesce(o.follower_ticket, '') <> ''
      and not exists (select 1 from closed c where c.follower_ticket = o.follower_ticket)
    order by o.copier_relation_id, o.master_ticket, o.created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'copier_id', l.copier_relation_id,
    'master_ticket', l.master_ticket,
    'follower_ticket', l.follower_ticket,
    'follower_account_id', l.follower_account_id,
    'symbol', coalesce(l.symbol_follower, ''),
    'side', coalesce(l.side, ''),
    'volume', l.executed_lot
  ) order by l.created_at), '[]'::jsonb)
  from live l;
$$;

-- ── Execution events ────────────────────────────────────────────────────────

-- Whitelisted columns only, typed by the table itself via populate_recordset,
-- so a future worker sending an unexpected key gets a clean insert.
create or replace function worker_api.insert_events(p_user uuid, p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    return 0;
  end if;
  insert into public.execution_events (
    user_id, copier_relation_id, master_account_id, follower_account_id, event_type,
    master_ticket, follower_ticket, symbol_master, symbol_follower, side,
    requested_lot, executed_lot, requested_price, executed_price,
    slippage_points, latency_ms, switch_ms, order_ms, e2e_ms,
    status, broker_return_code, error_message, raw_payload
  )
  select
    p_user, r.copier_relation_id, r.master_account_id, r.follower_account_id, r.event_type,
    r.master_ticket, r.follower_ticket, r.symbol_master, r.symbol_follower, r.side,
    r.requested_lot, r.executed_lot, r.requested_price, r.executed_price,
    r.slippage_points, r.latency_ms, r.switch_ms, r.order_ms, r.e2e_ms,
    r.status, r.broker_return_code, r.error_message, r.raw_payload
  from jsonb_populate_recordset(null::public.execution_events, p_events) r;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Worker lifecycle ────────────────────────────────────────────────────────

-- An upsert on (worker_name, host_identifier), like the gateway, so a restart
-- keeps one node per machine instead of filling the fleet with ghosts.
create or replace function worker_api.register_worker(
  p_user uuid, p_name text, p_region text, p_host text, p_capacity integer, p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select w.id into v_id from public.worker_nodes w
  where w.worker_name = p_name and w.host_identifier is not distinct from p_host
  order by w.created_at
  limit 1;

  if v_id is null then
    insert into public.worker_nodes (
      worker_name, region, host_identifier, capacity, status, metadata, last_heartbeat_at, user_id
    ) values (
      p_name, p_region, p_host, coalesce(p_capacity, 1), 'online', p_metadata, now(), p_user
    ) returning id into v_id;
  else
    update public.worker_nodes set
      region = p_region, capacity = coalesce(p_capacity, 1), status = 'online',
      metadata = p_metadata, last_heartbeat_at = now(), user_id = coalesce(p_user, user_id)
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function worker_api.heartbeat(
  p_user uuid, p_worker uuid, p_active integer, p_metadata jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.worker_nodes set
    active_sessions = coalesce(p_active, 0), last_heartbeat_at = now(),
    status = 'online', metadata = p_metadata
  where id = p_worker and (user_id = p_user or user_id is null);
$$;

create or replace function worker_api.session_started(
  p_user uuid, p_worker uuid, p_account uuid, p_terminal_path text, p_pid integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
begin
  if not exists (
    select 1 from public.trading_accounts a where a.id = p_account and a.user_id = p_user
  ) then
    return;
  end if;

  select s.id into v_session from public.worker_sessions s
  where s.trading_account_id = p_account
    and s.session_status in ('starting', 'running', 'reconnecting')
  limit 1;

  if v_session is null then
    insert into public.worker_sessions (
      worker_node_id, trading_account_id, session_status, terminal_path, process_id,
      last_heartbeat_at, started_at
    ) values (p_worker, p_account, 'running', p_terminal_path, p_pid, now(), now());
  else
    update public.worker_sessions set
      worker_node_id = p_worker, session_status = 'running', terminal_path = p_terminal_path,
      process_id = p_pid, last_heartbeat_at = now()
    where id = v_session;
  end if;

  update public.trading_accounts set
    connection_status = 'connected', last_error = null, last_connected_at = now()
  where id = p_account and user_id = p_user;
end;
$$;

create or replace function worker_api.session_failed(
  p_user uuid, p_worker uuid, p_account uuid, p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.trading_accounts a where a.id = p_account and a.user_id = p_user
  ) then
    return;
  end if;
  update public.worker_sessions set
    session_status = 'failed', last_error = p_error, stopped_at = now()
  where trading_account_id = p_account;
  update public.trading_accounts set
    connection_status = 'auth_failed', last_error = p_error
  where id = p_account and user_id = p_user;
end;
$$;

-- ── Commands ────────────────────────────────────────────────────────────────

create or replace function worker_api.pending_commands(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb)
  from (
    select * from public.worker_commands w
    where w.user_id = p_user and w.status = 'pending'
    order by w.created_at
    limit 20
  ) c;
$$;

-- Marks a command done and, for a connection test, makes the account's status
-- truthful: the worker is the only thing that can reach the broker, so its
-- answer is the authoritative one. A port of the gateway's completeCommand.
create or replace function worker_api.complete_command(
  p_user uuid, p_command uuid, p_success boolean, p_result jsonb, p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cmd public.worker_commands;
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
  v_success boolean := coalesce(p_success, true);
  v_diag jsonb := '{}'::jsonb;
  v_path text;
begin
  select * into v_cmd from public.worker_commands w
  where w.id = p_command and w.user_id = p_user;
  if not found then
    return;
  end if;

  update public.worker_commands set
    status = case when v_success then 'completed' else 'failed' end,
    result = v_result, error_message = p_error, completed_at = now()
  where id = p_command;

  if v_cmd.command_type <> 'test_connection' or v_cmd.trading_account_id is null then
    return;
  end if;

  if v_success then
    if jsonb_typeof(v_result -> 'ping_ms') = 'number' then
      v_diag := v_diag || jsonb_build_object('ping_ms', v_result -> 'ping_ms');
    end if;
    if coalesce(v_result ->> 'terminal_build', '') not in ('', 'false', '0') then
      v_diag := v_diag || jsonb_build_object('terminal_build', v_result -> 'terminal_build');
    end if;
    if v_diag <> '{}'::jsonb then
      v_diag := v_diag || jsonb_build_object('diagnostics_at', now());
    end if;
    v_path := nullif(btrim(case when jsonb_typeof(v_result -> 'terminal_path') = 'string'
                                then v_result ->> 'terminal_path' end), '');

    update public.trading_accounts set
      connection_status = 'connected',
      last_error = null,
      last_connected_at = now(),
      -- A test that did not read a figure keeps the stored one; blanking it
      -- would empty the balance the page shows until the next sweep.
      balance = coalesce(worker_api.num(v_result -> 'balance'), balance),
      equity = coalesce(worker_api.num(v_result -> 'equity'), equity),
      currency = coalesce(nullif(v_result ->> 'currency', ''), currency),
      -- The worker assigns terminals; this is where an assignment becomes
      -- permanent, or the account would be reassigned on every restart.
      terminal_path = coalesce(v_path, terminal_path),
      account_metadata = case when v_diag = '{}'::jsonb then account_metadata
                              else coalesce(account_metadata, '{}'::jsonb) || v_diag end
    where id = v_cmd.trading_account_id and user_id = p_user;
  else
    update public.trading_accounts set
      connection_status = coalesce(
        worker_api.connection_status(v_result ->> 'connection_status'), 'auth_failed'
      ),
      last_error = coalesce(p_error, v_result ->> 'message')
    where id = v_cmd.trading_account_id and user_id = p_user;
  end if;
end;
$$;

-- ── Balances and live positions ─────────────────────────────────────────────

create or replace function worker_api.update_balances(p_user uuid, p_accounts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_id uuid;
  v_status text;
  v_balance numeric;
  v_equity numeric;
  v_currency text;
  n integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) loop
    v_id := nullif(r ->> 'trading_account_id', '')::uuid;
    continue when v_id is null;
    v_balance := worker_api.num(r -> 'balance');
    v_equity := worker_api.num(r -> 'equity');
    v_currency := nullif(r ->> 'currency', '');
    v_status := nullif(r ->> 'connection_status', '');

    update public.trading_accounts set
      last_balance_sync_at = now(),
      balance = coalesce(v_balance, balance),
      equity = coalesce(v_equity, equity),
      currency = coalesce(v_currency, currency),
      connection_status = coalesce(worker_api.connection_status(v_status), connection_status),
      last_error = case when v_status = 'connected' then null else last_error end,
      last_connected_at = case when v_status = 'connected' then now() else last_connected_at end
    where id = v_id and user_id = p_user;
    continue when not found;
    n := n + 1;

    -- The day's opening equity, written once per account per (UTC) day and
    -- never overwritten: the dashboard's "today" figure is measured against it.
    --
    -- Only from a report that carried a figure, and a figure missing from the
    -- first report (equity unread, say) is filled by the next one rather than
    -- frozen as null for the rest of the day. Figures already set are never
    -- changed: the opening value is the first one seen.
    if v_equity is not null or v_balance is not null then
      insert into public.account_equity_snapshots (
        user_id, trading_account_id, snapshot_date, equity_open, balance_open, currency
      ) values (
        p_user, v_id, (now() at time zone 'utc')::date, v_equity, v_balance, v_currency
      )
      on conflict (trading_account_id, snapshot_date) do update set
        equity_open = coalesce(public.account_equity_snapshots.equity_open, excluded.equity_open),
        balance_open = coalesce(public.account_equity_snapshots.balance_open, excluded.balance_open),
        currency = coalesce(public.account_equity_snapshots.currency, excluded.currency)
      where public.account_equity_snapshots.equity_open is null
         or public.account_equity_snapshots.balance_open is null
         or public.account_equity_snapshots.currency is null;
    end if;
  end loop;
  return n;
end;
$$;

-- Whole snapshots, never deltas; an account absent from the payload keeps its
-- last snapshot and its honest reported_at. Balance/equity/currency are only
-- overwritten when this visit read them.
create or replace function worker_api.update_positions(p_user uuid, p_accounts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.live_positions (
    trading_account_id, user_id, positions, balance, equity, currency, reported_at
  )
  select
    a.id,
    p_user,
    case when jsonb_typeof(r -> 'positions') = 'array' then r -> 'positions' else '[]'::jsonb end,
    worker_api.num(r -> 'balance'),
    worker_api.num(r -> 'equity'),
    nullif(r ->> 'currency', ''),
    now()
  from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) r
  -- Scoped to the caller's own accounts, so a stale id in a payload cannot
  -- plant a row against somebody else's account.
  join public.trading_accounts a
    on a.id::text = r ->> 'trading_account_id' and a.user_id = p_user
  on conflict (trading_account_id) do update set
    positions = excluded.positions,
    reported_at = excluded.reported_at,
    balance = coalesce(excluded.balance, public.live_positions.balance),
    equity = coalesce(excluded.equity, public.live_positions.equity),
    currency = coalesce(excluded.currency, public.live_positions.currency);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Journal ─────────────────────────────────────────────────────────────────

-- Closed positions onto the dashboard account this copier account is linked
-- to. Idempotent by (user_id, external_id): the worker re-reads its history
-- window, so a repeat updates in place rather than duplicating. The same
-- validation as the gateway's tradeRow; malformed rows are counted, not fatal.
create or replace function worker_api.journal_trades(
  p_user uuid, p_account uuid, p_trades jsonb, p_synced_to text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dashboard uuid;
  v_found boolean;
  v_total integer := case when jsonb_typeof(p_trades) = 'array'
                          then jsonb_array_length(p_trades) else 0 end;
  v_written integer := 0;
  v_synced timestamptz := worker_api.ts(p_synced_to);
begin
  select a.account_id, true into v_dashboard, v_found
  from public.trading_accounts a where a.id = p_account and a.user_id = p_user;
  if not coalesce(v_found, false) then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;

  -- Not linked yet: not an error, and the mark is deliberately not advanced,
  -- so linking later still picks these trades up.
  if v_dashboard is null then
    return jsonb_build_object('status', 'ok', 'written', 0, 'skipped', v_total, 'linked', false);
  end if;

  if v_total > 0 then
    with parsed as (
      select
        nullif(btrim(t ->> 'external_id'), '') as external_id,
        nullif(btrim(t ->> 'symbol'), '') as symbol,
        lower(btrim(t ->> 'side')) as side,
        worker_api.num(t -> 'qty') as qty,
        worker_api.num(t -> 'entry_price') as entry_price,
        worker_api.num(t -> 'exit_price') as exit_price,
        worker_api.num(t -> 'pnl') as pnl,
        worker_api.num(t -> 'fees') as fees,
        worker_api.ts(t ->> 'entry_time') as entry_time,
        worker_api.ts(t ->> 'exit_time') as exit_time
      from jsonb_array_elements(p_trades) t
    ),
    valid as (
      -- One row per external_id: ON CONFLICT cannot touch the same row twice.
      select distinct on (external_id) * from parsed
      where external_id is not null and symbol is not null
        and side in ('long', 'short')
        and qty > 0
        and entry_price is not null and exit_price is not null and pnl is not null
        and entry_time is not null and exit_time is not null
      order by external_id
    )
    insert into public.trades (
      user_id, account_id, external_id, symbol, side, qty, entry_price, exit_price,
      entry_time, exit_time, fees, pnl, date
    )
    select
      p_user, v_dashboard, v.external_id, v.symbol, v.side, v.qty, v.entry_price, v.exit_price,
      v.entry_time, v.exit_time, v.fees, v.pnl,
      -- NOT NULL but not what the app reads: src/db/trades.ts derives the day
      -- from exit_time in the trader's zone.
      (v.exit_time at time zone 'utc')::date
    from valid v
    on conflict (user_id, external_id) do update set
      account_id = excluded.account_id,
      symbol = excluded.symbol,
      side = excluded.side,
      qty = excluded.qty,
      entry_price = excluded.entry_price,
      exit_price = excluded.exit_price,
      entry_time = excluded.entry_time,
      exit_time = excluded.exit_time,
      fees = excluded.fees,
      pnl = excluded.pnl,
      date = excluded.date;
    get diagnostics v_written = row_count;
  end if;

  if v_synced is not null then
    update public.trading_accounts set history_synced_to = v_synced
    where id = p_account and user_id = p_user;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'written', v_written, 'skipped', v_total - v_written, 'linked', true
  );
end;
$$;

-- ── Who may call what ───────────────────────────────────────────────────────

-- Functions are EXECUTE-able by PUBLIC by default. Revoke that first, then
-- grant the worker role only.
revoke all on all functions in schema worker_api from public;
grant execute on all functions in schema worker_api to copier_worker;

-- ── Push, not poll ──────────────────────────────────────────────────────────

-- The payload is the owning user's id: a worker listens on the channel and
-- ignores anybody else's. Any role may NOTIFY, so these need no privileges of
-- their own; they fire for the browser's RLS-scoped writes exactly as for
-- anyone else's.
create or replace function public.notify_worker_command()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_notify('worker_commands', new.user_id::text);
  return null;
end;
$$;

create or replace function public.notify_worker_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_notify(
    'worker_config',
    (case when tg_op = 'DELETE' then old.user_id else new.user_id end)::text
  );
  return null;
end;
$$;

drop trigger if exists worker_commands_notify on public.worker_commands;
create trigger worker_commands_notify
  after insert on public.worker_commands
  for each row execute function public.notify_worker_command();

drop trigger if exists copier_relations_notify_worker on public.copier_relations;
create trigger copier_relations_notify_worker
  after insert or update or delete on public.copier_relations
  for each row execute function public.notify_worker_config();

drop trigger if exists symbol_mappings_notify_worker on public.symbol_mappings;
create trigger symbol_mappings_notify_worker
  after insert or update or delete on public.symbol_mappings
  for each row execute function public.notify_worker_config();

drop trigger if exists risk_profiles_notify_worker on public.risk_profiles;
create trigger risk_profiles_notify_worker
  after insert or update or delete on public.risk_profiles
  for each row execute function public.notify_worker_config();

-- trading_accounts is written by the worker itself on every balance sweep, so
-- only the columns that ARE config wake it -- otherwise each balance update
-- would trigger a config reload, which would trigger another sweep.
drop trigger if exists trading_accounts_notify_worker_ins on public.trading_accounts;
create trigger trading_accounts_notify_worker_ins
  after insert or delete on public.trading_accounts
  for each row execute function public.notify_worker_config();

drop trigger if exists trading_accounts_notify_worker_upd on public.trading_accounts;
create trigger trading_accounts_notify_worker_upd
  after update on public.trading_accounts
  for each row
  when ((old.is_enabled, old.encrypted_password, old.broker_server, old.account_number,
         old.account_label, old.terminal_path, old.broker_slug, old.api_base_url,
         old.platform, old.account_id)
        is distinct from
        (new.is_enabled, new.encrypted_password, new.broker_server, new.account_number,
         new.account_label, new.terminal_path, new.broker_slug, new.api_base_url,
         new.platform, new.account_id))
  execute function public.notify_worker_config();
