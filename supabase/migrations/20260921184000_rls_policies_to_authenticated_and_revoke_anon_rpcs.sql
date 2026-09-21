-- Security hygiene flagged by the Supabase advisor (and on the list since Aug):
-- 1. Every venue-scoped policy was declared for the default {public} role, so the
--    anon key could at least evaluate them (auth.uid() is null, so they returned
--    nothing, but the surface was there). Scope all 118 of them to authenticated.
--    The landing page's anon paths are untouched: leads_insert_public is its own
--    {anon,authenticated} policy and get_founding_landlord_count is SECURITY DEFINER.
-- 2. Three SECURITY DEFINER RPCs were executable by anon for no reason:
--    is_venue_admin, my_rota, redeem_staff_code all require a signed-in user.
--    expire_venue_trials and stripe_apply_tier stay anon-callable on purpose: the
--    Cloudflare Worker calls them with the anon key plus a shared secret.

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and roles = '{public}'
  loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;
end $$;

revoke execute on function public.is_venue_admin(uuid) from anon;
revoke execute on function public.my_rota(date, date) from anon;
revoke execute on function public.redeem_staff_code(text) from anon;

notify pgrst, 'reload schema';
