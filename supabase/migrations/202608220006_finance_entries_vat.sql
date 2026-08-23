-- VAT on finance entries for owned/tenancy (non-tied) delivery notes & purchases:
-- net + rate + vat amount, so the app shows "VAT reclaimable this period". `amount`
-- stays the gross. Tied pubs leave these null (no reclaimable per-line VAT on their
-- delivery notes).
alter table public.finance_entries add column if not exists net_amount numeric check (net_amount is null or net_amount >= 0);
alter table public.finance_entries add column if not exists vat_rate numeric check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100));
alter table public.finance_entries add column if not exists vat_amount numeric check (vat_amount is null or vat_amount >= 0);
notify pgrst, 'reload schema';
