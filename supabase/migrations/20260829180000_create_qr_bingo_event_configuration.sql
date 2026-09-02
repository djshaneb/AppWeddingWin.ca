-- Canonical, immutable QR Bingo event configuration. Operational clients read
-- only the single published revision through service-role code; vendor-specific
-- prize details and legal acceptance remain in qr_bingo_raffle_settings.

create table if not exists public.qr_bingo_event_configs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  revision bigint not null,
  published boolean not null default false,
  event_name text not null,
  vendor_tag_id integer not null,
  history_starts_at timestamptz not null,
  scan_enabled boolean not null,
  vendor_draws_enabled boolean not null,
  email_delivery_mode text not null,
  send_vendor_email boolean not null,
  send_couple_email boolean not null,
  vendor_email_subject text not null,
  couple_email_subject text not null,
  rules_version text not null,
  official_rules_url text not null,
  alternate_free_entry_url text not null,
  eligibility_region text not null,
  draw_opens_at timestamptz not null,
  entry_closes_at timestamptz not null,
  draw_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  constraint qr_bingo_event_configs_event_revision_unique
    unique (event_key, revision),
  constraint qr_bingo_event_configs_revision_positive
    check (revision > 0),
  constraint qr_bingo_event_configs_event_key_valid
    check (
      event_key = btrim(event_key)
      and event_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(event_key) <= 100
    ),
  constraint qr_bingo_event_configs_event_name_present
    check (
      btrim(event_name) <> ''
      and length(event_name) <= 120
      and event_name !~ '[<>]'
      and event_name !~ '[[:cntrl:]]'
    ),
  constraint qr_bingo_event_configs_vendor_tag_positive
    check (vendor_tag_id > 0),
  constraint qr_bingo_event_configs_email_mode_valid
    check (email_delivery_mode in ('disabled', 'production_verified_fulfillment')),
  constraint qr_bingo_event_configs_email_channels_valid
    check (
      email_delivery_mode = 'disabled'
      or send_vendor_email
      or send_couple_email
    ),
  constraint qr_bingo_event_configs_vendor_subject_present
    check (
      btrim(vendor_email_subject) <> ''
      and length(vendor_email_subject) <= 180
      and vendor_email_subject !~ '[<>]'
      and vendor_email_subject !~ '[[:cntrl:]]'
    ),
  constraint qr_bingo_event_configs_couple_subject_present
    check (
      btrim(couple_email_subject) <> ''
      and length(couple_email_subject) <= 180
      and couple_email_subject !~ '[<>]'
      and couple_email_subject !~ '[[:cntrl:]]'
    ),
  constraint qr_bingo_event_configs_rules_version_present
    check (rules_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  constraint qr_bingo_event_configs_official_rules_https
    check (
      official_rules_url ~* '^https://(www[.])?weddingwin[.]ca(:443)?([/?][^[:space:]#]*)?$'
      and length(official_rules_url) <= 500
      and official_rules_url !~ '[[:cntrl:]]'
    ),
  constraint qr_bingo_event_configs_alternate_entry_https
    check (
      alternate_free_entry_url ~* '^https://(www[.])?weddingwin[.]ca(:443)?([/?][^[:space:]#]*)?$'
      and length(alternate_free_entry_url) <= 500
      and alternate_free_entry_url !~ '[[:cntrl:]]'
      and alternate_free_entry_url <> official_rules_url
    ),
  constraint qr_bingo_event_configs_eligibility_present
    check (
      btrim(eligibility_region) <> ''
      and length(eligibility_region) <= 300
      and eligibility_region !~ '[<>]'
      and eligibility_region !~ '[[:cntrl:]]'
    ),
  constraint qr_bingo_event_configs_schedule_valid
    check (
      isfinite(history_starts_at)
      and isfinite(draw_opens_at)
      and isfinite(entry_closes_at)
      and isfinite(draw_at)
      and history_starts_at <= entry_closes_at
      and draw_opens_at >= entry_closes_at
      and draw_at >= draw_opens_at
    ),
  constraint qr_bingo_event_configs_created_by_present
    check (btrim(created_by) <> '' and length(created_by) <= 200)
);

-- Exactly one event revision can be published. A deferred assertion below
-- also prevents the system from committing with zero published revisions.
create unique index if not exists qr_bingo_event_configs_one_published_idx
  on public.qr_bingo_event_configs (published)
  where published;

create table if not exists public.qr_bingo_event_config_audit (
  id uuid primary key default gen_random_uuid(),
  event_config_id uuid not null
    references public.qr_bingo_event_configs(id) on delete restrict,
  previous_event_config_id uuid
    references public.qr_bingo_event_configs(id) on delete restrict,
  event_key text not null,
  revision bigint not null,
  expected_revision bigint not null,
  action text not null check (action in ('seed', 'publish')),
  actor text not null check (btrim(actor) <> '' and length(actor) <= 200),
  config_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint qr_bingo_event_config_audit_revision_positive
    check (revision > 0 and expected_revision >= 0),
  constraint qr_bingo_event_config_audit_snapshot_object
    check (jsonb_typeof(config_snapshot) = 'object'),
  constraint qr_bingo_event_config_audit_action_unique
    unique (event_config_id, action)
);

create index if not exists qr_bingo_event_config_audit_event_revision_idx
  on public.qr_bingo_event_config_audit (event_key, revision desc);

-- Store only a digest of each consumed nonce. Rows remain long enough to
-- reject delayed replays, then are pruned opportunistically by the consume RPC.
create table if not exists public.qr_bingo_admin_nonces (
  nonce_hash text primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now(),
  constraint qr_bingo_admin_nonces_hash_valid
    check (nonce_hash ~ '^[0-9a-f]{64}$'),
  constraint qr_bingo_admin_nonces_expiry_valid
    check (expires_at > consumed_at)
);

create index if not exists qr_bingo_admin_nonces_expiry_idx
  on public.qr_bingo_admin_nonces (expires_at);

alter table public.qr_bingo_event_configs enable row level security;
alter table public.qr_bingo_event_config_audit enable row level security;
alter table public.qr_bingo_admin_nonces enable row level security;

revoke all on table public.qr_bingo_event_configs
  from public, anon, authenticated, service_role;
revoke all on table public.qr_bingo_event_config_audit
  from public, anon, authenticated, service_role;
revoke all on table public.qr_bingo_admin_nonces
  from public, anon, authenticated, service_role;

-- Edge Functions may load the published configuration and its audit trail.
-- All writes go through the security-definer RPCs below.
grant select on table public.qr_bingo_event_configs to service_role;
grant select on table public.qr_bingo_event_config_audit to service_role;

create or replace function public.protect_qr_bingo_event_config_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo event configuration revisions are immutable.';
  end if;

  -- Publishing creates a new immutable row. The only permitted change to an
  -- old row is the one-way demotion of the previously published revision.
  if not old.published
    or new.published
    or (to_jsonb(new) - 'published') is distinct from
       (to_jsonb(old) - 'published')
  then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo event configuration revisions are immutable.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_qr_bingo_event_config_revision()
  from public, anon, authenticated;

drop trigger if exists protect_qr_bingo_event_config_revision
  on public.qr_bingo_event_configs;
create trigger protect_qr_bingo_event_config_revision
before update or delete on public.qr_bingo_event_configs
for each row execute function public.protect_qr_bingo_event_config_revision();

create or replace function public.assert_one_published_qr_bingo_event_config()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  published_count integer;
begin
  select count(*)
    into published_count
    from public.qr_bingo_event_configs
   where published;

  if published_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'Exactly one QR Bingo event configuration revision must be published.';
  end if;

  return null;
end;
$$;

revoke all on function public.assert_one_published_qr_bingo_event_config()
  from public, anon, authenticated;

drop trigger if exists assert_one_published_qr_bingo_event_config
  on public.qr_bingo_event_configs;
create constraint trigger assert_one_published_qr_bingo_event_config
after insert or update or delete on public.qr_bingo_event_configs
deferrable initially deferred
for each row execute function public.assert_one_published_qr_bingo_event_config();

create or replace function public.protect_qr_bingo_event_config_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'QR Bingo event configuration audit records are immutable.';
end;
$$;

revoke all on function public.protect_qr_bingo_event_config_audit()
  from public, anon, authenticated;

drop trigger if exists protect_qr_bingo_event_config_audit
  on public.qr_bingo_event_config_audit;
create trigger protect_qr_bingo_event_config_audit
before update or delete on public.qr_bingo_event_config_audit
for each row execute function public.protect_qr_bingo_event_config_audit();

-- Seed the current production event without touching vendor-specific settings,
-- entries, draws, or their existing legal-acceptance history.
insert into public.qr_bingo_event_configs (
  event_key,
  revision,
  published,
  event_name,
  vendor_tag_id,
  history_starts_at,
  scan_enabled,
  vendor_draws_enabled,
  email_delivery_mode,
  send_vendor_email,
  send_couple_email,
  vendor_email_subject,
  couple_email_subject,
  rules_version,
  official_rules_url,
  alternate_free_entry_url,
  eligibility_region,
  draw_opens_at,
  entry_closes_at,
  draw_at,
  created_by
)
select
  'niagara-wedding-show-2026',
  1,
  true,
  'Niagara Wedding Show',
  30,
  '2026-08-01 00:00:00-04'::timestamptz,
  true,
  true,
  'disabled',
  true,
  true,
  'WeddingWin QR Bingo: Verified Potential Winner Contact',
  'QR Bingo potential-winner verification complete',
  '2026-08-28',
  'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
  'https://www.weddingwin.ca/qr-bingo-free-entry',
  'Ontario, Canada residents who have reached the age of majority',
  '2026-10-18 19:00:00+00'::timestamptz,
  '2026-10-18 19:00:00+00'::timestamptz,
  '2026-10-18 19:00:00+00'::timestamptz,
  'migration:20260829180000'
where not exists (
  select 1 from public.qr_bingo_event_configs
);

insert into public.qr_bingo_event_config_audit (
  event_config_id,
  previous_event_config_id,
  event_key,
  revision,
  expected_revision,
  action,
  actor,
  config_snapshot
)
select
  config.id,
  null,
  config.event_key,
  config.revision,
  0,
  'seed',
  config.created_by,
  to_jsonb(config)
from public.qr_bingo_event_configs config
where config.published
  and config.revision = 1
  and config.created_by = 'migration:20260829180000'
on conflict (event_config_id, action) do nothing;

-- Create a strong random HMAC secret in Vault only when operations has not
-- already provisioned one. No secret value is stored in this migration.
do $$
begin
  if not exists (
    select 1
      from vault.decrypted_secrets
     where name = 'qr_bingo_admin_hmac_secret'
  ) then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'qr_bingo_admin_hmac_secret',
      'Authenticates signed QR Bingo administration requests from Brilliant Directories.'
    );
  end if;
end;
$$;

create or replace function public.get_qr_bingo_admin_hmac_secret()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  select decrypted_secret
    into secret_value
    from vault.decrypted_secrets
   where name = 'qr_bingo_admin_hmac_secret'
   order by created_at desc
   limit 1;

  if length(coalesce(secret_value, '')) < 32 then
    raise exception using errcode = '55000', message = 'QR Bingo admin HMAC secret is unavailable.';
  end if;

  return secret_value;
end;
$$;

revoke all on function public.get_qr_bingo_admin_hmac_secret()
  from public, anon, authenticated;
grant execute on function public.get_qr_bingo_admin_hmac_secret()
  to service_role;

create or replace function public.consume_qr_bingo_admin_nonce(
  p_nonce text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  inserted_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if length(coalesce(btrim(p_nonce), '')) < 16
    or length(p_nonce) > 512
    or p_expires_at is null
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '10 minutes'
  then
    return false;
  end if;

  delete from public.qr_bingo_admin_nonces
   where expires_at < v_now - interval '1 day';

  insert into public.qr_bingo_admin_nonces (nonce_hash, expires_at, consumed_at)
  values (
    encode(extensions.digest(p_nonce, 'sha256'), 'hex'),
    p_expires_at,
    v_now
  )
  on conflict (nonce_hash) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

revoke all on function public.consume_qr_bingo_admin_nonce(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_qr_bingo_admin_nonce(text, timestamptz)
  to service_role;

create or replace function public.publish_qr_bingo_event_config(
  p_expected_revision bigint,
  p_config jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  required_keys constant text[] := array[
    'event_key',
    'event_name',
    'vendor_tag_id',
    'history_starts_at',
    'scan_enabled',
    'vendor_draws_enabled',
    'email_delivery_mode',
    'send_vendor_email',
    'send_couple_email',
    'vendor_email_subject',
    'couple_email_subject',
    'rules_version',
    'official_rules_url',
    'alternate_free_entry_url',
    'eligibility_region',
    'draw_opens_at',
    'entry_closes_at',
    'draw_at'
  ];
  supplied_key text;
  current_config public.qr_bingo_event_configs%rowtype;
  next_config public.qr_bingo_event_configs%rowtype;
  current_revision bigint := 0;
  next_revision bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'Expected revision must be zero or greater.';
  end if;

  if length(coalesce(btrim(p_actor), '')) = 0 or length(btrim(p_actor)) > 200 then
    raise exception using errcode = '22023', message = 'A valid configuration actor is required.';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception using errcode = '22023', message = 'QR Bingo configuration must be a JSON object.';
  end if;

  if not p_config ?& required_keys then
    raise exception using errcode = '22023', message = 'QR Bingo configuration is missing required fields.';
  end if;

  for supplied_key in select jsonb_object_keys(p_config)
  loop
    if not supplied_key = any(required_keys) then
      raise exception using
        errcode = '22023',
        message = format('Unknown QR Bingo configuration field: %s.', supplied_key);
    end if;
  end loop;

  if jsonb_typeof(p_config -> 'vendor_tag_id') <> 'number'
    or (p_config ->> 'vendor_tag_id')::numeric <> trunc((p_config ->> 'vendor_tag_id')::numeric)
  then
    raise exception using errcode = '22023', message = 'vendor_tag_id must be an integer.';
  end if;

  foreach supplied_key in array array[
    'scan_enabled',
    'vendor_draws_enabled',
    'send_vendor_email',
    'send_couple_email'
  ]
  loop
    if jsonb_typeof(p_config -> supplied_key) <> 'boolean' then
      raise exception using
        errcode = '22023',
        message = format('%s must be a boolean.', supplied_key);
    end if;
  end loop;

  foreach supplied_key in array array[
    'event_key',
    'event_name',
    'history_starts_at',
    'email_delivery_mode',
    'vendor_email_subject',
    'couple_email_subject',
    'rules_version',
    'official_rules_url',
    'alternate_free_entry_url',
    'eligibility_region',
    'draw_opens_at',
    'entry_closes_at',
    'draw_at'
  ]
  loop
    if jsonb_typeof(p_config -> supplied_key) <> 'string' then
      raise exception using
        errcode = '22023',
        message = format('%s must be a string.', supplied_key);
    end if;
  end loop;

  -- Serialize all publishers before checking the optimistic revision.
  perform pg_advisory_xact_lock(
    hashtextextended('qr_bingo_event_config_publish', 0)
  );

  select *
    into current_config
    from public.qr_bingo_event_configs
   where published
   order by revision desc
   limit 1
   for update;

  if current_config.id is not null then
    current_revision := current_config.revision;
  end if;

  if current_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'QR Bingo event configuration changed; reload before publishing.',
      detail = format(
        'Expected revision %s but current revision is %s.',
        p_expected_revision,
        current_revision
      );
  end if;

  select coalesce(max(revision), 0) + 1
    into next_revision
    from public.qr_bingo_event_configs;

  if current_config.id is not null then
    update public.qr_bingo_event_configs
       set published = false
     where id = current_config.id;
  end if;

  insert into public.qr_bingo_event_configs (
    event_key,
    revision,
    published,
    event_name,
    vendor_tag_id,
    history_starts_at,
    scan_enabled,
    vendor_draws_enabled,
    email_delivery_mode,
    send_vendor_email,
    send_couple_email,
    vendor_email_subject,
    couple_email_subject,
    rules_version,
    official_rules_url,
    alternate_free_entry_url,
    eligibility_region,
    draw_opens_at,
    entry_closes_at,
    draw_at,
    created_by
  ) values (
    btrim(p_config ->> 'event_key'),
    next_revision,
    true,
    btrim(p_config ->> 'event_name'),
    (p_config ->> 'vendor_tag_id')::integer,
    (p_config ->> 'history_starts_at')::timestamptz,
    (p_config ->> 'scan_enabled')::boolean,
    (p_config ->> 'vendor_draws_enabled')::boolean,
    btrim(p_config ->> 'email_delivery_mode'),
    (p_config ->> 'send_vendor_email')::boolean,
    (p_config ->> 'send_couple_email')::boolean,
    btrim(p_config ->> 'vendor_email_subject'),
    btrim(p_config ->> 'couple_email_subject'),
    btrim(p_config ->> 'rules_version'),
    btrim(p_config ->> 'official_rules_url'),
    btrim(p_config ->> 'alternate_free_entry_url'),
    btrim(p_config ->> 'eligibility_region'),
    (p_config ->> 'draw_opens_at')::timestamptz,
    (p_config ->> 'entry_closes_at')::timestamptz,
    (p_config ->> 'draw_at')::timestamptz,
    btrim(p_actor)
  )
  returning * into next_config;

  insert into public.qr_bingo_event_config_audit (
    event_config_id,
    previous_event_config_id,
    event_key,
    revision,
    expected_revision,
    action,
    actor,
    config_snapshot
  ) values (
    next_config.id,
    current_config.id,
    next_config.event_key,
    next_config.revision,
    p_expected_revision,
    'publish',
    btrim(p_actor),
    to_jsonb(next_config)
  );

  return jsonb_build_object(
    'ok', true,
    'previous_revision', current_revision,
    'config', to_jsonb(next_config)
  );
end;
$$;

revoke all on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  to service_role;

-- Replace the prior literal rules-version checks. Every new vendor setting or
-- entry must match the rules version of the published configuration for its
-- event. Publishing never rewrites vendor acceptance or historical evidence.
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

comment on table public.qr_bingo_event_configs is
  'Immutable QR Bingo event revisions. Exactly one service-only row is published at a time.';
comment on table public.qr_bingo_event_config_audit is
  'Immutable audit trail for seeded and published QR Bingo event revisions.';
comment on table public.qr_bingo_admin_nonces is
  'Hashed, single-use nonces for signed QR Bingo admin requests.';
