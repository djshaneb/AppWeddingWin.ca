import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleQrAdminDrawReset,
  parseQrAdminDrawReset,
  QrAdminDrawResetError,
} from "./qr_bingo_admin_draw_reset.ts";

const request = {
  action: "draw_reset",
  dataset: "winners",
  event_key: "offline-admin-test",
  vendor_id: "901",
  draw_id: "00000000-0000-4000-8000-000000000001",
  expected_generation: 2,
  request_id: "00000000-0000-4000-8000-000000000002",
  operator_identity: "Offline Admin",
  reason: "Restart the vendor draw.",
};
const success = {
  ok: true,
  action: request.action,
  dataset: request.dataset,
  event_key: request.event_key,
  vendor_id: request.vendor_id,
  draw_id: request.draw_id,
  request_id: request.request_id,
  from_generation: 2,
  to_generation: 3,
  replayed: false,
};
function database(data: unknown, error: unknown = null) {
  const calls: unknown[] = [];
  return {
    calls,
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data, error };
    },
  };
}

Deno.test("draw reset accepts exact identifiers and preserves the operator reason and request UUID", () => {
  assertEquals(parseQrAdminDrawReset(request), request);
  assertEquals(
    parseQrAdminDrawReset({
      ...request,
      reason: "abc",
      vendor_id: "9".repeat(18),
    }).reason,
    "abc",
  );
  assertEquals(
    parseQrAdminDrawReset({
      ...request,
      reason: "a".repeat(500),
      draw_id: "00000000-0000-0000-0000-000000000001",
    }).reason.length,
    500,
  );
});

Deno.test("draw reset rejects spoofed controls malformed scopes and unsafe generations before RPC", async () => {
  for (
    const patch of [
      { action: "data" },
      { dataset: "contacts" },
      { active: true },
      { force: true },
      { draw_generation: 2 },
      { event_key: "wrong/event" },
      { vendor_id: "0" },
      { vendor_id: "9".repeat(19) },
      { draw_id: "wrong" },
      { request_id: "00000000-0000-4000-8000-00000000000A" },
      { expected_generation: "2" },
      { expected_generation: -1 },
      { expected_generation: 0.5 },
      { expected_generation: Number.MAX_SAFE_INTEGER },
      { reason: "ab" },
      { reason: "a".repeat(501) },
      { reason: " reason " },
      { reason: "hello\nworld" },
      { operator_identity: "<admin>" },
      { operator_identity: "a".repeat(161) },
    ]
  ) {
    assertThrows(
      () => parseQrAdminDrawReset({ ...request, ...patch }),
      QrAdminDrawResetError,
    );
    const db = database(success);
    await assertRejects(
      () => handleQrAdminDrawReset(db, { ...request, ...patch }),
      QrAdminDrawResetError,
    );
    assertEquals(db.calls, []);
  }
});

Deno.test("draw reset calls only the atomic reset RPC and returns a whitelisted confirmed success", async () => {
  for (const replayed of [false, true]) {
    const db = database({
      ...success,
      replayed,
      private_row: { email: "hidden@example.test" },
    });
    const result = await handleQrAdminDrawReset(db, request);
    assertEquals(db.calls, [{
      name: "admin_reset_qr_bingo_vendor_draw",
      args: {
        p_event_key: request.event_key,
        p_vendor_id: request.vendor_id,
        p_draw_id: request.draw_id,
        p_expected_generation: 2,
        p_request_id: request.request_id,
        p_operator_identity: request.operator_identity,
        p_reason: request.reason,
      },
    }]);
    assertEquals(result.ok, true);
    assertEquals(result.replayed, replayed);
    assertEquals(Object.hasOwn(result, "private_row"), false);
  }
});

Deno.test("draw reset maps recoverable conflicts without leaking database internals", async () => {
  for (
    const code of [
      "draw_not_found",
      "draw_not_current",
      "draw_not_active",
      "draw_generation_conflict",
      "draw_reset_request_conflict",
      "draw_delivery_in_progress",
      "draw_delivery_uncertain",
      "event_unavailable",
    ]
  ) {
    const error = await assertRejects(
      () =>
        handleQrAdminDrawReset(
          database({
            ok: false,
            code,
            current_generation: 3,
            error: "private diagnostics",
          }),
          request,
        ),
      QrAdminDrawResetError,
    );
    assertEquals(error.status, code === "draw_not_found" ? 404 : 409);
    assertEquals(error.code, code);
    assertEquals(error.current_generation, 3);
    assertEquals(error.message.includes("private diagnostics"), false);
  }
});

Deno.test("draw reset fails closed on unavailable or uncertain database responses", async () => {
  for (
    const db of [
      database(null),
      database({ ok: false }),
      database(success, { message: "private diagnostics" }),
      {
        rpc: () => {
          throw new Error("private diagnostics");
        },
      },
    ]
  ) {
    const error = await assertRejects(
      () => handleQrAdminDrawReset(db, request),
      QrAdminDrawResetError,
    );
    assertEquals(error.status, 503);
    assertEquals(error.message.includes("private diagnostics"), false);
  }
});

Deno.test("draw reset never acknowledges a mismatched scope generation or replay result", async () => {
  for (
    const patch of [
      { action: "data" },
      { dataset: "contacts" },
      { event_key: "other" },
      { vendor_id: "902" },
      { draw_id: request.request_id },
      { request_id: request.draw_id },
      { from_generation: 1 },
      { to_generation: 4 },
      { replayed: "true" },
    ]
  ) {
    const error = await assertRejects(
      () => handleQrAdminDrawReset(database({ ...success, ...patch }), request),
      QrAdminDrawResetError,
    );
    assertEquals(error.status, 503);
    assertEquals(error.code, "draw_reset_result_unconfirmed");
  }
});
