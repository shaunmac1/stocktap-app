-- Business-level Finances (distinct from the stock-movement `ledger`): money in and
-- out at the venue level — takings, spending, rent/tie, supplier & pubco payments,
-- wages, tax — plus what's still payable. Generic across all pubs: the CATEGORY is a
-- fixed generic set; the SUPPLIER is free text the landlord types. Admin-only.
create table if not exists public.finance_entries (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  entry_date date not null,
  due_date date,
  category text not null,
  supplier text,
  description text,
  amount numeric not null check (amount >= 0),
  status text not null default 'paid' check (status in ('paid','due','received')),
  reference text,
  source text not null default 'manual' check (source in ('manual','import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_entries_venue_date_idx on public.finance_entries(venue_id, entry_date desc);
create index if not exists finance_entries_venue_status_idx on public.finance_entries(venue_id, status);
alter table public.finance_entries enable row level security;
drop trigger if exists finance_entries_updated_at on public.finance_entries;
create trigger finance_entries_updated_at before update on public.finance_entries
  for each row execute function public.update_updated_at();
grant select, insert, update, delete on public.finance_entries to authenticated;
create policy "Venue admins view finance" on public.finance_entries
  for select using (public.is_venue_admin(venue_id));
create policy "Venue admins insert finance" on public.finance_entries
  for insert with check (public.is_venue_admin(venue_id));
create policy "Venue admins update finance" on public.finance_entries
  for update using (public.is_venue_admin(venue_id)) with check (public.is_venue_admin(venue_id));
create policy "Venue admins delete finance" on public.finance_entries
  for delete using (public.is_venue_admin(venue_id));
notify pgrst, 'reload schema';
