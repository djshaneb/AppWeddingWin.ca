CREATE OR REPLACE FUNCTION public.finalize_qr_bingo_draw_email_delivery(p_delivery_key text, p_claim_token uuid, p_outcome text, p_provider_message_id text DEFAULT ''::text, p_error text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  delivery public.qr_bingo_draw_email_deliveries%rowtype;
  current_draw public.qr_bingo_raffle_draws%rowtype;
  resolved_outcome text := lower(btrim(coalesce(p_outcome, '')));
  clean_provider_id text := btrim(coalesce(p_provider_message_id, ''));
  clean_error text := btrim(coalesce(p_error, ''));
  delivery_draw_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if nullif(btrim(p_delivery_key), '') is null
    or p_claim_token is null
    or resolved_outcome not in ('sent', 'retryable_failure', 'ambiguous')
    or length(clean_provider_id) > 500
    or length(clean_error) > 1000
  then
    raise exception using errcode = '22023', message = 'A delivery key, claim token, supported outcome, and bounded result are required.';
  end if;

  select draw_id
    into delivery_draw_id
    from public.qr_bingo_draw_email_deliveries
   where delivery_key = btrim(p_delivery_key);

  if delivery_draw_id is null then
    raise exception using errcode = 'P0002', message = 'QR Bingo email delivery was not found.';
  end if;

  select *
    into current_draw
    from public.qr_bingo_raffle_draws
   where id = delivery_draw_id
   for update;

  select *
    into delivery
    from public.qr_bingo_draw_email_deliveries
   where delivery_key = btrim(p_delivery_key)
   for update;

  if delivery.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'already_sent', true,
      'delivery_key', delivery.delivery_key,
      'status', delivery.status,
      'sent_at', delivery.sent_at
    );
  end if;

  if delivery.status not in ('claimed', 'ambiguous')
    or delivery.claim_token is distinct from p_claim_token
  then
    raise exception using errcode = '55000', message = 'QR Bingo email delivery claim is no longer owned by this worker.';
  end if;

  if resolved_outcome = 'sent' then
    if current_draw.selection_status <> 'verified'
      or current_draw.eligibility_verified_at is null
      or not public.qr_bingo_skill_verification_complete(current_draw)
      or current_draw.verified_at is null
    then
      raise exception using errcode = '55000', message = 'The draw is no longer eligible for verified-winner email delivery.';
    end if;

    update public.qr_bingo_raffle_draws
       set vendor_email_sent_at = case
             when delivery.channel = 'vendor' then coalesce(vendor_email_sent_at, v_now)
             else vendor_email_sent_at
           end,
           couple_email_sent_at = case
             when delivery.channel = 'couple' then coalesce(couple_email_sent_at, v_now)
             else couple_email_sent_at
           end
     where id = current_draw.id;

    update public.qr_bingo_draw_email_deliveries
       set status = 'sent',
           claim_token = null,
           claim_expires_at = null,
           sent_at = coalesce(sent_at, v_now),
           provider_message_id = clean_provider_id,
           last_error = '',
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  elsif resolved_outcome = 'retryable_failure' then
    if clean_error = '' then
      raise exception using errcode = '22023', message = 'A definitive retryable failure requires an error description.';
    end if;

    update public.qr_bingo_draw_email_deliveries
       set status = 'retryable_failed',
           claim_token = null,
           claim_expires_at = null,
           provider_message_id = clean_provider_id,
           last_error = clean_error,
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  else
    update public.qr_bingo_draw_email_deliveries
       set status = 'ambiguous',
           claim_expires_at = null,
           provider_message_id = clean_provider_id,
           last_error = case
             when clean_error = '' then 'External delivery outcome is ambiguous; operator reconciliation is required.'
             else clean_error
           end,
           updated_at = v_now
     where id = delivery.id
    returning * into delivery;
  end if;

  return jsonb_build_object(
    'ok', true,
    'delivery_key', delivery.delivery_key,
    'status', delivery.status,
    'sent_at', delivery.sent_at,
    'attempt_count', delivery.attempt_count,
    'provider_message_id', delivery.provider_message_id,
    'last_error', delivery.last_error
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.qr_bingo_skill_verification_complete(p_draw qr_bingo_raffle_draws)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(
    (p_draw).skill_question_verified_at is not null
    or (
      (p_draw).skill_question_vendor_attested_at is not null
      and (p_draw).vendor_bd_user_id ~ '^[1-9][0-9]{0,19}$'
      and (p_draw).skill_question_vendor_attested_by = (p_draw).verified_by
      and starts_with((p_draw).skill_question_vendor_attested_by,
        'vendor:' || (p_draw).vendor_bd_user_id || ':')
      and length((p_draw).skill_question_vendor_attested_by) >
        length('vendor:' || (p_draw).vendor_bd_user_id || ':')
      and (p_draw).skill_question_vendor_attestation =
        'The vendor confirms it independently completed the required skill-testing verification outside Wedding Win and retained evidence. Wedding Win records this attestation and did not check the answer.'
      and (p_draw).winner_rules_confirmed_at is not null
      and nullif(btrim((p_draw).verification_notes), '') is not null
    ), false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.replace_qr_bingo_potential_winner_by_vendor(p_draw_id uuid, p_event_key text, p_vendor_bingo_id text, p_vendor_bd_user_id text, p_drawn_by_bd_user_id text, p_skill_question_prompt text, p_skill_question_salt text, p_skill_question_answer_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_event text := btrim(coalesce(p_event_key, ''));
  normalized_vendor text := btrim(coalesce(p_vendor_bingo_id, ''));
  normalized_vendor_user text := btrim(coalesce(p_vendor_bd_user_id, ''));
  normalized_actor text := btrim(coalesce(p_drawn_by_bd_user_id, ''));
  previous public.qr_bingo_raffle_draws%rowtype;
  replacement public.qr_bingo_raffle_draws%rowtype;
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;
  if p_draw_id is null
    or normalized_event !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(normalized_event) > 100
    or normalized_vendor !~ '^[1-9][0-9]{0,19}$'
    or normalized_vendor_user is distinct from normalized_vendor
    or normalized_actor is distinct from normalized_vendor_user
  then
    raise exception using errcode = '22023', message = 'An exact selection, promotion, and vendor actor are required.';
  end if;

  -- Same promotion lock as initial selection and pool changes, acquired before
  -- the draw row. Duplicate taps cannot retire or replace two pending records.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_event || ':' || normalized_vendor, 0)
  );
  select * into previous
    from public.qr_bingo_raffle_draws
   where id = p_draw_id and event_key = normalized_event
     and vendor_bingo_id = normalized_vendor
     and vendor_bd_user_id = normalized_vendor_user
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'This selection does not belong to the signed-in vendor.';
  end if;
  if previous.selection_status <> 'potential' then
    return jsonb_build_object('ok', false, 'code', 'selection_not_pending',
      'error', 'Only the current potential winner can be replaced. Refresh to see the latest selection.');
  end if;

  -- This block is a PostgreSQL subtransaction. A rejected/no-alternative result
  -- rolls back every change inside it before returning the original selection.
  begin
    update public.qr_bingo_raffle_draws
       set selection_status = 'replaced', replaced_at = clock_timestamp(),
           replaced_by_bd_user_id = normalized_actor,
           replacement_note = 'Vendor requested another potential winner.'
     where id = previous.id;

    result := public.select_qr_bingo_potential_winner(
      normalized_event, normalized_vendor, normalized_vendor_user,
      normalized_actor, 'vendor_requested_replacement', p_skill_question_prompt,
      p_skill_question_salt, p_skill_question_answer_hash
    );
    if result->>'ok' is distinct from 'true' then
      raise exception using errcode = 'PZR01', message = 'Replacement selection did not complete.';
    end if;

    select * into replacement
      from public.qr_bingo_raffle_draws
     where id = (result->'draw'->>'id')::uuid
       and event_key = normalized_event and vendor_bingo_id = normalized_vendor
       and vendor_bd_user_id = normalized_vendor_user
       and selection_status = 'potential'
     for update;
    if not found or replacement.couple_bd_user_id = previous.couple_bd_user_id
      or replacement.entry_id = previous.entry_id
    then
      raise exception using errcode = '23514', message = 'A different eligible couple is required for replacement.';
    end if;
    update public.qr_bingo_raffle_draws
       set replaces_draw_id = previous.id
     where id = replacement.id
     returning * into replacement;

    return result || jsonb_build_object('draw', to_jsonb(replacement),
      'replaced_draw_id', previous.id, 'replacement_selected', true);
  exception when sqlstate 'PZR01' then
    if result->>'code' = 'no_eligible_entries' then
      return jsonb_build_object('ok', false, 'code', 'no_replacement_available',
        'error', 'There are no other eligible couples to choose from. Your current potential winner has not changed.');
    end if;
    return coalesce(result, jsonb_build_object('ok', false,
      'code', 'replacement_unavailable', 'error', 'The potential winner could not be changed.'));
  end;
end;
$function$
;
