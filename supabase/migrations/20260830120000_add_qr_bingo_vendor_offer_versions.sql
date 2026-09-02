-- Preserve the exact vendor offer accepted by every future QR and alternate
-- entry.  Offer versions are the monotonic qr_bingo_raffle_settings.updated_at
-- value, while this append-only table retains the public material terms and the
-- availability/acceptance state that existed at that version.

alter table public.qr_bingo_raffle_settings
  add column if not exists participant_responsibility_disclosure_text text not null default '';

create table if not exists public.qr_bingo_vendor_offer_versions (
  event_key text not null,
  vendor_bingo_id text not null,
  vendor_offer_version timestamptz not null,
  event_revision bigint,
  event_name text not null,
  vendor_tag_id integer,
  vendor_bd_user_id text not null,
  vendor_name text not null,
  enabled boolean not null,
  offer_enterable boolean not null,
  activation_excluded_as_legacy_qa boolean not null default false,
  history_starts_at timestamptz,
  prize_title text not null,
  prize_description text not null,
  prize_approx_value_cad numeric(12,2),
  eligibility_region text not null,
  entry_closes_at timestamptz,
  draw_opens_at timestamptz,
  draw_at timestamptz,
  odds_basis text not null,
  no_purchase_required boolean not null,
  skill_testing_question_required boolean not null,
  official_rules_url text not null,
  alternate_free_entry_url text not null,
  rules_version text not null,
  legal_terms_accepted boolean not null,
  legal_terms_accepted_at timestamptz,
  rules_viewed_at timestamptz,
  administrator_name text not null,
  co_sponsor_name text not null,
  prize_provider_name text not null,
  apple_non_sponsor_acknowledged boolean not null,
  vendor_responsibility_acknowledged boolean not null,
  vendor_responsibility_disclosure_text text not null,
  vendor_responsibility_acknowledged_at timestamptz,
  vendor_responsibility_version text not null,
  participant_responsibility_disclosure_text text not null,
  captured_at timestamptz not null default clock_timestamp(),
  primary key (event_key, vendor_bingo_id, vendor_offer_version),
  constraint qr_bingo_vendor_offer_version_positive_revision check (
    event_revision is null or event_revision > 0
  ),
  constraint qr_bingo_vendor_offer_version_identity_present check (
    btrim(event_key) <> ''
    and btrim(vendor_bingo_id) <> ''
    and btrim(vendor_bd_user_id) <> ''
    and btrim(vendor_name) <> ''
    and length(event_name) <= 200
  ),
  constraint qr_bingo_vendor_offer_version_text_bounded check (
    length(prize_title) <= 180
    and length(prize_description) <= 1000
    and length(eligibility_region) <= 300
    and length(odds_basis) <= 500
    and length(official_rules_url) <= 500
    and length(alternate_free_entry_url) <= 500
    and length(rules_version) <= 80
    and length(vendor_responsibility_disclosure_text) <= 2000
    and length(participant_responsibility_disclosure_text) <= 2000
  ),
  constraint qr_bingo_vendor_offer_version_enterable_complete check (
    not offer_enterable or (
      enabled
      and legal_terms_accepted
      and legal_terms_accepted_at is not null
      and rules_viewed_at is not null
      and apple_non_sponsor_acknowledged
      and vendor_responsibility_acknowledged
      and vendor_responsibility_acknowledged_at is not null
      and btrim(vendor_responsibility_disclosure_text) <> ''
      and btrim(participant_responsibility_disclosure_text) <> ''
      and vendor_responsibility_version = rules_version
      and btrim(prize_title) <> ''
      and btrim(prize_description) <> ''
      and prize_approx_value_cad > 0
      and btrim(eligibility_region) <> ''
      and history_starts_at is not null
      and entry_closes_at is not null
      and draw_opens_at is not null
      and draw_at is not null
      and draw_opens_at >= entry_closes_at
      and draw_at >= draw_opens_at
      and btrim(odds_basis) <> ''
      and no_purchase_required
      and skill_testing_question_required
      and official_rules_url ~ '^https://'
      and alternate_free_entry_url ~ '^https://'
    )
  )
);

alter table public.qr_bingo_vendor_offer_versions
  add column if not exists participant_responsibility_disclosure_text text not null default '';

alter table public.qr_bingo_vendor_offer_versions
  drop constraint if exists qr_bingo_vendor_offer_version_participant_disclosure_complete;
alter table public.qr_bingo_vendor_offer_versions
  add constraint qr_bingo_vendor_offer_version_participant_disclosure_complete
  check (
    not offer_enterable
    or btrim(participant_responsibility_disclosure_text) <> ''
  ) not valid;

create index if not exists qr_bingo_vendor_offer_versions_lookup_idx
  on public.qr_bingo_vendor_offer_versions
  (event_key, vendor_bingo_id, vendor_offer_version desc);

alter table public.qr_bingo_vendor_offer_versions enable row level security;
revoke all on table public.qr_bingo_vendor_offer_versions
  from public, anon, authenticated, service_role;
grant select on table public.qr_bingo_vendor_offer_versions to service_role;

create or replace function public.reject_qr_bingo_vendor_offer_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'QR Bingo vendor offer history is append-only.';
end;
$$;

revoke all on function public.reject_qr_bingo_vendor_offer_version_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_qr_bingo_vendor_offer_version_mutation
  on public.qr_bingo_vendor_offer_versions;
create trigger reject_qr_bingo_vendor_offer_version_mutation
before update or delete on public.qr_bingo_vendor_offer_versions
for each row execute function public.reject_qr_bingo_vendor_offer_version_mutation();

-- Retain the pre-release production-event QA chain without erasing its entry,
-- selections, or email history.  This marker is intentionally narrow and the
-- guarded block aborts if any production facts differ from the audited chain.
create table if not exists public.qr_bingo_legacy_qa_archives (
  entry_id uuid primary key references public.qr_bingo_raffle_entries(id),
  event_key text not null,
  vendor_bingo_id text not null,
  couple_bd_user_id text not null,
  archived_reason text not null,
  archived_at timestamptz not null default clock_timestamp(),
  archived_by text not null,
  constraint qr_bingo_legacy_qa_archive_identity check (
    btrim(event_key) <> ''
    and btrim(vendor_bingo_id) <> ''
    and btrim(couple_bd_user_id) <> ''
    and btrim(archived_reason) <> ''
    and btrim(archived_by) <> ''
  )
);

alter table public.qr_bingo_legacy_qa_archives enable row level security;
revoke all on table public.qr_bingo_legacy_qa_archives
  from public, anon, authenticated, service_role;
grant select on table public.qr_bingo_legacy_qa_archives to service_role;

create or replace function public.reject_qr_bingo_legacy_qa_archive_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'QR Bingo legacy QA archive markers are append-only.';
end;
$$;

revoke all on function public.reject_qr_bingo_legacy_qa_archive_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_qr_bingo_legacy_qa_archive_mutation
  on public.qr_bingo_legacy_qa_archives;
create trigger reject_qr_bingo_legacy_qa_archive_mutation
before update or delete on public.qr_bingo_legacy_qa_archives
for each row execute function public.reject_qr_bingo_legacy_qa_archive_mutation();

do $$
declare
  production_entry_count integer;
  qa_entry public.qr_bingo_raffle_entries%rowtype;
  qa_draw_count integer;
  qa_nonlegacy_draw_count integer;
  qa_wrong_draw_identity_count integer;
  qa_first_draw_date date;
  qa_last_draw_date date;
begin
  select count(*)
    into production_entry_count
    from public.qr_bingo_raffle_entries entry
   where entry.event_key = 'niagara-wedding-show-2026';

  -- A blank/local database has no production chain to mark.  Any non-empty
  -- production event must match the audited singleton exactly or deployment
  -- fails without archiving anything.
  if production_entry_count = 0 then
    return;
  end if;
  if production_entry_count <> 1 then
    raise exception 'Legacy QR Bingo QA archive guard expected exactly one production-event entry, found %.', production_entry_count;
  end if;

  select *
    into qa_entry
    from public.qr_bingo_raffle_entries entry
   where entry.event_key = 'niagara-wedding-show-2026'
     and entry.vendor_bingo_id = '23608'
     and entry.vendor_bd_user_id = '23608'
     and entry.couple_bd_user_id = '38828'
     and entry.couple_name = 'Bob Win'
     and entry.consent_version = '2026-05-18'
     and entry.created_at::date = date '2026-05-18';

  if qa_entry.id is null then
    raise exception 'Legacy QR Bingo QA archive guard did not find the exact audited Bob Win entry.';
  end if;

  select count(*),
         count(*) filter (where draw.selection_status is distinct from 'legacy'),
         count(*) filter (
           where draw.event_key is distinct from qa_entry.event_key
              or draw.vendor_bingo_id is distinct from qa_entry.vendor_bingo_id
              or draw.vendor_bd_user_id is distinct from qa_entry.vendor_bd_user_id
              or draw.couple_bd_user_id is distinct from qa_entry.couple_bd_user_id
         ),
         min(draw.drawn_at::date),
         max(draw.drawn_at::date)
    into qa_draw_count,
         qa_nonlegacy_draw_count,
         qa_wrong_draw_identity_count,
         qa_first_draw_date,
         qa_last_draw_date
    from public.qr_bingo_raffle_draws draw
   where draw.entry_id = qa_entry.id;

  if qa_draw_count <> 12
    or qa_nonlegacy_draw_count <> 0
    or qa_wrong_draw_identity_count <> 0
    or qa_first_draw_date <> date '2026-05-21'
    or qa_last_draw_date <> date '2026-05-24'
  then
    raise exception 'Legacy QR Bingo QA archive draw-chain guard failed (count %, nonlegacy %, wrong identity %, dates % to %).',
      qa_draw_count,
      qa_nonlegacy_draw_count,
      qa_wrong_draw_identity_count,
      qa_first_draw_date,
      qa_last_draw_date;
  end if;

  insert into public.qr_bingo_legacy_qa_archives (
    entry_id,
    event_key,
    vendor_bingo_id,
    couple_bd_user_id,
    archived_reason,
    archived_by
  ) values (
    qa_entry.id,
    qa_entry.event_key,
    qa_entry.vendor_bingo_id,
    qa_entry.couple_bd_user_id,
    'Pre-release May 2026 QA entry with twelve preserved legacy selections; excluded only from active-promotion gates.',
    'migration:20260830120000'
  )
  on conflict (entry_id) do nothing;
end;
$$;

create or replace function public.capture_qr_bingo_vendor_offer_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_config public.qr_bingo_event_configs%rowtype;
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
      )
   order by (config.event_key = new.event_key) desc, config.published desc, config.revision desc
   limit 1;

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
    and new.alternate_free_entry_url is not distinct from event_config.alternate_free_entry_url
    and new.eligibility_region is not distinct from event_config.eligibility_region
    and new.entry_closes_at is not distinct from event_config.entry_closes_at
    and new.draw_opens_at is not distinct from event_config.draw_opens_at
    and new.draw_at is not distinct from event_config.draw_at
    and new.draw_opens_at >= new.entry_closes_at
    and new.draw_at >= new.draw_opens_at
    and nullif(btrim(new.odds_basis), '') is not null
    and new.no_purchase_required
    and new.skill_testing_question_required;

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

-- Backfill a truthful snapshot of every current settings row.  Unknown/expired
-- historical events remain non-enterable and keep a null event revision.
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
)
select settings.event_key,
       settings.vendor_bingo_id,
       settings.updated_at,
       config.revision,
       coalesce(config.event_name, ''),
       config.vendor_tag_id,
       settings.vendor_bd_user_id,
       settings.vendor_name,
       settings.enabled,
       (
         config.id is not null
         and settings.enabled
         and settings.legal_terms_accepted
         and settings.legal_terms_version is not distinct from config.rules_version
         and settings.legal_terms_accepted_at is not null
         and settings.rules_viewed_at is not null
         and settings.apple_non_sponsor_acknowledged
         and settings.vendor_responsibility_acknowledged
         and settings.vendor_responsibility_acknowledged_at is not null
         and settings.vendor_responsibility_version is not distinct from config.rules_version
         and nullif(btrim(settings.vendor_responsibility_disclosure_text), '') is not null
         and nullif(btrim(settings.participant_responsibility_disclosure_text), '') is not null
         and settings.vendor_bd_user_id is not distinct from settings.vendor_bingo_id
         and nullif(btrim(settings.vendor_name), '') is not null
         and nullif(btrim(settings.prize_title), '') is not null
         and nullif(btrim(settings.prize_description), '') is not null
         and coalesce(settings.prize_approx_value_cad, 0) > 0
         and nullif(btrim(settings.prize_provider_name), '') is not null
         and settings.official_rules_url is not distinct from config.official_rules_url
         and settings.alternate_free_entry_url is not distinct from config.alternate_free_entry_url
         and settings.eligibility_region is not distinct from config.eligibility_region
         and settings.entry_closes_at is not distinct from config.entry_closes_at
         and settings.draw_opens_at is not distinct from config.draw_opens_at
         and settings.draw_at is not distinct from config.draw_at
         and settings.draw_opens_at >= settings.entry_closes_at
         and settings.draw_at >= settings.draw_opens_at
         and nullif(btrim(settings.odds_basis), '') is not null
         and settings.no_purchase_required
         and settings.skill_testing_question_required
       ),
       exists (
         select 1
           from public.qr_bingo_legacy_qa_archives archive
          where archive.event_key = settings.event_key
            and archive.vendor_bingo_id = settings.vendor_bingo_id
       ),
       config.history_starts_at,
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
       settings.participant_responsibility_disclosure_text
  from public.qr_bingo_raffle_settings settings
  left join lateral (
    select candidate.*
      from public.qr_bingo_event_configs candidate
     where candidate.event_key = settings.event_key
        or (
          candidate.published
          and (
            exists (
              select 1
                from public.app_review_raffle_fixtures fixture
               where fixture.event_key = settings.event_key
                 and fixture.enabled
                 and fixture.expires_at > clock_timestamp()
            )
            or exists (
              select 1
                from public.qr_bingo_email_test_fixtures fixture
               where fixture.event_key = settings.event_key
                 and fixture.enabled
                 and fixture.expires_at > clock_timestamp()
            )
          )
        )
     order by (candidate.event_key = settings.event_key) desc,
              candidate.published desc,
              candidate.revision desc
     limit 1
  ) config on true
on conflict (event_key, vendor_bingo_id, vendor_offer_version) do nothing;

-- Serialize all settings writes against the canonical publish RPC.  Without
-- this shared lock, an offer could become enterable concurrently after a
-- publisher had already passed the activation gate.
create or replace function public.acquire_qr_bingo_offer_publish_lock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('qr_bingo_event_config_publish', 0)
  );
  return new;
end;
$$;

revoke all on function public.acquire_qr_bingo_offer_publish_lock()
  from public, anon, authenticated, service_role;

drop trigger if exists acquire_qr_bingo_offer_publish_lock
  on public.qr_bingo_raffle_settings;
create trigger acquire_qr_bingo_offer_publish_lock
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.acquire_qr_bingo_offer_publish_lock();

create or replace function public.ensure_qr_bingo_vendor_offer_version_timestamp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := clock_timestamp();
  elsif new.updated_at is null or new.updated_at <= old.updated_at then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_qr_bingo_vendor_offer_version_timestamp()
  from public, anon, authenticated, service_role;

drop trigger if exists ensure_qr_bingo_vendor_offer_version_timestamp
  on public.qr_bingo_raffle_settings;
create trigger ensure_qr_bingo_vendor_offer_version_timestamp
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.ensure_qr_bingo_vendor_offer_version_timestamp();

drop trigger if exists capture_qr_bingo_vendor_offer_version
  on public.qr_bingo_raffle_settings;
create trigger capture_qr_bingo_vendor_offer_version
after insert or update on public.qr_bingo_raffle_settings
for each row execute function public.capture_qr_bingo_vendor_offer_version();

-- The participant disclosure is a material offer term. It is supplied only by
-- the trusted Edge function and becomes part of the settings row before the
-- immutable offer snapshot and material-term lock triggers run.
create or replace function public.set_qr_bingo_participant_responsibility_disclosure()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
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
$$;

revoke all on function public.set_qr_bingo_participant_responsibility_disclosure()
  from public, anon, authenticated, service_role;

drop trigger if exists context_qr_bingo_participant_responsibility_disclosure
  on public.qr_bingo_raffle_settings;
create trigger context_qr_bingo_participant_responsibility_disclosure
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.set_qr_bingo_participant_responsibility_disclosure();

-- Extend the existing append-only vendor acceptance ledger. Legacy rows stay
-- truthfully unattributed; every future acceptance is bound to the exact offer
-- version, authenticated vendor account, source channel, authority attestation,
-- canonical text, database-generated hash, rules version, and server time.
alter table public.qr_bingo_vendor_responsibility_acceptance_audit
  add column if not exists vendor_offer_version timestamptz,
  add column if not exists authenticated_vendor_bd_user_id text,
  add column if not exists acceptance_source text,
  add column if not exists authority_to_bind_attested boolean,
  add column if not exists responsibility_disclosure_sha256 text;

alter table public.qr_bingo_vendor_responsibility_acceptance_audit
  drop constraint if exists qr_bingo_vendor_responsibility_context_complete;
alter table public.qr_bingo_vendor_responsibility_acceptance_audit
  add constraint qr_bingo_vendor_responsibility_context_complete
  check (
    (
      vendor_offer_version is null
      and authenticated_vendor_bd_user_id is null
      and acceptance_source is null
      and authority_to_bind_attested is null
    )
    or (
      vendor_offer_version is not null
      and authenticated_vendor_bd_user_id = vendor_bd_user_id
      and acceptance_source in ('app', 'website')
      and authority_to_bind_attested is true
      and responsibility_disclosure_sha256 ~ '^[0-9a-f]{64}$'
    )
  );

alter table public.qr_bingo_vendor_responsibility_acceptance_audit
  drop constraint if exists qr_bingo_vendor_responsibility_offer_version_fk;
alter table public.qr_bingo_vendor_responsibility_acceptance_audit
  add constraint qr_bingo_vendor_responsibility_offer_version_fk
  foreign key (event_key, vendor_bingo_id, vendor_offer_version)
  references public.qr_bingo_vendor_offer_versions
    (event_key, vendor_bingo_id, vendor_offer_version)
  deferrable initially deferred;

create unique index if not exists qr_bingo_vendor_responsibility_acceptance_offer_unique
  on public.qr_bingo_vendor_responsibility_acceptance_audit
  (event_key, vendor_bingo_id, vendor_offer_version)
  where vendor_offer_version is not null;

create or replace function public.audit_qr_bingo_vendor_responsibility_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.audit_qr_bingo_vendor_responsibility_acceptance()
  from public, anon, authenticated, service_role;

drop trigger if exists audit_qr_bingo_vendor_responsibility_acceptance
  on public.qr_bingo_raffle_settings;
drop trigger if exists record_qr_bingo_vendor_responsibility_acceptance
  on public.qr_bingo_raffle_settings;
create trigger record_qr_bingo_vendor_responsibility_acceptance
after insert or update on public.qr_bingo_raffle_settings
for each row execute function public.audit_qr_bingo_vendor_responsibility_acceptance();

create or replace function public.compare_and_update_qr_bingo_vendor_settings(
  p_event_key text,
  p_vendor_bingo_id text,
  p_expected_updated_at timestamptz,
  p_patch jsonb,
  p_authenticated_vendor_bd_user_id text,
  p_acceptance_source text,
  p_authority_to_bind boolean,
  p_participant_responsibility_disclosure text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_vendor_id text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_actor text := btrim(coalesce(p_authenticated_vendor_bd_user_id, ''));
  normalized_source text := lower(btrim(coalesce(p_acceptance_source, '')));
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if normalized_actor is distinct from normalized_vendor_id then
    raise exception using errcode = '42501', message = 'The authenticated vendor identity does not match the settings owner.';
  end if;
  if p_authority_to_bind is true and normalized_source not in ('app', 'website') then
    raise exception using errcode = '22023', message = 'A valid app or website acceptance source is required.';
  end if;
  if p_participant_responsibility_disclosure is null
    or btrim(p_participant_responsibility_disclosure) = ''
    or length(p_participant_responsibility_disclosure) > 2000
    or p_participant_responsibility_disclosure ~ '[[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'The exact participant responsibility disclosure is required.';
  end if;

  perform set_config(
    'request.qr_bingo_authenticated_vendor_bd_user_id',
    normalized_actor,
    true
  );
  perform set_config(
    'request.qr_bingo_vendor_acceptance_source',
    normalized_source,
    true
  );
  perform set_config(
    'request.qr_bingo_vendor_authority_to_bind',
    case when p_authority_to_bind is true then 'true' else 'false' end,
    true
  );
  perform set_config(
    'request.qr_bingo_participant_responsibility_disclosure',
    p_participant_responsibility_disclosure,
    true
  );

  result := public.compare_and_update_qr_bingo_vendor_settings(
    p_event_key,
    p_vendor_bingo_id,
    p_expected_updated_at,
    p_patch
  );
  return result;
end;
$$;

revoke all on function public.compare_and_update_qr_bingo_vendor_settings(
  text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.compare_and_update_qr_bingo_vendor_settings(
  text, text, timestamptz, jsonb, text, text, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.compare_and_update_qr_bingo_vendor_settings(
  text, text, timestamptz, jsonb, text, text, boolean, text
) to service_role;

-- A vendor may pause or reopen an unchanged offer, but once a complete offer
-- has been publicly enterable its material terms cannot be repurposed under the
-- same event/vendor identity while a delayed Form 354 request may still exist.
create or replace function public.lock_activated_qr_bingo_offer_material_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    new.prize_title,
    new.prize_description,
    new.prize_approx_value_cad,
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
    old.prize_title,
    old.prize_description,
    old.prize_approx_value_cad,
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
  ) then
    raise exception using
      errcode = '55000',
      message = 'Vendor offer terms cannot change after the offer first opens; create a new promotion version.';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_activated_qr_bingo_offer_material_terms()
  from public, anon, authenticated, service_role;

drop trigger if exists lock_activated_qr_bingo_offer_material_terms
  on public.qr_bingo_raffle_settings;
create trigger lock_activated_qr_bingo_offer_material_terms
before update on public.qr_bingo_raffle_settings
for each row execute function public.lock_activated_qr_bingo_offer_material_terms();

-- Keep the original first-entry lock, but exclude only the tightly marked QA
-- entry above.  Every unarchived historical or current entrant still freezes
-- the offer exactly as before.
create or replace function public.lock_entered_qr_bingo_material_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    new.prize_title,
    new.prize_description,
    new.prize_approx_value_cad,
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
    old.prize_title,
    old.prize_description,
    old.prize_approx_value_cad,
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
  ) then
    raise exception using
      errcode = '55000',
      message = 'Prize and draw terms cannot change after the first entry; create a new promotion version.';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_entered_qr_bingo_material_terms()
  from public, anon, authenticated, service_role;

-- A new revision may change emergency availability and verified-notice email
-- controls.  Once an offer has opened or a real entry exists, the material
-- event/rules/schedule fields for that same event are immutable.
create or replace function public.gate_activated_qr_bingo_event_material_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_config public.qr_bingo_event_configs%rowtype;
  event_activated boolean := false;
begin
  if not new.published then
    return new;
  end if;

  select config.*
    into previous_config
    from public.qr_bingo_event_configs config
   where config.id is distinct from new.id
     and config.event_key = new.event_key
   order by config.revision desc
   limit 1;

  if previous_config.id is null or previous_config.event_key is distinct from new.event_key then
    return new;
  end if;

  event_activated := exists (
    select 1
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = previous_config.event_key
       and version.offer_enterable
       and not version.activation_excluded_as_legacy_qa
  ) or exists (
    select 1
      from public.qr_bingo_raffle_entries entry
     where entry.event_key = previous_config.event_key
       and not exists (
         select 1
           from public.qr_bingo_legacy_qa_archives archive
          where archive.entry_id = entry.id
       )
  );

  if event_activated and row(
    new.event_name,
    new.vendor_tag_id,
    new.history_starts_at,
    new.rules_version,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_opens_at,
    new.draw_at
  ) is distinct from row(
    previous_config.event_name,
    previous_config.vendor_tag_id,
    previous_config.history_starts_at,
    previous_config.rules_version,
    previous_config.official_rules_url,
    previous_config.alternate_free_entry_url,
    previous_config.eligibility_region,
    previous_config.entry_closes_at,
    previous_config.draw_opens_at,
    previous_config.draw_at
  ) then
    raise exception using
      errcode = '55000',
      message = 'Material QR Bingo event terms cannot change after an offer opens or a real entry exists; publish a new event instead.';
  end if;

  return new;
end;
$$;

revoke all on function public.gate_activated_qr_bingo_event_material_publish()
  from public, anon, authenticated, service_role;

drop trigger if exists gate_activated_qr_bingo_event_material_publish
  on public.qr_bingo_event_configs;
create trigger gate_activated_qr_bingo_event_material_publish
before insert on public.qr_bingo_event_configs
for each row execute function public.gate_activated_qr_bingo_event_material_publish();

alter table public.qr_bingo_raffle_entries
  add column if not exists vendor_offer_version timestamptz;

create index if not exists qr_bingo_raffle_entries_offer_version_idx
  on public.qr_bingo_raffle_entries
  (event_key, vendor_bingo_id, vendor_offer_version);

alter table public.qr_bingo_raffle_entries
  drop constraint if exists qr_bingo_raffle_entries_offer_version_fk;
alter table public.qr_bingo_raffle_entries
  add constraint qr_bingo_raffle_entries_offer_version_fk
  foreign key (event_key, vendor_bingo_id, vendor_offer_version)
  references public.qr_bingo_vendor_offer_versions
    (event_key, vendor_bingo_id, vendor_offer_version)
  not valid;

-- Do not retroactively attach historical entries to a newly captured offer.
-- Older rows remain truthful legacy evidence with a null offer version. Every
-- future or explicitly re-consented entry must bind to the exact immutable
-- offer that the participant reviewed.

alter table public.qr_bingo_raffle_entries
  validate constraint qr_bingo_raffle_entries_offer_version_fk;

-- Vendor entries validate against their immutable accepted offer. Settings
-- continue to require the currently published rules.
-- This permits delayed Form 354 reconciliation without rewriting the terms
-- that were actually shown at submission.
create or replace function public.enforce_qr_bingo_current_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicable_rules_version text;
begin
  if tg_table_name = 'qr_bingo_raffle_entries'
    and new.vendor_offer_version is not null
  then
    select version.rules_version
      into applicable_rules_version
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = new.event_key
       and version.vendor_bingo_id = new.vendor_bingo_id
       and version.vendor_offer_version = new.vendor_offer_version
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

create or replace function public.enforce_qr_bingo_entry_offer_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer public.qr_bingo_vendor_offer_versions%rowtype;
  latest_at_submission timestamptz;
  current_settings_version timestamptz;
  current_settings_enabled boolean;
  current_vendor_draws_enabled boolean;
begin
  if tg_op = 'UPDATE'
    and exists (
      select 1
        from public.qr_bingo_legacy_qa_archives archive
       where archive.entry_id = old.id
    )
    and new is distinct from old
  then
    raise exception using
      errcode = '55000',
      message = 'Archived QR Bingo legacy QA entries are immutable.';
  end if;

  -- Existing untouched legacy rows may remain null.  Every new entry and every
  -- material re-consent/update must carry a valid immutable offer version.
  if tg_op = 'UPDATE'
    and new.vendor_offer_version is null
    and old.vendor_offer_version is null
    and row(
      new.event_key,
      new.vendor_bingo_id,
      new.vendor_bd_user_id,
      new.vendor_name,
      new.prize_title,
      new.prize_description,
      new.prize_approx_value_cad,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_at,
      new.odds_basis,
      new.no_purchase_required,
      new.skill_testing_question_required,
      new.official_rules_url,
      new.alternate_free_entry_url,
      new.consent_version,
      new.promotion_disclosure_text
    ) is not distinct from row(
      old.event_key,
      old.vendor_bingo_id,
      old.vendor_bd_user_id,
      old.vendor_name,
      old.prize_title,
      old.prize_description,
      old.prize_approx_value_cad,
      old.eligibility_region,
      old.entry_closes_at,
      old.draw_at,
      old.odds_basis,
      old.no_purchase_required,
      old.skill_testing_question_required,
      old.official_rules_url,
      old.alternate_free_entry_url,
      old.consent_version,
      old.promotion_disclosure_text
    )
  then
    return new;
  end if;

  if new.vendor_offer_version is null then
    raise exception using errcode = '23514', message = 'stale_vendor_offer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qr_bingo_event_config_publish', 0)
  );

  select version.*
    into offer
    from public.qr_bingo_vendor_offer_versions version
   where version.event_key = new.event_key
     and version.vendor_bingo_id = new.vendor_bingo_id
     and version.vendor_offer_version = new.vendor_offer_version;

  if offer.vendor_offer_version is null
    or not offer.offer_enterable
    or offer.activation_excluded_as_legacy_qa
  then
    raise exception using errcode = '23514', message = 'stale_vendor_offer';
  end if;

  if row(
    new.vendor_bd_user_id,
    new.vendor_name,
    new.prize_title,
    new.prize_description,
    new.prize_approx_value_cad,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_at,
    new.odds_basis,
    new.no_purchase_required,
    new.skill_testing_question_required,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.consent_version,
    new.administrator_name,
    new.co_sponsor_name,
    new.prize_provider_name,
    new.apple_non_sponsor_acknowledged,
    new.promotion_disclosure_text,
    new.promotion_responsibility_version
  ) is distinct from row(
    offer.vendor_bd_user_id,
    offer.vendor_name,
    offer.prize_title,
    offer.prize_description,
    offer.prize_approx_value_cad,
    offer.eligibility_region,
    offer.entry_closes_at,
    offer.draw_at,
    offer.odds_basis,
    offer.no_purchase_required,
    offer.skill_testing_question_required,
    offer.official_rules_url,
    offer.alternate_free_entry_url,
    offer.rules_version,
    offer.administrator_name,
    offer.co_sponsor_name,
    offer.prize_provider_name,
    true,
    offer.participant_responsibility_disclosure_text,
    offer.vendor_responsibility_version
  ) then
    raise exception using errcode = '23514', message = 'stale_vendor_offer';
  end if;

  if new.entry_method = 'alternate_free_entry' then
    if new.source_submitted_at is null then
      raise exception using errcode = '23514', message = 'stale_vendor_offer';
    end if;
    select max(version.vendor_offer_version)
      into latest_at_submission
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = new.event_key
       and version.vendor_bingo_id = new.vendor_bingo_id
       and version.vendor_offer_version <= new.source_submitted_at;
    if latest_at_submission is distinct from new.vendor_offer_version
      or new.source_submitted_at < offer.history_starts_at
      or new.source_submitted_at >= offer.entry_closes_at
    then
      raise exception using errcode = '23514', message = 'stale_vendor_offer';
    end if;
  else
    select settings.updated_at, settings.enabled
      into current_settings_version, current_settings_enabled
      from public.qr_bingo_raffle_settings settings
     where settings.event_key = new.event_key
       and settings.vendor_bingo_id = new.vendor_bingo_id
     for share;
    select config.vendor_draws_enabled
      into current_vendor_draws_enabled
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
     for share;
    if current_settings_version is distinct from new.vendor_offer_version
      or current_settings_enabled is distinct from true
      or current_vendor_draws_enabled is distinct from true
      or clock_timestamp() >= offer.entry_closes_at
    then
      raise exception using errcode = '23514', message = 'stale_vendor_offer';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_qr_bingo_entry_offer_version()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_qr_bingo_entry_offer_version
  on public.qr_bingo_raffle_entries;
create trigger enforce_qr_bingo_entry_offer_version
before insert or update on public.qr_bingo_raffle_entries
for each row execute function public.enforce_qr_bingo_entry_offer_version();

-- Remove the pre-version reconciliation route so service-role callers cannot
-- bypass the immutable offer supplied by Form 354.
drop function if exists public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, text, text, timestamptz, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean, boolean, text
);
drop function if exists public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, text
);

create or replace function public.reconcile_qr_bingo_alternate_free_entry(
  p_event_key text,
  p_expected_revision bigint,
  p_submitted_event_revision bigint,
  p_vendor_bingo_id text,
  p_form_inquiry_id text,
  p_form_submitted_at timestamptz,
  p_submitted_rules_version text,
  p_vendor_offer_version timestamptz,
  p_participant_responsibility_disclosure text,
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
  submitted_config public.qr_bingo_event_configs%rowtype;
  offer public.qr_bingo_vendor_offer_versions%rowtype;
  created_entry public.qr_bingo_raffle_entries%rowtype;
  normalized_event_key text := btrim(coalesce(p_event_key, ''));
  normalized_vendor_id text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_inquiry_id text := btrim(coalesce(p_form_inquiry_id, ''));
  normalized_submitted_rules_version text := btrim(coalesce(p_submitted_rules_version, ''));
  submitted_participant_disclosure text := coalesce(p_participant_responsibility_disclosure, '');
  normalized_name text := regexp_replace(btrim(coalesce(p_couple_name, '')), '[ ]+', ' ', 'g');
  normalized_email text := lower(btrim(coalesce(p_couple_email, '')));
  normalized_phone text := btrim(coalesce(p_couple_phone, ''));
  normalized_wedding_date text := btrim(coalesce(p_couple_wedding_date, ''));
  normalized_actor text := btrim(coalesce(p_actor, ''));
  identity_hash text;
  canonical_source_reference text;
  responsibility_disclosure text;
  consent_snapshot text;
  latest_offer_at_submission timestamptz;
  effective_revision_at_submission bigint;
  reconciled_at_value timestamptz := clock_timestamp();
  submitted_at_value timestamptz := p_form_submitted_at;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if p_vendor_offer_version is null
    or submitted_participant_disclosure = ''
    or length(submitted_participant_disclosure) > 2000
    or submitted_participant_disclosure ~ '[[:cntrl:]]'
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_vendor_offer',
      'error', 'The vendor offer changed or is missing. Reload the original Form 354 offer details.'
    );
  end if;

  if normalized_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event_key) > 100
    or p_expected_revision is null
    or p_expected_revision < 1
    or p_submitted_event_revision is null
    or p_submitted_event_revision < 1
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

  select config.*
    into submitted_config
    from public.qr_bingo_event_configs config
   where config.event_key = normalized_event_key
     and config.revision = p_submitted_event_revision;

  select max(config.revision)
    into effective_revision_at_submission
    from public.qr_bingo_event_configs config
   where config.created_at <= submitted_at_value;

  if submitted_config.id is null
    or submitted_config.rules_version is distinct from normalized_submitted_rules_version
    or not submitted_config.vendor_draws_enabled
    or submitted_config.created_at > submitted_at_value
    or effective_revision_at_submission is distinct from submitted_config.revision
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_form_rules',
      'error', 'The inquiry does not identify the event revision and rules shown at submission.'
    );
  end if;

  select version.*
    into offer
    from public.qr_bingo_vendor_offer_versions version
   where version.event_key = normalized_event_key
     and version.vendor_bingo_id = normalized_vendor_id
     and version.vendor_offer_version = p_vendor_offer_version;

  select max(version.vendor_offer_version)
    into latest_offer_at_submission
    from public.qr_bingo_vendor_offer_versions version
   where version.event_key = normalized_event_key
     and version.vendor_bingo_id = normalized_vendor_id
     and version.vendor_offer_version <= submitted_at_value;

  if offer.vendor_offer_version is null
    or not offer.offer_enterable
    or offer.activation_excluded_as_legacy_qa
    or latest_offer_at_submission is distinct from offer.vendor_offer_version
    or offer.rules_version is distinct from normalized_submitted_rules_version
    or submitted_participant_disclosure is distinct from offer.participant_responsibility_disclosure_text
    or submitted_at_value < offer.history_starts_at
    or submitted_at_value >= offer.entry_closes_at
    or row(
      submitted_config.event_name,
      submitted_config.vendor_tag_id,
      submitted_config.history_starts_at,
      submitted_config.rules_version,
      submitted_config.official_rules_url,
      submitted_config.alternate_free_entry_url,
      submitted_config.eligibility_region,
      submitted_config.entry_closes_at,
      submitted_config.draw_opens_at,
      submitted_config.draw_at
    ) is distinct from row(
      offer.event_name,
      offer.vendor_tag_id,
      offer.history_starts_at,
      offer.rules_version,
      offer.official_rules_url,
      offer.alternate_free_entry_url,
      offer.eligibility_region,
      offer.entry_closes_at,
      offer.draw_opens_at,
      offer.draw_at
    )
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_vendor_offer',
      'error', 'The vendor offer does not match the immutable terms shown when this Form 354 inquiry was submitted.'
    );
  end if;

  identity_hash := public.compute_qr_bingo_entrant_identity_hash(normalized_email);
  canonical_source_reference := 'bd-form-354:' || normalized_inquiry_id;

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

  responsibility_disclosure := offer.participant_responsibility_disclosure_text;
  consent_snapshot :=
    'I submitted Brilliant Directories Form 354 and reviewed official rules version '
    || offer.rules_version
    || '. I authorize Wedding Win Inc. to process my entry to administer it, reconcile duplicates and prevent abuse, select and contact a potential winner, support vendor verification and prize fulfillment, and maintain dispute and legal records; contact information may be shared with '
    || offer.vendor_name
    || ' only if I am selected as a potential winner and not for marketing. '
    || responsibility_disclosure;

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
      promotion_responsibility_version,
      vendor_offer_version
    ) values (
      offer.event_key,
      offer.vendor_bingo_id,
      offer.vendor_bd_user_id,
      offer.vendor_name,
      'alternate-free-entry:' || gen_random_uuid()::text,
      normalized_name,
      normalized_email,
      normalized_phone,
      normalized_wedding_date,
      true,
      'selected_potential_winner_only',
      consent_snapshot,
      offer.rules_version,
      submitted_at_value,
      offer.prize_title,
      offer.prize_description,
      offer.official_rules_url,
      submitted_at_value,
      offer.administrator_name,
      offer.co_sponsor_name,
      offer.prize_provider_name,
      true,
      offer.prize_approx_value_cad,
      offer.eligibility_region,
      offer.entry_closes_at,
      offer.draw_at,
      offer.odds_basis,
      offer.no_purchase_required,
      offer.skill_testing_question_required,
      offer.alternate_free_entry_url,
      true,
      true,
      true,
      submitted_at_value,
      'The Form 354 participant confirmed age of majority, eligible residency, and no exclusion under the official rules shown at submission.',
      'alternate_free_entry',
      canonical_source_reference,
      354,
      submitted_at_value,
      reconciled_at_value,
      normalized_actor,
      true,
      responsibility_disclosure,
      submitted_at_value,
      offer.rules_version,
      offer.vendor_offer_version
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
    when check_violation then
      if sqlerrm = 'stale_vendor_offer' then
        return jsonb_build_object(
          'ok', false,
          'code', 'stale_vendor_offer',
          'error', 'The vendor offer changed before reconciliation. Reload and verify the immutable submission details.'
        );
      end if;
      raise;
  end;

  return jsonb_build_object(
    'ok', true,
    'entry_reference', created_entry.id,
    'event_key', created_entry.event_key,
    'vendor_bingo_id', created_entry.vendor_bingo_id,
    'vendor_offer_version', created_entry.vendor_offer_version,
    'entry_method', created_entry.entry_method,
    'source_reference', created_entry.source_reference,
    'created_at', created_entry.created_at,
    'scan_progress_changed', false
  );
end;
$$;

revoke all on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, text
) to service_role;

-- Vendor selection may occur only after an operator closes the Form 354 queue
-- for the exact event revision. Declarations are append-only; a later successful
-- reconciliation automatically makes the latest declaration stale until the
-- queue is reviewed and declared complete again.
create table if not exists public.qr_bingo_alternate_entry_reconciliation_closures (
  id uuid primary key default gen_random_uuid(),
  event_config_id uuid not null
    references public.qr_bingo_event_configs(id) on delete restrict,
  event_key text not null,
  event_revision bigint not null,
  entry_closes_at timestamptz not null,
  source_form_id integer not null default 354,
  all_timely_submissions_reviewed boolean not null,
  attestation_text text not null,
  attestation_version text not null,
  declared_at timestamptz not null default clock_timestamp(),
  declared_by text not null,
  constraint qr_bingo_alternate_entry_closure_revision_positive
    check (event_revision > 0),
  constraint qr_bingo_alternate_entry_closure_form_354
    check (source_form_id = 354),
  constraint qr_bingo_alternate_entry_closure_attested
    check (
      all_timely_submissions_reviewed
      and attestation_version = '2026-08-30'
      and attestation_text = 'I attest that every Brilliant Directories Form 354 submission received by the entry close for this event revision was reviewed, and each eligible timely request was reconciled or documented as rejected.'
      and btrim(declared_by) <> ''
      and length(declared_by) <= 200
      and declared_by !~ '[<>[:cntrl:]]'
    )
);

create index if not exists qr_bingo_alternate_entry_closure_latest_idx
  on public.qr_bingo_alternate_entry_reconciliation_closures
  (event_key, event_revision, declared_at desc);

alter table public.qr_bingo_alternate_entry_reconciliation_closures
  enable row level security;
revoke all on table public.qr_bingo_alternate_entry_reconciliation_closures
  from public, anon, authenticated, service_role;
grant select on table public.qr_bingo_alternate_entry_reconciliation_closures
  to service_role;

create or replace function public.reject_qr_bingo_alternate_entry_closure_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'QR Bingo alternate-entry reconciliation declarations are append-only.';
end;
$$;

revoke all on function public.reject_qr_bingo_alternate_entry_closure_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_qr_bingo_alternate_entry_closure_mutation
  on public.qr_bingo_alternate_entry_reconciliation_closures;
create trigger reject_qr_bingo_alternate_entry_closure_mutation
before update or delete on public.qr_bingo_alternate_entry_reconciliation_closures
for each row execute function public.reject_qr_bingo_alternate_entry_closure_mutation();

create or replace function public.declare_qr_bingo_alternate_entry_reconciliation_complete(
  p_event_key text,
  p_expected_revision bigint,
  p_all_timely_submissions_reviewed boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_config public.qr_bingo_event_configs%rowtype;
  declaration public.qr_bingo_alternate_entry_reconciliation_closures%rowtype;
  normalized_actor text := btrim(coalesce(p_actor, ''));
  attestation constant text := 'I attest that every Brilliant Directories Form 354 submission received by the entry close for this event revision was reviewed, and each eligible timely request was reconciled or documented as rejected.';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_all_timely_submissions_reviewed is distinct from true
    or length(normalized_actor) < 1
    or length(normalized_actor) > 200
    or normalized_actor ~ '[<>[:cntrl:]]'
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'closure_attestation_required',
      'error', 'The operator must explicitly attest that every timely Form 354 submission was reviewed and resolved.'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qr_bingo_event_config_publish', 0)
  );

  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
   for share;

  if current_config.id is null
    or current_config.event_key is distinct from btrim(coalesce(p_event_key, ''))
    or current_config.revision is distinct from p_expected_revision
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_event_config',
      'error', 'The event configuration changed. Reload before declaring reconciliation complete.'
    );
  end if;

  if clock_timestamp() < current_config.entry_closes_at then
    return jsonb_build_object(
      'ok', false,
      'code', 'entry_period_open',
      'error', 'Reconciliation cannot be declared complete until the entry period has closed.'
    );
  end if;

  insert into public.qr_bingo_alternate_entry_reconciliation_closures (
    event_config_id,
    event_key,
    event_revision,
    entry_closes_at,
    all_timely_submissions_reviewed,
    attestation_text,
    attestation_version,
    declared_by
  ) values (
    current_config.id,
    current_config.event_key,
    current_config.revision,
    current_config.entry_closes_at,
    true,
    attestation,
    '2026-08-30',
    normalized_actor
  )
  returning * into declaration;

  return jsonb_build_object(
    'ok', true,
    'event_key', declaration.event_key,
    'event_revision', declaration.event_revision,
    'entry_closes_at', declaration.entry_closes_at,
    'declared_at', declaration.declared_at,
    'declared_by', declaration.declared_by,
    'attestation_version', declaration.attestation_version,
    'all_timely_submissions_reviewed', declaration.all_timely_submissions_reviewed,
    'stale', false,
    'stale_reason', null
  );
end;
$$;

revoke all on function public.declare_qr_bingo_alternate_entry_reconciliation_complete(
  text, bigint, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.declare_qr_bingo_alternate_entry_reconciliation_complete(
  text, bigint, boolean, text
) to service_role;

create or replace function public.require_qr_bingo_alternate_entry_closure_for_draw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_config public.qr_bingo_event_configs%rowtype;
  latest_declaration public.qr_bingo_alternate_entry_reconciliation_closures%rowtype;
  latest_reconciliation timestamptz;
  active_fixture boolean := false;
begin
  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
     and config.event_key = new.event_key
   for share;

  if current_config.id is null then
    active_fixture := exists (
      select 1
        from public.app_review_raffle_fixtures fixture
       where fixture.event_key = new.event_key
         and fixture.vendor_bingo_id = new.vendor_bingo_id
         and fixture.enabled
         and fixture.expires_at > clock_timestamp()
    ) or exists (
      select 1
        from public.qr_bingo_email_test_fixtures fixture
       where fixture.event_key = new.event_key
         and fixture.vendor_bingo_id = new.vendor_bingo_id
         and fixture.enabled
         and fixture.expires_at > clock_timestamp()
    );
    if active_fixture then
      return new;
    end if;
    raise exception using
      errcode = '55000',
      message = 'alternate_entry_reconciliation_incomplete';
  end if;

  select closure.*
    into latest_declaration
    from public.qr_bingo_alternate_entry_reconciliation_closures closure
   where closure.event_config_id = current_config.id
     and closure.event_key = current_config.event_key
     and closure.event_revision = current_config.revision
     and closure.entry_closes_at = current_config.entry_closes_at
     and closure.all_timely_submissions_reviewed
     and closure.declared_at >= current_config.entry_closes_at
   order by closure.declared_at desc
   limit 1;

  select max(entry.reconciled_at)
    into latest_reconciliation
    from public.qr_bingo_raffle_entries entry
   where entry.event_key = current_config.event_key
     and entry.entry_method = 'alternate_free_entry'
     and not exists (
       select 1
         from public.qr_bingo_legacy_qa_archives archive
        where archive.entry_id = entry.id
     );

  if latest_declaration.id is null
    or latest_reconciliation > latest_declaration.declared_at
  then
    raise exception using
      errcode = '55000',
      message = 'alternate_entry_reconciliation_incomplete';
  end if;

  return new;
end;
$$;

revoke all on function public.require_qr_bingo_alternate_entry_closure_for_draw()
  from public, anon, authenticated, service_role;

drop trigger if exists require_qr_bingo_alternate_entry_closure_for_draw
  on public.qr_bingo_raffle_draws;
create trigger require_qr_bingo_alternate_entry_closure_for_draw
before insert on public.qr_bingo_raffle_draws
for each row execute function public.require_qr_bingo_alternate_entry_closure_for_draw();

comment on table public.qr_bingo_vendor_offer_versions is
  'Service-only append-only public-term history. vendor_offer_version is the exact qr_bingo_raffle_settings.updated_at shown with an offer.';
comment on column public.qr_bingo_vendor_offer_versions.offer_enterable is
  'True when the vendor settings and material event terms were complete and accepted. Emergency global availability remains a separate live switch.';
comment on column public.qr_bingo_vendor_offer_versions.activation_excluded_as_legacy_qa is
  'True only for the migration-time settings snapshot tied to an explicitly archived pre-release QA entry. It preserves observed state but cannot activate or accept future entries.';
comment on column public.qr_bingo_raffle_entries.vendor_offer_version is
  'Exact immutable vendor offer settings version accepted by this entry; null is permitted only for untouched legacy history.';
comment on table public.qr_bingo_legacy_qa_archives is
  'Tightly guarded append-only markers for preserved pre-release QA chains excluded from active-promotion gates.';
comment on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, text
) is
  'Service-only Form 354 reconciliation bound to the original event revision and immutable vendor offer; never creates scan progress.';
