-- Failed signup grants are NOT member-deletion jobs. Only a still-unbound,
-- leased identity may enter this queue. No BD/Auth account is deleted here.
-- Job history retains UUIDs/client metadata, never Apple subjects or contact
-- details. The encrypted token is erased only after a confirmed Apple revoke.
create table apple_private.failed_signup_revocations (
  id uuid primary key,
  identity_id uuid not null,
  generation uuid not null,
  client_id text not null check (length(client_id) between 1 and 255),
  token_hash text,
  ciphertext text,
  iv text,
  key_version integer not null check (key_version = 1),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'retry', 'complete')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check ((lease_token is null) = (lease_until is null)),
  check ((status = 'running') = (lease_token is not null)),
  check (
    (status = 'complete' and confirmed_at is not null
      and token_hash is null and ciphertext is null and iv is null)
    or
    (status <> 'complete' and confirmed_at is null
      and token_hash is not null and token_hash ~ '^[a-f0-9]{64}$'
      and ciphertext is not null and length(ciphertext) between 20 and 20000
      and iv is not null and iv ~ '^[A-Za-z0-9_-]{16}$')
  )
  -- Deliberately no identity FK: a completed UUID-only receipt survives cleanup.
);
create unique index failed_signup_one_pending_identity
  on apple_private.failed_signup_revocations(identity_id, generation)
  where status <> 'complete';
create index failed_signup_due_jobs
  on apple_private.failed_signup_revocations(next_attempt_at, created_at)
  where status <> 'complete';
alter table apple_private.failed_signup_revocations enable row level security;
revoke all on apple_private.failed_signup_revocations from public, anon, authenticated, service_role;

create function apple_private.protect_failed_signup_job_binding()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
    or new.identity_id is distinct from old.identity_id
    or new.generation is distinct from old.generation
    or new.client_id is distinct from old.client_id
    or new.key_version is distinct from old.key_version
    or new.created_at is distinct from old.created_at
    or (new.token_hash is distinct from old.token_hash
      and not (old.status <> 'complete' and new.status = 'complete' and new.token_hash is null))
    or (new.ciphertext is distinct from old.ciphertext
      and not (old.status <> 'complete' and new.status = 'complete' and new.ciphertext is null))
    or (new.iv is distinct from old.iv
      and not (old.status <> 'complete' and new.status = 'complete' and new.iv is null))
    or old.status = 'complete'
  then
    raise exception 'APPLE_FAILED_SIGNUP_IMMUTABLE';
  end if;
  return new;
end $$;
revoke all on function apple_private.protect_failed_signup_job_binding()
  from public, anon, authenticated, service_role;
create trigger protect_failed_signup_job_binding
before update on apple_private.failed_signup_revocations
for each row execute function apple_private.protect_failed_signup_job_binding();

-- An Apple subject may not become a legacy profile binding while its failed
-- signup grant is being revoked. The advisory lock also covers the no-identity
-- case; otherwise a profile insert and first identity creation could pass each
-- other's absence checks. No DELETE trigger or email matching is involved.
create function apple_private.guard_failed_signup_profile_binding()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare v_identity apple_private.identities%rowtype;
begin
  if nullif(new.apple_sub, '') is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('apple_failed_signup:' || new.apple_sub, 0));
  for v_identity in select * from apple_private.identities
    where apple_sub = new.apple_sub order by id for update
  loop
    if exists(select 1 from apple_private.failed_signup_revocations
      where identity_id = v_identity.id and generation = v_identity.generation
        and status <> 'complete')
    then raise exception 'APPLE_PERMISSION_REVOCATION_PENDING'; end if;
  end loop;
  return new;
end $$;
revoke all on function apple_private.guard_failed_signup_profile_binding()
  from public, anon, authenticated, service_role;
create trigger guard_failed_signup_profile_binding
before insert or update of apple_sub on public.profiles
for each row execute function apple_private.guard_failed_signup_profile_binding();

create function public.apple_failed_signup_operation(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_identity apple_private.identities%rowtype;
  v_job apple_private.failed_signup_revocations%rowtype;
  v_candidate apple_private.failed_signup_revocations%rowtype;
  v_id uuid;
  v_identity_id uuid;
  v_generation uuid;
  v_lease uuid;
  v_now timestamptz;
  v_until timestamptz;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'APPLE_FAILED_SIGNUP_INVALID_INPUT';
  end if;
  if p_action = 'enqueue' then
    v_id := (p_data->>'jobId')::uuid;
    v_identity_id := (p_data->>'identityId')::uuid;
    v_generation := (p_data->>'generation')::uuid;
    v_lease := (p_data->>'leaseToken')::uuid;
    if v_id is null or v_identity_id is null or v_generation is null or v_lease is null
      or nullif(p_data->>'appleSub', '') is null
      or coalesce(length(p_data->>'clientId'), 0) not between 1 and 255
      or coalesce(length(p_data->>'ciphertext'), 0) not between 20 and 20000
      or coalesce(p_data->>'iv', '') !~ '^[A-Za-z0-9_-]{16}$'
      or (p_data->>'keyVersion')::integer is distinct from 1
      or coalesce(p_data->>'tokenHash', '') !~ '^[a-f0-9]{64}$'
    then raise exception 'APPLE_FAILED_SIGNUP_INVALID_INPUT'; end if;

    perform pg_advisory_xact_lock(hashtextextended('apple_failed_signup:' || (p_data->>'appleSub'), 0));
    -- All paths acquire identity before job to avoid lock-order inversions.
    select * into v_identity from apple_private.identities
      where id = v_identity_id for update;
    v_now := clock_timestamp();
    if not found or v_identity.generation is distinct from v_generation
      or v_identity.apple_sub is distinct from p_data->>'appleSub'
      or v_identity.lease_token is distinct from v_lease
      or v_identity.lease_until is null or v_identity.lease_until <= v_now
    then raise exception 'APPLE_FAILED_SIGNUP_LEASE_LOST'; end if;
    if v_identity.bd_member_id is not null or v_identity.profile_id is not null
      or exists(select 1 from apple_private.grants where identity_id = v_identity.id)
      or exists(select 1 from public.profiles where apple_sub = v_identity.apple_sub)
    then raise exception 'APPLE_FAILED_SIGNUP_ACCOUNT_BOUND'; end if;

    select * into v_job from apple_private.failed_signup_revocations
      where id = v_id for update;
    if found then
      if v_identity.status = 'revoking' and v_job.status <> 'complete'
        and v_job.identity_id = v_identity.id and v_job.generation = v_identity.generation
        and v_job.client_id = p_data->>'clientId' and v_job.token_hash = p_data->>'tokenHash'
        and v_job.ciphertext = p_data->>'ciphertext' and v_job.iv = p_data->>'iv'
        and v_job.key_version = (p_data->>'keyVersion')::integer
      then return jsonb_build_object('id', v_job.id, 'status', v_job.status); end if;
      raise exception 'APPLE_FAILED_SIGNUP_CONFLICT';
    end if;
    if v_identity.status <> 'active' or exists(
      select 1 from apple_private.failed_signup_revocations
      where identity_id = v_identity.id and status <> 'complete'
    ) then raise exception 'APPLE_FAILED_SIGNUP_CONFLICT'; end if;

    insert into apple_private.failed_signup_revocations(
      id, identity_id, generation, client_id, token_hash, ciphertext, iv, key_version
    ) values(v_id, v_identity.id, v_identity.generation, p_data->>'clientId',
      p_data->>'tokenHash', p_data->>'ciphertext', p_data->>'iv', (p_data->>'keyVersion')::integer);
    -- Keep the sign-in lease until its normal finally/release path has finished.
    update apple_private.identities set status = 'revoking' where id = v_identity.id;
    return jsonb_build_object('id', v_id, 'status', 'pending');

  elsif p_action = 'claim' then
    -- Optional exact ID supports immediate draining and isolated SQL fixtures.
    -- An invalid/missing identity remains pending: never infer successful revoke.
    for v_candidate in
      select j.* from apple_private.failed_signup_revocations j
      where j.status <> 'complete' and j.next_attempt_at <= clock_timestamp()
        and (j.lease_until is null or j.lease_until <= clock_timestamp())
        and (not (p_data ? 'id') or j.id = (p_data->>'id')::uuid)
        -- Invalid/stale jobs must not starve valid jobs behind the batch limit.
        and exists(select 1 from apple_private.identities i
          where i.id = j.identity_id and i.generation = j.generation and i.status = 'revoking'
            and i.bd_member_id is null and i.profile_id is null
            and (i.lease_until is null or i.lease_until <= clock_timestamp())
            and not exists(select 1 from apple_private.grants g where g.identity_id = i.id)
            and not exists(select 1 from public.profiles p where p.apple_sub = i.apple_sub))
      order by j.next_attempt_at, j.created_at, j.id limit 25
    loop
      select * into v_identity from apple_private.identities
        where id = v_candidate.identity_id for update skip locked;
      if not found then continue; end if;
      select * into v_job from apple_private.failed_signup_revocations
        where id = v_candidate.id for update skip locked;
      if not found then continue; end if;
      v_now := clock_timestamp();
      if v_job.status = 'complete' or v_job.next_attempt_at > v_now
        or v_job.lease_until > v_now or v_identity.lease_until > v_now
        or v_identity.generation is distinct from v_job.generation
        or v_identity.status <> 'revoking'
        or v_identity.bd_member_id is not null or v_identity.profile_id is not null
        or exists(select 1 from apple_private.grants where identity_id = v_identity.id)
        or exists(select 1 from public.profiles where apple_sub = v_identity.apple_sub)
        or exists(select 1 from apple_private.failed_signup_revocations
          where identity_id = v_identity.id and status <> 'complete' and id <> v_job.id)
      then continue; end if;
      v_lease := gen_random_uuid();
      v_until := v_now + interval '90 seconds';
      update apple_private.identities set lease_token = v_lease, lease_until = v_until
        where id = v_identity.id;
      update apple_private.failed_signup_revocations
        set status = 'running', attempts = attempts + 1, lease_token = v_lease, lease_until = v_until
        where id = v_job.id;
      return jsonb_build_object('id', v_job.id, 'leaseToken', v_lease,
        'identityId', v_identity.id, 'generation', v_job.generation,
        'clientId', v_job.client_id, 'appleSub', v_identity.apple_sub,
        'ciphertext', v_job.ciphertext, 'iv', v_job.iv, 'keyVersion', v_job.key_version);
    end loop;
    return 'null'::jsonb;

  elsif p_action in ('validate', 'complete', 'retry') then
    v_id := (p_data->>'id')::uuid;
    v_identity_id := (p_data->>'identityId')::uuid;
    v_generation := (p_data->>'generation')::uuid;
    v_lease := (p_data->>'leaseToken')::uuid;
    if v_id is null or v_identity_id is null or v_generation is null or v_lease is null
      or nullif(p_data->>'clientId', '') is null or nullif(p_data->>'appleSub', '') is null
    then raise exception 'APPLE_FAILED_SIGNUP_INVALID_INPUT'; end if;
    select * into v_identity from apple_private.identities
      where id = v_identity_id for update;
    if not found then raise exception 'APPLE_FAILED_SIGNUP_LEASE_LOST'; end if;
    select * into v_job from apple_private.failed_signup_revocations
      where id = v_id for update;
    v_now := clock_timestamp();
    if not found or v_job.status <> 'running'
      or v_job.identity_id is distinct from v_identity_id
      or v_job.generation is distinct from v_generation
      or v_job.client_id is distinct from p_data->>'clientId'
      or v_identity.generation is distinct from v_generation
      or v_identity.apple_sub is distinct from p_data->>'appleSub'
      or v_job.lease_token is distinct from v_lease or v_identity.lease_token is distinct from v_lease
      or v_job.lease_until is null or v_job.lease_until <= v_now
      or v_identity.lease_until is null or v_identity.lease_until <= v_now
      or v_identity.status <> 'revoking'
    then raise exception 'APPLE_FAILED_SIGNUP_LEASE_LOST'; end if;
    if v_identity.bd_member_id is not null or v_identity.profile_id is not null
      or exists(select 1 from apple_private.grants where identity_id = v_identity.id)
      or exists(select 1 from public.profiles where apple_sub = v_identity.apple_sub)
      or exists(select 1 from apple_private.failed_signup_revocations
        where identity_id = v_identity.id and status <> 'complete' and id <> v_job.id)
    then raise exception 'APPLE_FAILED_SIGNUP_ACCOUNT_BOUND'; end if;
    if p_action = 'validate' then
      v_until := least(v_job.lease_until, v_identity.lease_until);
      if v_until < v_now + interval '10 seconds' then
        raise exception 'APPLE_FAILED_SIGNUP_LEASE_LOST';
      end if;
      return jsonb_build_object('leaseUntil', v_until);
    elsif p_action = 'complete' then
      -- Only the worker calls complete after Apple returned HTTP 200. A failed
      -- database acknowledgement leaves the encrypted token retryable instead.
      update apple_private.failed_signup_revocations set status = 'complete',
        confirmed_at = v_now, ciphertext = null, iv = null, token_hash = null,
        lease_token = null, lease_until = null where id = v_job.id;
      delete from apple_private.identities where id = v_identity.id
        and generation = v_job.generation and status = 'revoking'
        and bd_member_id is null and profile_id is null and lease_token = v_lease
        and not exists(select 1 from apple_private.grants where identity_id = v_identity.id)
        and not exists(select 1 from public.profiles where apple_sub = v_identity.apple_sub)
        and not exists(select 1 from apple_private.failed_signup_revocations
          where identity_id = v_identity.id and status <> 'complete');
      if not found then raise exception 'APPLE_FAILED_SIGNUP_LEASE_LOST'; end if;
      return jsonb_build_object('id', v_job.id, 'status', 'complete');
    else
      update apple_private.failed_signup_revocations set status = 'retry',
        next_attempt_at = v_now + make_interval(secs => least(3600, 30 * power(2, least(attempts, 7))::integer)),
        lease_token = null, lease_until = null where id = v_job.id;
      update apple_private.identities set lease_token = null, lease_until = null
        where id = v_identity.id and generation = v_job.generation and lease_token = v_lease;
      return jsonb_build_object('id', v_job.id, 'status', 'retry');
    end if;
  end if;
  raise exception 'APPLE_FAILED_SIGNUP_INVALID_ACTION';
end $$;
revoke all on function public.apple_failed_signup_operation(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apple_failed_signup_operation(text, jsonb) to service_role;
