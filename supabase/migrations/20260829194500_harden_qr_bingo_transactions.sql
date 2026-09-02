-- Transactional hardening for QR Bingo administration and verified-winner
-- email delivery. This is forward-only and preserves every existing event,
-- vendor setting, entry, draw, and acceptance record.

-- A material legal change must use a rules version that has never represented
-- an earlier event revision. Operational enable/disable and email-delivery
-- changes may publish under the existing rules version.
create or replace function public.require_qr_bingo_rules_version_bump()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_config public.qr_bingo_event_configs%rowtype;
  material_change boolean;
begin
  if not new.published then
    return new;
  end if;

  select config.*
    into previous_config
    from public.qr_bingo_event_configs config
    join public.qr_bingo_event_config_audit audit
      on audit.event_config_id = config.id
   where config.revision < new.revision
   order by config.revision desc
   limit 1;

  if previous_config.id is null then
    if exists (
      select 1
        from public.qr_bingo_event_configs config
       where config.revision < new.revision
    ) then
      raise exception using
        errcode = '55000',
        message = 'QR Bingo event configuration audit history is unavailable; publication is blocked.';
    end if;
    return new;
  end if;

  material_change := row(
    new.event_key,
    new.event_name,
    new.vendor_tag_id,
    new.history_starts_at,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.eligibility_region,
    new.draw_opens_at,
    new.entry_closes_at,
    new.draw_at
  ) is distinct from row(
    previous_config.event_key,
    previous_config.event_name,
    previous_config.vendor_tag_id,
    previous_config.history_starts_at,
    previous_config.official_rules_url,
    previous_config.alternate_free_entry_url,
    previous_config.eligibility_region,
    previous_config.draw_opens_at,
    previous_config.entry_closes_at,
    previous_config.draw_at
  );

  if material_change and exists (
    select 1
      from public.qr_bingo_event_configs prior
     where prior.rules_version = new.rules_version
  ) then
    raise exception using
      errcode = '22023',
      message = 'Material QR Bingo terms changed; publish a new, previously unused rules_version.';
  end if;

  return new;
end;
$$;

revoke all on function public.require_qr_bingo_rules_version_bump()
  from public, anon, authenticated;

drop trigger if exists require_qr_bingo_rules_version_bump
  on public.qr_bingo_event_configs;
create trigger require_qr_bingo_rules_version_bump
before insert on public.qr_bingo_event_configs
for each row execute function public.require_qr_bingo_rules_version_bump();

-- Compare-and-update a pre-existing vendor setting under one row lock. The
-- caller cannot modify stable identities or timestamps, and database triggers
-- continue to enforce current acceptance and entered-promotion term locks.
create or replace function public.compare_and_update_qr_bingo_vendor_settings(
  p_event_key text,
  p_vendor_bingo_id text,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    'alternate_free_entry_url'
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

  select *
    into current_settings
    from public.qr_bingo_raffle_settings
   where event_key = btrim(p_event_key)
     and vendor_bingo_id = btrim(p_vendor_bingo_id)
   for update;

  if current_settings.id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo vendor settings were not found.';
  end if;

  if current_settings.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'QR Bingo vendor settings changed; reload before saving.',
      detail = format(
        'Expected updated_at %s but current updated_at is %s.',
        p_expected_updated_at,
        current_settings.updated_at
      );
  end if;

  candidate_settings := jsonb_populate_record(current_settings, p_patch);
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
         updated_at = saved_at
   where id = current_settings.id
  returning * into saved_settings;

  return jsonb_build_object(
    'ok', true,
    'settings', to_jsonb(saved_settings)
  );
end;
$$;

revoke all on function public.compare_and_update_qr_bingo_vendor_settings(text, text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.compare_and_update_qr_bingo_vendor_settings(text, text, timestamptz, jsonb)
  to service_role;

-- One deterministic delivery record exists for each draw and recipient
-- channel. Ambiguous external outcomes never return to the automatic retry
-- pool; an operator must reconcile them explicitly.
create table if not exists public.qr_bingo_draw_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null
    references public.qr_bingo_raffle_draws(id) on delete restrict,
  channel text not null check (channel in ('vendor', 'couple')),
  delivery_key text generated always as (draw_id::text || ':' || channel) stored,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'sent', 'retryable_failed', 'ambiguous')),
  claim_token uuid,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text not null default ''
    check (length(provider_message_id) <= 500),
  last_error text not null default ''
    check (length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_bingo_draw_email_deliveries_draw_channel_unique
    unique (draw_id, channel),
  constraint qr_bingo_draw_email_deliveries_key_unique
    unique (delivery_key),
  constraint qr_bingo_draw_email_deliveries_state_valid check (
    (
      status = 'pending'
      and claim_token is null
      and claim_expires_at is null
      and sent_at is null
    ) or (
      status = 'claimed'
      and claim_token is not null
      and claim_expires_at is not null
      and sent_at is null
    ) or (
      status = 'sent'
      and claim_token is null
      and claim_expires_at is null
      and sent_at is not null
    ) or (
      status = 'retryable_failed'
      and claim_token is null
      and claim_expires_at is null
      and sent_at is null
    ) or (
      status = 'ambiguous'
      and claim_token is not null
      and claim_expires_at is null
      and sent_at is null
    )
  )
);

create index if not exists qr_bingo_draw_email_deliveries_claim_idx
  on public.qr_bingo_draw_email_deliveries (status, claim_expires_at, updated_at);

alter table public.qr_bingo_draw_email_deliveries enable row level security;
revoke all on table public.qr_bingo_draw_email_deliveries
  from public, anon, authenticated, service_role;
grant select on table public.qr_bingo_draw_email_deliveries to service_role;

create or replace function public.claim_qr_bingo_draw_email_delivery(
  p_draw_id uuid,
  p_channel text,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    or current_draw.skill_question_verified_at is null
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
         last_error = '',
         updated_at = v_now
   where id = delivery.id
  returning * into delivery;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'delivery_key', delivery.delivery_key,
    'claim_token', delivery.claim_token,
    'claim_expires_at', delivery.claim_expires_at,
    'attempt_count', delivery.attempt_count,
    'channel', delivery.channel,
    'draw_id', delivery.draw_id
  );
end;
$$;

revoke all on function public.claim_qr_bingo_draw_email_delivery(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_qr_bingo_draw_email_delivery(uuid, text, integer)
  to service_role;

create or replace function public.finalize_qr_bingo_draw_email_delivery(
  p_delivery_key text,
  p_claim_token uuid,
  p_outcome text,
  p_provider_message_id text default '',
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      or current_draw.skill_question_verified_at is null
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
$$;

revoke all on function public.finalize_qr_bingo_draw_email_delivery(text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_qr_bingo_draw_email_delivery(text, uuid, text, text, text)
  to service_role;

create or replace function public.reconcile_qr_bingo_draw_email_delivery(
  p_delivery_key text,
  p_outcome text,
  p_provider_message_id text default '',
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      or current_draw.skill_question_verified_at is null
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
$$;

revoke all on function public.reconcile_qr_bingo_draw_email_delivery(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_qr_bingo_draw_email_delivery(text, text, text, text)
  to service_role;

comment on table public.qr_bingo_draw_email_deliveries is
  'Service-only, token-fenced email ledger with deterministic per-draw/channel idempotency keys. Ambiguous outcomes require explicit reconciliation.';
