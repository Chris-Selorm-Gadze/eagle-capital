-- Terminals become a pool the worker manages, instead of a path the user types.
--
-- Run this once in the Supabase SQL editor. It is idempotent.
--
-- Why: a terminal path is worker infrastructure. Asking a trader for
-- "C:\MT5\exness-3\terminal64.exe" leaks the machine into the product, and
-- getting it wrong fails the login with an error that reads exactly like a wrong
-- password. The user picks a broker; the worker picks the terminal.
--
-- broker_slug is what makes that possible. The connect dialog already asks for
-- the broker and then threw the answer away after using it to prefill a path.
-- Keeping it lets the worker find a terminal that matches.

alter table public.trading_accounts
  add column if not exists broker_slug varchar(64);

comment on column public.trading_accounts.broker_slug is
  'Broker preset the user chose (moneta_markets, ftmo, exness, fusion_markets, ...). '
  'The worker matches this against the MT5 installs it can see to assign a terminal.';

-- Assignment lookups are "which of my accounts already hold a terminal", so the
-- useful index is per-user over the assigned path.
create index if not exists idx_trading_accounts_terminal
  on public.trading_accounts(user_id, terminal_path)
  where terminal_path is not null;


-- Backfill the slug for accounts connected before this existed, from the server
-- name. Deliberately conservative: only unambiguous matches, and it never
-- touches terminal_path. Existing accounts keep the terminal they are working on
-- -- reassigning those would reset warm sessions and re-download history for no
-- benefit. Auto-assignment applies to accounts that have no path.
update public.trading_accounts
set broker_slug = case
  when broker_server ilike '%exness%'  then 'exness'
  when broker_server ilike '%ftmo%'    then 'ftmo'
  when broker_server ilike '%moneta%'  then 'moneta_markets'
  when broker_server ilike '%fusion%'  then 'fusion_markets'
  else broker_slug
end
where broker_slug is null;


-- NOTE on the meaning of a NULL terminal_path.
--
-- It used to mean "use whichever terminal is already running" -- build_pool_plan
-- skipped the account entirely and it executed inline on the active terminal.
-- That is how a follower's order could land on the master: one terminal, one
-- login, two processes racing for it.
--
-- It now means "unassigned -- the worker should claim a free slot for this
-- broker". The worker refuses to trade an account it has not assigned a terminal
-- to, rather than falling back to whatever happens to be logged in.
