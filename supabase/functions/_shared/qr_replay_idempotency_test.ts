function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function functionBody(source: string, functionName: string) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const open = source.indexOf("{", start);
  if (open < 0) throw new Error(`Missing body for ${functionName}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated body for ${functionName}`);
}

Deno.test("controlled QR scan replay preserves the original scan row", async () => {
  const sync = await Deno.readTextFile(
    new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  );
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260828162602_add_qr_bingo_official_rules_audit.sql",
      import.meta.url,
    ),
  );
  const saveFixtureScan = functionBody(sync, "saveAppReviewFixtureScan");

  assert(
    saveFixtureScan.includes("ignoreDuplicates: true") &&
      saveFixtureScan.includes(
        'onConflict: "fixture_id,couple_bd_user_id,vendor_bingo_id"',
      ),
    "fixture scan writes must ignore the existing unique row instead of updating it",
  );
  assert(
    !saveFixtureScan.includes("scanned_at:") &&
      saveFixtureScan.includes("vendor_bingo_id: fixture.vendor_bingo_id"),
    "a replay must preserve the database-default timestamp from the first scan",
  );
  assert(
    /constraint app_review_raffle_fixture_scans_unique[\s\S]*unique \(fixture_id, couple_bd_user_id, vendor_bingo_id\)/i
      .test(migration),
    "the insert-or-ignore conflict target must be protected by a unique constraint",
  );
});

Deno.test("the app returns from its duplicate branch before saving", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const match = app.indexOf(
    "const matched = matchQrBingoVendor(value, vendors)",
  );
  const duplicate = app.indexOf(
    "if (scannedVendorIds.has(matched.id))",
    match,
  );
  const save = app.indexOf(
    "const saved = await saveBingoScan(matched)",
    duplicate,
  );

  assert(
    match >= 0 && duplicate > match && save > duplicate,
    "an already-scanned match must return before the app calls the scan endpoint",
  );
});
