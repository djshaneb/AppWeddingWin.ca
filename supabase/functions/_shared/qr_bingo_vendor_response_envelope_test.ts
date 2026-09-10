// Execute actual Edge response builders against in-memory dependencies only.
// No environment, Supabase, credential, email transport, or network permission.
const endpointUrls = [
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
const id = "12345678-1234-4123-8123-123456789001";
const nextId = "12345678-1234-4123-8123-123456789002";
const vendor = { id: "90901", user_id: "90901", name: "Fictional test vendor" };
const user = { user_id: vendor.id };
const event = "app-review-offline-response-test";
const config = {
  event_key: event, revision: 1, rules_version: "rules-test", official_rules_url: "https://www.weddingwin.ca/vendor-draw-rules",
  send_vendor_email: false, send_couple_email: true,
};
const settings = {
  max_winners: 2, enabled: true, legal_terms_accepted: true,
  legal_terms_version: config.rules_version, legal_terms_accepted_at: "2026-09-05T00:00:00Z",
  rules_viewed_at: "2026-09-05T00:00:00Z", apple_non_sponsor_acknowledged: true,
  vendor_responsibility_acknowledged: true, vendor_responsibility_version: config.rules_version,
  vendor_responsibility_acknowledged_at: "2026-09-05T00:00:00Z",
  vendor_responsibility_disclosure_text: "Vendor responsibilities",
  participant_responsibility_disclosure_text: "Participant responsibilities",
};
const selected = { id, selection_status: "potential", couple_bd_user_id: "90902" };
const verified = { ...selected, selection_status: "verified", winner_rules_confirmed_at: "2026-09-05T00:00:00Z", verification_notes: "TEST ONLY evidence" };
const modes = ["select", "replace", "no-alternative", "send", "suppressed", "confirm-send", "confirm-suppressed", "confirm-missing", "confirm-false", "confirm-replaced", "confirm-send-failure", "confirm-disabled", "confirm-duplicate"] as const;

async function harness(url: URL, mode: typeof modes[number]) {
  const source = await Deno.readTextFile(url);
  const builders = [
    section(source, "async function getVendorRaffleDashboard(", "async function loadQrDrawEmailSigningKey("),
    section(source, "async function drawWinner(", "async function replacePotentialWinner("),
    section(source, "async function replacePotentialWinner(", "async function reviewPotentialWinner("),
    section(source, "async function sendVerifiedWinnerNotice(", "Deno.serve("),
  ];
  const rows: Record<string, unknown>[] = [mode === "send" || mode === "suppressed" ? { ...verified } : { ...selected }];
  if (mode === "confirm-replaced") rows[0].selection_status = "replaced";
  let sendCalls = 0;
  let deliveryAttempts = 0;
  const rpcCalls: string[] = [];
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: () => Promise.resolve({ data: rows[0], error: null }),
    single: () => Promise.resolve({ data: rows[0], error: null }),
  };
  const dependencies = {
    ensureSettings: async () => settings,
    loadVendorEntryPool: async () => ({ entry_count: 2, eligible_entry_count: 1, selection_in_progress: rows.some(row => row.selection_status === "potential") }),
    activeVendorEntryCount: async () => 2, activatedVendorOfferExists: async () => true,
    vendorPrizeDetailsLock: async () => rows.some(row => row.couple_email_sent_at) ? "sent" : null,
    alternateEntryClosureStatus: async () => ({ ready: true }), loadVendorDrawRows: async () => rows,
    raffleMaxWinners: (value: number) => value, drawAvailableAt: () => "2026-09-01T00:00:00Z",
    isolatedEmailTestRecipient: () => null, qrBingoConfig: () => config,
    qrDrawEmailsEnabled: () => mode !== "confirm-disabled", isolatedFixturePurpose: () => "app_review",
    vendorResponsibilityDisclosure: () => "Vendor responsibilities",
    participantResponsibilityDisclosure: () => "Participant responsibilities",
    cleanText: (value: unknown, length: number) => String(value || "").trim().slice(0, length),
    vendorVisibleDraw: (draw: Record<string, unknown>) => ({ ...draw }), isSettingsEnterable: () => true,
    RAFFLE_ADMINISTRATOR: "Wedding Win Inc.", APPLE_NON_SPONSOR_DISCLAIMER: "Not sponsored by Apple",
    ODDS_BASIS: "Eligible entries",
    newSkillTestingChallenge: async () => ({ prompt: "TEST ONLY", salt: "test-only", answerHash: "test-only" }),
    jsonResponse: (body: Record<string, unknown>, status = 200) => ({ body, status }),
    requireAdmin: () => ({
      from: () => query,
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push(name);
        assert(args.p_vendor_bingo_id === vendor.id && args.p_vendor_bd_user_id === vendor.id, "RPC identity must remain server-scoped");
        if (name === "confirm_qr_bingo_winner_checks_for_notice") {
          assert(args.p_winner_checks_confirmed === true, "Confirmation RPC requires explicit true");
          assert(args.p_confirmed_by === `vendor:${vendor.id}:${vendor.name}`, "Confirmation actor comes from the authorized account");
          assert(!("p_notes" in args) && !("p_skill_question_answer" in args), "The client must not invent evidence or an answer");
          Object.assign(rows[0], verified);
          return { data: rows[0], error: null };
        }
        if (mode === "no-alternative") return { data: { ok: false, code: "no_replacement_available", error: "No other eligible couple" }, error: null };
        if (mode === "replace") {
          rows[0].selection_status = "replaced";
          rows.push({ id: nextId, selection_status: "potential", couple_bd_user_id: "90903" });
        }
        return { data: { ok: true, draw: rows.at(-1), eligible_entry_count: 1 }, error: null };
      },
    }),
    hasQrBingoSkillVerification: () => true, loadQrDrawEmailSigningKey: async () => "offline-test-only",
    sendDrawEmails: async () => {
      sendCalls += 1;
      if (mode === "confirm-send-failure") throw new Error("Offline transport failure");
      if (!rows[0].couple_email_sent_at) {
        deliveryAttempts += 1;
        rows[0].couple_email_sent_at = "2026-09-05T00:00:00Z";
      }
      return { complete: true };
    },
  };
  const moduleSource = `type QrVendor=any; type BdRow=any; type IsolatedRaffleFixture=any; type RaffleDraw=any;\nexport default function(deps:any) { const { ${Object.keys(dependencies).join(",")} } = deps; ${builders.join("\n")} return { drawWinner, replacePotentialWinner, sendVerifiedWinnerNotice }; }`;
  const module = await import(`data:application/typescript,${encodeURIComponent(moduleSource)}`);
  const actions = module.default(dependencies);
  const body = { draw_id: id, ...(mode === "confirm-false" ? { winner_checks_confirmed: false }
    : mode.startsWith("confirm-") && mode !== "confirm-missing" ? { winner_checks_confirmed: true } : {}) };
  const result = mode === "select"
    ? await actions.drawWinner(vendor, user, "initial", event, true, false, {})
    : mode === "replace" || mode === "no-alternative"
    ? await actions.replacePotentialWinner(vendor, user, { draw_id: id }, event, true, false, {})
    : await actions.sendVerifiedWinnerNotice(vendor, user, body, event, true, mode === "suppressed" || mode === "confirm-suppressed", {});
  if (mode === "confirm-duplicate") {
    const retry = await actions.sendVerifiedWinnerNotice(vendor, user, body, event, true, false, {});
    assert(retry.status === 200 && retry.body.vendor?.id === vendor.id, "Repeated Send should return the current trusted dashboard");
  }
  return { result, sendCalls, deliveryAttempts, rpcCalls, rows };
}

for (const mode of modes) {
  Deno.test(`actual vendor ${mode} response includes the complete trusted dashboard envelope`, async () => {
    for (const url of endpointUrls) {
      const { result, sendCalls, deliveryAttempts, rpcCalls, rows } = await harness(url, mode);
      const data = result.body;
      assert(data.vendor?.id === vendor.id && data.vendor?.user_id === vendor.id, `${mode}: missing authorized vendor`);
      assert(data.settings && data.event_key === event && data.rules_version === config.rules_version, `${mode}: incomplete native dashboard`);
      assert(Array.isArray(data.draws) && Number.isInteger(data.remaining_winner_slots), `${mode}: missing current draw state`);
      const expectedSends = mode === "confirm-duplicate" ? 2 : ["send", "confirm-send", "confirm-send-failure"].includes(mode) ? 1 : 0;
      assert(sendCalls === expectedSends, `${mode}: unexpected email transport`);
      if (mode === "replace") {
        assert(result.status === 200 && data.replacement_selected && data.draw.id === nextId, "Replacement must identify the new pending draw");
        assert(data.draws[0].selection_status === "replaced" && data.draws[1].selection_status === "potential", "History and fresh pending selection must both be present");
        assert(rpcCalls.length === 1 && rpcCalls[0] === "replace_qr_bingo_potential_winner_by_vendor", "Replacement must be one atomic RPC");
      }
      if (mode === "no-alternative") {
        assert(result.status === 409 && data.code === "no_replacement_available", "No replacement must be a stable conflict");
        assert(rows.length === 1 && rows[0].id === id && rows[0].selection_status === "potential", "Keep the existing potential winner when no alternative exists");
      }
      if (mode === "suppressed") assert(data.suppressed_test_complete && !data.verified_winner_notice, "Suppressed fixture must not claim a delivery");
      if (["confirm-send", "confirm-suppressed", "confirm-send-failure", "confirm-duplicate"].includes(mode)) {
        assert(rows[0].selection_status === "verified", "Send confirmation must commit verified state before transport");
        assert(rpcCalls.filter(name => name === "confirm_qr_bingo_winner_checks_for_notice").length === 1,
          "One pending selection should be confirmed once; an email retry must not overwrite evidence");
      }
      if (mode === "confirm-missing" || mode === "confirm-false" || mode === "confirm-disabled") {
        assert(result.status === (mode === "confirm-disabled" ? 503 : 400), "Refuse absent/false confirmation or unavailable mail mode");
        assert(rows[0].selection_status === "potential" && rpcCalls.length === 0, "Refused Send must not verify or mutate the selection");
      }
      if (mode === "confirm-replaced") assert(result.status === 409 && rpcCalls.length === 0, "A stale replaced selection cannot be confirmed or sent");
      if (mode === "confirm-send-failure") assert(result.status === 502 && data.draws[0].selection_status === "verified" && !rows[0].couple_email_sent_at,
        "Transport failure must return the saved confirmation and permit a safe email retry");
      if (mode === "confirm-duplicate") assert(deliveryAttempts === 1, "Duplicate Send uses the existing idempotent transport without a second delivery attempt");
      if (mode === "confirm-suppressed") assert(data.suppressed_test_complete && !data.verified_winner_notice && deliveryAttempts === 0,
        "Explicit App Review confirmation must still suppress every email");
    }
  });
}
