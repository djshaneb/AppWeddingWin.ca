function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const migrationUrl = new URL(
  "../../migrations/20260830024500_create_isolated_qr_bingo_email_test_fixtures.sql",
  import.meta.url,
);
const appReviewMigrationUrl = new URL(
  "../../migrations/20260828162602_add_qr_bingo_official_rules_audit.sql",
  import.meta.url,
);
const emailSenderWidgetUrl = new URL(
  "../../../brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php",
  import.meta.url,
);

function functionBody(sql: string, functionName: string) {
  const marker = `create or replace function public.${functionName}`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, `${functionName} is missing`);
  const remainder = sql.slice(start);
  const end = remainder.indexOf("\n$$;");
  assert(end >= 0, `${functionName} body is not terminated`);
  return remainder.slice(0, end + 4);
}

function assertServiceOnly(sql: string, signature: string) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert(
    new RegExp(
      `revoke all on function ${escaped}[\\s\\S]*?from public, anon, authenticated, service_role`,
      "i",
    ).test(sql),
    `${signature} must revoke all default and client execution`,
  );
  assert(
    new RegExp(
      `grant execute on function ${escaped}[\\s\\S]*?to service_role`,
      "i",
    ).test(sql),
    `${signature} must grant only service-role execution`,
  );
}

Deno.test("email delivery test fixtures are isolated, expiring, and couple-only", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  assert(
    sql.includes(
      "create table if not exists public.qr_bingo_email_test_fixtures",
    ) &&
      sql.includes("event_key ~ '^email-test-") &&
      sql.includes("event_key <> 'niagara-wedding-show-2026'") &&
      sql.includes("event_key not like 'app-review-%'") &&
      sql.includes("enabled boolean not null default false") &&
      sql.includes("expires_at > authorized_at"),
    "email-test fixtures must be disabled by default, expiring, and isolated from production/App Review",
  );
  assert(
    sql.includes(
      "outbound_recipient_email = lower(btrim(outbound_recipient_email))",
    ) &&
      sql.includes("not send_vendor_email and send_couple_email") &&
      sql.includes("where enabled"),
    "fixtures must pin one normalized recipient and prohibit the vendor channel",
  );
  assert(
    sql.includes(
      "create table if not exists public.qr_bingo_email_test_fixture_scans",
    ) &&
      sql.includes(
        "foreign key (fixture_id, couple_bd_user_id, vendor_bingo_id)",
      ) &&
      sql.includes("on delete cascade") &&
      sql.includes("unique (fixture_id, couple_bd_user_id, vendor_bingo_id)"),
    "scan evidence must be bound to the exact fixture identities and be replay-idempotent",
  );
  for (
    const table of [
      "qr_bingo_email_test_fixtures",
      "qr_bingo_email_test_fixture_scans",
    ]
  ) {
    assert(
      sql.includes(`alter table public.${table} enable row level security`) &&
        new RegExp(
          `revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`,
          "i",
        ).test(sql) &&
        new RegExp(
          `grant select, insert, update, delete on table public\\.${table}[\\s\\S]*?to service_role`,
          "i",
        ).test(sql),
      `${table} must remain service-role-only under RLS`,
    );
  }
  assert(
    !/insert\s+into\s+public\.qr_bingo_email_test_fixtures/i.test(sql),
    "the migration must not silently enable or seed an outbound fixture",
  );
});

Deno.test("App Review remains unconditionally outbound-suppressed", async () => {
  const [sql, appReviewSql, widget] = await Promise.all([
    Deno.readTextFile(migrationUrl),
    Deno.readTextFile(appReviewMigrationUrl),
    Deno.readTextFile(emailSenderWidgetUrl),
  ]);

  assert(
    !/alter\s+table\s+public\.app_review_raffle_fixtures/i.test(sql) &&
      !/update\s+public\.app_review_raffle_fixtures/i.test(sql) &&
      !/insert\s+into\s+public\.app_review_raffle_fixtures/i.test(sql) &&
      !/delete\s+from\s+public\.app_review_raffle_fixtures/i.test(sql),
    "the additive email-test migration must not mutate App Review fixtures",
  );
  assert(
    /suppress_outbound_email boolean not null default true[\s\S]*?check \(suppress_outbound_email\)/i
      .test(appReviewSql),
    "the App Review table must retain its unconditional suppression constraint",
  );
  assert(
    widget.includes("strpos($eventKey, 'app-review-') === 0") &&
      widget.includes(
        "Outbound email is suppressed for the isolated App Review fixture.",
      ) &&
      widget.includes("'outbound_email_suppressed' => true"),
    "the website sender must continue to suppress every app-review event",
  );
});

Deno.test("email-test records still require the currently published rules", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const rules = functionBody(sql, "enforce_qr_bingo_current_rules");

  assert(
    rules.includes("from public.app_review_raffle_fixtures fixture") &&
      rules.includes("from public.qr_bingo_email_test_fixtures fixture") &&
      rules.includes("fixture.enabled") &&
      rules.includes("fixture.expires_at > now()"),
    "both isolated fixture families must require an enabled, unexpired record",
  );
  for (
    const field of [
      "legal_terms_version",
      "rules_viewed_at",
      "official_rules_url",
      "prize_approx_value_cad",
      "alternate_free_entry_url",
      "consent_version",
      "contact_share_scope",
      "age_of_majority_attested",
      "residency_attested",
      "exclusions_attested",
      "eligibility_attested_at",
    ]
  ) {
    assert(
      rules.includes(field),
      `${field} must remain part of the current-rules gate`,
    );
  }
});

Deno.test("test delivery claims require the exact scanned, consented, verified couple", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const claim = functionBody(sql, "claim_qr_bingo_test_draw_email_delivery");

  assert(
    /claim_qr_bingo_test_draw_email_delivery\(\s*p_draw_id uuid,\s*p_channel text,\s*p_lease_seconds integer default 120\s*\)/i
      .test(claim),
    "the email-test claim RPC signature changed",
  );
  assert(
    claim.includes("coalesce(auth.role(), '') <> 'service_role'") &&
      claim.includes("normalized_channel <> 'couple'") &&
      claim.includes("current_fixture.send_vendor_email") &&
      claim.includes("not current_fixture.send_couple_email"),
    "claims must be service-role-only and couple-only with vendor delivery disabled",
  );
  assert(
    claim.includes("fixture.enabled") &&
      claim.includes("fixture.expires_at > v_now") &&
      claim.includes("fixture.event_key = current_draw.event_key") &&
      claim.includes(
        "fixture.vendor_bingo_id = current_draw.vendor_bingo_id",
      ) &&
      claim.includes(
        "fixture.vendor_bd_user_id = current_draw.vendor_bd_user_id",
      ) &&
      claim.includes(
        "fixture.couple_bd_user_id = current_draw.couple_bd_user_id",
      ) &&
      claim.includes("current_fixture.event_key = current_config.event_key"),
    "claims must bind an active isolated fixture to the exact draw identities",
  );
  assert(
    claim.includes(
      "allowed_recipient := lower(btrim(current_fixture.outbound_recipient_email))",
    ) &&
      claim.includes(
        "lower(btrim(current_draw.winner_email)) is distinct from allowed_recipient",
      ) &&
      claim.includes(
        "lower(btrim(current_entry.couple_email)) is distinct from allowed_recipient",
      ) &&
      claim.includes("'recipient', allowed_recipient"),
    "the claim and returned transport target must use the exact fixture allowlist",
  );
  assert(
    claim.includes("from public.qr_bingo_email_test_fixture_scans scan") &&
      claim.includes("scan.fixture_id = current_fixture.id") &&
      claim.includes("current_draw.entry_id") &&
      claim.includes(
        "current_entry.consent_version is distinct from current_config.rules_version",
      ) &&
      claim.includes(
        "current_entry.contact_share_scope <> 'selected_potential_winner_only'",
      ) &&
      claim.includes("current_entry.age_of_majority_attested") &&
      claim.includes("current_entry.residency_attested") &&
      claim.includes("current_entry.exclusions_attested") &&
      claim.includes("current_entry.eligibility_attested_at is null") &&
      claim.includes("eligible_entry_count <> 1") &&
      claim.includes("exactly one eligible allowlisted entry"),
    "claims must require a scan plus the exact entry's current consent and eligibility attestations",
  );
  assert(
    claim.includes("current_draw.selection_status <> 'verified'") &&
      claim.includes("current_draw.eligibility_verified_at is null") &&
      claim.includes("current_draw.skill_question_verified_at is null") &&
      claim.includes("current_draw.verified_at is null") &&
      claim.includes(
        "current_draw.rules_version is distinct from current_config.rules_version",
      ) &&
      claim.includes(
        "current_draw.official_rules_url is distinct from current_config.official_rules_url",
      ),
    "claims must require completed verification under the currently published rules",
  );
  assert(
    claim.includes("values (current_draw.id, 'couple')") &&
      claim.includes("on conflict (draw_id, channel) do nothing") &&
      claim.includes("for update") &&
      claim.includes("delivery.status = 'claimed'") &&
      claim.includes("delivery.claim_expires_at > v_now") &&
      claim.includes("set status = 'ambiguous'") &&
      !/delivery\.claim_expires_at\s*<=\s*v_now[\s\S]*?set status = 'claimed'/i
        .test(claim),
    "claims must reuse the token-fenced ledger and quarantine expired ambiguity",
  );
  assert(
    !sql.includes(
      "create or replace function public.claim_qr_bingo_draw_email_delivery(",
    ),
    "the isolated RPC must not replace or relax the production claim RPC",
  );
  assertServiceOnly(
    sql,
    "public.claim_qr_bingo_test_draw_email_delivery(uuid, text, integer)",
  );
});
