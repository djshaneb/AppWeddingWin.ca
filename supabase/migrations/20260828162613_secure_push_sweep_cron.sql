-- The anon JWT only passes the Edge gateway; it is not authorization for the
-- sweep. A random secret lives exclusively in Vault. Cron sends it as a header,
-- and the Edge function asks this database (using service_role) to verify it.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'weddingwin_push_sweep_cron_secret'
  ) then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'weddingwin_push_sweep_cron_secret',
      'Authenticates the internal WeddingWin push-sweep cron request.'
    );
  end if;
end $$;

create or replace function public.verify_weddingwin_push_sweep_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select length(coalesce(p_secret, '')) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'weddingwin_push_sweep_cron_secret'
        and decrypted_secret = p_secret
    );
$$;

revoke all on function public.verify_weddingwin_push_sweep_secret(text) from public;
revoke all on function public.verify_weddingwin_push_sweep_secret(text) from anon;
revoke all on function public.verify_weddingwin_push_sweep_secret(text) from authenticated;
grant execute on function public.verify_weddingwin_push_sweep_secret(text) to service_role;

do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'weddingwin-chat-push-sweep'
  ) then
    perform cron.unschedule('weddingwin-chat-push-sweep');
  end if;
end $$;

select cron.schedule(
  'weddingwin-chat-push-sweep',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-push-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo',
      'X-WeddingWin-Cron-Secret', coalesce(
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'weddingwin_push_sweep_cron_secret'
          order by created_at desc
          limit 1
        ),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
