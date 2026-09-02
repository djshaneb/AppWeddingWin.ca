function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function sourceSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `${startMarker} is missing`);
  const end = source.indexOf(endMarker, start);
  assert(end > start, `${endMarker} is missing after ${startMarker}`);
  return source.slice(start, end);
}

Deno.test("iOS prize setup is a four-step wizard and keeps responsibilities in Rules & Open", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const prizeIntro = sourceSection(
    app,
    'testID="vendor-draw-step-prize"',
    'testID="vendor-draw-email-preview"',
  );
  const rulesSection = sourceSection(
    app,
    'testID="vendor-draw-step-rules"',
    'accessibilityLabel="Open your prize draw"',
  );

  assert(
    !prizeIntro.includes("vendorResponsibilityDisclosure") &&
      !prizeIntro.includes("Vendor responsibilities"),
    "the responsibility disclosure must not appear in the main prize-setup introduction",
  );
  for (const [step, label] of [[1, "Prize"], [2, "Rules & Open"], [3, "Couples"], [4, "Winner"]] as const) {
    assert(
      app.includes(`{ id: ${step}, label: '${label}' }`),
      `vendor draw wizard is missing step ${step}`,
    );
  }
  for (
    const required of [
      "Prize",
      "Rules & Open",
      "Couples",
      "Winner",
      'testID={`vendor-draw-wizard-step-${step.id}`}',
      'testID="vendor-draw-wizard-back"',
      'testID="vendor-draw-wizard-continue"',
      'testID="vendor-draw-wizard-finish"',
      "continueVendorRaffleWizard",
      "recommendedVendorRaffleWizardStep",
      "setVendorRaffleRulesExpanded(false)",
      "vendorRaffleEntriesAutoLoadRef.current = true",
    ]
  ) {
    assert(app.includes(required), `vendor draw wizard is missing ${required}`);
  }
  for (
    const required of [
      'accessibilityLabel="Vendor Draw Rules and responsibilities"',
      "accessibilityState={{ expanded: vendorRaffleRulesExpanded }}",
      "{vendorRaffleRulesExpanded ? (",
      'testID="vendor-draw-rules-details"',
      'accessibilityLabel="Open vendor draw official rules"',
      ">Vendor responsibilities</Text>",
      "{vendorResponsibilityDisclosure ||",
      'testID="vendor-draw-rules-acceptance"',
      'accessibilityLabel="Confirm the Official Rules and vendor responsibilities were read and accepted"',
      "I confirm I have read and accept the current Official Rules and vendor responsibilities",
    ]
  ) {
    assert(
      rulesSection.includes(required),
      `Vendor Draw Rules section is missing ${required}`,
    );
  }
  const detailsStart = rulesSection.indexOf('testID="vendor-draw-rules-details"');
  const detailsClose = rulesSection.indexOf(') : null}', detailsStart);
  const acceptance = rulesSection.indexOf('testID="vendor-draw-rules-acceptance"');
  assert(
    detailsStart >= 0 && detailsClose > detailsStart && acceptance > detailsClose,
    "the legal details must collapse independently while the required acceptance remains visible",
  );
  assert(
    !app.includes("setVendorRaffleRulesExpanded(true);") &&
      app.includes("setVendorRaffleRulesExpanded(false);") &&
      app.includes("vendor_responsibility_disclosure: vendorResponsibilityDisclosure"),
    "the rules must stay collapsed by default while preserving the exact server disclosure payload",
  );

  const couplesPanel = app.indexOf('testID="vendor-draw-step-couples"');
  const winnerPanel = app.indexOf('testID="vendor-draw-step-winner"');
  const footer = app.indexOf('testID="vendor-draw-save-status"');
  assert(
    couplesPanel >= 0 && winnerPanel > couplesPanel && footer > winnerPanel,
    "the shared wizard footer must follow the Couples and Winner panel content",
  );
  assert(
    app.includes("Step 1 of 5, scan the booth QR") &&
      app.includes("Step 5 of 5, confirm and fulfill"),
    "the optional visual guide must expose its instructions to assistive technology",
  );
  assert(
    app.includes("vendorRaffleSaveIndicatorSlot") &&
      app.includes("numberOfLines={vendorRaffleSaveHasIssue ? 2 : 1}") &&
      app.includes("height: 58") &&
      app.includes("Saved automatically"),
    "the autosave footer must reserve a stable height across save states",
  );
});

Deno.test("vendor draw autosave signature tracks the accepted rules version", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const signature = sourceSection(
    app,
    "const vendorRaffleSignature = useCallback",
    "const markVendorRaffleLocalEdit",
  );

  assert(
    signature.includes("legalTermsVersion: string") &&
      signature.includes("legal_terms_version: legalAccepted ? legalTermsVersion : ''"),
    "autosave must distinguish old and current rules acceptance",
  );
  assert(
    app.includes("data.settings?.legal_terms_version || ''") &&
      app.includes("vendorRaffleRulesViewedVersion"),
    "hydrated and edited autosave signatures must carry their exact rules version",
  );
});

Deno.test("vendor draw autosave keeps the wizard mounted on partial conflicts", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const save = sourceSection(
    app,
    "const saveVendorRaffle = useCallback",
    "const closeVendorRaffle = useCallback",
  );
  const conflict = sourceSection(
    save,
    "if (response.status === 409 || data?.conflict)",
    "const message =",
  );

  assert(
    app.includes("function isCompleteVendorRaffleDashboard(") &&
      app.includes("value?.vendor && value?.settings && value?.rules_version") &&
      conflict.includes("if (isCompleteVendorRaffleDashboard(data))") &&
      conflict.includes(
        "applyVendorRaffle(data, { preserveWizardContext: true })",
      ) &&
      !conflict.includes("setVendorRaffle(data)"),
    "a partial 409 must never replace the complete dashboard, while a complete conflict must hydrate authoritative values without moving the wizard",
  );
  assert(
    save.includes("vendorRaffleLastFailedSignatureRef.current = ''") &&
      save.includes("setVendorRaffleSaveError(null)") &&
      save.includes("setVendorRaffleSaveMessage(message)") &&
      save.includes("return false"),
    "a handled conflict must not expose a retry that could overwrite the authoritative settings",
  );
  assert(
    save.includes("if (!isCompleteVendorRaffleDashboard(data))") &&
      save.includes("vendorRaffleLastFailedSignatureRef.current = savedSignature") &&
      app.includes("signature === vendorRaffleLastFailedSignatureRef.current") &&
      app.includes("vendorRaffleLastFailedSignatureRef.current = ''"),
    "failed autosaves must keep the draft visible without retrying the same unchanged signature forever",
  );
  assert(
    app.includes("height: '92%'") &&
      app.includes("vendorRaffleScroll: {\n    flex: 1") &&
      app.includes("style={styles.vendorRaffleScroll}") &&
      app.includes('testID="vendor-draw-save-retry"') &&
      app.includes("vendorRaffleSaveError || vendorRaffleSaveStatusText") &&
      app.includes("accessibilityLabel={vendorRaffleSaveError || vendorRaffleSaveMessage || vendorRaffleSaveStatusText}"),
    "the vendor draw sheet must stay stable and show the actionable save error beside a retry control",
  );
});

Deno.test("locked prize terms still allow current rules reacceptance without mutating material fields", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const website = await Deno.readTextFile(
    new URL(
      "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js",
      import.meta.url,
    ),
  );
  const save = sourceSection(
    app,
    "const saveVendorRaffle = useCallback",
    "const closeVendorRaffle = useCallback",
  );
  const websiteSave = sourceSection(
    website,
    "async function save()",
    "async function drawPotentialWinner()",
  );

  for (
    const lockedMaterialField of [
      "currentSettings?.prize_title || draftPrizeTitle",
      "currentSettings?.prize_description || draftPrizeDescription",
      "Number(currentSettings?.prize_approx_value_cad || draftPrizeApproxValueCad)",
      "normalizeRaffleMaxWinners(currentSettings?.max_winners)",
      "currentSettings?.exclude_previous_winners !== false",
    ]
  ) {
    assert(
      save.includes(lockedMaterialField),
      `locked save path is missing preserved material value ${lockedMaterialField}`,
    );
  }
  assert(
    save.includes("const requestLegalAccepted = draftLegalAccepted;") &&
      save.includes(
        "requestLegalAccepted && vendorRaffleRulesViewedVersion === vendorRaffleRulesVersion",
      ) &&
      save.includes(
        "const combinedAcceptance = Boolean(requestLegalAccepted && draftRulesViewed);",
      ) &&
      save.includes("legal_terms_accepted: combinedAcceptance") &&
      save.includes("consent_version: vendorRaffleRulesVersion") &&
      save.includes("rules_viewed: combinedAcceptance") &&
      save.includes("apple_non_sponsor_acknowledged: combinedAcceptance") &&
      save.includes("vendor_responsibility_acknowledged: combinedAcceptance"),
    "locked draws must submit the vendor's current draft acceptance only after the current rules version was viewed",
  );
  assert(
    !save.includes(
      "materialTermsLocked\n      ? Boolean(currentSettings?.legal_terms_accepted)",
    ) &&
      !save.includes(
        "materialTermsLocked ? Boolean(currentSettings?.legal_terms_accepted)",
      ),
    "locked draws must not freeze legal acceptance to the previously saved version",
  );
  assert(
    app.includes("vendor_acceptance_current?: boolean") &&
      app.includes("const acceptancePersisted = data.vendor_acceptance_current") &&
      app.includes("if (combinedAcceptance && !acceptancePersisted)") &&
      app.includes("Your agreement was not saved") &&
      app.includes("data.settings?.legal_terms_version === data.rules_version"),
    "the client must verify current-version acceptance persisted and hydrate from acceptance-specific state",
  );
  assert(
    websiteSave.includes(
      "const requestLegalAccepted = Boolean(legalAccepted.checked);",
    ) &&
      websiteSave.includes("state.rulesViewedVersion === rulesVersion") &&
      websiteSave.includes(
        "state.responsibilityViewedVersion === rulesVersion",
      ) &&
      websiteSave.includes(
        "const combinedAcceptance = Boolean(requestLegalAccepted && rulesReviewed);",
      ) &&
      !websiteSave.includes(
        "materialTermsLocked\n        ? Boolean(settings.legal_terms_accepted)",
      ) &&
      !websiteSave.includes("state.data.rules_current !== false"),
    "the website must use the vendor's current checkbox and current document review when locked prize terms need fresh acceptance",
  );
});
