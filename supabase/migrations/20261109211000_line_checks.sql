-- Daily line checks: one dated row per line checked. The evidence log.
create table if not exists public.line_checks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  checked_at timestamptz not null default now(),
  last_ml numeric, last_at timestamptz,
  delivered_ml numeric not null default 0,
  now_ml numeric not null,
  full_containers integer, part_pints numeric, till_units numeric,
  waste_ml numeric not null default 0,
  unit_ml numeric not null,
  gone_ml numeric, missing_ml numeric, missing_value_pence integer,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_line_checks_venue_time on public.line_checks(venue_id, checked_at desc);
create index if not exists idx_line_checks_product on public.line_checks(product_id, checked_at desc);
alter table public.line_checks enable row level security;
create policy "Venue members can view line checks" on public.line_checks for select to authenticated using (is_venue_member(venue_id));
create policy "Venue members can insert line checks" on public.line_checks for insert to authenticated with check (is_venue_member(venue_id));
create policy "Venue members can delete line checks" on public.line_checks for delete to authenticated using (is_venue_member(venue_id));
