-- New server-authorized deletion enqueues default to full cleanup of the
-- enrolled Apple account: website receipt, verified missing-member recovery,
-- or supported native full deletion. Explicit false preserves permission-only
-- callers. Existing jobs are NEVER upgraded or replayed.
-- This migration performs no account deletion, legacy enrollment, or email scan.
alter table apple_private.deletion_jobs
  add column if not exists full_cleanup boolean not null default false,
  add column if not exists cleanup_profile_id uuid,
  add column if not exists cleanup_prepared_at timestamptz,
  add column if not exists cleanup_completed_at timestamptz;

-- Keep the established permission worker behind one new service-only wrapper.
do $migration$
begin
  if to_regprocedure('public.apple_grant_operation_permission_v1(text,jsonb)') is null then
    alter function public.apple_grant_operation(text,jsonb)
      rename to apple_grant_operation_permission_v1;
  end if;
end;
$migration$;
revoke all on function public.apple_grant_operation_permission_v1(text,jsonb)
  from public,anon,authenticated,service_role;

-- A different login provider must not reattach the exact old Auth/profile UUID
-- while a full deletion is pending. Unrelated/new account UUIDs remain usable.
-- DELETE is deliberately allowed: GoTrue's supported delete cascades profiles.
create or replace function apple_private.protect_pending_cleanup_profile()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if exists (
    select 1 from apple_private.deletion_jobs j
     where j.full_cleanup and j.cleanup_profile_id is not null
       and j.status <> 'complete'
       and (j.cleanup_profile_id = new.id
         or j.bd_member_id = nullif(btrim(new.bd_member_id),'')
         or (tg_op='UPDATE' and j.cleanup_profile_id = old.id))
  ) then
    raise exception 'APPLE_ACCOUNT_DELETION_PENDING';
  end if;
  return new;
end;
$$;
revoke all on function apple_private.protect_pending_cleanup_profile()
  from public,anon,authenticated,service_role;
drop trigger if exists apple_pending_cleanup_profile on public.profiles;
create trigger apple_pending_cleanup_profile before insert or update on public.profiles
  for each row execute function apple_private.protect_pending_cleanup_profile();

-- Every destructive phase is authorized against the immutable old generation,
-- never a caller-supplied email/profile or a freshly resolved replacement user.
create or replace function apple_private.require_full_cleanup_job(
  p_data jsonb, p_min_remaining_seconds integer default 0
)
returns apple_private.deletion_jobs
language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_job apple_private.deletion_jobs%rowtype;
  v_identity apple_private.identities%rowtype;
  v_profile public.profiles%rowtype;
  v_email text;
  v_identity_count integer;
  v_deadline timestamptz := clock_timestamp()
    + make_interval(secs=>greatest(0,p_min_remaining_seconds));
begin
  select * into v_job from apple_private.deletion_jobs
   where id=(p_data->>'id')::uuid for update;
  if not found or v_job.status <> 'running'
     or v_job.lease_token is distinct from (p_data->>'leaseToken')::uuid
     or v_job.lease_until is null or v_job.lease_until <= v_deadline then
    raise exception 'APPLE_JOB_LEASE_LOST';
  end if;
  if not v_job.full_cleanup or v_job.cleanup_profile_id is null then
    raise exception 'APPLE_CLEANUP_IDENTITY_UNAVAILABLE';
  end if;
  if p_data ? 'profileId'
     and (p_data->>'profileId') is distinct from v_job.cleanup_profile_id::text then
    raise exception 'APPLE_CLEANUP_IDENTITY_MISMATCH';
  end if;
  if v_job.expected_grants=0
     or (select count(*) from apple_private.job_grants where job_id=v_job.id)
        <> v_job.expected_grants
     or exists(select 1 from apple_private.job_grants
                where job_id=v_job.id and revoked_at is null) then
    raise exception 'APPLE_GRANTS_REMAIN';
  end if;
  select count(*) into v_identity_count from apple_private.identities i
   where exists(select 1 from apple_private.job_grants j
                 where j.job_id=v_job.id and j.identity_id=i.id and j.generation=i.generation);
  if v_identity_count<>1 then raise exception 'APPLE_CLEANUP_IDENTITY_MISMATCH'; end if;
  select i.* into v_identity from apple_private.identities i
   where exists(select 1 from apple_private.job_grants j
                 where j.job_id=v_job.id and j.identity_id=i.id and j.generation=i.generation)
   for update;
  if v_identity.status <> 'revoking'
     or v_identity.bd_member_id is distinct from v_job.bd_member_id
     or v_identity.profile_id is distinct from v_job.cleanup_profile_id
     or v_identity.lease_token is distinct from v_job.lease_token
     or v_identity.lease_until is null or v_identity.lease_until <= v_deadline
     or exists(select 1 from apple_private.job_grants j where j.job_id=v_job.id
                and (j.identity_id<>v_identity.id or j.generation<>v_identity.generation))
     or exists(select 1 from apple_private.identities i
                where i.profile_id=v_job.cleanup_profile_id and i.id<>v_identity.id) then
    raise exception 'APPLE_CLEANUP_IDENTITY_MISMATCH';
  end if;
  select * into v_profile from public.profiles
   where id=v_job.cleanup_profile_id for update;
  if found then
    select lower(btrim(email)) into v_email from auth.users where id=v_job.cleanup_profile_id;
    if btrim(coalesce(v_profile.bd_member_id,''))<>v_job.bd_member_id
       or btrim(coalesce(v_profile.apple_sub,''))<>v_identity.apple_sub
       or v_email is null or v_email=''
       or lower(btrim(coalesce(v_profile.email,'')))<>v_email then
      raise exception 'APPLE_CLEANUP_PROFILE_CHANGED';
    end if;
  elsif exists(select 1 from auth.users where id=v_job.cleanup_profile_id) then
    -- Missing profile is valid after a successful GoTrue deletion, not a new
    -- reason to guess which still-live Auth account should be removed.
    raise exception 'APPLE_CLEANUP_PROFILE_CHANGED';
  end if;
  if exists(select 1 from public.profiles
             where btrim(coalesce(bd_member_id,''))=v_job.bd_member_id
               and id<>v_job.cleanup_profile_id) then
    raise exception 'APPLE_CLEANUP_PROFILE_CHANGED';
  end if;
  return v_job;
end;
$$;
revoke all on function apple_private.require_full_cleanup_job(jsonb,integer)
  from public,anon,authenticated,service_role;

create or replace function public.apple_grant_operation(
  p_action text, p_data jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_job apple_private.deletion_jobs%rowtype;
  v_identity apple_private.identities%rowtype;
  v_result jsonb;
  v_purge jsonb;
  v_exchanges jsonb;
  v_bd text;
  v_profile uuid;
  v_count integer;
  v_full boolean;
  v_token text;
  v_cookie text;
  v_email text;
  v_until timestamptz;
begin
  if p_action='enqueue' then
    v_bd:=p_data->>'bdMemberId';
    if v_bd is null or v_bd !~ '^[1-9][0-9]{0,18}$' then
      raise exception 'Invalid deleted member';
    end if;
    if p_data ? 'fullCleanup' and jsonb_typeof(p_data->'fullCleanup')<>'boolean' then
      raise exception 'Invalid account cleanup request';
    end if;
    -- Default old deployed receipt/recovery callers to the same safe cleanup,
    -- so whichever arrives first cannot strand a permission-only snapshot.
    v_full:=coalesce((p_data->>'fullCleanup')::boolean,true);
    -- Serialize the existence check with creation, including permission-only
    -- callers. A delayed receipt must not upgrade any historical snapshot.
    perform pg_advisory_xact_lock(hashtextextended('apple-deletion:'||v_bd,0));
    select * into v_job from apple_private.deletion_jobs where bd_member_id=v_bd;
    if found then
      return jsonb_build_object('jobId',v_job.id,'status',v_job.status,
        'expectedGrants',v_job.expected_grants,'fullCleanup',v_job.full_cleanup);
    end if;
    v_result:=public.apple_grant_operation_permission_v1(p_action,p_data);
    select * into v_job from apple_private.deletion_jobs where id=(v_result->>'jobId')::uuid for update;
    if v_full then
      -- Enrolled private identity is the only deletion authority. Editable
      -- profile fields and email-only matches never enroll a deletion target.
      select count(*) into v_count from apple_private.identities i
       where i.bd_member_id=v_bd and exists(select 1 from apple_private.job_grants j
         where j.job_id=v_job.id and j.identity_id=i.id and j.generation=i.generation);
      if v_count=1 and v_job.expected_grants>0 then
        select i.* into v_identity from apple_private.identities i
         where i.bd_member_id=v_bd and exists(select 1 from apple_private.job_grants j
           where j.job_id=v_job.id and j.identity_id=i.id and j.generation=i.generation)
         for update;
        v_profile:=v_identity.profile_id;
        -- Lock a present profile before publishing its deletion barrier.
        perform 1 from public.profiles where id=v_profile for update;
      end if;
      update apple_private.deletion_jobs
         set full_cleanup=true,cleanup_profile_id=v_profile,
             status=case when v_profile is null then 'no_credential' else status end,
             last_reason=case when v_profile is null then 'manual_account_cleanup_required' else last_reason end
       where id=v_job.id returning * into v_job;
    end if;
    return jsonb_build_object('jobId',v_job.id,'status',v_job.status,
      'expectedGrants',v_job.expected_grants,'fullCleanup',v_job.full_cleanup);
  elsif p_action='claim' then
    v_result:=public.apple_grant_operation_permission_v1(p_action,p_data);
    if v_result is null or v_result='null'::jsonb then return v_result; end if;
    select * into v_job from apple_private.deletion_jobs where id=(v_result->>'id')::uuid for update;
    if v_job.full_cleanup then
      -- A retry after the final grant was confirmed still needs a live identity
      -- lease for Auth/purge. The permission-only claim renewed pending grants.
      update apple_private.identities i
         set lease_token=v_job.lease_token,lease_until=v_job.lease_until
       where i.status='revoking' and i.bd_member_id=v_job.bd_member_id
         and i.profile_id=v_job.cleanup_profile_id
         and exists(select 1 from apple_private.job_grants j where j.job_id=v_job.id
           and j.identity_id=i.id and j.generation=i.generation);
    end if;
    return v_result||jsonb_build_object('fullCleanup',v_job.full_cleanup,
      'profileId',v_job.cleanup_profile_id);
  elsif p_action in ('job_cleanup_prepare','job_cleanup_validate','job_cleanup_finish') then
    v_job:=apple_private.require_full_cleanup_job(p_data,
      case when p_action='job_cleanup_validate' then 10 else 0 end);
    select i.* into v_identity from apple_private.identities i
     where i.bd_member_id=v_job.bd_member_id and i.profile_id=v_job.cleanup_profile_id
       and exists(select 1 from apple_private.job_grants j where j.job_id=v_job.id
         and j.identity_id=i.id and j.generation=i.generation);
    v_until:=least(v_job.lease_until,v_identity.lease_until);
    if p_action='job_cleanup_prepare' then
      if v_job.cleanup_completed_at is null then
        select token,cookie into v_token,v_cookie from public.bd_users_cache
         where user_id=v_job.bd_member_id;
        select email into v_email from auth.users where id=v_job.cleanup_profile_id;
        perform public.stage_weddingwin_member_chat_redaction(
          v_job.bd_member_id,coalesce(v_token,''),coalesce(v_cookie,''),
          coalesce(v_email,''),v_identity.apple_sub,v_job.cleanup_profile_id::text);
        update apple_private.deletion_jobs
           set cleanup_prepared_at=coalesce(cleanup_prepared_at,now()) where id=v_job.id;
      end if;
    elsif p_action='job_cleanup_validate' then
      if v_job.cleanup_prepared_at is null then raise exception 'APPLE_CLEANUP_NOT_PREPARED'; end if;
    else
      if v_job.cleanup_prepared_at is null then raise exception 'APPLE_CLEANUP_NOT_PREPARED'; end if;
      if exists(select 1 from auth.users where id=v_job.cleanup_profile_id) then
        raise exception 'APPLE_CLEANUP_AUTH_REMAINS';
      end if;
      if v_job.cleanup_completed_at is null then
        select token,cookie into v_token,v_cookie from public.bd_users_cache
         where user_id=v_job.bd_member_id;
        v_exchanges:=public.purge_member_app_auth_exchanges(v_job.bd_member_id);
        v_purge:=public.purge_weddingwin_member_data_with_chat_redaction(
          v_job.bd_member_id,coalesce(v_token,''),coalesce(v_cookie,''));
        update apple_private.deletion_jobs set cleanup_completed_at=now() where id=v_job.id;
      end if;
    end if;
    return jsonb_build_object('profileId',v_job.cleanup_profile_id,'leaseUntil',v_until);
  elsif p_action='job_finish' then
    select * into v_job from apple_private.deletion_jobs where id=(p_data->>'id')::uuid for update;
    if found and v_job.full_cleanup then
      v_job:=apple_private.require_full_cleanup_job(p_data);
      if v_job.cleanup_completed_at is null then raise exception 'APPLE_ACCOUNT_CLEANUP_REMAINS'; end if;
      if exists(select 1 from auth.users where id=v_job.cleanup_profile_id)
         or exists(select 1 from public.profiles where id=v_job.cleanup_profile_id
                    or btrim(coalesce(bd_member_id,''))=v_job.bd_member_id)
         or exists(select 1 from public.bd_users_cache where user_id=v_job.bd_member_id) then
        raise exception 'APPLE_ACCOUNT_CLEANUP_REMAINS';
      end if;
    end if;
  end if;
  return public.apple_grant_operation_permission_v1(p_action,p_data);
end;
$$;
revoke all on function public.apple_grant_operation(text,jsonb) from public,anon,authenticated;
grant execute on function public.apple_grant_operation(text,jsonb) to service_role;

-- The pre-existing staging RPC receives the same email from cache, Auth and
-- profile. Its ON CONFLICT DO UPDATE cannot update one key twice in one INSERT.
-- Deduplicate the final hash rows (also covering whitespace-equivalent exact
-- aliases) without replacing the large, otherwise unchanged retention helper.
-- Fail closed if its deployed body differs from either expected version.
do $redaction_dedup$
declare
  v_rpc regprocedure := to_regprocedure('public.stage_weddingwin_member_chat_redaction(text,text,text,text,text,text)');
  v_definition text;
  v_before text;
  v_after text;
  v_old_count integer;
  v_new_count integer;
begin
  if v_rpc is null then raise exception 'Required chat identity staging function is missing'; end if;
  v_definition:=pg_get_functiondef(v_rpc);
  foreach v_before in array array[
    E'  select\n    v_member_hash,\n    weddingwin_private.chat_identity_hash(identity_value),',
    E'  select\n    v_member_hash,\n    weddingwin_private.chat_identity_hash(lower(identity_value)),'
  ] loop
    v_after:=replace(v_before,E'  select\n',E'  select distinct\n');
    v_old_count:=(length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before);
    v_new_count:=(length(v_definition)-length(replace(v_definition,v_after,'')))/length(v_after);
    if v_old_count=1 and v_new_count=0 then
      v_definition:=replace(v_definition,v_before,v_after);
    elsif v_old_count<>0 or v_new_count<>1 then
      raise exception 'Chat identity staging body changed; refusing an unverified rewrite';
    end if;
  end loop;
  execute v_definition;
end;
$redaction_dedup$;
