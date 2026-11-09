-- Per-pub switches for optional extras (e.g. the "this looks wrong" check). Missing key = on.
alter table public.venues add column if not exists features jsonb not null default '{}'::jsonb;
comment on column public.venues.features is 'Per-pub feature switches, e.g. {"looks_wrong": false}. A missing key means the default (on).';
