-- Filename version reconciled with the linked Supabase migration history.
-- Deleting one member must not erase the other participant's copy of a
-- conversation or destroy moderation evidence. Shared threads are retained as
-- read-only records while the existing purge continues for account-owned data.
-- A finite retention period for shared messages/reports still needs to be
-- established in the published privacy policy and operating procedures. Raffle
-- record retention remains a separate owner/legal decision.

-- These links make provider identities resolvable from a BD member without
-- allowing two Supabase identities to claim the same Apple or BD account.
create unique index if not exists profiles_apple_sub_unique
  on public.profiles (btrim(apple_sub))
  where nullif(btrim(apple_sub), '') is not null;

create unique index if not exists profiles_bd_member_id_unique
  on public.profiles (btrim(bd_member_id))
  where nullif(btrim(bd_member_id), '') is not null;

-- Older Apple/native logins created the Supabase provider profile before the
-- Brilliant Directories member but never persisted the cross-system id. Resolve
-- that legacy gap from the server-trusted cached email at deletion time, fail
-- closed on ambiguity, and persist the link before any destructive work.
create or replace function public.link_weddingwin_profile_for_deletion(
  p_bd_user_id text,
  p_trusted_email text
)
returns table (
  id uuid,
  email text,
  apple_sub text,
  bd_member_id text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text := btrim(coalesce(p_bd_user_id, ''));
  v_email text := lower(btrim(coalesce(p_trusted_email, '')));
  v_profile_ids uuid[];
begin
  if v_user_id = '' then
    raise exception 'A Brilliant Directories member id is required.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(profiles.id), array[]::uuid[])
    into v_profile_ids
  from public.profiles profiles
  where btrim(coalesce(profiles.bd_member_id, '')) = v_user_id;

  if cardinality(v_profile_ids) > 1 then
    raise exception 'More than one provider profile is linked to this member.';
  end if;

  if cardinality(v_profile_ids) = 0 and v_email <> '' then
    select coalesce(array_agg(profiles.id), array[]::uuid[])
      into v_profile_ids
    from public.profiles profiles
    where lower(btrim(coalesce(profiles.email, ''))) = v_email
      and nullif(btrim(coalesce(profiles.bd_member_id, '')), '') is null;

    if cardinality(v_profile_ids) > 1 then
      raise exception 'Provider profile lookup is ambiguous for this member.';
    end if;

    if cardinality(v_profile_ids) = 1 then
      update public.profiles profiles
         set bd_member_id = v_user_id,
             updated_at = now()
       where profiles.id = v_profile_ids[1]
         and nullif(btrim(coalesce(profiles.bd_member_id, '')), '') is null;
    end if;
  end if;

  return query
  select profiles.id, profiles.email, profiles.apple_sub, profiles.bd_member_id
    from public.profiles profiles
   where profiles.id = any(v_profile_ids);
end;
$$;

revoke all on function public.link_weddingwin_profile_for_deletion(text, text) from public;
revoke all on function public.link_weddingwin_profile_for_deletion(text, text) from anon;
revoke all on function public.link_weddingwin_profile_for_deletion(text, text) from authenticated;
grant execute on function public.link_weddingwin_profile_for_deletion(text, text) to service_role;

-- Account deletion is an operational closure, not a safety report. Existing
-- chat readers already treat every non-resolved status as closed, so this
-- distinct status provides accurate moderation/audit semantics without a
-- client compatibility change.
alter table public.app_chat_thread_reports
  drop constraint if exists app_chat_thread_reports_status_check;

alter table public.app_chat_thread_reports
  add constraint app_chat_thread_reports_status_check
  check (status in ('reported', 'reviewing', 'resolved', 'account_deleted'));

create or replace function public.purge_weddingwin_member_data(
  p_bd_user_id text,
  p_bd_token text default '',
  p_bd_cookie text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text := btrim(coalesce(p_bd_user_id, ''));
  v_token text := btrim(coalesce(p_bd_token, ''));
  v_cookie text := btrim(coalesce(p_bd_cookie, ''));
  v_identities text[];
  v_thread_tokens text[];
  v_entry_ids uuid[];
  v_count integer;
  v_result jsonb := '{}'::jsonb;
  v_deleted_notice constant text :=
    'Account deleted: This conversation is read-only. Shared message history remains available to the other participant subject to WeddingWin''s retention policy.';
begin
  if v_user_id = '' then
    raise exception 'A Brilliant Directories member id is required.'
      using errcode = '22023';
  end if;

  select array_agg(identity_value)
    into v_identities
  from (
    select distinct identity_value
    from unnest(array[v_user_id, v_token, v_cookie]) identity_value
    where nullif(identity_value, '') is not null
  ) identities;

  select coalesce(array_agg(distinct token), array[]::text[])
    into v_thread_tokens
  from (
    select thread_token as token
      from public.app_native_chat_threads
     where member_a_bd_user_id = v_user_id
        or member_b_bd_user_id = v_user_id
        or vendor_bd_user_id = v_user_id
    union
    select bd_thread_token as token
      from public.app_native_chat_threads
     where (member_a_bd_user_id = v_user_id
         or member_b_bd_user_id = v_user_id
         or vendor_bd_user_id = v_user_id)
       and nullif(btrim(bd_thread_token), '') is not null
    union
    select thread_token as token
      from public.bd_chat_threads
     where owner_user_id = v_user_id
        or responder_user_id = v_user_id
        or thread_owner = any(v_identities)
        or regexp_split_to_array(coalesce(thread_responders, ''), '\s*,\s*') && v_identities
  ) tokens
  where nullif(btrim(token), '') is not null;

  select coalesce(array_agg(id), array[]::uuid[])
    into v_entry_ids
  from public.qr_bingo_raffle_entries
  where couple_bd_user_id = v_user_id
     or vendor_bd_user_id = v_user_id;

  delete from public.qr_bingo_grand_prize_entries
   where couple_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('grand_prize_entries', v_count);

  delete from public.qr_bingo_raffle_draws
   where vendor_bd_user_id = v_user_id
      or couple_bd_user_id = v_user_id
      or entry_id = any(v_entry_ids);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('raffle_draws', v_count);

  update public.qr_bingo_raffle_draws
     set drawn_by_bd_user_id = '(deleted member)'
   where drawn_by_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('raffle_draw_operator_anonymized', v_count);

  delete from public.qr_bingo_raffle_entries
   where vendor_bd_user_id = v_user_id
      or couple_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('raffle_entries', v_count);

  delete from public.qr_bingo_raffle_settings
   where vendor_bd_user_id = v_user_id
      or event_key in (
        select fixture.event_key
          from public.app_review_raffle_fixtures fixture
         where fixture.couple_bd_user_id = v_user_id
            or fixture.vendor_bd_user_id = v_user_id
      );
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('raffle_settings', v_count);

  delete from public.app_review_raffle_fixture_scans
   where couple_bd_user_id = v_user_id
      or fixture_id in (
        select fixture.id
          from public.app_review_raffle_fixtures fixture
         where fixture.couple_bd_user_id = v_user_id
            or fixture.vendor_bd_user_id = v_user_id
      );
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('app_review_fixture_scans', v_count);

  delete from public.app_review_raffle_fixtures
   where couple_bd_user_id = v_user_id
      or vendor_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('app_review_raffle_fixtures', v_count);

  -- Preserve any pre-existing safety report. Add an account-deletion closure
  -- only for aliases that do not already have a stronger moderation record.
  insert into public.app_chat_thread_reports (
    thread_token,
    app_thread_token,
    bd_thread_token,
    reporter_bd_user_id,
    member_a_bd_user_id,
    member_b_bd_user_id,
    status,
    notice,
    reported_at
  )
  select
    threads.thread_token,
    threads.thread_token,
    nullif(btrim(threads.bd_thread_token), ''),
    v_user_id,
    threads.member_a_bd_user_id,
    threads.member_b_bd_user_id,
    'account_deleted',
    v_deleted_notice,
    now()
  from public.app_native_chat_threads threads
  where threads.member_a_bd_user_id = v_user_id
     or threads.member_b_bd_user_id = v_user_id
     or threads.vendor_bd_user_id = v_user_id
  on conflict (thread_token) do nothing;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('app_chat_account_deleted_closures', v_count);

  insert into public.app_chat_thread_reports (
    thread_token,
    app_thread_token,
    bd_thread_token,
    reporter_bd_user_id,
    member_a_bd_user_id,
    member_b_bd_user_id,
    status,
    notice,
    reported_at
  )
  select
    btrim(threads.bd_thread_token),
    threads.thread_token,
    btrim(threads.bd_thread_token),
    v_user_id,
    threads.member_a_bd_user_id,
    threads.member_b_bd_user_id,
    'account_deleted',
    v_deleted_notice,
    now()
  from public.app_native_chat_threads threads
  where (threads.member_a_bd_user_id = v_user_id
      or threads.member_b_bd_user_id = v_user_id
      or threads.vendor_bd_user_id = v_user_id)
    and nullif(btrim(threads.bd_thread_token), '') is not null
  on conflict (thread_token) do nothing;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('bd_alias_account_deleted_closures', v_count);

  insert into public.app_chat_thread_reports (
    thread_token,
    app_thread_token,
    bd_thread_token,
    reporter_bd_user_id,
    member_a_bd_user_id,
    member_b_bd_user_id,
    status,
    notice,
    reported_at
  )
  select
    threads.thread_token,
    app_threads.thread_token,
    threads.thread_token,
    v_user_id,
    threads.owner_user_id,
    threads.responder_user_id,
    'account_deleted',
    v_deleted_notice,
    now()
  from public.bd_chat_threads threads
  left join public.app_native_chat_threads app_threads
    on app_threads.bd_thread_token = threads.thread_token
  where threads.thread_token = any(v_thread_tokens)
  on conflict (thread_token) do nothing;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('website_chat_account_deleted_closures', v_count);

  -- Ensure the app blocks new sends for each fully resolved pair even when the
  -- alias already had a resolved report. The surviving member is the actor and
  -- the deleted member is the blocked target, which satisfies existing pair
  -- invariants and keeps the surviving participant's history visible.
  insert into public.app_chat_member_blocks (
    member_a_bd_user_id,
    member_b_bd_user_id,
    blocked_by_bd_user_id,
    blocked_member_bd_user_id,
    source_thread_token,
    status,
    notice,
    created_at,
    updated_at,
    revoked_at,
    revoked_by
  )
  select
    least(threads.member_a_bd_user_id, threads.member_b_bd_user_id),
    greatest(threads.member_a_bd_user_id, threads.member_b_bd_user_id),
    case
      when threads.member_a_bd_user_id = v_user_id then threads.member_b_bd_user_id
      else threads.member_a_bd_user_id
    end,
    v_user_id,
    threads.thread_token,
    'active',
    v_deleted_notice,
    now(),
    now(),
    null,
    null
  from public.app_native_chat_threads threads
  where (threads.member_a_bd_user_id = v_user_id
      or threads.member_b_bd_user_id = v_user_id)
    and threads.member_a_bd_user_id <> threads.member_b_bd_user_id
  on conflict (member_a_bd_user_id, member_b_bd_user_id) do update
  set
    blocked_by_bd_user_id = excluded.blocked_by_bd_user_id,
    blocked_member_bd_user_id = excluded.blocked_member_bd_user_id,
    source_thread_token = excluded.source_thread_token,
    status = 'active',
    notice = excluded.notice,
    updated_at = now(),
    revoked_at = null,
    revoked_by = null;

  with resolved_pairs as (
    select distinct on (
      least(threads.owner_user_id, threads.responder_user_id),
      greatest(threads.owner_user_id, threads.responder_user_id)
    )
      threads.thread_token,
      threads.owner_user_id,
      threads.responder_user_id
    from public.bd_chat_threads threads
    where threads.thread_token = any(v_thread_tokens)
      and nullif(btrim(threads.owner_user_id), '') is not null
      and nullif(btrim(threads.responder_user_id), '') is not null
      and threads.owner_user_id <> threads.responder_user_id
      and v_user_id in (threads.owner_user_id, threads.responder_user_id)
    order by
      least(threads.owner_user_id, threads.responder_user_id),
      greatest(threads.owner_user_id, threads.responder_user_id),
      threads.thread_token
  )
  insert into public.app_chat_member_blocks (
    member_a_bd_user_id,
    member_b_bd_user_id,
    blocked_by_bd_user_id,
    blocked_member_bd_user_id,
    source_thread_token,
    status,
    notice,
    created_at,
    updated_at,
    revoked_at,
    revoked_by
  )
  select
    least(owner_user_id, responder_user_id),
    greatest(owner_user_id, responder_user_id),
    case when owner_user_id = v_user_id then responder_user_id else owner_user_id end,
    v_user_id,
    thread_token,
    'active',
    v_deleted_notice,
    now(),
    now(),
    null,
    null
  from resolved_pairs
  on conflict (member_a_bd_user_id, member_b_bd_user_id) do update
  set
    blocked_by_bd_user_id = excluded.blocked_by_bd_user_id,
    blocked_member_bd_user_id = excluded.blocked_member_bd_user_id,
    source_thread_token = excluded.source_thread_token,
    status = 'active',
    notice = excluded.notice,
    updated_at = now(),
    revoked_at = null,
    revoked_by = null;

  -- Remove only pending work authored by the departing member. Rows belonging
  -- to the other participant must not be deleted merely because they share a
  -- thread token.
  delete from public.bd_chat_outbox
   where sender_bd_user_id = v_user_id
      or owner_identity = any(v_identities);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('owned_chat_outbox', v_count);

  -- Close website aliases asynchronously. The existing budgeted flusher sends
  -- these operations to BD and safely deduplicates delivery attempts.
  insert into public.bd_chat_outbox (kind, thread_token, payload)
  select
    'close',
    threads.thread_token,
    jsonb_build_object('thread_id', coalesce(threads.thread_id, ''))
  from public.bd_chat_threads threads
  where threads.thread_token = any(v_thread_tokens)
    and not exists (
      select 1
      from public.bd_chat_outbox pending
      where pending.kind = 'close'
        and pending.thread_token = threads.thread_token
        and pending.sent_at is null
    );
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('website_chat_closes_queued', v_count);

  update public.bd_chat_threads
     set thread_status = '0', synced_at = now()
   where thread_token = any(v_thread_tokens);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('website_chat_threads_closed', v_count);

  -- Deliberately preserve app_native_chat_threads/messages, bd_chat_threads/
  -- messages, reports and pair blocks. Those rows are shared with the other
  -- participant and/or are required moderation evidence.
  v_result := v_result || jsonb_build_object(
    'shared_chat_threads_preserved', coalesce(array_length(v_thread_tokens, 1), 0)
  );

  delete from public.app_push_tokens
   where bd_member_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('push_tokens', v_count);

  delete from public.profiles
   where bd_member_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('profiles', v_count);

  -- Delete only this member's caches. Searching cache values for a shared
  -- thread token erased the surviving participant's inbox/status snapshots.
  delete from public.bd_edge_cache cache
   where cache.key like 'sess:' || v_user_id || ':%'
      or cache.key like 'status:' || v_user_id || ':%'
      or cache.key like 'sync:list:' || v_user_id || ':%';
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('edge_cache', v_count);

  delete from public.bd_users_cache
   where user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('identity_cache', v_count);

  return v_result;
end;
$$;

revoke all on function public.purge_weddingwin_member_data(text, text, text) from public;
revoke all on function public.purge_weddingwin_member_data(text, text, text) from anon;
revoke all on function public.purge_weddingwin_member_data(text, text, text) from authenticated;
grant execute on function public.purge_weddingwin_member_data(text, text, text) to service_role;
