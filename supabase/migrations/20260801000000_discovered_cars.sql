-- Community fiches for cars our catalogue does not list.
--
-- When match_car_id() comes back empty, identify-car asks the model to rate the
-- car and stores the answer HERE — never in public.cars, which is regenerated
-- from seed.sql by scripts/generate-seed.mjs and would lose the row on the next
-- run. Keeping the two apart also keeps collection sizes fixed: a discovered
-- car must never enlarge a brand's collection, or a player who completed
-- Ferrari would see the badge come off because someone else found one more.
--
-- The fiche is written once and served verbatim afterwards, so two players who
-- scan the same Pagani get the same specs and the same XP.

-- Brand alone. Extracted from match_car_id so identify-car can attach a brand
-- to a discovered car without also claiming a catalogue match; match_car_id
-- calls it so the two can never drift. Same query, moved — match_car_id's
-- verdicts are unchanged, and npm run verify:matchers proves it.
create or replace function public.match_collection_id(p_make text)
returns text
language sql
stable
security definer set search_path = public
as $$
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

alter table public.garage
  add column if not exists discovered_car_id text
    references public.discovered_cars (id) on delete set null;

alter table public.discovered_cars enable row level security;

-- A pending fiche rests on a single sighting, so it is shown only to the player
-- who found it. One independent agreement makes it everyone's.
drop policy if exists "confirmed fiches are shared" on public.discovered_cars;
create policy "confirmed fiches are shared" on public.discovered_cars
  for select using (status = 'confirmed' or discovered_by = auth.uid());

grant select on public.discovered_cars to authenticated;
grant select, insert, update, delete on public.discovered_cars to service_role;

-- ──────────────────────────────────────────────── discovered-car lookups ────

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
  v_make_key text := normalize_name(coalesce(p_make, ''));
  v_model_key text := normalize_name(coalesce(p_model, ''));
  v_row public.discovered_cars;
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
  v_row public.discovered_cars;
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
-- It has to be `from public`, not `from anon, authenticated`. Postgres grants
-- execute to PUBLIC on every new function, and those two roles inherit it, so
-- revoking them by name leaves the inherited grant in place and changes
-- nothing — which is exactly what a first pass at this did.
revoke execute on function public.record_discovered_car(
  text, text, text, text, smallint, smallint, integer, text, integer, rarity, uuid, real
) from public;
revoke execute on function public.touch_discovered_car(text, uuid) from public;

grant execute on function public.record_discovered_car(
  text, text, text, text, smallint, smallint, integer, text, integer, rarity, uuid, real
) to service_role;
grant execute on function public.touch_discovered_car(text, uuid) to service_role;
