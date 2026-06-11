alter table public.app_native_chat_threads
  add column if not exists bd_thread_token text,
  add column if not exists bd_thread_id text,
  add column if not exists bd_synced_at timestamptz,
  add column if not exists bd_sync_error text;

create unique index if not exists app_native_chat_threads_bd_thread_token_key
  on public.app_native_chat_threads (bd_thread_token)
  where bd_thread_token is not null;

alter table public.app_native_chat_messages
  add column if not exists bd_message_id text,
  add column if not exists bd_synced_at timestamptz,
  add column if not exists bd_sync_error text;
