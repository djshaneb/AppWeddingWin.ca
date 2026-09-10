-- Read-only 2026-09-10 function definitions; no member data or credentials.
CREATE OR REPLACE FUNCTION public.attest_qr_bingo_potential_winner_by_vendor(p_draw_id uuid, p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_decision text, p_eligibility_confirmed boolean DEFAULT false, p_skill_testing_completed_externally boolean DEFAULT false, p_rules_release_confirmed boolean DEFAULT false, p_reviewed_by text DEFAULT ''::text, p_notes text DEFAULT ''::text)
 RETURNS qr_bingo_raffle_draws
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reviewed public.qr_bingo_raffle_draws%rowtype;
  current_config public.qr_bingo_event_configs%rowtype;
  attested_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_decision is distinct from 'verified'
    or p_vendor_bd_user_id !~ '^[1-9][0-9]{0,19}$'
    or p_vendor_bingo_id is distinct from p_vendor_bd_user_id
    or not coalesce(starts_with(p_reviewed_by, 'vendor:' || p_vendor_bd_user_id || ':'), false)
    or length(p_reviewed_by) <= length('vendor:' || p_vendor_bd_user_id || ':')
    or length(p_reviewed_by) > 300 or p_reviewed_by ~ '[<>[:cntrl:]]'
    or p_eligibility_confirmed is distinct from true
    or p_skill_testing_completed_externally is distinct from true
    or p_rules_release_confirmed is distinct from true
    or not public.qr_bingo_winner_evidence_valid(p_notes)
  then
    raise exception using errcode = '22023', message = 'An exact vendor, completed external verification, eligibility, rules/release confirmation, and valid dated evidence are required.';
  end if;

  select * into current_config
    from public.qr_bingo_event_configs
   where published order by revision desc limit 1 for share;
  select * into reviewed
    from public.qr_bingo_raffle_draws
   where id = p_draw_id and event_key = btrim(coalesce(p_event_key, ''))
     and vendor_bingo_id = p_vendor_bingo_id
     and vendor_bd_user_id = p_vendor_bd_user_id
   for update;
  if reviewed.id is null then
    raise exception using errcode = '42501', message = 'Potential-winner selection was not found for this vendor.';
  end if;
  if reviewed.selection_status <> 'potential' then
    raise exception using errcode = '55000', message = 'Only a pending potential winner can be reviewed.';
  end if;
  if current_config.id is null
    or reviewed.rules_version is distinct from current_config.rules_version
    or reviewed.official_rules_url is distinct from current_config.official_rules_url
  then
    raise exception using errcode = '55000', message = 'Current draw rules are required before vendor verification.';
  end if;
  if reviewed.event_key is distinct from current_config.event_key and not (
    exists (
      select 1 from public.qr_bingo_email_test_fixtures fixture
       where fixture.enabled and fixture.expires_at > clock_timestamp()
         and fixture.event_key = reviewed.event_key
         and fixture.vendor_bingo_id = reviewed.vendor_bingo_id
         and fixture.vendor_bd_user_id = reviewed.vendor_bd_user_id
         and fixture.couple_bd_user_id = reviewed.couple_bd_user_id
    ) or exists (
      select 1 from public.app_review_raffle_fixtures fixture
       where fixture.enabled and fixture.expires_at > clock_timestamp()
         and fixture.event_key = reviewed.event_key
         and fixture.vendor_bingo_id = reviewed.vendor_bingo_id
         and fixture.vendor_bd_user_id = reviewed.vendor_bd_user_id
         and (fixture.couple_bd_user_id = reviewed.couple_bd_user_id or exists (
           select 1 from public.app_review_raffle_fixture_participants participant
            where participant.fixture_id = fixture.id
              and participant.couple_bd_user_id = reviewed.couple_bd_user_id
         ))
    )
  ) then
    raise exception using errcode = '42501', message = 'An active exact-account fixture or the current production event is required.';
  end if;

  update public.qr_bingo_raffle_draws
     set selection_status = 'verified',
         eligibility_verified_at = attested_at,
         winner_rules_confirmed_at = attested_at,
         verified_at = attested_at,
         verified_by = p_reviewed_by,
         verification_notes = p_notes,
         skill_question_vendor_attested_at = attested_at,
         skill_question_vendor_attested_by = p_reviewed_by,
         skill_question_vendor_attestation =
           'The vendor confirms it independently completed the required skill-testing verification outside Wedding Win and retained evidence. Wedding Win records this attestation and did not check the answer.'
   where id = reviewed.id
   returning * into reviewed;
  return reviewed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_qr_bingo_draw_email_delivery(p_draw_id uuid, p_channel text, p_lease_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_config public.qr_bingo_event_configs%rowtype;
  current_draw public.qr_bingo_raffle_draws%rowtype;
  delivery public.qr_bingo_draw_email_deliveries%rowtype;
  normalized_channel text := lower(btrim(coalesce(p_channel, '')));
  legacy_sent_at timestamptz;
  v_now timestamptz := clock_timestamp();
  new_claim_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  -- Acquire the promotion lock before locking a draw/delivery row. Settings
  -- saves use the same lock, so a send always captures a coherent current prize.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(draw.event_key || ':' || draw.vendor_bingo_id, 0))
    from public.qr_bingo_raffle_draws draw where draw.id = p_draw_id;

  if p_draw_id is null
    or normalized_channel not in ('vendor', 'couple')
    or p_lease_seconds is null
    or p_lease_seconds < 30
    or p_lease_seconds > 300
  then
    raise exception using errcode = '22023', message = 'A draw, channel, and lease from 30 through 300 seconds are required.';
  end if;

  select *
    into current_config
    from public.qr_bingo_event_configs
   where published
   order by revision desc
   limit 1;

  if current_config.id is null then
    raise exception using errcode = '55000', message = 'Published QR Bingo configuration is unavailable.';
  end if;

  select *
    into current_draw
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
   for update;

  if current_draw.id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo draw was not found.';
  end if;

  if current_draw.event_key is distinct from current_config.event_key then
    raise exception using errcode = '42501', message = 'Outbound email is limited to the published production event.';
  end if;

  if current_draw.selection_status <> 'verified'
    or current_draw.eligibility_verified_at is null
    or not public.qr_bingo_skill_verification_complete(current_draw)
    or current_draw.verified_at is null
    or nullif(btrim(current_draw.verified_by), '') is null
  then
    raise exception using errcode = '55000', message = 'Eligibility and skill-testing verification are required before email delivery.';
  end if;

  if current_config.email_delivery_mode <> 'production_verified_fulfillment'
    or (normalized_channel = 'vendor' and not current_config.send_vendor_email)
    or (normalized_channel = 'couple' and not current_config.send_couple_email)
  then
    raise exception using errcode = '55000', message = 'This QR Bingo email channel is disabled.';
  end if;

  legacy_sent_at := case normalized_channel
    when 'vendor' then current_draw.vendor_email_sent_at
    else current_draw.couple_email_sent_at
  end;

  if legacy_sent_at is not null then
    insert into public.qr_bingo_draw_email_deliveries (
      draw_id,
      channel,
      status,
      sent_at,
      updated_at
    ) values (
      current_draw.id,
      normalized_channel,
      'sent',
      legacy_sent_at,
      v_now
    )
    on conflict (draw_id, channel) do update
      set status = 'sent',
          claim_token = null,
          claim_expires_at = null,
          sent_at = coalesce(public.qr_bingo_draw_email_deliveries.sent_at, excluded.sent_at),
          updated_at = excluded.updated_at;

    select * into delivery
      from public.qr_bingo_draw_email_deliveries
     where draw_id = current_draw.id
       and channel = normalized_channel;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at
    );
  end if;

  insert into public.qr_bingo_draw_email_deliveries (draw_id, channel)
  values (current_draw.id, normalized_channel)
  on conflict (draw_id, channel) do nothing;

  select *
    into delivery
    from public.qr_bingo_draw_email_deliveries
   where draw_id = current_draw.id
     and channel = normalized_channel
   for update;

  if delivery.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at
    );
  end if;

  if delivery.status = 'ambiguous' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'ambiguous', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'last_error', delivery.last_error
    );
  end if;

  if delivery.status = 'claimed' then
    if delivery.claim_expires_at > v_now then
      return jsonb_build_object(
        'ok', true,
        'claimed', false,
        'busy', true,
        'delivery_key', delivery.delivery_key,
        'status', delivery.status,
        'claim_expires_at', delivery.claim_expires_at
      );
    end if;

    update public.qr_bingo_draw_email_deliveries
       set status = 'ambiguous',
           claim_expires_at = null,
           last_error = 'The prior delivery claim expired without a definitive outcome; operator reconciliation is required.',
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'ambiguous', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'last_error', delivery.last_error
    );
  end if;

  new_claim_token := gen_random_uuid();
  update public.qr_bingo_draw_email_deliveries
     set status = 'claimed',
         claim_token = new_claim_token,
         claim_expires_at = v_now + make_interval(secs => p_lease_seconds),
         attempt_count = attempt_count + 1,
         last_claimed_at = v_now,
         prize_snapshot = public.qr_bingo_current_prize_snapshot(current_draw.event_key, current_draw.vendor_bingo_id, current_draw.vendor_bd_user_id),
         last_error = '',
         updated_at = v_now
   where id = delivery.id
  returning * into delivery;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'prize_snapshot', delivery.prize_snapshot,
    'delivery_key', delivery.delivery_key,
    'claim_token', delivery.claim_token,
    'claim_expires_at', delivery.claim_expires_at,
    'attempt_count', delivery.attempt_count,
    'channel', delivery.channel,
    'draw_id', delivery.draw_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_qr_bingo_test_draw_email_delivery(p_draw_id uuid, p_channel text, p_lease_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_config public.qr_bingo_event_configs%rowtype;
  current_fixture public.qr_bingo_email_test_fixtures%rowtype;
  current_scan public.qr_bingo_email_test_fixture_scans%rowtype;
  current_settings public.qr_bingo_raffle_settings%rowtype;
  current_entry public.qr_bingo_raffle_entries%rowtype;
  current_draw public.qr_bingo_raffle_draws%rowtype;
  delivery public.qr_bingo_draw_email_deliveries%rowtype;
  normalized_channel text := lower(btrim(coalesce(p_channel, '')));
  allowed_recipient text;
  eligible_entry_count integer := 0;
  v_now timestamptz := clock_timestamp();
  new_claim_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  -- Acquire the promotion lock before locking a draw/delivery row. Settings
  -- saves use the same lock, so a send always captures a coherent current prize.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(draw.event_key || ':' || draw.vendor_bingo_id, 0))
    from public.qr_bingo_raffle_draws draw where draw.id = p_draw_id;

  if p_draw_id is null
    or normalized_channel not in ('vendor', 'couple')
    or p_lease_seconds is null
    or p_lease_seconds < 30
    or p_lease_seconds > 300
  then
    raise exception using
      errcode = '22023',
      message = 'An email-test draw, a vendor or couple channel, and a lease from 30 through 300 seconds are required.';
  end if;

  select *
    into current_config
    from public.qr_bingo_event_configs
   where published
   order by revision desc
   limit 1
   for share;

  if current_config.id is null then
    raise exception using errcode = '55000', message = 'Published QR Bingo configuration is unavailable.';
  end if;

  select *
    into current_draw
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
   for update;

  if current_draw.id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo email-test draw was not found.';
  end if;

  select *
    into current_fixture
    from public.qr_bingo_email_test_fixtures fixture
   where fixture.enabled
     and fixture.expires_at > v_now
     and fixture.event_key = current_draw.event_key
     and fixture.vendor_bingo_id = current_draw.vendor_bingo_id
     and fixture.vendor_bd_user_id = current_draw.vendor_bd_user_id
     and fixture.couple_bd_user_id = current_draw.couple_bd_user_id
   for update;

  if current_fixture.id is null
    or current_fixture.event_key not like 'email-test-%'
    or current_fixture.event_key = current_config.event_key
  then
    raise exception using errcode = '42501', message = 'An active isolated email-test fixture is required.';
  end if;

  if not current_fixture.send_couple_email
    or (normalized_channel = 'vendor' and not current_fixture.send_vendor_email)
  then
    raise exception using errcode = '42501', message = 'This isolated email test has not authorized the requested notice.';
  end if;

  allowed_recipient := lower(btrim(current_fixture.outbound_recipient_email));
  if allowed_recipient = ''
    or lower(btrim(current_draw.winner_email)) is distinct from allowed_recipient
  then
    raise exception using errcode = '42501', message = 'The verified draw does not match the exact allowlisted recipient.';
  end if;

  if current_draw.selection_status <> 'verified'
    or current_draw.eligibility_verified_at is null
    or not public.qr_bingo_skill_verification_complete(current_draw)
    or current_draw.verified_at is null
    or nullif(btrim(current_draw.verified_by), '') is null
    or current_draw.rules_version is distinct from current_config.rules_version
    or current_draw.official_rules_url is distinct from current_config.official_rules_url
    or current_draw.vendor_name is distinct from current_fixture.vendor_name
    or current_draw.prize_provider_name is distinct from current_fixture.vendor_name
  then
    raise exception using errcode = '55000', message = 'Current rules plus completed eligibility and skill-testing verification are required.';
  end if;

  select *
    into current_scan
    from public.qr_bingo_email_test_fixture_scans scan
   where scan.fixture_id = current_fixture.id
     and scan.couple_bd_user_id = current_fixture.couple_bd_user_id
     and scan.vendor_bingo_id = current_fixture.vendor_bingo_id
   for share;

  if current_scan.id is null then
    raise exception using errcode = '55000', message = 'The allowlisted couple must scan the fixture vendor before email testing.';
  end if;

  select *
    into current_settings
    from public.qr_bingo_raffle_settings settings
   where settings.event_key = current_fixture.event_key
     and settings.vendor_bingo_id = current_fixture.vendor_bingo_id
     and settings.vendor_bd_user_id = current_fixture.vendor_bd_user_id
   limit 1;
  -- The promotion lock already prevents a settings commit during this claim.
  -- Avoid a row-lock inversion with a direct service-role settings UPDATE.

  if current_settings.id is null
    or not current_settings.enabled
    or not current_settings.legal_terms_accepted
    or current_settings.legal_terms_version is distinct from current_config.rules_version
    or current_settings.official_rules_url is distinct from current_config.official_rules_url
    or current_settings.rules_viewed_at is null
    or not current_settings.apple_non_sponsor_acknowledged
    or current_settings.prize_provider_name is distinct from current_fixture.vendor_name
    or nullif(btrim(current_settings.prize_title), '') is null
    or nullif(btrim(current_settings.prize_description), '') is null
    or coalesce(current_settings.prize_approx_value_cad, 0) <= 0
    or not current_settings.no_purchase_required
    or not current_settings.skill_testing_question_required
    or current_settings.alternate_free_entry_url !~ '^https://'
  then
    raise exception using errcode = '55000', message = 'The email-test vendor draw is not open under the current rules.';
  end if;

  select *
    into current_entry
    from public.qr_bingo_raffle_entries entry
   where entry.id = current_draw.entry_id
     and entry.event_key = current_fixture.event_key
     and entry.vendor_bingo_id = current_fixture.vendor_bingo_id
     and entry.vendor_bd_user_id = current_fixture.vendor_bd_user_id
     and entry.couple_bd_user_id = current_fixture.couple_bd_user_id
   limit 1
   for share;

  if current_entry.id is null
    or lower(btrim(current_entry.couple_email)) is distinct from allowed_recipient
    or not current_entry.consent_share_contact
    or nullif(btrim(current_entry.consent_text), '') is null
    or current_entry.consent_version is distinct from current_config.rules_version
    or current_entry.official_rules_url is distinct from current_config.official_rules_url
    or current_entry.rules_viewed_at is null
    or not current_entry.apple_non_sponsor_acknowledged
    or current_entry.contact_share_scope <> 'named_vendor_draw_administration'
    or current_entry.prize_provider_name is distinct from current_fixture.vendor_name
    or current_draw.prize_title is distinct from current_entry.prize_title
    or current_draw.prize_description is distinct from current_entry.prize_description
    or current_draw.prize_approx_value_cad is distinct from current_entry.prize_approx_value_cad
    or not current_entry.no_purchase_required
    or not current_entry.skill_testing_question_required
    or not current_entry.age_of_majority_attested
    or not current_entry.residency_attested
    or not current_entry.exclusions_attested
    or current_entry.eligibility_attested_at is null
    or nullif(btrim(current_entry.eligibility_attestation_text), '') is null
  then
    raise exception using errcode = '55000', message = 'Current explicit couple consent and eligibility attestations are required.';
  end if;

  select count(*)::integer
    into eligible_entry_count
    from public.qr_bingo_raffle_entries entry
   where entry.event_key = current_fixture.event_key
     and entry.vendor_bingo_id = current_fixture.vendor_bingo_id
     and entry.consent_version = current_config.rules_version
     and entry.age_of_majority_attested
     and entry.residency_attested
     and entry.exclusions_attested;

  if eligible_entry_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'The isolated email test requires exactly one eligible allowlisted entry.';
  end if;

  if (normalized_channel = 'couple' and current_draw.couple_email_sent_at is not null)
    or (normalized_channel = 'vendor' and current_draw.vendor_email_sent_at is not null) then
    insert into public.qr_bingo_draw_email_deliveries (
      draw_id,
      channel,
      status,
      sent_at,
      updated_at
    ) values (
      current_draw.id,
      normalized_channel,
      'sent',
      case when normalized_channel = 'vendor' then current_draw.vendor_email_sent_at
        else current_draw.couple_email_sent_at end,
      v_now
    )
    on conflict (draw_id, channel) do update
      set status = 'sent',
          claim_token = null,
          claim_expires_at = null,
          sent_at = coalesce(
            public.qr_bingo_draw_email_deliveries.sent_at,
            excluded.sent_at
          ),
          updated_at = excluded.updated_at;

    select * into delivery
      from public.qr_bingo_draw_email_deliveries
     where draw_id = current_draw.id
       and channel = normalized_channel;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  insert into public.qr_bingo_draw_email_deliveries (draw_id, channel)
  values (current_draw.id, normalized_channel)
  on conflict (draw_id, channel) do nothing;

  select *
    into delivery
    from public.qr_bingo_draw_email_deliveries
   where draw_id = current_draw.id
     and channel = normalized_channel
   for update;

  if delivery.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  if delivery.status = 'ambiguous' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'ambiguous', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'last_error', delivery.last_error,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  if delivery.status = 'claimed' then
    if delivery.claim_expires_at > v_now then
      return jsonb_build_object(
        'ok', true,
        'claimed', false,
        'busy', true,
        'delivery_key', delivery.delivery_key,
        'status', delivery.status,
        'claim_expires_at', delivery.claim_expires_at,
        'channel', normalized_channel,
        'recipient', allowed_recipient,
        'email_test_fixture_id', current_fixture.id
      );
    end if;

    update public.qr_bingo_draw_email_deliveries
       set status = 'ambiguous',
           claim_expires_at = null,
           last_error = 'The prior email-test delivery claim expired without a definitive outcome; operator reconciliation is required.',
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'ambiguous', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'last_error', delivery.last_error,
      'channel', normalized_channel,
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  new_claim_token := gen_random_uuid();
  update public.qr_bingo_draw_email_deliveries
     set status = 'claimed',
         claim_token = new_claim_token,
         claim_expires_at = v_now + make_interval(secs => p_lease_seconds),
         attempt_count = attempt_count + 1,
         last_claimed_at = v_now,
         prize_snapshot = public.qr_bingo_current_prize_snapshot(current_draw.event_key, current_draw.vendor_bingo_id, current_draw.vendor_bd_user_id),
         last_error = '',
         updated_at = v_now
   where id = delivery.id
  returning * into delivery;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'prize_snapshot', delivery.prize_snapshot,
    'delivery_key', delivery.delivery_key,
    'claim_token', delivery.claim_token,
    'claim_expires_at', delivery.claim_expires_at,
    'attempt_count', delivery.attempt_count,
    'channel', normalized_channel,
    'draw_id', delivery.draw_id,
    'recipient', allowed_recipient,
    'email_test_fixture_id', current_fixture.id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_verified_qr_bingo_draw_email_delivery(p_draw_id uuid, p_channel text, p_lease_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_draw public.qr_bingo_raffle_draws%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  -- Acquire the promotion lock before locking a draw/delivery row. Settings
  -- saves use the same lock, so a send always captures a coherent current prize.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(draw.event_key || ':' || draw.vendor_bingo_id, 0))
    from public.qr_bingo_raffle_draws draw where draw.id = p_draw_id;
  select * into current_draw
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
   for update;
  if current_draw.id is null
    or current_draw.selection_status <> 'verified'
    or current_draw.winner_rules_confirmed_at is null
    or nullif(btrim(current_draw.verification_notes), '') is null
  then
    raise exception using errcode = '55000', message = 'Vendor rules/release attestation and dated evidence are required before email delivery.';
  end if;
  return public.claim_qr_bingo_draw_email_delivery(p_draw_id, p_channel, p_lease_seconds);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_verified_qr_bingo_test_draw_email_delivery(p_draw_id uuid, p_channel text, p_lease_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_draw public.qr_bingo_raffle_draws%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  -- Acquire the promotion lock before locking a draw/delivery row. Settings
  -- saves use the same lock, so a send always captures a coherent current prize.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(draw.event_key || ':' || draw.vendor_bingo_id, 0))
    from public.qr_bingo_raffle_draws draw where draw.id = p_draw_id;
  select * into current_draw
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
   for update;
  if current_draw.id is null
    or current_draw.selection_status <> 'verified'
    or current_draw.winner_rules_confirmed_at is null
    or nullif(btrim(current_draw.verification_notes), '') is null
  then
    raise exception using errcode = '55000', message = 'Vendor rules/release attestation and dated evidence are required before test email delivery.';
  end if;
  return public.claim_qr_bingo_test_draw_email_delivery(p_draw_id, p_channel, p_lease_seconds);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_qr_bingo_winner_checks_for_notice(p_draw_id uuid, p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_winner_checks_confirmed boolean, p_confirmed_by text)
 RETURNS qr_bingo_raffle_draws
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_confirmed_by, ''));
  reviewed public.qr_bingo_raffle_draws%rowtype;
  internal_record text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_winner_checks_confirmed is distinct from true
    or p_draw_id is null
    or normalized_event !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event) > 100
    or normalized_vendor !~ '^[1-9][0-9]{0,19}$'
    or normalized_vendor_user is distinct from normalized_vendor
    or left(normalized_actor, length('vendor:' || normalized_vendor || ':'))
       is distinct from 'vendor:' || normalized_vendor || ':'
    or length(normalized_actor) <= length('vendor:' || normalized_vendor || ':')
    or length(normalized_actor) > 260
    or normalized_actor ~ '[<>[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'Explicit vendor confirmation of the completed Draw Rules checks is required.';
  end if;

  -- Same lock order as random selection/replacement: promotion, current event,
  -- then the exact draw. Concurrent Send and Replace cannot confirm a retired
  -- selection or each wait while holding the other's promotion/draw lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_event || ':' || normalized_vendor, 0)
  );
  perform 1 from public.qr_bingo_event_configs
   where published order by revision desc limit 1 for share;
  select * into reviewed from public.qr_bingo_raffle_draws
   where id = p_draw_id and event_key = normalized_event
     and vendor_bingo_id = normalized_vendor
     and vendor_bd_user_id = normalized_vendor_user
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'This selection does not belong to the signed-in vendor.';
  end if;

  -- The losing duplicate Send observes the committed confirmation and returns
  -- it unchanged. Existing legacy/platform evidence is never relabelled.
  if reviewed.selection_status = 'verified' then
    if reviewed.eligibility_verified_at is null
      or not public.qr_bingo_skill_verification_complete(reviewed)
      or reviewed.winner_rules_confirmed_at is null
      or reviewed.verified_at is null
      or nullif(btrim(reviewed.verification_notes), '') is null
    then
      raise exception using errcode = '23514', message = 'The existing winner confirmation is incomplete.';
    end if;
    return reviewed;
  end if;
  if reviewed.selection_status <> 'potential' then
    raise exception using errcode = '23514', message = 'Only the current potential winner can be confirmed. Refresh to see the latest selection.';
  end if;

  internal_record := 'Date: ' || to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD')
    || E'\nMethod: Vendor confirmation of completed Draw Rules checks'
    || E'\nReference: Internal action vendor_raffle_send_notice / selection ' || reviewed.id::text
    || E'\nAdditional notes: Vendor confirmation only. Wedding Win did not independently verify eligibility, an answer, an external document or prize fulfilment.';
  return public.attest_qr_bingo_potential_winner_by_vendor(
    reviewed.id, normalized_event, normalized_vendor, normalized_vendor_user,
    'verified', true, true, true, normalized_actor, internal_record
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_draw_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.selection_status = 'legacy' then
    if tg_op = 'INSERT' then
      raise exception 'Legacy draw status is reserved for pre-migration historical records.';
    end if;
    if old.selection_status <> 'legacy' then
      raise exception 'Legacy draw status is reserved for pre-migration historical records.';
    end if;
    if (to_jsonb(new) - 'drawn_by_bd_user_id')
      is distinct from (to_jsonb(old) - 'drawn_by_bd_user_id')
    then
      raise exception 'Legacy draw records are immutable except for required operator-identity redaction.';
    end if;
    return new;
  end if;

  if new.selection_status = 'verified' and (
    new.eligibility_verified_at is null
    or not public.qr_bingo_skill_verification_complete(new)
    or new.verified_at is null
    or nullif(btrim(new.verified_by), '') is null
  ) then
    raise exception 'Eligibility and skill-testing verification are required before confirming a winner.';
  end if;

  if (new.vendor_email_sent_at is not null or new.couple_email_sent_at is not null) and (
    new.selection_status <> 'verified'
    or new.eligibility_verified_at is null
    or not public.qr_bingo_skill_verification_complete(new)
    or new.verified_at is null
  ) then
    raise exception 'Potential-winner fulfillment emails are blocked until eligibility and skill-testing verification is complete.';
  end if;

  if new.selection_status = 'disqualified'
    and nullif(btrim(new.disqualification_reason), '') is null
  then
    raise exception 'A disqualification reason is required.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_raffle_draw_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  selected_entry public.qr_bingo_raffle_entries%rowtype;
  existing_active_selection_count integer := 0;
  existing_potential_count integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(new.event_key || ':' || new.vendor_bingo_id, 0)
  );

  select * into selected_entry
    from public.qr_bingo_raffle_entries entry
   where entry.id = new.entry_id
     and entry.event_key = new.event_key
     and entry.vendor_bingo_id = new.vendor_bingo_id
     and entry.vendor_bd_user_id = new.vendor_bd_user_id
     and entry.consent_share_contact
     and entry.contact_share_scope = 'named_vendor_draw_administration'
     and entry.draw_administration_contact_share_acknowledged
     and not exists (
       select 1
         from public.qr_bingo_legacy_qa_archives archive
        where archive.entry_id = entry.id
     )
   for share;
  if selected_entry.id is null then
    raise exception using errcode = '23514', message = 'The selected entrant does not belong to this vendor promotion.';
  end if;
  if new.couple_bd_user_id is distinct from selected_entry.couple_bd_user_id then
    raise exception using errcode = '23514', message = 'The selected entrant identity snapshot does not match the entry.';
  end if;
  if tg_op = 'INSERT' then
    new.max_winners := 1;
    new.exclude_previous_winners := true;
  end if;
  -- Status changes preserve historical draw snapshots, even on legacy draws
  -- that already have more than one verified winner.

  if new.selection_status in ('potential', 'verified') then
    if exists (
      select 1
        from public.qr_bingo_raffle_entry_selection_state state
       where state.entry_id = new.entry_id
         and not state.included
    ) then
      raise exception using errcode = '23514', message = 'This entrant is excluded from potential-winner selection.';
    end if;
    if exists (
      select 1
        from public.qr_bingo_raffle_draws prior
       where prior.entry_id = new.entry_id
         and prior.id is distinct from new.id
         and prior.selection_status in ('potential', 'disqualified', 'replaced')
    ) then
      raise exception using errcode = '23514', message = 'This entrant has a pending or disqualified selection record and cannot be selected again.';
    end if;

    -- The optional prior-winner rule is vendor-promotion-specific. A verified
    -- winner at another booth remains eligible for this vendor's promotion.
    if new.exclude_previous_winners then
      perform pg_advisory_xact_lock(
        hashtextextended(
          new.event_key || ':' || new.vendor_bingo_id || ':' || new.couple_bd_user_id,
          0
        )
      );
      if exists (
        select 1
          from public.qr_bingo_raffle_draws prior
         where prior.event_key = new.event_key
           and prior.vendor_bingo_id = new.vendor_bingo_id
           and prior.vendor_bd_user_id = new.vendor_bd_user_id
           and prior.couple_bd_user_id = new.couple_bd_user_id
           and prior.selection_status = 'verified'
           and prior.id is distinct from new.id
      ) then
        raise exception using errcode = '23514', message = 'This couple is already a verified winner in this vendor promotion.';
      end if;
    end if;

    select count(*) into existing_active_selection_count
      from public.qr_bingo_raffle_draws draw
     where draw.event_key = new.event_key
       and draw.vendor_bingo_id = new.vendor_bingo_id
       and draw.vendor_bd_user_id = new.vendor_bd_user_id
       and draw.selection_status in ('potential', 'verified')
       and draw.id is distinct from new.id;
    if existing_active_selection_count >= 1
      and (tg_op = 'INSERT' or old.selection_status not in ('potential', 'verified')
        or row(new.event_key,new.vendor_bingo_id,new.vendor_bd_user_id)
           is distinct from row(old.event_key,old.vendor_bingo_id,old.vendor_bd_user_id)) then
      raise exception using errcode = '23514', message = 'This vendor draw already has its winner.';
    end if;

    if new.selection_status = 'potential' then
      select count(*) into existing_potential_count
        from public.qr_bingo_raffle_draws draw
       where draw.event_key = new.event_key
         and draw.vendor_bingo_id = new.vendor_bingo_id
         and draw.vendor_bd_user_id = new.vendor_bd_user_id
         and draw.selection_status = 'potential'
         and draw.id is distinct from new.id;
      if existing_potential_count > 0 then
        raise exception using errcode = '23514', message = 'A potential winner is already awaiting vendor review.';
      end if;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_qr_bingo_draw_email_delivery(p_delivery_key text, p_claim_token uuid, p_outcome text, p_provider_message_id text DEFAULT ''::text, p_error text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  delivery public.qr_bingo_draw_email_deliveries%rowtype;
  current_draw public.qr_bingo_raffle_draws%rowtype;
  resolved_outcome text := lower(btrim(coalesce(p_outcome, '')));
  clean_provider_id text := btrim(coalesce(p_provider_message_id, ''));
  clean_error text := btrim(coalesce(p_error, ''));
  delivery_draw_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if nullif(btrim(p_delivery_key), '') is null
    or p_claim_token is null
    or resolved_outcome not in ('sent', 'retryable_failure', 'ambiguous')
    or length(clean_provider_id) > 500
    or length(clean_error) > 1000
  then
    raise exception using errcode = '22023', message = 'A delivery key, claim token, supported outcome, and bounded result are required.';
  end if;

  select draw_id
    into delivery_draw_id
    from public.qr_bingo_draw_email_deliveries
   where delivery_key = btrim(p_delivery_key);

  if delivery_draw_id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo email delivery was not found.';
  end if;

  select *
    into current_draw
    from public.qr_bingo_raffle_draws
   where id = delivery_draw_id
   for update;

  select *
    into delivery
    from public.qr_bingo_draw_email_deliveries
   where delivery_key = btrim(p_delivery_key)
   for update;

  if delivery.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at
    );
  end if;

  if delivery.status not in ('claimed', 'ambiguous')
    or delivery.claim_token is distinct from p_claim_token
  then
    raise exception using errcode = '55000', message = 'QR Bingo email delivery claim is no longer owned by this worker.';
  end if;

  if resolved_outcome = 'sent' then
    if current_draw.selection_status <> 'verified'
      or current_draw.eligibility_verified_at is null
      or not public.qr_bingo_skill_verification_complete(current_draw)
      or current_draw.verified_at is null
    then
      raise exception using errcode = '55000', message = 'The draw is no longer eligible for verified-winner email delivery.';
    end if;

    update public.qr_bingo_raffle_draws
       set vendor_email_sent_at = case
             when delivery.channel = 'vendor' then coalesce(vendor_email_sent_at, v_now)
             else vendor_email_sent_at
           end,
           couple_email_sent_at = case
             when delivery.channel = 'couple' then coalesce(couple_email_sent_at, v_now)
             else couple_email_sent_at
           end
     where id = current_draw.id;

    update public.qr_bingo_draw_email_deliveries
       set status = 'sent',
           claim_token = null,
           claim_expires_at = null,
           sent_at = coalesce(sent_at, v_now),
           provider_message_id = clean_provider_id,
           last_error = '',
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  elsif resolved_outcome = 'retryable_failure' then
    if clean_error = '' then
      raise exception using errcode = '22023', message = 'A definitive retryable failure requires an error description.';
    end if;

    update public.qr_bingo_draw_email_deliveries
       set status = 'retryable_failed',
           claim_token = null,
           claim_expires_at = null,
           provider_message_id = clean_provider_id,
           last_error = clean_error,
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  else
    update public.qr_bingo_draw_email_deliveries
       set status = 'ambiguous',
           claim_expires_at = null,
           provider_message_id = clean_provider_id,
           last_error = case
             when clean_error = '' then 'External delivery outcome is ambiguous; operator reconciliation is required.'
             else clean_error
           end,
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  end if;

  return jsonb_build_object(
    'ok', true,
    'delivery_key', delivery.delivery_key,
    'status', delivery.status,
    'sent_at', delivery.sent_at,
    'attempt_count', delivery.attempt_count,
    'provider_message_id', delivery.provider_message_id,
    'last_error', delivery.last_error
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_qr_bingo_event_config(p_expected_revision bigint, p_config jsonb, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested_controls jsonb := '{}'::jsonb;
  venue_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  begin
    if p_config is not null and jsonb_typeof(p_config) = 'object' then
      if p_config ? 'scan_early_access_starts_at' then
        raise exception using errcode = '22023', message = 'The early-access timestamp is managed by the server.';
      end if;
      if p_config ? 'scan_open_early' then
        if jsonb_typeof(p_config -> 'scan_open_early') <> 'boolean' then
          raise exception using errcode = '22023', message = 'scan_open_early must be a boolean.';
        end if;
        requested_controls := requested_controls || jsonb_build_object(
          'scan_open_early', (p_config ->> 'scan_open_early')::boolean
        );
      end if;

      if p_config ? 'venue_name' then
        if jsonb_typeof(p_config -> 'venue_name') <> 'string' then
          raise exception using
            errcode = '22023',
            message = 'venue_name must be a string.';
        end if;
        venue_value := btrim(p_config ->> 'venue_name');
        if venue_value = ''
          or char_length(venue_value) > 160
          or venue_value ~ '[<>]'
          or venue_value ~ '[[:cntrl:]]'
        then
          raise exception using
            errcode = '22023',
            message = 'venue_name must use 1-160 plain-text characters.';
        end if;
        requested_controls := requested_controls ||
          jsonb_build_object('venue_name', venue_value);
      end if;

      if p_config ? 'app_card_enabled' then
        if jsonb_typeof(p_config -> 'app_card_enabled') <> 'boolean' then
          raise exception using
            errcode = '22023',
            message = 'app_card_enabled must be a boolean.';
        end if;
        requested_controls := requested_controls || jsonb_build_object(
          'app_card_enabled',
          (p_config ->> 'app_card_enabled')::boolean
        );
      end if;
    end if;

    perform pg_catalog.set_config(
      'weddingwin.qr_bingo_app_card_controls',
      requested_controls::text,
      true
    );

    return public.publish_qr_bingo_event_config_locked(
      p_expected_revision,
      p_config - 'venue_name' - 'app_card_enabled' - 'scan_open_early',
      p_actor
    );
  exception
    when serialization_failure then
      perform pg_catalog.set_config(
        'weddingwin.qr_bingo_app_card_controls',
        '{}',
        true
      );
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'error', 'QR Bingo event configuration changed; reload before publishing.'
      );
    when invalid_parameter_value then
      perform pg_catalog.set_config(
        'weddingwin.qr_bingo_app_card_controls',
        '{}',
        true
      );
      return jsonb_build_object(
        'ok', false,
        'conflict', false,
        'error', sqlerrm
      );
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.qr_bingo_prize_details_lock(p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1 from public.qr_bingo_raffle_draws draw
     where draw.event_key = p_event_key and draw.vendor_bingo_id = p_vendor_bingo_id
       and draw.vendor_bd_user_id = p_vendor_bd_user_id
       and (draw.vendor_email_sent_at is not null or draw.couple_email_sent_at is not null
         or exists (select 1 from public.qr_bingo_draw_email_deliveries delivery
                     where delivery.draw_id = draw.id and delivery.status = 'sent'))
  ) then return 'sent'; end if;
  if exists (
    select 1 from public.qr_bingo_raffle_draws draw
      join public.qr_bingo_draw_email_deliveries delivery on delivery.draw_id = draw.id
     where draw.event_key = p_event_key and draw.vendor_bingo_id = p_vendor_bingo_id
       and draw.vendor_bd_user_id = p_vendor_bd_user_id and delivery.status = 'ambiguous'
  ) then return 'unconfirmed'; end if;
  if exists (
    select 1 from public.qr_bingo_raffle_draws draw
      join public.qr_bingo_draw_email_deliveries delivery on delivery.draw_id = draw.id
     where draw.event_key = p_event_key and draw.vendor_bingo_id = p_vendor_bingo_id
       and draw.vendor_bd_user_id = p_vendor_bd_user_id and delivery.status in ('pending', 'claimed')
  ) then return 'sending'; end if;
  -- retryable_failed is a definitive no-send outcome. It does not lock edits
  -- unless another channel is still claimed, ambiguous, or already sent.
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_qr_bingo_admin_data(p_dataset text, p_event_key text, p_vendor_id text DEFAULT ''::text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if p_dataset not in ('contacts','entries','winners') or p_limit not between 1 and 5001
    or p_offset not between 0 and 1000000 or length(p_search)>120
    or length(p_event_key)>100 or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or (p_vendor_id<>'' and p_vendor_id !~ '^[1-9][0-9]{0,19}$') then
    raise exception using errcode='22023',message='Invalid QR data filter.';
  end if;
  with records as (
    select profile.couple_bd_user_id as stable_id,profile.updated_at as sort_time,
      concat_ws(' ',profile.couple_bd_user_id,profile.name,profile.email,profile.phone,profile.wedding_venue) as search_text,
      jsonb_build_object('couple_id',profile.couple_bd_user_id,'name',profile.name,'email',profile.email,
        'phone',profile.phone,'wedding_date',profile.wedding_date,'wedding_venue',profile.wedding_venue,'version',profile.version,'updated_at',profile.updated_at) as row_data
      from public.qr_bingo_contact_profiles profile where p_dataset='contacts' and profile.event_key=p_event_key and profile.admin_removed_at is null
        and (p_vendor_id='' or exists(select 1 from public.qr_bingo_raffle_entries entry
          where entry.event_key=profile.event_key and entry.couple_bd_user_id=profile.couple_bd_user_id
            and entry.vendor_bingo_id=p_vendor_id and entry.consent_share_contact
            and entry.contact_share_scope='named_vendor_draw_administration'
            and entry.draw_administration_contact_share_acknowledged and entry.vendor_marketing_consent))
    union all
    select entry.id::text,entry.created_at,concat_ws(' ',entry.couple_bd_user_id,entry.couple_name,entry.couple_email,entry.couple_phone,entry.vendor_name,entry.couple_wedding_venue),
      jsonb_build_object('id',entry.id,'vendor_id',entry.vendor_bingo_id,'vendor_name',entry.vendor_name,
        'couple_id',entry.couple_bd_user_id,'name',entry.couple_name,'email',entry.couple_email,'phone',entry.couple_phone,
        'wedding_date',entry.couple_wedding_date,'wedding_venue',entry.couple_wedding_venue,'entered_at',entry.created_at,'consent_version',entry.consent_version,
        'marketing_consent',entry.vendor_marketing_consent,'selection_status',case when selection.included=false then 'Excluded' else 'Included' end)
      from public.qr_bingo_raffle_entries entry left join public.qr_bingo_raffle_entry_selection_state selection on selection.entry_id=entry.id
      where p_dataset='entries' and entry.event_key=p_event_key and (p_vendor_id='' or entry.vendor_bingo_id=p_vendor_id)
    union all
    select draw.id::text,draw.drawn_at,concat_ws(' ',draw.couple_bd_user_id,draw.winner_name,draw.winner_email,draw.winner_phone,draw.vendor_name),
      jsonb_build_object('id',draw.id,'vendor_id',draw.vendor_bingo_id,'vendor_name',draw.vendor_name,
        'couple_id',draw.couple_bd_user_id,'name',draw.winner_name,'email',draw.winner_email,'phone',draw.winner_phone,
        'wedding_date',draw.winner_wedding_date,'draw_number',draw.draw_number,'drawn_at',draw.drawn_at,
        'selection_status',draw.selection_status,'prize_title',draw.prize_title)
      from public.qr_bingo_raffle_draws draw where p_dataset='winners' and draw.event_key=p_event_key
        and (p_vendor_id='' or draw.vendor_bingo_id=p_vendor_id)
  ),filtered as (
    select * from records where p_search='' or position(lower(p_search) in lower(search_text))>0
  ),paged as (
    select row_data from filtered order by sort_time desc,stable_id limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(row_data) from paged),'[]'::jsonb)) into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_qr_bingo_draw_email_delivery(p_delivery_key text, p_outcome text, p_provider_message_id text DEFAULT ''::text, p_error text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  delivery public.qr_bingo_draw_email_deliveries%rowtype;
  current_draw public.qr_bingo_raffle_draws%rowtype;
  resolved_outcome text := lower(btrim(coalesce(p_outcome, '')));
  clean_provider_id text := btrim(coalesce(p_provider_message_id, ''));
  clean_error text := btrim(coalesce(p_error, ''));
  delivery_draw_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if nullif(btrim(p_delivery_key), '') is null
    or resolved_outcome not in ('sent', 'retryable_failure')
    or length(clean_provider_id) > 500
    or length(clean_error) > 1000
  then
    raise exception using errcode = '22023', message = 'A delivery key, explicit resolution, and bounded result are required.';
  end if;

  select draw_id
    into delivery_draw_id
    from public.qr_bingo_draw_email_deliveries
   where delivery_key = btrim(p_delivery_key);

  if delivery_draw_id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo email delivery was not found.';
  end if;

  select *
    into current_draw
    from public.qr_bingo_raffle_draws
   where id = delivery_draw_id
   for update;

  select *
    into delivery
    from public.qr_bingo_draw_email_deliveries
   where delivery_key = btrim(p_delivery_key)
   for update;

  if delivery.status = 'sent' and resolved_outcome = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at
    );
  end if;

  if delivery.status <> 'ambiguous' then
    raise exception using errcode = '55000', message = 'Only an ambiguous QR Bingo email delivery may be reconciled.';
  end if;

  if resolved_outcome = 'sent' then
    if current_draw.selection_status <> 'verified'
      or current_draw.eligibility_verified_at is null
      or not public.qr_bingo_skill_verification_complete(current_draw)
      or current_draw.verified_at is null
    then
      raise exception using errcode = '55000', message = 'The draw is no longer eligible for verified-winner email delivery.';
    end if;

    update public.qr_bingo_raffle_draws
       set vendor_email_sent_at = case
             when delivery.channel = 'vendor' then coalesce(vendor_email_sent_at, v_now)
             else vendor_email_sent_at
           end,
           couple_email_sent_at = case
             when delivery.channel = 'couple' then coalesce(couple_email_sent_at, v_now)
             else couple_email_sent_at
           end
     where id = current_draw.id;

    update public.qr_bingo_draw_email_deliveries
       set status = 'sent',
           claim_token = null,
           claim_expires_at = null,
           sent_at = coalesce(sent_at, v_now),
           provider_message_id = clean_provider_id,
           last_error = '',
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  else
    if clean_error = '' then
      raise exception using errcode = '22023', message = 'A retryable reconciliation requires an error description.';
    end if;

    update public.qr_bingo_draw_email_deliveries
       set status = 'retryable_failed',
           claim_token = null,
           claim_expires_at = null,
           provider_message_id = clean_provider_id,
           last_error = clean_error,
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reconciled', true,
    'delivery_key', delivery.delivery_key,
    'status', delivery.status,
    'sent_at', delivery.sent_at,
    'provider_message_id', delivery.provider_message_id,
    'last_error', delivery.last_error
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_qr_bingo_potential_winner_by_vendor(p_draw_id uuid, p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_drawn_by_bd_user_id text, p_skill_question_prompt text, p_skill_question_salt text, p_skill_question_answer_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_drawn_by_bd_user_id, ''));
  previous public.qr_bingo_raffle_draws%rowtype;
  replacement public.qr_bingo_raffle_draws%rowtype;
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_draw_id is null
    or normalized_event !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event) > 100
    or normalized_vendor !~ '^[1-9][0-9]{0,19}$'
    or normalized_vendor_user is distinct from normalized_vendor
    or normalized_actor is distinct from normalized_vendor_user
  then
    raise exception using errcode = '22023', message = 'An exact selection, promotion, and vendor actor are required.';
  end if;

  -- Same promotion lock as initial selection and pool changes, acquired before
  -- the draw row. Duplicate taps cannot retire or replace two pending records.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_event || ':' || normalized_vendor, 0)
  );
  select * into previous
    from public.qr_bingo_raffle_draws
   where id = p_draw_id and event_key = normalized_event
     and vendor_bingo_id = normalized_vendor
     and vendor_bd_user_id = normalized_vendor_user
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'This selection does not belong to the signed-in vendor.';
  end if;
  if previous.selection_status <> 'potential' then
    return jsonb_build_object('ok', false, 'code', 'selection_not_pending',
      'error', 'Only the current potential winner can be replaced. Refresh to see the latest selection.');
  end if;

  -- This block is a PostgreSQL subtransaction. A rejected/no-alternative result
  -- rolls back every change inside it before returning the original selection.
  begin
    update public.qr_bingo_raffle_draws
       set selection_status = 'replaced', replaced_at = clock_timestamp(),
           replaced_by_bd_user_id = normalized_actor,
           replacement_note = 'Vendor requested another potential winner.'
     where id = previous.id;

    result := public.select_qr_bingo_potential_winner(
      normalized_event, normalized_vendor, normalized_vendor_user,
      normalized_actor, 'vendor_requested_replacement', p_skill_question_prompt,
      p_skill_question_salt, p_skill_question_answer_hash
    );
    if result->>'ok' is distinct from 'true' then
      raise exception using errcode = 'PZR01', message = 'Replacement selection did not complete.';
    end if;

    select * into replacement
      from public.qr_bingo_raffle_draws
     where id = (result->'draw'->>'id')::uuid
       and event_key = normalized_event and vendor_bingo_id = normalized_vendor
       and vendor_bd_user_id = normalized_vendor_user
       and selection_status = 'potential'
     for update;
    if not found or replacement.couple_bd_user_id = previous.couple_bd_user_id
      or replacement.entry_id = previous.entry_id
    then
      raise exception using errcode = '23514', message = 'A different eligible couple is required for replacement.';
    end if;
    update public.qr_bingo_raffle_draws
       set replaces_draw_id = previous.id
     where id = replacement.id
     returning * into replacement;

    return result || jsonb_build_object('draw', to_jsonb(replacement),
      'replaced_draw_id', previous.id, 'replacement_selected', true);
  exception when sqlstate 'PZR01' then
    if result->>'code' = 'no_eligible_entries' then
      return jsonb_build_object('ok', false, 'code', 'no_replacement_available',
        'error', 'There are no other eligible couples to choose from. Your current potential winner has not changed.');
    end if;
    return coalesce(result, jsonb_build_object('ok', false,
      'code', 'replacement_unavailable', 'error', 'The potential winner could not be changed.'));
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_qr_bingo_potential_winner(p_draw_id uuid, p_decision text, p_eligibility_verified boolean DEFAULT false, p_skill_question_verified boolean DEFAULT false, p_reviewed_by text DEFAULT ''::text, p_notes text DEFAULT ''::text)
 RETURNS qr_bingo_raffle_draws
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  reviewed public.qr_bingo_raffle_draws;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service-role authorization is required.';
  end if;

  select * into reviewed
  from public.qr_bingo_raffle_draws
  where id = p_draw_id
  for update;

  if not found then raise exception 'Potential-winner selection was not found.'; end if;
  if reviewed.selection_status <> 'potential' then
    raise exception 'Only a potential-winner selection can be reviewed.';
  end if;

  if p_decision = 'verified' then
    if not p_eligibility_verified or not p_skill_question_verified
      or nullif(btrim(p_reviewed_by), '') is null
    then
      raise exception 'Both eligibility and skill-testing answer must be verified by an identified reviewer.';
    end if;
    update public.qr_bingo_raffle_draws
    set selection_status = 'verified',
        eligibility_verified_at = now(),
        skill_question_verified_at = now(),
        verified_at = now(),
        verified_by = btrim(p_reviewed_by),
        verification_notes = coalesce(p_notes, '')
    where id = p_draw_id
    returning * into reviewed;
  elsif p_decision = 'disqualified' then
    if nullif(btrim(p_notes), '') is null then
      raise exception 'A disqualification reason is required.';
    end if;
    update public.qr_bingo_raffle_draws
    set selection_status = 'disqualified',
        disqualified_at = now(),
        disqualification_reason = btrim(p_notes),
        verified_by = nullif(btrim(p_reviewed_by), '')
    where id = p_draw_id
    returning * into reviewed;
  else
    raise exception 'Decision must be verified or disqualified.';
  end if;

  return reviewed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_qr_bingo_potential_winner_by_vendor(p_draw_id uuid, p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_decision text, p_eligibility_confirmed boolean DEFAULT false, p_skill_question_answer text DEFAULT ''::text, p_rules_release_confirmed boolean DEFAULT false, p_reviewed_by text DEFAULT ''::text, p_notes text DEFAULT ''::text)
 RETURNS qr_bingo_raffle_draws
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reviewed public.qr_bingo_raffle_draws;
  supplied_hash text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service-role authorization is required.';
  end if;

  select * into reviewed
    from public.qr_bingo_raffle_draws
   where id = p_draw_id
     and event_key = btrim(coalesce(p_event_key, ''))
     and vendor_bingo_id = btrim(coalesce(p_vendor_bingo_id, ''))
     and vendor_bd_user_id = btrim(coalesce(p_vendor_bd_user_id, ''))
   for update;

  if not found then
    raise exception 'Potential-winner selection was not found for this vendor.';
  end if;
  if reviewed.selection_status <> 'potential' then
    raise exception 'Only a potential-winner selection can be reviewed.';
  end if;
  if nullif(btrim(p_reviewed_by), '') is null then
    raise exception 'An identified vendor reviewer is required.';
  end if;

  if p_decision = 'verified' then
    if not p_eligibility_confirmed or not p_rules_release_confirmed
      or nullif(btrim(p_notes), '') is null
    then
      raise exception 'Eligibility, the vendor rules/release attestation, and its dated verification evidence are required.';
    end if;
    if nullif(btrim(reviewed.skill_question_prompt), '') is null
      or nullif(btrim(reviewed.skill_question_salt), '') is null
      or nullif(btrim(reviewed.skill_question_answer_hash), '') is null
      or nullif(btrim(p_skill_question_answer), '') is null
    then
      raise exception 'A valid skill-testing question and answer are required.';
    end if;

    supplied_hash := encode(
      extensions.digest(
        convert_to(
          reviewed.skill_question_salt || ':' || lower(btrim(p_skill_question_answer)),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    if supplied_hash <> reviewed.skill_question_answer_hash then
      raise exception 'The skill-testing answer is incorrect.';
    end if;

    update public.qr_bingo_raffle_draws
       set selection_status = 'verified',
           eligibility_verified_at = now(),
           skill_question_verified_at = now(),
           winner_rules_confirmed_at = now(),
           verified_at = now(),
           verified_by = btrim(p_reviewed_by),
           verification_notes = btrim(p_notes)
     where id = p_draw_id
     returning * into reviewed;
  elsif p_decision = 'disqualified' then
    if nullif(btrim(p_notes), '') is null then
      raise exception 'A disqualification reason is required.';
    end if;
    update public.qr_bingo_raffle_draws
       set selection_status = 'disqualified',
           disqualified_at = now(),
           disqualification_reason = btrim(p_notes),
           verified_by = btrim(p_reviewed_by)
     where id = p_draw_id
     returning * into reviewed;
  else
    raise exception 'Decision must be verified or disqualified.';
  end if;

  return reviewed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.select_qr_bingo_potential_winner(p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_drawn_by_bd_user_id text, p_draw_reason text, p_skill_question_prompt text, p_skill_question_salt text, p_skill_question_answer_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_drawn_by_bd_user_id, ''));
  normalized_reason text := btrim(coalesce(p_draw_reason, ''));
  normalized_prompt text := btrim(coalesce(p_skill_question_prompt, ''));
  normalized_salt text := lower(btrim(coalesce(p_skill_question_salt, '')));
  normalized_answer_hash text := lower(btrim(coalesce(p_skill_question_answer_hash, '')));
  settings public.qr_bingo_raffle_settings%rowtype;
  offer public.qr_bingo_vendor_offer_versions%rowtype;
  current_config public.qr_bingo_event_configs%rowtype;
  selected_entry record;
  created_draw public.qr_bingo_raffle_draws%rowtype;
  active_fixture boolean := false;
  fixture_allows_early_draw boolean := false;
  active_selection_count integer := 0;
  next_draw_number integer := 1;
  available_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if normalized_event !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event) > 100
    or normalized_vendor !~ '^[1-9][0-9]{0,19}$'
    or normalized_vendor_user is distinct from normalized_vendor
    or normalized_actor is distinct from normalized_vendor_user
    or length(normalized_reason) > 120
    or normalized_reason ~ '[[:cntrl:]]'
    or length(normalized_prompt) < 1
    or length(normalized_prompt) > 300
    or normalized_prompt ~ '[<>[:cntrl:]]'
    or normalized_salt !~ '^[0-9a-f]{32}$'
    or normalized_answer_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'Valid exact promotion, vendor actor, draw reason, and skill challenge values are required.';
  end if;
  if normalized_reason = '' then
    normalized_reason := 'initial';
  end if;

  -- Serialize selection for this exact vendor promotion.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_event || ':' || normalized_vendor,
      0
    )
  );

  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
   order by config.revision desc
   limit 1
   for share;
  if current_config.id is null or not current_config.vendor_draws_enabled then
    return jsonb_build_object(
      'ok', false,
      'code', 'draws_disabled',
      'error', 'Vendor QR Bingo draws are not currently available.'
    );
  end if;

  select fixture.allow_early_draw
    into fixture_allows_early_draw
    from (
      select app.event_key, app.vendor_bingo_id, app.vendor_bd_user_id,
             app.enabled, app.expires_at, app.allow_early_draw
        from public.app_review_raffle_fixtures app
      union all
      select email.event_key, email.vendor_bingo_id, email.vendor_bd_user_id,
             email.enabled, email.expires_at, email.allow_early_draw
        from public.qr_bingo_email_test_fixtures email
    ) fixture
   where fixture.event_key = normalized_event
     and fixture.vendor_bingo_id = normalized_vendor
     and fixture.vendor_bd_user_id = normalized_vendor_user
     and fixture.enabled
     and fixture.expires_at > clock_timestamp()
   limit 1;
  active_fixture := found;
  fixture_allows_early_draw := coalesce(fixture_allows_early_draw, false);

  if not active_fixture and current_config.event_key is distinct from normalized_event then
    return jsonb_build_object(
      'ok', false,
      'code', 'event_unavailable',
      'error', 'The requested QR Bingo event is not the current published event.'
    );
  end if;

  select vendor_settings.*
    into settings
    from public.qr_bingo_raffle_settings vendor_settings
   where vendor_settings.event_key = normalized_event
     and vendor_settings.vendor_bingo_id = normalized_vendor
     and vendor_settings.vendor_bd_user_id = normalized_vendor_user
   for update;
  if settings.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'settings_missing',
      'error', 'QR Bingo vendor settings were not found.'
    );
  end if;

  select version.*
    into offer
    from public.qr_bingo_vendor_offer_versions version
   where version.event_key = normalized_event
     and version.vendor_bingo_id = normalized_vendor
     and version.vendor_offer_version = settings.updated_at
   for share;

  if not settings.enabled
    or settings.vendor_bd_user_id is distinct from settings.vendor_bingo_id
    or settings.max_winners not between 1 and 3
    or not settings.legal_terms_accepted
    or settings.legal_terms_version is distinct from current_config.rules_version
    or settings.legal_terms_accepted_at is null
    or settings.rules_viewed_at is null
    or not settings.apple_non_sponsor_acknowledged
    or not settings.vendor_responsibility_acknowledged
    or settings.vendor_responsibility_acknowledged_at is null
    or settings.vendor_responsibility_version is distinct from current_config.rules_version
    or nullif(btrim(settings.vendor_responsibility_disclosure_text), '') is null
    or nullif(btrim(settings.participant_responsibility_disclosure_text), '') is null
    or nullif(btrim(settings.vendor_name), '') is null
    or nullif(btrim(settings.prize_title), '') is null
    or nullif(btrim(settings.prize_description), '') is null
    or coalesce(settings.prize_approx_value_cad, 0) <= 0
    or nullif(btrim(settings.prize_provider_name), '') is null
    or not settings.no_purchase_required
    or not settings.skill_testing_question_required
    or settings.entry_closes_at is null
    or settings.draw_opens_at is null
    or settings.draw_at is null
    or settings.draw_at < settings.entry_closes_at
    or (not fixture_allows_early_draw and settings.draw_opens_at < settings.entry_closes_at)
    or offer.vendor_offer_version is null
    or not offer.offer_enterable
    or offer.activation_excluded_as_legacy_qa
    or row(
      settings.vendor_bd_user_id,
      settings.vendor_name,
      settings.enabled,
      settings.prize_title,
      settings.prize_description,
      settings.prize_approx_value_cad,
      settings.eligibility_region,
      settings.entry_closes_at,
      settings.draw_opens_at,
      settings.draw_at,
      settings.odds_basis,
      settings.no_purchase_required,
      settings.skill_testing_question_required,
      settings.official_rules_url,
      settings.alternate_free_entry_url,
      settings.legal_terms_version,
      settings.legal_terms_accepted,
      settings.legal_terms_accepted_at,
      settings.rules_viewed_at,
      settings.administrator_name,
      settings.co_sponsor_name,
      settings.prize_provider_name,
      settings.apple_non_sponsor_acknowledged,
      settings.vendor_responsibility_acknowledged,
      settings.vendor_responsibility_disclosure_text,
      settings.vendor_responsibility_acknowledged_at,
      settings.vendor_responsibility_version,
      settings.participant_responsibility_disclosure_text,
      settings.max_winners,
      settings.exclude_previous_winners
    ) is distinct from row(
      offer.vendor_bd_user_id,
      offer.vendor_name,
      offer.enabled,
      offer.prize_title,
      offer.prize_description,
      offer.prize_approx_value_cad,
      offer.eligibility_region,
      offer.entry_closes_at,
      offer.draw_opens_at,
      offer.draw_at,
      offer.odds_basis,
      offer.no_purchase_required,
      offer.skill_testing_question_required,
      offer.official_rules_url,
      offer.alternate_free_entry_url,
      offer.rules_version,
      offer.legal_terms_accepted,
      offer.legal_terms_accepted_at,
      offer.rules_viewed_at,
      offer.administrator_name,
      offer.co_sponsor_name,
      offer.prize_provider_name,
      offer.apple_non_sponsor_acknowledged,
      offer.vendor_responsibility_acknowledged,
      offer.vendor_responsibility_disclosure_text,
      offer.vendor_responsibility_acknowledged_at,
      offer.vendor_responsibility_version,
      offer.participant_responsibility_disclosure_text,
      offer.max_winners,
      offer.exclude_previous_winners
    )
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_vendor_offer',
      'error', 'The vendor offer is incomplete or no longer matches its immutable accepted terms.'
    );
  end if;

  if not active_fixture and row(
    settings.official_rules_url,
    settings.alternate_free_entry_url,
    settings.eligibility_region,
    settings.entry_closes_at,
    settings.draw_opens_at,
    settings.draw_at
  ) is distinct from row(
    current_config.official_rules_url,
    current_config.alternate_free_entry_url,
    current_config.eligibility_region,
    current_config.entry_closes_at,
    current_config.draw_opens_at,
    current_config.draw_at
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_event_config',
      'error', 'The vendor offer no longer matches the current event terms.'
    );
  end if;

  available_at := greatest(
    settings.entry_closes_at,
    settings.draw_opens_at,
    settings.draw_at
  );
  if not (active_fixture and fixture_allows_early_draw)
    and clock_timestamp() < available_at
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'draw_not_open',
      'error', 'Draw is not open yet.',
      'draw_opens_at', available_at
    );
  end if;

  if exists (
    select 1
      from public.qr_bingo_raffle_draws draw
     where draw.event_key = normalized_event
       and draw.vendor_bingo_id = normalized_vendor
       and draw.vendor_bd_user_id = normalized_vendor_user
       and draw.selection_status = 'potential'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'awaiting_verification',
      'error', 'A potential winner is already awaiting vendor review.'
    );
  end if;

  select count(*)
    into active_selection_count
    from public.qr_bingo_raffle_draws draw
   where draw.event_key = normalized_event
     and draw.vendor_bingo_id = normalized_vendor
     and draw.vendor_bd_user_id = normalized_vendor_user
     and draw.selection_status in ('potential', 'verified');
  -- Draw numbers are append-only across every historical status.
  select coalesce(max(draw.draw_number), 0) + 1
    into next_draw_number
    from public.qr_bingo_raffle_draws draw
   where draw.event_key = normalized_event
     and draw.vendor_bingo_id = normalized_vendor
     and draw.vendor_bd_user_id = normalized_vendor_user;

  if active_selection_count >= 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'winner_limit_reached',
      'error', 'The disclosed winner limit for this vendor promotion has been reached.',
      'max_winners', 1,
      'active_winner_count', active_selection_count
    );
  end if;

  with eligible as materialized (
    select entry.*
      from public.qr_bingo_raffle_entries entry
     where entry.event_key = normalized_event
       and entry.vendor_bingo_id = normalized_vendor
       and entry.vendor_bd_user_id = normalized_vendor_user
       and entry.vendor_offer_version is not null
       and entry.consent_share_contact
       and entry.contact_share_scope = 'named_vendor_draw_administration'
       and entry.consent_version = current_config.rules_version
       and entry.rules_viewed_at is not null
       and entry.apple_non_sponsor_acknowledged
       and entry.draw_administration_contact_share_acknowledged
       and entry.draw_administration_contact_share_acknowledged_at is not null
       and entry.draw_administration_contact_share_version = current_config.rules_version
       and nullif(btrim(entry.draw_administration_contact_share_consent_text), '') is not null
       and entry.age_of_majority_attested
       and entry.residency_attested
       and entry.exclusions_attested
       and entry.eligibility_attested_at is not null
       and nullif(btrim(entry.eligibility_attestation_text), '') is not null
       and entry.promotion_responsibility_acknowledged
       and entry.promotion_responsibility_acknowledged_at is not null
       and entry.promotion_responsibility_version = current_config.rules_version
       and nullif(btrim(entry.promotion_disclosure_text), '') is not null
       and nullif(btrim(entry.consent_text), '') is not null
       and nullif(btrim(entry.couple_name), '') is not null
       and nullif(btrim(entry.couple_email), '') is not null
       and (
         active_fixture
         or (
           entry.entry_method = 'qr_scan_opt_in'
           and entry.in_show_scan_verified is true
           and entry.in_show_scan_verified_at is not null
         )
       )
       -- Prize revisions and the single-winner operational cap do not rewrite
       -- or invalidate existing entrant evidence. All other material terms match.
       and row(
         entry.vendor_name,
         entry.eligibility_region,
         entry.entry_closes_at,
         entry.draw_at,
         entry.odds_basis,
         entry.no_purchase_required,
         entry.skill_testing_question_required,
         entry.official_rules_url,
         entry.alternate_free_entry_url,
         entry.administrator_name,
         entry.co_sponsor_name,
         entry.prize_provider_name,
         entry.promotion_disclosure_text
       ) is not distinct from row(
         offer.vendor_name,
         offer.eligibility_region,
         offer.entry_closes_at,
         offer.draw_at,
         offer.odds_basis,
         offer.no_purchase_required,
         offer.skill_testing_question_required,
         offer.official_rules_url,
         offer.alternate_free_entry_url,
         offer.administrator_name,
         offer.co_sponsor_name,
         offer.prize_provider_name,
         offer.participant_responsibility_disclosure_text
       )
       and not exists (
         select 1
           from public.qr_bingo_legacy_qa_archives archive
          where archive.entry_id = entry.id
       )
       and not exists (
         select 1
           from public.qr_bingo_raffle_entry_selection_state state
          where state.entry_id = entry.id
            and not state.included
       )
       and not exists (
         select 1
           from public.qr_bingo_raffle_draws prior
          where prior.entry_id = entry.id
            and prior.selection_status in ('potential', 'disqualified', 'replaced')
       )
       and (
         not exists (
           select 1
             from public.qr_bingo_raffle_draws prior
            where prior.event_key = entry.event_key
              and prior.vendor_bingo_id = entry.vendor_bingo_id
              and prior.vendor_bd_user_id = entry.vendor_bd_user_id
              and prior.couple_bd_user_id = entry.couple_bd_user_id
              and prior.selection_status = 'verified'
         )
       )
  ), randomized as (
    select eligible.*,
           count(*) over ()::integer as eligible_entry_count,
           extensions.gen_random_bytes(16) as random_key
      from eligible
  )
  select *
    into selected_entry
    from randomized
   order by random_key, id
   limit 1;

  if selected_entry.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_eligible_entries',
      'error', 'No included, eligible entry requests remain for potential-winner selection.',
      'eligible_entry_count', 0
    );
  end if;

  insert into public.qr_bingo_raffle_draws (
    event_key,
    vendor_bingo_id,
    vendor_bd_user_id,
    vendor_name,
    entry_id,
    couple_bd_user_id,
    winner_name,
    winner_email,
    winner_phone,
    winner_wedding_date,
    prize_title,
    prize_description,
    claim_instructions,
    prize_approx_value_cad,
    eligibility_region,
    entry_closes_at,
    scheduled_draw_at,
    odds_basis,
    no_purchase_required,
    skill_testing_question_required,
    official_rules_url,
    rules_version,
    administrator_name,
    co_sponsor_name,
    prize_provider_name,
    apple_non_sponsor_disclaimer,
    alternate_free_entry_url,
    skill_question_prompt,
    skill_question_salt,
    skill_question_answer_hash,
    selection_status,
    max_winners,
    exclude_previous_winners,
    draw_number,
    draw_reason,
    drawn_by_bd_user_id
  ) values (
    selected_entry.event_key,
    selected_entry.vendor_bingo_id,
    selected_entry.vendor_bd_user_id,
    selected_entry.vendor_name,
    selected_entry.id,
    selected_entry.couple_bd_user_id,
    selected_entry.couple_name,
    selected_entry.couple_email,
    selected_entry.couple_phone,
    selected_entry.couple_wedding_date,
    selected_entry.prize_title,
    selected_entry.prize_description,
    settings.claim_instructions,
    selected_entry.prize_approx_value_cad,
    selected_entry.eligibility_region,
    selected_entry.entry_closes_at,
    selected_entry.draw_at,
    selected_entry.odds_basis,
    selected_entry.no_purchase_required,
    selected_entry.skill_testing_question_required,
    selected_entry.official_rules_url,
    selected_entry.consent_version,
    selected_entry.administrator_name,
    selected_entry.co_sponsor_name,
    selected_entry.prize_provider_name,
    'Apple Inc. is not a sponsor of and is not involved in this promotion.',
    selected_entry.alternate_free_entry_url,
    normalized_prompt,
    normalized_salt,
    normalized_answer_hash,
    'potential',
    1,
    true,
    next_draw_number,
    normalized_reason,
    normalized_actor
  )
  returning * into created_draw;

  return jsonb_build_object(
    'ok', true,
    'draw', to_jsonb(created_draw),
    'eligible_entry_count', selected_entry.eligible_entry_count,
    'max_winners', 1,
    'active_winner_count', active_selection_count + 1,
    'remaining_winner_slots', greatest(
      1 - active_selection_count - 1,
      0
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_qr_bingo_raffle_entry_selection_state(p_entry_id uuid, p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_included boolean, p_exclusion_reason text, p_actor_bd_user_id text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_entry public.qr_bingo_raffle_entries%rowtype;
  current_state public.qr_bingo_raffle_entry_selection_state%rowtype;
  saved_state public.qr_bingo_raffle_entry_selection_state%rowtype;
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_actor_bd_user_id, ''));
  normalized_source text := lower(btrim(coalesce(p_source, '')));
  normalized_reason text := btrim(coalesce(p_exclusion_reason, ''));
  previous_included boolean := true;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_entry_id is null
    or normalized_event = ''
    or normalized_vendor = ''
    or normalized_vendor_user = ''
    or normalized_actor = ''
    or normalized_actor is distinct from normalized_vendor_user
    or p_included is null
    or normalized_source not in ('app', 'website')
    or length(normalized_reason) > 500
    or (not p_included and normalized_reason = '')
  then
    raise exception using errcode = '22023', message = 'A valid entrant state, exclusion reason, vendor actor, and app or website source are required.';
  end if;
  if p_included then
    normalized_reason := '';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(normalized_event || ':' || normalized_vendor, 0)
  );

  select * into selected_entry
    from public.qr_bingo_raffle_entries
   where id = p_entry_id
     and event_key = normalized_event
     and vendor_bingo_id = normalized_vendor
     and vendor_bd_user_id = normalized_vendor_user
     and consent_share_contact
     and contact_share_scope = 'named_vendor_draw_administration'
     and draw_administration_contact_share_acknowledged
   for update;
  if selected_entry.id is null then
    raise exception using errcode = 'P0002', message = 'The entrant was not found for this vendor draw.';
  end if;
  if exists (
    select 1 from public.qr_bingo_raffle_draws draw
     where draw.event_key = normalized_event
       and draw.vendor_bingo_id = normalized_vendor
       and draw.vendor_bd_user_id = normalized_vendor_user
       and draw.selection_status = 'potential'
  ) then
    raise exception using errcode = '55000', message = 'Entrants cannot be changed while a potential winner is pending.';
  end if;
  if exists (
    select 1 from public.qr_bingo_raffle_draws draw
     where draw.entry_id = p_entry_id
       and draw.selection_status in ('disqualified', 'replaced')
  ) then
    raise exception using errcode = '55000', message = 'A preserved selection record cannot be removed or restored.';
  end if;

  select * into current_state
    from public.qr_bingo_raffle_entry_selection_state state
   where state.entry_id = p_entry_id
   for update;
  previous_included := coalesce(current_state.included, true);
  if current_state.entry_id is not null
    and current_state.included is not distinct from p_included
    and current_state.exclusion_reason is not distinct from normalized_reason
  then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'state', to_jsonb(current_state)
    );
  end if;

  insert into public.qr_bingo_raffle_entry_selection_state (
    entry_id, event_key, vendor_bingo_id, vendor_bd_user_id, included,
    exclusion_reason, updated_by_bd_user_id, update_source
  ) values (
    p_entry_id, normalized_event, normalized_vendor, normalized_vendor_user,
    p_included, normalized_reason, normalized_actor, normalized_source
  )
  on conflict (entry_id) do update
    set included = excluded.included,
        exclusion_reason = excluded.exclusion_reason,
        updated_by_bd_user_id = excluded.updated_by_bd_user_id,
        update_source = excluded.update_source,
        version = public.qr_bingo_raffle_entry_selection_state.version + 1,
        updated_at = clock_timestamp()
  returning * into saved_state;

  insert into public.qr_bingo_raffle_entry_selection_audit (
    entry_id, event_key, vendor_bingo_id, vendor_bd_user_id,
    previous_included, included, exclusion_reason, actor_bd_user_id,
    update_source
  ) values (
    p_entry_id, normalized_event, normalized_vendor, normalized_vendor_user,
    previous_included, p_included, normalized_reason, normalized_actor,
    normalized_source
  );

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'state', to_jsonb(saved_state)
  );
end;
$function$
;
