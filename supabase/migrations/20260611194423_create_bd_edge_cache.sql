create table if not exists public.bd_edge_cache (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);

create index if not exists bd_edge_cache_expires_idx on public.bd_edge_cache (expires_at);

alter table public.bd_edge_cache enable row level security;
-- Service-role only; no policies for anon/authenticated.
