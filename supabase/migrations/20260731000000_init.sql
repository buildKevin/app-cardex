-- CarDex — MVP schema
-- Five tables: users, cars, collections, garage, badges.
-- Badge unlocks and collection progress are derived from `garage`, never stored,
-- so they can never drift out of sync with the cars actually owned.

-- gen_random_uuid() is built into Postgres 13+, so no extension is needed.
-- uuid-ossp lived in the `extensions` schema on hosted Supabase and was not on
-- the migration's search_path, which made the whole migration fail there.

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
  -- Scans that actually matched the catalogue. This is the paywall counter.
  scan_count  integer not null default 0,
  -- Every vision call, matched or not. Only a ceiling against abuse: without
  -- it, a free user parked at 9/10 could photograph uncatalogued cars forever
  -- and bill us for a model call each time.
  vision_calls integer not null default 0,
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
  id            uuid primary key default gen_random_uuid(),
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

-- ─────────────────────────────────────────────────────── privileges ────────
-- Granted explicitly rather than inherited from platform defaults: those
-- differ between a local stack and a hosted project, and "the app cannot read
-- its own garage" is a miserable way to discover the difference. RLS then
-- narrows these down to the caller's own rows.
grant select on public.collections, public.cars, public.badges to anon, authenticated, service_role;

grant select on public.users to authenticated;
grant select, insert, delete on public.garage to authenticated;

-- The edge functions run as service_role: identify-car touches the counters,
-- delete-account has to be able to erase the account outright.
grant select, insert, update, delete on public.users, public.garage to service_role;

-- RLS decides which ROWS a user may touch, never which COLUMNS. Without the two
-- statements below, a client could set is_founder = true or scan_count = 0 on
-- its own row and walk straight past the paywall. Only service_role (edge
-- function, RevenueCat webhook) may write those columns.
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

-- ─────────────────────────────────────────── authoritative car matching ────
-- Mirrors src/lib/match.ts. The client matches locally for display, but the
-- server must reach the same verdict on its own to decide whether a scan is
-- chargeable — a client is free to lie about having missed.
-- Strips the accents we actually use, without requiring the unaccent extension
-- (unavailable on some managed tiers).
create or replace function public.unaccent_lite(p_input text)
returns text
language sql
immutable
as $$
  select translate(
    p_input,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  )
$$;

create or replace function public.normalize_name(p_input text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(unaccent_lite(p_input)), '[^a-z0-9]+', ' ', 'g'))
$$;

/**
 * Returns the catalogue car id for a make/model pair, or null.
 * Longest matching alias wins, so "Golf GTI" cannot resolve to a plain Golf.
 */
create or replace function public.match_car_id(p_make text, p_model text)
returns text
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_make       text := normalize_name(coalesce(p_make, ''));
  v_model      text := normalize_name(coalesce(p_model, ''));
  v_collection text;
  v_car_id     text;
begin
  if v_make = '' or v_model = '' then
    return null;
  end if;

  -- Brand first: longest matching alias wins, exact match ahead of it. Ordering
  -- by brand name instead would let a short alias on an unrelated brand hijack
  -- the make ("lamborghini" contains Mercedes' old "mb" alias).
  select c.id into v_collection
  from public.collections c
  cross join lateral (
    select cand, length(cand) as len, (v_make = cand) as exact
    from unnest(array[normalize_name(c.name)] || (
      select coalesce(array_agg(normalize_name(a)), '{}') from unnest(c.aliases) a
    )) cand
    where cand <> ''
      and (v_make = cand or v_make like '%' || cand || '%' or cand like '%' || v_make || '%')
  ) b
  order by b.exact desc, b.len desc
  limit 1;

  if v_collection is null then
    return null;
  end if;

  -- Then the model, taking the longest alias that matches.
  select car.id into v_car_id
  from public.cars car
  cross join lateral (
    select cand, length(cand) as len, (v_model = cand) as exact
    from unnest(array[normalize_name(car.model)] || (
      select coalesce(array_agg(normalize_name(a)), '{}') from unnest(car.aliases) a
    )) cand
    where cand <> ''
      and (v_model = cand or v_model like '%' || cand || '%' or cand like '%' || v_model || '%')
  ) m
  where car.collection_id = v_collection
  order by m.exact desc, m.len desc
  limit 1;

  return v_car_id;
end $$;

-- ────────────────────────────────────────── free-tier scan accounting ──────
-- Two-phase on purpose. begin_scan runs BEFORE the model call, so we never pay
-- for a request we were going to refuse; commit_scan runs AFTER, and only when
-- the result matched the catalogue, so a gap in our own data costs the player
-- nothing.
create or replace function public.begin_scan(
  p_user_id     uuid,
  p_free_limit  integer default 10,
  p_call_ceiling integer default 40
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_founder boolean;
  v_count   integer;
  v_calls   integer;
begin
  select is_founder, scan_count, vision_calls
    into v_founder, v_count, v_calls
  from public.users where id = p_user_id for update;

  if not found then
    return false;
  end if;

  if not v_founder and v_count >= p_free_limit then
    return false;
  end if;

  -- Bounds the cost of repeated misses without ever troubling an honest player.
  if not v_founder and v_calls >= p_call_ceiling then
    return false;
  end if;

  update public.users
     set vision_calls = vision_calls + 1, updated_at = now()
   where id = p_user_id;

  return true;
end $$;

create or replace function public.commit_scan(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users
     set scan_count = scan_count + 1, updated_at = now()
   where id = p_user_id;
end $$;

-- Superseded by begin_scan/commit_scan; dropped so no caller can rely on the
-- old single-phase behaviour that charged before knowing the result.
drop function if exists public.consume_scan(uuid, integer);
