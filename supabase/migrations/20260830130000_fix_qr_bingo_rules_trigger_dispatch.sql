-- The vendor-offer migration taught the shared rules trigger to read an
-- entry-only column before it had dispatched on the triggering table.  A
-- settings insert therefore failed with "record new has no field
-- vendor_offer_version".  Read the optional field through JSON so the shared
-- trigger remains safe for settings, entries, and grand-prize rows.

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
      not new.legal_terms_accepted
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
    if new.consent_version is distinct from applicable_rules_version
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
      or btrim(new.prize_title) = ''
      or btrim(new.prize_description) = ''
      or new.contact_share_scope <> 'selected_potential_winner_only'
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
