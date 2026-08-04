-- The free sticker moved onto the device, so the AI redraw becomes Pro-only.
--
-- Every car now gets a die-cut sticker for nothing: lifted off its background by
-- Vision on the phone, in ~200 ms, offline, with no model call and nothing
-- stored. That is what a free player's garage is made of, and it is why the
-- redraw no longer has to be given away to prove the feature exists — the player
-- is looking at a sticker of their own car, and « Embellir » sells the version
-- that is drawn rather than cut out.
--
-- The consequence here is one number: p_free_limit goes from 1 to 0.
--
-- What replaces the free rendering is a *comparison* rather than a counter. The
-- old design gave one away because a paywall on a feature nobody had seen sells
-- nothing; the die-cut is that demonstration now, and it is free forever.
create or replace function public.begin_restyle(
  p_user_id      uuid,
  p_free_limit   integer default 0,
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

  -- Still only Pro's window, and the reason has changed rather than gone: a free
  -- player has no allowance to roll over at all now. Rolling the counter anyway
  -- would be harmless today and a twelve-a-year giveaway the moment p_free_limit
  -- was ever raised again, so the guard stays.
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

  -- With v_limit at 0 this is where every free caller now stops, before a single
  -- token is spent. The client refuses first for the UX, exactly as it does on
  -- scans, and this is the refusal that actually holds.
  if v_count >= v_limit or v_calls >= v_ceiling then
    return false;
  end if;

  update public.users
     set restyle_calls = restyle_calls + 1, updated_at = now()
   where id = p_user_id;

  return true;
end $$;

-- Re-issued rather than assumed. `create or replace` keeps a function's existing
-- ACL, so this is belt and braces — but the one time it was assumed here, an anon
-- key POSTing to /rest/v1/rpc got a 200 in production. All three roles, because
-- `from public` alone leaves Supabase's default-privilege grant to
-- anon/authenticated intact, and naming only those two leaves the inherited
-- PUBLIC grant intact.
revoke execute on function public.begin_restyle(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.begin_restyle(uuid, integer, integer, integer) to service_role;
