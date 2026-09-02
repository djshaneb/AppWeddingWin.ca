function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const migrationUrl = new URL(
  "../../migrations/20260830120000_add_qr_bingo_vendor_offer_versions.sql",
  import.meta.url,
);
const adminUrl = new URL("../bd-qr-bingo-admin/index.ts", import.meta.url);
const syncUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

function sqlFunction(sql: string, name: string) {
  const marker = `create or replace function public.${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${name} is missing`);
  const tail = sql.slice(start);
  const end = tail.indexOf("\n$$;");
  assert(end >= 0, `${name} is not terminated`);
  return tail.slice(0, end + 4);
}

function sourceFunction(source: string, name: string) {
  const markers = [`async function ${name}`, `function ${name}`];
  const start =
    markers.map((marker) => source.indexOf(marker)).find((value) =>
      value >= 0
    ) ?? -1;
  assert(start >= 0, `${name} is missing`);
  const tail = source.slice(start + 1);
  const next = tail.search(/\n(?:async )?function [A-Za-z0-9_]+/);
  return next >= 0
    ? source.slice(start, start + 1 + next)
    : source.slice(start);
}

Deno.test("vendor offer history is append-only, complete, serialized, and legacy-safe", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  for (
    const required of [
      "create table if not exists public.qr_bingo_vendor_offer_versions",
      "primary key (event_key, vendor_bingo_id, vendor_offer_version)",
      "event_name text not null",
      "vendor_tag_id integer",
      "activation_excluded_as_legacy_qa boolean not null default false",
      "prize_title text not null",
      "prize_description text not null",
      "history_starts_at timestamptz",
      "entry_closes_at timestamptz",
      "draw_opens_at timestamptz",
      "draw_at timestamptz",
      "vendor_responsibility_disclosure_text text not null",
      "participant_responsibility_disclosure_text text not null",
      "alter table public.qr_bingo_vendor_offer_versions enable row level security",
      "grant select on table public.qr_bingo_vendor_offer_versions to service_role",
      "before update or delete on public.qr_bingo_vendor_offer_versions",
      "QR Bingo vendor offer history is append-only.",
      "create trigger capture_qr_bingo_vendor_offer_version",
      "after insert or update on public.qr_bingo_raffle_settings",
      "create trigger acquire_qr_bingo_offer_publish_lock",
      "hashtextextended('qr_bingo_event_config_publish', 0)",
      "clock_timestamp(), old.updated_at + interval '1 microsecond'",
    ]
  ) {
    assert(sql.includes(required), `offer history is missing ${required}`);
  }
  assert(
    /revoke all on table public\.qr_bingo_vendor_offer_versions[\s\S]*?from public, anon, authenticated, service_role/i
      .test(sql),
    "offer history must not permit direct client or service-role writes",
  );

  for (
    const guardedFact of [
      "entry.event_key = 'niagara-wedding-show-2026'",
      "entry.vendor_bingo_id = '23608'",
      "entry.couple_bd_user_id = '38828'",
      "entry.couple_name = 'Bob Win'",
      "entry.consent_version = '2026-05-18'",
      "qa_draw_count <> 12",
      "draw.selection_status is distinct from 'legacy'",
      "date '2026-05-21'",
      "date '2026-05-24'",
    ]
  ) {
    assert(
      sql.includes(guardedFact),
      `legacy QA guard is missing ${guardedFact}`,
    );
  }
  assert(
    sql.includes(
      "create table if not exists public.qr_bingo_legacy_qa_archives",
    ) &&
      sql.includes("Archived QR Bingo legacy QA entries are immutable.") &&
      sql.includes("not version.activation_excluded_as_legacy_qa"),
    "only the exact archived QA chain may be excluded, and it must remain immutable",
  );
});

Deno.test("entry and event triggers enforce the exact immutable offer", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const entryGate = sqlFunction(sql, "enforce_qr_bingo_entry_offer_version");
  const settingsLock = sqlFunction(
    sql,
    "lock_activated_qr_bingo_offer_material_terms",
  );
  const eventGate = sqlFunction(
    sql,
    "gate_activated_qr_bingo_event_material_publish",
  );

  assert(
    sql.includes("add column if not exists vendor_offer_version timestamptz") &&
      sql.includes("qr_bingo_raffle_entries_offer_version_fk") &&
      sql.includes(
        "foreign key (event_key, vendor_bingo_id, vendor_offer_version)",
      ),
    "entries must reference an existing immutable offer",
  );
  for (
    const required of [
      "offer.offer_enterable",
      "offer.activation_excluded_as_legacy_qa",
      "message = 'stale_vendor_offer'",
      "latest_at_submission",
      "version.vendor_offer_version <= new.source_submitted_at",
      "current_settings_version is distinct from new.vendor_offer_version",
      "current_settings_enabled is distinct from true",
      "current_vendor_draws_enabled is distinct from true",
      "for share",
    ]
  ) {
    assert(
      entryGate.includes(required),
      `entry offer gate is missing ${required}`,
    );
  }
  assert(
    settingsLock.includes("version.offer_enterable") &&
      settingsLock.includes("not version.activation_excluded_as_legacy_qa") &&
      !settingsLock.includes("new.enabled"),
    "the first real enterable offer must freeze material terms but not emergency availability",
  );
  assert(
    eventGate.includes("config.event_key = new.event_key") &&
      eventGate.includes("version.offer_enterable") &&
      eventGate.includes("qr_bingo_legacy_qa_archives") &&
      !eventGate.includes("new.vendor_draws_enabled") &&
      !eventGate.includes("new.scan_enabled"),
    "same-event material publishing must be gated without freezing emergency toggles",
  );
});

Deno.test("vendor acceptance is canonical, attributable, hashed, and append-only", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  for (
    const required of [
      "authenticated_vendor_bd_user_id text",
      "acceptance_source text",
      "authority_to_bind_attested boolean",
      "responsibility_disclosure_sha256 text",
      "extensions.digest(",
      "vendor_offer_version timestamptz",
      "deferrable initially deferred",
      "request.qr_bingo_authenticated_vendor_bd_user_id",
      "request.qr_bingo_vendor_acceptance_source",
      "request.qr_bingo_vendor_authority_to_bind",
      "request.qr_bingo_participant_responsibility_disclosure",
      "authenticated_vendor_id is distinct from new.vendor_bd_user_id",
      "source_channel not in ('app', 'website')",
      "create trigger record_qr_bingo_vendor_responsibility_acceptance",
      "p_authenticated_vendor_bd_user_id text",
      "p_acceptance_source text",
      "p_authority_to_bind boolean",
      "p_participant_responsibility_disclosure text",
    ]
  ) {
    assert(
      sql.includes(required),
      `acceptance evidence is missing ${required}`,
    );
  }
  assert(
    /revoke all on function public\.compare_and_update_qr_bingo_vendor_settings\(\s*text, text, timestamptz, jsonb\s*\)[\s\S]*?service_role/i
      .test(sql),
    "the unattributed four-argument settings RPC must no longer be callable",
  );

  const sources = await Promise.all(
    syncUrls.map((url) => Deno.readTextFile(url)),
  );
  for (const source of sources) {
    const disclosure = sourceFunction(
      source,
      "vendorResponsibilityDisclosure",
    );
    const participant = sourceFunction(
      source,
      "participantResponsibilityDisclosure",
    );
    for (
      const phrase of [
        "authorized to bind",
        "named vendor-promotion sponsor",
        "vendor indemnity",
        "all legally required licences, permits, and insurance",
        "correct legal/operating business identity and a working contact route",
      ]
    ) {
      assert(
        disclosure.includes(phrase),
        `vendor disclosure is missing ${phrase}`,
      );
    }
    assert(
      !disclosure.includes("sole sponsor") &&
        disclosure.includes("APPLE_NON_SPONSOR_DISCLAIMER") &&
        participant.includes("PLATFORM_ROLE") &&
        source.includes("limited platform sponsor solely") &&
        source.includes("privacy and security obligations") &&
        source.includes("wilful misconduct") &&
        source.includes("non-waivable law") &&
        participant.includes(
          "share my name, email address, phone number, wedding date, and entry/consent evidence",
        ) &&
        participant.includes("to administer this specific draw") &&
        participant.includes(
          "contact me with wedding-related offers and promotions",
        ) &&
        participant.includes(
          "I may unsubscribe from vendor marketing at any time.",
        ),
      "canonical roles and named-vendor draw and marketing data scope must stay aligned",
    );
    const platformRole = source.match(
      /const PLATFORM_ROLE =\s*\n?\s*"([^"]+)";/,
    )?.[1] || "";
    const appleDisclaimer = source.match(
      /const APPLE_NON_SPONSOR_DISCLAIMER =\s*\n?\s*"([^"]+)";/,
    )?.[1] || "";
    const disclosureTemplate = disclosure.match(/return `([\s\S]*?)`;/)?.[1] ||
      "";
    const longestDisclosure = disclosureTemplate
      .replaceAll("${vendorName}", "X".repeat(180))
      .replaceAll("${PLATFORM_ROLE}", platformRole)
      .replaceAll("${APPLE_NON_SPONSOR_DISCLAIMER}", appleDisclaimer);
    assert(
      longestDisclosure.length > 0 && longestDisclosure.length <= 2000,
      "canonical vendor responsibility text must fit the persisted 2,000-character bound",
    );
    assert(
      source.includes(
        "echoedResponsibilityDisclosure !== responsibilityDisclosure",
      ) &&
        source.includes(
          'code: "stale_vendor_responsibility_disclosure"',
        ) &&
        source.includes(
          "vendor_responsibility_disclosure: vendorResponsibilityDisclosure(",
        ),
      "vendor dashboard saves must round-trip the exact canonical agreement",
    );
  }
});

Deno.test("Form 354 reconciliation binds the effective submitted event and offer versions", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const rpc = sqlFunction(sql, "reconcile_qr_bingo_alternate_free_entry");
  for (
    const required of [
      "p_submitted_event_revision bigint",
      "p_vendor_offer_version timestamptz",
      "effective_revision_at_submission",
      "config.created_at <= submitted_at_value",
      "max(config.revision)",
      "max(version.vendor_offer_version)",
      "version.vendor_offer_version <= submitted_at_value",
      "latest_offer_at_submission is distinct from offer.vendor_offer_version",
      "submitted_config.vendor_draws_enabled",
      "offer.activation_excluded_as_legacy_qa",
      "offer.prize_title",
      "offer.prize_description",
      "offer.prize_approx_value_cad",
      "offer.participant_responsibility_disclosure_text",
      "p_participant_responsibility_disclosure text",
      "submitted_participant_disclosure is distinct from offer.participant_responsibility_disclosure_text",
      "offer.vendor_offer_version",
      "'code', 'stale_vendor_offer'",
    ]
  ) {
    assert(
      rpc.includes(required),
      `versioned reconciliation is missing ${required}`,
    );
  }
  assert(
    sql.includes(
      "drop function if exists public.reconcile_qr_bingo_alternate_free_entry(\n  text, bigint, text",
    ) &&
      /grant execute on function public\.reconcile_qr_bingo_alternate_free_entry\([\s\S]*?\) to service_role/i
        .test(sql),
    "the insecure old overload must be removed and only the exact new service signature granted",
  );
  assert(
    !rpc.includes("vendor_settings.prize_title") &&
      !rpc.includes("current_config.rules_version,") &&
      !rpc.includes("not current_config.vendor_draws_enabled"),
    "delayed reconciliation must copy the original snapshot and use as-submitted availability",
  );
});

Deno.test("alternate-entry closure is append-only and blocks production draws until current", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const declaration = sqlFunction(
    sql,
    "declare_qr_bingo_alternate_entry_reconciliation_complete",
  );
  const drawGate = sqlFunction(
    sql,
    "require_qr_bingo_alternate_entry_closure_for_draw",
  );
  for (
    const required of [
      "create table if not exists public.qr_bingo_alternate_entry_reconciliation_closures",
      "all_timely_submissions_reviewed boolean not null",
      "attestation_version text not null",
      "documented as rejected",
      "before update or delete on public.qr_bingo_alternate_entry_reconciliation_closures",
      "before insert on public.qr_bingo_raffle_draws",
    ]
  ) {
    assert(sql.includes(required), `closure audit is missing ${required}`);
  }
  assert(
    declaration.includes(
      "clock_timestamp() < current_config.entry_closes_at",
    ) &&
      declaration.includes(
        "p_all_timely_submissions_reviewed is distinct from true",
      ) &&
      declaration.includes(
        "current_config.revision is distinct from p_expected_revision",
      ),
    "closure declaration must require post-close explicit attestation for the exact revision",
  );
  assert(
    drawGate.includes(
      "latest_reconciliation > latest_declaration.declared_at",
    ) &&
      drawGate.includes("alternate_entry_reconciliation_incomplete") &&
      drawGate.includes("app_review_raffle_fixtures") &&
      drawGate.includes("qr_bingo_email_test_fixtures") &&
      drawGate.includes("fixture.expires_at > clock_timestamp()"),
    "draws must fail closed after any later reconciliation with only active isolated fixtures bypassed",
  );
});

Deno.test("authenticated offers are minimized snapshots, public discovery is retired, and stale opt-ins refresh with 409", async () => {
  const sources = await Promise.all(
    syncUrls.map((url) => Deno.readTextFile(url)),
  );
  for (const source of sources) {
    const profileUrl = sourceFunction(source, "absoluteWeddingWinUrl");
    assert(
      profileUrl.includes('resolved.protocol !== "https:"') &&
        profileUrl.includes("resolvedHost !== baseHost"),
      "vendor profile links must remain HTTPS and on the Wedding Win host",
    );
    const authOffer = sourceFunction(source, "buildRaffleOffer");
    const optIn = sourceFunction(source, "optInToRaffle");
    for (const offerBody of [authOffer]) {
      for (
        const required of [
          "vendor_offer_version",
          "prize_count: raffleMaxWinners(snapshot!.max_winners)",
          "exclude_previous_winners",
          "entry_opens_at",
          "entry_closes_at",
          "draw_at",
          "entry_limit:",
          "participant_responsibility_disclosure",
          "vendor_business_name",
          "vendor_profile_url",
        ]
      ) {
        assert(
          offerBody.includes(required),
          `offer DTO is missing ${required}`,
        );
      }
      assert(
        !offerBody.includes("vendor_email") &&
          !offerBody.includes("vendor_address"),
        "participant offer DTO must not expose vendor email or address",
      );
      for (
        const forbidden of [
          "legal_terms_accepted_at",
          "rules_viewed_at",
          "activation_excluded_as_legacy_qa:",
          "captured_at",
          "vendor_responsibility_disclosure_sha256",
          "authenticated_vendor_bd_user_id",
          "vendor_responsibility_disclosure:",
        ]
      ) {
        assert(!offerBody.includes(forbidden), `offer DTO leaks ${forbidden}`);
      }
    }
    const retiredOfferStart = source.indexOf(
      'if (action === "alternate_free_entry_offers")',
    );
    const retiredOfferEnd = source.indexOf(
      "if (!runtimeConfig.scan_enabled",
      retiredOfferStart,
    );
    const retiredOffer = source.slice(retiredOfferStart, retiredOfferEnd);
    assert(
      retiredOfferStart >= 0 && retiredOfferEnd > retiredOfferStart &&
        retiredOffer.includes('code: "offsite_entry_retired"') &&
        /\},\s*410,\s*false,?\s*\);/.test(retiredOffer) &&
        !retiredOffer.includes("offers:"),
      "public off-site offer discovery must return HTTP 410 without an offer DTO",
    );
    for (
      const required of [
        "body.vendor_offer_version",
        "loadVendorOfferSnapshot(",
        "suppliedSnapshot.vendor_offer_version !==",
        "vendor_offer_version: currentSnapshot!.vendor_offer_version",
        'code: "stale_vendor_offer"',
      ]
    ) {
      assert(optIn.includes(required), `QR opt-in is missing ${required}`);
    }
    assert(
      /promotion_disclosure_text:\s*currentSnapshot!?\.participant_responsibility_disclosure_text/
        .test(optIn) &&
        optIn.includes("body.participant_responsibility_disclosure") &&
        optIn.includes(
          "currentSnapshot!.participant_responsibility_disclosure_text",
        ),
      "QR opt-in must require and copy the exact immutable participant disclosure",
    );
    assert(
      /staleVendorOffer\s*\? 409/.test(source) &&
        source.includes("raffle_offer: refreshedOffer") &&
        source.includes('"select_qr_bingo_potential_winner"') &&
        !source.includes("random[0] % eligible.length"),
      "stale QR offers must return a refreshed 409 and selection must use the atomic database RPC",
    );
  }
});

Deno.test("locked vendor offers permit only the one-way fresh in-person rules reacceptance", async () => {
  const sources = await Promise.all(
    syncUrls.map((url) => Deno.readTextFile(url)),
  );

  for (const source of sources) {
    const nonConsentFingerprint = sourceFunction(
      source,
      "nonConsentMaterialSettingsFingerprint",
    );
    const transition = sourceFunction(
      source,
      "isPermittedInPersonEntryRulesTransition",
    );

    assert(
      source.includes(
        'const PREVIOUS_CONTACT_SHARING_RULES_VERSION = "2026-09-01-vendor-marketing";',
      ) &&
        source.includes(
          'const CONTACT_SHARING_RULES_VERSION = "2026-09-01-in-person-entry";',
        ) &&
        transition.includes(
          "cleanText(current.legal_terms_version, 80) ===\n      PREVIOUS_CONTACT_SHARING_RULES_VERSION",
        ) &&
        transition.includes(
          "cleanText(next.legal_terms_version, 80) === CONTACT_SHARING_RULES_VERSION",
        ) &&
        transition.includes('"visited this vendor booth in person"') &&
        transition.includes(
          "nonConsentMaterialSettingsFingerprint(current) ===",
        ) &&
        transition.includes("nonConsentMaterialSettingsFingerprint(next)"),
      "the locked-offer exception must be exactly the immediately-prior-to-current in-person rules transition",
    );

    for (
      const materialField of [
        "prize_title",
        "prize_description",
        "prize_approx_value_cad",
        "official_rules_url",
        "eligibility_region",
        "entry_closes_at",
        "draw_at",
        "draw_opens_at",
        "odds_basis",
        "no_purchase_required",
        "skill_testing_question_required",
        "prize_provider_name",
        "alternate_free_entry_url",
        "max_winners",
        "exclude_previous_winners",
      ]
    ) {
      assert(
        nonConsentFingerprint.includes(`${materialField}:`),
        `consent-only transition fingerprint is missing ${materialField}`,
      );
    }
    assert(
      !nonConsentFingerprint.includes("legal_terms_version:") &&
        !nonConsentFingerprint.includes(
          "participant_responsibility_disclosure_text:",
        ),
      "only the rules version and participant consent disclosure may rotate during reacceptance",
    );

    const executableFingerprint = nonConsentFingerprint.replace(
      "settings: Partial<RaffleSettings>",
      "settings",
    );
    const executableTransition = transition
      .replace("current: Partial<RaffleSettings>", "current")
      .replace("next: Partial<RaffleSettings>", "next");
    const permitsTransition = new Function(`
      const PREVIOUS_CONTACT_SHARING_RULES_VERSION = "2026-09-01-vendor-marketing";
      const CONTACT_SHARING_RULES_VERSION = "2026-09-01-in-person-entry";
      function cleanText(value, max) {
        return String(value || "").replace(/\\s+/g, " ").trim().slice(0, max);
      }
      function positiveCadValue(value) {
        const amount = Number(value);
        return Number.isFinite(amount) && amount > 0
          ? Math.round(amount * 100) / 100
          : 0;
      }
      function raffleMaxWinners(value) {
        const count = Number(value);
        return Number.isInteger(count) && count >= 1 && count <= 3 ? count : 1;
      }
      ${executableFingerprint}
      ${executableTransition}
      return isPermittedInPersonEntryRulesTransition;
    `)() as (
      current: Record<string, unknown>,
      next: Record<string, unknown>,
    ) => boolean;

    const materialSettings: Record<string, unknown> = {
      prize_title: "50% off photography",
      prize_description: "50% off one package; maximum savings $500.",
      prize_approx_value_cad: 500,
      official_rules_url:
        "https://www.weddingwin.ca/qr-bingo-vendor-draw-rules",
      eligibility_region: "Ontario, Canada",
      entry_closes_at: "2027-01-31T07:59:00.000Z",
      draw_at: "2027-01-31T08:04:00.000Z",
      draw_opens_at: "2026-09-01T12:00:00.000Z",
      odds_basis: "Each accepted entry has an equal chance.",
      no_purchase_required: true,
      skill_testing_question_required: true,
      prize_provider_name: "Test Vendor",
      alternate_free_entry_url: "https://www.weddingwin.ca/qr-bingo-free-entry",
      max_winners: 1,
      exclude_previous_winners: true,
    };
    const current = {
      ...materialSettings,
      legal_terms_version: "2026-09-01-vendor-marketing",
      participant_responsibility_disclosure_text:
        "Prior named-vendor marketing disclosure.",
    };
    const next = {
      ...materialSettings,
      legal_terms_version: "2026-09-01-in-person-entry",
      participant_responsibility_disclosure_text:
        "I visited this vendor booth in person. The vendor may contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time.",
    };
    assert(
      permitsTransition(current, next),
      "the exact old-to-current consent-only transition must remain possible after offer activation",
    );
    assert(
      !permitsTransition(next, current) &&
        !permitsTransition(current, current) &&
        !permitsTransition(next, next) &&
        !permitsTransition(
          { ...current, legal_terms_version: "2026-08-30-contact-share" },
          next,
        ) &&
        !permitsTransition(current, {
          ...next,
          participant_responsibility_disclosure_text:
            "A disclosure without the required marketing withdrawal language.",
        }),
      "reverse, same-version, pre-marketing, and incomplete-disclosure transitions must stay blocked",
    );

    const materialMutations: Array<[string, unknown]> = [
      ["prize_title", "Different prize"],
      ["prize_description", "Different description"],
      ["prize_approx_value_cad", 999],
      ["official_rules_url", "https://www.weddingwin.ca/different-rules"],
      ["eligibility_region", "Quebec, Canada"],
      ["entry_closes_at", "2027-02-01T07:59:00.000Z"],
      ["draw_at", "2027-02-01T08:04:00.000Z"],
      ["draw_opens_at", "2026-09-02T12:00:00.000Z"],
      ["odds_basis", "Different odds"],
      ["no_purchase_required", false],
      ["skill_testing_question_required", false],
      ["prize_provider_name", "Different Vendor"],
      ["alternate_free_entry_url", "https://www.weddingwin.ca/different"],
      ["max_winners", 2],
      ["exclude_previous_winners", false],
    ];
    for (const [field, value] of materialMutations) {
      assert(
        !permitsTransition(current, { ...next, [field]: value }),
        `${field} must remain locked during the consent-only transition`,
      );
    }

    assert(
      /const materialTermsChanged\s*=\s*materialSettingsFingerprint\(currentSettings\)\s*!==\s*materialSettingsFingerprint\(nextMaterialSettings\)\s*&&\s*!isPermittedInPersonEntryRulesTransition\(\s*currentSettings,\s*nextMaterialSettings,?\s*\)/
        .test(source),
      "the material lock guard must invoke the narrow transition exception without bypassing ordinary change detection",
    );
  }
});

Deno.test("admin preserves microseconds and exposes exact reconciliation contracts", async () => {
  const source = await Deno.readTextFile(adminUrl);
  const exactTimestamp = sourceFunction(source, "requiredExactIsoTimestamp");
  assert(
    exactTimestamp.includes("? normalized :") &&
      !exactTimestamp.includes("toISOString"),
    "vendor offer versions must not lose PostgreSQL microseconds",
  );
  for (
    const required of [
      "submission?.submitted_event_revision",
      "submission.vendor_offer_version",
      "submission.participant_responsibility_disclosure",
      '"contact_share_consent_confirmed"',
      "p_submitted_event_revision: validated.submittedEventRevision",
      "p_vendor_offer_version: validated.vendorOfferVersion",
      "p_participant_responsibility_disclosure:",
      'code: "stale_vendor_offer"',
      'action === "declare_alternate_entry_reconciliation_complete"',
      "all_timely_submissions_reviewed",
      "alternate_entry_reconciliation: result",
      "reconciliation_recorded_after_declaration",
    ]
  ) {
    assert(source.includes(required), `admin contract is missing ${required}`);
  }
});
