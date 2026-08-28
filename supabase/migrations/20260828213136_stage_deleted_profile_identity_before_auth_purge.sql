-- Filename version reconciled with the linked Supabase migration history.
-- The deletion edge function removes the GoTrue user before its final purge
-- RPC. Because profiles.id references auth.users, that can cascade the profile
-- row before the redaction wrapper reads email/apple_sub/profile id. Capture
-- those values first as inactive, hash-only staging rows, then promote them to
-- durable tombstones only inside the transactional purge.

create table if not exists weddingwin_private.pending_deleted_chat_identities (
  member_hash text not null,
  identity_hash text not null,
  normalization text not null default 'exact',
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  primary key (member_hash, identity_hash, normalization),
  constraint pending_deleted_chat_member_hash_check
    check (member_hash ~ '^[0-9a-f]{64}$'),
  constraint pending_deleted_chat_identity_hash_check
    check (identity_hash ~ '^[0-9a-f]{64}$'),
  constraint pending_deleted_chat_identity_normalization_check
    check (normalization in ('exact', 'lower'))
);

create index if not exists pending_deleted_chat_identities_expires_at_idx
  on weddingwin_private.pending_deleted_chat_identities (expires_at);

alter table weddingwin_private.pending_deleted_chat_identities enable row level security;
revoke all on weddingwin_private.pending_deleted_chat_identities from public, anon, authenticated;

create or replace function weddingwin_private.purge_expired_pending_chat_identity_snapshots()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
begin
  delete from weddingwin_private.pending_deleted_chat_identities
   where expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function weddingwin_private.purge_expired_pending_chat_identity_snapshots()
  from public, anon, authenticated;

-- This RPC is service-role-only. It accepts the already server-resolved
-- profile values as a defense against a concurrent profile cascade, while also
-- reading the database copy before destructive work. Only hashes are stored.
create or replace function public.stage_weddingwin_member_chat_redaction(
  p_bd_user_id text,
  p_bd_token text default '',
  p_bd_cookie text default '',
  p_profile_email text default '',
  p_apple_sub text default '',
  p_profile_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text := btrim(coalesce(p_bd_user_id, ''));
  v_token text := btrim(coalesce(p_bd_token, ''));
  v_cookie text := btrim(coalesce(p_bd_cookie, ''));
  v_input_profile_email text := lower(btrim(coalesce(p_profile_email, '')));
  v_input_apple_sub text := btrim(coalesce(p_apple_sub, ''));
  v_input_profile_id text := btrim(coalesce(p_profile_id, ''));
  v_cache_email text := '';
  v_db_profile_email text := '';
  v_db_apple_sub text := '';
  v_db_profile_id text := '';
  v_member_hash text;
  v_identities text[];
  v_private_identities text[];
  v_thread_tokens text[];
  v_exact_count integer := 0;
  v_lower_count integer := 0;
begin
  if v_user_id = '' then
    raise exception 'A Brilliant Directories member id is required.'
      using errcode = '22023';
  end if;

  perform weddingwin_private.purge_expired_pending_chat_identity_snapshots();

  select lower(btrim(coalesce(cache.email, '')))
    into v_cache_email
    from public.bd_users_cache cache
   where cache.user_id = v_user_id;

  select
    lower(btrim(coalesce(profiles.email, ''))),
    btrim(coalesce(profiles.apple_sub, '')),
    profiles.id::text
    into v_db_profile_email, v_db_apple_sub, v_db_profile_id
    from public.profiles profiles
   where btrim(coalesce(profiles.bd_member_id, '')) = v_user_id;

  select array_agg(identity_value)
    into v_identities
    from (
      select distinct identity_value
        from unnest(array[
          v_user_id,
          v_token,
          v_cookie,
          v_cache_email,
          v_input_profile_email,
          v_input_apple_sub,
          v_input_profile_id,
          v_db_profile_email,
          v_db_apple_sub,
          v_db_profile_id
        ]) identity_value
       where nullif(btrim(identity_value), '') is not null
    ) identities;

  select coalesce(array_agg(distinct token), array[]::text[])
    into v_thread_tokens
    from (
      select thread_token as token
        from public.app_native_chat_threads
       where member_a_bd_user_id = v_user_id
          or member_b_bd_user_id = v_user_id
          or vendor_bd_user_id = v_user_id
      union
      select bd_thread_token as token
        from public.app_native_chat_threads
       where (member_a_bd_user_id = v_user_id
           or member_b_bd_user_id = v_user_id
           or vendor_bd_user_id = v_user_id)
         and nullif(btrim(bd_thread_token), '') is not null
      union
      select thread_token as token
        from public.bd_chat_threads
       where owner_user_id = v_user_id
          or responder_user_id = v_user_id
          or regexp_split_to_array(coalesce(thread_owner, ''), '\s*,\s*') && v_identities
          or regexp_split_to_array(coalesce(thread_responders, ''), '\s*,\s*') && v_identities
    ) tokens
   where nullif(btrim(token), '') is not null;

  select coalesce(array_agg(distinct identity_value), array[]::text[])
    into v_private_identities
    from (
      select identity_value
        from unnest(v_identities) identity_value
      union all
      select owner_identity.identity_value
        from public.bd_chat_threads threads
        cross join lateral unnest(
          regexp_split_to_array(coalesce(threads.thread_owner, ''), '\s*,\s*')
        ) owner_identity(identity_value)
       where threads.thread_token = any(v_thread_tokens)
         and (
           threads.owner_user_id = v_user_id
           or owner_identity.identity_value = any(v_identities)
         )
      union all
      select responder_identity.identity_value
        from public.bd_chat_threads threads
        cross join lateral unnest(
          regexp_split_to_array(coalesce(threads.thread_responders, ''), '\s*,\s*')
        ) responder_identity(identity_value)
       where threads.thread_token = any(v_thread_tokens)
         and (
           threads.responder_user_id = v_user_id
           or responder_identity.identity_value = any(v_identities)
         )
    ) deleted_identities
   where nullif(btrim(identity_value), '') is not null
     and btrim(identity_value) <> '(deleted member)';

  v_member_hash := weddingwin_private.chat_identity_hash(v_user_id);

  insert into weddingwin_private.pending_deleted_chat_identities (
    member_hash,
    identity_hash,
    normalization,
    captured_at,
    expires_at
  )
  select
    v_member_hash,
    weddingwin_private.chat_identity_hash(identity_value),
    'exact',
    now(),
    now() + interval '30 days'
    from unnest(v_private_identities) identity_value
  on conflict (member_hash, identity_hash, normalization) do update
    set captured_at = excluded.captured_at,
        expires_at = excluded.expires_at;
  get diagnostics v_exact_count = row_count;

  insert into weddingwin_private.pending_deleted_chat_identities (
    member_hash,
    identity_hash,
    normalization,
    captured_at,
    expires_at
  )
  select
    v_member_hash,
    weddingwin_private.chat_identity_hash(lower(identity_value)),
    'lower',
    now(),
    now() + interval '30 days'
    from unnest(array[
      v_cache_email,
      v_input_profile_email,
      v_db_profile_email
    ]) identity_value
   where nullif(btrim(identity_value), '') is not null
  on conflict (member_hash, identity_hash, normalization) do update
    set captured_at = excluded.captured_at,
        expires_at = excluded.expires_at;
  get diagnostics v_lower_count = row_count;

  return jsonb_build_object(
    'identities_staged', v_exact_count + v_lower_count,
    'expires_in_days', 30
  );
end;
$$;

revoke all on function public.stage_weddingwin_member_chat_redaction(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.stage_weddingwin_member_chat_redaction(text, text, text, text, text, text)
  to service_role;

-- Keep the already-tested implementation as an internal core. The replacement
-- wrapper activates staged hashes and calls it in the same transaction.
alter function public.purge_weddingwin_member_data_with_chat_redaction(text, text, text)
  rename to purge_weddingwin_member_data_chat_redaction_v1;

revoke all on function public.purge_weddingwin_member_data_chat_redaction_v1(text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.purge_weddingwin_member_data_with_chat_redaction(
  p_bd_user_id text,
  p_bd_token text default '',
  p_bd_cookie text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text := btrim(coalesce(p_bd_user_id, ''));
  v_member_hash text;
  v_promoted_count integer := 0;
  v_result jsonb;
begin
  if v_user_id = '' then
    raise exception 'A Brilliant Directories member id is required.'
      using errcode = '22023';
  end if;

  v_member_hash := weddingwin_private.chat_identity_hash(v_user_id);

  insert into weddingwin_private.deleted_chat_identities (
    identity_hash,
    normalization
  )
  select
    staged.identity_hash,
    staged.normalization
    from weddingwin_private.pending_deleted_chat_identities staged
   where staged.member_hash = v_member_hash
     and staged.expires_at > now()
  on conflict (identity_hash, normalization) do nothing;
  get diagnostics v_promoted_count = row_count;

  v_result := coalesce(
    public.purge_weddingwin_member_data_chat_redaction_v1(
      v_user_id,
      btrim(coalesce(p_bd_token, '')),
      btrim(coalesce(p_bd_cookie, ''))
    ),
    '{}'::jsonb
  );

  delete from weddingwin_private.pending_deleted_chat_identities
   where member_hash = v_member_hash;

  return v_result || jsonb_build_object(
    'staged_chat_identities_promoted', v_promoted_count
  );
end;
$$;

revoke all on function public.purge_weddingwin_member_data_with_chat_redaction(text, text, text)
  from public, anon, authenticated;
grant execute on function public.purge_weddingwin_member_data_with_chat_redaction(text, text, text)
  to service_role;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'purge-expired-weddingwin-chat-identity-snapshots';

select cron.schedule(
  'purge-expired-weddingwin-chat-identity-snapshots',
  '17 3 * * *',
  'select weddingwin_private.purge_expired_pending_chat_identity_snapshots()'
);
