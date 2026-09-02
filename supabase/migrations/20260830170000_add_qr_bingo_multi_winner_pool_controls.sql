-- Add vendor-disclosed multi-winner limits, an auditable selection pool, an
-- explicit prior-winner policy, and multi-couple App Review fixtures. Existing
-- offers retain one winner; no entrant or historical draw is deleted.

create extension if not exists pgcrypto with schema extensions;

alter table public.qr_bingo_raffle_settings
  add column if not exists max_winners smallint not null default 1,
  add column if not exists exclude_previous_winners boolean not null default true;
alter table public.qr_bingo_vendor_offer_versions
  add column if not exists max_winners smallint not null default 1,
  add column if not exists exclude_previous_winners boolean not null default true;
alter table public.qr_bingo_raffle_entries
  add column if not exists max_winners smallint not null default 1,
  add column if not exists exclude_previous_winners boolean not null default true;
alter table public.qr_bingo_raffle_draws
  add column if not exists max_winners smallint not null default 1,
  add column if not exists exclude_previous_winners boolean not null default true;

alter table public.qr_bingo_raffle_settings
  drop constraint if exists qr_bingo_raffle_settings_max_winners_valid;
alter table public.qr_bingo_raffle_settings
  add constraint qr_bingo_raffle_settings_max_winners_valid
  check (max_winners between 1 and 3);
alter table public.qr_bingo_vendor_offer_versions
  drop constraint if exists qr_bingo_vendor_offer_versions_max_winners_valid;
alter table public.qr_bingo_vendor_offer_versions
  add constraint qr_bingo_vendor_offer_versions_max_winners_valid
  check (max_winners between 1 and 3);
alter table public.qr_bingo_raffle_entries
  drop constraint if exists qr_bingo_raffle_entries_max_winners_valid;
alter table public.qr_bingo_raffle_entries
  add constraint qr_bingo_raffle_entries_max_winners_valid
  check (max_winners between 1 and 3);
alter table public.qr_bingo_raffle_draws
  drop constraint if exists qr_bingo_raffle_draws_max_winners_valid;
alter table public.qr_bingo_raffle_draws
  add constraint qr_bingo_raffle_draws_max_winners_valid
  check (max_winners between 1 and 3);

comment on column public.qr_bingo_raffle_settings.max_winners is
  'Vendor-disclosed number of verified winners for this promotion, locked before an offer opens or an entrant accepts it.';
comment on column public.qr_bingo_raffle_settings.exclude_previous_winners is
  'When true, a couple already verified as a winner in this exact vendor promotion is excluded from later potential-winner selection.';

create table if not exists public.app_review_raffle_fixture_participants (
  fixture_id uuid not null
    references public.app_review_raffle_fixtures(id) on delete cascade,
  couple_bd_user_id text not null unique
    check (couple_bd_user_id ~ '^[0-9]+$'),
  created_at timestamptz not null default now(),
  primary key (fixture_id, couple_bd_user_id)
);

alter table public.app_review_raffle_fixture_participants enable row level security;
revoke all on table public.app_review_raffle_fixture_participants
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.app_review_raffle_fixture_participants to service_role;

comment on table public.app_review_raffle_fixture_participants is
  'Service-only allowlist of additional fictional couples assigned to an exact isolated App Review raffle fixture.';

create table if not exists public.qr_bingo_raffle_entry_selection_state (
  entry_id uuid primary key
    references public.qr_bingo_raffle_entries(id) on delete cascade,
  event_key text not null,
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  included boolean not null default true,
  exclusion_reason text not null default ''
    check (length(exclusion_reason) <= 500),
  updated_by_bd_user_id text not null,
  update_source text not null check (update_source in ('app', 'website')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_bingo_raffle_entry_selection_state_reason_valid check (
    (included and exclusion_reason = '')
    or (not included and btrim(exclusion_reason) <> '')
  ),
  constraint qr_bingo_raffle_entry_selection_state_scope_unique
    unique (event_key, vendor_bingo_id, vendor_bd_user_id, entry_id)
);

create index if not exists qr_bingo_raffle_entry_selection_state_vendor_idx
  on public.qr_bingo_raffle_entry_selection_state
  (event_key, vendor_bingo_id, vendor_bd_user_id, included);

alter table public.qr_bingo_raffle_entry_selection_state enable row level security;
revoke all on table public.qr_bingo_raffle_entry_selection_state
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.qr_bingo_raffle_entry_selection_state to service_role;

create table if not exists public.qr_bingo_raffle_entry_selection_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  entry_id uuid,
  event_key text not null,
  vendor_bingo_id text not null,
  vendor_bd_user_id text not null,
  previous_included boolean not null,
  included boolean not null,
  exclusion_reason text not null default ''
    check (length(exclusion_reason) <= 500),
  actor_bd_user_id text not null,
  update_source text not null check (update_source in ('app', 'website')),
  changed_at timestamptz not null default now(),
  constraint qr_bingo_raffle_entry_selection_audit_reason_valid check (
    (included and exclusion_reason = '')
    or (not included and btrim(exclusion_reason) <> '')
  )
);

create index if not exists qr_bingo_raffle_entry_selection_audit_vendor_idx
  on public.qr_bingo_raffle_entry_selection_audit
  (event_key, vendor_bingo_id, changed_at desc);

alter table public.qr_bingo_raffle_entry_selection_audit enable row level security;
revoke all on table public.qr_bingo_raffle_entry_selection_audit
  from public, anon, authenticated, service_role;
grant select, insert on table public.qr_bingo_raffle_entry_selection_audit
  to service_role;

create or replace function public.reject_qr_bingo_selection_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'QR Bingo entrant selection audit is append-only.';
end;
$$;

revoke all on function public.reject_qr_bingo_selection_audit_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists reject_qr_bingo_selection_audit_mutation
  on public.qr_bingo_raffle_entry_selection_audit;
create trigger reject_qr_bingo_selection_audit_mutation
before update or delete on public.qr_bingo_raffle_entry_selection_audit
for each row execute function public.reject_qr_bingo_selection_audit_mutation();

create or replace function public.set_qr_bingo_raffle_entry_selection_state(
  p_entry_id uuid,
  p_event_key text,
  p_vendor_bingo_id text,
  p_vendor_bd_user_id text,
  p_included boolean,
  p_exclusion_reason text,
  p_actor_bd_user_id text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
       and draw.selection_status = 'disqualified'
  ) then
    raise exception using errcode = '55000', message = 'A preserved disqualification record cannot be removed or restored.';
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
$$;

revoke all on function public.set_qr_bingo_raffle_entry_selection_state(
  uuid, text, text, text, boolean, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.set_qr_bingo_raffle_entry_selection_state(
  uuid, text, text, text, boolean, text, text, text
) to service_role;

-- Extend the existing optimistic-lock writer with only the two new material
-- fields. The authenticated wrapper remains unchanged and calls this overload.
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
  if candidate_settings.max_winners not between 1 and 3 then
    raise exception using errcode = '22023', message = 'max_winners must be from one through three.';
  end if;
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
$$;

revoke all on function public.compare_and_update_qr_bingo_vendor_settings(
  text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.compare_and_update_qr_bingo_vendor_settings(
  text, text, timestamptz, jsonb
) to service_role;

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
    new.participant_responsibility_disclosure_text,
    new.max_winners,
    new.exclude_previous_winners
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
    old.participant_responsibility_disclosure_text,
    old.max_winners,
    old.exclude_previous_winners
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
    new.participant_responsibility_disclosure_text,
    new.max_winners,
    new.exclude_previous_winners
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
    old.participant_responsibility_disclosure_text,
    old.max_winners,
    old.exclude_previous_winners
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

-- Snapshot the disclosed winner count and prior-winner policy alongside every
-- other immutable offer term. Exact active isolated fixtures retain their
-- existing server-controlled schedule exception.
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
$$;

revoke all on function public.capture_qr_bingo_vendor_offer_version()
  from public, anon, authenticated, service_role;

create or replace function public.stamp_qr_bingo_entry_selection_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer public.qr_bingo_vendor_offer_versions%rowtype;
begin
  if new.vendor_offer_version is null then
    return new;
  end if;
  select * into offer
    from public.qr_bingo_vendor_offer_versions version
   where version.event_key = new.event_key
     and version.vendor_bingo_id = new.vendor_bingo_id
     and version.vendor_offer_version = new.vendor_offer_version;
  if offer.vendor_offer_version is null then
    raise exception using errcode = '23514', message = 'stale_vendor_offer: the immutable offer version was not found.';
  end if;
  new.max_winners := offer.max_winners;
  new.exclude_previous_winners := offer.exclude_previous_winners;
  return new;
end;
$$;

revoke all on function public.stamp_qr_bingo_entry_selection_terms()
  from public, anon, authenticated, service_role;

drop trigger if exists stamp_qr_bingo_entry_selection_terms
  on public.qr_bingo_raffle_entries;
create trigger stamp_qr_bingo_entry_selection_terms
before insert or update of event_key, vendor_bingo_id, vendor_offer_version,
  max_winners, exclude_previous_winners
on public.qr_bingo_raffle_entries
for each row execute function public.stamp_qr_bingo_entry_selection_terms();

update public.qr_bingo_raffle_entries entry
   set max_winners = version.max_winners,
       exclude_previous_winners = version.exclude_previous_winners
  from public.qr_bingo_vendor_offer_versions version
 where version.event_key = entry.event_key
   and version.vendor_bingo_id = entry.vendor_bingo_id
   and version.vendor_offer_version = entry.vendor_offer_version
   and row(entry.max_winners, entry.exclude_previous_winners)
       is distinct from row(version.max_winners, version.exclude_previous_winners);

update public.qr_bingo_raffle_draws draw
   set max_winners = entry.max_winners,
       exclude_previous_winners = entry.exclude_previous_winners
  from public.qr_bingo_raffle_entries entry
 where entry.id = draw.entry_id
   and row(draw.max_winners, draw.exclude_previous_winners)
       is distinct from row(entry.max_winners, entry.exclude_previous_winners);

drop index if exists public.qr_bingo_raffle_draws_one_active_selection_idx;
drop index if exists public.qr_bingo_raffle_draws_one_potential_selection_idx;
create unique index if not exists qr_bingo_raffle_draws_one_potential_selection_idx
  on public.qr_bingo_raffle_draws
  (event_key, vendor_bingo_id, vendor_bd_user_id)
  where selection_status = 'potential';

create or replace function public.enforce_qr_bingo_raffle_draw_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
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
  new.max_winners := selected_entry.max_winners;
  new.exclude_previous_winners := selected_entry.exclude_previous_winners;

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
         and prior.selection_status in ('potential', 'disqualified')
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
    if existing_active_selection_count >= new.max_winners then
      raise exception using errcode = '23514', message = 'The disclosed winner limit for this vendor promotion has been reached.';
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
$$;

drop trigger if exists qr_bingo_raffle_draw_limit
  on public.qr_bingo_raffle_draws;
create trigger qr_bingo_raffle_draw_limit
before insert or update of event_key, vendor_bingo_id, vendor_bd_user_id,
  entry_id, couple_bd_user_id, selection_status, max_winners,
  exclude_previous_winners
on public.qr_bingo_raffle_draws
for each row execute function public.enforce_qr_bingo_raffle_draw_limit();

comment on function public.enforce_qr_bingo_raffle_draw_limit() is
  'Serializes vendor-promotion selection, permits one pending review, caps potential plus verified winners at the disclosed one-to-three limit, and rejects excluded or repeated entrants.';

-- Every entrant write takes the same exact promotion lock as selection and
-- vendor pool changes. This makes the SQL candidate set stable for the whole
-- atomic selection transaction, including PostgREST opt-ins and account purge.
create or replace function public.lock_qr_bingo_raffle_entry_promotion()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  locked_event text;
  locked_vendor text;
begin
  locked_event := case
    when tg_op in ('UPDATE', 'DELETE') then old.event_key
    else new.event_key
  end;
  locked_vendor := case
    when tg_op in ('UPDATE', 'DELETE') then old.vendor_bingo_id
    else new.vendor_bingo_id
  end;
  perform pg_advisory_xact_lock(
    hashtextextended(locked_event || ':' || locked_vendor, 0)
  );

  -- Entrants are immutable members of one promotion. Reject a move only after
  -- taking the old promotion lock so selection can never race a key change.
  if tg_op = 'UPDATE' and row(
    new.event_key,
    new.vendor_bingo_id,
    new.vendor_bd_user_id
  ) is distinct from row(
    old.event_key,
    old.vendor_bingo_id,
    old.vendor_bd_user_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo entrant promotion identity cannot change.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.lock_qr_bingo_raffle_entry_promotion()
  from public, anon, authenticated, service_role;

-- Drop the earlier name as well so a rerun cannot leave two lock triggers.
-- PostgreSQL orders same-kind triggers by name. The a0 prefix intentionally
-- acquires the promotion lock before enforce_qr_bingo_entry_offer_version
-- acquires the global publish lock, matching reconciliation's lock order.
drop trigger if exists lock_qr_bingo_raffle_entry_promotion
  on public.qr_bingo_raffle_entries;
drop trigger if exists a0_lock_qr_bingo_raffle_entry_promotion
  on public.qr_bingo_raffle_entries;
create trigger a0_lock_qr_bingo_raffle_entry_promotion
before insert or update or delete on public.qr_bingo_raffle_entries
for each row execute function public.lock_qr_bingo_raffle_entry_promotion();

drop trigger if exists a0_lock_qr_bingo_raffle_selection_state_promotion
  on public.qr_bingo_raffle_entry_selection_state;
create trigger a0_lock_qr_bingo_raffle_selection_state_promotion
before insert or update or delete
on public.qr_bingo_raffle_entry_selection_state
for each row execute function public.lock_qr_bingo_raffle_entry_promotion();

-- The current Form 354 reconciliation implementation is retained intact
-- behind a promotion-lock wrapper. Its old ACL is explicitly removed after
-- rename so no API role can bypass the wrapper.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.reconcile_qr_bingo_alternate_free_entry_contact_proof_unlocked_v1(text,bigint,bigint,text,text,timestamp with time zone,text,timestamp with time zone,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)'
  ) is null then
    if pg_catalog.to_regprocedure(
      'public.reconcile_qr_bingo_alternate_free_entry(text,bigint,bigint,text,text,timestamp with time zone,text,timestamp with time zone,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)'
    ) is null then
      raise exception
        'The current contact-proof Form 354 reconciliation function was not found.';
    end if;
    alter function public.reconcile_qr_bingo_alternate_free_entry(
      text, bigint, bigint, text, text, timestamptz, text, timestamptz,
      text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
      boolean, boolean, text
    ) rename to reconcile_qr_bingo_alternate_free_entry_contact_proof_unlocked_v1;
  end if;
end;
$migration$;

revoke all on function public.reconcile_qr_bingo_alternate_free_entry_contact_proof_unlocked_v1(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text
) from public, anon, authenticated, service_role;

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
  p_contact_share_consent_confirmed boolean default false,
  p_apple_non_sponsor_acknowledged boolean default false,
  p_actor text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  -- Event-wide closure freshness is shared by every vendor. Selection takes a
  -- shared form of this lock; reconciliation takes it exclusively, then takes
  -- the exact vendor-promotion lock in the same order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'qr-bingo-alternate-entry-closure:' || normalized_event,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_event || ':' || normalized_vendor,
      0
    )
  );

  return public.reconcile_qr_bingo_alternate_free_entry_contact_proof_unlocked_v1(
    p_event_key,
    p_expected_revision,
    p_submitted_event_revision,
    p_vendor_bingo_id,
    p_form_inquiry_id,
    p_form_submitted_at,
    p_submitted_rules_version,
    p_vendor_offer_version,
    p_participant_responsibility_disclosure,
    p_couple_name,
    p_couple_email,
    p_couple_phone,
    p_couple_wedding_date,
    p_age_of_majority_confirmed,
    p_eligible_residency_confirmed,
    p_not_excluded_confirmed,
    p_rules_acknowledged,
    p_promotion_responsibility_acknowledged,
    p_contact_share_consent_confirmed,
    p_apple_non_sponsor_acknowledged,
    p_actor
  );
end;
$$;

revoke all on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text
) to service_role;

comment on function public.reconcile_qr_bingo_alternate_free_entry(
  text, bigint, bigint, text, text, timestamptz, text, timestamptz,
  text, text, text, text, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, text
) is
  'Service-only Form 354 reconciliation serialized against the exact promotion candidate set and event-wide closure freshness.';

-- Select and insert exactly one potential winner in one database transaction.
-- No candidate rows cross the API boundary and there is no PostgREST row cap.
create or replace function public.select_qr_bingo_potential_winner(
  p_event_key text,
  p_vendor_bingo_id text,
  p_vendor_bd_user_id text,
  p_drawn_by_bd_user_id text,
  p_draw_reason text,
  p_skill_question_prompt text,
  p_skill_question_salt text,
  p_skill_question_answer_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  latest_declaration public.qr_bingo_alternate_entry_reconciliation_closures%rowtype;
  latest_reconciliation timestamptz;
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

  -- Reconciliation is event-wide, so selections hold its shared lock while
  -- checking the latest closure. Exact vendor selection remains independently
  -- serialized by the promotion lock.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'qr-bingo-alternate-entry-closure:' || normalized_event,
      0
    )
  );
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

  if not active_fixture then
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
      return jsonb_build_object(
        'ok', false,
        'code', 'alternate_entry_reconciliation_incomplete',
        'error', 'Potential-winner selection is locked until every timely Form 354 request is reviewed and reconciled.'
      );
    end if;
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

  if active_selection_count >= settings.max_winners then
    return jsonb_build_object(
      'ok', false,
      'code', 'winner_limit_reached',
      'error', 'The disclosed winner limit for this vendor promotion has been reached.',
      'max_winners', settings.max_winners,
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
       and entry.max_winners = settings.max_winners
       and entry.exclude_previous_winners = settings.exclude_previous_winners
       and row(
         entry.vendor_name,
         entry.prize_title,
         entry.prize_description,
         entry.prize_approx_value_cad,
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
            and prior.selection_status in ('potential', 'disqualified')
       )
       and (
         not entry.exclude_previous_winners
         or not exists (
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
    selected_entry.max_winners,
    selected_entry.exclude_previous_winners,
    next_draw_number,
    normalized_reason,
    normalized_actor
  )
  returning * into created_draw;

  return jsonb_build_object(
    'ok', true,
    'draw', to_jsonb(created_draw),
    'eligible_entry_count', selected_entry.eligible_entry_count,
    'max_winners', settings.max_winners,
    'active_winner_count', active_selection_count + 1,
    'remaining_winner_slots', greatest(
      settings.max_winners - active_selection_count - 1,
      0
    )
  );
end;
$$;

revoke all on function public.select_qr_bingo_potential_winner(
  text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.select_qr_bingo_potential_winner(
  text, text, text, text, text, text, text, text
) to service_role;

comment on function public.select_qr_bingo_potential_winner(
  text, text, text, text, text, text, text, text
) is
  'Service-only atomic, uncapped, CSPRNG-uniform potential-winner selection for one exact vendor promotion.';

-- Add multi-couple fixture membership to the current account purge without
-- copying the large, security-sensitive purge implementation. The renamed
-- implementation is private to its security-definer wrapper.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.purge_weddingwin_member_data_without_fixture_participants_v1(text,text,text)'
  ) is null then
    if pg_catalog.to_regprocedure(
      'public.purge_weddingwin_member_data(text,text,text)'
    ) is null then
      raise exception 'The current WeddingWin member purge function was not found.';
    end if;
    alter function public.purge_weddingwin_member_data(text, text, text)
      rename to purge_weddingwin_member_data_without_fixture_participants_v1;
  end if;
end;
$migration$;

revoke all on function public.purge_weddingwin_member_data_without_fixture_participants_v1(
  text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.purge_weddingwin_member_data(
  p_bd_user_id text,
  p_bd_token text default '',
  p_bd_cookie text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_user text := btrim(coalesce(p_bd_user_id, ''));
  participant_count integer := 0;
  email_fixture_scan_count integer := 0;
  email_fixture_settings_count integer := 0;
  email_fixture_count integer := 0;
  email_fixture_event_keys text[] := array[]::text[];
  purge_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if normalized_user = '' then
    raise exception using errcode = '22023', message = 'A Brilliant Directories member id is required.';
  end if;

  -- Capture the isolated email-test events while their fixture identity still
  -- exists. These rows can retain the allowlisted real recipient address and
  -- must not survive deletion of either fixture account.
  select coalesce(array_agg(fixture.event_key), array[]::text[])
    into email_fixture_event_keys
    from public.qr_bingo_email_test_fixtures fixture
   where fixture.couple_bd_user_id = normalized_user
      or fixture.vendor_bd_user_id = normalized_user;

  select count(*)
    into email_fixture_scan_count
    from public.qr_bingo_email_test_fixture_scans scan
    join public.qr_bingo_email_test_fixtures fixture
      on fixture.id = scan.fixture_id
   where fixture.event_key = any(email_fixture_event_keys);

  delete from public.app_review_raffle_fixture_participants participant
   where participant.couple_bd_user_id = normalized_user
      or participant.fixture_id in (
        select fixture.id
          from public.app_review_raffle_fixtures fixture
         where fixture.couple_bd_user_id = normalized_user
            or fixture.vendor_bd_user_id = normalized_user
      );
  get diagnostics participant_count = row_count;

  -- The retained implementation deletes this member's fixture scans and every
  -- scan/fixture owned by a primary fixture couple or vendor before returning.
  purge_result := public.purge_weddingwin_member_data_without_fixture_participants_v1(
    p_bd_user_id,
    p_bd_token,
    p_bd_cookie
  );

  -- The retained purge predates email-test fixtures. It already removes the
  -- deleting member's entries/draws; remove any remaining isolated settings,
  -- then the fixture itself (whose scan rows cascade) so no recipient PII or
  -- runnable orphan test event survives.
  delete from public.qr_bingo_raffle_settings settings
   where settings.event_key = any(email_fixture_event_keys);
  get diagnostics email_fixture_settings_count = row_count;

  delete from public.qr_bingo_email_test_fixtures fixture
   where fixture.event_key = any(email_fixture_event_keys);
  get diagnostics email_fixture_count = row_count;

  return coalesce(purge_result, '{}'::jsonb) || jsonb_build_object(
    'app_review_fixture_participants', participant_count,
    'email_test_fixture_scans', email_fixture_scan_count,
    'email_test_raffle_settings', email_fixture_settings_count,
    'email_test_raffle_fixtures', email_fixture_count
  );
end;
$$;

revoke all on function public.purge_weddingwin_member_data(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_weddingwin_member_data(text, text, text)
  to service_role;
