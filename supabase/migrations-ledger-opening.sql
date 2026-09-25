-- When an account's opening balance was taken.
--
-- Run once in the Supabase SQL editor. Idempotent.
--
-- The problem: "Journal trades" on the Trade Copier creates a dashboard account
-- whose size is the broker's balance at that moment, then the worker journals
-- the last 72 hours of that account's trades. Every one of those trades is
-- already inside the balance, so the ledger (src/utils/ledger.ts) added three
-- days of profit a second time and the account's balance tile read high.
--
-- With this column set, the ledger only counts activity after it toward the
-- balance. Null keeps the old meaning -- size is the true starting capital and
-- every trade counts -- which is right for every account a person typed in.

alter table public.accounts
  add column if not exists opening_balance_at timestamptz;

comment on column public.accounts.opening_balance_at is
  'When `size` was read from the broker. Trades closed before this are already '
  'inside size and do not move the balance. Null: size is the starting capital.';

-- Backfill the accounts the Trade Copier created itself, and only those. They
-- are recognisable: stage 'live', linked from a copier account, and carrying
-- that copier account's own account number (createJournalAccount copies it).
-- An existing account the trader linked by hand has its own size and is left
-- alone. created_at is when the balance was read -- the same insert.
update public.accounts a
set opening_balance_at = a.created_at
from public.trading_accounts ta
where ta.account_id = a.id
  and a.stage = 'live'
  and a.account_number = ta.account_number
  and a.opening_balance_at is null;
