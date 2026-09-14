-- Nonbinding, scan/display-only App Review setup. This never creates consent,
-- an enterable promotion, an entry, a selection, or a delivery.
create table public.qr_bingo_synthetic_fixture_setups (
 id uuid primary key,
 request_id uuid not null unique,
 fixture_id uuid not null unique,
 previous_fixture_id uuid not null unique,
 event_key text not null unique check(event_key='app-review-willow-demo-2026-38970'),
 previous_event_key text not null check(previous_event_key='app-review-weddingwin-2026-38970'),
 couple_bd_user_id text not null check(couple_bd_user_id='38971'),
 vendor_bd_user_id text not null check(vendor_bd_user_id='38970'),
 vendor_bingo_id text not null check(vendor_bingo_id='38970'),
 vendor_name text not null check(vendor_name='Willow & Bloom Floral Studio'),
 provenance text not null check(provenance='synthetic_fixture_setup'),
 operator_identity text not null check(operator_identity=btrim(operator_identity) and length(operator_identity) between 3 and 160 and operator_identity !~ '[<>[:cntrl:]]'),
 reason text not null check(reason=btrim(reason) and length(reason) between 3 and 500 and reason !~ '[<>[:cntrl:]]'),
 created_at timestamptz not null,
 expires_at timestamptz not null,
 vendor_offer_version timestamptz not null,
 previous_fixture_updated_at timestamptz not null,
 previous_vendor_offer_version timestamptz not null,
 published_config_revision bigint not null check(published_config_revision>0),
 rules_version text not null,
 official_rules_url text not null,
 prize_title text not null check(prize_title='Floral design consultation — demonstration'),
 prize_description text not null check(prize_description='Fictional demonstration only. No prize, booking, entry, winner or external message is created.'),
 prize_approx_value_cad numeric(12,2) not null check(prize_approx_value_cad=0),
 participant_disclosure text not null check(participant_disclosure='This is a nonbinding WeddingWin demonstration for John and Jane with Willow & Bloom Floral Studio. No legal agreement, draw entry, prize, booking, winner or external message is created. Choose No to keep only the sample scan.'),
 constraint qr_synthetic_setup_identity check(previous_fixture_id='623e7f5c-5d47-46dc-9d58-1df9e192667f'::uuid and fixture_id<>previous_fixture_id),
 constraint qr_synthetic_setup_time check(vendor_offer_version=created_at and expires_at>created_at and expires_at<=created_at+interval '7 days'),
 constraint qr_synthetic_setup_offer_fk foreign key(event_key,vendor_bingo_id,vendor_offer_version)
 references public.qr_bingo_vendor_offer_versions(event_key,vendor_bingo_id,vendor_offer_version) deferrable initially deferred
);
comment on table public.qr_bingo_synthetic_fixture_setups is
 'Immutable administrative nonbinding preview setup; not a vendor acceptance, signature, authority attestation, entry or real promotion. The referenced fixture must remain enabled, unexpired and externally suppressed at every use.';
alter table public.qr_bingo_synthetic_fixture_setups enable row level security;
revoke all on public.qr_bingo_synthetic_fixture_setups from public,anon,authenticated,service_role;
grant select,insert on public.qr_bingo_synthetic_fixture_setups to service_role;

alter table public.app_review_raffle_fixtures
 add column primary_superseded_at timestamptz,
 add column synthetic_fixture_setup_id uuid references public.qr_bingo_synthetic_fixture_setups(id);
alter table public.qr_bingo_raffle_settings
 add column synthetic_fixture_setup_id uuid references public.qr_bingo_synthetic_fixture_setups(id);
alter table public.qr_bingo_vendor_offer_versions
 add column synthetic_fixture_setup_id uuid references public.qr_bingo_synthetic_fixture_setups(id);
create index qr_synthetic_fixture_setup_idx on public.app_review_raffle_fixtures(synthetic_fixture_setup_id) where synthetic_fixture_setup_id is not null;
create index qr_synthetic_settings_setup_idx on public.qr_bingo_raffle_settings(synthetic_fixture_setup_id) where synthetic_fixture_setup_id is not null;
create index qr_synthetic_offer_setup_idx on public.qr_bingo_vendor_offer_versions(synthetic_fixture_setup_id) where synthetic_fixture_setup_id is not null;

-- Only the exact guarded transition below may supersede a primary mapping. Everyone else
-- retains the previous one-mapping-per-couple/vendor restriction, even disabled.
drop index public.app_review_raffle_fixture_couple_idx;
drop index public.app_review_raffle_fixture_vendor_idx;
create unique index app_review_raffle_fixture_couple_idx on public.app_review_raffle_fixtures(couple_bd_user_id) where primary_superseded_at is null;
create unique index app_review_raffle_fixture_vendor_idx on public.app_review_raffle_fixtures(vendor_bd_user_id) where primary_superseded_at is null;

create function public.guard_qr_bingo_synthetic_setup() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then
  raise exception using errcode='55000',message='Synthetic fixture provenance is immutable.';
 end if;
 if current_user<>'service_role' or current_setting('request.qr_bingo_synthetic_setup_id',true) is distinct from new.id::text then
  raise exception using errcode='42501',message='Use the guarded synthetic fixture provisioning RPC.';
 end if;
 return new;
end; $$;
revoke all on function public.guard_qr_bingo_synthetic_setup() from public,anon,authenticated,service_role;
create trigger guard_qr_bingo_synthetic_setup before insert or update or delete on public.qr_bingo_synthetic_fixture_setups for each row execute function public.guard_qr_bingo_synthetic_setup();

create function public.guard_qr_bingo_fixture_transition() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s public.qr_bingo_synthetic_fixture_setups%rowtype;
begin
 if tg_op='UPDATE' and old.primary_superseded_at is not null then
  if new is distinct from old then raise exception using errcode='55000',message='Superseded primary fixture mappings are immutable.'; end if;
  return new;
 end if;
 if new.primary_superseded_at is not null then
  select * into s from public.qr_bingo_synthetic_fixture_setups where previous_fixture_id=new.id;
  if tg_op<>'UPDATE' or s.id is null
   or current_user<>'service_role' or current_setting('request.qr_bingo_synthetic_setup_id',true) is distinct from s.id::text
   or new.primary_superseded_at is distinct from s.created_at or old.synthetic_fixture_setup_id is not null
   or (to_jsonb(new)-array['primary_superseded_at','updated_at']) is distinct from (to_jsonb(old)-array['primary_superseded_at','updated_at'])
  then raise exception using errcode='42501',message='Only the exact authorized fixture transition can supersede a primary mapping.'; end if;
  return new;
 end if;
 if tg_op='UPDATE' and old.synthetic_fixture_setup_id is not null then
  -- A later explicit shutdown is safe; identity/provenance/expiry cannot change
  -- and the fixture can never be re-enabled by ordinary settings mutation.
  if old.enabled and not new.enabled and (to_jsonb(new)-array['enabled','updated_at'])=(to_jsonb(old)-array['enabled','updated_at']) then return new; end if;
  if new is distinct from old then raise exception using errcode='55000',message='Synthetic fixture identity is immutable.'; end if;
  return new;
 end if;
 if new.synthetic_fixture_setup_id is null then
  if new.event_key='app-review-willow-demo-2026-38970' then raise exception using errcode='23514',message='Synthetic fixture provenance required.'; end if;
  return new;
 end if;
 select * into s from public.qr_bingo_synthetic_fixture_setups where id=new.synthetic_fixture_setup_id;
 if tg_op<>'INSERT' or s.id is null or current_user<>'service_role'
  or current_setting('request.qr_bingo_synthetic_setup_id',true) is distinct from s.id::text
  or row(new.id,new.event_key,new.couple_bd_user_id,new.vendor_bd_user_id,new.vendor_bingo_id,new.vendor_name,new.expires_at)
   is distinct from row(s.fixture_id,s.event_key,s.couple_bd_user_id,s.vendor_bd_user_id,s.vendor_bingo_id,s.vendor_name,s.expires_at)
  or new.enabled is distinct from true or new.suppress_outbound_email is distinct from true or new.allow_early_draw is distinct from false
  or new.vendor_qr_payload<>'https://www.weddingwin.ca/qr?vendor_id=38970'
 then raise exception using errcode='23514',message='Invalid synthetic fixture binding.'; end if;
 return new;
end; $$;
revoke all on function public.guard_qr_bingo_fixture_transition() from public,anon,authenticated,service_role;
create trigger guard_qr_bingo_fixture_transition before insert or update on public.app_review_raffle_fixtures for each row execute function public.guard_qr_bingo_fixture_transition();

create function public.guard_qr_bingo_synthetic_settings() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s public.qr_bingo_synthetic_fixture_setups%rowtype;
begin
 if tg_op='UPDATE' and old.synthetic_fixture_setup_id is not null then raise exception using errcode='55000',message='Synthetic preview settings are immutable and cannot become a real draw.'; end if;
 select * into s from public.qr_bingo_synthetic_fixture_setups where event_key=new.event_key;
 if s.id is null and new.synthetic_fixture_setup_id is null then return new; end if;
 if tg_op<>'INSERT' or s.id is null or new.synthetic_fixture_setup_id is distinct from s.id
  or current_setting('request.qr_bingo_synthetic_setup_id',true) is distinct from s.id::text
  or row(new.vendor_bingo_id,new.vendor_bd_user_id,new.vendor_name,new.prize_provider_name,new.prize_title,new.prize_description,new.prize_approx_value_cad,new.participant_responsibility_disclosure_text)
    is distinct from row(s.vendor_bingo_id,s.vendor_bd_user_id,s.vendor_name,s.vendor_name,s.prize_title,s.prize_description,s.prize_approx_value_cad,s.participant_disclosure)
  or new.enabled is distinct from false or new.legal_terms_accepted is distinct from false or new.legal_terms_accepted_at is not null or new.rules_viewed_at is not null
  or new.apple_non_sponsor_acknowledged is distinct from false or new.vendor_responsibility_acknowledged is distinct from false or new.vendor_responsibility_acknowledged_at is not null
  or coalesce(new.vendor_responsibility_disclosure_text,'')<>'' or coalesce(new.vendor_responsibility_version,'')<>''
  or new.legal_terms_version is distinct from s.rules_version or new.official_rules_url is distinct from s.official_rules_url
  or new.entry_closes_at is distinct from s.expires_at or new.draw_opens_at is distinct from s.expires_at or new.draw_at is distinct from s.expires_at
  or new.max_winners is distinct from 1 or new.exclude_previous_winners is distinct from true
  or not exists(select 1 from public.app_review_raffle_fixtures f where f.id=s.fixture_id and f.synthetic_fixture_setup_id=s.id and f.enabled and f.suppress_outbound_email and f.expires_at>clock_timestamp() and f.primary_superseded_at is null)
 then raise exception using errcode='23514',message='Invalid nonbinding synthetic settings.'; end if;
 -- Runs after the normal timestamp trigger, before the ordinary immutable
 -- snapshot capture. Only this newly inserted preview uses the setup timestamp.
 new.updated_at:=s.vendor_offer_version;
 return new;
end; $$;
revoke all on function public.guard_qr_bingo_synthetic_settings() from public,anon,authenticated,service_role;
create trigger zz_guard_qr_bingo_synthetic_settings before insert or update on public.qr_bingo_raffle_settings for each row execute function public.guard_qr_bingo_synthetic_settings();

create function public.bind_qr_bingo_synthetic_offer_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $$
declare s public.qr_bingo_synthetic_fixture_setups%rowtype;
begin
 select * into s from public.qr_bingo_synthetic_fixture_setups where event_key=new.event_key;
 if s.id is null and new.synthetic_fixture_setup_id is null then return new; end if;
 if s.id is null or current_setting('request.qr_bingo_synthetic_setup_id',true) is distinct from s.id::text
  or row(new.vendor_bingo_id,new.vendor_bd_user_id,new.vendor_name,new.vendor_offer_version,new.prize_provider_name,new.prize_title,new.prize_description,new.prize_approx_value_cad,new.participant_responsibility_disclosure_text)
   is distinct from row(s.vendor_bingo_id,s.vendor_bd_user_id,s.vendor_name,s.vendor_offer_version,s.vendor_name,s.prize_title,s.prize_description,s.prize_approx_value_cad,s.participant_disclosure)
  or new.enabled is distinct from false or new.offer_enterable is distinct from false or new.legal_terms_accepted is distinct from false or new.legal_terms_accepted_at is not null or new.rules_viewed_at is not null
  or new.apple_non_sponsor_acknowledged is distinct from false or new.vendor_responsibility_acknowledged is distinct from false or new.vendor_responsibility_acknowledged_at is not null
  or new.rules_version is distinct from s.rules_version or new.event_revision is distinct from s.published_config_revision
 then raise exception using errcode='23514',message='Invalid synthetic immutable offer.'; end if;
 new.synthetic_fixture_setup_id:=s.id;
 return new;
end; $$;
revoke all on function public.bind_qr_bingo_synthetic_offer_snapshot() from public,anon,authenticated,service_role;
create trigger bind_qr_bingo_synthetic_offer_snapshot before insert on public.qr_bingo_vendor_offer_versions for each row execute function public.bind_qr_bingo_synthetic_offer_snapshot();

create function public.deny_qr_bingo_synthetic_participation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare old_event text;
begin
 if tg_op='UPDATE' then old_event:=old.event_key; end if;
 if new.event_key like 'app-review-%' or old_event like 'app-review-%' then
  perform pg_advisory_xact_lock(hashtextextended('qr_bingo_event_config_publish',0));
  if exists(select 1 from public.qr_bingo_synthetic_fixture_setups s where s.event_key in(new.event_key,old_event))
   or exists(select 1 from public.app_review_raffle_fixtures f where f.primary_superseded_at is not null and ((f.event_key=new.event_key and f.couple_bd_user_id=new.couple_bd_user_id) or (tg_op='UPDATE' and f.event_key=old_event and f.couple_bd_user_id=old.couple_bd_user_id)))
  then raise exception using errcode='55000',message='This nonbinding or superseded primary fixture cannot accept entries, winners or delivery actions.'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.deny_qr_bingo_synthetic_participation() from public,anon,authenticated,service_role;
create trigger a00_deny_qr_synthetic_entries before insert or update on public.qr_bingo_raffle_entries for each row execute function public.deny_qr_bingo_synthetic_participation();
create trigger a00_deny_qr_synthetic_draws before insert or update on public.qr_bingo_raffle_draws for each row execute function public.deny_qr_bingo_synthetic_participation();

-- Keep ordinary participant mappings unchanged. The new preview admits only
-- its exact primary couple, including direct/previously in-flight scan RPCs.
create function public.guard_qr_bingo_synthetic_fixture_access() returns trigger
language plpgsql security invoker set search_path='' as $$
declare f public.app_review_raffle_fixtures%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('qr_bingo_event_config_publish',0));
 select * into f from public.app_review_raffle_fixtures where id=new.fixture_id;
 if f.synthetic_fixture_setup_id is not null then
  if tg_table_name='app_review_raffle_fixture_participants'
   or new.couple_bd_user_id is distinct from f.couple_bd_user_id
   or to_jsonb(new)->>'vendor_bingo_id' is distinct from f.vendor_bingo_id
   or f.enabled is distinct from true or f.suppress_outbound_email is distinct from true or f.expires_at<=clock_timestamp()
  then raise exception using errcode='42501',message='Synthetic fixture access is limited to its exact active preview pair.'; end if;
 elsif f.primary_superseded_at is not null and new.couple_bd_user_id=f.couple_bd_user_id then
  raise exception using errcode='42501',message='The primary couple must use its current fixture mapping.';
 end if;
 -- Moving an existing synthetic scan/participant cannot detach its provenance.
 if tg_op='UPDATE' and (new.fixture_id,new.couple_bd_user_id) is distinct from (old.fixture_id,old.couple_bd_user_id)
  and exists(select 1 from public.app_review_raffle_fixtures x where x.id=old.fixture_id and x.synthetic_fixture_setup_id is not null)
 then raise exception using errcode='55000',message='Synthetic scan provenance cannot be reassigned.'; end if;
 return new;
end; $$;
revoke all on function public.guard_qr_bingo_synthetic_fixture_access() from public,anon,authenticated,service_role;
create trigger guard_qr_bingo_synthetic_fixture_scans before insert or update on public.app_review_raffle_fixture_scans for each row execute function public.guard_qr_bingo_synthetic_fixture_access();
create trigger guard_qr_bingo_synthetic_fixture_participants before insert or update on public.app_review_raffle_fixture_participants for each row execute function public.guard_qr_bingo_synthetic_fixture_access();

create function public.provision_qr_bingo_synthetic_fixture(
 p_request_id uuid,p_source_fixture_id uuid,p_expected_source_updated_at timestamptz,
 p_expected_vendor_offer_version timestamptz,p_expected_published_revision bigint,
 p_operator_identity text,p_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.qr_bingo_synthetic_fixture_setups%rowtype; f public.app_review_raffle_fixtures%rowtype;
 config public.qr_bingo_event_configs%rowtype; settings public.qr_bingo_raffle_settings%rowtype;
 setup_id uuid:=gen_random_uuid(); fixture_id uuid:=gen_random_uuid(); stamp timestamptz; cutoff timestamptz; previous_context text;
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='Service-role authorization required.'; end if;
 if p_request_id is null or p_source_fixture_id is distinct from '623e7f5c-5d47-46dc-9d58-1df9e192667f'::uuid
  or p_expected_source_updated_at is null or p_expected_vendor_offer_version is null or p_expected_published_revision is null or p_expected_published_revision<1
  or p_operator_identity is null or p_operator_identity<>btrim(p_operator_identity) or length(p_operator_identity) not between 3 and 160 or p_operator_identity ~ '[<>[:cntrl:]]'
  or p_reason is null or p_reason<>btrim(p_reason) or length(p_reason) not between 3 and 500 or p_reason ~ '[<>[:cntrl:]]'
 then raise exception using errcode='22023',message='Exact source fixture, revision, operator, reason and request required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('qr-synthetic-request:'||p_request_id::text,0));
 select * into prior from public.qr_bingo_synthetic_fixture_setups where request_id=p_request_id;
 if found then
  if row(prior.previous_fixture_id,prior.previous_fixture_updated_at,prior.previous_vendor_offer_version,prior.published_config_revision,prior.operator_identity,prior.reason)
   is distinct from row(p_source_fixture_id,p_expected_source_updated_at,p_expected_vendor_offer_version,p_expected_published_revision,p_operator_identity,p_reason)
  then raise exception using errcode='23505',message='Synthetic fixture request identity conflict.'; end if;
  return jsonb_build_object('ok',true,'synthetic_fixture_setup_id',prior.id,'fixture_id',prior.fixture_id,'previous_fixture_id',prior.previous_fixture_id,'event_key',prior.event_key,'previous_event_key',prior.previous_event_key,'vendor_offer_version',prior.vendor_offer_version,'provenance',prior.provenance,'replayed',true);
 end if;
 -- Existing publication -> promotion -> row lock order. Read-only config needs
 -- no row lock (service_role intentionally has SELECT-only configuration grants).
 perform pg_advisory_xact_lock(hashtextextended('qr_bingo_event_config_publish',0));
 perform pg_advisory_xact_lock(hashtextextended('app-review-weddingwin-2026-38970:38970',0));
 perform pg_advisory_xact_lock(hashtextextended('app-review-willow-demo-2026-38970:38970',0));
 select * into config from public.qr_bingo_event_configs where published;
 if config.id is null or config.event_key<>'niagara-wedding-show-2026' or config.revision<>p_expected_published_revision
  or config.rules_version<>'2026-09-01-in-person-entry'
 then raise exception using errcode='55000',message='Published fixture context changed.'; end if;
 select * into f from public.app_review_raffle_fixtures where id=p_source_fixture_id for update;
 if f.id is null or f.event_key<>'app-review-weddingwin-2026-38970' or f.couple_bd_user_id<>'38971' or f.vendor_bd_user_id<>'38970' or f.vendor_bingo_id<>'38970'
  or f.vendor_name<>'Willow & Bloom Floral Studio' or not f.enabled or not f.suppress_outbound_email or f.expires_at<=clock_timestamp()
  or f.primary_superseded_at is not null or f.synthetic_fixture_setup_id is not null or f.updated_at<>p_expected_source_updated_at
 then raise exception using errcode='55000',message='Source fixture changed, expired or is not the authorized isolated pair.'; end if;
 select * into settings from public.qr_bingo_raffle_settings where event_key=f.event_key and vendor_bingo_id=f.vendor_bingo_id for update;
 if settings.id is null or settings.vendor_bd_user_id<>'38970' or settings.updated_at<>p_expected_vendor_offer_version
  or not exists(select 1 from public.qr_bingo_vendor_offer_versions o where o.event_key=f.event_key and o.vendor_bingo_id=f.vendor_bingo_id and o.vendor_offer_version=settings.updated_at)
 then raise exception using errcode='55000',message='Source immutable offer changed.'; end if;
 if exists(select 1 from public.qr_bingo_synthetic_fixture_setups)
  or exists(select 1 from public.qr_bingo_raffle_entries where event_key=f.event_key and card_reset_at is null)
  or exists(select 1 from public.qr_bingo_raffle_draws where event_key=f.event_key)
  or exists(select 1 from public.qr_bingo_raffle_settings where event_key='app-review-willow-demo-2026-38970')
  or exists(select 1 from public.app_review_raffle_fixtures where event_key='app-review-willow-demo-2026-38970')
 then raise exception using errcode='55000',message='Fixture transition requires an unused destination and no active participation or draw history.'; end if;
 stamp:=clock_timestamp(); cutoff:=least(f.expires_at,stamp+interval '7 days');
 previous_context:=current_setting('request.qr_bingo_synthetic_setup_id',true);
 perform set_config('request.qr_bingo_synthetic_setup_id',setup_id::text,true);
 insert into public.qr_bingo_synthetic_fixture_setups values(
  setup_id,p_request_id,fixture_id,f.id,'app-review-willow-demo-2026-38970',f.event_key,'38971','38970','38970','Willow & Bloom Floral Studio','synthetic_fixture_setup',p_operator_identity,p_reason,stamp,cutoff,stamp,f.updated_at,settings.updated_at,config.revision,config.rules_version,config.official_rules_url,
  'Floral design consultation — demonstration','Fictional demonstration only. No prize, booking, entry, winner or external message is created.',0,
  'This is a nonbinding WeddingWin demonstration for John and Jane with Willow & Bloom Floral Studio. No legal agreement, draw entry, prize, booking, winner or external message is created. Choose No to keep only the sample scan.'
 );
 update public.app_review_raffle_fixtures set primary_superseded_at=stamp,updated_at=stamp where id=f.id;
 insert into public.app_review_raffle_fixtures(id,event_key,couple_bd_user_id,vendor_bd_user_id,vendor_bingo_id,vendor_name,vendor_qr_payload,enabled,allow_early_draw,suppress_outbound_email,expires_at,created_at,updated_at,synthetic_fixture_setup_id)
 values(fixture_id,'app-review-willow-demo-2026-38970','38971','38970','38970','Willow & Bloom Floral Studio','https://www.weddingwin.ca/qr?vendor_id=38970',true,false,true,cutoff,stamp,stamp,setup_id);
 insert into public.qr_bingo_raffle_settings(event_key,vendor_bingo_id,vendor_bd_user_id,vendor_name,enabled,prize_title,prize_description,prize_approx_value_cad,eligibility_region,entry_closes_at,draw_opens_at,draw_at,odds_basis,no_purchase_required,skill_testing_question_required,alternate_free_entry_url,legal_terms_accepted,legal_terms_version,legal_terms_accepted_at,rules_viewed_at,official_rules_url,administrator_name,co_sponsor_name,prize_provider_name,apple_non_sponsor_acknowledged,vendor_responsibility_acknowledged,vendor_responsibility_disclosure_text,vendor_responsibility_acknowledged_at,vendor_responsibility_version,participant_responsibility_disclosure_text,max_winners,exclude_previous_winners,synthetic_fixture_setup_id)
 select s.event_key,s.vendor_bingo_id,s.vendor_bd_user_id,s.vendor_name,false,s.prize_title,s.prize_description,0,'Controlled fictional review accounts only',cutoff,cutoff,cutoff,'Not applicable: no entry, selection or prize.',true,true,config.alternate_free_entry_url,false,config.rules_version,null,null,config.official_rules_url,'Wedding Win Inc.','',s.vendor_name,false,false,'',null,'',s.participant_disclosure,1,true,s.id from public.qr_bingo_synthetic_fixture_setups s where s.id=setup_id;
 perform set_config('request.qr_bingo_synthetic_setup_id',coalesce(previous_context,''),true);
 return jsonb_build_object('ok',true,'synthetic_fixture_setup_id',setup_id,'fixture_id',fixture_id,'previous_fixture_id',f.id,'event_key','app-review-willow-demo-2026-38970','previous_event_key',f.event_key,'vendor_offer_version',stamp,'provenance','synthetic_fixture_setup','replayed',false);
end; $$;
revoke all on function public.provision_qr_bingo_synthetic_fixture(uuid,uuid,timestamptz,timestamptz,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.provision_qr_bingo_synthetic_fixture(uuid,uuid,timestamptz,timestamptz,bigint,text,text) to service_role;
