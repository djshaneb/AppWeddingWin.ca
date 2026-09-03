function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const migrationUrl = new URL(
  "../../migrations/20260829180000_create_qr_bingo_event_configuration.sql",
  import.meta.url,
);

const appCardMigrationUrl = new URL(
  "../../migrations/20260902071500_add_qr_bingo_app_card_controls.sql",
  import.meta.url,
);

const requiredVenueMigrationUrl = new URL(
  "../../migrations/20260902073000_require_published_qr_bingo_venue.sql",
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

Deno.test("canonical QR Bingo event configuration is private, immutable, and seeded", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  for (
    const column of [
      "id uuid",
      "event_key text",
      "revision bigint",
      "published boolean",
      "event_name text",
      "vendor_tag_id integer",
      "history_starts_at timestamptz",
      "scan_enabled boolean",
      "vendor_draws_enabled boolean",
      "email_delivery_mode text",
      "send_vendor_email boolean",
      "send_couple_email boolean",
      "vendor_email_subject text",
      "couple_email_subject text",
      "rules_version text",
      "official_rules_url text",
      "alternate_free_entry_url text",
      "eligibility_region text",
      "draw_opens_at timestamptz",
      "entry_closes_at timestamptz",
      "draw_at timestamptz",
      "created_at timestamptz",
      "created_by text",
    ]
  ) {
    assert(sql.includes(column), `canonical config is missing ${column}`);
  }

  for (
    const table of [
      "qr_bingo_event_configs",
      "qr_bingo_event_config_audit",
      "qr_bingo_admin_nonces",
    ]
  ) {
    assert(
      sql.includes(`alter table public.${table} enable row level security`),
      `${table} must enable RLS`,
    );
    assert(
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`,
        "i",
      ).test(sql),
      `${table} must be private even if a default grant exists`,
    );
  }

  assert(
    /create unique index if not exists qr_bingo_event_configs_one_published_idx[\s\S]*?where published/i
      .test(
        sql,
      ),
    "the database must allow at most one published revision",
  );
  assert(
    /create constraint trigger assert_one_published_qr_bingo_event_config[\s\S]*?deferrable initially deferred/i
      .test(
        sql,
      ),
    "a deferred assertion must prevent committing with zero published revisions",
  );
  assert(
    sql.includes("protect_qr_bingo_event_config_revision") &&
      sql.includes("(to_jsonb(new) - 'published') is distinct from") &&
      sql.includes("QR Bingo event configuration revisions are immutable."),
    "published revisions must be immutable except for one-way demotion",
  );
  assert(
    sql.includes("protect_qr_bingo_event_config_audit") &&
      sql.includes("QR Bingo event configuration audit records are immutable."),
    "configuration audit rows must be immutable",
  );
  assert(
    sql.includes(
      "rules_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'",
    ) &&
      sql.includes(
        "official_rules_url ~* '^https://(www[.])?weddingwin[.]ca(:443)?([/?][^[:space:]#]*)?$'",
      ) &&
      sql.includes(
        "alternate_free_entry_url ~* '^https://(www[.])?weddingwin[.]ca(:443)?([/?][^[:space:]#]*)?$'",
      ) &&
      sql.includes("alternate_free_entry_url <> official_rules_url") &&
      sql.includes("history_starts_at <= entry_closes_at") &&
      sql.includes("draw_opens_at >= entry_closes_at") &&
      sql.includes("draw_at >= draw_opens_at"),
    "canonical config must enforce the UI's rules-version, URL, and schedule invariants",
  );
  for (
    const plainTextColumn of [
      "event_name",
      "vendor_email_subject",
      "couple_email_subject",
      "eligibility_region",
    ]
  ) {
    assert(
      sql.includes(`${plainTextColumn} !~ '[<>]'`) &&
        sql.includes(`${plainTextColumn} !~ '[[:cntrl:]]'`),
      `${plainTextColumn} must reject markup delimiters and control characters`,
    );
  }

  for (
    const seedValue of [
      "'niagara-wedding-show-2026'",
      "'Niagara Wedding Show'",
      "'2026-08-01 00:00:00-04'::timestamptz",
      "'disabled'",
      "'WeddingWin QR Bingo: Verified Potential Winner Contact'",
      "'QR Bingo potential-winner verification complete'",
      "'2026-08-28'",
      "'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules'",
      "'https://www.weddingwin.ca/qr-bingo-free-entry'",
      "'Ontario, Canada residents who have reached the age of majority'",
      "'2026-10-18 19:00:00+00'::timestamptz",
    ]
  ) {
    assert(sql.includes(seedValue), `seed is missing ${seedValue}`);
  }
  assert(
    /'Niagara Wedding Show',\s*30,\s*'2026-08-01 00:00:00-04'::timestamptz,\s*true,\s*true,\s*'disabled',\s*true,\s*true,/i
      .test(
        sql,
      ),
    "seed must enable scans and vendor draws, keep delivery disabled, and retain both recipient channels",
  );
  assert(
    !/(?:update|insert\s+into|delete\s+from)\s+public\.qr_bingo_raffle_(?:settings|entries|draws)/i
      .test(
        sql,
      ),
    "canonical config migration must not rewrite vendor settings, acceptance, entries, or draws",
  );
});

Deno.test("QR Bingo admin RPCs are service-only, replay-safe, and transactional", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  const secretRpc = functionBody(sql, "get_qr_bingo_admin_hmac_secret");
  assert(
    /get_qr_bingo_admin_hmac_secret\(\)[\s\S]*?returns text[\s\S]*?security definer/i
      .test(
        secretRpc,
      ),
    "HMAC secret getter must use the expected signature and security definer",
  );
  assert(
    secretRpc.includes("from vault.decrypted_secrets") &&
      secretRpc.includes("where name = 'qr_bingo_admin_hmac_secret'"),
    "HMAC secret getter must read the named Vault secret",
  );
  assert(
    /vault\.create_secret\(\s*gen_random_uuid\(\)::text\s*\|\|\s*gen_random_uuid\(\)::text/i
      .test(
        sql,
      ),
    "the migration must generate the HMAC secret inside Vault",
  );
  assert(
    !/vault\.create_secret\(\s*'[^']+'/i.test(sql) &&
      !/secret_value\s*:=\s*'[^']+'/i.test(sql),
    "the HMAC secret value must never be embedded in source",
  );

  const nonceRpc = functionBody(sql, "consume_qr_bingo_admin_nonce");
  assert(
    /consume_qr_bingo_admin_nonce\(\s*p_nonce text,\s*p_expires_at timestamptz\s*\)[\s\S]*?returns boolean/i
      .test(
        nonceRpc,
      ),
    "nonce RPC must keep the expected signature",
  );
  assert(
    nonceRpc.includes("extensions.digest(p_nonce, 'sha256')") &&
      nonceRpc.includes("on conflict (nonce_hash) do nothing") &&
      nonceRpc.includes("get diagnostics inserted_count = row_count") &&
      nonceRpc.includes("v_now timestamptz := clock_timestamp()") &&
      nonceRpc.includes("p_expires_at > v_now + interval '10 minutes'") &&
      !/\bcurrent_time\b/i.test(nonceRpc),
    "nonce consumption must store only a digest, reject replays atomically, and bound expiry",
  );

  const publishRpc = functionBody(sql, "publish_qr_bingo_event_config");
  assert(
    /publish_qr_bingo_event_config\(\s*p_expected_revision bigint,\s*p_config jsonb,\s*p_actor text\s*\)[\s\S]*?returns jsonb/i
      .test(
        publishRpc,
      ),
    "publish RPC must keep the expected signature",
  );
  assert(
    publishRpc.includes("pg_advisory_xact_lock") &&
      publishRpc.includes("current_revision <> p_expected_revision") &&
      publishRpc.includes("errcode = '40001'") &&
      publishRpc.includes("set published = false") &&
      publishRpc.includes("returning * into next_config") &&
      publishRpc.includes("insert into public.qr_bingo_event_config_audit"),
    "publish must serialize writers, enforce optimistic revision, replace the active row, and audit atomically",
  );
  assert(
    publishRpc.includes("if not p_config ?& required_keys") &&
      publishRpc.includes("Unknown QR Bingo configuration field") &&
      publishRpc.includes(
        "jsonb_typeof(p_config -> 'vendor_tag_id') <> 'number'",
      ) &&
      publishRpc.includes(
        "jsonb_typeof(p_config -> supplied_key) <> 'boolean'",
      ),
    "publish must reject missing, unknown, and incorrectly typed fields",
  );

  for (
    const signature of [
      "public.get_qr_bingo_admin_hmac_secret()",
      "public.consume_qr_bingo_admin_nonce(text, timestamptz)",
      "public.publish_qr_bingo_event_config(bigint, jsonb, text)",
    ]
  ) {
    assert(
      new RegExp(
        `revoke all on function ${
          signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        }[\\s\\S]*?from public, anon, authenticated`,
        "i",
      ).test(sql),
      `${signature} must revoke public client execution`,
    );
    assert(
      new RegExp(
        `grant execute on function ${
          signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        }[\\s\\S]*?to service_role`,
        "i",
      ).test(sql),
      `${signature} must grant only service-role execution`,
    );
  }

  assert(
    (sql.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/g) || [])
      .length >= 3,
    "all three admin RPCs must also fail closed on the JWT role",
  );
});

Deno.test("QR Bingo acceptance triggers use the published rules revision and controlled review inheritance", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const triggerBody = functionBody(sql, "enforce_qr_bingo_current_rules");

  assert(
    triggerBody.includes("from public.qr_bingo_event_configs config") &&
      triggerBody.includes("config.event_key = new.event_key") &&
      triggerBody.includes("current_rules_version"),
    "rules enforcement must resolve the matching published event configuration",
  );
  assert(
    triggerBody.includes("from public.app_review_raffle_fixtures fixture") &&
      triggerBody.includes("fixture.event_key = new.event_key") &&
      triggerBody.includes("fixture.enabled") &&
      triggerBody.includes("fixture.expires_at > now()"),
    "only a registered enabled, unexpired App Review fixture may inherit production rules",
  );
  assert(
    !/new\.event_key\s+(?:like|~)\s*'app-review/i.test(triggerBody),
    "App Review inheritance must not use a generic event-key prefix fallback",
  );
  assert(
    triggerBody.includes(
      "new.legal_terms_version is distinct from current_rules_version",
    ) &&
      triggerBody.includes(
        "new.consent_version is distinct from current_rules_version",
      ) &&
      triggerBody.includes(
        "new.rules_version is distinct from current_rules_version",
      ),
    "settings, vendor entries, and grand-prize entries must all use the published rules revision",
  );
  assert(
    !triggerBody.includes("'2026-08-28'"),
    "trigger logic must not retain the old hardcoded rules version",
  );
  assert(
    triggerBody.includes(
      "No published QR Bingo event configuration is available.",
    ),
    "unknown or unpublished events must fail closed",
  );
});

Deno.test("QR Bingo app-card controls are history-safe, inherited, and audited", async () => {
  const sql = await Deno.readTextFile(appCardMigrationUrl);

  assert(
    /add column if not exists venue_name text/i.test(sql) &&
      /add column if not exists app_card_enabled boolean not null default true/i
        .test(sql),
    "the canonical config must add venue and app-card availability controls",
  );
  assert(
    sql.includes("venue_name is null") &&
      sql.includes("venue_name = btrim(venue_name)") &&
      sql.includes("char_length(venue_name) <= 160") &&
      sql.includes("venue_name !~ '[<>]'") &&
      sql.includes("venue_name !~ '[[:cntrl:]]'"),
    "historical venue values may be null while new values remain bounded plain text",
  );

  const inheritTrigger = functionBody(
    sql,
    "apply_qr_bingo_app_card_controls",
  );
  assert(
    inheritTrigger.includes(
      "current_setting(\n    'weddingwin.qr_bingo_app_card_controls'",
    ) &&
      inheritTrigger.includes("config.event_key = new.event_key") &&
      inheritTrigger.includes("config.revision < new.revision") &&
      inheritTrigger.includes("new.venue_name := previous_config.venue_name") &&
      inheritTrigger.includes(
        "new.app_card_enabled := previous_config.app_card_enabled",
      ),
    "the insert trigger must consume explicit controls or clone the preceding event revision",
  );
  assert(
    /create trigger apply_qr_bingo_app_card_controls[\s\S]*?before insert on public\.qr_bingo_event_configs/i
      .test(sql),
    "app-card inheritance must run before every event-config insert",
  );

  const publishWrapper = functionBody(sql, "publish_qr_bingo_event_config");
  assert(
    publishWrapper.includes("public.publish_qr_bingo_event_config_locked(") &&
      publishWrapper.includes(
        "p_config - 'venue_name' - 'app_card_enabled'",
      ) &&
      publishWrapper.includes("jsonb_typeof(p_config -> 'venue_name')") &&
      publishWrapper.includes(
        "jsonb_typeof(p_config -> 'app_card_enabled')",
      ) &&
      publishWrapper.includes("char_length(venue_value) > 160") &&
      publishWrapper.includes(
        "'weddingwin.qr_bingo_app_card_controls'",
      ),
    "the short wrapper must validate and pass the new keys without changing the locked publisher",
  );
  assert(
    !/create or replace function public\.publish_qr_bingo_event_config_locked/i
      .test(sql),
    "the locked publisher must remain unchanged",
  );
  assert(
    publishWrapper.includes("when serialization_failure") &&
      publishWrapper.includes("'conflict', true") &&
      publishWrapper.includes("when invalid_parameter_value") &&
      publishWrapper.includes("'conflict', false"),
    "the replacement wrapper must preserve completed conflict responses",
  );

  assert(
    sql.includes("target_venue_name constant text := 'Americana Resort'") &&
      sql.includes("'app_card_enabled', true") &&
      sql.includes("current_config.event_name") &&
      sql.includes("current_config.vendor_tag_id") &&
      sql.includes("current_config.rules_version") &&
      sql.includes("current_config.draw_at") &&
      sql.includes("to_jsonb(next_config) - array[") &&
      sql.includes("insert into public.qr_bingo_event_config_audit") &&
      sql.includes("to_jsonb(next_config)"),
    "the migration must publish and audit the exact venue/enabled controls while cloning all existing fields",
  );
  assert(
    !/(?:insert into|update|delete from)\s+public\.qr_bingo_raffle_(?:settings|entries|draws)/i
      .test(sql),
    "app-card publication must not rewrite vendor settings, entries, or draws",
  );
});

Deno.test("future QR Bingo revisions always publish a parser-safe venue without rewriting history", async () => {
  const sql = await Deno.readTextFile(requiredVenueMigrationUrl);
  const triggerBody = functionBody(sql, "apply_qr_bingo_app_card_controls");

  assert(
    triggerBody.includes(
      "fallback_venue_name constant text := 'Venue to be announced'",
    ) &&
      triggerBody.includes("new.venue_name := previous_config.venue_name") &&
      triggerBody.includes(
        "if new.venue_name is null then\n    new.venue_name := fallback_venue_name;",
      ),
    "a legacy publication must inherit its event venue or receive a safe first-revision placeholder",
  );
  assert(
    /add constraint qr_bingo_event_configs_published_venue_present\s+check \(not published or venue_name is not null\)/i
      .test(sql),
    "the database must reject any published row that still has a null venue",
  );
  assert(
    !/(?:insert into|update|delete from)\s+public\.qr_bingo_event_configs/i
      .test(sql),
    "the hardening migration must not rewrite immutable configuration history",
  );
});
