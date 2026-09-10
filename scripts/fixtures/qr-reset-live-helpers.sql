-- Read-only function definitions for isolated reset integration tests.
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

CREATE OR REPLACE FUNCTION public.qr_bingo_current_prize_snapshot(p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'prize_title', settings.prize_title, 'prize_description', settings.prize_description,
    'prize_approx_value_cad', settings.prize_approx_value_cad,
    'vendor_offer_version', settings.updated_at
  ) from public.qr_bingo_raffle_settings settings
   where settings.event_key = p_event_key and settings.vendor_bingo_id = p_vendor_bingo_id
       and settings.vendor_bd_user_id = p_vendor_bd_user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.qr_bingo_skill_verification_complete(p_draw qr_bingo_raffle_draws)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(
    (p_draw).skill_question_verified_at is not null
    or (
      (p_draw).skill_question_vendor_attested_at is not null
      and (p_draw).vendor_bd_user_id ~ '^[1-9][0-9]{0,19}$'
      and (p_draw).skill_question_vendor_attested_by = (p_draw).verified_by
      and starts_with((p_draw).skill_question_vendor_attested_by,
        'vendor:' || (p_draw).vendor_bd_user_id || ':')
      and length((p_draw).skill_question_vendor_attested_by) >
        length('vendor:' || (p_draw).vendor_bd_user_id || ':')
      and (p_draw).skill_question_vendor_attestation =
        'The vendor confirms it independently completed the required skill-testing verification outside Wedding Win and retained evidence. Wedding Win records this attestation and did not check the answer.'
      and (p_draw).winner_rules_confirmed_at is not null
      and nullif(btrim((p_draw).verification_notes), '') is not null
    ), false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.qr_bingo_winner_evidence_valid(p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  evidence text[];
  evidence_date date;
begin
  if p_notes is null or length(p_notes) > 1100 then return false; end if;
  -- PostgreSQL ARE repetition limits stop at255; enforce field sizes below
  -- instead of using invalid {1,300}/{1,400} repetition bounds.
  evidence := regexp_match(p_notes,
    E'^Date: ([0-9]{4}-[0-9]{2}-[0-9]{2})\nMethod: ([^\n]+)\nReference: ([^\n]+)(?:\nAdditional notes: ([^\n]+))?$');
  if evidence is null then return false; end if;
  evidence_date := evidence[1]::date;
  if to_char(evidence_date, 'YYYY-MM-DD') <> evidence[1]
    or btrim(evidence[2]) = '' or btrim(evidence[3]) = ''
    or length(evidence[2]) > 300 or length(evidence[3]) > 300
    or length(evidence[4]) > 400
    or (evidence[4] is not null and btrim(evidence[4]) = '')
    or concat(evidence[2], evidence[3], evidence[4]) ~ '[<>[:cntrl:]]'
    or position(chr(8232) in p_notes) > 0
    or position(chr(8233) in p_notes) > 0
  then return false; end if;
  return true;
exception when others then
  return false;
end;
$function$
;
