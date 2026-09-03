-- Keep unread badges exact without selecting message bodies or inline photo
-- bytes. Counts are grouped by thread and sender identity so Edge Functions
-- can apply the existing participant-side ownership rules.

create or replace function public.chat_unread_owner_counts(p_thread_tokens text[])
returns table (
  thread_token text,
  message_owner text,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.thread_token,
    coalesce(m.message_owner, '') as message_owner,
    count(*)::bigint as unread_count
  from public.bd_chat_messages m
  where m.thread_token = any(coalesce(p_thread_tokens, array[]::text[]))
    and m.message_status = '0'
  group by m.thread_token, coalesce(m.message_owner, '');
$$;

create or replace function public.app_chat_unread_counts(
  p_thread_tokens text[],
  p_user_id text
)
returns table (
  thread_token text,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.thread_token,
    count(*)::bigint as unread_count
  from public.app_native_chat_messages m
  where m.thread_token = any(coalesce(p_thread_tokens, array[]::text[]))
    and m.sender_bd_user_id <> coalesce(p_user_id, '')
    and m.read_at is null
  group by m.thread_token;
$$;

revoke all on function public.chat_unread_owner_counts(text[]) from public, anon, authenticated;
revoke all on function public.app_chat_unread_counts(text[], text) from public, anon, authenticated;
grant execute on function public.chat_unread_owner_counts(text[]) to service_role;
grant execute on function public.app_chat_unread_counts(text[], text) to service_role;

comment on function public.chat_unread_owner_counts(text[]) is
  'Service-role-only content-free unread counts grouped by mirrored thread and owner identity.';
comment on function public.app_chat_unread_counts(text[], text) is
  'Service-role-only exact unread counts for app-native private-chat threads.';
