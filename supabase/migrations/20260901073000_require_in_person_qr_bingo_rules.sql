-- Permit one forward-only transition from the named-vendor marketing rules
-- to the in-person booth-entry rules. The active Niagara event must also adopt
-- the published October 18, 2026 11:00 a.m. ET opening time. Every other event,
-- prize, schedule, eligibility, and vendor term remains immutable.

create or replace function public.gate_activated_qr_bingo_event_material_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_config public.qr_bingo_event_configs%rowtype;
  event_activated boolean := false;
  permitted_in_person_rules_transition boolean := false;
begin
  if not new.published then
    return new;
  end if;

  select config.*
    into previous_config
    from public.qr_bingo_event_configs config
   where config.id is distinct from new.id
     and config.event_key = new.event_key
   order by config.revision desc
   limit 1;

  if previous_config.id is null
    or previous_config.event_key is distinct from new.event_key
  then
    return new;
  end if;

  event_activated := exists (
    select 1
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = previous_config.event_key
       and version.offer_enterable
       and not version.activation_excluded_as_legacy_qa
  ) or exists (
    select 1
      from public.qr_bingo_raffle_entries entry
     where entry.event_key = previous_config.event_key
       and not exists (
         select 1
           from public.qr_bingo_legacy_qa_archives archive
          where archive.entry_id = entry.id
       )
  );

  permitted_in_person_rules_transition :=
    previous_config.event_key = 'niagara-wedding-show-2026'
    and previous_config.rules_version = '2026-09-01-vendor-marketing'
    and new.rules_version = '2026-09-01-in-person-entry'
    and new.history_starts_at =
      timestamptz '2026-10-18 15:00:00+00'
    and row(
      new.event_name,
      new.vendor_tag_id,
      new.official_rules_url,
      new.alternate_free_entry_url,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_opens_at,
      new.draw_at
    ) is not distinct from row(
      previous_config.event_name,
      previous_config.vendor_tag_id,
      previous_config.official_rules_url,
      previous_config.alternate_free_entry_url,
      previous_config.eligibility_region,
      previous_config.entry_closes_at,
      previous_config.draw_opens_at,
      previous_config.draw_at
    );

  if event_activated and row(
    new.event_name,
    new.vendor_tag_id,
    new.history_starts_at,
    new.rules_version,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_opens_at,
    new.draw_at
  ) is distinct from row(
    previous_config.event_name,
    previous_config.vendor_tag_id,
    previous_config.history_starts_at,
    previous_config.rules_version,
    previous_config.official_rules_url,
    previous_config.alternate_free_entry_url,
    previous_config.eligibility_region,
    previous_config.entry_closes_at,
    previous_config.draw_opens_at,
    previous_config.draw_at
  ) and not permitted_in_person_rules_transition then
    raise exception using
      errcode = '55000',
      message = 'Material QR Bingo event terms cannot change after an offer opens or a real entry exists; publish a new event instead.';
  end if;

  return new;
end;
$$;

revoke all on function public.gate_activated_qr_bingo_event_material_publish()
  from public, anon, authenticated, service_role;

create or replace function public.lock_activated_qr_bingo_offer_material_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permitted_in_person_rules_transition boolean := false;
begin
  permitted_in_person_rules_transition :=
    old.legal_terms_version = '2026-09-01-vendor-marketing'
    and new.legal_terms_version = '2026-09-01-in-person-entry'
    and position(
      'contact me with wedding-related offers and promotions'
      in new.participant_responsibility_disclosure_text
    ) > 0
    and position(
      'unsubscribe from vendor marketing'
      in new.participant_responsibility_disclosure_text
    ) > 0
    and position(
      'visited this vendor booth in person'
      in lower(new.participant_responsibility_disclosure_text)
    ) > 0
    and row(
      new.vendor_bd_user_id,
      new.vendor_name,
      new.prize_title,
      new.prize_description,
      new.prize_approx_value_cad,
      new.official_rules_url,
      new.administrator_name,
      new.co_sponsor_name,
      new.prize_provider_name,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_opens_at,
      new.draw_at,
      new.odds_basis,
      new.no_purchase_required,
      new.skill_testing_question_required,
      new.alternate_free_entry_url,
      new.max_winners,
      new.exclude_previous_winners
    ) is not distinct from row(
      old.vendor_bd_user_id,
      old.vendor_name,
      old.prize_title,
      old.prize_description,
      old.prize_approx_value_cad,
      old.official_rules_url,
      old.administrator_name,
      old.co_sponsor_name,
      old.prize_provider_name,
      old.eligibility_region,
      old.entry_closes_at,
      old.draw_opens_at,
      old.draw_at,
      old.odds_basis,
      old.no_purchase_required,
      old.skill_testing_question_required,
      old.alternate_free_entry_url,
      old.max_winners,
      old.exclude_previous_winners
    );

  if exists (
    select 1
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = old.event_key
       and version.vendor_bingo_id = old.vendor_bingo_id
       and version.offer_enterable
       and not version.activation_excluded_as_legacy_qa
  ) and row(
    new.vendor_bd_user_id,
    new.vendor_name,
    new.prize_title,
    new.prize_description,
    new.prize_approx_value_cad,
    new.legal_terms_version,
    new.official_rules_url,
    new.administrator_name,
    new.co_sponsor_name,
    new.prize_provider_name,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_opens_at,
    new.draw_at,
    new.odds_basis,
    new.no_purchase_required,
    new.skill_testing_question_required,
    new.alternate_free_entry_url,
    new.participant_responsibility_disclosure_text,
    new.max_winners,
    new.exclude_previous_winners
  ) is distinct from row(
    old.vendor_bd_user_id,
    old.vendor_name,
    old.prize_title,
    old.prize_description,
    old.prize_approx_value_cad,
    old.legal_terms_version,
    old.official_rules_url,
    old.administrator_name,
    old.co_sponsor_name,
    old.prize_provider_name,
    old.eligibility_region,
    old.entry_closes_at,
    old.draw_opens_at,
    old.draw_at,
    old.odds_basis,
    old.no_purchase_required,
    old.skill_testing_question_required,
    old.alternate_free_entry_url,
    old.participant_responsibility_disclosure_text,
    old.max_winners,
    old.exclude_previous_winners
  ) and not permitted_in_person_rules_transition then
    raise exception using
      errcode = '55000',
      message = 'Vendor offer terms cannot change after the offer first opens; create a new promotion version.';
  end if;

  return new;
end;
$$;

revoke all on function public.lock_activated_qr_bingo_offer_material_terms()
  from public, anon, authenticated, service_role;

create or replace function public.lock_entered_qr_bingo_material_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permitted_in_person_rules_transition boolean := false;
begin
  permitted_in_person_rules_transition :=
    old.legal_terms_version = '2026-09-01-vendor-marketing'
    and new.legal_terms_version = '2026-09-01-in-person-entry'
    and position(
      'contact me with wedding-related offers and promotions'
      in new.participant_responsibility_disclosure_text
    ) > 0
    and position(
      'unsubscribe from vendor marketing'
      in new.participant_responsibility_disclosure_text
    ) > 0
    and position(
      'visited this vendor booth in person'
      in lower(new.participant_responsibility_disclosure_text)
    ) > 0
    and row(
      new.prize_title,
      new.prize_description,
      new.prize_approx_value_cad,
      new.official_rules_url,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_at,
      new.draw_opens_at,
      new.odds_basis,
      new.no_purchase_required,
      new.skill_testing_question_required,
      new.prize_provider_name,
      new.alternate_free_entry_url,
      new.max_winners,
      new.exclude_previous_winners
    ) is not distinct from row(
      old.prize_title,
      old.prize_description,
      old.prize_approx_value_cad,
      old.official_rules_url,
      old.eligibility_region,
      old.entry_closes_at,
      old.draw_at,
      old.draw_opens_at,
      old.odds_basis,
      old.no_purchase_required,
      old.skill_testing_question_required,
      old.prize_provider_name,
      old.alternate_free_entry_url,
      old.max_winners,
      old.exclude_previous_winners
    );

  if exists (
    select 1
      from public.qr_bingo_raffle_entries entry
     where entry.event_key = old.event_key
       and entry.vendor_bingo_id = old.vendor_bingo_id
       and not exists (
         select 1
           from public.qr_bingo_legacy_qa_archives archive
          where archive.entry_id = entry.id
       )
  ) and row(
    new.prize_title,
    new.prize_description,
    new.prize_approx_value_cad,
    new.legal_terms_version,
    new.official_rules_url,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_at,
    new.draw_opens_at,
    new.odds_basis,
    new.no_purchase_required,
    new.skill_testing_question_required,
    new.prize_provider_name,
    new.alternate_free_entry_url,
    new.participant_responsibility_disclosure_text,
    new.max_winners,
    new.exclude_previous_winners
  ) is distinct from row(
    old.prize_title,
    old.prize_description,
    old.prize_approx_value_cad,
    old.legal_terms_version,
    old.official_rules_url,
    old.eligibility_region,
    old.entry_closes_at,
    old.draw_at,
    old.draw_opens_at,
    old.odds_basis,
    old.no_purchase_required,
    old.skill_testing_question_required,
    old.prize_provider_name,
    old.alternate_free_entry_url,
    old.participant_responsibility_disclosure_text,
    old.max_winners,
    old.exclude_previous_winners
  ) and not permitted_in_person_rules_transition then
    raise exception using
      errcode = '55000',
      message = 'Prize and draw terms cannot change after the first entry; create a new promotion version.';
  end if;

  return new;
end;
$$;

revoke all on function public.lock_entered_qr_bingo_material_terms()
  from public, anon, authenticated, service_role;

comment on function public.gate_activated_qr_bingo_event_material_publish() is
  'Locks activated event terms, with one exact marketing-to-in-person rules transition that preserves every non-consent material term.';

comment on function public.lock_activated_qr_bingo_offer_material_terms() is
  'Locks activated vendor-offer terms, with one exact marketing-to-in-person rules transition that creates a new immutable offer snapshot without changing the prize.';

comment on function public.lock_entered_qr_bingo_material_terms() is
  'Locks entered vendor-offer terms, with one exact marketing-to-in-person rules transition; historical entries retain their original immutable acceptance.';

create or replace function public.enforce_qr_bingo_current_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicable_rules_version text;
  submitted_offer_version timestamptz;
begin
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
      or coalesce(position(
        'visited this vendor booth in person'
        in lower(new.promotion_disclosure_text)
      ), 0) = 0
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
$$;

revoke all on function public.enforce_qr_bingo_current_rules()
  from public, anon, authenticated, service_role;

-- Replace the initial paired-proof guard with a production window check that
-- uses the published opening timestamp. Isolated fixtures remain an explicit,
-- exact-account bypass and still require the paired server proof.
create or replace function public.require_new_qr_bingo_in_show_scan_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_config public.qr_bingo_event_configs%rowtype;
  active_fixture boolean := false;
begin
  if new.entry_method <> 'qr_scan_opt_in' then
    return new;
  end if;

  if new.in_show_scan_verified is distinct from true
    or new.in_show_scan_verified_at is null
  then
    raise exception using
      errcode = '23514',
      message = 'in_show_scan_verification_required';
  end if;

  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
     and config.event_key = new.event_key
   order by config.revision desc
   limit 1
   for share;

  if current_config.id is not null then
    if current_config.rules_version <> '2026-09-01-in-person-entry'
      or new.in_show_scan_verified_at < current_config.history_starts_at
      or new.in_show_scan_verified_at >= current_config.entry_closes_at
    then
      raise exception using
        errcode = '23514',
        message = 'in_show_scan_verification_outside_published_window';
    end if;
    return new;
  end if;

  active_fixture := exists (
    select 1
      from public.app_review_raffle_fixtures fixture
     where fixture.event_key = new.event_key
       and fixture.vendor_bingo_id = new.vendor_bingo_id
       and fixture.vendor_bd_user_id = new.vendor_bd_user_id
       and fixture.enabled
       and fixture.expires_at > clock_timestamp()
       and (
         fixture.couple_bd_user_id = new.couple_bd_user_id
         or exists (
           select 1
             from public.app_review_raffle_fixture_participants participant
            where participant.fixture_id = fixture.id
              and participant.couple_bd_user_id = new.couple_bd_user_id
         )
       )
  ) or exists (
    select 1
      from public.qr_bingo_email_test_fixtures fixture
     where fixture.event_key = new.event_key
       and fixture.vendor_bingo_id = new.vendor_bingo_id
       and fixture.vendor_bd_user_id = new.vendor_bd_user_id
       and fixture.couple_bd_user_id = new.couple_bd_user_id
       and fixture.enabled
       and fixture.expires_at > clock_timestamp()
  );

  if not active_fixture then
    raise exception using
      errcode = '23514',
      message = 'in_show_scan_verification_required';
  end if;

  return new;
end;
$$;

revoke all on function public.require_new_qr_bingo_in_show_scan_proof()
  from public, anon, authenticated, service_role;

comment on function public.require_new_qr_bingo_in_show_scan_proof() is
  'Requires paired server proof inside the published production history_starts_at/entry_closes_at window; only an active exact-account isolated fixture bypasses production time.';

comment on column public.qr_bingo_raffle_entries.contact_share_scope is
  'named_vendor_draw_administration remains the recorded contact-sharing scope. Rules version 2026-09-01-in-person-entry additionally requires a verified in-show booth QR scan for production selection.';
comment on column public.qr_bingo_raffle_entries.vendor_marketing_consent is
  'True only after explicit named-vendor marketing consent. Production selection additionally requires current 2026-09-01-in-person-entry consent and paired in-show scan proof.';
