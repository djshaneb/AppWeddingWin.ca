-- One active winner going forward; preserve all historical selections and
-- entrant/offer consent snapshots. Only prize title/description/value may be
-- revised until notice delivery is claimed or known to have been sent.
-- Function bodies below are derived from a read-only live schema snapshot.

-- Fail closed if production has changed since this reviewed baseline.
do $baseline$
begin
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_qr_bingo_draw_email_delivery'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_draw_id uuid, p_channel text, p_lease_seconds integer')
      is distinct from 'c8ea7053b289af8e851f598b418ee515' then
    raise exception 'Unexpected live baseline for claim_qr_bingo_draw_email_delivery; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_qr_bingo_test_draw_email_delivery'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_draw_id uuid, p_channel text, p_lease_seconds integer')
      is distinct from '6b956b1db8e951a829ce8e21142a712b' then
    raise exception 'Unexpected live baseline for claim_qr_bingo_test_draw_email_delivery; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_verified_qr_bingo_draw_email_delivery'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_draw_id uuid, p_channel text, p_lease_seconds integer')
      is distinct from '54173683fbf0a603ffd298e4dea9edb2' then
    raise exception 'Unexpected live baseline for claim_verified_qr_bingo_draw_email_delivery; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_verified_qr_bingo_test_draw_email_delivery'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_draw_id uuid, p_channel text, p_lease_seconds integer')
      is distinct from 'f96570f14a7e2f31b3a8650232d56bcc' then
    raise exception 'Unexpected live baseline for claim_verified_qr_bingo_test_draw_email_delivery; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='compare_and_update_qr_bingo_vendor_settings'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_event_key text, p_vendor_bingo_id text, p_expected_updated_at timestamp with time zone, p_patch jsonb')
      is distinct from '45c1b3e2ef395940083a570e86c71f36' then
    raise exception 'Unexpected live baseline for compare_and_update_qr_bingo_vendor_settings; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='enforce_qr_bingo_raffle_draw_limit'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='')
      is distinct from 'b6a43a2b9f5f9a2d252ea2f5ab15e02a' then
    raise exception 'Unexpected live baseline for enforce_qr_bingo_raffle_draw_limit; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='lock_activated_qr_bingo_offer_material_terms'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='')
      is distinct from 'fbe5e374523629f11d97fb82218cfce4' then
    raise exception 'Unexpected live baseline for lock_activated_qr_bingo_offer_material_terms; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='lock_entered_qr_bingo_material_terms'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='')
      is distinct from '4d66e4f45a73578df0a00fb459d30a91' then
    raise exception 'Unexpected live baseline for lock_entered_qr_bingo_material_terms; review before applying.';
  end if;
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='select_qr_bingo_potential_winner'
        and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_drawn_by_bd_user_id text, p_draw_reason text, p_skill_question_prompt text, p_skill_question_salt text, p_skill_question_answer_hash text')
      is distinct from 'fb6e81f198817a44aeeb1521afd7f614' then
    raise exception 'Unexpected live baseline for select_qr_bingo_potential_winner; review before applying.';
  end if;
end;
$baseline$;

alter table public.qr_bingo_draw_email_deliveries
  add column prize_snapshot jsonb;
comment on column public.qr_bingo_draw_email_deliveries.prize_snapshot is
  'Prize and offer revision captured atomically when this email claim starts. Original entry and draw snapshots remain unchanged.';

create or replace function public.qr_bingo_prize_details_lock(
  p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;
revoke all on function public.qr_bingo_prize_details_lock(text,text,text) from public, anon, authenticated;
grant execute on function public.qr_bingo_prize_details_lock(text,text,text) to service_role;

create or replace function public.qr_bingo_current_prize_snapshot(
  p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'prize_title', settings.prize_title, 'prize_description', settings.prize_description,
    'prize_approx_value_cad', settings.prize_approx_value_cad,
    'vendor_offer_version', settings.updated_at
  ) from public.qr_bingo_raffle_settings settings
   where settings.event_key = p_event_key and settings.vendor_bingo_id = p_vendor_bingo_id
       and settings.vendor_bd_user_id = p_vendor_bd_user_id;
$$;
revoke all on function public.qr_bingo_current_prize_snapshot(text,text,text) from public, anon, authenticated;
grant execute on function public.qr_bingo_current_prize_snapshot(text,text,text) to service_role;

create or replace function public.enforce_qr_bingo_single_winner_prize_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;
revoke all on function public.enforce_qr_bingo_single_winner_prize_edit() from public, anon, authenticated;
-- Keep this before all existing material-term comparisons and snapshot capture.
create trigger aa_qr_bingo_single_winner_prize_edit
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.enforce_qr_bingo_single_winner_prize_edit();

-- Replace the narrow, live-reviewed function bodies. CREATE OR REPLACE keeps
-- the existing service-only ACLs; no entrant, winner or consent row is rewritten.
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
    or normalized_channel <> 'couple'
    or p_lease_seconds is null
    or p_lease_seconds < 30
    or p_lease_seconds > 300
  then
    raise exception using
      errcode = '22023',
      message = 'An email-test draw, the couple channel, and a lease from 30 through 300 seconds are required.';
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

  if current_fixture.send_vendor_email
    or not current_fixture.send_couple_email
  then
    raise exception using errcode = '42501', message = 'The isolated email test permits only the couple notice.';
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

  if current_draw.couple_email_sent_at is not null then
    insert into public.qr_bingo_draw_email_deliveries (
      draw_id,
      channel,
      status,
      sent_at,
      updated_at
    ) values (
      current_draw.id,
      'couple',
      'sent',
      current_draw.couple_email_sent_at,
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
       and channel = 'couple';

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at,
      'channel', 'couple',
      'recipient', allowed_recipient,
      'email_test_fixture_id', current_fixture.id
    );
  end if;

  insert into public.qr_bingo_draw_email_deliveries (draw_id, channel)
  values (current_draw.id, 'couple')
  on conflict (draw_id, channel) do nothing;

  select *
    into delivery
    from public.qr_bingo_draw_email_deliveries
   where draw_id = current_draw.id
     and channel = 'couple'
   for update;

  if delivery.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at,
      'channel', 'couple',
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
      'channel', 'couple',
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
        'channel', 'couple',
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
      'channel', 'couple',
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
    'channel', 'couple',
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

CREATE OR REPLACE FUNCTION public.compare_and_update_qr_bingo_vendor_settings(p_event_key text, p_vendor_bingo_id text, p_expected_updated_at timestamp with time zone, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  allowed_keys constant text[] := array[
    'vendor_name',
    'enabled',
    'prize_title',
    'prize_description',
    'claim_instructions',
    'legal_terms_accepted',
    'legal_terms_version',
    'legal_terms_accepted_at',
    'draw_opens_at',
    'official_rules_url',
    'rules_viewed_at',
    'administrator_name',
    'co_sponsor_name',
    'prize_provider_name',
    'apple_non_sponsor_acknowledged',
    'prize_approx_value_cad',
    'eligibility_region',
    'entry_closes_at',
    'draw_at',
    'odds_basis',
    'no_purchase_required',
    'skill_testing_question_required',
    'alternate_free_entry_url',
    'vendor_responsibility_acknowledged',
    'vendor_responsibility_disclosure_text',
    'vendor_responsibility_acknowledged_at',
    'vendor_responsibility_version',
    'max_winners',
    'exclude_previous_winners'
  ];
  supplied_key text;
  current_settings public.qr_bingo_raffle_settings%rowtype;
  candidate_settings public.qr_bingo_raffle_settings%rowtype;
  saved_settings public.qr_bingo_raffle_settings%rowtype;
  saved_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if nullif(btrim(p_event_key), '') is null
    or nullif(btrim(p_vendor_bingo_id), '') is null
    or p_expected_updated_at is null
    or p_patch is null
    or jsonb_typeof(p_patch) <> 'object'
    or p_patch = '{}'::jsonb
  then
    raise exception using errcode = '22023', message = 'A vendor setting identity, expected timestamp, and non-empty patch are required.';
  end if;

  for supplied_key in select jsonb_object_keys(p_patch)
  loop
    if not supplied_key = any(allowed_keys) then
      raise exception using
        errcode = '22023',
        message = format('Unsupported QR Bingo vendor setting field: %s.', supplied_key);
    end if;
  end loop;

  -- Match the publication lock order, then serialize saves with selection/email claims.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr_bingo_event_config_publish', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(btrim(p_event_key) || ':' || btrim(p_vendor_bingo_id), 0));
  select * into current_settings
    from public.qr_bingo_raffle_settings
   where event_key = btrim(p_event_key)
     and vendor_bingo_id = btrim(p_vendor_bingo_id)
   for update;
  if current_settings.id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo vendor settings were not found.';
  end if;
  if current_settings.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'QR Bingo vendor settings changed; reload before saving.';
  end if;

  candidate_settings := jsonb_populate_record(current_settings, p_patch);
  candidate_settings.max_winners := 1;
  candidate_settings.exclude_previous_winners := true;
  saved_at := greatest(
    clock_timestamp(),
    current_settings.updated_at + interval '1 microsecond'
  );

  update public.qr_bingo_raffle_settings
     set vendor_name = candidate_settings.vendor_name,
         enabled = candidate_settings.enabled,
         prize_title = candidate_settings.prize_title,
         prize_description = candidate_settings.prize_description,
         claim_instructions = candidate_settings.claim_instructions,
         legal_terms_accepted = candidate_settings.legal_terms_accepted,
         legal_terms_version = candidate_settings.legal_terms_version,
         legal_terms_accepted_at = candidate_settings.legal_terms_accepted_at,
         draw_opens_at = candidate_settings.draw_opens_at,
         official_rules_url = candidate_settings.official_rules_url,
         rules_viewed_at = candidate_settings.rules_viewed_at,
         administrator_name = candidate_settings.administrator_name,
         co_sponsor_name = candidate_settings.co_sponsor_name,
         prize_provider_name = candidate_settings.prize_provider_name,
         apple_non_sponsor_acknowledged = candidate_settings.apple_non_sponsor_acknowledged,
         prize_approx_value_cad = candidate_settings.prize_approx_value_cad,
         eligibility_region = candidate_settings.eligibility_region,
         entry_closes_at = candidate_settings.entry_closes_at,
         draw_at = candidate_settings.draw_at,
         odds_basis = candidate_settings.odds_basis,
         no_purchase_required = candidate_settings.no_purchase_required,
         skill_testing_question_required = candidate_settings.skill_testing_question_required,
         alternate_free_entry_url = candidate_settings.alternate_free_entry_url,
         vendor_responsibility_acknowledged = candidate_settings.vendor_responsibility_acknowledged,
         vendor_responsibility_disclosure_text = candidate_settings.vendor_responsibility_disclosure_text,
         vendor_responsibility_acknowledged_at = candidate_settings.vendor_responsibility_acknowledged_at,
         vendor_responsibility_version = candidate_settings.vendor_responsibility_version,
         max_winners = candidate_settings.max_winners,
         exclude_previous_winners = candidate_settings.exclude_previous_winners,
         updated_at = saved_at
   where id = current_settings.id
  returning * into saved_settings;

  return jsonb_build_object('ok', true, 'settings', to_jsonb(saved_settings));
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
