import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadQrBingoDrawResult,
  type QrBingoDrawResult,
  QrBingoDrawResultError,
} from "./qr_bingo_draw_result.ts";
const id = "00000000-0000-4000-8000-000000000001";
const result: QrBingoDrawResult = {
  draw_id: id,
  event_key: "show",
  viewer_role: "couple",
  vendor_id: "102",
  vendor_name: "Vendor",
  prize_title: "Prize",
  prize_description: "Description",
  prize_approx_value_cad: 100,
  claim_instructions: "Contact the vendor",
  official_rules_url: "https://www.weddingwin.ca/rules",
  drawn_at: "2026-09-01T12:00:00Z",
  notice_sent_at: "2026-09-01T13:00:00Z",
  apple_non_sponsor_disclaimer: "Apple is not a sponsor",
};
Deno.test("result binds authenticated member and exact draw, returns only permitted DTO", async () => {
  let args;
  const value = await loadQrBingoDrawResult(
    {
      rpc: (_n: string, a: unknown) => {
        args = a;
        return { data: { ...result, winner_email: "private@example.test" } };
      },
    },
    "101",
    id,
  );
  assertEquals(args, { p_member_id: "101", p_draw_id: id });
  assertEquals(value, result);
});
Deno.test("missing foreign unverified and obsolete results are permanent unavailable", async () => {
  for (
    const reason of ["missing", "foreign", "unverified", "obsolete", "isolated"]
  ) {
    const e = await assertRejects(
      () => loadQrBingoDrawResult({ rpc: () => ({ data: null }) }, "101", id),
      QrBingoDrawResultError,
    );
    assertEquals(e.status, 404, reason);
  }
});
Deno.test("invalid draw and invalid principal never reach database", async () => {
  let calls = 0;
  const db = {
    rpc: () => {
      calls++;
      return { data: result };
    },
  };
  assertEquals(
    (await assertRejects(
      () => loadQrBingoDrawResult(db, "101", "bad"),
      QrBingoDrawResultError,
    )).status,
    400,
  );
  assertEquals(
    (await assertRejects(
      () => loadQrBingoDrawResult(db, "other", id),
      QrBingoDrawResultError,
    )).status,
    401,
  );
  assertEquals(calls, 0);
});
Deno.test("lookup failure and malformed response are transient fail-closed", async () => {
  for (
    const db of [
      { rpc: () => Promise.reject(new Error("database")) },
      { rpc: () => ({ error: { message: "database" } }) },
      { rpc: () => ({ data: { ...result, draw_id: "wrong" } }) },
      { rpc: () => ({ data: { ...result, prize_approx_value_cad: "100" } }) },
    ]
  ) {
    assertEquals(
      (await assertRejects(
        () => loadQrBingoDrawResult(db, "101", id),
        QrBingoDrawResultError,
      )).status,
      503,
    );
  }
});
Deno.test("draw result read needs no current show date or scanner state", async () => {
  assertEquals(
    (await loadQrBingoDrawResult(
      { rpc: () => ({ data: { ...result, viewer_role: "vendor" } }) },
      "102",
      id,
    )).viewer_role,
    "vendor",
  );
});
