-- Give the authenticated prize-provider workflow a complete, auditable
-- potential-winner verification step. The secret answer material remains in
-- service-role-only tables and is never returned by the public/vendor DTO.

create extension if not exists pgcrypto with schema extensions;

alter table public.qr_bingo_raffle_draws
  add column if not exists skill_question_prompt text not null default '',
  add column if not exists skill_question_salt text not null default '',
  add column if not exists skill_question_answer_hash text not null default '',
  add column if not exists winner_rules_confirmed_at timestamptz;

alter table public.qr_bingo_raffle_draws
  add constraint qr_bingo_verified_winner_release_evidence_required
    check (
      selection_status <> 'verified'
      or (
        winner_rules_confirmed_at is not null
        and nullif(btrim(verification_notes), '') is not null
      )
    ) not valid;

comment on column public.qr_bingo_raffle_draws.skill_question_prompt is
  'Mathematical skill-testing question that the named vendor must administer to the potential winner.';
comment on column public.qr_bingo_raffle_draws.skill_question_salt is
  'Service-role-only salt used to verify the answer; never expose in a vendor or public response.';
comment on column public.qr_bingo_raffle_draws.skill_question_answer_hash is
  'SHA-256(salt:normalized answer); never expose in a vendor or public response.';
comment on column public.qr_bingo_raffle_draws.winner_rules_confirmed_at is
  'Time the named vendor confirmed that the potential winner accepted the applicable rules/release requirements.';

-- A pre-migration verified selection that never sent either fulfillment notice
-- has no recorded rules/release evidence and would otherwise be permanently
-- stuck: the new email gate rejects it, while the review RPC accepts only a
-- potential selection. Reopen only those unnotified selections for the vendor
-- to complete the stronger review. Never rewrite a selection after any notice.
update public.qr_bingo_raffle_draws
   set selection_status = 'potential',
       eligibility_verified_at = null,
       skill_question_verified_at = null,
       verified_at = null,
       verified_by = null,
       verification_notes = '',
       winner_rules_confirmed_at = null
 where selection_status = 'verified'
   and vendor_email_sent_at is null
   and couple_email_sent_at is null
   and winner_rules_confirmed_at is null;

-- Give any already-pending pre-migration selection a valid challenge without
-- rewriting its historical selection or consent snapshot.
with pending as (
  select id, encode(extensions.gen_random_bytes(16), 'hex') as salt
    from public.qr_bingo_raffle_draws
   where selection_status = 'potential'
     and nullif(btrim(skill_question_prompt), '') is null
)
update public.qr_bingo_raffle_draws draws
   set skill_question_prompt = 'Without assistance, what is 12 + 7?',
       skill_question_salt = pending.salt,
       skill_question_answer_hash = encode(
         extensions.digest(convert_to(pending.salt || ':19', 'UTF8'), 'sha256'),
         'hex'
       )
  from pending
 where draws.id = pending.id;

create or replace function public.review_qr_bingo_potential_winner_by_vendor(
  p_draw_id uuid,
  p_event_key text,
  p_vendor_bingo_id text,
  p_vendor_bd_user_id text,
  p_decision text,
  p_eligibility_confirmed boolean default false,
  p_skill_question_answer text default '',
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
  reviewed public.qr_bingo_raffle_draws;
  supplied_hash text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service-role authorization is required.';
  end if;

  select * into reviewed
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
     and event_key = btrim(coalesce(p_event_key, ''))
     and vendor_bingo_id = btrim(coalesce(p_vendor_bingo_id, ''))
     and vendor_bd_user_id = btrim(coalesce(p_vendor_bd_user_id, ''))
   for update;

  if not found then
    raise exception 'Potential-winner selection was not found for this vendor.';
  end if;
  if reviewed.selection_status <> 'potential' then
    raise exception 'Only a potential-winner selection can be reviewed.';
  end if;
  if nullif(btrim(p_reviewed_by), '') is null then
    raise exception 'An identified vendor reviewer is required.';
  end if;

  if p_decision = 'verified' then
    if not p_eligibility_confirmed or not p_rules_release_confirmed
      or nullif(btrim(p_notes), '') is null
    then
      raise exception 'Eligibility, the vendor rules/release attestation, and its dated verification evidence are required.';
    end if;
    if nullif(btrim(reviewed.skill_question_prompt), '') is null
      or nullif(btrim(reviewed.skill_question_salt), '') is null
      or nullif(btrim(reviewed.skill_question_answer_hash), '') is null
      or nullif(btrim(p_skill_question_answer), '') is null
    then
      raise exception 'A valid skill-testing question and answer are required.';
    end if;

    supplied_hash := encode(
      extensions.digest(
        convert_to(
          reviewed.skill_question_salt || ':' || lower(btrim(p_skill_question_answer)),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    if supplied_hash <> reviewed.skill_question_answer_hash then
      raise exception 'The skill-testing answer is incorrect.';
    end if;

    update public.qr_bingo_raffle_draws
       set selection_status = 'verified',
           eligibility_verified_at = now(),
           skill_question_verified_at = now(),
           winner_rules_confirmed_at = now(),
           verified_at = now(),
           verified_by = btrim(p_reviewed_by),
           verification_notes = btrim(p_notes)
     where id = p_draw_id
     returning * into reviewed;
  elsif p_decision = 'disqualified' then
    if nullif(btrim(p_notes), '') is null then
      raise exception 'A disqualification reason is required.';
    end if;
    update public.qr_bingo_raffle_draws
       set selection_status = 'disqualified',
           disqualified_at = now(),
           disqualification_reason = btrim(p_notes),
           verified_by = btrim(p_reviewed_by)
     where id = p_draw_id
     returning * into reviewed;
  else
    raise exception 'Decision must be verified or disqualified.';
  end if;

  return reviewed;
end;
$$;

revoke all on function public.review_qr_bingo_potential_winner_by_vendor(
  uuid, text, text, text, text, boolean, text, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.review_qr_bingo_potential_winner_by_vendor(
  uuid, text, text, text, text, boolean, text, boolean, text, text
) to service_role;

-- Retire the pre-release verification shortcut. It accepted a caller-supplied
-- skill boolean and did not record the vendor's winner rules/release
-- attestation, so it must not remain callable after this migration.
revoke execute on function public.review_qr_bingo_potential_winner(
  uuid, text, boolean, boolean, text, text
) from service_role;

-- Email delivery must pass through a release-aware gate. The older claim RPCs
-- remain as private implementation details for their token-fenced ledger, but
-- the service role can no longer call them directly.
create or replace function public.claim_verified_qr_bingo_draw_email_delivery(
  p_draw_id uuid,
  p_channel text,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_draw public.qr_bingo_raffle_draws%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  select * into current_draw
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
   for update;
  if current_draw.id is null
    or current_draw.selection_status <> 'verified'
    or current_draw.winner_rules_confirmed_at is null
    or nullif(btrim(current_draw.verification_notes), '') is null
  then
    raise exception using errcode = '55000', message = 'Vendor rules/release attestation and dated evidence are required before email delivery.';
  end if;
  return public.claim_qr_bingo_draw_email_delivery(p_draw_id, p_channel, p_lease_seconds);
end;
$$;

revoke all on function public.claim_qr_bingo_draw_email_delivery(uuid, text, integer)
  from service_role;
revoke all on function public.claim_verified_qr_bingo_draw_email_delivery(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_verified_qr_bingo_draw_email_delivery(uuid, text, integer)
  to service_role;

create or replace function public.claim_verified_qr_bingo_test_draw_email_delivery(
  p_draw_id uuid,
  p_channel text,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_draw public.qr_bingo_raffle_draws%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  select * into current_draw
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
   for update;
  if current_draw.id is null
    or current_draw.selection_status <> 'verified'
    or current_draw.winner_rules_confirmed_at is null
    or nullif(btrim(current_draw.verification_notes), '') is null
  then
    raise exception using errcode = '55000', message = 'Vendor rules/release attestation and dated evidence are required before test email delivery.';
  end if;
  return public.claim_qr_bingo_test_draw_email_delivery(p_draw_id, p_channel, p_lease_seconds);
end;
$$;

revoke all on function public.claim_qr_bingo_test_draw_email_delivery(uuid, text, integer)
  from service_role;
revoke all on function public.claim_verified_qr_bingo_test_draw_email_delivery(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_verified_qr_bingo_test_draw_email_delivery(uuid, text, integer)
  to service_role;
