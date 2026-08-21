begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-documents',
  'delivery-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.delivery_documents (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  uploaded_by uuid not null,
  file_path text not null,
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracting', 'review', 'committing', 'committed', 'failed')),
  supplier text null,
  invoice_ref text null,
  invoice_date date null,
  currency text not null default 'GBP',
  subtotal_pence integer null check (subtotal_pence is null or subtotal_pence >= 0),
  vat_pence integer null check (vat_pence is null or vat_pence >= 0),
  total_pence integer null check (total_pence is null or total_pence >= 0),
  extraction_model text null,
  extraction_error text null,
  committed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, file_hash)
);

create index if not exists delivery_documents_venue_created_idx
  on public.delivery_documents(venue_id, created_at desc);

create table if not exists public.delivery_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.delivery_documents(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  raw_description text not null,
  purchase_quantity numeric not null default 1 check (purchase_quantity > 0),
  unit_label text null,
  unit_cost_pence integer null check (unit_cost_pence is null or unit_cost_pence >= 0),
  line_total_pence integer null check (line_total_pence is null or line_total_pence >= 0),
  matched_product_id uuid null references public.products(id) on delete set null,
  match_confidence numeric null check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  review_status text not null default 'unmatched'
    check (review_status in ('unmatched', 'accepted', 'ignored')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, line_number)
);

create index if not exists delivery_document_lines_document_idx
  on public.delivery_document_lines(document_id, line_number);

create or replace function public.touch_delivery_document_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists delivery_documents_touch_updated_at on public.delivery_documents;
create trigger delivery_documents_touch_updated_at
before update on public.delivery_documents
for each row execute function public.touch_delivery_document_updated_at();

drop trigger if exists delivery_document_lines_touch_updated_at on public.delivery_document_lines;
create trigger delivery_document_lines_touch_updated_at
before update on public.delivery_document_lines
for each row execute function public.touch_delivery_document_updated_at();

alter table public.delivery_documents enable row level security;
alter table public.delivery_document_lines enable row level security;

drop policy if exists delivery_documents_select_members on public.delivery_documents;
create policy delivery_documents_select_members
on public.delivery_documents
for select
to authenticated
using (
  exists (
    select 1 from public.venue_members vm
    where vm.venue_id = delivery_documents.venue_id
      and vm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.venues v
    where v.id = delivery_documents.venue_id
      and v.owner_id = auth.uid()
  )
);

drop policy if exists delivery_documents_insert_members on public.delivery_documents;
create policy delivery_documents_insert_members
on public.delivery_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    exists (
      select 1 from public.venue_members vm
      where vm.venue_id = delivery_documents.venue_id
        and vm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.venues v
      where v.id = delivery_documents.venue_id
        and v.owner_id = auth.uid()
    )
  )
);

drop policy if exists delivery_documents_update_managers on public.delivery_documents;
create policy delivery_documents_update_managers
on public.delivery_documents
for update
to authenticated
using (
  exists (
    select 1 from public.venue_members vm
    where vm.venue_id = delivery_documents.venue_id
      and vm.user_id = auth.uid()
      and vm.role in ('owner', 'manager')
  )
  or exists (
    select 1 from public.venues v
    where v.id = delivery_documents.venue_id
      and v.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.venue_members vm
    where vm.venue_id = delivery_documents.venue_id
      and vm.user_id = auth.uid()
      and vm.role in ('owner', 'manager')
  )
  or exists (
    select 1 from public.venues v
    where v.id = delivery_documents.venue_id
      and v.owner_id = auth.uid()
  )
);

drop policy if exists delivery_document_lines_select_members on public.delivery_document_lines;
create policy delivery_document_lines_select_members
on public.delivery_document_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.delivery_documents dd
    join public.venue_members vm on vm.venue_id = dd.venue_id
    where dd.id = delivery_document_lines.document_id
      and vm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.delivery_documents dd
    join public.venues v on v.id = dd.venue_id
    where dd.id = delivery_document_lines.document_id
      and v.owner_id = auth.uid()
  )
);

drop policy if exists delivery_document_lines_write_managers on public.delivery_document_lines;
create policy delivery_document_lines_write_managers
on public.delivery_document_lines
for all
to authenticated
using (
  exists (
    select 1
    from public.delivery_documents dd
    left join public.venue_members vm
      on vm.venue_id = dd.venue_id and vm.user_id = auth.uid()
    join public.venues v on v.id = dd.venue_id
    where dd.id = delivery_document_lines.document_id
      and (v.owner_id = auth.uid() or vm.role in ('owner', 'manager'))
  )
)
with check (
  exists (
    select 1
    from public.delivery_documents dd
    left join public.venue_members vm
      on vm.venue_id = dd.venue_id and vm.user_id = auth.uid()
    join public.venues v on v.id = dd.venue_id
    where dd.id = delivery_document_lines.document_id
      and (v.owner_id = auth.uid() or vm.role in ('owner', 'manager'))
  )
  and (
    delivery_document_lines.matched_product_id is null
    or exists (
      select 1
      from public.products p
      where p.id = delivery_document_lines.matched_product_id
        and p.venue_id = (
          select source_document.venue_id
          from public.delivery_documents source_document
          where source_document.id = delivery_document_lines.document_id
        )
    )
  )
);

-- Storage paths are always venue/user/uuid.ext. Members may upload/read their venue;
-- only owners/managers may remove source documents.
drop policy if exists delivery_documents_storage_select on storage.objects;
create policy delivery_documents_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'delivery-documents'
  and exists (
    select 1
    from public.venues v
    left join public.venue_members vm
      on vm.venue_id = v.id and vm.user_id = auth.uid()
    where v.id::text = (storage.foldername(name))[1]
      and (v.owner_id = auth.uid() or vm.user_id = auth.uid())
  )
);

drop policy if exists delivery_documents_storage_insert on storage.objects;
create policy delivery_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'delivery-documents'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.venues v
    left join public.venue_members vm
      on vm.venue_id = v.id and vm.user_id = auth.uid()
    where v.id::text = (storage.foldername(name))[1]
      and (v.owner_id = auth.uid() or vm.user_id = auth.uid())
  )
);

drop policy if exists delivery_documents_storage_delete_managers on storage.objects;
create policy delivery_documents_storage_delete_managers
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'delivery-documents'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or exists (
      select 1
      from public.venues v
      left join public.venue_members vm
        on vm.venue_id = v.id and vm.user_id = auth.uid()
      where v.id::text = (storage.foldername(name))[1]
        and (v.owner_id = auth.uid() or vm.role in ('owner', 'manager'))
    )
  )
);

create or replace function public.create_delivery_document(
  p_venue_id uuid,
  p_file_path text,
  p_file_hash text,
  p_original_filename text,
  p_mime_type text
)
returns table (document_id uuid, duplicate boolean, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.delivery_documents;
  v_document public.delivery_documents;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_file_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid file hash'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Unsupported document type'; end if;
  if p_file_path not like p_venue_id::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Invalid document storage path';
  end if;

  if not exists (
    select 1 from public.venues v
    left join public.venue_members vm on vm.venue_id = v.id and vm.user_id = auth.uid()
    where v.id = p_venue_id and (v.owner_id = auth.uid() or vm.user_id = auth.uid())
  ) then raise exception 'Venue access denied'; end if;

  perform pg_advisory_xact_lock(hashtextextended('delivery-document:' || p_venue_id::text || ':' || p_file_hash, 0));

  select * into v_existing
  from public.delivery_documents dd
  where dd.venue_id = p_venue_id and dd.file_hash = p_file_hash;

  if found then
    document_id := v_existing.id;
    duplicate := true;
    status := v_existing.status;
    return next;
    return;
  end if;

  insert into public.delivery_documents (
    venue_id, uploaded_by, file_path, file_hash, original_filename, mime_type
  ) values (
    p_venue_id, auth.uid(), p_file_path, p_file_hash, left(p_original_filename, 255), p_mime_type
  ) returning * into v_document;

  document_id := v_document.id;
  duplicate := false;
  status := v_document.status;
  return next;
end;
$$;

create or replace function public.commit_delivery_document(p_document_id uuid)
returns table (delivery_count integer, movement_count integer, total_pence integer)
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_document
  from public.delivery_documents dd
  where dd.id = p_document_id
  for update;
  if not found then raise exception 'Delivery document not found'; end if;

  if not exists (
    select 1 from public.venues v
    left join public.venue_members vm on vm.venue_id = v.id and vm.user_id = auth.uid()
    where v.id = v_document.venue_id
      and (v.owner_id = auth.uid() or vm.role in ('owner', 'manager'))
  ) then raise exception 'Only owners or managers can commit invoice drafts'; end if;

  if v_document.status = 'committed' then
    select count(*), count(*), coalesce(sum(total_cost_pence), 0)
    into v_delivery_count, v_movement_count, v_total
    from public.deliveries d
    where d.invoice_ref = 'document:' || v_document.id::text;
    delivery_count := v_delivery_count;
    movement_count := v_movement_count;
    total_pence := v_total;
    return next;
    return;
  end if;

  if v_document.status <> 'review' then raise exception 'Document must be reviewed before commit'; end if;

  if exists (
    select 1 from public.delivery_document_lines l
    where l.document_id = v_document.id
      and l.review_status = 'accepted'
      and (l.matched_product_id is null or l.unit_cost_pence is null)
  ) then raise exception 'Every accepted line needs a product match and unit cost'; end if;

  if not exists (
    select 1 from public.delivery_document_lines l
    where l.document_id = v_document.id and l.review_status = 'accepted'
  ) then raise exception 'Accept at least one invoice line'; end if;

  update public.delivery_documents set status = 'committing' where id = v_document.id;

  for v_line in
    select * from public.delivery_document_lines l
    where l.document_id = v_document.id and l.review_status = 'accepted'
    order by l.line_number
  loop
    select * into v_product
    from public.products p
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
      v_quantity_ml, v_line.unit_cost_pence,
      'Invoice scan', v_document.original_filename,
      coalesce(v_document.invoice_date::timestamptz, now()), auth.uid()
    ) returning id into v_movement_id;

    insert into public.deliveries (
      venue_id, product_id, entry_method, quantity, unit_cost, invoice_ref,
      delivered_at, user_id, quantity_ml, total_cost_pence, supplier,
      to_location_id, notes, client_reference, stock_movement_id
    ) values (
      v_document.venue_id, v_product.id, 'invoice', v_line.purchase_quantity,
      v_line.unit_cost_pence / 100.0,
      'document:' || v_document.id::text,
      coalesce(v_document.invoice_date::timestamptz, now()), auth.uid(),
      v_quantity_ml,
      coalesce(v_line.line_total_pence, round(v_line.purchase_quantity * v_line.unit_cost_pence)::integer),
      v_document.supplier, v_product.location_id, v_line.raw_description,
      v_document.id::text || ':' || v_line.id::text, v_movement_id
    ) returning id into v_delivery_id;

    v_delivery_count := v_delivery_count + 1;
    v_movement_count := v_movement_count + 1;
    v_total := v_total + coalesce(v_line.line_total_pence, round(v_line.purchase_quantity * v_line.unit_cost_pence)::integer);
  end loop;

  update public.delivery_documents
  set status = 'committed', committed_at = now(), extraction_error = null
  where id = v_document.id;

  delivery_count := v_delivery_count;
  movement_count := v_movement_count;
  total_pence := v_total;
  return next;
end;
$$;

revoke all on function public.create_delivery_document(uuid, text, text, text, text) from public;
revoke all on function public.commit_delivery_document(uuid) from public;
grant execute on function public.create_delivery_document(uuid, text, text, text, text) to authenticated;
grant execute on function public.commit_delivery_document(uuid) to authenticated;

commit;
