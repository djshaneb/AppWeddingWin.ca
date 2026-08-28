-- Reporting a conversation must block the member pair, not only the current
-- thread token. Brilliant Directories can otherwise create a new token for
-- the same two people and bypass the report.
create table if not exists public.app_chat_member_blocks (
  id uuid primary key default gen_random_uuid(),
  member_a_bd_user_id text not null,
  member_b_bd_user_id text not null,
  blocked_by_bd_user_id text not null,
  blocked_member_bd_user_id text not null,
  source_thread_token text,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  notice text not null default 'Member blocked: This conversation is closed and future messages from this member will not appear while WeddingWin reviews your report.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text,
  constraint app_chat_member_blocks_members_distinct
    check (member_a_bd_user_id <> member_b_bd_user_id),
  constraint app_chat_member_blocks_members_canonical
    check (member_a_bd_user_id < member_b_bd_user_id),
  constraint app_chat_member_blocks_reporter_in_pair
    check (blocked_by_bd_user_id in (member_a_bd_user_id, member_b_bd_user_id)),
  constraint app_chat_member_blocks_blocked_in_pair
    check (blocked_member_bd_user_id in (member_a_bd_user_id, member_b_bd_user_id)),
  constraint app_chat_member_blocks_directions_distinct
    check (blocked_by_bd_user_id <> blocked_member_bd_user_id),
  constraint app_chat_member_blocks_pair_unique
    unique (member_a_bd_user_id, member_b_bd_user_id)
);

create index if not exists app_chat_member_blocks_member_a_idx
  on public.app_chat_member_blocks (member_a_bd_user_id)
  where status = 'active';

create index if not exists app_chat_member_blocks_member_b_idx
  on public.app_chat_member_blocks (member_b_bd_user_id)
  where status = 'active';

alter table public.app_chat_member_blocks enable row level security;

-- Existing reports that already captured both member ids become pair blocks.
-- A report may have several token-alias rows for one pair, so select only the
-- earliest unresolved row per canonical pair before the unique upsert.
with unresolved_pair_reports as (
  select distinct on (
    least(member_a_bd_user_id, member_b_bd_user_id),
    greatest(member_a_bd_user_id, member_b_bd_user_id)
  )
    thread_token,
    reporter_bd_user_id,
    member_a_bd_user_id,
    member_b_bd_user_id,
    reported_at
  from public.app_chat_thread_reports
  where status <> 'resolved'
    and nullif(btrim(member_a_bd_user_id), '') is not null
    and nullif(btrim(member_b_bd_user_id), '') is not null
    and member_a_bd_user_id <> member_b_bd_user_id
    and reporter_bd_user_id in (member_a_bd_user_id, member_b_bd_user_id)
  order by
    least(member_a_bd_user_id, member_b_bd_user_id),
    greatest(member_a_bd_user_id, member_b_bd_user_id),
    reported_at asc,
    thread_token asc
)
insert into public.app_chat_member_blocks (
  member_a_bd_user_id,
  member_b_bd_user_id,
  blocked_by_bd_user_id,
  blocked_member_bd_user_id,
  source_thread_token,
  status,
  created_at,
  updated_at
)
select
  least(member_a_bd_user_id, member_b_bd_user_id),
  greatest(member_a_bd_user_id, member_b_bd_user_id),
  reporter_bd_user_id,
  case
    when reporter_bd_user_id = member_a_bd_user_id then member_b_bd_user_id
    else member_a_bd_user_id
  end,
  thread_token,
  'active',
  reported_at,
  now()
from unresolved_pair_reports
on conflict (member_a_bd_user_id, member_b_bd_user_id) do update
set
  status = 'active',
  blocked_by_bd_user_id = excluded.blocked_by_bd_user_id,
  blocked_member_bd_user_id = excluded.blocked_member_bd_user_id,
  source_thread_token = excluded.source_thread_token,
  notice = excluded.notice,
  updated_at = now(),
  revoked_at = null,
  revoked_by = null;

-- Keep any service-role report writer safe: a report carrying both member ids
-- automatically establishes the pair block even if it did not call the new
-- edge-function helper explicitly.
create or replace function public.upsert_member_block_from_chat_report()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  other_member text;
begin
  if new.status = 'resolved'
    or nullif(btrim(new.member_a_bd_user_id), '') is null
    or nullif(btrim(new.member_b_bd_user_id), '') is null
    or new.member_a_bd_user_id = new.member_b_bd_user_id
    or new.reporter_bd_user_id not in (new.member_a_bd_user_id, new.member_b_bd_user_id)
  then
    return new;
  end if;

  other_member := case
    when new.reporter_bd_user_id = new.member_a_bd_user_id then new.member_b_bd_user_id
    else new.member_a_bd_user_id
  end;

  insert into public.app_chat_member_blocks (
    member_a_bd_user_id,
    member_b_bd_user_id,
    blocked_by_bd_user_id,
    blocked_member_bd_user_id,
    source_thread_token,
    status,
    created_at,
    updated_at,
    revoked_at,
    revoked_by
  ) values (
    least(new.member_a_bd_user_id, new.member_b_bd_user_id),
    greatest(new.member_a_bd_user_id, new.member_b_bd_user_id),
    new.reporter_bd_user_id,
    other_member,
    new.thread_token,
    'active',
    coalesce(new.reported_at, now()),
    now(),
    null,
    null
  )
  on conflict (member_a_bd_user_id, member_b_bd_user_id) do update
  set
    blocked_by_bd_user_id = excluded.blocked_by_bd_user_id,
    blocked_member_bd_user_id = excluded.blocked_member_bd_user_id,
    source_thread_token = excluded.source_thread_token,
    status = 'active',
    created_at = case
      when app_chat_member_blocks.status = 'revoked' then excluded.created_at
      else app_chat_member_blocks.created_at
    end,
    updated_at = now(),
    revoked_at = null,
    revoked_by = null;

  return new;
end;
$$;

-- Moderation staff can resolve every alias for a member pair and revoke the
-- corresponding pair block atomically. Only service-role code may call this;
-- clients cannot unblock themselves or another member.
create or replace function public.resolve_chat_member_block_pair(
  p_member_one text,
  p_member_two text,
  p_resolved_by text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  member_one text := btrim(coalesce(p_member_one, ''));
  member_two text := btrim(coalesce(p_member_two, ''));
  actor text := btrim(coalesce(p_resolved_by, ''));
  member_a text;
  member_b text;
  resolved_reports integer := 0;
  revoked_blocks integer := 0;
  cancelled_closes integer := 0;
  report_tokens text[] := array[]::text[];
  resolved_timestamp timestamptz := now();
begin
  if member_one = '' or member_two = '' or member_one = member_two then
    raise exception 'Two distinct chat members are required.';
  end if;
  if actor = '' then
    raise exception 'A moderation actor is required.';
  end if;

  member_a := least(member_one, member_two);
  member_b := greatest(member_one, member_two);

  select coalesce(array_agg(distinct aliases.token), array[]::text[])
  into report_tokens
  from public.app_chat_thread_reports reports
  cross join lateral unnest(array[
    reports.thread_token,
    reports.app_thread_token,
    reports.bd_thread_token
  ]) as aliases(token)
  where reports.status <> 'resolved'
    and nullif(btrim(aliases.token), '') is not null
    and least(btrim(reports.member_a_bd_user_id), btrim(reports.member_b_bd_user_id)) = member_a
    and greatest(btrim(reports.member_a_bd_user_id), btrim(reports.member_b_bd_user_id)) = member_b;

  update public.app_chat_thread_reports reports
  set
    status = 'resolved',
    resolved_at = resolved_timestamp,
    resolved_by = actor
  where reports.status <> 'resolved'
    and least(btrim(reports.member_a_bd_user_id), btrim(reports.member_b_bd_user_id)) = member_a
    and greatest(btrim(reports.member_a_bd_user_id), btrim(reports.member_b_bd_user_id)) = member_b;
  get diagnostics resolved_reports = row_count;

  -- A pending close must not run after moderators have unblocked the pair.
  -- Mark it terminal while preserving the outbox row as an audit record.
  update public.bd_chat_outbox outbox
  set
    sent_at = resolved_timestamp,
    last_error = 'Cancelled because moderation resolved and unblocked this member pair.'
  where outbox.kind = 'close'
    and outbox.sent_at is null
    and outbox.thread_token = any(report_tokens);
  get diagnostics cancelled_closes = row_count;

  update public.app_chat_member_blocks blocks
  set
    status = 'revoked',
    updated_at = resolved_timestamp,
    revoked_at = resolved_timestamp,
    revoked_by = actor
  where blocks.member_a_bd_user_id = member_a
    and blocks.member_b_bd_user_id = member_b
    and blocks.status <> 'revoked';
  get diagnostics revoked_blocks = row_count;

  return jsonb_build_object(
    'member_a_bd_user_id', member_a,
    'member_b_bd_user_id', member_b,
    'resolved_reports', resolved_reports,
    'revoked_blocks', revoked_blocks,
    'cancelled_closes', cancelled_closes,
    'resolved_at', resolved_timestamp
  );
end;
$$;

revoke all on function public.resolve_chat_member_block_pair(text, text, text) from public;
revoke all on function public.resolve_chat_member_block_pair(text, text, text) from anon;
revoke all on function public.resolve_chat_member_block_pair(text, text, text) from authenticated;
grant execute on function public.resolve_chat_member_block_pair(text, text, text) to service_role;

drop trigger if exists upsert_member_block_from_chat_report
  on public.app_chat_thread_reports;
create trigger upsert_member_block_from_chat_report
after insert or update of status, member_a_bd_user_id, member_b_bd_user_id
on public.app_chat_thread_reports
for each row execute function public.upsert_member_block_from_chat_report();

-- A blocked pair cannot create a fresh app-native token.
create or replace function public.block_app_native_chat_thread_pair()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.app_chat_member_blocks blocks
    where blocks.status = 'active'
      and blocks.member_a_bd_user_id = least(new.member_a_bd_user_id, new.member_b_bd_user_id)
      and blocks.member_b_bd_user_id = greatest(new.member_a_bd_user_id, new.member_b_bd_user_id)
  ) then
    raise exception 'Member blocked: A new conversation cannot be opened with this member.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_app_native_chat_thread_pair
  on public.app_native_chat_threads;
create trigger block_app_native_chat_thread_pair
before insert or update of member_a_bd_user_id, member_b_bd_user_id
on public.app_native_chat_threads
for each row execute function public.block_app_native_chat_thread_pair();

-- Preserve the thread-token report check and add the canonical pair check at
-- the database boundary. This protects all service-role writers, not only UI.
create or replace function public.chat_text_is_objectionable(message_text text)
returns boolean
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select regexp_replace(
      lower(translate(coalesce(message_text, ''), '013457@$!', 'oieastasi')),
      '[^a-z]+',
      ' ',
      'g'
    ) as value
  )
  select value ~ '(^| )(kill|murder|shoot|stab|rape|hurt) +(you|u)( |$)'
    or value ~ '(^| )(send|show|share) +(me +)?(a +)?(nude|nudes|naked|porn|dick +pic)( |$)'
    or value ~ '(^| )(child|minor|underage) +(porn|sex|sexual|nude|nudes|naked)( |$)'
    or value ~ '(^| )(blowjob|handjob|cumshot|nigger|faggot|kike|chink)( |$)'
    or value ~ '(^| )(worthless|disgusting) +(bitch|whore|slut)( |$)'
  from normalized;
$$;

create or replace function public.block_reported_app_native_chat_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.chat_text_is_objectionable(new.message_content) then
    raise exception 'Message rejected by WeddingWin safety filter. Edit it and try again.';
  end if;

  if exists (
    select 1
    from public.app_chat_thread_reports reports
    where reports.status <> 'resolved'
      and (
        reports.thread_token = new.thread_token
        or reports.app_thread_token = new.thread_token
      )
  ) then
    raise exception 'Chat Reported: This conversation will remain closed while it''s being reviewed.';
  end if;

  if exists (
    select 1
    from public.app_native_chat_threads threads
    join public.app_chat_member_blocks blocks
      on blocks.status = 'active'
      and blocks.member_a_bd_user_id = least(threads.member_a_bd_user_id, threads.member_b_bd_user_id)
      and blocks.member_b_bd_user_id = greatest(threads.member_a_bd_user_id, threads.member_b_bd_user_id)
    where threads.thread_token = new.thread_token
  ) then
    raise exception 'Member blocked: This conversation is closed and new messages are not allowed.';
  end if;

  return new;
end;
$$;
