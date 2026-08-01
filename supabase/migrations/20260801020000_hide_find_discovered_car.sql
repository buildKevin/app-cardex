-- find_discovered_car is `security definer`, so RLS does not apply to what it
-- returns: any client calling it would read a pending fiche belonging to
-- another player, defeating the "visible only to its discoverer" rule the
-- policy on the table enforces. The client has no business calling it — it reads
-- fiches through the table, where RLS holds — and the edge function calls it as
-- service_role.
--
-- match_collection_id stays open on purpose: it only reports what the catalogue
-- already publishes to anon via the "collections are public" policy.
revoke execute on function public.find_discovered_car(text, text)
  from public, anon, authenticated;
grant execute on function public.find_discovered_car(text, text) to service_role;
