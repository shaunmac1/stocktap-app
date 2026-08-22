-- The app (and generated types) expect stocktake_line_entries.spot_check_id, but
-- this column was never applied to this project — so every entry upsert 400'd
-- ("Could not find the 'spot_check_id' column"), silently breaking stocktake sync.
alter table public.stocktake_line_entries
  add column if not exists spot_check_id uuid;

create index if not exists stocktake_line_entries_spot_check_id_idx
  on public.stocktake_line_entries (spot_check_id);

notify pgrst, 'reload schema';
