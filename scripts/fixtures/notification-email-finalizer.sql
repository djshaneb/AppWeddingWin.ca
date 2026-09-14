-- Read-only pg_get_functiondef snapshot 2026-09-14. No production rows or credentials.
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
