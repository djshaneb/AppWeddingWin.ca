create table if not exists public.app_native_chat_threads (
  id uuid primary key default gen_random_uuid(),
  thread_token text not null unique,
  member_a_bd_user_id text not null,
  member_b_bd_user_id text not null,
  vendor_bd_user_id text,
  profile_path text,
  request_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_native_chat_threads_members_distinct check (member_a_bd_user_id <> member_b_bd_user_id),
  constraint app_native_chat_threads_pair_unique unique (member_a_bd_user_id, member_b_bd_user_id)
);

create index if not exists app_native_chat_threads_member_a_idx
  on public.app_native_chat_threads (member_a_bd_user_id);

create index if not exists app_native_chat_threads_member_b_idx
  on public.app_native_chat_threads (member_b_bd_user_id);

create index if not exists app_native_chat_threads_updated_at_idx
  on public.app_native_chat_threads (updated_at desc);

alter table public.app_native_chat_threads enable row level security;

create table if not exists public.app_native_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_token text not null references public.app_native_chat_threads(thread_token) on delete cascade,
  sender_bd_user_id text not null,
  message_content text not null default '',
  image_urls jsonb not null default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_native_chat_messages_has_content check (
    btrim(message_content) <> '' or jsonb_array_length(image_urls) > 0
  )
);

create index if not exists app_native_chat_messages_thread_created_idx
  on public.app_native_chat_messages (thread_token, created_at);

create index if not exists app_native_chat_messages_unread_idx
  on public.app_native_chat_messages (thread_token, read_at)
  where read_at is null;

alter table public.app_native_chat_messages enable row level security;

create or replace function public.app_native_chat_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.app_native_chat_threads
  set updated_at = now()
  where thread_token = new.thread_token;
  return new;
end;
$$;

drop trigger if exists app_native_chat_messages_touch_thread on public.app_native_chat_messages;
create trigger app_native_chat_messages_touch_thread
after insert on public.app_native_chat_messages
for each row execute function public.app_native_chat_touch_updated_at();
