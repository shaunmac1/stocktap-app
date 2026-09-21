-- Found by the first-count as-user test: typing "Gordons" returned nothing
-- because the catalogue says "Gordon's", and "Smirnoff" put "Smirnoff Mango &
-- Passion Fruit" above "Smirnoff Red" because ties were broken by sample count
-- then name. Now: apostrophes and curly quotes are ignored on both sides, and
-- within a match tier the shortest name (the plain bottle) comes first.

create or replace function public.search_catalogue_items(p_venue_id uuid, p_query text default ''::text, p_limit integer default 50)
returns table(id uuid, canonical_name text, type text, category text, unit text, counting_method text, size_ml numeric, container_type text, container_l numeric, pack_size numeric, abv numeric, calibration_sample_count integer, calibration_confidence text, has_calibration boolean, already_added boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_query text := regexp_replace(lower(trim(coalesce(p_query, ''))), '[''’`]', '', 'g');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.venues v
    where v.id = p_venue_id
      and (v.owner_id = auth.uid()
        or exists (select 1 from public.venue_members vm
                   where vm.venue_id = p_venue_id and vm.user_id = auth.uid()))
  ) then
    raise exception 'Venue access denied';
  end if;

  return query
  select
    ci.id, ci.canonical_name, ci.type, ci.category, ci.unit, ci.counting_method,
    ci.size_ml, ci.container_type, ci.container_l, ci.pack_size, ci.abv,
    ci.calibration_sample_count, ci.calibration_confidence,
    (ci.full_weight_g is not null and ci.empty_weight_g is not null) as has_calibration,
    exists (
      select 1 from public.products p
      where p.venue_id = p_venue_id
        and p.external_id = 'catalogue:' || ci.id::text
    ) as already_added
  from public.catalogue_items ci
  cross join lateral (select regexp_replace(lower(ci.canonical_name), '[''’`]', '', 'g') as n,
                             regexp_replace(lower(public.array_to_text_immutable(ci.aliases)), '[''’`]', '', 'g') as a) k
  where ci.is_active
    and (
      v_query = ''
      or k.n like '%' || v_query || '%'
      or k.a like '%' || v_query || '%'
    )
  order by
    case
      when v_query = '' then 4
      when k.n = v_query then 0
      when k.n like v_query || '%' then 1
      when k.n like '%' || v_query || '%' then 2
      else 3
    end,
    length(ci.canonical_name),
    ci.calibration_sample_count desc,
    ci.canonical_name
  limit v_limit;
end;
$function$;

notify pgrst, 'reload schema';
