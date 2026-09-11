// Execute the production paginated draw loader and entry-pool calculation with
// an in-memory query adapter. No live database, credential, or email is used.
const endpoints = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function section(source: string, start: string, end: string) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing ${start}`);
  return source.slice(from, to);
}

async function harness(url: URL) {
  const source = await Deno.readTextFile(url);
  const selectedSource = [
    section(source, "function currentDrawGeneration(", "async function drawIsCurrentGeneration("),
    section(source, "async function loadVendorDrawRows(", "async function loadVendorSelectionStateRows("),
    section(source, "async function loadVendorEntryPool(", "async function vendorRaffleEntriesResponse("),
  ].join("\n");
  const vendor = { id: "90001", user_id: "90001" }, event = "offline-draw-generations";
  const settings = { draw_generation: 0 };
  const entries = [1, 2, 3, 4].map(n => ({
    id: `entry-${n}`, event_key: event, vendor_bingo_id: vendor.id,
    vendor_bd_user_id: vendor.id, couple_bd_user_id: `couple-${n}`,
    consent_share_contact: true, contact_share_scope: "named-vendor",
    consent_version: "test-rules", vendor_marketing_consent: true,
    draw_administration_contact_share_acknowledged: true,
    draw_administration_contact_share_version: "test-rules",
    card_reset_at: null as string | null,
  }));
  const draws: Record<string, unknown>[] = ["verified", "potential", "disqualified", "replaced"].map((status, n) => ({
    id: `draw-${n}`, event_key: event, vendor_bingo_id: vendor.id,
    vendor_bd_user_id: vendor.id, draw_generation: 0,
    entry_id: entries[n].id, couple_bd_user_id: entries[n].couple_bd_user_id,
    selection_status: status, draw_number: n + 1,
  }));
  const queryLog: { table: string; predicates: [string, unknown][] }[] = [];
  class Query {
    predicates: [string, unknown][] = [];
    constructor(readonly table: string) {}
    select() { return this; }
    eq(key: string, value: unknown) { this.predicates.push([key, value]); return this; }
    is(key: string, value: unknown) { this.predicates.push([key, value]); return this; }
    in() { return this; }
    order() { return this; }
    range() { return this; }
    result() {
      queryLog.push({ table: this.table, predicates: [...this.predicates] });
      const rows = this.table === "qr_bingo_raffle_draws" ? draws : entries;
      return rows.filter(row => this.predicates.every(([key, value]) => (row as Record<string, unknown>)[key] === value));
    }
  }
  const dependencies = {
    requireAdmin: () => ({ from: (table: string) => new Query(table) }),
    collectExactPostgrestRows: (_label: string, _id: unknown, countQuery: () => Query, pageQuery: (from: number, to: number) => Query) => {
      const count = countQuery().result().length, rows = pageQuery(0, 1000).result();
      assert(rows.length === count, "Count and page queries must use the same generation filter");
      return Promise.resolve(rows);
    },
    getSettings: () => Promise.resolve(settings),
    archivedLegacyEntryIds: () => Promise.resolve(new Set()),
    loadVendorSelectionStateRows: () => Promise.resolve([{ entry_id: "entry-3", included: false, exclusion_reason: "Existing manual exclusion" }]),
    isolatedFixtureMatchesSettings: () => false,
    entryHasNamedVendorContactConsent: () => true,
    entryHasCurrentConsent: () => true,
    entryHasProductionInPersonProof: () => true,
    cleanText: (value: unknown) => String(value ?? ""),
    participationReference: (_event: string, _vendor: string, entry: string) => Promise.resolve(entry),
    CONTACT_SHARE_SCOPE: "named-vendor",
    NAMED_VENDOR_CONTACT_RULES_VERSIONS: ["test-rules"],
  };
  const module = await import(`data:application/typescript,${encodeURIComponent(
    `type QrVendor=any;type RaffleSettings=any;type RaffleDraw=any;type RaffleEntry=any;type IsolatedRaffleFixture=any;
    export default function(deps:any){const {${Object.keys(dependencies).join(",")}}=deps;
    ${selectedSource}
    return {loadVendorEntryPool,loadVendorDrawRows,currentDrawGeneration};}`,
  )}`);
  return { ...module.default(dependencies), vendor, event, settings, entries, draws, queryLog };
}

Deno.test("reset generation releases historical winners while preserving contacts and manual exclusions", async () => {
  for (const url of endpoints) {
    const h = await harness(url);
    const before = await h.loadVendorEntryPool(h.vendor, h.event);
    assert(before.entry_count === 4 && before.eligible_entry_count === 0 && before.selection_in_progress,
      "Current selections must still restrict the original generation");
    h.settings.draw_generation = 1;
    const after = await h.loadVendorEntryPool(h.vendor, h.event);
    assert(after.draw_generation === 1 && after.entry_count === 4, "Reset must preserve every contact");
    assert(after.eligible_entry_count === 3 && !after.selection_in_progress && after.can_update_entries,
      "Old pending/verified/replaced rows must not reserve the new generation's slot or exclude its entrants");
    assert(after.rows.find((row: { participant_reference: string }) => row.participant_reference === "entry-3").pool_status === "excluded",
      "An administrator draw reset must not clear manual entrant exclusions");
    assert(after.rows.every((row: { selection_status: string; previous_winner: boolean }) => row.selection_status === "not_selected" && !row.previous_winner),
      "Historical selections must not be presented as current winner state");
    const drawQueries = h.queryLog.filter((query: { table: string }) => query.table === "qr_bingo_raffle_draws");
    assert(drawQueries.length === 4 && drawQueries.every((query: { predicates: [string, unknown][] }) =>
      query.predicates.some(([key, value]) => key === "draw_generation" && (value === 0 || value === 1))),
      "Both exact counts and paginated draw reads must be scoped to the server generation");
  }
});

Deno.test("new generation selections still reserve the slot and malformed generation fails closed", async () => {
  for (const url of endpoints) {
    const h = await harness(url);
    h.settings.draw_generation = 1;
    h.draws.push({ ...h.draws[1], id: "new-current-selection", draw_generation: 1, draw_number: 5 });
    const pool = await h.loadVendorEntryPool(h.vendor, h.event);
    assert(pool.selection_in_progress && !pool.can_update_entries && pool.eligible_entry_count === 2,
      "A current pending selection still blocks pool editing and cannot be selected twice");
    assert(h.currentDrawGeneration(undefined) === 0, "Pre-migration fixture snapshots belong to generation zero");
    for (const invalid of [null, -1, 1.1, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      let rejected = false;
      try { h.currentDrawGeneration(invalid); } catch { rejected = true; }
      assert(rejected, "Malformed database generation must never silently select history");
    }
  }
});

Deno.test("a reset couple is excluded from both entry count and pool until reactivated, without altering draw audit", async () => {
  for (const url of endpoints) {
    const h = await harness(url); h.settings.draw_generation = 1;
    h.entries[0].card_reset_at = "2026-09-11T12:00:00Z";
    const priorDraws = JSON.stringify(h.draws);
    const pool = await h.loadVendorEntryPool(h.vendor, h.event);
    assert(pool.entry_count === 3 && pool.eligible_entry_count === 2, "Reset entries must not inflate counts or become eligible");
    assert(!pool.rows.some((row: any) => row.participant_reference === "entry-1"), "Inactive entry must be absent from operational rows");
    assert(JSON.stringify(h.draws) === priorDraws, "Reading the reset pool must preserve historical draw rows");
    const entryQueries = h.queryLog.filter((query: { table: string }) => query.table === "qr_bingo_raffle_entries");
    assert(entryQueries.length === 2 && entryQueries.every((query: { predicates: [string, unknown][] }) => query.predicates.some(([key, value]) => key === "card_reset_at" && value === null)), "Count and page reads must both exclude inactive entries");
    h.entries[0].card_reset_at = null;
    const restored = await h.loadVendorEntryPool(h.vendor, h.event);
    assert(restored.entry_count === 4 && restored.eligible_entry_count === 3, "Fresh reactivation restores only that entrant");
  }
});
