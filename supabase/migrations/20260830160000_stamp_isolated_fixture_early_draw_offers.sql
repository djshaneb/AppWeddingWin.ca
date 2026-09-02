-- The immutable offer table normally requires selection to open only after
-- entries close. Controlled App Review/email fixtures may explicitly allow an
-- earlier selection so reviewers do not have to wait for the live event. The
-- exception is stamped by a database trigger from an exact active fixture;
-- clients and service-role callers cannot set it by supplying an event prefix.

alter table public.qr_bingo_vendor_offer_versions
  add column if not exists isolated_fixture_early_draw boolean not null default false;

create or replace function public.stamp_qr_bingo_isolated_fixture_early_draw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.isolated_fixture_early_draw := false;

  if new.offer_enterable
    and new.draw_opens_at < new.entry_closes_at
    and not exists (
      select 1
        from public.qr_bingo_event_configs config
       where config.published
         and config.event_key = new.event_key
    )
    and (
      exists (
        select 1
          from public.app_review_raffle_fixtures fixture
         where fixture.event_key = new.event_key
           and fixture.vendor_bingo_id = new.vendor_bingo_id
           and fixture.vendor_bd_user_id = new.vendor_bd_user_id
           and fixture.enabled
           and fixture.allow_early_draw
           and fixture.expires_at > clock_timestamp()
      )
      or exists (
        select 1
          from public.qr_bingo_email_test_fixtures fixture
         where fixture.event_key = new.event_key
           and fixture.vendor_bingo_id = new.vendor_bingo_id
           and fixture.vendor_bd_user_id = new.vendor_bd_user_id
           and fixture.enabled
           and fixture.allow_early_draw
           and fixture.expires_at > clock_timestamp()
      )
    )
  then
    new.isolated_fixture_early_draw := true;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_qr_bingo_isolated_fixture_early_draw()
  from public, anon, authenticated, service_role;

drop trigger if exists stamp_qr_bingo_isolated_fixture_early_draw
  on public.qr_bingo_vendor_offer_versions;
create trigger stamp_qr_bingo_isolated_fixture_early_draw
before insert on public.qr_bingo_vendor_offer_versions
for each row execute function public.stamp_qr_bingo_isolated_fixture_early_draw();

alter table public.qr_bingo_vendor_offer_versions
  drop constraint if exists qr_bingo_vendor_offer_version_enterable_complete;
alter table public.qr_bingo_vendor_offer_versions
  add constraint qr_bingo_vendor_offer_version_enterable_complete check (
    not offer_enterable or (
      enabled
      and legal_terms_accepted
      and legal_terms_accepted_at is not null
      and rules_viewed_at is not null
      and apple_non_sponsor_acknowledged
      and vendor_responsibility_acknowledged
      and vendor_responsibility_acknowledged_at is not null
      and btrim(vendor_responsibility_disclosure_text) <> ''
      and btrim(participant_responsibility_disclosure_text) <> ''
      and vendor_responsibility_version = rules_version
      and btrim(prize_title) <> ''
      and btrim(prize_description) <> ''
      and prize_approx_value_cad > 0
      and btrim(eligibility_region) <> ''
      and history_starts_at is not null
      and entry_closes_at is not null
      and draw_opens_at is not null
      and draw_at is not null
      and (draw_opens_at >= entry_closes_at or isolated_fixture_early_draw)
      and draw_at >= draw_opens_at
      and btrim(odds_basis) <> ''
      and no_purchase_required
      and skill_testing_question_required
      and official_rules_url ~ '^https://'
      and alternate_free_entry_url ~ '^https://'
    )
  );

comment on column public.qr_bingo_vendor_offer_versions.isolated_fixture_early_draw is
  'Database-stamped only when an exact enabled, unexpired isolated fixture authorizes early draw testing.';
