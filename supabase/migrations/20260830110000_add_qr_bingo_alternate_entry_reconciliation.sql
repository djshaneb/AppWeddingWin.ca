-- Reconcile validated Brilliant Directories Form 354 submissions into the
-- exact vendor promotion they name. This is intentionally service-role only:
-- public form submission remains an operations inbox item until an identified
-- BD administrator verifies it against the current event and vendor settings.

create extension if not exists pgcrypto with schema extensions;

alter table public.qr_bingo_raffle_entries
  add column if not exists entry_method text not null default 'qr_scan_opt_in',
  add column if not exists entrant_identity_hash text,
  add column if not exists source_reference text,
  add column if not exists source_form_id integer,
  add column if not exists source_submitted_at timestamptz,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by text not null default '',
  add column if not exists promotion_responsibility_acknowledged boolean not null default false,
  add column if not exists promotion_disclosure_text text not null default '',
  add column if not exists promotion_responsibility_acknowledged_at timestamptz,
  add column if not exists promotion_responsibility_version text not null default '';

alter table public.qr_bingo_raffle_settings
  add column if not exists vendor_responsibility_acknowledged boolean not null default false,
  add column if not exists vendor_responsibility_disclosure_text text not null default '',
  add column if not exists vendor_responsibility_acknowledged_at timestamptz,
  add column if not exists vendor_responsibility_version text not null default '';

alter table public.qr_bingo_raffle_entries
  add constraint qr_bingo_raffle_entries_entry_method_valid
    check (entry_method in ('qr_scan_opt_in', 'alternate_free_entry')),
  add constraint qr_bingo_raffle_entries_identity_hash_valid
    check (
      entrant_identity_hash is null
      or entrant_identity_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint qr_bingo_raffle_entries_source_reference_valid
    check (
      source_reference is null
      or (
        source_reference = btrim(source_reference)
        and length(source_reference) between 13 and 160
        and source_reference ~ '^bd-form-354:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      )
    ),
  add constraint qr_bingo_raffle_entries_alternate_audit_complete
    check (
      entry_method <> 'alternate_free_entry'
      or (
        entrant_identity_hash is not null
        and source_form_id = 354
        and source_reference is not null
        and source_submitted_at is not null
        and reconciled_at is not null
        and source_submitted_at <= reconciled_at
        and btrim(reconciled_by) <> ''
        and length(reconciled_by) <= 200
        and promotion_responsibility_acknowledged
        and promotion_responsibility_acknowledged_at is not null
        and btrim(promotion_responsibility_version) <> ''
        and length(promotion_responsibility_version) <= 80
        and btrim(promotion_disclosure_text) <> ''
        and length(promotion_disclosure_text) <= 2000
        and promotion_disclosure_text !~ '[[:cntrl:]]'
      )
    );

alter table public.qr_bingo_raffle_settings
  add constraint qr_bingo_raffle_settings_vendor_responsibility_audit_complete
    check (
      not vendor_responsibility_acknowledged
      or (
        vendor_responsibility_acknowledged_at is not null
        and btrim(vendor_responsibility_version) <> ''
        and length(vendor_responsibility_version) <= 80
        and btrim(vendor_responsibility_disclosure_text) <> ''
        and length(vendor_responsibility_disclosure_text) <= 2000
        and vendor_responsibility_disclosure_text !~ '[[:cntrl:]]'
      )
    );

create unique index if not exists qr_bingo_raffle_entries_source_reference_unique
  on public.qr_bingo_raffle_entries (source_reference)
  where source_reference is not null;

-- The registry is separate from entrant rows so pre-migration duplicates can
-- be preserved without allowing another chance for the same normalized email.
-- It stores only a keyed, domain-separated HMAC; no email or contact field.
create table if not exists public.qr_bingo_raffle_entry_identities (
  event_key text not null,
  vendor_bingo_id text not null,
  entrant_identity_hash text not null,
  first_entry_id uuid not null,
  registered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (event_key, vendor_bingo_id, entrant_identity_hash),
  constraint qr_bingo_raffle_entry_identities_event_present
    check (btrim(event_key) <> '' and length(event_key) <= 100),
  constraint qr_bingo_raffle_entry_identities_vendor_present
    check (btrim(vendor_bingo_id) <> '' and length(vendor_bingo_id) <= 100),
  constraint qr_bingo_raffle_entry_identities_hash_valid
    check (entrant_identity_hash ~ '^[0-9a-f]{64}$'),
  constraint qr_bingo_raffle_entry_identities_retention_valid
    check (expires_at > registered_at)
);

alter table public.qr_bingo_raffle_entry_identities enable row level security;
revoke all on table public.qr_bingo_raffle_entry_identities
  from public, anon, authenticated, service_role;
grant select, insert on table public.qr_bingo_raffle_entry_identities
  to service_role;

-- A dedicated Vault key prevents an exposed database digest from becoming an
-- offline email lookup table. It is not the admin request-signing credential.
do $$
begin
  if not exists (
    select 1
      from vault.decrypted_secrets
     where name = 'qr_bingo_entry_identity_hmac_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(64), 'hex'),
      'qr_bingo_entry_identity_hmac_secret',
      'Keyed identity hashing for per-vendor QR Bingo duplicate prevention.'
    );
  end if;
end;
$$;

create or replace function public.compute_qr_bingo_entrant_identity_hash(
  p_email text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  secret_value text;
begin
  if length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or normalized_email ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'A valid entrant email address is required.';
  end if;

  select decrypted_secret
    into secret_value
    from vault.decrypted_secrets
   where name = 'qr_bingo_entry_identity_hmac_secret'
   order by created_at desc
   limit 1;

  if length(coalesce(secret_value, '')) < 32 then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo entrant identity protection is unavailable.';
  end if;

  return encode(
    extensions.hmac(
      convert_to('qr-bingo-entry-identity:v1:' || normalized_email, 'UTF8'),
      convert_to(secret_value, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
end;
$$;

-- Deliberately do not expose a keyed-hash oracle to any API role. Trigger and
-- security-definer reconciliation code execute it as the owning role.
revoke all on function public.compute_qr_bingo_entrant_identity_hash(text)
  from public, anon, authenticated, service_role;

-- Backfill the same canonical identity for every valid historical email. The
-- registry selects the first historical row as its audit anchor; duplicate
-- historical rows remain untouched and visible to existing legal history.
-- Current-rules validation applies to new consent, so suspend that one trigger
-- only while adding the non-material hash to older immutable snapshots.
alter table public.qr_bingo_raffle_entries
  disable trigger enforce_qr_bingo_entry_current_rules;
update public.qr_bingo_raffle_entries entry
   set entrant_identity_hash = public.compute_qr_bingo_entrant_identity_hash(entry.couple_email)
 where entry.entrant_identity_hash is null
   and length(lower(btrim(coalesce(entry.couple_email, '')))) <= 254
   and lower(btrim(coalesce(entry.couple_email, '')))
       ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
   and lower(btrim(coalesce(entry.couple_email, ''))) !~ '[[:cntrl:]]';
alter table public.qr_bingo_raffle_entries
  enable trigger enforce_qr_bingo_entry_current_rules;

insert into public.qr_bingo_raffle_entry_identities (
  event_key,
  vendor_bingo_id,
  entrant_identity_hash,
  first_entry_id,
  registered_at,
  expires_at
)
select
  retained.event_key,
  retained.vendor_bingo_id,
  retained.entrant_identity_hash,
  retained.first_entry_id,
  retained.registered_at,
  retained.expires_at
from (
  select distinct on (entry.event_key, entry.vendor_bingo_id, entry.entrant_identity_hash)
    entry.event_key,
    entry.vendor_bingo_id,
    entry.entrant_identity_hash,
    entry.id as first_entry_id,
    entry.created_at as registered_at,
    max(
      greatest(coalesce(entry.draw_at, entry.created_at), entry.created_at) + interval '24 months'
    ) over (
      partition by entry.event_key, entry.vendor_bingo_id, entry.entrant_identity_hash
    ) as expires_at
  from public.qr_bingo_raffle_entries entry
  where entry.entrant_identity_hash is not null
  order by entry.event_key, entry.vendor_bingo_id, entry.entrant_identity_hash, entry.created_at, entry.id
) retained
on conflict (event_key, vendor_bingo_id, entrant_identity_hash) do update
  set expires_at = greatest(
    public.qr_bingo_raffle_entry_identities.expires_at,
    excluded.expires_at
  );

create or replace function public.set_and_reserve_qr_bingo_entry_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_hash text;
begin
  if tg_op = 'UPDATE' then
    if new.event_key is not distinct from old.event_key
      and new.vendor_bingo_id is not distinct from old.vendor_bingo_id
      and new.couple_email is not distinct from old.couple_email
    then
      new.entrant_identity_hash := old.entrant_identity_hash;
      return new;
    end if;
  end if;

  -- Invalid legacy values are preserved on unrelated updates, but every new
  -- entry and every explicit email change must have a valid protected identity.
  next_hash := public.compute_qr_bingo_entrant_identity_hash(new.couple_email);
  if tg_op = 'UPDATE' then
    if new.event_key is not distinct from old.event_key
      and new.vendor_bingo_id is not distinct from old.vendor_bingo_id
      and next_hash is not distinct from old.entrant_identity_hash
    then
      new.entrant_identity_hash := old.entrant_identity_hash;
      return new;
    end if;
  end if;
  new.entrant_identity_hash := next_hash;

  -- A keyed identity is retained only for the promotion audit/duplicate window.
  -- Once that window expires it no longer blocks a later, distinct promotion.
  delete from public.qr_bingo_raffle_entry_identities
   where event_key = new.event_key
     and vendor_bingo_id = new.vendor_bingo_id
     and entrant_identity_hash = next_hash
     and expires_at <= clock_timestamp();

  insert into public.qr_bingo_raffle_entry_identities (
    event_key,
    vendor_bingo_id,
    entrant_identity_hash,
    first_entry_id,
    expires_at
  ) values (
    new.event_key,
    new.vendor_bingo_id,
    next_hash,
    new.id,
    greatest(coalesce(new.draw_at, new.created_at, clock_timestamp()), coalesce(new.created_at, clock_timestamp())) + interval '24 months'
  );

  return new;
end;
$$;

revoke all on function public.set_and_reserve_qr_bingo_entry_identity()
  from public, anon, authenticated, service_role;

drop trigger if exists set_and_reserve_qr_bingo_entry_identity
  on public.qr_bingo_raffle_entries;
create trigger set_and_reserve_qr_bingo_entry_identity
before insert or update of event_key, vendor_bingo_id, couple_email, entrant_identity_hash
on public.qr_bingo_raffle_entries
for each row execute function public.set_and_reserve_qr_bingo_entry_identity();

create or replace function public.protect_qr_bingo_entry_source_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.event_key is distinct from old.event_key
    or new.vendor_bingo_id is distinct from old.vendor_bingo_id
    or new.vendor_bd_user_id is distinct from old.vendor_bd_user_id
    or new.entry_method is distinct from old.entry_method
    or new.source_reference is distinct from old.source_reference
    or new.source_form_id is distinct from old.source_form_id
    or new.source_submitted_at is distinct from old.source_submitted_at
    or new.reconciled_at is distinct from old.reconciled_at
    or new.reconciled_by is distinct from old.reconciled_by
  then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo entry method and reconciliation source audit are immutable.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_qr_bingo_entry_source_audit()
  from public, anon, authenticated;

drop trigger if exists protect_qr_bingo_entry_source_audit
  on public.qr_bingo_raffle_entries;
create trigger protect_qr_bingo_entry_source_audit
before update on public.qr_bingo_raffle_entries
for each row execute function public.protect_qr_bingo_entry_source_audit();

create or replace function public.enforce_qr_bingo_responsibility_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
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
$$;

revoke all on function public.enforce_qr_bingo_responsibility_audit()
  from public, anon, authenticated;

drop trigger if exists enforce_qr_bingo_settings_responsibility_audit
  on public.qr_bingo_raffle_settings;
create trigger enforce_qr_bingo_settings_responsibility_audit
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.enforce_qr_bingo_responsibility_audit();

drop trigger if exists enforce_qr_bingo_entry_responsibility_audit
  on public.qr_bingo_raffle_entries;
create trigger enforce_qr_bingo_entry_responsibility_audit
before insert or update on public.qr_bingo_raffle_entries
for each row execute function public.enforce_qr_bingo_responsibility_audit();

-- Preserve every vendor acceptance as an append-only snapshot. The current
-- settings row may later be disabled or cleared, but doing so cannot erase the
-- responsibility agreement that governed entries already received.
create table if not exists public.qr_bingo_vendor_responsibility_acceptance_audit (
  id uuid primary key default gen_random_uuid(),
  settings_id uuid not null,
  event_key text not null,
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  vendor_name text not null,
  rules_version text not null,
  responsibility_disclosure_text text not null,
  responsibility_accepted_at timestamptz not null,
  legal_terms_accepted_at timestamptz,
  rules_viewed_at timestamptz,
  enabled_when_recorded boolean not null,
  recorded_at timestamptz not null default now(),
  constraint qr_bingo_vendor_responsibility_audit_complete check (
    btrim(event_key) <> ''
    and btrim(vendor_bingo_id) <> ''
    and btrim(vendor_bd_user_id) <> ''
    and btrim(vendor_name) <> ''
    and btrim(rules_version) <> ''
    and btrim(responsibility_disclosure_text) <> ''
    and length(responsibility_disclosure_text) <= 2000
    and responsibility_disclosure_text !~ '[[:cntrl:]]'
  )
);

alter table public.qr_bingo_vendor_responsibility_acceptance_audit enable row level security;
revoke all on table public.qr_bingo_vendor_responsibility_acceptance_audit
  from public, anon, authenticated, service_role;
grant select on table public.qr_bingo_vendor_responsibility_acceptance_audit
  to service_role;

create or replace function public.audit_qr_bingo_vendor_responsibility_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_record boolean := false;
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
      enabled_when_recorded
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
      new.enabled
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_qr_bingo_vendor_responsibility_acceptance()
  from public, anon, authenticated, service_role;

drop trigger if exists audit_qr_bingo_vendor_responsibility_acceptance
  on public.qr_bingo_raffle_settings;
create trigger audit_qr_bingo_vendor_responsibility_acceptance
after insert or update on public.qr_bingo_raffle_settings
for each row execute function public.audit_qr_bingo_vendor_responsibility_acceptance();

create or replace function public.reject_qr_bingo_vendor_responsibility_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'QR Bingo vendor responsibility acceptance audit is append-only.';
end;
$$;

revoke all on function public.reject_qr_bingo_vendor_responsibility_audit_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_qr_bingo_vendor_responsibility_audit_mutation
  on public.qr_bingo_vendor_responsibility_acceptance_audit;
create trigger reject_qr_bingo_vendor_responsibility_audit_mutation
before update or delete on public.qr_bingo_vendor_responsibility_acceptance_audit
for each row execute function public.reject_qr_bingo_vendor_responsibility_audit_mutation();

-- Keep vendor acceptance writable through the existing optimistic-lock RPC.
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
    'alternate_free_entry_url',
    'vendor_responsibility_acknowledged',
    'vendor_responsibility_disclosure_text',
    'vendor_responsibility_acknowledged_at',
    'vendor_responsibility_version'
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
      message = 'QR Bingo vendor settings changed; reload before saving.';
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
         vendor_responsibility_acknowledged = candidate_settings.vendor_responsibility_acknowledged,
         vendor_responsibility_disclosure_text = candidate_settings.vendor_responsibility_disclosure_text,
         vendor_responsibility_acknowledged_at = candidate_settings.vendor_responsibility_acknowledged_at,
         vendor_responsibility_version = candidate_settings.vendor_responsibility_version,
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

create or replace function public.is_valid_qr_bingo_optional_calendar_date(
  p_value text
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if coalesce(p_value, '') = '' then
    return true;
  end if;
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  return (p_value::date)::text = p_value;
exception
  when datetime_field_overflow or invalid_datetime_format then
    return false;
end;
$$;

revoke all on function public.is_valid_qr_bingo_optional_calendar_date(text)
  from public, anon, authenticated, service_role;

create or replace function public.reconcile_qr_bingo_alternate_free_entry(
  p_event_key text,
  p_expected_revision bigint,
  p_vendor_bingo_id text,
  p_form_inquiry_id text,
  p_form_submitted_at timestamptz,
  p_submitted_rules_version text,
  p_couple_name text,
  p_couple_email text,
  p_couple_phone text default '',
  p_couple_wedding_date text default '',
  p_age_of_majority_confirmed boolean default false,
  p_eligible_residency_confirmed boolean default false,
  p_not_excluded_confirmed boolean default false,
  p_rules_acknowledged boolean default false,
  p_promotion_responsibility_acknowledged boolean default false,
  p_apple_non_sponsor_acknowledged boolean default false,
  p_actor text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_config public.qr_bingo_event_configs%rowtype;
  vendor_settings public.qr_bingo_raffle_settings%rowtype;
  created_entry public.qr_bingo_raffle_entries%rowtype;
  normalized_event_key text := btrim(coalesce(p_event_key, ''));
  normalized_vendor_id text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_inquiry_id text := btrim(coalesce(p_form_inquiry_id, ''));
  normalized_submitted_rules_version text := btrim(coalesce(p_submitted_rules_version, ''));
  normalized_name text := regexp_replace(btrim(coalesce(p_couple_name, '')), '[ ]+', ' ', 'g');
  normalized_email text := lower(btrim(coalesce(p_couple_email, '')));
  normalized_phone text := btrim(coalesce(p_couple_phone, ''));
  normalized_wedding_date text := btrim(coalesce(p_couple_wedding_date, ''));
  normalized_actor text := btrim(coalesce(p_actor, ''));
  identity_hash text;
  canonical_source_reference text;
  responsibility_disclosure text;
  consent_snapshot text;
  reconciled_at_value timestamptz := clock_timestamp();
  submitted_at_value timestamptz := p_form_submitted_at;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if normalized_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event_key) > 100
    or p_expected_revision is null
    or p_expected_revision < 1
    or normalized_vendor_id !~ '^[1-9][0-9]{0,19}$'
    or normalized_inquiry_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or submitted_at_value is null
    or submitted_at_value > reconciled_at_value + interval '5 minutes'
    or normalized_submitted_rules_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    or length(normalized_name) < 1
    or length(normalized_name) > 160
    or normalized_name ~ '[<>[:cntrl:]]'
    or length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or normalized_email ~ '[[:cntrl:]]'
    or length(normalized_phone) > 80
    or normalized_phone ~ '[<>[:cntrl:]]'
    or length(normalized_wedding_date) > 10
    or not public.is_valid_qr_bingo_optional_calendar_date(normalized_wedding_date)
    or length(normalized_actor) < 1
    or length(normalized_actor) > 200
    or normalized_actor ~ '[<>[:cntrl:]]'
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_submission',
      'error', 'The Form 354 inquiry details are incomplete or invalid.'
    );
  end if;

  if p_age_of_majority_confirmed is distinct from true
    or p_eligible_residency_confirmed is distinct from true
    or p_not_excluded_confirmed is distinct from true
    or p_rules_acknowledged is distinct from true
    or p_promotion_responsibility_acknowledged is distinct from true
    or p_apple_non_sponsor_acknowledged is distinct from true
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'confirmations_required',
      'error', 'All eligibility, rules, vendor-responsibility, and Apple confirmations are required.'
    );
  end if;

  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
   for share;

  if current_config.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'event_unavailable',
      'error', 'No current QR Bingo event is available for reconciliation.'
    );
  end if;

  if current_config.event_key is distinct from normalized_event_key
    or current_config.revision is distinct from p_expected_revision
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_event_config',
      'error', 'The event configuration changed. Reload the admin page and verify the inquiry again.'
    );
  end if;

  if current_config.rules_version is distinct from normalized_submitted_rules_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_form_rules',
      'error', 'The inquiry did not accept the currently published rules version.'
    );
  end if;

  if not current_config.vendor_draws_enabled then
    return jsonb_build_object(
      'ok', false,
      'code', 'draws_disabled',
      'error', 'Vendor draw entries are currently disabled.'
    );
  end if;

  if submitted_at_value < current_config.history_starts_at then
    return jsonb_build_object(
      'ok', false,
      'code', 'entry_not_open',
      'error', 'The current event entry period has not opened.'
    );
  end if;

  if submitted_at_value >= current_config.entry_closes_at then
    return jsonb_build_object(
      'ok', false,
      'code', 'entry_closed',
      'error', 'The current event entry period has closed.'
    );
  end if;

  select settings.*
    into vendor_settings
    from public.qr_bingo_raffle_settings settings
   where settings.event_key = normalized_event_key
     and settings.vendor_bingo_id = normalized_vendor_id
   for share;

  if vendor_settings.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'unknown_vendor',
      'error', 'No vendor draw matches that immutable vendor ID for the current event.'
    );
  end if;

  if not vendor_settings.enabled then
    return jsonb_build_object(
      'ok', false,
      'code', 'draw_not_enabled',
      'error', 'That vendor draw is not currently enabled.'
    );
  end if;

  if vendor_settings.legal_terms_version is distinct from current_config.rules_version
    or not vendor_settings.legal_terms_accepted
    or vendor_settings.legal_terms_accepted_at is null
    or vendor_settings.rules_viewed_at is null
    or not vendor_settings.apple_non_sponsor_acknowledged
    or vendor_settings.vendor_bd_user_id is distinct from normalized_vendor_id
    or nullif(btrim(vendor_settings.vendor_name), '') is null
    or nullif(btrim(vendor_settings.prize_provider_name), '') is null
    or vendor_settings.official_rules_url is distinct from current_config.official_rules_url
    or vendor_settings.alternate_free_entry_url is distinct from current_config.alternate_free_entry_url
    or vendor_settings.eligibility_region is distinct from current_config.eligibility_region
    or vendor_settings.entry_closes_at is distinct from current_config.entry_closes_at
    or vendor_settings.draw_at is distinct from current_config.draw_at
    or not vendor_settings.no_purchase_required
    or not vendor_settings.skill_testing_question_required
    or nullif(btrim(vendor_settings.prize_title), '') is null
    or nullif(btrim(vendor_settings.prize_description), '') is null
    or coalesce(vendor_settings.prize_approx_value_cad, 0) <= 0
    or not vendor_settings.vendor_responsibility_acknowledged
    or vendor_settings.vendor_responsibility_acknowledged_at is null
    or vendor_settings.vendor_responsibility_version is distinct from current_config.rules_version
    or nullif(btrim(vendor_settings.vendor_responsibility_disclosure_text), '') is null
    or vendor_settings.vendor_responsibility_disclosure_text ~ '[[:cntrl:]]'
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'vendor_terms_stale',
      'error', 'The vendor must complete the current prize and responsibility acceptance before this inquiry can be reconciled.'
    );
  end if;

  if submitted_at_value >= vendor_settings.entry_closes_at then
    return jsonb_build_object(
      'ok', false,
      'code', 'entry_closed',
      'error', 'That vendor draw entry period has closed.'
    );
  end if;

  identity_hash := public.compute_qr_bingo_entrant_identity_hash(normalized_email);
  canonical_source_reference := 'bd-form-354:' || normalized_inquiry_id;

  -- Serialize two admin sessions reconciling the same source or identity. App
  -- entries are independently protected by the identity-registry trigger.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_event_key || ':' || normalized_vendor_id || ':' || identity_hash || ':' || canonical_source_reference,
      0
    )
  );

  if exists (
    select 1
      from public.qr_bingo_raffle_entries entry
     where entry.source_reference = canonical_source_reference
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'duplicate_source',
      'error', 'That Form 354 inquiry was already reconciled.'
    );
  end if;

  if exists (
    select 1
      from public.qr_bingo_raffle_entry_identities identity
     where identity.event_key = normalized_event_key
       and identity.vendor_bingo_id = normalized_vendor_id
       and identity.entrant_identity_hash = identity_hash
       and identity.expires_at > reconciled_at_value
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'duplicate_entry',
      'error', 'This email already has an entry for that vendor draw, through either entry method.'
    );
  end if;

  responsibility_disclosure := btrim(vendor_settings.vendor_responsibility_disclosure_text);
  consent_snapshot :=
    'I submitted Brilliant Directories Form 354 and reviewed official rules version '
    || current_config.rules_version
    || '. I authorize use of my entry data only for promotion administration, verification, and prize fulfillment; contact information may be shared with '
    || vendor_settings.vendor_name
    || ' only if I am selected as a potential winner and not for marketing. '
    || responsibility_disclosure
    || ' Apple Inc. is not a sponsor of and is not involved in this promotion.';

  begin
    insert into public.qr_bingo_raffle_entries (
      event_key,
      vendor_bingo_id,
      vendor_bd_user_id,
      vendor_name,
      couple_bd_user_id,
      couple_name,
      couple_email,
      couple_phone,
      couple_wedding_date,
      consent_share_contact,
      contact_share_scope,
      consent_text,
      consent_version,
      consented_at,
      prize_title,
      prize_description,
      official_rules_url,
      rules_viewed_at,
      administrator_name,
      co_sponsor_name,
      prize_provider_name,
      apple_non_sponsor_acknowledged,
      prize_approx_value_cad,
      eligibility_region,
      entry_closes_at,
      draw_at,
      odds_basis,
      no_purchase_required,
      skill_testing_question_required,
      alternate_free_entry_url,
      age_of_majority_attested,
      residency_attested,
      exclusions_attested,
      eligibility_attested_at,
      eligibility_attestation_text,
      entry_method,
      source_reference,
      source_form_id,
      source_submitted_at,
      reconciled_at,
      reconciled_by,
      promotion_responsibility_acknowledged,
      promotion_disclosure_text,
      promotion_responsibility_acknowledged_at,
      promotion_responsibility_version
    ) values (
      current_config.event_key,
      vendor_settings.vendor_bingo_id,
      vendor_settings.vendor_bd_user_id,
      vendor_settings.vendor_name,
      'alternate-free-entry:' || gen_random_uuid()::text,
      normalized_name,
      normalized_email,
      normalized_phone,
      normalized_wedding_date,
      true,
      'selected_potential_winner_only',
      consent_snapshot,
      current_config.rules_version,
      submitted_at_value,
      vendor_settings.prize_title,
      vendor_settings.prize_description,
      current_config.official_rules_url,
      submitted_at_value,
      vendor_settings.administrator_name,
      vendor_settings.co_sponsor_name,
      vendor_settings.prize_provider_name,
      true,
      vendor_settings.prize_approx_value_cad,
      vendor_settings.eligibility_region,
      vendor_settings.entry_closes_at,
      vendor_settings.draw_at,
      vendor_settings.odds_basis,
      true,
      true,
      current_config.alternate_free_entry_url,
      true,
      true,
      true,
      submitted_at_value,
      'The Form 354 participant confirmed age of majority, eligible residency, and no exclusion under the current official rules.',
      'alternate_free_entry',
      canonical_source_reference,
      354,
      submitted_at_value,
      reconciled_at_value,
      normalized_actor,
      true,
      responsibility_disclosure,
      submitted_at_value,
      current_config.rules_version
    )
    returning * into created_entry;
  exception
    when unique_violation then
      if exists (
        select 1
          from public.qr_bingo_raffle_entries entry
         where entry.source_reference = canonical_source_reference
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'duplicate_source',
          'error', 'That Form 354 inquiry was already reconciled.'
        );
      end if;
      return jsonb_build_object(
        'ok', false,
        'code', 'duplicate_entry',
        'error', 'This email already has an entry for that vendor draw, through either entry method.'
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'entry_reference', created_entry.id,
    'event_key', created_entry.event_key,
    'vendor_bingo_id', created_entry.vendor_bingo_id,
    'entry_method', created_entry.entry_method,
    'source_reference', created_entry.source_reference,
    'created_at', created_entry.created_at,
    'scan_progress_changed', false
  );
end;
$$;

revoke all on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, text, text, timestamptz, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, text, text, timestamptz, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean, text
) to service_role;

comment on column public.qr_bingo_raffle_entries.entry_method is
  'How this vendor-draw chance was created: QR scan opt-in or validated alternate free entry.';
comment on column public.qr_bingo_raffle_entries.entrant_identity_hash is
  'Domain-separated keyed HMAC of normalized email; service-only duplicate-prevention data.';
comment on column public.qr_bingo_raffle_entries.source_reference is
  'Unique immutable reconciliation source, currently bd-form-354:<inquiry-id>.';
comment on column public.qr_bingo_raffle_entries.source_submitted_at is
  'Immutable original BD Form 354 submission time used for entry-window eligibility; distinct from administrator reconciliation time.';
comment on table public.qr_bingo_raffle_entry_identities is
  'Service-only keyed identity registry preventing repeat vendor-draw chances across entry methods.';
comment on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, text, text, timestamptz, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean, text
) is
  'Admin-only reconciliation of one validated BD Form 354 inquiry. Does not create scan visits or Bingo progress.';
