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
  is_pro      boolean not null default false,
  -- Scans that actually matched the catalogue. This is the paywall counter.
  scan_count  integer not null default 0,
  -- Every vision call, matched or not. Only a ceiling against abuse: without
  -- it, a free user parked at 9/10 could photograph uncatalogued cars forever
  -- and bill us for a model call each time.
  vision_calls integer not null default 0,
  -- Successful photo restyles. Free's allowance is for the lifetime of the
  -- account, Pro's is monthly — see begin_restyle().
  restyle_count integer not null default 0,
  -- Restyle attempts, successful or not. Same role as vision_calls, and it
  -- matters more here: an image call costs 10-40x a vision call.
  restyle_calls integer not null default 0,
  restyle_period_start date not null default date_trunc('month', now())::date,
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

-- ─────────────────────────────────────────────────── discovered cars ───────
-- Community fiches for cars the catalogue does not list. Deliberately NOT rows
-- in public.cars: that table is regenerated from seed.sql by
-- scripts/generate-seed.mjs and would drop them, and a discovered car must
-- never enlarge a brand's collection — a player who completed Ferrari would
-- watch the badge come off because someone else found one more.
--
-- The fiche is written once and served verbatim afterwards, so two players who
-- scan the same Pagani get the same specs and the same XP.
create table if not exists public.discovered_cars (
  id            text primary key,           -- 'pagani-huayra', from the keys below
  -- normalize_name() of make/model. The lookup is an exact key match, not the
  -- fuzzy alias scoring public.cars gets: aliases are curated, and fuzzy
  -- matching on user-generated rows would let one bad fiche swallow its
  -- neighbours. The cost is that "Huayra" and "Huayra Roadster" are two rows.
  make_key      text not null,
  model_key     text not null,
  collection_id text references public.collections (id) on delete set null,
  make          text not null,
  model         text not null,
  -- Every spec is nullable: the model is allowed to say it does not know one,
  -- and a hole is cheaper than an invention.
  generation    text,
  year_from     smallint,
  year_to       smallint,
  power         integer,
  country       text,
  price_new     integer,
  -- Served rarity, capped at 'epic' by record_discovered_car.
  rarity        rarity not null default 'rare',
  -- What the model actually asked for, so legendary can be granted by review
  -- instead of on the word of one photo.
  proposed_rarity rarity not null default 'rare',
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'rejected')),
  discovered_by uuid references public.users (id) on delete set null,
  confirmed_by  uuid references public.users (id) on delete set null,
  confidence    real not null default 0,
  scan_count    integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (make_key, model_key)
);

-- ───────────────────────────────────────────────────────────── garage ───────
create table if not exists public.garage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  -- null when the vision model returned a car that is not in the catalogue yet.
  car_id        text references public.cars (id) on delete set null,
  -- Set instead of car_id when the car came from discovered_cars.
  discovered_car_id text references public.discovered_cars (id) on delete set null,
  collection_id text references public.collections (id) on delete set null,
  make          text not null,
  model         text not null,
  year          smallint,
  rarity        rarity not null default 'common',
  -- Path inside the `scans` storage bucket.
  photo_path    text,
  -- The AI rendering, kept ALONGSIDE the original rather than replacing it:
  -- the feature must not be destructive, and a re-render starts from the
  -- original photograph, never from a previous rendering.
  styled_photo_path text,
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
alter table public.users           enable row level security;
alter table public.garage          enable row level security;
alter table public.cars            enable row level security;
alter table public.collections     enable row level security;
alter table public.badges          enable row level security;
alter table public.discovered_cars enable row level security;

-- A pending fiche rests on a single sighting, so it is shown only to the player
-- who found it. One independent agreement makes it everyone's.
drop policy if exists "confirmed fiches are shared" on public.discovered_cars;
create policy "confirmed fiches are shared" on public.discovered_cars
  for select using (status = 'confirmed' or discovered_by = auth.uid());

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
-- Read-only for the client: fiches are written by the edge function alone.
grant select on public.discovered_cars to authenticated;
grant select, insert, update, delete on public.discovered_cars to service_role;

-- The edge functions run as service_role: identify-car touches the counters,
-- delete-account has to be able to erase the account outright.
grant select, insert, update, delete on public.users, public.garage to service_role;

-- RLS decides which ROWS a user may touch, never which COLUMNS. Without the two
-- statements below, a client could set is_pro = true or scan_count = 0 on
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
-- Brand alone. Extracted from match_car_id so identify-car can attach a brand
-- to a discovered car without also claiming a catalogue match; match_car_id
-- calls it so the two can never drift.
create or replace function public.match_collection_id(p_make text)
returns text
language sql
stable
security definer set search_path = public
as $$
  -- Longest matching alias wins, exact match ahead of it. Ordering by brand
  -- name instead would let a short alias on an unrelated brand hijack the make
  -- ("lamborghini" contains Mercedes' old "mb" alias).
  select c.id
  from public.collections c
  cross join lateral (
    select cand, length(cand) as len, (normalize_name(coalesce(p_make, '')) = cand) as exact
    from unnest(array[normalize_name(c.name)] || (
      select coalesce(array_agg(normalize_name(a)), '{}') from unnest(c.aliases) a
    )) cand
    where cand <> ''
      and normalize_name(coalesce(p_make, '')) <> ''
      and (normalize_name(coalesce(p_make, '')) = cand
           or normalize_name(coalesce(p_make, '')) like '%' || cand || '%'
           or cand like '%' || normalize_name(coalesce(p_make, '')) || '%')
  ) b
  order by b.exact desc, b.len desc
  limit 1;
$$;

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

  v_collection := public.match_collection_id(p_make);

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
  v_pro     boolean;
  v_count   integer;
  v_calls   integer;
begin
  select is_pro, scan_count, vision_calls
    into v_pro, v_count, v_calls
  from public.users where id = p_user_id for update;

  if not found then
    return false;
  end if;

  if not v_pro and v_count >= p_free_limit then
    return false;
  end if;

  -- Bounds the cost of repeated misses without ever troubling an honest player.
  if not v_pro and v_calls >= p_call_ceiling then
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

-- ─────────────────────────────────────── photo-restyle accounting ───────────
-- Same two-phase shape as the scan counters, and the reasoning transfers: an
-- image call costs 10-40x a vision call, so refusing before we pay and charging
-- only on success matters more here, not less.
create or replace function public.begin_restyle(
  p_user_id      uuid,
  p_free_limit   integer default 1,
  p_pro_limit    integer default 30,
  p_call_ceiling integer default 3
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_pro     boolean;
  v_count   integer;
  v_calls   integer;
  v_start   date;
  v_month   date := date_trunc('month', now())::date;
  v_limit   integer;
  v_ceiling integer;
begin
  select is_pro, restyle_count, restyle_calls, restyle_period_start
    into v_pro, v_count, v_calls, v_start
  from public.users where id = p_user_id for update;

  if not found then
    return false;
  end if;

  -- Only Pro's window rolls over. A free player gets one rendering *ever*, not
  -- one a month — rolling their counter would quietly hand out twelve a year
  -- and there would be no second click that ever reaches the paywall.
  if v_pro and v_start < v_month then
    update public.users
       set restyle_count = 0,
           restyle_calls = 0,
           restyle_period_start = v_month,
           updated_at = now()
     where id = p_user_id;
    v_count := 0;
    v_calls := 0;
  end if;

  if v_pro then
    v_limit   := p_pro_limit;
    -- Pro pays enough that a generous retry margin is cheaper than a support
    -- thread; the ceiling is only here to bound a script.
    v_ceiling := p_pro_limit * 2;
  else
    v_limit   := p_free_limit;
    v_ceiling := p_call_ceiling;
  end if;

  if v_count >= v_limit or v_calls >= v_ceiling then
    return false;
  end if;

  update public.users
     set restyle_calls = restyle_calls + 1, updated_at = now()
   where id = p_user_id;

  return true;
end $$;

create or replace function public.commit_restyle(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users
     set restyle_count = restyle_count + 1, updated_at = now()
   where id = p_user_id;
end $$;

-- A model call we were never billed for must not count against the ceiling.
-- begin_restyle() charges before the call; when OpenAI answers with an HTTP
-- error nothing was generated and nothing was billed, so an outage of ours must
-- not cost a free player their only attempt. Not called on a timeout: a request
-- that hung may well have been billed.
create or replace function public.refund_restyle_call(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users
     set restyle_calls = greatest(restyle_calls - 1, 0), updated_at = now()
   where id = p_user_id;
end $$;

-- Every counter function is definer and takes p_user_id, so an authenticated
-- client that could reach one could burn a *stranger's* allowance. Only the
-- edge functions call them, with the service role.
revoke execute on function public.begin_restyle(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.commit_restyle(uuid)
  from public, anon, authenticated;
revoke execute on function public.refund_restyle_call(uuid)
  from public, anon, authenticated;
revoke execute on function public.begin_scan(uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.commit_scan(uuid)
  from public, anon, authenticated;

grant execute on function public.begin_restyle(uuid, integer, integer, integer) to service_role;
grant execute on function public.commit_restyle(uuid) to service_role;
grant execute on function public.refund_restyle_call(uuid) to service_role;
grant execute on function public.begin_scan(uuid, integer, integer) to service_role;
grant execute on function public.commit_scan(uuid) to service_role;

-- ──────────────────────────────────────────────── discovered-car lookups ────
-- Reached only when match_car_id() came back empty. Defined down here because
-- they need normalize_name().

create or replace function public.find_discovered_car(p_make text, p_model text)
returns public.discovered_cars
language sql
stable
security definer set search_path = public
as $$
  select d.*
  from public.discovered_cars d
  where d.make_key = normalize_name(coalesce(p_make, ''))
    and d.model_key = normalize_name(coalesce(p_model, ''))
    and d.status <> 'rejected'
  limit 1;
$$;

-- First sighting. `on conflict` is not defensive dressing: two players can scan
-- the same unlisted car at the same moment, and the loser of that race must
-- still be served the fiche that won rather than an error.
create or replace function public.record_discovered_car(
  p_make          text,
  p_model         text,
  p_collection_id text,
  p_generation    text,
  p_year_from     smallint,
  p_year_to       smallint,
  p_power         integer,
  p_country       text,
  p_price_new     integer,
  p_rarity        rarity,
  p_user_id       uuid,
  p_confidence    real
)
returns public.discovered_cars
language plpgsql
security definer set search_path = public
as $$
declare
  v_make_key  text := normalize_name(coalesce(p_make, ''));
  v_model_key text := normalize_name(coalesce(p_model, ''));
  v_row       public.discovered_cars;
begin
  if v_make_key = '' or v_model_key = '' then
    return null;
  end if;

  insert into public.discovered_cars (
    id, make_key, model_key, collection_id, make, model, generation,
    year_from, year_to, power, country, price_new,
    rarity, proposed_rarity, discovered_by, confidence
  ) values (
    replace(v_make_key || '-' || v_model_key, ' ', '-'),
    v_make_key, v_model_key, p_collection_id, p_make, p_model, p_generation,
    p_year_from, p_year_to, p_power, p_country, p_price_new,
    -- Enum comparison follows declaration order, so this is the epic ceiling.
    least(p_rarity, 'epic'::rarity), p_rarity, p_user_id, coalesce(p_confidence, 0)
  )
  on conflict (make_key, model_key) do update
    set scan_count = public.discovered_cars.scan_count + 1,
        updated_at = now()
  returning * into v_row;

  return v_row;
end $$;

-- A later sighting of a fiche we already hold. Bumps the counter and, when the
-- scanner is not the discoverer, promotes the fiche to everyone.
create or replace function public.touch_discovered_car(p_id text, p_user_id uuid)
returns public.discovered_cars
language plpgsql
security definer set search_path = public
as $$
declare
  v_row      public.discovered_cars;
  v_confirms boolean;
begin
  select d.status = 'pending' and d.discovered_by is distinct from p_user_id
    into v_confirms
  from public.discovered_cars d where d.id = p_id for update;

  if not found then
    return null;
  end if;

  update public.discovered_cars d
     set scan_count = d.scan_count + 1,
         status = case when v_confirms then 'confirmed' else d.status end,
         confirmed_by = case when v_confirms then p_user_id else d.confirmed_by end,
         updated_at = now()
   where d.id = p_id
  returning * into v_row;

  return v_row;
end $$;

-- These two write data every player then reads, so they must never be reachable
-- from a client: with a plain anon key, anyone could post fiches for cars that
-- do not exist, or confirm their own. The edge function calls them as
-- service_role.
--
-- All three roles have to be named, because two independent grants exist and
-- each looks sufficient on its own:
--   * Postgres grants execute to PUBLIC on every new function, which anon and
--     authenticated inherit — so `from anon, authenticated` alone is a no-op.
--   * Supabase ships `alter default privileges ... grant execute on functions to
--     anon, authenticated, service_role`, so a hosted project ALSO carries an
--     explicit grant to those roles — which `from public` alone leaves intact.
-- This test harness has no default privileges, so `from public` passes here and
-- still leaves production open. Verify a revoke against the deployed project.
revoke execute on function public.record_discovered_car(
  text, text, text, text, smallint, smallint, integer, text, integer, rarity, uuid, real
) from public, anon, authenticated;
revoke execute on function public.touch_discovered_car(text, uuid)
  from public, anon, authenticated;
-- find_discovered_car is security definer too, so RLS does not apply to what it
-- returns: a client calling it would read another player's pending fiche. The
-- client reads fiches through the table, where the policy holds.
revoke execute on function public.find_discovered_car(text, text)
  from public, anon, authenticated;

grant execute on function public.record_discovered_car(
  text, text, text, text, smallint, smallint, integer, text, integer, rarity, uuid, real
) to service_role;
grant execute on function public.touch_discovered_car(text, uuid) to service_role;
grant execute on function public.find_discovered_car(text, text) to service_role;
