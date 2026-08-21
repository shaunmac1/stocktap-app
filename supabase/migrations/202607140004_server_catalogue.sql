begin;

create table if not exists public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  aliases text[] not null default '{}'::text[],
  type text not null,
  category text not null,
  unit text not null,
  counting_method text not null,
  size_ml numeric null,
  container_type text null,
  container_l numeric null,
  pack_size numeric null,
  abv numeric null,
  density numeric not null default 1,
  full_weight_g numeric null,
  empty_weight_g numeric null,
  calibration_sample_count integer not null default 0 check (calibration_sample_count >= 0),
  calibration_confidence text not null default 'unverified'
    check (calibration_confidence in ('unverified', 'low', 'medium', 'high', 'verified')),
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalogue_items_identity_key
  on public.catalogue_items (
    lower(canonical_name),
    coalesce(size_ml, -1::numeric),
    coalesce(container_l, -1::numeric)
  );

create index if not exists catalogue_items_search_idx
  on public.catalogue_items using gin (
    to_tsvector('simple', canonical_name || ' ' || array_to_string(aliases, ' '))
  );

alter table public.catalogue_items enable row level security;

-- Deliberately no authenticated SELECT policy. Catalogue rows contain proprietary
-- calibration values and are exposed only through safe SECURITY DEFINER functions.

create or replace function public.touch_catalogue_item_updated_at()
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

drop trigger if exists catalogue_items_touch_updated_at on public.catalogue_items;
create trigger catalogue_items_touch_updated_at
before update on public.catalogue_items
for each row execute function public.touch_catalogue_item_updated_at();

create or replace function public.search_catalogue_items(
  p_venue_id uuid,
  p_query text default '',
  p_limit integer default 50
)
returns table (
  id uuid,
  canonical_name text,
  type text,
  category text,
  unit text,
  counting_method text,
  size_ml numeric,
  container_type text,
  container_l numeric,
  pack_size numeric,
  abv numeric,
  calibration_sample_count integer,
  calibration_confidence text,
  has_calibration boolean,
  already_added boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.venues v
    where v.id = p_venue_id
      and (
        v.owner_id = auth.uid()
        or exists (
          select 1
          from public.venue_members vm
          where vm.venue_id = p_venue_id
            and vm.user_id = auth.uid()
        )
      )
  ) then
    raise exception 'Venue access denied';
  end if;

  return query
  select
    ci.id,
    ci.canonical_name,
    ci.type,
    ci.category,
    ci.unit,
    ci.counting_method,
    ci.size_ml,
    ci.container_type,
    ci.container_l,
    ci.pack_size,
    ci.abv,
    ci.calibration_sample_count,
    ci.calibration_confidence,
    (ci.full_weight_g is not null and ci.empty_weight_g is not null) as has_calibration,
    exists (
      select 1
      from public.products p
      where p.venue_id = p_venue_id
        and p.external_id = 'catalogue:' || ci.id::text
    ) as already_added
  from public.catalogue_items ci
  where ci.is_active
    and (
      v_query = ''
      or lower(ci.canonical_name) = v_query
      or lower(ci.canonical_name) like v_query || '%'
      or lower(ci.canonical_name) like '%' || v_query || '%'
      or exists (
        select 1
        from unnest(ci.aliases) alias_name
        where lower(alias_name) like '%' || v_query || '%'
      )
    )
  order by
    case
      when v_query = '' then 4
      when lower(ci.canonical_name) = v_query then 0
      when lower(ci.canonical_name) like v_query || '%' then 1
      when lower(ci.canonical_name) like '%' || v_query || '%' then 2
      else 3
    end,
    ci.calibration_sample_count desc,
    ci.canonical_name
  limit v_limit;
end;
$$;

create or replace function public.add_catalogue_items_to_venue(
  p_venue_id uuid,
  p_catalogue_ids uuid[],
  p_location_id uuid default null
)
returns table (
  product_id uuid,
  catalogue_id uuid,
  product_name text,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_existing_count integer;
  v_new_count integer;
  v_catalogue_id uuid;
  v_item public.catalogue_items;
  v_existing_product_id uuid;
  v_product public.products;
  v_product_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_catalogue_ids is null or cardinality(p_catalogue_ids) = 0 then
    raise exception 'Select at least one catalogue product';
  end if;

  if not exists (
    select 1
    from public.venues v
    where v.id = p_venue_id
      and (
        v.owner_id = auth.uid()
        or exists (
          select 1
          from public.venue_members vm
          where vm.venue_id = p_venue_id
            and vm.user_id = auth.uid()
            and vm.role in ('owner', 'manager')
        )
      )
  ) then
    raise exception 'Only venue owners or managers can add catalogue products';
  end if;

  if p_location_id is not null and not exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and l.venue_id = p_venue_id
  ) then
    raise exception 'Location does not belong to this venue';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalogue-add:' || p_venue_id::text, 0));

  select v.tier::text
  into v_tier
  from public.venues v
  where v.id = p_venue_id;

  select count(*)
  into v_existing_count
  from public.products p
  where p.venue_id = p_venue_id;

  select count(*)
  into v_new_count
  from (
    select distinct requested.id
    from unnest(p_catalogue_ids) requested(id)
    join public.catalogue_items ci on ci.id = requested.id and ci.is_active
    where not exists (
      select 1
      from public.products p
      where p.venue_id = p_venue_id
        and p.external_id = 'catalogue:' || requested.id::text
    )
  ) candidates;

  if v_tier = 'free' and v_existing_count + v_new_count > 50 then
    raise exception 'Free plan allows a maximum of 50 products. Select fewer products or upgrade.';
  end if;

  foreach v_catalogue_id in array p_catalogue_ids
  loop
    select p.id
    into v_existing_product_id
    from public.products p
    where p.venue_id = p_venue_id
      and p.external_id = 'catalogue:' || v_catalogue_id::text
    limit 1;

    if v_existing_product_id is not null then
      select p.name into product_name
      from public.products p
      where p.id = v_existing_product_id;

      product_id := v_existing_product_id;
      catalogue_id := v_catalogue_id;
      created := false;
      return next;
      v_existing_product_id := null;
      continue;
    end if;

    select *
    into v_item
    from public.catalogue_items ci
    where ci.id = v_catalogue_id
      and ci.is_active;

    if not found then
      raise exception 'Catalogue product % was not found or is inactive', v_catalogue_id;
    end if;

    select *
    into v_product
    from jsonb_populate_record(
      null::public.products,
      jsonb_build_object(
        'venue_id', p_venue_id,
        'location_id', p_location_id,
        'name', v_item.canonical_name,
        'type', v_item.type,
        'unit', v_item.unit,
        'size_ml', v_item.size_ml,
        'abv', v_item.abv,
        'density', v_item.density,
        'full_weight_g', v_item.full_weight_g,
        'empty_weight_g', v_item.empty_weight_g,
        'category', v_item.category,
        'counting_method', v_item.counting_method,
        'container_type', v_item.container_type,
        'container_l', v_item.container_l,
        'pack_size', v_item.pack_size,
        'external_id', 'catalogue:' || v_item.id::text,
        'is_template', false
      )
    );

    insert into public.products (
      venue_id,
      location_id,
      name,
      type,
      unit,
      size_ml,
      abv,
      density,
      full_weight_g,
      empty_weight_g,
      category,
      counting_method,
      container_type,
      container_l,
      pack_size,
      external_id,
      is_template
    ) values (
      v_product.venue_id,
      v_product.location_id,
      v_product.name,
      v_product.type,
      v_product.unit,
      v_product.size_ml,
      v_product.abv,
      v_product.density,
      v_product.full_weight_g,
      v_product.empty_weight_g,
      v_product.category,
      v_product.counting_method,
      v_product.container_type,
      v_product.container_l,
      v_product.pack_size,
      v_product.external_id,
      coalesce(v_product.is_template, false)
    )
    returning id into v_product_id;

    product_id := v_product_id;
    catalogue_id := v_catalogue_id;
    product_name := v_item.canonical_name;
    created := true;
    return next;
  end loop;
end;
$$;

revoke all on public.catalogue_items from anon, authenticated;
revoke all on function public.search_catalogue_items(uuid, text, integer) from public;
revoke all on function public.add_catalogue_items_to_venue(uuid, uuid[], uuid) from public;
grant execute on function public.search_catalogue_items(uuid, text, integer) to authenticated;
grant execute on function public.add_catalogue_items_to_venue(uuid, uuid[], uuid) to authenticated;

commit;
