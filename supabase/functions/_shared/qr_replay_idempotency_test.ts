function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function includesIgnoringWhitespace(source: string, fragment: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
  return normalize(source).includes(normalize(fragment));
}

function functionBody(source: string, functionName: string) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const open = source.indexOf("{", start);
  if (open < 0) throw new Error(`Missing body for ${functionName}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated body for ${functionName}`);
}

Deno.test("controlled QR scan replay preserves the original scan row", async () => {
  const sync = await Deno.readTextFile(
    new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  );
  const vendorSync = await Deno.readTextFile(
    new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
  );
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260828162602_add_qr_bingo_official_rules_audit.sql",
      import.meta.url,
    ),
  );
  for (const source of [sync, vendorSync]) {
    const saveFixtureScan = functionBody(source, "saveIsolatedFixtureScan");

    assert(
      saveFixtureScan.includes("ignoreDuplicates: true") &&
        saveFixtureScan.includes("qr_bingo_email_test_fixture_scans") &&
        saveFixtureScan.includes("app_review_raffle_fixture_scans") &&
        saveFixtureScan.includes(
          'onConflict: "fixture_id,couple_bd_user_id,vendor_bingo_id"',
        ),
      "fixture scan writes must ignore the existing unique row instead of updating it",
    );
    assert(
      !saveFixtureScan.includes("scanned_at:") &&
        saveFixtureScan.includes("vendor_bingo_id: fixture.vendor_bingo_id"),
      "a replay must preserve the database-default timestamp from the first scan",
    );
  }
  assert(
    /constraint app_review_raffle_fixture_scans_unique[\s\S]*unique \(fixture_id, couple_bd_user_id, vendor_bingo_id\)/i
      .test(migration),
    "the insert-or-ignore conflict target must be protected by a unique constraint",
  );
});

Deno.test("review couple sees only its isolated vendor and fixture scan state", async () => {
  const sources = await Promise.all([
    Deno.readTextFile(new URL("../bd-qr-bingo-sync/index.ts", import.meta.url)),
    Deno.readTextFile(
      new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
    ),
  ]);

  for (const source of sources) {
    const isolationStart = source.indexOf("let scanned: string[];");
    const actionStart = source.indexOf(
      'if (action === "scan")',
      isolationStart,
    );
    const isolation = source.slice(isolationStart, actionStart);

    assert(
      isolationStart >= 0 && actionStart > isolationStart,
      "review scan isolation must run before scan action routing",
    );
    assert(
      isolation.includes("if (reviewFixture && isReviewCouple)") &&
        isolation.includes(
          "page.vendors = [isolatedFixtureVendor(reviewFixture)]",
        ) &&
        isolation.includes("page.scanned = []") &&
        isolation.includes("await isolatedFixtureScannedIds(") &&
        isolation.includes(
          "reviewFixture,\n              String(user.user_id),",
        ),
      "review couples must receive exactly the fixture vendor and fixture scan state",
    );
    assert(
      !isolation.includes("productionScanned") &&
        !isolation.includes("...page.vendors.filter") &&
        isolation.indexOf("} else {") <
          isolation.indexOf("await getFreshScanned(cookieJar, page)"),
      "production roster and scan history must remain outside the review-couple branch",
    );
  }
});

Deno.test("review vendor dashboard skips the website session but requires the live event tag", async () => {
  const sources = await Promise.all([
    Deno.readTextFile(new URL("../bd-qr-bingo-sync/index.ts", import.meta.url)),
    Deno.readTextFile(
      new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
    ),
  ]);

  for (const source of sources) {
    const identityCheck = source.indexOf(
      "if (!await nativeSessionMatchesCachedBdIdentity(nativeSession))",
    );
    const fastPathStart = source.indexOf(
      "const isVendorRaffleAction =",
      identityCheck,
    );
    const dashboardStart = source.indexOf(
      'if (action === "vendor_raffle_get")',
      fastPathStart,
    );
    const fastPath = source.slice(fastPathStart, dashboardStart);

    assert(
      identityCheck >= 0 && fastPathStart > identityCheck &&
        dashboardStart > fastPathStart,
      "the isolated reviewer-vendor fast path must retain cached-token verification and run before dashboard routing",
    );
    assert(
      fastPath.includes(
        "await loadAppReviewRaffleFixture(authenticatedMemberId)",
      ) &&
        fastPath.includes(
          "await loadEmailTestRaffleFixture(authenticatedMemberId)",
        ) &&
        fastPath.includes(
          "reviewFixture && isReviewVendor && isVendorRaffleAction",
        ) &&
        fastPath.includes(
          "const user = websiteCoupleUser || await fetchFullBdUserById(authenticatedMemberId)",
        ) &&
        !fastPath.includes("? ({ user_id: nativeSession.user_id } as BdRow)") &&
        source.includes("function hasCurrentQrBingoVendorTag") &&
        source.includes("async function resolveVendorForRaffleAction") &&
        source.includes("return hasCurrentQrBingoVendorTag(user)"),
      "the reviewer-vendor path must load current BD tags and fail closed when its event tag is removed",
    );
    assert(
      fastPath.includes("const cookieJar = skipWebsiteTransport") &&
        fastPath.includes("? new Map<string, string>()") &&
        fastPath.includes("const page = skipWebsiteTransport") &&
        fastPath.includes("? ({ vendors: [], scanned: [] } as QrPage)"),
      "review vendor raffle actions must use the verified BD identity and an empty page without a website session",
    );
    assert(
      fastPath.indexOf("await fetchFullBdUserById(authenticatedMemberId)") <
          fastPath.indexOf("const cookieJar = skipWebsiteTransport") &&
        fastPath.indexOf("? new Map<string, string>()") <
          fastPath.indexOf("await loginWebsiteSession(transportSession)") &&
        fastPath.indexOf("? ({ vendors: [], scanned: [] } as QrPage)") <
          fastPath.indexOf("await getQrPage(cookieJar)"),
      "the reviewer path must verify the live tag before bypassing only the website session and QR page",
    );
  }
});

Deno.test("stale vendor settings return before the atomic compare RPC", async () => {
  const sources = await Promise.all([
    Deno.readTextFile(new URL("../bd-qr-bingo-sync/index.ts", import.meta.url)),
    Deno.readTextFile(
      new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
    ),
  ]);

  for (const source of sources) {
    const updateStart = source.indexOf(
      'if (action === "vendor_raffle_update")',
    );
    const drawStart = source.indexOf(
      'if (action === "vendor_raffle_draw")',
      updateStart,
    );
    const updateFlow = source.slice(updateStart, drawStart);
    const ensureIndex = updateFlow.indexOf(
      "const currentSettings = await ensureSettings",
    );
    const mismatchIndex = updateFlow.indexOf(
      "clientSettingsUpdatedAt !== currentSettings.updated_at",
      ensureIndex,
    );
    const conflictReturnIndex = updateFlow.indexOf("}, 409);", mismatchIndex);
    const compareIndex = updateFlow.indexOf(
      "await compareAndUpdateSettings(",
      conflictReturnIndex,
    );
    const compareCalls =
      updateFlow.match(/await compareAndUpdateSettings\(/g) ?? [];

    assert(
      updateStart >= 0 && drawStart > updateStart && ensureIndex >= 0,
      "the vendor update flow must load current settings before handling writes",
    );
    assert(
      updateFlow.includes("!clientSettingsUpdatedAt") &&
        updateFlow.includes("!currentSettings.updated_at") &&
        mismatchIndex > ensureIndex &&
        conflictReturnIndex > mismatchIndex &&
        compareIndex > conflictReturnIndex,
      "missing or stale timestamps must return 409 before the transactional compare RPC",
    );
    assert(
      compareCalls.length >= 2,
      "the atomic compare RPC must remain in both vendor settings write paths as the race guard",
    );
  }
});

Deno.test("a repeat camera scan obtains current entry proof while fixture replay reopens the optional draw", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const match = app.indexOf(
    "const matched = matchQrBingoVendor(value, vendors)",
  );
  const duplicate = app.indexOf(
    "if (scannedVendorIds.has(matched.id))",
    match,
  );
  const proofSave = app.indexOf(
    "const saved = await saveBingoScan(matched)",
    duplicate,
  );
  const reopen = app.indexOf(
    "await reopenVendorDrawOffer(matched)",
    duplicate,
  );
  const branchEnd = app.indexOf("\n        }", reopen);
  const branch = app.slice(duplicate, branchEnd);
  const save = app.indexOf("const saved = await saveBingoScan(matched)", branchEnd);

  assert(
    match >= 0 && duplicate > match && proofSave > duplicate &&
      reopen > proofSave && branchEnd > reopen && save > branchEnd &&
      includesIgnoringWhitespace(branch,
        "if (!isolatedFixtureActive && isQrBingoScanWindowOpen(eventConfig, Date.now()))") &&
      includesIgnoringWhitespace(branch,
        "else if (eventVendorDrawsEnabled && isolatedFixtureActive)") &&
      branch.trimEnd().endsWith("return;"),
    "production repeat scans must obtain current entry proof, isolated repeats must reopen the draw, and both must return before the new-visit branch",
  );
});

Deno.test("a QR check-in can offer a separate optional vendor draw entry", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const sync = await Deno.readTextFile(
    new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  );
  const vendorSync = await Deno.readTextFile(
    new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
  );

  assert(
    includesIgnoringWhitespace(
      app,
      "if (nextEventConfig?.vendor_draws_enabled && (isolatedFixtureActive || (isQrBingoScanWindowOpen(nextEventConfig, Date.now()) && nextVendorDrawScannedIds.has(vendor.id))) && data.raffle_offer)",
    ) &&
      app.includes("setRaffleOffer(data.raffle_offer)") &&
      includesIgnoringWhitespace(
        app,
        "visible={vendorDrawsEnabled && participationNoticeAccepted && !!raffleOffer}",
      ) &&
      app.includes("action: 'raffle_opt_in'") &&
      app.includes("action: 'raffle_offer'") &&
      app.includes(
        "raffleRulesViewedVersion !== raffleOffer.consent_version",
      ) &&
      includesIgnoringWhitespace(
        app,
        "!ageOfMajorityAttested || !residencyAttested || !exclusionsAttested",
      ) &&
      app.includes("Open QR Bingo vendor draw settings"),
    "the iOS app must expose a separate rules-and-eligibility-gated optional entry plus vendor controls",
  );

  for (const source of [sync, vendorSync]) {
    assert(
      source.includes("const raffleOffer = await buildRaffleOffer") &&
        source.includes('if (action === "raffle_opt_in")') &&
        source.includes('if (action === "raffle_offer")') &&
        source.includes('if (action === "vendor_raffle_update")') &&
        source.includes('if (action === "vendor_raffle_draw")') &&
        source.includes("participant_responsibility_disclosure") &&
        !source.includes("GRAND_PRIZE") &&
        !source.includes("grand_prize") &&
        !source.includes("grandPrize") &&
        !source.includes("PROMOTION_WORKFLOWS_ENABLED"),
      "each QR endpoint must support vendor draws without retaining dead grand-prize runtime",
    );
  }
});
