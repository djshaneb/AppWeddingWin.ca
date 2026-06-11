create table if not exists public.app_chat_thread_reports (
  id uuid primary key default gen_random_uuid(),
  thread_token text not null unique,
  app_thread_token text,
  bd_thread_token text,
  reporter_bd_user_id text not null,
  member_a_bd_user_id text,
  member_b_bd_user_id text,
  status text not null default 'reported'
    check (status in ('reported', 'reviewing', 'resolved')),
  notice text not null default 'Chat Reported: This conversation will remain closed while it''s being reviewed.',
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists app_chat_thread_reports_app_thread_token_idx
  on public.app_chat_thread_reports (app_thread_token)
  where app_thread_token is not null;

create index if not exists app_chat_thread_reports_bd_thread_token_idx
  on public.app_chat_thread_reports (bd_thread_token)
  where bd_thread_token is not null;

alter table public.app_chat_thread_reports enable row level security;
