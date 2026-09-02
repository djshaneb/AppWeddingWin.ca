function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("offer trigger isolates fixture terms without weakening production", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260830150000_allow_isolated_fixture_offer_snapshots.sql",
      import.meta.url,
    ),
  );
  const stampMigration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260830160000_stamp_isolated_fixture_early_draw_offers.sql",
      import.meta.url,
    ),
  );

  for (
    const required of [
      "fixture.event_key = new.event_key",
      "fixture.vendor_bingo_id = new.vendor_bingo_id",
      "fixture.vendor_bd_user_id = new.vendor_bd_user_id",
      "fixture.enabled",
      "fixture.expires_at > clock_timestamp()",
      "new.event_key <> event_config.event_key",
      "fixture_allows_early_draw or new.draw_opens_at >= new.entry_closes_at",
      "new.draw_at >= new.entry_closes_at",
      "new.draw_at >= new.draw_opens_at",
      "new.alternate_free_entry_url ~* '^https://[^[:space:]]+$'",
      "new.alternate_free_entry_url is not distinct from event_config.alternate_free_entry_url",
      "new.eligibility_region is not distinct from event_config.eligibility_region",
      "new.entry_closes_at is not distinct from event_config.entry_closes_at",
      "new.draw_opens_at is not distinct from event_config.draw_opens_at",
      "new.draw_at is not distinct from event_config.draw_at",
    ]
  ) {
    assert(migration.includes(required), `missing trigger guard: ${required}`);
  }

  assert(
    migration.includes("insert into public.qr_bingo_vendor_offer_versions") &&
      migration.includes("structurally_enterable"),
    "the replacement trigger must continue creating immutable offer snapshots",
  );

  for (
    const required of [
      "add column if not exists isolated_fixture_early_draw boolean not null default false",
      "new.isolated_fixture_early_draw := false",
      "new.offer_enterable",
      "new.draw_opens_at < new.entry_closes_at",
      "not exists (",
      "config.published",
      "config.event_key = new.event_key",
      "fixture.event_key = new.event_key",
      "fixture.vendor_bingo_id = new.vendor_bingo_id",
      "fixture.vendor_bd_user_id = new.vendor_bd_user_id",
      "fixture.enabled",
      "fixture.allow_early_draw",
      "fixture.expires_at > clock_timestamp()",
      "before insert on public.qr_bingo_vendor_offer_versions",
      "draw_opens_at >= entry_closes_at or isolated_fixture_early_draw",
    ]
  ) {
    assert(
      stampMigration.includes(required),
      `missing fixture stamp guard: ${required}`,
    );
  }
});
