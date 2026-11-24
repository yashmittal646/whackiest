-- Paste into Supabase > SQL Editor > New query > Run. Safe to run again.
-- The server stores only ciphertext. Each signed-in user can reach only their own rows.

create table if not exists public.vaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  salt text not null check (length(salt) <= 64),
  iterations integer not null check (iterations >= 600000),
  wrapped text not null check (length(wrapped) <= 256)
);

create table if not exists public.records (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[0-9a-f]{32}$'),
  data text not null check (length(data) <= 8192),
  primary key (user_id, id)
);

alter table public.vaults enable row level security;
alter table public.records enable row level security;

revoke all on public.vaults, public.records from anon, authenticated;
-- No update or delete on vaults: replacing the key would make every record unreadable.
grant select, insert on public.vaults to authenticated;
grant select, insert, update, delete on public.records to authenticated;

drop policy if exists "own vault read" on public.vaults;
drop policy if exists "own vault create" on public.vaults;
drop policy if exists "own records" on public.records;
create policy "own vault read" on public.vaults for select to authenticated using ((select auth.uid()) = user_id);
create policy "own vault create" on public.vaults for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own records" on public.records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Deletes the signed-in user. Their vault and records go with them.
create or replace function public.delete_me() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
