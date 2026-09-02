-- Publish the exact in-person QR Bingo rules cutover in a reproducible,
-- idempotent transaction. The existing publish lock and insert triggers remain
-- authoritative: this migration only clones the current Niagara revision and
-- changes its rules version and published show opening timestamp.

do $$
declare
  migration_actor constant text := 'migration:20260901074000';
  target_event_key constant text := 'niagara-wedding-show-2026';
  previous_rules_version constant text := '2026-09-01-vendor-marketing';
  target_rules_version constant text := '2026-09-01-in-person-entry';
  target_history_starts_at constant timestamptz :=
    timestamptz '2026-10-18 15:00:00+00';
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
      message = 'In-person QR Bingo publication requires exactly one current published configuration.';
  end if;

  select config.*
    into current_config
    from public.qr_bingo_event_configs config
   where config.published
   for update;

  if current_config.event_key is distinct from target_event_key then
    raise exception using
      errcode = '55000',
      message = 'In-person QR Bingo publication found an unexpected published event.';
  end if;

  if current_config.rules_version = target_rules_version
    and current_config.history_starts_at = target_history_starts_at
  then
    return;
  end if;

  if current_config.rules_version is distinct from previous_rules_version then
    raise exception using
      errcode = '55000',
      message = 'In-person QR Bingo publication found an unexpected current rules version.';
  end if;

  select coalesce(max(config.revision), 0) + 1
    into next_revision
    from public.qr_bingo_event_configs config;

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
    target_history_starts_at,
    current_config.scan_enabled,
    current_config.vendor_draws_enabled,
    current_config.email_delivery_mode,
    current_config.send_vendor_email,
    current_config.send_couple_email,
    current_config.vendor_email_subject,
    current_config.couple_email_subject,
    target_rules_version,
    current_config.official_rules_url,
    current_config.alternate_free_entry_url,
    current_config.eligibility_region,
    current_config.draw_opens_at,
    current_config.entry_closes_at,
    current_config.draw_at,
    migration_actor
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
    current_config.revision,
    'publish',
    migration_actor,
    to_jsonb(next_config)
  );
end;
$$;
