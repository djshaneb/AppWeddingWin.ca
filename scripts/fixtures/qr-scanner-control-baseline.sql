-- Schema-only function definitions read from the live project on 2026-09-08.
-- No user rows, secrets or connection details. Used only by the offline test.

-- apply_qr_bingo_app_card_controls: MD5 9ee3026067f7871e88886a0813dd3ab8
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

  return new;
end;
$function$;

-- gate_activated_qr_bingo_event_material_publish: MD5 ee68e0a16c34d5439e363d9c940c9a72
CREATE OR REPLACE FUNCTION public.gate_activated_qr_bingo_event_material_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  previous_config public.qr_bingo_event_configs%rowtype;
  event_activated boolean := false;
  permitted_in_person_rules_transition boolean := false;
begin
  if not new.published then
    return new;
  end if;

  select config.*
    into previous_config
    from public.qr_bingo_event_configs config
   where config.id is distinct from new.id
     and config.event_key = new.event_key
   order by config.revision desc
   limit 1;

  if previous_config.id is null
    or previous_config.event_key is distinct from new.event_key
  then
    return new;
  end if;

  event_activated := exists (
    select 1
      from public.qr_bingo_vendor_offer_versions version
     where version.event_key = previous_config.event_key
       and version.offer_enterable
       and not version.activation_excluded_as_legacy_qa
  ) or exists (
    select 1
      from public.qr_bingo_raffle_entries entry
     where entry.event_key = previous_config.event_key
       and not exists (
         select 1
           from public.qr_bingo_legacy_qa_archives archive
          where archive.entry_id = entry.id
       )
  );

  permitted_in_person_rules_transition :=
    previous_config.event_key = 'niagara-wedding-show-2026'
    and previous_config.rules_version = '2026-09-01-vendor-marketing'
    and new.rules_version = '2026-09-01-in-person-entry'
    and new.history_starts_at =
      timestamptz '2026-10-18 15:00:00+00'
    and row(
      new.event_name,
      new.vendor_tag_id,
      new.official_rules_url,
      new.alternate_free_entry_url,
      new.eligibility_region,
      new.entry_closes_at,
      new.draw_opens_at,
      new.draw_at
    ) is not distinct from row(
      previous_config.event_name,
      previous_config.vendor_tag_id,
      previous_config.official_rules_url,
      previous_config.alternate_free_entry_url,
      previous_config.eligibility_region,
      previous_config.entry_closes_at,
      previous_config.draw_opens_at,
      previous_config.draw_at
    );

  if event_activated and row(
    new.event_name,
    new.vendor_tag_id,
    new.history_starts_at,
    new.rules_version,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.eligibility_region,
    new.entry_closes_at,
    new.draw_opens_at,
    new.draw_at
  ) is distinct from row(
    previous_config.event_name,
    previous_config.vendor_tag_id,
    previous_config.history_starts_at,
    previous_config.rules_version,
    previous_config.official_rules_url,
    previous_config.alternate_free_entry_url,
    previous_config.eligibility_region,
    previous_config.entry_closes_at,
    previous_config.draw_opens_at,
    previous_config.draw_at
  ) and not permitted_in_person_rules_transition then
    raise exception using
      errcode = '55000',
      message = 'Material QR Bingo event terms cannot change after an offer opens or a real entry exists; publish a new event instead.';
  end if;

  return new;
end;
$function$;

-- publish_qr_bingo_event_config: MD5 7e41af4f847954247380279b1b8c2465
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
  begin
    if p_config is not null and jsonb_typeof(p_config) = 'object' then
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
      p_config - 'venue_name' - 'app_card_enabled',
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

-- publish_qr_bingo_event_config_locked: MD5 eba52bd97cd6feeae8d46da2508a2449
CREATE OR REPLACE FUNCTION public.publish_qr_bingo_event_config_locked(p_expected_revision bigint, p_config jsonb, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  required_keys constant text[] := array[
    'event_key',
    'event_name',
    'vendor_tag_id',
    'history_starts_at',
    'scan_enabled',
    'vendor_draws_enabled',
    'email_delivery_mode',
    'send_vendor_email',
    'send_couple_email',
    'vendor_email_subject',
    'couple_email_subject',
    'rules_version',
    'official_rules_url',
    'alternate_free_entry_url',
    'eligibility_region',
    'draw_opens_at',
    'entry_closes_at',
    'draw_at'
  ];
  supplied_key text;
  current_config public.qr_bingo_event_configs%rowtype;
  next_config public.qr_bingo_event_configs%rowtype;
  current_revision bigint := 0;
  next_revision bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service-role authorization is required.';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'Expected revision must be zero or greater.';
  end if;

  if length(coalesce(btrim(p_actor), '')) = 0 or length(btrim(p_actor)) > 200 then
    raise exception using errcode = '22023', message = 'A valid configuration actor is required.';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception using errcode = '22023', message = 'QR Bingo configuration must be a JSON object.';
  end if;

  if not p_config ?& required_keys then
    raise exception using errcode = '22023', message = 'QR Bingo configuration is missing required fields.';
  end if;

  for supplied_key in select jsonb_object_keys(p_config)
  loop
    if not supplied_key = any(required_keys) then
      raise exception using
        errcode = '22023',
        message = format('Unknown QR Bingo configuration field: %s.', supplied_key);
    end if;
  end loop;

  if jsonb_typeof(p_config -> 'vendor_tag_id') <> 'number'
    or (p_config ->> 'vendor_tag_id')::numeric <> trunc((p_config ->> 'vendor_tag_id')::numeric)
  then
    raise exception using errcode = '22023', message = 'vendor_tag_id must be an integer.';
  end if;

  foreach supplied_key in array array[
    'scan_enabled',
    'vendor_draws_enabled',
    'send_vendor_email',
    'send_couple_email'
  ]
  loop
    if jsonb_typeof(p_config -> supplied_key) <> 'boolean' then
      raise exception using
        errcode = '22023',
        message = format('%s must be a boolean.', supplied_key);
    end if;
  end loop;

  foreach supplied_key in array array[
    'event_key',
    'event_name',
    'history_starts_at',
    'email_delivery_mode',
    'vendor_email_subject',
    'couple_email_subject',
    'rules_version',
    'official_rules_url',
    'alternate_free_entry_url',
    'eligibility_region',
    'draw_opens_at',
    'entry_closes_at',
    'draw_at'
  ]
  loop
    if jsonb_typeof(p_config -> supplied_key) <> 'string' then
      raise exception using
        errcode = '22023',
        message = format('%s must be a string.', supplied_key);
    end if;
  end loop;

  -- Serialize all publishers before checking the optimistic revision.
  perform pg_advisory_xact_lock(
    hashtextextended('qr_bingo_event_config_publish', 0)
  );

  select *
    into current_config
    from public.qr_bingo_event_configs
   where published
   order by revision desc
   limit 1
   for update;

  if current_config.id is not null then
    current_revision := current_config.revision;
  end if;

  if current_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'QR Bingo event configuration changed; reload before publishing.',
      detail = format(
        'Expected revision %s but current revision is %s.',
        p_expected_revision,
        current_revision
      );
  end if;

  select coalesce(max(revision), 0) + 1
    into next_revision
    from public.qr_bingo_event_configs;

  if current_config.id is not null then
    update public.qr_bingo_event_configs
       set published = false
     where id = current_config.id;
  end if;

  insert into public.qr_bingo_event_configs (
    event_key,
    revision,
    published,
    event_name,
    vendor_tag_id,
    history_starts_at,
    scan_enabled,
    vendor_draws_enabled,
    email_delivery_mode,
    send_vendor_email,
    send_couple_email,
    vendor_email_subject,
    couple_email_subject,
    rules_version,
    official_rules_url,
    alternate_free_entry_url,
    eligibility_region,
    draw_opens_at,
    entry_closes_at,
    draw_at,
    created_by
  ) values (
    btrim(p_config ->> 'event_key'),
    next_revision,
    true,
    btrim(p_config ->> 'event_name'),
    (p_config ->> 'vendor_tag_id')::integer,
    (p_config ->> 'history_starts_at')::timestamptz,
    (p_config ->> 'scan_enabled')::boolean,
    (p_config ->> 'vendor_draws_enabled')::boolean,
    btrim(p_config ->> 'email_delivery_mode'),
    (p_config ->> 'send_vendor_email')::boolean,
    (p_config ->> 'send_couple_email')::boolean,
    btrim(p_config ->> 'vendor_email_subject'),
    btrim(p_config ->> 'couple_email_subject'),
    btrim(p_config ->> 'rules_version'),
    btrim(p_config ->> 'official_rules_url'),
    btrim(p_config ->> 'alternate_free_entry_url'),
    btrim(p_config ->> 'eligibility_region'),
    (p_config ->> 'draw_opens_at')::timestamptz,
    (p_config ->> 'entry_closes_at')::timestamptz,
    (p_config ->> 'draw_at')::timestamptz,
    btrim(p_actor)
  )
  returning * into next_config;

  insert into public.qr_bingo_event_config_audit (
    event_config_id,
    previous_event_config_id,
    event_key,
    revision,
    expected_revision,
    action,
    actor,
    config_snapshot
  ) values (
    next_config.id,
    current_config.id,
    next_config.event_key,
    next_config.revision,
    p_expected_revision,
    'publish',
    btrim(p_actor),
    to_jsonb(next_config)
  );

  return jsonb_build_object(
    'ok', true,
    'previous_revision', current_revision,
    'config', to_jsonb(next_config)
  );
end;
$function$;

-- require_qr_bingo_rules_version_bump: MD5 3a040f7b14d88554d2a347ae8c82ccad
CREATE OR REPLACE FUNCTION public.require_qr_bingo_rules_version_bump()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  previous_config public.qr_bingo_event_configs%rowtype;
  material_change boolean;
begin
  if not new.published then
    return new;
  end if;

  select config.*
    into previous_config
    from public.qr_bingo_event_configs config
    join public.qr_bingo_event_config_audit audit
      on audit.event_config_id = config.id
   where config.revision < new.revision
   order by config.revision desc
   limit 1;

  if previous_config.id is null then
    if exists (
      select 1
        from public.qr_bingo_event_configs config
       where config.revision < new.revision
    ) then
      raise exception using
        errcode = '55000',
        message = 'QR Bingo event configuration audit history is unavailable; publication is blocked.';
    end if;
    return new;
  end if;

  material_change := row(
    new.event_key,
    new.event_name,
    new.vendor_tag_id,
    new.history_starts_at,
    new.official_rules_url,
    new.alternate_free_entry_url,
    new.eligibility_region,
    new.draw_opens_at,
    new.entry_closes_at,
    new.draw_at
  ) is distinct from row(
    previous_config.event_key,
    previous_config.event_name,
    previous_config.vendor_tag_id,
    previous_config.history_starts_at,
    previous_config.official_rules_url,
    previous_config.alternate_free_entry_url,
    previous_config.eligibility_region,
    previous_config.draw_opens_at,
    previous_config.entry_closes_at,
    previous_config.draw_at
  );

  if material_change and exists (
    select 1
      from public.qr_bingo_event_configs prior
     where prior.rules_version = new.rules_version
  ) then
    raise exception using
      errcode = '22023',
      message = 'Material QR Bingo terms changed; publish a new, previously unused rules_version.';
  end if;

  return new;
end;
$function$;
