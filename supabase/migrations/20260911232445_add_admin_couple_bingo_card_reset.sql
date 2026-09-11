-- Refuse to overwrite unreviewed changes to live lifecycle functions.
do $baseline$
declare actual text;
begin
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='select_qr_bingo_potential_winner';
 if actual is distinct from '6901da24da98f6cb192463408a165834' then raise exception 'Unexpected card-reset baseline for select_qr_bingo_potential_winner; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='require_current_qr_bingo_draw_generation';
 if actual is distinct from '29dffbf552aef5acb6dae6c1c4ce5f23' then raise exception 'Unexpected card-reset baseline for require_current_qr_bingo_draw_generation; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_qr_bingo_admin_data';
 if actual is distinct from '55c42d8de875b6685ff96112423d2661' then raise exception 'Unexpected card-reset baseline for read_qr_bingo_admin_data; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_qr_bingo_admin_contacts';
 if actual is distinct from '641d3bba70fac1d3c7cac277fe596892' then raise exception 'Unexpected card-reset baseline for read_qr_bingo_admin_contacts; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='claim_qr_bingo_test_draw_email_delivery';
 if actual is distinct from '506511286f2a9441ba9288b0a902454c' then raise exception 'Unexpected card-reset baseline for claim_qr_bingo_test_draw_email_delivery; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='enforce_qr_bingo_current_rules';
 if actual is distinct from 'f100b7f3505d34255ace1aee5545ae11' then raise exception 'Unexpected card-reset baseline for enforce_qr_bingo_current_rules; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='enforce_qr_bingo_entry_offer_version';
 if actual is distinct from '44b8394630573e1f4997f1fbddf74962' then raise exception 'Unexpected card-reset baseline for enforce_qr_bingo_entry_offer_version; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='enforce_qr_bingo_responsibility_audit';
 if actual is distinct from '69834bbc546ae2df1fd9ad1f9d9295f7' then raise exception 'Unexpected card-reset baseline for enforce_qr_bingo_responsibility_audit; review before applying.'; end if;
 select md5(pg_catalog.pg_get_functiondef(p.oid)) into actual from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='prepare_qr_bingo_named_vendor_contact_share';
 if actual is distinct from '0f33f451c34ca04618e7b55882274b65' then raise exception 'Unexpected card-reset baseline for prepare_qr_bingo_named_vendor_contact_share; review before applying.'; end if;
end;
$baseline$;

-- Per-event card reset is a watermark, not deletion of website visits, accounts,
-- immutable offer/consent snapshots, selected winners or email delivery records.
create table public.qr_bingo_card_states (
 event_key text not null check(event_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(event_key)<=100),
 couple_bd_user_id text not null check(couple_bd_user_id ~ '^[1-9][0-9]{0,17}$'),
 generation bigint not null check(generation between 1 and 9007199254740991),
 scan_reset_after timestamptz not null,
 primary key(event_key,couple_bd_user_id)
);
create table public.qr_bingo_card_reset_audit (
 request_id uuid primary key,event_key text not null,couple_bd_user_id text not null,
 from_generation bigint not null,to_generation bigint not null,scan_reset_after timestamptz not null,
 operator_identity text not null,reason text not null,request_fingerprint text not null,
 entry_count integer not null,entry_ids uuid[] not null,created_at timestamptz not null default clock_timestamp(),
 check(to_generation=from_generation+1 and from_generation>=0 and to_generation<=9007199254740991),
 check(length(operator_identity) between 3 and 160 and operator_identity !~ '[<>[:cntrl:]]'),
 check(length(reason) between 3 and 500 and reason !~ '[<>[:cntrl:]]'),
 unique(event_key,couple_bd_user_id,to_generation)
);
alter table public.qr_bingo_card_states enable row level security;
alter table public.qr_bingo_card_reset_audit enable row level security;
revoke all on public.qr_bingo_card_states,public.qr_bingo_card_reset_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.qr_bingo_card_states to service_role;
grant select,insert on public.qr_bingo_card_reset_audit to service_role;
alter table public.qr_bingo_raffle_entries add column card_generation bigint not null default 0 check(card_generation between 0 and 9007199254740991),add column card_reset_at timestamptz;
alter table public.qr_bingo_raffle_draws add column entry_card_generation bigint not null default 0 check(entry_card_generation between 0 and 9007199254740991);
alter table public.app_review_raffle_fixture_scans add column card_generation bigint not null default 0;
alter table public.qr_bingo_email_test_fixture_scans add column card_generation bigint not null default 0;
create index qr_bingo_current_card_entries on public.qr_bingo_raffle_entries(event_key,couple_bd_user_id) where card_reset_at is null;

create function public.read_qr_bingo_card_state(p_event_key text,p_couple_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare state public.qr_bingo_card_states%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service-role authorization required.'; end if;
 if p_event_key is null or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_event_key)>100 or p_couple_id is null or p_couple_id !~ '^[1-9][0-9]{0,17}$' then raise exception using errcode='22023',message='Exact event and couple required.'; end if;
 select * into state from public.qr_bingo_card_states where event_key=p_event_key and couple_bd_user_id=p_couple_id;
 return jsonb_build_object('event_key',p_event_key,'couple_id',p_couple_id,'generation',coalesce(state.generation,0),'scan_reset_after',state.scan_reset_after);
end;$$;

create function public.qr_bingo_card_reset_snapshot(p_event_key text,p_couple_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare state jsonb; entries jsonb; draws jsonb; deliveries jsonb; blocked text; entry_count integer;
begin
 state:=public.read_qr_bingo_card_state(p_event_key,p_couple_id);
 select count(*) filter(where card_reset_at is null),coalesce(jsonb_agg(jsonb_build_array(id,card_generation,card_reset_at,consented_at,vendor_offer_version,entrant_identity_hash) order by id),'[]'::jsonb)
 into entry_count,entries from public.qr_bingo_raffle_entries where event_key=p_event_key and couple_bd_user_id=p_couple_id;
 select coalesce(jsonb_agg(jsonb_build_array(id,selection_status,draw_generation,entry_card_generation,vendor_email_sent_at,couple_email_sent_at) order by id),'[]'::jsonb)
 into draws from public.qr_bingo_raffle_draws where event_key=p_event_key and couple_bd_user_id=p_couple_id;
 select coalesce(jsonb_agg(jsonb_build_array(delivery.id,delivery.status,delivery.updated_at) order by delivery.id),'[]'::jsonb)
 into deliveries from public.qr_bingo_draw_email_deliveries delivery join public.qr_bingo_raffle_draws draw on draw.id=delivery.draw_id
 where draw.event_key=p_event_key and draw.couple_bd_user_id=p_couple_id;
 if not exists(select 1 from public.qr_bingo_event_configs where published and event_key=p_event_key)
  and not exists(select 1 from public.app_review_raffle_fixtures f where f.event_key=p_event_key and f.enabled and f.expires_at>clock_timestamp() and (f.couple_bd_user_id=p_couple_id or exists(select 1 from public.app_review_raffle_fixture_participants p where p.fixture_id=f.id and p.couple_bd_user_id=p_couple_id)))
  and not exists(select 1 from public.qr_bingo_email_test_fixtures f where f.event_key=p_event_key and f.enabled and f.expires_at>clock_timestamp() and f.couple_bd_user_id=p_couple_id)
 then blocked:='event_unavailable';
 elsif exists(select 1 from public.qr_bingo_draw_email_deliveries delivery join public.qr_bingo_raffle_draws draw on draw.id=delivery.draw_id where draw.event_key=p_event_key and draw.couple_bd_user_id=p_couple_id and delivery.status='ambiguous') then blocked:='draw_delivery_uncertain';
 elsif exists(select 1 from public.qr_bingo_draw_email_deliveries delivery join public.qr_bingo_raffle_draws draw on draw.id=delivery.draw_id where draw.event_key=p_event_key and draw.couple_bd_user_id=p_couple_id and delivery.status in ('pending','claimed')) then blocked:='draw_delivery_in_progress'; end if;
 return jsonb_build_object('ok',true,'action','card_reset_preview','dataset','scans','event_key',p_event_key,'couple_id',p_couple_id,
 'expected_generation',(state->>'generation')::bigint,'card_state',state,'entry_count',entry_count,'can_reset',blocked is null,'reset_block_reason',coalesce(blocked,''),
 'preview_token',encode(sha256(convert_to(jsonb_build_array(state,entries,draws,deliveries)::text,'UTF8')),'hex'));
end;$$;

create function public.admin_reset_qr_bingo_couple_card(p_event_key text,p_couple_id text,p_expected_generation bigint,p_preview_token text,p_request_id uuid,p_operator_identity text,p_reason text,p_scan_reset_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.qr_bingo_card_reset_audit%rowtype; fingerprint text; snapshot jsonb; vendor text; entry_ids uuid[]; previous_context text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service-role authorization required.'; end if;
 if p_event_key is null or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_event_key)>100 or p_couple_id is null or p_couple_id !~ '^[1-9][0-9]{0,17}$'
 or p_expected_generation is null or p_expected_generation<0 or p_expected_generation>=9007199254740991 or p_request_id is null
 or p_preview_token is null or p_preview_token !~ '^[a-f0-9]{64}$'
 or p_operator_identity is null or p_operator_identity<>btrim(p_operator_identity) or length(p_operator_identity) not between 3 and 160 or p_operator_identity ~ '[<>[:cntrl:]]'
 or p_reason is null or p_reason<>btrim(p_reason) or length(p_reason) not between 3 and 500 or p_reason ~ '[<>[:cntrl:]]' or p_scan_reset_at is null or date_trunc('second',p_scan_reset_at)<>p_scan_reset_at
 then raise exception using errcode='22023',message='Exact card, preview, operator, reason and request required.'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_event_key,p_couple_id,p_expected_generation,p_preview_token,p_operator_identity,p_reason,p_scan_reset_at)::text,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-card-reset-request:'||p_request_id::text,0));
 select * into prior from public.qr_bingo_card_reset_audit where request_id=p_request_id;
 if found then
  if prior.request_fingerprint<>fingerprint then return jsonb_build_object('ok',false,'code','card_reset_request_conflict'); end if;
  return jsonb_build_object('ok',true,'action','card_reset','dataset','scans','event_key',prior.event_key,'couple_id',prior.couple_bd_user_id,'request_id',prior.request_id,'from_generation',prior.from_generation,'to_generation',prior.to_generation,'scan_reset_after',prior.scan_reset_after,'entry_count',prior.entry_count,'replayed',true);
 end if;
 if p_scan_reset_at<clock_timestamp()-interval '5 minutes' or p_scan_reset_at>clock_timestamp()+interval '5 seconds' then return jsonb_build_object('ok',false,'code','card_reset_preview_expired'); end if;
 perform public.lock_active_qr_bingo_contact_member(p_couple_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact:'||p_event_key||':'||p_couple_id,0));
 -- Same global -> promotion -> rows order as settings, selection and draw reset.
 -- Website holds its account/event MySQL lock across this call. The first-attempt
 -- cutoff survives HTTP timeouts; a late SQL commit cannot erase later scans.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr_bingo_event_config_publish',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-card:'||p_event_key||':'||p_couple_id,0));
 for vendor in select vendor_bingo_id from public.qr_bingo_raffle_entries where event_key=p_event_key and couple_bd_user_id=p_couple_id union select vendor_bingo_id from public.qr_bingo_raffle_draws where event_key=p_event_key and couple_bd_user_id=p_couple_id order by 1 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_key||':'||vendor,0));
 end loop;
 perform 1 from public.qr_bingo_event_configs where published order by revision desc limit 1 for share;
 perform 1 from public.qr_bingo_raffle_draws where event_key=p_event_key and couple_bd_user_id=p_couple_id order by id for update;
 perform 1 from public.qr_bingo_draw_email_deliveries delivery join public.qr_bingo_raffle_draws draw on draw.id=delivery.draw_id where draw.event_key=p_event_key and draw.couple_bd_user_id=p_couple_id order by delivery.id for update of delivery;
 perform 1 from public.qr_bingo_raffle_entries where event_key=p_event_key and couple_bd_user_id=p_couple_id order by id for update;
 snapshot:=public.qr_bingo_card_reset_snapshot(p_event_key,p_couple_id);
 if (snapshot->>'expected_generation')::bigint<>p_expected_generation then return jsonb_build_object('ok',false,'code','stale_card_generation'); end if;
 if not (snapshot->>'can_reset')::boolean then return jsonb_build_object('ok',false,'code',snapshot->>'reset_block_reason'); end if;
 if snapshot->>'preview_token'<>p_preview_token then return jsonb_build_object('ok',false,'code','card_reset_preview_changed'); end if;
 -- Watermarks never move backward, including when website clocks differ.
 if p_scan_reset_at < nullif(snapshot->'card_state'->>'scan_reset_after','')::timestamptz then return jsonb_build_object('ok',false,'code','card_reset_preview_changed'); end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into entry_ids from public.qr_bingo_raffle_entries where event_key=p_event_key and couple_bd_user_id=p_couple_id and card_reset_at is null;
 insert into public.qr_bingo_card_reset_audit(request_id,event_key,couple_bd_user_id,from_generation,to_generation,scan_reset_after,operator_identity,reason,request_fingerprint,entry_count,entry_ids)
 values(p_request_id,p_event_key,p_couple_id,p_expected_generation,p_expected_generation+1,p_scan_reset_at,p_operator_identity,p_reason,fingerprint,cardinality(entry_ids),entry_ids);
 insert into public.qr_bingo_card_states(event_key,couple_bd_user_id,generation,scan_reset_after) values(p_event_key,p_couple_id,p_expected_generation+1,p_scan_reset_at)
 on conflict(event_key,couple_bd_user_id) do update set generation=excluded.generation,scan_reset_after=excluded.scan_reset_after;
 previous_context:=current_setting('request.qr_bingo_card_reset_id',true);
 perform set_config('request.qr_bingo_card_reset_id',p_request_id::text,true);
 update public.qr_bingo_raffle_entries set card_reset_at=p_scan_reset_at where id=any(entry_ids);
 perform set_config('request.qr_bingo_card_reset_id',coalesce(previous_context,''),true);
 return jsonb_build_object('ok',true,'action','card_reset','dataset','scans','event_key',p_event_key,'couple_id',p_couple_id,'request_id',p_request_id,'from_generation',p_expected_generation,'to_generation',p_expected_generation+1,'scan_reset_after',p_scan_reset_at,'entry_count',cardinality(entry_ids),'replayed',false);
end;$$;

create function public.qr_bingo_card_reset_metadata_only(old_entry public.qr_bingo_raffle_entries,new_entry public.qr_bingo_raffle_entries)
returns boolean language sql volatile security invoker set search_path='' as $$
 select old_entry.card_reset_at is null and new_entry.card_reset_at is not null
 and (to_jsonb(old_entry)-'card_reset_at')=(to_jsonb(new_entry)-'card_reset_at')
 and exists(select 1 from public.qr_bingo_card_reset_audit a where a.request_id::text=current_setting('request.qr_bingo_card_reset_id',true)
 and a.event_key=new_entry.event_key and a.couple_bd_user_id=new_entry.couple_bd_user_id and new_entry.id=any(a.entry_ids) and a.scan_reset_after=new_entry.card_reset_at);
$$;

create function public.enforce_qr_bingo_card_generation()
returns trigger language plpgsql security invoker set search_path='' as $$
declare generation bigint;
begin
 if tg_op='UPDATE' and public.qr_bingo_card_reset_metadata_only(old,new) then return new; end if;
 -- Contact maintenance on an inactive row cannot reactivate it or acquire proof.
 if tg_op='UPDATE' and new.card_reset_at is not distinct from old.card_reset_at and new.card_generation=old.card_generation
 and (to_jsonb(new)-array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash'])=(to_jsonb(old)-array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash']) then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr_bingo_event_config_publish',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-card:'||new.event_key||':'||new.couple_bd_user_id,0));
 generation:=(public.read_qr_bingo_card_state(new.event_key,new.couple_bd_user_id)->>'generation')::bigint;
 if new.card_generation<>generation or new.card_reset_at is not null then raise exception using errcode='55000',message='stale_card_generation: Refresh and scan the vendor again.'; end if;
 return new;
end;$$;
create trigger a00_qr_bingo_card_generation before insert or update on public.qr_bingo_raffle_entries for each row execute function public.enforce_qr_bingo_card_generation();

create function public.save_qr_bingo_card_entry(p_entry jsonb,p_entry_id uuid default null)
returns public.qr_bingo_raffle_entries language plpgsql security invoker set search_path='' as $$
declare event text:=p_entry->>'event_key'; couple text:=p_entry->>'couple_bd_user_id'; keys text; saved public.qr_bingo_raffle_entries;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service-role authorization required.'; end if;
 if jsonb_typeof(p_entry)<>'object' or p_entry ?| array['id','created_at','entrant_identity_hash'] or not(p_entry ? 'card_generation') then raise exception using errcode='22023',message='Invalid entry payload.'; end if;
 perform public.lock_active_qr_bingo_contact_member(couple);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact:'||event||':'||couple,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr_bingo_event_config_publish',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-card:'||event||':'||couple,0));
 if (p_entry->>'card_generation')::bigint<>(public.read_qr_bingo_card_state(event,couple)->>'generation')::bigint then raise exception using errcode='55000',message='stale_card_generation: Refresh and scan the vendor again.'; end if;
 if exists(select 1 from jsonb_object_keys(p_entry) key where not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.qr_bingo_raffle_entries'::regclass and a.attname=key and a.attnum>0 and not a.attisdropped)) then raise exception using errcode='22023',message='Unknown entry field.'; end if;
 select string_agg(format('%I',key),',' order by key) into keys from jsonb_object_keys(p_entry) key;
 if p_entry_id is null then
  execute format('insert into public.qr_bingo_raffle_entries(%s) select %s from jsonb_populate_record(null::public.qr_bingo_raffle_entries,$1) returning *',keys,keys) into saved using p_entry;
 else
  execute format('update public.qr_bingo_raffle_entries set (%s)=(select %s from jsonb_populate_record(null::public.qr_bingo_raffle_entries,$1)) where id=$2 and event_key=$3 and couple_bd_user_id=$4 and vendor_bingo_id=$5 returning *',keys,keys) into saved using p_entry,p_entry_id,event,couple,p_entry->>'vendor_bingo_id';
  if saved.id is null then raise exception using errcode='P0002',message='Entry not found.'; end if;
 end if;
 return saved;
end;$$;

create function public.save_qr_bingo_fixture_card_scan(p_event_key text,p_couple_id text,p_fixture_id uuid,p_vendor_id text,p_expected_generation bigint,p_email_test boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service-role authorization required.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr_bingo_event_config_publish',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-card:'||p_event_key||':'||p_couple_id,0));
 if p_expected_generation is null or p_expected_generation<>(public.read_qr_bingo_card_state(p_event_key,p_couple_id)->>'generation')::bigint then return jsonb_build_object('ok',false,'code','stale_card_generation'); end if;
 if p_email_test then
  if not exists(select 1 from public.qr_bingo_email_test_fixtures where id=p_fixture_id and event_key=p_event_key and couple_bd_user_id=p_couple_id and vendor_bingo_id=p_vendor_id and enabled and expires_at>clock_timestamp()) then raise exception using errcode='42501',message='Fixture unavailable.'; end if;
  insert into public.qr_bingo_email_test_fixture_scans(fixture_id,couple_bd_user_id,vendor_bingo_id,card_generation) values(p_fixture_id,p_couple_id,p_vendor_id,p_expected_generation) on conflict(fixture_id,couple_bd_user_id,vendor_bingo_id) do update set card_generation=excluded.card_generation;
 else
  if not exists(select 1 from public.app_review_raffle_fixtures f where id=p_fixture_id and event_key=p_event_key and vendor_bingo_id=p_vendor_id and enabled and expires_at>clock_timestamp() and (couple_bd_user_id=p_couple_id or exists(select 1 from public.app_review_raffle_fixture_participants p where p.fixture_id=f.id and p.couple_bd_user_id=p_couple_id))) then raise exception using errcode='42501',message='Fixture unavailable.'; end if;
  insert into public.app_review_raffle_fixture_scans(fixture_id,couple_bd_user_id,vendor_bingo_id,card_generation) values(p_fixture_id,p_couple_id,p_vendor_id,p_expected_generation) on conflict(fixture_id,couple_bd_user_id,vendor_bingo_id) do update set card_generation=excluded.card_generation;
 end if;
 return jsonb_build_object('ok',true,'card_generation',p_expected_generation);
end;$$;

create function public.capture_qr_bingo_draw_entry_generation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.entry_card_generation<>old.entry_card_generation then raise exception using errcode='55000',message='Draw entry generation is immutable.'; end if;
 else
  select entry.card_generation into new.entry_card_generation from public.qr_bingo_raffle_entries entry where entry.id=new.entry_id and entry.card_reset_at is null;
  if not found then raise exception using errcode='55000',message='stale_card_generation: The entrant card was reset.'; end if;
 end if;
 return new;
end;$$;
create trigger ab_qr_bingo_draw_entry_generation before insert or update on public.qr_bingo_raffle_draws for each row execute function public.capture_qr_bingo_draw_entry_generation();

-- Preserve all existing lifecycle checks; add only active-card filtering/fences.
CREATE OR REPLACE FUNCTION public.select_qr_bingo_potential_winner(p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_drawn_by_bd_user_id text, p_draw_reason text, p_skill_question_prompt text, p_skill_question_salt text, p_skill_question_answer_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_drawn_by_bd_user_id, ''));
  normalized_reason text := btrim(coalesce(p_draw_reason, ''));
  normalized_prompt text := btrim(coalesce(p_skill_question_prompt, ''));
  normalized_salt text := lower(btrim(coalesce(p_skill_question_salt, '')));
  normalized_answer_hash text := lower(btrim(coalesce(p_skill_question_answer_hash, '')));
  settings public.qr_bingo_raffle_settings%rowtype;
  offer public.qr_bingo_vendor_offer_versions%rowtype;
  current_config public.qr_bingo_event_configs%rowtype;
  selected_entry record;
  created_draw public.qr_bingo_raffle_draws%rowtype;
  active_fixture boolean := false;
  fixture_allows_early_draw boolean := false;
  active_selection_count integer := 0;
  next_draw_number integer := 1;
  available_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if normalized_event !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event) > 100
    or normalized_vendor !~ '^[1-9][0-9]{0,19}$'
    or normalized_vendor_user is distinct from normalized_vendor
    or normalized_actor is distinct from normalized_vendor_user
    or length(normalized_reason) > 120
    or normalized_reason ~ '[[:cntrl:]]'
    or length(normalized_prompt) < 1
    or length(normalized_prompt) > 300
    or normalized_prompt ~ '[<>[:cntrl:]]'
    or normalized_salt !~ '^[0-9a-f]{32}$'
    or normalized_answer_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'Valid exact promotion, vendor actor, draw reason, and skill challenge values are required.';
  end if;
  if normalized_reason = '' then
    normalized_reason := 'initial';
  end if;

  -- Serialize selection for this exact vendor promotion.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_event || ':' || normalized_vendor,
      0
    )
  );

  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
   order by config.revision desc
   limit 1
   for share;
  if current_config.id is null or not current_config.vendor_draws_enabled then
    return jsonb_build_object(
      'ok', false,
      'code', 'draws_disabled',
      'error', 'Vendor QR Bingo draws are not currently available.'
    );
  end if;

  select fixture.allow_early_draw
    into fixture_allows_early_draw
    from (
      select app.event_key, app.vendor_bingo_id, app.vendor_bd_user_id,
             app.enabled, app.expires_at, app.allow_early_draw
        from public.app_review_raffle_fixtures app
      union all
      select email.event_key, email.vendor_bingo_id, email.vendor_bd_user_id,
             email.enabled, email.expires_at, email.allow_early_draw
        from public.qr_bingo_email_test_fixtures email
    ) fixture
   where fixture.event_key = normalized_event
     and fixture.vendor_bingo_id = normalized_vendor
     and fixture.vendor_bd_user_id = normalized_vendor_user
     and fixture.enabled
     and fixture.expires_at > clock_timestamp()
   limit 1;
  active_fixture := found;
  fixture_allows_early_draw := coalesce(fixture_allows_early_draw, false);

  if not active_fixture and current_config.event_key is distinct from normalized_event then
    return jsonb_build_object(
      'ok', false,
      'code', 'event_unavailable',
      'error', 'The requested QR Bingo event is not the current published event.'
    );
  end if;

  select vendor_settings.*
    into settings
    from public.qr_bingo_raffle_settings vendor_settings
   where vendor_settings.event_key = normalized_event
     and vendor_settings.vendor_bingo_id = normalized_vendor
     and vendor_settings.vendor_bd_user_id = normalized_vendor_user
   for update;
  if settings.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'settings_missing',
      'error', 'QR Bingo vendor settings were not found.'
    );
  end if;

  select version.*
    into offer
    from public.qr_bingo_vendor_offer_versions version
   where version.event_key = normalized_event
     and version.vendor_bingo_id = normalized_vendor
     and version.vendor_offer_version = settings.updated_at
   for share;

  if not settings.enabled
    or settings.vendor_bd_user_id is distinct from settings.vendor_bingo_id
    or settings.max_winners not between 1 and 3
    or not settings.legal_terms_accepted
    or settings.legal_terms_version is distinct from current_config.rules_version
    or settings.legal_terms_accepted_at is null
    or settings.rules_viewed_at is null
    or not settings.apple_non_sponsor_acknowledged
    or not settings.vendor_responsibility_acknowledged
    or settings.vendor_responsibility_acknowledged_at is null
    or settings.vendor_responsibility_version is distinct from current_config.rules_version
    or nullif(btrim(settings.vendor_responsibility_disclosure_text), '') is null
    or nullif(btrim(settings.participant_responsibility_disclosure_text), '') is null
    or nullif(btrim(settings.vendor_name), '') is null
    or nullif(btrim(settings.prize_title), '') is null
    or nullif(btrim(settings.prize_description), '') is null
    or coalesce(settings.prize_approx_value_cad, 0) <= 0
    or nullif(btrim(settings.prize_provider_name), '') is null
    or not settings.no_purchase_required
    or not settings.skill_testing_question_required
    or settings.entry_closes_at is null
    or settings.draw_opens_at is null
    or settings.draw_at is null
    or settings.draw_at < settings.entry_closes_at
    or (not fixture_allows_early_draw and settings.draw_opens_at < settings.entry_closes_at)
    or offer.vendor_offer_version is null
    or not offer.offer_enterable
    or offer.activation_excluded_as_legacy_qa
    or row(
      settings.vendor_bd_user_id,
      settings.vendor_name,
      settings.enabled,
      settings.prize_title,
      settings.prize_description,
      settings.prize_approx_value_cad,
      settings.eligibility_region,
      settings.entry_closes_at,
      settings.draw_opens_at,
      settings.draw_at,
      settings.odds_basis,
      settings.no_purchase_required,
      settings.skill_testing_question_required,
      settings.official_rules_url,
      settings.alternate_free_entry_url,
      settings.legal_terms_version,
      settings.legal_terms_accepted,
      settings.legal_terms_accepted_at,
      settings.rules_viewed_at,
      settings.administrator_name,
      settings.co_sponsor_name,
      settings.prize_provider_name,
      settings.apple_non_sponsor_acknowledged,
      settings.vendor_responsibility_acknowledged,
      settings.vendor_responsibility_disclosure_text,
      settings.vendor_responsibility_acknowledged_at,
      settings.vendor_responsibility_version,
      settings.participant_responsibility_disclosure_text,
      settings.max_winners,
      settings.exclude_previous_winners
    ) is distinct from row(
      offer.vendor_bd_user_id,
      offer.vendor_name,
      offer.enabled,
      offer.prize_title,
      offer.prize_description,
      offer.prize_approx_value_cad,
      offer.eligibility_region,
      offer.entry_closes_at,
      offer.draw_opens_at,
      offer.draw_at,
      offer.odds_basis,
      offer.no_purchase_required,
      offer.skill_testing_question_required,
      offer.official_rules_url,
      offer.alternate_free_entry_url,
      offer.rules_version,
      offer.legal_terms_accepted,
      offer.legal_terms_accepted_at,
      offer.rules_viewed_at,
      offer.administrator_name,
      offer.co_sponsor_name,
      offer.prize_provider_name,
      offer.apple_non_sponsor_acknowledged,
      offer.vendor_responsibility_acknowledged,
      offer.vendor_responsibility_disclosure_text,
      offer.vendor_responsibility_acknowledged_at,
      offer.vendor_responsibility_version,
      offer.participant_responsibility_disclosure_text,
      offer.max_winners,
      offer.exclude_previous_winners
    )
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_vendor_offer',
      'error', 'The vendor offer is incomplete or no longer matches its immutable accepted terms.'
    );
  end if;

  if not active_fixture and row(
    settings.official_rules_url,
    settings.alternate_free_entry_url,
    settings.eligibility_region,
    settings.entry_closes_at,
    settings.draw_opens_at,
    settings.draw_at
  ) is distinct from row(
    current_config.official_rules_url,
    current_config.alternate_free_entry_url,
    current_config.eligibility_region,
    current_config.entry_closes_at,
    current_config.draw_opens_at,
    current_config.draw_at
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_event_config',
      'error', 'The vendor offer no longer matches the current event terms.'
    );
  end if;

  available_at := greatest(
    settings.entry_closes_at,
    settings.draw_opens_at,
    settings.draw_at
  );
  if not (active_fixture and fixture_allows_early_draw)
    and clock_timestamp() < available_at
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'draw_not_open',
      'error', 'Draw is not open yet.',
      'draw_opens_at', available_at
    );
  end if;

  if exists (
    select 1
      from public.qr_bingo_raffle_draws draw
     where draw.event_key = normalized_event
       and draw.vendor_bingo_id = normalized_vendor
       and draw.vendor_bd_user_id = normalized_vendor_user
       and draw.draw_generation = settings.draw_generation
       and draw.selection_status = 'potential'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'awaiting_verification',
      'error', 'A potential winner is already awaiting vendor review.'
    );
  end if;

  select count(*)
    into active_selection_count
    from public.qr_bingo_raffle_draws draw
   where draw.event_key = normalized_event
     and draw.vendor_bingo_id = normalized_vendor
     and draw.vendor_bd_user_id = normalized_vendor_user
     and draw.draw_generation = settings.draw_generation
     and draw.selection_status in ('potential', 'verified');
  -- Draw numbers are append-only across every historical status.
  select coalesce(max(draw.draw_number), 0) + 1
    into next_draw_number
    from public.qr_bingo_raffle_draws draw
   where draw.event_key = normalized_event
     and draw.vendor_bingo_id = normalized_vendor
     and draw.vendor_bd_user_id = normalized_vendor_user;

  if active_selection_count >= 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'winner_limit_reached',
      'error', 'The disclosed winner limit for this vendor promotion has been reached.',
      'max_winners', 1,
      'active_winner_count', active_selection_count
    );
  end if;

  with eligible as materialized (
    select entry.*
      from public.qr_bingo_raffle_entries entry
     where entry.event_key = normalized_event
       and entry.card_reset_at is null
       and entry.vendor_bingo_id = normalized_vendor
       and entry.vendor_bd_user_id = normalized_vendor_user
       and entry.vendor_offer_version is not null
       and entry.consent_share_contact
       and entry.contact_share_scope = 'named_vendor_draw_administration'
       and entry.consent_version = current_config.rules_version
       and entry.rules_viewed_at is not null
       and entry.apple_non_sponsor_acknowledged
       and entry.draw_administration_contact_share_acknowledged
       and entry.draw_administration_contact_share_acknowledged_at is not null
       and entry.draw_administration_contact_share_version = current_config.rules_version
       and nullif(btrim(entry.draw_administration_contact_share_consent_text), '') is not null
       and entry.age_of_majority_attested
       and entry.residency_attested
       and entry.exclusions_attested
       and entry.eligibility_attested_at is not null
       and nullif(btrim(entry.eligibility_attestation_text), '') is not null
       and entry.promotion_responsibility_acknowledged
       and entry.promotion_responsibility_acknowledged_at is not null
       and entry.promotion_responsibility_version = current_config.rules_version
       and nullif(btrim(entry.promotion_disclosure_text), '') is not null
       and nullif(btrim(entry.consent_text), '') is not null
       and nullif(btrim(entry.couple_name), '') is not null
       and nullif(btrim(entry.couple_email), '') is not null
       and (
         active_fixture
         or (
           entry.entry_method = 'qr_scan_opt_in'
           and ((entry.in_show_scan_verified is true and entry.in_show_scan_verified_at is not null)
             or public.qr_bingo_entry_access_evidence_valid(entry))
         )
       )
       -- Prize revisions and the single-winner operational cap do not rewrite
       -- or invalidate existing entrant evidence. All other material terms match.
       and row(
         entry.vendor_name,
         entry.eligibility_region,
         entry.entry_closes_at,
         entry.draw_at,
         entry.odds_basis,
         entry.no_purchase_required,
         entry.skill_testing_question_required,
         entry.official_rules_url,
         entry.alternate_free_entry_url,
         entry.administrator_name,
         entry.co_sponsor_name,
         entry.prize_provider_name,
         entry.promotion_disclosure_text
       ) is not distinct from row(
         offer.vendor_name,
         offer.eligibility_region,
         offer.entry_closes_at,
         offer.draw_at,
         offer.odds_basis,
         offer.no_purchase_required,
         offer.skill_testing_question_required,
         offer.official_rules_url,
         offer.alternate_free_entry_url,
         offer.administrator_name,
         offer.co_sponsor_name,
         offer.prize_provider_name,
         case when public.qr_bingo_entry_access_evidence_valid(entry) then public.qr_bingo_effective_entry_disclosure(offer.participant_responsibility_disclosure_text) else offer.participant_responsibility_disclosure_text end
       )
       and not exists (
         select 1
           from public.qr_bingo_legacy_qa_archives archive
          where archive.entry_id = entry.id
       )
       and not exists (
         select 1
           from public.qr_bingo_raffle_entry_selection_state state
          where state.entry_id = entry.id
            and not state.included
       )
       and not exists (
         select 1
           from public.qr_bingo_raffle_draws prior
          where prior.entry_id = entry.id
            and prior.draw_generation = settings.draw_generation
            and prior.selection_status in ('potential', 'disqualified', 'replaced')
       )
       and (
         not exists (
           select 1
             from public.qr_bingo_raffle_draws prior
            where prior.event_key = entry.event_key
              and prior.draw_generation = settings.draw_generation
              and prior.vendor_bingo_id = entry.vendor_bingo_id
              and prior.vendor_bd_user_id = entry.vendor_bd_user_id
              and prior.couple_bd_user_id = entry.couple_bd_user_id
              and prior.selection_status = 'verified'
         )
       )
  ), randomized as (
    select eligible.*,
           count(*) over ()::integer as eligible_entry_count,
           extensions.gen_random_bytes(16) as random_key
      from eligible
  )
  select *
    into selected_entry
    from randomized
   order by random_key, id
   limit 1;

  if selected_entry.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_eligible_entries',
      'error', 'No included, eligible entry requests remain for potential-winner selection.',
      'eligible_entry_count', 0
    );
  end if;

  insert into public.qr_bingo_raffle_draws (
    draw_generation,
    event_key,
    vendor_bingo_id,
    vendor_bd_user_id,
    vendor_name,
    entry_id,
    couple_bd_user_id,
    winner_name,
    winner_email,
    winner_phone,
    winner_wedding_date,
    prize_title,
    prize_description,
    claim_instructions,
    prize_approx_value_cad,
    eligibility_region,
    entry_closes_at,
    scheduled_draw_at,
    odds_basis,
    no_purchase_required,
    skill_testing_question_required,
    official_rules_url,
    rules_version,
    administrator_name,
    co_sponsor_name,
    prize_provider_name,
    apple_non_sponsor_disclaimer,
    alternate_free_entry_url,
    skill_question_prompt,
    skill_question_salt,
    skill_question_answer_hash,
    selection_status,
    max_winners,
    exclude_previous_winners,
    draw_number,
    draw_reason,
    drawn_by_bd_user_id
  ) values (
    settings.draw_generation,
    selected_entry.event_key,
    selected_entry.vendor_bingo_id,
    selected_entry.vendor_bd_user_id,
    selected_entry.vendor_name,
    selected_entry.id,
    selected_entry.couple_bd_user_id,
    selected_entry.couple_name,
    selected_entry.couple_email,
    selected_entry.couple_phone,
    selected_entry.couple_wedding_date,
    selected_entry.prize_title,
    selected_entry.prize_description,
    settings.claim_instructions,
    selected_entry.prize_approx_value_cad,
    selected_entry.eligibility_region,
    selected_entry.entry_closes_at,
    selected_entry.draw_at,
    selected_entry.odds_basis,
    selected_entry.no_purchase_required,
    selected_entry.skill_testing_question_required,
    selected_entry.official_rules_url,
    selected_entry.consent_version,
    selected_entry.administrator_name,
    selected_entry.co_sponsor_name,
    selected_entry.prize_provider_name,
    'Apple Inc. is not a sponsor of and is not involved in this promotion.',
    selected_entry.alternate_free_entry_url,
    normalized_prompt,
    normalized_salt,
    normalized_answer_hash,
    'potential',
    1,
    true,
    next_draw_number,
    normalized_reason,
    normalized_actor
  )
  returning * into created_draw;

  return jsonb_build_object(
    'ok', true,
    'draw', to_jsonb(created_draw),
    'eligible_entry_count', selected_entry.eligible_entry_count,
    'max_winners', 1,
    'active_winner_count', active_selection_count + 1,
    'remaining_winner_slots', greatest(
      1 - active_selection_count - 1,
      0
    )
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.require_current_qr_bingo_draw_generation(p_draw_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare selected public.qr_bingo_raffle_draws%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='Service-role authorization is required.';
  end if;
  select * into selected from public.qr_bingo_raffle_draws where id=p_draw_id;
  if not found then raise exception using errcode='P0002',message='QR Bingo draw was not found.'; end if;
  -- Promotion lock comes before row locks, matching selection, replacement and claims.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(selected.event_key||':'||selected.vendor_bingo_id,0));
  perform 1 from public.qr_bingo_event_configs where published order by revision desc limit 1 for share;
  select * into selected from public.qr_bingo_raffle_draws where id=p_draw_id for update;
  if not found then raise exception using errcode='P0002',message='QR Bingo draw was not found.'; end if;
  if not exists(select 1 from public.qr_bingo_raffle_entries entry where entry.id=selected.entry_id and entry.card_reset_at is null and entry.card_generation=selected.entry_card_generation) then
    raise exception using errcode='55000',message='stale_card_generation: The selected couple card was reset. Reset the vendor draw before selecting again.';
  end if;
  if selected.draw_generation is distinct from public.qr_bingo_current_draw_generation(selected.event_key,selected.vendor_bingo_id,selected.vendor_bd_user_id) then
    raise exception using errcode='55000',message='This draw was reset by an administrator. Refresh the vendor dashboard.';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.read_qr_bingo_admin_data(p_dataset text, p_event_key text, p_vendor_id text DEFAULT ''::text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if p_dataset not in ('contacts','entries','winners') or p_limit not between 1 and 5001
    or p_offset not between 0 and 1000000 or length(p_search)>120
    or length(p_event_key)>100 or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or (p_vendor_id<>'' and p_vendor_id !~ '^[1-9][0-9]{0,19}$') then
    raise exception using errcode='22023',message='Invalid QR data filter.';
  end if;
  with records as (
    select profile.couple_bd_user_id as stable_id,profile.updated_at as sort_time,
      concat_ws(' ',profile.couple_bd_user_id,profile.name,profile.email,profile.phone,profile.wedding_venue) as search_text,
      jsonb_build_object('couple_id',profile.couple_bd_user_id,'name',profile.name,'email',profile.email,
        'phone',profile.phone,'wedding_date',profile.wedding_date,'wedding_venue',profile.wedding_venue,'version',profile.version,'updated_at',profile.updated_at) as row_data
      from public.qr_bingo_contact_profiles profile where p_dataset='contacts' and profile.event_key=p_event_key and profile.admin_removed_at is null
        and (p_vendor_id='' or exists(select 1 from public.qr_bingo_raffle_entries entry
          where entry.card_reset_at is null and entry.event_key=profile.event_key and entry.couple_bd_user_id=profile.couple_bd_user_id
            and entry.vendor_bingo_id=p_vendor_id and entry.consent_share_contact
            and entry.contact_share_scope='named_vendor_draw_administration'
            and entry.draw_administration_contact_share_acknowledged and entry.vendor_marketing_consent))
    union all
    select entry.id::text,entry.created_at,concat_ws(' ',entry.couple_bd_user_id,entry.couple_name,entry.couple_email,entry.couple_phone,entry.vendor_name,entry.couple_wedding_venue),
      jsonb_build_object('id',entry.id,'vendor_id',entry.vendor_bingo_id,'vendor_name',entry.vendor_name,
        'couple_id',entry.couple_bd_user_id,'name',entry.couple_name,'email',entry.couple_email,'phone',entry.couple_phone,
        'wedding_date',entry.couple_wedding_date,'wedding_venue',entry.couple_wedding_venue,'entered_at',entry.created_at,'consent_version',entry.consent_version,
        'marketing_consent',entry.vendor_marketing_consent,'selection_status',case when selection.included=false then 'Excluded' else 'Included' end)
      from public.qr_bingo_raffle_entries entry left join public.qr_bingo_raffle_entry_selection_state selection on selection.entry_id=entry.id
      where p_dataset='entries' and entry.card_reset_at is null and entry.event_key=p_event_key and (p_vendor_id='' or entry.vendor_bingo_id=p_vendor_id)
    union all
    select draw.id::text,draw.drawn_at,concat_ws(' ',draw.couple_bd_user_id,draw.winner_name,draw.winner_email,draw.winner_phone,draw.vendor_name),
      jsonb_build_object('id',draw.id,'vendor_id',draw.vendor_bingo_id,'vendor_name',draw.vendor_name,
        'couple_id',draw.couple_bd_user_id,'name',draw.winner_name,'email',draw.winner_email,'phone',draw.winner_phone,
        'wedding_date',draw.winner_wedding_date,'draw_number',draw.draw_number,'drawn_at',draw.drawn_at,
        'selection_status',draw.selection_status,'prize_title',draw.prize_title) || public.qr_bingo_draw_reset_metadata(draw.id)
      from public.qr_bingo_raffle_draws draw where p_dataset='winners' and draw.event_key=p_event_key
        and (p_vendor_id='' or draw.vendor_bingo_id=p_vendor_id)
  ),filtered as (
    select * from records where p_search='' or position(lower(p_search) in lower(search_text))>0
  ),paged as (
    select row_data from filtered order by sort_time desc,stable_id limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(row_data) from paged),'[]'::jsonb)) into result;
  return result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.read_qr_bingo_admin_contacts(p_event_key text, p_vendor_id text, p_search text, p_offset integer, p_limit integer, p_contact_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if p_event_key is null or length(p_event_key)>100 or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_vendor_id is null or (p_vendor_id<>'' and p_vendor_id !~ '^[1-9][0-9]{0,19}$')
    or p_search is null or length(p_search)>120 or p_contact_status is null or p_contact_status not in ('active','removed','all')
    or p_offset is null or p_offset not between 0 and 1000000 or p_limit is null or p_limit not between 1 and 5001
  then raise exception using errcode='22023',message='Invalid QR contact-list filter.'; end if;
  with filtered as (
    select profile.* from public.qr_bingo_contact_profiles profile where profile.event_key=p_event_key
      and (p_contact_status='all' or (p_contact_status='removed')=(profile.admin_removed_at is not null))
      and (p_search='' or position(lower(p_search) in lower(concat_ws(' ',profile.couple_bd_user_id,profile.name,profile.email,profile.phone,profile.wedding_venue)))>0)
      and (p_vendor_id='' or exists(select 1 from public.qr_bingo_raffle_entries entry
        where entry.card_reset_at is null and entry.event_key=profile.event_key and entry.couple_bd_user_id=profile.couple_bd_user_id and entry.vendor_bingo_id=p_vendor_id
          and entry.consent_share_contact and entry.contact_share_scope='named_vendor_draw_administration'
          and entry.draw_administration_contact_share_acknowledged and entry.vendor_marketing_consent))
  ), paged as (
    select jsonb_build_object('couple_id',couple_bd_user_id,'name',name,'email',email,'phone',phone,
      'wedding_date',wedding_date,'wedding_venue',wedding_venue,'version',version,'updated_at',updated_at,
      'removed',admin_removed_at is not null,'removed_at',admin_removed_at,'source',case when admin_added_at is null then 'couple' else 'admin' end) as row_data
      from filtered order by updated_at desc,couple_bd_user_id limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(row_data) from paged),'[]'::jsonb)) into result;
  return result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.claim_qr_bingo_test_draw_email_delivery(p_draw_id uuid, p_channel text, p_lease_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_config public.qr_bingo_event_configs%rowtype;
  current_fixture public.qr_bingo_email_test_fixtures%rowtype;
  current_scan public.qr_bingo_email_test_fixture_scans%rowtype;
  current_settings public.qr_bingo_raffle_settings%rowtype;
  current_entry public.qr_bingo_raffle_entries%rowtype;
  current_draw public.qr_bingo_raffle_draws%rowtype;
  delivery public.qr_bingo_draw_email_deliveries%rowtype;
  normalized_channel text := lower(btrim(coalesce(p_channel, '')));
  allowed_recipient text;
  eligible_entry_count integer := 0;
  v_now timestamptz := clock_timestamp();
  new_claim_token uuid;
begin
  perform public.require_current_qr_bingo_draw_generation(p_draw_id);
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  -- Acquire the promotion lock before locking a draw/delivery row. Settings
  -- saves use the same lock, so a send always captures a coherent current prize.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(draw.event_key || ':' || draw.vendor_bingo_id, 0))
    from public.qr_bingo_raffle_draws draw where draw.id = p_draw_id;

  if p_draw_id is null
    or normalized_channel not in ('vendor', 'couple')
    or p_lease_seconds is null
    or p_lease_seconds < 30
    or p_lease_seconds > 300
  then
    raise exception using
      errcode = '22023',
      message = 'An email-test draw, a vendor or couple channel, and a lease from 30 through 300 seconds are required.';
  end if;

  select *
    into current_config
    from public.qr_bingo_event_configs
   where published
   order by revision desc
   limit 1
   for share;

  if current_config.id is null then
    raise exception using errcode = '55000', message = 'Published QR Bingo configuration is unavailable.';
  end if;

  select *
    into current_draw
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
   for update;

  if current_draw.id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo email-test draw was not found.';
  end if;

  select *
    into current_fixture
    from public.qr_bingo_email_test_fixtures fixture
   where fixture.enabled
     and fixture.expires_at > v_now
     and fixture.event_key = current_draw.event_key
     and fixture.vendor_bingo_id = current_draw.vendor_bingo_id
     and fixture.vendor_bd_user_id = current_draw.vendor_bd_user_id
     and fixture.couple_bd_user_id = current_draw.couple_bd_user_id
   for update;

  if current_fixture.id is null
    or current_fixture.event_key not like 'email-test-%'
    or current_fixture.event_key = current_config.event_key
  then
    raise exception using errcode = '42501', message = 'An active isolated email-test fixture is required.';
  end if;

  if not current_fixture.send_couple_email
    or (normalized_channel = 'vendor' and not current_fixture.send_vendor_email)
  then
    raise exception using errcode = '42501', message = 'This isolated email test has not authorized the requested notice.';
  end if;

  allowed_recipient := lower(btrim(current_fixture.outbound_recipient_email));
  if allowed_recipient = ''
    or lower(btrim(current_draw.winner_email)) is distinct from allowed_recipient
  then
    raise exception using errcode = '42501', message = 'The verified draw does not match the exact allowlisted recipient.';
  end if;

  if current_draw.selection_status <> 'verified'
    or current_draw.eligibility_verified_at is null
    or not public.qr_bingo_skill_verification_complete(current_draw)
    or current_draw.verified_at is null
    or nullif(btrim(current_draw.verified_by), '') is null
    or current_draw.rules_version is distinct from current_config.rules_version
    or current_draw.official_rules_url is distinct from current_config.official_rules_url
    or current_draw.vendor_name is distinct from current_fixture.vendor_name
    or current_draw.prize_provider_name is distinct from current_fixture.vendor_name
  then
    raise exception using errcode = '55000', message = 'Current rules plus completed eligibility and skill-testing verification are required.';
  end if;

  select *
    into current_scan
    from public.qr_bingo_email_test_fixture_scans scan
   where scan.fixture_id = current_fixture.id
     and scan.couple_bd_user_id = current_fixture.couple_bd_user_id
     and scan.vendor_bingo_id = current_fixture.vendor_bingo_id
   for share;

  if current_scan.id is null then
    raise exception using errcode = '55000', message = 'The allowlisted couple must scan the fixture vendor before email testing.';
  end if;

  select *
    into current_settings
    from public.qr_bingo_raffle_settings settings
   where settings.event_key = current_fixture.event_key
     and settings.vendor_bingo_id = current_fixture.vendor_bingo_id
     and settings.vendor_bd_user_id = current_fixture.vendor_bd_user_id
   limit 1;
  -- The promotion lock already prevents a settings commit during this claim.
  -- Avoid a row-lock inversion with a direct service-role settings UPDATE.

  if current_settings.id is null
    or not current_settings.enabled
    or not current_settings.legal_terms_accepted
    or current_settings.legal_terms_version is distinct from current_config.rules_version
    or current_settings.official_rules_url is distinct from current_config.official_rules_url
    or current_settings.rules_viewed_at is null
    or not current_settings.apple_non_sponsor_acknowledged
    or current_settings.prize_provider_name is distinct from current_fixture.vendor_name
    or nullif(btrim(current_settings.prize_title), '') is null
    or nullif(btrim(current_settings.prize_description), '') is null
    or coalesce(current_settings.prize_approx_value_cad, 0) <= 0
    or not current_settings.no_purchase_required
    or not current_settings.skill_testing_question_required
    or current_settings.alternate_free_entry_url !~ '^https://'
  then
    raise exception using errcode = '55000', message = 'The email-test vendor draw is not open under the current rules.';
  end if;

  select *
    into current_entry
    from public.qr_bingo_raffle_entries entry
   where entry.card_reset_at is null and entry.card_generation=current_draw.entry_card_generation and entry.id = current_draw.entry_id
     and entry.event_key = current_fixture.event_key
     and entry.vendor_bingo_id = current_fixture.vendor_bingo_id
     and entry.vendor_bd_user_id = current_fixture.vendor_bd_user_id
     and entry.couple_bd_user_id = current_fixture.couple_bd_user_id
   limit 1
   for share;

  if current_entry.id is null
    or lower(btrim(current_entry.couple_email)) is distinct from allowed_recipient
    or not current_entry.consent_share_contact
    or nullif(btrim(current_entry.consent_text), '') is null
    or current_entry.consent_version is distinct from current_config.rules_version
    or current_entry.official_rules_url is distinct from current_config.official_rules_url
    or current_entry.rules_viewed_at is null
    or not current_entry.apple_non_sponsor_acknowledged
    or current_entry.contact_share_scope <> 'named_vendor_draw_administration'
    or current_entry.prize_provider_name is distinct from current_fixture.vendor_name
    or current_draw.prize_title is distinct from current_entry.prize_title
    or current_draw.prize_description is distinct from current_entry.prize_description
    or current_draw.prize_approx_value_cad is distinct from current_entry.prize_approx_value_cad
    or not current_entry.no_purchase_required
    or not current_entry.skill_testing_question_required
    or not current_entry.age_of_majority_attested
    or not current_entry.residency_attested
    or not current_entry.exclusions_attested
    or current_entry.eligibility_attested_at is null
    or nullif(btrim(current_entry.eligibility_attestation_text), '') is null
  then
    raise exception using errcode = '55000', message = 'Current explicit couple consent and eligibility attestations are required.';
  end if;

  select count(*)::integer
    into eligible_entry_count
    from public.qr_bingo_raffle_entries entry
   where entry.card_reset_at is null and entry.event_key = current_fixture.event_key
     and entry.vendor_bingo_id = current_fixture.vendor_bingo_id
     and entry.consent_version = current_config.rules_version
     and entry.age_of_majority_attested
     and entry.residency_attested
     and entry.exclusions_attested;

  if eligible_entry_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'The isolated email test requires exactly one eligible allowlisted entry.';
  end if;

  if (normalized_channel = 'couple' and current_draw.couple_email_sent_at is not null)
    or (normalized_channel = 'vendor' and current_draw.vendor_email_sent_at is not null) then
    insert into public.qr_bingo_draw_email_deliveries (
      draw_id,
      channel,
      status,
      sent_at,
      updated_at
    ) values (
      current_draw.id,
      normalized_channel,
      'sent',
      case when normalized_channel = 'vendor' then current_draw.vendor_email_sent_at
        else current_draw.couple_email_sent_at end,
      v_now
    )
    on conflict (draw_id, channel) do update
      set status = 'sent',
          claim_token = null,
          claim_expires_at = null,
          sent_at = coalesce(
            public.qr_bingo_draw_email_deliveries.sent_at,
            excluded.sent_at
          ),
          updated_at = excluded.updated_at;

    select * into delivery
      from public.qr_bingo_draw_email_deliveries
     where draw_id = current_draw.id
       and channel = normalized_channel;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  insert into public.qr_bingo_draw_email_deliveries (draw_id, channel)
  values (current_draw.id, normalized_channel)
  on conflict (draw_id, channel) do nothing;

  select *
    into delivery
    from public.qr_bingo_draw_email_deliveries
   where draw_id = current_draw.id
     and channel = normalized_channel
   for update;

  if delivery.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  if delivery.status = 'ambiguous' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'ambiguous', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'last_error', delivery.last_error,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  if delivery.status = 'claimed' then
    if delivery.claim_expires_at > v_now then
      return jsonb_build_object(
        'ok', true,
        'claimed', false,
        'busy', true,
        'delivery_key', delivery.delivery_key,
        'status', delivery.status,
        'claim_expires_at', delivery.claim_expires_at,
        'channel', normalized_channel,
        'recipient', allowed_recipient,
        'email_test_fixture_id', current_fixture.id
      );
    end if;

    update public.qr_bingo_draw_email_deliveries
       set status = 'ambiguous',
           claim_expires_at = null,
           last_error = 'The prior email-test delivery claim expired without a definitive outcome; operator reconciliation is required.',
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'ambiguous', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'last_error', delivery.last_error,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  new_claim_token := gen_random_uuid();
  update public.qr_bingo_draw_email_deliveries
     set status = 'claimed',
         claim_token = new_claim_token,
         claim_expires_at = v_now + make_interval(secs => p_lease_seconds),
         attempt_count = attempt_count + 1,
         last_claimed_at = v_now,
         prize_snapshot = public.qr_bingo_current_prize_snapshot(current_draw.event_key, current_draw.vendor_bingo_id, current_draw.vendor_bd_user_id),
         last_error = '',
         updated_at = v_now
   where id = delivery.id
  returning * into delivery;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'prize_snapshot', delivery.prize_snapshot,
    'delivery_key', delivery.delivery_key,
    'claim_token', delivery.claim_token,
    'claim_expires_at', delivery.claim_expires_at,
    'attempt_count', delivery.attempt_count,
    'channel', normalized_channel,
    'draw_id', delivery.draw_id,
    'recipient', allowed_recipient,
    'email_test_fixture_id', current_fixture.id
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_current_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  applicable_rules_version text;
  submitted_offer_version timestamptz;
begin
  -- Only the reset RPC's exact audited metadata change can bypass reacceptance.
  if tg_op='UPDATE' and tg_table_name='qr_bingo_raffle_entries' then
    if public.qr_bingo_card_reset_metadata_only(old,new) then return new; end if;
  end if;
  -- A verified, existing named-vendor consent is not renewed by a contact edit.
  -- Only operational contact columns may differ; archived records stay immutable.
  if tg_op = 'UPDATE' and tg_table_name = 'qr_bingo_raffle_entries' then
  if old.consent_share_contact
    and old.contact_share_scope = 'named_vendor_draw_administration'
    and old.draw_administration_contact_share_acknowledged
    and old.vendor_marketing_consent
    and not exists(select 1 from public.qr_bingo_legacy_qa_archives archive where archive.entry_id=old.id)
    and (to_jsonb(new) - array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash'])
      = (to_jsonb(old) - array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash'])
  then return new; end if;
  end if;
  if tg_table_name = 'qr_bingo_raffle_entries' then
    submitted_offer_version := nullif(
      to_jsonb(new) ->> 'vendor_offer_version',
      ''
    )::timestamptz;
  end if;

  if tg_table_name = 'qr_bingo_raffle_entries'
    and submitted_offer_version is not null
  then
    select version.rules_version
      into applicable_rules_version
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = new.event_key
       and version.vendor_bingo_id = new.vendor_bingo_id
       and version.vendor_offer_version = submitted_offer_version
       and version.offer_enterable
       and not version.activation_excluded_as_legacy_qa;
  else
    select config.rules_version
      into applicable_rules_version
      from public.qr_bingo_event_configs config
     where config.published
       and (
         config.event_key = new.event_key
         or exists (
           select 1
             from public.app_review_raffle_fixtures fixture
            where fixture.event_key = new.event_key
              and fixture.enabled
              and fixture.expires_at > clock_timestamp()
         )
         or exists (
           select 1
             from public.qr_bingo_email_test_fixtures fixture
            where fixture.event_key = new.event_key
              and fixture.enabled
              and fixture.expires_at > clock_timestamp()
         )
       )
     limit 1;
  end if;

  if nullif(btrim(applicable_rules_version), '') is null then
    raise exception using
      errcode = '55000',
      message = 'No applicable QR Bingo event rules are available.';
  end if;

  if tg_table_name = 'qr_bingo_raffle_settings' then
    if new.enabled and (
      applicable_rules_version <> '2026-09-01-in-person-entry'
      or not new.legal_terms_accepted
      or new.legal_terms_version is distinct from applicable_rules_version
      or new.rules_viewed_at is null
      or not new.apple_non_sponsor_acknowledged
      or btrim(new.official_rules_url) = ''
      or btrim(new.prize_provider_name) = ''
      or btrim(new.prize_title) = ''
      or coalesce(new.prize_approx_value_cad, 0) <= 0
      or btrim(new.eligibility_region) = ''
      or new.entry_closes_at is null
      or new.draw_at is null
      or new.draw_at < new.entry_closes_at
      or btrim(new.odds_basis) = ''
      or not new.no_purchase_required
      or not new.skill_testing_question_required
      or coalesce(position(
        'visited this vendor booth in person'
        in lower(new.participant_responsibility_disclosure_text)
      ), 0) = 0
      or new.alternate_free_entry_url !~ '^https://'
    ) then
      raise exception 'Review and accept the current official rules before enabling this vendor draw.';
    end if;
  elsif tg_table_name = 'qr_bingo_raffle_entries' then
    if applicable_rules_version <> '2026-09-01-in-person-entry'
      or new.consent_version is distinct from applicable_rules_version
      or new.rules_viewed_at is null
      or not new.apple_non_sponsor_acknowledged
      or not new.consent_share_contact
      or new.contact_share_scope <> 'named_vendor_draw_administration'
      or not new.draw_administration_contact_share_acknowledged
      or new.draw_administration_contact_share_acknowledged_at is null
      or new.draw_administration_contact_share_version is distinct from applicable_rules_version
      or nullif(btrim(new.draw_administration_contact_share_consent_text), '') is null
      or not new.vendor_marketing_consent
      or new.vendor_marketing_consented_at is null
      or nullif(btrim(new.vendor_marketing_consent_text), '') is null
      or position('wedding-related offers and promotions' in new.vendor_marketing_consent_text) = 0
      or position('unsubscribe' in lower(new.vendor_marketing_consent_text)) = 0
      or (not public.qr_bingo_entry_access_evidence_valid(new) and coalesce(position(
        'visited this vendor booth in person'
        in lower(new.promotion_disclosure_text)
      ), 0) = 0)
      or btrim(new.official_rules_url) = ''
      or btrim(new.prize_provider_name) = ''
      or coalesce(new.prize_approx_value_cad, 0) <= 0
      or btrim(new.eligibility_region) = ''
      or new.entry_closes_at is null
      or new.draw_at is null
      or new.draw_at < new.entry_closes_at
      or btrim(new.odds_basis) = ''
      or not new.no_purchase_required
      or not new.skill_testing_question_required
      or new.alternate_free_entry_url !~ '^https://'
      or btrim(new.prize_title) = ''
      or btrim(new.prize_description) = ''
      or not new.age_of_majority_attested
      or not new.residency_attested
      or not new.exclusions_attested
      or new.eligibility_attested_at is null
      or btrim(new.eligibility_attestation_text) = ''
    then
      raise exception 'Review and accept the current in-person entry rules and named-vendor marketing terms before entering this vendor draw.';
    end if;
  elsif tg_table_name = 'qr_bingo_grand_prize_entries' then
    if new.rules_version is distinct from applicable_rules_version
      or new.rules_viewed_at is null
      or not new.apple_non_sponsor_acknowledged
      or btrim(new.official_rules_url) = ''
      or btrim(new.prize_provider_name) = ''
      or coalesce(new.prize_approx_value_cad, 0) <= 0
      or btrim(new.eligibility_region) = ''
      or new.entry_closes_at is null
      or new.draw_at is null
      or new.draw_at < new.entry_closes_at
      or btrim(new.odds_basis) = ''
      or not new.no_purchase_required
      or not new.skill_testing_question_required
      or new.alternate_free_entry_url !~ '^https://'
      or not new.age_of_majority_attested
      or not new.residency_attested
      or not new.exclusions_attested
      or new.eligibility_attested_at is null
      or btrim(new.eligibility_attestation_text) = ''
    then
      raise exception 'Review and accept the current official rules before entering the grand-prize draw.';
    end if;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_entry_offer_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  offer public.qr_bingo_vendor_offer_versions%rowtype;
  latest_at_submission timestamptz;
  current_settings_version timestamptz;
  current_settings_enabled boolean;
  current_vendor_draws_enabled boolean;
begin
  -- Only the reset RPC's exact audited metadata change can bypass reacceptance.
  if tg_op='UPDATE' and tg_table_name='qr_bingo_raffle_entries' then
    if public.qr_bingo_card_reset_metadata_only(old,new) then return new; end if;
  end if;
  if tg_op = 'UPDATE'
    and exists (
      select 1
        from public.qr_bingo_legacy_qa_archives archive
       where archive.entry_id = old.id
    )
    and new is distinct from old
  then
    raise exception using
      errcode = '55000',
      message = 'Archived QR Bingo legacy QA entries are immutable.';
  end if;

  -- Contact edits do not reopen/reaccept the promotion. Archived rows were
  -- rejected above; every non-contact column and all consent evidence must be
  -- byte-for-byte unchanged for this narrow operational update exemption.
  if tg_op = 'UPDATE'
    and old.consent_share_contact
    and old.contact_share_scope = 'named_vendor_draw_administration'
    and old.draw_administration_contact_share_acknowledged
    and old.vendor_marketing_consent
    and (to_jsonb(new) - array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash'])
      = (to_jsonb(old) - array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash'])
  then
    return new;
  end if;

  -- Existing untouched legacy rows may remain null.  Every new entry and every
  -- material re-consent/update must carry a valid immutable offer version.
  if tg_op = 'UPDATE'
    and new.vendor_offer_version is null
    and old.vendor_offer_version is null
    and row(
      new.event_key,
      new.vendor_bingo_id,
      new.vendor_bd_user_id,
      new.vendor_name,
      new.prize_title,
      new.prize_description,
      new.prize_approx_value_cad,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_at,
      new.odds_basis,
      new.no_purchase_required,
      new.skill_testing_question_required,
      new.official_rules_url,
      new.alternate_free_entry_url,
      new.consent_version,
      new.promotion_disclosure_text
    ) is not distinct from row(
      old.event_key,
      old.vendor_bingo_id,
      old.vendor_bd_user_id,
      old.vendor_name,
      old.prize_title,
      old.prize_description,
      old.prize_approx_value_cad,
      old.eligibility_region,
      old.entry_closes_at,
      old.draw_at,
      old.odds_basis,
      old.no_purchase_required,
      old.skill_testing_question_required,
      old.official_rules_url,
      old.alternate_free_entry_url,
      old.consent_version,
      old.promotion_disclosure_text
    )
  then
    return new;
  end if;

  if new.vendor_offer_version is null then
    raise exception using errcode = '23514', message = 'stale_vendor_offer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qr_bingo_event_config_publish', 0)
  );

  select version.*
    into offer
    from public.qr_bingo_vendor_offer_versions version
   where version.event_key = new.event_key
     and version.vendor_bingo_id = new.vendor_bingo_id
     and version.vendor_offer_version = new.vendor_offer_version;

  if offer.vendor_offer_version is null
    or not offer.offer_enterable
    or offer.activation_excluded_as_legacy_qa
  then
    raise exception using errcode = '23514', message = 'stale_vendor_offer';
  end if;

  if row(
    new.vendor_bd_user_id,
    new.vendor_name,
    new.prize_title,
    new.prize_description,
    new.prize_approx_value_cad,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_at,
    new.odds_basis,
    new.no_purchase_required,
    new.skill_testing_question_required,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.consent_version,
    new.administrator_name,
    new.co_sponsor_name,
    new.prize_provider_name,
    new.apple_non_sponsor_acknowledged,
    new.promotion_disclosure_text,
    new.promotion_responsibility_version
  ) is distinct from row(
    offer.vendor_bd_user_id,
    offer.vendor_name,
    offer.prize_title,
    offer.prize_description,
    offer.prize_approx_value_cad,
    offer.eligibility_region,
    offer.entry_closes_at,
    offer.draw_at,
    offer.odds_basis,
    offer.no_purchase_required,
    offer.skill_testing_question_required,
    offer.official_rules_url,
    offer.alternate_free_entry_url,
    offer.rules_version,
    offer.administrator_name,
    offer.co_sponsor_name,
    offer.prize_provider_name,
    true,
    case when public.qr_bingo_entry_access_evidence_valid(new) then public.qr_bingo_effective_entry_disclosure(offer.participant_responsibility_disclosure_text) else offer.participant_responsibility_disclosure_text end,
    offer.vendor_responsibility_version
  ) then
    raise exception using errcode = '23514', message = 'stale_vendor_offer';
  end if;

  if new.entry_method = 'alternate_free_entry' then
    if new.source_submitted_at is null then
      raise exception using errcode = '23514', message = 'stale_vendor_offer';
    end if;
    select max(version.vendor_offer_version)
      into latest_at_submission
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = new.event_key
       and version.vendor_bingo_id = new.vendor_bingo_id
       and version.vendor_offer_version <= new.source_submitted_at;
    if latest_at_submission is distinct from new.vendor_offer_version
      or new.source_submitted_at < offer.history_starts_at
      or new.source_submitted_at >= offer.entry_closes_at
    then
      raise exception using errcode = '23514', message = 'stale_vendor_offer';
    end if;
  else
    select settings.updated_at, settings.enabled
      into current_settings_version, current_settings_enabled
      from public.qr_bingo_raffle_settings settings
     where settings.event_key = new.event_key
       and settings.vendor_bingo_id = new.vendor_bingo_id
     for share;
    select config.vendor_draws_enabled
      into current_vendor_draws_enabled
      from public.qr_bingo_event_configs config
     where config.published
       and (
         config.event_key = new.event_key
         or exists (
           select 1
             from public.app_review_raffle_fixtures fixture
            where fixture.event_key = new.event_key
              and fixture.enabled
              and fixture.expires_at > clock_timestamp()
         )
         or exists (
           select 1
             from public.qr_bingo_email_test_fixtures fixture
            where fixture.event_key = new.event_key
              and fixture.enabled
              and fixture.expires_at > clock_timestamp()
         )
       )
     for share;
    if current_settings_version is distinct from new.vendor_offer_version
      or current_settings_enabled is distinct from true
      or current_vendor_draws_enabled is distinct from true
      or clock_timestamp() >= offer.entry_closes_at
    then
      raise exception using errcode = '23514', message = 'stale_vendor_offer';
    end if;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_responsibility_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  participant_audit_changed boolean := false;
begin
  -- Only the reset RPC's exact audited metadata change can bypass reacceptance.
  if tg_op='UPDATE' and tg_table_name='qr_bingo_raffle_entries' then
    if public.qr_bingo_card_reset_metadata_only(old,new) then return new; end if;
  end if;
  if tg_table_name = 'qr_bingo_raffle_settings' then
    if new.vendor_responsibility_acknowledged then
      if tg_op = 'INSERT' then
        -- This is evidence of the vendor's current act of acceptance. Do not
        -- backdate it to an older legal-terms view or trust a client timestamp.
        new.vendor_responsibility_acknowledged_at := clock_timestamp();
      else
        if old.vendor_responsibility_acknowledged is distinct from true
          or old.vendor_responsibility_acknowledged_at is null
          or old.vendor_responsibility_version is distinct from new.legal_terms_version
          or old.vendor_responsibility_disclosure_text is distinct from new.vendor_responsibility_disclosure_text
        then
          new.vendor_responsibility_acknowledged_at := clock_timestamp();
        else
          -- A routine settings update cannot rewrite previously recorded
          -- acceptance evidence.
          new.vendor_responsibility_acknowledged_at := old.vendor_responsibility_acknowledged_at;
        end if;
      end if;
      new.vendor_responsibility_version := new.legal_terms_version;
    else
      new.vendor_responsibility_disclosure_text := '';
      new.vendor_responsibility_acknowledged_at := null;
      new.vendor_responsibility_version := '';
    end if;
    if new.vendor_responsibility_acknowledged and (
      not new.legal_terms_accepted
      or new.legal_terms_accepted_at is null
      or new.rules_viewed_at is null
      or not new.apple_non_sponsor_acknowledged
      or nullif(btrim(new.legal_terms_version), '') is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'The prize provider must review and accept the applicable rules before accepting its promotion responsibilities.';
    end if;
    if new.enabled and (
      not new.vendor_responsibility_acknowledged
      or new.vendor_responsibility_acknowledged_at is null
      or new.vendor_responsibility_version is distinct from new.legal_terms_version
      or nullif(btrim(new.vendor_responsibility_disclosure_text), '') is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'The prize provider must accept its current promotion responsibilities before enabling this draw.';
    end if;
  elsif tg_table_name = 'qr_bingo_raffle_entries' then
    if new.promotion_responsibility_acknowledged then
      new.promotion_responsibility_version := new.consent_version;
      new.promotion_responsibility_acknowledged_at := coalesce(
        new.promotion_responsibility_acknowledged_at,
        new.consented_at,
        new.rules_viewed_at,
        clock_timestamp()
      );
    end if;
    if tg_op = 'INSERT' then
      participant_audit_changed := true;
    else
      participant_audit_changed :=
        new.promotion_responsibility_acknowledged is distinct from old.promotion_responsibility_acknowledged
        or new.promotion_disclosure_text is distinct from old.promotion_disclosure_text
        or new.promotion_responsibility_version is distinct from old.promotion_responsibility_version;
    end if;
    if participant_audit_changed and (
      not new.promotion_responsibility_acknowledged
      or new.promotion_responsibility_acknowledged_at is null
      or new.promotion_responsibility_version is distinct from new.consent_version
      or nullif(btrim(new.promotion_disclosure_text), '') is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'The entrant must accept the current vendor-promotion responsibility disclosure.';
    end if;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.prepare_qr_bingo_named_vendor_contact_share()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Only the reset RPC's exact audited metadata change can bypass reacceptance.
  if tg_op='UPDATE' and tg_table_name='qr_bingo_raffle_entries' then
    if public.qr_bingo_card_reset_metadata_only(old,new) then return new; end if;
  end if;
  if new.consent_version = '2026-09-01-vendor-marketing'
    and new.entry_method = 'alternate_free_entry'
    and new.contact_share_scope = 'selected_potential_winner_only'
  then
    if coalesce(
      pg_catalog.current_setting(
        'app.qr_bingo_form354_contact_share_confirmed',
        true
      ),
      'false'
    ) <> 'true'
      or not new.consent_share_contact
      or not new.promotion_responsibility_acknowledged
      or new.promotion_responsibility_version is distinct from new.consent_version
      or position(
        format(
          '%s may use those details to administer this specific draw and contact me with wedding-related offers and promotions.',
          new.vendor_name
        )
        in new.promotion_disclosure_text
      ) = 0
      or position(
        'I may unsubscribe from vendor marketing at any time.'
        in new.promotion_disclosure_text
      ) = 0
    then
      raise exception using
        errcode = '23514',
        message = 'The named-vendor contact-sharing and marketing disclosure was not accepted.';
    end if;

    new.contact_share_scope := 'named_vendor_draw_administration';
    new.draw_administration_contact_share_acknowledged := true;
    new.draw_administration_contact_share_acknowledged_at := new.consented_at;
    new.draw_administration_contact_share_version := new.consent_version;
    new.draw_administration_contact_share_consent_text := format(
      'I agree that Wedding Win Inc. may share my name, email address, phone number, wedding date, and entry/consent evidence with %s to administer this specific draw and record my named-vendor marketing consent.',
      new.vendor_name
    );
    new.vendor_marketing_consent := true;
    new.vendor_marketing_consented_at := new.consented_at;
    new.vendor_marketing_consent_text := format(
      'I agree that %s may use my name, email address, phone number, wedding date, and entry/consent evidence to administer this draw and contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time.',
      new.vendor_name
    );
    new.consent_text := format(
      'I submitted the alternate free-entry form and reviewed official rules version %s. Wedding Win Inc. may share my name, email address, phone number, wedding date, and entry/consent evidence with %s. I agree that %s may use those details to administer this draw and contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time. %s',
      new.consent_version,
      new.vendor_name,
      new.vendor_name,
      new.promotion_disclosure_text
    );
  end if;

  return new;
end;
$function$;

create function public.read_qr_bingo_card_reset_cutoffs(p_event_key text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb; total integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service-role authorization required.'; end if;
 if p_event_key is null or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_event_key)>100 then raise exception using errcode='22023',message='Exact event required.'; end if;
 select count(*) into total from public.qr_bingo_card_states where event_key=p_event_key;
 if total>10000 then raise exception using errcode='54000',message='Card cutoff list exceeds its safety limit.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('couple_id',couple_bd_user_id,'generation',generation,'scan_reset_after',scan_reset_after) order by couple_bd_user_id),'[]'::jsonb) into rows from public.qr_bingo_card_states where event_key=p_event_key;
 return jsonb_build_object('ok',true,'action','card_reset_cutoffs','event_key',p_event_key,'rows',rows,'has_more',false);
end;$$;
revoke all on function public.read_qr_bingo_card_reset_cutoffs(text) from public,anon,authenticated;
grant execute on function public.read_qr_bingo_card_reset_cutoffs(text) to service_role;

-- All new state and mutation capabilities remain service-only.
revoke all on function public.read_qr_bingo_card_state(text,text) from public,anon,authenticated;
grant execute on function public.read_qr_bingo_card_state(text,text) to service_role;
revoke all on function public.qr_bingo_card_reset_snapshot(text,text) from public,anon,authenticated;
grant execute on function public.qr_bingo_card_reset_snapshot(text,text) to service_role;
revoke all on function public.admin_reset_qr_bingo_couple_card(text,text,bigint,text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_reset_qr_bingo_couple_card(text,text,bigint,text,uuid,text,text,timestamptz) to service_role;
revoke all on function public.qr_bingo_card_reset_metadata_only(public.qr_bingo_raffle_entries,public.qr_bingo_raffle_entries) from public,anon,authenticated;
grant execute on function public.qr_bingo_card_reset_metadata_only(public.qr_bingo_raffle_entries,public.qr_bingo_raffle_entries) to service_role;
revoke all on function public.enforce_qr_bingo_card_generation() from public,anon,authenticated;
grant execute on function public.enforce_qr_bingo_card_generation() to service_role;
revoke all on function public.save_qr_bingo_card_entry(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_qr_bingo_card_entry(jsonb,uuid) to service_role;
revoke all on function public.save_qr_bingo_fixture_card_scan(text,text,uuid,text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.save_qr_bingo_fixture_card_scan(text,text,uuid,text,bigint,boolean) to service_role;
revoke all on function public.capture_qr_bingo_draw_entry_generation() from public,anon,authenticated;
grant execute on function public.capture_qr_bingo_draw_entry_generation() to service_role;
