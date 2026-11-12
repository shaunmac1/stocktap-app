-- StockTap reports its own faults. Additive only: one new table, nothing existing changes.
-- NOT applied yet. Apply when Shaun says deploy.
create table if not exists public.client_faults (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  happened_at timestamptz not null,
  user_id uuid not null default auth.uid(),
  venue_id uuid,
  kind text not null check (kind in ('crash','error','promise','sync','count')),
  message text not null check (char_length(message) <= 400),
  stack text check (stack is null or char_length(stack) <= 1200),
  route text not null check (char_length(route) <= 80),
  build text not null check (char_length(build) <= 40),
  online boolean not null,
  ua text check (ua is null or char_length(ua) <= 200)
);
alter table public.client_faults enable row level security;
-- Signed-in users can add their own faults. Nobody can read, change or delete them from the app.
drop policy if exists client_faults_insert on public.client_faults;
create policy client_faults_insert on public.client_faults for insert to authenticated with check (user_id = auth.uid());
revoke all on public.client_faults from anon;
grant insert on public.client_faults to authenticated;
create index if not exists client_faults_created_idx on public.client_faults (created_at desc);
