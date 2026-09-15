-- A booth's prize wording/value closes at 11:00 a.m. on the published show's
-- local calendar date. This adds a future-write guard only; existing offers,
-- entries, acceptances and selected-winner snapshots are not rewritten.
create table public.qr_bingo_event_prize_edit_policies (
  event_key text primary key check (event_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  event_timezone text not null check (length(event_timezone) between 1 and 100),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.qr_bingo_event_prize_edit_policies enable row level security;
revoke all on public.qr_bingo_event_prize_edit_policies from public, anon, authenticated, service_role;
grant select on public.qr_bingo_event_prize_edit_policies to service_role;
comment on table public.qr_bingo_event_prize_edit_policies is
  'Admin-provisioned event-local time zone for the 11am prize-edit deadline. Unknown events fail closed. No participant or vendor legal acceptance is recorded here.';
insert into public.qr_bingo_event_prize_edit_policies(event_key,event_timezone)
values ('niagara-wedding-show-2026','America/Toronto');

create function public.qr_bingo_prize_edit_deadline(p_event_starts_at timestamptz,p_event_timezone text)
returns timestamptz
language plpgsql stable security invoker set search_path=''
as $$
begin
  if p_event_starts_at is null or not isfinite(p_event_starts_at)
     or p_event_timezone is null or not exists (
       select 1 from pg_catalog.pg_timezone_names where name=p_event_timezone
     ) then return null; end if;
  return (((p_event_starts_at at time zone p_event_timezone)::date + time '11:00:00')
    at time zone p_event_timezone);
end;
$$;
revoke all on function public.qr_bingo_prize_edit_deadline(timestamptz,text) from public,anon,authenticated;
grant execute on function public.qr_bingo_prize_edit_deadline(timestamptz,text) to service_role;

create function public.qr_bingo_prize_edit_window_open(p_deadline_at timestamptz,p_now timestamptz)
returns boolean language sql immutable security invoker set search_path=''
as $$ select coalesce(isfinite(p_deadline_at) and isfinite(p_now) and p_now < p_deadline_at,false) $$;
revoke all on function public.qr_bingo_prize_edit_window_open(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.qr_bingo_prize_edit_window_open(timestamptz,timestamptz) to service_role;

create function public.qr_bingo_prize_edit_status(p_event_key text,p_vendor_bingo_id text,p_vendor_bd_user_id text)
returns jsonb language plpgsql volatile security invoker set search_path=''
as $$
declare
  cfg public.qr_bingo_event_configs%rowtype;
  event_zone text;
  deadline_at timestamptz;
  lock_reason text := 'unavailable';
  settings_row public.qr_bingo_raffle_settings%rowtype;
begin
  select * into settings_row from public.qr_bingo_raffle_settings
    where event_key=p_event_key and vendor_bingo_id=p_vendor_bingo_id and vendor_bd_user_id=p_vendor_bd_user_id;
  if found then
    if settings_row.synthetic_fixture_setup_id is not null then
      lock_reason := 'synthetic_fixture';
    elsif (select count(*) from public.qr_bingo_event_configs where published) = 1 then
      select * into cfg from public.qr_bingo_event_configs where published and event_key=p_event_key;
      if found then
        select event_timezone into event_zone from public.qr_bingo_event_prize_edit_policies where event_key=cfg.event_key;
        deadline_at := public.qr_bingo_prize_edit_deadline(cfg.history_starts_at,event_zone);
        -- Preserve the existing current-generation sent/sending/ambiguous locks.
        lock_reason := public.qr_bingo_prize_details_lock(p_event_key,p_vendor_bingo_id,p_vendor_bd_user_id);
        if lock_reason is null then
          if deadline_at is null then lock_reason := 'unavailable';
          elsif not public.qr_bingo_prize_edit_window_open(deadline_at,clock_timestamp()) then lock_reason := 'deadline';
          end if;
        end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('event_key',p_event_key,'vendor_bingo_id',p_vendor_bingo_id,
    'vendor_bd_user_id',p_vendor_bd_user_id,'event_revision',cfg.revision,
    'prize_editable',lock_reason is null,'prize_edit_deadline_at',deadline_at,
    'prize_edit_timezone',case when deadline_at is not null then event_zone else null end,
    'prize_details_locked',lock_reason is not null,'prize_details_lock_reason',lock_reason);
end;
$$;
revoke all on function public.qr_bingo_prize_edit_status(text,text,text) from public,anon,authenticated;
grant execute on function public.qr_bingo_prize_edit_status(text,text,text) to service_role;

create function public.enforce_qr_bingo_prize_edit_deadline()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
  status jsonb;
  cfg public.qr_bingo_event_configs%rowtype;
  event_zone text;
  deadline_at timestamptz;
begin
  if tg_op='UPDATE' then
    if row(new.event_key,new.vendor_bingo_id,new.vendor_bd_user_id) is distinct from
       row(old.event_key,old.vendor_bingo_id,old.vendor_bd_user_id) then
      raise exception using errcode='55000',message='Prize settings cannot be moved to a different event or vendor.';
    end if;
    if row(new.prize_title,new.prize_description,new.prize_approx_value_cad) is not distinct from
       row(old.prize_title,old.prize_description,old.prize_approx_value_cad) then return new; end if;
    -- Serialize with draw selection/email claims and evaluate wall time only
    -- after this lock, so a request queued before 11am cannot save after 11am.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.event_key||':'||old.vendor_bingo_id,0));
    status := public.qr_bingo_prize_edit_status(old.event_key,old.vendor_bingo_id,old.vendor_bd_user_id);
    if coalesce((status->>'prize_editable')::boolean,false) then return new; end if;
  else
    -- Preserve the supported initial nonbinding setup only. The existing
    -- zz_guard_qr_bingo_synthetic_settings subsequently validates every legal,
    -- fixture, expiry and snapshot field; no ordinary settings write gains an
    -- exemption merely by supplying a synthetic id or a session setting.
    if new.synthetic_fixture_setup_id is not null and current_user='service_role'
       and current_setting('request.qr_bingo_synthetic_setup_id',true)=new.synthetic_fixture_setup_id::text
       and exists(select 1 from public.qr_bingo_synthetic_fixture_setups s
         where s.id=new.synthetic_fixture_setup_id and s.provenance='synthetic_fixture_setup'
           and row(s.event_key,s.vendor_bingo_id,s.vendor_bd_user_id,s.prize_title,s.prize_description,s.prize_approx_value_cad)
             is not distinct from row(new.event_key,new.vendor_bingo_id,new.vendor_bd_user_id,new.prize_title,new.prize_description,new.prize_approx_value_cad))
    then return new; end if;
    -- Empty settings rows support dashboard initialization, even after cutoff.
    if coalesce(new.prize_title,'')='' and coalesce(new.prize_description,'')=''
       and coalesce(new.prize_approx_value_cad,0)=0 then return new; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.event_key||':'||new.vendor_bingo_id,0));
    if new.synthetic_fixture_setup_id is null and
       (select count(*) from public.qr_bingo_event_configs where published)=1 then
      select * into cfg from public.qr_bingo_event_configs where published and event_key=new.event_key;
      if found then
        select event_timezone into event_zone from public.qr_bingo_event_prize_edit_policies where event_key=cfg.event_key;
        deadline_at := public.qr_bingo_prize_edit_deadline(cfg.history_starts_at,event_zone);
        if public.qr_bingo_prize_edit_window_open(deadline_at,clock_timestamp()) and
           public.qr_bingo_prize_details_lock(new.event_key,new.vendor_bingo_id,new.vendor_bd_user_id) is null then return new; end if;
      end if;
    end if;
  end if;
  raise exception using errcode='55000',message='prize_edit_closed: Prize changes close at 11:00 a.m. on the wedding show day, or earlier while winner notification is locked. Reload the current draw.';
end;
$$;
revoke all on function public.enforce_qr_bingo_prize_edit_deadline() from public,anon,authenticated;
-- Run after the existing acquire_qr_bingo_offer_publish_lock trigger as well
-- as the earlier promotion lock, before material comparisons and snapshots.
create trigger b_qr_bingo_prize_edit_deadline
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.enforce_qr_bingo_prize_edit_deadline();
