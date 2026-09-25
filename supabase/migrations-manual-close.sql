-- Close a position from the app.
--
-- Run once in the Supabase SQL editor. Idempotent.
--
-- The Live Trading page's Close button queues a `close_position` worker
-- command naming the account and the position ticket; the worker closes it on
-- that account's own terminal (engine/manual_close.py). The check constraint
-- below exists so a command type the worker does not implement fails loudly at
-- insert instead of sitting pending forever -- which means a new type has to be
-- added here before the button can queue it.

alter table public.worker_commands drop constraint if exists worker_commands_known_type;
alter table public.worker_commands add constraint worker_commands_known_type
  check (command_type in ('flatten', 'test_connection', 'reload_config', 'close_position'));
