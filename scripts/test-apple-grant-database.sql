-- PostgreSQL integration regression for Apple permission revocation.
-- Run as a database owner able to SET ROLE anon/authenticated/service_role.
-- This is NOT a migration: every fixture record and DDL change is rolled back.
-- To test an unapplied migration, replace the marker below with its SQL before
-- sending the entire file as ONE query. Never run the migration separately for
-- this test. No HTTP, Apple API, auth.users, profiles, or BD operations occur.
-- All four private tables must be empty so global claim cannot touch real work.

BEGIN;
-- APPLE_PERMISSION_MIGRATION_UNDER_TEST
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.apple_test_assert(p_ok boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Apple database regression: %', p_message;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.apple_test_error(
  p_action text, p_data jsonb, p_expected_message text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM public.apple_grant_operation(p_action, p_data);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = p_expected_message THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Apple database regression: % expected %, received %',
      p_action, p_expected_message, v_message;
  END;
  RAISE EXCEPTION 'Apple database regression: % unexpectedly succeeded (expected %)',
    p_action, p_expected_message;
END;
$$;

DO $$
DECLARE
  v_rpc regprocedure;
  v_role text;
  v_table text;
BEGIN
  PERFORM pg_temp.apple_test_assert(
    NOT EXISTS (SELECT 1 FROM apple_private.identities)
    AND NOT EXISTS (SELECT 1 FROM apple_private.grants)
    AND NOT EXISTS (SELECT 1 FROM apple_private.deletion_jobs)
    AND NOT EXISTS (SELECT 1 FROM apple_private.job_grants),
    'refusing fixture: private tables already contain records'
  );
  FOREACH v_rpc IN ARRAY ARRAY[
    'public.apple_grant_private_config()'::regprocedure,
    'public.apple_grant_operation(text,jsonb)'::regprocedure
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      PERFORM pg_temp.apple_test_assert(
        NOT has_function_privilege(v_role, v_rpc, 'EXECUTE'),
        v_role || ' can execute ' || v_rpc::text
      );
    END LOOP;
    PERFORM pg_temp.apple_test_assert(
      has_function_privilege('service_role', v_rpc, 'EXECUTE'),
      'service_role cannot execute ' || v_rpc::text
    );
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    PERFORM pg_temp.apple_test_assert(
      NOT has_schema_privilege(v_role, 'apple_private', 'USAGE'),
      v_role || ' has private schema access'
    );
    FOREACH v_table IN ARRAY ARRAY['identities', 'grants', 'deletion_jobs', 'job_grants'] LOOP
      PERFORM pg_temp.apple_test_assert(
        NOT has_table_privilege(v_role, 'apple_private.' || v_table,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        v_role || ' has private table access: ' || v_table
      );
    END LOOP;
  END LOOP;
END;
$$;

-- Exercise real permission checks, not only catalog ACL inspection. The
-- configuration return value is discarded; no secret is printed or asserted.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.apple_grant_private_config();
    RAISE EXCEPTION 'anon unexpectedly executed private config';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.apple_grant_operation('signin_begin', '{}'::jsonb);
    RAISE EXCEPTION 'anon unexpectedly executed private operation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.apple_grant_private_config();
    RAISE EXCEPTION 'authenticated unexpectedly executed private config';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.apple_grant_operation('signin_begin', '{}'::jsonb);
    RAISE EXCEPTION 'authenticated unexpectedly executed private operation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_identity jsonb;
BEGIN
  PERFORM public.apple_grant_private_config();
  v_identity := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', '__weddingwin_sql_fixture__', 'appleSub', '__service_role_probe__',
    'leaseToken', '00000000-0000-4000-8000-000000000001'
  ));
  IF v_identity->>'identityId' IS NULL OR v_identity->>'generation' IS NULL THEN
    RAISE EXCEPTION 'service_role did not obtain an identity';
  END IF;
  PERFORM public.apple_grant_operation('signin_release', v_identity);
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_team constant text := '__weddingwin_sql_fixture__';
  -- Reserved fictional fixture IDs; no BD member or user record is queried.
  v_bd constant text := '9223372036854775001';
  v_missing_bd constant text := '9223372036854775002';
  v_new_bd constant text := '9223372036854775003';
  v_profile constant uuid := '00000000-0000-4000-8000-000000000010';
  v_other_profile constant uuid := '00000000-0000-4000-8000-000000000011';
  v_grant_native constant uuid := '00000000-0000-4000-8000-000000000101';
  v_grant_web constant uuid := '00000000-0000-4000-8000-000000000102';
  v_grant_second constant uuid := '00000000-0000-4000-8000-000000000103';
  v_grant_new constant uuid := '00000000-0000-4000-8000-000000000104';
  v_a jsonb;
  v_stale_a jsonb;
  v_b jsonb;
  v_recreated jsonb;
  v_store jsonb;
  v_job jsonb;
  v_duplicate jsonb;
  v_missing jsonb;
  v_claim jsonb;
  v_old_claim jsonb;
  v_snapshot jsonb;
  v_available jsonb;
  v_validate jsonb;
  v_job_deadline timestamptz;
  v_identity_deadline timestamptz;
  v_action text;
BEGIN
  v_a := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', '__cross_client_identity__',
    'leaseToken', '00000000-0000-4000-8000-000000000201'
  ));
  PERFORM pg_temp.apple_test_error('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', '__cross_client_identity__',
    'leaseToken', '00000000-0000-4000-8000-000000000202'
  ), 'APPLE_IDENTITY_BUSY');
  v_store := v_a || jsonb_build_object(
    'bdMemberId', v_bd, 'profileId', v_profile, 'grantId', v_grant_native,
    'clientId', '__fixture_native_client__',
    'ciphertext', repeat('fixture-not-a-real-token-', 2),
    'iv', 'AAAAAAAAAAAAAAAA', 'keyVersion', 1, 'tokenHash', repeat('a', 64)
  );
  FOREACH v_action IN ARRAY ARRAY['signin_store', 'signin_check', 'signin_release'] LOOP
    PERFORM pg_temp.apple_test_error(v_action, v_store || jsonb_build_object(
      'leaseToken', '00000000-0000-4000-8000-000000000299'
    ), 'APPLE_IDENTITY_LEASE_LOST');
    PERFORM pg_temp.apple_test_error(v_action, v_store || jsonb_build_object(
      'generation', '00000000-0000-4000-8000-000000000399'
    ), 'APPLE_IDENTITY_LEASE_LOST');
  END LOOP;
  UPDATE apple_private.identities SET lease_until = now() - interval '1 second'
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_error('signin_store', v_store, 'APPLE_PERMISSION_REVOCATION_PENDING');
  PERFORM pg_temp.apple_test_error('signin_check', v_store, 'APPLE_PERMISSION_REVOCATION_PENDING');
  v_stale_a := v_a;
  v_a := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', '__cross_client_identity__',
    'leaseToken', '00000000-0000-4000-8000-000000000202'
  ));
  PERFORM pg_temp.apple_test_assert(
    v_a->>'identityId' = v_stale_a->>'identityId'
    AND v_a->>'generation' = v_stale_a->>'generation',
    'lease renewal unexpectedly changed the identity generation'
  );
  PERFORM pg_temp.apple_test_error('signin_release', v_stale_a, 'APPLE_IDENTITY_LEASE_LOST');
  v_store := v_store || v_a || jsonb_build_object('bdMemberId', v_bd, 'profileId', v_profile);
  PERFORM public.apple_grant_operation('signin_store', v_store);
  PERFORM public.apple_grant_operation('signin_check', v_store);
  PERFORM public.apple_grant_operation('signin_store', v_store || jsonb_build_object(
    'grantId', '00000000-0000-4000-8000-000000000199'
  ));
  PERFORM pg_temp.apple_test_assert(
    (SELECT count(*) = 1 FROM apple_private.grants),
    'same client/token replay created a duplicate grant'
  );
  PERFORM pg_temp.apple_test_error('signin_check',
    v_store || jsonb_build_object('bdMemberId', v_new_bd), 'APPLE_IDENTITY_OWNER_MISMATCH');
  PERFORM pg_temp.apple_test_error('signin_store',
    v_store || jsonb_build_object('profileId', v_other_profile), 'APPLE_IDENTITY_OWNER_MISMATCH');
  PERFORM public.apple_grant_operation('signin_release', v_a);

  -- Native and website clients enroll under one team/sub identity. Equal token
  -- hashes from different client IDs must remain distinct revocation targets.
  v_a := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', '__cross_client_identity__',
    'leaseToken', '00000000-0000-4000-8000-000000000203'
  ));
  PERFORM pg_temp.apple_test_assert(
    v_a->>'identityId' = v_stale_a->>'identityId'
    AND v_a->>'generation' = v_stale_a->>'generation',
    'website and native grants did not share the team/sub identity'
  );
  PERFORM public.apple_grant_operation('signin_store', v_store || v_a || jsonb_build_object(
    'grantId', v_grant_web, 'clientId', '__fixture_web_client__'
  ));
  PERFORM public.apple_grant_operation('signin_release', v_a);
  v_b := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', '__second_identity_same_member__',
    'leaseToken', '00000000-0000-4000-8000-000000000204'
  ));
  PERFORM public.apple_grant_operation('signin_store', v_store || v_b || jsonb_build_object(
    'bdMemberId', v_bd, 'profileId', v_profile,
    'grantId', v_grant_second, 'tokenHash', repeat('b', 64)
  ));
  PERFORM pg_temp.apple_test_assert(
    (SELECT count(*) = 3 FROM apple_private.grants), 'expected three enrolled grants'
  );

  v_job := public.apple_grant_operation('enqueue', jsonb_build_object('bdMemberId', v_bd, 'fullCleanup', false));
  PERFORM pg_temp.apple_test_assert(
    v_job->>'status' = 'pending' AND (v_job->>'expectedGrants')::integer = 3,
    'enqueue did not snapshot every client/identity grant'
  );
  SELECT jsonb_agg(jsonb_build_array(grant_id, identity_id, generation) ORDER BY grant_id)
    INTO v_snapshot FROM apple_private.job_grants WHERE job_id = (v_job->>'jobId')::uuid;
  v_duplicate := public.apple_grant_operation('enqueue', jsonb_build_object('bdMemberId', v_bd, 'fullCleanup', false));
  PERFORM pg_temp.apple_test_assert(v_duplicate = v_job, 'duplicate event changed its queued job');
  PERFORM pg_temp.apple_test_assert(
    (SELECT bool_and(status = 'revoking') FROM apple_private.identities WHERE bd_member_id = v_bd),
    'enqueue did not freeze every bound identity'
  );
  PERFORM pg_temp.apple_test_error('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', '__cross_client_identity__',
    'leaseToken', '00000000-0000-4000-8000-000000000205'
  ), 'APPLE_PERMISSION_REVOCATION_PENDING');
  PERFORM pg_temp.apple_test_error('signin_store', v_store || v_b || jsonb_build_object(
    'bdMemberId', v_bd, 'profileId', v_profile
  ), 'APPLE_PERMISSION_REVOCATION_PENDING');
  PERFORM pg_temp.apple_test_error('signin_check', v_store || v_b || jsonb_build_object(
    'bdMemberId', v_bd, 'profileId', v_profile
  ), 'APPLE_PERMISSION_REVOCATION_PENDING');
  PERFORM pg_temp.apple_test_assert(
    public.apple_grant_operation('claim') = 'null'::jsonb,
    'worker claimed while an in-flight sign-in still held a lease'
  );
  PERFORM public.apple_grant_operation('signin_release', v_b);
  v_claim := public.apple_grant_operation('claim');
  PERFORM pg_temp.apple_test_assert(
    v_claim->>'id' = v_job->>'jobId' AND (v_claim->>'expectedGrants')::integer = 3,
    'worker claimed the wrong job or snapshot'
  );
  PERFORM pg_temp.apple_test_assert(
    public.apple_grant_operation('claim') = 'null'::jsonb, 'live worker lease was stolen'
  );
  FOREACH v_action IN ARRAY ARRAY['job_grants', 'job_validate', 'job_confirm', 'job_finish', 'job_retry'] LOOP
    PERFORM pg_temp.apple_test_error(v_action, v_claim || jsonb_build_object(
      'leaseToken', '00000000-0000-4000-8000-000000000299',
      'grantId', v_grant_native, 'generation', v_a->>'generation'
    ), 'APPLE_JOB_LEASE_LOST');
  END LOOP;
  v_available := public.apple_grant_operation('job_grants', v_claim);
  PERFORM pg_temp.apple_test_assert(jsonb_array_length(v_available) = 3,
    'worker did not receive all frozen grants');
  PERFORM pg_temp.apple_test_assert(
    (SELECT count(DISTINCT value->>'clientId') = 2 FROM jsonb_array_elements(v_available)),
    'cross-client grants collapsed in worker dispatch'
  );
  PERFORM pg_temp.apple_test_error('job_finish', v_claim, 'APPLE_GRANTS_REMAIN');
  PERFORM pg_temp.apple_test_error('job_confirm', v_claim || jsonb_build_object(
    'grantId', v_grant_native, 'generation', '00000000-0000-4000-8000-000000000399'
  ), 'APPLE_GRANT_LEASE_LOST');
  PERFORM pg_temp.apple_test_error('job_confirm', v_claim || jsonb_build_object(
    'grantId', v_grant_new, 'generation', v_a->>'generation'
  ), 'APPLE_GRANT_LEASE_LOST');

  -- The worker must re-authorize each specific immutable grant immediately
  -- before an Apple POST. A prior job_grants response is not authorization once
  -- its job/identity lease expires, changes owner, or approaches its deadline.
  v_validate := v_claim || jsonb_build_object(
    'grantId', v_grant_native, 'generation', v_a->>'generation'
  );
  SELECT lease_until INTO v_job_deadline FROM apple_private.deletion_jobs
    WHERE id = (v_job->>'jobId')::uuid;
  SELECT lease_until INTO v_identity_deadline FROM apple_private.identities
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_assert(
    (public.apple_grant_operation('job_validate', v_validate)->>'leaseUntil')::timestamptz
      = least(v_job_deadline, v_identity_deadline),
    'grant authorization did not return the minimum current lease deadline'
  );
  PERFORM pg_temp.apple_test_error('job_validate', v_validate || jsonb_build_object(
    'generation', '00000000-0000-4000-8000-000000000399'
  ), 'APPLE_GRANT_LEASE_LOST');
  PERFORM pg_temp.apple_test_error('job_validate', v_validate || jsonb_build_object(
    'grantId', v_grant_new
  ), 'APPLE_GRANT_LEASE_LOST');
  UPDATE apple_private.grants SET bd_member_id = v_new_bd WHERE id = v_grant_native;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_GRANT_LEASE_LOST');
  UPDATE apple_private.grants SET bd_member_id = v_bd WHERE id = v_grant_native;
  UPDATE apple_private.grants SET profile_id = v_other_profile WHERE id = v_grant_native;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_GRANT_LEASE_LOST');
  UPDATE apple_private.grants SET profile_id = v_profile WHERE id = v_grant_native;
  UPDATE apple_private.identities SET bd_member_id = v_new_bd
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_GRANT_LEASE_LOST');
  UPDATE apple_private.identities SET bd_member_id = v_bd, profile_id = v_other_profile
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_GRANT_LEASE_LOST');
  UPDATE apple_private.identities SET profile_id = v_profile
    WHERE id = (v_a->>'identityId')::uuid;
  UPDATE apple_private.identities
    SET lease_token = '00000000-0000-4000-8000-000000000299'
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_GRANT_LEASE_LOST');
  UPDATE apple_private.identities
    SET lease_token = (v_claim->>'leaseToken')::uuid,
        lease_until = now() - interval '1 second'
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_GRANT_LEASE_LOST');
  UPDATE apple_private.identities SET lease_until = now() + interval '10 seconds'
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_JOB_LEASE_LOST');
  UPDATE apple_private.identities SET lease_until = now() + interval '11 seconds'
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_assert(
    (public.apple_grant_operation('job_validate', v_validate)->>'leaseUntil')::timestamptz
      = now() + interval '11 seconds',
    'authorization ignored the shorter identity lease deadline'
  );
  UPDATE apple_private.identities SET lease_until = v_identity_deadline
    WHERE id = (v_a->>'identityId')::uuid;
  UPDATE apple_private.deletion_jobs SET lease_until = now() - interval '1 second'
    WHERE id = (v_job->>'jobId')::uuid;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_JOB_LEASE_LOST');
  UPDATE apple_private.deletion_jobs SET lease_until = now() + interval '10 seconds'
    WHERE id = (v_job->>'jobId')::uuid;
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_JOB_LEASE_LOST');
  UPDATE apple_private.deletion_jobs SET lease_until = now() + interval '11 seconds'
    WHERE id = (v_job->>'jobId')::uuid;
  PERFORM pg_temp.apple_test_assert(
    (public.apple_grant_operation('job_validate', v_validate)->>'leaseUntil')::timestamptz
      = now() + interval '11 seconds',
    'authorization ignored the shorter job lease deadline'
  );
  UPDATE apple_private.deletion_jobs SET lease_until = v_job_deadline
    WHERE id = (v_job->>'jobId')::uuid;
  PERFORM pg_temp.apple_test_assert(
    (SELECT count(*) = 3 FROM apple_private.grants WHERE bd_member_id = v_bd)
    AND (SELECT bool_and(revoked_at IS NULL) FROM apple_private.job_grants
      WHERE job_id = (v_job->>'jobId')::uuid),
    'pre-POST authorization consumed or confirmed a grant'
  );

  PERFORM public.apple_grant_operation('job_confirm', v_claim || jsonb_build_object(
    'grantId', v_grant_native, 'generation', v_a->>'generation'
  ));
  PERFORM pg_temp.apple_test_error('job_confirm', v_claim || jsonb_build_object(
    'grantId', v_grant_native, 'generation', v_a->>'generation'
  ), 'APPLE_GRANT_LEASE_LOST');
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_GRANT_LEASE_LOST');
  PERFORM public.apple_grant_operation('job_confirm', v_claim || jsonb_build_object(
    'grantId', v_grant_web, 'generation', v_a->>'generation'
  ));
  PERFORM pg_temp.apple_test_assert(
    jsonb_array_length(public.apple_grant_operation('job_grants', v_claim)) = 1,
    'confirmed grants were returned for another external revocation'
  );
  v_old_claim := v_claim;
  PERFORM public.apple_grant_operation('job_retry', v_claim || jsonb_build_object(
    'reason', 'more_grants_pending'
  ));
  PERFORM pg_temp.apple_test_error('job_grants', v_old_claim, 'APPLE_JOB_LEASE_LOST');
  PERFORM pg_temp.apple_test_error('job_validate', v_validate, 'APPLE_JOB_LEASE_LOST');
  PERFORM pg_temp.apple_test_assert(
    (SELECT lease_token IS NULL AND lease_until IS NULL FROM apple_private.identities
      WHERE id = (v_a->>'identityId')::uuid),
    'retry did not release the already-confirmed identity lease'
  );
  UPDATE apple_private.deletion_jobs SET next_attempt_at = now() - interval '1 second'
    WHERE id = (v_job->>'jobId')::uuid;
  v_claim := public.apple_grant_operation('claim');
  PERFORM pg_temp.apple_test_assert(
    v_claim->>'id' = v_job->>'jobId' AND v_claim->>'leaseToken' <> v_old_claim->>'leaseToken',
    'retry claim did not rotate the worker lease'
  );
  v_available := public.apple_grant_operation('job_grants', v_claim);
  PERFORM pg_temp.apple_test_assert(
    jsonb_array_length(v_available) = 1 AND v_available->0->>'grantId' = v_grant_second::text,
    'retry did not dispatch only the remaining grant'
  );
  PERFORM public.apple_grant_operation('job_confirm', v_claim || jsonb_build_object(
    'grantId', v_grant_second, 'generation', v_b->>'generation'
  ));

  -- Simulate a crash after the LAST confirmation, before job_finish. All old
  -- confirmations persist, but their identities have different/expired leases.
  v_old_claim := v_claim;
  UPDATE apple_private.deletion_jobs SET lease_until = now() - interval '1 second'
    WHERE id = (v_job->>'jobId')::uuid;
  UPDATE apple_private.identities SET lease_until = now() - interval '1 second'
    WHERE id = (v_b->>'identityId')::uuid;
  PERFORM pg_temp.apple_test_error('job_finish', v_old_claim, 'APPLE_JOB_LEASE_LOST');
  v_claim := public.apple_grant_operation('claim');
  PERFORM pg_temp.apple_test_assert(
    v_claim->>'id' = v_job->>'jobId' AND v_claim->>'leaseToken' <> v_old_claim->>'leaseToken',
    'crash recovery did not rotate the worker lease'
  );
  PERFORM pg_temp.apple_test_assert(
    public.apple_grant_operation('job_grants', v_claim) = '[]'::jsonb,
    'crash recovery returned already-confirmed credentials'
  );
  PERFORM pg_temp.apple_test_error('job_validate', v_claim || jsonb_build_object(
    'grantId', v_grant_second, 'generation', v_b->>'generation'
  ), 'APPLE_GRANT_LEASE_LOST');
  PERFORM pg_temp.apple_test_error('job_finish', v_old_claim, 'APPLE_JOB_LEASE_LOST');
  PERFORM public.apple_grant_operation('job_finish', v_claim);
  PERFORM pg_temp.apple_test_assert(
    (SELECT status = 'complete' AND completed_at IS NOT NULL AND lease_token IS NULL
      AND lease_until IS NULL AND attempts = 3 FROM apple_private.deletion_jobs
      WHERE id = (v_job->>'jobId')::uuid),
    'crash-recovered job did not reach a terminal complete state'
  );
  PERFORM pg_temp.apple_test_assert(
    NOT EXISTS (SELECT 1 FROM apple_private.identities WHERE bd_member_id = v_bd)
    AND NOT EXISTS (SELECT 1 FROM apple_private.grants WHERE bd_member_id = v_bd),
    'finish left an old identity frozen after its final grant was confirmed in an earlier lease'
  );
  PERFORM pg_temp.apple_test_assert(
    (SELECT jsonb_agg(jsonb_build_array(grant_id, identity_id, generation) ORDER BY grant_id)
      = v_snapshot AND bool_and(revoked_at IS NOT NULL) FROM apple_private.job_grants
      WHERE job_id = (v_job->>'jobId')::uuid),
    'immutable snapshot changed or lost a revocation confirmation'
  );
  PERFORM pg_temp.apple_test_error('job_finish', v_claim, 'APPLE_JOB_LEASE_LOST');

  -- No stored grant is a manual-action state, never permission-removal success.
  v_missing := public.apple_grant_operation('enqueue', jsonb_build_object('bdMemberId', v_missing_bd, 'fullCleanup', false));
  PERFORM pg_temp.apple_test_assert(
    v_missing->>'status' = 'no_credential' AND (v_missing->>'expectedGrants')::integer = 0,
    'missing credentials were not reported as no_credential'
  );
  PERFORM pg_temp.apple_test_assert(
    (SELECT last_reason = 'manual_apple_revocation_required' AND completed_at IS NULL
      AND attempts = 0 FROM apple_private.deletion_jobs WHERE id = (v_missing->>'jobId')::uuid),
    'missing credentials incorrectly look completed or attempted'
  );
  PERFORM pg_temp.apple_test_assert(
    public.apple_grant_operation('enqueue', jsonb_build_object('bdMemberId', v_missing_bd, 'fullCleanup', false)) = v_missing,
    'duplicate missing-credential event changed the original receipt'
  );
  PERFORM pg_temp.apple_test_assert(
    public.apple_grant_operation('claim') = 'null'::jsonb,
    'worker claimed a complete or no-credential job'
  );

  -- Same Apple identity signs up again under a new BD ID. An old deletion
  -- receipt must stay bound to the old UUID/generation, not the reusable sub.
  v_recreated := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', '__cross_client_identity__',
    'leaseToken', '00000000-0000-4000-8000-000000000206'
  ));
  PERFORM pg_temp.apple_test_assert(
    v_recreated->>'identityId' <> v_a->>'identityId'
    AND v_recreated->>'generation' <> v_a->>'generation',
    'recreated identity reused its deleted UUID/generation'
  );
  PERFORM public.apple_grant_operation('signin_store', v_store || v_recreated || jsonb_build_object(
    'bdMemberId', v_new_bd, 'profileId', v_other_profile,
    'grantId', v_grant_new, 'tokenHash', repeat('c', 64)
  ));
  PERFORM public.apple_grant_operation('signin_release', v_recreated);
  v_duplicate := public.apple_grant_operation('enqueue', jsonb_build_object('bdMemberId', v_bd, 'fullCleanup', false));
  PERFORM pg_temp.apple_test_assert(
    v_duplicate->>'jobId' = v_job->>'jobId' AND v_duplicate->>'status' = 'complete'
    AND (v_duplicate->>'expectedGrants')::integer = 3,
    'delayed old receipt reopened or expanded the complete job'
  );
  PERFORM pg_temp.apple_test_assert(
    public.apple_grant_operation('claim') = 'null'::jsonb,
    'delayed receipt exposed a newly recreated identity to the worker'
  );
  PERFORM pg_temp.apple_test_error('job_confirm', v_claim || jsonb_build_object(
    'grantId', v_grant_new, 'generation', v_recreated->>'generation'
  ), 'APPLE_JOB_LEASE_LOST');
  PERFORM pg_temp.apple_test_error('job_validate', v_claim || jsonb_build_object(
    'grantId', v_grant_new, 'generation', v_recreated->>'generation'
  ), 'APPLE_JOB_LEASE_LOST');
  PERFORM pg_temp.apple_test_assert(
    (SELECT i.status = 'active' AND i.bd_member_id = v_new_bd
      AND i.generation = (v_recreated->>'generation')::uuid
      AND g.bd_member_id = v_new_bd AND g.profile_id = v_other_profile
      FROM apple_private.identities i JOIN apple_private.grants g ON g.identity_id = i.id
      WHERE i.id = (v_recreated->>'identityId')::uuid AND g.id = v_grant_new)
    AND NOT EXISTS (SELECT 1 FROM apple_private.job_grants
      WHERE identity_id = (v_recreated->>'identityId')::uuid OR grant_id = v_grant_new),
    'an old deletion job changed or enrolled the recreated identity'
  );
  RAISE NOTICE 'Apple database regressions passed; rolling back all fixture data.';
END;
$$;

ROLLBACK;
