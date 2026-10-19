-- ============================================================================
-- FlixHub optional accounts — Supabase schema (STEP 2 of the setup guide).
-- Run this whole file once in Supabase Dashboard → SQL Editor → New query.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / upsert-style policies).
-- ============================================================================

-- Profiles (one row per auth user, created on first sign-in by the trigger).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Watchlist: one row per (user, title).
create table if not exists public.watchlist_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  media_id text not null,
  media_type text not null default 'movie',
  snapshot jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

-- History: one row per (user, title, season, episode). Movies use NULL season
-- and episode. Progress only ever increases (enforced client-side + here via
-- greatest() in the upsert examples in docs/accounts.md).
create table if not exists public.history_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  media_id text not null,
  snapshot jsonb not null,
  progress_seconds integer not null default 0,
  duration_seconds integer not null default 0,
  type text,
  season integer,
  episode integer,
  watched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id, season, episode)
);

-- Live TV favorites: one row per (user, channel).
create table if not exists public.favorites_live (
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_id text not null,
  snapshot jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: users can only read/write their own rows.
alter table public.profiles enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.history_items enable row level security;
alter table public.favorites_live enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "watchlist owner" on public.watchlist_items;
create policy "watchlist owner" on public.watchlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "history owner" on public.history_items;
create policy "history owner" on public.history_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favorites live owner" on public.favorites_live;
create policy "favorites live owner" on public.favorites_live
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
