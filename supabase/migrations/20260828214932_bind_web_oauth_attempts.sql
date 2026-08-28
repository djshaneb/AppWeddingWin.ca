-- Filename version reconciled with the linked Supabase migration history.
create table if not exists public.oauth_login_attempts (
  state_hash text primary key,
  provider text not null,
  binding_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint oauth_login_attempts_provider_check
    check (provider in ('apple', 'google')),
  constraint oauth_login_attempts_state_hash_check
    check (state_hash ~ '^[A-Za-z0-9_-]{43}$'),
  constraint oauth_login_attempts_binding_hash_check
    check (binding_hash ~ '^[A-Za-z0-9_-]{43}$'),
  constraint oauth_login_attempts_expiry_check
    check (expires_at > created_at)
);

alter table public.oauth_login_attempts enable row level security;

revoke all on table public.oauth_login_attempts from public, anon, authenticated;
grant select, insert, delete on table public.oauth_login_attempts to service_role;

create index if not exists oauth_login_attempts_expires_at_idx
  on public.oauth_login_attempts (expires_at);

create or replace function public.redeem_oauth_login_attempt(
  p_state_hash text,
  p_provider text,
  p_binding_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_redeemed boolean;
begin
  if p_state_hash is null
     or p_state_hash !~ '^[A-Za-z0-9_-]{43}$'
     or p_binding_hash is null
     or p_binding_hash !~ '^[A-Za-z0-9_-]{43}$'
     or p_provider not in ('apple', 'google') then
    return false;
  end if;

  delete from public.oauth_login_attempts
   where state_hash = p_state_hash
     and provider = p_provider
     and binding_hash = p_binding_hash
     and expires_at > now()
  returning true into v_redeemed;

  return coalesce(v_redeemed, false);
end;
$$;

revoke all on function public.redeem_oauth_login_attempt(text, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_oauth_login_attempt(text, text, text)
  to service_role;

create or replace function public.cleanup_expired_oauth_login_attempts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.oauth_login_attempts where expires_at <= now();
  return null;
end;
$$;

revoke all on function public.cleanup_expired_oauth_login_attempts()
  from public, anon, authenticated;

drop trigger if exists cleanup_expired_oauth_login_attempts_after_insert
  on public.oauth_login_attempts;
create trigger cleanup_expired_oauth_login_attempts_after_insert
after insert on public.oauth_login_attempts
for each statement execute function public.cleanup_expired_oauth_login_attempts();
