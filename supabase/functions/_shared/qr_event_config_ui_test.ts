function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("native QR scanner renders and refreshes canonical event configuration", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    source.includes("type QrBingoEventConfig = {") &&
      source.includes("event_config?: QrBingoEventConfig | null;") &&
      source.includes(
        "const [eventConfig, setEventConfig] = useState<QrBingoEventConfig | null>(null);",
      ),
    "the scanner must type and retain the canonical event configuration",
  );
  assert(
    source.includes("function normalizeQrBingoEventConfig(value: unknown)") &&
      source.includes("if (!eventName) return null;") &&
      source.includes(
        "payload.event_name.replace(/\\s+/g, ' ').trim().slice(0, 120)",
      ),
    "event names must be normalized and empty names rejected",
  );

  const listAction = source.indexOf("action: 'list'");
  const scanAction = source.indexOf("action: 'scan'", listAction);
  const raffleOfferAction = source.indexOf(
    "action: 'raffle_offer'",
    scanAction,
  );
  const listRefresh = source.indexOf(
    "setEventConfig(normalizeQrBingoEventConfig(data.event_config));",
    listAction,
  );
  const scanRefresh = source.indexOf(
    "setEventConfig(nextEventConfig);",
    scanAction,
  );
  assert(
    listAction >= 0 && listRefresh > listAction && listRefresh < scanAction,
    "the list response must refresh event configuration",
  );
  assert(
    scanAction >= 0 && scanRefresh > scanAction &&
      scanRefresh < raffleOfferAction,
    "a successful scan response must refresh event configuration",
  );

  assert(
    source.includes("const clearBingoCardState = useCallback(() => {") &&
      source.includes("setEventConfig(null);") &&
      source.includes("setVendors([]);") &&
      source.includes("setBingoTotalCount(null);") &&
      source.includes("setScannedVendorIds(new Set());") &&
      /if \(!visible\) \{[\s\S]*?clearBingoCardState\(\);/.test(source) &&
      /if \(!nativeSession\?\.user_id \|\| !nativeSession\?\.token\) \{[\s\S]*?clearBingoCardState\(\);/
        .test(source) &&
      (source.match(
          /if \(!nativeSession\?\.user_id \|\| !nativeSession\?\.token\) \{\s*clearBingoCardState\(\);/g,
        ) || []).length >= 4 &&
      /catch \(error\) \{\s*if \(requestId !== bingoCardRequestIdRef\.current\) return;\s*clearBingoCardState\(\);/
        .test(source),
    "the entire scanner card must clear on close, open, every missing-account action, and list failure",
  );
  assert(
    source.includes("{eventConfig?.event_name || 'QR Bingo Event'}") &&
      !source.includes(
        "<Text style={styles.qrEyebrow}>Niagara Wedding Show</Text>",
      ),
    "the scanner header must use the canonical name with only the neutral fallback",
  );
  assert(
    source.includes("!visible ||") &&
      source.includes("!contactProfileComplete ||") &&
      source.includes("!participationNoticeAccepted ||") &&
      source.includes("eventScanEnabled !== true ||") &&
      source.includes("!canRequestCameraPermission") &&
      source.includes(
        "if (eventScanEnabled !== true || scanLocked || raffleOffer || !value) return;",
      ) &&
      source.includes(
        "onBarcodeScanned={scanLocked || raffleOffer ? undefined : handleBarcodeScanned}",
      ) &&
      source.includes(") : scanDisabled ? (") &&
      source.includes(") : scanEnabled && hasPermission ? (") &&
      source.includes(
        "<Text style={styles.qrPermissionTitle}>QR Bingo scanning is paused</Text>",
      ),
    "disabled scanning must not request permission, mount CameraView, or process barcodes, and must explain the paused state",
  );
  assert(
    source.includes(
      "const canReviewVendorDraw = isScanned && vendorDrawsEnabled;",
    ) &&
      source.includes("disabled={!canReviewVendorDraw || savingBingo}") &&
      source.includes(
        "onPress={canReviewVendorDraw ? () => reopenVendorDrawOffer(vendor) : undefined}",
      ) &&
      source.includes("visible={vendorDrawsEnabled && !!raffleOffer}") &&
      source.includes("if (eventVendorDrawsEnabled !== true)") &&
      source.includes("Optional vendor draws are temporarily unavailable."),
    "disabled vendor draws must remove repeat-scan, visited-card, and modal entry affordances",
  );
});

Deno.test("native QR network calls time out and preserve backend raffle errors", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    source.includes("const QR_BINGO_REQUEST_TIMEOUT_MS = 12000;") &&
      source.includes("const controller = new AbortController();") &&
      source.includes(
        "setTimeout(() => controller.abort(), QR_BINGO_REQUEST_TIMEOUT_MS)",
      ) &&
      source.includes(
        "if (controller.signal.aborted) throw new Error(timeoutMessage);",
      ) &&
      source.includes("clearTimeout(timeout);"),
    "QR requests must have a bounded abort timeout with deterministic cleanup",
  );
  assert(
    (source.match(/await fetchQrBingoJsonWithTimeout</g) || []).length >= 4 &&
      source.includes(
        "QR Bingo took too long to load. Check your connection and try again.",
      ) &&
      source.includes(
        "Saving this booth visit took too long. Check your connection and scan again.",
      ) &&
      source.includes(
        "Loading this vendor draw took too long. Check your connection and try again.",
      ) &&
      source.includes(
        "Entering this vendor draw took too long. Check your connection and try again.",
      ),
    "list, booth scan, raffle offer, and raffle opt-in must each expose a clear timeout error",
  );
  assert(
    source.includes(
      "data?.detail || data?.error || data?.message || 'Could not enter this draw.'",
    ),
    "raffle opt-in must surface the backend's actionable message before a generic fallback",
  );
});

Deno.test("vendor draw close flushes dirty autosave state", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    source.includes("const closeVendorRaffle = useCallback(async () => {") &&
      source.includes(
        "currentSignature === vendorRaffleLastSavedRef.current",
      ) &&
      source.includes(
        "const saved = await saveVendorRaffle({ silent: true });",
      ) &&
      source.includes("if (!saved) {") &&
      source.includes(
        "The draw settings remain open so you can check the error and try again.",
      ),
    "closing dirty vendor settings must await a successful save and remain open on failure",
  );
  assert(
    source.includes("onRequestClose={() => { void closeVendorRaffle(); }}") &&
      source.includes("onPress={() => { void closeVendorRaffle(); }}") &&
      source.includes(
        'accessibilityLabel="Save and close vendor draw settings"',
      ),
    "both modal dismissal paths must use the safe save-and-close handler",
  );
});

Deno.test("vendor draw requests time out without bypassing existing response handling", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  const getAction = source.indexOf("action: 'vendor_raffle_get'");
  const updateAction = source.indexOf(
    "action: 'vendor_raffle_update'",
    getAction,
  );
  const entriesGetAction = source.indexOf(
    "action: 'vendor_raffle_entries_get'",
    updateAction,
  );
  const entryUpdateAction = source.indexOf(
    "action: 'vendor_raffle_entry_update'",
    entriesGetAction,
  );
  const drawAction = source.indexOf(
    "action: 'vendor_raffle_draw'",
    entryUpdateAction,
  );
  const sendNoticeAction = source.indexOf(
    "action: 'vendor_raffle_send_notice'",
    drawAction,
  );
  assert(
    getAction >= 0 && updateAction > getAction &&
      entriesGetAction > updateAction && entryUpdateAction > entriesGetAction &&
      drawAction > entryUpdateAction && sendNoticeAction > drawAction &&
      (source.match(
          /fetchQrBingoJsonWithTimeout<QrBingoVendorRaffleResponse>/g,
        ) || []).length >= 2 &&
      source.includes(
        "QrBingoVendorRaffleResponse & { draw?: QrBingoRaffleDraw }",
      ) &&
      source.includes(
        "Vendor draw tools took too long to load. Check your connection and try again.",
      ) &&
      source.includes(
        "Saving your vendor draw took too long. Check your connection and try again.",
      ) &&
      source.includes(
        "Loading the entrant selection list took too long. Check your connection and try again.",
      ) &&
      source.includes(
        "Sending the winner email took too long. Check your connection and try again.",
      ) &&
      source.includes(
        "Selecting a potential winner took too long. Check your connection and try again.",
      ),
    "vendor get, save, entrant management, selection, and email requests must use bounded requests with action-specific errors",
  );
  assert(
    source.includes("if (response.status === 409 || data?.conflict)") &&
      source.includes("applyVendorRaffle(data);") &&
      source.includes("'Potential Winner Selected'") &&
      source.includes("'Winner Email Sent'"),
    "timeouts must not replace save conflicts, server state hydration, selection results, or email results",
  );
});

Deno.test("native vendor draw keeps pool controls, selection, verification, and email separate", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    source.includes("max_winners: requestMaxWinners") &&
      source.includes(
        "exclude_previous_winners: requestExcludePreviousWinners",
      ) &&
      source.includes(
        "setRaffleMaxWinners(normalizeRaffleMaxWinners(data.settings?.max_winners))",
      ) &&
      source.includes(
        "setRaffleExcludePreviousWinners(data.settings?.exclude_previous_winners !== false)",
      ) &&
      source.includes("Do not select the same couple twice"),
    "the app must persist one-to-three winner settings and the default-on repeat-winner rule",
  );
  assert(
    source.includes("action: 'vendor_raffle_entries_get'") &&
      source.includes("action: 'vendor_raffle_entry_update'") &&
      source.includes("participant_reference: participantReference") &&
      source.includes("exclusion_reason: reason") &&
      source.includes("Every contact stays in your CSV."),
    "the app must manage entrant inclusion by protected reference while retaining every opted-in CSV row",
  );
  assert(
    source.includes("const drawVendorWinner = async () => {") &&
      source.includes("action: 'vendor_raffle_draw'") &&
      source.includes(
        "const sendVendorWinnerNotice = (draw: QrBingoRaffleDraw) => {",
      ) &&
      source.includes("action: 'vendor_raffle_send_notice'") &&
      source.includes("draw_id: draw.id") &&
      source.includes("Send Winner Email") &&
      !source.includes(
        "draw_reason: vendorRaffleWillSendVerifiedNotice ? 'verified_notice' : 'initial'",
      ),
    "selection and per-verified-draw email delivery must be separate app actions",
  );
});

Deno.test("development QR emulation is restricted to isolated fixtures", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    source.includes("__DEV__ && (emailTestFixture || appReviewFixture)") &&
      source.includes("Test only: Emulate email-test booth QR") &&
      source.includes("Test only: Emulate App Review booth QR"),
    "the native QR emulator must support both controlled fixture types only in development builds",
  );
});

Deno.test("locked vendor draws preserve their exact material terms when entries reopen", async () => {
  const nativeSource = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const websiteSource = await Deno.readTextFile(
    new URL(
      "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js",
      import.meta.url,
    ),
  );

  assert(
    nativeSource.includes(
      "const materialTermsLocked = Boolean(vendorRaffle?.material_terms_locked);",
    ) &&
      nativeSource.includes(
        "? currentSettings?.prize_title || draftPrizeTitle",
      ) &&
      nativeSource.includes(
        "? currentSettings?.prize_description || draftPrizeDescription",
      ) &&
      nativeSource.includes(
        "? Number(currentSettings?.prize_approx_value_cad || draftPrizeApproxValueCad)",
      ),
    "the native app must resend the server's exact locked prize terms instead of deriving a different title",
  );
  assert(
    websiteSource.includes(
      "const materialTermsLocked = Boolean(state.data.material_terms_locked);",
    ) &&
      websiteSource.includes("? text(settings.prize_title)") &&
      websiteSource.includes("? text(settings.prize_description)") &&
      websiteSource.includes("? number(settings.prize_approx_value_cad)"),
    "the website must resend the server's exact locked prize terms instead of deriving a different title",
  );
});
