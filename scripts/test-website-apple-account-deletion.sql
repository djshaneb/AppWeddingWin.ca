-- OFFLINE/ROLLBACK-ONLY database regression, NOT a migration.
-- Run the entire file as ONE database-owner query. If testing before deployment,
-- replace the marker with the new migration inside this same transaction.
-- Only reserved fictional members and freshly generated fixture Auth UUIDs are
-- inserted/removed. No external HTTP, GoTrue API, Apple API, or BD call occurs.
-- Refuses to run if a real claimable job or expired staging row could be touched.
BEGIN;
-- WEBSITE_APPLE_ACCOUNT_DELETION_MIGRATION_UNDER_TEST
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='5s';
SET LOCAL request.jwt.claim.role='service_role';

CREATE FUNCTION pg_temp.cleanup_assert(p_ok boolean,p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Website Apple cleanup regression: %',p_message;
  END IF;
END;
$$;
CREATE FUNCTION pg_temp.cleanup_error(p_action text,p_data jsonb,p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_message text;
BEGIN
  BEGIN
    PERFORM public.apple_grant_operation(p_action,p_data);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message=p_expected THEN RETURN; END IF;
    RAISE EXCEPTION 'Website Apple cleanup regression: % expected %, received %',
      p_action,p_expected,v_message;
  END;
  RAISE EXCEPTION 'Website Apple cleanup regression: % unexpectedly succeeded',p_action;
END;
$$;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM pg_temp.cleanup_assert(NOT has_function_privilege(v_role,
      'public.apple_grant_operation(text,jsonb)','EXECUTE'),v_role||' can run deletion');
    PERFORM pg_temp.cleanup_assert(NOT has_function_privilege(v_role,
      'public.apple_grant_operation_permission_v1(text,jsonb)','EXECUTE'),v_role||' can bypass wrapper');
  END LOOP;
  PERFORM pg_temp.cleanup_assert(NOT has_function_privilege('service_role',
    'public.apple_grant_operation_permission_v1(text,jsonb)','EXECUTE'),'service role can bypass wrapper');
  PERFORM pg_temp.cleanup_assert(has_function_privilege('service_role',
    'public.apple_grant_operation(text,jsonb)','EXECUTE'),'service role cannot run wrapper');
END;
$$;

DO $$
DECLARE
  v_bd constant text := '9900000000000000001';
  v_historical_bd constant text := '9900000000000000002';
  v_unenrolled_bd constant text := '9900000000000000003';
  v_new_bd constant text := '9900000000000000004';
  v_default_bd constant text := '9900000000000000005';
  v_permission_bd constant text := '9900000000000000006';
  v_recreated_bd constant text := '9900000000000000007';
  v_email constant text := 'apple-full-cleanup-fixture@example.invalid';
  v_sub constant text := '__weddingwin_full_cleanup_fixture_sub__';
  v_profile uuid := gen_random_uuid();
  v_other_profile uuid := gen_random_uuid();
  v_recreated_profile uuid := gen_random_uuid();
  v_recreated_grant uuid := gen_random_uuid();
  v_fixture_thread text := '__apple_cleanup_fixture__'||gen_random_uuid()::text;
  v_grant uuid := gen_random_uuid();
  v_login_lease uuid := gen_random_uuid();
  v_identity jsonb;
  v_enqueued jsonb;
  v_job jsonb;
  v_old_job jsonb;
  v_context jsonb;
  v_result jsonb;
  v_historical_id uuid;
  v_message text;
BEGIN
  -- Never let the unfiltered production claim function select real work.
  PERFORM pg_temp.cleanup_assert(NOT EXISTS(
    SELECT 1 FROM apple_private.deletion_jobs
     WHERE status IN ('pending','running','retry') AND expected_grants>0
  ),'refusing fixture while real revocation work exists');
  -- The existing staging helper expires old staging rows globally. Refuse
  -- rather than touch any real row, even temporarily inside a rollback.
  PERFORM pg_temp.cleanup_assert(NOT EXISTS(
    SELECT 1 FROM weddingwin_private.pending_deleted_chat_identities WHERE expires_at<=now()
  ),'refusing fixture while unrelated expired staging exists');
  PERFORM pg_temp.cleanup_assert(NOT EXISTS(
    SELECT 1 FROM public.bd_users_cache WHERE user_id IN(v_bd,v_historical_bd,v_unenrolled_bd,v_new_bd,v_default_bd,v_permission_bd,v_recreated_bd)
  ) AND NOT EXISTS(
    SELECT 1 FROM public.profiles WHERE bd_member_id IN(v_bd,v_historical_bd,v_unenrolled_bd,v_new_bd,v_default_bd,v_permission_bd,v_recreated_bd)
       OR email=v_email
  ) AND NOT EXISTS(
    SELECT 1 FROM auth.users WHERE email=v_email
  ) AND NOT EXISTS(
    SELECT 1 FROM apple_private.identities WHERE apple_sub=v_sub
       OR bd_member_id IN(v_bd,v_historical_bd,v_unenrolled_bd,v_new_bd,v_default_bd,v_permission_bd,v_recreated_bd)
  ) AND NOT EXISTS(
    SELECT 1 FROM apple_private.deletion_jobs WHERE bd_member_id IN(v_bd,v_historical_bd,v_unenrolled_bd,v_new_bd,v_default_bd,v_permission_bd,v_recreated_bd)
  ),'reserved fixture identity already exists');

  -- A historical permission-only completion may never be upgraded by a delayed
  -- website event, matching the protection required for the real old account.
  INSERT INTO apple_private.deletion_jobs(bd_member_id,status,completed_at)
    VALUES(v_historical_bd,'complete',now()) RETURNING id INTO v_historical_id;
  v_result:=public.apple_grant_operation('enqueue',jsonb_build_object(
    'bdMemberId',v_historical_bd,'fullCleanup',true));
  PERFORM pg_temp.cleanup_assert(v_result->>'jobId'=v_historical_id::text
    AND v_result->>'fullCleanup'='false' AND v_result->>'status'='complete',
    'historical job was upgraded');
  v_result:=public.apple_grant_operation('enqueue',jsonb_build_object(
    'bdMemberId',v_unenrolled_bd,'fullCleanup',true));
  PERFORM pg_temp.cleanup_assert(v_result->>'status'='no_credential'
    AND v_result->>'fullCleanup'='true','missing credential was falsely completed');
  PERFORM pg_temp.cleanup_assert((SELECT cleanup_profile_id IS NULL
    FROM apple_private.deletion_jobs WHERE bd_member_id=v_unenrolled_bd),
    'unenrolled account guessed an Auth identity');
  v_result:=public.apple_grant_operation('enqueue',jsonb_build_object('bdMemberId',v_default_bd));
  PERFORM pg_temp.cleanup_assert(v_result->>'fullCleanup'='true'
    AND v_result->>'status'='no_credential','old producer did not default to honest full cleanup');
  v_result:=public.apple_grant_operation('enqueue',jsonb_build_object(
    'bdMemberId',v_permission_bd,'fullCleanup',false));
  PERFORM pg_temp.cleanup_assert(v_result->>'fullCleanup'='false'
    AND v_result->>'status'='no_credential','explicit permission-only opt-out changed');

  -- These Auth rows are synthetic local database fixtures, not real accounts.
  INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
    VALUES(v_profile,v_email,'authenticated','authenticated',now(),now()),
          (v_other_profile,'apple-full-cleanup-other@example.invalid','authenticated','authenticated',now(),now());
  UPDATE public.profiles SET email=v_email,bd_member_id=v_bd,apple_sub=v_sub WHERE id=v_profile;
  UPDATE public.profiles SET bd_member_id=v_new_bd WHERE id=v_other_profile;
  INSERT INTO public.bd_users_cache(user_id,email,token,cookie)
    VALUES(v_bd,v_email,'__fixture_token__','__fixture_cookie__'),
          (v_new_bd,'apple-full-cleanup-other@example.invalid','__other_fixture_token__','__other_fixture_cookie__');
  INSERT INTO public.bd_edge_cache(key,value,expires_at)
    VALUES('sess:'||v_bd||':fixture','{}',now()+interval '1 hour'),
          ('sess:'||v_new_bd||':fixture','{}',now()+interval '1 hour');
  -- The raw alias differs only by whitespace from the cached token. The
  -- staging helper must deduplicate AFTER hashing/normalizing both values.
  INSERT INTO public.bd_chat_threads(thread_token,thread_owner,thread_responders,
    owner_user_id,responder_user_id,thread_status)
    VALUES(v_fixture_thread,'  __fixture_token__','__other_fixture_token__',v_bd,v_new_bd,'1');
  INSERT INTO public.app_login_exchanges(code_hash,payload,expires_at,bd_member_id)
    VALUES(repeat('a',43),'{}',now()+interval '1 hour',v_bd);
  INSERT INTO public.app_native_auth_exchanges(code_hash,provider,code_challenge,payload,expires_at,bd_member_id)
    VALUES(repeat('b',43),'apple',repeat('c',43),'{}',now()+interval '1 hour',v_bd);

  v_identity:=public.apple_grant_operation('signin_begin',jsonb_build_object(
    'teamId','__full_cleanup_fixture_team__','appleSub',v_sub,'leaseToken',v_login_lease));
  PERFORM public.apple_grant_operation('signin_store',v_identity||jsonb_build_object(
    'bdMemberId',v_bd,'profileId',v_profile,'grantId',v_grant,
    'clientId','__fixture_apple_client__','ciphertext',repeat('a',32),
    'iv',repeat('a',16),'keyVersion',1,'tokenHash',repeat('a',64)));
  PERFORM public.apple_grant_operation('signin_release',v_identity);
  -- An older deployed receipt/recovery/native issuer omits the new option.
  v_enqueued:=public.apple_grant_operation('enqueue',jsonb_build_object('bdMemberId',v_bd));
  PERFORM pg_temp.cleanup_assert(v_enqueued->>'expectedGrants'='1'
    AND v_enqueued->>'fullCleanup'='true','new job did not snapshot full cleanup');
  PERFORM pg_temp.cleanup_assert((SELECT cleanup_profile_id=v_profile
    FROM apple_private.deletion_jobs WHERE id=(v_enqueued->>'jobId')::uuid),
    'private enrolled profile was not snapshotted');
  v_job:=public.apple_grant_operation('claim');
  PERFORM pg_temp.cleanup_assert(v_job->>'id'=v_enqueued->>'jobId'
    AND v_job->>'profileId'=v_profile::text AND v_job->>'fullCleanup'='true',
    'claim lost immutable cleanup context');
  PERFORM pg_temp.cleanup_error('job_cleanup_prepare',v_job,'APPLE_GRANTS_REMAIN');
  PERFORM pg_temp.cleanup_error('job_finish',v_job,'APPLE_GRANTS_REMAIN');
  PERFORM pg_temp.cleanup_error('signin_begin',jsonb_build_object(
    'teamId','__full_cleanup_fixture_team__','appleSub',v_sub,'leaseToken',gen_random_uuid()),
    'APPLE_PERMISSION_REVOCATION_PENDING');
  BEGIN
    UPDATE public.profiles SET bd_member_id=v_new_bd||'1' WHERE id=v_profile;
    RAISE EXCEPTION 'fixture expected pending profile update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message<>'APPLE_ACCOUNT_DELETION_PENDING' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.profiles(id,email,bd_member_id)
      VALUES(gen_random_uuid(),'not-a-target@example.invalid',v_bd);
    RAISE EXCEPTION 'fixture expected pending profile insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message<>'APPLE_ACCOUNT_DELETION_PENDING' THEN RAISE; END IF;
  END;

  -- Emulate the recorded 200 Apple response; no network call is made here.
  PERFORM public.apple_grant_operation('job_confirm',v_job||jsonb_build_object(
    'grantId',v_grant,'generation',v_identity->>'generation'));
  PERFORM pg_temp.cleanup_assert(NOT EXISTS(SELECT 1 FROM apple_private.grants WHERE id=v_grant),
    'confirmed token ciphertext remains');
  PERFORM pg_temp.cleanup_error('job_finish',v_job,'APPLE_ACCOUNT_CLEANUP_REMAINS');
  PERFORM pg_temp.cleanup_error('job_cleanup_validate',v_job,'APPLE_CLEANUP_NOT_PREPARED');
  PERFORM pg_temp.cleanup_error('job_cleanup_prepare',v_job||jsonb_build_object(
    'profileId',v_other_profile),'APPLE_CLEANUP_IDENTITY_MISMATCH');

  -- Crash after final grant confirmation: reclaim must also renew the now
  -- grantless immutable identity's lease, not only the remaining grants.
  v_old_job:=v_job;
  UPDATE apple_private.deletion_jobs SET lease_until=clock_timestamp()-interval '1 second'
    WHERE id=(v_job->>'id')::uuid;
  UPDATE apple_private.identities SET lease_until=clock_timestamp()-interval '1 second'
    WHERE id=(v_identity->>'identityId')::uuid;
  v_job:=public.apple_grant_operation('claim');
  PERFORM pg_temp.cleanup_assert(v_job->>'id'=v_old_job->>'id'
    AND v_job->>'leaseToken'<>v_old_job->>'leaseToken','retry did not renew lease');
  PERFORM pg_temp.cleanup_error('job_cleanup_prepare',v_old_job,'APPLE_JOB_LEASE_LOST');
  v_context:=public.apple_grant_operation('job_cleanup_prepare',v_job);
  PERFORM pg_temp.cleanup_assert(v_context->>'profileId'=v_profile::text
    AND NOT(v_context ? 'token') AND NOT(v_context ? 'cookie') AND NOT(v_context ? 'appleSub'),
    'cleanup context leaked credentials or changed UUID');
  PERFORM pg_temp.cleanup_assert(EXISTS(SELECT 1 FROM weddingwin_private.pending_deleted_chat_identities
    WHERE member_hash=weddingwin_private.chat_identity_hash(v_bd)),
    'redaction evidence not staged before Auth deletion');
  -- Cache email, supplied Auth email and profile email are deliberately equal;
  -- a repeated call with different casing must remain one lower-hash row.
  PERFORM public.stage_weddingwin_member_chat_redaction(v_bd,'__fixture_token__',
    '__fixture_cookie__',upper(v_email),v_sub,v_profile::text);
  PERFORM pg_temp.cleanup_assert((SELECT count(*)=1
    FROM weddingwin_private.pending_deleted_chat_identities
    WHERE member_hash=weddingwin_private.chat_identity_hash(v_bd)
      AND identity_hash=weddingwin_private.chat_identity_hash(v_email)
      AND normalization='lower'),'duplicate case-normalized email hashes were not deduplicated');
  PERFORM pg_temp.cleanup_assert((SELECT count(*)=1
    FROM weddingwin_private.pending_deleted_chat_identities
    WHERE member_hash=weddingwin_private.chat_identity_hash(v_bd)
      AND identity_hash=weddingwin_private.chat_identity_hash('__fixture_token__')
      AND normalization='exact'),'duplicate whitespace-normalized token hashes were not deduplicated');
  PERFORM pg_temp.cleanup_error('job_cleanup_finish',v_job,'APPLE_CLEANUP_AUTH_REMAINS');

  UPDATE apple_private.deletion_jobs SET lease_until=clock_timestamp()+interval '10 seconds'
    WHERE id=(v_job->>'id')::uuid;
  UPDATE apple_private.identities SET lease_until=clock_timestamp()+interval '10 seconds'
    WHERE id=(v_identity->>'identityId')::uuid;
  PERFORM pg_temp.cleanup_error('job_cleanup_validate',v_job,'APPLE_JOB_LEASE_LOST');
  UPDATE apple_private.deletion_jobs SET lease_until=clock_timestamp()+interval '90 seconds'
    WHERE id=(v_job->>'id')::uuid;
  UPDATE apple_private.identities SET lease_until=clock_timestamp()+interval '90 seconds'
    WHERE id=(v_identity->>'identityId')::uuid;
  PERFORM public.apple_grant_operation('job_cleanup_validate',v_job);

  -- Only this newly inserted fictional Auth row is removed, emulating GoTrue.
  DELETE FROM auth.users WHERE id=v_profile AND email=v_email;
  PERFORM pg_temp.cleanup_assert(NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_profile),
    'fixture Auth deletion did not cascade exact profile');
  -- Idempotent resume after Auth succeeded but before transactional purge.
  PERFORM public.apple_grant_operation('job_cleanup_prepare',v_job);
  PERFORM public.apple_grant_operation('job_cleanup_validate',v_job);
  PERFORM public.apple_grant_operation('job_cleanup_finish',v_job);
  PERFORM public.apple_grant_operation('job_cleanup_finish',v_job);
  PERFORM pg_temp.cleanup_assert(NOT EXISTS(SELECT 1 FROM public.bd_users_cache WHERE user_id=v_bd)
    AND NOT EXISTS(SELECT 1 FROM public.bd_edge_cache WHERE key='sess:'||v_bd||':fixture')
    AND NOT EXISTS(SELECT 1 FROM public.app_login_exchanges WHERE bd_member_id=v_bd)
    AND NOT EXISTS(SELECT 1 FROM public.app_native_auth_exchanges WHERE bd_member_id=v_bd),
    'app identity/cache/exchanges survived full purge');
  PERFORM pg_temp.cleanup_assert(EXISTS(SELECT 1 FROM auth.users WHERE id=v_other_profile)
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id=v_other_profile AND bd_member_id=v_new_bd)
    AND EXISTS(SELECT 1 FROM public.bd_users_cache WHERE user_id=v_new_bd)
    AND EXISTS(SELECT 1 FROM public.bd_edge_cache WHERE key='sess:'||v_new_bd||':fixture'),
    'unrelated account was changed');
  PERFORM pg_temp.cleanup_assert(EXISTS(SELECT 1 FROM public.bd_chat_threads
    WHERE thread_token=v_fixture_thread AND thread_status='0'
      AND btrim(thread_owner)='(deleted member)' AND responder_user_id=v_new_bd),
    'shared conversation was not preserved read-only with the old alias redacted');
  PERFORM pg_temp.cleanup_assert(EXISTS(SELECT 1 FROM weddingwin_private.deleted_chat_identities
    WHERE identity_hash=weddingwin_private.chat_identity_hash(v_bd))
    AND NOT EXISTS(SELECT 1 FROM weddingwin_private.pending_deleted_chat_identities
    WHERE member_hash=weddingwin_private.chat_identity_hash(v_bd)),
    'hash-only retention/pending cleanup did not finish');
  PERFORM pg_temp.cleanup_assert(EXISTS(SELECT 1 FROM apple_private.identities
    WHERE id=(v_identity->>'identityId')::uuid),'identity barrier dropped before job finish');
  PERFORM public.apple_grant_operation('job_finish',v_job);
  PERFORM pg_temp.cleanup_assert((SELECT status='complete' AND cleanup_completed_at IS NOT NULL
    FROM apple_private.deletion_jobs WHERE id=(v_job->>'id')::uuid)
    AND NOT EXISTS(SELECT 1 FROM apple_private.identities WHERE id=(v_identity->>'identityId')::uuid),
    'final cleanup did not complete/remove old identity');

  -- Same verified provider may start fresh only after every cleanup stage.
  v_result:=public.apple_grant_operation('signin_begin',jsonb_build_object(
    'teamId','__full_cleanup_fixture_team__','appleSub',v_sub,'leaseToken',gen_random_uuid()));
  PERFORM pg_temp.cleanup_assert(v_result->>'identityId'<>v_identity->>'identityId'
    AND v_result->>'generation'<>v_identity->>'generation'
    AND v_result->>'bdMemberId' IS NULL AND v_result->>'profileId' IS NULL,
    'fresh signup reused old identity/binding');
  INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
    VALUES(v_recreated_profile,v_email,'authenticated','authenticated',now(),now());
  UPDATE public.profiles SET bd_member_id=v_recreated_bd,apple_sub=v_sub
    WHERE id=v_recreated_profile;
  INSERT INTO public.bd_users_cache(user_id,email,token,cookie)
    VALUES(v_recreated_bd,v_email,'__recreated_fixture_token__','__recreated_fixture_cookie__');
  PERFORM public.apple_grant_operation('signin_store',v_result||jsonb_build_object(
    'bdMemberId',v_recreated_bd,'profileId',v_recreated_profile,'grantId',v_recreated_grant,
    'clientId','__fixture_apple_client__','ciphertext',repeat('d',32),
    'iv',repeat('d',16),'keyVersion',1,'tokenHash',repeat('d',64)));
  PERFORM public.apple_grant_operation('signin_release',v_result);
  v_result:=public.apple_grant_operation('enqueue',jsonb_build_object('bdMemberId',v_bd,'fullCleanup',true));
  PERFORM pg_temp.cleanup_assert(v_result->>'status'='complete'
    AND EXISTS(SELECT 1 FROM apple_private.identities WHERE apple_sub=v_sub AND status='active'
      AND profile_id=v_recreated_profile AND bd_member_id=v_recreated_bd)
    AND EXISTS(SELECT 1 FROM apple_private.grants WHERE id=v_recreated_grant)
    AND EXISTS(SELECT 1 FROM auth.users WHERE id=v_recreated_profile AND email=v_email)
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id=v_recreated_profile AND bd_member_id=v_recreated_bd)
    AND EXISTS(SELECT 1 FROM public.bd_users_cache WHERE user_id=v_recreated_bd),
    'delayed duplicate affected new generation');
END;
$$;
ROLLBACK;
