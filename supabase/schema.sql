-- EagleCapital — Supabase schema (Phase 5: auth + broker connections foundation)
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all using (auth.uid() = id);

create table public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  broker_id text not null,       -- e.g. 'tradovate', 'rithmic', 'mt4', 'other'
  label text not null,           -- e.g. "Tradovate — main account"
  status text not null default 'pending', -- 'pending' | 'connected' | 'error' | 'disconnected'
  created_at timestamptz default now()
);
alter table public.broker_connections enable row level security;
create policy "own connections" on public.broker_connections for all using (auth.uid() = user_id);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();
