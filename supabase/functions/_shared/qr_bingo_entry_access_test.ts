import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  QR_CURRENT_SCAN_SENTENCE,
  QR_ENTRY_ACCESS_POLICY_DISCLOSURE,
  QR_ENTRY_ACCESS_POLICY_VERSION,
  QR_PRIOR_BOOTH_SENTENCE,
  qrBingoEffectiveEntryDisclosure,
  qrBingoEntryOpensAt,
  qrBingoEntryReadiness,
  qrBingoVendorDrawScannedIds,
} from "./qr_bingo_entry_access.ts";

const now = Date.parse("2026-09-11T12:00:00Z");
const config = {
  history_starts_at: "2026-10-18T15:00:00Z",
  entry_closes_at: "2026-10-18T19:00:00Z",
  scan_enabled: true,
  scan_open_early: true,
  scan_early_access_starts_at: "2026-09-08T12:00:00Z",
  vendor_draws_enabled: true,
  event_key: "offline-entry",
  revision: 15,
};
const oldDisclosure =
  `Vendor terms. ${QR_PRIOR_BOOTH_SENTENCE} Privacy and marketing terms.`;

Deno.test("server entry policy changes exactly the access sentence without claiming early physical attendance", () => {
  assertEquals(
    qrBingoEffectiveEntryDisclosure(oldDisclosure),
    `Vendor terms. ${QR_CURRENT_SCAN_SENTENCE} Privacy and marketing terms.`,
  );
  assertEquals(qrBingoEffectiveEntryDisclosure("unknown old terms"), null);
  assertEquals(
    qrBingoEffectiveEntryDisclosure(oldDisclosure + QR_PRIOR_BOOTH_SENTENCE),
    null,
  );
  assertEquals(qrBingoEffectiveEntryDisclosure(null), null);
});
Deno.test("qualifying progress trusts only server success and intersects exact current scanned identities", () => {
  assertEquals(
    qrBingoVendorDrawScannedIds({
      status: "success",
      vendor_draw_scanned: ["901", "901", "wrong", 902],
      in_show_scanned: [],
    }, ["901", "902"]),
    ["901"],
  );
  assertEquals(
    qrBingoVendorDrawScannedIds(
      { status: "success", in_show_scanned: ["901"] },
      ["901"],
    ),
    ["901"],
  );
  for (
    const response of [{ status: "error", vendor_draw_scanned: ["901"] }, {
      status: "success",
      vendor_draw_scanned: null,
      in_show_scanned: ["901"],
    }, { status: "success", scanned: ["901"] }]
  ) assertEquals(qrBingoVendorDrawScannedIds(response, ["901"]), []);
});
Deno.test("saved draw readiness distinguishes early-open scheduled paused disabled incomplete and closed", () => {
  const open = qrBingoEntryReadiness(config, true, true, false, now);
  assertEquals(open.entry_status, "open");
  assertEquals(open.entry_open, true);
  assertEquals(open.entry_opens_at, "2026-09-08T12:00:00.000Z");
  assertEquals(
    qrBingoEntryReadiness(
      { ...config, scan_open_early: false },
      true,
      true,
      false,
      now,
    ).entry_status,
    "scheduled",
  );
  assertEquals(
    qrBingoEntryReadiness(
      { ...config, scan_enabled: false },
      true,
      true,
      false,
      now,
    ).entry_status,
    "paused",
  );
  assertEquals(
    qrBingoEntryReadiness(config, false, true, false, now).entry_status,
    "disabled",
  );
  assertEquals(
    qrBingoEntryReadiness(config, true, false, false, now).entry_status,
    "incomplete",
  );
  assertEquals(
    qrBingoEntryReadiness(
      config,
      true,
      true,
      false,
      Date.parse(config.entry_closes_at),
    ).entry_status,
    "closed",
  );
});

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start),
    to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing actual production block ${start}`);
  return source.slice(from, to);
}
// Execute the actual scan, offer and opt-in code. Replace only I/O and unrelated
// validation dependencies; no real network, credentials, emails or writes.
async function harness(endpoint: string) {
  const source = await Deno.readTextFile(
    new URL(`../${endpoint}/index.ts`, import.meta.url),
  );
  const vendor = { id: "901", user_id: "901", name: "Fictional Vendor" };
  const user = { user_id: "701", email: "couple@example.test" };
  const snapshot = {
    vendor_bingo_id: "901",
    vendor_bd_user_id: "901",
    vendor_name: vendor.name,
    vendor_offer_version: "2026-09-10T12:00:00Z",
    participant_responsibility_disclosure_text: oldDisclosure,
    entry_closes_at: "2999-01-01T00:00:00Z",
    max_winners: 1,
    rules_version: "rules",
    eligibility_region: "Ontario",
  };
  let existing: any = null,
    scanned: string[] = [],
    qualified: string[] = [],
    enabled = true;
  const writes: any[] = [], websiteActions: string[] = [];
  const query: any = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: existing, error: null }),
    insert: async (entry: any) => {
      writes.push(entry);
      existing = { id: "entry-id", current: true, ...entry };
      return { error: null };
    },
  };
  const deps = {
    qrBingoScannerWindowOpen: () => true,
    productionShowScanWindowOpen: () => false,
    qrBingoConfig: () => config,
    getSettings: async () => ({ enabled }),
    isSettingsEnterable: (s: any) => s.enabled,
    loadCurrentVendorOfferSnapshot: async () => snapshot,
    loadVendorOfferSnapshot: async () => snapshot,
    offerSnapshotIsEnterable: () => true,
    qrBingoEffectiveEntryDisclosure,
    qrBingoEntryOpensAt,
    QR_ENTRY_ACCESS_POLICY_VERSION,
    QR_ENTRY_ACCESS_POLICY_DISCLOSURE,
    requireAdmin: () => ({ from: () => query, rpc: async (name: string, args: any) => {
      assertEquals(name, "save_qr_bingo_card_entry");
      assertEquals(args.p_entry.card_generation, 0);
      assertEquals(args.p_entry.card_reset_at, null);
      assertEquals(args.p_entry_id, existing?.id ?? null);
      writes.push(args.p_entry); existing = { id: "entry-id", current: true, ...args.p_entry };
      return { error: null };
    } }),
    archivedLegacyEntryIds: async () => new Set(),
    entryHasCurrentConsent: (row: any) => row?.current === true,
    cleanText: (value: any) => String(value || ""),
    absoluteWeddingWinUrl: () => "",
    positiveCadValue: () => 100,
    APPLE_NON_SPONSOR_DISCLAIMER: "Test disclaimer",
    ELIGIBILITY_EXCLUSIONS: "Test exclusions",
    qrContactProfile: () => ({ complete: true }),
    displayName: () => "Fictional Couple",
    qrContactEmail: (email: string) => email,
    phoneForUser: () => "5550100000",
    weddingDateForUser: () => "",
    reviewedCurrentRules: () => true,
    eligibilityAttested: () => true,
    raffleMaxWinners: () => 1,
    CONTACT_SHARE_SCOPE: "named_vendor_draw_administration",
    consentText: () => "Explicit test consent",
    drawAdministrationContactShareConsentText: () => "Explicit test sharing",
    vendorMarketingConsentText: () => "Explicit test marketing",
    postQrAction: async (_cookies: any, body: URLSearchParams) => {
      websiteActions.push(body.get("action")!);
      scanned = [vendor.id];
      qualified = [vendor.id];
      return { status: "success" };
    },
    getFreshScanned: async () => ({
      scanned,
      inShowScanned: [],
      vendorDrawScanned: qualified,
    }),
    jsonResponse: (body: any, status = 200) => ({ body, status }),
  };
  const code =
    `type QrVendor=any;type BdRow=any;type IsolatedRaffleFixture=any;type RaffleEntry=any;type VendorOfferSnapshot=any;
    export default function(deps:any){const {${
      Object.keys(deps).join(",")
    }}=deps;
    ${
      section(
        source,
        "async function buildRaffleOffer(",
        "function consentText(",
      )
    }
    ${
      section(
        source,
        "async function optInToRaffle(",
        "async function getVendorRaffleDashboard(",
      )
    }
    async function scan(body:any,user:any,vendor:any,scanned:any){const action='scan',page={vendors:[vendor],scanned},reviewFixture=null,isReviewCouple=false,cookieJar=new Map(),cardState={event_key:qrBingoConfig().event_key,couple_id:String(user.user_id),generation:0,scan_reset_after:null};
      ${
      section(
        source,
        '      if (action === "scan") {',
        '      if (action === "raffle_offer") {',
      )
    } }
    return {scan,buildRaffleOffer,optInToRaffle};}`;
  const module = await import(
    `data:application/typescript,${encodeURIComponent(code)}`
  );
  const api = module.default(deps);
  return {
    api,
    vendor,
    user,
    snapshot,
    writes,
    websiteActions,
    scan: () => api.scan({ vendor_id: vendor.id }, user, vendor, scanned),
    setEnabled: (value: boolean) => enabled = value,
  };
}

for (const endpoint of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
  Deno.test(`${endpoint}: fresh and repeat early scans offer explicit entry without creating an entry`, async () => {
    const h = await harness(endpoint);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await h.scan();
      assertEquals(response.body.raffle_offer.vendor_id, h.vendor.id);
      assertEquals(response.body.vendor_draw_scanned, [h.vendor.id]);
      assertEquals(response.body.in_show_scanned, []);
      assertEquals(
        response.body.raffle_offer.entry_access_policy_version,
        QR_ENTRY_ACCESS_POLICY_VERSION,
      );
      assertEquals(
        response.body.raffle_offer.participant_responsibility_disclosure,
        qrBingoEffectiveEntryDisclosure(oldDisclosure),
      );
      assertEquals(h.writes.length, 0);
    }
    assertEquals(h.websiteActions, ["scan_vendor", "scan_vendor"]);
  });
  Deno.test(`${endpoint}: explicit Yes applies server policy without another acknowledgement; later scans suppress the offer`, async () => {
    const h = await harness(endpoint);
    await h.scan();
    const body = {
      vendor_offer_version: h.snapshot.vendor_offer_version,
      participant_responsibility_disclosure: qrBingoEffectiveEntryDisclosure(
        oldDisclosure,
      ),
      promotion_responsibility_acknowledged: true,
      draw_administration_contact_share_acknowledged: true,
      vendor_marketing_consent_acknowledged: true,
    };
    assertEquals(
      (await h.api.optInToRaffle(h.vendor, h.user, {
        ...body,
        vendor_marketing_consent_acknowledged: false,
      })).entered,
      false,
    );
    assertEquals(h.writes.length, 0);
    const entered = await h.api.optInToRaffle(h.vendor, h.user, {
      ...body,
      entry_access_policy_version: "client-cannot-set-this",
      entry_access_policy_disclosure: "client-cannot-set-this",
      entry_access_applied_at: "1900-01-01T00:00:00Z",
      entry_access_acknowledged: false,
    });
    assertEquals(entered.entered, true);
    assertEquals(h.writes.length, 1);
    assertEquals(h.writes[0].in_show_scan_verified, null);
    assertEquals(h.writes[0].vendor_draw_scan_verified, true);
    assertEquals(h.writes[0].vendor_draw_scan_config_revision, 15);
    assertEquals(
      h.writes[0].entry_access_policy_version,
      QR_ENTRY_ACCESS_POLICY_VERSION,
    );
    assertEquals(
      h.writes[0].entry_access_policy_disclosure,
      QR_ENTRY_ACCESS_POLICY_DISCLOSURE,
    );
    assertEquals(
      h.writes[0].entry_access_applied_at,
      h.writes[0].vendor_draw_scan_verified_at,
    );
    assertEquals(Object.hasOwn(h.writes[0], "entry_access_accepted_at"), false);
    assertEquals((await h.scan()).body.raffle_offer, null);
    assertEquals(h.writes.length, 1);
  });
  Deno.test(`${endpoint}: a vendor switching its draw off prevents an invitation and new entry`, async () => {
    const h = await harness(endpoint);
    h.setEnabled(false);
    assertEquals((await h.scan()).body.raffle_offer, null);
    assertEquals(
      (await h.api.optInToRaffle(h.vendor, h.user, {})).entered,
      false,
    );
    assertEquals(h.writes.length, 0);
  });
}
