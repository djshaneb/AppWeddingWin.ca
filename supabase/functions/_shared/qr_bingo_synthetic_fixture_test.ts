import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  syntheticFixtureContextMatches, syntheticFixtureOfferMatches, syntheticFixtureActionIsBlocked,
  SYNTHETIC_FIXTURE_EVENT_KEY, SYNTHETIC_FIXTURE_PREVIOUS_EVENT_KEY, SYNTHETIC_FIXTURE_PREVIOUS_ID,
  SYNTHETIC_FIXTURE_VENDOR_NAME, SYNTHETIC_FIXTURE_PRIZE_TITLE, SYNTHETIC_FIXTURE_PRIZE_DESCRIPTION,
  SYNTHETIC_FIXTURE_DISCLOSURE, SYNTHETIC_FIXTURE_DISPLAY_ONLY_MESSAGE,
} from "./qr_bingo_synthetic_fixture.ts";

const config = { event_key: "niagara-wedding-show-2026", rules_version: "2026-09-01-in-person-entry", revision: 16 };
const now = Date.parse("2026-09-14T19:00:01Z");
function sample() {
  // Timestamp and numeric shapes are the JSON values returned by PostgREST.
  const setup: Record<string, any> = {
    id: "508e5154-707a-480e-a906-1d3c5145a271", request_id: "630dd67f-2a25-4c70-9d9b-c5db49e08aec",
    fixture_id: "8ff90522-a01b-4836-80e0-eb6c056d3cff", previous_fixture_id: SYNTHETIC_FIXTURE_PREVIOUS_ID,
    event_key: SYNTHETIC_FIXTURE_EVENT_KEY, previous_event_key: SYNTHETIC_FIXTURE_PREVIOUS_EVENT_KEY,
    couple_bd_user_id: "38971", vendor_bd_user_id: "38970", vendor_bingo_id: "38970",
    vendor_name: SYNTHETIC_FIXTURE_VENDOR_NAME, provenance: "synthetic_fixture_setup", operator_identity: "Offline QA operator",
    reason: "Approved nonbinding screenshot fixture", created_at: "2026-09-14T19:00:00.123456+00:00",
    vendor_offer_version: "2026-09-14T19:00:00.123456+00:00", expires_at: "2026-09-21T19:00:00.123456+00:00",
    published_config_revision: config.revision, rules_version: config.rules_version, official_rules_url: "https://www.weddingwin.ca/about-terms",
    prize_title: SYNTHETIC_FIXTURE_PRIZE_TITLE, prize_description: SYNTHETIC_FIXTURE_PRIZE_DESCRIPTION,
    prize_approx_value_cad: 0, participant_disclosure: SYNTHETIC_FIXTURE_DISCLOSURE,
  };
  const fixture: Record<string, any> = { id: setup.fixture_id, synthetic_fixture_setup_id: setup.id,
    event_key: setup.event_key, couple_bd_user_id: "38971", vendor_bd_user_id: "38970", vendor_bingo_id: "38970",
    vendor_name: setup.vendor_name, enabled: true, allow_early_draw: false, suppress_outbound_email: true,
    expires_at: setup.expires_at, primary_superseded_at: null, authenticated_couple_bd_user_id: "38971", synthetic_setup: setup };
  const settings: Record<string, any> = { synthetic_fixture_setup_id: setup.id, event_key: setup.event_key,
    vendor_bd_user_id: "38970", vendor_bingo_id: "38970", vendor_name: setup.vendor_name, prize_provider_name: setup.vendor_name,
    enabled: false, prize_title: setup.prize_title, prize_description: setup.prize_description, prize_approx_value_cad: 0,
    participant_responsibility_disclosure_text: setup.participant_disclosure, vendor_responsibility_disclosure_text: "",
    vendor_responsibility_version: "", legal_terms_accepted: false, legal_terms_accepted_at: null, rules_viewed_at: null,
    vendor_responsibility_acknowledged: false, vendor_responsibility_acknowledged_at: null, apple_non_sponsor_acknowledged: false,
    updated_at: setup.vendor_offer_version, legal_terms_version: setup.rules_version, official_rules_url: setup.official_rules_url,
    entry_closes_at: setup.expires_at, draw_opens_at: setup.expires_at, draw_at: setup.expires_at, max_winners: 1, exclude_previous_winners: true };
  const snapshot: Record<string, any> = { ...settings, vendor_offer_version: setup.vendor_offer_version, rules_version: setup.rules_version,
    event_revision: setup.published_config_revision, offer_enterable: false, activation_excluded_as_legacy_qa: false };
  return { setup, fixture, settings, snapshot };
}

Deno.test("synthetic context accepts only the exact bound pair and PostgREST zero-value nonbinding snapshot", () => {
  const { fixture, setup, settings, snapshot } = sample();
  for (const member of ["38971", "38970"]) assertEquals(syntheticFixtureContextMatches(fixture, setup, member, config, now), true);
  assertEquals(syntheticFixtureOfferMatches(settings, snapshot, fixture, setup, "38971", config, now), true);
  assertEquals(syntheticFixtureOfferMatches(settings, snapshot, fixture, setup, "38970", config, now), false);
  assertEquals(syntheticFixtureOfferMatches(settings, snapshot, fixture, setup, "39077", config, now), false);
});

for (const [key, badValue] of Object.entries({
  enabled: false, allow_early_draw: true, suppress_outbound_email: false, primary_superseded_at: "2026-09-14T19:00:00Z",
  couple_bd_user_id: "39077", vendor_bd_user_id: "39081", vendor_bingo_id: "39081", vendor_name: "Other vendor",
  id: "00000000-0000-4000-8000-000000000000", synthetic_fixture_setup_id: null,
  event_key: "app-review-lookalike", expires_at: "2026-09-14T18:00:00Z", outbound_recipient_email: "nobody@example.test",
})) Deno.test(`synthetic fixture rejects ${key} corruption`, () => {
  const { fixture, setup } = sample(); fixture[key] = badValue;
  assertEquals(syntheticFixtureContextMatches(fixture, setup, "38971", config, now), false);
});
for (const [key, badValue] of Object.entries({
  id: "malformed", request_id: "malformed", previous_fixture_id: "00000000-0000-4000-8000-000000000000",
  fixture_id: "00000000-0000-4000-8000-000000000000", previous_event_key: "app-review-other", event_key: config.event_key,
  vendor_name: "Other vendor", provenance: "app", operator_identity: "", reason: "", created_at: "2030-01-01T00:00:00Z",
  vendor_offer_version: "2026-09-14T19:00:00Z", published_config_revision: 15, rules_version: "old rules",
  prize_title: "A real prize", prize_description: "A real prize", prize_approx_value_cad: "0", participant_disclosure: "I legally agree",
})) Deno.test(`synthetic setup rejects ${key} corruption`, () => {
  const { fixture, setup } = sample(); setup[key] = badValue;
  assertEquals(syntheticFixtureContextMatches(fixture, setup, "38971", config, now), false);
});
Deno.test("synthetic setup expires at its exact boundary and cannot extend beyond seven days", () => {
  const { fixture, setup } = sample();
  assertEquals(syntheticFixtureContextMatches(fixture, setup, "38971", config, Date.parse(setup.expires_at)), false);
  fixture.expires_at = setup.expires_at = "2026-09-21T19:00:00.124456+00:00";
  assertEquals(syntheticFixtureContextMatches(fixture, setup, "38971", config, now), false);
});
for (const target of ["settings", "snapshot"] as const) {
  for (const [key, badValue] of Object.entries({
    enabled: true, prize_approx_value_cad: 1, legal_terms_accepted: true, legal_terms_accepted_at: "2026-09-14T19:00:00Z",
    rules_viewed_at: "2026-09-14T19:00:00Z", vendor_responsibility_acknowledged: true,
    vendor_responsibility_acknowledged_at: "2026-09-14T19:00:00Z", apple_non_sponsor_acknowledged: true,
    vendor_responsibility_disclosure_text: "Vendor acceptance", vendor_responsibility_version: "real terms",
    participant_responsibility_disclosure_text: "Real entry consent", synthetic_fixture_setup_id: null, max_winners: 2,
  })) Deno.test(`${target} cannot present synthetic provenance as ${key}`, () => {
    const data = sample(); data[target][key] = badValue;
    assertEquals(syntheticFixtureOfferMatches(data.settings, data.snapshot, data.fixture, data.setup, "38971", config, now), false);
  });
}

function section(source: string, start: string, end: string) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Missing executable section: ${start}`);
  return source.slice(a, b);
}

async function endpointHarness(endpoint: string) {
  const source = await Deno.readTextFile(new URL(`../${endpoint}/index.ts`, import.meta.url));
  const data = sample();
  // Keep the exact PostgREST shape, with a relative clock only for live function Date.now().
  const stamp = new Date(Date.now() - 1_000).toISOString(), expiry = new Date(Date.now() + 60_000).toISOString();
  data.setup.created_at = data.setup.vendor_offer_version = data.settings.updated_at = data.snapshot.vendor_offer_version = stamp;
  data.setup.expires_at = data.fixture.expires_at = expiry;
  for (const value of [data.settings, data.snapshot]) value.entry_closes_at = value.draw_opens_at = value.draw_at = expiry;
  let existing: unknown = null, setupError: unknown = null, fixtureReads = 0, productionReady = false, legacyParticipant = false;
  const tables: string[] = [];
  const query = (table: string): any => {
    const builder: any = {};
    let primaryOnly = false;
    for (const key of ["select", "eq", "gt", "or", "not", "limit", "in", "order"]) builder[key] = () => builder;
    builder.is = () => { primaryOnly = true; return builder; };
    builder.then = (resolve: (value: unknown) => unknown) => {
      if (table !== "app_review_raffle_fixture_participants") throw new Error(`Unexpected list ${table}`);
      return Promise.resolve(resolve({ data: [{ fixture_id: SYNTHETIC_FIXTURE_PREVIOUS_ID }], error: null }));
    };
    builder.maybeSingle = async () => {
      if (table === "qr_bingo_synthetic_fixture_setups") return { data: data.setup, error: setupError };
      if (table === "app_review_raffle_fixtures") {
        fixtureReads++;
        if (legacyParticipant) return { data: primaryOnly ? null : { ...data.fixture, id: SYNTHETIC_FIXTURE_PREVIOUS_ID,
          event_key: SYNTHETIC_FIXTURE_PREVIOUS_EVENT_KEY, synthetic_fixture_setup_id: null, synthetic_setup: undefined,
          primary_superseded_at: stamp }, error: null };
        return { data: data.fixture, error: null };
      }
      if (table === "qr_bingo_raffle_entries") return { data: existing, error: null };
      throw new Error(`Unexpected read ${table}`);
    };
    builder.insert = builder.update = builder.upsert = () => { throw new Error("No mutation is permitted in the preview path"); };
    return builder;
  };
  const deps = {
    syntheticFixtureContextMatches, syntheticFixtureOfferMatches, syntheticFixtureActionIsBlocked,
    SYNTHETIC_FIXTURE_DISCLOSURE, SYNTHETIC_FIXTURE_DISPLAY_ONLY_MESSAGE,
    qrBingoConfig: () => config, getSettings: () => Promise.resolve(data.settings), loadCurrentVendorOfferSnapshot: () => Promise.resolve(data.snapshot),
    isSettingsEnterable: () => productionReady, offerSnapshotIsEnterable: () => productionReady,
    qrBingoEffectiveEntryDisclosure: () => "Existing genuine terms unchanged", qrBingoEntryOpensAt: () => "2026-09-01T00:00:00Z",
    requireAdmin: () => ({ from: (table: string) => { tables.push(table); return query(table); }, rpc: () => { throw new Error("Unexpected RPC"); } }),
    archivedLegacyEntryIds: async () => new Set(), entryHasCurrentConsent: () => false,
    cleanText: (value: unknown) => String(value || ""), absoluteWeddingWinUrl: () => "", positiveCadValue: () => 100,
    ELIGIBILITY_EXCLUSIONS: "Existing exclusions", APPLE_NON_SPONSOR_DISCLAIMER: "Existing Apple notice",
    QR_ENTRY_ACCESS_POLICY_VERSION: "existing", QR_ENTRY_ACCESS_POLICY_DISCLOSURE: "Existing access policy",
    qrContactProfile: () => ({ complete: true }), jsonResponse: (body: unknown, status = 200) => ({ body, status }),
  };
  const code = `type QrVendor=any;type BdRow=any;type IsolatedRaffleFixture=any;type RaffleEntry=any;type VendorOfferSnapshot=any;type RaffleSettings=any;type AppReviewRaffleFixture=any;type SyntheticFixtureSetup=any;
    export default function(deps:any){const {${Object.keys(deps).join(",")}}=deps;
    ${section(source, "async function bindSyntheticFixtureContext(", "async function loadEmailTestRaffleFixture(")}
    ${section(source, "async function buildRaffleOffer(", "function consentText(")}
    ${section(source, "async function optInToRaffle(", "async function getVendorRaffleDashboard(")}
    ${section(source, "function offerSnapshotHasAcceptedTerms(", "function offerSnapshotIsEnterable(").replace("function offerSnapshotHasAcceptedTerms", "function actualOfferAccepted")}
    ${section(source, "function isSettingsEnterable(", "function ").replace("function isSettingsEnterable", "function actualSettingsEnterable")}
    function mutationRoute(action:string,reviewFixture:any){${section(source, "      if (reviewFixture?.synthetic_fixture_setup_id", '      if (action === "draw_result_get") {')}return null;}
    return {loadAppReviewRaffleFixture,buildRaffleOffer,optInToRaffle,mutationRoute,actualOfferAccepted,actualSettingsEnterable};}`;
  const module = await import(`data:application/typescript,${encodeURIComponent(code)}`);
  return { api: module.default(deps), data, tables, fixtureReads: () => fixtureReads,
    useLegacyParticipant: () => legacyParticipant = true,
    setExisting: (value: unknown) => existing = value, failSetup: () => setupError = new Error("Dependency unavailable"),
    useProduction: () => { productionReady = true; delete data.fixture.synthetic_fixture_setup_id; delete data.settings.synthetic_fixture_setup_id; delete data.snapshot.synthetic_fixture_setup_id; } };
}

for (const endpoint of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
  Deno.test(`${endpoint} executes named display-only offer and refuses direct Yes before writes`, async () => {
    const h = await endpointHarness(endpoint), vendor = { id: "38970", name: SYNTHETIC_FIXTURE_VENDOR_NAME }, user = { user_id: "38971" };
    const offer = await h.api.buildRaffleOffer(vendor, user, h.data.fixture.event_key, h.data.fixture);
    assertEquals(offer.vendor_name, SYNTHETIC_FIXTURE_VENDOR_NAME);
    assertEquals(offer.vendor_offer_version, h.data.setup.vendor_offer_version);
    assertEquals(offer.prize_approx_value_cad, 0);
    assertEquals(offer.participant_responsibility_disclosure, SYNTHETIC_FIXTURE_DISCLOSURE);
    assertEquals([offer.app_review_fixture, offer.outbound_email_suppressed, offer.display_only, offer.entry_allowed, offer.legal_acceptance], [true, true, true, false, false]);
    assertEquals(h.api.actualSettingsEnterable(h.data.settings, h.data.fixture), false);
    assertEquals(h.api.actualOfferAccepted(h.data.snapshot), false);
    const entered = await h.api.optInToRaffle(vendor, user, { consent: true }, h.data.fixture.event_key, h.data.fixture);
    assertEquals(entered.entered, false); assertEquals(entered.code, "synthetic_fixture_display_only");
    assertEquals(h.tables, ["qr_bingo_raffle_entries"]);
    h.setExisting({ id: "preserved-history" });
    assertEquals(await h.api.buildRaffleOffer(vendor, user, h.data.fixture.event_key, h.data.fixture), null);
  });
  Deno.test(`${endpoint} executes every synthetic mutation guard while leaving read-only paths available`, async () => {
    const h = await endpointHarness(endpoint);
    for (const action of ["raffle_opt_in", "vendor_raffle_update", "vendor_raffle_draw", "vendor_raffle_replace", "vendor_raffle_review", "vendor_raffle_entry_update", "vendor_raffle_send_notice"]) {
      const result = h.api.mutationRoute(action, h.data.fixture);
      assertEquals(result.status, 403); assertEquals(result.body.code, "synthetic_fixture_display_only");
      assertEquals(h.api.mutationRoute(action, null), null);
    }
    for (const action of ["list", "scan", "raffle_offer", "contact_profile_get", "vendor_raffle_get"]) assertEquals(h.api.mutationRoute(action, h.data.fixture), null);
    assertEquals(h.tables, []);
  });
  Deno.test(`${endpoint} loads valid authoritative setup without widening the approved couple`, async () => {
    const h = await endpointHarness(endpoint);
    assertEquals((await h.api.loadAppReviewRaffleFixture("38971")).synthetic_setup.id, h.data.setup.id);
    assertEquals(h.fixtureReads(), 1);
    await assertRejects(() => h.api.loadAppReviewRaffleFixture("39077"), Error, "Synthetic fixture context");
  });
  for (const invalid of ["disabled", "expired", "missing setup", "dependency failed"]) {
    Deno.test(`${endpoint} ${invalid} binding fails before any production fallback`, async () => {
      const h = await endpointHarness(endpoint);
      if (invalid === "disabled") h.data.fixture.enabled = false;
      if (invalid === "expired") h.data.fixture.expires_at = "2020-01-01T00:00:00Z";
      if (invalid === "missing setup") h.data.setup.id = undefined;
      if (invalid === "dependency failed") h.failSetup();
      await assertRejects(() => h.api.loadAppReviewRaffleFixture("38971"));
      assertEquals(h.fixtureReads(), 1);
      assertEquals(h.tables, ["app_review_raffle_fixtures", "qr_bingo_synthetic_fixture_setups"]);
    });
  }
  Deno.test(`${endpoint} preserves the unrelated old participant after primary mapping supersession`, async () => {
    const h = await endpointHarness(endpoint); h.useLegacyParticipant();
    const fixture = await h.api.loadAppReviewRaffleFixture("38809");
    assertEquals(fixture.id, SYNTHETIC_FIXTURE_PREVIOUS_ID);
    assertEquals(fixture.event_key, SYNTHETIC_FIXTURE_PREVIOUS_EVENT_KEY);
    assertEquals(fixture.authenticated_couple_bd_user_id, "38809");
    assertEquals(fixture.enabled, true); assertEquals(fixture.suppress_outbound_email, true);
    assertEquals(fixture.synthetic_fixture_setup_id, null);
    assertEquals(h.tables, ["app_review_raffle_fixtures", "app_review_raffle_fixture_participants", "app_review_raffle_fixtures"]);
  });
  Deno.test(`${endpoint} still requires existing production readiness and preserves real-offer wire`, async () => {
    const h = await endpointHarness(endpoint), vendor = { id: "23608", name: "Existing vendor" }, user = { user_id: "70000" };
    delete h.data.fixture.synthetic_fixture_setup_id; delete h.data.settings.synthetic_fixture_setup_id; delete h.data.snapshot.synthetic_fixture_setup_id;
    assertEquals(await h.api.buildRaffleOffer(vendor, user, config.event_key), null);
    h.useProduction();
    const offer = await h.api.buildRaffleOffer(vendor, user, config.event_key);
    assertEquals(offer.display_only, undefined); assertEquals(offer.prize_approx_value_cad, 100);
    assertEquals(offer.participant_responsibility_disclosure, "Existing genuine terms unchanged");
  });
}
