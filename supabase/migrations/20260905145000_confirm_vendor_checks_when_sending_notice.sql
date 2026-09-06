-- A vendor explicitly confirms the Draw Rules checks in the Send confirmation.
-- Record that actual interaction, not a fabricated external document or answer.
-- This wrapper never sends mail and never changes historical verification.
create or replace function public.confirm_qr_bingo_winner_checks_for_notice(
  p_draw_id uuid,
  p_event_key text,
  p_vendor_bingo_id text,
  p_vendor_bd_user_id text,
  p_winner_checks_confirmed boolean,
  p_confirmed_by text
)
returns public.qr_bingo_raffle_draws
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_confirmed_by, ''));
  reviewed public.qr_bingo_raffle_draws%rowtype;
  internal_record text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_winner_checks_confirmed is distinct from true
    or p_draw_id is null
    or normalized_event !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event) > 100
    or normalized_vendor !~ '^[1-9][0-9]{0,19}$'
    or normalized_vendor_user is distinct from normalized_vendor
    or left(normalized_actor, length('vendor:' || normalized_vendor || ':'))
       is distinct from 'vendor:' || normalized_vendor || ':'
    or length(normalized_actor) <= length('vendor:' || normalized_vendor || ':')
    or length(normalized_actor) > 260
    or normalized_actor ~ '[<>[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'Explicit vendor confirmation of the completed Draw Rules checks is required.';
  end if;

  -- Same lock order as random selection/replacement: promotion, current event,
  -- then the exact draw. Concurrent Send and Replace cannot confirm a retired
  -- selection or each wait while holding the other's promotion/draw lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_event || ':' || normalized_vendor, 0)
  );
  perform 1 from public.qr_bingo_event_configs
   where published order by revision desc limit 1 for share;
  select * into reviewed from public.qr_bingo_raffle_draws
   where id = p_draw_id and event_key = normalized_event
     and vendor_bingo_id = normalized_vendor
     and vendor_bd_user_id = normalized_vendor_user
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'This selection does not belong to the signed-in vendor.';
  end if;

  -- The losing duplicate Send observes the committed confirmation and returns
  -- it unchanged. Existing legacy/platform evidence is never relabelled.
  if reviewed.selection_status = 'verified' then
    if reviewed.eligibility_verified_at is null
      or not public.qr_bingo_skill_verification_complete(reviewed)
      or reviewed.winner_rules_confirmed_at is null
      or reviewed.verified_at is null
      or nullif(btrim(reviewed.verification_notes), '') is null
    then
      raise exception using errcode = '23514', message = 'The existing winner confirmation is incomplete.';
    end if;
    return reviewed;
  end if;
  if reviewed.selection_status <> 'potential' then
    raise exception using errcode = '23514', message = 'Only the current potential winner can be confirmed. Refresh to see the latest selection.';
  end if;

  internal_record := 'Date: ' || to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD')
    || E'\nMethod: Vendor confirmation of completed Draw Rules checks'
    || E'\nReference: Internal action vendor_raffle_send_notice / selection ' || reviewed.id::text
    || E'\nAdditional notes: Vendor confirmation only. Wedding Win did not independently verify eligibility, an answer, an external document or prize fulfilment.';
  return public.attest_qr_bingo_potential_winner_by_vendor(
    reviewed.id, normalized_event, normalized_vendor, normalized_vendor_user,
    'verified', true, true, true, normalized_actor, internal_record
  );
end;
$$;

revoke all on function public.confirm_qr_bingo_winner_checks_for_notice(
  uuid, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.confirm_qr_bingo_winner_checks_for_notice(
  uuid, text, text, text, boolean, text
) to service_role;

comment on function public.confirm_qr_bingo_winner_checks_for_notice(
  uuid, text, text, text, boolean, text
) is 'Service-only explicit vendor confirmation of Draw Rules checks before a separately claimed winner notice. Internal timestamp/action reference only; no fabricated external proof or automatic mail.';
