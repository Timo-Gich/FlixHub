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

-- In-app notification preferences and per-user notifications.
create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notifications_enabled boolean not null default false,
  in_app_enabled boolean not null default false,
  browser_enabled boolean not null default false,
  notify_continue_watching boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings
  add column if not exists notifications_enabled boolean not null default false;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (user_id, dedupe_key)
);
alter table public.notifications
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_expires_at_idx
  on public.notifications (expires_at);

-- Push endpoints are private credentials and are only readable by the push API
-- using the server-side service role, never by another signed-in user.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

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
alter table public.notification_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

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

drop policy if exists "notification settings owner" on public.notification_settings;
create policy "notification settings owner" on public.notification_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notifications owner" on public.notifications;
create policy "notifications owner" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push subscriptions owner" on public.push_subscriptions;
create policy "push subscriptions owner" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ============================================================================
-- Custom avatars — Supabase Storage bucket + policies.
-- Files are stored at avatars/<userId>/avatar.<ext> (public read, owner write).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
