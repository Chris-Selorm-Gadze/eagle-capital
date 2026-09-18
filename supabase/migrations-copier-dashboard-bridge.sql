-- Copier accounts become dashboard accounts, and closed positions become trades.
--
-- Run once in the Supabase SQL editor. Idempotent.
--
-- The problem: copying six accounts all day left the dashboard reading "Your
-- desk is empty". The copier writes trading_accounts / execution_events; the
-- dashboard reads accounts / trades. Two separate universes with no join
-- between them -- trading_accounts.user_id even references tc_users rather than
-- auth.users.


-- 1. The join.
--
-- Shaped exactly like broker_connections.account_id, which solved this same
-- problem for the broker-sync service: nullable, so a copier account can exist
-- before it is pointed at a dashboard account, and unique, so two copier
-- accounts cannot both claim one dashboard account and double its P&L.
alter table public.trading_accounts
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

comment on column public.trading_accounts.account_id is
  'The dashboard account (public.accounts) this copier account reports trades to. '
  'Null means its trades are not journalled.';

-- set null, not cascade: deleting a dashboard account must not delete the
-- copier account, which holds live credentials and an assigned MT5 terminal.
-- Its trades do cascade, which is the existing behaviour of trades.account_id.
create unique index if not exists trading_accounts_account_id_key
  on public.trading_accounts(account_id)
  where account_id is not null;


-- 2. Idempotency for trades the worker reports.
--
-- The worker re-reads closed positions from MT5's own deal history, so the same
-- position can be reported more than once -- after a restart, after a partial
-- close, or because two poll cycles overlapped. Without a natural key that
-- silently duplicates trades, and a duplicated trade is a wrong equity curve.
--
-- Keyed 'mt5:<trading_account_id>:<position_ticket>'. The trading account id is
-- in there because MT5 position tickets are only unique within one account, so
-- two accounts can legitimately both hold ticket 12345.
alter table public.trades
  add column if not exists external_id text;

comment on column public.trades.external_id is
  'Stable id of the source position for an imported trade, e.g. '
  'mt5:<trading_account_id>:<position_ticket>. Null for manually entered trades.';

-- Deliberately NOT a partial index ("where external_id is not null"), even
-- though only imported rows have one. Postgres cannot infer a partial index for
-- a plain `on conflict (user_id, external_id)`, so the gateway's upsert would
-- fail outright -- and manually entered trades are unaffected either way,
-- because a unique index treats NULLs as distinct: any number of rows may have
-- no external_id.
create unique index if not exists trades_user_external_id_key
  on public.trades(user_id, external_id);


-- 3. Where the worker resumes from.
--
-- Deal history is read forward from a high-water mark per account rather than
-- re-read whole. Stored on the account so it survives a worker restart and a
-- worker replacement -- a worker that forgot it would re-post every trade ever
-- closed, which the unique index above would absorb, but only after a very
-- large pointless upsert.
alter table public.trading_accounts
  add column if not exists history_synced_to timestamptz;

comment on column public.trading_accounts.history_synced_to is
  'Close time of the most recent position imported into trades from this '
  'account. The worker reads deal history forward from here.';


-- NOTE on pnl.
--
-- The worker sends MT5's own realised profit and the gateway writes it
-- verbatim. It must NOT be recomputed from entry/exit prices: that formula
-- assumes 1 unit of qty is worth 1 currency unit per point, which is false for
-- index CFDs, metals and crypto -- see the pnlOverride comment in
-- src/db/trades.ts, which exists for the same reason on the CSV import path.
