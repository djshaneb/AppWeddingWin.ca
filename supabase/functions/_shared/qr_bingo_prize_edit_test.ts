import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseQrBingoPrizeEditStatus } from "./qr_bingo_prize_edit.ts";
const context = {
  event_key: "niagara-wedding-show-2026",
  vendor_bingo_id: "901",
  vendor_bd_user_id: "901",
  event_revision: 16,
};
const response = () => ({
  ...context,
  prize_editable: true,
  prize_details_locked: false,
  prize_details_lock_reason: null,
  prize_edit_deadline_at: "2026-10-18T15:00:00+00:00",
  prize_edit_timezone: "America/Toronto",
});
Deno.test("prize-edit parser accepts the database's exact scoped deadline and permission", () => {
  assertEquals(parseQrBingoPrizeEditStatus(response(), context), {
    prize_editable: true,
    prize_details_locked: false,
    prize_details_lock_reason: null,
    prize_edit_deadline_at: "2026-10-18T15:00:00+00:00",
    prize_edit_timezone: "America/Toronto",
  });
});
Deno.test("prize-edit parser rejects mismatched event, vendor, identity and revision", () => {
  for (
    const patch of [{ event_key: "other" }, { vendor_bingo_id: "902" }, {
      vendor_bd_user_id: "902",
    }, { event_revision: 15 }]
  ) {
    const actual = parseQrBingoPrizeEditStatus(
      { ...response(), ...patch },
      context,
    );
    assertEquals(actual.prize_editable, false);
    assertEquals(actual.prize_details_lock_reason, "unavailable");
  }
});
Deno.test("prize-edit parser preserves each authoritative earlier/email and deadline lock", () => {
  for (const reason of ["sent", "sending", "unconfirmed", "deadline"]) {
    const actual = parseQrBingoPrizeEditStatus({
      ...response(),
      prize_editable: false,
      prize_details_locked: true,
      prize_details_lock_reason: reason,
    }, context);
    assertEquals(actual.prize_editable, false);
    assertEquals(actual.prize_details_lock_reason, reason);
    assertEquals(actual.prize_edit_timezone, "America/Toronto");
  }
});
Deno.test("prize-edit parser fails closed for malformed or contradictory data", () => {
  for (
    const value of [
      null,
      [],
      {},
      "true",
      ...[
        { prize_editable: "true" },
        { prize_details_locked: true },
        { prize_details_lock_reason: "future_unknown" },
        { prize_edit_deadline_at: null },
        { prize_edit_deadline_at: "not-time" },
        { prize_edit_deadline_at: "2026-10-18" },
        { prize_edit_timezone: null },
        { prize_edit_timezone: "invalid/zone" },
      ].map((patch) => ({ ...response(), ...patch })),
    ]
  ) {
    assertEquals(
      parseQrBingoPrizeEditStatus(value, context).prize_editable,
      false,
    );
  }
});
Deno.test("synthetic and unavailable contexts return a locked status without inventing a deadline", () => {
  for (const reason of ["synthetic_fixture", "unavailable"]) {
    const actual = parseQrBingoPrizeEditStatus({
      ...response(),
      event_revision: null,
      prize_editable: false,
      prize_details_locked: true,
      prize_details_lock_reason: reason,
      prize_edit_deadline_at: null,
      prize_edit_timezone: null,
    }, context);
    assertEquals(actual.prize_editable, false);
    assertEquals(actual.prize_details_lock_reason, reason);
    assertEquals(actual.prize_edit_deadline_at, null);
  }
});
Deno.test("both authenticated QR endpoints use authoritative status for the dashboard and save", async () => {
  for (const endpoint of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
    const source = await Deno.readTextFile(
      new URL(`../${endpoint}/index.ts`, import.meta.url),
    );
    assert(source.includes('"qr_bingo_prize_edit_status"'));
    assert(source.includes("...prizeEditStatus,"));
    assert(
      source.includes(
        "prizeChanged && !(await vendorPrizeEditStatus(vendor, raffleEventKey)).prize_editable",
      ),
    );
    assert(
      source.includes('String(error.message).includes("prize_edit_closed:")'),
    );
    assert(
      !source.includes(
        "You can still edit prize details until the winner email is sent.",
      ),
    );
  }
});

Deno.test("QR mirror preserves its vendor default action and diagnostic identity", async () => {
  const couple = await Deno.readTextFile(new URL("../bd-qr-bingo-sync/index.ts", import.meta.url));
  const vendor = await Deno.readTextFile(new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url));
  assert(couple.includes('String(body?.action || "list")'));
  assert(vendor.includes('String(body?.action || "vendor_raffle_get")'));
  assert(vendor.includes('console.error("bd-qr-bingo-vendor-sync request failed", failure)'));
  assert(vendor.includes('error: "QR Bingo vendor sync unavailable"'));
  assertEquals(vendor.replace('String(body?.action || "vendor_raffle_get")', 'String(body?.action || "list")')
    .replace('"bd-qr-bingo-vendor-sync request failed"', '"bd-qr-bingo-sync request failed"')
    .replace('"QR Bingo vendor sync unavailable"', '"QR Bingo sync unavailable"'), couple);
});
