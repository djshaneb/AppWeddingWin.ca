function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function includesIgnoringWhitespace(source: string, fragment: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
  return normalize(source).includes(normalize(fragment));
}

const migrationUrl = new URL(
  "../../migrations/20260830140000_enable_named_vendor_contact_exports.sql",
  import.meta.url,
);
const marketingMigrationUrl = new URL(
  "../../migrations/20260901070000_enable_named_vendor_marketing_consent.sql",
  import.meta.url,
);
const adminUrl = new URL("../bd-qr-bingo-admin/index.ts", import.meta.url);
const syncUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

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

function sourceFunction(source: string, name: string) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} is missing`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is unterminated`);
}

Deno.test("contact-sharing migration is replay-safe after partial or complete application", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  for (
    const constraint of [
      "qr_bingo_raffle_entries_contact_share_scope_known",
      "qr_bingo_raffle_entries_marketing_consent_complete",
      "qr_bingo_raffle_entries_contact_share_proof_complete",
      "qr_bingo_participation_report_audit_kind_known",
      "qr_bingo_participation_report_audit_scope_known",
      "qr_bingo_participation_report_audit_no_marketing_data",
      "qr_bingo_participation_report_audit_rules_version_safe",
    ]
  ) {
    assert(
      sql.includes(`conname = '${constraint}'`) &&
        sql.includes(`add constraint ${constraint}`),
      `${constraint} must be conditionally created`,
    );
  }

  assert(
    sql.includes("if position(prior_guard in claim_definition) > 0 then") &&
      sql.includes(
        "elsif position(current_guard in claim_definition) = 0 then",
      ),
    "the email-test function rewrite must be a no-op after the current guard is already installed",
  );
  assert(
    sql.includes(
      "create table if not exists public.qr_bingo_entrant_consent_acceptance_audit",
    ) &&
      sql.includes(
        "create index if not exists qr_bingo_entrant_consent_audit_entry_idx",
      ) &&
      sql.includes(
        "drop trigger if exists audit_qr_bingo_entrant_consent_acceptance",
      ) &&
      sql.includes(
        "drop trigger if exists reject_qr_bingo_entrant_consent_audit_mutation",
      ),
    "all new ledger objects must tolerate a migration replay",
  );
});

Deno.test("re-consent preserves superseded and current acceptance snapshots append-only", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const audit = functionBody(
    sql,
    "audit_qr_bingo_entrant_consent_acceptance",
  );
  const rejectMutation = functionBody(
    sql,
    "reject_qr_bingo_entrant_consent_audit_mutation",
  );

  for (
    const required of [
      "qr_bingo_entrant_consent_acceptance_audit",
      "draw_administration_contact_share_acknowledged boolean not null",
      "draw_administration_contact_share_acknowledged_at timestamptz",
      "draw_administration_contact_share_version text not null",
      "draw_administration_contact_share_consent_text text not null",
      "snapshot_reason text not null",
      "alter table public.qr_bingo_entrant_consent_acceptance_audit enable row level security",
      "grant select on table public.qr_bingo_entrant_consent_acceptance_audit",
    ]
  ) {
    assert(sql.includes(required), `consent ledger is missing ${required}`);
  }

  assert(
    audit.includes("acceptance_changed := row(") &&
      audit.includes("old,") &&
      audit.includes("'superseded_on_reconsent'") &&
      audit.includes("new,") &&
      audit.includes("'current_acceptance'"),
    "an update must snapshot both the superseded and new acceptance",
  );
  assert(
    rejectMutation.includes(
      "QR Bingo entrant consent acceptance audit is append-only.",
    ) &&
      sql.includes(
        "before update or delete on public.qr_bingo_entrant_consent_acceptance_audit",
      ),
    "consent snapshots must reject update and deletion",
  );

  const sources = await Promise.all(
    syncUrls.map((url) => Deno.readTextFile(url)),
  );
  for (const source of sources) {
    for (
      const required of [
        "draw_administration_contact_share_acknowledged: true",
        "draw_administration_contact_share_acknowledged_at: acceptedAt",
        "draw_administration_contact_share_version: currentSnapshot!.rules_version",
        "drawAdministrationContactShareConsentText(currentSnapshot!)",
        "original entry/audit anchor survives explicit re-consent",
        "append-only consent ledger",
        "database trigger preserves the superseded acceptance",
        '.eq("draw_administration_contact_share_acknowledged", true)',
      ]
    ) {
      assert(source.includes(required), `sync endpoint is missing ${required}`);
    }
  }
});

Deno.test("current draw opt-in requires and persists complete named-vendor marketing consent", async () => {
  const [marketingSql, app, website, ...sources] = await Promise.all([
    Deno.readTextFile(marketingMigrationUrl),
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

  assert(
    includesIgnoringWhitespace(
      app,
      "vendor_marketing_consent_acknowledged: promotionResponsibilityAccepted",
    ) &&
      website.includes(
        "$drawPayload['vendor_marketing_consent_acknowledged']",
      ) &&
      website.includes(
        "vendor_marketing_consent_acknowledged: Boolean(vendorDrawResponsibility.checked)",
      ),
    "native and website opt-in boundaries must submit the named-vendor marketing acknowledgement",
  );

  for (const source of sources) {
    const optIn = sourceFunction(source, "optInToRaffle");
    for (
      const required of [
        "body.vendor_marketing_consent_acknowledged !== true",
        "vendor_marketing_consent: true",
        "vendor_marketing_consented_at: acceptedAt",
        "vendor_marketing_consent_text: vendorMarketingConsentText(currentSnapshot!)",
        "vendorMarketingConsentText(snapshot: VendorOfferSnapshot)",
        "I may unsubscribe from vendor marketing at any time.",
      ]
    ) {
      assert(
        optIn.includes(required) || source.includes(required),
        `draw opt-in marketing contract is missing ${required}`,
      );
    }
  }

  const recordSnapshot = functionBody(
    marketingSql,
    "record_qr_bingo_entrant_consent_snapshot",
  );
  const acceptanceAudit = functionBody(
    marketingSql,
    "audit_qr_bingo_entrant_consent_acceptance",
  );
  for (
    const required of [
      "vendor_marketing_consent",
      "vendor_marketing_consent_text",
      "vendor_marketing_consented_at",
    ]
  ) {
    assert(
      recordSnapshot.includes(required) && acceptanceAudit.includes(required),
      `append-only re-consent evidence is missing ${required}`,
    );
  }
});

Deno.test("Form 354 contact-sharing confirmation crosses and persists at a distinct RPC boundary", async () => {
  const [sql, admin] = await Promise.all([
    Deno.readTextFile(migrationUrl),
    Deno.readTextFile(adminUrl),
  ]);
  const reconcile = functionBody(
    sql,
    "reconcile_qr_bingo_alternate_free_entry",
  );
  const parameters = functionParameterNames(
    sql,
    "reconcile_qr_bingo_alternate_free_entry",
  );

  assert(
    parameters.includes("p_contact_share_consent_confirmed") &&
      parameters.indexOf("p_contact_share_consent_confirmed") !==
        parameters.indexOf("p_promotion_responsibility_acknowledged"),
    "contact sharing must be a distinct reconciliation parameter",
  );
  for (
    const required of [
      "p_contact_share_consent_confirmed is distinct from true",
      "contact_share_confirmation_required",
      "app.qr_bingo_form354_contact_share_confirmed",
      "draw_administration_contact_share_acknowledged",
      "draw_administration_contact_share_acknowledged_at is not null",
      "draw_administration_contact_share_version = p_submitted_rules_version",
      "draw_administration_contact_share_consent_text",
    ]
  ) {
    assert(
      reconcile.includes(required),
      `reconciliation RPC is missing ${required}`,
    );
  }
  assert(
    sql.includes(
      "new.draw_administration_contact_share_acknowledged := true",
    ) &&
      sql.includes(
        "new.draw_administration_contact_share_acknowledged_at := new.consented_at",
      ) &&
      sql.includes(
        "new.draw_administration_contact_share_version := new.consent_version",
      ),
    "Form 354 proof must persist the original acceptance time and version",
  );
  assert(
    admin.includes("contactShareConsentConfirmed: true") &&
      admin.includes(
        "p_contact_share_consent_confirmed:\n            validated.contactShareConsentConfirmed",
      ),
    "the signed admin function must pass the distinct proof to the RPC",
  );

  const compact = sql.replace(/\s+/g, " ");
  assert(
    compact.includes(
      "revoke all on function public.reconcile_qr_bingo_alternate_free_entry_without_contact_proof( text, bigint, bigint, text, text, timestamptz, text, timestamptz, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text ) from public, anon, authenticated, service_role;",
    ) && compact.includes(
      "grant execute on function public.reconcile_qr_bingo_alternate_free_entry( text, bigint, bigint, text, text, timestamptz, text, timestamptz, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text ) to service_role;",
    ),
    "the old RPC must be renamed and revoked so only the proof-bearing boundary is executable",
  );
});
