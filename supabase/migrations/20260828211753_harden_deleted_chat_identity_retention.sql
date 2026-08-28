-- Filename version reconciled with the linked Supabase migration history.
-- Preserve shared message bodies for the surviving participant without
-- retaining the deleted member's reusable BD login identity. This is a
-- follow-up to preserve_shared_data_on_account_deletion, which is already live.

create schema if not exists weddingwin_private;
revoke all on schema weddingwin_private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;

-- Hash-only tombstones make redaction durable across later BD mirror upserts.
-- Raw tokens, cookies, emails, provider subjects and member ids are never
-- written to this retention table.
create table if not exists weddingwin_private.deleted_chat_identities (
  identity_hash text not null,
  normalization text not null default 'exact',
  created_at timestamptz not null default now(),
  primary key (identity_hash, normalization),
  constraint deleted_chat_identity_hash_check
    check (identity_hash ~ '^[0-9a-f]{64}$'),
  constraint deleted_chat_identity_normalization_check
    check (normalization in ('exact', 'lower'))
);

alter table weddingwin_private.deleted_chat_identities enable row level security;
revoke all on weddingwin_private.deleted_chat_identities from public, anon, authenticated;

create or replace function weddingwin_private.chat_identity_hash(p_identity text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select encode(
    extensions.digest(convert_to(btrim(p_identity), 'UTF8'), 'sha256'),
    'hex'
  )
$$;

create or replace function weddingwin_private.is_deleted_chat_identity(p_identity text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select nullif(btrim(p_identity), '') is not null
    and exists (
      select 1
        from weddingwin_private.deleted_chat_identities identities
       where (
         identities.normalization = 'exact'
         and identities.identity_hash = weddingwin_private.chat_identity_hash(p_identity)
       ) or (
         identities.normalization = 'lower'
         and identities.identity_hash = weddingwin_private.chat_identity_hash(lower(p_identity))
       )
    )
$$;

create or replace function weddingwin_private.redact_chat_identity(p_identity text)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when weddingwin_private.is_deleted_chat_identity(p_identity)
      then '(deleted member)'
    else p_identity
  end
$$;

create or replace function weddingwin_private.redact_chat_identity_list(p_identities text)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when p_identities is null then null
    else coalesce((
      select string_agg(
        weddingwin_private.redact_chat_identity(identity_value),
        ', ' order by ordinal
      )
        from unnest(regexp_split_to_array(p_identities, '\s*,\s*'))
          with ordinality as parts(identity_value, ordinal)
    ), '')
  end
$$;

-- Mirror raw JSON is not an authentication store. Remove credential-shaped
-- and IP-address keys at every nesting level. Redact only tombstoned values in
-- identity-shaped fields; message text, image references and timestamps remain.
create or replace function weddingwin_private.redact_chat_raw(p_value jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(
        jsonb_object_agg(
          entry.key,
          case
            when lower(entry.key) = 'thread_responders'
              and jsonb_typeof(entry.value) = 'string'
              then to_jsonb(weddingwin_private.redact_chat_identity_list(entry.value #>> '{}'))
            when lower(entry.key) in (
              'thread_owner',
              'message_owner',
              'email',
              'email_address',
              'user_email',
              'user_id',
              'bd_user_id',
              'member_id',
              'owner_user_id',
              'responder_user_id',
              'apple_sub',
              'provider_sub',
              'auth_user_id',
              'supabase_user_id'
            ) and jsonb_typeof(entry.value) = 'string'
              then to_jsonb(weddingwin_private.redact_chat_identity(entry.value #>> '{}'))
            else weddingwin_private.redact_chat_raw(entry.value)
          end
        ),
        '{}'::jsonb
      )
        into v_result
        from jsonb_each(p_value) entry
       where lower(entry.key) not in (
         'token',
         'cookie',
         'password',
         'pass',
         'secret',
         'authorization',
         'authorization_code',
         'access_token',
         'refresh_token',
         'session_token',
         'session_cookie',
         'auth_token',
         'login_token',
         'id_token',
         'code_verifier',
         'origin_ip',
         'ip_address',
         'user_ip',
         'last_ip'
       );
      return v_result;
    when 'array' then
      select coalesce(
        jsonb_agg(weddingwin_private.redact_chat_raw(item.value) order by item.ordinal),
        '[]'::jsonb
      )
        into v_result
        from jsonb_array_elements(p_value) with ordinality as item(value, ordinal);
      return v_result;
    else
      return p_value;
  end case;
end;
$$;

create or replace function weddingwin_private.redact_chat_thread_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.thread_owner := weddingwin_private.redact_chat_identity_list(new.thread_owner);
  new.thread_responders := weddingwin_private.redact_chat_identity_list(new.thread_responders);
  new.raw := weddingwin_private.redact_chat_raw(new.raw);
  return new;
end;
$$;

create or replace function weddingwin_private.redact_chat_message_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.message_owner := weddingwin_private.redact_chat_identity(new.message_owner);
  new.raw := weddingwin_private.redact_chat_raw(new.raw);
  return new;
end;
$$;

create or replace function weddingwin_private.redact_app_chat_message_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.sender_bd_user_id := weddingwin_private.redact_chat_identity(new.sender_bd_user_id);
  return new;
end;
$$;

revoke all on function weddingwin_private.chat_identity_hash(text) from public, anon, authenticated;
revoke all on function weddingwin_private.is_deleted_chat_identity(text) from public, anon, authenticated;
revoke all on function weddingwin_private.redact_chat_identity(text) from public, anon, authenticated;
revoke all on function weddingwin_private.redact_chat_identity_list(text) from public, anon, authenticated;
revoke all on function weddingwin_private.redact_chat_raw(jsonb) from public, anon, authenticated;
revoke all on function weddingwin_private.redact_chat_thread_row() from public, anon, authenticated;
revoke all on function weddingwin_private.redact_chat_message_row() from public, anon, authenticated;
revoke all on function weddingwin_private.redact_app_chat_message_row() from public, anon, authenticated;

drop trigger if exists weddingwin_redact_deleted_chat_thread on public.bd_chat_threads;
create trigger weddingwin_redact_deleted_chat_thread
before insert or update on public.bd_chat_threads
for each row execute function weddingwin_private.redact_chat_thread_row();

drop trigger if exists weddingwin_redact_deleted_chat_message on public.bd_chat_messages;
create trigger weddingwin_redact_deleted_chat_message
before insert or update on public.bd_chat_messages
for each row execute function weddingwin_private.redact_chat_message_row();

drop trigger if exists weddingwin_redact_deleted_app_chat_message on public.app_native_chat_messages;
create trigger weddingwin_redact_deleted_app_chat_message
before insert or update on public.app_native_chat_messages
for each row execute function weddingwin_private.redact_app_chat_message_row();

-- Run the already-live shared-history purge and the identity scrub in one
-- database transaction. Gathering aliases first lets the original purge close
-- and block every affected thread before any participant value is anonymized.
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
  v_token text := btrim(coalesce(p_bd_token, ''));
  v_cookie text := btrim(coalesce(p_bd_cookie, ''));
  v_cache_email text := '';
  v_profile_email text := '';
  v_apple_sub text := '';
  v_profile_id text := '';
  v_identities text[];
  v_private_identities text[];
  v_thread_tokens text[];
  v_existing_blocks jsonb := '[]'::jsonb;
  v_count integer;
  v_result jsonb;
begin
  if v_user_id = '' then
    raise exception 'A Brilliant Directories member id is required.'
      using errcode = '22023';
  end if;

  select lower(btrim(coalesce(cache.email, '')))
    into v_cache_email
    from public.bd_users_cache cache
   where cache.user_id = v_user_id;

  select
    lower(btrim(coalesce(profiles.email, ''))),
    btrim(coalesce(profiles.apple_sub, '')),
    profiles.id::text
    into v_profile_email, v_apple_sub, v_profile_id
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
          v_profile_email,
          v_apple_sub,
          v_profile_id
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

  -- A prior safety report is stronger evidence than the operational closure
  -- created by account deletion. Snapshot it so the older purge implementation
  -- cannot reverse who reported/blocked whom when it upserts the same pair.
  select coalesce(jsonb_agg(to_jsonb(blocks)), '[]'::jsonb)
    into v_existing_blocks
    from public.app_chat_member_blocks blocks
   where v_user_id in (blocks.member_a_bd_user_id, blocks.member_b_bd_user_id);

  insert into weddingwin_private.deleted_chat_identities (
    identity_hash,
    normalization
  )
  select
    weddingwin_private.chat_identity_hash(identity_value),
    'exact'
    from unnest(v_private_identities) identity_value
  on conflict (identity_hash, normalization) do nothing;

  insert into weddingwin_private.deleted_chat_identities (
    identity_hash,
    normalization
  )
  select
    weddingwin_private.chat_identity_hash(lower(identity_value)),
    'lower'
    from unnest(array[v_cache_email, v_profile_email]) identity_value
   where nullif(btrim(identity_value), '') is not null
  on conflict (identity_hash, normalization) do nothing;

  v_result := coalesce(public.purge_weddingwin_member_data(
    v_user_id,
    v_token,
    v_cookie
  ), '{}'::jsonb);

  with previous_blocks as (
    select *
      from jsonb_populate_recordset(
        null::public.app_chat_member_blocks,
        v_existing_blocks
      )
  )
  update public.app_chat_member_blocks current_block
     set blocked_by_bd_user_id = previous_block.blocked_by_bd_user_id,
         blocked_member_bd_user_id = previous_block.blocked_member_bd_user_id,
         source_thread_token = previous_block.source_thread_token,
         status = previous_block.status,
         notice = previous_block.notice,
         created_at = previous_block.created_at,
         updated_at = previous_block.updated_at,
         revoked_at = previous_block.revoked_at,
         revoked_by = previous_block.revoked_by
    from previous_blocks previous_block
   where current_block.member_a_bd_user_id = previous_block.member_a_bd_user_id
     and current_block.member_b_bd_user_id = previous_block.member_b_bd_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('existing_moderation_blocks_preserved', v_count);

  update public.bd_chat_threads
     set thread_owner = weddingwin_private.redact_chat_identity_list(thread_owner),
         thread_responders = weddingwin_private.redact_chat_identity_list(thread_responders),
         raw = weddingwin_private.redact_chat_raw(raw)
   where thread_token = any(v_thread_tokens);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('website_chat_threads_identity_scrubbed', v_count);

  update public.bd_chat_messages
     set message_owner = weddingwin_private.redact_chat_identity(message_owner),
         raw = weddingwin_private.redact_chat_raw(raw)
   where thread_token = any(v_thread_tokens);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('website_chat_messages_identity_scrubbed', v_count);

  update public.app_native_chat_messages
     set sender_bd_user_id = '(deleted member)'
   where thread_token = any(v_thread_tokens)
     and sender_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('app_chat_message_authors_anonymized', v_count);

  return v_result;
end;
$$;

revoke all on function public.purge_weddingwin_member_data_with_chat_redaction(text, text, text) from public;
revoke all on function public.purge_weddingwin_member_data_with_chat_redaction(text, text, text) from anon;
revoke all on function public.purge_weddingwin_member_data_with_chat_redaction(text, text, text) from authenticated;
grant execute on function public.purge_weddingwin_member_data_with_chat_redaction(text, text, text) to service_role;

-- Force callers through the wrapper above. It is SECURITY DEFINER and can
-- still invoke the predecessor internally, while service-role clients cannot
-- bypass identity redaction or moderation-direction restoration.
revoke all on function public.purge_weddingwin_member_data(text, text, text) from service_role;
