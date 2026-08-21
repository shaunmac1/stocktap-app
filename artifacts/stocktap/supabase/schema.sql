-- StockTap Database Schema
-- Run this in Supabase SQL Editor to set up all tables, RLS, and policies.
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS and DROP POLICY IF EXISTS.

-- =====================
-- PHASE 1: EXTENSIONS
-- =====================
create extension if not exists "uuid-ossp";

-- =====================
-- PHASE 2: ALL TABLES
-- (ordered so foreign keys always reference an already-created table)
-- =====================

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text,
  default_view text not null default 'tenths' check (default_view in ('tenths', 'exact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  tier text not null default 'free' check (tier in ('free', 'pro', 'premium')),
  stripe_customer_id text,
  measure_ml integer not null default 25,
  is_tied boolean not null default false,
  order_cycle_days integer not null default 21,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrations: add columns if upgrading existing schema
alter table venues add column if not exists stripe_customer_id text;
alter table venues add column if not exists order_cycle_days integer not null default 21;
-- pro_since: timestamp when the venue's tier last became 'pro' — used to work out
-- referral reward eligibility (referrer earns free Pro once referred venue has
-- been on Pro, continuously, for 30 days). Cleared if the venue drops off Pro.
alter table venues add column if not exists pro_since timestamptz;
-- measure_system: which locale preset the venue's measure_ml was chosen from
-- (uk/ie/us/eu/free_pour) — informational, measure_ml remains the source of truth.
alter table venues add column if not exists measure_system text not null default 'uk'
  check (measure_system in ('uk','ie','us','eu','free_pour'));
alter table venues alter column measure_ml type numeric(6,2);
alter table venues alter column measure_ml drop default;
alter table venues alter column measure_ml set default 25;
-- founding_landlord: "The Lock-In" founder badge, capped at first 20 qualifying venues.
alter table venues add column if not exists founding_landlord boolean not null default false;

create table if not exists venue_members (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(venue_id, user_id)
);

create table if not exists locations (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  location_id uuid references locations(id) on delete set null,
  name text not null,
  type text not null default 'spirit' check (type in ('spirit','gin','vodka','whisky','rum','liqueur','wine','sparkling','vermouth','syrup','cordial','packaged')),
  unit text not null default 'weigh' check (unit in ('weigh','count')),
  size_ml integer,
  abv numeric(5,2),
  density numeric(6,4) not null default 1.0,
  full_weight_g numeric(8,2),
  empty_weight_g numeric(8,2),
  cost_price numeric(10,2),
  pour_price numeric(10,2),
  measure_ml integer,
  barcode text,
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Full-bar unit model: category drives which counting method(s) apply.
alter table products add column if not exists category text
  check (category in ('draught_lager','draught_ale','draught_cider','draught_stout','minerals','packaged','postmix','spirits','wines'));
alter table products add column if not exists counting_method text
  check (counting_method in ('dipstick','keg_weight','tenths_pints','dozen','each','litre','weigh','tenths'));
alter table products add column if not exists container_type text check (container_type in ('keg','cask','bag_in_box'));
alter table products add column if not exists container_l numeric(6,2);
alter table products add column if not exists dip_full_mm numeric(6,1);
alter table products add column if not exists pack_size integer;
alter table products add column if not exists par_level numeric(10,2);
alter table products add column if not exists external_id text;
-- Free-text supplier/vendor name, so items can be grouped/filtered by who supplies them.
alter table products add column if not exists vendor text;
create index if not exists idx_products_venue_vendor on products(venue_id, vendor);

create table if not exists stocktakes (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  location_id uuid references locations(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  total_value numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists readings (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  location_id uuid references locations(id) on delete set null,
  stocktake_id uuid references stocktakes(id) on delete set null,
  method text not null default 'weigh' check (method in ('weigh', 'slider', 'count')),
  weight_g numeric(8,2),
  count integer,
  ml_remaining numeric(8,2) not null,
  user_id uuid references auth.users(id) not null,
  staff_on uuid[],
  reading_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Full-bar unit model: method-specific raw inputs, kept alongside the
-- always-computed ml_remaining so every reading remains comparable.
alter table readings add column if not exists full_containers integer;
alter table readings add column if not exists part_value numeric(10,3);
alter table readings add column if not exists is_line_check boolean not null default false;
alter table readings add column if not exists is_delivery boolean not null default false;

create table if not exists special_offers (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  name text not null,
  offer_price numeric(10,2) not null,
  starts_at date not null,
  ends_at date not null,
  product_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists baseline_audits (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  job_number text,
  site text,
  audit_date date not null,
  period_start date,
  period_end date,
  opening_stock numeric(10,2),
  closing_stock numeric(10,2),
  revenue numeric(10,2),
  purchases numeric(10,2),
  days_stock_holding numeric(6,1),
  optimum_gp_percent numeric(5,2),
  actual_gp_percent numeric(5,2),
  wastage numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deliveries (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  entry_method text not null check (entry_method in ('invoice','ledger','mid_stocktake')),
  quantity numeric(10,2) not null,
  unit_cost numeric(10,2),
  invoice_ref text,
  delivered_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'other' check (category in ('billing', 'technical', 'data', 'feature_request', 'other')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  auto_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feature_suggestions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  venue_id uuid references venues(id) on delete set null,
  title text not null,
  detail text,
  status text not null default 'under_review' check (status in ('under_review', 'planned', 'building', 'shipped')),
  upvote_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feature_suggestion_votes (
  id uuid primary key default uuid_generate_v4(),
  suggestion_id uuid references feature_suggestions(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (suggestion_id, user_id)
);

create table if not exists till_entries (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  measures_sold numeric(10,2) not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  referred_venue_id uuid references venues(id) on delete cascade,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'qualified')),
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  from_location_id uuid references locations(id) on delete set null,
  to_location_id uuid references locations(id) on delete set null,
  movement_type text not null check (movement_type in ('delivery','transfer','wastage')),
  quantity_ml numeric(10,2) not null,
  unit_cost_pence integer,
  reason text,
  notes text,
  moved_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration: add columns if upgrading existing schema
alter table stock_movements add column if not exists product_id uuid references products(id) on delete cascade;
alter table stock_movements add column if not exists from_location_id uuid references locations(id) on delete set null;
alter table stock_movements add column if not exists to_location_id uuid references locations(id) on delete set null;
alter table stock_movements add column if not exists movement_type text check (movement_type in ('delivery','transfer','wastage'));
alter table stock_movements add column if not exists quantity_ml numeric(10,2);
alter table stock_movements add column if not exists unit_cost_pence integer;
alter table stock_movements add column if not exists reason text;
alter table stock_movements add column if not exists notes text;
alter table stock_movements add column if not exists moved_at timestamptz not null default now();
alter table stock_movements add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_stock_movements_venue_product
  on stock_movements(venue_id, product_id, moved_at desc);

-- RLS policies for stock_movements
drop policy if exists "Venue members can view stock movements" on stock_movements;
drop policy if exists "Venue members can insert stock movements" on stock_movements;
drop policy if exists "Managers can delete stock movements" on stock_movements;

create policy "Venue members can view stock movements"
  on stock_movements for select using (is_venue_member(venue_id));
create policy "Venue members can insert stock movements"
  on stock_movements for insert with check (is_venue_member(venue_id));
create policy "Managers can delete stock movements"
  on stock_movements for delete
  using (is_venue_role(venue_id, array['owner', 'manager']));

create table if not exists epos_connections (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists insights (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid references venues(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration: insights content columns (was a stub table)
alter table insights add column if not exists type text
  check (type in ('variance_trend', 'over_pouring', 'days_of_cover', 'reorder_nudge', 'gp_drift', 'general'));
alter table insights add column if not exists title text;
alter table insights add column if not exists body text;
alter table insights add column if not exists severity text not null default 'info'
  check (severity in ('info', 'warning', 'critical'));
alter table insights add column if not exists week_start date not null default date_trunc('week', now())::date;
alter table insights add column if not exists dismissed boolean not null default false;
alter table insights add column if not exists data jsonb;
create index if not exists idx_insights_venue_week on insights(venue_id, week_start desc);

-- =====================
-- PHASE 3: ENABLE RLS
-- =====================
alter table profiles        enable row level security;
alter table venues          enable row level security;
alter table venue_members   enable row level security;
alter table locations       enable row level security;
alter table products        enable row level security;
alter table stocktakes      enable row level security;
alter table readings        enable row level security;
alter table till_entries    enable row level security;
alter table referrals       enable row level security;
alter table stock_movements enable row level security;
alter table epos_connections enable row level security;
alter table insights        enable row level security;

-- =====================
-- PHASE 4: SECURITY DEFINER HELPERS
--
-- These functions query venue_members WITHOUT going through RLS
-- (security definer + explicit search_path = no recursion).
-- All other tables' policies call these instead of subquerying
-- venue_members directly.
-- =====================

-- Returns true if the current user is any member of venue v.
create or replace function is_venue_member(v uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from venue_members
    where venue_id = v
      and user_id = auth.uid()
  );
$$;

-- Returns true if the current user is a member of any venue at all. Used by
-- app-wide (non venue-scoped) features like the feature suggestions board,
-- which is shared across all signed-in, onboarded users rather than siloed
-- per venue.
create or replace function is_any_venue_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from venue_members
    where user_id = auth.uid()
  );
$$;

-- Returns true if the current user is a member of venue v with one of the given roles.
create or replace function is_venue_role(v uuid, roles text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from venue_members
    where venue_id = v
      and user_id = auth.uid()
      and role = any(roles)
  );
$$;

-- =====================
-- PHASE 5: POLICIES
-- Drop first so re-runs are safe.
-- =====================

-- ── profiles ──────────────────────────────────────────────────────────────────
-- No venue join needed; users own their own profile row.
drop policy if exists "Users can view own profile"   on profiles;
drop policy if exists "Users can insert own profile" on profiles;
drop policy if exists "Users can update own profile" on profiles;

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = user_id);

create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = user_id);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = user_id);

-- ── venues ────────────────────────────────────────────────────────────────────
-- SELECT: owner can always see their venue (needed before the first venue_member
--         row exists); members see via the SECURITY DEFINER helper.
-- INSERT: only the future owner (auth.uid() = owner_id).
-- UPDATE: only the owner.
drop policy if exists "Venue members can view venues" on venues;
drop policy if exists "Owners can insert venues"      on venues;
drop policy if exists "Owners can update venues"      on venues;

create policy "Venue members can view venues" on venues
  for select using (
    owner_id = auth.uid()
    or is_venue_member(id)
  );

create policy "Owners can insert venues" on venues
  for insert with check (auth.uid() = owner_id);

create policy "Owners can update venues" on venues
  for update using (auth.uid() = owner_id);

-- ── venue_members ─────────────────────────────────────────────────────────────
-- CRITICAL: these policies must NEVER subquery venue_members themselves —
-- that causes "infinite recursion detected in policy for relation venue_members".
--
-- SELECT  — own row always; owners/managers see all rows for their venue
--           via is_venue_role() which is SECURITY DEFINER (no RLS, no recursion).
-- INSERT  — two valid cases:
--           (a) current user is already an owner/manager (adding a new member), OR
--           (b) current user is the venue owner AND is inserting themselves
--               (bootstrap: first member row for a brand-new venue).
--           Case (b) uses venues.owner_id which is safe: venues SELECT policy
--           allows owner_id = auth.uid() without querying venue_members.
-- UPDATE  — only owners (via SECURITY DEFINER helper).
-- DELETE  — only owners (via SECURITY DEFINER helper).
drop policy if exists "Venue members can view membership"    on venue_members;
drop policy if exists "Owners/managers can insert members"   on venue_members;
drop policy if exists "Owners can update members"            on venue_members;
drop policy if exists "Owners can delete members"            on venue_members;

create policy "Venue members can view membership" on venue_members
  for select using (
    user_id = auth.uid()
    or is_venue_role(venue_id, array['owner', 'manager'])
  );

create policy "Owners/managers can insert members" on venue_members
  for insert with check (
    is_venue_role(venue_id, array['owner', 'manager'])
    or (
      -- Bootstrap: venue owner inserting themselves as the first member
      user_id = auth.uid()
      and exists (
        select 1 from venues
        where venues.id = venue_members.venue_id
          and venues.owner_id = auth.uid()
      )
    )
  );

create policy "Owners can update members" on venue_members
  for update using (
    is_venue_role(venue_id, array['owner'])
  );

create policy "Owners can delete members" on venue_members
  for delete using (
    is_venue_role(venue_id, array['owner'])
  );

-- ── locations ─────────────────────────────────────────────────────────────────
drop policy if exists "Venue members can view locations"        on locations;
drop policy if exists "Venue members can insert locations"      on locations;
drop policy if exists "Venue members can update locations"      on locations;
drop policy if exists "Owners/managers can delete locations"    on locations;

create policy "Venue members can view locations" on locations
  for select using (is_venue_member(venue_id));

create policy "Venue members can insert locations" on locations
  for insert with check (is_venue_member(venue_id));

create policy "Venue members can update locations" on locations
  for update using (is_venue_member(venue_id));

create policy "Owners/managers can delete locations" on locations
  for delete using (is_venue_role(venue_id, array['owner', 'manager']));

-- ── products ──────────────────────────────────────────────────────────────────
drop policy if exists "Venue members can view products"      on products;
drop policy if exists "Venue members can insert products"    on products;
drop policy if exists "Venue members can update products"    on products;
drop policy if exists "Owners/managers can delete products"  on products;

create policy "Venue members can view products" on products
  for select using (is_venue_member(venue_id));

create policy "Venue members can insert products" on products
  for insert with check (is_venue_member(venue_id));

create policy "Venue members can update products" on products
  for update using (is_venue_member(venue_id));

create policy "Owners/managers can delete products" on products
  for delete using (is_venue_role(venue_id, array['owner', 'manager']));

-- ── stocktakes ────────────────────────────────────────────────────────────────
drop policy if exists "Venue members can view stocktakes"    on stocktakes;
drop policy if exists "Venue members can insert stocktakes"  on stocktakes;
drop policy if exists "Venue members can update stocktakes"  on stocktakes;

create policy "Venue members can view stocktakes" on stocktakes
  for select using (is_venue_member(venue_id));

create policy "Venue members can insert stocktakes" on stocktakes
  for insert with check (is_venue_member(venue_id));

create policy "Venue members can update stocktakes" on stocktakes
  for update using (is_venue_member(venue_id));

-- ── readings ──────────────────────────────────────────────────────────────────
drop policy if exists "Venue members can view readings"    on readings;
drop policy if exists "Venue members can insert readings"  on readings;
drop policy if exists "Venue members can update readings"  on readings;

create policy "Venue members can view readings" on readings
  for select using (is_venue_member(venue_id));

create policy "Venue members can insert readings" on readings
  for insert with check (is_venue_member(venue_id));

create policy "Venue members can update readings" on readings
  for update using (is_venue_member(venue_id));

-- ── till_entries ──────────────────────────────────────────────────────────────
drop policy if exists "Venue members can view till entries"    on till_entries;
drop policy if exists "Venue members can insert till entries"  on till_entries;
drop policy if exists "Venue members can update till entries"  on till_entries;

create policy "Venue members can view till entries" on till_entries
  for select using (is_venue_member(venue_id));

create policy "Venue members can insert till entries" on till_entries
  for insert with check (is_venue_member(venue_id));

create policy "Venue members can update till entries" on till_entries
  for update using (is_venue_member(venue_id));

-- ── referrals ─────────────────────────────────────────────────────────────────
drop policy if exists "Venue owners can view referrals"    on referrals;
drop policy if exists "Venue owners can insert referrals"  on referrals;

create policy "Venue owners can view referrals" on referrals
  for select using (is_venue_role(venue_id, array['owner']));

create policy "Venue owners can insert referrals" on referrals
  for insert with check (is_venue_role(venue_id, array['owner']));

-- ── insights ──────────────────────────────────────────────────────────────────
drop policy if exists "Venue members can view insights"   on insights;
drop policy if exists "Venue members can insert insights" on insights;
drop policy if exists "Venue members can update insights" on insights;

create policy "Venue members can view insights" on insights
  for select using (is_venue_member(venue_id));

create policy "Venue members can insert insights" on insights
  for insert with check (is_venue_member(venue_id));

create policy "Venue members can update insights" on insights
  for update using (is_venue_member(venue_id));

-- ── special_offers ────────────────────────────────────────────────────────────
alter table special_offers enable row level security;
drop policy if exists "Venue members can view special offers"   on special_offers;
drop policy if exists "Venue members can insert special offers" on special_offers;
drop policy if exists "Venue members can update special offers" on special_offers;
drop policy if exists "Venue members can delete special offers" on special_offers;

create policy "Venue members can view special offers" on special_offers
  for select using (is_venue_member(venue_id));
create policy "Venue members can insert special offers" on special_offers
  for insert with check (is_venue_member(venue_id));
create policy "Venue members can update special offers" on special_offers
  for update using (is_venue_member(venue_id));
create policy "Venue members can delete special offers" on special_offers
  for delete using (is_venue_member(venue_id));

-- ── baseline_audits ───────────────────────────────────────────────────────────
alter table baseline_audits enable row level security;
drop policy if exists "Venue members can view baseline audits"   on baseline_audits;
drop policy if exists "Venue members can insert baseline audits" on baseline_audits;
drop policy if exists "Venue members can update baseline audits" on baseline_audits;
drop policy if exists "Venue members can delete baseline audits" on baseline_audits;

create policy "Venue members can view baseline audits" on baseline_audits
  for select using (is_venue_member(venue_id));
create policy "Venue members can insert baseline audits" on baseline_audits
  for insert with check (is_venue_member(venue_id));
create policy "Venue members can update baseline audits" on baseline_audits
  for update using (is_venue_member(venue_id));
create policy "Venue members can delete baseline audits" on baseline_audits
  for delete using (is_venue_member(venue_id));

-- ── support_tickets ───────────────────────────────────────────────────────────
alter table support_tickets enable row level security;
drop policy if exists "Venue members can view support tickets"   on support_tickets;
drop policy if exists "Venue members can insert support tickets" on support_tickets;
drop policy if exists "Venue members can update support tickets" on support_tickets;

create policy "Venue members can view support tickets" on support_tickets
  for select using (is_venue_member(venue_id));
create policy "Venue members can insert support tickets" on support_tickets
  for insert with check (is_venue_member(venue_id));
create policy "Venue members can update support tickets" on support_tickets
  for update using (is_venue_member(venue_id));

-- ── feature_suggestions / feature_suggestion_votes ──────────────────────────────
-- App-wide board shared by all signed-in, onboarded users (not siloed per venue),
-- so policies use is_any_venue_member() rather than is_venue_member(venue_id).
alter table feature_suggestions enable row level security;
alter table feature_suggestion_votes enable row level security;

drop policy if exists "Any venue member can view suggestions"   on feature_suggestions;
drop policy if exists "Any venue member can submit suggestions" on feature_suggestions;
drop policy if exists "Authors can update own suggestion"       on feature_suggestions;
drop policy if exists "Any venue member can view votes"          on feature_suggestion_votes;
drop policy if exists "Any venue member can cast a vote"         on feature_suggestion_votes;
drop policy if exists "Users can remove their own vote"          on feature_suggestion_votes;

create policy "Any venue member can view suggestions" on feature_suggestions
  for select using (is_any_venue_member());
create policy "Any venue member can submit suggestions" on feature_suggestions
  for insert with check (is_any_venue_member() and user_id = auth.uid());
-- Authors may edit their own title/detail while still under review; status is
-- changed by the team directly in the database (service role bypasses RLS).
create policy "Authors can update own suggestion" on feature_suggestions
  for update using (user_id = auth.uid() and status = 'under_review');

create policy "Any venue member can view votes" on feature_suggestion_votes
  for select using (is_any_venue_member());
create policy "Any venue member can cast a vote" on feature_suggestion_votes
  for insert with check (is_any_venue_member() and user_id = auth.uid());
create policy "Users can remove their own vote" on feature_suggestion_votes
  for delete using (user_id = auth.uid());

-- ── deliveries ────────────────────────────────────────────────────────────────
alter table deliveries enable row level security;
drop policy if exists "Venue members can view deliveries"   on deliveries;
drop policy if exists "Venue members can insert deliveries" on deliveries;

create policy "Venue members can view deliveries" on deliveries
  for select using (is_venue_member(venue_id));
create policy "Venue members can insert deliveries" on deliveries
  for insert with check (is_venue_member(venue_id));

-- =====================
-- PHASE 6: FUNCTIONS AND TRIGGERS
-- =====================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at      on profiles;
drop trigger if exists venues_updated_at        on venues;
drop trigger if exists venue_members_updated_at on venue_members;
drop trigger if exists locations_updated_at     on locations;
drop trigger if exists products_updated_at      on products;
drop trigger if exists stocktakes_updated_at    on stocktakes;
drop trigger if exists readings_updated_at      on readings;
drop trigger if exists till_entries_updated_at  on till_entries;
drop trigger if exists referrals_updated_at     on referrals;

create trigger profiles_updated_at      before update on profiles      for each row execute function update_updated_at();
create trigger venues_updated_at        before update on venues        for each row execute function update_updated_at();
create trigger venue_members_updated_at before update on venue_members for each row execute function update_updated_at();
create trigger locations_updated_at     before update on locations     for each row execute function update_updated_at();
create trigger products_updated_at      before update on products      for each row execute function update_updated_at();
create trigger stocktakes_updated_at    before update on stocktakes    for each row execute function update_updated_at();
create trigger readings_updated_at      before update on readings      for each row execute function update_updated_at();
create trigger till_entries_updated_at  before update on till_entries  for each row execute function update_updated_at();
create trigger referrals_updated_at     before update on referrals     for each row execute function update_updated_at();

-- handle_new_user: auto-create a profiles row on every Supabase sign-up,
-- including anonymous sign-ins (raw_user_meta_data will be null/empty — that's fine).
-- search_path is set explicitly to prevent search-path injection attacks.
-- The exception handler ensures a trigger failure never blocks auth sign-up.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (user_id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- Never block auth sign-up due to a profile insert error
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- track_pro_since: stamps venues.pro_since the moment tier transitions to
-- 'pro', clears it if the venue drops off Pro. Runs on webhook-driven tier
-- updates (service role bypasses RLS but triggers still fire).
create or replace function track_pro_since()
returns trigger as $$
begin
  if new.tier = 'pro' and old.tier is distinct from 'pro' then
    new.pro_since = now();
  elsif new.tier <> 'pro' and old.tier = 'pro' then
    new.pro_since = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists venues_track_pro_since on venues;
create trigger venues_track_pro_since
  before update on venues
  for each row execute function track_pro_since();

-- assign_founding_landlord: auto-grants the "Lock-In" founder badge to the
-- first 20 venues ever created. Runs before insert so it's atomic per-row
-- under the table lock implied by the count scan; acceptable at this low cap.
create or replace function assign_founding_landlord()
returns trigger as $$
begin
  if (select count(*) from venues where founding_landlord = true) < 20 then
    new.founding_landlord = true;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists venues_assign_founding_landlord on venues;
create trigger venues_assign_founding_landlord
  before insert on venues
  for each row execute function assign_founding_landlord();

-- get_founding_landlord_count: public (anon-callable) RPC returning how many
-- of the 20 "Lock-In" founder slots have been claimed. SECURITY DEFINER so it
-- can read across venues (which is otherwise locked down to venue members)
-- without exposing anything except a single integer. Used on the public
-- landing page, which has no authenticated session.
create or replace function get_founding_landlord_count()
returns integer as $$
  select count(*)::integer from venues where founding_landlord = true;
$$ language sql security definer set search_path = public, pg_temp;

grant execute on function get_founding_landlord_count() to anon, authenticated;

-- sync_suggestion_upvote_count: keeps feature_suggestions.upvote_count in sync
-- with feature_suggestion_votes rows, so the client can sort/display vote
-- counts without a join + count() on every read.
create or replace function sync_suggestion_upvote_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update feature_suggestions set upvote_count = upvote_count + 1 where id = new.suggestion_id;
    return new;
  elsif tg_op = 'DELETE' then
    update feature_suggestions set upvote_count = greatest(upvote_count - 1, 0) where id = old.suggestion_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists feature_suggestion_votes_sync_count on feature_suggestion_votes;
create trigger feature_suggestion_votes_sync_count
  after insert or delete on feature_suggestion_votes
  for each row execute function sync_suggestion_upvote_count();

-- redeem_referral_code: called by a brand-new venue owner right after venue
-- creation to link themselves as the referred venue. Security definer because
-- the new owner isn't yet a member of the referring venue, so normal RLS would
-- block the update. Verifies caller owns p_venue_id to prevent hijacking.
create or replace function redeem_referral_code(p_code text, p_venue_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from venues where id = p_venue_id;
  if v_owner is null or v_owner <> auth.uid() then
    return false;
  end if;

  update referrals
    set referred_venue_id = p_venue_id, updated_at = now()
    where code = p_code
      and status = 'pending'
      and referred_venue_id is null
      and venue_id <> p_venue_id;

  return found;
end;
$$;

-- get_referral_progress: lets a referring venue's owner peek at the tier /
-- pro_since of the venue they referred, without a general venues SELECT grant.
create or replace function get_referral_progress(p_referral_id uuid)
returns table(venue_name text, tier text, pro_since timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select v.name, v.tier, v.pro_since
    from referrals r
    join venues v on v.id = r.referred_venue_id
    where r.id = p_referral_id
      and is_venue_role(r.venue_id, array['owner']);
end;
$$;

-- check_referral_qualification: opportunistically called from the client when
-- the Referral tab loads. Marks a referral 'qualified' once the referred venue
-- has been on Pro, continuously, for 30+ days. Reward is always Pro-level,
-- even if the referred venue is on Premium (Premium never counts as itself
-- qualifying — only continuous 'pro' tier does, matching the reward terms).
create or replace function check_referral_qualification(p_referral_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r_status text;
  r_venue_id uuid;
  ref_tier text;
  ref_pro_since timestamptz;
begin
  select status, referred_venue_id into r_status, r_venue_id
    from referrals where id = p_referral_id and is_venue_role(venue_id, array['owner']);

  if r_status is null or r_status = 'qualified' or r_venue_id is null then
    return coalesce(r_status, 'pending');
  end if;

  select tier, pro_since into ref_tier, ref_pro_since from venues where id = r_venue_id;

  if ref_tier = 'pro' and ref_pro_since is not null and ref_pro_since <= now() - interval '30 days' then
    update referrals set status = 'qualified', qualified_at = now(), updated_at = now() where id = p_referral_id;
    return 'qualified';
  end if;

  return 'pending';
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- product_submissions: anonymous crowd-sourced product weight data.
-- Populated automatically when users import or add products with known weights.
-- No venue_id — data is anonymised so this table can grow into a shared catalogue.
-- Run this migration in your Supabase SQL Editor to enable the feature.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists product_submissions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null default 'spirit',
  size_ml integer,
  full_weight_g numeric(8,2),
  empty_weight_g numeric(8,2),
  density numeric(6,4) not null default 1.0,
  abv numeric(5,2),
  submitted_at timestamptz not null default now()
);

alter table product_submissions enable row level security;

drop policy if exists "authenticated users can submit product data" on product_submissions;
create policy "authenticated users can submit product data"
  on product_submissions for insert to authenticated with check (true);

drop policy if exists "authenticated users can read product submissions" on product_submissions;
create policy "authenticated users can read product submissions"
  on product_submissions for select to authenticated using (true);

-- =====================
-- MIGRATION: Multi-location stocktaking
-- Run this block in the Supabase SQL Editor to add count_locations and
-- stocktake_line_entries. Safe to re-run (IF NOT EXISTS + DROP IF EXISTS).
-- =====================

-- count_locations: venue-managed list of physical counting locations
-- (bar, cellar, connected tap, storage, etc.)
-- SEPARATE from the existing `locations` table, which is used for library
-- product grouping. These are explicitly for stocktake counting.
create table if not exists count_locations (
  id           uuid primary key default uuid_generate_v4(),
  venue_id     uuid references venues(id) on delete cascade not null,
  name         text not null,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_count_locations_venue on count_locations(venue_id, sort);

-- stocktake_line_entries: one row per product × location × entry within a stocktake.
-- This is the auditable breakdown. On stocktake close, these are summed per product
-- and written as aggregate readings rows (the downstream reports source of truth).
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

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Bottle shapes for photo-tap counting method
--
-- Run this block in Supabase SQL Editor after the main schema.
-- Also create the storage bucket manually in Supabase dashboard:
--   Storage → New bucket → Name: "bottle-photos" → Public: ON
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists bottle_shapes (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid references venues(id) on delete cascade not null,
  name        text not null,
  photo_url   text,
  fill_curve  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_bottle_shapes_venue on bottle_shapes(venue_id);

alter table bottle_shapes enable row level security;

drop policy if exists "Venue members can view bottle shapes"   on bottle_shapes;
drop policy if exists "Venue members can insert bottle shapes" on bottle_shapes;
drop policy if exists "Venue members can update bottle shapes" on bottle_shapes;
drop policy if exists "Managers can delete bottle shapes"      on bottle_shapes;

create policy "Venue members can view bottle shapes"
  on bottle_shapes for select using (is_venue_member(venue_id));
create policy "Venue members can insert bottle shapes"
  on bottle_shapes for insert with check (is_venue_member(venue_id));
create policy "Venue members can update bottle shapes"
  on bottle_shapes for update using (is_venue_member(venue_id));
create policy "Managers can delete bottle shapes"
  on bottle_shapes for delete using (is_venue_role(venue_id, array['owner','manager']));

-- Add bottle_shape_id FK to products
alter table products
  add column if not exists bottle_shape_id uuid references bottle_shapes(id) on delete set null;

-- Extend counting_method to allow photo_tap
alter table products drop constraint if exists products_counting_method_check;
alter table products add constraint products_counting_method_check
  check (counting_method in (
    'dipstick','keg_weight','tenths_pints','dozen','each','litre','weigh','tenths','photo_tap'
  ));

-- Extend stocktake_line_entries method to allow photo_tap
alter table stocktake_line_entries drop constraint if exists stocktake_line_entries_method_check;
alter table stocktake_line_entries add constraint stocktake_line_entries_method_check
  check (method in (
    'weigh','tenths','count','keg_weight','dipstick','tenths_pints','dozen','each','litre','photo_tap'
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: sku, notes on products; wastage_reason on stock_movements
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

alter table products add column if not exists sku   text;
alter table products add column if not exists notes text;

alter table stock_movements
  add column if not exists wastage_reason text
  check (wastage_reason in ('breakage','spill','spoilage','comp','other'));

-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: sales_records table (till/EPOS CSV upload)
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists sales_records (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name_raw text not null,
  quantity_sold numeric(12,3) not null,
  unit_price_pence integer,
  revenue_pence integer,
  sale_date date not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sales_records enable row level security;

create policy "venue members can manage sales_records"
  on sales_records for all
  using (
    venue_id in (select venue_id from venue_members where user_id = auth.uid())
  );

create index if not exists idx_sales_records_venue_date on sales_records(venue_id, sale_date);
create index if not exists idx_sales_records_product on sales_records(venue_id, product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Multi-location count entry for spot checks
-- Run this block in the Supabase SQL Editor. Safe to re-run.
--
-- Adds a lightweight spot_check_sessions parent table and lets
-- stocktake_line_entries belong to EITHER a stocktake OR a spot check.
-- Additive only: no drops, no column removals, no data changes.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Parent session record for spot checks (mirrors stocktakes, minimal fields)
create table if not exists spot_check_sessions (
  id          uuid primary key default uuid_generate_v4(),
  venue_id    uuid references venues(id) on delete cascade not null,
  status      text not null default 'open' check (status in ('open','closed')),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  user_id     uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_spot_check_sessions_venue
  on spot_check_sessions(venue_id, status, opened_at desc);

alter table spot_check_sessions enable row level security;

drop policy if exists "Venue members can view spot check sessions"   on spot_check_sessions;
drop policy if exists "Venue members can insert spot check sessions" on spot_check_sessions;
drop policy if exists "Venue members can update spot check sessions" on spot_check_sessions;
create policy "Venue members can view spot check sessions"
  on spot_check_sessions for select using (is_venue_member(venue_id));
create policy "Venue members can insert spot check sessions"
  on spot_check_sessions for insert with check (is_venue_member(venue_id));
create policy "Venue members can update spot check sessions"
  on spot_check_sessions for update using (is_venue_member(venue_id));

-- 2. Line entries can now belong to a spot check instead of a stocktake
alter table stocktake_line_entries
  add column if not exists spot_check_id uuid references spot_check_sessions(id) on delete cascade;

alter table stocktake_line_entries
  alter column stocktake_id drop not null;

-- Every line entry must have exactly one parent
alter table stocktake_line_entries drop constraint if exists stle_exactly_one_parent;
alter table stocktake_line_entries add constraint stle_exactly_one_parent
  check (
    (stocktake_id is not null and spot_check_id is null) or
    (stocktake_id is null and spot_check_id is not null)
  );

-- 3. Explicit uniqueness: one entry per product × counting location per parent
create unique index if not exists uq_stle_stocktake_product_location
  on stocktake_line_entries(stocktake_id, product_id, count_location_id)
  where stocktake_id is not null and count_location_id is not null;
create unique index if not exists uq_stle_spotcheck_product_location
  on stocktake_line_entries(spot_check_id, product_id, count_location_id)
  where spot_check_id is not null and count_location_id is not null;

create index if not exists idx_stle_spot_check_product
  on stocktake_line_entries(spot_check_id, product_id)
  where spot_check_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK for the migration above (run only if reverting):
--
--   drop index if exists idx_stle_spot_check_product;
--   drop index if exists uq_stle_spotcheck_product_location;
--   drop index if exists uq_stle_stocktake_product_location;
--   alter table stocktake_line_entries drop constraint if exists stle_exactly_one_parent;
--   -- restore NOT NULL (only valid if no spot-check rows remain):
--   delete from stocktake_line_entries where stocktake_id is null;
--   alter table stocktake_line_entries alter column stocktake_id set not null;
--   alter table stocktake_line_entries drop column if exists spot_check_id;
--   drop policy if exists "Venue members can view spot check sessions"   on spot_check_sessions;
--   drop policy if exists "Venue members can insert spot check sessions" on spot_check_sessions;
--   drop policy if exists "Venue members can update spot check sessions" on spot_check_sessions;
--   drop index if exists idx_spot_check_sessions_venue;
--   drop table if exists spot_check_sessions;
-- ───────────────────────────────────────────────────────────────────────────
