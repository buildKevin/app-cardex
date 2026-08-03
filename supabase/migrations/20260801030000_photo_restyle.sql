-- Photo restyle — the garage photo re-shot by an image model into a nicer
-- setting, for the profile and the showcase.
--
-- Accounting mirrors begin_scan/commit_scan exactly, and for the same reasons:
-- refuse before paying for the model call, charge only on success. An image
-- call costs 10-40x a vision call, so the ceiling matters more here than it
-- does on scans.

-- The rendering, kept ALONGSIDE the original. Overwriting photo_path would make
-- the feature destructive: a player who dislikes the result could never get
-- their own photograph back, and the original is also what a future re-render
-- has to start from.
alter table public.garage add column if not exists styled_photo_path text;

alter table public.users
  add column if not exists restyle_count integer not null default 0,
  -- Attempts, successful or not. Same role as users.vision_calls: without it a
  -- free player sitting at 0/1 could fail a generation forever and bill us for
  -- an image call each time.
  add column if not exists restyle_calls integer not null default 0,
  -- Pro's allowance is monthly, so it needs a window. Free's is not — see below.
  add column if not exists restyle_period_start date not null
    default date_trunc('month', now())::date;

-- ─────────────────────────────────────────────── restyle accounting ─────────
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

-- ───────────────────────────────────────────────────────── lock down ────────
-- All three roles, per the rule that cost us a production hole on
-- record_discovered_car: `from public` alone leaves Supabase's default-privilege
-- grant to anon/authenticated intact, and naming only those two leaves the
-- inherited PUBLIC grant intact.
revoke execute on function public.begin_restyle(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.commit_restyle(uuid)
  from public, anon, authenticated;

grant execute on function public.begin_restyle(uuid, integer, integer, integer) to service_role;
grant execute on function public.commit_restyle(uuid) to service_role;

-- The same hole, still open on the scan counters. Both take p_user_id and are
-- security definer, so any authenticated client could have called
-- commit_scan(<someone else's uuid>) and burned a stranger's free scans. Only
-- identify-car calls these, and it uses the service role.
revoke execute on function public.begin_scan(uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.commit_scan(uuid)
  from public, anon, authenticated;

grant execute on function public.begin_scan(uuid, integer, integer) to service_role;
grant execute on function public.commit_scan(uuid) to service_role;

-- No grant needed for the new column: service_role already holds update on
-- public.garage, and `authenticated` holds select/insert/delete but never
-- update — so a client can read its rendering back and not forge one.
