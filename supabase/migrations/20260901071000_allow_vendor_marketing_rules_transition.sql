-- Permit the one forward-only consent expansion from the historical
-- draw-administration rules to the named-vendor marketing rules. Every prize,
-- schedule, eligibility, vendor, and event term remains immutable. Historical
-- offer snapshots and entries keep their original version and are excluded
-- until a participant gives fresh current-version consent.

create or replace function public.gate_activated_qr_bingo_event_material_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_config public.qr_bingo_event_configs%rowtype;
  event_activated boolean := false;
  permitted_marketing_rules_transition boolean := false;
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

  permitted_marketing_rules_transition :=
    previous_config.rules_version = '2026-08-30-contact-share'
    and new.rules_version = '2026-09-01-vendor-marketing'
    and row(
      new.event_name,
      new.vendor_tag_id,
      new.history_starts_at,
      new.official_rules_url,
      new.alternate_free_entry_url,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_opens_at,
      new.draw_at
    ) is not distinct from row(
      previous_config.event_name,
      previous_config.vendor_tag_id,
      previous_config.history_starts_at,
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
  ) and not permitted_marketing_rules_transition then
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
  permitted_marketing_rules_transition boolean := false;
begin
  permitted_marketing_rules_transition :=
    old.legal_terms_version = '2026-08-30-contact-share'
    and new.legal_terms_version = '2026-09-01-vendor-marketing'
    and position(
      'contact me with wedding-related offers and promotions'
      in new.participant_responsibility_disclosure_text
    ) > 0
    and position(
      'unsubscribe from vendor marketing'
      in new.participant_responsibility_disclosure_text
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
  ) and not permitted_marketing_rules_transition then
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
  permitted_marketing_rules_transition boolean := false;
begin
  permitted_marketing_rules_transition :=
    old.legal_terms_version = '2026-08-30-contact-share'
    and new.legal_terms_version = '2026-09-01-vendor-marketing'
    and position(
      'contact me with wedding-related offers and promotions'
      in new.participant_responsibility_disclosure_text
    ) > 0
    and position(
      'unsubscribe from vendor marketing'
      in new.participant_responsibility_disclosure_text
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
  ) and not permitted_marketing_rules_transition then
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
  'Locks activated event terms, with one exact old-to-new consent-version transition that preserves every non-consent material term.';

comment on function public.lock_activated_qr_bingo_offer_material_terms() is
  'Locks activated vendor-offer terms, with one exact old-to-new consent-version transition that creates a new immutable offer snapshot without changing the prize.';

comment on function public.lock_entered_qr_bingo_material_terms() is
  'Locks entered vendor-offer terms, with one exact old-to-new consent-version transition; historical entries retain their original immutable acceptance.';
