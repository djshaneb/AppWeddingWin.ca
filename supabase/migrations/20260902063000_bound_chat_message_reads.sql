-- Return a fair, bounded recent slice for every requested private-chat thread.
-- Inline photo data must never let one busy conversation starve all other
-- inbox rows or turn an app refresh into an unbounded database response.

create or replace function public.chat_recent_messages(
  p_thread_tokens text[],
  p_per_thread integer default 3
)
returns table (
  message_id text,
  message_token text,
  thread_token text,
  message_owner text,
  message_content text,
  message_status text,
  bd_created_at text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      m.message_id,
      m.message_token,
      m.thread_token,
      m.message_owner,
      m.message_content,
      m.message_status,
      m.bd_created_at,
      row_number() over (
        partition by m.thread_token
        order by m.bd_created_at desc nulls last, m.message_id desc
      ) as position
    from public.bd_chat_messages m
    where m.thread_token = any(coalesce(p_thread_tokens, array[]::text[]))
  )
  select
    r.message_id,
    r.message_token,
    r.thread_token,
    r.message_owner,
    r.message_content,
    r.message_status,
    r.bd_created_at
  from ranked r
  where r.position <= least(greatest(coalesce(p_per_thread, 3), 1), 12)
  order by r.thread_token, r.bd_created_at asc nulls first, r.message_id asc;
$$;

revoke all on function public.chat_recent_messages(text[], integer) from public, anon, authenticated;
grant execute on function public.chat_recent_messages(text[], integer) to service_role;

comment on function public.chat_recent_messages(text[], integer) is
  'Service-role-only fair and bounded private-chat message read for native inbox payloads.';
