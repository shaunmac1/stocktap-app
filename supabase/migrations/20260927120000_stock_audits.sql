-- Stock audits (e.g. Venners wet stock audits) read from PDF in the app.
create table if not exists public.stock_audits (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  source text not null default 'venners',
  period_start date not null,
  period_end date not null,
  days integer not null,
  summary jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  file_name text,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, source, period_start, period_end)
);
alter table public.stock_audits enable row level security;
create policy "Venue members can view stock audits" on public.stock_audits for select using (is_venue_member(venue_id));
create policy "Venue members can add stock audits" on public.stock_audits for insert with check (is_venue_member(venue_id));
create policy "Venue members can update stock audits" on public.stock_audits for update using (is_venue_member(venue_id)) with check (is_venue_member(venue_id));
create policy "Managers can delete stock audits" on public.stock_audits for delete using (is_venue_role(venue_id, array['owner','manager']));
create index if not exists stock_audits_venue_period on public.stock_audits (venue_id, period_end desc);
