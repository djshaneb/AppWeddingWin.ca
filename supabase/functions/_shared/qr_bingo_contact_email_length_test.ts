import { qrBingoEffectiveEntryDisclosure, QR_ENTRY_ACCESS_POLICY_VERSION, QR_ENTRY_ACCESS_POLICY_DISCLOSURE, QR_PRIOR_BOOTH_SENTENCE } from "./qr_bingo_entry_access.ts";
import { normalizeContactEmail } from "./contact_email.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing production block: ${start}`);
  return source.slice(from, to);
}

function emailWithLength(length: number) {
  // Local part and every DNS label remain within their individual limits.
  let remaining = length - 65 - ".invalid".length;
  const labels: string[] = [];
  while (remaining > 63) {
    labels.push("b".repeat(63));
    remaining -= 64;
  }
  labels.push("c".repeat(remaining));
  const email = `${"a".repeat(64)}@${labels.join(".")}.invalid`;
  assert(
    email.length === length,
    "Fixture must have the requested exact length",
  );
  return email;
}

// Execute the real endpoint functions with only their I/O dependencies replaced.
// No live accounts, service keys, network requests or database writes are used.
async function endpointHarness(endpoint: string) {
  const source = await Deno.readTextFile(
    new URL(`../${endpoint}/index.ts`, import.meta.url),
  );
  assert(
    source.includes(
      'import { normalizeContactEmail } from "../_shared/contact_email.ts";',
    ),
    "Both endpoints must use the shared full-address validator",
  );
  const blocks = [
    between(
      source,
      "function isolatedEmailTestRecipient(",
      "function qrDrawEmailsEnabled(",
    ),
    between(source, "function displayName(", "function vendorForCurrentUser("),
    between(
      source,
      "async function optInToRaffle(",
      "async function getVendorRaffleDashboard(",
    ),
    between(
      source,
      "async function sendDrawEmails(",
      "async function drawWinner(",
    ),
  ].join("\n");
  const module = await import(
    `data:application/typescript,${
      encodeURIComponent(`
    type BdRow = any; type QrVendor = any; type RaffleDraw = any;
    type IsolatedRaffleFixture = any; type EmailTestRaffleFixture = any;
    type MemberEmailVerification = any; type RaffleEntry = any;
    type DrawEmailClaim = any; type DrawEmailChannel = any;
    export default function(deps: any) {
      const { qrBingoEffectiveEntryDisclosure, QR_ENTRY_ACCESS_POLICY_VERSION, QR_ENTRY_ACCESS_POLICY_DISCLOSURE, normalizeContactEmail, isEmailTestFixture, cleanText,
        isApplePrivateRelayEmail, BD_API_BASE_URL, qrBingoConfig,
        getSettings, loadCurrentVendorOfferSnapshot, requireAdmin,
        archivedLegacyEntryIds, entryHasCurrentConsent, isSettingsEnterable,
        offerSnapshotIsEnterable, loadVendorOfferSnapshot, reviewedCurrentRules,
        eligibilityAttested, raffleMaxWinners, CONTACT_SHARE_SCOPE,
        consentText, drawAdministrationContactShareConsentText,
        vendorMarketingConsentText, positiveCadValue,
        hasQrBingoSkillVerification, qrDrawEmailsEnabled,
        absoluteWeddingWinUrl, hasQrBingoVendorSkillAttestation,
        claimDrawEmailDelivery, finalizeDrawEmailDelivery, sendWebsiteDrawEmails
      } = deps;
      ${blocks}
      return { qrContactEmail, qrContactProfile, isolatedEmailTestRecipient,
        optInToRaffle, sendDrawEmails };
    }
  `)
    }`
  );
  const entries: Record<string, unknown>[] = [];
  const deliveries: Record<string, string>[] = [];
  const claims: string[] = [];
  const drawUpdates: unknown[] = [];
  const config = {
    event_key: "offline-email-length",
    revision: 1,
    send_vendor_email: true,
    send_couple_email: true,
    email_delivery_mode: "verified_fulfillment",
    vendor_email_subject: "Test",
    couple_email_subject: "Test",
  };
  const snapshot = {
    vendor_bingo_id: "vendor",
    vendor_bd_user_id: "vendor",
    vendor_name: "Offline Test Vendor",
    vendor_offer_version: "current",
    max_winners: 1,
    entry_closes_at: "2999-01-01T00:00:00.000Z",
    participant_responsibility_disclosure_text: QR_PRIOR_BOOTH_SENTENCE,
    rules_version: "current",
    eligibility_region: "Canada",
  };
  let existingEntry: Record<string, unknown> | null = null;
  const query = (table: string): any => ({
    select: () => query(table),
    eq: () => query(table),
    maybeSingle: async () => ({ data: existingEntry, error: null }),
    insert: async (payload: Record<string, unknown>) => {
      assert(
        table === "qr_bingo_raffle_entries",
        "Only the expected entry write is mocked",
      );
      entries.push(payload);
      return { error: null };
    },
    update: (payload: Record<string, unknown>) => ({
      eq: async () => {
        if (table === "qr_bingo_raffle_entries") entries.push(payload);
        else {
          assert(table === "qr_bingo_raffle_draws", "Unexpected table");
          drawUpdates.push(payload);
        }
        return { error: null };
      },
    }),
  });
  const api = module.default({
    qrBingoEffectiveEntryDisclosure, QR_ENTRY_ACCESS_POLICY_VERSION, QR_ENTRY_ACCESS_POLICY_DISCLOSURE,
    normalizeContactEmail,
    isEmailTestFixture: (fixture: any) =>
      Boolean(fixture?.event_key?.startsWith("email-test-")),
    cleanText: (value: unknown, limit = 500) =>
      String(value ?? "").trim().slice(0, limit),
    isApplePrivateRelayEmail: (email: string) =>
      email.endsWith("@privaterelay.appleid.com"),
    BD_API_BASE_URL: "https://www.weddingwin.ca",
    qrBingoConfig: () => config,
    getSettings: async () => ({}),
    loadCurrentVendorOfferSnapshot: async () => snapshot,
    requireAdmin: () => ({ from: query }),
    archivedLegacyEntryIds: async () => new Set(),
    entryHasCurrentConsent: (entry: any) => Boolean(entry?.current),
    isSettingsEnterable: () => true,
    offerSnapshotIsEnterable: () => true,
    loadVendorOfferSnapshot: async () => snapshot,
    reviewedCurrentRules: () => true,
    eligibilityAttested: () => true,
    raffleMaxWinners: (value: number) => value,
    CONTACT_SHARE_SCOPE: "named_vendor",
    consentText: () => "Explicit test consent",
    drawAdministrationContactShareConsentText: () =>
      "Explicit test share consent",
    vendorMarketingConsentText: () => "Explicit test marketing consent",
    positiveCadValue: () => 1,
    hasQrBingoSkillVerification: () => true,
    qrDrawEmailsEnabled: () => true,
    absoluteWeddingWinUrl: () => "",
    hasQrBingoVendorSkillAttestation: () => true,
    claimDrawEmailDelivery: async (_id: string, channel: string) => {
      claims.push(channel);
      return {
        channel,
        status: "claimed",
        delivery_key: "offline",
        claim_token: "offline",
        prize_snapshot: { prize_title: "Current prize", prize_description: "Current prize description", prize_approx_value_cad: 100, vendor_offer_version: "current" },
      };
    },
    finalizeDrawEmailDelivery: async () => {},
    sendWebsiteDrawEmails: async (payload: Record<string, string>) => {
      deliveries.push(payload);
      return {
        vendor: { sent: true, error: "" },
        couple: { sent: true, error: "" },
      };
    },
  });
  const user = (email: string) => ({
    user_id: "couple",
    first_name: "Test",
    last_name: "Couple",
    email,
    phone_number: "2895550123",
    wedding_date: "",
  });
  const body = {
    vendor_offer_version: "current",
    promotion_responsibility_acknowledged: true,
    draw_administration_contact_share_acknowledged: true,
    vendor_marketing_consent_acknowledged: true,
    participant_responsibility_disclosure: qrBingoEffectiveEntryDisclosure(QR_PRIOR_BOOTH_SENTENCE),
  };
  const draw = (email: string) => ({
    id: "offline-draw",
    event_key: config.event_key,
    vendor_bingo_id: "vendor",
    vendor_bd_user_id: "vendor",
    couple_bd_user_id: "couple",
    winner_email: email,
    winner_name: "Test Couple",
    vendor_name: "Offline Test Vendor",
    selection_status: "verified",
    eligibility_verified_at: "2026-01-01",
    winner_rules_confirmed_at: "2026-01-01",
    verification_notes: "Offline proof",
    verified_at: "2026-01-01",
  });
  return {
    ...api,
    entries,
    deliveries,
    claims,
    drawUpdates,
    config,
    user,
    body,
    draw,
    setExisting: (entry: Record<string, unknown> | null) => {
      existingEntry = entry;
    },
  };
}

async function rejects(action: () => Promise<unknown>, message: string) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

for (const endpoint of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
  for (const length of [160, 161, 195, 254]) {
    Deno.test(`${endpoint}: ${length}-character email survives contact, entry, and both notice paths`, async () => {
      const h = await endpointHarness(endpoint);
      const email = emailWithLength(length);
      const input = `  ${email.toUpperCase()}  `;
      assert(
        h.qrContactProfile(h.user(input)).complete,
        "Full valid address passes the contact gate",
      );
      const entry = await h.optInToRaffle(
        { id: "vendor" },
        h.user(input),
        h.body,
      );
      assert(
        entry.entered && h.entries.length === 1,
        "Actual opt-in path writes one entry",
      );
      assert(
        h.entries[0].couple_email === email,
        "Stored consent snapshot preserves the entire address",
      );
      assert(
        h.entries[0].couple_wedding_date === "",
        "Blank wedding date stays optional",
      );
      const sent = await h.sendDrawEmails({ email: input }, h.draw(input), {});
      assert(
        sent.complete && h.deliveries.length === 1,
        "Actual send path succeeds once",
      );
      const payload = h.deliveries[0];
      assert(
        payload.vendor_to === email && payload.couple_to === email,
        "Neither recipient is truncated",
      );
      assert(
        payload.vendor_text.includes(`Email: ${email}\n`),
        "Displayed winner email is complete",
      );
      assert(
        h.claims.join(",") === "vendor,couple",
        "Both normal delivery claims are preserved",
      );
    });
  }

  Deno.test(`${endpoint}: invalid addresses cannot become a stored or delivered truncated recipient`, async () => {
    const invalid = [
      emailWithLength(255),
      "",
      "not-an-email",
      "a@example.invalid\r\nBcc: other@example.invalid",
      "a\0@example.invalid",
      "a@example.invalid\n",
      "\ta@example.invalid",
      "a\u007f@example.invalid",
      "a,b@example.invalid",
      "a;b@example.invalid",
      "<a@example.invalid>",
      "a@example.invalid other@example.invalid",
    ];
    for (const email of invalid) {
      const h = await endpointHarness(endpoint);
      assert(
        !h.qrContactProfile(h.user(email)).complete,
        "Invalid input fails the contact gate",
      );
      const entry = await h.optInToRaffle(
        { id: "vendor" },
        h.user(email),
        h.body,
      );
      assert(
        entry.profile_incomplete && h.entries.length === 0,
        "Invalid input cannot write an entry",
      );
      await rejects(
        () =>
          h.sendDrawEmails(
            { email: "vendor@example.invalid" },
            h.draw(email),
            {},
          ),
        "Invalid winner cannot send",
      );
      await rejects(
        () => h.sendDrawEmails({ email }, h.draw("couple@example.invalid"), {}),
        "Invalid vendor cannot send",
      );
      assert(
        h.claims.length === 0 && h.deliveries.length === 0 &&
          h.drawUpdates.length === 0,
        "Invalid recipient fails before any delivery claim, transport or record mutation",
      );
    }
  });

  Deno.test(`${endpoint}: long test-recipient allowlists remain exact and couple-only`, async () => {
    const email = emailWithLength(254);
    const fixture = {
      id: "offline-fixture",
      event_key: "email-test-offline",
      expires_at: "2999-01-01T00:00:00Z",
      vendor_bingo_id: "vendor",
      vendor_bd_user_id: "vendor",
      couple_bd_user_id: "couple",
      outbound_recipient_email: email,
    };
    const h = await endpointHarness(endpoint);
    const draw = { ...h.draw(email), event_key: fixture.event_key };
    await h.sendDrawEmails(undefined, draw, {}, undefined, fixture);
    assert(
      h.deliveries[0].couple_to === email &&
        h.deliveries[0].send_vendor === "0" &&
        h.claims.join(",") === "couple",
      "Test delivery stays pinned and suppresses the vendor copy",
    );
    for (
      const field of [
        "event_key",
        "vendor_bingo_id",
        "vendor_bd_user_id",
        "couple_bd_user_id",
        "winner_email",
      ]
    ) {
      const probe = await endpointHarness(endpoint);
      await rejects(
        () =>
          probe.sendDrawEmails(
            undefined,
            {
              ...draw,
              [field]: field === "winner_email" ? `x${email}` : "different",
            },
            {},
            undefined,
            fixture,
          ),
        "No fixture identity or recipient mismatch may pass",
      );
      assert(
        probe.claims.length === 0 && probe.deliveries.length === 0,
        "Mismatch is blocked before delivery",
      );
    }
    assert(
      h.isolatedEmailTestRecipient({
        ...fixture,
        outbound_recipient_email: `x${email}`,
      }) === "",
      "Overlength fixture target is rejected, never truncated into an allowlisted target",
    );
    assert(
      h.isolatedEmailTestRecipient({
        ...fixture,
        outbound_recipient_email: `${email}\n`,
      }) === "",
      "Fixture target controls are rejected before trimming",
    );
  });

  Deno.test(`${endpoint}: retries retain consent and QR contacts do not inherit account email proof`, async () => {
    const h = await endpointHarness(endpoint);
    const email = emailWithLength(195);
    h.setExisting({ id: "existing", current: true });
    const entry = await h.optInToRaffle(
      { id: "vendor" },
      h.user(email),
      h.body,
    );
    assert(
      entry.already_entered && !h.entries.length,
      "Already-current consent is not silently overwritten",
    );
    assert(
      h.qrContactProfile(h.user(email), { email_confirmation_required: true })
        .complete,
      "A pending account email must not block independently collected QR contacts",
    );
    assert(
      !h.qrContactProfile(h.user("relay@privaterelay.appleid.com")).complete,
      "Relay contact gate is unchanged",
    );
    h.config.send_vendor_email = false;
    await h.sendDrawEmails(undefined, h.draw(email), {});
    assert(
      h.deliveries[0].couple_to === email && h.claims.join(",") === "couple",
      "Disabled vendor mail does not require or send to an unrelated vendor address",
    );
    const retry = await endpointHarness(endpoint);
    await retry.sendDrawEmails(undefined, {
      ...retry.draw(email),
      vendor_email_sent_at: "2026-01-01",
    }, {});
    assert(
      retry.claims.join(",") === "couple",
      "Completed vendor delivery is not retried or revalidated",
    );
    const blocked = await endpointHarness(endpoint);
    await rejects(
      () =>
        blocked.sendDrawEmails({ email }, {
          ...blocked.draw(email),
          selection_status: "potential",
        }, {}),
      "Selecting a potential winner still cannot bypass verification",
    );
    assert(
      !blocked.claims.length && !blocked.deliveries.length,
      "Unverified draws have no side effects",
    );
  });
}
