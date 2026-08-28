-- Keep App Review vendor credentials usable without publishing their BD listing.
-- Access is service-managed, narrowly scoped to chat, and automatically expires.

create table if not exists public.app_private_reviewers (
  bd_member_id text primary key check (bd_member_id ~ '^[1-9][0-9]*$'),
  reviewer_role text not null check (reviewer_role in ('couple', 'vendor')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_private_reviewers is
  'Expiring service-only access for nonpublic App Store reviewer accounts.';

alter table public.app_private_reviewers enable row level security;

revoke all on table public.app_private_reviewers from public, anon, authenticated;
grant select, insert, update, delete on table public.app_private_reviewers to service_role;

create index if not exists app_private_reviewers_expires_at_idx
  on public.app_private_reviewers (expires_at);
