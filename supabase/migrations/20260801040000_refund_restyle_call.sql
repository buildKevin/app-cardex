-- A model call we were never billed for must not count against the ceiling.
--
-- begin_restyle() increments restyle_calls before the model call, which is what
-- stops a free player from retrying a failing generation forever. But when
-- OpenAI answers with an HTTP error — no access to the image model, a 429, a
-- 5xx — nothing was generated and nothing was billed to us. Charging the player
-- for that turns any outage of ours into three lost attempts and, on the free
-- tier, into no feature at all.
--
-- Deliberately NOT called on a timeout: a request that hung may well have been
-- billed, so the ceiling keeps it.
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

revoke execute on function public.refund_restyle_call(uuid)
  from public, anon, authenticated;
grant execute on function public.refund_restyle_call(uuid) to service_role;
