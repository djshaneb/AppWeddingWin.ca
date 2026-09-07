-- Future, permission-only Apple revocation. No existing members are scanned,
-- deleted, or enrolled by this migration; no application profile is purged.
create schema if not exists apple_private;
revoke all on schema apple_private from public, anon, authenticated;

create table if not exists apple_private.identities (
  id uuid primary key default gen_random_uuid(),
  generation uuid not null default gen_random_uuid(),
  team_id text not null check (length(team_id) between 1 and 255),
  apple_sub text not null check (length(apple_sub) between 1 and 255),
  bd_member_id text check (bd_member_id ~ '^[1-9][0-9]{0,18}$'),
  profile_id uuid,
  status text not null default 'active' check (status in ('active','revoking')),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id,apple_sub),
  unique (id,generation)
);
create table if not exists apple_private.grants (
  id uuid primary key,
  identity_id uuid not null,
  generation uuid not null,
  client_id text not null check (length(client_id) between 1 and 255),
  bd_member_id text not null check (bd_member_id ~ '^[1-9][0-9]{0,18}$'),
  profile_id uuid not null,
  ciphertext text not null check (length(ciphertext) between 20 and 20000),
  iv text not null check (iv ~ '^[A-Za-z0-9_-]{16}$'),
  key_version integer not null check (key_version=1),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (identity_id,generation) references apple_private.identities(id,generation) on delete restrict,
  unique(identity_id,generation,client_id,token_hash)
);
create table if not exists apple_private.deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  bd_member_id text not null unique check (bd_member_id ~ '^[1-9][0-9]{0,18}$'),
  status text not null check (status in ('pending','running','retry','complete','no_credential')),
  expected_grants integer not null default 0,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists apple_private.job_grants (
  job_id uuid not null references apple_private.deletion_jobs(id) on delete cascade,
  grant_id uuid not null,
  identity_id uuid not null,
  generation uuid not null,
  revoked_at timestamptz,
  primary key(job_id,grant_id)
);
alter table apple_private.identities enable row level security;
alter table apple_private.grants enable row level security;
alter table apple_private.deletion_jobs enable row level security;
alter table apple_private.job_grants enable row level security;
revoke all on all tables in schema apple_private from public,anon,authenticated;

-- Keys never enter a migration literal, profile, token response, or BD field.
do $$
declare v_name text;
begin
  foreach v_name in array array['apple_grant_encryption_v1','apple_member_deleted_secret','apple_revocation_worker_secret'] loop
    if not exists(select 1 from vault.secrets where name=v_name) then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),v_name,'WeddingWin Apple permission revocation; server only');
    end if;
  end loop;
end $$;

create or replace function public.apple_grant_private_config()
returns jsonb language sql security definer set search_path=pg_catalog,vault
as $$ select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets
 where name in ('apple_grant_encryption_v1','apple_member_deleted_secret','apple_revocation_worker_secret') $$;
revoke all on function public.apple_grant_private_config() from public,anon,authenticated;
grant execute on function public.apple_grant_private_config() to service_role;

create or replace function public.apple_grant_operation(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,apple_private
as $$
declare
  v_identity apple_private.identities%rowtype;
  v_job apple_private.deletion_jobs%rowtype;
  v_grant apple_private.grants%rowtype;
  v_lease uuid;
  v_id uuid;
  v_bd text;
  v_count integer;
  v_result jsonb;
  v_until timestamptz;
begin
  if p_action='signin_begin' then
    v_lease := (p_data->>'leaseToken')::uuid;
    if nullif(p_data->>'teamId','') is null or nullif(p_data->>'appleSub','') is null then raise exception 'Invalid Apple identity'; end if;
    insert into apple_private.identities(team_id,apple_sub)
      values(p_data->>'teamId',p_data->>'appleSub') on conflict(team_id,apple_sub) do nothing;
    select * into v_identity from apple_private.identities
      where team_id=p_data->>'teamId' and apple_sub=p_data->>'appleSub' for update;
    if v_identity.status<>'active' then raise exception 'APPLE_PERMISSION_REVOCATION_PENDING'; end if;
    if v_identity.lease_until>now() then raise exception 'APPLE_IDENTITY_BUSY'; end if;
    update apple_private.identities set lease_token=v_lease,lease_until=now()+interval '90 seconds' where id=v_identity.id;
    return jsonb_build_object('identityId',v_identity.id,'generation',v_identity.generation,'bdMemberId',v_identity.bd_member_id,'profileId',v_identity.profile_id,'leaseToken',v_lease);
  elsif p_action in ('signin_store','signin_check','signin_release') then
    select * into v_identity from apple_private.identities where id=(p_data->>'identityId')::uuid for update;
    if not found or v_identity.generation<>(p_data->>'generation')::uuid or v_identity.lease_token is distinct from (p_data->>'leaseToken')::uuid then raise exception 'APPLE_IDENTITY_LEASE_LOST'; end if;
    if p_action='signin_release' then
      update apple_private.identities set lease_token=null,lease_until=null where id=v_identity.id;
      return '{}'::jsonb;
    end if;
    if v_identity.status<>'active' or v_identity.lease_until<=now() then raise exception 'APPLE_PERMISSION_REVOCATION_PENDING'; end if;
    v_bd := p_data->>'bdMemberId';
    if v_bd !~ '^[1-9][0-9]{0,18}$' or nullif(p_data->>'profileId','') is null then raise exception 'Invalid Apple member binding'; end if;
    if exists(select 1 from apple_private.deletion_jobs where bd_member_id=v_bd) then raise exception 'APPLE_PERMISSION_REVOCATION_PENDING'; end if;
    if v_identity.bd_member_id is not null and (v_identity.bd_member_id<>v_bd or v_identity.profile_id is distinct from (p_data->>'profileId')::uuid) then raise exception 'APPLE_IDENTITY_OWNER_MISMATCH'; end if;
    if p_action='signin_store' then
      update apple_private.identities set bd_member_id=v_bd,profile_id=(p_data->>'profileId')::uuid where id=v_identity.id;
      insert into apple_private.grants(id,identity_id,generation,client_id,bd_member_id,profile_id,ciphertext,iv,key_version,token_hash)
        values((p_data->>'grantId')::uuid,v_identity.id,v_identity.generation,p_data->>'clientId',v_bd,(p_data->>'profileId')::uuid,p_data->>'ciphertext',p_data->>'iv',(p_data->>'keyVersion')::integer,p_data->>'tokenHash')
        on conflict(identity_id,generation,client_id,token_hash) do nothing;
    end if;
    return '{}'::jsonb;
  elsif p_action='enqueue' then
    v_bd := p_data->>'bdMemberId';
    if v_bd !~ '^[1-9][0-9]{0,18}$' then raise exception 'Invalid deleted member'; end if;
    -- Duplicate/delayed notifications never expand an existing snapshot.
    insert into apple_private.deletion_jobs(bd_member_id,status) values(v_bd,'pending')
      on conflict(bd_member_id) do nothing returning id into v_id;
    if v_id is null then
      select * into v_job from apple_private.deletion_jobs where bd_member_id=v_bd;
      return jsonb_build_object('jobId',v_job.id,'status',v_job.status,'expectedGrants',v_job.expected_grants);
    end if;
    -- Freeze enrollment before taking the immutable grant-generation snapshot.
    perform 1 from apple_private.identities where bd_member_id=v_bd order by id for update;
    update apple_private.identities set status='revoking' where bd_member_id=v_bd;
    insert into apple_private.job_grants(job_id,grant_id,identity_id,generation)
      select v_id,id,identity_id,generation from apple_private.grants where bd_member_id=v_bd;
    get diagnostics v_count=row_count;
    update apple_private.deletion_jobs set expected_grants=v_count,status=case when v_count=0 then 'no_credential' else 'pending' end,last_reason=case when v_count=0 then 'manual_apple_revocation_required' else null end where id=v_id returning * into v_job;
    return jsonb_build_object('jobId',v_job.id,'status',v_job.status,'expectedGrants',v_job.expected_grants);
  elsif p_action='claim' then
    select * into v_job from apple_private.deletion_jobs
      where status in ('pending','retry','running') and expected_grants>0 and next_attempt_at<=now() and (lease_until is null or lease_until<=now())
      order by created_at for update skip locked limit 1;
    if not found then return 'null'::jsonb; end if;
    perform 1 from apple_private.identities where id in(select identity_id from apple_private.job_grants where job_id=v_job.id and revoked_at is null) order by id for update;
    if exists(select 1 from apple_private.identities i join apple_private.job_grants j on j.identity_id=i.id and j.generation=i.generation where j.job_id=v_job.id and i.lease_until>now()) then return 'null'::jsonb; end if;
    v_lease := gen_random_uuid();
    update apple_private.deletion_jobs set status='running',attempts=attempts+1,lease_token=v_lease,lease_until=now()+interval '90 seconds' where id=v_job.id;
    update apple_private.identities set lease_token=v_lease,lease_until=now()+interval '90 seconds',status='revoking'
      where id in(select identity_id from apple_private.job_grants where job_id=v_job.id and revoked_at is null);
    return jsonb_build_object('id',v_job.id,'leaseToken',v_lease,'bdMemberId',v_job.bd_member_id,'expectedGrants',v_job.expected_grants);
  elsif p_action in ('job_grants','job_validate','job_confirm','job_finish','job_retry') then
    select * into v_job from apple_private.deletion_jobs where id=(p_data->>'id')::uuid for update;
    if not found or v_job.status<>'running' or v_job.lease_token is distinct from (p_data->>'leaseToken')::uuid or v_job.lease_until<=now() then raise exception 'APPLE_JOB_LEASE_LOST'; end if;
    if p_action='job_grants' then
      select coalesce(jsonb_agg(jsonb_build_object('identityId',i.id,'generation',g.generation,'grantId',g.id,'clientId',g.client_id,'appleSub',i.apple_sub,'bdMemberId',g.bd_member_id,'profileId',g.profile_id,'ciphertext',g.ciphertext,'iv',g.iv,'keyVersion',g.key_version)),'[]'::jsonb)
        into v_result from apple_private.job_grants j join apple_private.grants g on g.id=j.grant_id and g.identity_id=j.identity_id and g.generation=j.generation
        join apple_private.identities i on i.id=g.identity_id and i.generation=g.generation
        where j.job_id=v_job.id and j.revoked_at is null and g.bd_member_id=v_job.bd_member_id and i.lease_token=v_job.lease_token and i.lease_until>now();
      return v_result;
    elsif p_action in ('job_validate','job_confirm') then
      select g.* into v_grant from apple_private.grants g join apple_private.job_grants j on j.grant_id=g.id and j.identity_id=g.identity_id and j.generation=g.generation
        join apple_private.identities i on i.id=g.identity_id and i.generation=g.generation
        where j.job_id=v_job.id and g.id=(p_data->>'grantId')::uuid and g.generation=(p_data->>'generation')::uuid and g.bd_member_id=v_job.bd_member_id
        and i.bd_member_id=g.bd_member_id and i.profile_id=g.profile_id
        and i.lease_token=v_job.lease_token and i.lease_until>now() for update of g;
      if not found then raise exception 'APPLE_GRANT_LEASE_LOST'; end if;
      if p_action='job_validate' then
        select least(v_job.lease_until,lease_until) into v_until from apple_private.identities where id=v_grant.identity_id and generation=v_grant.generation;
        if v_until<=now()+interval '10 seconds' then raise exception 'APPLE_JOB_LEASE_LOST'; end if;
        return jsonb_build_object('leaseUntil',v_until);
      end if;
      update apple_private.job_grants set revoked_at=now() where job_id=v_job.id and grant_id=v_grant.id;
      delete from apple_private.grants where id=v_grant.id;
      return '{}'::jsonb;
    elsif p_action='job_finish' then
      if exists(select 1 from apple_private.job_grants where job_id=v_job.id and revoked_at is null) then raise exception 'APPLE_GRANTS_REMAIN'; end if;
      if v_job.expected_grants=0 then raise exception 'APPLE_CREDENTIAL_MISSING'; end if;
      -- Include identities whose final grant was confirmed by an earlier
      -- lease/batch. Restrict every cleanup to the immutable old generation.
      perform 1 from apple_private.identities i join apple_private.job_grants j on j.identity_id=i.id and j.generation=i.generation where j.job_id=v_job.id order by i.id for update of i;
      update apple_private.deletion_jobs set status='complete',completed_at=now(),lease_token=null,lease_until=null,last_reason=null where id=v_job.id;
      delete from apple_private.identities i where i.status='revoking'
        and exists(select 1 from apple_private.job_grants j where j.job_id=v_job.id and j.identity_id=i.id and j.generation=i.generation)
        and not exists(select 1 from apple_private.grants g where g.identity_id=i.id and g.generation=i.generation);
      return '{}'::jsonb;
    else
      update apple_private.deletion_jobs set status='retry',next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),lease_token=null,lease_until=null,
        last_reason=case when p_data->>'reason' in ('member_still_exists','more_grants_pending','missing_credentials') then p_data->>'reason' else 'revocation_retry_required' end where id=v_job.id;
      update apple_private.identities set lease_token=null,lease_until=null where lease_token=v_job.lease_token;
      return '{}'::jsonb;
    end if;
  end if;
  raise exception 'Invalid Apple grant operation';
end $$;
revoke all on function public.apple_grant_operation(text,jsonb) from public,anon,authenticated;
grant execute on function public.apple_grant_operation(text,jsonb) to service_role;

-- Existing deployments already use pg_cron/pg_net with Vault-backed secrets.
-- The worker only processes authenticated future deletion receipts, never an
-- orphan/member scan. No grants exist merely because this schedule is created.
do $$
begin
  if exists(select 1 from cron.job where jobname='weddingwin-apple-permission-revocation') then
    perform cron.unschedule('weddingwin-apple-permission-revocation');
  end if;
  perform cron.schedule('weddingwin-apple-permission-revocation','* * * * *',$cron$
    select net.http_post(
      url:='https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/apple-revocation-worker',
      headers:=jsonb_build_object('Content-Type','application/json','X-WeddingWin-Apple-Worker-Secret',(select decrypted_secret from vault.decrypted_secrets where name='apple_revocation_worker_secret' limit 1)),
      body:='{}'::jsonb,timeout_milliseconds:=60000
    );
  $cron$);
end $$;
