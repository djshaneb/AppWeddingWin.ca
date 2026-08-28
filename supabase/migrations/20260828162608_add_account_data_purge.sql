-- Account deletion initiated from the app must remove the Brilliant
-- Directories member's associated app data as one transaction. The caller is
-- the service-role-only bd-delete-account Edge Function.
create or replace function public.purge_weddingwin_member_data(
  p_bd_user_id text,
  p_bd_token text default '',
  p_bd_cookie text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  -- Preserve unrelated draw audit records when this member only operated the
  -- draw, while irreversibly removing the operator identifier.
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

  -- Removing either exact reviewer account retires the isolated fixture. Any
  -- remaining fixture scans cascade as a final fail-safe.
  delete from public.app_review_raffle_fixtures
   where couple_bd_user_id = v_user_id
      or vendor_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('app_review_raffle_fixtures', v_count);

  delete from public.app_chat_member_blocks
   where member_a_bd_user_id = v_user_id
      or member_b_bd_user_id = v_user_id
      or blocked_by_bd_user_id = v_user_id
      or blocked_member_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('member_blocks', v_count);

  delete from public.app_chat_thread_reports
   where reporter_bd_user_id = v_user_id
      or member_a_bd_user_id = v_user_id
      or member_b_bd_user_id = v_user_id
      or thread_token = any(v_thread_tokens)
      or app_thread_token = any(v_thread_tokens)
      or bd_thread_token = any(v_thread_tokens);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('chat_reports', v_count);

  delete from public.bd_chat_outbox
   where sender_bd_user_id = v_user_id
      or thread_token = any(v_thread_tokens)
      or app_thread_token = any(v_thread_tokens)
      or owner_identity = any(v_identities);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('chat_outbox', v_count);

  delete from public.bd_chat_messages
   where thread_token = any(v_thread_tokens);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('website_chat_messages', v_count);

  -- app_native_chat_messages cascade with their parent threads, including
  -- image_urls that contain app message attachments.
  delete from public.app_native_chat_threads
   where member_a_bd_user_id = v_user_id
      or member_b_bd_user_id = v_user_id
      or vendor_bd_user_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('app_chat_threads', v_count);

  delete from public.bd_chat_threads
   where owner_user_id = v_user_id
      or responder_user_id = v_user_id
      or thread_owner = any(v_identities)
      or regexp_split_to_array(coalesce(thread_responders, ''), '\s*,\s*') && v_identities
      or thread_token = any(v_thread_tokens);
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('website_chat_threads', v_count);

  delete from public.app_push_tokens
   where bd_member_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('push_tokens', v_count);

  delete from public.profiles
   where bd_member_id = v_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('profiles', v_count);

  -- Session, status and sync caches can contain the full member record or a
  -- copy of a deleted conversation. Match only canonical identities/tokens.
  delete from public.bd_edge_cache cache
   where cache.key like 'sess:' || v_user_id || ':%'
      or cache.key like 'status:' || v_user_id || ':%'
      or cache.key like 'sync:list:' || v_user_id || ':%'
      or exists (
        select 1
        from unnest(v_thread_tokens) thread_token
        where cache.value::text like '%' || thread_token || '%'
      );
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('edge_cache', v_count);

  -- Delete the cached login identity last so an interrupted Edge Function can
  -- retry the idempotent cleanup with the original authenticated session.
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
