-- Remember which lines a count covers. Null = the whole library (the old
-- behaviour). Set by the guided first count and by "Start New Stocktake" when
-- a subset is picked, so Resume shows the same lines and Home can say
-- "8 of 20 done" instead of dumping the landlord into the full range.
alter table public.stocktakes add column if not exists product_ids uuid[];
notify pgrst, 'reload schema';
