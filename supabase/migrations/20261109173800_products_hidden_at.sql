-- Hide a line the pub no longer stocks without deleting it (deleting would wipe its past counts).
alter table public.products add column if not exists hidden_at timestamptz;
comment on column public.products.hidden_at is 'Set when the pub hides a line it no longer stocks; null = shown. Past counts are kept.';
