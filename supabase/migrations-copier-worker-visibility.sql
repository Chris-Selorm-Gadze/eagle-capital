-- Make a user's own worker visible to them.
--
-- Run this once in the Supabase SQL editor. It is idempotent.
--
-- The problem it fixes: `worker_nodes` was modelled as shared fleet
-- infrastructure with no owner column, and its RLS policy was
-- `using (public.is_admin())`. An ordinary user's `select * from worker_nodes`
-- therefore returned zero rows — not an error, just nothing — so the Trade
-- Copier banner read "No worker - Nothing is executing trades" permanently,
-- even with a worker registered and heartbeating every 30 seconds.
--
-- That is the single most misleading thing that page can say: it is the one
-- indicator a trader is meant to check before trusting that orders will mirror,
-- and it was stuck on the alarming answer regardless of the truth.
--
-- The fix is ownership, not a wider policy. `worker_nodes` gets a `user_id`,
-- copier-gateway stamps it from the worker's `X-User-Id` on register, and the
-- policy is the same owner-scoped shape every other table here uses.

alter table public.worker_nodes
  add column if not exists user_id uuid references public.tc_users(id) on delete set null;

create index if not exists idx_worker_nodes_user on public.worker_nodes(user_id);

comment on column public.worker_nodes.user_id is
  'Who this worker runs for. Stamped by copier-gateway from X-User-Id on register.';

drop policy if exists "admins read worker nodes" on public.worker_nodes;
drop policy if exists "read own worker nodes" on public.worker_nodes;
create policy "read own worker nodes" on public.worker_nodes for select using (
  public.is_admin() or auth.uid() = user_id
);

-- REQUIRES the worker in worker/ (this repo), whose api_client.py sends
-- X-User-Id on register. The upstream delta_engine worker passed
-- include_user=False, so its row lands with user_id NULL, stays invisible under
-- the policy above, and the banner keeps lying. If you are still running the old
-- clone, stop: use worker/ instead.

-- Rows registered before that change have no owner and no way to acquire one.
-- There is no user context to infer here, so they are left alone rather than
-- guessed at: delete them once the patched worker has registered its own row.
--
--   select id, worker_name, host_identifier, user_id, last_heartbeat_at
--   from public.worker_nodes order by last_heartbeat_at desc nulls last;
--
--   delete from public.worker_nodes where user_id is null;
