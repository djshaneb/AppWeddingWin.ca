-- The show-day prize deadline and revised responsibilities are a new notice.
-- Historical receipts remain truthful: no accepted_at, basis, version or
-- contact data is changed, and there is no implicit upgrade of old consent.
do $$
begin
  if (select md5(pg_catalog.pg_get_functiondef(p.oid)) from pg_catalog.pg_proc p
      where p.oid='public.record_qr_bingo_participation_acceptance(text,text,text,text,text,bigint,text,bigint)'::regprocedure)
      is distinct from 'f7465f739fd94cf2c143eb913c417b0f' then
    raise exception 'Unexpected participation ledger baseline; review before applying.';
  end if;
end;
$$;
alter table public.qr_bingo_participation_acceptances
  drop constraint qr_bingo_participation_evidence_present,
  add constraint qr_bingo_participation_evidence_present check (
    (basis='vendor_draw_entry' and notice_version='' and source_entry_id is not null)
    or (profile_event_key is not null and (
      (basis in ('explicit_notice','cached_notice','notice_on_use')
        and notice_version=rules_version||'|2026-09-04-pre-scan-draw-consent')
      or (basis='explicit_notice'
        and notice_version=rules_version||'|2026-09-14-showday-prize-lock')
    ))
  );
comment on table public.qr_bingo_participation_acceptances is
  'Immutable versioned QR agreement evidence. Old cached/on-use and named-vendor receipts retain their original basis and time. The September 14 show-day prize notice requires explicit first acceptance; cache/use may only replay that exact receipt. No contact PII is copied.';

create or replace function public.record_qr_bingo_participation_acceptance(
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
 or p_notice_version is distinct from config.rules_version||'|2026-09-14-showday-prize-lock'
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
 -- A local cache or scan request cannot establish first acceptance of new
 -- material terms. Replays only return a real current explicit receipt.
 select * into receipt from public.qr_bingo_participation_acceptances
  where event_key=p_event_key and couple_bd_user_id=p_couple_id
    and rules_version=p_rules_version and notice_version=p_notice_version and basis='explicit_notice';
 if found then return jsonb_build_object('ok',true,'receipt',to_jsonb(receipt)); end if;
 if p_basis<>'explicit_notice' then
  return jsonb_build_object('ok',false,'code','participation_notice_required');
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
