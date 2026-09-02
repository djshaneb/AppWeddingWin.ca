function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const migrationUrl = new URL(
  "../../migrations/20260830130000_fix_qr_bingo_rules_trigger_dispatch.sql",
  import.meta.url,
);

Deno.test("shared QR Bingo rules trigger dispatches before reading entry-only fields", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  assert(
    sql.includes("to_jsonb(new) ->> 'vendor_offer_version'") &&
      sql.includes("submitted_offer_version is not null") &&
      sql.includes("version.vendor_offer_version = submitted_offer_version"),
    "the shared trigger must read the optional entry offer version safely",
  );
  assert(
    !/new\.vendor_offer_version/i.test(sql),
    "the shared trigger must not dereference an entry-only field on settings or grand-prize rows",
  );
  for (
    const tableName of [
      "qr_bingo_raffle_settings",
      "qr_bingo_raffle_entries",
      "qr_bingo_grand_prize_entries",
    ]
  ) {
    assert(sql.includes(tableName), `rules trigger is missing ${tableName}`);
  }
});
