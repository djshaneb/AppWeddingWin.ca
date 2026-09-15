-- Permit one exact, prospective responsibility-text amendment after an
-- authenticated vendor reviews it. Every original offer and consent snapshot
-- remains immutable; prize, event and entrant terms are not rewritten.
do $$
begin
  if (select md5(pg_get_functiondef('public.lock_activated_qr_bingo_offer_material_terms()'::regprocedure)))
       is distinct from 'c05db71c7d11edecaf9e8951b63de5d3'
    or (select md5(pg_get_functiondef('public.lock_entered_qr_bingo_material_terms()'::regprocedure)))
       is distinct from '9ce3e1bdec30e9cbe3d355a8a6d34524' then
    raise exception 'Unexpected material-terms guard baseline; review before applying.';
  end if;
end;
$$;

create function public.qr_bingo_showday_responsibility_text(p_vendor_name text,p_kind text,p_revision text)
returns text language sql immutable security invoker set search_path=''
as $$ select case
  when p_kind='vendor' and p_revision='previous' then '' || p_vendor_name || ' confirms the signer is authorized to bind the vendor and accepts the current Official Rules, Wedding Win Terms, and vendor indemnity. The vendor is the named vendor-promotion sponsor, draw operator, and prize provider. It is responsible for accurate offer and prize terms; the correct legal/operating business identity and a working contact route; prize ownership, availability, maximum value or savings, restrictions, all legally required licences, permits, and insurance; taxes; eligibility and duplicate decisions; winner verification, the skill-testing question, releases, notices, delivery, claims, and disputes. It may use contact details from couples who explicitly enter this named draw to administer the draw and send wedding-related offers and promotions. It must identify itself, protect the information, honour unsubscribe and withdrawal requests, and follow applicable privacy and commercial-message requirements. Wedding Win Inc. is the app developer, a limited platform sponsor solely for the in-app workflow, and the technical administrator. It provides entry recording, duplicate controls, random-selection, audit, and notice-delivery technology on the named vendor''s behalf, but it is not the named vendor-promotion sponsor, contest operator, or prize provider and does not own, supply, insure, guarantee, or fulfill the vendor''s prize. Wedding Win Inc. remains responsible for its own technology, privacy and security obligations, negligence, wilful misconduct, representations, and express administrative commitments, subject to all non-waivable law. These duties do not transfer to Wedding Win Inc. Apple Inc. is not a sponsor of and is not involved in this promotion, its administration, winner selection, or prize fulfillment.'
  when p_kind='vendor' and p_revision='current' then '' || p_vendor_name || ' confirms the signer is authorized to bind the vendor and accepts the current Official Rules, Wedding Win Terms, and vendor indemnity. The vendor is the named vendor-promotion sponsor, draw operator, and prize provider. It is responsible for accurate offer and prize terms; the correct legal/operating business identity and a working contact route; prize ownership, availability, maximum value or savings, restrictions, all legally required licences, permits, and insurance; taxes; eligibility and duplicate decisions; winner verification, the skill-testing question, releases, notices, delivery, claims, and disputes. It may use contact details from couples who explicitly enter this named draw to administer the draw and send wedding-related offers and promotions. It must identify itself, protect the information, honour unsubscribe and withdrawal requests, and follow applicable privacy and commercial-message requirements. Wedding Win Inc. is the app developer, a limited platform sponsor solely for the in-app workflow, and the technical administrator. The named vendor is the promotion sponsor, operator, and prize provider; Wedding Win does not supply, guarantee, or fulfil its prize. Wedding Win''s releases and liability limits are in the Terms of Use and apply prospectively when accepted. They exclude fraud and wilful misconduct and preserve all non-waivable law, privacy and security obligations, and accountability for personal information. Earlier entries, prize obligations, and accepted terms remain unchanged. These duties do not transfer to Wedding Win Inc. Apple Inc. is not a sponsor of and is not involved in this promotion, its administration, winner selection, or prize fulfillment.'
  when p_kind='participant' and p_revision='previous' then '' || p_vendor_name || ' is the named vendor-promotion sponsor, contest operator, and prize provider and is responsible for lawful and accurate offer terms; prize ownership, availability, stated value, restrictions, insurance, taxes, claims, and disputes; entrant eligibility and duplicate-entry decisions; potential-winner verification, the mathematical skill-testing question, any declaration or release, required notices, delivery, and timely fulfillment. Wedding Win Inc. is the app developer, a limited platform sponsor solely for the in-app workflow, and the technical administrator. It provides entry recording, duplicate controls, random-selection, audit, and notice-delivery technology on the named vendor''s behalf, but it is not the named vendor-promotion sponsor, contest operator, or prize provider and does not own, supply, insure, guarantee, or fulfill the vendor''s prize. Wedding Win Inc. remains responsible for its own technology, privacy and security obligations, negligence, wilful misconduct, representations, and express administrative commitments, subject to all non-waivable law. By entering, I confirm that I visited this vendor booth in person at the wedding show and scanned its QR code. I agree that Wedding Win Inc. may share my name, email address, phone number, wedding date, and entry/consent evidence with ' || p_vendor_name || '. ' || p_vendor_name || ' may use those details to administer this specific draw and contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time. Apple Inc. is not a sponsor of and is not involved in this promotion, its administration, winner selection, or prize fulfillment.'
  when p_kind='participant' and p_revision='current' then '' || p_vendor_name || ' is the named vendor-promotion sponsor, contest operator, and prize provider and is responsible for lawful and accurate offer terms; prize ownership, availability, stated value, restrictions, insurance, taxes, claims, and disputes; entrant eligibility and duplicate-entry decisions; potential-winner verification, the mathematical skill-testing question, any declaration or release, required notices, delivery, and timely fulfillment. Wedding Win Inc. is the app developer, a limited platform sponsor solely for the in-app workflow, and the technical administrator. The named vendor is the promotion sponsor, operator, and prize provider; Wedding Win does not supply, guarantee, or fulfil its prize. Wedding Win''s releases and liability limits are in the Terms of Use and apply prospectively when accepted. They exclude fraud and wilful misconduct and preserve all non-waivable law, privacy and security obligations, and accountability for personal information. Earlier entries, prize obligations, and accepted terms remain unchanged. By entering, I confirm that I visited this vendor booth in person at the wedding show and scanned its QR code. I agree that Wedding Win Inc. may share my name, email address, phone number, wedding date, and entry/consent evidence with ' || p_vendor_name || '. ' || p_vendor_name || ' may use those details to administer this specific draw and contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time. Apple Inc. is not a sponsor of and is not involved in this promotion, its administration, winner selection, or prize fulfillment.'
  else null end $$;
revoke all on function public.qr_bingo_showday_responsibility_text(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.qr_bingo_showday_responsibility_text(text,text,text) to service_role;

create function public.qr_bingo_is_showday_responsibility_amendment(
  p_previous public.qr_bingo_raffle_settings,p_next public.qr_bingo_raffle_settings
) returns boolean language plpgsql volatile security invoker set search_path=''
as $$
declare allowed_fields text[]:=array[
 'enabled','legal_terms_accepted','legal_terms_accepted_at','rules_viewed_at','apple_non_sponsor_acknowledged',
 'vendor_responsibility_acknowledged','vendor_responsibility_acknowledged_at','vendor_responsibility_disclosure_text',
 'participant_responsibility_disclosure_text','updated_at'];
begin
  if p_previous.event_key is distinct from 'niagara-wedding-show-2026'
    or p_previous.synthetic_fixture_setup_id is not null or p_next.synthetic_fixture_setup_id is not null
    or p_previous.legal_terms_version is distinct from '2026-09-01-in-person-entry'
    or p_next.legal_terms_version is distinct from p_previous.legal_terms_version
    or (select count(*) from public.qr_bingo_event_configs where published)<>1
    or not exists(select 1 from public.qr_bingo_event_configs where published
      and event_key=p_previous.event_key and rules_version=p_previous.legal_terms_version)
    or current_setting('request.qr_bingo_authenticated_vendor_bd_user_id',true) is distinct from p_next.vendor_bd_user_id
    or coalesce(current_setting('request.qr_bingo_vendor_acceptance_source',true),'') not in ('app','website')
    or current_setting('request.qr_bingo_vendor_authority_to_bind',true) is distinct from 'true'
    or (to_jsonb(p_previous)-allowed_fields) is distinct from (to_jsonb(p_next)-allowed_fields)
    or p_previous.legal_terms_accepted is distinct from true
    or p_previous.apple_non_sponsor_acknowledged is distinct from true
    or p_previous.vendor_responsibility_acknowledged is distinct from true
    or p_previous.vendor_responsibility_version is distinct from p_previous.legal_terms_version
    or p_previous.legal_terms_accepted_at is null or p_previous.rules_viewed_at is null
    or p_previous.vendor_responsibility_acknowledged_at is null
    or p_next.legal_terms_accepted is distinct from true
    or p_next.apple_non_sponsor_acknowledged is distinct from true
    or p_next.vendor_responsibility_acknowledged is distinct from true
    or p_next.vendor_responsibility_version is distinct from p_next.legal_terms_version
    or p_next.legal_terms_accepted_at is null or p_next.rules_viewed_at is null
    or p_next.vendor_responsibility_acknowledged_at is null
    or p_next.legal_terms_accepted_at<=p_previous.legal_terms_accepted_at
    or p_next.rules_viewed_at<=p_previous.rules_viewed_at
    or p_next.vendor_responsibility_acknowledged_at<=p_previous.vendor_responsibility_acknowledged_at
    or p_next.legal_terms_accepted_at>clock_timestamp()+interval '5 seconds'
    or p_next.rules_viewed_at>clock_timestamp()+interval '5 seconds'
    or p_next.vendor_responsibility_disclosure_text is distinct from
      public.qr_bingo_showday_responsibility_text(p_next.vendor_name,'vendor','current')
    or p_next.participant_responsibility_disclosure_text is distinct from
      public.qr_bingo_showday_responsibility_text(p_next.vendor_name,'participant','current')
    or p_previous.vendor_responsibility_disclosure_text is distinct from
      public.qr_bingo_showday_responsibility_text(p_previous.vendor_name,'vendor','previous')
    or p_previous.participant_responsibility_disclosure_text is distinct from
      public.qr_bingo_showday_responsibility_text(p_previous.vendor_name,'participant','previous')
  then return false; end if;
  return true;
end;
$$;
revoke all on function public.qr_bingo_is_showday_responsibility_amendment(public.qr_bingo_raffle_settings,public.qr_bingo_raffle_settings) from public,anon,authenticated,service_role;
grant execute on function public.qr_bingo_is_showday_responsibility_amendment(public.qr_bingo_raffle_settings,public.qr_bingo_raffle_settings) to service_role;

CREATE OR REPLACE FUNCTION public.lock_activated_qr_bingo_offer_material_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      new.alternate_free_entry_url
    ) is not distinct from row(
      old.vendor_bd_user_id,
      old.vendor_name,
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
      old.alternate_free_entry_url
    );

  permitted_in_person_rules_reacceptance := permitted_in_person_rules_reacceptance
    or public.qr_bingo_is_showday_responsibility_amendment(old,new);

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
    case when old.legal_terms_version='2026-09-01-in-person-entry'
      and new.legal_terms_version=old.legal_terms_version
      and old.vendor_responsibility_acknowledged and new.vendor_responsibility_acknowledged
      then new.vendor_responsibility_disclosure_text else null end
  ) is distinct from row(
    old.vendor_bd_user_id,
    old.vendor_name,
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
    case when old.legal_terms_version='2026-09-01-in-person-entry'
      and new.legal_terms_version=old.legal_terms_version
      and old.vendor_responsibility_acknowledged and new.vendor_responsibility_acknowledged
      then old.vendor_responsibility_disclosure_text else null end
  ) and not permitted_in_person_rules_reacceptance then
    raise exception using
      errcode = '55000',
      message = 'Vendor offer terms cannot change after the offer first opens; create a new promotion version.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lock_entered_qr_bingo_material_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      new.official_rules_url,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_at,
      new.draw_opens_at,
      new.odds_basis,
      new.no_purchase_required,
      new.skill_testing_question_required,
      new.prize_provider_name,
      new.alternate_free_entry_url
    ) is not distinct from row(
      old.official_rules_url,
      old.eligibility_region,
      old.entry_closes_at,
      old.draw_at,
      old.draw_opens_at,
      old.odds_basis,
      old.no_purchase_required,
      old.skill_testing_question_required,
      old.prize_provider_name,
      old.alternate_free_entry_url
    );

  permitted_in_person_rules_reacceptance := permitted_in_person_rules_reacceptance
    or public.qr_bingo_is_showday_responsibility_amendment(old,new);

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
    case when old.legal_terms_version='2026-09-01-in-person-entry'
      and new.legal_terms_version=old.legal_terms_version
      and old.vendor_responsibility_acknowledged and new.vendor_responsibility_acknowledged
      then new.vendor_responsibility_disclosure_text else null end
  ) is distinct from row(
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
    case when old.legal_terms_version='2026-09-01-in-person-entry'
      and new.legal_terms_version=old.legal_terms_version
      and old.vendor_responsibility_acknowledged and new.vendor_responsibility_acknowledged
      then old.vendor_responsibility_disclosure_text else null end
  ) and not permitted_in_person_rules_reacceptance then
    raise exception using
      errcode = '55000',
      message = 'Prize and draw terms cannot change after the first entry; create a new promotion version.';
  end if;

  return new;
end;
$function$
;
