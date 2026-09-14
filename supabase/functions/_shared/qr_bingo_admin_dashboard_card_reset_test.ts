// Execute the actual dashboard aggregation over synthetic queryable rows.
// No Supabase transport, environment credentials or live mutations.
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
type Row = Record<string, unknown>;
const event = "offline-admin-card-summary";
const config = {
  event_key: event,
  send_vendor_email: true,
  send_couple_email: true,
};
async function dashboard(rows: Record<string, Row[]>, failedTable?: string) {
  const source = await Deno.readTextFile(
    new URL("../bd-qr-bingo-admin/index.ts", import.meta.url),
  );
  const start = source.indexOf("async function dashboardStats(");
  const end = source.indexOf(
    "async function alternateEntryReconciliationStatus(",
    start,
  );
  if (start < 0 || end < start) {
    throw new Error("Dashboard function boundary missing");
  }
  const db = {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      const query = {
        select: (_columns: string, _options?: unknown) => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        is: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        then: (resolve: (result: unknown) => void) => {
          const data = (rows[table] || []).filter((row) =>
            filters.every((test) => test(row))
          );
          resolve({
            data,
            count: data.length,
            error: table === failedTable
              ? new Error("Synthetic count failure")
              : null,
          });
        },
      };
      return query;
    },
  };
  const module = await import(
    `data:application/typescript,${
      encodeURIComponent(
        `async function loadPublishedQrBingoConfig(): Promise<any> { return null; } export default function(db:any) { const requireAdmin=()=>db; ${
          source.slice(start, end)
        } return dashboardStats; }`,
      )
    }`
  );
  return module.default(db)(config);
}
function records() {
  return {
    qr_bingo_raffle_settings: [
      {
        id: "settings-a",
        event_key: event,
        enabled: true,
        legal_terms_accepted: true,
      },
      {
        id: "settings-b",
        event_key: event,
        enabled: false,
        legal_terms_accepted: false,
      },
      {
        id: "settings-other-event",
        event_key: "other-event",
        enabled: true,
        legal_terms_accepted: true,
      },
    ],
    qr_bingo_raffle_entries: [
      {
        id: "active-qr",
        event_key: event,
        entry_method: "vendor_qr_scan",
        card_reset_at: null,
        card_generation: 1,
      },
      {
        id: "active-alternate",
        event_key: event,
        entry_method: "alternate_free_entry",
        card_reset_at: null,
        card_generation: 0,
      },
      {
        id: "reset-qr",
        event_key: event,
        entry_method: "vendor_qr_scan",
        card_reset_at: "2026-09-11T12:00:00Z",
        card_generation: 0,
      },
      {
        id: "reset-alternate",
        event_key: event,
        entry_method: "alternate_free_entry",
        card_reset_at: "2026-09-11T12:00:00Z",
        card_generation: 0,
      },
      {
        id: "other-event",
        event_key: "other-event",
        entry_method: "alternate_free_entry",
        card_reset_at: null,
        card_generation: 0,
      },
    ],
    qr_bingo_raffle_draws: [
      {
        id: "retained-pending",
        event_key: event,
        selection_status: "verified",
        vendor_email_sent_at: null,
        couple_email_sent_at: null,
      },
      {
        id: "retained-sent",
        event_key: event,
        selection_status: "verified",
        vendor_email_sent_at: "2026-09-11T12:00:00Z",
        couple_email_sent_at: "2026-09-11T12:00:00Z",
      },
      {
        id: "potential",
        event_key: event,
        selection_status: "potential",
        vendor_email_sent_at: null,
        couple_email_sent_at: null,
      },
      {
        id: "other-event-draw",
        event_key: "other-event",
        selection_status: "verified",
        vendor_email_sent_at: null,
        couple_email_sent_at: null,
      },
    ],
  };
}
Deno.test("admin summary excludes reset QR and alternate entries while preserving event and winner history counts", async () => {
  const rows = records(), before = structuredClone(rows);
  assertEquals(await dashboard(rows), {
    vendors_configured: 2,
    vendors_enabled: 1,
    vendors_terms_accepted: 1,
    entries: 2,
    alternate_entries_reconciled: 1,
    verified_notices_pending: 1,
  });
  assertEquals(rows, before, "Summary reads must not modify retained history");
});
Deno.test("admin summary falls to zero for reset entries and counts a fresh re-entry exactly once", async () => {
  const rows = records();
  for (const row of rows.qr_bingo_raffle_entries) {
    if (row.event_key === event) row.card_reset_at = "2026-09-13T12:00:00Z";
  }
  let stats = await dashboard(rows);
  assertEquals(stats.entries, 0);
  assertEquals(stats.alternate_entries_reconciled, 0);
  rows.qr_bingo_raffle_entries[0].card_reset_at = null;
  rows.qr_bingo_raffle_entries[0].card_generation = 2;
  stats = await dashboard(rows);
  assertEquals(stats.entries, 1);
  assertEquals(stats.alternate_entries_reconciled, 0);
  assertEquals(stats.verified_notices_pending, 1);
});
Deno.test("admin summary still fails closed when the entry count query fails", async () => {
  await assertRejects(
    () => dashboard(records(), "qr_bingo_raffle_entries"),
    Error,
    "Synthetic count failure",
  );
});
