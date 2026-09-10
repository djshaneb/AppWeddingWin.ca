-- Admin contact-list membership only. No account, scan, entry, consent,
-- winner, delivery or website wedding-date records are changed.
alter table public.qr_bingo_contact_profiles
  add column admin_removed_at timestamptz,
  add column admin_added_at timestamptz;

comment on column public.qr_bingo_contact_profiles.admin_removed_at is
  'Recoverable exclusion from admin Contacts lists/downloads only. The app contact profile and all draw records remain unchanged.';
comment on column public.qr_bingo_contact_profiles.admin_added_at is
  'Set only when an authenticated website admin creates a contact for an existing genuine couple. This is not consent or a draw entry.';

create table public.qr_bingo_admin_contact_audit (
  request_id uuid primary key,
  event_key text not null,
  couple_bd_user_id text not null,
  action text not null check (action in ('contact_add','contact_remove','contact_restore')),
  operator_identity text not null check (length(btrim(operator_identity)) between 3 and 160 and operator_identity !~ '[<>[:cntrl:]]'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  expected_version bigint not null check (expected_version>=0),
  resulting_version bigint not null check (resulting_version>0),
  removed boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (event_key,couple_bd_user_id) references public.qr_bingo_contact_profiles(event_key,couple_bd_user_id) on delete cascade
);
comment on table public.qr_bingo_admin_contact_audit is
  'Metadata-only admin list-change audit/idempotency record. No contact values, consent or payload contents. Retained on removal/restore; purged with an actual account/profile privacy deletion.';
alter table public.qr_bingo_admin_contact_audit enable row level security;
revoke all on public.qr_bingo_admin_contact_audit from public,anon,authenticated,service_role;
grant select,insert on public.qr_bingo_admin_contact_audit to service_role;
create index qr_bingo_admin_contact_audit_member_idx on public.qr_bingo_admin_contact_audit(event_key,couple_bd_user_id,created_at);

create function public.manage_qr_bingo_admin_contact(
  p_action text,p_event_key text,p_couple_id text,p_expected_version bigint,
  p_request_id uuid,p_operator_identity text,p_contact jsonb,p_verified_couple jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  previous public.qr_bingo_contact_profiles%rowtype;
  updated public.qr_bingo_contact_profiles%rowtype;
  prior_request public.qr_bingo_admin_contact_audit%rowtype;
  fingerprint text;
  contact_name text;
  contact_email text;
  contact_phone text;
  contact_date text;
  contact_venue text;
begin
  if p_action is null or p_action not in ('contact_add','contact_remove','contact_restore')
    or p_event_key is null or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_event_key)>100
    or p_couple_id is null or p_couple_id !~ '^[1-9][0-9]{0,17}$'
    or p_request_id is null or p_expected_version is null or p_expected_version<0
    or p_operator_identity is null or length(btrim(p_operator_identity)) not between 3 and 160
    or p_operator_identity ~ '[<>[:cntrl:]]'
    or p_contact is null or jsonb_typeof(p_contact)<>'object'
    or (p_action='contact_add' and p_expected_version<>0)
    or (p_action<>'contact_add' and (p_expected_version<1 or p_contact<>'{}'::jsonb or p_verified_couple is not null))
  then raise exception using errcode='22023',message='Invalid admin contact-list request.'; end if;

  if p_action='contact_add' then
    if p_verified_couple is null or jsonb_typeof(p_verified_couple)<>'object'
      or p_verified_couple<>jsonb_build_object('id',p_couple_id,'subscription_id','18','active','2')
      or (select array_agg(key order by key) from jsonb_object_keys(p_contact) key)
        is distinct from array['email','name','phone','wedding_date','wedding_venue']::text[]
      or exists(select 1 from jsonb_each(p_contact) item where jsonb_typeof(item.value)<>'string')
    then raise exception using errcode='22023',message='A verified active Couples account is required.'; end if;
    contact_name:=p_contact->>'name'; contact_email:=p_contact->>'email';
    contact_phone:=p_contact->>'phone'; contact_date:=p_contact->>'wedding_date'; contact_venue:=p_contact->>'wedding_venue';
    if contact_name<>btrim(contact_name) or length(contact_name) not between 1 and 160
      or contact_name ~ '[<>[:cntrl:]]' or lower(contact_name) in ('couple','weddingwin','weddingwin couple')
      or length(contact_email) not between 3 and 254 or contact_email<>lower(btrim(contact_email))
      or contact_email !~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+[.][^[:space:]@<>;,]+$'
      or contact_email ~ '[[:cntrl:]]' or contact_email ~ '@privaterelay[.]appleid[.]com$'
      or length(contact_phone)>80 or contact_phone ~ '[<>[:cntrl:]]'
      or length(regexp_replace(contact_phone,'[^0-9]','','g')) not between 7 and 15
      or (contact_date<>'' and (contact_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or contact_date::date::text<>contact_date or extract(year from contact_date::date)<1900))
      or length(contact_venue)>200 or contact_venue ~ '[<>[:cntrl:]]' or (contact_venue<>'' and contact_date='')
    then raise exception using errcode='22023',message='Invalid admin contact details.'; end if;
  end if;

  -- A request UUID cannot be reused with different canonical fields. Store
  -- only its digest, not contact details. Acquire it before the member lock.
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'event',p_event_key,
    'couple',p_couple_id,'version',p_expected_version,'operator',p_operator_identity,
    'contact',p_contact,'verified_couple',p_verified_couple)::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-admin-contact-request:'||p_request_id::text,0));
  select * into prior_request from public.qr_bingo_admin_contact_audit where request_id=p_request_id;
  if found then
    if prior_request.request_fingerprint<>fingerprint then
      return jsonb_build_object('ok',false,'code','request_conflict');
    end if;
    return jsonb_build_object('ok',true,'action',prior_request.action,'dataset','contacts',
      'event_key',prior_request.event_key,'couple_id',prior_request.couple_bd_user_id,
      'request_id',p_request_id,'version',prior_request.resulting_version,'removed',prior_request.removed,'replayed',true);
  end if;

  if p_action='contact_add' then
    -- Shares deletion fencing with ordinary profile saves. A stale signed
    -- admin request cannot recreate a member after account deletion.
    perform public.lock_active_qr_bingo_contact_member(p_couple_id);
  else
    -- Existing removed/inactive contacts may be managed without reauthorizing
    -- the member, but still serialize with account deletion and normal saves.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact-member:'||p_couple_id,0));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact:'||p_event_key||':'||p_couple_id,0));
  select * into previous from public.qr_bingo_contact_profiles
    where event_key=p_event_key and couple_bd_user_id=p_couple_id for update;

  if p_action='contact_add' then
    if found then
      return jsonb_build_object('ok',false,'code',case when previous.admin_removed_at is null then 'contact_exists' else 'contact_removed' end,
        'current_version',previous.version);
    end if;
    if not exists(select 1 from public.qr_bingo_event_configs where event_key=p_event_key)
      and not exists(select 1 from public.qr_bingo_email_test_fixtures
        where event_key=p_event_key and couple_bd_user_id=p_couple_id) then
      return jsonb_build_object('ok',false,'code','event_unavailable');
    end if;
    insert into public.qr_bingo_contact_profiles(event_key,couple_bd_user_id,name,email,phone,wedding_date,wedding_venue,
      version,date_sync_pending,admin_added_at)
    values(p_event_key,p_couple_id,contact_name,contact_email,contact_phone,contact_date,contact_venue,1,false,clock_timestamp())
    returning * into updated;
  else
    if not found then return jsonb_build_object('ok',false,'code','contact_not_found'); end if;
    if previous.version<>p_expected_version then
      return jsonb_build_object('ok',false,'code','contact_conflict','current_version',previous.version);
    end if;
    if (p_action='contact_remove' and previous.admin_removed_at is not null)
      or (p_action='contact_restore' and previous.admin_removed_at is null) then
      return jsonb_build_object('ok',false,'code','contact_state_conflict','current_version',previous.version);
    end if;
    update public.qr_bingo_contact_profiles set
      admin_removed_at=case when p_action='contact_remove' then clock_timestamp() else null end,
      version=version+1,updated_at=clock_timestamp()
      where event_key=p_event_key and couple_bd_user_id=p_couple_id returning * into updated;
  end if;

  insert into public.qr_bingo_admin_contact_audit(request_id,event_key,couple_bd_user_id,action,operator_identity,
    request_fingerprint,expected_version,resulting_version,removed)
  values(p_request_id,p_event_key,p_couple_id,p_action,p_operator_identity,fingerprint,p_expected_version,updated.version,updated.admin_removed_at is not null);
  return jsonb_build_object('ok',true,'action',p_action,'dataset','contacts','event_key',p_event_key,
    'couple_id',p_couple_id,'request_id',p_request_id,'version',updated.version,'removed',updated.admin_removed_at is not null,'replayed',false);
end;
$$;
revoke all on function public.manage_qr_bingo_admin_contact(text,text,text,bigint,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.manage_qr_bingo_admin_contact(text,text,text,bigint,uuid,text,jsonb,jsonb) to service_role;

create function public.read_qr_bingo_admin_contacts(
  p_event_key text,p_vendor_id text,p_search text,p_offset integer,p_limit integer,p_contact_status text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_event_key is null or length(p_event_key)>100 or p_event_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_vendor_id is null or (p_vendor_id<>'' and p_vendor_id !~ '^[1-9][0-9]{0,19}$')
    or p_search is null or length(p_search)>120 or p_contact_status is null or p_contact_status not in ('active','removed','all')
    or p_offset is null or p_offset not between 0 and 1000000 or p_limit is null or p_limit not between 1 and 5001
  then raise exception using errcode='22023',message='Invalid QR contact-list filter.'; end if;
  with filtered as (
    select profile.* from public.qr_bingo_contact_profiles profile where profile.event_key=p_event_key
      and (p_contact_status='all' or (p_contact_status='removed')=(profile.admin_removed_at is not null))
      and (p_search='' or position(lower(p_search) in lower(concat_ws(' ',profile.couple_bd_user_id,profile.name,profile.email,profile.phone,profile.wedding_venue)))>0)
      and (p_vendor_id='' or exists(select 1 from public.qr_bingo_raffle_entries entry
        where entry.event_key=profile.event_key and entry.couple_bd_user_id=profile.couple_bd_user_id and entry.vendor_bingo_id=p_vendor_id
          and entry.consent_share_contact and entry.contact_share_scope='named_vendor_draw_administration'
          and entry.draw_administration_contact_share_acknowledged and entry.vendor_marketing_consent))
  ), paged as (
    select jsonb_build_object('couple_id',couple_bd_user_id,'name',name,'email',email,'phone',phone,
      'wedding_date',wedding_date,'wedding_venue',wedding_venue,'version',version,'updated_at',updated_at,
      'removed',admin_removed_at is not null,'removed_at',admin_removed_at,'source',case when admin_added_at is null then 'couple' else 'admin' end) as row_data
      from filtered order by updated_at desc,couple_bd_user_id limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(row_data) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.read_qr_bingo_admin_contacts(text,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.read_qr_bingo_admin_contacts(text,text,text,integer,integer,text) to service_role;

-- Older admin clients must also omit removed Contacts. Leave the existing
-- entries/winners branches byte-for-byte unchanged and reject schema drift.
do $legacy_reader$
declare original text;
begin
  original:=pg_get_functiondef('public.read_qr_bingo_admin_data(text,text,text,text,integer,integer)'::regprocedure);
  if md5(original)<>'74e52d079f50518d840bad55c7cc7bc1' then
    raise exception 'The admin data reader changed; review before applying this migration.';
  end if;
  execute replace(original,'profile.event_key=p_event_key','profile.event_key=p_event_key and profile.admin_removed_at is null');
end;
$legacy_reader$;
