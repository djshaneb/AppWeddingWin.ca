import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleQrAdminCardReset,
  handleQrAdminCardResetCutoffs,
  QrAdminCardResetError,
} from "./qr_bingo_admin_card_reset.ts";
import {
  assertQrBingoCardGeneration,
  loadQrBingoCardState,
  parseQrBingoCardState,
  QrBingoCardStateError,
} from "./qr_bingo_card_state.ts";
const scope = { event_key: "offline-card-reset", couple_id: "701" };
const state = { ...scope, generation: 0, scan_reset_after: null };
const cutoff = "2026-09-11T23:00:00Z";
const previewRequest = {
  action: "card_reset_preview",
  dataset: "scans",
  ...scope,
  verified_couple: { id: "701", active: "2", subscription_id: "18" },
};
const preview = {
  ok: true,
  ...previewRequest,
  verified_couple: undefined,
  card_state: state,
  expected_generation: 0,
  preview_token: "a".repeat(64),
  entry_count: 2,
  can_reset: true,
  reset_block_reason: "",
};
const request = {
  ...previewRequest,
  action: "card_reset",
  expected_generation: 0,
  preview_token: preview.preview_token,
  request_id: "00000000-0000-4000-8000-000000000001",
  operator_identity: "Offline Admin",
  reason: "Clear the selected couple card",
  website_scan_lock_held: true,
  website_scan_reset_at: cutoff,
};
const success = {
  ok: true,
  action: "card_reset",
  dataset: "scans",
  ...scope,
  request_id: request.request_id,
  from_generation: 0,
  to_generation: 1,
  scan_reset_after: cutoff,
  entry_count: 2,
  replayed: false,
};
function db(data: unknown, error: unknown = null) {
  const calls: any[] = [];
  return {
    calls,
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data, error };
    },
  };
}

Deno.test("card preview accepts exact active couple plans4 and18 and empty entry sets", async () => {
  for (const plan of ["4", "18"]) {
    const database = db({ ...preview, entry_count: 0 });
    const result = await handleQrAdminCardReset(database, {
      ...previewRequest,
      verified_couple: { id: "701", active: "2", subscription_id: plan },
    });
    assertEquals(result.can_reset, true);
    assertEquals(result.entry_count, 0);
    assertEquals(database.calls, [{
      name: "qr_bingo_card_reset_snapshot",
      args: { p_event_key: scope.event_key, p_couple_id: "701" },
    }]);
  }
});
Deno.test("card preview preserves delivery blocker without calling mutation", async () => {
  const database = db({
    ...preview,
    can_reset: false,
    reset_block_reason: "draw_delivery_uncertain",
  });
  const result = await handleQrAdminCardReset(database, previewRequest);
  assertEquals(result.can_reset, false);
  assertEquals(result.reset_block_code, "draw_delivery_uncertain");
  assertEquals(
    result.reset_block_reason,
    "An email outcome needs administrator reconciliation before this card can be reset.",
  );
  assertEquals(database.calls.length, 1);
});
Deno.test("card reset rejects vendor inactive mismatched or forged account proof before database", async () => {
  for (
    const verified_couple of [
      null,
      { id: "701", active: "2", subscription_id: "28" },
      { id: "701", active: "1", subscription_id: "18" },
      { id: "702", active: "2", subscription_id: "18" },
      { ...request.verified_couple, role: "admin" },
    ]
  ) {
    const database = db(success);
    await assertRejects(
      () => handleQrAdminCardReset(database, { ...request, verified_couple }),
      QrAdminCardResetError,
    );
    assertEquals(database.calls.length, 0);
  }
});
Deno.test("card reset rejects missing lock and client authority extra fields", async () => {
  for (
    const patch of [
      { website_scan_lock_held: false },
      { website_scan_lock_held: undefined },
      { force: true },
      { scan_count: 4 },
      { scan_preview_token: "a".repeat(64) },
      { entry_ids: ["fake"] },
      { can_reset: true },
    ]
  ) {
    const database = db(success);
    await assertRejects(
      () => handleQrAdminCardReset(database, { ...request, ...patch }),
      QrAdminCardResetError,
    );
    assertEquals(database.calls.length, 0);
  }
});
Deno.test("card reset requires exact scope generation preview UUID operator reason and first-attempt cutoff", async () => {
  for (
    const patch of [
      { couple_id: "0" },
      { event_key: "another/event" },
      { expected_generation: -1 },
      { expected_generation: "0" },
      { expected_generation: 0.5 },
      { expected_generation: Number.MAX_SAFE_INTEGER },
      { preview_token: "x".repeat(64) },
      { request_id: "not-a-uuid" },
      { operator_identity: "x" },
      { reason: "x" },
      { reason: "<script>" },
      { website_scan_reset_at: "2026-02-30T00:00:00Z" },
      { website_scan_reset_at: cutoff.replace("Z", ".000Z") },
      { website_scan_reset_at: "tomorrow" },
    ]
  ) {
    const database = db(success);
    await assertRejects(
      () => handleQrAdminCardReset(database, { ...request, ...patch }),
      QrAdminCardResetError,
    );
    assertEquals(database.calls.length, 0);
  }
});
Deno.test("card reset forwards only exact audited RPC parameters and accepts database-equivalent cutoff", async () => {
  const database = db({
    ...success,
    scan_reset_after: "2026-09-11T23:00:00+00:00",
  });
  const result = await handleQrAdminCardReset(database, request);
  assertEquals(result.to_generation, 1);
  assertEquals(database.calls, [{
    name: "admin_reset_qr_bingo_couple_card",
    args: {
      p_event_key: scope.event_key,
      p_couple_id: "701",
      p_expected_generation: 0,
      p_preview_token: preview.preview_token,
      p_request_id: request.request_id,
      p_operator_identity: request.operator_identity,
      p_reason: request.reason,
      p_scan_reset_at: cutoff,
    },
  }]);
});
Deno.test("card reset exact retry preserves first-attempt cutoff and request id", async () => {
  const database = db({ ...success, replayed: true });
  const result = await handleQrAdminCardReset(database, request);
  assertEquals(result.replayed, true);
  assertEquals(result.request_id, request.request_id);
  assertEquals(result.scan_reset_after, cutoff);
});
Deno.test("card reset fails closed on mismatched or incomplete mutation acknowledgements", async () => {
  for (
    const patch of [
      { action: "draw_reset" },
      { dataset: "entries" },
      { event_key: "other-event" },
      { couple_id: "702" },
      { request_id: "00000000-0000-4000-8000-000000000002" },
      { from_generation: 1 },
      { to_generation: 2 },
      { scan_reset_after: "2026-09-11T23:00:01Z" },
      { entry_count: -1 },
      { entry_count: "2" },
      { replayed: undefined },
    ]
  ) {
    await assertRejects(
      () => handleQrAdminCardReset(db({ ...success, ...patch }), request),
      QrAdminCardResetError,
      "could not be confirmed",
    );
  }
});
Deno.test("card preview rejects stale identity state malformed token and inconsistent blocker", async () => {
  for (
    const patch of [
      { card_state: { ...state, couple_id: "702" } },
      { expected_generation: 1 },
      { preview_token: "b" },
      { entry_count: -1 },
      { can_reset: false, reset_block_reason: "" },
      { can_reset: true, reset_block_reason: "draw_delivery_in_progress" },
    ]
  ) {
    await assertRejects(
      () =>
        handleQrAdminCardReset(db({ ...preview, ...patch }), previewRequest),
      QrAdminCardResetError,
    );
  }
});
Deno.test("card reset maps known conflict and unresolved delivery errors to409", async () => {
  for (
    const code of [
      "stale_card_generation",
      "card_reset_preview_changed",
      "card_reset_preview_expired",
      "card_reset_request_conflict",
      "draw_delivery_in_progress",
      "draw_delivery_uncertain",
      "event_unavailable",
    ]
  ) {
    try {
      await handleQrAdminCardReset(db({ ok: false, code }), request);
      throw new Error("accepted invalid response");
    } catch (error) {
      assertEquals((error as QrAdminCardResetError).status, 409);
      assertEquals((error as QrAdminCardResetError).code, code);
    }
  }
});
Deno.test("card reset database errors and unknown responses do not reveal backend details", async () => {
  for (
    const database of [
      db(null, { message: "private DB details" }),
      db({ ok: false, code: "secret_error" }),
      {
        rpc() {
          throw new Error("secret token");
        },
      },
    ]
  ) {
    try {
      await handleQrAdminCardReset(database, request);
      throw new Error("accepted invalid response");
    } catch (error) {
      assertEquals((error as QrAdminCardResetError).status, 503);
      assertEquals(String(error).includes("secret"), false);
    }
  }
});
Deno.test("cutoff list accepts complete event-specific rows and never exposes hidden database fields", async () => {
  const database = db({
    ok: true,
    action: "card_reset_cutoffs",
    event_key: scope.event_key,
    rows: [{
      couple_id: "701",
      generation: 1,
      scan_reset_after: cutoff,
      private_field: "hidden",
    }],
    has_more: false,
  });
  const result = await handleQrAdminCardResetCutoffs(database, {
    action: "card_reset_cutoffs",
    event_key: scope.event_key,
  });
  assertEquals(result.rows, [{
    couple_id: "701",
    generation: 1,
    scan_reset_after: cutoff,
  }]);
  assertEquals(result.has_more, false);
});
Deno.test("cutoff list rejects truncation wrong event malformed timestamps zero generations and duplicate couples", async () => {
  const base = {
    ok: true,
    action: "card_reset_cutoffs",
    event_key: scope.event_key,
    rows: [{ couple_id: "701", generation: 1, scan_reset_after: cutoff }],
    has_more: false,
  };
  for (
    const patch of [
      { has_more: true },
      { event_key: "other-event" },
      { rows: [{ couple_id: "701", generation: 0, scan_reset_after: null }] },
      {
        rows: [{
          couple_id: "701",
          generation: 1,
          scan_reset_after: "invalid",
        }],
      },
      { rows: [...base.rows, ...base.rows] },
      { rows: Array(10001).fill(base.rows[0]) },
    ]
  ) {
    await assertRejects(
      () =>
        handleQrAdminCardResetCutoffs(db({ ...base, ...patch }), {
          action: "card_reset_cutoffs",
          event_key: scope.event_key,
        }),
      QrAdminCardResetError,
    );
  }
});
Deno.test("card state read validates identity and generation and fails closed on unavailable storage", async () => {
  assertEquals(
    await loadQrBingoCardState(db(state), scope.event_key, "701"),
    state,
  );
  for (
    const data of [
      null,
      { ...state, event_key: "other" },
      { ...state, generation: "0" },
      { ...state, generation: 1 },
      { ...state, generation: 1, scan_reset_after: "invalid" },
    ]
  ) {
    await assertRejects(
      () => loadQrBingoCardState(db(data), scope.event_key, "701"),
      QrBingoCardStateError,
    );
  }
  await assertRejects(
    () =>
      loadQrBingoCardState(
        db(state, { message: "offline" }),
        scope.event_key,
        "701",
      ),
    QrBingoCardStateError,
  );
});
Deno.test("captured native generation survives absent client field while stale supplied proof rejects", () => {
  const captured = { ...state, generation: 2, scan_reset_after: cutoff };
  assertEquals(assertQrBingoCardGeneration(captured), 2);
  assertEquals(assertQrBingoCardGeneration(captured, 2), 2);
  for (const value of [0, 1, 3, "2", null, NaN]) {
    assertThrows(
      () => assertQrBingoCardGeneration(captured, value),
      QrBingoCardStateError,
    );
  }
  assertThrows(
    () =>
      parseQrBingoCardState(
        { ...state, scan_reset_after: cutoff },
        scope.event_key,
        "701",
      ),
    QrBingoCardStateError,
  );
});
