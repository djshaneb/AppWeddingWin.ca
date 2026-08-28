-- Disposable live verification for the account-deletion privacy migration.
-- Run only after both deleted-chat migrations through
-- 20260828213136_stage_deleted_profile_identity_before_auth_purge.sql.
-- Every fixture write is transaction-scoped and rolled back; this does not
-- invoke the external BD deletion API or delete a real member.

begin;

insert into public.bd_users_cache (
  user_id,
  token,
  cookie,
  email,
  raw
) values (
  'codex-deletion-fixture-member',
  'codex-deletion-fixture-login-token',
  'codex-deletion-fixture-cookie',
  'codex-deletion-fixture@example.invalid',
  jsonb_build_object(
    'user_id', 'codex-deletion-fixture-member',
    'token', 'codex-deletion-fixture-login-token',
    'cookie', 'codex-deletion-fixture-cookie'
  )
);

insert into public.app_native_chat_threads (
  thread_token,
  member_a_bd_user_id,
  member_b_bd_user_id,
  vendor_bd_user_id,
  bd_thread_token,
  bd_thread_id
) values (
  'app:codex-deletion-privacy-fixture',
  'codex-deletion-fixture-member',
  'codex-deletion-fixture-survivor',
  'codex-deletion-fixture-survivor',
  'codex-bd-deletion-privacy-fixture',
  'codex-bd-deletion-privacy-fixture-id'
);

insert into public.bd_chat_threads (
  thread_token,
  thread_id,
  thread_owner,
  thread_responders,
  thread_status,
  owner_user_id,
  responder_user_id,
  raw
) values (
  'codex-bd-deletion-privacy-fixture',
  'codex-bd-deletion-privacy-fixture-id',
  'codex-deletion-fixture-login-token',
  'codex-deletion-fixture-survivor-token',
  '1',
  'codex-deletion-fixture-member',
  'codex-deletion-fixture-survivor',
  jsonb_build_object(
    'thread_id', 'codex-bd-deletion-privacy-fixture-id',
    'thread_token', 'codex-bd-deletion-privacy-fixture',
    'thread_owner', 'codex-deletion-fixture-login-token',
    'thread_responders', 'codex-deletion-fixture-survivor-token',
    'token', 'must-not-survive',
    'origin_ip', '192.0.2.1'
  )
);

insert into public.bd_chat_messages (
  message_id,
  message_token,
  thread_token,
  message_owner,
  message_content,
  message_status,
  raw
) values (
  'codex-deletion-privacy-fixture-message',
  'codex-deletion-privacy-fixture-message-token',
  'codex-bd-deletion-privacy-fixture',
  'codex-deletion-fixture-login-token',
  'Shared fixture message remains readable.',
  '1',
  jsonb_build_object(
    'message_id', 'codex-deletion-privacy-fixture-message',
    'message_owner', 'codex-deletion-fixture-login-token',
    'message_content', 'Shared fixture message remains readable.',
    'access_token', 'must-not-survive'
  )
);

insert into public.app_native_chat_messages (
  thread_token,
  sender_bd_user_id,
  message_content
) values (
  'app:codex-deletion-privacy-fixture',
  'codex-deletion-fixture-member',
  'Shared app fixture message remains readable.'
);

-- Seed a genuine pre-existing moderation direction. Account closure must not
-- rewrite this into the opposite direction merely because one member leaves.
insert into public.app_chat_member_blocks (
  member_a_bd_user_id,
  member_b_bd_user_id,
  blocked_by_bd_user_id,
  blocked_member_bd_user_id,
  source_thread_token,
  status,
  notice
) values (
  'codex-deletion-fixture-member',
  'codex-deletion-fixture-survivor',
  'codex-deletion-fixture-member',
  'codex-deletion-fixture-survivor',
  'app:codex-deletion-privacy-fixture',
  'active',
  'Existing moderation direction must remain unchanged.'
);

select public.stage_weddingwin_member_chat_redaction(
  'codex-deletion-fixture-member',
  'codex-deletion-fixture-login-token',
  'codex-deletion-fixture-cookie',
  'codex-deletion-fixture-provider@example.invalid',
  'codex-deletion-fixture-apple-sub',
  'codex-deletion-fixture-profile-id'
);

do $staging_verification$
begin
  if not exists (
    select 1
      from weddingwin_private.pending_deleted_chat_identities staged
     where staged.member_hash = weddingwin_private.chat_identity_hash(
       'codex-deletion-fixture-member'
     )
       and staged.identity_hash = weddingwin_private.chat_identity_hash(
         'codex-deletion-fixture-apple-sub'
       )
  ) then
    raise exception 'Provider identity was not staged before profile deletion.';
  end if;

  if exists (
    select 1
      from weddingwin_private.deleted_chat_identities active_identity
     where active_identity.identity_hash = weddingwin_private.chat_identity_hash(
       'codex-deletion-fixture-apple-sub'
     )
  ) then
    raise exception 'Staged identity became active before the final purge.';
  end if;

  if (select thread_owner
        from public.bd_chat_threads
       where thread_token = 'codex-bd-deletion-privacy-fixture')
       <> 'codex-deletion-fixture-login-token' then
    raise exception 'Inactive staging redacted an account before deletion completed.';
  end if;
end;
$staging_verification$;

select public.purge_weddingwin_member_data_with_chat_redaction(
  'codex-deletion-fixture-member',
  'codex-deletion-fixture-login-token',
  'codex-deletion-fixture-cookie'
);

-- Simulate a later BD mirror refresh attempting to restore the old token.
update public.bd_chat_threads
   set thread_owner = 'codex-deletion-fixture-login-token',
       raw = jsonb_build_object(
         'thread_owner', 'codex-deletion-fixture-login-token',
         'email', 'codex-deletion-fixture-provider@example.invalid',
         'apple_sub', 'codex-deletion-fixture-apple-sub',
         'supabase_user_id', 'codex-deletion-fixture-profile-id',
         'token', 'must-not-survive',
         'origin_ip', '192.0.2.1'
       )
 where thread_token = 'codex-bd-deletion-privacy-fixture';

update public.bd_chat_messages
   set message_owner = 'codex-deletion-fixture-login-token',
       raw = jsonb_build_object(
         'message_owner', 'codex-deletion-fixture-login-token',
         'message_content', 'Shared fixture message remains readable.',
         'refresh_token', 'must-not-survive'
       )
 where message_id = 'codex-deletion-privacy-fixture-message';

do $verification$
declare
  v_thread public.bd_chat_threads%rowtype;
  v_message public.bd_chat_messages%rowtype;
  v_app_message public.app_native_chat_messages%rowtype;
begin
  select * into strict v_thread
    from public.bd_chat_threads
   where thread_token = 'codex-bd-deletion-privacy-fixture';

  if v_thread.thread_owner <> '(deleted member)'
     or v_thread.thread_responders <> 'codex-deletion-fixture-survivor-token'
     or v_thread.thread_status <> '0'
     or v_thread.raw ? 'token'
     or v_thread.raw ? 'origin_ip'
     or v_thread.raw ->> 'thread_owner' <> '(deleted member)'
     or v_thread.raw ->> 'email' <> '(deleted member)'
     or v_thread.raw ->> 'apple_sub' <> '(deleted member)'
     or v_thread.raw ->> 'supabase_user_id' <> '(deleted member)' then
    raise exception 'Deleted thread identity was not durably redacted.';
  end if;

  select * into strict v_message
    from public.bd_chat_messages
   where message_id = 'codex-deletion-privacy-fixture-message';

  if v_message.message_owner <> '(deleted member)'
     or v_message.message_content <> 'Shared fixture message remains readable.'
     or v_message.raw ? 'refresh_token'
     or v_message.raw ->> 'message_owner' <> '(deleted member)'
     or v_message.raw ->> 'message_content' <> 'Shared fixture message remains readable.' then
    raise exception 'Deleted message identity scrub damaged shared content.';
  end if;

  select * into strict v_app_message
    from public.app_native_chat_messages
   where thread_token = 'app:codex-deletion-privacy-fixture';

  if v_app_message.sender_bd_user_id <> '(deleted member)'
     or v_app_message.message_content <> 'Shared app fixture message remains readable.' then
    raise exception 'Native shared message was not safely anonymized.';
  end if;

  if not exists (
    select 1
      from public.app_chat_thread_reports
     where thread_token in (
       'app:codex-deletion-privacy-fixture',
       'codex-bd-deletion-privacy-fixture'
     )
       and status = 'account_deleted'
  ) then
    raise exception 'Account-deletion closure was not retained.';
  end if;

  if not exists (
    select 1
      from public.app_chat_member_blocks
     where member_a_bd_user_id = 'codex-deletion-fixture-member'
       and member_b_bd_user_id = 'codex-deletion-fixture-survivor'
       and blocked_by_bd_user_id = 'codex-deletion-fixture-member'
       and blocked_member_bd_user_id = 'codex-deletion-fixture-survivor'
       and status = 'active'
       and notice = 'Existing moderation direction must remain unchanged.'
  ) then
    raise exception 'Existing moderation block direction was not retained.';
  end if;

  if exists (
    select 1
      from public.bd_users_cache
     where user_id = 'codex-deletion-fixture-member'
  ) then
    raise exception 'Deleted member identity cache was not purged.';
  end if;

  if exists (
    select 1
      from weddingwin_private.pending_deleted_chat_identities staged
     where staged.member_hash = weddingwin_private.chat_identity_hash(
       'codex-deletion-fixture-member'
     )
  ) then
    raise exception 'Promoted provider identity snapshot was not removed.';
  end if;
end;
$verification$;

rollback;
