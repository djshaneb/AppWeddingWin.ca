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

Deno.test("named-vendor entrant report stays authenticated, scoped, and consent-limited", async () => {
  const sources = await Promise.all(
    endpointUrls.map((url) => Deno.readTextFile(url)),
  );

  for (const source of sources) {
    assert(
      source.includes('action === "vendor_raffle_export"') &&
        source.includes("await resolveVendorForRaffleAction(") &&
        source.includes("buildVendorParticipationReport(") &&
        source.includes('.eq("event_key", eventKey)') &&
        source.includes('.eq("vendor_bingo_id", vendor.id)'),
      "the report must derive its exact live vendor/event scope from the authenticated session",
    );
    assert(
      source.includes("entryHasNamedVendorContactConsent(entry as RaffleEntry)") &&
        source.includes(
          '.in("consent_version", NAMED_VENDOR_CONTACT_RULES_VERSIONS)',
        ) &&
        source.includes("archivedLegacyEntryIds(eventKey, vendor.id)") &&
        source.includes("entry_count: entryPool.entry_count") &&
        source.includes(
          "material_terms_locked: activeEntryCount > 0 || offerActivated",
        ),
      "dashboard and report rows must preserve complete prior/current marketing-consented history, exclude archived QA records, and keep activated offer terms locked",
    );
    assert(
      source.includes("event_key: eventKey") &&
        source.includes("event_revision: qrBingoConfig().revision") &&
        source.includes("const currentConfig = qrBingoConfig()") &&
        source.includes(
          "currentConfig.rules_version !== CONTACT_SHARING_RULES_VERSION",
        ),
      "dashboard/export context must expose the current event identity and fail closed if contact-sharing rules are not current",
    );
    assert(
      source.includes(
        "participant_reference: await participationReference(",
      ) &&
        source.includes("contains_contact_data: true") &&
        source.includes(
          'const CONTACT_SHARE_SCOPE = "named_vendor_draw_administration";',
        ) &&
        source.includes("contact_share_scope: CONTACT_SHARE_SCOPE") &&
        source.includes("marketing_consent_included: true") &&
        source.includes('report_kind: "named_vendor_draw_contacts"') &&
        source.includes('rules_version: entry.consent_version || ""') &&
        source.includes("entry.rules_version,") &&
        source.includes("rules_version: currentConfig.rules_version") &&
        source.includes("event_revision: currentConfig.revision") &&
        source.includes("vendor_bingo_id: vendor.id") &&
        source.includes("vendor_bd_user_id: vendorBdUserId") &&
        source.includes("vendor_name: vendor.name") &&
        source.includes('"Event"') &&
        source.includes('"Vendor"') &&
        source.includes('"Participant Reference"') &&
        source.includes('"Name"') &&
        source.includes('"Email"') &&
        source.includes('"Phone"') &&
        source.includes('"Wedding Date"') &&
        source.includes('"Entered At"') &&
        source.includes('"Entry Method"') &&
        source.includes('"Rules Version"') &&
        source.includes('"Entrant Eligibility Attested"') &&
        source.includes('"Selection Status"') &&
        source.includes('"Marketing Consent"') &&
        source.includes(
          '"Yes - named vendor draw entry and wedding-related marketing"',
        ) &&
        !source.includes('"Eligibility Confirmed"'),
      "the report must include each visible named-vendor contact row with its recorded rules version and marketing grant",
    );
    assert(
      source.includes("/^[\\s]*[=+@-]/") &&
        source.includes('raw.replace(/"/g,') &&
        source.includes('mime_type: "text/csv;charset=utf-8"'),
      "CSV generation must neutralize formulas, quote cells, and declare UTF-8",
    );
    assert(
      source.includes("qr_bingo_participation_report_audit") &&
        source.includes("(recentReportCount || 0) >= 5") &&
        source.includes("retry_after_seconds: 60"),
      "reports must be metadata-audited and rate limited",
    );
    assert(
      source.includes(
        "vendorVisibleDraw(draw, isolatedFixture, suppressOutboundEmail)",
      ) &&
        source.includes("winner_name: draw.winner_name") &&
        source.includes("winner_email: draw.winner_email") &&
        source.includes("winner_phone: draw.winner_phone") &&
        source.includes("winner_wedding_date: draw.winner_wedding_date") &&
        source.includes("entries: []") &&
        !source.includes("mayExposeWinner"),
      "selected-person contact must remain available in vendor-owned draw history without returning the full entrant list",
    );
  }
});

Deno.test("participation-report audit cannot store entrant data and is immutable", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260830050000_create_qr_bingo_participation_report_audit.sql",
      import.meta.url,
    ),
  );

  for (
    const forbidden of [
      "couple_bd_user_id",
      "entry_id",
      "email",
      "phone",
      "csv",
    ]
  ) {
    const createTable = migration.slice(
      migration.indexOf("create table"),
      migration.indexOf("create index"),
    );
    assert(
      !createTable.includes(forbidden),
      `audit table must not persist ${forbidden}`,
    );
  }
  assert(
    migration.includes("enable row level security") &&
      migration.includes("revoke all on table") &&
      migration.includes("before update or delete") &&
      migration.includes("records are immutable"),
    "audit metadata must be service-only and immutable",
  );
});

Deno.test("website and iOS request the same real CSV report", async () => {
  const website = await Deno.readTextFile(
    new URL(
      "../../../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js",
      import.meta.url,
    ),
  );
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );

  assert(
    website.includes("request(root, 'vendor_raffle_export'") &&
      website.includes("new Blob([csv]") &&
      website.includes("link.download = filename") &&
      website.includes("data.report.contains_contact_data !== true") &&
      website.includes(
        "data.report.contact_share_scope !== 'named_vendor_draw_administration'",
      ) &&
      website.includes("data.report.marketing_consent_included !== true") &&
      website.includes(
        "data.report.report_kind !== 'named_vendor_draw_contacts'",
      ) &&
      website.includes("data.report.mime_type !== 'text/csv;charset=utf-8'") &&
      website.includes("data.report.rules_version !== expectedRulesVersion") &&
      website.includes("data.report.event_key !== expectedEventKey") &&
      website.includes(
        "data.report.event_revision !== expectedEventRevision",
      ) &&
      website.includes(
        "data.report.vendor_bingo_id !== expectedVendorBingoId",
      ) &&
      website.includes(
        "data.report.vendor_bd_user_id !== expectedVendorBdUserId",
      ) &&
      website.includes("data.report.vendor_name !== expectedVendorName") &&
      website.includes("typeof data.report.csv !== 'string'") &&
      website.indexOf(
          "data.report.report_kind !== 'named_vendor_draw_contacts'",
        ) <
        website.indexOf("downloadCsv(data.report)"),
    "website must validate the full current vendor/event/rules/CSV contract before downloading the CSV",
  );
  assert(
    app.includes("action: 'vendor_raffle_export'") &&
      app.includes("report.contains_contact_data !== true") &&
      includesIgnoringWhitespace(
        app,
        "report.contact_share_scope !== 'named_vendor_draw_administration'",
      ) &&
      app.includes("report.marketing_consent_included !== true") &&
      app.includes("report.report_kind !== 'named_vendor_draw_contacts'") &&
      app.includes("report.mime_type !== 'text/csv;charset=utf-8'") &&
      app.includes("report.rules_version !== expectedRulesVersion") &&
      app.includes("report.event_key !== expectedEventKey") &&
      app.includes("report.event_revision !== expectedEventRevision") &&
      app.includes("report.vendor_bingo_id !== expectedVendorBingoId") &&
      app.includes("report.vendor_bd_user_id !== expectedVendorBdUserId") &&
      app.includes("report.vendor_name !== expectedVendorName") &&
      app.includes("typeof data.report.csv !== 'string'") &&
      app.includes("new File(Paths.cache, safeFilename)") &&
      app.includes("await Sharing.shareAsync(reportFile.uri") &&
      app.includes("UTI: 'public.comma-separated-values-text'") &&
      app.indexOf("report.report_kind !== 'named_vendor_draw_contacts'") <
        app.indexOf("new File(Paths.cache, safeFilename)"),
    "iOS must validate the full current vendor/event/rules/CSV contract before materializing the native file",
  );
});
