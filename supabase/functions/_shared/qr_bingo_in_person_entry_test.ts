function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function includesIgnoringWhitespace(source: string, fragment: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
  return normalize(source).includes(normalize(fragment));
}

const syncUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
const adminUrl = new URL("../bd-qr-bingo-admin/index.ts", import.meta.url);
const websiteUrl = new URL(
  "../../../brilliant-directories/widgets/258-julian-qr-code-bingo.php",
  import.meta.url,
);
const vendorDashboardUrl = new URL(
  "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.php",
  import.meta.url,
);
const vendorDashboardScriptUrl = new URL(
  "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js",
  import.meta.url,
);
const adminWidgetUrl = new URL(
  "../../../brilliant-directories/widgets/ww-qr-bingo-settings.php",
  import.meta.url,
);
const retiredPageUrl = new URL(
  "../../../brilliant-directories/pages/qr-bingo-free-entry.html",
  import.meta.url,
);
const appUrl = new URL("../../../app/(tabs)/index.tsx", import.meta.url);
const policyUrl = new URL(
  "../../../lib/webview_url_policy.ts",
  import.meta.url,
);

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `${startMarker} is missing`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `${endMarker} is missing after ${startMarker}`);
  return source.slice(start, end);
}

Deno.test("website enforces the scanner schedule while retaining separate in-show draw proof", async () => {
  const website = await Deno.readTextFile(websiteUrl);
  const scanBranch = section(
    website,
    "if ($_POST['action'] === 'scan_vendor')",
    "if ($_POST['action'] === 'get_scanned')",
  );
  const fixtureExit = scanBranch.indexOf("$freshFixtureContext['completed']");
  const windowGate = scanBranch.indexOf("$scanWindowOpensAt");
  const activeVendorLookup = scanBranch.indexOf("SELECT u.user_id");
  const visitInsert = scanBranch.indexOf("INSERT INTO vendor_visits");

  assert(
    website.includes(
      "$config['history_starts_at_unix'] = $historyTimestamp;",
    ) &&
    website.includes(
      "$config['entry_closes_at_unix'] = $entryClosesTimestamp;",
    ) &&
      website.includes(
        "intval($eventConfig['scan_opens_at_unix'])",
      ) &&
      website.includes(
        "$eventScanClosesAt = date(",
      ) &&
      website.includes("$eventHistoryStartsAt = (string)$eventConfig['scan_history_starts_at_sql'];") &&
      !website.includes("- (4 * 60 * 60)"),
    "website runtime must preserve the original show start and use the separate scanner opening/history boundaries",
  );
  assert(
    fixtureExit >= 0 && windowGate > fixtureExit &&
      activeVendorLookup > windowGate && visitInsert > activeVendorLookup &&
      scanBranch.includes(
        "!ww_qr_bingo_scan_window_open($eventConfig, $scanRequestTime)",
      ) &&
      scanBranch.includes("http_response_code(403);") &&
      scanBranch.includes("'code' => 'show_scan_window_closed'") &&
      scanBranch.includes("AND rt.tag_id = '$eventTagId'") &&
      scanBranch.includes("AND rt.tag_type_id = 1") &&
      scanBranch.includes("AND u.active = 2"),
    "production website scans must fail before an active tagged-vendor lookup or visit write outside the approved scanner window",
  );
  assert(
    (website.match(/vv\.scan_date >= '\$eventHistoryStartsAt'/g) || [])
          .length >= 3 &&
      (website.match(/vv\.scan_date < '\$eventScanClosesAt'/g) || [])
          .length >= 3,
    "website progress must retain the approved scanner history floor and published closing boundary",
  );
  const scannerGate = section(website, "function ww_qr_bingo_scan_window_open(", "function ww_qr_bingo_duplicate_scan_floor(");
  assert(
    scannerGate.includes("!empty($config['scan_enabled'])") &&
      scannerGate.includes("$now < $config['entry_closes_at_unix']") &&
      scannerGate.includes("!empty($config['scan_open_early']) || $now >= $config['scan_opens_at_unix']") &&
      website.includes("'in_show_scanned' => $inShowScanned") &&
      website.includes("strtotime($row['scan_date']) >= (int)$eventConfig['history_starts_at_unix']"),
    "early access must not bypass master pause or closing, and pre-show progress must remain distinct from draw proof",
  );
});

Deno.test("website refreshes its full event snapshot once after an exact stale-config conflict", async () => {
  const website = await Deno.readTextFile(websiteUrl);
  const saveScan = section(
    website,
    "async function saveVendorScan(vendorId)",
    "async function loadScannedVendors()",
  );
  const loadScans = section(
    website,
    "async function loadScannedVendors()",
    "// --- UI Build ---",
  );
  const staleHandler = section(
    website,
    "function refreshPageAfterStaleEventConfig(response, data)",
    "function trustedWeddingWinPromotionUrl(value)",
  );
  const drawRequest = section(
    website,
    "async function requestVendorDraw(action, extra)",
    "function resetVendorDrawChoice()",
  );

  assert(
    website.includes("http_response_code(409);") &&
      website.includes("'code' => 'stale_event_config'") &&
      website.includes("'event_key' => $eventConfig['event_key']") &&
      website.includes("'revision' => $eventConfigRevision"),
    "the server must return its current trusted event identity on a stale request",
  );
  assert(
    staleHandler.includes("response.status !== 409") &&
      staleHandler.includes(
        "cleanPromotionText(data && data.code) !== 'stale_event_config'",
      ) &&
      staleHandler.includes("if (eventConfigRefreshStarted) return true;") &&
      staleHandler.includes("Number.isSafeInteger(nextRevision)") &&
      staleHandler.includes("eventConfigRefreshStarted = true;") &&
      staleHandler.includes("stopScanner();") &&
      staleHandler.includes(
        "refreshUrl.searchParams.set('ww_qr_config_revision', String(nextRevision))",
      ) &&
      staleHandler.includes("window.location.replace(refreshUrl.toString())"),
    "an exact stale conflict must stop interaction and perform one cache-busted full-page refresh",
  );
  assert(
    saveScan.includes("refreshPageAfterStaleEventConfig(response, data)") &&
      loadScans.includes("refreshPageAfterStaleEventConfig(response, data)") &&
      drawRequest.includes("refreshPageAfterStaleEventConfig(response, data)"),
    "scan saves, progress loads, and vendor draw requests must share stale-config recovery",
  );
  assert(
    !staleHandler.includes("saveVendorScan(") &&
      !staleHandler.includes("loadScannedVendors(") &&
      !staleHandler.includes("requestVendorDraw(") &&
      !website.includes("EVENT_CONFIG.revision ="),
    "stale recovery must not replay a write or combine a fresh revision with a stale roster",
  );
});

Deno.test("Edge entry follows authorized scanner access while preserving separate historical show proof", async () => {
  const sources = await Promise.all(syncUrls.map((url) => Deno.readTextFile(url)));
  for (const source of sources) {
    const scan = section(
      source,
      'if (action === "scan")',
      'if (action === "raffle_offer")',
    );
    const offer = section(
      source,
      'if (action === "raffle_offer")',
      'if (action === "raffle_opt_in")',
    );
    const optIn = section(
      source,
      'if (action === "raffle_opt_in")',
      'if (action === "vendor_raffle_get")',
    );
    assert(
      source.includes("function productionShowScanWindowOpen()") &&
        source.includes(
          "const opensAt = new Date(qrBingoConfig().history_starts_at).getTime();",
        ) &&
        source.includes(
          "const closesAt = new Date(qrBingoConfig().entry_closes_at).getTime();",
        ) &&
        source.includes("Number.isFinite(opensAt)") &&
        source.includes("Number.isFinite(closesAt)") &&
        source.includes("opensAt < closesAt") &&
        source.includes("Date.now() >= opensAt") &&
        source.includes("Date.now() < closesAt") &&
        !source.includes("PRODUCTION_SHOW_DURATION_MS"),
      "Edge production show-window helper must consume both published boundaries without deriving a duration",
    );
    assert(
      scan.indexOf("if (isReviewScan && reviewFixture)") <
          scan.indexOf("if (!qrBingoScannerWindowOpen(qrBingoConfig()))") &&
        scan.includes('code: "show_scan_window_closed"') &&
        scan.indexOf("if (!qrBingoScannerWindowOpen(qrBingoConfig()))") <
          scan.indexOf("const scanResult = await postQrAction(") &&
        scan.includes("const raffleOffer = qrBingoScannerWindowOpen(qrBingoConfig())"),
      "production scan must fail before the website write while the exact isolated fixture bypass remains available",
    );
    for (const [label, actionBranch] of [["offer", offer], ["opt-in", optIn]]) {
      assert(
        actionBranch.includes(
          "!(reviewFixture && isReviewCouple) && !qrBingoScannerWindowOpen(qrBingoConfig())",
        ) &&
          actionBranch.includes('code: "show_entry_window_closed"') &&
          actionBranch.includes("}, 403);") &&
          actionBranch.indexOf("!qrBingoScannerWindowOpen(qrBingoConfig())") <
            actionBranch.indexOf("const vendorId = String(body?.vendor_id"),
        `production ${label} must fail before vendor entry processing outside authorized scanner access`,
      );
    }
  }
});

Deno.test("native entry follows authorized scanning while preserving show and winner-selection boundaries", async () => {
  const app = await Deno.readTextFile(appUrl);
  const configType = section(
    app,
    "type QrBingoEventConfig = {",
    "type QrBingoRaffleOffer = {",
  );
  const normalizer = section(
    app,
    "function normalizeQrBingoEventConfig(",
    "function NativeQrScanner(",
  );
  assert(
    configType.includes("history_starts_at: string;") &&
      configType.includes("entry_closes_at: string;") &&
      configType.includes("scan_open_early: boolean;") &&
      configType.includes("scan_opens_at: string;") &&
      normalizer.includes(
        "const historyStartsAt = normalizedText(payload.history_starts_at, 80);",
      ) &&
      normalizer.includes(
        "const entryClosesAt = normalizedText(payload.entry_closes_at, 80);",
      ) &&
      normalizer.includes("historyStartsAtMs >= entryClosesAtMs") &&
      normalizer.includes("history_starts_at: historyStartsAt") &&
      normalizer.includes("entry_closes_at: entryClosesAt") &&
      normalizer.includes("scan_open_early: scanOpenEarly") &&
      normalizer.includes("scan_opens_at: scanOpensAt") &&
      normalizer.includes("typeof scanOpenEarly !== 'boolean'"),
    "native event configuration must retain show boundaries and validate the separate scanner controls",
  );
  const scannerGate = section(app, "function isQrBingoScanWindowOpen(", "function normalizeQrBingoEventConfig(");
  assert(
    scannerGate.includes("config.scan_enabled !== true") &&
      scannerGate.includes("Date.parse(config.scan_opens_at)") &&
      scannerGate.includes("Date.parse(config.entry_closes_at)") &&
      scannerGate.includes("nowMs < closesAt") &&
      scannerGate.includes("config.scan_open_early === true || nowMs >= opensAt") &&
      app.includes("isQrBingoScanWindowOpen(nextEventConfig, Date.now())") &&
      app.includes("nextVendorDrawScannedIds.has(vendor.id)") &&
      app.includes("vendorDrawScannedVendorIds.has(raffleOffer.vendor_id)") &&
      !app.includes("isQrBingoInShowWindow(") &&
      !app.includes("scanClosesAt - (4 * 60 * 60 * 1000)"),
    "native vendor entry must follow authorized scanning with server proof and preserve pause/close boundaries",
  );
});

Deno.test("vendor contact history stays visible while only current proven QR entries enter counts and selection", async () => {
  const sources = await Promise.all(syncUrls.map((url) => Deno.readTextFile(url)));
  for (const source of sources) {
    const historicalConsent = section(
      source,
      "function entryHasNamedVendorContactConsent(",
      "function entryHasCurrentConsent(",
    );
    const currentConsent = section(
      source,
      "function entryHasCurrentConsent(",
      "function entryHasProductionInPersonProof(",
    );
    const inPersonProof = section(
      source,
      "function entryHasProductionInPersonProof(",
      "function vendorVisibleDraw(",
    );
    const pool = section(
      source,
      "async function loadVendorEntryPool(",
      "async function vendorRaffleEntriesResponse(",
    );
    const report = section(
      source,
      "async function buildVendorParticipationReport(",
      "async function buildRaffleOffer(",
    );

    assert(
      source.includes(
        'const PREVIOUS_CONTACT_SHARING_RULES_VERSION = "2026-09-01-vendor-marketing";',
      ) &&
        source.includes(
          'const CONTACT_SHARING_RULES_VERSION = "2026-09-01-in-person-entry";',
        ) &&
        source.includes("const NAMED_VENDOR_CONTACT_RULES_VERSIONS = [") &&
        historicalConsent.includes("NAMED_VENDOR_CONTACT_RULES_VERSIONS.includes(") &&
        historicalConsent.includes(
          "entry.draw_administration_contact_share_version === consentVersion",
        ),
      "historical contact visibility must remain limited to the prior marketing and current in-person consent versions with complete matching proof",
    );
    assert(
      currentConsent.includes("entryHasNamedVendorContactConsent(entry)") &&
        currentConsent.includes(
          "entry?.consent_version === qrBingoConfig().rules_version",
        ) &&
        currentConsent.includes(
          "entry.consent_version === CONTACT_SHARING_RULES_VERSION",
        ) &&
        inPersonProof.includes(
          'entry?.entry_method === "qr_scan_opt_in"',
        ) &&
        inPersonProof.includes("entry.in_show_scan_verified === true") &&
        inPersonProof.includes("Boolean(entry.in_show_scan_verified_at)"),
      "selection eligibility must require fresh current acceptance plus exact QR method and paired in-show proof",
    );
    assert(
      pool.includes(
        '.in("consent_version", NAMED_VENDOR_CONTACT_RULES_VERSIONS)',
      ) &&
        pool.includes(
          '.in(\n          "draw_administration_contact_share_version",\n          NAMED_VENDOR_CONTACT_RULES_VERSIONS,\n        )',
        ) &&
        pool.includes("entryHasNamedVendorContactConsent(entry as RaffleEntry)") &&
        pool.includes("const currentConsent = entryHasCurrentConsent(entry);") &&
        pool.includes(
          "const productionInPersonProof = entryHasProductionInPersonProof(entry);",
        ) &&
        pool.includes(
          "const selectionEligible = currentConsent &&\n      (controlledFixture || productionInPersonProof);",
        ) &&
        pool.includes('? "reacceptance_required"') &&
        pool.includes('? "in_person_scan_required"') &&
        pool.includes("rules_version: entry.consent_version || \"\"") &&
        pool.includes(
          'in_selection_pool: selectionEligible && poolStatus === "included"',
        ),
      "contact rows and current selection eligibility must be computed separately",
    );
    assert(
      pool.includes("entry_count: rows.length") &&
        pool.includes("row.selection_eligible && row.included") &&
        pool.includes("row.selection_eligible && !row.included") &&
        pool.includes(
          "eligible_entry_count: rows.filter((row) => row.in_selection_pool).length",
        ) &&
        pool.includes(
          "historical_entry_count: rows.filter((row) => !row.selection_eligible)",
        ) &&
        source.includes("can_draw: entryPool.eligible_entry_count > 0") &&
        report.includes("const rows = pool.rows.map((entry) => [") &&
        report.includes("entry.rules_version,") &&
        !report.includes(".filter((entry) => entry.in_selection_pool)"),
      "visible/CSV counts must preserve history while eligible counts and can_draw use only the proven current pool",
    );
  }
  const [app, dashboard] = await Promise.all([
    Deno.readTextFile(appUrl),
    Deno.readTextFile(vendorDashboardScriptUrl),
  ]);
  assert(
    includesIgnoringWhitespace(
      app,
      "'reacceptance_required' | 'in_person_scan_required'",
    ) &&
      app.includes("? 'Needs to enter again'") &&
      app.includes("? 'Needs a QR scan'") &&
      app.includes("const canRestoreToPool = poolStatus === 'excluded';") &&
      dashboard.includes(
        "const reacceptanceRequired = poolStatus === 'reacceptance_required';",
      ) &&
      dashboard.includes(
        "const inPersonScanRequired = poolStatus === 'in_person_scan_required';",
      ) &&
      dashboard.includes(
        "selectionProtected = disqualified || alreadySelected || replaced || reacceptanceRequired || inPersonScanRequired",
      ) &&
      dashboard.includes("'Needs to scan and agree again'") &&
      dashboard.includes("'Needs a show scan'"),
    "native and website vendor UIs must label historical rows clearly and keep them protected from manual pool restoration",
  );
});

Deno.test("off-site offer discovery and admin reconciliation return HTTP 410", async () => {
  const [admin, ...sources] = await Promise.all([
    Deno.readTextFile(adminUrl),
    ...syncUrls.map((url) => Deno.readTextFile(url)),
  ]);
  const adminGetStart = admin.indexOf('if (action === "admin_get")');
  const retiredStart = admin.indexOf(
    'action === "declare_alternate_entry_reconciliation_complete" ||',
  );
  const legacyStart = admin.indexOf(
    'if (action === "declare_alternate_entry_reconciliation_complete")',
    retiredStart + 1,
  );
  assert(
    adminGetStart >= 0 && retiredStart > adminGetStart && legacyStart > retiredStart &&
      !admin.slice(adminGetStart, retiredStart).includes(
        "alternate_entry_operations",
      ) &&
      admin.slice(retiredStart, legacyStart).includes(
        'action === "reconcile_alternate_free_entry"',
      ) &&
      admin.slice(retiredStart, legacyStart).includes(
        'code: "offsite_entry_retired"',
      ) &&
      admin.slice(retiredStart, legacyStart).includes("}, 410);"),
    "both retired admin actions must return 410 before historical implementation code",
  );

  for (const source of sources) {
    const retired = section(
      source,
      'if (action === "alternate_free_entry_offers")',
      "if (!runtimeConfig.scan_enabled",
    );
    assert(
      retired.includes('ok: false') &&
        retired.includes('code: "offsite_entry_retired"') &&
        /\},\s*410,\s*false,?\s*\);/.test(retired) &&
        !retired.includes("publicAlternateFreeEntryOffers()") &&
        !retired.includes("offers:"),
      "public off-site offer discovery must return 410 without event state or offers",
    );
  }
});

Deno.test("live UI has no public alternate-entry form or link, while Form 354 controls remain non-rendered", async () => {
  const [page, website, dashboard, dashboardScript, adminWidget, app] =
    await Promise.all([
      Deno.readTextFile(retiredPageUrl),
      Deno.readTextFile(websiteUrl),
      Deno.readTextFile(vendorDashboardUrl),
      Deno.readTextFile(vendorDashboardScriptUrl),
      Deno.readTextFile(adminWidgetUrl),
      Deno.readTextFile(appUrl),
    ]);
  assert(
    page.includes("cannot be used to submit a new entry") &&
      page.includes('href="/qr"') &&
      !page.includes("[form=qr_bingo_free_entry]") &&
      !page.includes("alternate_free_entry_offers") &&
      !/<form\b/i.test(page) &&
      !/<script\b/i.test(page),
    "the former public route must not render or load an alternate-entry form",
  );
  assert(
    !website.includes("vendorDrawFreeEntry") &&
      !dashboard.includes('data-role="free-entry-link"') &&
      !dashboardScript.includes("freeEntryLink") &&
      !app.includes("View equal alternate entry route") &&
      !app.includes("View equal alternate method of entry"),
    "couple or vendor UI still links the retired off-site route",
  );
  assert(
    adminWidget.includes(
      "<?php if (false): /* Historical Form 354 tools are intentionally retired. */ ?>",
    ) &&
      adminWidget.includes(
        'class="ww-qrbs-form-token" name="alternate_free_entry_url" type="text" readonly',
      ) &&
      !adminWidget.includes(
        'name="alternate_free_entry_url" type="hidden"',
      ),
    "admin must hide historical Form 354 controls while preserving the immutable legacy value using the BD-safe readonly token pattern",
  );
});

Deno.test("vendor activation no longer depends on an off-site URL", async () => {
  const [app, ...sources] = await Promise.all([
    Deno.readTextFile(appUrl),
    ...syncUrls.map((url) => Deno.readTextFile(url)),
  ]);
  assert(
    !app.includes("Equal alternate entry required") &&
      !app.includes("View equal alternate entry route"),
    "native vendor activation still requires the retired route",
  );
  for (const source of sources) {
    const enterable = section(
      source,
      "function isSettingsEnterable(",
      "function entryHasCurrentConsent(",
    );
    assert(
      enterable.includes("const scheduleIsValid =") &&
        !enterable.includes("alternateFreeEntryUrl") &&
        !enterable.includes("alternate_free_entry_url") &&
        !enterable.includes("validHttpsUrl"),
      "vendor enterability still depends on an alternate-entry URL",
    );
  }
});

Deno.test("production native scanner requires one canonical current-vendor URL and keeps fixture emulation canonical", async () => {
  const [policy, app] = await Promise.all([
    Deno.readTextFile(policyUrl),
    Deno.readTextFile(appUrl),
  ]);
  for (
    const required of [
      'normalizedPath === "/qr"',
      "queryEntries.length === 1",
      'queryEntries[0][0] === "vendor_id"',
      "/^[1-9][0-9]{0,19}$/.test(vendorIds[0])",
      '(qrHost === "weddingwin.ca" || qrHost === "www.weddingwin.ca")',
      '!parsed.username',
      '!parsed.password',
      '!parsed.hash',
    ]
  ) {
    assert(policy.includes(required), `canonical QR policy is missing ${required}`);
  }
  const matcher = section(
    app,
    "function matchQrBingoVendor(",
    "function normalizeQrBingoEventConfig(",
  );
  const policyGate = matcher.indexOf("if (!qrPayloadUrlAllowed(raw)) return null;");
  const legacyParser = matcher.indexOf("legacyQrVendorId(raw)");
  assert(
    policyGate >= 0 && (legacyParser < 0 || policyGate < legacyParser) &&
      matcher.includes("vendors.find((vendor) =>") &&
      app.includes(
        "data: `https://www.weddingwin.ca/qr?vendor_id=${encodeURIComponent(vendors[0].id)}`",
      ),
    "native matching must apply the canonical policy before any compatibility parser, while the isolated emulator emits that canonical payload",
  );
});
