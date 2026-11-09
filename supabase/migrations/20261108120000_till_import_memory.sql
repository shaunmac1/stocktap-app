-- Till sales import (Sharp / Casio / any CSV): remember, per pub, which till PLU is which
-- product and serve, and which columns an "Other CSV" export uses. One row per venue.
-- Applied to production 8 Nov 2026 via the Supabase MCP.
-- The app keeps working without this table (it falls back to the browser's storage).
create table if not exists public.till_import_memory (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  data jsonb not null default '{"version":1,"matches":{},"mappings":{}}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.till_import_memory enable row level security;
create policy "Venue members can view till import memory" on public.till_import_memory
  for select to authenticated using (is_venue_member(venue_id));
create policy "Venue members can add till import memory" on public.till_import_memory
  for insert to authenticated with check (is_venue_member(venue_id));
create policy "Venue members can update till import memory" on public.till_import_memory
  for update to authenticated using (is_venue_member(venue_id)) with check (is_venue_member(venue_id));

-- Re-importing a period replaces the earlier till import, which needs delete on sales_records.
-- sales_records select/insert/update/delete are venue-ADMIN only (lock_financials_to_admins),
-- so saving till sales works for pub owners/admins; a non-admin member cannot save them.
