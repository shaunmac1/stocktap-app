-- Every new venue gets 14 days of Pro automatically, no card, no click-through
-- to Stripe. The Plan tab shows days left, Home nudges in the last 3 days, and
-- the Worker's nightly cron calls expire_venue_trials() to drop lapsed trials
-- back to Free (keeping any venue that now has a real Stripe subscription).
-- Applied to the live DB 2 Sept 2026; recorded here 21 Sept 2026.

alter table public.venues add column if not exists trial_ends_at timestamptz;

create or replace function public.start_venue_trial()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.tier is null or new.tier = 'free' then
    new.tier := 'pro';
    new.trial_ends_at := now() + interval '14 days';
  end if;
  return new;
end;
$function$;

drop trigger if exists venues_start_trial on public.venues;
create trigger venues_start_trial
  before insert on public.venues
  for each row execute function public.start_venue_trial();

-- Called by the Cloudflare Worker cron with the anon key + shared secret.
create or replace function public.expire_venue_trials(p_secret text, p_keep uuid[] default '{}'::uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_expected text; v_n integer;
begin
  select value into v_expected from public.service_config where key = 'stripe_bridge_secret';
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'unauthorised';
  end if;
  update public.venues
     set tier = 'free'
   where trial_ends_at is not null
     and trial_ends_at < now()
     and tier <> 'free'
     and not (id = any(coalesce(p_keep, '{}')));
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

grant execute on function public.expire_venue_trials(text, uuid[]) to anon, authenticated, service_role;

-- Venues created in the 14 days before this shipped get their trial retrospectively.
update public.venues
   set tier = 'pro', trial_ends_at = created_at + interval '14 days'
 where tier = 'free'
   and trial_ends_at is null
   and stripe_customer_id is null
   and created_at > now() - interval '14 days';

notify pgrst, 'reload schema';
