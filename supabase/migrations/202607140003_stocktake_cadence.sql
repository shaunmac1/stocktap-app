begin;

create table if not exists public.stocktake_schedules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  count_location_id uuid null references public.count_locations(id) on delete cascade,
  cadence_days integer not null default 7 check (cadence_days between 1 and 365),
  preferred_weekday smallint null check (preferred_weekday between 0 and 6),
  reminder_time time not null default '09:00',
  assigned_user_id uuid null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stocktake_schedules_venue_default_key
  on public.stocktake_schedules(venue_id)
  where count_location_id is null;

create unique index if not exists stocktake_schedules_location_key
  on public.stocktake_schedules(venue_id, count_location_id)
  where count_location_id is not null;

create index if not exists stocktake_schedules_venue_idx
  on public.stocktake_schedules(venue_id);

create or replace function public.touch_stocktake_schedule_updated_at()
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

drop trigger if exists stocktake_schedules_touch_updated_at on public.stocktake_schedules;
create trigger stocktake_schedules_touch_updated_at
before update on public.stocktake_schedules
for each row execute function public.touch_stocktake_schedule_updated_at();

alter table public.stocktake_schedules enable row level security;

drop policy if exists stocktake_schedules_select_members on public.stocktake_schedules;
create policy stocktake_schedules_select_members
on public.stocktake_schedules
for select
to authenticated
using (
  exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = stocktake_schedules.venue_id
      and vm.user_id = auth.uid()
  )
);

drop policy if exists stocktake_schedules_write_managers on public.stocktake_schedules;
create policy stocktake_schedules_write_managers
on public.stocktake_schedules
for all
to authenticated
using (
  exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = stocktake_schedules.venue_id
      and vm.user_id = auth.uid()
      and vm.role in ('owner', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = stocktake_schedules.venue_id
      and vm.user_id = auth.uid()
      and vm.role in ('owner', 'manager')
  )
  and (
    stocktake_schedules.count_location_id is null
    or exists (
      select 1
      from public.count_locations cl
      where cl.id = stocktake_schedules.count_location_id
        and cl.venue_id = stocktake_schedules.venue_id
    )
  )
  and (
    stocktake_schedules.assigned_user_id is null
    or exists (
      select 1
      from public.venue_members assigned
      where assigned.venue_id = stocktake_schedules.venue_id
        and assigned.user_id = stocktake_schedules.assigned_user_id
    )
  )
);

create or replace function public.save_stocktake_schedule(
  p_venue_id uuid,
  p_count_location_id uuid,
  p_cadence_days integer,
  p_preferred_weekday smallint,
  p_reminder_time time,
  p_assigned_user_id uuid,
  p_enabled boolean
)
returns public.stocktake_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.stocktake_schedules;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = p_venue_id
      and vm.user_id = auth.uid()
      and vm.role in ('owner', 'manager')
  ) then
    raise exception 'Only venue owners or managers can change stocktake schedules';
  end if;

  if p_cadence_days < 1 or p_cadence_days > 365 then
    raise exception 'Cadence must be between 1 and 365 days';
  end if;

  if p_preferred_weekday is not null and (p_preferred_weekday < 0 or p_preferred_weekday > 6) then
    raise exception 'Preferred weekday must be between 0 and 6';
  end if;

  if p_count_location_id is not null and not exists (
    select 1
    from public.count_locations cl
    where cl.id = p_count_location_id
      and cl.venue_id = p_venue_id
  ) then
    raise exception 'Counting location does not belong to this venue';
  end if;

  if p_assigned_user_id is not null and not exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = p_venue_id
      and vm.user_id = p_assigned_user_id
  ) then
    raise exception 'Assigned user does not belong to this venue';
  end if;

  update public.stocktake_schedules
  set cadence_days = p_cadence_days,
      preferred_weekday = p_preferred_weekday,
      reminder_time = coalesce(p_reminder_time, '09:00'::time),
      assigned_user_id = p_assigned_user_id,
      enabled = p_enabled
  where venue_id = p_venue_id
    and count_location_id is not distinct from p_count_location_id
  returning * into v_schedule;

  if found then
    return v_schedule;
  end if;

  insert into public.stocktake_schedules (
    venue_id,
    count_location_id,
    cadence_days,
    preferred_weekday,
    reminder_time,
    assigned_user_id,
    enabled
  ) values (
    p_venue_id,
    p_count_location_id,
    p_cadence_days,
    p_preferred_weekday,
    coalesce(p_reminder_time, '09:00'::time),
    p_assigned_user_id,
    p_enabled
  )
  returning * into v_schedule;

  return v_schedule;
end;
$$;

create or replace function public.get_stocktake_cadence_status(p_venue_id uuid)
returns table (
  schedule_id uuid,
  venue_id uuid,
  count_location_id uuid,
  scope_name text,
  cadence_days integer,
  preferred_weekday smallint,
  reminder_time text,
  assigned_user_id uuid,
  enabled boolean,
  last_counted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.venue_members vm
    where vm.venue_id = p_venue_id
      and vm.user_id = auth.uid()
  ) then
    raise exception 'Venue access denied';
  end if;

  return query
  select
    ss.id,
    ss.venue_id,
    ss.count_location_id,
    coalesce(cl.name, 'Whole venue')::text,
    ss.cadence_days,
    ss.preferred_weekday,
    to_char(ss.reminder_time, 'HH24:MI')::text,
    ss.assigned_user_id,
    ss.enabled,
    case
      when ss.count_location_id is null then (
        select max(st.closed_at)
        from public.stocktakes st
        where st.venue_id = ss.venue_id
          and st.status = 'closed'
      )
      else (
        select max(st.closed_at)
        from public.stocktake_line_entries le
        join public.stocktakes st on st.id = le.stocktake_id
        where le.venue_id = ss.venue_id
          and le.count_location_id = ss.count_location_id
          and st.status = 'closed'
      )
    end as last_counted_at
  from public.stocktake_schedules ss
  left join public.count_locations cl on cl.id = ss.count_location_id
  where ss.venue_id = p_venue_id
  order by ss.count_location_id nulls first, cl.sort nulls first, cl.name;
end;
$$;

revoke all on function public.save_stocktake_schedule(uuid, uuid, integer, smallint, time, uuid, boolean) from public;
revoke all on function public.get_stocktake_cadence_status(uuid) from public;
grant execute on function public.save_stocktake_schedule(uuid, uuid, integer, smallint, time, uuid, boolean) to authenticated;
grant execute on function public.get_stocktake_cadence_status(uuid) to authenticated;

commit;
