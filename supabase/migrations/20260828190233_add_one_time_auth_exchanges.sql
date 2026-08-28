-- Filename version reconciled with the linked Supabase migration history.
create table if not exists public.app_login_exchanges (
  code_hash text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_native_auth_exchanges (
  code_hash text primary key,
  provider text not null,
  code_challenge text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.app_login_exchanges enable row level security;
alter table public.app_native_auth_exchanges enable row level security;

revoke all on public.app_login_exchanges from anon, authenticated;
revoke all on public.app_native_auth_exchanges from anon, authenticated;

create or replace function public.redeem_app_login_exchange(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  redeemed jsonb;
begin
  delete from public.app_login_exchanges
  where code_hash = p_code_hash
    and expires_at > now()
  returning payload into redeemed;
  return redeemed;
end;
$$;

create or replace function public.redeem_native_auth_exchange(
  p_code_hash text,
  p_code_challenge text,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  redeemed jsonb;
begin
  delete from public.app_native_auth_exchanges
  where code_hash = p_code_hash
    and code_challenge = p_code_challenge
    and provider = p_provider
    and expires_at > now()
  returning payload into redeemed;
  return redeemed;
end;
$$;

revoke all on function public.redeem_app_login_exchange(text) from public, anon, authenticated;
revoke all on function public.redeem_native_auth_exchange(text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_app_login_exchange(text) to service_role;
grant execute on function public.redeem_native_auth_exchange(text, text, text) to service_role;

create index if not exists app_login_exchanges_expires_at_idx
  on public.app_login_exchanges (expires_at);
create index if not exists app_native_auth_exchanges_expires_at_idx
  on public.app_native_auth_exchanges (expires_at);
