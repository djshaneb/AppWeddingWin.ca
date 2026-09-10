-- Read-only pg_catalog snapshot of production settings triggers, 2026-09-10.
-- Definitions only: no member rows, credentials, private helpers, or mail payloads.
CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_single_winner_prize_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.event_key || ':' || new.vendor_bingo_id, 0));
  -- Canonical operational controls apply even to an older client or direct
  -- service-role settings write. Historical offers, entries and draws are not rewritten.
  new.max_winners := 1;
  new.exclude_previous_winners := true;
  if tg_op = 'UPDATE' and row(new.prize_title,new.prize_description,new.prize_approx_value_cad)
       is distinct from row(old.prize_title,old.prize_description,old.prize_approx_value_cad)
     and public.qr_bingo_prize_details_lock(old.event_key,old.vendor_bingo_id,old.vendor_bd_user_id) is not null
  then
    raise exception using errcode = '55000', message = 'Prize details are locked because the winner email is sending, sent, or awaiting delivery confirmation.';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER aa_qr_bingo_single_winner_prize_edit BEFORE INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION enforce_qr_bingo_single_winner_prize_edit();

CREATE OR REPLACE FUNCTION public.acquire_qr_bingo_offer_publish_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('qr_bingo_event_config_publish', 0)
  );
  return new;
end;
$function$
;
CREATE TRIGGER acquire_qr_bingo_offer_publish_lock BEFORE INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION acquire_qr_bingo_offer_publish_lock();

CREATE OR REPLACE FUNCTION public.capture_qr_bingo_vendor_offer_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      select event_key, vendor_bingo_id, vendor_bd_user_id, enabled,
             expires_at, allow_early_draw
        from public.app_review_raffle_fixtures
      union all
      select event_key, vendor_bingo_id, vendor_bd_user_id, enabled,
             expires_at, allow_early_draw
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
    and new.max_winners between 1 and 3
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
    participant_responsibility_disclosure_text,
    max_winners,
    exclude_previous_winners
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
    new.participant_responsibility_disclosure_text,
    new.max_winners,
    new.exclude_previous_winners
  );

  return new;
end;
$function$
;
CREATE TRIGGER capture_qr_bingo_vendor_offer_version AFTER INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION capture_qr_bingo_vendor_offer_version();

CREATE OR REPLACE FUNCTION public.set_qr_bingo_participant_responsibility_disclosure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  participant_disclosure text := current_setting(
    'request.qr_bingo_participant_responsibility_disclosure',
    true
  );
begin
  if new.vendor_responsibility_acknowledged then
    if participant_disclosure is null
      or btrim(participant_disclosure) = ''
      or length(participant_disclosure) > 2000
      or participant_disclosure ~ '[[:cntrl:]]'
    then
      raise exception using
        errcode = '23514',
        message = 'The exact participant responsibility disclosure is required.';
    end if;
    new.participant_responsibility_disclosure_text := participant_disclosure;
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER context_qr_bingo_participant_responsibility_disclosure BEFORE INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION set_qr_bingo_participant_responsibility_disclosure();

CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_current_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  applicable_rules_version text;
  submitted_offer_version timestamptz;
begin
  -- A verified, existing named-vendor consent is not renewed by a contact edit.
  -- Only operational contact columns may differ; archived records stay immutable.
  if tg_op = 'UPDATE' and tg_table_name = 'qr_bingo_raffle_entries' then
  if old.consent_share_contact
    and old.contact_share_scope = 'named_vendor_draw_administration'
    and old.draw_administration_contact_share_acknowledged
    and old.vendor_marketing_consent
    and not exists(select 1 from public.qr_bingo_legacy_qa_archives archive where archive.entry_id=old.id)
    and (to_jsonb(new) - array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash'])
      = (to_jsonb(old) - array['couple_name','couple_email','couple_phone','couple_wedding_date','couple_wedding_venue','entrant_identity_hash'])
  then return new; end if;
  end if;
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
$function$
;
CREATE TRIGGER enforce_qr_bingo_settings_current_rules BEFORE INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION enforce_qr_bingo_current_rules();

CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_responsibility_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  participant_audit_changed boolean := false;
begin
  if tg_table_name = 'qr_bingo_raffle_settings' then
    if new.vendor_responsibility_acknowledged then
      if tg_op = 'INSERT' then
        -- This is evidence of the vendor's current act of acceptance. Do not
        -- backdate it to an older legal-terms view or trust a client timestamp.
        new.vendor_responsibility_acknowledged_at := clock_timestamp();
      else
        if old.vendor_responsibility_acknowledged is distinct from true
          or old.vendor_responsibility_acknowledged_at is null
          or old.vendor_responsibility_version is distinct from new.legal_terms_version
          or old.vendor_responsibility_disclosure_text is distinct from new.vendor_responsibility_disclosure_text
        then
          new.vendor_responsibility_acknowledged_at := clock_timestamp();
        else
          -- A routine settings update cannot rewrite previously recorded
          -- acceptance evidence.
          new.vendor_responsibility_acknowledged_at := old.vendor_responsibility_acknowledged_at;
        end if;
      end if;
      new.vendor_responsibility_version := new.legal_terms_version;
    else
      new.vendor_responsibility_disclosure_text := '';
      new.vendor_responsibility_acknowledged_at := null;
      new.vendor_responsibility_version := '';
    end if;
    if new.vendor_responsibility_acknowledged and (
      not new.legal_terms_accepted
      or new.legal_terms_accepted_at is null
      or new.rules_viewed_at is null
      or not new.apple_non_sponsor_acknowledged
      or nullif(btrim(new.legal_terms_version), '') is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'The prize provider must review and accept the applicable rules before accepting its promotion responsibilities.';
    end if;
    if new.enabled and (
      not new.vendor_responsibility_acknowledged
      or new.vendor_responsibility_acknowledged_at is null
      or new.vendor_responsibility_version is distinct from new.legal_terms_version
      or nullif(btrim(new.vendor_responsibility_disclosure_text), '') is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'The prize provider must accept its current promotion responsibilities before enabling this draw.';
    end if;
  elsif tg_table_name = 'qr_bingo_raffle_entries' then
    if new.promotion_responsibility_acknowledged then
      new.promotion_responsibility_version := new.consent_version;
      new.promotion_responsibility_acknowledged_at := coalesce(
        new.promotion_responsibility_acknowledged_at,
        new.consented_at,
        new.rules_viewed_at,
        clock_timestamp()
      );
    end if;
    if tg_op = 'INSERT' then
      participant_audit_changed := true;
    else
      participant_audit_changed :=
        new.promotion_responsibility_acknowledged is distinct from old.promotion_responsibility_acknowledged
        or new.promotion_disclosure_text is distinct from old.promotion_disclosure_text
        or new.promotion_responsibility_version is distinct from old.promotion_responsibility_version;
    end if;
    if participant_audit_changed and (
      not new.promotion_responsibility_acknowledged
      or new.promotion_responsibility_acknowledged_at is null
      or new.promotion_responsibility_version is distinct from new.consent_version
      or nullif(btrim(new.promotion_disclosure_text), '') is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'The entrant must accept the current vendor-promotion responsibility disclosure.';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE TRIGGER enforce_qr_bingo_settings_responsibility_audit BEFORE INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION enforce_qr_bingo_responsibility_audit();

CREATE OR REPLACE FUNCTION public.ensure_qr_bingo_vendor_offer_version_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.updated_at := clock_timestamp();
  elsif new.updated_at is null or new.updated_at <= old.updated_at then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER ensure_qr_bingo_vendor_offer_version_timestamp BEFORE INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION ensure_qr_bingo_vendor_offer_version_timestamp();

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
    new.participant_responsibility_disclosure_text
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
    old.participant_responsibility_disclosure_text
  ) and not permitted_in_person_rules_reacceptance then
    raise exception using
      errcode = '55000',
      message = 'Vendor offer terms cannot change after the offer first opens; create a new promotion version.';
  end if;

  return new;
end;
$function$
;
CREATE TRIGGER lock_activated_qr_bingo_offer_material_terms BEFORE UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION lock_activated_qr_bingo_offer_material_terms();

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
    new.participant_responsibility_disclosure_text
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
    old.participant_responsibility_disclosure_text
  ) and not permitted_in_person_rules_reacceptance then
    raise exception using
      errcode = '55000',
      message = 'Prize and draw terms cannot change after the first entry; create a new promotion version.';
  end if;

  return new;
end;
$function$
;
CREATE TRIGGER lock_entered_qr_bingo_material_terms BEFORE UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION lock_entered_qr_bingo_material_terms();

CREATE OR REPLACE FUNCTION public.audit_qr_bingo_vendor_responsibility_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  should_record boolean := false;
  authenticated_vendor_id text := nullif(current_setting(
    'request.qr_bingo_authenticated_vendor_bd_user_id',
    true
  ), '');
  source_channel text := nullif(current_setting(
    'request.qr_bingo_vendor_acceptance_source',
    true
  ), '');
  authority_attested boolean := current_setting(
    'request.qr_bingo_vendor_authority_to_bind',
    true
  ) = 'true';
begin
  if new.vendor_responsibility_acknowledged
    and new.vendor_responsibility_acknowledged_at is not null
    and nullif(btrim(new.vendor_responsibility_version), '') is not null
    and nullif(btrim(new.vendor_responsibility_disclosure_text), '') is not null
  then
    if tg_op = 'INSERT' then
      should_record := true;
    else
      should_record := old.vendor_responsibility_acknowledged is distinct from true
        or new.vendor_responsibility_acknowledged_at is distinct from old.vendor_responsibility_acknowledged_at
        or new.vendor_responsibility_version is distinct from old.vendor_responsibility_version
        or new.vendor_responsibility_disclosure_text is distinct from old.vendor_responsibility_disclosure_text;
    end if;
  end if;

  if should_record then
    if authenticated_vendor_id is distinct from new.vendor_bd_user_id
      or source_channel not in ('app', 'website')
      or authority_attested is distinct from true
    then
      raise exception using
        errcode = '23514',
        message = 'Authenticated vendor authority and app/website acceptance context are required.';
    end if;

    insert into public.qr_bingo_vendor_responsibility_acceptance_audit (
      settings_id,
      event_key,
      vendor_bingo_id,
      vendor_bd_user_id,
      vendor_name,
      rules_version,
      responsibility_disclosure_text,
      responsibility_accepted_at,
      legal_terms_accepted_at,
      rules_viewed_at,
      enabled_when_recorded,
      vendor_offer_version,
      authenticated_vendor_bd_user_id,
      acceptance_source,
      authority_to_bind_attested,
      responsibility_disclosure_sha256
    ) values (
      new.id,
      new.event_key,
      new.vendor_bingo_id,
      new.vendor_bd_user_id,
      new.vendor_name,
      new.vendor_responsibility_version,
      new.vendor_responsibility_disclosure_text,
      new.vendor_responsibility_acknowledged_at,
      new.legal_terms_accepted_at,
      new.rules_viewed_at,
      new.enabled,
      new.updated_at,
      authenticated_vendor_id,
      source_channel,
      authority_attested,
      pg_catalog.encode(
        extensions.digest(new.vendor_responsibility_disclosure_text, 'sha256'),
        'hex'
      )
    );
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER record_qr_bingo_vendor_responsibility_acceptance AFTER INSERT OR UPDATE ON public.qr_bingo_raffle_settings FOR EACH ROW EXECUTE FUNCTION audit_qr_bingo_vendor_responsibility_acceptance();
