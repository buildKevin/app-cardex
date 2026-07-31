-- CarDex Pro replaces the one-off Founder purchase.
--
-- The column is renamed rather than added so there is exactly one answer to
-- "may this player scan?". Existing Founders keep their unlimited access: a
-- lifetime purchase still grants the CarDex Pro entitlement in RevenueCat.
--
-- Unlike Founder, Pro can also be *lost* — a subscription lapses. Nothing here
-- writes the column; the revenuecat-webhook edge function does, as service_role.

alter table public.users rename column is_founder to is_pro;

-- The grant is column-scoped, so re-state it after the rename. Without this a
-- client could set is_pro = true on its own row and walk past the paywall.
revoke update on public.users from anon, authenticated;
grant update (username, showcase) on public.users to authenticated;

-- begin_scan referenced the old column name; recreate it against is_pro.
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
  v_pro   boolean;
  v_count integer;
  v_calls integer;
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
