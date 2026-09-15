-- Review pushes share transport/delivery accounting only. They never use a real
-- draw ID, email finalizer, message thread, or an implicit device subscription.
alter table public.app_notification_events
  add column review_notice_id uuid references public.review_draw_notices(id) on delete cascade;
create unique index app_notification_events_review_notice_idx on public.app_notification_events(review_notice_id) where review_notice_id is not null;
alter table public.app_notification_events drop constraint app_notification_events_type_check;
alter table public.app_notification_events drop constraint app_notification_events_check;
alter table public.app_notification_events add constraint app_notification_events_type_check
  check(type in ('chat_message','draw_result','vendor_draw_follow_up','review_draw_result','review_vendor_follow_up'));
alter table public.app_notification_events add constraint app_notification_events_route_check check (
  (type='chat_message' and thread_token is not null and draw_id is null and review_notice_id is null)
  or (type in ('draw_result','vendor_draw_follow_up') and draw_id is not null and thread_token is null and review_notice_id is null)
  or (type in ('review_draw_result','review_vendor_follow_up') and review_notice_id is not null and draw_id is null and thread_token is null and sender_member_id is null)
);

create table public.review_draw_push_devices (
  fixture_id uuid not null references public.review_draw_fixtures(id) on delete cascade,
  device_id uuid not null references public.app_push_tokens(id) on delete cascade,
  fixture_generation bigint not null check(fixture_generation between 1 and 9007199254740990),
  registration_generation bigint not null check(registration_generation>=0),
  member_id text not null references public.bd_users_cache(user_id) on delete cascade,
  enabled_at timestamptz not null,
  enabled boolean not null,
  primary key(fixture_id,device_id)
);
create index review_draw_push_devices_device_idx on public.review_draw_push_devices(device_id);
create index review_draw_push_devices_member_idx on public.review_draw_push_devices(member_id);
comment on table public.review_draw_push_devices is 'Explicit per-device nonbinding review push opt-in, pinned to current fixture and registration generations. No historical notifications.';
alter table public.review_draw_push_devices enable row level security;
revoke all on public.review_draw_push_devices from public,anon,authenticated,service_role;
grant select,insert,update on public.review_draw_push_devices to service_role;

create function public.set_weddingwin_review_draw_push(
  p_member_id text,p_expected_generation bigint,p_expo_push_token text,p_enabled boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.app_push_tokens; f public.review_draw_fixtures; s public.review_draw_state;
begin
  if p_member_id is null or p_member_id !~ '^[1-9][0-9]{0,17}$' or p_enabled is null
    or p_expected_generation is null or p_expo_push_token is null then return null; end if;
  -- Match worker order. NO KEY UPDATE remains compatible with delivery FK reads
  -- while Send holds the fixture/state locks and creates notification rows.
  select * into t from public.app_push_tokens where expo_push_token=p_expo_push_token for no key update;
  if not found or not t.enabled or t.bd_member_id<>p_member_id or not exists(
    select 1 from public.bd_users_cache u where u.user_id=p_member_id and u.token=t.bd_member_token
  ) then return null; end if;
  select * into f from public.review_draw_fixtures where p_member_id in(couple_id,vendor_id) for share;
  if not found or not f.active or f.expires_at<=clock_timestamp() then return null; end if;
  select * into s from public.review_draw_state where fixture_id=f.id for share;
  if not found or s.generation<>p_expected_generation then return null; end if;
  insert into public.review_draw_push_devices as current_pin(
    fixture_id,device_id,fixture_generation,registration_generation,member_id,enabled_at,enabled
  ) values(f.id,t.id,s.generation,t.push_registration_generation,p_member_id,clock_timestamp(),p_enabled)
  on conflict(fixture_id,device_id) do update set
    fixture_generation=excluded.fixture_generation,registration_generation=excluded.registration_generation,
    member_id=excluded.member_id,enabled=excluded.enabled,
    enabled_at=case when current_pin.enabled and excluded.enabled
      and current_pin.fixture_generation=excluded.fixture_generation
      and current_pin.registration_generation=excluded.registration_generation
      and current_pin.member_id=excluded.member_id then current_pin.enabled_at else excluded.enabled_at end;
  -- Deliberately do not enqueue. Enabling requires a subsequent explicit Send.
  return jsonb_build_object('ok',true,'review_mode','nonbinding_draw_v1','review_push_enabled',p_enabled);
end; $$;

create function public.weddingwin_review_notification_eligible(
  p_event_id uuid,p_device_id uuid,p_registration_generation bigint
) returns boolean language sql volatile security invoker set search_path='' as $$
  select exists(
    select 1 from public.app_notification_events e
    join public.review_draw_notices n on n.id=e.review_notice_id
    join public.review_draw_fixtures f on f.id=n.fixture_id
    join public.app_push_tokens t on t.id=p_device_id and t.bd_member_id=e.recipient_member_id
    join public.bd_users_cache u on u.user_id=t.bd_member_id and u.token=t.bd_member_token
    join public.review_draw_push_devices p on p.fixture_id=f.id and p.device_id=t.id
    where e.id=p_event_id and e.draw_id is null and e.thread_token is null and e.sender_member_id is null
      and e.type=case when n.channel='couple' then 'review_draw_result' else 'review_vendor_follow_up' end
      and e.recipient_member_id=n.recipient_member_id and e.occurred_at=n.created_at
      and not e.baseline_suppressed and e.expires_at>clock_timestamp()
      and e.expires_at<=least(f.expires_at,n.created_at+interval '24 hours')
      and f.active and f.expires_at>clock_timestamp()
      and t.enabled and t.push_registration_generation=p_registration_generation
      and p.enabled and p.member_id=n.recipient_member_id
      and p.fixture_generation=n.generation and p.registration_generation=p_registration_generation
      and p.enabled_at<n.created_at and t.registration_eligible_at<=n.created_at
      and public.read_weddingwin_review_draw_notice(t.bd_member_id,n.id) is not null
  );
$$;

create or replace function public.enqueue_weddingwin_notification_event(p_event_id uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 insert into public.app_notification_deliveries(event_id,device_id,registration_generation)
 select e.id,t.id,t.push_registration_generation from public.app_notification_events e join public.app_push_tokens t on t.bd_member_id=e.recipient_member_id
 where e.id=p_event_id and not e.baseline_suppressed and e.expires_at>clock_timestamp() and t.enabled
  and e.occurred_at>=t.registration_eligible_at
  and (e.review_notice_id is null or public.weddingwin_review_notification_eligible(e.id,t.id,t.push_registration_generation))
 on conflict do nothing;
 get diagnostics affected=row_count; return affected;
end $$;

create function public.capture_weddingwin_review_draw_notification() returns trigger language plpgsql security invoker set search_path='' as $$
declare event_id uuid; expiry timestamptz;
begin
  -- The notice insert guard already holds fixture then state locks and requires
  -- the verified generation plus the explicit review Send action.
  if public.read_weddingwin_review_draw_notice(new.recipient_member_id,new.id) is null then return new; end if;
  select least(f.expires_at,new.created_at+interval '24 hours') into expiry from public.review_draw_fixtures f where f.id=new.fixture_id;
  if expiry<=clock_timestamp() or expiry<=new.created_at then return new; end if;
  insert into public.app_notification_events(event_key,type,recipient_member_id,review_notice_id,occurred_at,expires_at)
  values('review-draw:'||new.id,case when new.channel='couple' then 'review_draw_result' else 'review_vendor_follow_up' end,
    new.recipient_member_id,new.id,new.created_at,expiry)
  on conflict(event_key) do nothing returning id into event_id;
  if event_id is not null then perform public.enqueue_weddingwin_notification_event(event_id); end if;
  return new;
end; $$;
create trigger capture_weddingwin_review_draw_notification after insert on public.review_draw_notices
  for each row execute function public.capture_weddingwin_review_draw_notification();

create or replace function public.claim_weddingwin_notification_deliveries(p_device_id uuid,p_registration_generation bigint,p_claim_token uuid,p_limit integer default 20)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.app_push_tokens; result jsonb;
begin
 select * into t from public.app_push_tokens where id=p_device_id for no key update;
 if not found or not t.enabled or t.push_registration_generation<>p_registration_generation or t.push_claim_token is distinct from p_claim_token or t.push_claim_expires_at<=clock_timestamp() or t.push_claim_expires_at is null then return '[]'::jsonb; end if;
 update public.app_notification_deliveries q set status='canceled',last_error_code='no_longer_eligible',updated_at=clock_timestamp()
 from public.app_notification_events e where q.event_id=e.id and q.device_id=t.id and q.status in ('pending','claimed','retry') and
 (q.registration_generation<>t.push_registration_generation or e.recipient_member_id<>t.bd_member_id or e.expires_at<=clock_timestamp() or e.occurred_at<t.registration_eligible_at or e.baseline_suppressed or (e.draw_id is not null and public.read_weddingwin_draw_result(e.recipient_member_id,e.draw_id) is null)
   or (e.review_notice_id is not null and not public.weddingwin_review_notification_eligible(e.id,t.id,t.push_registration_generation)));
 with candidates as (
  select q.id from public.app_notification_deliveries q join public.app_notification_events e on e.id=q.event_id
  where q.device_id=t.id and q.registration_generation=t.push_registration_generation and e.recipient_member_id=t.bd_member_id
  and q.status in ('pending','claimed','retry','ticketed') and (q.next_attempt_at is null or q.next_attempt_at<=clock_timestamp())
  and (q.claim_token is null or q.claim_expires_at<=clock_timestamp())
  order by q.created_at,q.id for update of q skip locked limit least(greatest(coalesce(p_limit,20),1),100)
 ), claimed as (
  update public.app_notification_deliveries q set status=case when q.status='ticketed' then 'ticketed' else 'claimed' end,claim_token=p_claim_token,claim_expires_at=t.push_claim_expires_at,updated_at=clock_timestamp()
  from candidates c where q.id=c.id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'event_id',e.id,'event_key',e.event_key,'type',e.type,'recipient_member_id',e.recipient_member_id,'sender_member_id',e.sender_member_id,'thread_token',e.thread_token,'draw_id',e.draw_id,'review_notice_id',e.review_notice_id,'occurred_at',e.occurred_at,'expires_at',e.expires_at,'status',q.status,'attempt_count',q.attempt_count,'next_attempt_at',q.next_attempt_at,'expo_ticket_id',q.expo_ticket_id,'ticket_at',q.ticket_at,'receipt_expires_at',q.receipt_expires_at)),'[]'::jsonb) into result from claimed q join public.app_notification_events e on e.id=q.event_id;
 return result;
end $$;

create or replace function public.begin_weddingwin_notification_delivery(p_delivery_id uuid,p_claim_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.app_notification_deliveries; t public.app_push_tokens; e public.app_notification_events; review_fixture_id uuid;
begin
 select * into q from public.app_notification_deliveries where id=p_delivery_id;
 if not found then return false; end if;
 select * into t from public.app_push_tokens where id=q.device_id for no key update;
 select * into q from public.app_notification_deliveries where id=p_delivery_id for update;
 select * into e from public.app_notification_events where id=q.event_id;
 if q.status<>'claimed' or q.claim_token is distinct from p_claim_token or q.claim_expires_at<=clock_timestamp() or q.claim_expires_at is null or t.push_claim_token is distinct from p_claim_token or t.push_claim_expires_at<=clock_timestamp() or t.push_claim_expires_at is null or not t.enabled or q.registration_generation<>t.push_registration_generation or q.attempt_count>=16 then return false; end if;
 -- Keep the production draw guard unchanged. Review reset/revocation uses the
 -- separate fixture -> state lock order; no production row is locked for review.
 if e.draw_id is not null then perform 1 from public.qr_bingo_raffle_draws where id=e.draw_id for share; end if;
 if e.review_notice_id is not null then
  select fixture_id into review_fixture_id from public.review_draw_notices where id=e.review_notice_id;
  perform 1 from public.review_draw_fixtures where id=review_fixture_id for share;
  perform 1 from public.review_draw_state where fixture_id=review_fixture_id for share;
 end if;
 if e.expires_at<=clock_timestamp() or e.baseline_suppressed or e.recipient_member_id<>t.bd_member_id or e.occurred_at<t.registration_eligible_at or (e.draw_id is not null and public.read_weddingwin_draw_result(e.recipient_member_id,e.draw_id) is null)
   or (e.review_notice_id is not null and not public.weddingwin_review_notification_eligible(e.id,t.id,t.push_registration_generation)) then
  update public.app_notification_deliveries set status='canceled',last_error_code='no_longer_eligible',claim_token=null,claim_expires_at=null,updated_at=clock_timestamp() where id=q.id; return false;
 end if;
 update public.app_notification_deliveries set status='ambiguous',attempt_count=attempt_count+1,updated_at=clock_timestamp() where id=q.id;
 return true;
end $$;

revoke all on function public.set_weddingwin_review_draw_push(text,bigint,text,boolean),public.weddingwin_review_notification_eligible(uuid,uuid,bigint),public.capture_weddingwin_review_draw_notification(),public.enqueue_weddingwin_notification_event(uuid),public.claim_weddingwin_notification_deliveries(uuid,bigint,uuid,integer),public.begin_weddingwin_notification_delivery(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_weddingwin_review_draw_push(text,bigint,text,boolean),public.weddingwin_review_notification_eligible(uuid,uuid,bigint),public.enqueue_weddingwin_notification_event(uuid),public.claim_weddingwin_notification_deliveries(uuid,bigint,uuid,integer),public.begin_weddingwin_notification_delivery(uuid,uuid) to service_role;
