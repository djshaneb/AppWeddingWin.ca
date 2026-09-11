// Execute production handler sections against an offline transport adapter.
// Database reset atomicity is covered separately by the actual SQL tests.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertQrBingoCardGeneration, loadQrBingoCardState, QrBingoCardStateError } from "./qr_bingo_card_state.ts";

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, start); return source.slice(from, to);
}
async function harness(endpoint: string) {
  const source = await Deno.readTextFile(new URL(`../${endpoint}/index.ts`, import.meta.url));
  const vendor = { id: "707", user_id: "707", name: "Offline vendor" };
  const user = { user_id: "90001", subscription_id: "18", active: "2" };
  let generation = 0, resetDuringProof = false, fixtureRpcReply: any = null;
  const events: string[] = [], posts: any[] = [], entries: any[] = [], fixtureWrites: any[] = [];
  const rows = [
    { fixture_id: "fixture-a", couple_bd_user_id: "90001", vendor_bingo_id: "707", card_generation: 0 },
    { fixture_id: "fixture-a", couple_bd_user_id: "90001", vendor_bingo_id: "707", card_generation: 3 },
    { fixture_id: "fixture-a", couple_bd_user_id: "90002", vendor_bingo_id: "808", card_generation: 3 },
    { fixture_id: "fixture-b", couple_bd_user_id: "90001", vendor_bingo_id: "909", card_generation: 3 },
  ];
  const state = (event = "offline-event", couple = "90001") => ({ event_key: event, couple_id: couple, generation,
    scan_reset_after: generation ? "2026-09-11T12:00:00Z" : null });
  class Query {
    predicates: [string, unknown][] = [];
    constructor(readonly table: string) {}
    select() { return this; }
    eq(key: string, value: unknown) { this.predicates.push([key, value]); return this; }
    then(resolve: (value: unknown) => unknown) {
      events.push("fixture-proof");
      assert(["app_review_raffle_fixture_scans", "qr_bingo_email_test_fixture_scans"].includes(this.table));
      return Promise.resolve({ data: rows.filter(row => this.predicates.every(([key, value]) => (row as any)[key] === value)), error: null }).then(resolve);
    }
  }
  const db = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: any) => {
      if (name === "read_qr_bingo_card_state") {
        events.push("read-card"); return { data: state(args.p_event_key, args.p_couple_id), error: null };
      }
      assertEquals(name, "save_qr_bingo_fixture_card_scan"); fixtureWrites.push(args);
      if (args.p_expected_generation !== generation) return { error: { code: "55000", message: "stale_card_generation" } };
      return fixtureRpcReply ?? { data: { ok: true, card_generation: generation }, error: null };
    },
  };
  const deps = {
    loadQrBingoCardState, assertQrBingoCardGeneration, QrBingoCardStateError,
    requireAdmin: () => db,
    qrBingoConfig: () => ({ event_key: "offline-event", rules_version: "current" }),
    isEmailTestFixture: (fixture: any) => fixture?.email_test === true,
    qrBingoScannerWindowOpen: () => true, productionShowScanWindowOpen: () => false,
    cleanText: (value: unknown) => String(value ?? ""), qrContactUser: (member: any) => member,
    jsonResponse: (body: any, status = 200) => ({ body, status }),
    postQrAction: async (_cookie: unknown, form: URLSearchParams) => {
      events.push("scan-write"); posts.push(Object.fromEntries(form));
      assertEquals(form.get("expected_card_generation"), String(generation));
      return { status: "success" };
    },
    getFreshScanned: async () => {
      events.push("read-proof");
      if (resetDuringProof) generation++;
      return { scanned: [vendor.id], inShowScanned: [], vendorDrawScanned: [vendor.id] };
    },
    buildRaffleOffer: async () => ({ vendor_id: vendor.id }),
    optInToRaffle: async (...args: any[]) => {
      events.push("entry-transaction");
      if (args[6] !== generation) throw { code: "55000", message: "stale_card_generation" };
      entries.push(args); return { entered: true };
    },
  };
  const gate = section(source, "      const isReviewCouple = Boolean(", "      let bingoContactProfile:");
  const progress = section(source, "      let scanned: string[];", '      if (action === "scan") {');
  const actions = section(source, '      if (action === "scan") {', '      if (action === "vendor_raffle_get") {');
  const catches = section(source, '    if (error instanceof QrBingoCardStateError)', '    if (error instanceof QrContactError)');
  const functions = section(source, "function isolatedFixtureVendor(", "function unwrapBdUser(");
  const module = await import(`data:application/typescript,${encodeURIComponent(`
    type QrVendor=any;type IsolatedRaffleFixture=any;type QrBingoCardState=any;
    export default function(deps:any){const {${Object.keys(deps).join(",")}}=deps;
    ${functions}
    async function dispatch(action:any,body:any,user:any,reviewFixture:any,websitePrincipal:any){
      const authenticatedMemberId=String(user.user_id),isVendorRaffleAction=false,cookieJar=new Map(),page={vendors:[{id:'707',user_id:'707',name:'Offline vendor'}],scanned:[]},bingoContactProfile={};
      try { ${gate} ${progress} ${actions} return {body:{ok:true,card_state:cardState},status:200}; }
      catch(error){${catches}throw error;}
    }
    return {dispatch,isolatedFixtureContext,isolatedFixtureScannedIds,saveIsolatedFixtureScan};}
  `)}`);
  const api = module.default(deps);
  return { api, events, posts, entries, fixtureWrites, user, vendor, state,
    dispatch: (action: string, extra: any = {}, website = false, fixture: any = null) =>
      api.dispatch(action, { vendor_id: vendor.id, ...extra }, user, fixture, website ? { kind: "couple" } : null),
    setGeneration: (value: number) => generation = value,
    resetDuringProof: () => resetDuringProof = true,
    setFixtureReply: (value: any) => fixtureRpcReply = value,
  };
}

for (const endpoint of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
  Deno.test(`${endpoint}: installed native requests capture current card generation before proof and carry it into entry`, async () => {
    const h = await harness(endpoint); h.setGeneration(3);
    const result = await h.dispatch("raffle_opt_in");
    assertEquals(result.status, 200); assertEquals(result.body.card_generation, 3);
    assertEquals(h.events, ["read-card", "read-proof", "entry-transaction"]);
    assertEquals(h.entries[0][6], 3); assertEquals(h.entries[0][3], "offline-event");
  });
  Deno.test(`${endpoint}: stale or missing website generation fails before reading scan proof`, async () => {
    for (const supplied of [undefined, 0, 2, "3", -1, null]) {
      const h = await harness(endpoint); h.setGeneration(3);
      const result = await h.dispatch("raffle_opt_in", supplied === undefined ? {} : { expected_card_generation: supplied }, true);
      assertEquals(result.status, 409); assertEquals(result.body.code, "stale_card_generation"); assertEquals(h.events, ["read-card"]);
    }
    const current = await harness(endpoint); current.setGeneration(3);
    assertEquals((await current.dispatch("raffle_opt_in", { expected_card_generation: 3 }, true)).status, 200);
  });
  Deno.test(`${endpoint}: reset racing proof read returns409 and never retries or records the old entry`, async () => {
    const h = await harness(endpoint); h.resetDuringProof();
    const result = await h.dispatch("raffle_opt_in");
    assertEquals(result.status, 409); assertEquals(result.body.code, "stale_card_generation"); assertEquals(h.entries, []);
    assertEquals(h.events, ["read-card", "read-proof", "entry-transaction"]);
  });
  Deno.test(`${endpoint}: fresh and repeated scans forward captured generation without entering a draw`, async () => {
    const h = await harness(endpoint); h.setGeneration(3);
    for (let i = 0; i < 2; i++) {
      const result = await h.dispatch("scan");
      assertEquals(result.status, 200); assertEquals(result.body.card_generation, 3); assertEquals(result.body.scanned, ["707"]);
    }
    assertEquals(h.posts.map(post => post.expected_card_generation), ["3", "3"]); assertEquals(h.entries, []);
    assertEquals(h.events[0], "read-card"); assertEquals(h.events[1], "scan-write");
  });
  Deno.test(`${endpoint}: private fixture context and scan RPC isolate event, account, generation and channel`, async () => {
    for (const email_test of [false, true]) {
      const h = await harness(endpoint); h.setGeneration(3);
      const fixture = { id: "fixture-a", event_key: "private-offline-event", vendor_bingo_id: "707", vendor_bd_user_id: "707", vendor_name: "Private vendor",
        authenticated_couple_bd_user_id: "90001", couple_bd_user_id: "90001", email_test };
      const context = await h.api.isolatedFixtureContext(fixture, "90001");
      assertEquals(context.card_state, h.state("private-offline-event")); assertEquals(context.scanned, ["707"]);
      assertEquals(h.events, ["read-card", "fixture-proof"]);
      await h.api.saveIsolatedFixtureScan(fixture, "90001", 3);
      assertEquals(h.fixtureWrites, [{ p_event_key: "private-offline-event", p_couple_id: "90001", p_fixture_id: "fixture-a", p_vendor_id: "707", p_expected_generation: 3, p_email_test: email_test }]);
      const before = h.events.length;
      assertEquals((await h.api.isolatedFixtureContext(fixture, "90002")).scanned, []); assertEquals(h.events.length, before);
      h.setFixtureReply({ data: { ok: true, card_generation: 2 }, error: null });
      let stale = false; try { await h.api.saveIsolatedFixtureScan(fixture, "90001", 3); } catch (error) { stale = error instanceof QrBingoCardStateError && error.status === 409; }
      assert(stale, "A mismatched RPC receipt cannot claim the fixture scan was saved");
    }
  });
}
