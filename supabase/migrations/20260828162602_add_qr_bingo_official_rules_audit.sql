-- Snapshot the governing promotion rules and parties at acceptance/draw time.
-- Vendor-specific prizes remain supplied and fulfilled by the vendor, while
-- Wedding Win Inc. administers and co-sponsors the in-app promotion.
alter table if exists public.qr_bingo_raffle_settings
  add column if not exists official_rules_url text not null default 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
  add column if not exists rules_viewed_at timestamptz,
  add column if not exists administrator_name text not null default 'Wedding Win Inc.',
  add column if not exists co_sponsor_name text not null default 'Wedding Win Inc.',
  add column if not exists prize_provider_name text not null default '',
  add column if not exists apple_non_sponsor_acknowledged boolean not null default false,
  add column if not exists prize_approx_value_cad numeric(12,2),
  add column if not exists eligibility_region text not null default 'Ontario, Canada residents who have reached the age of majority',
  add column if not exists entry_closes_at timestamptz not null default '2026-10-18 19:00:00+00',
  add column if not exists draw_at timestamptz not null default '2026-10-18 19:00:00+00',
  add column if not exists odds_basis text not null default 'Odds depend on the number of eligible entries received; each eligible entry has an equal chance.',
  add column if not exists no_purchase_required boolean not null default true,
  add column if not exists skill_testing_question_required boolean not null default true,
  add column if not exists alternate_free_entry_url text not null default '';

alter table if exists public.qr_bingo_raffle_entries
  add column if not exists official_rules_url text not null default 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
  add column if not exists rules_viewed_at timestamptz,
  add column if not exists administrator_name text not null default 'Wedding Win Inc.',
  add column if not exists co_sponsor_name text not null default 'Wedding Win Inc.',
  add column if not exists prize_provider_name text not null default '',
  add column if not exists apple_non_sponsor_acknowledged boolean not null default false,
  add column if not exists prize_approx_value_cad numeric(12,2),
  add column if not exists eligibility_region text not null default 'Ontario, Canada residents who have reached the age of majority',
  add column if not exists entry_closes_at timestamptz not null default '2026-10-18 19:00:00+00',
  add column if not exists draw_at timestamptz not null default '2026-10-18 19:00:00+00',
  add column if not exists odds_basis text not null default 'Odds depend on the number of eligible entries received; each eligible entry has an equal chance.',
  add column if not exists no_purchase_required boolean not null default true,
  add column if not exists skill_testing_question_required boolean not null default true,
  add column if not exists alternate_free_entry_url text not null default '',
  add column if not exists prize_title text not null default '',
  add column if not exists prize_description text not null default '',
  add column if not exists contact_share_scope text not null default 'selected_potential_winner_only',
  add column if not exists age_of_majority_attested boolean not null default false,
  add column if not exists residency_attested boolean not null default false,
  add column if not exists exclusions_attested boolean not null default false,
  add column if not exists eligibility_attested_at timestamptz,
  add column if not exists eligibility_attestation_text text not null default '';

alter table if exists public.qr_bingo_raffle_draws
  add column if not exists official_rules_url text not null default 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
  add column if not exists rules_version text not null default '2026-08-28',
  add column if not exists administrator_name text not null default 'Wedding Win Inc.',
  add column if not exists co_sponsor_name text not null default 'Wedding Win Inc.',
  add column if not exists prize_provider_name text not null default '',
  add column if not exists apple_non_sponsor_disclaimer text not null default 'Apple Inc. is not a sponsor of and is not involved in this promotion.',
  add column if not exists prize_approx_value_cad numeric(12,2),
  add column if not exists eligibility_region text not null default 'Ontario, Canada residents who have reached the age of majority',
  add column if not exists entry_closes_at timestamptz not null default '2026-10-18 19:00:00+00',
  add column if not exists scheduled_draw_at timestamptz not null default '2026-10-18 19:00:00+00',
  add column if not exists odds_basis text not null default 'Odds depend on the number of eligible entries received; each eligible entry has an equal chance.',
  add column if not exists no_purchase_required boolean not null default true,
  add column if not exists skill_testing_question_required boolean not null default true,
  add column if not exists alternate_free_entry_url text not null default '',
  add column if not exists selection_status text not null default 'potential'
    check (selection_status in ('legacy', 'potential', 'verified', 'disqualified')),
  add column if not exists eligibility_verified_at timestamptz,
  add column if not exists skill_question_verified_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text,
  add column if not exists verification_notes text not null default '',
  add column if not exists disqualified_at timestamptz,
  add column if not exists disqualification_reason text not null default '';

-- Every row that existed before this migration predates the current consent,
-- eligibility and skill-testing workflow. Preserve it neutrally as immutable
-- history rather than representing it as a current winner or disqualification.
update public.qr_bingo_raffle_draws
   set selection_status = 'legacy'
 where selection_status = 'potential'
   and eligibility_verified_at is null
   and skill_question_verified_at is null
   and verified_at is null;

-- A grand-prize entry is separate from scan progress. Completing a QR card
-- never silently creates an entry; the couple must review and accept the
-- current official rules after the event has been explicitly enabled.
create table if not exists public.qr_bingo_grand_prize_entries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  couple_bd_user_id text not null,
  couple_name text not null default '',
  couple_email text not null default '',
  couple_phone text not null default '',
  couple_wedding_date text not null default '',
  prize_title text not null,
  prize_description text not null,
  prize_approx_value_cad numeric(12,2) not null check (prize_approx_value_cad > 0),
  eligibility_region text not null,
  entry_closes_at timestamptz not null,
  draw_at timestamptz not null,
  odds_basis text not null,
  no_purchase_required boolean not null default true,
  skill_testing_question_required boolean not null default true,
  alternate_free_entry_url text not null,
  age_of_majority_attested boolean not null,
  residency_attested boolean not null,
  exclusions_attested boolean not null,
  eligibility_attested_at timestamptz not null,
  eligibility_attestation_text text not null,
  official_rules_url text not null,
  rules_version text not null,
  rules_viewed_at timestamptz not null,
  consent_text text not null,
  consented_at timestamptz not null default now(),
  administrator_name text not null default 'Wedding Win Inc.',
  sponsor_name text not null default 'Wedding Win Inc.',
  prize_provider_name text not null,
  apple_non_sponsor_acknowledged boolean not null default true,
  created_at timestamptz not null default now(),
  constraint qr_bingo_grand_prize_entries_unique_couple
    unique (event_key, couple_bd_user_id),
  constraint qr_bingo_grand_prize_entries_rules_present check (
    btrim(official_rules_url) <> ''
    and btrim(rules_version) <> ''
    and btrim(consent_text) <> ''
    and btrim(eligibility_region) <> ''
    and btrim(odds_basis) <> ''
    and draw_at >= entry_closes_at
    and no_purchase_required
    and skill_testing_question_required
    and alternate_free_entry_url ~ '^https://'
    and age_of_majority_attested
    and residency_attested
    and exclusions_attested
    and btrim(eligibility_attestation_text) <> ''
  )
);

create index if not exists qr_bingo_grand_prize_entries_couple_idx
  on public.qr_bingo_grand_prize_entries (couple_bd_user_id, event_key);

alter table public.qr_bingo_grand_prize_entries enable row level security;

-- Fail closed at the database boundary if old or unaudited rule acceptance is
-- used to enable a vendor draw or create an entrant.
create or replace function public.enforce_qr_bingo_current_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'qr_bingo_raffle_settings' then
    if new.enabled and (
      not new.legal_terms_accepted
      or new.legal_terms_version <> '2026-08-28'
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
    if new.consent_version <> '2026-08-28'
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
    if new.rules_version <> '2026-08-28'
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

drop trigger if exists enforce_qr_bingo_settings_current_rules
  on public.qr_bingo_raffle_settings;
create trigger enforce_qr_bingo_settings_current_rules
before insert or update on public.qr_bingo_raffle_settings
for each row execute function public.enforce_qr_bingo_current_rules();

drop trigger if exists enforce_qr_bingo_entry_current_rules
  on public.qr_bingo_raffle_entries;
create trigger enforce_qr_bingo_entry_current_rules
before insert or update on public.qr_bingo_raffle_entries
for each row execute function public.enforce_qr_bingo_current_rules();

drop trigger if exists enforce_qr_bingo_grand_entry_current_rules
  on public.qr_bingo_grand_prize_entries;
create trigger enforce_qr_bingo_grand_entry_current_rules
before insert or update on public.qr_bingo_grand_prize_entries
for each row execute function public.enforce_qr_bingo_current_rules();

-- Material terms are immutable once anyone has entered. A materially different
-- promotion needs a new event/version rather than silently changing accepted
-- prize terms underneath existing entrants.
create or replace function public.lock_entered_qr_bingo_material_terms()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.qr_bingo_raffle_entries entries
    where entries.event_key = old.event_key
      and entries.vendor_bingo_id = old.vendor_bingo_id
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
    new.alternate_free_entry_url
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
    old.alternate_free_entry_url
  ) then
    raise exception 'Prize and draw terms cannot change after the first entry; create a new promotion version.';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_entered_qr_bingo_material_terms
  on public.qr_bingo_raffle_settings;
create trigger lock_entered_qr_bingo_material_terms
before update on public.qr_bingo_raffle_settings
for each row execute function public.lock_entered_qr_bingo_material_terms();

-- Selection creates only a potential winner. Outbound contact/claim fields
-- cannot be written until service-role review verifies both eligibility and
-- the mathematical skill-testing answer.
create or replace function public.enforce_qr_bingo_draw_verification()
returns trigger
language plpgsql
set search_path = public
as $$
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
    or new.skill_question_verified_at is null
    or new.verified_at is null
    or nullif(btrim(new.verified_by), '') is null
  ) then
    raise exception 'Eligibility and skill-testing verification are required before confirming a winner.';
  end if;

  if (new.vendor_email_sent_at is not null or new.couple_email_sent_at is not null) and (
    new.selection_status <> 'verified'
    or new.eligibility_verified_at is null
    or new.skill_question_verified_at is null
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
$$;

drop trigger if exists enforce_qr_bingo_draw_verification
  on public.qr_bingo_raffle_draws;
create trigger enforce_qr_bingo_draw_verification
before insert or update on public.qr_bingo_raffle_draws
for each row execute function public.enforce_qr_bingo_draw_verification();

create or replace function public.review_qr_bingo_potential_winner(
  p_draw_id uuid,
  p_decision text,
  p_eligibility_verified boolean default false,
  p_skill_question_verified boolean default false,
  p_reviewed_by text default '',
  p_notes text default ''
)
returns public.qr_bingo_raffle_draws
language plpgsql
security definer
set search_path = public, auth
as $$
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
$$;

revoke all on function public.review_qr_bingo_potential_winner(uuid, text, boolean, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.review_qr_bingo_potential_winner(uuid, text, boolean, boolean, text, text)
  to service_role;

-- Existing enabled draws accepted an older rules version without a verified
-- view event. Pause them until each vendor reviews the new rules in-app.
update public.qr_bingo_raffle_settings
set enabled = false,
    legal_terms_accepted = false,
    apple_non_sponsor_acknowledged = false,
    updated_at = now()
where enabled
  and (
    legal_terms_version <> '2026-08-28'
    or rules_viewed_at is null
    or not apple_non_sponsor_acknowledged
    or coalesce(prize_approx_value_cad, 0) <= 0
    or alternate_free_entry_url !~ '^https://'
  );

-- App Review uses an isolated, expiring fixture. This never changes the
-- Brilliant Directories member's active/public state and is readable only by
-- service-role code after it has authenticated one of the two exact BD users.
create table if not exists public.app_review_raffle_fixtures (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (event_key like 'app-review-%'),
  couple_bd_user_id text not null,
  vendor_bd_user_id text not null,
  vendor_bingo_id text not null,
  vendor_name text not null,
  vendor_qr_payload text not null,
  enabled boolean not null default true,
  allow_early_draw boolean not null default true,
  suppress_outbound_email boolean not null default true
    check (suppress_outbound_email),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_review_raffle_fixture_distinct_event check (
    event_key <> 'niagara-wedding-show-2026'
  ),
  constraint app_review_raffle_fixture_distinct_users check (
    couple_bd_user_id <> vendor_bd_user_id
  )
);

create unique index if not exists app_review_raffle_fixture_couple_idx
  on public.app_review_raffle_fixtures (couple_bd_user_id);
create unique index if not exists app_review_raffle_fixture_vendor_idx
  on public.app_review_raffle_fixtures (vendor_bd_user_id);

alter table public.app_review_raffle_fixtures enable row level security;
revoke all on table public.app_review_raffle_fixtures from public, anon, authenticated;
grant select, insert, update, delete on table public.app_review_raffle_fixtures to service_role;

create table if not exists public.app_review_raffle_fixture_scans (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.app_review_raffle_fixtures(id) on delete cascade,
  couple_bd_user_id text not null,
  vendor_bingo_id text not null,
  scanned_at timestamptz not null default now(),
  constraint app_review_raffle_fixture_scans_unique
    unique (fixture_id, couple_bd_user_id, vendor_bingo_id)
);

alter table public.app_review_raffle_fixture_scans enable row level security;
revoke all on table public.app_review_raffle_fixture_scans from public, anon, authenticated;
grant select, insert, update, delete on table public.app_review_raffle_fixture_scans to service_role;

insert into public.app_review_raffle_fixtures (
  event_key,
  couple_bd_user_id,
  vendor_bd_user_id,
  vendor_bingo_id,
  vendor_name,
  vendor_qr_payload,
  enabled,
  allow_early_draw,
  suppress_outbound_email,
  expires_at
) values (
  'app-review-weddingwin-2026-38970',
  '38971',
  '38970',
  '38970',
  'Wedding Win App Review Test Vendor',
  'https://www.weddingwin.ca/qr?vendor_id=38970',
  true,
  true,
  true,
  '2027-01-31 08:00:00+00'
)
on conflict (event_key) do nothing;

-- This is fictional, controlled review data with no prize and no outbound
-- delivery. Production settings and entrants use a different event_key.
insert into public.qr_bingo_raffle_settings (
  event_key,
  vendor_bingo_id,
  vendor_bd_user_id,
  vendor_name,
  enabled,
  prize_title,
  prize_description,
  prize_approx_value_cad,
  eligibility_region,
  entry_closes_at,
  draw_at,
  odds_basis,
  no_purchase_required,
  skill_testing_question_required,
  alternate_free_entry_url,
  legal_terms_accepted,
  legal_terms_version,
  legal_terms_accepted_at,
  official_rules_url,
  rules_viewed_at,
  administrator_name,
  co_sponsor_name,
  prize_provider_name,
  apple_non_sponsor_acknowledged,
  draw_opens_at
) values (
  'app-review-weddingwin-2026-38970',
  '38970',
  '38970',
  'Wedding Win App Review Test Vendor',
  true,
  'App Review demonstration prize (no cash value)',
  'Test-only demonstration. No prize is awarded and no contact data is used outside the isolated App Review fixture.',
  1.00,
  'Controlled App Review test accounts only',
  '2027-01-31 07:59:00+00',
  '2027-01-31 07:59:00+00',
  'One controlled fictional entry is used solely to demonstrate the random-selection workflow.',
  true,
  true,
  'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules#app-review-fixture',
  true,
  '2026-08-28',
  now(),
  'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
  now(),
  'Wedding Win Inc.',
  'Wedding Win Inc.',
  'Wedding Win App Review Test Vendor',
  true,
  '2027-01-31 07:59:00+00'
)
on conflict (event_key, vendor_bingo_id) do nothing;

-- Replace the legacy three-winner/test-vendor function at the database
-- boundary. Preserve every historical row, but retire additional active
-- selections so exactly one potential/verified selection remains per draw.
-- Legacy emailed rows predate the new verification columns, so temporarily
-- suspend that new trigger only for this deterministic migration repair.
alter table public.qr_bingo_raffle_draws
  disable trigger enforce_qr_bingo_draw_verification;

update public.qr_bingo_raffle_draws
   set selection_status = 'disqualified',
       disqualified_at = coalesce(disqualified_at, now()),
       disqualification_reason = case
         when nullif(btrim(disqualification_reason), '') is null
           then 'Legacy selection retired because current eligibility and skill-testing verification was not recorded.'
         else disqualification_reason
       end
 where selection_status in ('potential', 'verified')
   and (
     eligibility_verified_at is null
     or skill_question_verified_at is null
     or verified_at is null
   );

with ranked_active_draws as (
  select id,
         row_number() over (
           partition by event_key, vendor_bingo_id
           order by
             case when selection_status = 'verified' then 0 else 1 end,
             draw_number,
             drawn_at,
             id
         ) as active_rank
    from public.qr_bingo_raffle_draws
   where selection_status in ('potential', 'verified')
)
update public.qr_bingo_raffle_draws draws
   set selection_status = 'disqualified',
       disqualified_at = coalesce(draws.disqualified_at, now()),
       disqualification_reason = case
         when nullif(btrim(draws.disqualification_reason), '') is null
           then 'Legacy additional selection retired by the 2026-08-28 single-selection rules migration.'
         else draws.disqualification_reason
       end
  from ranked_active_draws ranked
 where draws.id = ranked.id
   and ranked.active_rank > 1;

alter table public.qr_bingo_raffle_draws
  enable trigger enforce_qr_bingo_draw_verification;

create unique index if not exists qr_bingo_raffle_draws_one_active_selection_idx
  on public.qr_bingo_raffle_draws (event_key, vendor_bingo_id)
  where selection_status in ('potential', 'verified');

create or replace function public.enforce_qr_bingo_raffle_draw_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  existing_active_selection_count integer;
begin
  -- Serialize every insert/status transition for the same promotion. The
  -- partial unique index below is an independent final concurrency boundary.
  perform pg_advisory_xact_lock(
    hashtextextended(new.event_key || ':' || new.vendor_bingo_id, 0)
  );

  if new.selection_status in ('potential', 'verified') then
    select count(*)
      into existing_active_selection_count
      from public.qr_bingo_raffle_draws draws
     where draws.event_key = new.event_key
       and draws.vendor_bingo_id = new.vendor_bingo_id
       and draws.selection_status in ('potential', 'verified')
       and draws.id <> new.id;

    if existing_active_selection_count > 0 then
      raise exception 'An active potential winner already exists. Disqualify that selection before selecting another.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists qr_bingo_raffle_draw_limit
  on public.qr_bingo_raffle_draws;
create trigger qr_bingo_raffle_draw_limit
before insert or update of event_key, vendor_bingo_id, selection_status
on public.qr_bingo_raffle_draws
for each row execute function public.enforce_qr_bingo_raffle_draw_limit();
