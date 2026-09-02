-- A verified-winner email test is intentionally separate from both production
-- and the App Review fixture. App Review remains unconditionally outbound-
-- suppressed; no row or constraint in app_review_raffle_fixtures is changed.

create table if not exists public.qr_bingo_email_test_fixtures (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  couple_bd_user_id text not null,
  vendor_bd_user_id text not null,
  vendor_bingo_id text not null,
  vendor_name text not null,
  vendor_qr_payload text not null,
  outbound_recipient_email text not null,
  enabled boolean not null default false,
  allow_early_draw boolean not null default true,
  send_vendor_email boolean not null default false,
  send_couple_email boolean not null default true,
  expires_at timestamptz not null,
  authorized_by text not null,
  authorized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_bingo_email_test_fixture_event_key check (
    event_key ~ '^email-test-[a-z0-9]+(-[a-z0-9]+)*$'
    and length(event_key) <= 100
    and event_key <> 'niagara-wedding-show-2026'
    and event_key not like 'app-review-%'
  ),
  constraint qr_bingo_email_test_fixture_numeric_users check (
    couple_bd_user_id ~ '^[1-9][0-9]*$'
    and vendor_bd_user_id ~ '^[1-9][0-9]*$'
    and vendor_bingo_id ~ '^[1-9][0-9]*$'
  ),
  constraint qr_bingo_email_test_fixture_stable_vendor check (
    vendor_bingo_id = vendor_bd_user_id
  ),
  constraint qr_bingo_email_test_fixture_distinct_users check (
    couple_bd_user_id <> vendor_bd_user_id
  ),
  constraint qr_bingo_email_test_fixture_vendor_name check (
    btrim(vendor_name) <> ''
    and length(vendor_name) <= 180
    and vendor_name !~ '[<>]'
    and vendor_name !~ '[[:cntrl:]]'
  ),
  constraint qr_bingo_email_test_fixture_qr_payload check (
    vendor_qr_payload ~* '^https://(www[.])?weddingwin[.]ca/qr([/?][^[:space:]#]*)?$'
    and length(vendor_qr_payload) <= 500
    and vendor_qr_payload !~ '[[:cntrl:]]'
  ),
  constraint qr_bingo_email_test_fixture_exact_recipient check (
    outbound_recipient_email = lower(btrim(outbound_recipient_email))
    and length(outbound_recipient_email) between 3 and 254
    and outbound_recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and outbound_recipient_email !~ '[[:cntrl:]]'
  ),
  constraint qr_bingo_email_test_fixture_couple_only check (
    not send_vendor_email and send_couple_email
  ),
  constraint qr_bingo_email_test_fixture_authorization check (
    btrim(authorized_by) <> ''
    and length(authorized_by) <= 200
    and authorized_by !~ '[[:cntrl:]]'
    and expires_at > authorized_at
  ),
  constraint qr_bingo_email_test_fixture_scan_identity_unique
    unique (id, couple_bd_user_id, vendor_bingo_id)
);

create unique index if not exists qr_bingo_email_test_fixture_active_couple_idx
  on public.qr_bingo_email_test_fixtures (couple_bd_user_id)
  where enabled;
create unique index if not exists qr_bingo_email_test_fixture_active_vendor_idx
  on public.qr_bingo_email_test_fixtures (vendor_bd_user_id)
  where enabled;
create unique index if not exists qr_bingo_email_test_fixture_active_recipient_idx
  on public.qr_bingo_email_test_fixtures (outbound_recipient_email)
  where enabled;

alter table public.qr_bingo_email_test_fixtures enable row level security;
revoke all on table public.qr_bingo_email_test_fixtures
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.qr_bingo_email_test_fixtures
  to service_role;

create table if not exists public.qr_bingo_email_test_fixture_scans (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null,
  couple_bd_user_id text not null,
  vendor_bingo_id text not null,
  scanned_at timestamptz not null default now(),
  constraint qr_bingo_email_test_fixture_scans_fixture_fk
    foreign key (fixture_id, couple_bd_user_id, vendor_bingo_id)
    references public.qr_bingo_email_test_fixtures
      (id, couple_bd_user_id, vendor_bingo_id)
    on delete cascade,
  constraint qr_bingo_email_test_fixture_scans_unique
    unique (fixture_id, couple_bd_user_id, vendor_bingo_id)
);

alter table public.qr_bingo_email_test_fixture_scans enable row level security;
revoke all on table public.qr_bingo_email_test_fixture_scans
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.qr_bingo_email_test_fixture_scans
  to service_role;

-- Email-test events borrow only the currently published rules version. Their
-- event, accounts, scans, settings, entries and draws remain isolated by their
-- email-test-* event key. The existing App Review allowance is preserved
-- verbatim and its unconditional outbound suppression is not relaxed here.
create or replace function public.enforce_qr_bingo_current_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_rules_version text;
begin
  select config.rules_version
    into current_rules_version
    from public.qr_bingo_event_configs config
   where config.published
     and (
       config.event_key = new.event_key
       or exists (
         select 1
           from public.app_review_raffle_fixtures fixture
          where fixture.event_key = new.event_key
            and fixture.enabled
            and fixture.expires_at > now()
       )
       or exists (
         select 1
           from public.qr_bingo_email_test_fixtures fixture
          where fixture.event_key = new.event_key
            and fixture.enabled
            and fixture.expires_at > now()
       )
     )
   limit 1;

  if nullif(btrim(current_rules_version), '') is null then
    raise exception using
      errcode = '55000',
      message = 'No published QR Bingo event configuration is available.';
  end if;

  if tg_table_name = 'qr_bingo_raffle_settings' then
    if new.enabled and (
      not new.legal_terms_accepted
      or new.legal_terms_version is distinct from current_rules_version
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
    if new.consent_version is distinct from current_rules_version
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
      raise exception 'Review and accept the current official rules before entering this vendor draw.';
    end if;
  elsif tg_table_name = 'qr_bingo_grand_prize_entries' then
    if new.rules_version is distinct from current_rules_version
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
  from public, anon, authenticated;

-- Claim exactly one allowlisted couple notice. This does not alter the
-- production claim RPC and cannot claim a vendor channel. Existing token-
-- fenced finalization and reconciliation remain the sole completion paths.
create or replace function public.claim_qr_bingo_test_draw_email_delivery(
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
    or current_draw.skill_question_verified_at is null
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
   limit 1
   for share;

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
    or current_entry.contact_share_scope <> 'selected_potential_winner_only'
    or current_entry.prize_provider_name is distinct from current_fixture.vendor_name
    or current_entry.prize_title is distinct from current_settings.prize_title
    or current_entry.prize_description is distinct from current_settings.prize_description
    or current_entry.prize_approx_value_cad is distinct from current_settings.prize_approx_value_cad
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
    'channel', 'couple',
    'draw_id', delivery.draw_id,
    'recipient', allowed_recipient,
    'email_test_fixture_id', current_fixture.id
  );
end;
$$;

revoke all on function public.claim_qr_bingo_test_draw_email_delivery(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_qr_bingo_test_draw_email_delivery(uuid, text, integer)
  to service_role;

comment on table public.qr_bingo_email_test_fixtures is
  'Disabled-by-default, expiring, service-only fixtures for one allowlisted couple verified-winner email test. Never used for App Review.';
comment on table public.qr_bingo_email_test_fixture_scans is
  'Service-only proof that the exact email-test couple scanned the exact fixture vendor.';
comment on function public.claim_qr_bingo_test_draw_email_delivery(uuid, text, integer) is
  'Claims only the exact allowlisted couple notice for a current, verified, scanned, isolated email-test draw.';
