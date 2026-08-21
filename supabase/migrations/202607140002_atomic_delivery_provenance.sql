-- Atomic, retry-safe manual delivery recording.
-- One call creates both the physical stock movement and the financial delivery row.

alter table public.deliveries
  add column if not exists quantity_ml numeric,
  add column if not exists total_cost_pence bigint,
  add column if not exists supplier text,
  add column if not exists to_location_id uuid references public.locations(id) on delete set null,
  add column if not exists notes text,
  add column if not exists client_reference uuid,
  add column if not exists stock_movement_id uuid references public.stock_movements(id) on delete set null;

create unique index if not exists deliveries_venue_client_reference_uidx
  on public.deliveries (venue_id, client_reference)
  where client_reference is not null;

create or replace function public.record_manual_delivery(
  p_venue_id uuid,
  p_product_id uuid,
  p_purchase_quantity numeric,
  p_quantity_ml numeric,
  p_unit_cost_pence integer,
  p_client_reference uuid,
  p_invoice_ref text default null,
  p_supplier text default null,
  p_to_location_id uuid default null,
  p_notes text default null,
  p_delivered_at timestamptz default now()
)
returns table (
  delivery_id uuid,
  movement_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_delivery_id uuid;
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_client_reference is null then
    raise exception 'A client reference is required';
  end if;

  if p_purchase_quantity is null or p_purchase_quantity <= 0 then
    raise exception 'Purchase quantity must be greater than zero';
  end if;

  if p_quantity_ml is null or p_quantity_ml <= 0 then
    raise exception 'Physical quantity must be greater than zero';
  end if;

  if p_unit_cost_pence is null or p_unit_cost_pence < 0 then
    raise exception 'Unit cost cannot be negative';
  end if;

  if not exists (
    select 1
    from public.venues v
    where v.id = p_venue_id and v.owner_id = v_user_id
  ) and not exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = p_venue_id and vm.user_id = v_user_id
  ) then
    raise exception 'You do not have access to this venue' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = p_product_id and p.venue_id = p_venue_id
  ) then
    raise exception 'Product does not belong to this venue' using errcode = '23503';
  end if;

  if p_to_location_id is not null and not exists (
    select 1
    from public.locations l
    where l.id = p_to_location_id and l.venue_id = p_venue_id
  ) then
    raise exception 'Location does not belong to this venue' using errcode = '23503';
  end if;

  select d.id, d.stock_movement_id
    into v_delivery_id, v_movement_id
  from public.deliveries d
  where d.venue_id = p_venue_id
    and d.client_reference = p_client_reference;

  if v_delivery_id is not null then
    return query select v_delivery_id, v_movement_id, false;
    return;
  end if;

  insert into public.stock_movements (
    venue_id,
    product_id,
    from_location_id,
    to_location_id,
    movement_type,
    quantity_ml,
    unit_cost_pence,
    reason,
    notes,
    moved_at,
    user_id
  ) values (
    p_venue_id,
    p_product_id,
    null,
    p_to_location_id,
    'delivery',
    p_quantity_ml,
    p_unit_cost_pence,
    coalesce(nullif(trim(p_invoice_ref), ''), 'Manual delivery'),
    nullif(trim(p_notes), ''),
    coalesce(p_delivered_at, now()),
    v_user_id
  )
  returning id into v_movement_id;

  insert into public.deliveries (
    venue_id,
    product_id,
    entry_method,
    quantity,
    unit_cost,
    invoice_ref,
    delivered_at,
    user_id,
    quantity_ml,
    total_cost_pence,
    supplier,
    to_location_id,
    notes,
    client_reference,
    stock_movement_id
  ) values (
    p_venue_id,
    p_product_id,
    'ledger',
    p_purchase_quantity,
    p_unit_cost_pence / 100.0,
    nullif(trim(p_invoice_ref), ''),
    coalesce(p_delivered_at, now()),
    v_user_id,
    p_quantity_ml,
    round(p_purchase_quantity * p_unit_cost_pence)::bigint,
    nullif(trim(p_supplier), ''),
    p_to_location_id,
    nullif(trim(p_notes), ''),
    p_client_reference,
    v_movement_id
  )
  returning id into v_delivery_id;

  return query select v_delivery_id, v_movement_id, true;
end;
$$;

revoke all on function public.record_manual_delivery(
  uuid, uuid, numeric, numeric, integer, uuid, text, text, uuid, text, timestamptz
) from public, anon;

grant execute on function public.record_manual_delivery(
  uuid, uuid, numeric, numeric, integer, uuid, text, text, uuid, text, timestamptz
) to authenticated;
