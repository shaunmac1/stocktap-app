-- Moat write-back: a full-bottle calibration in any venue contributes its
-- full/empty weights back to the shared GLOBAL catalogue_items row it came
-- from (matched via products.external_id = 'catalogue:<id>').
--
-- Design guarantees:
--  * Anonymous: catalogue_items has no venue_id; nothing here records who weighed.
--  * Safe: server-side sanity bounds + a deviation guard reject implausible or
--    poison readings. Never RAISES on a rejection or a non-catalogue product —
--    it returns contributed=false so it can never break a user's calibration save.
--  * Ratchets confidence up only (a seeded 'medium' is never downgraded).
--  * Running average so many venues' weighings converge on the true weight.

create or replace function public.contribute_catalogue_calibration(
  p_product_id uuid,
  p_full_weight_g numeric,
  p_empty_weight_g numeric
)
returns table(contributed boolean, sample_count integer, reason text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_venue_id uuid;
  v_external_id text;
  v_catalogue_id uuid;
  v_item public.catalogue_items;
  v_n integer;
  v_new_full numeric;
  v_new_empty numeric;
  v_new_count integer;
  v_contents numeric;
  v_density numeric;
  v_rank_existing int;
  v_rank_candidate int;
  v_new_conf text;
begin
  contributed := false;
  sample_count := null;
  reason := null;

  if auth.uid() is null then
    reason := 'auth'; return next; return;
  end if;

  select p.venue_id, p.external_id into v_venue_id, v_external_id
  from public.products p
  where p.id = p_product_id;

  if v_venue_id is null then
    reason := 'no_product'; return next; return;
  end if;

  if not exists (
    select 1 from public.venues v
    where v.id = v_venue_id
      and (v.owner_id = auth.uid()
        or exists (select 1 from public.venue_members vm
                   where vm.venue_id = v_venue_id and vm.user_id = auth.uid()))
  ) then
    reason := 'not_member'; return next; return;
  end if;

  if v_external_id is null or v_external_id not like 'catalogue:%' then
    reason := 'not_catalogue_product'; return next; return;
  end if;

  begin
    v_catalogue_id := substring(v_external_id from 11)::uuid;
  exception when others then
    reason := 'bad_external_id'; return next; return;
  end;

  select * into v_item from public.catalogue_items ci
  where ci.id = v_catalogue_id and ci.is_active;
  if not found then
    reason := 'catalogue_item_missing'; return next; return;
  end if;

  -- Sanity bounds (absolute)
  if p_full_weight_g is null or p_empty_weight_g is null
     or p_full_weight_g <= 0 or p_empty_weight_g <= 0
     or p_full_weight_g <= p_empty_weight_g then
    reason := 'implausible_pair'; return next; return;
  end if;
  if p_empty_weight_g < 40 or p_empty_weight_g > 3000
     or p_full_weight_g > 60000 then
    reason := 'out_of_range'; return next; return;
  end if;

  -- Density plausibility (0.6-1.6 g/ml covers spirits through syrups/creams)
  v_contents := p_full_weight_g - p_empty_weight_g;
  if v_item.size_ml is not null and v_item.size_ml > 0 then
    v_density := v_contents / v_item.size_ml;
    if v_density < 0.6 or v_density > 1.6 then
      reason := 'implausible_density'; return next; return;
    end if;
  end if;

  -- Deviation guard (poison protection): reject readings >30% off existing weight
  if v_item.full_weight_g is not null and v_item.full_weight_g > 0
     and abs(p_full_weight_g - v_item.full_weight_g) / v_item.full_weight_g > 0.30 then
    reason := 'deviates_full'; return next; return;
  end if;
  if v_item.empty_weight_g is not null and v_item.empty_weight_g > 0
     and abs(p_empty_weight_g - v_item.empty_weight_g) / v_item.empty_weight_g > 0.30 then
    reason := 'deviates_empty'; return next; return;
  end if;

  -- Running average
  v_n := coalesce(v_item.calibration_sample_count, 0);
  if v_n <= 0 or v_item.full_weight_g is null or v_item.empty_weight_g is null then
    v_new_full := round(p_full_weight_g, 1);
    v_new_empty := round(p_empty_weight_g, 1);
    v_new_count := 1;
  else
    v_new_full := round((v_item.full_weight_g * v_n + p_full_weight_g) / (v_n + 1), 1);
    v_new_empty := round((v_item.empty_weight_g * v_n + p_empty_weight_g) / (v_n + 1), 1);
    v_new_count := v_n + 1;
  end if;

  -- Confidence: ratchet up only
  v_rank_existing := case coalesce(v_item.calibration_confidence,'unverified')
    when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end;
  v_rank_candidate := case
    when v_new_count >= 8 then 3
    when v_new_count >= 3 then 2
    else 1 end;
  v_new_conf := case greatest(v_rank_existing, v_rank_candidate)
    when 3 then 'high' when 2 then 'medium' else 'low' end;

  update public.catalogue_items
  set full_weight_g = v_new_full,
      empty_weight_g = v_new_empty,
      calibration_sample_count = v_new_count,
      calibration_confidence = v_new_conf
  where id = v_catalogue_id;

  contributed := true;
  sample_count := v_new_count;
  reason := 'ok';
  return next;
end;
$function$;

revoke all on function public.contribute_catalogue_calibration(uuid, numeric, numeric) from public;
grant execute on function public.contribute_catalogue_calibration(uuid, numeric, numeric) to authenticated;
