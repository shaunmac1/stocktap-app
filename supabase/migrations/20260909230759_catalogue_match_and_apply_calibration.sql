-- Known-bottle matching: list the shared catalogue's names (no weights leave the
-- server), the client picks the obvious match, then apply_catalogue_calibration
-- copies that bottle's full/empty weights onto the venue's product.
-- Applied to the live DB 9 Sept 2026; recorded here 21 Sept 2026.

create or replace function public.list_catalogue_names(p_venue_id uuid)
returns table(id uuid, canonical_name text, aliases text[], category text, size_ml numeric, has_calibration boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.venues v
    where v.id = p_venue_id
      and (v.owner_id = auth.uid()
        or exists (select 1 from public.venue_members vm where vm.venue_id = p_venue_id and vm.user_id = auth.uid()))
  ) then raise exception 'Venue access denied'; end if;
  return query
  select ci.id, ci.canonical_name, ci.aliases, ci.category, ci.size_ml,
         (ci.full_weight_g is not null and ci.empty_weight_g is not null) as has_calibration
  from public.catalogue_items ci
  where ci.is_active;
end;
$function$;

create or replace function public.apply_catalogue_calibration(p_product_id uuid, p_catalogue_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.catalogue_items; v_venue uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select p.venue_id into v_venue from public.products p where p.id = p_product_id;
  if v_venue is null then raise exception 'Product not found'; end if;
  if not exists (
    select 1 from public.venues v
    where v.id = v_venue
      and (v.owner_id = auth.uid()
        or exists (select 1 from public.venue_members vm where vm.venue_id = v_venue and vm.user_id = auth.uid() and vm.role in ('owner','manager')))
  ) then raise exception 'Only venue owners or managers can apply catalogue weights'; end if;
  select * into v_item from public.catalogue_items ci where ci.id = p_catalogue_id and ci.is_active;
  if not found or v_item.full_weight_g is null or v_item.empty_weight_g is null then return false; end if;
  update public.products p
     set full_weight_g = v_item.full_weight_g,
         empty_weight_g = v_item.empty_weight_g,
         density = coalesce(v_item.density, p.density),
         size_ml = coalesce(p.size_ml, v_item.size_ml),
         abv = coalesce(p.abv, v_item.abv),
         external_id = coalesce(p.external_id, 'catalogue:' || v_item.id::text),
         updated_at = now()
   where p.id = p_product_id;
  return true;
end;
$function$;

revoke execute on function public.list_catalogue_names(uuid) from anon;
revoke execute on function public.apply_catalogue_calibration(uuid, uuid) from anon;
grant execute on function public.list_catalogue_names(uuid) to authenticated, service_role;
grant execute on function public.apply_catalogue_calibration(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
