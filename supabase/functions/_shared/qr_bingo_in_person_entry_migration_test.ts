const migrationUrl = new URL(
  "../../migrations/20260901072000_disable_qr_bingo_alternate_free_entry.sql",
  import.meta.url,
);
const rulesMigrationUrl = new URL(
  "../../migrations/20260901073000_require_in_person_qr_bingo_rules.sql",
  import.meta.url,
);
const publishMigrationUrl = new URL(
  "../../migrations/20260901074000_publish_in_person_qr_bingo_config.sql",
  import.meta.url,
);
const eventConfigMigrationUrl = new URL(
  "../../migrations/20260829180000_create_qr_bingo_event_configuration.sql",
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

Deno.test(
  "in-person cutover preserves historical rows and blocks only new alternate entries",
  async () => {
    const sql = await Deno.readTextFile(migrationUrl);
    const guard = sqlFunction(sql, "reject_new_qr_bingo_alternate_free_entry");

    for (
      const required of [
        "add column if not exists in_show_scan_verified boolean",
        "add column if not exists in_show_scan_verified_at timestamptz",
        "in_show_scan_verified is null",
        "in_show_scan_verified_at is null",
        "in_show_scan_verified is true",
        "in_show_scan_verified_at is not null",
        "create trigger a00_reject_new_qr_bingo_alternate_entry",
        "before insert or update of entry_method",
        "message = 'alternate_entry_disabled'",
      ]
    ) {
      assert(sql.includes(required), `migration is missing ${required}`);
    }

    for (
      const required of [
        "if new.entry_method = 'alternate_free_entry'",
        "if tg_op = 'INSERT' then",
        "elsif old.entry_method is distinct from new.entry_method then",
        "return new",
      ]
    ) {
      assert(
        guard.includes(required),
        `alternate-entry guard is missing ${required}`,
      );
    }

    assert(
      !sql.includes("delete from public.qr_bingo_raffle_entries") &&
        !sql.includes("update public.qr_bingo_raffle_entries") &&
        !sql.includes("drop table") &&
        !sql.includes(
          "drop function public.reconcile_qr_bingo_alternate_free_entry_contact_proof_unlocked_v1",
        ),
      "the forward-only migration must not rewrite or delete historical entry evidence",
    );
    assert(
      !sql.includes("in_show_scan_verified boolean not null") &&
        !sql.includes("in_show_scan_verified_at timestamptz not null"),
      "historical rows must remain valid with nullable scan-proof columns",
    );
  },
);

Deno.test(
  "every new QR draw entry requires paired server scan proof",
  async () => {
    const sql = await Deno.readTextFile(migrationUrl);
    const guard = sqlFunction(sql, "require_new_qr_bingo_in_show_scan_proof");

    for (
      const required of [
        "new.entry_method = 'qr_scan_opt_in'",
        "new.in_show_scan_verified is distinct from true",
        "new.in_show_scan_verified_at is null",
        "message = 'in_show_scan_verification_required'",
        "create trigger a01_require_new_qr_bingo_in_show_scan_proof",
        "before insert on public.qr_bingo_raffle_entries",
      ]
    ) {
      assert(
        guard.includes(required) || sql.includes(required),
        `new-entry scan-proof guard is missing ${required}`,
      );
    }

    for (const endpointUrl of endpointUrls) {
      const source = await Deno.readTextFile(endpointUrl);
      const optIn = sourceFunction(source, "optInToRaffle");
      const actionStart = source.indexOf('if (action === "raffle_opt_in")');
      const scanCheck = source.indexOf(
        "if (!inShowScanned.includes(vendor.id))",
        actionStart,
      );
      const optInCall = source.indexOf("await optInToRaffle(", actionStart);

      assert(
        actionStart >= 0,
        `${endpointUrl.pathname} is missing raffle_opt_in`,
      );
      assert(
        scanCheck > actionStart && optInCall > scanCheck,
        `${endpointUrl.pathname} must verify the exact saved vendor scan before opt-in`,
      );
      assert(
        optIn.includes('entry_method: "qr_scan_opt_in"') &&
          optIn.includes("in_show_scan_verified: true") &&
          optIn.includes("in_show_scan_verified_at: acceptedAt"),
        `${endpointUrl.pathname} must stamp the paired proof in its server-built payload`,
      );
    }
  },
);

Deno.test(
  "Form 354 reconciliation is tombstoned without deleting its audit history",
  async () => {
    const sql = await Deno.readTextFile(migrationUrl);
    const rpc = sqlFunction(sql, "reconcile_qr_bingo_alternate_free_entry");

    for (
      const required of [
        "coalesce(auth.role(), '') <> 'service_role'",
        "'ok', false",
        "'code', 'alternate_entry_disabled'",
        "grant execute on function public.reconcile_qr_bingo_alternate_free_entry",
      ]
    ) {
      assert(
        rpc.includes(required) || sql.includes(required),
        `reconciliation tombstone is missing ${required}`,
      );
    }
    assert(
      !rpc.includes(
        "reconcile_qr_bingo_alternate_free_entry_contact_proof_unlocked_v1",
      ) &&
        !rpc.includes("insert into public.qr_bingo_raffle_entries") &&
        !rpc.includes("pg_advisory_xact_lock"),
      "the compatibility RPC must never reconcile or insert a new entry",
    );
  },
);

Deno.test(
  "winner selection keeps its exact-vendor lock but no longer waits for Form 354 closure",
  async () => {
    const sql = await Deno.readTextFile(migrationUrl);
    const selection = sqlFunction(sql, "select_qr_bingo_potential_winner");

    assert(
      sql.includes(
        "drop trigger if exists require_qr_bingo_alternate_entry_closure_for_draw",
      ) && sql.includes("on public.qr_bingo_raffle_draws"),
      "the obsolete draw-insert closure trigger must be removed",
    );
    for (
      const retained of [
        "coalesce(auth.role(), '') <> 'service_role'",
        "pg_catalog.pg_advisory_xact_lock(",
        "normalized_event || ':' || normalized_vendor",
        "with eligible as materialized",
        "active_fixture",
        "entry.entry_method = 'qr_scan_opt_in'",
        "entry.in_show_scan_verified is true",
        "entry.in_show_scan_verified_at is not null",
        "extensions.gen_random_bytes(16)",
        "insert into public.qr_bingo_raffle_draws",
        "grant execute on function public.select_qr_bingo_potential_winner",
      ]
    ) {
      assert(
        selection.includes(retained) || sql.includes(retained),
        `winner selection lost required behavior: ${retained}`,
      );
    }
    for (
      const removed of [
        "latest_declaration",
        "latest_reconciliation",
        "pg_advisory_xact_lock_shared",
        "qr-bingo-alternate-entry-closure:",
        "qr_bingo_alternate_entry_reconciliation_closures",
        "alternate_entry_reconciliation_incomplete",
      ]
    ) {
      assert(
        !selection.includes(removed),
        `winner selection still contains obsolete closure behavior: ${removed}`,
      );
    }
    assert(
      selection.includes(
        "active_fixture\n         or (\n           entry.entry_method = 'qr_scan_opt_in'",
      ),
      "only an active isolated fixture may bypass the in-show entry proof in the winner pool",
    );
  },
);

Deno.test(
  "in-person rules transition changes only the version and published show opening",
  async () => {
    const sql = await Deno.readTextFile(rulesMigrationUrl);
    const eventGate = sqlFunction(
      sql,
      "gate_activated_qr_bingo_event_material_publish",
    );
    const offerGate = sqlFunction(
      sql,
      "lock_activated_qr_bingo_offer_material_terms",
    );
    const enteredGate = sqlFunction(
      sql,
      "lock_entered_qr_bingo_material_terms",
    );

    for (
      const required of [
        "previous_config.event_key = 'niagara-wedding-show-2026'",
        "previous_config.rules_version = '2026-09-01-vendor-marketing'",
        "new.rules_version = '2026-09-01-in-person-entry'",
        "timestamptz '2026-10-18 15:00:00+00'",
        "new.entry_closes_at",
        "previous_config.entry_closes_at",
        "and not permitted_in_person_rules_transition",
      ]
    ) {
      assert(
        eventGate.includes(required),
        `event transition is missing ${required}`,
      );
    }
    const permittedTransition = eventGate.slice(
      eventGate.indexOf("permitted_in_person_rules_transition :="),
      eventGate.indexOf("if event_activated"),
    );
    assert(
      !permittedTransition.includes("previous_config.history_starts_at"),
      "the corrected opening time must be the one permitted material change, not an equality-locked field",
    );
    for (const gate of [offerGate, enteredGate]) {
      for (
        const required of [
          "old.legal_terms_version = '2026-09-01-vendor-marketing'",
          "new.legal_terms_version = '2026-09-01-in-person-entry'",
          "visited this vendor booth in person",
          "contact me with wedding-related offers and promotions",
          "unsubscribe from vendor marketing",
          "and not permitted_in_person_rules_transition",
        ]
      ) {
        assert(
          gate.includes(required),
          `vendor transition is missing ${required}`,
        );
      }
    }
  },
);

Deno.test(
  "current database consent and proof use the published in-person window",
  async () => {
    const sql = await Deno.readTextFile(rulesMigrationUrl);
    const rules = sqlFunction(sql, "enforce_qr_bingo_current_rules");
    const proof = sqlFunction(sql, "require_new_qr_bingo_in_show_scan_proof");

    assert(
      rules.includes(
        "applicable_rules_version <> '2026-09-01-in-person-entry'",
      ) &&
        rules.includes(
          "new.consent_version is distinct from applicable_rules_version",
        ) &&
        rules.includes(
          "new.draw_administration_contact_share_version is distinct from applicable_rules_version",
        ) &&
        rules.includes("visited this vendor booth in person") &&
        rules.includes("wedding-related offers and promotions"),
      "settings and entries must accept the new current rules and contact-sharing disclosure",
    );
    for (
      const required of [
        "new.in_show_scan_verified is distinct from true",
        "new.in_show_scan_verified_at is null",
        "current_config.rules_version <> '2026-09-01-in-person-entry'",
        "new.in_show_scan_verified_at < current_config.history_starts_at",
        "new.in_show_scan_verified_at >= current_config.entry_closes_at",
        "fixture.couple_bd_user_id = new.couple_bd_user_id",
        "participant.couple_bd_user_id = new.couple_bd_user_id",
        "fixture.vendor_bingo_id = new.vendor_bingo_id",
        "fixture.expires_at > clock_timestamp()",
      ]
    ) {
      assert(
        proof.includes(required),
        `published-window proof is missing ${required}`,
      );
    }
  },
);

Deno.test(
  "in-person config publication is locked, idempotent, and fails closed",
  async () => {
    const sql = await Deno.readTextFile(publishMigrationUrl);

    for (
      const required of [
        "pg_catalog.pg_advisory_xact_lock(",
        "pg_catalog.hashtextextended('qr_bingo_event_config_publish', 0)",
        "if published_count <> 1 then",
        "current_config.event_key is distinct from target_event_key",
        "current_config.rules_version = target_rules_version",
        "current_config.history_starts_at = target_history_starts_at",
        "'niagara-wedding-show-2026'",
        "'2026-08-28'",
        "'2026-08-30-contact-share'",
        "'2026-09-01-vendor-marketing'",
        "'2026-09-01-in-person-entry'",
        "timestamptz '2026-10-18 15:00:00+00'",
        "for update",
      ]
    ) {
      assert(
        sql.includes(required),
        `config publication is missing ${required}`,
      );
    }

    const lockAt = sql.indexOf("pg_catalog.pg_advisory_xact_lock(");
    const currentAt = sql.indexOf("into current_config");
    const noOpAt = sql.indexOf(
      "current_config.rules_version = target_rules_version",
    );
    const writeAt = sql.indexOf("set published = false");
    assert(
      lockAt >= 0 &&
        currentAt > lockAt &&
        noOpAt > currentAt &&
        writeAt > noOpAt,
      "the migration must lock and validate/no-op before changing publication state",
    );
    assert(
      !sql.includes("on conflict") &&
        !sql.includes("exception when") &&
        !sql.includes("when others"),
      "unexpected publication state or constraint failures must not be swallowed",
    );
  },
);

Deno.test(
  "clean event seed advances through every legal rules revision in order",
  async () => {
    const seedSql = await Deno.readTextFile(eventConfigMigrationUrl);
    const publishSql = await Deno.readTextFile(publishMigrationUrl);

    assert(
      seedSql.includes("'2026-08-28'") &&
        publishSql.includes("case current_config.rules_version"),
      "the forward publication must explicitly handle the clean database seed",
    );

    const originalAt = publishSql.indexOf("when '2026-08-28' then");
    const contactAt = publishSql.indexOf(
      "next_rules_version := '2026-08-30-contact-share'",
      originalAt,
    );
    const contactCaseAt = publishSql.indexOf(
      "when '2026-08-30-contact-share' then",
      contactAt,
    );
    const marketingAt = publishSql.indexOf(
      "next_rules_version := '2026-09-01-vendor-marketing'",
      contactCaseAt,
    );
    const marketingCaseAt = publishSql.indexOf(
      "when '2026-09-01-vendor-marketing' then",
      marketingAt,
    );
    const targetAt = publishSql.indexOf(
      "next_rules_version := target_rules_version",
      marketingCaseAt,
    );
    const openingAt = publishSql.indexOf(
      "next_history_starts_at := target_history_starts_at",
      targetAt,
    );

    assert(
      originalAt >= 0 &&
        contactAt > originalAt &&
        contactCaseAt > contactAt &&
        marketingAt > contactCaseAt &&
        marketingCaseAt > marketingAt &&
        targetAt > marketingCaseAt &&
        openingAt > targetAt,
      "the clean seed must advance 2026-08-28 -> contact-share -> vendor-marketing -> in-person",
    );
    assert(
      publishSql.includes(
        "next_history_starts_at := current_config.history_starts_at",
      ) &&
        publishSql.includes("current_config := next_config") &&
        publishSql.includes("insert into public.qr_bingo_event_config_audit"),
      "each transition must clone the prior revision, append its audit, and continue from the published result",
    );
  },
);

Deno.test(
  "in-person config publication clones every other field and writes normal audit history",
  async () => {
    const sql = await Deno.readTextFile(publishMigrationUrl);

    for (
      const clonedField of [
        "current_config.event_key",
        "current_config.event_name",
        "current_config.vendor_tag_id",
        "current_config.scan_enabled",
        "current_config.vendor_draws_enabled",
        "current_config.email_delivery_mode",
        "current_config.send_vendor_email",
        "current_config.send_couple_email",
        "current_config.vendor_email_subject",
        "current_config.couple_email_subject",
        "current_config.official_rules_url",
        "current_config.alternate_free_entry_url",
        "current_config.eligibility_region",
        "current_config.draw_opens_at",
        "current_config.entry_closes_at",
        "current_config.draw_at",
      ]
    ) {
      assert(
        sql.includes(clonedField),
        `config publication must clone ${clonedField}`,
      );
    }

    for (
      const required of [
        "select coalesce(max(config.revision), 0) + 1",
        "update public.qr_bingo_event_configs",
        "set published = false",
        "insert into public.qr_bingo_event_configs",
        "target_history_starts_at",
        "target_rules_version",
        "returning * into next_config",
        "insert into public.qr_bingo_event_config_audit",
        "next_config.id",
        "current_config.id",
        "current_config.revision",
        "'publish'",
        "migration:20260901074000",
        "to_jsonb(next_config)",
      ]
    ) {
      assert(
        sql.includes(required),
        `config publication is missing ${required}`,
      );
    }

    assert(
      !sql.includes("disable trigger") &&
        !sql.includes("session_replication_role") &&
        !sql.includes("drop trigger") &&
        !sql.includes(
          "create or replace function public.gate_activated_qr_bingo_event_material_publish",
        ),
      "the publication must use a normal insert so existing material-term gates remain authoritative",
    );
  },
);
