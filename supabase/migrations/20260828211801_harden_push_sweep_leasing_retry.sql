-- Filename version reconciled with the linked Supabase migration history.
alter table public.app_push_tokens
  add column if not exists last_push_checked_at timestamptz,
  add column if not exists push_claim_token uuid,
  add column if not exists push_claim_expires_at timestamptz,
  add column if not exists push_registration_generation bigint not null default 0;

-- Registration, reassignment, and opt-out invalidate any stale worker view.
-- In particular, a sweep must never re-enable or finalize a device after the
-- user unregisters it while the sweep is doing remote work.
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
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_weddingwin_push_claim_on_registration_change
  on public.app_push_tokens;
create trigger invalidate_weddingwin_push_claim_on_registration_change
before update of enabled, bd_member_id, expo_push_token
on public.app_push_tokens
for each row execute function public.invalidate_weddingwin_push_claim_on_registration_change();

revoke all on function public.invalidate_weddingwin_push_claim_on_registration_change() from public;
revoke all on function public.invalidate_weddingwin_push_claim_on_registration_change() from anon;
revoke all on function public.invalidate_weddingwin_push_claim_on_registration_change() from authenticated;

-- Sweep devices in least-recently-checked order. This avoids permanently
-- starving devices once there are more than the worker's bounded batch size.
create index if not exists app_push_tokens_sweep_fairness_idx
  on public.app_push_tokens (last_push_checked_at asc nulls first, updated_at asc, id)
  where enabled = true;

create index if not exists app_push_tokens_claim_expiry_idx
  on public.app_push_tokens (push_claim_expires_at)
  where enabled = true and push_claim_token is not null;

-- Atomically reserve a bounded, fair batch. FOR UPDATE SKIP LOCKED prevents
-- two overlapping cron isolates from claiming the same device. The lease is
-- intentionally longer than a normal Edge run, but expires so a crashed run
-- cannot strand devices forever.
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

create or replace function public.release_weddingwin_push_claim(
  p_claim_token uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  released_count integer := 0;
begin
  if p_claim_token is null then
    return 0;
  end if;

  update public.app_push_tokens
  set
    last_push_checked_at = clock_timestamp(),
    push_claim_token = null,
    push_claim_expires_at = null
  where push_claim_token = p_claim_token;
  get diagnostics released_count = row_count;

  return released_count;
end;
$$;

-- Release the healthy part of a batch even when a small set of devices has an
-- ambiguous post-Expo outcome. Retained rows recover through lease expiry;
-- unrelated devices continue rotating through the fair sweep order.
create or replace function public.release_weddingwin_push_claim_except(
  p_claim_token uuid,
  p_retain_ids uuid[] default array[]::uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  released_count integer := 0;
begin
  if p_claim_token is null then
    return 0;
  end if;

  update public.app_push_tokens
  set
    last_push_checked_at = clock_timestamp(),
    push_claim_token = null,
    push_claim_expires_at = null
  where push_claim_token = p_claim_token
    and not (
      id = any(coalesce(p_retain_ids, array[]::uuid[]))
    );
  get diagnostics released_count = row_count;

  return released_count;
end;
$$;

create or replace function public.renew_weddingwin_push_claim(
  p_claim_token uuid,
  p_lease_seconds integer default 600
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  renewed_count integer := 0;
  bounded_lease_seconds integer := least(
    greatest(coalesce(p_lease_seconds, 600), 60),
    1800
  );
begin
  if p_claim_token is null then
    return 0;
  end if;

  update public.app_push_tokens
  set push_claim_expires_at = clock_timestamp()
    + make_interval(secs => bounded_lease_seconds)
  where push_claim_token = p_claim_token
    and enabled = true
    and push_claim_expires_at > clock_timestamp();
  get diagnostics renewed_count = row_count;

  return renewed_count;
end;
$$;

-- App-originated messages are durable before the BD mirror accepts them.
-- Once bd_synced_at is set, the ordinary BD unread count owns the message;
-- until then, this count closes the notification gap without double-counting
-- healthy mirror deliveries. Reported/blocked conversations remain silent.
create or replace function public.count_weddingwin_unsynced_native_unread(
  p_bd_member_id text
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(count(*), 0)::integer
  from public.app_native_chat_messages messages
  join public.app_native_chat_threads threads
    on threads.thread_token = messages.thread_token
  where nullif(btrim(p_bd_member_id), '') is not null
    and p_bd_member_id in (
      threads.member_a_bd_user_id,
      threads.member_b_bd_user_id
    )
    and messages.sender_bd_user_id <> p_bd_member_id
    and messages.read_at is null
    and messages.bd_synced_at is null
    and not exists (
      select 1
      from public.app_chat_member_blocks blocks
      where blocks.status = 'active'
        and blocks.member_a_bd_user_id = least(
          threads.member_a_bd_user_id,
          threads.member_b_bd_user_id
        )
        and blocks.member_b_bd_user_id = greatest(
          threads.member_a_bd_user_id,
          threads.member_b_bd_user_id
        )
    )
    and not exists (
      select 1
      from public.app_chat_thread_reports reports
      where reports.status <> 'resolved'
        and (
          reports.thread_token = threads.thread_token
          or reports.app_thread_token = threads.thread_token
          or (
            threads.bd_thread_token is not null
            and (
              reports.thread_token = threads.bd_thread_token
              or reports.bd_thread_token = threads.bd_thread_token
            )
          )
        )
    );
$$;

create index if not exists app_native_chat_messages_unsynced_unread_idx
  on public.app_native_chat_messages (thread_token, sender_bd_user_id)
  where read_at is null and bd_synced_at is null;

revoke all on function public.claim_weddingwin_push_tokens(uuid, integer, integer) from public;
revoke all on function public.claim_weddingwin_push_tokens(uuid, integer, integer) from anon;
revoke all on function public.claim_weddingwin_push_tokens(uuid, integer, integer) from authenticated;
grant execute on function public.claim_weddingwin_push_tokens(uuid, integer, integer) to service_role;

revoke all on function public.release_weddingwin_push_claim(uuid) from public;
revoke all on function public.release_weddingwin_push_claim(uuid) from anon;
revoke all on function public.release_weddingwin_push_claim(uuid) from authenticated;
grant execute on function public.release_weddingwin_push_claim(uuid) to service_role;

revoke all on function public.release_weddingwin_push_claim_except(uuid, uuid[]) from public;
revoke all on function public.release_weddingwin_push_claim_except(uuid, uuid[]) from anon;
revoke all on function public.release_weddingwin_push_claim_except(uuid, uuid[]) from authenticated;
grant execute on function public.release_weddingwin_push_claim_except(uuid, uuid[]) to service_role;

revoke all on function public.renew_weddingwin_push_claim(uuid, integer) from public;
revoke all on function public.renew_weddingwin_push_claim(uuid, integer) from anon;
revoke all on function public.renew_weddingwin_push_claim(uuid, integer) from authenticated;
grant execute on function public.renew_weddingwin_push_claim(uuid, integer) to service_role;

revoke all on function public.count_weddingwin_unsynced_native_unread(text) from public;
revoke all on function public.count_weddingwin_unsynced_native_unread(text) from anon;
revoke all on function public.count_weddingwin_unsynced_native_unread(text) from authenticated;
grant execute on function public.count_weddingwin_unsynced_native_unread(text) to service_role;
