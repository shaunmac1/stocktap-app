-- Schema drift repair: three tables the app (and generated types) expect were
-- never applied to this project — baseline_audits (Reports 'Baseline' tab, 404'd),
-- spot_check_sessions (the Spot Check feature), product_submissions (unknown-bottle
-- submissions). Recreated from the generated types with venue-scoped RLS matching
-- the app's existing is_venue_member / is_venue_admin pattern.

-- 1) baseline_audits
create table if not exists public.baseline_audits (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  job_number text, site text,
  audit_date date not null, period_start date, period_end date,
  opening_stock numeric, closing_stock numeric, revenue numeric, purchases numeric,
  days_stock_holding numeric, optimum_gp_percent numeric, actual_gp_percent numeric,
  wastage numeric, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists baseline_audits_venue_idx on public.baseline_audits(venue_id);
alter table public.baseline_audits enable row level security;
drop trigger if exists baseline_audits_updated_at on public.baseline_audits;
create trigger baseline_audits_updated_at before update on public.baseline_audits
  for each row execute function public.update_updated_at();
grant select, insert, update, delete on public.baseline_audits to authenticated;
create policy "Venue members view baseline audits" on public.baseline_audits
  for select using (public.is_venue_member(venue_id));
create policy "Venue admins insert baseline audits" on public.baseline_audits
  for insert with check (public.is_venue_admin(venue_id));
create policy "Venue admins update baseline audits" on public.baseline_audits
  for update using (public.is_venue_admin(venue_id)) with check (public.is_venue_admin(venue_id));
create policy "Venue admins delete baseline audits" on public.baseline_audits
  for delete using (public.is_venue_admin(venue_id));

-- 2) spot_check_sessions
create table if not exists public.spot_check_sessions (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spot_check_sessions_venue_idx on public.spot_check_sessions(venue_id);
alter table public.spot_check_sessions enable row level security;
drop trigger if exists spot_check_sessions_updated_at on public.spot_check_sessions;
create trigger spot_check_sessions_updated_at before update on public.spot_check_sessions
  for each row execute function public.update_updated_at();
grant select, insert, update, delete on public.spot_check_sessions to authenticated;
create policy "Venue members view spot checks" on public.spot_check_sessions
  for select using (public.is_venue_member(venue_id));
create policy "Venue members open spot checks" on public.spot_check_sessions
  for insert with check (public.is_venue_member(venue_id));
create policy "Venue members update spot checks" on public.spot_check_sessions
  for update using (public.is_venue_member(venue_id)) with check (public.is_venue_member(venue_id));
create policy "Venue admins delete spot checks" on public.spot_check_sessions
  for delete using (public.is_venue_admin(venue_id));

-- 3) line entries can now belong to a spot check as well as a stocktake
alter table public.stocktake_line_entries alter column stocktake_id drop not null;
alter table public.stocktake_line_entries
  drop constraint if exists stocktake_line_entries_spot_check_id_fkey;
alter table public.stocktake_line_entries
  add constraint stocktake_line_entries_spot_check_id_fkey
  foreign key (spot_check_id) references public.spot_check_sessions(id) on delete cascade;
alter table public.stocktake_line_entries
  drop constraint if exists stocktake_line_entries_parent_chk;
alter table public.stocktake_line_entries
  add constraint stocktake_line_entries_parent_chk
  check (num_nonnulls(stocktake_id, spot_check_id) = 1);

-- 4) product_submissions (global unknown-bottle inbox — no venue)
create table if not exists public.product_submissions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null default 'spirit',
  size_ml numeric, full_weight_g numeric, empty_weight_g numeric,
  density numeric not null default 1.0, abv numeric,
  submitted_at timestamptz not null default now()
);
alter table public.product_submissions enable row level security;
grant insert on public.product_submissions to authenticated;
create policy "Authenticated can submit products" on public.product_submissions
  for insert to authenticated with check (true);

notify pgrst, 'reload schema';
