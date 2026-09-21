-- Scanning a delivery now does three jobs: stock movements (as before), plus it
-- updates each matched product's cost price to the invoiced price, plus it posts
-- the bill into Finances as money out, still payable, with the VAT split.
-- Applied to the live DB 2 Sept 2026; recorded here 21 Sept 2026.
-- Supersedes the version in 202607140006_delivery_document_review.sql.

create or replace function public.commit_delivery_document(p_document_id uuid)
returns table(delivery_count integer, movement_count integer, total_pence integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_document public.delivery_documents;
  v_line public.delivery_document_lines;
  v_product public.products;
  v_capacity_ml numeric;
  v_quantity_ml numeric;
  v_movement_id uuid;
  v_delivery_id uuid;
  v_delivery_count integer := 0;
  v_movement_count integer := 0;
  v_total integer := 0;
  v_unit_cost numeric;
  v_doc_total numeric;
  v_doc_net numeric;
  v_doc_vat numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_document from public.delivery_documents dd where dd.id = p_document_id for update;
  if not found then raise exception 'Delivery document not found'; end if;

  if not exists (
    select 1 from public.venues v
    left join public.venue_members vm on vm.venue_id = v.id and vm.user_id = auth.uid()
    where v.id = v_document.venue_id and (v.owner_id = auth.uid() or vm.role in ('owner', 'manager'))
  ) then raise exception 'Only owners or managers can commit invoice drafts'; end if;

  if v_document.status = 'committed' then
    select count(*)::integer, count(distinct d.stock_movement_id)::integer, coalesce(sum(d.total_cost_pence), 0)::integer
      into v_delivery_count, v_movement_count, v_total
    from public.deliveries d
    where d.venue_id = v_document.venue_id and d.invoice_ref = 'document:' || v_document.id::text;
    delivery_count := v_delivery_count; movement_count := v_movement_count; total_pence := v_total;
    return next; return;
  end if;

  if v_document.status <> 'review' then raise exception 'Document must be reviewed before commit'; end if;

  if exists (
    select 1 from public.delivery_document_lines l
    where l.document_id = v_document.id and l.review_status = 'accepted'
      and (l.matched_product_id is null or l.unit_cost_pence is null)
  ) then raise exception 'Every accepted line needs a product match and unit cost'; end if;

  if not exists (
    select 1 from public.delivery_document_lines l where l.document_id = v_document.id and l.review_status = 'accepted'
  ) then raise exception 'Accept at least one invoice line'; end if;

  update public.delivery_documents set status = 'committing' where id = v_document.id;

  for v_line in
    select * from public.delivery_document_lines l
    where l.document_id = v_document.id and l.review_status = 'accepted'
    order by l.line_number
  loop
    select * into v_product from public.products p
    where p.id = v_line.matched_product_id and p.venue_id = v_document.venue_id;
    if not found then raise exception 'Matched product is invalid for line %', v_line.line_number; end if;

    v_capacity_ml := case
      when v_product.container_l is not null and v_product.container_l > 0 then v_product.container_l * 1000
      when v_product.counting_method = 'dozen' then coalesce(v_product.size_ml, 0) * coalesce(v_product.pack_size, 12)
      else coalesce(v_product.size_ml, 0)
    end;
    if v_capacity_ml <= 0 then raise exception 'Product % has no usable purchase-unit capacity', v_product.name; end if;

    v_quantity_ml := v_line.purchase_quantity * v_capacity_ml;

    insert into public.stock_movements (
      venue_id, product_id, from_location_id, to_location_id, movement_type,
      quantity_ml, unit_cost_pence, reason, notes, moved_at, user_id
    ) values (
      v_document.venue_id, v_product.id, null, v_product.location_id, 'delivery',
      v_quantity_ml, v_line.unit_cost_pence, 'Invoice scan', v_document.original_filename,
      coalesce(v_document.invoice_date::timestamptz, now()), auth.uid()
    ) returning id into v_movement_id;

    insert into public.deliveries (
      venue_id, product_id, entry_method, quantity, unit_cost, invoice_ref,
      delivered_at, user_id, quantity_ml, total_cost_pence, supplier,
      to_location_id, notes, client_reference, stock_movement_id
    ) values (
      v_document.venue_id, v_product.id, 'invoice', v_line.purchase_quantity,
      v_line.unit_cost_pence / 100.0, 'document:' || v_document.id::text,
      coalesce(v_document.invoice_date::timestamptz, now()), auth.uid(),
      v_quantity_ml,
      coalesce(v_line.line_total_pence, round(v_line.purchase_quantity * v_line.unit_cost_pence)::integer),
      v_document.supplier, v_product.location_id, v_line.raw_description,
      md5(v_document.id::text || ':' || v_line.id::text)::uuid, v_movement_id
    ) returning id into v_delivery_id;

    -- Keep the product's cost price current from the invoice (unit cost is per purchase unit,
    -- which is per bottle/keg/cask for every method except 'dozen', where it is per pack)
    v_unit_cost := v_line.unit_cost_pence / 100.0;
    if v_unit_cost > 0 and coalesce(v_product.counting_method, '') <> 'dozen' then
      update public.products set cost_price = v_unit_cost, updated_at = now()
      where id = v_product.id and (cost_price is distinct from v_unit_cost);
    end if;

    v_delivery_count := v_delivery_count + 1;
    v_movement_count := v_movement_count + 1;
    v_total := v_total + coalesce(v_line.line_total_pence, round(v_line.purchase_quantity * v_line.unit_cost_pence)::integer);
  end loop;

  -- Post the bill into Finances once (money out, category stock, due), using the document totals
  -- when the scan read them, otherwise the sum of accepted lines.
  v_doc_total := coalesce(v_document.total_pence, v_total) / 100.0;
  v_doc_net   := case when v_document.subtotal_pence is not null then v_document.subtotal_pence / 100.0 else null end;
  v_doc_vat   := case when v_document.vat_pence is not null then v_document.vat_pence / 100.0 else null end;
  if v_doc_total > 0 and not exists (
    select 1 from public.finance_entries f where f.venue_id = v_document.venue_id and f.reference = 'document:' || v_document.id::text
  ) then
    insert into public.finance_entries (venue_id, direction, entry_date, category, supplier, description, amount, status, reference, source, net_amount, vat_rate, vat_amount)
    values (
      v_document.venue_id, 'out', coalesce(v_document.invoice_date, current_date), 'stock',
      v_document.supplier, 'Delivery ' || coalesce(v_document.invoice_ref, v_document.original_filename, '') || ' (scanned)',
      v_doc_total, 'due', 'document:' || v_document.id::text, 'import',
      v_doc_net,
      case when v_doc_net is not null and v_doc_net > 0 and v_doc_vat is not null then round(v_doc_vat / v_doc_net * 100, 1) else null end,
      v_doc_vat
    );
  end if;

  update public.delivery_documents set status = 'committed', committed_at = now(), extraction_error = null where id = v_document.id;

  delivery_count := v_delivery_count; movement_count := v_movement_count; total_pence := v_total;
  return next;
end;
$function$;

notify pgrst, 'reload schema';
