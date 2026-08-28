-- Filename version reconciled with the linked Supabase migration history.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'weddingwin-chat-push-sweep'
  ) THEN
    PERFORM cron.unschedule('weddingwin-chat-push-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'weddingwin-chat-push-sweep',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-push-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo'
    ),
    body := '{}'::jsonb
  );
  $$
);
