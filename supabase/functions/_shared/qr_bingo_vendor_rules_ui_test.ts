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
      "setVendorRaffleRulesExpanded(initialWizardStep === 2 && !currentRulesAccepted)",
      "vendorRaffleEntriesAutoLoadRef.current = true",
    ]
  ) {
    assert(app.includes(required), `vendor draw wizard is missing ${required}`);
  }
  for (
    const required of [
      'accessibilityLabel="Vendor Draw Rules"',
      "accessibilityState={{ expanded: vendorRaffleRulesExpanded }}",
      "{vendorRaffleRulesExpanded ? (",
      'accessibilityLabel="View vendor draw official rules"',
      ">Vendor responsibilities</Text>",
      "{vendorResponsibilityDisclosure ||",
      'accessibilityLabel="Confirm the Official Rules and vendor responsibilities were read and accepted"',
      "I confirm I have read and accept the current Official Rules and vendor responsibilities",
    ]
  ) {
    assert(
      rulesSection.includes(required),
      `Vendor Draw Rules section is missing ${required}`,
    );
  }
  assert(
    app.includes("setVendorRaffleRulesExpanded(true);") &&
      app.includes("vendor_responsibility_disclosure: vendorResponsibilityDisclosure"),
    "the acceptance gate must open the rules section while preserving the exact server disclosure payload",
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
});

Deno.test("locked prize terms still allow current rules reacceptance without mutating material fields", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const save = sourceSection(
    app,
    "const saveVendorRaffle = useCallback",
    "const closeVendorRaffle = useCallback",
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
});
