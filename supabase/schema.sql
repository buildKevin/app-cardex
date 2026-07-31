-- CarDex — MVP schema
-- Five tables: users, cars, collections, garage, badges.
-- Badge unlocks and collection progress are derived from `garage`, never stored,
-- so they can never drift out of sync with the cars actually owned.

create extension if not exists "uuid-ossp";

-- ───────────────────────────────────────────────────────────── enums ─────────
do $$ begin
  create type rarity as enum ('common', 'rare', 'epic', 'legendary');
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────── collections ────────
-- One row per brand. A collection is what the player is trying to complete.
create table if not exists public.collections (
  id           text primary key,            -- 'ferrari'
  name         text not null,               -- 'Ferrari'
  country      text not null,
  size         smallint not null default 5,
  aliases      text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────── cars ───────
create table if not exists public.cars (
  id            text primary key,           -- 'ferrari-488-gtb'
  collection_id text not null references public.collections (id) on delete cascade,
  model         text not null,
  generation    text not null default '',
  year_from     smallint not null,
  year_to       smallint,
  power         integer not null,
  country       text not null,
  price_new     integer not null,
  rarity        rarity not null,
  aliases       text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists cars_collection_idx on public.cars (collection_id);

-- ────────────────────────────────────────────────────────────── users ───────
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null default 'Collectionneur',
  is_founder  boolean not null default false,
  scan_count  integer not null default 0,
  -- Up to three garage ids shown large on the profile.
  showcase    uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Every new auth user gets a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────── garage ───────
create table if not exists public.garage (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users (id) on delete cascade,
  -- null when the vision model returned a car that is not in the catalogue yet.
  car_id        text references public.cars (id) on delete set null,
  collection_id text references public.collections (id) on delete set null,
  make          text not null,
  model         text not null,
  year          smallint,
  rarity        rarity not null default 'common',
  -- Path inside the `scans` storage bucket.
  photo_path    text,
  xp            integer not null default 10,
  confidence    real not null default 0,
  discovered_at timestamptz not null default now()
);

create index if not exists garage_user_idx on public.garage (user_id, discovered_at desc);
create index if not exists garage_user_car_idx on public.garage (user_id, car_id);

-- ───────────────────────────────────────────────────────────── badges ───────
-- Catalogue only. Whether a badge is unlocked is computed from `garage`.
create table if not exists public.badges (
  id           text primary key,            -- 'collector-ferrari'
  name         text not null,
  description  text not null,
  kind         text not null,               -- 'collection' | 'cars' | 'rarity' | 'scans' | 'xp'
  target       integer not null,
  collection_id text references public.collections (id) on delete cascade
);

-- ──────────────────────────────────────────────────────────────── RLS ───────
alter table public.users       enable row level security;
alter table public.garage      enable row level security;
alter table public.cars        enable row level security;
alter table public.collections enable row level security;
alter table public.badges      enable row level security;

-- Catalogue is world-readable, write is service-role only.
drop policy if exists "cars are public" on public.cars;
create policy "cars are public" on public.cars for select using (true);

drop policy if exists "collections are public" on public.collections;
create policy "collections are public" on public.collections for select using (true);

drop policy if exists "badges are public" on public.badges;
create policy "badges are public" on public.badges for select using (true);

-- A user sees and edits only their own profile.
drop policy if exists "own profile" on public.users;
create policy "own profile" on public.users
  for select using (auth.uid() = id);

drop policy if exists "update own profile" on public.users;
create policy "update own profile" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- RLS decides which ROWS a user may touch, never which COLUMNS. Without the
-- grants below, a client could set is_founder = true or scan_count = 0 on its
-- own row and walk straight past the paywall. Only the service role (edge
-- function, RevenueCat webhook) may write those two columns.
revoke update on public.users from anon, authenticated;
grant update (username, showcase) on public.users to authenticated;

-- A user sees and edits only their own garage.
drop policy if exists "own garage" on public.garage;
create policy "own garage" on public.garage
  for select using (auth.uid() = user_id);

drop policy if exists "insert own garage" on public.garage;
create policy "insert own garage" on public.garage
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete own garage" on public.garage;
create policy "delete own garage" on public.garage
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────── storage ────────
insert into storage.buckets (id, name, public)
values ('scans', 'scans', false)
on conflict (id) do nothing;

-- Photos live at scans/<user-id>/<file>.jpg
drop policy if exists "read own scans" on storage.objects;
create policy "read own scans" on storage.objects
  for select using (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "write own scans" on storage.objects;
create policy "write own scans" on storage.objects
  for insert with check (bucket_id = 'scans' and (storage.foldername(name))[1] = auth.uid()::text);

-- ────────────────────────────────────────────── free-tier scan counter ─────
-- Called by the identify-car edge function. Returns false when the free
-- allowance is exhausted, so the limit cannot be bypassed from the client.
create or replace function public.consume_scan(p_user_id uuid, p_free_limit integer default 10)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_founder boolean;
  v_count   integer;
begin
  select is_founder, scan_count into v_founder, v_count
  from public.users where id = p_user_id for update;

  if not found then
    return false;
  end if;

  if not v_founder and v_count >= p_free_limit then
    return false;
  end if;

  update public.users
     set scan_count = scan_count + 1, updated_at = now()
   where id = p_user_id;

  return true;
end $$;
