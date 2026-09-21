-- Prices filled in by the app from typical UK trade prices (library-hygiene.ts
-- estimateDefaultPrices) are flagged so the Library can nag until corrected.
-- A price typed by the landlord clears the flag.
-- Applied to the live DB 9 Sept 2026; recorded here 21 Sept 2026.

alter table public.products add column if not exists cost_price_estimated boolean not null default false;
alter table public.products add column if not exists pour_price_estimated boolean not null default false;

notify pgrst, 'reload schema';
