-- The revoke in 20260801000000 did not actually close anything on a hosted
-- project, and a plain-Postgres test could not have shown it.
--
-- Two independent grants have to go, and each looks sufficient on its own:
--   * Postgres grants execute to PUBLIC on every new function, which anon and
--     authenticated inherit — so `from anon, authenticated` alone is a no-op.
--   * Supabase ships `alter default privileges ... grant execute on functions
--     to anon, authenticated, service_role`, so hosted projects ALSO carry an
--     explicit grant to those roles — which `from public` alone leaves intact.
-- The local test harness has no such default privileges, so `from public` there
-- produced a convincing "permission denied" while production stayed wide open:
-- an anon key could POST /rest/v1/rpc/record_discovered_car and get a 200.
--
-- Hence naming all three. Verified afterwards against the deployed project with
-- the anon key, not against a local stack.
revoke execute on function public.record_discovered_car(
  text, text, text, text, smallint, smallint, integer, text, integer, rarity, uuid, real
) from public, anon, authenticated;
revoke execute on function public.touch_discovered_car(text, uuid)
  from public, anon, authenticated;

grant execute on function public.record_discovered_car(
  text, text, text, text, smallint, smallint, integer, text, integer, rarity, uuid, real
) to service_role;
grant execute on function public.touch_discovered_car(text, uuid) to service_role;

-- The fiche that proved the hole. No-op anywhere it was never written.
delete from public.discovered_cars where id = 'test-injection';
