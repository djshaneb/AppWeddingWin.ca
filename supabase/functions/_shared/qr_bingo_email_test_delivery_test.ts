function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

function between(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `${startMarker} is missing`);
  const end = source.indexOf(endMarker, start);
  assert(end > start, `${endMarker} is missing after ${startMarker}`);
  return source.slice(start, end);
}

Deno.test("isolated email tests use exact fixture identities and a couple-only claim", async () => {
  const sources = await Promise.all(
    endpointUrls.map((url) => Deno.readTextFile(url)),
  );

  for (const source of sources) {
    assert(
      source.includes('.from("qr_bingo_email_test_fixtures")') &&
        source.includes('.eq("enabled", true)') &&
        source.includes('.gt("expires_at", new Date().toISOString())') &&
        source.includes(
          ".or(`couple_bd_user_id.eq.${userId},vendor_bd_user_id.eq.${userId}`)",
        ),
      "each endpoint must load only an active, unexpired fixture for the exact authenticated account",
    );
    assert(
      /cleanText\(user\.email, 254\)\.toLowerCase\(\)\s*!==\s*isolatedEmailTestRecipient\(reviewFixture\)/
        .test(source) &&
        source.includes(
          "The isolated email-test account no longer matches its allowlisted recipient.",
        ),
      "the couple path must fail closed if the live BD email no longer matches the allowlist",
    );
    assert(
      source.includes('? "qr_bingo_email_test_fixture_scans"') &&
        source.includes("ignoreDuplicates: true") &&
        source.includes(
          'onConflict: "fixture_id,couple_bd_user_id,vendor_bingo_id"',
        ),
      "the isolated scan must use its own replay-safe scan table",
    );
    assert(
      source.includes('? "claim_verified_qr_bingo_test_draw_email_delivery"') &&
        source.includes('channel !== "couple"') &&
        source.includes(
          "The isolated email test permits only the allowlisted couple notice.",
        ),
      "email-test delivery must use the separate couple-only claim RPC",
    );
    assert(
      source.includes(
        'const appReviewFixture = eventKey.startsWith("app-review-")',
      ) &&
        source.includes(
          'const emailTestFixture = eventKey.startsWith("email-test-")',
        ) &&
        source.includes("outbound_email_suppressed: appReviewFixture"),
      "raffle offers must distinguish email-test delivery from outbound-suppressed App Review",
    );
  }
});

Deno.test("isolated email transport cannot be redirected or mistaken for production", async () => {
  const sources = await Promise.all(
    endpointUrls.map((url) => Deno.readTextFile(url)),
  );

  for (const source of sources) {
    assert(
      /const vendorRequested\s*=\s*emailTestRecipient\s*\?\s*false\s*:\s*qrBingoConfig\(\)\.send_vendor_email/
        .test(source) &&
        /const coupleRequested\s*=\s*emailTestRecipient\s*\?\s*true\s*:\s*qrBingoConfig\(\)\.send_couple_email/
          .test(source) &&
        source.includes(
          "couple_to: emailTestRecipient || cleanText(draw.winner_email, 160)",
        ),
      "the test must disable the vendor copy and pin the couple transport target",
    );
    for (
      const identityCheck of [
        "draw.event_key !== fixture.event_key",
        "draw.vendor_bingo_id !== fixture.vendor_bingo_id",
        "draw.vendor_bd_user_id !== fixture.vendor_bd_user_id",
        "draw.couple_bd_user_id !== fixture.couple_bd_user_id",
        "cleanText(draw.winner_email, 254).toLowerCase() !== emailTestRecipient",
      ]
    ) {
      assert(
        source.includes(identityCheck),
        `the signed test payload must enforce ${identityCheck}`,
      );
    }
    assert(
      source.includes("event_key: draw.event_key") &&
        source.includes('? "isolated_verified_email_test"') &&
        source.includes('email_test_fixture: emailTestRecipient ? "1" : "0"') &&
        /fixture_id:\s*isEmailTestFixture\(isolatedFixture\)\s*\?\s*isolatedFixture\.id\s*:\s*""/
          .test(source),
      "the signed request must carry a distinct test mode plus exact draw and fixture identities",
    );
  }
});

Deno.test("website mail boundary independently allowlists the one test mailbox", async () => {
  const widget = await Deno.readTextFile(
    new URL(
      "../../../brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php",
      import.meta.url,
    ),
  );

  assert(
    widget.includes("strpos($eventKey, 'app-review-') === 0") &&
      widget.includes(
        "Outbound email is suppressed for the isolated App Review fixture.",
      ),
    "App Review must remain unconditionally suppressed before any test-mode handling",
  );
  assert(
    widget.includes("strpos($eventKey, 'email-test-') === 0") &&
      widget.includes("$deliveryMode === 'isolated_verified_email_test'") &&
      widget.includes("$sendVendor") &&
      widget.includes("!$sendCouple") &&
      widget.includes("!preg_match($validUuid, $drawId)") &&
      widget.includes("!preg_match($validUuid, $fixtureId)") &&
      widget.includes(
        "e335ee1d5cd1defcd861262d600a69d823b65811365b4d5ea74ff86c2fd362bb",
      ) &&
      widget.includes(
        "!hash_equals($expectedRecipientHash, hash('sha256', $coupleTo))",
      ) &&
      widget.includes(
        "$incomingCoupleSubject !== 'Your name was selected for a QR Bingo booth draw'",
      ),
    "the website transport must independently enforce test mode, exact mailbox hash, UUIDs, couple-only delivery, and the production subject",
  );
});

Deno.test("winner preview matches the friendly couple email delivered by WeddingWin", async () => {
  const [app, widget, ...endpoints] = await Promise.all([
    Deno.readTextFile(
      new URL("../../../app/(tabs)/index.tsx", import.meta.url),
    ),
    Deno.readTextFile(
      new URL(
        "../../../brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php",
        import.meta.url,
      ),
    ),
    ...endpointUrls.map((url) => Deno.readTextFile(url)),
  ]);
  const preview = between(
    app,
    'testID="vendor-draw-email-preview"',
    'testID="vendor-draw-step-couples"',
  );
  const deliveredTemplate = between(
    widget,
    "function ww_qbdes_text_body",
    "function ww_qbdes_vendor_html",
  );
  const edgeTemplates = endpoints.map((source) =>
    between(source, "const coupleText = [", "const claimOutcomes =")
  );
  const templates = [preview, deliveredTemplate, ...edgeTemplates];

  for (
    const phrase of [
      "Congratulations, your name was selected by",
      "for their draw.",
      "Your draw",
      "Draw item:",
      "will follow up with the prize details and next steps.",
      "You opted in after scanning this vendor",
      "QR code at the wedding show.",
      "WeddingWin.ca",
    ]
  ) {
    templates.forEach((template, index) =>
      assert(
        template.includes(phrase),
        `winner email template ${index + 1} is missing ${phrase}`,
      )
    );
  }
  for (
    const internalCopy of [
      "saved dated evidence",
      "Wedding Win recorded the vendor",
      "You were selected as a potential winner",
      "This notice does not itself award the prize",
    ]
  ) {
    templates.forEach((template, index) =>
      assert(
        !template.includes(internalCopy),
        `winner email template ${index + 1} still exposes internal copy: ${internalCopy}`,
      )
    );
  }
  assert(
    preview.includes("Subject: {vendorDrawEmailSubjectPreview}") &&
      app.includes(
        "vendorRaffle?.couple_email_subject?.trim() || 'Your name was selected for a QR Bingo booth draw'",
      ) &&
      widget.includes(
        "$coupleSubject = $incomingCoupleSubject ? $incomingCoupleSubject : 'Your name was selected for a QR Bingo booth draw'",
      ) &&
      endpoints.every((source) =>
        source.includes(
          "couple_email_subject: qrBingoConfig().couple_email_subject",
        )
      ),
    "the previously restored winner-email subject must remain unchanged",
  );
});

Deno.test("Simulator and website clearly label the no-prize QA fixture", async () => {
  const [app, websiteMarkup, websiteScript] = await Promise.all([
    Deno.readTextFile(
      new URL("../../../app/(tabs)/index.tsx", import.meta.url),
    ),
    Deno.readTextFile(
      new URL(
        "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.php",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(
      new URL(
        "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js",
        import.meta.url,
      ),
    ),
  ]);

  assert(
    app.includes("__DEV__ && (emailTestFixture || appReviewFixture)") &&
      app.includes("Emulate controlled email-test booth QR scan") &&
      app.includes("Test only: Emulate email-test booth QR") &&
      app.includes("Isolated prize-email QA fixture") &&
      app.includes("one notice is sent only to the allowlisted test mailbox") &&
      app.includes("does not award a real prize"),
    "the Simulator-only scan emulator and vendor warning must be visibly test-only",
  );
  assert(
    websiteMarkup.includes("email-test-fixture-notice") &&
      websiteMarkup.includes("does not award a real prize") &&
      websiteScript.includes("data.email_test_fixture"),
    "the website dashboard must identify the isolated no-prize email test",
  );
});
