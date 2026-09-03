-- Keep immutable historical revisions nullable, but guarantee that every
-- newly inserted revision receives a parser-safe venue. Legacy publishers do
-- not know about venue_name, so a neutral placeholder is the backward-
-- compatible fallback until an administrator publishes the actual venue.

create or replace function public.apply_qr_bingo_app_card_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.apply_qr_bingo_app_card_controls()
  from public, anon, authenticated, service_role;

alter table public.qr_bingo_event_configs
  drop constraint if exists qr_bingo_event_configs_published_venue_present;
alter table public.qr_bingo_event_configs
  add constraint qr_bingo_event_configs_published_venue_present
  check (not published or venue_name is not null);

comment on column public.qr_bingo_event_configs.venue_name is
  'Plain-text native app venue label. Immutable historical rows may be null; every newly inserted revision receives an inherited, explicit, or placeholder value.';

notify pgrst, 'reload schema';
