function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const syncUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

const CURRENT_MARKETING_RULES_VERSION = "2026-09-01-vendor-marketing";

function extract(source: string, pattern: RegExp, label: string) {
  const value = source.match(pattern)?.[1] || "";
  assert(value, `${label} is missing`);
  return value;
}

function sourceBlock(source: string, marker: string) {
  const start = source.indexOf(marker);
  assert(start >= 0, `${marker} is missing`);
  const open = source.indexOf("{", start);
  assert(open >= 0, `${marker} has no block`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${marker} is unterminated`);
}

function normalizedEdgeSource(source: string) {
  return source
    .replace(
      'const action = String(body?.action || "vendor_raffle_get");',
      'const action = String(body?.action || "list");',
    )
    .replace(
      'console.error("bd-qr-bingo-vendor-sync request failed", failure);',
      'console.error("bd-qr-bingo-sync request failed", failure);',
    )
    .replace(
      'error: "QR Bingo vendor sync unavailable",',
      'error: "QR Bingo sync unavailable",',
    );
}

Deno.test("QR sync endpoints fail closed for incomplete couple contact details", async () => {
  const sources = await Promise.all(
    syncUrls.map((url) => Deno.readTextFile(url)),
  );
  for (const source of sources) {
    for (
      const required of [
        "function qrContactProfile",
        'missingFields.push("name")',
        'missingFields.push("email")',
        'missingFields.push("phone number")',
        '["scan", "raffle_offer", "raffle_opt_in"].includes(action)',
        'code: "profile_incomplete"',
        "missing_profile_fields: contactProfile.missing_fields",
        "profile_complete: contactProfile.complete",
        'action === "scan"',
        'code: "participation_notice_required"',
        "participation_notice_version: qrParticipationNoticeVersion()",
      ]
    ) {
      assert(source.includes(required), `QR endpoint is missing ${required}`);
    }
  }
});

Deno.test("native, website, and both Edge endpoints use one versioned participation notice", async () => {
  const [app, website, ...sources] = await Promise.all([
    Deno.readTextFile(
      new URL("../../../app/(tabs)/index.tsx", import.meta.url),
    ),
    Deno.readTextFile(
      new URL(
        "../../../brilliant-directories/widgets/258-julian-qr-code-bingo.php",
        import.meta.url,
      ),
    ),
    ...syncUrls.map((url) => Deno.readTextFile(url)),
  ]);

  const appVersion = extract(
    app,
    /const QR_BINGO_PARTICIPATION_NOTICE_VERSION = '([^']+)'/,
    "native notice version",
  );
  const websiteVersion = extract(
    website,
    /\$participationNoticeVersion = \(string\)\$eventConfig\['rules_version'\] \. '\|([^']+)'/,
    "website notice version",
  );
  const edgeVersions = sources.map((source, index) =>
    extract(
      source,
      /const QR_PARTICIPATION_NOTICE_VERSION = "([^"]+)"/,
      `Edge notice version ${index + 1}`,
    )
  );
  assert(
    [appVersion, websiteVersion, ...edgeVersions].every((version) =>
      version === CURRENT_MARKETING_RULES_VERSION
    ),
    "app, website, and Edge notice suffixes must match the current marketing rules version",
  );

  assert(
    website.includes(
      "'couple|' . (string)$userId . '|' . $eventConfig['event_key'] . '|' . $participationNoticeVersion",
    ) &&
      website.includes("window.localStorage.getItem(storageKey) === '1'") &&
      website.includes("window.localStorage.setItem(storageKey, '1')"),
    "website notice storage must rotate with the complete participation notice version",
  );
  assert(
    app.includes(
      "`${eventConfig?.rules_version || ''}|${QR_BINGO_PARTICIPATION_NOTICE_VERSION}`",
    ) &&
      app.includes(
        "${rulesVersion}.${QR_BINGO_PARTICIPATION_NOTICE_VERSION}",
      ),
    "native requests and persisted acknowledgement keys must include the event and notice versions",
  );

  for (const source of sources) {
    const productionScan = sourceBlock(source, 'if (action === "scan")');
    assert(
      productionScan.includes("const scanResult = await postQrAction(") &&
        productionScan.includes('action: "scan_vendor"') &&
        productionScan.includes(
          "participation_notice_version: qrParticipationNoticeVersion()",
        ) &&
        productionScan.includes(
          "const safeStatus = [409, 422, 428].includes(upstreamStatus)",
        ),
      "each production Edge scan branch must forward the accepted notice version and preserve safe upstream rejection statuses",
    );
  }
});

Deno.test("couple and vendor Edge endpoints remain behaviorally identical", async () => {
  const [coupleSource, vendorSource] = await Promise.all(
    syncUrls.map((url) => Deno.readTextFile(url)),
  );
  assert(
    normalizedEdgeSource(vendorSource) === normalizedEdgeSource(coupleSource),
    "Edge copies may differ only by default action, log label, and generic error label",
  );
});

Deno.test("native QR UI collects phone and gates real and emulated scans behind profile and notice", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  for (
    const required of [
      "const [profilePhone, setProfilePhone]",
      'placeholder="Phone number"',
      "phone: profilePhone.trim()",
      "phone: profile.phone",
      "phone_number: data.user?.phone_number || profile.phone",
      "function missingQrContactFields",
      "data.profile_complete === false",
      "setServerMissingContactFields",
      "if (!contactProfileComplete)",
      "if (!participationNoticeAccepted)",
      "participation_notice_version:",
      "Complete Contact Details",
      "Save & Continue to QR Bingo",
      "I agree to the QR Bingo Terms.",
      "Read QR Bingo Terms",
      "View Privacy Policy",
    ]
  ) {
    assert(app.includes(required), `native QR gate is missing ${required}`);
  }
});

Deno.test("website QR UI and POST boundary use the same contact and participation gates", async () => {
  const [widget, terms] = await Promise.all([
    Deno.readTextFile(
      new URL(
        "../../../brilliant-directories/widgets/258-julian-qr-code-bingo.php",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(
      new URL(
        "../../../brilliant-directories/pages/about-terms.html",
        import.meta.url,
      ),
    ),
  ]);
  for (
    const required of [
      "function ww_qr_bingo_contact_profile",
      "'code' => 'profile_incomplete'",
      "'code' => 'participation_notice_required'",
      "Complete Contact Details",
      "const CONTACT_PROFILE_COMPLETE",
      "const PARTICIPATION_NOTICE_VERSION",
      "if (!qrRulesNoticeAccepted)",
      "participation_notice_version=${encodeURIComponent(PARTICIPATION_NOTICE_VERSION)}",
    ]
  ) {
    assert(widget.includes(required), `website QR gate is missing ${required}`);
  }
  const compactTerms = terms.replace(/\s+/g, " ");
  assert(
    compactTerms.includes(
      "accurate account name, working email address, and usable phone number",
    ) &&
      compactTerms.includes(
        "A booth scan alone does not disclose those contact details to a vendor",
      ) &&
      compactTerms.includes(
        "send its own wedding-related offers and promotions",
      ) &&
      compactTerms.includes(
        "honour later unsubscribe or consent-withdrawal requests",
      ),
    "Terms must distinguish scanning from a named-vendor draw entry and explain the recorded marketing grant",
  );
});
