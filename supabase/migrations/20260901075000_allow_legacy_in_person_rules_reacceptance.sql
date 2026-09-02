-- Allow a vendor with an already-locked offer to make a fresh, attributable
-- acceptance of the current in-person rules even when that offer skipped the
-- short-lived vendor-marketing rules revision. Historical offers and entries
-- retain their original rules evidence. Every non-consent material term must
-- remain unchanged during this one-way transition.

create or replace function public.lock_activated_qr_bingo_offer_material_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permitted_in_person_rules_reacceptance boolean := false;
begin
  permitted_in_person_rules_reacceptance :=
    old.legal_terms_version in (
      '2026-08-30-contact-share',
      '2026-09-01-vendor-marketing'
    )
    and new.legal_terms_version = '2026-09-01-in-person-entry'
    and new.legal_terms_accepted
    and new.legal_terms_accepted_at is not null
    and new.rules_viewed_at is not null
    and new.apple_non_sponsor_acknowledged
    and new.vendor_responsibility_acknowledged
    and new.vendor_responsibility_acknowledged_at is not null
    and new.vendor_responsibility_version = '2026-09-01-in-person-entry'
    and nullif(btrim(new.vendor_responsibility_disclosure_text), '') is not null
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
  ) and not permitted_in_person_rules_reacceptance then
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
  permitted_in_person_rules_reacceptance boolean := false;
begin
  permitted_in_person_rules_reacceptance :=
    old.legal_terms_version in (
      '2026-08-30-contact-share',
      '2026-09-01-vendor-marketing'
    )
    and new.legal_terms_version = '2026-09-01-in-person-entry'
    and new.legal_terms_accepted
    and new.legal_terms_accepted_at is not null
    and new.rules_viewed_at is not null
    and new.apple_non_sponsor_acknowledged
    and new.vendor_responsibility_acknowledged
    and new.vendor_responsibility_acknowledged_at is not null
    and new.vendor_responsibility_version = '2026-09-01-in-person-entry'
    and nullif(btrim(new.vendor_responsibility_disclosure_text), '') is not null
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
  ) and not permitted_in_person_rules_reacceptance then
    raise exception using
      errcode = '55000',
      message = 'Prize and draw terms cannot change after the first entry; create a new promotion version.';
  end if;

  return new;
end;
$$;

revoke all on function public.lock_entered_qr_bingo_material_terms()
  from public, anon, authenticated, service_role;

comment on function public.lock_activated_qr_bingo_offer_material_terms() is
  'Locks activated vendor-offer terms while allowing one fresh, attributable 2026-08-30 or 2026-09-01 marketing-rules acceptance to the current in-person rules without changing any non-consent material term.';

comment on function public.lock_entered_qr_bingo_material_terms() is
  'Locks entered vendor-offer terms while allowing one fresh, attributable 2026-08-30 or 2026-09-01 marketing-rules acceptance to the current in-person rules; historical entries keep their original acceptance.';
