-- Run in Supabase SQL Editor to add Watchlist Collections to an existing project.
-- Safe to re-run.

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists collections_user_created_idx
  on public.collections (user_id, created_at);

alter table public.collections enable row level security;

drop policy if exists "collections owner" on public.collections;
create policy "collections owner" on public.collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.watchlist_items
  add column if not exists collection_id uuid
  references public.collections (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'collections'
  ) then
    alter publication supabase_realtime add table public.collections;
  end if;
end;
$$;
