-- Add a truthful vendor-administered verification path without fabricating a
-- platform-checked answer or rewriting any historical selection/evidence.
-- Existing answer-review RPC and immutable prize/entry policy remain intact.

alter table public.qr_bingo_raffle_draws
  add column if not exists skill_question_vendor_attested_at timestamptz,
  add column if not exists skill_question_vendor_attested_by text not null default '',
  add column if not exists skill_question_vendor_attestation text not null default '';

comment on column public.qr_bingo_raffle_draws.skill_question_verified_at is
  'Historical platform answer-check timestamp. Vendor-administered verification never populates this field.';
comment on column public.qr_bingo_raffle_draws.skill_question_vendor_attested_at is
  'Time the authenticated vendor attested that it completed required skill-testing verification outside Wedding Win; not a Wedding Win answer check.';
comment on column public.qr_bingo_raffle_draws.skill_question_vendor_attested_by is
  'Exact authenticated vendor reviewer bound to this selection and its verified_by field.';
comment on column public.qr_bingo_raffle_draws.skill_question_vendor_attestation is
  'Exact server-recorded external-verification attestation; historical platform proofs remain separate.';

create or replace function public.qr_bingo_skill_verification_complete(
  p_draw public.qr_bingo_raffle_draws
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    (p_draw).skill_question_verified_at is not null
    or (
      (p_draw).skill_question_vendor_attested_at is not null
      and (p_draw).vendor_bd_user_id ~ '^[1-9][0-9]{0,19}$'
      and (p_draw).skill_question_vendor_attested_by = (p_draw).verified_by
      and starts_with((p_draw).skill_question_vendor_attested_by,
        'vendor:' || (p_draw).vendor_bd_user_id || ':')
      and length((p_draw).skill_question_vendor_attested_by) >
        length('vendor:' || (p_draw).vendor_bd_user_id || ':')
      and (p_draw).skill_question_vendor_attestation =
        'The vendor confirms it independently completed the required skill-testing verification outside Wedding Win and retained evidence. Wedding Win records this attestation and did not check the answer.'
      and (p_draw).winner_rules_confirmed_at is not null
      and nullif(btrim((p_draw).verification_notes), '') is not null
    ), false
  );
$$;
revoke all on function public.qr_bingo_skill_verification_complete(public.qr_bingo_raffle_draws)
  from public, anon, authenticated, service_role;
grant execute on function public.qr_bingo_skill_verification_complete(public.qr_bingo_raffle_draws)
  to service_role;

create or replace function public.qr_bingo_winner_evidence_valid(p_notes text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  evidence text[];
  evidence_date date;
begin
  if p_notes is null or length(p_notes) > 1100 then return false; end if;
  -- PostgreSQL ARE repetition limits stop at255; enforce field sizes below
  -- instead of using invalid {1,300}/{1,400} repetition bounds.
  evidence := regexp_match(p_notes,
    E'^Date: ([0-9]{4}-[0-9]{2}-[0-9]{2})\nMethod: ([^\n]+)\nReference: ([^\n]+)(?:\nAdditional notes: ([^\n]+))?$');
  if evidence is null then return false; end if;
  evidence_date := evidence[1]::date;
  if to_char(evidence_date, 'YYYY-MM-DD') <> evidence[1]
    or btrim(evidence[2]) = '' or btrim(evidence[3]) = ''
    or length(evidence[2]) > 300 or length(evidence[3]) > 300
    or length(evidence[4]) > 400
    or (evidence[4] is not null and btrim(evidence[4]) = '')
    or concat(evidence[2], evidence[3], evidence[4]) ~ '[<>[:cntrl:]]'
    or position(chr(8232) in p_notes) > 0
    or position(chr(8233) in p_notes) > 0
  then return false; end if;
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function public.qr_bingo_winner_evidence_valid(text)
  from public, anon, authenticated, service_role;
grant execute on function public.qr_bingo_winner_evidence_valid(text) to service_role;

create or replace function public.attest_qr_bingo_potential_winner_by_vendor(
  p_draw_id uuid,
  p_event_key text,
  p_vendor_bingo_id text,
  p_vendor_bd_user_id text,
  p_decision text,
  p_eligibility_confirmed boolean default false,
  p_skill_testing_completed_externally boolean default false,
  p_rules_release_confirmed boolean default false,
  p_reviewed_by text default '',
  p_notes text default ''
)
returns public.qr_bingo_raffle_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewed public.qr_bingo_raffle_draws%rowtype;
  current_config public.qr_bingo_event_configs%rowtype;
  attested_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_decision is distinct from 'verified'
    or p_vendor_bd_user_id !~ '^[1-9][0-9]{0,19}$'
    or p_vendor_bingo_id is distinct from p_vendor_bd_user_id
    or not coalesce(starts_with(p_reviewed_by, 'vendor:' || p_vendor_bd_user_id || ':'), false)
    or length(p_reviewed_by) <= length('vendor:' || p_vendor_bd_user_id || ':')
    or length(p_reviewed_by) > 300 or p_reviewed_by ~ '[<>[:cntrl:]]'
    or p_eligibility_confirmed is distinct from true
    or p_skill_testing_completed_externally is distinct from true
    or p_rules_release_confirmed is distinct from true
    or not public.qr_bingo_winner_evidence_valid(p_notes)
  then
    raise exception using errcode = '22023', message = 'An exact vendor, completed external verification, eligibility, rules/release confirmation, and valid dated evidence are required.';
  end if;

  select * into current_config
    from public.qr_bingo_event_configs
   where published order by revision desc limit 1 for share;
  select * into reviewed
    from public.qr_bingo_raffle_draws
   where id = p_draw_id and event_key = btrim(coalesce(p_event_key, ''))
     and vendor_bingo_id = p_vendor_bingo_id
     and vendor_bd_user_id = p_vendor_bd_user_id
   for update;
  if reviewed.id is null then
    raise exception using errcode = '42501', message = 'Potential-winner selection was not found for this vendor.';
  end if;
  if reviewed.selection_status <> 'potential' then
    raise exception using errcode = '55000', message = 'Only a pending potential winner can be reviewed.';
  end if;
  if current_config.id is null
    or reviewed.rules_version is distinct from current_config.rules_version
    or reviewed.official_rules_url is distinct from current_config.official_rules_url
  then
    raise exception using errcode = '55000', message = 'Current draw rules are required before vendor verification.';
  end if;
  if reviewed.event_key is distinct from current_config.event_key and not (
    exists (
      select 1 from public.qr_bingo_email_test_fixtures fixture
       where fixture.enabled and fixture.expires_at > clock_timestamp()
         and fixture.event_key = reviewed.event_key
         and fixture.vendor_bingo_id = reviewed.vendor_bingo_id
         and fixture.vendor_bd_user_id = reviewed.vendor_bd_user_id
         and fixture.couple_bd_user_id = reviewed.couple_bd_user_id
    ) or exists (
      select 1 from public.app_review_raffle_fixtures fixture
       where fixture.enabled and fixture.expires_at > clock_timestamp()
         and fixture.event_key = reviewed.event_key
         and fixture.vendor_bingo_id = reviewed.vendor_bingo_id
         and fixture.vendor_bd_user_id = reviewed.vendor_bd_user_id
         and (fixture.couple_bd_user_id = reviewed.couple_bd_user_id or exists (
           select 1 from public.app_review_raffle_fixture_participants participant
            where participant.fixture_id = fixture.id
              and participant.couple_bd_user_id = reviewed.couple_bd_user_id
         ))
    )
  ) then
    raise exception using errcode = '42501', message = 'An active exact-account fixture or the current production event is required.';
  end if;

  update public.qr_bingo_raffle_draws
     set selection_status = 'verified',
         eligibility_verified_at = attested_at,
         winner_rules_confirmed_at = attested_at,
         verified_at = attested_at,
         verified_by = p_reviewed_by,
         verification_notes = p_notes,
         skill_question_vendor_attested_at = attested_at,
         skill_question_vendor_attested_by = p_reviewed_by,
         skill_question_vendor_attestation =
           'The vendor confirms it independently completed the required skill-testing verification outside Wedding Win and retained evidence. Wedding Win records this attestation and did not check the answer.'
   where id = reviewed.id
   returning * into reviewed;
  return reviewed;
end;
$$;
revoke all on function public.attest_qr_bingo_potential_winner_by_vendor(
  uuid, text, text, text, text, boolean, boolean, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.attest_qr_bingo_potential_winner_by_vendor(
  uuid, text, text, text, text, boolean, boolean, boolean, text, text
) to service_role;

-- Replace only the proof predicate in every existing completion boundary. Keep
-- ownership, current rules, isolation, exact recipients, open state, one-entry
-- checks, token-fenced leases, idempotency and reconciliation unchanged. Abort on
-- unexpected function text rather than silently publishing a partial update.
do $migration$
declare
  target record;
  definition text;
  old_guard text;
  new_guard text;
  old_count integer;
  new_count integer;
begin
  for target in select * from (values
    ('public.enforce_qr_bingo_draw_verification()', 'new', 2),
    ('public.claim_qr_bingo_draw_email_delivery(uuid,text,integer)', 'current_draw', 1),
    ('public.claim_qr_bingo_test_draw_email_delivery(uuid,text,integer)', 'current_draw', 1),
    ('public.finalize_qr_bingo_draw_email_delivery(text,uuid,text,text,text)', 'current_draw', 1),
    ('public.reconcile_qr_bingo_draw_email_delivery(text,text,text,text)', 'current_draw', 1)
  ) as targets(signature, row_name, expected_count)
  loop
    definition := pg_get_functiondef(target.signature::regprocedure);
    old_guard := target.row_name || '.skill_question_verified_at is null';
    new_guard := 'not public.qr_bingo_skill_verification_complete(' || target.row_name || ')';
    old_count := (length(definition) - length(replace(definition, old_guard, ''))) / length(old_guard);
    new_count := (length(definition) - length(replace(definition, new_guard, ''))) / length(new_guard);
    if old_count = target.expected_count and new_count = 0 then
      execute replace(definition, old_guard, new_guard);
    elsif old_count = 0 and new_count = target.expected_count then
      continue;
    else
      raise exception 'Unexpected QR Bingo verification guard in %', target.signature;
    end if;
  end loop;
end;
$migration$;
