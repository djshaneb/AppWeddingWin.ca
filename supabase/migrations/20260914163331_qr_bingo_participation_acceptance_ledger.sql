-- A saved contact profile is not consent. Keep a durable, versioned receipt of
-- the existing pre-scan agreement, including couples who never scan or enter.
-- Named-vendor historical evidence is explicitly a different basis; no legacy
-- row is made to claim it accepted a pre-scan notice that was only stored locally.
create table public.qr_bingo_participation_acceptances (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (event_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(event_key)<=100),
  couple_bd_user_id text not null check (couple_bd_user_id ~ '^[1-9][0-9]{0,17}$'),
  rules_version text not null check (rules_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  notice_version text not null check (length(notice_version)<=180),
  basis text not null check (basis in ('explicit_notice','cached_notice','notice_on_use','vendor_draw_entry')),
  accepted_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  profile_event_key text,
  profile_couple_bd_user_id text,
  contact_profile_version bigint check (contact_profile_version>=1),
  source_entry_id uuid references public.qr_bingo_raffle_entries(id) on delete cascade,
  excluded_from_master boolean not null default false,
  unique(event_key,couple_bd_user_id,rules_version,notice_version),
  foreign key(profile_event_key,profile_couple_bd_user_id)
    references public.qr_bingo_contact_profiles(event_key,couple_bd_user_id) on delete cascade,
  constraint qr_bingo_participation_profile_pair check (
    (profile_event_key is null and profile_couple_bd_user_id is null and contact_profile_version is null)
    or (profile_event_key is not null and profile_couple_bd_user_id is not null and contact_profile_version is not null
      and profile_event_key=event_key and profile_couple_bd_user_id=couple_bd_user_id)),
  constraint qr_bingo_participation_evidence_present check (
    (basis='vendor_draw_entry' and notice_version='' and source_entry_id is not null)
    or (basis<>'vendor_draw_entry' and profile_event_key is not null
      and notice_version=rules_version||'|2026-09-04-pre-scan-draw-consent'))
);
create index qr_bingo_participation_couple_idx on public.qr_bingo_participation_acceptances(couple_bd_user_id,event_key,accepted_at);
-- Privacy cascades locate receipts by their actual FK columns, independently
-- of the account-oriented reporting index above.
create index qr_bingo_participation_source_entry_idx on public.qr_bingo_participation_acceptances(source_entry_id);
create index qr_bingo_participation_profile_idx on public.qr_bingo_participation_acceptances(profile_event_key,profile_couple_bd_user_id);
alter table public.qr_bingo_participation_acceptances enable row level security;
revoke all on public.qr_bingo_participation_acceptances from public,anon,authenticated,service_role;
grant select,insert on public.qr_bingo_participation_acceptances to service_role;
comment on table public.qr_bingo_participation_acceptances is
  'Server receipts of explicit QR Bingo agreement, cached prior notice acknowledgement, valid notice use, or proven historical named-vendor entry consent. Reset/list removal retains receipts; actual profile/entry privacy deletion cascades. No contact PII is copied.';
comment on column public.qr_bingo_participation_acceptances.accepted_at is
  'Server receipt time for new/cached notices; actual proven consent time for historical vendor entries. Cached local agreement has no invented historical timestamp.';

-- Master-export exclusions grant no fixture/authentication privileges. Account
-- 39077 was created solely for the September 13 administrator reset QA, completed
-- two controlled test cycles, and was then deactivated. It is intentionally not
-- inferred from an arbitrary name, address, membership status or removal flag.
create table public.qr_bingo_participation_test_accounts (
  couple_bd_user_id text primary key check (couple_bd_user_id ~ '^[1-9][0-9]{0,17}$'),
  provenance text not null check (length(provenance) between 3 and 500),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.qr_bingo_participation_test_accounts enable row level security;
revoke all on public.qr_bingo_participation_test_accounts from public,anon,authenticated,service_role;
grant select on public.qr_bingo_participation_test_accounts to service_role;
insert into public.qr_bingo_participation_test_accounts(couple_bd_user_id,provenance)
 values('39077','Controlled ordinary-couple administrator reset validation, 2026-09-13; two test cycles cleaned up and account deactivated. Exclusion affects master reporting only.');

-- All known test identities remain excluded after expiry/disable. Authorization
-- for a new isolated receipt is separately checked against the current fixture.
create function public.qr_bingo_participation_is_test(p_event_key text,p_couple_id text)
returns boolean language sql stable security invoker set search_path='' as $$
 select p_event_key like 'app-review-%' or p_event_key like 'email-test-%'
 or exists(select 1 from public.qr_bingo_participation_test_accounts qa where qa.couple_bd_user_id=p_couple_id)
 or exists(select 1 from public.app_review_raffle_fixtures f where f.event_key=p_event_key or f.couple_bd_user_id=p_couple_id or f.vendor_bd_user_id=p_couple_id)
 or exists(select 1 from public.app_review_raffle_fixture_participants p where p.couple_bd_user_id=p_couple_id)
 or exists(select 1 from public.qr_bingo_email_test_fixtures f where f.event_key=p_event_key or f.couple_bd_user_id=p_couple_id or f.vendor_bd_user_id=p_couple_id);
$$;
revoke all on function public.qr_bingo_participation_is_test(text,text) from public,anon,authenticated;
grant execute on function public.qr_bingo_participation_is_test(text,text) to service_role;

create function public.record_qr_bingo_participation_acceptance(
 p_published_event_key text,p_event_key text,p_couple_id text,p_rules_version text,
 p_notice_version text,p_profile_version bigint,p_basis text,p_expected_revision bigint default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare config public.qr_bingo_event_configs%rowtype; profile public.qr_bingo_contact_profiles%rowtype;
 receipt public.qr_bingo_participation_acceptances%rowtype; isolated boolean;
begin
 if p_event_key is null or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_event_key)>100
 or p_couple_id is null or p_couple_id !~ '^[1-9][0-9]{0,17}$'
 or p_basis is null or p_basis not in ('explicit_notice','cached_notice','notice_on_use')
 or p_profile_version is null or p_profile_version<1 then
  raise exception using errcode='22023',message='A current QR Bingo agreement and saved profile are required.';
 end if;
 -- Match contact save/reset/deletion order, then serialize publication. No
 -- config row-lock privilege is needed: service_role has SELECT only there.
 perform public.lock_active_qr_bingo_contact_member(p_couple_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact:'||p_event_key||':'||p_couple_id,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr_bingo_event_config_publish',0));
 select * into config from public.qr_bingo_event_configs where published order by revision desc limit 1;
 if not found or p_published_event_key is distinct from config.event_key
 or p_rules_version is distinct from config.rules_version
 or p_notice_version is distinct from config.rules_version||'|2026-09-04-pre-scan-draw-consent'
 or (p_expected_revision is not null and p_expected_revision is distinct from config.revision) then
  return jsonb_build_object('ok',false,'code','participation_agreement_stale');
 end if;
 if p_event_key<>config.event_key and not (
  exists(select 1 from public.app_review_raffle_fixtures f where f.event_key=p_event_key and f.enabled and f.expires_at>clock_timestamp()
    and (f.couple_bd_user_id=p_couple_id or exists(select 1 from public.app_review_raffle_fixture_participants p where p.fixture_id=f.id and p.couple_bd_user_id=p_couple_id)))
  or exists(select 1 from public.qr_bingo_email_test_fixtures f where f.event_key=p_event_key and f.couple_bd_user_id=p_couple_id and f.enabled and f.expires_at>clock_timestamp())
 ) then return jsonb_build_object('ok',false,'code','participation_agreement_stale'); end if;
 select * into profile from public.qr_bingo_contact_profiles where event_key=p_event_key and couple_bd_user_id=p_couple_id;
 if not found or profile.version<>p_profile_version then return jsonb_build_object('ok',false,'code','participation_profile_changed'); end if;
 if btrim(profile.name)='' or lower(btrim(profile.name)) in ('couple','weddingwin','weddingwin couple')
 or profile.email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or lower(profile.email) like '%@privaterelay.appleid.com'
 or length(regexp_replace(profile.phone,'[^0-9]','','g')) not between 7 and 15 then
  return jsonb_build_object('ok',false,'code','profile_incomplete');
 end if;
 isolated:=public.qr_bingo_participation_is_test(p_event_key,p_couple_id);
 insert into public.qr_bingo_participation_acceptances(event_key,couple_bd_user_id,rules_version,notice_version,basis,accepted_at,
   profile_event_key,profile_couple_bd_user_id,contact_profile_version,excluded_from_master)
 values(p_event_key,p_couple_id,p_rules_version,p_notice_version,p_basis,clock_timestamp(),p_event_key,p_couple_id,profile.version,isolated)
 on conflict(event_key,couple_bd_user_id,rules_version,notice_version) do nothing;
 select * into receipt from public.qr_bingo_participation_acceptances
  where event_key=p_event_key and couple_bd_user_id=p_couple_id and rules_version=p_rules_version and notice_version=p_notice_version;
 return jsonb_build_object('ok',true,'receipt',to_jsonb(receipt));
end;
$$;
revoke all on function public.record_qr_bingo_participation_acceptance(text,text,text,text,text,bigint,text,bigint) from public,anon,authenticated;
grant execute on function public.record_qr_bingo_participation_acceptance(text,text,text,text,text,bigint,text,bigint) to service_role;

-- Genuine named-vendor acceptance only, never a profile, scan, completion flag,
-- or administrator-created contact. The append-only consent audit preserves
-- earlier rules versions even after reconsent updates the stable entry row.
create function public.qr_bingo_participation_entry_evidence(p_entry_id uuid default null)
returns table(event_key text,couple_bd_user_id text,rules_version text,accepted_at timestamptz,source_entry_id uuid)
language sql volatile security invoker set search_path='' as $$
 with evidence as (
  select e.id source_id,to_jsonb(e) proof from public.qr_bingo_raffle_entries e where p_entry_id is null or e.id=p_entry_id
  union all
  select a.entry_id,to_jsonb(a) from public.qr_bingo_entrant_consent_acceptance_audit a where p_entry_id is null or a.entry_id=p_entry_id
 ), valid as (
  select e.event_key,e.couple_bd_user_id,p.proof->>'consent_version' rules_version,
   (p.proof->>'consented_at')::timestamptz accepted_at,e.id source_entry_id
  from evidence p join public.qr_bingo_raffle_entries e on e.id=p.source_id
  join public.qr_bingo_vendor_offer_versions offer on offer.event_key=e.event_key
   and offer.vendor_bingo_id=e.vendor_bingo_id and offer.vendor_bd_user_id=e.vendor_bd_user_id
   and offer.vendor_offer_version=(p.proof->>'vendor_offer_version')::timestamptz
  where p.proof->>'event_key'=e.event_key and p.proof->>'couple_bd_user_id'=e.couple_bd_user_id
   and p.proof->>'vendor_bingo_id'=e.vendor_bingo_id and p.proof->>'vendor_bd_user_id'=e.vendor_bd_user_id
   and p.proof->>'consent_version' in ('2026-08-30-contact-share','2026-09-01-vendor-marketing','2026-09-01-in-person-entry')
   and p.proof->>'consent_share_contact'='true' and p.proof->>'contact_share_scope'='named_vendor_draw_administration'
   and p.proof->>'draw_administration_contact_share_acknowledged'='true'
   and p.proof->>'draw_administration_contact_share_version'=p.proof->>'consent_version'
   and nullif(p.proof->>'draw_administration_contact_share_acknowledged_at','') is not null
   and btrim(coalesce(p.proof->>'draw_administration_contact_share_consent_text',''))<>''
   and p.proof->>'promotion_responsibility_acknowledged'='true'
   and nullif(p.proof->>'promotion_responsibility_acknowledged_at','') is not null
   and btrim(coalesce(p.proof->>'promotion_disclosure_text',''))<>''
   and p.proof->>'age_of_majority_attested'='true' and p.proof->>'residency_attested'='true' and p.proof->>'exclusions_attested'='true'
   and nullif(p.proof->>'eligibility_attested_at','') is not null and nullif(p.proof->>'rules_viewed_at','') is not null
   and p.proof->>'apple_non_sponsor_acknowledged'='true' and nullif(p.proof->>'consented_at','') is not null
   and btrim(coalesce(p.proof->>'consent_text',''))<>''
   and not offer.activation_excluded_as_legacy_qa
   and not public.qr_bingo_participation_is_test(e.event_key,e.couple_bd_user_id)
   and not exists(select 1 from public.qr_bingo_legacy_qa_archives a where a.entry_id=e.id)
 ) select distinct on (v.event_key,v.couple_bd_user_id,v.rules_version)
   v.event_key,v.couple_bd_user_id,v.rules_version,v.accepted_at,v.source_entry_id
   from valid v order by v.event_key,v.couple_bd_user_id,v.rules_version,v.accepted_at,v.source_entry_id;
$$;
revoke all on function public.qr_bingo_participation_entry_evidence(uuid) from public,anon,authenticated;
grant execute on function public.qr_bingo_participation_entry_evidence(uuid) to service_role;

insert into public.qr_bingo_participation_acceptances(event_key,couple_bd_user_id,rules_version,notice_version,basis,accepted_at,source_entry_id)
 select event_key,couple_bd_user_id,rules_version,'','vendor_draw_entry',accepted_at,source_entry_id
 from public.qr_bingo_participation_entry_evidence(null)
 on conflict(event_key,couple_bd_user_id,rules_version,notice_version) do nothing;

-- Older installed clients can still send their existing vendor-specific Yes
-- contract. Capture only the resulting validated durable consent evidence.
create function public.capture_qr_bingo_entry_participation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.qr_bingo_participation_acceptances(event_key,couple_bd_user_id,rules_version,notice_version,basis,accepted_at,source_entry_id)
  select event_key,couple_bd_user_id,rules_version,'','vendor_draw_entry',accepted_at,source_entry_id
  from public.qr_bingo_participation_entry_evidence(new.id)
  on conflict(event_key,couple_bd_user_id,rules_version,notice_version) do nothing;
 return new;
end;
$$;
revoke all on function public.capture_qr_bingo_entry_participation() from public,anon,authenticated;
grant execute on function public.capture_qr_bingo_entry_participation() to service_role;
create trigger zz_capture_qr_bingo_entry_participation after insert or update of consented_at,consent_version,consent_share_contact,draw_administration_contact_share_acknowledged
 on public.qr_bingo_raffle_entries for each row execute function public.capture_qr_bingo_entry_participation();
