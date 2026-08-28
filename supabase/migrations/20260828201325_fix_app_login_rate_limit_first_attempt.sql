-- Filename version reconciled with the linked Supabase migration history.
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
  on conflict (key_hash) do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object('allowed', true, 'remaining', p_max_attempts - 1);
  end if;

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

revoke all on function public.consume_app_login_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_app_login_rate_limit(text, integer, integer, integer)
  to service_role;
