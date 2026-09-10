-- QR Bingo contact details are independent of BD/Auth login email and proof.
-- Only authenticated Edge Functions may access these records; no client RLS
-- policy grants direct access, and no scan-only vendor receives contacts.
create table public.qr_bingo_contact_profiles (
  event_key text not null check (event_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(event_key) <= 100),
  couple_bd_user_id text not null check (couple_bd_user_id ~ '^[1-9][0-9]{0,17}$'),
  name text not null check (length(name) between 1 and 160 and name !~ '[<>[:cntrl:]]'),
  email text not null check (length(email) between 3 and 254 and email = lower(btrim(email))
    and email ~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+\.[^[:space:]@<>;,]+$'
    and email !~ '[[:cntrl:]]' and email !~ '@privaterelay\.appleid\.com$'),
  phone text not null check (length(phone) <= 80 and phone !~ '[<>[:cntrl:]]'
    and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15),
  wedding_date text not null default '' check (wedding_date = '' or wedding_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  version bigint not null default 1 check (version > 0),
  date_sync_pending boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(event_key, couple_bd_user_id)
);
alter table public.qr_bingo_contact_profiles enable row level security;
revoke all on public.qr_bingo_contact_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.qr_bingo_contact_profiles to service_role;

create table public.qr_bingo_contact_profile_audit (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  couple_bd_user_id text not null,
  profile_version bigint not null,
  previous_contact jsonb,
  current_contact jsonb not null,
  updated_entry_count integer not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(event_key,couple_bd_user_id) references public.qr_bingo_contact_profiles(event_key,couple_bd_user_id) on delete cascade
);
alter table public.qr_bingo_contact_profile_audit enable row level security;
revoke all on public.qr_bingo_contact_profile_audit from public, anon, authenticated;
grant select, insert, delete on public.qr_bingo_contact_profile_audit to service_role;

create table public.qr_bingo_admin_data_export_audit (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  dataset text not null check (dataset in ('contacts','scans','entries','winners')),
  vendor_id text not null default '',
  operator_identity text not null,
  row_count integer not null check (row_count between 0 and 5000),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.qr_bingo_admin_data_export_audit enable row level security;
revoke all on public.qr_bingo_admin_data_export_audit from public, anon, authenticated;
grant select, insert on public.qr_bingo_admin_data_export_audit to service_role;

create or replace function public.read_qr_bingo_admin_data(
  p_dataset text,p_event_key text,p_vendor_id text default '',p_search text default '',
  p_offset integer default 0,p_limit integer default 50
) returns jsonb language plpgsql security invoker set search_path = '' as $$
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
      concat_ws(' ',profile.couple_bd_user_id,profile.name,profile.email,profile.phone) as search_text,
      jsonb_build_object('couple_id',profile.couple_bd_user_id,'name',profile.name,'email',profile.email,
        'phone',profile.phone,'wedding_date',profile.wedding_date,'version',profile.version,'updated_at',profile.updated_at) as row_data
      from public.qr_bingo_contact_profiles profile where p_dataset='contacts' and profile.event_key=p_event_key
        and (p_vendor_id='' or exists(select 1 from public.qr_bingo_raffle_entries entry
          where entry.event_key=profile.event_key and entry.couple_bd_user_id=profile.couple_bd_user_id
            and entry.vendor_bingo_id=p_vendor_id and entry.consent_share_contact
            and entry.contact_share_scope='named_vendor_draw_administration'
            and entry.draw_administration_contact_share_acknowledged and entry.vendor_marketing_consent))
    union all
    select entry.id::text,entry.created_at,concat_ws(' ',entry.couple_bd_user_id,entry.couple_name,entry.couple_email,entry.couple_phone,entry.vendor_name),
      jsonb_build_object('id',entry.id,'vendor_id',entry.vendor_bingo_id,'vendor_name',entry.vendor_name,
        'couple_id',entry.couple_bd_user_id,'name',entry.couple_name,'email',entry.couple_email,'phone',entry.couple_phone,
        'wedding_date',entry.couple_wedding_date,'entered_at',entry.created_at,'consent_version',entry.consent_version,
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
$$;
revoke all on function public.read_qr_bingo_admin_data(text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.read_qr_bingo_admin_data(text,text,text,text,integer,integer) to service_role;

-- This small privileged boundary reads only the existing hash-only deletion
-- marker. Contact storage/read RPCs remain SECURITY INVOKER. The member lock is
-- shared with account deletion, preventing an in-flight save from resurrecting
-- contact PII after a successful purge.
create or replace function public.lock_active_qr_bingo_contact_member(p_member_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_member_id is null or p_member_id !~ '^[1-9][0-9]{0,17}$' then
    raise exception using errcode='22023',message='Invalid QR contact member.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact-member:'||p_member_id,0));
  if weddingwin_private.is_deleted_chat_identity(p_member_id) then
    raise exception using errcode='42501',message='This member account was deleted.';
  end if;
end;
$$;
revoke all on function public.lock_active_qr_bingo_contact_member(text) from public,anon,authenticated;
grant execute on function public.lock_active_qr_bingo_contact_member(text) to service_role;

create or replace function public.save_qr_bingo_contact_profile(
  p_event_key text, p_couple_id text, p_expected_version bigint,
  p_name text, p_email text, p_phone text, p_wedding_date text,
  p_sync_date boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  previous public.qr_bingo_contact_profiles%rowtype;
  current_profile public.qr_bingo_contact_profiles%rowtype;
  updated_count integer;
begin
  if p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode='22023',message='Invalid QR contact version.';
  end if;
  if p_wedding_date <> '' and (p_wedding_date::date::text <> p_wedding_date or extract(year from p_wedding_date::date) < 1900) then
    raise exception using errcode='22023',message='Invalid QR wedding date.';
  end if;
  if lower(btrim(p_name)) in ('couple','weddingwin','weddingwin couple') then
    raise exception using errcode='22023',message='A contact name is required.';
  end if;
  perform public.lock_active_qr_bingo_contact_member(p_couple_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact:'||p_event_key||':'||p_couple_id,0));
  select * into previous from public.qr_bingo_contact_profiles
    where event_key=p_event_key and couple_bd_user_id=p_couple_id for update;
  if coalesce(previous.version,0) <> p_expected_version then
    return jsonb_build_object('ok',false,'code','contact_profile_conflict');
  end if;
  insert into public.qr_bingo_contact_profiles(event_key,couple_bd_user_id,name,email,phone,wedding_date,version,date_sync_pending)
    values(p_event_key,p_couple_id,p_name,p_email,p_phone,p_wedding_date,1,p_sync_date)
    on conflict(event_key,couple_bd_user_id) do update set
      name=excluded.name,email=excluded.email,phone=excluded.phone,wedding_date=excluded.wedding_date,
      version=qr_bingo_contact_profiles.version+1,updated_at=clock_timestamp(),
      date_sync_pending=qr_bingo_contact_profiles.date_sync_pending or p_sync_date
    returning * into current_profile;

  -- Operational contact refresh only: no INSERT, no vendor or consent change.
  -- Acceptance ledger, entry identity, original timestamps and offer remain.
  update public.qr_bingo_raffle_entries entry set
    couple_name=p_name,couple_email=p_email,couple_phone=p_phone,couple_wedding_date=p_wedding_date
    where entry.event_key=p_event_key and entry.couple_bd_user_id=p_couple_id
      and entry.entry_method='qr_scan_opt_in' and entry.consent_share_contact
      and entry.contact_share_scope='named_vendor_draw_administration'
      and entry.draw_administration_contact_share_acknowledged and entry.vendor_marketing_consent
      and entry.draw_administration_contact_share_version in ('2026-09-01-vendor-marketing','2026-09-01-in-person-entry')
      and entry.consent_version in ('2026-09-01-vendor-marketing','2026-09-01-in-person-entry')
      and not exists(select 1 from public.qr_bingo_legacy_qa_archives archive where archive.entry_id=entry.id);
  get diagnostics updated_count = row_count;
  insert into public.qr_bingo_contact_profile_audit(event_key,couple_bd_user_id,profile_version,previous_contact,current_contact,updated_entry_count)
    values(p_event_key,p_couple_id,current_profile.version,
      case when previous.version is null then null else jsonb_build_object('name',previous.name,'email',previous.email,'phone',previous.phone,'wedding_date',previous.wedding_date) end,
      jsonb_build_object('name',p_name,'email',p_email,'phone',p_phone,'wedding_date',p_wedding_date),updated_count);
  return jsonb_build_object('ok',true,'version',current_profile.version,'updated_entry_count',updated_count);
end;
$$;
revoke all on function public.save_qr_bingo_contact_profile(text,text,bigint,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.save_qr_bingo_contact_profile(text,text,bigint,text,text,text,text,boolean) to service_role;

-- Serialize a simultaneous opt-in against contact saves. New entries use the
-- latest saved QR contacts, not a stale copy fetched before the user edited.
create or replace function public.apply_qr_bingo_saved_contact_to_entry()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare profile public.qr_bingo_contact_profiles%rowtype;
begin
  if new.entry_method <> 'qr_scan_opt_in' then return new; end if;
  perform public.lock_active_qr_bingo_contact_member(new.couple_bd_user_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact:'||new.event_key||':'||new.couple_bd_user_id,0));
  select * into profile from public.qr_bingo_contact_profiles
    where event_key=new.event_key and couple_bd_user_id=new.couple_bd_user_id;
  if found then
    new.couple_name:=profile.name;new.couple_email:=profile.email;
    new.couple_phone:=profile.phone;new.couple_wedding_date:=profile.wedding_date;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_qr_bingo_saved_contact_to_entry() from public,anon,authenticated,service_role;
create trigger a00_apply_qr_bingo_saved_contact_to_entry before insert on public.qr_bingo_raffle_entries
  for each row execute function public.apply_qr_bingo_saved_contact_to_entry();

-- Existing guards copied from current production definitions, with narrowly
-- scoped contact-update and same-entry identity-reservation changes only.
CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_entry_offer_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Contact edits do not reopen/reaccept the promotion. Archived rows were
  -- rejected above; every non-contact column and all consent evidence must be
  -- byte-for-byte unchanged for this narrow operational update exemption.
  if tg_op = 'UPDATE'
    and old.consent_share_contact
    and old.contact_share_scope = 'named_vendor_draw_administration'
    and old.draw_administration_contact_share_acknowledged
    and old.vendor_marketing_consent
    and (to_jsonb(new) - array['couple_name','couple_email','couple_phone','couple_wedding_date','entrant_identity_hash'])
      = (to_jsonb(old) - array['couple_name','couple_email','couple_phone','couple_wedding_date','entrant_identity_hash'])
  then
    return new;
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
$function$
;
CREATE OR REPLACE FUNCTION public.set_and_reserve_qr_bingo_entry_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  ) on conflict(event_key,vendor_bingo_id,entrant_identity_hash) do update
    set expires_at = greatest(qr_bingo_raffle_entry_identities.expires_at, excluded.expires_at)
    where qr_bingo_raffle_entry_identities.first_entry_id = excluded.first_entry_id;
  if not found then
    raise exception using errcode = '23505', message = 'QR Bingo contact is already entered in this vendor draw.';
  end if;

  return new;
end;
$function$
;

-- Preserve existing consent checks for all material writes, while allowing
-- operational contact updates to older explicitly opted-in named draws.
CREATE OR REPLACE FUNCTION public.enforce_qr_bingo_current_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  applicable_rules_version text;
  submitted_offer_version timestamptz;
begin
  -- A verified, existing named-vendor consent is not renewed by a contact edit.
  -- Only operational contact columns may differ; archived records stay immutable.
  if tg_op = 'UPDATE' and tg_table_name = 'qr_bingo_raffle_entries' then
  if old.consent_share_contact
    and old.contact_share_scope = 'named_vendor_draw_administration'
    and old.draw_administration_contact_share_acknowledged
    and old.vendor_marketing_consent
    and not exists(select 1 from public.qr_bingo_legacy_qa_archives archive where archive.entry_id=old.id)
    and (to_jsonb(new) - array['couple_name','couple_email','couple_phone','couple_wedding_date','entrant_identity_hash'])
      = (to_jsonb(old) - array['couple_name','couple_email','couple_phone','couple_wedding_date','entrant_identity_hash'])
  then return new; end if;
  end if;
  if tg_table_name = 'qr_bingo_raffle_entries' then
    submitted_offer_version := nullif(
      to_jsonb(new) ->> 'vendor_offer_version',
      ''
    )::timestamptz;
  end if;

  if tg_table_name = 'qr_bingo_raffle_entries'
    and submitted_offer_version is not null
  then
    select version.rules_version
      into applicable_rules_version
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = new.event_key
       and version.vendor_bingo_id = new.vendor_bingo_id
       and version.vendor_offer_version = submitted_offer_version
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
      applicable_rules_version <> '2026-09-01-in-person-entry'
      or not new.legal_terms_accepted
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
      or coalesce(position(
        'visited this vendor booth in person'
        in lower(new.participant_responsibility_disclosure_text)
      ), 0) = 0
      or new.alternate_free_entry_url !~ '^https://'
    ) then
      raise exception 'Review and accept the current official rules before enabling this vendor draw.';
    end if;
  elsif tg_table_name = 'qr_bingo_raffle_entries' then
    if applicable_rules_version <> '2026-09-01-in-person-entry'
      or new.consent_version is distinct from applicable_rules_version
      or new.rules_viewed_at is null
      or not new.apple_non_sponsor_acknowledged
      or not new.consent_share_contact
      or new.contact_share_scope <> 'named_vendor_draw_administration'
      or not new.draw_administration_contact_share_acknowledged
      or new.draw_administration_contact_share_acknowledged_at is null
      or new.draw_administration_contact_share_version is distinct from applicable_rules_version
      or nullif(btrim(new.draw_administration_contact_share_consent_text), '') is null
      or not new.vendor_marketing_consent
      or new.vendor_marketing_consented_at is null
      or nullif(btrim(new.vendor_marketing_consent_text), '') is null
      or position('wedding-related offers and promotions' in new.vendor_marketing_consent_text) = 0
      or position('unsubscribe' in lower(new.vendor_marketing_consent_text)) = 0
      or coalesce(position(
        'visited this vendor booth in person'
        in lower(new.promotion_disclosure_text)
      ), 0) = 0
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
      or not new.age_of_majority_attested
      or not new.residency_attested
      or not new.exclusions_attested
      or new.eligibility_attested_at is null
      or btrim(new.eligibility_attestation_text) = ''
    then
      raise exception 'Review and accept the current in-person entry rules and named-vendor marketing terms before entering this vendor draw.';
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
$function$
;

-- Extend the existing service-only account deletion entry point.
CREATE OR REPLACE FUNCTION public.purge_weddingwin_member_data_with_chat_redaction(p_bd_user_id text, p_bd_token text DEFAULT ''::text, p_bd_cookie text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id text := btrim(coalesce(p_bd_user_id, ''));
  v_member_hash text;
  v_promoted_count integer := 0;
  v_result jsonb;
  v_qr_contact_count integer := 0;
begin
  if v_user_id = '' then
    raise exception 'A Brilliant Directories member id is required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact-member:'||v_user_id,0));
  v_member_hash := weddingwin_private.chat_identity_hash(v_user_id);

  insert into weddingwin_private.deleted_chat_identities (
    identity_hash,
    normalization
  )
  select
    staged.identity_hash,
    staged.normalization
    from weddingwin_private.pending_deleted_chat_identities staged
   where staged.member_hash = v_member_hash
     and staged.expires_at > now()
  on conflict (identity_hash, normalization) do nothing;
  get diagnostics v_promoted_count = row_count;

  v_result := coalesce(
    public.purge_weddingwin_member_data_chat_redaction_v1(
      v_user_id,
      btrim(coalesce(p_bd_token, '')),
      btrim(coalesce(p_bd_cookie, ''))
    ),
    '{}'::jsonb
  );

  -- Both app deletion and the website deletion callback enter this wrapper.
  -- All events are purged; the contact-history audit cascades with its parent.
  delete from public.qr_bingo_contact_profiles where couple_bd_user_id = v_user_id;
  get diagnostics v_qr_contact_count = row_count;
  v_result := v_result || jsonb_build_object('qr_bingo_contact_profiles_deleted', v_qr_contact_count);

  delete from weddingwin_private.pending_deleted_chat_identities
   where member_hash = v_member_hash;

  return v_result || jsonb_build_object(
    'staged_chat_identities_promoted', v_promoted_count
  );
end;
$function$
;
