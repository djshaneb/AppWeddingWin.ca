import { normalizeContactEmail } from "./contact_email.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function includesIgnoringWhitespace(source: string, fragment: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
  return normalize(source).includes(normalize(fragment));
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
      includesIgnoringWhitespace(
        source,
        'isEmailTestFixture(reviewFixture) && ["scan", "raffle_offer", "raffle_opt_in"].includes(action) && !isolatedEmailTestContactMatches(reviewFixture, bingoContactProfile, authenticatedMemberId)',
      ) &&
        source.includes(
          "Save the allowlisted contact email before continuing with this isolated email test.",
        ),
      "scan and draw actions must use the saved, event-scoped allowlisted contact; list must remain usable before contact completion",
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
          "This isolated email test has not authorized a vendor copy.",
        ),
      "email-test delivery must use its isolated claim RPC and reject unapproved vendor copies",
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

for (const endpointUrl of endpointUrls) {
  const endpoint = endpointUrl.pathname.split("/").at(-2);
  Deno.test(`${endpoint}: claim wrapper verifies isolated RPC channel, fixture and recipient`, async () => {
    const source = await Deno.readTextFile(endpointUrl);
    const implementation = between(
      source,
      "async function claimDrawEmailDelivery(",
      "async function finalizeDrawEmailDelivery(",
    );
    const module = await import(
      `data:application/typescript,${
        encodeURIComponent(`
      type DrawEmailChannel=any;type IsolatedRaffleFixture=any;type DrawEmailClaim=any;
      export default function(deps:any){const {isolatedEmailTestRecipient,isEmailTestFixture,requireAdmin,cleanText}=deps;
      ${implementation}return claimDrawEmailDelivery;}
    `)
      }`
    );
    const fixture = {
      id: "00000000-0000-4000-8000-000000000009",
      event_key: "email-test-offline",
      outbound_recipient_email: "approved@example.invalid",
      send_vendor_email: false,
    };
    let rpcCalls = 0;
    let response: Record<string, unknown> = {
      claimed: true,
      channel: "couple",
      recipient: fixture.outbound_recipient_email,
      email_test_fixture_id: fixture.id,
      delivery_key: "offline",
      claim_token: "offline",
    };
    const claim = module.default({
      isolatedEmailTestRecipient: () => fixture.outbound_recipient_email,
      isEmailTestFixture: () => true,
      cleanText: (value: unknown) => String(value || ""),
      requireAdmin: () => ({
        rpc: async (name: string) => {
          rpcCalls++;
          assert(
            name === "claim_verified_qr_bingo_test_draw_email_delivery",
            "isolated claim RPC only",
          );
          return { data: response, error: null };
        },
      }),
    });
    let failed = false;
    try {
      await claim("offline", "vendor", fixture);
    } catch {
      failed = true;
    }
    assert(
      failed && rpcCalls === 0,
      "unapproved vendor copy fails before a claim is created",
    );
    assert(
      (await claim("offline", "couple", fixture)).status === "claimed",
      "legacy couple claim still works",
    );
    fixture.send_vendor_email = true;
    response = { ...response, channel: "vendor" };
    assert(
      (await claim("offline", "vendor", fixture)).status === "claimed",
      "explicitly opted-in vendor claim works",
    );
    for (
      const patch of [{ channel: "couple" }, {
        recipient: "wrong@example.invalid",
      }, { email_test_fixture_id: "wrong" }]
    ) {
      const previous = response;
      response = { ...response, ...patch };
      failed = false;
      try {
        await claim("offline", "vendor", fixture);
      } catch {
        failed = true;
      }
      assert(failed, "mismatched RPC identity cannot reach transport");
      response = previous;
    }
  });
  Deno.test(`${endpoint}: isolated contact pin accepts a login alias without changing identity`, async () => {
    const source = await Deno.readTextFile(endpointUrl);
    const helpers = [
      between(
        source,
        "function isEmailTestFixture(",
        "function qrDrawEmailsEnabled(",
      ),
      between(
        source,
        "function isolatedEmailTestContactMatches(",
        "const corsHeaders",
      ),
    ].join("\n");
    const module = await import(
      `data:application/typescript,${
        encodeURIComponent(`
          type IsolatedRaffleFixture = any;
          type EmailTestRaffleFixture = any;
          type QrContactProfile = any;
          export default function (qrContactEmail: (value: string) => string) {
            ${helpers}
            return isolatedEmailTestContactMatches;
          }
        `)
      }`
    );
    const matches = module.default(normalizeContactEmail);
    const fixture = {
      id: "9a69dbcf-691b-4580-a9cc-a555b3489a71",
      enabled: true,
      event_key: "email-test-contact-pin",
      couple_bd_user_id: "90001",
      vendor_bd_user_id: "90002",
      vendor_bingo_id: "90002",
      outbound_recipient_email: "winner@example.invalid",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const login = { user_id: "90001", email: "winner+login@example.invalid" };
    const profile = {
      event_key: fixture.event_key,
      couple_id: login.user_id,
      saved: true,
      complete: true,
      name: "Jamie and Taylor",
      email: fixture.outbound_recipient_email,
      phone: "5555550100",
    };
    assert(
      matches(fixture, profile, login.user_id),
      "a genuine couple may use an approved saved Bingo contact separate from its login alias",
    );
    assert(
      login.email === "winner+login@example.invalid",
      "checking a Bingo contact must not update account identity",
    );
    for (
      const [label, candidate] of [
        ["missing", null],
        ["unsaved", { ...profile, saved: false }],
        ["incomplete", { ...profile, complete: false }],
        ["wrong event", { ...profile, event_key: "email-test-other" }],
        ["wrong member", { ...profile, couple_id: "90003" }],
        ["wrong recipient", { ...profile, email: "other@example.invalid" }],
        ["login email instead of contact", { ...profile, email: login.email }],
        ["malformed recipient", { ...profile, email: "not-an-email" }],
      ] as const
    ) {
      assert(
        !matches(fixture, candidate, login.user_id),
        `${label} contact must not create a scan or draw entry`,
      );
    }
    for (
      const [label, candidate] of [
        ["disabled", { ...fixture, enabled: false }],
        ["expired", {
          ...fixture,
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        }],
        ["invalid expiry", { ...fixture, expires_at: "not-a-date" }],
        ["different couple", { ...fixture, couple_bd_user_id: "90003" }],
        ["not email test", {
          ...fixture,
          event_key: "niagara-wedding-show-2026",
        }],
      ] as const
    ) {
      assert(
        !matches(candidate, profile, login.user_id),
        `${label} fixture must fail closed`,
      );
    }
    assert(
      !matches(fixture, profile, fixture.vendor_bd_user_id),
      "a vendor identity cannot act as the fixture couple",
    );
  });

  Deno.test(`${endpoint}: list stays usable without creating fixture progress`, async () => {
    const source = await Deno.readTextFile(endpointUrl);
    const progressGuard = between(
      source,
      "if (\n        reviewFixture &&\n        isReviewCouple &&\n        isEmailTestFixture(reviewFixture)",
      "// Website proof is the authentication.",
    );
    assert(
      progressGuard.includes(
        '["scan", "raffle_offer", "raffle_opt_in"].includes(action)',
      ),
      "the contact pin applies only to scan and draw actions, not read-only list",
    );
    const listStart = source.indexOf('if (action === "list")');
    assert(listStart >= 0, "the read-only list handler must remain present");
    const list = source.slice(listStart);
    assert(
      !/saveIsolatedFixtureScan|optInToRaffle|drawWinner|sendDrawEmails|saveQrContactProfile/
        .test(list),
      "opening list must not create scans, entries, winners, emails or saved contacts",
    );
    assert(
      source.indexOf("!isolatedEmailTestContactMatches(") <
        source.indexOf('if (action === "scan")'),
      "the exact saved contact is checked before any scan can be written",
    );
  });
}

Deno.test("isolated email transport cannot be redirected or mistaken for production", async () => {
  const sources = await Promise.all(
    endpointUrls.map((url) => Deno.readTextFile(url)),
  );

  for (const source of sources) {
    assert(
      includesIgnoringWhitespace(
        source,
        'const vendorRequested = emailTestRecipient ? Boolean(isolatedFixture && "send_vendor_email" in isolatedFixture && isolatedFixture.send_vendor_email === true) : qrBingoConfig().send_vendor_email',
      ) &&
        /const coupleRequested\s*=\s*emailTestRecipient\s*\?\s*true\s*:\s*qrBingoConfig\(\)\.send_couple_email/
          .test(source) &&
        source.includes(
          "couple_to: emailTestRecipient || winnerEmail",
        ),
      "the test must require explicit vendor-copy opt-in and pin its recipient",
    );
    for (
      const identityCheck of [
        "draw.event_key !== fixture.event_key",
        "draw.vendor_bingo_id !== fixture.vendor_bingo_id",
        "draw.vendor_bd_user_id !== fixture.vendor_bd_user_id",
        "draw.couple_bd_user_id !== fixture.couple_bd_user_id",
        "qrContactEmail(draw.winner_email) !== emailTestRecipient",
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

Deno.test("website mail boundary independently allowlists only the two authorized exact test addresses", async () => {
  const widget = await Deno.readTextFile(
    new URL(
      "../../../brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php",
      import.meta.url,
    ),
  );

  const configuredHashes = [
    widget.match(/\$expectedRecipientHash\s*=\s*'([a-f0-9]{64})'/)?.[1],
    widget.match(/\$expectedCoupleAliasHash\s*=\s*'([a-f0-9]{64})'/)?.[1],
  ];
  assert(
    configuredHashes.every((hash) =>
      typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)
    ) &&
      new Set(configuredHashes).size === 2,
    "production must retain exactly two distinct pinned recipient hashes",
  );
  const sha256 = async (value: string) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(value),
        ),
      ),
    ).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  // Use reserved-domain addresses in an isolated in-memory copy. Never publish
  // private recipient addresses or alter the production allowlist for a test.
  const syntheticAddresses = [
    "qa.tester@example.invalid",
    "qa.tester+couple-test@example.invalid",
  ];
  const syntheticHashes = await Promise.all(syntheticAddresses.map(sha256));
  let fixtureWidget = widget;
  for (const [index, configured] of configuredHashes.entries()) {
    fixtureWidget = fixtureWidget.replace(configured!, syntheticHashes[index]);
  }
  const fixtureHashes = [
    fixtureWidget.match(/\$expectedRecipientHash\s*=\s*'([a-f0-9]{64})'/)?.[1],
    fixtureWidget.match(/\$expectedCoupleAliasHash\s*=\s*'([a-f0-9]{64})'/)
      ?.[1],
  ];
  for (const [index, address] of syntheticAddresses.entries()) {
    assert(
      fixtureHashes[index] === await sha256(address),
      "the isolated test copy must pin only its two exact synthetic recipients",
    );
  }
  for (
    const address of [
      "qa.tester+unapproved@example.invalid",
      "qa.tester+vendor-test@example.invalid",
      "qa.tester+different-couple@example.invalid",
      "qa.tester+couple-test@example.invalid.evil.example",
      "qatester@example.invalid",
    ]
  ) {
    assert(
      !fixtureHashes.includes(await sha256(address)),
      "other aliases, dot-normalized spellings and foreign domains must not be implicitly allowlisted",
    );
  }

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
      widget.indexOf("strpos($eventKey, 'app-review-') === 0") <
        widget.indexOf("if ($isEmailTestFixture)") &&
      includesIgnoringWhitespace(
        widget,
        "!(hash_equals($expectedRecipientHash, hash('sha256', $coupleTo)) || hash_equals($expectedCoupleAliasHash, hash('sha256', $coupleTo)))",
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
    between(source, "const coupleText = [", "let emailSend:")
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
        includesIgnoringWhitespace(template, phrase),
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
        `winner email template ${
          index + 1
        } still exposes internal copy: ${internalCopy}`,
      )
    );
  }
  assert(
    preview.includes("Subject: {vendorDrawEmailSubjectPreview}") &&
      includesIgnoringWhitespace(
        app,
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
    includesIgnoringWhitespace(
      app,
      "__DEV__ && (emailTestFixture || appReviewFixture)",
    ) &&
      app.includes("Emulate controlled email-test booth QR scan") &&
      app.includes("Test only: Emulate email-test booth QR") &&
      app.includes("Email test mode — no real prize") &&
      includesIgnoringWhitespace(
        app,
        "Test emails are sent only to the approved test recipient.",
      ) &&
      includesIgnoringWhitespace(app, "No real prize is awarded, and real draw entries are not included."),
    "the Simulator-only scan emulator and vendor warning must be visibly test-only",
  );
  assert(
    websiteMarkup.includes("email-test-fixture-notice") &&
      websiteMarkup.includes("Email test mode — no real prize.") &&
      websiteMarkup.includes(
        "Only the approved test recipient can receive this email.",
      ) &&
      websiteScript.includes("data.email_test_fixture"),
    "the website dashboard must identify the isolated no-prize email test",
  );

  const vendorEmailNotice = between(
    app,
    "{vendorRaffle.email_test_fixture ? (",
    "<View style={styles.vendorRaffleGuideCard}>",
  );
  assert(
    vendorEmailNotice.includes("Email test mode — no real prize") &&
      includesIgnoringWhitespace(
        vendorEmailNotice,
        "Test emails are sent only to the approved test recipient.",
      ) &&
      !vendorEmailNotice.includes("Sound Of Harmony"),
    "the native vendor email-test notice must not name an unrelated business",
  );
});
