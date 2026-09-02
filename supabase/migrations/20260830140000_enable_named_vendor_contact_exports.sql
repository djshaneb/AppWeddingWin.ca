-- Couples who accept the new named-vendor contact-sharing rules may have the
-- contact fields attached to that specific draw entry disclosed to that named
-- vendor for draw administration. This is intentionally not marketing
-- consent. Historical selected-winner-only entries are not rewritten and are
-- not eligible for the contact export without a fresh opt-in.

alter table if exists public.qr_bingo_raffle_entries
  add column if not exists vendor_marketing_consent boolean not null default false,
  add column if not exists vendor_marketing_consent_text text not null default '',
  add column if not exists vendor_marketing_consented_at timestamptz,
  add column if not exists draw_administration_contact_share_acknowledged boolean not null default false,
  add column if not exists draw_administration_contact_share_acknowledged_at timestamptz,
  add column if not exists draw_administration_contact_share_version text not null default '',
  add column if not exists draw_administration_contact_share_consent_text text not null default '';

-- Constraint creation is conditional so a safely retried migration does not
-- stop after a transient deploy failure left some objects in place.
do $migration$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_raffle_entries'::regclass
       and conname = 'qr_bingo_raffle_entries_contact_share_scope_known'
  ) then
    alter table public.qr_bingo_raffle_entries
      add constraint qr_bingo_raffle_entries_contact_share_scope_known
      check (
        contact_share_scope in (
          'selected_potential_winner_only',
          'named_vendor_draw_administration'
        )
      ) not valid;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_raffle_entries'::regclass
       and conname = 'qr_bingo_raffle_entries_marketing_consent_complete'
  ) then
    alter table public.qr_bingo_raffle_entries
      add constraint qr_bingo_raffle_entries_marketing_consent_complete
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
        )
      ) not valid;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_raffle_entries'::regclass
       and conname = 'qr_bingo_raffle_entries_contact_share_proof_complete'
  ) then
    alter table public.qr_bingo_raffle_entries
      add constraint qr_bingo_raffle_entries_contact_share_proof_complete
      check (
        (
          not draw_administration_contact_share_acknowledged
          and draw_administration_contact_share_acknowledged_at is null
          and btrim(draw_administration_contact_share_version) = ''
          and btrim(draw_administration_contact_share_consent_text) = ''
        )
        or (
          draw_administration_contact_share_acknowledged
          and draw_administration_contact_share_acknowledged_at is not null
          and btrim(draw_administration_contact_share_version) <> ''
          and length(draw_administration_contact_share_version) <= 80
          and draw_administration_contact_share_version !~ '[[:cntrl:]]'
          and btrim(draw_administration_contact_share_consent_text) <> ''
          and length(draw_administration_contact_share_consent_text) <= 2000
          and draw_administration_contact_share_consent_text !~ '[[:cntrl:]]'
        )
      ) not valid;
  end if;
end;
$migration$;

create index if not exists qr_bingo_raffle_entries_vendor_contact_export_idx
  on public.qr_bingo_raffle_entries
    (event_key, vendor_bingo_id, vendor_bd_user_id, created_at)
  where consent_share_contact
    and contact_share_scope = 'named_vendor_draw_administration';

-- Existing metadata-only report audit rows remain truthful. New rows identify
-- whether a generated report contained contact fields, but never store the CSV
-- or any entrant identifier/contact value.
alter table if exists public.qr_bingo_participation_report_audit
  add column if not exists report_kind text not null default 'anonymous_participation',
  add column if not exists contains_contact_data boolean not null default false,
  add column if not exists contact_share_scope text not null default 'selected_potential_winner_only',
  add column if not exists marketing_consent_included boolean not null default false,
  add column if not exists rules_version text not null default '';

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_participation_report_audit'::regclass
       and conname = 'qr_bingo_participation_report_audit_kind_known'
  ) then
    alter table public.qr_bingo_participation_report_audit
      add constraint qr_bingo_participation_report_audit_kind_known
      check (report_kind in ('anonymous_participation', 'named_vendor_draw_contacts'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_participation_report_audit'::regclass
       and conname = 'qr_bingo_participation_report_audit_scope_known'
  ) then
    alter table public.qr_bingo_participation_report_audit
      add constraint qr_bingo_participation_report_audit_scope_known
      check (
        contact_share_scope in (
          'selected_potential_winner_only',
          'named_vendor_draw_administration'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_participation_report_audit'::regclass
       and conname = 'qr_bingo_participation_report_audit_no_marketing_data'
  ) then
    alter table public.qr_bingo_participation_report_audit
      add constraint qr_bingo_participation_report_audit_no_marketing_data
      check (not marketing_consent_included);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.qr_bingo_participation_report_audit'::regclass
       and conname = 'qr_bingo_participation_report_audit_rules_version_safe'
  ) then
    alter table public.qr_bingo_participation_report_audit
      add constraint qr_bingo_participation_report_audit_rules_version_safe
      check (
        length(rules_version) <= 80
        and rules_version !~ '[[:cntrl:]]'
      );
  end if;
end;
$migration$;

comment on table public.qr_bingo_participation_report_audit is
  'Immutable metadata audit for vendor draw CSV reports. Records report scope and whether contact fields were included, but never stores CSV content or entrant identifiers/contact values.';

-- The existing Form 354 reconciliation RPC predates the contact-sharing rules
-- and inserts the historical scope token. It already verifies the immutable
-- vendor-offer disclosure accepted by the participant. Normalize only the new
-- rules version, only the alternate-entry method, and only when that exact
-- disclosure records the new named-vendor/non-marketing consent. Stale forms
-- fail closed instead of receiving a broader scope.
create or replace function public.prepare_qr_bingo_named_vendor_contact_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.consent_version = '2026-08-30-contact-share'
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
        'By entering, I agree that Wedding Win Inc. may share my name, email address, phone number (if provided), wedding date (if provided), and entry/consent evidence with '
        in new.promotion_disclosure_text
      ) = 0
      or position(
        format(
          'with %s to administer this specific draw. This is not marketing consent; marketing requires a separate, optional choice.',
          new.vendor_name
        )
        in new.promotion_disclosure_text
      ) = 0
    then
      raise exception using
        errcode = '23514',
        message = 'The named-vendor contact-sharing disclosure was not accepted.';
    end if;

    new.contact_share_scope := 'named_vendor_draw_administration';
    new.draw_administration_contact_share_acknowledged := true;
    new.draw_administration_contact_share_acknowledged_at := new.consented_at;
    new.draw_administration_contact_share_version := new.consent_version;
    new.draw_administration_contact_share_consent_text := format(
      'I agree that Wedding Win Inc. may share my name, email address, phone number (if provided), wedding date (if provided), and entry/consent evidence with %s to administer this specific draw. This is not marketing consent; marketing requires a separate, optional choice.',
      new.vendor_name
    );
    new.consent_text := format(
      'I submitted the alternate free-entry form and reviewed official rules version %s. I agree that Wedding Win Inc. may share my name, email address, phone number (if provided), wedding date (if provided), and entry/consent evidence with %s to administer this specific draw. This is not marketing consent; marketing requires a separate, optional choice. %s',
      new.consent_version,
      new.vendor_name,
      new.promotion_disclosure_text
    );
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_qr_bingo_named_vendor_contact_share()
  from public, anon, authenticated, service_role;

drop trigger if exists a_prepare_qr_bingo_named_vendor_contact_share
  on public.qr_bingo_raffle_entries;
create trigger a_prepare_qr_bingo_named_vendor_contact_share
before insert or update on public.qr_bingo_raffle_entries
for each row execute function public.prepare_qr_bingo_named_vendor_contact_share();

-- The operational entry row is updated when a participant explicitly accepts
-- a newer offer. Preserve both the superseded acceptance and the new one in a
-- service-only, append-only ledger so re-consent never rewrites history.
create table if not exists public.qr_bingo_entrant_consent_acceptance_audit (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  event_key text not null,
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  couple_bd_user_id text not null,
  entry_method text not null,
  vendor_offer_version timestamptz,
  consent_share_contact boolean not null,
  contact_share_scope text not null,
  consent_text text not null,
  consent_version text not null,
  consented_at timestamptz not null,
  draw_administration_contact_share_acknowledged boolean not null,
  draw_administration_contact_share_acknowledged_at timestamptz,
  draw_administration_contact_share_version text not null,
  draw_administration_contact_share_consent_text text not null,
  promotion_responsibility_acknowledged boolean not null,
  promotion_disclosure_text text not null,
  promotion_responsibility_acknowledged_at timestamptz,
  promotion_responsibility_version text not null,
  age_of_majority_attested boolean not null,
  residency_attested boolean not null,
  exclusions_attested boolean not null,
  eligibility_attested_at timestamptz,
  eligibility_attestation_text text not null,
  official_rules_url text not null,
  rules_viewed_at timestamptz,
  apple_non_sponsor_acknowledged boolean not null,
  snapshot_reason text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint qr_bingo_entrant_consent_audit_scope_known check (
    contact_share_scope in (
      'selected_potential_winner_only',
      'named_vendor_draw_administration'
    )
  ),
  constraint qr_bingo_entrant_consent_audit_reason_known check (
    snapshot_reason in (
      'initial_acceptance',
      'superseded_on_reconsent',
      'current_acceptance'
    )
  ),
  constraint qr_bingo_entrant_consent_audit_snapshot_unique unique (
    entry_id,
    consented_at,
    consent_version,
    contact_share_scope
  )
);

create index if not exists qr_bingo_entrant_consent_audit_entry_idx
  on public.qr_bingo_entrant_consent_acceptance_audit
  (entry_id, consented_at desc);

alter table public.qr_bingo_entrant_consent_acceptance_audit enable row level security;
revoke all on table public.qr_bingo_entrant_consent_acceptance_audit
  from public, anon, authenticated, service_role;
grant select on table public.qr_bingo_entrant_consent_acceptance_audit
  to service_role;

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

drop trigger if exists audit_qr_bingo_entrant_consent_acceptance
  on public.qr_bingo_raffle_entries;
create trigger audit_qr_bingo_entrant_consent_acceptance
after insert or update on public.qr_bingo_raffle_entries
for each row execute function public.audit_qr_bingo_entrant_consent_acceptance();

create or replace function public.reject_qr_bingo_entrant_consent_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'QR Bingo entrant consent acceptance audit is append-only.';
end;
$$;

revoke all on function public.reject_qr_bingo_entrant_consent_audit_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_qr_bingo_entrant_consent_audit_mutation
  on public.qr_bingo_entrant_consent_acceptance_audit;
create trigger reject_qr_bingo_entrant_consent_audit_mutation
before update or delete on public.qr_bingo_entrant_consent_acceptance_audit
for each row execute function public.reject_qr_bingo_entrant_consent_audit_mutation();

-- Keep the shared rules trigger table-safe while requiring the new consent
-- version and scope at the database boundary. The App Review and email-test
-- event isolation remains unchanged; their applicable version is still
-- borrowed from the one published event configuration.
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
      applicable_rules_version <> '2026-08-30-contact-share'
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
    if applicable_rules_version <> '2026-08-30-contact-share'
      or new.consent_version is distinct from applicable_rules_version
      or new.rules_viewed_at is null
      or not new.apple_non_sponsor_acknowledged
      or not new.consent_share_contact
      or new.contact_share_scope <> 'named_vendor_draw_administration'
      or not new.draw_administration_contact_share_acknowledged
      or new.draw_administration_contact_share_acknowledged_at is null
      or new.draw_administration_contact_share_version is distinct from applicable_rules_version
      or nullif(btrim(new.draw_administration_contact_share_consent_text), '') is null
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
      raise exception 'Review and accept the applicable official rules before entering this vendor draw.';
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

-- Retire the prior reconciliation boundary. It remains as an owner-only
-- implementation detail so the new public function can reuse its immutable offer,
-- source-time, duplicate, and deadline checks without exposing a route that
-- omits the distinct Form 354 contact-sharing confirmation.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.reconcile_qr_bingo_alternate_free_entry(text,bigint,bigint,text,text,timestamptz,text,timestamptz,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text)'
  ) is not null
    and pg_catalog.to_regprocedure(
      'public.reconcile_qr_bingo_alternate_free_entry_without_contact_proof(text,bigint,bigint,text,text,timestamptz,text,timestamptz,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text)'
    ) is null
  then
    alter function public.reconcile_qr_bingo_alternate_free_entry(
      text, bigint, bigint, text, text, timestamptz, text, timestamptz,
      text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
      boolean, text
    ) rename to reconcile_qr_bingo_alternate_free_entry_without_contact_proof;
  end if;
end;
$migration$;

revoke all on function public.reconcile_qr_bingo_alternate_free_entry_without_contact_proof(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, text
) from public, anon, authenticated, service_role;

create or replace function public.reconcile_qr_bingo_alternate_free_entry(
  p_event_key text,
  p_expected_revision bigint,
  p_submitted_event_revision bigint,
  p_vendor_bingo_id text,
  p_form_inquiry_id text,
  p_form_submitted_at timestamptz,
  p_submitted_rules_version text,
  p_vendor_offer_version timestamptz,
  p_participant_responsibility_disclosure text,
  p_couple_name text,
  p_couple_email text,
  p_couple_phone text default '',
  p_couple_wedding_date text default '',
  p_age_of_majority_confirmed boolean default false,
  p_eligible_residency_confirmed boolean default false,
  p_not_excluded_confirmed boolean default false,
  p_rules_acknowledged boolean default false,
  p_promotion_responsibility_acknowledged boolean default false,
  p_contact_share_consent_confirmed boolean default false,
  p_apple_non_sponsor_acknowledged boolean default false,
  p_actor text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reconciliation_result jsonb;
  persisted_proof_entry uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Service-role authorization is required.';
  end if;

  if p_contact_share_consent_confirmed is distinct from true then
    return jsonb_build_object(
      'ok', false,
      'code', 'contact_share_confirmation_required',
      'error', 'The exact Form 354 named-vendor contact-sharing confirmation is required.'
    );
  end if;

  -- Only this fail-closed overload may authorize the legacy implementation's
  -- insert trigger to convert the historical scope token. The setting is local
  -- to this transaction and is reset before returning.
  perform pg_catalog.set_config(
    'app.qr_bingo_form354_contact_share_confirmed',
    'true',
    true
  );

  reconciliation_result := public.reconcile_qr_bingo_alternate_free_entry_without_contact_proof(
    p_event_key,
    p_expected_revision,
    p_submitted_event_revision,
    p_vendor_bingo_id,
    p_form_inquiry_id,
    p_form_submitted_at,
    p_submitted_rules_version,
    p_vendor_offer_version,
    p_participant_responsibility_disclosure,
    p_couple_name,
    p_couple_email,
    p_couple_phone,
    p_couple_wedding_date,
    p_age_of_majority_confirmed,
    p_eligible_residency_confirmed,
    p_not_excluded_confirmed,
    p_rules_acknowledged,
    p_promotion_responsibility_acknowledged,
    p_apple_non_sponsor_acknowledged,
    p_actor
  );

  perform pg_catalog.set_config(
    'app.qr_bingo_form354_contact_share_confirmed',
    'false',
    true
  );

  if coalesce((reconciliation_result ->> 'ok')::boolean, false) then
    select entry.id
      into persisted_proof_entry
      from public.qr_bingo_raffle_entries entry
     where entry.id = (reconciliation_result ->> 'entry_reference')::uuid
       and entry.draw_administration_contact_share_acknowledged
       and entry.draw_administration_contact_share_acknowledged_at is not null
       and entry.draw_administration_contact_share_version = p_submitted_rules_version
       and nullif(
         btrim(entry.draw_administration_contact_share_consent_text),
         ''
       ) is not null;

    if persisted_proof_entry is null then
      raise exception using
        errcode = '55000',
        message = 'The Form 354 contact-sharing proof was not persisted.';
    end if;
  end if;

  return reconciliation_result;
end;
$$;

revoke all on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text
) to service_role;

-- Keep the isolated, allowlisted email-test delivery working for entries that
-- accepted the new scope. Replace only the scope guard in the already-hardened
-- claim function; all fixture, recipient, scan, verification, lease, and
-- couple-only checks remain byte-for-byte unchanged. Fail the migration if the
-- expected prior guard is absent instead of silently weakening the function.
do $migration$
declare
  claim_definition text;
  prior_guard constant text :=
    'current_entry.contact_share_scope <> ''selected_potential_winner_only''';
  current_guard constant text :=
    'current_entry.contact_share_scope <> ''named_vendor_draw_administration''';
begin
  select pg_get_functiondef(
    'public.claim_qr_bingo_test_draw_email_delivery(uuid,text,integer)'::regprocedure
  ) into claim_definition;

  if claim_definition is null then
    raise exception
      'The isolated email-test claim function was not found.';
  end if;

  if position(prior_guard in claim_definition) > 0 then
    claim_definition := replace(claim_definition, prior_guard, current_guard);
    execute claim_definition;
  elsif position(current_guard in claim_definition) = 0 then
    raise exception
      'Neither the prior nor current contact-share scope guard was found in the isolated email-test claim function.';
  end if;
end;
$migration$;

comment on column public.qr_bingo_raffle_entries.contact_share_scope is
  'selected_potential_winner_only is historical. named_vendor_draw_administration is accepted only under rules version 2026-08-30-contact-share and permits the named vendor to receive that entry contact for this draw, never as marketing consent.';

comment on column public.qr_bingo_raffle_entries.vendor_marketing_consent is
  'Separate optional vendor-marketing consent. The QR Bingo draw-entry flow always records false; draw entry alone never grants marketing permission.';
