-- ROLLBACK-ONLY fixture, never a migration or production cleanup command.
-- Run this entire file as ONE owner query. For an unapplied migration replace
-- the marker inside this transaction with its SQL, never apply it separately.
-- Exact job IDs isolate claims from real work. Reserved IDs/subjects are checked
-- before use; all created rows and DDL roll back. No Apple, BD, GoTrue or HTTP
-- API is called. Synthetic auth.users inserts exercise the real profile trigger.
BEGIN;
-- FAILED_APPLE_SIGNUP_MIGRATION_UNDER_TEST
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';
SET LOCAL request.jwt.claim.role = 'service_role';

CREATE FUNCTION pg_temp.failed_signup_assert(p_ok boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Failed Apple signup regression: %', p_message;
  END IF;
END $$;
CREATE FUNCTION pg_temp.failed_signup_error(p_action text, p_data jsonb, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_message text;
BEGIN
  BEGIN
    PERFORM public.apple_failed_signup_operation(p_action, p_data);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = p_expected THEN RETURN; END IF;
    RAISE EXCEPTION 'Failed Apple signup regression: % expected %, received %',
      p_action, p_expected, v_message;
  END;
  RAISE EXCEPTION 'Failed Apple signup regression: % unexpectedly succeeded', p_action;
END $$;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    PERFORM pg_temp.failed_signup_assert(NOT has_function_privilege(v_role,
      'public.apple_failed_signup_operation(text,jsonb)', 'EXECUTE'), v_role || ' can run RPC');
    PERFORM pg_temp.failed_signup_assert(NOT has_table_privilege(v_role,
      'apple_private.failed_signup_revocations', 'SELECT,INSERT,UPDATE,DELETE'), v_role || ' can access jobs');
  END LOOP;
  PERFORM pg_temp.failed_signup_assert(has_function_privilege('service_role',
    'public.apple_failed_signup_operation(text,jsonb)', 'EXECUTE'), 'service role cannot run RPC');
  PERFORM pg_temp.failed_signup_assert(NOT has_table_privilege('service_role',
    'apple_private.failed_signup_revocations', 'SELECT,INSERT,UPDATE,DELETE'), 'service role can bypass RPC');
  PERFORM pg_temp.failed_signup_assert((SELECT relrowsecurity FROM pg_class
    WHERE oid = 'apple_private.failed_signup_revocations'::regclass), 'RLS disabled');
  PERFORM pg_temp.failed_signup_assert(NOT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'apple_private' AND table_name = 'failed_signup_revocations'
      AND column_name IN ('apple_sub', 'bd_member_id', 'profile_id', 'email')), 'PII retained in job history');
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.apple_failed_signup_operation('claim', '{}');
    RAISE EXCEPTION 'anon executed failed-signup RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.apple_failed_signup_operation('claim', '{}');
    RAISE EXCEPTION 'authenticated executed failed-signup RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_team constant text := '__failed_signup_sql_fixture__';
  v_prefix constant text := '__failed_signup_sql_fixture_';
  v_sub constant text := '__failed_signup_sql_fixture_main__';
  v_profile constant uuid := 'fa1151a0-0000-4000-8000-000000000001';
  v_job_id constant uuid := 'fa1151a0-0000-4000-8000-000000000002';
  v_other_job constant uuid := 'fa1151a0-0000-4000-8000-000000000003';
  v_missing_job constant uuid := 'fa1151a0-0000-4000-8000-000000000004';
  v_stale_job constant uuid := 'fa1151a0-0000-4000-8000-000000000005';
  v_grant constant uuid := 'fa1151a0-0000-4000-8000-000000000006';
  v_bd constant text := '9900000000000000011';
  v_a jsonb;
  v_bound jsonb;
  v_legacy jsonb;
  v_missing jsonb;
  v_stale jsonb;
  v_new jsonb;
  v_input jsonb;
  v_result jsonb;
  v_claim jsonb;
  v_old_claim jsonb;
  v_action text;
  v_message text;
BEGIN
  PERFORM pg_temp.failed_signup_assert(NOT EXISTS(
    SELECT 1 FROM apple_private.identities WHERE team_id = v_team
      OR left(apple_sub, length(v_prefix)) = v_prefix OR bd_member_id = v_bd
  ) AND NOT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = v_profile OR bd_member_id = v_bd
      OR left(apple_sub, length(v_prefix)) = v_prefix
  ) AND NOT EXISTS(
    SELECT 1 FROM auth.users WHERE id = v_profile OR email = 'failed-signup-fixture@example.invalid'
  ) AND NOT EXISTS(
    SELECT 1 FROM apple_private.failed_signup_revocations
      WHERE id IN (v_job_id, v_other_job, v_missing_job, v_stale_job)
  ) AND NOT EXISTS(SELECT 1 FROM apple_private.grants WHERE id = v_grant
    OR profile_id = v_profile OR bd_member_id = v_bd
  ) AND NOT EXISTS(SELECT 1 FROM apple_private.deletion_jobs
    WHERE bd_member_id = v_bd OR cleanup_profile_id = v_profile),
    'reserved fixture collision; refusing to touch existing rows');

  v_a := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', v_sub, 'leaseToken', gen_random_uuid()));
  v_input := v_a || jsonb_build_object('jobId', v_job_id, 'appleSub', v_sub,
    'clientId', 'ca.weddingwin.app', 'ciphertext', repeat('x', 40),
    'iv', 'AAAAAAAAAAAAAAAA', 'keyVersion', 1, 'tokenHash', repeat('a', 64));
  PERFORM pg_temp.failed_signup_error('enqueue', v_input || jsonb_build_object('appleSub', 'wrong'),
    'APPLE_FAILED_SIGNUP_LEASE_LOST');
  PERFORM pg_temp.failed_signup_error('enqueue', v_input - 'leaseToken', 'APPLE_FAILED_SIGNUP_INVALID_INPUT');

  v_bound := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', v_prefix || 'bound__', 'leaseToken', gen_random_uuid()));
  UPDATE apple_private.identities SET bd_member_id = v_bd WHERE id = (v_bound->>'identityId')::uuid;
  PERFORM pg_temp.failed_signup_error('enqueue', v_input || v_bound || jsonb_build_object(
    'appleSub', v_prefix || 'bound__', 'jobId', v_other_job), 'APPLE_FAILED_SIGNUP_ACCOUNT_BOUND');
  UPDATE apple_private.identities SET bd_member_id = NULL, profile_id = v_profile
    WHERE id = (v_bound->>'identityId')::uuid;
  PERFORM pg_temp.failed_signup_error('enqueue', v_input || v_bound || jsonb_build_object(
    'appleSub', v_prefix || 'bound__', 'jobId', v_other_job), 'APPLE_FAILED_SIGNUP_ACCOUNT_BOUND');
  UPDATE apple_private.identities SET profile_id = NULL WHERE id = (v_bound->>'identityId')::uuid;
  INSERT INTO apple_private.grants(id, identity_id, generation, client_id, bd_member_id,
    profile_id, ciphertext, iv, key_version, token_hash)
    VALUES(v_grant, (v_bound->>'identityId')::uuid, (v_bound->>'generation')::uuid,
      'ca.weddingwin.app', v_bd, v_profile, repeat('y', 40), 'BBBBBBBBBBBBBBBB', 1, repeat('b', 64));
  PERFORM pg_temp.failed_signup_error('enqueue', v_input || v_bound || jsonb_build_object(
    'appleSub', v_prefix || 'bound__', 'jobId', v_other_job), 'APPLE_FAILED_SIGNUP_ACCOUNT_BOUND');

  INSERT INTO auth.users(id, email, aud, role, created_at, updated_at)
    VALUES(v_profile, 'failed-signup-fixture@example.invalid', 'authenticated', 'authenticated', now(), now());
  INSERT INTO public.profiles(id, email) VALUES(v_profile, 'failed-signup-fixture@example.invalid')
    ON CONFLICT(id) DO NOTHING;
  v_legacy := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', v_prefix || 'legacy__', 'leaseToken', gen_random_uuid()));
  UPDATE public.profiles SET apple_sub = v_prefix || 'legacy__' WHERE id = v_profile;
  PERFORM pg_temp.failed_signup_error('enqueue', v_input || v_legacy || jsonb_build_object(
    'appleSub', v_prefix || 'legacy__', 'jobId', v_other_job), 'APPLE_FAILED_SIGNUP_ACCOUNT_BOUND');

  v_result := public.apple_failed_signup_operation('enqueue', v_input);
  PERFORM pg_temp.failed_signup_assert(v_result->>'id' = v_job_id::text
    AND v_result->>'status' = 'pending', 'valid enqueue failed');
  PERFORM pg_temp.failed_signup_assert(public.apple_failed_signup_operation('enqueue', v_input) = v_result,
    'exact duplicate changed job');
  PERFORM pg_temp.failed_signup_error('enqueue', v_input || jsonb_build_object('jobId', v_other_job),
    'APPLE_FAILED_SIGNUP_CONFLICT');
  PERFORM pg_temp.failed_signup_error('enqueue', v_input || jsonb_build_object('ciphertext', repeat('z', 40)),
    'APPLE_FAILED_SIGNUP_CONFLICT');
  PERFORM pg_temp.failed_signup_assert(public.apple_failed_signup_operation('claim',
    jsonb_build_object('id', v_job_id)) = 'null'::jsonb, 'claim stole current signup lease');
  BEGIN
    PERFORM public.apple_grant_operation('signin_begin', jsonb_build_object(
      'teamId', v_team, 'appleSub', v_sub, 'leaseToken', gen_random_uuid()));
    RAISE EXCEPTION 'pending failed signup allowed a new signin';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'APPLE_PERMISSION_REVOCATION_PENDING' THEN RAISE; END IF;
  END;

  -- Test both INSERT and UPDATE guards. The inner subtransaction restores the
  -- synthetic profile after its deliberate DELETE; no real profile is touched.
  BEGIN
    UPDATE public.profiles SET apple_sub = v_sub WHERE id = v_profile;
    RAISE EXCEPTION 'pending failed signup accepted profile update';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'APPLE_PERMISSION_REVOCATION_PENDING' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.profiles WHERE id = v_profile;
    INSERT INTO public.profiles(id, apple_sub) VALUES(v_profile, v_sub);
    RAISE EXCEPTION 'pending failed signup accepted profile insert';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'APPLE_PERMISSION_REVOCATION_PENDING' THEN RAISE; END IF;
  END;
  PERFORM public.apple_grant_operation('signin_release', v_a);
  PERFORM pg_temp.failed_signup_assert((SELECT status = 'revoking' AND lease_token IS NULL
    FROM apple_private.identities WHERE id = (v_a->>'identityId')::uuid), 'release cleared revocation barrier');
  v_claim := public.apple_failed_signup_operation('claim', jsonb_build_object('id', v_job_id));
  PERFORM pg_temp.failed_signup_assert(v_claim->>'id' = v_job_id::text
    AND v_claim->>'appleSub' = v_sub AND v_claim->>'identityId' = v_a->>'identityId', 'claim context wrong');
  PERFORM pg_temp.failed_signup_assert(public.apple_failed_signup_operation('claim',
    jsonb_build_object('id', v_job_id)) = 'null'::jsonb, 'second claimant stole lease');
  PERFORM public.apple_failed_signup_operation('validate', v_claim);
  FOREACH v_action IN ARRAY ARRAY['validate', 'complete', 'retry'] LOOP
    PERFORM pg_temp.failed_signup_error(v_action, v_claim || jsonb_build_object('generation', gen_random_uuid()),
      'APPLE_FAILED_SIGNUP_LEASE_LOST');
    PERFORM pg_temp.failed_signup_error(v_action, v_claim || jsonb_build_object('clientId', 'wrong.client'),
      'APPLE_FAILED_SIGNUP_LEASE_LOST');
    PERFORM pg_temp.failed_signup_error(v_action, v_claim || jsonb_build_object('appleSub', 'wrong'),
      'APPLE_FAILED_SIGNUP_LEASE_LOST');
    PERFORM pg_temp.failed_signup_error(v_action, v_claim - 'appleSub', 'APPLE_FAILED_SIGNUP_INVALID_INPUT');
  END LOOP;
  UPDATE apple_private.failed_signup_revocations SET lease_until = clock_timestamp() + interval '9 seconds'
    WHERE id = v_job_id;
  PERFORM pg_temp.failed_signup_error('validate', v_claim, 'APPLE_FAILED_SIGNUP_LEASE_LOST');
  UPDATE apple_private.failed_signup_revocations SET lease_until = clock_timestamp() + interval '90 seconds'
    WHERE id = v_job_id;
  UPDATE apple_private.identities SET lease_until = clock_timestamp() + interval '9 seconds'
    WHERE id = (v_a->>'identityId')::uuid;
  PERFORM pg_temp.failed_signup_error('validate', v_claim, 'APPLE_FAILED_SIGNUP_LEASE_LOST');
  UPDATE apple_private.identities SET lease_until = clock_timestamp() + interval '90 seconds'
    WHERE id = (v_a->>'identityId')::uuid;
  -- Model a legacy mapping newly discovered for the exact subject. The profile
  -- is attached before this synthetic identity is changed, so no real trigger
  -- is disabled and no production mapping is temporarily bypassed.
  UPDATE public.profiles SET apple_sub = v_prefix || 'late_legacy__' WHERE id = v_profile;
  UPDATE apple_private.identities SET apple_sub = v_prefix || 'late_legacy__'
    WHERE id = (v_a->>'identityId')::uuid;
  FOREACH v_action IN ARRAY ARRAY['validate', 'complete', 'retry'] LOOP
    PERFORM pg_temp.failed_signup_error(v_action,
      v_claim || jsonb_build_object('appleSub', v_prefix || 'late_legacy__'),
      'APPLE_FAILED_SIGNUP_ACCOUNT_BOUND');
  END LOOP;
  UPDATE apple_private.identities SET apple_sub = v_sub WHERE id = (v_a->>'identityId')::uuid;
  UPDATE public.profiles SET apple_sub = v_prefix || 'legacy__' WHERE id = v_profile;
  BEGIN
    UPDATE apple_private.failed_signup_revocations SET token_hash = repeat('c', 64) WHERE id = v_job_id;
    RAISE EXCEPTION 'token binding was mutable';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'APPLE_FAILED_SIGNUP_IMMUTABLE' THEN RAISE; END IF;
  END;

  v_old_claim := v_claim;
  PERFORM public.apple_failed_signup_operation('retry', v_claim);
  PERFORM pg_temp.failed_signup_assert((SELECT status = 'retry' AND ciphertext IS NOT NULL
    AND confirmed_at IS NULL AND lease_token IS NULL AND next_attempt_at > now()
    FROM apple_private.failed_signup_revocations WHERE id = v_job_id), 'retry lost token or falsely completed');
  PERFORM pg_temp.failed_signup_assert((SELECT status = 'revoking' AND lease_token IS NULL
    FROM apple_private.identities WHERE id = (v_a->>'identityId')::uuid), 'retry removed barrier');
  PERFORM pg_temp.failed_signup_assert(public.apple_failed_signup_operation('claim',
    jsonb_build_object('id', v_job_id)) = 'null'::jsonb, 'retry ignored backoff');
  UPDATE apple_private.failed_signup_revocations SET next_attempt_at = now() - interval '1 second'
    WHERE id = v_job_id;
  v_claim := public.apple_failed_signup_operation('claim', jsonb_build_object('id', v_job_id));
  PERFORM pg_temp.failed_signup_assert(v_claim->>'leaseToken' <> v_old_claim->>'leaseToken', 'reclaimed same lease');
  PERFORM pg_temp.failed_signup_error('validate', v_old_claim, 'APPLE_FAILED_SIGNUP_LEASE_LOST');
  PERFORM public.apple_failed_signup_operation('validate', v_claim);
  -- This fixture stands in for the worker receiving HTTP 200. SQL itself does
  -- not call Apple; only this explicit complete operation may erase ciphertext.
  v_result := public.apple_failed_signup_operation('complete', v_claim);
  PERFORM pg_temp.failed_signup_assert(v_result->>'status' = 'complete' AND NOT EXISTS(
    SELECT 1 FROM apple_private.identities WHERE id = (v_a->>'identityId')::uuid), 'exact old identity not removed');
  PERFORM pg_temp.failed_signup_assert((SELECT status = 'complete' AND confirmed_at IS NOT NULL
    AND ciphertext IS NULL AND iv IS NULL AND token_hash IS NULL AND attempts = 2
    FROM apple_private.failed_signup_revocations WHERE id = v_job_id), 'completion retained credentials');
  v_new := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', v_sub, 'leaseToken', gen_random_uuid()));
  PERFORM pg_temp.failed_signup_assert(v_new->>'identityId' <> v_a->>'identityId'
    AND v_new->>'generation' <> v_a->>'generation', 'fresh generation reused old identity');
  PERFORM pg_temp.failed_signup_error('complete', v_claim, 'APPLE_FAILED_SIGNUP_LEASE_LOST');
  PERFORM pg_temp.failed_signup_error('enqueue', v_input, 'APPLE_FAILED_SIGNUP_LEASE_LOST');
  PERFORM pg_temp.failed_signup_assert((SELECT status = 'active' FROM apple_private.identities
    WHERE id = (v_new->>'identityId')::uuid), 'old receipt modified new identity');

  -- Missing exact identity is not proof Apple revoked the token.
  v_missing := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', v_prefix || 'missing__', 'leaseToken', gen_random_uuid()));
  PERFORM public.apple_failed_signup_operation('enqueue', v_input || v_missing || jsonb_build_object(
    'jobId', v_missing_job, 'appleSub', v_prefix || 'missing__'));
  PERFORM public.apple_grant_operation('signin_release', v_missing);
  DELETE FROM apple_private.identities WHERE id = (v_missing->>'identityId')::uuid;
  PERFORM pg_temp.failed_signup_assert(public.apple_failed_signup_operation('claim',
    jsonb_build_object('id', v_missing_job)) = 'null'::jsonb, 'missing identity was claimable');
  PERFORM pg_temp.failed_signup_assert((SELECT status = 'pending' AND ciphertext IS NOT NULL
    AND confirmed_at IS NULL FROM apple_private.failed_signup_revocations WHERE id = v_missing_job),
    'missing identity falsely completed');

  -- Simulate an administrator replacing a generation while an old job exists.
  -- Worker must not mutate/revoke that new generation even with its old receipt.
  v_stale := public.apple_grant_operation('signin_begin', jsonb_build_object(
    'teamId', v_team, 'appleSub', v_prefix || 'stale__', 'leaseToken', gen_random_uuid()));
  PERFORM public.apple_failed_signup_operation('enqueue', v_input || v_stale || jsonb_build_object(
    'jobId', v_stale_job, 'appleSub', v_prefix || 'stale__'));
  PERFORM public.apple_grant_operation('signin_release', v_stale);
  v_claim := public.apple_failed_signup_operation('claim', jsonb_build_object('id', v_stale_job));
  UPDATE apple_private.identities SET generation = gen_random_uuid(), status = 'active',
    lease_token = NULL, lease_until = NULL WHERE id = (v_stale->>'identityId')::uuid;
  FOREACH v_action IN ARRAY ARRAY['validate', 'complete', 'retry'] LOOP
    PERFORM pg_temp.failed_signup_error(v_action, v_claim, 'APPLE_FAILED_SIGNUP_LEASE_LOST');
  END LOOP;
  PERFORM pg_temp.failed_signup_assert((SELECT status = 'active' FROM apple_private.identities
    WHERE id = (v_stale->>'identityId')::uuid), 'stale job changed newer generation');
  PERFORM pg_temp.failed_signup_assert(EXISTS(SELECT 1 FROM public.profiles
    WHERE id = v_profile AND apple_sub = v_prefix || 'legacy__') AND EXISTS(
    SELECT 1 FROM apple_private.grants WHERE id = v_grant), 'legacy account or regular grant was touched');
END $$;

SELECT 'failed Apple signup rollback fixture passed' AS result;
ROLLBACK;
