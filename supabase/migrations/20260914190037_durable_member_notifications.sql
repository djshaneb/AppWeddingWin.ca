-- Service-owned notification metadata. No message text, contact details or push
-- tokens are copied into event history. Existing email finalizers are unchanged.
alter table public.app_push_tokens add column registration_eligible_at timestamptz not null default clock_timestamp();

create table public.app_notification_member_baselines (
 member_id text primary key references public.bd_users_cache(user_id) on delete cascade,
 snapshot_started_at timestamptz not null,
 completed_at timestamptz not null default clock_timestamp()
);
create table public.app_notification_events (
 id uuid primary key default gen_random_uuid(), event_key text not null unique check(length(event_key) between 1 and 250),
 type text not null check(type in ('chat_message','draw_result','vendor_draw_follow_up')),
 recipient_member_id text not null references public.bd_users_cache(user_id) on delete cascade,
 sender_member_id text references public.bd_users_cache(user_id) on delete cascade,
 thread_token text, draw_id uuid references public.qr_bingo_raffle_draws(id) on delete cascade,
 occurred_at timestamptz not null, created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, baseline_suppressed boolean not null default false,
 check ((type='chat_message' and thread_token is not null and draw_id is null)
   or (type<>'chat_message' and draw_id is not null and thread_token is null)),
 check(expires_at>occurred_at)
);
create index app_notification_events_recipient_idx on public.app_notification_events(recipient_member_id);
create index app_notification_events_sender_idx on public.app_notification_events(sender_member_id);
create index app_notification_events_draw_idx on public.app_notification_events(draw_id);
create index app_notification_events_retention_idx on public.app_notification_events(created_at);
create table public.app_notification_event_aliases (
 member_id text not null references public.bd_users_cache(user_id) on delete cascade,
 alias text not null check(length(alias) between 1 and 250),
 event_id uuid not null references public.app_notification_events(id) on delete cascade,
 primary key(member_id,alias)
);
create index app_notification_event_aliases_event_idx on public.app_notification_event_aliases(event_id);
create table public.app_notification_deliveries (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.app_notification_events(id) on delete cascade,
 device_id uuid not null references public.app_push_tokens(id) on delete cascade,
 registration_generation bigint not null check(registration_generation>=0),
 status text not null default 'pending' check(status in ('pending','claimed','ticketed','delivered','retry','failed','ambiguous','canceled')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 16),
 next_attempt_at timestamptz, claim_token uuid, claim_expires_at timestamptz, last_finalized_claim_token uuid,
 expo_ticket_id text, ticket_at timestamptz, receipt_expires_at timestamptz,
 last_error_code text check(length(last_error_code)<=100),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(event_id,device_id,registration_generation)
);
create index app_notification_deliveries_device_due_idx on public.app_notification_deliveries(device_id,registration_generation,next_attempt_at);
create index app_notification_deliveries_event_idx on public.app_notification_deliveries(event_id);

-- Explicitly defeat project default grants; all clients must use authenticated
-- Edge functions. The existing account purge deletes cache identities/tokens,
-- which cascades all notification identifiers and delivery metadata here.
alter table public.app_notification_member_baselines enable row level security;
alter table public.app_notification_events enable row level security;
alter table public.app_notification_event_aliases enable row level security;
alter table public.app_notification_deliveries enable row level security;
revoke all on public.app_notification_member_baselines,public.app_notification_events,public.app_notification_event_aliases,public.app_notification_deliveries from public,anon,authenticated,service_role;
grant select,insert,delete on public.app_notification_member_baselines to service_role;
grant select,insert,update,delete on public.app_notification_events,public.app_notification_event_aliases,public.app_notification_deliveries to service_role;

create function public.track_weddingwin_notification_registration() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.registration_eligible_at:=clock_timestamp();
 elsif new.enabled is distinct from old.enabled or new.bd_member_id is distinct from old.bd_member_id or new.expo_push_token is distinct from old.expo_push_token then
  new.registration_eligible_at:=clock_timestamp();
 end if;
 return new;
end $$;
create trigger zz_track_weddingwin_notification_registration before insert or update on public.app_push_tokens for each row execute function public.track_weddingwin_notification_registration();

create function public.register_weddingwin_push_token(p_member_id text,p_member_token text,p_expo_push_token text,p_platform text,p_previous_expo_push_token text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare device public.app_push_tokens; key text;
begin
 if p_member_id !~ '^[1-9][0-9]{0,17}$' or coalesce(p_member_token,'')='' or p_expo_push_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' or length(p_expo_push_token)>500 or coalesce(p_platform,'') not in ('ios','android','web','') then raise exception 'Invalid push registration' using errcode='22023'; end if;
 if not exists(select 1 from public.bd_users_cache where user_id=p_member_id and token=p_member_token) then raise exception 'Native session expired' using errcode='28000'; end if;
 -- Stable order also serializes concurrent opposite token replacements.
 for key in select distinct value from unnest(array[p_expo_push_token,nullif(p_previous_expo_push_token,'')]) value where value is not null order by value loop
  perform pg_advisory_xact_lock(hashtextextended('ww_push_register:'||key,0));
 end loop;
 insert into public.app_push_tokens(bd_member_id,bd_member_token,expo_push_token,platform,enabled,updated_at)
 values(p_member_id,p_member_token,p_expo_push_token,coalesce(p_platform,''),true,clock_timestamp())
 on conflict(expo_push_token) do update set bd_member_id=excluded.bd_member_id,bd_member_token=excluded.bd_member_token,platform=excluded.platform,enabled=true,updated_at=excluded.updated_at returning * into device;
 if nullif(p_previous_expo_push_token,'') is not null and p_previous_expo_push_token<>p_expo_push_token then
  update public.app_push_tokens set enabled=false,bd_member_token='',updated_at=clock_timestamp()
   where expo_push_token=p_previous_expo_push_token and bd_member_id=p_member_id and bd_member_token=p_member_token;
 end if;
 return jsonb_build_object('ok',true,'device_id',device.id,'registration_generation',device.push_registration_generation);
end $$;

create function public.enqueue_weddingwin_notification_event(p_event_id uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 insert into public.app_notification_deliveries(event_id,device_id,registration_generation)
 select e.id,t.id,t.push_registration_generation from public.app_notification_events e join public.app_push_tokens t on t.bd_member_id=e.recipient_member_id
 where e.id=p_event_id and not e.baseline_suppressed and e.expires_at>clock_timestamp() and t.enabled
  and e.occurred_at>=t.registration_eligible_at
 on conflict do nothing;
 get diagnostics affected=row_count; return affected;
end $$;

create function public.record_weddingwin_notification_snapshot(p_member_id text,p_events jsonb,p_snapshot_complete boolean,p_snapshot_started_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare baseline public.app_notification_member_baselines; item jsonb; ev public.app_notification_events;
 ids uuid[]; aliases text[]; alias_key text; seen uuid; fresh boolean; occurred timestamptz; first_snapshot boolean;
 event_count integer:=0; delivery_count integer:=0;
begin
 if p_member_id !~ '^[1-9][0-9]{0,17}$' or p_snapshot_complete is not true or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>25000
  or p_snapshot_started_at is null or p_snapshot_started_at>clock_timestamp()+interval '5 seconds' or p_snapshot_started_at<clock_timestamp()-interval '30 minutes' then raise exception 'A complete bounded notification snapshot is required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ww_notification_member:'||p_member_id,0));
 select * into baseline from public.app_notification_member_baselines where member_id=p_member_id;
 first_snapshot:=not found;
 if first_snapshot then insert into public.app_notification_member_baselines(member_id,snapshot_started_at) values(p_member_id,p_snapshot_started_at) returning * into baseline; end if;
 for item in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'event_key','') not like 'chat:'||p_member_id||':%'
   or (item->>'sender_member_id' is not null and item->>'sender_member_id' !~ '^[1-9][0-9]{0,17}$') or item->>'sender_member_id'=p_member_id
   or length(coalesce(item->>'thread_token','')) not between 1 and 200 or jsonb_typeof(item->'eligible') is distinct from 'boolean'
   or jsonb_typeof(coalesce(item->'aliases','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(item->'aliases','[]'::jsonb))>8
   or jsonb_typeof(item->'thread_aliases') is distinct from 'array' or jsonb_array_length(item->'thread_aliases') not between 1 and 8 or not (item->'thread_aliases' ? (item->>'thread_token')) then raise exception 'Invalid notification identity' using errcode='22023'; end if;
  occurred:=(item->>'occurred_at')::timestamptz;
  if occurred is null or occurred>clock_timestamp()+interval '5 minutes' then raise exception 'Invalid notification timestamp' using errcode='22023'; end if;
  select array_agg(distinct value) into aliases from (select item->>'event_key' value union all select jsonb_array_elements_text(coalesce(item->'aliases','[]'::jsonb))) x;
  foreach alias_key in array aliases loop
   if alias_key not like 'chat:'||p_member_id||':%' or length(alias_key)>250 then raise exception 'Invalid notification alias' using errcode='22023'; end if;
  end loop;
  select array_agg(distinct event_id) into ids from public.app_notification_event_aliases where member_id=p_member_id and alias=any(aliases);
  if ids is not null then
   if exists(select 1 from public.app_notification_events where id=any(ids) and (recipient_member_id<>p_member_id or (sender_member_id is not null and item->>'sender_member_id' is not null and sender_member_id<>item->>'sender_member_id') or not (item->'thread_aliases' ? thread_token))) then raise exception 'Notification alias identity conflict' using errcode='22023'; end if;
   select * into ev from public.app_notification_events where id=any(ids) order by created_at,id limit 1;
   -- A late verified mirror can link identities first seen independently. Keep
   -- all prior audit, but cancel unsent duplicate work and unify future aliases.
   update public.app_notification_deliveries set status='canceled',last_error_code='merged_identity',updated_at=clock_timestamp() where event_id=any(ids) and event_id<>ev.id and status in ('pending','claimed','retry');
   update public.app_notification_events set baseline_suppressed=true where id=any(ids) and id<>ev.id;
   update public.app_notification_event_aliases set event_id=ev.id where event_id=any(ids) and event_id<>ev.id;
   -- Aliases are supplied only after the service proves the BD/native mirror.
   -- A canonical native thread may replace the earlier BD thread identity.
   update public.app_notification_events set thread_token=item->>'thread_token',sender_member_id=coalesce(sender_member_id,item->>'sender_member_id') where id=ev.id;
   fresh:=false;
  else
   -- Unknown opposite-side BD senders remain null after service validation;
   -- retain their seen identity without manufacturing a cached account.
   insert into public.app_notification_events(event_key,type,recipient_member_id,sender_member_id,thread_token,occurred_at,expires_at,baseline_suppressed)
    values(item->>'event_key','chat_message',p_member_id,item->>'sender_member_id',item->>'thread_token',occurred,occurred+interval '24 hours',first_snapshot or not (item->>'eligible')::boolean or occurred<baseline.snapshot_started_at)
    returning * into ev;
   fresh:=true; event_count:=event_count+1;
  end if;
  foreach alias_key in array aliases loop insert into public.app_notification_event_aliases(member_id,alias,event_id) values(p_member_id,alias_key,ev.id) on conflict do nothing; end loop;
  if fresh then delivery_count:=delivery_count+public.enqueue_weddingwin_notification_event(ev.id); end if;
 end loop;
 return jsonb_build_object('ok',true,'baseline_created',first_snapshot,'events_created',event_count,'deliveries_created',delivery_count);
end $$;

-- A result remains private and readable after the entry/show window closes.
-- Generation/card resets invalidate it; a new entry cannot resurrect old wins.
create function public.read_weddingwin_draw_result(p_member_id text,p_draw_id uuid) returns jsonb language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('draw_id',d.id,'event_key',d.event_key,'viewer_role',case when d.couple_bd_user_id=p_member_id then 'couple' else 'vendor' end,
 'vendor_id',d.vendor_bd_user_id,'vendor_name',d.vendor_name,
 'prize_title',coalesce(m.prize_snapshot->>'prize_title',d.prize_title),
 'prize_description',coalesce(m.prize_snapshot->>'prize_description',d.prize_description),
 'prize_approx_value_cad',coalesce(m.prize_snapshot->'prize_approx_value_cad',to_jsonb(d.prize_approx_value_cad)),
 'claim_instructions',d.claim_instructions,'official_rules_url',d.official_rules_url,'drawn_at',d.drawn_at,'notice_sent_at',m.sent_at,
 'apple_non_sponsor_disclaimer',d.apple_non_sponsor_disclaimer)
 from public.qr_bingo_raffle_draws d
 join public.qr_bingo_raffle_settings s on s.event_key=d.event_key and s.vendor_bingo_id=d.vendor_bingo_id and s.vendor_bd_user_id=d.vendor_bd_user_id and s.draw_generation=d.draw_generation
 join public.qr_bingo_raffle_entries e on e.id=d.entry_id and e.couple_bd_user_id=d.couple_bd_user_id and e.event_key=d.event_key and e.vendor_bd_user_id=d.vendor_bd_user_id and e.card_generation=d.entry_card_generation and e.card_reset_at is null
 join public.qr_bingo_draw_email_deliveries m on m.draw_id=d.id and m.channel=case when d.couple_bd_user_id=p_member_id then 'couple' else 'vendor' end and m.status='sent' and m.sent_at is not null
 where d.id=p_draw_id and p_member_id in (d.couple_bd_user_id,d.vendor_bd_user_id) and d.selection_status='verified' and d.eligibility_verified_at is not null and d.verified_at is not null and public.qr_bingo_skill_verification_complete(d)
 and not public.qr_bingo_participation_is_test(d.event_key,d.couple_bd_user_id) and not public.qr_bingo_participation_is_test(d.event_key,d.vendor_bd_user_id);
$$;

create function public.capture_weddingwin_draw_notification() returns trigger language plpgsql security invoker set search_path='' as $$
declare d public.qr_bingo_raffle_draws; recipient text; event_id uuid;
begin
 if new.status<>'sent' or old.status='sent' or new.sent_at is null or new.channel not in ('couple','vendor') then return new; end if;
 select * into d from public.qr_bingo_raffle_draws where id=new.draw_id;
 recipient:=case when new.channel='couple' then d.couple_bd_user_id else d.vendor_bd_user_id end;
 if public.read_weddingwin_draw_result(recipient,d.id) is null or not exists(select 1 from public.bd_users_cache where user_id=recipient) then return new; end if;
 insert into public.app_notification_events(event_key,type,recipient_member_id,draw_id,occurred_at,expires_at)
 values('draw:'||d.id||':'||new.channel,case when new.channel='couple' then 'draw_result' else 'vendor_draw_follow_up' end,recipient,d.id,new.sent_at,new.sent_at+interval '7 days')
 on conflict(event_key) do nothing returning id into event_id;
 if event_id is not null then perform public.enqueue_weddingwin_notification_event(event_id); end if;
 return new;
end $$;
create trigger capture_weddingwin_draw_notification after update of status on public.qr_bingo_draw_email_deliveries for each row execute function public.capture_weddingwin_draw_notification();

create function public.claim_weddingwin_notification_deliveries(p_device_id uuid,p_registration_generation bigint,p_claim_token uuid,p_limit integer default 20)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.app_push_tokens; result jsonb;
begin
 select * into t from public.app_push_tokens where id=p_device_id for no key update;
 if not found or not t.enabled or t.push_registration_generation<>p_registration_generation or t.push_claim_token is distinct from p_claim_token or t.push_claim_expires_at<=clock_timestamp() or t.push_claim_expires_at is null then return '[]'::jsonb; end if;
 update public.app_notification_deliveries q set status='canceled',last_error_code='no_longer_eligible',updated_at=clock_timestamp()
 from public.app_notification_events e where q.event_id=e.id and q.device_id=t.id and q.status in ('pending','claimed','retry') and
 (q.registration_generation<>t.push_registration_generation or e.recipient_member_id<>t.bd_member_id or e.expires_at<=clock_timestamp() or e.occurred_at<t.registration_eligible_at or e.baseline_suppressed or (e.draw_id is not null and public.read_weddingwin_draw_result(e.recipient_member_id,e.draw_id) is null));
 with candidates as (
  select q.id from public.app_notification_deliveries q join public.app_notification_events e on e.id=q.event_id
  where q.device_id=t.id and q.registration_generation=t.push_registration_generation and e.recipient_member_id=t.bd_member_id
  and q.status in ('pending','claimed','retry','ticketed') and (q.next_attempt_at is null or q.next_attempt_at<=clock_timestamp())
  and (q.claim_token is null or q.claim_expires_at<=clock_timestamp())
  order by q.created_at,q.id for update of q skip locked limit least(greatest(coalesce(p_limit,20),1),100)
 ), claimed as (
  update public.app_notification_deliveries q set status=case when q.status='ticketed' then 'ticketed' else 'claimed' end,claim_token=p_claim_token,claim_expires_at=t.push_claim_expires_at,updated_at=clock_timestamp()
  from candidates c where q.id=c.id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'event_id',e.id,'event_key',e.event_key,'type',e.type,'recipient_member_id',e.recipient_member_id,'sender_member_id',e.sender_member_id,'thread_token',e.thread_token,'draw_id',e.draw_id,'occurred_at',e.occurred_at,'expires_at',e.expires_at,'status',q.status,'attempt_count',q.attempt_count,'next_attempt_at',q.next_attempt_at,'expo_ticket_id',q.expo_ticket_id,'ticket_at',q.ticket_at,'receipt_expires_at',q.receipt_expires_at)),'[]'::jsonb) into result from claimed q join public.app_notification_events e on e.id=q.event_id;
 return result;
end $$;

create function public.begin_weddingwin_notification_delivery(p_delivery_id uuid,p_claim_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.app_notification_deliveries; t public.app_push_tokens; e public.app_notification_events;
begin
 select * into q from public.app_notification_deliveries where id=p_delivery_id;
 if not found then return false; end if;
 select * into t from public.app_push_tokens where id=q.device_id for no key update;
 select * into q from public.app_notification_deliveries where id=p_delivery_id for update;
 select * into e from public.app_notification_events where id=q.event_id;
 if q.status<>'claimed' or q.claim_token is distinct from p_claim_token or q.claim_expires_at<=clock_timestamp() or q.claim_expires_at is null or t.push_claim_token is distinct from p_claim_token or t.push_claim_expires_at<=clock_timestamp() or t.push_claim_expires_at is null or not t.enabled or q.registration_generation<>t.push_registration_generation or q.attempt_count>=16 then return false; end if;
 -- Match existing draw-first lifecycle protection without taking a publication
 -- lock. NO KEY UPDATE on device permits email enqueue FK reads, avoiding a
 -- token/draw lock cycle with the unchanged finalizer.
 if e.draw_id is not null then perform 1 from public.qr_bingo_raffle_draws where id=e.draw_id for share; end if;
 if e.expires_at<=clock_timestamp() or e.baseline_suppressed or e.recipient_member_id<>t.bd_member_id or e.occurred_at<t.registration_eligible_at or (e.draw_id is not null and public.read_weddingwin_draw_result(e.recipient_member_id,e.draw_id) is null) then
  update public.app_notification_deliveries set status='canceled',last_error_code='no_longer_eligible',claim_token=null,claim_expires_at=null,updated_at=clock_timestamp() where id=q.id; return false;
 end if;
 update public.app_notification_deliveries set status='ambiguous',attempt_count=attempt_count+1,updated_at=clock_timestamp() where id=q.id;
 return true;
end $$;

create function public.finalize_weddingwin_notification_delivery(p_delivery_id uuid,p_claim_token uuid,p_status text,p_expo_ticket_id text default null,p_error_code text default null,p_next_attempt_at timestamptz default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.app_notification_deliveries; t public.app_push_tokens;
begin
 if p_status not in ('ticketed','delivered','retry','failed','ambiguous','canceled') or length(coalesce(p_error_code,''))>100 or length(coalesce(p_expo_ticket_id,''))>200 then raise exception 'Invalid notification outcome' using errcode='22023'; end if;
 select * into q from public.app_notification_deliveries where id=p_delivery_id;
 if not found then return false; end if;
 select * into t from public.app_push_tokens where id=q.device_id for no key update;
 select * into q from public.app_notification_deliveries where id=p_delivery_id for update;
 if q.last_finalized_claim_token=p_claim_token and q.status=p_status and (p_expo_ticket_id is null or p_expo_ticket_id=q.expo_ticket_id) then return true; end if;
 if q.claim_token is distinct from p_claim_token or q.claim_expires_at<=clock_timestamp() or q.claim_expires_at is null or t.push_claim_token is distinct from p_claim_token or t.push_claim_expires_at<=clock_timestamp() or t.push_claim_expires_at is null or not t.enabled or q.registration_generation<>t.push_registration_generation then return false; end if;
 if not ((q.status='ambiguous' and p_status in ('ticketed','retry','failed','ambiguous')) or (q.status='ticketed' and p_status in ('ticketed','delivered','failed','ambiguous','retry')) or (q.status='claimed' and p_status in ('canceled','failed'))) then return false; end if;
 if p_status='ticketed' and q.status<>'ticketed' and nullif(p_expo_ticket_id,'') is null then raise exception 'Accepted ticket required' using errcode='22023'; end if;
 if p_status='retry' and (p_next_attempt_at is null or p_next_attempt_at<=clock_timestamp() or q.attempt_count>=16) then return false; end if;
 update public.app_notification_deliveries set status=p_status,
  expo_ticket_id=case when p_status='retry' then null when p_status='ticketed' then coalesce(q.expo_ticket_id,p_expo_ticket_id) else q.expo_ticket_id end,
  ticket_at=case when p_status='retry' then null when p_status='ticketed' then coalesce(q.ticket_at,clock_timestamp()) else q.ticket_at end,
  receipt_expires_at=case when p_status='retry' then null when p_status='ticketed' then coalesce(q.receipt_expires_at,clock_timestamp()+interval '24 hours') else q.receipt_expires_at end,
  next_attempt_at=case when p_status='ticketed' then coalesce(p_next_attempt_at,clock_timestamp()+interval '15 minutes') when p_status='retry' then p_next_attempt_at else null end,
  last_error_code=nullif(p_error_code,''),last_finalized_claim_token=p_claim_token,claim_token=null,claim_expires_at=null,updated_at=clock_timestamp() where id=q.id;
 return true;
end $$;

create function public.purge_expired_weddingwin_notifications() returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 delete from public.app_notification_events where created_at<clock_timestamp()-interval '30 days';
 get diagnostics affected=row_count; return affected;
end $$;

revoke all on function public.track_weddingwin_notification_registration(),public.register_weddingwin_push_token(text,text,text,text,text),public.enqueue_weddingwin_notification_event(uuid),public.record_weddingwin_notification_snapshot(text,jsonb,boolean,timestamptz),public.read_weddingwin_draw_result(text,uuid),public.capture_weddingwin_draw_notification(),public.claim_weddingwin_notification_deliveries(uuid,bigint,uuid,integer),public.begin_weddingwin_notification_delivery(uuid,uuid),public.finalize_weddingwin_notification_delivery(uuid,uuid,text,text,text,timestamptz),public.purge_expired_weddingwin_notifications() from public,anon,authenticated,service_role;
grant execute on function public.register_weddingwin_push_token(text,text,text,text,text),public.enqueue_weddingwin_notification_event(uuid),public.record_weddingwin_notification_snapshot(text,jsonb,boolean,timestamptz),public.read_weddingwin_draw_result(text,uuid),public.claim_weddingwin_notification_deliveries(uuid,bigint,uuid,integer),public.begin_weddingwin_notification_delivery(uuid,uuid),public.finalize_weddingwin_notification_delivery(uuid,uuid,text,text,text,timestamptz),public.purge_expired_weddingwin_notifications() to service_role;

-- Existing cron extension is already used by push sweep and privacy retention.
select cron.schedule('weddingwin-notification-retention','17 3 * * *','select public.purge_expired_weddingwin_notifications()');

-- Release untouched leases without falsely marking those devices as swept.
create function public.release_weddingwin_notification_claim(p_claim_token uuid,p_checked_ids uuid[]) returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if p_claim_token is null or coalesce(array_length(p_checked_ids,1),0)>500 then raise exception 'Invalid notification lease release' using errcode='22023'; end if;
 update public.app_push_tokens set push_claim_token=null,push_claim_expires_at=null,
  last_push_checked_at=case when id=any(coalesce(p_checked_ids,array[]::uuid[])) then clock_timestamp() else last_push_checked_at end
 where push_claim_token=p_claim_token;
 get diagnostics affected=row_count;
 update public.app_notification_deliveries set claim_token=null,claim_expires_at=null,
  status=case when status='claimed' then 'pending' else status end,updated_at=clock_timestamp()
 where claim_token=p_claim_token;
 return affected;
end $$;
revoke all on function public.release_weddingwin_notification_claim(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.release_weddingwin_notification_claim(uuid,uuid[]) to service_role;
