function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const migrationUrl = new URL(
  "../../migrations/20260830110000_add_qr_bingo_alternate_entry_reconciliation.sql",
  import.meta.url,
);
const edgeUrl = new URL("../bd-qr-bingo-admin/index.ts", import.meta.url);
const syncSourceUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];
const widgetUrl = new URL(
  "../../../brilliant-directories/widgets/ww-qr-bingo-settings.php",
  import.meta.url,
);
const formUrl = new URL(
  "../../../brilliant-directories/forms/qr-bingo-free-entry.json",
  import.meta.url,
);
const pageUrl = new URL(
  "../../../brilliant-directories/pages/qr-bingo-free-entry.html",
  import.meta.url,
);
const readmeUrl = new URL(
  "../../../brilliant-directories/README.md",
  import.meta.url,
);

function functionBody(sql: string, name: string) {
  const marker = `create or replace function public.${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${name} is missing`);
  const tail = sql.slice(start);
  const end = tail.indexOf("\n$$;");
  assert(end >= 0, `${name} is not terminated`);
  return tail.slice(0, end + 4);
}

function functionParameterNames(sql: string, name: string) {
  const marker = `create or replace function public.${name}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${name} is missing`);
  const open = sql.indexOf("(", start + marker.length);
  const returnsAt = sql.toLowerCase().indexOf("\nreturns ", open);
  const close = sql.lastIndexOf(")", returnsAt);
  assert(
    open >= 0 && returnsAt > open && close > open,
    `${name} has an invalid signature`,
  );
  return sql.slice(open + 1, close).split(",").map((parameter) =>
    parameter.trim().split(/\s+/)[0]
  );
}

Deno.test("identity registry retains cross-method dedupe without retaining plaintext contact data", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const identityTrigger = functionBody(
    sql,
    "set_and_reserve_qr_bingo_entry_identity",
  );
  const sourceAudit = functionBody(sql, "protect_qr_bingo_entry_source_audit");

  for (
    const required of [
      "entry_method text not null default 'qr_scan_opt_in'",
      "entrant_identity_hash text",
      "source_reference text",
      "source_submitted_at timestamptz",
      "entry_method in ('qr_scan_opt_in', 'alternate_free_entry')",
      "qr_bingo_raffle_entries_source_reference_unique",
      "qr_bingo_raffle_entry_identities",
      "primary key (event_key, vendor_bingo_id, entrant_identity_hash)",
      "expires_at timestamptz not null",
      "check (expires_at > registered_at)",
      "interval '24 months'",
      "set_and_reserve_qr_bingo_entry_identity",
      "protect_qr_bingo_entry_source_audit",
    ]
  ) {
    assert(sql.includes(required), `migration is missing ${required}`);
  }

  assert(
    sql.includes("qr_bingo_entry_identity_hmac_secret") &&
      sql.includes("extensions.gen_random_bytes(64)") &&
      sql.includes("extensions.hmac(") &&
      sql.includes("qr-bingo-entry-identity:v1:") &&
      !/qr_bingo_entry_identity_hmac_secret[^\n]*['\"][0-9a-f]{32,}/i.test(sql),
    "normalized email identity must use a generated, domain-separated Vault HMAC",
  );
  assert(
    /alter table public\.qr_bingo_raffle_entry_identities enable row level security/i
      .test(sql) &&
      /revoke all on table public\.qr_bingo_raffle_entry_identities[\s\S]*?from public, anon, authenticated, service_role/i
        .test(sql),
    "identity registry must be private and RLS enabled",
  );
  assert(
    /revoke all on function public\.compute_qr_bingo_entrant_identity_hash\(text\)[\s\S]*?from public, anon, authenticated, service_role/i
      .test(sql),
    "the keyed hash helper must not be callable as an email oracle",
  );
  assert(
    /max\([\s\S]*?interval '24 months'[\s\S]*?over \([\s\S]*?partition by entry\.event_key, entry\.vendor_bingo_id, entry\.entrant_identity_hash/i
      .test(sql),
    "historical duplicate backfill must retain the longest applicable audit window",
  );
  for (
    const required of [
      "new.event_key is not distinct from old.event_key",
      "new.vendor_bingo_id is not distinct from old.vendor_bingo_id",
      "next_hash is not distinct from old.entrant_identity_hash",
      "delete from public.qr_bingo_raffle_entry_identities",
      "and expires_at <= clock_timestamp()",
      "greatest(coalesce(new.draw_at, new.created_at, clock_timestamp()), coalesce(new.created_at, clock_timestamp())) + interval '24 months'",
    ]
  ) {
    assert(
      identityTrigger.includes(required),
      `identity reservation is missing ${required}`,
    );
  }
  assert(
    sql.includes(
      "before insert or update of event_key, vendor_bingo_id, couple_email, entrant_identity_hash",
    ),
    "identity reservation must follow any change to its event/vendor/email scope",
  );
  for (
    const required of [
      "new.event_key is distinct from old.event_key",
      "new.vendor_bingo_id is distinct from old.vendor_bingo_id",
      "new.vendor_bd_user_id is distinct from old.vendor_bd_user_id",
      "new.source_submitted_at is distinct from old.source_submitted_at",
      "QR Bingo entry method and reconciliation source audit are immutable.",
    ]
  ) {
    assert(
      sourceAudit.includes(required),
      `entry source audit is missing ${required}`,
    );
  }
  assert(
    !/delete\s+from\s+public\.qr_bingo_raffle_entries/i.test(sql) &&
      sql.includes("disable trigger enforce_qr_bingo_entry_current_rules") &&
      sql.includes("enable trigger enforce_qr_bingo_entry_current_rules"),
    "backfill must retain historical entries and suspend only current-rules validation",
  );
});

Deno.test("vendor responsibility acceptance is fresh, attributable, and append-only", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const enforcement = functionBody(
    sql,
    "enforce_qr_bingo_responsibility_audit",
  );
  const settingsBranch = enforcement.slice(
    enforcement.indexOf("if tg_table_name = 'qr_bingo_raffle_settings'"),
    enforcement.indexOf("elsif tg_table_name = 'qr_bingo_raffle_entries'"),
  );
  const acceptanceAudit = functionBody(
    sql,
    "audit_qr_bingo_vendor_responsibility_acceptance",
  );
  const rejectMutation = functionBody(
    sql,
    "reject_qr_bingo_vendor_responsibility_audit_mutation",
  );

  for (
    const required of [
      "vendor_responsibility_acknowledged boolean not null default false",
      "vendor_responsibility_disclosure_text text not null default ''",
      "vendor_responsibility_acknowledged_at timestamptz",
      "vendor_responsibility_version text not null default ''",
      "create table if not exists public.qr_bingo_vendor_responsibility_acceptance_audit",
      "vendor_bd_user_id text not null",
      "responsibility_disclosure_text text not null",
      "responsibility_accepted_at timestamptz not null",
      "enabled_when_recorded boolean not null",
      "alter table public.qr_bingo_vendor_responsibility_acceptance_audit enable row level security",
      "grant select on table public.qr_bingo_vendor_responsibility_acceptance_audit",
    ]
  ) {
    assert(
      sql.includes(required),
      `vendor acceptance audit is missing ${required}`,
    );
  }
  for (
    const required of [
      "new.vendor_responsibility_acknowledged_at := clock_timestamp()",
      "new.vendor_responsibility_acknowledged_at := old.vendor_responsibility_acknowledged_at",
      "new.vendor_responsibility_version := new.legal_terms_version",
      "new.vendor_responsibility_disclosure_text := ''",
      "new.vendor_responsibility_acknowledged_at := null",
      "new.vendor_responsibility_version := ''",
      "not new.legal_terms_accepted",
      "new.legal_terms_accepted_at is null",
      "new.rules_viewed_at is null",
      "not new.apple_non_sponsor_acknowledged",
    ]
  ) {
    assert(
      settingsBranch.includes(required),
      `settings acceptance gate is missing ${required}`,
    );
  }
  assert(
    enforcement.includes("participant_audit_changed boolean := false"),
    "participant acceptance validation must declare its insert/update branch state",
  );
  assert(
    !settingsBranch.includes(
      "new.vendor_responsibility_acknowledged_at := coalesce(",
    ),
    "a new vendor responsibility acceptance must not be backdated to an older terms view",
  );
  for (
    const required of [
      "security definer",
      "should_record boolean := false",
      "insert into public.qr_bingo_vendor_responsibility_acceptance_audit",
      "new.vendor_bd_user_id",
      "new.vendor_responsibility_disclosure_text",
      "new.vendor_responsibility_acknowledged_at",
    ]
  ) {
    assert(
      acceptanceAudit.includes(required),
      `append-only acceptance snapshot is missing ${required}`,
    );
  }
  assert(
    rejectMutation.includes(
      "QR Bingo vendor responsibility acceptance audit is append-only.",
    ) &&
      sql.includes(
        "before update or delete on public.qr_bingo_vendor_responsibility_acceptance_audit",
      ),
    "acceptance snapshots must reject update and deletion",
  );
});

Deno.test("alternate entry RPC uses original submission time and exact service-only signature", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const body = functionBody(sql, "reconcile_qr_bingo_alternate_free_entry");
  const parameters = functionParameterNames(
    sql,
    "reconcile_qr_bingo_alternate_free_entry",
  );
  const compact = sql.replace(/\s+/g, " ");

  assert(
    JSON.stringify(parameters) === JSON.stringify([
      "p_event_key",
      "p_expected_revision",
      "p_vendor_bingo_id",
      "p_form_inquiry_id",
      "p_form_submitted_at",
      "p_submitted_rules_version",
      "p_couple_name",
      "p_couple_email",
      "p_couple_phone",
      "p_couple_wedding_date",
      "p_age_of_majority_confirmed",
      "p_eligible_residency_confirmed",
      "p_not_excluded_confirmed",
      "p_rules_acknowledged",
      "p_promotion_responsibility_acknowledged",
      "p_apple_non_sponsor_acknowledged",
      "p_actor",
    ]),
    `reconciliation RPC signature changed unexpectedly: ${
      parameters.join(", ")
    }`,
  );

  for (
    const invariant of [
      "coalesce(auth.role(), '') <> 'service_role'",
      "submitted_at_value timestamptz := p_form_submitted_at",
      "reconciled_at_value timestamptz := clock_timestamp()",
      "submitted_at_value > reconciled_at_value + interval '5 minutes'",
      "where config.published",
      "current_config.revision is distinct from p_expected_revision",
      "current_config.rules_version is distinct from normalized_submitted_rules_version",
      "current_config.vendor_draws_enabled",
      "submitted_at_value < current_config.history_starts_at",
      "submitted_at_value >= current_config.entry_closes_at",
      "settings.vendor_bingo_id = normalized_vendor_id",
      "not vendor_settings.enabled",
      "vendor_settings.vendor_responsibility_version is distinct from current_config.rules_version",
      "submitted_at_value >= vendor_settings.entry_closes_at",
      "p_age_of_majority_confirmed is distinct from true",
      "p_eligible_residency_confirmed is distinct from true",
      "p_not_excluded_confirmed is distinct from true",
      "p_rules_acknowledged is distinct from true",
      "p_promotion_responsibility_acknowledged is distinct from true",
      "p_apple_non_sponsor_acknowledged is distinct from true",
      "canonical_source_reference := 'bd-form-354:'",
      "pg_catalog.pg_advisory_xact_lock",
      "identity.expires_at > reconciled_at_value",
      "'duplicate_source'",
      "'duplicate_entry'",
      "'alternate_free_entry'",
      "submitted_at_value,",
      "reconciled_at_value,",
      "normalized_actor,",
      "'scan_progress_changed', false",
    ]
  ) {
    assert(
      body.includes(invariant),
      `reconciliation RPC is missing ${invariant}`,
    );
  }

  const resultStart = body.lastIndexOf("return jsonb_build_object(");
  assert(resultStart >= 0, "reconciliation result is missing");
  const successResult = body.slice(resultStart);
  assert(
    !/couple_(?:email|phone|name)/.test(successResult) &&
      !successResult.includes("entrant_identity_hash"),
    "the reconciliation result must not return contact data or the identity HMAC",
  );
  assert(
    compact.includes(
      "revoke all on function public.reconcile_qr_bingo_alternate_free_entry( text, bigint, text, text, timestamptz, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text ) from public, anon, authenticated, service_role;",
    ) && compact.includes(
      "grant execute on function public.reconcile_qr_bingo_alternate_free_entry( text, bigint, text, text, timestamptz, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text ) to service_role;",
    ),
    "the exact seventeen-argument reconciliation signature must be service-role only",
  );
  assert(
    !/insert\s+into\s+public\.(?:qr_bingo_vendor_visits|qr_bingo_scans|qr_bingo_progress)/i
      .test(body),
    "alternate entry must not create scan or Bingo progress",
  );
});

Deno.test("signed admin boundary preserves source time and returns only safe reconciliation fields", async () => {
  const [edge, widget, readme, ...syncSources] = await Promise.all([
    Deno.readTextFile(edgeUrl),
    Deno.readTextFile(widgetUrl),
    Deno.readTextFile(readmeUrl),
    ...syncSourceUrls.map((url) => Deno.readTextFile(url)),
  ]);

  for (
    const required of [
      "await requireSignedAdminRequest(request, rawBody);",
      'action === "reconcile_alternate_free_entry"',
      "const formSubmittedAt = requiredIsoTimestamp(submission.form_submitted_at)",
      "const operatorIdentity = plainText(submission.operator_identity, 160)",
      '"reconcile_qr_bingo_alternate_free_entry"',
      "p_form_submitted_at: validated.formSubmittedAt",
      "p_actor: `brilliant-directories-admin:${validated.operatorIdentity}`",
      "alternate_entries_reconciled",
      "pending_count_available: false",
      "No entry or scan progress was changed.",
    ]
  ) {
    assert(
      edge.includes(required),
      `admin Edge function is missing ${required}`,
    );
  }
  assert(
    !/reconciliation:\s*\{[^}]*couple_(?:email|phone|name)/s.test(edge),
    "admin response must not construct a contact-data response",
  );

  for (
    const expected of [
      "hash_equals($ww_qrbs_csrf, $ww_qrbs_submitted_csrf)",
      "ww_qrbs_validate_reconciliation($_POST)",
      "ww_qrbs_validate_toronto_local_datetime",
      "new DateTimeZone('America/Toronto')",
      "'action' => 'reconcile_alternate_free_entry'",
      'name="form_inquiry_id"',
      'name="form_submitted_local"',
      'name="vendor_bingo_id"',
      'name="submitted_rules_version"',
      'name="operator_identity"',
      'name="age_of_majority_confirmed"',
      'name="eligible_residency_confirmed"',
      'name="not_excluded_confirmed"',
      'name="rules_acknowledged"',
      'name="promotion_responsibility_acknowledged"',
      'name="contact_share_consent_confirmed"',
      'name="apple_non_sponsor_acknowledged"',
      "This—not today’s reconciliation time—determines whether the entry met the deadline.",
      "It does not record a booth visit or add QR Bingo progress.",
    ]
  ) {
    assert(widget.includes(expected), `admin widget is missing ${expected}`);
  }
  assert(
    readme.includes("The BD inbox remains the source of pending inquiries") &&
      readme.includes(
        "never writes a booth visit, scan, card-completion, or Bingo-credit",
      ),
    "operations documentation must explain pending/manual reconciliation and no scan credit",
  );
  for (const source of syncSources) {
    assert(
      /vendor_responsibility_version:\s*vendorResponsibilityAcknowledged\s*\?\s*qrBingoConfig\(\)\.rules_version\s*:\s*""/
        .test(source) &&
        /const responsibilityAcceptedAt\s*=\s*legalTermsAccepted\s*&&\s*rulesReviewed\s*&&\s*vendorResponsibilityAcknowledged/
          .test(source) &&
        source.includes(
          "p_participant_responsibility_disclosure:",
        ),
      "vendor settings payload must keep the non-null version invariant and separate responsibility timestamp",
    );
    const publicOfferBranch = source.slice(
      source.indexOf('if (action === "alternate_free_entry_offers")'),
      source.indexOf("if (!runtimeConfig.scan_enabled"),
    );
    assert(
      source.includes(
        "function jsonResponse(body: unknown, status = 200, includeEventConfig = true)",
      ) &&
        source.includes(
          "const eventConfig = includeEventConfig ? qrPublicConfig() : null;",
        ) &&
        /\},\s*200,\s*false,?\s*\);/.test(publicOfferBranch) &&
        !publicOfferBranch.includes("scan_progress_changed"),
      "public alternate-entry offers must not expose unrelated operational event configuration or scan state",
    );
  }
});

Deno.test("Form 354 documents reference-only labels and current acknowledgements", async () => {
  const parsed = JSON.parse(await Deno.readTextFile(formUrl)) as {
    form_id?: number;
    operations_reconciliation?: string;
    fields?: Array<Record<string, unknown>>;
  };
  const fields = parsed.fields || [];
  const byName = new Map(fields.map((field) => [String(field.name), field]));

  assert(parsed.form_id === 354, "alternate entry must remain Form 354");
  assert(
    String(parsed.operations_reconciliation || "").includes(
      "immutable event key/revision",
    ) &&
      String(byName.get("vendor_business_name")?.label || "").includes(
        "reference only",
      ) &&
      String(byName.get("event_name")?.label || "").includes("reference only"),
    "free-text vendor/event values must be explicitly reference-only",
  );
  for (
    const name of [
      "age_of_majority",
      "eligible_residency",
      "not_excluded",
      "rules_consent",
      "promotion_responsibility_consent",
      "draw_administration_contact_share_consent",
      "apple_non_sponsor_consent",
    ]
  ) {
    assert(byName.get(name)?.required === true, `${name} must be required`);
  }
  for (
    const name of [
      "rules_consent",
      "promotion_responsibility_consent",
      "draw_administration_contact_share_consent",
      "apple_non_sponsor_consent",
    ]
  ) {
    assert(
      byName.get(name)?.rules_version === "2026-09-01-vendor-marketing",
      `${name} must use rules version 2026-09-01-vendor-marketing`,
    );
  }
});

Deno.test("Form 354 required hidden fields receive a Bootstrap validation row before initialization", async () => {
  const [page, parsed] = await Promise.all([
    Deno.readTextFile(pageUrl),
    Deno.readTextFile(formUrl).then((text) => JSON.parse(text)) as Promise<{
      fields?: Array<Record<string, unknown>>;
    }>,
  ]);
  const byName = new Map(
    (parsed.fields || []).map((field) => [String(field.name), field]),
  );
  const requiredHiddenFields = [
    "vendor_bingo_id",
    "event_key",
    "event_revision",
    "submitted_rules_version",
    "vendor_offer_version",
    "participant_responsibility_disclosure",
  ];

  for (const name of requiredHiddenFields) {
    assert(
      byName.get(name)?.type === "Hidden" &&
        byName.get(name)?.required === true,
      `${name} must remain a required hidden server-validated field`,
    );
    assert(
      page.includes(`'${name}'`),
      `${name} must receive a local validation-row wrapper`,
    );
  }

  const wrapperStart = page.indexOf(
    "var validationForm = document.querySelector",
  );
  const formValidationReady = page.indexOf(
    "if (document.readyState === 'loading')",
  );
  assert(
    wrapperStart >= 0 &&
      formValidationReady > wrapperStart &&
      page.includes(
        "row.className = 'form-group ww-qr-free-entry-hidden-validation-row';",
      ) &&
      page.includes("row.hidden = true;") &&
      page.includes("field.parentNode.insertBefore(row, field);") &&
      page.includes("row.appendChild(field);"),
    "required hidden fields must be wrapped synchronously in hidden Bootstrap rows before validation initializes",
  );
});
