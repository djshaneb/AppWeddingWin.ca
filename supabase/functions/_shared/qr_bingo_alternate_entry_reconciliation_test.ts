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

Deno.test("runtime alternate-entry boundaries fail closed while historical audit code remains available for records", async () => {
  const [edge, widget, ...syncSources] = await Promise.all([
    Deno.readTextFile(edgeUrl),
    Deno.readTextFile(widgetUrl),
    ...syncSourceUrls.map((url) => Deno.readTextFile(url)),
  ]);

  const adminGetStart = edge.indexOf('if (action === "admin_get")');
  const retiredStart = edge.indexOf(
    'action === "declare_alternate_entry_reconciliation_complete" ||',
  );
  const legacyDeclarationStart = edge.indexOf(
    'if (action === "declare_alternate_entry_reconciliation_complete")',
    retiredStart + 1,
  );
  assert(
    edge.includes("await requireSignedAdminRequest(request, rawBody);") &&
      adminGetStart >= 0 && retiredStart > adminGetStart &&
      legacyDeclarationStart > retiredStart,
    "the signed admin retirement gate must run before any historical reconciliation implementation",
  );
  const adminGet = edge.slice(adminGetStart, retiredStart);
  assert(
    !adminGet.includes("alternate_entry_operations") &&
      !adminGet.includes("Form 354"),
    "the live admin dashboard must not advertise retired off-site entry operations",
  );
  assert(
    edge.slice(retiredStart, legacyDeclarationStart).includes(
      'code: "offsite_entry_retired"',
    ) && edge.slice(retiredStart, legacyDeclarationStart).includes("}, 410);"),
    "retired admin alternate-entry actions must return HTTP 410",
  );
  assert(
    widget.includes(
      "<?php if (false): /* Historical Form 354 tools are intentionally retired. */ ?>",
    ) && widget.includes("<?php endif; ?>"),
    "the Brilliant Directories admin must keep historical Form 354 controls out of the rendered UI",
  );

  for (const source of syncSources) {
    const publicOfferBranch = source.slice(
      source.indexOf('if (action === "alternate_free_entry_offers")'),
      source.indexOf("if (!runtimeConfig.scan_enabled"),
    );
    assert(
      publicOfferBranch.includes('ok: false') &&
        publicOfferBranch.includes('code: "offsite_entry_retired"') &&
        /\},\s*410,\s*false,?\s*\);/.test(publicOfferBranch) &&
        !publicOfferBranch.includes("publicAlternateFreeEntryOffers()") &&
        !publicOfferBranch.includes("offers:"),
      "public alternate-entry discovery must return HTTP 410 without exposing offers",
    );
  }
});

Deno.test("Form 354 source manifest is a tombstone and the public page exposes no submission path", async () => {
  const parsed = JSON.parse(await Deno.readTextFile(formUrl)) as {
    form_id?: number;
    status?: string;
    form_email_on?: boolean;
    public_page_contains_form?: boolean;
    new_submissions_accepted?: boolean;
    historical_schema_and_submissions?: string;
    fields?: unknown[];
  };
  const page = await Deno.readTextFile(pageUrl);

  assert(
    parsed.form_id === 354 && parsed.status === "retired" &&
      parsed.form_email_on === false &&
      parsed.public_page_contains_form === false &&
      parsed.new_submissions_accepted === false &&
      (!Array.isArray(parsed.fields) || parsed.fields.length === 0) &&
      String(parsed.historical_schema_and_submissions || "").includes(
        "Preserved in Brilliant Directories",
      ),
    "Form 354 source must be an explicit no-new-submissions tombstone while directing operators to preserve historical BD records",
  );
  assert(
    page.includes("cannot be used to submit a new entry") &&
      page.includes('href="/qr"') &&
      !page.includes("[form=qr_bingo_free_entry]") &&
      !page.includes("alternate_free_entry_offers") &&
      !/<form\b/i.test(page) &&
      !/<script\b/i.test(page),
    "the former public route must explain in-show entry without rendering or loading Form 354",
  );
});
