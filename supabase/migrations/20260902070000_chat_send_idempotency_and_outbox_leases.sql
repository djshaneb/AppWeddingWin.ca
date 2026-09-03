begin;

alter table public.app_native_chat_messages
  add column if not exists client_message_id text;

alter table public.app_native_chat_threads
  add column if not exists bd_create_token text;

update public.app_native_chat_threads
set bd_create_token = replace(gen_random_uuid()::text, '-', '')
where nullif(btrim(coalesce(bd_create_token, '')), '') is null;

alter table public.app_native_chat_threads
  alter column bd_create_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column bd_create_token set not null;

create unique index if not exists app_native_chat_threads_bd_create_token_key
  on public.app_native_chat_threads (bd_create_token);

create index if not exists app_native_chat_threads_bd_thread_token_lookup_idx
  on public.app_native_chat_threads (bd_thread_token)
  where bd_thread_token is not null;

alter table public.bd_users_cache
  add column if not exists identity_synced_at timestamptz;

create unique index if not exists app_native_chat_messages_client_message_key
  on public.app_native_chat_messages (
    thread_token,
    sender_bd_user_id,
    client_message_id
  )
  where client_message_id is not null;

alter table public.bd_chat_outbox
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz;

-- A previous worker could have queued the same logical website send more than
-- once before message ids became durable. Keep the oldest row and supersede
-- duplicate jobs before adding the unique key.
with ranked_send as (
  select
    id,
    row_number() over (
      partition by thread_token, sender_bd_user_id, message_token
      order by
        case when sent_at is not null then 0 else 1 end,
        created_at,
        id
    ) as row_number
  from public.bd_chat_outbox
  where kind = 'send'
    and message_token is not null
)
update public.bd_chat_outbox outbox
set sent_at = clock_timestamp(),
    message_token = null,
    last_error = 'Superseded by the existing idempotent send operation.',
    claim_token = null,
    claimed_at = null,
    claim_expires_at = null
from ranked_send duplicate
where duplicate.id = outbox.id
  and duplicate.row_number > 1;

create unique index if not exists bd_chat_outbox_send_client_message_key
  on public.bd_chat_outbox (thread_token, sender_bd_user_id, message_token)
  where kind = 'send' and message_token is not null;

create index if not exists bd_chat_outbox_claimable_idx
  on public.bd_chat_outbox (created_at)
  where sent_at is null and attempts < 10;

-- Store the app message and its website-delivery job in one transaction.
-- Per-message jobs remove the race where an empty thread batch could finish
-- immediately before a new app message was committed.
create or replace function public.enqueue_app_native_chat_message_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.bd_synced_at is null then
    insert into public.bd_chat_outbox (
      kind,
      thread_token,
      app_thread_token,
      sender_bd_user_id,
      message_token,
      content,
      image_data_uri,
      payload
    ) values (
      'send',
      new.thread_token,
      new.thread_token,
      new.sender_bd_user_id,
      new.id::text,
      new.message_content,
      case
        when jsonb_array_length(coalesce(new.image_urls, '[]'::jsonb)) > 0
          then new.image_urls ->> 0
        else null
      end,
      jsonb_build_object('app_message_id', new.id::text)
    )
    on conflict (thread_token, sender_bd_user_id, message_token)
      where kind = 'send' and message_token is not null
    do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_app_native_chat_message_delivery
  on public.app_native_chat_messages;
create trigger enqueue_app_native_chat_message_delivery
after insert on public.app_native_chat_messages
for each row execute function public.enqueue_app_native_chat_message_delivery();

revoke all on function public.enqueue_app_native_chat_message_delivery() from public;
revoke all on function public.enqueue_app_native_chat_message_delivery() from anon;
revoke all on function public.enqueue_app_native_chat_message_delivery() from authenticated;

-- Replace legacy thread-batch jobs with one durable job for every unsynced
-- message. Existing messages stay intact and are simply re-queued.
update public.bd_chat_outbox
set sent_at = clock_timestamp(),
    last_error = 'Superseded by atomic per-message app delivery.',
    claim_token = null,
    claimed_at = null,
    claim_expires_at = null
where kind = 'mirror_app_thread'
  and sent_at is null;

insert into public.bd_chat_outbox (
  kind,
  thread_token,
  app_thread_token,
  sender_bd_user_id,
  message_token,
  content,
  image_data_uri,
  payload
)
select
  'send',
  messages.thread_token,
  messages.thread_token,
  messages.sender_bd_user_id,
  messages.id::text,
  messages.message_content,
  case
    when jsonb_array_length(coalesce(messages.image_urls, '[]'::jsonb)) > 0
      then messages.image_urls ->> 0
    else null
  end,
  jsonb_build_object('app_message_id', messages.id::text)
from public.app_native_chat_messages messages
where messages.bd_synced_at is null
on conflict (thread_token, sender_bd_user_id, message_token)
  where kind = 'send' and message_token is not null
do nothing;

-- Keep one durable control row for each pending close/read operation. Existing
-- close duplicates can be safely superseded. Read duplicates must first merge
-- every message id into the oldest row so no receipt is lost.
with ranked_close as (
  select
    id,
    row_number() over (partition by thread_token order by created_at, id) as row_number
  from public.bd_chat_outbox
  where kind = 'close'
    and sent_at is null
    and thread_token is not null
)
update public.bd_chat_outbox outbox
set sent_at = clock_timestamp(),
    last_error = 'Superseded by the existing pending close operation.',
    claim_token = null,
    claimed_at = null,
    claim_expires_at = null
from ranked_close duplicate
where duplicate.id = outbox.id
  and duplicate.row_number > 1;

create unique index if not exists bd_chat_outbox_pending_close_key
  on public.bd_chat_outbox (thread_token)
  where kind = 'close' and sent_at is null and thread_token is not null;

do $$
declare
  duplicate_thread record;
  keeper_id uuid;
  merged_message_ids jsonb;
begin
  for duplicate_thread in
    select thread_token
    from public.bd_chat_outbox
    where kind = 'read'
      and sent_at is null
      and thread_token is not null
    group by thread_token
    having count(*) > 1
  loop
    select id
    into keeper_id
    from public.bd_chat_outbox
    where kind = 'read'
      and sent_at is null
      and thread_token = duplicate_thread.thread_token
    order by created_at, id
    limit 1
    for update;

    select coalesce(jsonb_agg(message_id order by message_id), '[]'::jsonb)
    into merged_message_ids
    from (
      select distinct btrim(value) as message_id
      from public.bd_chat_outbox pending
      cross join lateral jsonb_array_elements_text(
        case
          when jsonb_typeof(pending.payload -> 'message_ids') = 'array'
            then pending.payload -> 'message_ids'
          else '[]'::jsonb
        end
      ) as receipt(value)
      where pending.kind = 'read'
        and pending.sent_at is null
        and pending.thread_token = duplicate_thread.thread_token
        and btrim(value) <> ''
    ) merged;

    update public.bd_chat_outbox
    set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{message_ids}', merged_message_ids, true)
    where id = keeper_id;

    update public.bd_chat_outbox
    set sent_at = clock_timestamp(),
        last_error = 'Merged into the existing pending read operation.',
        claim_token = null,
        claimed_at = null,
        claim_expires_at = null
    where kind = 'read'
      and sent_at is null
      and thread_token = duplicate_thread.thread_token
      and id <> keeper_id;
  end loop;
end;
$$;

create unique index if not exists bd_chat_outbox_pending_read_key
  on public.bd_chat_outbox (thread_token)
  where kind = 'read' and sent_at is null and thread_token is not null;

create unique index if not exists bd_chat_outbox_pending_legacy_mirror_key
  on public.bd_chat_outbox (app_thread_token)
  where kind = 'mirror_app_thread' and sent_at is null and app_thread_token is not null;

create or replace function public.enqueue_bd_chat_close(
  p_thread_token text,
  p_thread_id text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_thread_token text := btrim(coalesce(p_thread_token, ''));
  normalized_thread_id text := btrim(coalesce(p_thread_id, ''));
  outbox_id uuid;
begin
  if normalized_thread_token = '' then
    raise exception 'thread token required';
  end if;
  if length(normalized_thread_token) > 512 then
    raise exception 'thread token is too long';
  end if;
  if length(normalized_thread_id) > 256 then
    raise exception 'thread id is too long';
  end if;

  insert into public.bd_chat_outbox as existing (
    kind,
    thread_token,
    payload
  ) values (
    'close',
    normalized_thread_token,
    jsonb_build_object('thread_id', normalized_thread_id)
  )
  on conflict (thread_token)
    where kind = 'close' and sent_at is null and thread_token is not null
  do update
  set payload = case
        when normalized_thread_id <> '' then
          jsonb_set(
            coalesce(existing.payload, '{}'::jsonb),
            '{thread_id}',
            to_jsonb(normalized_thread_id),
            true
          )
        else coalesce(existing.payload, '{}'::jsonb)
      end,
      attempts = case when existing.attempts >= 10 then 0 else existing.attempts end,
      last_error = case when existing.attempts >= 10 then null else existing.last_error end,
      claim_token = case when existing.attempts >= 10 then null else existing.claim_token end,
      claimed_at = case when existing.attempts >= 10 then null else existing.claimed_at end,
      claim_expires_at = case when existing.attempts >= 10 then null else existing.claim_expires_at end
  returning id into outbox_id;

  return outbox_id;
end;
$$;

create or replace function public.enqueue_bd_chat_read_receipt(
  p_thread_token text,
  p_message_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  outbox_id uuid;
  current_payload jsonb := '{}'::jsonb;
  merged_message_ids jsonb;
begin
  if nullif(btrim(coalesce(p_thread_token, '')), '') is null then
    raise exception 'thread token required';
  end if;
  if length(p_thread_token) > 512 then
    raise exception 'thread token is too long';
  end if;
  if cardinality(coalesce(p_message_ids, array[]::text[])) > 1000 then
    raise exception 'too many message ids';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_message_ids, array[]::text[])) candidate(message_id)
    where length(coalesce(message_id, '')) > 256
  ) then
    raise exception 'message id is too long';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bd-chat-read:' || p_thread_token, 0));

  select id, coalesce(payload, '{}'::jsonb)
  into outbox_id, current_payload
  from public.bd_chat_outbox
  where kind = 'read'
    and thread_token = p_thread_token
    and sent_at is null
  order by created_at, id
  limit 1
  for update;

  select coalesce(jsonb_agg(message_id order by message_id), '[]'::jsonb)
  into merged_message_ids
  from (
    select distinct btrim(value) as message_id
    from (
      select value
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(current_payload -> 'message_ids') = 'array'
            then current_payload -> 'message_ids'
          else '[]'::jsonb
        end
      ) existing(value)
      union all
      select unnest(coalesce(p_message_ids, array[]::text[]))
    ) candidates(value)
    where btrim(coalesce(value, '')) <> ''
  ) normalized;

  if jsonb_array_length(merged_message_ids) = 0 then
    raise exception 'at least one message id is required';
  end if;
  if jsonb_array_length(merged_message_ids) > 1000 then
    raise exception 'too many pending message ids';
  end if;

  if outbox_id is null then
    insert into public.bd_chat_outbox (kind, thread_token, payload)
    values ('read', p_thread_token, jsonb_build_object('message_ids', merged_message_ids))
    returning id into outbox_id;
  else
    update public.bd_chat_outbox
    set payload = jsonb_set(current_payload, '{message_ids}', merged_message_ids, true),
        attempts = case when attempts >= 10 then 0 else attempts end,
        last_error = case when attempts >= 10 then null else last_error end
    where id = outbox_id;
  end if;

  return outbox_id;
end;
$$;

-- Reserve one canonical website identity per BD member before any caller tries
-- to publish it. The transaction-scoped advisory lock makes two cold chat
-- opens converge on the same token/cookie instead of racing different values.
create or replace function public.reserve_bd_chat_identity(
  p_user_id text,
  p_candidate_token text,
  p_candidate_cookie text
)
returns table (
  token text,
  cookie text,
  identity_synced_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_user_id text := btrim(coalesce(p_user_id, ''));
  normalized_token text := btrim(coalesce(p_candidate_token, ''));
  normalized_cookie text := btrim(coalesce(p_candidate_cookie, ''));
  reserved_token text;
  reserved_cookie text;
  reserved_synced_at timestamptz;
begin
  if normalized_user_id = '' or length(normalized_user_id) > 128 then
    raise exception 'invalid BD member id';
  end if;
  if normalized_token !~ '^[A-Za-z0-9]{20,64}$' then
    raise exception 'invalid BD identity token';
  end if;
  if normalized_cookie !~ '^[A-Za-z0-9]{20,64}$' then
    raise exception 'invalid BD identity cookie';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bd-chat-identity:' || normalized_user_id, 0));

  insert into public.bd_users_cache (user_id, token, cookie, identity_synced_at)
  values (normalized_user_id, normalized_token, normalized_cookie, null)
  on conflict (user_id) do nothing;

  select
    case
      when coalesce(cache.token, '') ~ '^[A-Za-z0-9]{20,64}$' then cache.token
      else normalized_token
    end,
    case
      when coalesce(cache.cookie, '') ~ '^[A-Za-z0-9]{20,64}$' then cache.cookie
      else normalized_cookie
    end,
    cache.identity_synced_at
  into reserved_token, reserved_cookie, reserved_synced_at
  from public.bd_users_cache cache
  where cache.user_id = normalized_user_id
  for update;

  update public.bd_users_cache cache
  set token = reserved_token,
      cookie = reserved_cookie,
      identity_synced_at = case
        when cache.token is not distinct from reserved_token
         and cache.cookie is not distinct from reserved_cookie
          then reserved_synced_at
        else null
      end
  where cache.user_id = normalized_user_id
  returning cache.identity_synced_at into reserved_synced_at;

  return query select reserved_token, reserved_cookie, reserved_synced_at;
end;
$$;

create or replace function public.confirm_bd_chat_identity(
  p_user_id text,
  p_token text,
  p_cookie text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.bd_users_cache cache
  set identity_synced_at = clock_timestamp()
  where cache.user_id = btrim(coalesce(p_user_id, ''))
    and cache.token = btrim(coalesce(p_token, ''))
    and cache.cookie = btrim(coalesce(p_cookie, ''));

  return found;
end;
$$;

create or replace function public.claim_bd_chat_outbox(
  p_claim_token uuid,
  p_limit integer default 12,
  p_lease_seconds integer default 300
)
returns setof public.bd_chat_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_claim_token is null then
    raise exception 'claim token required';
  end if;

  return query
  with normalized as (
    select
      outbox.*,
      coalesce(
        linked_thread.thread_token,
        nullif(outbox.app_thread_token, ''),
        nullif(outbox.thread_token, ''),
        outbox.id::text
      ) as delivery_group
    from public.bd_chat_outbox outbox
    left join lateral (
      select app_thread.thread_token
      from public.app_native_chat_threads app_thread
      where app_thread.thread_token = nullif(outbox.app_thread_token, '')
         or app_thread.thread_token = nullif(outbox.thread_token, '')
         or app_thread.bd_thread_token = nullif(outbox.thread_token, '')
         or app_thread.bd_thread_token = nullif(outbox.app_thread_token, '')
         or app_thread.bd_create_token = nullif(outbox.thread_token, '')
         or app_thread.bd_create_token = nullif(outbox.app_thread_token, '')
      order by app_thread.created_at, app_thread.id
      limit 1
    ) linked_thread on true
    where outbox.sent_at is null
      and outbox.attempts < 10
  ), eligible_heads as (
    select distinct on (candidate.delivery_group)
      candidate.id,
      case when candidate.kind = 'read' then 0 else 1 end as priority,
      candidate.created_at,
      candidate.delivery_group
    from normalized candidate
    where (
        candidate.claim_expires_at is null
        or candidate.claim_expires_at <= clock_timestamp()
        or candidate.claim_token = p_claim_token
      )
      and not exists (
        select 1
        from normalized active_claim
        where active_claim.claim_expires_at > clock_timestamp()
          and active_claim.claim_token is distinct from p_claim_token
          and active_claim.delivery_group = candidate.delivery_group
      )
    order by
      candidate.delivery_group,
      case when candidate.kind = 'read' then 0 else 1 end,
      candidate.created_at,
      candidate.id
  ), candidates as (
    select outbox.id
    from public.bd_chat_outbox outbox
    join eligible_heads on eligible_heads.id = outbox.id
    order by eligible_heads.priority, eligible_heads.created_at, outbox.id
    for update of outbox skip locked
    limit greatest(1, least(coalesce(p_limit, 12), 25))
  ), claimed as (
    update public.bd_chat_outbox outbox
    set claim_token = p_claim_token,
        claimed_at = clock_timestamp(),
        claim_expires_at = clock_timestamp()
          + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 600)))
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.*
  from claimed
  order by
    case when claimed.kind = 'read' then 0 else 1 end,
    claimed.created_at,
    claimed.id;
end;
$$;

create or replace function public.release_bd_chat_outbox_claim(
  p_claim_token uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  released_count integer := 0;
begin
  if p_claim_token is null then
    return 0;
  end if;

  update public.bd_chat_outbox
  set claim_token = null,
      claimed_at = null,
      claim_expires_at = null
  where claim_token = p_claim_token
    and sent_at is null;

  get diagnostics released_count = row_count;
  return released_count;
end;
$$;

create or replace function public.renew_bd_chat_outbox_claim(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_outbox_id is null or p_claim_token is null then
    return false;
  end if;

  update public.bd_chat_outbox
  set claimed_at = clock_timestamp(),
      claim_expires_at = clock_timestamp()
        + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 600)))
  where id = p_outbox_id
    and claim_token = p_claim_token
    and sent_at is null;

  return found;
end;
$$;

-- Move a claimed operation to retry/paused/blocked state and update its exact
-- app message in the same transaction. A worker crash can no longer leave the
-- queue and the user-visible delivery status disagreeing.
create or replace function public.park_bd_chat_outbox(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_attempts integer,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app_message_id text;
  normalized_error text := btrim(coalesce(p_error, ''));
begin
  if p_outbox_id is null or p_claim_token is null then
    return false;
  end if;
  if p_attempts is null or p_attempts < 0 or p_attempts > 10 then
    raise exception 'invalid delivery attempt count';
  end if;
  if normalized_error = '' or length(normalized_error) > 1000 then
    raise exception 'invalid delivery error';
  end if;

  select nullif(btrim(coalesce(outbox.payload ->> 'app_message_id', '')), '')
  into app_message_id
  from public.bd_chat_outbox outbox
  where outbox.id = p_outbox_id
    and outbox.claim_token = p_claim_token
    and outbox.sent_at is null
  for update;

  if not found then
    return false;
  end if;

  if app_message_id is not null then
    update public.app_native_chat_messages message
    set bd_sync_error = normalized_error
    where message.id::text = app_message_id;
    if not found then
      raise exception 'app chat message for outbox row was not found';
    end if;
  end if;

  update public.bd_chat_outbox outbox
  set attempts = p_attempts,
      last_error = normalized_error,
      claim_token = null,
      claimed_at = null,
      claim_expires_at = null
  where outbox.id = p_outbox_id
    and outbox.claim_token = p_claim_token
    and outbox.sent_at is null;

  return found;
end;
$$;

create or replace function public.complete_bd_chat_send(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_bd_message_id text default null,
  p_sync_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app_message_id text;
begin
  if p_outbox_id is null or p_claim_token is null then
    return false;
  end if;

  select nullif(btrim(coalesce(payload ->> 'app_message_id', '')), '')
  into app_message_id
  from public.bd_chat_outbox
  where id = p_outbox_id
    and kind = 'send'
    and claim_token = p_claim_token
    and sent_at is null
  for update;

  if not found then
    return false;
  end if;

  if app_message_id is not null then
    if nullif(btrim(coalesce(p_sync_error, '')), '') is null then
      update public.app_native_chat_messages
      set bd_message_id = nullif(btrim(coalesce(p_bd_message_id, '')), ''),
          bd_synced_at = clock_timestamp(),
          bd_sync_error = null
      where id::text = app_message_id;
      if not found then
        raise exception 'app chat message for completed outbox row was not found';
      end if;
    else
      update public.app_native_chat_messages
      set bd_sync_error = btrim(p_sync_error)
      where id::text = app_message_id;
      if not found then
        raise exception 'app chat message for completed outbox row was not found';
      end if;
    end if;
  end if;

  update public.bd_chat_outbox
  set sent_at = clock_timestamp(),
      last_error = nullif(btrim(coalesce(p_sync_error, '')), ''),
      image_data_uri = null,
      claim_token = null,
      claimed_at = null,
      claim_expires_at = null
  where id = p_outbox_id
    and kind = 'send'
    and claim_token = p_claim_token
    and sent_at is null;

  return found;
end;
$$;

create or replace function public.acknowledge_bd_chat_read_receipts(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_processed_message_ids text[],
  p_delivery_error text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_payload jsonb;
  current_attempts integer;
  remaining_message_ids jsonb;
  remaining_count integer;
  next_attempts integer;
  normalized_error text := nullif(btrim(coalesce(p_delivery_error, '')), '');
begin
  if cardinality(coalesce(p_processed_message_ids, array[]::text[])) > 1000 then
    raise exception 'too many processed message ids';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_processed_message_ids, array[]::text[])) candidate(message_id)
    where length(coalesce(message_id, '')) > 256
  ) then
    raise exception 'processed message id is too long';
  end if;

  select coalesce(payload, '{}'::jsonb), attempts
  into current_payload, current_attempts
  from public.bd_chat_outbox
  where id = p_outbox_id
    and kind = 'read'
    and claim_token = p_claim_token
    and sent_at is null
  for update;

  if not found then
    return -1;
  end if;

  select coalesce(jsonb_agg(message_id order by message_id), '[]'::jsonb)
  into remaining_message_ids
  from (
    select distinct btrim(value) as message_id
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(current_payload -> 'message_ids') = 'array'
          then current_payload -> 'message_ids'
        else '[]'::jsonb
      end
    ) receipt(value)
    where btrim(value) <> ''
      and not (btrim(value) = any(coalesce(p_processed_message_ids, array[]::text[])))
  ) remaining;

  remaining_count := jsonb_array_length(remaining_message_ids);
  if remaining_count = 0 then
    update public.bd_chat_outbox
    set sent_at = clock_timestamp(),
        last_error = null,
        claim_token = null,
        claimed_at = null,
        claim_expires_at = null
    where id = p_outbox_id
      and kind = 'read'
      and claim_token = p_claim_token;
    return 0;
  end if;

  next_attempts := current_attempts + case when normalized_error is null then 0 else 1 end;
  update public.bd_chat_outbox
  set payload = jsonb_set(current_payload, '{message_ids}', remaining_message_ids, true),
      attempts = next_attempts,
      last_error = case
        when normalized_error is null then last_error
        when next_attempts >= 10
          then 'Delivery stopped after ' || next_attempts || ' attempts: ' || normalized_error
        else normalized_error
      end
  where id = p_outbox_id
    and kind = 'read'
    and claim_token = p_claim_token;

  return remaining_count;
end;
$$;

-- The retained account-purge core predates the pending-close unique key and
-- performs a direct INSERT ... WHERE NOT EXISTS. Keep that extensively tested
-- implementation intact, but replace its current top-level wrapper in place so
-- every purge serializes outbox writes before entering the core. Replacing the
-- existing function OID also updates callers with already-prepared plans.
create or replace function public.purge_weddingwin_member_data(
  p_bd_user_id text,
  p_bd_token text default '',
  p_bd_cookie text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_user text := btrim(coalesce(p_bd_user_id, ''));
  participant_count integer := 0;
  email_fixture_scan_count integer := 0;
  email_fixture_settings_count integer := 0;
  email_fixture_count integer := 0;
  email_fixture_event_keys text[] := array[]::text[];
  purge_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if normalized_user = '' then
    raise exception using errcode = '22023', message = 'A Brilliant Directories member id is required.';
  end if;

  -- The retained core inserts pending close rows directly. This self-conflicting
  -- table lock serializes it with Edge inserts and other purges, so the partial
  -- unique key cannot abort the surrounding account-deletion transaction.
  lock table public.bd_chat_outbox in share row exclusive mode;

  select coalesce(array_agg(fixture.event_key), array[]::text[])
    into email_fixture_event_keys
    from public.qr_bingo_email_test_fixtures fixture
   where fixture.couple_bd_user_id = normalized_user
      or fixture.vendor_bd_user_id = normalized_user;

  select count(*)
    into email_fixture_scan_count
    from public.qr_bingo_email_test_fixture_scans scan
    join public.qr_bingo_email_test_fixtures fixture
      on fixture.id = scan.fixture_id
   where fixture.event_key = any(email_fixture_event_keys);

  delete from public.app_review_raffle_fixture_participants participant
   where participant.couple_bd_user_id = normalized_user
      or participant.fixture_id in (
        select fixture.id
          from public.app_review_raffle_fixtures fixture
         where fixture.couple_bd_user_id = normalized_user
            or fixture.vendor_bd_user_id = normalized_user
      );
  get diagnostics participant_count = row_count;

  purge_result := public.purge_weddingwin_member_data_without_fixture_participants_v1(
    p_bd_user_id,
    p_bd_token,
    p_bd_cookie
  );

  delete from public.qr_bingo_raffle_settings settings
   where settings.event_key = any(email_fixture_event_keys);
  get diagnostics email_fixture_settings_count = row_count;

  delete from public.qr_bingo_email_test_fixtures fixture
   where fixture.event_key = any(email_fixture_event_keys);
  get diagnostics email_fixture_count = row_count;

  return coalesce(purge_result, '{}'::jsonb) || jsonb_build_object(
    'app_review_fixture_participants', participant_count,
    'email_test_fixture_scans', email_fixture_scan_count,
    'email_test_raffle_settings', email_fixture_settings_count,
    'email_test_raffle_fixtures', email_fixture_count
  );
end;
$$;

revoke all on function public.purge_weddingwin_member_data(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_weddingwin_member_data(text, text, text)
  to service_role;

revoke all on function public.claim_bd_chat_outbox(uuid, integer, integer) from public;
revoke all on function public.claim_bd_chat_outbox(uuid, integer, integer) from anon;
revoke all on function public.claim_bd_chat_outbox(uuid, integer, integer) from authenticated;
grant execute on function public.claim_bd_chat_outbox(uuid, integer, integer) to service_role;

revoke all on function public.release_bd_chat_outbox_claim(uuid) from public;
revoke all on function public.release_bd_chat_outbox_claim(uuid) from anon;
revoke all on function public.release_bd_chat_outbox_claim(uuid) from authenticated;
grant execute on function public.release_bd_chat_outbox_claim(uuid) to service_role;

revoke all on function public.enqueue_bd_chat_close(text, text) from public;
revoke all on function public.enqueue_bd_chat_close(text, text) from anon;
revoke all on function public.enqueue_bd_chat_close(text, text) from authenticated;
grant execute on function public.enqueue_bd_chat_close(text, text) to service_role;

revoke all on function public.enqueue_bd_chat_read_receipt(text, text[]) from public;
revoke all on function public.enqueue_bd_chat_read_receipt(text, text[]) from anon;
revoke all on function public.enqueue_bd_chat_read_receipt(text, text[]) from authenticated;
grant execute on function public.enqueue_bd_chat_read_receipt(text, text[]) to service_role;

revoke all on function public.reserve_bd_chat_identity(text, text, text) from public;
revoke all on function public.reserve_bd_chat_identity(text, text, text) from anon;
revoke all on function public.reserve_bd_chat_identity(text, text, text) from authenticated;
grant execute on function public.reserve_bd_chat_identity(text, text, text) to service_role;

revoke all on function public.confirm_bd_chat_identity(text, text, text) from public;
revoke all on function public.confirm_bd_chat_identity(text, text, text) from anon;
revoke all on function public.confirm_bd_chat_identity(text, text, text) from authenticated;
grant execute on function public.confirm_bd_chat_identity(text, text, text) to service_role;

revoke all on function public.renew_bd_chat_outbox_claim(uuid, uuid, integer) from public;
revoke all on function public.renew_bd_chat_outbox_claim(uuid, uuid, integer) from anon;
revoke all on function public.renew_bd_chat_outbox_claim(uuid, uuid, integer) from authenticated;
grant execute on function public.renew_bd_chat_outbox_claim(uuid, uuid, integer) to service_role;

revoke all on function public.park_bd_chat_outbox(uuid, uuid, integer, text) from public;
revoke all on function public.park_bd_chat_outbox(uuid, uuid, integer, text) from anon;
revoke all on function public.park_bd_chat_outbox(uuid, uuid, integer, text) from authenticated;
grant execute on function public.park_bd_chat_outbox(uuid, uuid, integer, text) to service_role;

revoke all on function public.complete_bd_chat_send(uuid, uuid, text, text) from public;
revoke all on function public.complete_bd_chat_send(uuid, uuid, text, text) from anon;
revoke all on function public.complete_bd_chat_send(uuid, uuid, text, text) from authenticated;
grant execute on function public.complete_bd_chat_send(uuid, uuid, text, text) to service_role;

revoke all on function public.acknowledge_bd_chat_read_receipts(uuid, uuid, text[], text) from public;
revoke all on function public.acknowledge_bd_chat_read_receipts(uuid, uuid, text[], text) from anon;
revoke all on function public.acknowledge_bd_chat_read_receipts(uuid, uuid, text[], text) from authenticated;
grant execute on function public.acknowledge_bd_chat_read_receipts(uuid, uuid, text[], text) to service_role;

commit;
