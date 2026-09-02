function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function sourceFunction(source: string, functionName: string) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${functionName} is missing`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${functionName} is unterminated`);
}

const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

const migrationUrl = new URL(
  "../../migrations/20260830140000_enable_named_vendor_contact_exports.sql",
  import.meta.url,
);

const marketingMigrationUrl = new URL(
  "../../migrations/20260901070000_enable_named_vendor_marketing_consent.sql",
  import.meta.url,
);

Deno.test("named-vendor contact export is authenticated, scoped, complete, marketing-consented, and history-preserving", async () => {
  const sources = await Promise.all(
    endpointUrls.map((url) => Deno.readTextFile(url)),
  );

  for (const source of sources) {
    for (
      const required of [
        'const PREVIOUS_CONTACT_SHARING_RULES_VERSION = "2026-09-01-vendor-marketing"',
        'const CONTACT_SHARING_RULES_VERSION = "2026-09-01-in-person-entry"',
        'const CONTACT_SHARE_SCOPE = "named_vendor_draw_administration"',
        'action === "vendor_raffle_export"',
        "await resolveVendorForRaffleAction(",
        '.eq("event_key", eventKey)',
        '.eq("vendor_bingo_id", vendor.id)',
        '.eq("vendor_bd_user_id", vendorBdUserId)',
        '.eq("consent_share_contact", true)',
        '.eq("contact_share_scope", CONTACT_SHARE_SCOPE)',
        '.in("consent_version", NAMED_VENDOR_CONTACT_RULES_VERSIONS)',
        '.eq("vendor_marketing_consent", true)',
        "entryHasNamedVendorContactConsent(entry as RaffleEntry)",
        "entryHasProductionInPersonProof(entry)",
        "archivedLegacyEntryIds(eventKey, vendor.id)",
        '"Name"',
        '"Email"',
        '"Phone"',
        '"Wedding Date"',
        '"Marketing Consent"',
        '"Yes - named vendor draw entry and wedding-related marketing"',
        "body.draw_administration_contact_share_acknowledged !== true",
        "body.vendor_marketing_consent_acknowledged !== true",
        "contains_contact_data: true",
        "contact_share_scope: CONTACT_SHARE_SCOPE",
        "marketing_consent_included: true",
        'report_kind: "named_vendor_draw_contacts"',
        'rules_version: entry.consent_version || ""',
        "rules_version: currentConfig.rules_version",
        "event_revision: currentConfig.revision",
        "vendor_bingo_id: vendor.id",
        "vendor_bd_user_id: vendorBdUserId",
        "vendor_name: vendor.name",
        "entries: []",
      ]
    ) {
      assert(
        source.includes(required),
        `contact export is missing ${required}`,
      );
    }

    const completeRead = sourceFunction(source, "collectExactPostgrestRows");
    const exactCount = sourceFunction(
      source,
      "countVendorNamedContactEntries",
    );
    const pool = sourceFunction(source, "loadVendorEntryPool");
    const archived = sourceFunction(source, "archivedLegacyEntryIds");
    const states = sourceFunction(source, "loadVendorSelectionStateRows");
    const draws = sourceFunction(source, "loadVendorDrawRows");
    const report = sourceFunction(source, "buildVendorParticipationReport");
    assert(
      source.includes("const POSTGREST_PAGE_SIZE = 500") &&
        source.includes("const COMPLETE_READ_RETRIES = 3") &&
        completeRead.includes("before.count === after.count") &&
        completeRead.includes("rows.length === before.count") &&
        completeRead.includes("keys.size === before.count") &&
        completeRead.includes("rows.length + POSTGREST_PAGE_SIZE - 1") &&
        completeRead.includes("no partial result was returned") &&
        exactCount.includes('select("id", { count: "exact", head: true })') &&
        pool.includes('select("id", { count: "exact", head: true })') &&
        pool.includes('.order("created_at", { ascending: true })') &&
        pool.includes('.order("id", { ascending: true })') &&
        pool.includes(".range(from, to)") &&
        archived.includes("collectExactPostgrestRows") &&
        states.includes("collectExactPostgrestRows") &&
        draws.includes("collectExactPostgrestRows") &&
        report.indexOf("countVendorNamedContactEntries") <
          report.indexOf("loadVendorEntryPool") &&
        report.includes("exactConsentEntryCount > 5000") &&
        report.includes("pool.entry_count > 5000") &&
        source.includes('"too_large" in result') &&
        source.includes("no partial file was created") &&
        !source.includes(".limit(5001)"),
      "contact export must exact-count and page every scoped row without silently truncating at the API cap",
    );
    assert(
      source.includes("entry.consent_share_contact === true") &&
        source.includes("NAMED_VENDOR_CONTACT_RULES_VERSIONS.includes(") &&
        source.includes(
          "entry.consent_version === CONTACT_SHARING_RULES_VERSION",
        ) &&
        source.includes("entry.contact_share_scope === CONTACT_SHARE_SCOPE") &&
        source.includes("entry.vendor_marketing_consent === true") &&
        source.includes("entry.vendor_marketing_consented_at") &&
        source.includes("entry.vendor_marketing_consent_text"),
      "historical marketing rows must retain their recorded version while false or incomplete consent remains non-exportable",
    );
    assert(
      source.includes("function isolatedFixtureSuppressesOutbound") &&
        source.includes(
          "fixture && !isEmailTestFixture(fixture) && fixture.suppress_outbound_email",
        ) &&
        source.includes(
          'config.email_delivery_mode === "production_verified_fulfillment"',
        ),
      "App Review suppression and production verified-winner delivery must remain separate",
    );
  }
});

Deno.test("marketing migration requires fresh complete proof without backfilling legacy entries", async () => {
  const sql = await Deno.readTextFile(marketingMigrationUrl);

  for (
    const required of [
      "qr_bingo_participation_report_audit_marketing_scope_valid",
      "rules_version = '2026-09-01-vendor-marketing'",
      "vendor_marketing_consent boolean not null default false",
      "vendor_marketing_consent_text text not null default ''",
      "vendor_marketing_consented_at timestamptz",
      "qr_bingo_entrant_consent_audit_marketing_proof_complete",
      "new.vendor_marketing_consent := true",
      "new.vendor_marketing_consented_at := new.consented_at",
      "new.vendor_marketing_consent_text := format(",
      "or not new.vendor_marketing_consent",
      "or new.vendor_marketing_consented_at is null",
      "or nullif(btrim(new.vendor_marketing_consent_text), '') is null",
      "position('wedding-related offers and promotions' in new.vendor_marketing_consent_text) = 0",
      "position('unsubscribe' in lower(new.vendor_marketing_consent_text)) = 0",
      "Historical entries remain false until fresh consent.",
    ]
  ) {
    assert(
      sql.includes(required),
      `marketing migration is missing ${required}`,
    );
  }

  assert(
    !/update\s+public\.qr_bingo_raffle_entries\s+set\s+vendor_marketing_consent/i
      .test(sql),
    "the marketing migration must not backfill legacy entries as consented",
  );
});

Deno.test("contact-export migration keeps old consent historical and audits no contact values", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  for (
    const required of [
      "vendor_marketing_consent boolean not null default false",
      "vendor_marketing_consent_text text not null default ''",
      "vendor_marketing_consented_at timestamptz",
      "'selected_potential_winner_only'",
      "'named_vendor_draw_administration'",
      "report_kind text not null default 'anonymous_participation'",
      "contains_contact_data boolean not null default false",
      "marketing_consent_included boolean not null default false",
      "create or replace function public.prepare_qr_bingo_named_vendor_contact_share()",
      "new.entry_method = 'alternate_free_entry'",
      "new.consent_version = '2026-08-30-contact-share'",
      "new.contact_share_scope := 'named_vendor_draw_administration'",
      "This is not marketing consent; marketing requires a separate, optional choice.",
      "app_review_raffle_fixtures",
      "qr_bingo_email_test_fixtures",
      "claim_qr_bingo_test_draw_email_delivery(uuid,text,integer)",
      "pg_get_functiondef(",
      "current_entry.contact_share_scope <> ''selected_potential_winner_only''",
      "current_entry.contact_share_scope <> ''named_vendor_draw_administration''",
    ]
  ) {
    assert(
      sql.includes(required),
      `contact-export migration is missing ${required}`,
    );
  }

  assert(
    !/update\s+public\.qr_bingo_raffle_entries\s+set\s+contact_share_scope/i
      .test(sql),
    "historical selected-winner-only entries must never be broadened in bulk",
  );

  const auditAlter = sql.slice(
    sql.indexOf(
      "alter table if exists public.qr_bingo_participation_report_audit",
    ),
    sql.indexOf(
      "create or replace function public.prepare_qr_bingo_named_vendor_contact_share",
    ),
  );
  for (
    const forbidden of [
      "couple_name",
      "couple_email",
      "couple_phone",
      "csv text",
      "entry_id uuid",
    ]
  ) {
    assert(
      !auditAlter.includes(forbidden),
      `contact-export audit must not persist ${forbidden}`,
    );
  }
});
