-- Keep expected administrative publish failures inside a completed database
-- transaction. This prevents a disconnected HTTP client from leaving an
-- aborted PostgREST transaction holding the serialized publish lock.

alter function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  rename to publish_qr_bingo_event_config_locked;

create function public.publish_qr_bingo_event_config(
  p_expected_revision bigint,
  p_config jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    return public.publish_qr_bingo_event_config_locked(
      p_expected_revision,
      p_config,
      p_actor
    );
  exception
    when serialization_failure then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'error', 'QR Bingo event configuration changed; reload before publishing.'
      );
    when invalid_parameter_value then
      return jsonb_build_object(
        'ok', false,
        'conflict', false,
        'error', sqlerrm
      );
  end;
end;
$$;

revoke all on function public.publish_qr_bingo_event_config_locked(bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.publish_qr_bingo_event_config_locked(bigint, jsonb, text)
  to service_role;

revoke all on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  to service_role;

notify pgrst, 'reload schema';
