create table if not exists public.bd_chat_threads (
  thread_token text primary key,
  thread_id text,
  thread_owner text,
  thread_responders text,
  request_uri text,
  thread_status text,
  bd_created_at text,
  bd_updated_at text,
  owner_user_id text,
  responder_user_id text,
  identity_resolved_at timestamptz,
  backfilled_at timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.bd_chat_messages (
  message_id text primary key,
  message_token text,
  thread_token text not null,
  message_owner text,
  message_content text,
  message_status text not null default '0',
  bd_created_at text,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists bd_chat_messages_thread_idx on public.bd_chat_messages (thread_token);
create index if not exists bd_chat_messages_status_idx on public.bd_chat_messages (message_status);

create table if not exists public.bd_chat_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  thread_token text,
  app_thread_token text,
  sender_bd_user_id text,
  owner_identity text,
  message_token text,
  content text,
  image_data_uri text,
  payload jsonb,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists bd_chat_outbox_pending_idx on public.bd_chat_outbox (created_at) where sent_at is null;

create table if not exists public.bd_users_cache (
  user_id text primary key,
  token text,
  cookie text,
  email text,
  company text,
  first_name text,
  last_name text,
  avatar_url text,
  filename text,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists bd_users_cache_token_idx on public.bd_users_cache (token);
create index if not exists bd_users_cache_cookie_idx on public.bd_users_cache (cookie);
create index if not exists bd_users_cache_email_idx on public.bd_users_cache (email);
create index if not exists bd_users_cache_filename_idx on public.bd_users_cache (filename);

alter table public.bd_chat_threads enable row level security;
alter table public.bd_chat_messages enable row level security;
alter table public.bd_chat_outbox enable row level security;
alter table public.bd_users_cache enable row level security;
