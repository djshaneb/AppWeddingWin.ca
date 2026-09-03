-- Select a bounded app-native delivery batch without letting paused photo rows
-- hide later text messages. Returning one look-ahead row lets the Edge worker
-- keep its thread outbox entry pending when more deliverable work remains.

create or replace function public.app_chat_delivery_batch(
  p_thread_token text,
  p_images_enabled boolean,
  p_images_enabled_since timestamptz,
  p_limit integer default 11
)
returns setof public.app_native_chat_messages
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.*
  from public.app_native_chat_messages m
  where m.thread_token = coalesce(p_thread_token, '')
    and m.bd_synced_at is null
  order by
    case
      when jsonb_array_length(m.image_urls) = 0 then 0
      when p_images_enabled_since is not null
        and m.created_at < p_images_enabled_since
        and btrim(m.message_content) <> '' then 0
      when coalesce(p_images_enabled, false)
        and p_images_enabled_since is not null
        and m.created_at >= p_images_enabled_since then 0
      else 1
    end,
    m.created_at asc,
    m.id asc
  limit least(greatest(coalesce(p_limit, 11), 1), 25);
$$;

revoke all on function public.app_chat_delivery_batch(text, boolean, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.app_chat_delivery_batch(text, boolean, timestamptz, integer)
  to service_role;

comment on function public.app_chat_delivery_batch(text, boolean, timestamptz, integer) is
  'Service-role-only bounded app-chat delivery batch that prioritizes deliverable text over paused photo rows.';
