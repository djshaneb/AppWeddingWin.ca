-- Separate, nonbinding reviewer state. Never writes production contest, consent,
-- winner or email-delivery tables. No account is provisioned by this migration.
create table public.review_draw_fixtures (
  id uuid primary key default gen_random_uuid(),
  couple_id text not null unique references public.bd_users_cache(user_id) on delete cascade check (couple_id ~ '^[1-9][0-9]{0,17}$' and couple_id not in ('38970','38971')),
  vendor_id text not null unique references public.bd_users_cache(user_id) on delete cascade check (vendor_id ~ '^[1-9][0-9]{0,17}$' and vendor_id not in ('38970','38971')),
  couple_name text not null check (length(btrim(couple_name)) between 1 and 160),
  vendor_name text not null check (length(btrim(vendor_name)) between 1 and 180),
  prize_title text not null check (length(btrim(prize_title)) between 1 and 160),
  prize_description text not null check (length(btrim(prize_description)) between 1 and 1000),
  active boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  operator_note text not null check (length(btrim(operator_note)) between 3 and 500),
  check (couple_id <> vendor_id),
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
comment on table public.review_draw_fixtures is 'Explicit service-only reviewer account pair. No legal acceptance, real prize or external email. Existing screenshot fixtures remain untouched.';

create table public.review_draw_state (
  fixture_id uuid primary key references public.review_draw_fixtures(id) on delete cascade,
  generation bigint not null default 1 check (generation between 1 and 9007199254740990),
  enabled boolean not null default false,
  scanned boolean not null default false,
  entered boolean not null default false,
  draw_id uuid unique,
  selection_status text not null default 'none' check (selection_status in ('none','potential','verified')),
  verified_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (not entered or scanned),
  check ((selection_status='none' and draw_id is null and verified_at is null)
    or (selection_status='potential' and draw_id is not null and verified_at is null and entered)
    or (selection_status='verified' and draw_id is not null and verified_at is not null and entered))
);
comment on table public.review_draw_state is 'Simulated workflow only; entered and verified never attest real contest consent or eligibility.';

create table public.review_draw_notices (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.review_draw_fixtures(id) on delete cascade,
  generation bigint not null check (generation between 1 and 9007199254740990),
  draw_id uuid not null,
  channel text not null check (channel in ('couple','vendor')),
  recipient_member_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(fixture_id,generation,channel)
);
comment on table public.review_draw_notices is 'Explicit test-notification requests, not email delivery receipts. Immutable records remain after resets; old generations cannot be read or delivered.';

alter table public.review_draw_fixtures enable row level security;
alter table public.review_draw_state enable row level security;
alter table public.review_draw_notices enable row level security;
revoke all on public.review_draw_fixtures,public.review_draw_state,public.review_draw_notices from public,anon,authenticated,service_role;
grant select,insert,update on public.review_draw_fixtures to service_role;
grant select,insert,update on public.review_draw_state to service_role;
grant select,insert on public.review_draw_notices to service_role;

create function public.guard_weddingwin_review_draw_fixture() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('weddingwin_nonbinding_review_pairs',0));
  if tg_op='UPDATE' and row(new.id,new.couple_id,new.vendor_id,new.created_at,new.couple_name,new.vendor_name,new.prize_title,new.prize_description)
    is distinct from row(old.id,old.couple_id,old.vendor_id,old.created_at,old.couple_name,old.vendor_name,old.prize_title,old.prize_description) then
    raise exception using errcode='55000',message='Review pair identity and displayed sample are immutable.';
  end if;
  if exists(select 1 from public.review_draw_fixtures f where f.id<>new.id
    and (f.couple_id in(new.couple_id,new.vendor_id) or f.vendor_id in(new.couple_id,new.vendor_id))) then
    raise exception using errcode='23505',message='Review accounts may belong to only one isolated pair.';
  end if;
  return new;
end; $$;
create trigger guard_weddingwin_review_draw_fixture before insert or update on public.review_draw_fixtures for each row execute function public.guard_weddingwin_review_draw_fixture();

create function public.initialize_weddingwin_review_draw_state() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.review_draw_state(fixture_id) values(new.id);
  return new;
end; $$;
create trigger initialize_weddingwin_review_draw_state after insert on public.review_draw_fixtures for each row execute function public.initialize_weddingwin_review_draw_state();

create function public.guard_weddingwin_review_draw_notice() returns trigger
language plpgsql security invoker set search_path='' as $$
declare f public.review_draw_fixtures; s public.review_draw_state;
begin
  if tg_op<>'INSERT' then raise exception using errcode='55000',message='Review notice history is immutable.'; end if;
  select * into f from public.review_draw_fixtures where id=new.fixture_id for update;
  select * into s from public.review_draw_state where fixture_id=f.id for update;
  if not f.active or f.expires_at<=clock_timestamp() or s.selection_status<>'verified'
    or new.generation<>s.generation or new.draw_id<>s.draw_id
    or new.recipient_member_id is distinct from (case when new.channel='couple' then f.couple_id else f.vendor_id end)
    or current_setting('request.weddingwin_review_send',true) is distinct from f.id::text then
    raise exception using errcode='42501',message='Only an explicit verified review Send can create a test notice.';
  end if;
  return new;
end; $$;
create trigger guard_weddingwin_review_draw_notice before insert or update on public.review_draw_notices for each row execute function public.guard_weddingwin_review_draw_notice();

create function public.weddingwin_review_draw_state_payload(p_fixture_id uuid,p_member_id text) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select jsonb_build_object(
    'fixture_id',f.id,'generation',s.generation,'role',case when f.couple_id=p_member_id then 'couple' else 'vendor' end,
    'couple_id',f.couple_id,'vendor_id',f.vendor_id,'couple_name',f.couple_name,'vendor_name',f.vendor_name,
    'prize_title',f.prize_title,'prize_description',f.prize_description,'expires_at',f.expires_at,
    'enabled',s.enabled,'scanned',s.scanned,'entered',s.entered,'draw_id',s.draw_id,'selection_status',s.selection_status,
    'test_notice_id',n.id,'test_notice_at',n.created_at,'skill_question_prompt','What is 3 × 4?',
    'disclosure','Review test only. No real prize, legal agreement or email. Notifications go only to enabled review devices.')
  from public.review_draw_fixtures f join public.review_draw_state s on s.fixture_id=f.id
  left join public.review_draw_notices n on n.fixture_id=f.id and n.generation=s.generation and n.recipient_member_id=p_member_id
  where f.id=p_fixture_id and p_member_id in(f.couple_id,f.vendor_id) and f.active and f.expires_at>clock_timestamp();
$$;

create function public.perform_weddingwin_review_draw_action(
  p_member_id text,p_action text,p_expected_generation bigint default null,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.review_draw_fixtures; s public.review_draw_state; actor_role text; stamp timestamptz; previous_send text;
begin
  if p_member_id is null or p_member_id !~ '^[1-9][0-9]{0,17}$' then
    return jsonb_build_object('ok',false,'code','review_session_required','error','Sign in to the review account.','status',401);
  end if;
  select * into f from public.review_draw_fixtures where p_member_id in(couple_id,vendor_id) for update;
  if f.id is null then
    if p_action in ('review_draw_context','fixture_context') or p_action not like 'review_draw_%' then
      return jsonb_build_object('ok',true,'review_mode',null);
    end if;
    return jsonb_build_object('ok',false,'code','review_unavailable','error','This account has no active review draw.','status',403);
  end if;
  if not f.active or f.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'code','review_expired','error','This review draw is unavailable.','status',403);
  end if;
  if p_action not in ('review_draw_context','fixture_context','review_draw_enable','review_draw_scan','review_draw_entry','review_draw_select','review_draw_verify','review_draw_send','review_draw_reset') then
    return jsonb_build_object('ok',false,'code','review_action_required','error','Use the isolated review draw controls for this account.','status',403);
  end if;
  select * into s from public.review_draw_state where fixture_id=f.id for update;
  if s.fixture_id is null then raise exception 'Review state unavailable'; end if;
  actor_role:=case when p_member_id=f.couple_id then 'couple' else 'vendor' end;
  if p_action not in ('review_draw_context','fixture_context') then
    if p_expected_generation is null or p_expected_generation<>s.generation then
      return jsonb_build_object('ok',false,'code','review_generation_changed','error','Reload this review draw before continuing.','status',409);
    end if;
    if jsonb_typeof(p_payload) is distinct from 'object' then
      return jsonb_build_object('ok',false,'code','invalid_review_request','error','A valid review action is required.','status',400);
    end if;
    if (p_action in ('review_draw_enable','review_draw_select','review_draw_verify','review_draw_send','review_draw_reset') and actor_role<>'vendor')
      or (p_action in ('review_draw_scan','review_draw_entry') and actor_role<>'couple') then
      return jsonb_build_object('ok',false,'code','review_role_required','error','This review action belongs to the other account.','status',403);
    end if;
    stamp:=clock_timestamp();
    if p_action='review_draw_enable' then
      if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then
        return jsonb_build_object('ok',false,'code','invalid_review_request','error','Choose whether the review draw is enabled.','status',400);
      end if;
      update public.review_draw_state set enabled=(p_payload->>'enabled')::boolean,updated_at=stamp where fixture_id=f.id;
    elsif p_action='review_draw_scan' then
      if p_payload->>'vendor_id' is distinct from f.vendor_id then
        return jsonb_build_object('ok',false,'code','review_vendor_mismatch','error','Use this review vendor’s sample QR.','status',403);
      end if;
      update public.review_draw_state set scanned=true,updated_at=stamp where fixture_id=f.id;
    elsif p_action='review_draw_entry' then
      if not s.scanned or not s.enabled then
        return jsonb_build_object('ok',false,'code','review_scan_required','error','Enable the review draw and use its sample QR first.','status',409);
      end if;
      if jsonb_typeof(p_payload->'enter') is distinct from 'boolean' then
        return jsonb_build_object('ok',false,'code','invalid_review_request','error','Choose Yes or No.','status',400);
      end if;
      -- No keeps the sample scan. A later No never erases an existing Yes.
      if (p_payload->>'enter')::boolean then
        update public.review_draw_state set entered=true,updated_at=stamp where fixture_id=f.id;
      end if;
    elsif p_action='review_draw_select' then
      if not s.enabled or not s.entered then
        return jsonb_build_object('ok',false,'code','review_entry_required','error','A simulated entry is required first.','status',409);
      end if;
      if s.selection_status='none' then
        update public.review_draw_state set draw_id=gen_random_uuid(),selection_status='potential',updated_at=stamp where fixture_id=f.id;
      end if;
    elsif p_action='review_draw_verify' then
      if s.selection_status not in ('potential','verified') then
        return jsonb_build_object('ok',false,'code','review_selection_required','error','Select the simulated entrant first.','status',409);
      end if;
      if p_payload->'checks_confirmed' is distinct from 'true'::jsonb or p_payload->>'skill_answer' is distinct from '12' then
        return jsonb_build_object('ok',false,'code','review_checks_required','error','Confirm the simulated checks and answer the sample question.','status',400);
      end if;
      if s.selection_status='potential' then
        update public.review_draw_state set selection_status='verified',verified_at=stamp,updated_at=stamp where fixture_id=f.id;
      end if;
    elsif p_action='review_draw_send' then
      if s.selection_status<>'verified' then
        return jsonb_build_object('ok',false,'code','review_verification_required','error','Complete the simulated verification before sending a test notification.','status',409);
      end if;
      previous_send:=current_setting('request.weddingwin_review_send',true);
      perform set_config('request.weddingwin_review_send',f.id::text,true);
      insert into public.review_draw_notices(fixture_id,generation,draw_id,channel,recipient_member_id,created_at)
        values(f.id,s.generation,s.draw_id,'couple',f.couple_id,stamp),(f.id,s.generation,s.draw_id,'vendor',f.vendor_id,stamp)
        on conflict(fixture_id,generation,channel) do nothing;
      perform set_config('request.weddingwin_review_send',coalesce(previous_send,''),true);
    elsif p_action='review_draw_reset' then
      update public.review_draw_state set generation=generation+1,enabled=false,scanned=false,entered=false,
        draw_id=null,selection_status='none',verified_at=null,updated_at=stamp where fixture_id=f.id;
    end if;
  end if;
  return jsonb_build_object('ok',true,'review_mode','nonbinding_draw_v1','review_state',public.weddingwin_review_draw_state_payload(f.id,p_member_id));
end; $$;

create function public.read_weddingwin_review_draw_notice(p_member_id text,p_notice_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$
  select jsonb_build_object('review_mode','nonbinding_draw_v1','notice_id',n.id,'review_notice_id',n.id,'draw_id',n.draw_id,
    'generation',n.generation,'viewer_role',n.channel,'notice_created_at',n.created_at,
    'review_state',public.weddingwin_review_draw_state_payload(f.id,p_member_id))
  from public.review_draw_notices n join public.review_draw_fixtures f on f.id=n.fixture_id
  join public.review_draw_state s on s.fixture_id=f.id and s.generation=n.generation and s.draw_id=n.draw_id and s.selection_status='verified'
  where n.id=p_notice_id and n.recipient_member_id=p_member_id and p_member_id in(f.couple_id,f.vendor_id)
    and f.active and f.expires_at>clock_timestamp();
$$;

revoke all on function public.guard_weddingwin_review_draw_fixture(),public.initialize_weddingwin_review_draw_state(),public.guard_weddingwin_review_draw_notice(),public.weddingwin_review_draw_state_payload(uuid,text),public.perform_weddingwin_review_draw_action(text,text,bigint,jsonb),public.read_weddingwin_review_draw_notice(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.weddingwin_review_draw_state_payload(uuid,text),public.perform_weddingwin_review_draw_action(text,text,bigint,jsonb),public.read_weddingwin_review_draw_notice(text,uuid) to service_role;
