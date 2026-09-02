-- Keep production vendor-offer snapshots pinned to the published event while
-- allowing an authenticated, enabled, unexpired isolated fixture to retain its
-- own server-controlled schedule and HTTPS alternate-entry route. The fixture
-- identity and its allow_early_draw flag are never supplied by the client.

create or replace function public.capture_qr_bingo_vendor_offer_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_config public.qr_bingo_event_configs%rowtype;
  isolated_fixture boolean := false;
  fixture_allows_early_draw boolean := false;
  structurally_enterable boolean := false;
begin
  select config.*
    into event_config
    from public.qr_bingo_event_configs config
   where config.event_key = new.event_key
      or (
        config.published
        and (
          exists (
            select 1
              from public.app_review_raffle_fixtures fixture
             where fixture.event_key = new.event_key
               and fixture.vendor_bingo_id = new.vendor_bingo_id
               and fixture.vendor_bd_user_id = new.vendor_bd_user_id
               and fixture.enabled
               and fixture.expires_at > clock_timestamp()
          )
          or exists (
            select 1
              from public.qr_bingo_email_test_fixtures fixture
             where fixture.event_key = new.event_key
               and fixture.vendor_bingo_id = new.vendor_bingo_id
               and fixture.vendor_bd_user_id = new.vendor_bd_user_id
               and fixture.enabled
               and fixture.expires_at > clock_timestamp()
          )
        )
      )
   order by (config.event_key = new.event_key) desc,
            config.published desc,
            config.revision desc
   limit 1;

  select true, fixture.allow_early_draw
    into isolated_fixture, fixture_allows_early_draw
    from (
      select event_key,
             vendor_bingo_id,
             vendor_bd_user_id,
             enabled,
             expires_at,
             allow_early_draw
        from public.app_review_raffle_fixtures
      union all
      select event_key,
             vendor_bingo_id,
             vendor_bd_user_id,
             enabled,
             expires_at,
             allow_early_draw
        from public.qr_bingo_email_test_fixtures
    ) fixture
   where fixture.event_key = new.event_key
     and fixture.vendor_bingo_id = new.vendor_bingo_id
     and fixture.vendor_bd_user_id = new.vendor_bd_user_id
     and fixture.enabled
     and fixture.expires_at > clock_timestamp()
     and event_config.id is not null
     and new.event_key <> event_config.event_key
   limit 1;

  isolated_fixture := coalesce(isolated_fixture, false);
  fixture_allows_early_draw := coalesce(fixture_allows_early_draw, false);

  structurally_enterable := event_config.id is not null
    and new.enabled
    and new.legal_terms_accepted
    and new.legal_terms_version is not distinct from event_config.rules_version
    and new.legal_terms_accepted_at is not null
    and new.rules_viewed_at is not null
    and new.apple_non_sponsor_acknowledged
    and new.vendor_responsibility_acknowledged
    and new.vendor_responsibility_acknowledged_at is not null
    and new.vendor_responsibility_version is not distinct from event_config.rules_version
    and nullif(btrim(new.vendor_responsibility_disclosure_text), '') is not null
    and nullif(btrim(new.participant_responsibility_disclosure_text), '') is not null
    and nullif(btrim(new.vendor_name), '') is not null
    and new.vendor_bd_user_id is not distinct from new.vendor_bingo_id
    and nullif(btrim(new.prize_title), '') is not null
    and nullif(btrim(new.prize_description), '') is not null
    and coalesce(new.prize_approx_value_cad, 0) > 0
    and nullif(btrim(new.prize_provider_name), '') is not null
    and new.official_rules_url is not distinct from event_config.official_rules_url
    and new.entry_closes_at is not null
    and new.draw_opens_at is not null
    and new.draw_at is not null
    and new.draw_at >= new.entry_closes_at
    and new.draw_at >= new.draw_opens_at
    and (fixture_allows_early_draw or new.draw_opens_at >= new.entry_closes_at)
    and nullif(btrim(new.odds_basis), '') is not null
    and new.no_purchase_required
    and new.skill_testing_question_required
    and (
      (
        isolated_fixture
        and nullif(btrim(new.eligibility_region), '') is not null
        and new.alternate_free_entry_url ~* '^https://[^[:space:]]+$'
      )
      or (
        not isolated_fixture
        and new.alternate_free_entry_url is not distinct from event_config.alternate_free_entry_url
        and new.eligibility_region is not distinct from event_config.eligibility_region
        and new.entry_closes_at is not distinct from event_config.entry_closes_at
        and new.draw_opens_at is not distinct from event_config.draw_opens_at
        and new.draw_at is not distinct from event_config.draw_at
      )
    );

  insert into public.qr_bingo_vendor_offer_versions (
    event_key,
    vendor_bingo_id,
    vendor_offer_version,
    event_revision,
    event_name,
    vendor_tag_id,
    vendor_bd_user_id,
    vendor_name,
    enabled,
    offer_enterable,
    activation_excluded_as_legacy_qa,
    history_starts_at,
    prize_title,
    prize_description,
    prize_approx_value_cad,
    eligibility_region,
    entry_closes_at,
    draw_opens_at,
    draw_at,
    odds_basis,
    no_purchase_required,
    skill_testing_question_required,
    official_rules_url,
    alternate_free_entry_url,
    rules_version,
    legal_terms_accepted,
    legal_terms_accepted_at,
    rules_viewed_at,
    administrator_name,
    co_sponsor_name,
    prize_provider_name,
    apple_non_sponsor_acknowledged,
    vendor_responsibility_acknowledged,
    vendor_responsibility_disclosure_text,
    vendor_responsibility_acknowledged_at,
    vendor_responsibility_version,
    participant_responsibility_disclosure_text
  ) values (
    new.event_key,
    new.vendor_bingo_id,
    new.updated_at,
    event_config.revision,
    coalesce(event_config.event_name, ''),
    event_config.vendor_tag_id,
    new.vendor_bd_user_id,
    new.vendor_name,
    new.enabled,
    structurally_enterable,
    false,
    event_config.history_starts_at,
    new.prize_title,
    new.prize_description,
    new.prize_approx_value_cad,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_opens_at,
    new.draw_at,
    new.odds_basis,
    new.no_purchase_required,
    new.skill_testing_question_required,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.legal_terms_version,
    new.legal_terms_accepted,
    new.legal_terms_accepted_at,
    new.rules_viewed_at,
    new.administrator_name,
    new.co_sponsor_name,
    new.prize_provider_name,
    new.apple_non_sponsor_acknowledged,
    new.vendor_responsibility_acknowledged,
    new.vendor_responsibility_disclosure_text,
    new.vendor_responsibility_acknowledged_at,
    new.vendor_responsibility_version,
    new.participant_responsibility_disclosure_text
  );

  return new;
end;
$$;

revoke all on function public.capture_qr_bingo_vendor_offer_version()
  from public, anon, authenticated, service_role;

comment on function public.capture_qr_bingo_vendor_offer_version() is
  'Captures immutable vendor-offer versions; production remains pinned to published terms while exact active isolated fixtures may retain server-controlled test terms.';
