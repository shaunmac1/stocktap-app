-- Let a "deal" be a free-text label (e.g. "3 for £12", "Double up for £2") that a
-- flat offer_price can't express. Price, dates and product list become optional.
alter table public.special_offers alter column offer_price drop not null;
alter table public.special_offers alter column starts_at drop not null;
alter table public.special_offers alter column ends_at drop not null;
alter table public.special_offers alter column product_ids drop not null;
alter table public.special_offers alter column product_ids set default '{}';
notify pgrst, 'reload schema';
