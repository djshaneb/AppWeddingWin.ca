-- Add app-card presentation controls without rewriting immutable event history.
-- Historical revisions may retain a null venue; every future publication
-- inherits the prior controls unless the service-only publish wrapper supplies
-- replacements. The resulting published row is captured by the existing audit.

alter table public.qr_bingo_event_configs
  add column if not exists venue_name text;

alter table public.qr_bingo_event_configs
  add column if not exists app_card_enabled boolean not null default true;

alter table public.qr_bingo_event_configs
  drop constraint if exists qr_bingo_event_configs_venue_name_plain_text;
alter table public.qr_bingo_event_configs
  add constraint qr_bingo_event_configs_venue_name_plain_text
  check (
    venue_name is null
    or (
      venue_name = btrim(venue_name)
      and btrim(venue_name) <> ''
      and char_length(venue_name) <= 160
      and venue_name !~ '[<>]'
      and venue_name !~ '[[:cntrl:]]'
    )
  );

comment on column public.qr_bingo_event_configs.venue_name is
  'Plain-text venue label shown on the native QR Bingo app card. Historical revisions may be null.';
comment on column public.qr_bingo_event_configs.app_card_enabled is
  'Whether the native QR Bingo app card is currently available for interaction.';

-- The locked publisher predates these columns and intentionally remains
-- byte-for-byte unchanged. This insert trigger carries explicit values from
-- the short wrapper, or clones the latest revision for legacy callers.
create or replace function public.apply_qr_bingo_app_card_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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
$$;

revoke all on function public.apply_qr_bingo_app_card_controls()
  from public, anon, authenticated, service_role;

drop trigger if exists apply_qr_bingo_app_card_controls
  on public.qr_bingo_event_configs;
create trigger apply_qr_bingo_app_card_controls
before insert on public.qr_bingo_event_configs
for each row execute function public.apply_qr_bingo_app_card_controls();

-- Keep the original locked publisher unchanged. The public service-only
-- wrapper validates and removes the two new keys, then hands them to the
-- insert trigger while the locked function performs its existing transaction.
create or replace function public.publish_qr_bingo_event_config(
  p_expected_revision bigint,
  p_config jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.publish_qr_bingo_event_config(bigint, jsonb, text)
  to service_role;

-- Publish one new audited current revision for the native app card. Every
-- previously configured event, schedule, legal, email, and availability field
-- is cloned exactly from the current revision.
do $$
declare
  migration_actor constant text := 'migration:20260902071500';
  target_event_key constant text := 'niagara-wedding-show-2026';
  target_venue_name constant text := 'Americana Resort';
  published_count integer;
  current_config public.qr_bingo_event_configs%rowtype;
  next_config public.qr_bingo_event_configs%rowtype;
  next_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qr_bingo_event_config_publish', 0)
  );

  select count(*)
    into published_count
    from public.qr_bingo_event_configs config
   where config.published;

  if published_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo app-card publication requires exactly one current published configuration.';
  end if;

  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
   for update;

  if current_config.event_key is distinct from target_event_key then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo app-card publication found an unexpected published event.';
  end if;

  if current_config.venue_name = target_venue_name
    and current_config.app_card_enabled
  then
    return;
  end if;

  select coalesce(max(config.revision), 0) + 1
    into next_revision
    from public.qr_bingo_event_configs config;

  perform pg_catalog.set_config(
    'weddingwin.qr_bingo_app_card_controls',
    jsonb_build_object(
      'venue_name', target_venue_name,
      'app_card_enabled', true
    )::text,
    true
  );

  update public.qr_bingo_event_configs
     set published = false
   where id = current_config.id;

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
    current_config.event_key,
    next_revision,
    true,
    current_config.event_name,
    current_config.vendor_tag_id,
    current_config.history_starts_at,
    current_config.scan_enabled,
    current_config.vendor_draws_enabled,
    current_config.email_delivery_mode,
    current_config.send_vendor_email,
    current_config.send_couple_email,
    current_config.vendor_email_subject,
    current_config.couple_email_subject,
    current_config.rules_version,
    current_config.official_rules_url,
    current_config.alternate_free_entry_url,
    current_config.eligibility_region,
    current_config.draw_opens_at,
    current_config.entry_closes_at,
    current_config.draw_at,
    migration_actor
  )
  returning * into next_config;

  if next_config.venue_name is distinct from target_venue_name
    or not next_config.app_card_enabled
    or (
      to_jsonb(next_config) - array[
        'id',
        'revision',
        'venue_name',
        'app_card_enabled',
        'created_at',
        'created_by'
      ]
    ) is distinct from (
      to_jsonb(current_config) - array[
        'id',
        'revision',
        'venue_name',
        'app_card_enabled',
        'created_at',
        'created_by'
      ]
    )
  then
    raise exception using
      errcode = '55000',
      message = 'QR Bingo app-card publication changed an existing event field.';
  end if;

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
    current_config.revision,
    'publish',
    migration_actor,
    to_jsonb(next_config)
  );
end;
$$;

notify pgrst, 'reload schema';
