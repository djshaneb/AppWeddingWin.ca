-- Filename version reconciled with the linked Supabase migration history.
alter table public.app_login_exchanges
  add column if not exists bd_member_id text;

alter table public.app_native_auth_exchanges
  add column if not exists bd_member_id text;

create table if not exists public.app_login_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint app_login_rate_limits_attempt_count_check check (attempt_count >= 0)
);

alter table public.app_login_rate_limits enable row level security;
revoke all on public.app_login_rate_limits from anon, authenticated;

update public.app_login_exchanges
   set bd_member_id = nullif(btrim(payload ->> 'user_id'), '')
 where bd_member_id is null;

update public.app_native_auth_exchanges
   set bd_member_id = nullif(btrim(payload #>> '{native_session,user_id}'), '')
 where bd_member_id is null;

create index if not exists app_login_exchanges_bd_member_id_idx
  on public.app_login_exchanges (bd_member_id)
  where bd_member_id is not null;

create index if not exists app_native_auth_exchanges_bd_member_id_idx
  on public.app_native_auth_exchanges (bd_member_id)
  where bd_member_id is not null;

create or replace function public.purge_expired_app_auth_exchanges()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_app_login_count integer;
  v_native_auth_count integer;
  v_rate_limit_count integer;
begin
  delete from public.app_login_exchanges
   where expires_at <= now();
  get diagnostics v_app_login_count = row_count;

  delete from public.app_native_auth_exchanges
   where expires_at <= now();
  get diagnostics v_native_auth_count = row_count;

  delete from public.app_login_rate_limits
   where updated_at <= now() - interval '24 hours'
     and coalesce(blocked_until, '-infinity'::timestamptz) <= now();
  get diagnostics v_rate_limit_count = row_count;

  return jsonb_build_object(
    'app_login_exchanges', v_app_login_count,
    'app_native_auth_exchanges', v_native_auth_count,
    'app_login_rate_limits', v_rate_limit_count
  );
end;
$$;

create or replace function public.consume_app_login_rate_limit(
  p_key_hash text,
  p_max_attempts integer default 20,
  p_window_seconds integer default 900,
  p_block_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.app_login_rate_limits%rowtype;
begin
  if p_key_hash !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'A valid rate-limit key is required.';
  end if;
  if p_max_attempts < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception 'Rate-limit settings must be positive.';
  end if;

  insert into public.app_login_rate_limits (
    key_hash,
    window_started_at,
    attempt_count,
    updated_at
  ) values (
    p_key_hash,
    v_now,
    1,
    v_now
  )
  on conflict (key_hash) do nothing;

  select *
    into v_row
    from public.app_login_rate_limits
   where key_hash = p_key_hash
   for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer)
    );
  end if;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    update public.app_login_rate_limits
       set window_started_at = v_now,
           attempt_count = 1,
           blocked_until = null,
           updated_at = v_now
     where key_hash = p_key_hash;
    return jsonb_build_object('allowed', true, 'remaining', p_max_attempts - 1);
  end if;

  if v_row.attempt_count >= p_max_attempts then
    update public.app_login_rate_limits
       set blocked_until = v_now + make_interval(secs => p_block_seconds),
           updated_at = v_now
     where key_hash = p_key_hash;
    return jsonb_build_object('allowed', false, 'retry_after_seconds', p_block_seconds);
  end if;

  update public.app_login_rate_limits
     set attempt_count = attempt_count + 1,
         blocked_until = null,
         updated_at = v_now
   where key_hash = p_key_hash
  returning * into v_row;

  return jsonb_build_object('allowed', true, 'remaining', p_max_attempts - v_row.attempt_count);
end;
$$;

create or replace function public.purge_member_app_auth_exchanges(p_bd_member_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text := btrim(coalesce(p_bd_member_id, ''));
  v_app_login_count integer;
  v_native_auth_count integer;
begin
  if v_user_id = '' then
    raise exception 'A member id is required.';
  end if;

  delete from public.app_login_exchanges
   where bd_member_id = v_user_id;
  get diagnostics v_app_login_count = row_count;

  delete from public.app_native_auth_exchanges
   where bd_member_id = v_user_id;
  get diagnostics v_native_auth_count = row_count;

  return jsonb_build_object(
    'app_login_exchanges', v_app_login_count,
    'app_native_auth_exchanges', v_native_auth_count
  );
end;
$$;

create or replace function public.redeem_app_login_exchange(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  redeemed jsonb;
begin
  perform public.purge_expired_app_auth_exchanges();

  delete from public.app_login_exchanges
   where code_hash = p_code_hash
     and expires_at > now()
  returning payload into redeemed;

  return redeemed;
end;
$$;

create or replace function public.redeem_native_auth_exchange(
  p_code_hash text,
  p_code_challenge text,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  redeemed jsonb;
begin
  perform public.purge_expired_app_auth_exchanges();

  delete from public.app_native_auth_exchanges
   where code_hash = p_code_hash
     and code_challenge = p_code_challenge
     and provider = p_provider
     and expires_at > now()
  returning payload into redeemed;

  return redeemed;
end;
$$;

revoke all on function public.purge_expired_app_auth_exchanges() from public, anon, authenticated;
revoke all on function public.purge_member_app_auth_exchanges(text) from public, anon, authenticated;
revoke all on function public.consume_app_login_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.redeem_app_login_exchange(text) from public, anon, authenticated;
revoke all on function public.redeem_native_auth_exchange(text, text, text) from public, anon, authenticated;

grant execute on function public.purge_expired_app_auth_exchanges() to service_role;
grant execute on function public.purge_member_app_auth_exchanges(text) to service_role;
grant execute on function public.consume_app_login_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.redeem_app_login_exchange(text) to service_role;
grant execute on function public.redeem_native_auth_exchange(text, text, text) to service_role;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'purge-expired-app-auth-exchanges';

select cron.schedule(
  'purge-expired-app-auth-exchanges',
  '*/5 * * * *',
  'select public.purge_expired_app_auth_exchanges()'
);

select public.purge_expired_app_auth_exchanges();
