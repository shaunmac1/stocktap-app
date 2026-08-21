create table if not exists count_locations (
  id           uuid primary key default uuid_generate_v4(),
  venue_id     uuid references venues(id) on delete cascade not null,
  name         text not null,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_count_locations_venue on count_locations(venue_id, sort);

create table if not exists stocktake_line_entries (
  id                uuid primary key default uuid_generate_v4(),
  venue_id          uuid references venues(id) on delete cascade not null,
  stocktake_id      uuid references stocktakes(id) on delete cascade not null,
  product_id        uuid references products(id) on delete cascade not null,
  count_location_id uuid references count_locations(id) on delete set null,
  method            text not null check (method in ('weigh','tenths','count','keg_weight','dipstick','tenths_pints','dozen','each','litre')),
  full_containers   integer,
  part_value        numeric(10,3),
  ml_remaining      numeric(10,2) not null,
  sync_status       text not null default 'uploaded' check (sync_status in ('pending','uploading','uploaded')),
  entered_at        timestamptz not null default now(),
  user_id           uuid references auth.users(id) not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_stle_stocktake_product on stocktake_line_entries(stocktake_id, product_id);
create index if not exists idx_stle_venue on stocktake_line_entries(venue_id);

alter table count_locations         enable row level security;
alter table stocktake_line_entries  enable row level security;

drop policy if exists "Venue members can view count_locations"     on count_locations;
drop policy if exists "Venue members can insert count_locations"   on count_locations;
drop policy if exists "Venue members can update count_locations"   on count_locations;
drop policy if exists "Managers can delete count_locations"        on count_locations;
create policy "Venue members can view count_locations"
  on count_locations for select using (is_venue_member(venue_id));
create policy "Venue members can insert count_locations"
  on count_locations for insert with check (is_venue_member(venue_id));
create policy "Venue members can update count_locations"
  on count_locations for update using (is_venue_member(venue_id));
create policy "Managers can delete count_locations"
  on count_locations for delete using (is_venue_role(venue_id, array['owner','manager']));

drop policy if exists "Venue members can view line entries"   on stocktake_line_entries;
drop policy if exists "Venue members can insert line entries" on stocktake_line_entries;
drop policy if exists "Venue members can update line entries" on stocktake_line_entries;
drop policy if exists "Managers can delete line entries"      on stocktake_line_entries;
create policy "Venue members can view line entries"
  on stocktake_line_entries for select using (is_venue_member(venue_id));
create policy "Venue members can insert line entries"
  on stocktake_line_entries for insert with check (is_venue_member(venue_id));
create policy "Venue members can update line entries"
  on stocktake_line_entries for update using (is_venue_member(venue_id));
create policy "Managers can delete line entries"
  on stocktake_line_entries for delete using (is_venue_role(venue_id, array['owner','manager']));
