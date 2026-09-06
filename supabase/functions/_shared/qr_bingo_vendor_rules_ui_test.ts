function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function includesIgnoringWhitespace(source: string, fragment: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
  return normalize(source).includes(normalize(fragment));
}

function sourceSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `${startMarker} is missing`);
  const end = source.indexOf(endMarker, start);
  assert(end > start, `${endMarker} is missing after ${startMarker}`);
  return source.slice(start, end);
}

Deno.test("iOS prize setup is a four-step wizard with one short agreement and expandable responsibilities", async () => {
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
  for (const [step, label] of [[1, "Prize"], [2, "Open"], [3, "Couples"], [4, "Winner"]] as const) {
    assert(
      app.includes(`{ id: ${step}, label: '${label}' }`),
      `vendor draw wizard is missing step ${step}`,
    );
  }
  for (
    const required of [
      "Prize",
      "Open",
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
      "I have read and agree to the rules above.",
    ]
  ) {
    assert(
      includesIgnoringWhitespace(rulesSection, required),
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
  const expandedDetails = rulesSection.slice(detailsStart, detailsClose);
  assert(
    includesIgnoringWhitespace(
      expandedDetails,
      "By agreeing, you confirm you are authorized to accept the current Official Rules and vendor responsibilities for this business.",
    ) && expandedDetails.includes("{vendorResponsibilityDisclosure ||"),
    "the full business-authority statement and exact server responsibilities must remain in the expandable rules",
  );
  assert(
    (rulesSection.match(/accessibilityRole="checkbox"/g) || []).length === 1 &&
      (rulesSection.match(/testID="vendor-draw-rules-acceptance"/g) || []).length === 1 &&
      includesIgnoringWhitespace(
        rulesSection,
        "!vendorRaffle?.terms_url || !vendorRaffle?.rules_version || !vendorResponsibilityDisclosure",
      ) &&
      includesIgnoringWhitespace(
        rulesSection,
        "setVendorRaffleRulesViewedVersion(nextAccepted ? vendorRaffleRulesVersion : '')",
      ) &&
      rulesSection.includes("if (raffleEnabled && raffleLegalAccepted)"),
    "the single checkbox must bind the current available agreement and must not withdraw acceptance from an open draw",
  );
  assert(
    !app.includes("setVendorRaffleRulesExpanded(true);") &&
      app.includes("setVendorRaffleRulesExpanded(false);") &&
      includesIgnoringWhitespace(
        app,
        "vendor_responsibility_disclosure: vendorResponsibilityDisclosure",
      ),
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
      app.includes("Saved automatically"),
    "the autosave footer must reserve its indicator slot and bounded status text",
  );
  const footerHeight = app.match(
    /styles\.vendorRaffleAutosaveRow,\s*\{\s*height:\s*([^}]+)\}/,
  );
  assert(
    footerHeight && footerHeight[1].includes("fontScale") &&
      !/vendorRaffle|Saving|Pending|Issue|Error|\?/.test(footerHeight[1]),
    "autosave height must scale for accessibility without depending on saved, saving or error state",
  );
  const heightForScale = new Function("fontScale", `return (${footerHeight![1]});`);
  for (const scale of [1, 1.4, 2, 3]) {
    const height = heightForScale(scale);
    assert(
      height >= 44 && height >= Math.ceil(30 * scale) + 12,
      "the stable footer must fit two scaled 15-point lines and padding",
    );
  }
  assert(
    includesIgnoringWhitespace(app, "vendorRaffleSaveRetry: { minHeight: 44") &&
      includesIgnoringWhitespace(app, "vendorRaffleAgreementToggle: { minHeight: 44"),
    "retry and the single vendor agreement must retain accessible tap targets",
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
    includesIgnoringWhitespace(
      sourceSection(app, "const applyVendorRaffle = useCallback", "const fetchVendorRaffle = useCallback"),
      "currentRulesAccepted, currentRulesAccepted ? data.rules_version || '' : ''",
    ) &&
      includesIgnoringWhitespace(
        sourceSection(app, "const saveVendorRaffle = useCallback", "const runVendorRaffleSave = useCallback"),
        "acceptancePersisted, acceptancePersisted ? data.rules_version || '' : ''",
      ) && app.includes("vendorRaffleRulesViewedVersion"),
    "hydration and successful-save baselines must use verified current acceptance, never a stale stored acceptance version",
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
      includesIgnoringWhitespace(app, "vendorRaffleScroll: { flex: 1") &&
      app.includes("style={styles.vendorRaffleScroll}") &&
      app.includes('testID="vendor-draw-save-retry"') &&
      app.includes("vendorRaffleSaveError || vendorRaffleSaveStatusText") &&
      includesIgnoringWhitespace(
        app,
        "accessibilityLabel={vendorRaffleSaveError || vendorRaffleSaveMessage || vendorRaffleSaveStatusText}",
      ),
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
      includesIgnoringWhitespace(save, lockedMaterialField),
      `locked save path is missing preserved material value ${lockedMaterialField}`,
    );
  }
  assert(
    save.includes("const requestLegalAccepted = draftLegalAccepted;") &&
      includesIgnoringWhitespace(
        save,
        "requestLegalAccepted && vendorRaffleRulesViewedVersion === vendorRaffleRulesVersion",
      ) &&
      includesIgnoringWhitespace(
        save,
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
      includesIgnoringWhitespace(
        app,
        "const acceptancePersisted = data.vendor_acceptance_current",
      ) &&
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
