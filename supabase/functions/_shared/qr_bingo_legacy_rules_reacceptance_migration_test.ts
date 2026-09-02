const migrationUrl = new URL(
  "../../migrations/20260901075000_allow_legacy_in_person_rules_reacceptance.sql",
  import.meta.url,
);
const offerVersionMigrationUrl = new URL(
  "../../migrations/20260830120000_add_qr_bingo_vendor_offer_versions.sql",
  import.meta.url,
);
const writerMigrationUrl = new URL(
  "../../migrations/20260830170000_add_qr_bingo_multi_winner_pool_controls.sql",
  import.meta.url,
);
const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function sqlFunction(sql: string, functionName: string) {
  const marker = `create or replace function public.${functionName}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${functionName} is missing`);
  const end = sql.indexOf("\n$$;", start);
  assert(end > start, `${functionName} is unterminated`);
  return sql.slice(start, end + 4);
}

Deno.test("legacy vendor rules reacceptance is one-way and preserves locked material terms", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const gates = [
    sqlFunction(sql, "lock_activated_qr_bingo_offer_material_terms"),
    sqlFunction(sql, "lock_entered_qr_bingo_material_terms"),
  ];

  for (const gate of gates) {
    for (
      const required of [
        "old.legal_terms_version in (",
        "'2026-08-30-contact-share'",
        "'2026-09-01-vendor-marketing'",
        "new.legal_terms_version = '2026-09-01-in-person-entry'",
        "new.legal_terms_accepted",
        "new.legal_terms_accepted_at is not null",
        "new.rules_viewed_at is not null",
        "new.apple_non_sponsor_acknowledged",
        "new.vendor_responsibility_acknowledged",
        "new.vendor_responsibility_acknowledged_at is not null",
        "new.vendor_responsibility_version = '2026-09-01-in-person-entry'",
        "contact me with wedding-related offers and promotions",
        "unsubscribe from vendor marketing",
        "visited this vendor booth in person",
        "and not permitted_in_person_rules_reacceptance",
      ]
    ) {
      assert(gate.includes(required), `rules lock is missing ${required}`);
    }

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
        gate.includes(`new.${materialField}`) &&
          gate.includes(`old.${materialField}`),
        `rules reacceptance does not preserve ${materialField}`,
      );
    }
  }

  const activatedGate = gates[0];
  for (
    const activatedIdentityField of [
      "vendor_bd_user_id",
      "vendor_name",
      "administrator_name",
      "co_sponsor_name",
    ]
  ) {
    assert(
      activatedGate.includes(`new.${activatedIdentityField}`) &&
        activatedGate.includes(`old.${activatedIdentityField}`),
      `activated-offer reacceptance does not preserve ${activatedIdentityField}`,
    );
  }

  assert(
    !/\b(?:insert\s+into|update|delete\s+from)\s+public\./i.test(sql) &&
      !/\bdrop\s+(?:table|column)\b/i.test(sql),
    "the forward-only lock migration must not rewrite or delete historical settings, offers, entries, or acceptance evidence",
  );
});

Deno.test("both vendor sync runtimes use an acceptance-only patch for the legacy transition", async () => {
  for (const endpointUrl of endpointUrls) {
    const source = await Deno.readTextFile(endpointUrl);
    assert(
      source.includes(
        'const LEGACY_CONTACT_SHARING_RULES_VERSION = "2026-08-30-contact-share";',
      ) &&
        source.includes(
          "const IN_PERSON_REACCEPTANCE_SOURCE_RULES_VERSIONS = [",
        ) &&
        source.includes(
          "IN_PERSON_REACCEPTANCE_SOURCE_RULES_VERSIONS.includes(",
        ),
      `${endpointUrl.pathname} does not permit the exact known legacy source version`,
    );

    const patchStart = source.indexOf(
      "permittedLockedRulesReacceptance\n            ? {",
    );
    const normalPatchStart = source.indexOf("\n            : {", patchStart);
    assert(
      patchStart >= 0 && normalPatchStart > patchStart,
      `${endpointUrl.pathname} is missing the acceptance-only patch`,
    );
    const acceptancePatch = source.slice(patchStart, normalPatchStart);
    for (
      const required of [
        "legal_terms_accepted: true",
        "legal_terms_version: qrBingoConfig().rules_version",
        "legal_terms_accepted_at: acceptedAt",
        "rules_viewed_at: acceptedAt",
        "apple_non_sponsor_acknowledged: true",
        "vendor_responsibility_acknowledged: true",
        "vendor_responsibility_disclosure_text: responsibilityDisclosure",
        "vendor_responsibility_acknowledged_at: responsibilityAcceptedAt",
        "vendor_responsibility_version: qrBingoConfig().rules_version",
      ]
    ) {
      assert(
        acceptancePatch.includes(required),
        `${endpointUrl.pathname} acceptance-only patch is missing ${required}`,
      );
    }
    for (
      const forbidden of [
        "prize_title:",
        "prize_description:",
        "prize_approx_value_cad:",
        "eligibility_region:",
        "entry_closes_at:",
        "draw_at:",
        "draw_opens_at:",
        "odds_basis:",
        "alternate_free_entry_url:",
        "max_winners:",
        "exclude_previous_winners:",
        "official_rules_url:",
        "administrator_name:",
        "co_sponsor_name:",
        "prize_provider_name:",
      ]
    ) {
      assert(
        !acceptancePatch.includes(forbidden),
        `${endpointUrl.pathname} acceptance-only patch must not write ${forbidden}`,
      );
    }
    assert(
      /materialTermsLocked\s*&&\s*materialTermsChanged\s*&&\s*!enabled\s*&&\s*!acceptanceRefreshRequested/
        .test(source) &&
        source.includes('"vendor_rules_reacceptance_conflict"'),
      `${endpointUrl.pathname} can still report success after discarding a locked disabled draw's fresh acceptance`,
    );
  }
});

Deno.test("the canonical participant disclosure is injected through trusted transaction context before material locks", async () => {
  const [offerSql, writerSql] = await Promise.all([
    Deno.readTextFile(offerVersionMigrationUrl),
    Deno.readTextFile(writerMigrationUrl),
  ]);
  const disclosureSetter = sqlFunction(
    offerSql,
    "set_qr_bingo_participant_responsibility_disclosure",
  );
  const authenticatedWriter = offerSql.slice(
    offerSql.indexOf(
      "create or replace function public.compare_and_update_qr_bingo_vendor_settings(\n  p_event_key text,\n  p_vendor_bingo_id text,\n  p_expected_updated_at timestamptz,\n  p_patch jsonb,\n  p_authenticated_vendor_bd_user_id text",
    ),
  );
  const allowedKeysStart = writerSql.indexOf(
    "allowed_keys constant text[] := array[",
  );
  const allowedKeysEnd = writerSql.indexOf("];", allowedKeysStart);
  const allowedKeys = writerSql.slice(allowedKeysStart, allowedKeysEnd);

  assert(
    authenticatedWriter.includes(
      "'request.qr_bingo_participant_responsibility_disclosure'",
    ) &&
      authenticatedWriter.includes("p_participant_responsibility_disclosure") &&
      authenticatedWriter.indexOf(
          "'request.qr_bingo_participant_responsibility_disclosure'",
        ) < authenticatedWriter.indexOf(
          "result := public.compare_and_update_qr_bingo_vendor_settings(",
        ),
    "the authenticated writer must set the canonical disclosure context before invoking the row-locked writer",
  );
  assert(
    disclosureSetter.includes(
      "if new.vendor_responsibility_acknowledged then",
    ) &&
      disclosureSetter.includes(
        "new.participant_responsibility_disclosure_text := participant_disclosure",
      ) &&
      offerSql.includes(
        "create trigger context_qr_bingo_participant_responsibility_disclosure",
      ) &&
      "context_qr_bingo_participant_responsibility_disclosure" <
        "lock_activated_qr_bingo_offer_material_terms",
    "the canonical disclosure must be assigned by a BEFORE trigger that PostgreSQL orders ahead of the material lock",
  );
  assert(
    allowedKeysStart >= 0 && allowedKeysEnd > allowedKeysStart &&
      !allowedKeys.includes("'participant_responsibility_disclosure_text'"),
    "participant disclosure must remain unavailable to the ordinary JSON patch surface",
  );

  for (const endpointUrl of endpointUrls) {
    const source = await Deno.readTextFile(endpointUrl);
    const compareWriterStart = source.indexOf(
      "async function compareAndUpdateSettings",
    );
    const compareWriterEnd = source.indexOf(
      "async function ensureSettings",
      compareWriterStart,
    );
    const compareWriter = source.slice(compareWriterStart, compareWriterEnd);
    assert(
      compareWriterStart >= 0 && compareWriterEnd > compareWriterStart &&
        compareWriter.includes(
          "p_participant_responsibility_disclosure:",
        ) &&
        compareWriter.includes(
          "participantResponsibilityDisclosure(vendor.name)",
        ),
      `${endpointUrl.pathname} must pass the canonical disclosure through the authenticated RPC context`,
    );
  }
});
