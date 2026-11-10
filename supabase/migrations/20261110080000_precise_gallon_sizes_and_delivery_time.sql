-- Sizes named in gallons, stored to the hundredth of a litre so N full containers = whole gallons (Venners figure).
update public.products set container_l = 40.91 where container_l = 40.90;
update public.products set container_l = 45.46 where container_l = 45.50;
update public.products set container_l = 81.83 where container_l = 81.80;
update public.products set container_l = 20.46 where container_l = 20.50 and container_type = 'cask';

-- A note dated today (or with no date) is stamped with the time it was scanned, not midnight,
-- so it counts as delivered after this morning's count. Older notes land at midday on their date.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commit_delivery_document';
  if position('coalesce(v_document.invoice_date::timestamptz, now())' in d) = 0 then
    raise exception 'commit_delivery_document no longer has the expected delivered_at expression';
  end if;
  d := replace(d, 'coalesce(v_document.invoice_date::timestamptz, now())',
    'case when v_document.invoice_date is null or v_document.invoice_date >= current_date then now() else v_document.invoice_date::timestamptz + interval ''12 hours'' end');
  execute d;
end $$;
