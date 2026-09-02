-- A couple who affirmatively enters a named vendor draw under the new rules
-- grants that exact vendor permission to use the submitted draw contact fields
-- for the draw and for wedding-related marketing. Historical entries remain
-- unchanged and are excluded from current exports until the couple explicitly
-- accepts the new rules version.

alter table if exists public.qr_bingo_participation_report_audit
  drop constraint if exists qr_bingo_participation_report_audit_no_marketing_data;

do $migration$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_participation_report_audit'::regclass
       and conname = 'qr_bingo_participation_report_audit_marketing_scope_valid'
  ) then
    alter table public.qr_bingo_participation_report_audit
      add constraint qr_bingo_participation_report_audit_marketing_scope_valid
      check (
        not marketing_consent_included
        or (
          report_kind = 'named_vendor_draw_contacts'
          and contains_contact_data
          and contact_share_scope = 'named_vendor_draw_administration'
          and rules_version = '2026-09-01-vendor-marketing'
        )
      ) not valid;
  end if;
end;
$migration$;

alter table if exists public.qr_bingo_entrant_consent_acceptance_audit
  add column if not exists vendor_marketing_consent boolean not null default false,
  add column if not exists vendor_marketing_consent_text text not null default '',
  add column if not exists vendor_marketing_consented_at timestamptz;

do $migration$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_entrant_consent_acceptance_audit'::regclass
       and conname = 'qr_bingo_entrant_consent_audit_marketing_proof_complete'
  ) then
    alter table public.qr_bingo_entrant_consent_acceptance_audit
      add constraint qr_bingo_entrant_consent_audit_marketing_proof_complete
      check (
        (
          not vendor_marketing_consent
          and vendor_marketing_consented_at is null
          and btrim(vendor_marketing_consent_text) = ''
        )
        or (
          vendor_marketing_consent
          and vendor_marketing_consented_at is not null
          and btrim(vendor_marketing_consent_text) <> ''
          and length(vendor_marketing_consent_text) <= 2000
          and vendor_marketing_consent_text !~ '[[:cntrl:]]'
        )
      ) not valid;
  end if;
end;
$migration$;

create or replace function public.record_qr_bingo_entrant_consent_snapshot(
  p_entry public.qr_bingo_raffle_entries,
  p_snapshot_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.qr_bingo_entrant_consent_acceptance_audit (
    entry_id,
    event_key,
    vendor_bingo_id,
    vendor_bd_user_id,
    couple_bd_user_id,
    entry_method,
    vendor_offer_version,
    consent_share_contact,
    contact_share_scope,
    consent_text,
    consent_version,
    consented_at,
    draw_administration_contact_share_acknowledged,
    draw_administration_contact_share_acknowledged_at,
    draw_administration_contact_share_version,
    draw_administration_contact_share_consent_text,
    vendor_marketing_consent,
    vendor_marketing_consent_text,
    vendor_marketing_consented_at,
    promotion_responsibility_acknowledged,
    promotion_disclosure_text,
    promotion_responsibility_acknowledged_at,
    promotion_responsibility_version,
    age_of_majority_attested,
    residency_attested,
    exclusions_attested,
    eligibility_attested_at,
    eligibility_attestation_text,
    official_rules_url,
    rules_viewed_at,
    apple_non_sponsor_acknowledged,
    snapshot_reason
  ) values (
    p_entry.id,
    p_entry.event_key,
    p_entry.vendor_bingo_id,
    p_entry.vendor_bd_user_id,
    p_entry.couple_bd_user_id,
    p_entry.entry_method,
    p_entry.vendor_offer_version,
    p_entry.consent_share_contact,
    p_entry.contact_share_scope,
    p_entry.consent_text,
    p_entry.consent_version,
    p_entry.consented_at,
    p_entry.draw_administration_contact_share_acknowledged,
    p_entry.draw_administration_contact_share_acknowledged_at,
    p_entry.draw_administration_contact_share_version,
    p_entry.draw_administration_contact_share_consent_text,
    p_entry.vendor_marketing_consent,
    p_entry.vendor_marketing_consent_text,
    p_entry.vendor_marketing_consented_at,
    p_entry.promotion_responsibility_acknowledged,
    p_entry.promotion_disclosure_text,
    p_entry.promotion_responsibility_acknowledged_at,
    p_entry.promotion_responsibility_version,
    p_entry.age_of_majority_attested,
    p_entry.residency_attested,
    p_entry.exclusions_attested,
    p_entry.eligibility_attested_at,
    p_entry.eligibility_attestation_text,
    p_entry.official_rules_url,
    p_entry.rules_viewed_at,
    p_entry.apple_non_sponsor_acknowledged,
    p_snapshot_reason
  )
  on conflict (
    entry_id,
    consented_at,
    consent_version,
    contact_share_scope
  ) do nothing;
end;
$$;

revoke all on function public.record_qr_bingo_entrant_consent_snapshot(
  public.qr_bingo_raffle_entries,
  text
) from public, anon, authenticated, service_role;

create or replace function public.audit_qr_bingo_entrant_consent_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acceptance_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    perform public.record_qr_bingo_entrant_consent_snapshot(
      new,
      'initial_acceptance'
    );
    return new;
  end if;

  acceptance_changed := row(
    new.vendor_offer_version,
    new.consent_share_contact,
    new.contact_share_scope,
    new.consent_text,
    new.consent_version,
    new.consented_at,
    new.draw_administration_contact_share_acknowledged,
    new.draw_administration_contact_share_acknowledged_at,
    new.draw_administration_contact_share_version,
    new.draw_administration_contact_share_consent_text,
    new.vendor_marketing_consent,
    new.vendor_marketing_consent_text,
    new.vendor_marketing_consented_at,
    new.promotion_responsibility_acknowledged,
    new.promotion_disclosure_text,
    new.promotion_responsibility_acknowledged_at,
    new.promotion_responsibility_version,
    new.age_of_majority_attested,
    new.residency_attested,
    new.exclusions_attested,
    new.eligibility_attested_at,
    new.eligibility_attestation_text,
    new.official_rules_url,
    new.rules_viewed_at,
    new.apple_non_sponsor_acknowledged
  ) is distinct from row(
    old.vendor_offer_version,
    old.consent_share_contact,
    old.contact_share_scope,
    old.consent_text,
    old.consent_version,
    old.consented_at,
    old.draw_administration_contact_share_acknowledged,
    old.draw_administration_contact_share_acknowledged_at,
    old.draw_administration_contact_share_version,
    old.draw_administration_contact_share_consent_text,
    old.vendor_marketing_consent,
    old.vendor_marketing_consent_text,
    old.vendor_marketing_consented_at,
    old.promotion_responsibility_acknowledged,
    old.promotion_disclosure_text,
    old.promotion_responsibility_acknowledged_at,
    old.promotion_responsibility_version,
    old.age_of_majority_attested,
    old.residency_attested,
    old.exclusions_attested,
    old.eligibility_attested_at,
    old.eligibility_attestation_text,
    old.official_rules_url,
    old.rules_viewed_at,
    old.apple_non_sponsor_acknowledged
  );

  if acceptance_changed then
    perform public.record_qr_bingo_entrant_consent_snapshot(
      old,
      'superseded_on_reconsent'
    );
    perform public.record_qr_bingo_entrant_consent_snapshot(
      new,
      'current_acceptance'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_qr_bingo_entrant_consent_acceptance()
  from public, anon, authenticated, service_role;

create or replace function public.prepare_qr_bingo_named_vendor_contact_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
$$;

revoke all on function public.prepare_qr_bingo_named_vendor_contact_share()
  from public, anon, authenticated, service_role;

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
      applicable_rules_version <> '2026-09-01-vendor-marketing'
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
      or new.alternate_free_entry_url !~ '^https://'
    ) then
      raise exception 'Review and accept the current official rules before enabling this vendor draw.';
    end if;
  elsif tg_table_name = 'qr_bingo_raffle_entries' then
    if applicable_rules_version <> '2026-09-01-vendor-marketing'
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
      raise exception 'Review and accept the applicable official rules and named-vendor marketing terms before entering this vendor draw.';
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

comment on column public.qr_bingo_raffle_entries.contact_share_scope is
  'selected_potential_winner_only is historical. named_vendor_draw_administration under rules version 2026-09-01-vendor-marketing permits the exact named vendor to receive that entry contact for the draw and its recorded wedding-related marketing purpose.';

comment on column public.qr_bingo_raffle_entries.vendor_marketing_consent is
  'True only for an explicit named-vendor draw entry under rules version 2026-09-01-vendor-marketing with exact consent text and a server timestamp. Historical entries remain false until fresh consent.';
