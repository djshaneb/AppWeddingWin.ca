DO $restore_body$
BEGIN
  IF clock_timestamp() < TIMESTAMPTZ '2026-10-18 19:00:00+00' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = 2 AND jobname = 'weddingwin-chat-push-sweep') THEN
    RAISE EXCEPTION 'Expected WeddingWin push sweep job 2 is missing';
  END IF;
  PERFORM cron.alter_job(job_id := 2, schedule := '* * * * *', active := true);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = 2 AND jobname = 'weddingwin-chat-push-sweep' AND active = true AND schedule = '* * * * *') THEN
    RAISE EXCEPTION 'WeddingWin push sweep restoration was not confirmed';
  END IF;
  PERFORM cron.unschedule('weddingwin-show-20261018-restore-push-sweep'::text);
END
$restore_body$;
