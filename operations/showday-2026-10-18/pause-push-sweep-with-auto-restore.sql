DO $setup$
DECLARE
  restore_job_id bigint;
BEGIN
  IF clock_timestamp() >= TIMESTAMPTZ '2026-10-18 19:00:00+00' THEN
    RAISE EXCEPTION 'The show relief window has already ended';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = 2 AND jobname = 'weddingwin-chat-push-sweep' AND active = true AND schedule = '*/5 * * * *' AND md5(command) = 'e9197624a44f710a99dcc81c98d70e50') THEN
    RAISE EXCEPTION 'Expected WeddingWin push sweep state changed';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weddingwin-show-20261018-restore-push-sweep') THEN
    RAISE EXCEPTION 'WeddingWin push sweep restoration already exists';
  END IF;
  SELECT cron.schedule('weddingwin-show-20261018-restore-push-sweep', '* * * * *', $restore$DO $restore_body$
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
$restore_body$;$restore$) INTO restore_job_id;
  IF restore_job_id IS NULL THEN
    RAISE EXCEPTION 'WeddingWin push sweep restoration could not be scheduled';
  END IF;
  PERFORM cron.alter_job(job_id := 2, active := false);
END
$setup$;
