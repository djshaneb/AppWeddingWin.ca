-- Filename version reconciled with the linked Supabase migration history.
alter table public.app_push_tokens
  add column if not exists last_expo_ticket_id text,
  add column if not exists last_expo_ticket_at timestamptz,
  add column if not exists last_push_error text;

create index if not exists app_push_tokens_pending_ticket_idx
  on public.app_push_tokens (last_expo_ticket_at)
  where last_expo_ticket_id is not null and enabled = true;
