-- Money-hiding hardening found by audit: staff could read takings via sales_records
-- and P&L via baseline_audits. Lock both to admins (enforced in the DB).
drop policy if exists "venue_members_manage_sales_records" on public.sales_records;
create policy "Venue admins view sales_records" on public.sales_records
  for select using (public.is_venue_admin(venue_id));
create policy "Venue admins insert sales_records" on public.sales_records
  for insert with check (public.is_venue_admin(venue_id));
create policy "Venue admins update sales_records" on public.sales_records
  for update using (public.is_venue_admin(venue_id)) with check (public.is_venue_admin(venue_id));
create policy "Venue admins delete sales_records" on public.sales_records
  for delete using (public.is_venue_admin(venue_id));

drop policy if exists "Venue members view baseline audits" on public.baseline_audits;
create policy "Venue admins view baseline audits" on public.baseline_audits
  for select using (public.is_venue_admin(venue_id));

revoke execute on function public.contribute_catalogue_calibration(uuid, numeric, numeric) from anon;
notify pgrst, 'reload schema';
