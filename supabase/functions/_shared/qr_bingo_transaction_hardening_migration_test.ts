function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const migrationUrl = new URL(
  "../../migrations/20260829194500_harden_qr_bingo_transactions.sql",
  import.meta.url,
);
const marketingTransitionMigrationUrl = new URL(
  "../../migrations/20260901071000_allow_vendor_marketing_rules_transition.sql",
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
    `${signature} must revoke all default/client execution`,
  );
  assert(
    new RegExp(
      `grant execute on function ${escaped}[\\s\\S]*?to service_role`,
      "i",
    ).test(sql),
    `${signature} must grant only service-role execution`,
  );
}

Deno.test("material event terms require a new rules version", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const trigger = functionBody(sql, "require_qr_bingo_rules_version_bump");

  for (
    const field of [
      "event_key",
      "event_name",
      "vendor_tag_id",
      "history_starts_at",
      "official_rules_url",
      "alternate_free_entry_url",
      "eligibility_region",
      "draw_opens_at",
      "entry_closes_at",
      "draw_at",
    ]
  ) {
    assert(
      trigger.includes(`new.${field}`) &&
        trigger.includes(`previous_config.${field}`),
      `${field} must be treated as material`,
    );
  }
  for (
    const operationalField of [
      "scan_enabled",
      "vendor_draws_enabled",
      "email_delivery_mode",
      "send_vendor_email",
      "send_couple_email",
      "vendor_email_subject",
      "couple_email_subject",
    ]
  ) {
    assert(
      !trigger.includes(`new.${operationalField}`),
      `${operationalField} must remain an operational change`,
    );
  }
  assert(
    trigger.includes("prior.rules_version = new.rules_version") &&
      trigger.includes("new, previously unused rules_version") &&
      trigger.includes(
        "event configuration audit history is unavailable; publication is blocked",
      ),
    "material changes must reject both the current and any reused rules version",
  );
  assert(
    /create trigger require_qr_bingo_rules_version_bump[\s\S]*?before insert on public\.qr_bingo_event_configs/i
      .test(sql),
    "the legal-version guard must run at the database boundary",
  );
});

Deno.test("the named-vendor marketing rules transition is one-way and non-material", async () => {
  const sql = await Deno.readTextFile(marketingTransitionMigrationUrl);
  const eventGate = functionBody(
    sql,
    "gate_activated_qr_bingo_event_material_publish",
  );
  const activatedOfferGate = functionBody(
    sql,
    "lock_activated_qr_bingo_offer_material_terms",
  );
  const enteredOfferGate = functionBody(
    sql,
    "lock_entered_qr_bingo_material_terms",
  );

  for (const source of [eventGate, activatedOfferGate, enteredOfferGate]) {
    assert(
      source.includes("permitted_marketing_rules_transition") &&
        source.includes("and not permitted_marketing_rules_transition"),
      "each immutable-term gate must keep a narrow named transition exception",
    );
  }
  for (const source of [activatedOfferGate, enteredOfferGate]) {
    assert(
      source.includes("old.legal_terms_version = '2026-08-30-contact-share'") &&
        source.includes(
          "new.legal_terms_version = '2026-09-01-vendor-marketing'",
        ) &&
        source.includes(
          "contact me with wedding-related offers and promotions",
        ) &&
        source.includes("unsubscribe from vendor marketing"),
      "vendor settings may cross only from the historical version to the exact marketing disclosure",
    );
    for (
      const immutableField of [
        "prize_title",
        "prize_description",
        "prize_approx_value_cad",
        "official_rules_url",
        "eligibility_region",
        "entry_closes_at",
        "draw_at",
        "alternate_free_entry_url",
        "max_winners",
        "exclude_previous_winners",
      ]
    ) {
      assert(
        source.includes(`new.${immutableField}`) &&
          source.includes(`old.${immutableField}`),
        `${immutableField} must remain unchanged during the consent transition`,
      );
    }
  }
  assert(
    eventGate.includes(
      "previous_config.rules_version = '2026-08-30-contact-share'",
    ) &&
      eventGate.includes("new.rules_version = '2026-09-01-vendor-marketing'") &&
      eventGate.includes("new.event_name") &&
      eventGate.includes("previous_config.event_name") &&
      eventGate.includes("new.draw_at") &&
      eventGate.includes("previous_config.draw_at"),
    "the event transition must preserve the event identity and schedule",
  );
});

Deno.test("vendor setting updates use one optimistic row-locked transaction", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const rpc = functionBody(
    sql,
    "compare_and_update_qr_bingo_vendor_settings",
  );

  assert(
    /compare_and_update_qr_bingo_vendor_settings\(\s*p_event_key text,\s*p_vendor_bingo_id text,\s*p_expected_updated_at timestamptz,\s*p_patch jsonb\s*\)[\s\S]*?returns jsonb/i
      .test(rpc),
    "vendor compare-and-update RPC signature changed",
  );
  assert(
    rpc.includes("for update") &&
      rpc.includes("p_patch = '{}'::jsonb") &&
      rpc.includes(
        "current_settings.updated_at is distinct from p_expected_updated_at",
      ) &&
      rpc.includes("errcode = '40001'") &&
      rpc.includes("jsonb_populate_record(current_settings, p_patch)") &&
      rpc.includes("current_settings.updated_at + interval '1 microsecond'") &&
      rpc.includes("returning * into saved_settings"),
    "vendor settings must lock, compare, validate, advance the timestamp, and return atomically",
  );
  for (
    const serverOwnedField of [
      "id",
      "event_key",
      "vendor_bingo_id",
      "vendor_bd_user_id",
      "created_at",
      "updated_at",
    ]
  ) {
    assert(
      !new RegExp(`'${serverOwnedField}'`).test(
        rpc.slice(
          rpc.indexOf("allowed_keys constant"),
          rpc.indexOf("];", rpc.indexOf("allowed_keys constant")),
        ),
      ),
      `${serverOwnedField} must not be patchable`,
    );
  }
  assert(
    rpc.includes("Unsupported QR Bingo vendor setting field") &&
      rpc.includes("coalesce(auth.role(), '') <> 'service_role'"),
    "vendor updates must reject unknown fields and non-service callers",
  );
  assertServiceOnly(
    sql,
    "public.compare_and_update_qr_bingo_vendor_settings(text, text, timestamptz, jsonb)",
  );
});

Deno.test("draw email delivery is stable, token-fenced, and ambiguity-safe", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  assert(
    sql.includes(
      "create table if not exists public.qr_bingo_draw_email_deliveries",
    ) &&
      sql.includes(
        "delivery_key text generated always as (draw_id::text || ':' || channel) stored",
      ) &&
      sql.includes("unique (draw_id, channel)") &&
      sql.includes("unique (delivery_key)") &&
      sql.includes(
        "status in ('pending', 'claimed', 'sent', 'retryable_failed', 'ambiguous')",
      ),
    "delivery ledger must have stable per-draw/channel keys and explicit states",
  );
  assert(
    sql.includes(
      "alter table public.qr_bingo_draw_email_deliveries enable row level security",
    ) &&
      /revoke all on table public\.qr_bingo_draw_email_deliveries[\s\S]*?from public, anon, authenticated, service_role/i
        .test(sql) &&
      sql.includes(
        "grant select on table public.qr_bingo_draw_email_deliveries to service_role",
      ),
    "delivery ledger must remain service-only under RLS",
  );

  const claim = functionBody(sql, "claim_qr_bingo_draw_email_delivery");
  assert(
    claim.includes(
      "current_draw.event_key is distinct from current_config.event_key",
    ) &&
      claim.includes("current_draw.selection_status <> 'verified'") &&
      claim.includes(
        "current_config.email_delivery_mode <> 'production_verified_fulfillment'",
      ) &&
      claim.includes("on conflict (draw_id, channel) do nothing") &&
      claim.includes("for update") &&
      claim.includes("delivery.status = 'claimed'") &&
      claim.includes("delivery.claim_expires_at > v_now") &&
      claim.includes("set status = 'ambiguous'") &&
      !/delivery\.claim_expires_at\s*<=\s*v_now[\s\S]*?set status = 'claimed'/i
        .test(claim),
    "claims must verify production/eligibility, serialize workers, and quarantine expired ambiguity",
  );

  const finalize = functionBody(sql, "finalize_qr_bingo_draw_email_delivery");
  assert(
    finalize.includes(
      "resolved_outcome not in ('sent', 'retryable_failure', 'ambiguous')",
    ) &&
      finalize.includes(
        "delivery.claim_token is distinct from p_claim_token",
      ) &&
      finalize.includes("status = 'retryable_failed'") &&
      finalize.includes("status = 'ambiguous'") &&
      finalize.includes("vendor_email_sent_at = case") &&
      finalize.includes("couple_email_sent_at = case"),
    "finalization must be token-fenced and atomically mirror definitive success",
  );

  const reconcile = functionBody(
    sql,
    "reconcile_qr_bingo_draw_email_delivery",
  );
  assert(
    reconcile.includes("delivery.status <> 'ambiguous'") &&
      reconcile.includes(
        "resolved_outcome not in ('sent', 'retryable_failure')",
      ) &&
      reconcile.includes("'reconciled', true"),
    "only explicit service reconciliation may release an ambiguous delivery",
  );

  for (
    const signature of [
      "public.claim_qr_bingo_draw_email_delivery(uuid, text, integer)",
      "public.finalize_qr_bingo_draw_email_delivery(text, uuid, text, text, text)",
      "public.reconcile_qr_bingo_draw_email_delivery(text, text, text, text)",
    ]
  ) {
    assertServiceOnly(sql, signature);
  }
});
