-- Filename version reconciled with the linked Supabase migration history.
alter table public.app_push_tokens
  add column if not exists push_retry_count integer not null default 0,
  add column if not exists push_next_attempt_at timestamptz,
  add column if not exists expo_receipt_expires_at timestamptz;

update public.app_push_tokens
set push_retry_count = 0
where push_retry_count is null;

alter table public.app_push_tokens
  alter column push_retry_count set default 0,
  alter column push_retry_count set not null;

alter table public.app_push_tokens
  drop constraint if exists app_push_tokens_retry_count_bounds;
alter table public.app_push_tokens
  add constraint app_push_tokens_retry_count_bounds
  check (push_retry_count between 0 and 16);

comment on column public.app_push_tokens.push_retry_count is
  'Consecutive retryable Expo send or receipt attempts for the current delivery state.';
comment on column public.app_push_tokens.push_next_attempt_at is
  'Earliest time a push sweep may reclaim this registration.';
comment on column public.app_push_tokens.expo_receipt_expires_at is
  'Finite deadline after which an accepted Expo ticket is retired without resending it.';

-- Existing accepted tickets predate durable scheduling. Make them immediately
-- eligible if their initial 15-minute receipt delay has elapsed, while keeping
-- a fixed 24-hour deadline measured from the original acceptance time.
update public.app_push_tokens
set
  expo_receipt_expires_at = coalesce(
    expo_receipt_expires_at,
    last_expo_ticket_at + interval '24 hours'
  ),
  push_next_attempt_at = coalesce(
    push_next_attempt_at,
    greatest(last_expo_ticket_at + interval '15 minutes', clock_timestamp())
  )
where last_expo_ticket_id is not null
  and last_expo_ticket_at is not null;

create index if not exists app_push_tokens_retry_due_idx
  on public.app_push_tokens (
    push_next_attempt_at asc nulls first,
    last_push_checked_at asc nulls first,
    updated_at asc,
    id
  )
  where enabled = true;

-- Keep registration invalidation complete now that delivery retries and
-- receipt deadlines are durable. A token change, reassignment, or opt-out
-- must never inherit another registration's pending delivery state.
create or replace function public.invalidate_weddingwin_push_claim_on_registration_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.enabled is distinct from new.enabled
    or old.bd_member_id is distinct from new.bd_member_id
    or old.expo_push_token is distinct from new.expo_push_token
  then
    new.push_registration_generation = old.push_registration_generation + 1;
    new.push_claim_token = null;
    new.push_claim_expires_at = null;
    new.last_push_checked_at = null;
    new.last_unread_count = 0;
    new.last_expo_ticket_id = null;
    new.last_expo_ticket_at = null;
    new.expo_receipt_expires_at = null;
    new.push_retry_count = 0;
    new.push_next_attempt_at = null;
  end if;
  return new;
end;
$$;

-- The lease still provides overlap protection, but a released row is not
-- eligible again until its persisted retry/receipt time is due.
create or replace function public.claim_weddingwin_push_tokens(
  p_claim_token uuid,
  p_limit integer default 100,
  p_lease_seconds integer default 600
)
returns setof public.app_push_tokens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  bounded_lease_seconds integer := least(
    greatest(coalesce(p_lease_seconds, 600), 60),
    1800
  );
begin
  if p_claim_token is null then
    raise exception 'A push claim token is required.';
  end if;

  return query
  with candidates as (
    select tokens.id
    from public.app_push_tokens tokens
    where tokens.enabled = true
      and (
        tokens.push_next_attempt_at is null
        or tokens.push_next_attempt_at <= clock_timestamp()
      )
      and (
        tokens.push_claim_token is null
        or tokens.push_claim_expires_at is null
        or tokens.push_claim_expires_at <= clock_timestamp()
      )
    order by
      tokens.last_push_checked_at asc nulls first,
      tokens.updated_at asc,
      tokens.id asc
    for update skip locked
    limit bounded_limit
  )
  update public.app_push_tokens tokens
  set
    push_claim_token = p_claim_token,
    push_claim_expires_at = clock_timestamp()
      + make_interval(secs => bounded_lease_seconds)
  from candidates
  where tokens.id = candidates.id
  returning tokens.*;
end;
$$;

revoke all on function public.invalidate_weddingwin_push_claim_on_registration_change()
  from public;
revoke all on function public.invalidate_weddingwin_push_claim_on_registration_change()
  from anon;
revoke all on function public.invalidate_weddingwin_push_claim_on_registration_change()
  from authenticated;

revoke all on function public.claim_weddingwin_push_tokens(uuid, integer, integer)
  from public;
revoke all on function public.claim_weddingwin_push_tokens(uuid, integer, integer)
  from anon;
revoke all on function public.claim_weddingwin_push_tokens(uuid, integer, integer)
  from authenticated;
grant execute on function public.claim_weddingwin_push_tokens(uuid, integer, integer)
  to service_role;
