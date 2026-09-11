import { qrBingoScannerOpensAt, qrBingoScannerWindowOpen, qrBingoScanHistoryStartsAt, qrBingoInShowScannedIds } from "./qr_bingo_scan_schedule.ts";
import { parseQrBingoEventConfig, publicQrBingoEventConfig } from "./qr_bingo_config.ts";

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const config = {
  history_starts_at: "2026-10-18T15:00:00Z",
  entry_closes_at: "2026-10-18T19:00:00Z",
  scan_enabled: true,
  scan_open_early: false,
};

Deno.test("early Bingo progress is never upgraded into draw proof", () => {
  const scanned = ["early", "show"];
  for (const untrusted of [undefined, {}, { scanned }, { status: "error", in_show_scanned: scanned }]) {
    equal(JSON.stringify(qrBingoInShowScannedIds(untrusted, scanned)), "[]");
  }
  equal(JSON.stringify(qrBingoInShowScannedIds({
    status: "success", in_show_scanned: ["show", "show", "unknown", 12, null],
  }, scanned)), '["show"]');
});

Deno.test("both Edge endpoints require trusted qualifying scan evidence for draw offers and entries", async () => {
  for (const name of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
    const source = await Deno.readTextFile(new URL("../" + name + "/index.ts", import.meta.url));
    equal((source.match(/if \(!vendorDrawScanned.includes\(vendor.id\)\)/g) || []).length, 2);
    equal(source.includes("progress.vendorDrawScanned.includes(matchedVendor.id)"), true);
    equal(source.includes("in_show_scanned: inShowScanned"), true);
    equal(source.includes("if (!qrBingoScannerWindowOpen(qrBingoConfig()))"), true);
  }
});

Deno.test("scanner opens at Toronto midnight, including winter and DST boundaries", () => {
  for (const [show, opening] of [
    [config.history_starts_at, "2026-10-18T04:00:00.000Z"],
    ["2027-01-10T16:00:00Z", "2027-01-10T05:00:00.000Z"],
    ["2026-03-08T15:00:00Z", "2026-03-08T05:00:00.000Z"],
    ["2026-11-01T16:00:00Z", "2026-11-01T04:00:00.000Z"],
    // UTC's next date is still the previous show day in Toronto.
    ["2026-10-19T01:00:00Z", "2026-10-18T04:00:00.000Z"],
  ]) equal(qrBingoScannerOpensAt(show), opening);
});

Deno.test("scheduled scanner includes midnight and excludes the closing instant", () => {
  equal(qrBingoScannerWindowOpen(config, Date.parse("2026-10-18T03:59:59.999Z")), false);
  equal(qrBingoScannerWindowOpen(config, Date.parse("2026-10-18T04:00:00Z")), true);
  equal(qrBingoScannerWindowOpen(config, Date.parse("2026-10-18T18:59:59.999Z")), true);
  equal(qrBingoScannerWindowOpen(config, Date.parse(config.entry_closes_at)), false);
});

Deno.test("early toggle opens before the day but never bypasses pause or closing", () => {
  const early = { ...config, scan_open_early: true };
  equal(qrBingoScannerWindowOpen(early, Date.parse("2026-09-08T18:00:00Z")), true);
  equal(qrBingoScannerWindowOpen({ ...early, scan_enabled: false }, Date.parse("2026-09-08T18:00:00Z")), false);
  equal(qrBingoScannerWindowOpen(early, Date.parse(config.entry_closes_at)), false);
  equal(qrBingoScannerWindowOpen(early, Date.parse("2027-01-01T00:00:00Z")), false);
  equal(qrBingoScannerWindowOpen(early, NaN), false);
  equal(qrBingoScannerWindowOpen({ ...config, scan_open_early: "true" as unknown as boolean }, Date.parse("2026-09-08T18:00:00Z")), false);
});

Deno.test("early scan history survives switching off without exposing older visits", () => {
  const start = "2026-09-08T18:00:00Z";
  equal(qrBingoScanHistoryStartsAt(config), "2026-10-18T04:00:00.000Z");
  for (const enabled of [true, false]) equal(qrBingoScanHistoryStartsAt({
    ...config, scan_open_early: enabled, scan_early_access_starts_at: start,
  }), "2026-09-08T18:00:00.000Z");
  equal(qrBingoScanHistoryStartsAt({ ...config, scan_early_access_starts_at: "2026-10-18T16:00:00Z" }), "2026-10-18T04:00:00.000Z");
});

const row = {
  ...config, id: "test", event_key: "test", revision: 1, published: true,
  event_name: "Niagara Wedding Show", venue_name: "Americana Resort", vendor_tag_id: 30,
  app_card_enabled: true, vendor_draws_enabled: true, email_delivery_mode: "disabled",
  send_vendor_email: true, send_couple_email: true, vendor_email_subject: "Vendor", couple_email_subject: "Couple",
  rules_version: "test", official_rules_url: "https://www.weddingwin.ca/qr-bingo-terms",
  alternate_free_entry_url: "https://www.weddingwin.ca/qr", eligibility_region: "Ontario",
  draw_opens_at: config.entry_closes_at, draw_at: config.entry_closes_at,
};

Deno.test("public config exposes scanner schedule without changing show or draw times", () => {
  const dto = publicQrBingoEventConfig(parseQrBingoEventConfig(row));
  equal(dto.scan_opens_at, "2026-10-18T04:00:00.000Z");
  equal(dto.scan_history_starts_at, dto.scan_opens_at);
  equal(dto.scan_open_early, false);
  equal(dto.scan_early_access_starts_at, null);
  equal(dto.history_starts_at, row.history_starts_at);
  equal(dto.draw_at, row.draw_at);
  equal(dto.entry_closes_at, row.entry_closes_at);
  equal("created_by" in dto, false);
});

Deno.test("invalid present early control fails closed and old rows default off", () => {
  for (const bad of [null, "true", 1, {}, []]) {
    let rejected = false;
    try { parseQrBingoEventConfig({ ...row, scan_open_early: bad }); } catch { rejected = true; }
    equal(rejected, true);
  }
  for (const bad of ["invalid-date", "", {}]) {
    let rejected = false;
    try { parseQrBingoEventConfig({ ...row, scan_early_access_starts_at: bad }); } catch { rejected = true; }
    equal(rejected, true);
  }
  const { scan_open_early: _omitted, ...legacy } = row;
  equal(parseQrBingoEventConfig(legacy).scan_open_early, false);
});
