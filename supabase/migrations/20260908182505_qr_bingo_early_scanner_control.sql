-- Operational scanner override only. Do not change show/entry/draw times,
-- immutable offers, contact records, consent evidence, or the active revision.
-- The runtime derives automatic opening as midnight America/Toronto on the
-- history_starts_at date, retaining history_starts_at itself for draw rules.

do $guard$
begin
  if md5(pg_get_functiondef('public.apply_qr_bingo_app_card_controls()'::regprocedure)) <> '9ee3026067f7871e88886a0813dd3ab8'
    or md5(pg_get_functiondef('public.publish_qr_bingo_event_config(bigint,jsonb,text)'::regprocedure)) <> '7e41af4f847954247380279b1b8c2465'
    or md5(pg_get_functiondef('public.publish_qr_bingo_event_config_locked(bigint,jsonb,text)'::regprocedure)) <> 'eba52bd97cd6feeae8d46da2508a2449'
    or md5(pg_get_functiondef('public.protect_qr_bingo_event_config_revision()'::regprocedure)) <> '07c9d0e91a5b3fdf8111207f5d1ca249'
  then
    raise exception 'QR Bingo scanner-control baseline changed; review before applying this migration.';
  end if;
end;
$guard$;

alter table public.qr_bingo_event_configs
  add column scan_open_early boolean not null default false,
  add column scan_early_access_starts_at timestamptz;

alter table public.qr_bingo_event_configs
  add constraint qr_bingo_event_configs_early_scanner_valid check (
    (scan_early_access_starts_at is null or isfinite(scan_early_access_starts_at))
    and (not scan_open_early or scan_early_access_starts_at is not null)
  );

comment on column public.qr_bingo_event_configs.scan_open_early is
  'Admin operational override for scanner opening only. Master scan_enabled pause and entry_closes_at still apply; draw entry and consent rules are unchanged.';
comment on column public.qr_bingo_event_configs.scan_early_access_starts_at is
  'Server timestamp of the first early scanner enable for this exact event, inherited even while disabled. Never supplied by a client or copied from another event.';

CREATE OR REPLACE FUNCTION public.apply_qr_bingo_app_card_controls()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fallback_venue_name constant text := 'Venue to be announced';
  requested_controls jsonb := '{}'::jsonb;
  requested_controls_text text;
  previous_config public.qr_bingo_event_configs%rowtype;
  earliest_access_at timestamptz;
  control_key text;
begin
  requested_controls_text := pg_catalog.current_setting(
    'weddingwin.qr_bingo_app_card_controls',
    true
  );
  if coalesce(requested_controls_text, '') <> '' then
    requested_controls := requested_controls_text::jsonb;
  end if;

  if jsonb_typeof(requested_controls) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'QR Bingo app-card controls are invalid.';
  end if;

  for control_key in select jsonb_object_keys(requested_controls)
  loop
    if control_key not in ('venue_name', 'app_card_enabled', 'scan_open_early') then
      raise exception using errcode = '22023', message = 'Unknown QR Bingo operational control.';
    end if;
  end loop;

  -- Consume the transaction-local handoff so it cannot affect another insert.
  perform pg_catalog.set_config(
    'weddingwin.qr_bingo_app_card_controls',
    '{}',
    true
  );

  select config.*
    into previous_config
    from public.qr_bingo_event_configs config
   where config.event_key = new.event_key
     and config.revision < new.revision
   order by config.revision desc
   limit 1;

  if requested_controls ? 'venue_name' then
    new.venue_name := requested_controls ->> 'venue_name';
  elsif new.venue_name is null and previous_config.id is not null then
    new.venue_name := previous_config.venue_name;
  end if;

  -- The first revision of a new event (and a revision following old nullable
  -- history) has nothing to inherit. Do not publish a value the strict Edge
  -- parser will reject; preserve legacy callers with a clear placeholder.
  if new.venue_name is null then
    new.venue_name := fallback_venue_name;
  end if;

  if requested_controls ? 'app_card_enabled' then
    if jsonb_typeof(requested_controls -> 'app_card_enabled') <> 'boolean' then
      raise exception using
        errcode = '22023',
        message = 'app_card_enabled must be a boolean.';
    end if;
    new.app_card_enabled :=
      (requested_controls ->> 'app_card_enabled')::boolean;
  elsif previous_config.id is not null then
    new.app_card_enabled := previous_config.app_card_enabled;
  else
    new.app_card_enabled := coalesce(new.app_card_enabled, true);
  end if;

  if requested_controls ? 'scan_open_early' then
    if jsonb_typeof(requested_controls -> 'scan_open_early') <> 'boolean' then
      raise exception using errcode = '22023', message = 'scan_open_early must be a boolean.';
    end if;
    new.scan_open_early := (requested_controls ->> 'scan_open_early')::boolean;
  elsif previous_config.id is not null then
    new.scan_open_early := previous_config.scan_open_early;
  else
    new.scan_open_early := false;
  end if;

  -- Only the server creates this timestamp. Retain the earliest authorized
  -- access for this exact event even after the toggle is turned off, so later
  -- publications cannot hide scans already accepted under an earlier revision.
  -- A different event never inherits another event's early-access history.
  select min(config.scan_early_access_starts_at)
    into earliest_access_at
    from public.qr_bingo_event_configs config
   where config.event_key = new.event_key
     and config.revision < new.revision;

  new.scan_early_access_starts_at := earliest_access_at;
  if new.scan_open_early and new.scan_early_access_starts_at is null then
    new.scan_early_access_starts_at := pg_catalog.transaction_timestamp();
  end if;

  return new;
end;
$function$;

revoke all on function public.apply_qr_bingo_app_card_controls()
  from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_qr_bingo_event_config(p_expected_revision bigint, p_config jsonb, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested_controls jsonb := '{}'::jsonb;
  venue_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  begin
    if p_config is not null and jsonb_typeof(p_config) = 'object' then
      if p_config ? 'scan_early_access_starts_at' then
        raise exception using errcode = '22023', message = 'The early-access timestamp is managed by the server.';
      end if;
      if p_config ? 'scan_open_early' then
        if jsonb_typeof(p_config -> 'scan_open_early') <> 'boolean' then
          raise exception using errcode = '22023', message = 'scan_open_early must be a boolean.';
        end if;
        requested_controls := requested_controls || jsonb_build_object(
          'scan_open_early', (p_config ->> 'scan_open_early')::boolean
        );
      end if;

      if p_config ? 'venue_name' then
        if jsonb_typeof(p_config -> 'venue_name') <> 'string' then
          raise exception using
            errcode = '22023',
            message = 'venue_name must be a string.';
        end if;
        venue_value := btrim(p_config ->> 'venue_name');
        if venue_value = ''
          or char_length(venue_value) > 160
          or venue_value ~ '[<>]'
          or venue_value ~ '[[:cntrl:]]'
        then
          raise exception using
            errcode = '22023',
            message = 'venue_name must use 1-160 plain-text characters.';
        end if;
        requested_controls := requested_controls ||
          jsonb_build_object('venue_name', venue_value);
      end if;

      if p_config ? 'app_card_enabled' then
        if jsonb_typeof(p_config -> 'app_card_enabled') <> 'boolean' then
          raise exception using
            errcode = '22023',
            message = 'app_card_enabled must be a boolean.';
        end if;
        requested_controls := requested_controls || jsonb_build_object(
          'app_card_enabled',
          (p_config ->> 'app_card_enabled')::boolean
        );
      end if;
    end if;

    perform pg_catalog.set_config(
      'weddingwin.qr_bingo_app_card_controls',
      requested_controls::text,
      true
    );

    return public.publish_qr_bingo_event_config_locked(
      p_expected_revision,
      p_config - 'venue_name' - 'app_card_enabled' - 'scan_open_early',
      p_actor
    );
  exception
    when serialization_failure then
      perform pg_catalog.set_config(
        'weddingwin.qr_bingo_app_card_controls',
        '{}',
        true
      );
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'error', 'QR Bingo event configuration changed; reload before publishing.'
      );
    when invalid_parameter_value then
      perform pg_catalog.set_config(
        'weddingwin.qr_bingo_app_card_controls',
        '{}',
        true
      );
      return jsonb_build_object(
        'ok', false,
        'conflict', false,
        'error', sqlerrm
      );
  end;
end;
$function$;

revoke all on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  to service_role;

-- The existing trigger binding, locked publisher, RLS, immutable-revision and
-- audit protections remain unchanged. No publication or contact/scan mutation
-- occurs in this migration.
