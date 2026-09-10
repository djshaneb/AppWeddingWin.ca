import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleQrAdminData, QrAdminDataError } from "./qr_bingo_admin_data.ts";

const event = "offline-reset-data";
const drawId = "11111111-1111-4111-8111-111111111111";
const request = { action: "data_list", dataset: "winners", event_key: event, vendor_id: "90001", page: 2, page_size: 10 };
const winner = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: drawId, vendor_id: "90001", vendor_name: "Offline Vendor", couple_id: "90002",
  name: "Offline Couple", email: "couple@example.invalid", phone: "2025550147", wedding_date: "",
  draw_number: 1, drawn_at: "2026-09-10T18:00:00Z", selection_status: "verified", prize_title: "Offline prize",
  draw_generation: 0, current_generation: 0, is_current_generation: true, can_reset_draw: true,
  reset_block_reason: "", private_ledger_token: "DO_NOT_PUBLISH", ...patch,
});
function database(rows: Record<string, unknown>[], total = rows.length) {
  const calls: { operation: string; [key: string]: unknown }[] = [];
  return { calls, db: {
    rpc(name: string, args: unknown) { calls.push({ operation: "rpc", name, args }); return Promise.resolve({ data: { rows, total }, error: null }); },
    from(table: string) {
      return {
        select() { return { eq() { return { gte() { calls.push({ operation: "audit-read", table }); return Promise.resolve({ count: 0, error: null }); } }; } }; },
        insert(value: unknown) { calls.push({ operation: "audit-insert", table, value }); return Promise.resolve({ error: null }); },
      };
    },
  } };
}

Deno.test("winner list preserves validated reset metadata separately from unchanged export columns", async () => {
  const fixture = database([winner()], 21);
  const result = await handleQrAdminData(fixture.db, request);
  assert("rows" in result && "columns" in result);
  assertEquals(result.rows[0].id, drawId);
  for (const key of ["draw_generation", "current_generation", "is_current_generation", "can_reset_draw", "reset_block_reason"]) {
    assertEquals(result.rows[0][key], winner()[key]);
    assert(!result.columns.some(column => column.key === key));
  }
  assertEquals(result.rows[0].private_ledger_token, undefined);
  assertEquals(result.has_more, true);
  assertEquals(fixture.calls, [{ operation: "rpc", name: "read_qr_bingo_admin_data", args: {
    p_event_key: event, p_vendor_id: "90001", p_search: "", p_offset: 10, p_limit: 10, p_dataset: "winners",
  } }]);
});

Deno.test("historical winners and currently blocked draws retain non-actionable state and explanation", async () => {
  const old = winner({ draw_generation: 0, current_generation: 1, is_current_generation: false, can_reset_draw: false, reset_block_reason: "draw_not_current" });
  const sending = winner({ id: "22222222-2222-4222-8222-222222222222", draw_generation: 1, current_generation: 1, can_reset_draw: false, reset_block_reason: "draw_delivery_in_progress" });
  const result = await handleQrAdminData(database([old, sending]).db, request);
  assert("rows" in result);
  assertEquals(result.rows.map((row: Record<string, unknown>) => [row.draw_generation, row.current_generation, row.is_current_generation, row.can_reset_draw]), [
    [0, 1, false, false], [1, 1, true, false],
  ]);
  assert(/previous|history/i.test(String(result.rows[0].reset_block_reason)));
  assert(/email.*processed|sending|delivery/i.test(String(result.rows[1].reset_block_reason)));
  assert(!/draw_not_current|draw_delivery_in_progress/.test(JSON.stringify(result.rows)));
});

Deno.test("unknown reset block reasons use safe user-facing copy instead of raw server details", async () => {
  const result = await handleQrAdminData(database([winner({ can_reset_draw: false, reset_block_reason: "private-internal-detail" })]).db, request);
  assert("rows" in result);
  assert(/unavailable|refresh/i.test(String(result.rows[0].reset_block_reason)));
  assert(!JSON.stringify(result).includes("private-internal-detail"));
});

Deno.test("winner reset metadata rejects missing, malformed, contradictory, or unsafe generation state", async () => {
  const invalid: Record<string, unknown>[] = [
    { draw_generation: undefined }, { draw_generation: null }, { draw_generation: "0" },
    { draw_generation: -1 }, { draw_generation: 0.5 }, { draw_generation: Number.MAX_SAFE_INTEGER + 1 },
    { current_generation: undefined }, { current_generation: "0" }, { current_generation: -1 },
    { current_generation: 0.5 }, { current_generation: Number.MAX_SAFE_INTEGER + 1 },
    { draw_generation: 2, current_generation: 1 }, { is_current_generation: undefined },
    { is_current_generation: "true" }, { is_current_generation: false },
    { can_reset_draw: undefined }, { can_reset_draw: "true" },
    { current_generation: 1, is_current_generation: false, can_reset_draw: true },
    { selection_status: "replaced" }, { selection_status: "disqualified" },
    { can_reset_draw: true, reset_block_reason: "draw_delivery_in_progress" },
    { reset_block_reason: null }, { reset_block_reason: 0 }, { reset_block_reason: "x".repeat(401) },
  ];
  for (const patch of invalid) {
    const fixture = database([winner(patch)]);
    const error = await assertRejects(() => handleQrAdminData(fixture.db, request), QrAdminDataError);
    assertEquals(error.status, 503, JSON.stringify(patch));
    assert(!error.message.includes("DO_NOT_PUBLISH"));
    assertEquals(fixture.calls.length, 1, "invalid list must not create an export audit or mutation");
  }
});

Deno.test("winner CSV remains compatible without reset metadata and excludes private/reset fields", async () => {
  const historical = winner({ name: "=Offline formula", draw_generation: undefined, current_generation: undefined,
    is_current_generation: undefined, can_reset_draw: undefined, reset_block_reason: undefined });
  const fixture = database([historical]);
  const result = await handleQrAdminData(fixture.db, { ...request, action: "data_export", operator_identity: "Offline Admin" });
  assert("report" in result);
  assertEquals(result.report.row_count, 1);
  assertEquals(result.report.mime_type, "text/csv;charset=utf-8");
  const lines = result.report.csv.split("\r\n");
  assertEquals(lines[0], '\uFEFF"Draw ID","Vendor ID","Vendor","Couple ID","Name at selection","Contact email at selection","Phone at selection","Wedding date at selection","Draw number","Drawn at","Selection status","Prize"');
  assert(lines[1].includes('"\'=Offline formula"'));
  assert(!/draw_generation|current_generation|can_reset_draw|DO_NOT_PUBLISH/.test(result.report.csv));
  assertEquals(lines.length, 3);
  assertEquals(fixture.calls[0], { operation: "rpc", name: "read_qr_bingo_admin_data", args: {
    p_event_key: event, p_vendor_id: "90001", p_search: "", p_offset: 0, p_limit: 5001, p_dataset: "winners",
  } });
  assertEquals(fixture.calls[2], { operation: "audit-insert", table: "qr_bingo_admin_data_export_audit", value: {
    event_key: event, dataset: "winners", vendor_id: "90001", operator_identity: "Offline Admin", row_count: 1,
  } });
});

Deno.test("entry lists do not inherit winner reset metadata or expose private fields", async () => {
  const result = await handleQrAdminData(database([winner()]).db, { ...request, dataset: "entries" });
  assert("rows" in result);
  assertEquals(result.rows[0].id, drawId);
  for (const key of ["draw_generation", "current_generation", "is_current_generation", "can_reset_draw", "reset_block_reason", "private_ledger_token"]) {
    assertEquals(result.rows[0][key], undefined);
  }
});

Deno.test("an empty winners page remains valid without fabricated reset state", async () => {
  const fixture = database([]);
  const result = await handleQrAdminData(fixture.db, request);
  assert("rows" in result);
  assertEquals(result.rows, []);
  assertEquals(result.total, 0);
  assertEquals(fixture.calls.length, 1);
});
