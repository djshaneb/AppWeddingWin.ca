import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Isolated PostgreSQL/WASM. No production connections, credentials or email.
// Run: node scripts/test-qr-entry-access-migration.mjs
// Optional QR_ENTRY_PGLITE=/absolute/path/to/pglite/dist/index.js overrides the pinned package.
// Fixtures are read-only pg_catalog/column metadata snapshots from 2026-09-10; no live rows.
const runtime = process.env.QR_ENTRY_PGLITE;
const testNow = Date.now();
const closeAt = new Date(testNow + 176400000).toISOString();
const showAt = new Date(testNow + 172800000).toISOString();
const earlyAt = new Date(testNow - 3600000).toISOString();
const { PGlite } = await import(
  runtime ? pathToFileURL(runtime).href : "@electric-sql/pglite"
);
const db = new PGlite();
const columns = JSON.parse(
  await readFile(
    new URL("./fixtures/qr-reset-schema-columns.json", import.meta.url),
    "utf8",
  ),
);
const before = await readFile(
  new URL("./fixtures/qr-reset-live-functions.sql", import.meta.url),
  "utf8",
);
const helpers = await readFile(
  new URL("./fixtures/qr-reset-live-helpers.sql", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260910195501_add_admin_vendor_draw_reset_generations.sql",
    import.meta.url,
  ),
  "utf8",
);
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
async function row(sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
async function insert(table, data) {
  const keys = Object.keys(data);
  return db.query(
    `insert into public.${table} (${keys.join(",")}) values (${
      keys.map((_, i) => "$" + (i + 1)).join(",")
    }) returning *`,
    Object.values(data),
  );
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const event = "offline-prize-test",
  vendor = "901",
  rules = "2026-09-01-in-person-entry",
  stamp = "2026-01-01T00:00:00Z";
const terms = {
  vendor_name: "Offline Vendor",
  prize_title: "Original prize",
  prize_description: "Original description",
  prize_approx_value_cad: 100,
  eligibility_region: "Ontario",
  entry_closes_at: closeAt,
  draw_opens_at: closeAt,
  draw_at: closeAt,
  odds_basis: "Equal chance",
  no_purchase_required: true,
  skill_testing_question_required: true,
  official_rules_url: "https://www.weddingwin.ca/qr-bingo-vendor-draw-rules",
  alternate_free_entry_url: "https://www.weddingwin.ca/qr-bingo",
  administrator_name: "Wedding Win Inc.",
  co_sponsor_name: "",
  prize_provider_name: "Offline Vendor",
};
const acceptance = {
  enabled: true,
  legal_terms_accepted: true,
  legal_terms_version: rules,
  legal_terms_accepted_at: stamp,
  rules_viewed_at: stamp,
  apple_non_sponsor_acknowledged: true,
  vendor_responsibility_acknowledged: true,
  vendor_responsibility_acknowledged_at: stamp,
  vendor_responsibility_version: rules,
  vendor_responsibility_disclosure_text: "Vendor responsibilities",
  participant_responsibility_disclosure_text:
    "By entering, I confirm that I visited this vendor booth in person at the wedding show and scanned its QR code. Other prize, privacy and marketing terms remain unchanged.",
};
const settings = {
  id: id(1),
  event_key: event,
  vendor_bingo_id: vendor,
  vendor_bd_user_id: vendor,
  ...terms,
  ...acceptance,
  max_winners: 1,
  exclude_previous_winners: true,
  updated_at: stamp,
};
const entry = {
  id: id(10),
  event_key: event,
  vendor_bingo_id: vendor,
  vendor_bd_user_id: vendor,
  ...terms,
  couple_bd_user_id: "701",
  couple_name: "Alex and Sam",
  couple_email: "alex@example.test",
  couple_phone: "5550101001",
  couple_wedding_date: "",
  vendor_offer_version: stamp,
  consent_share_contact: true,
  consent_version: rules,
  consent_text: "Explicit consent",
  contact_share_scope: "named_vendor_draw_administration",
  draw_administration_contact_share_acknowledged: true,
  draw_administration_contact_share_acknowledged_at: stamp,
  draw_administration_contact_share_version: rules,
  draw_administration_contact_share_consent_text: "Explicit sharing",
  rules_viewed_at: stamp,
  apple_non_sponsor_acknowledged: true,
  age_of_majority_attested: true,
  residency_attested: true,
  exclusions_attested: true,
  eligibility_attested_at: stamp,
  eligibility_attestation_text: "Eligible",
  promotion_responsibility_acknowledged: true,
  promotion_responsibility_acknowledged_at: stamp,
  promotion_responsibility_version: rules,
  promotion_disclosure_text:
    acceptance.participant_responsibility_disclosure_text,
  entry_method: "qr_scan_opt_in",
  in_show_scan_verified: true,
  in_show_scan_verified_at: stamp,
  max_winners: 1,
  exclude_previous_winners: true,
};
delete entry.draw_opens_at; // Settings-only schedule field, not an entry column.
async function select() {
  return (await row(
    "select select_qr_bingo_potential_winner($1,$2,$3,$3,$4,$5,$6,$7) result",
    [event, vendor, vendor, "initial", "TEST", "a".repeat(32), "b".repeat(64)],
  )).result;
}
try {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions; create function extensions.gen_random_uuid() returns uuid language sql as $$ select pg_catalog.gen_random_uuid() $$; create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$; select set_config('request.jwt.claim.role','service_role',false);",
  );
  for (const table of new Set(columns.map((c) => c.table_name))) {
    const fields = columns.filter((c) => c.table_name === table).map((c) =>
      `"${c.column_name}" ${
        c.data_type === "ARRAY" ? c.udt_name.slice(1) + "[]" : c.data_type
      }${
        table === "qr_bingo_draw_email_deliveries" &&
          c.column_name === "delivery_key"
          ? " generated always as (draw_id::text || ':' || channel) stored"
          : c.column_default && !c.column_default.includes("nextval(")
          ? " default " + c.column_default
          : ""
      }`
    );
    await db.exec(`create table public.${table} (${fields.join(",")});`);
  }
  await db.exec(`alter table qr_bingo_raffle_draws add primary key(id);
    alter table qr_bingo_raffle_settings add primary key(id),add unique(event_key,vendor_bingo_id);
    alter table qr_bingo_draw_email_deliveries add unique(draw_id,channel),add unique(delivery_key);
    alter table qr_bingo_vendor_offer_versions add unique(event_key,vendor_bingo_id,vendor_offer_version);
    alter table qr_bingo_raffle_entry_selection_state add primary key(entry_id);
    create unique index qr_bingo_raffle_draws_one_potential_selection_idx on qr_bingo_raffle_draws(event_key,vendor_bingo_id,vendor_bd_user_id) where selection_status='potential';
    create unique index qr_bingo_raffle_draws_unique_round on qr_bingo_raffle_draws(event_key,vendor_bingo_id,draw_number);
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(substr(md5(random()::text),1,$1*2),'hex')$$;
    grant all on all tables in schema public to service_role;`);
  // Empty allowlist fixture: production-event tests must not gain reviewer exceptions.
  await db.exec(
    "create table app_review_raffle_fixture_participants(fixture_id uuid,couple_bd_user_id text)",
  );
  await db.exec(helpers + before);
  await db.exec(
    `alter table qr_bingo_raffle_entries add constraint qr_bingo_raffle_entries_in_show_scan_proof_complete check ((in_show_scan_verified is null and in_show_scan_verified_at is null) or (in_show_scan_verified is true and in_show_scan_verified_at is not null));`,
  );
  await insert("qr_bingo_event_configs", {
    id: id(2),
    event_key: event,
    event_name: "Offline show",
    revision: 1,
    published: true,
    scan_enabled: true,
    scan_open_early: true,
    scan_early_access_starts_at: earlyAt,
    history_starts_at: showAt,
    rules_version: rules,
    vendor_draws_enabled: true,
    send_vendor_email: true,
    send_couple_email: true,
    email_delivery_mode: "production_verified_fulfillment",
    ...Object.fromEntries(
      [
        "official_rules_url",
        "alternate_free_entry_url",
        "eligibility_region",
        "entry_closes_at",
        "draw_at",
        "draw_opens_at",
      ].map((k) => [k, terms[k]]),
    ),
  });
  await test("lock ordering serializes reset before settings/config and leaves finalization free of reverse advisory acquisition", async () => {
    const resetDefinition = migration.match(
      /create or replace function public.admin_reset_qr_bingo_vendor_draw[\s\S]*?\n\$\$;/,
    )[0];
    assert.ok(
      resetDefinition.indexOf(
        "hashtextextended('qr_bingo_event_config_publish'",
      ) <
        resetDefinition.indexOf(
          "hashtextextended(p_event_key||':'||p_vendor_id",
        ),
    );
    assert.ok(
      resetDefinition.indexOf(
        "hashtextextended(p_event_key||':'||p_vendor_id",
      ) < resetDefinition.indexOf("for share"),
    );
    assert.ok(
      resetDefinition.indexOf("for share") <
        resetDefinition.indexOf("for update"),
    );
    const triggerDefinition = migration.match(
      /create or replace function public.enforce_qr_bingo_draw_generation\(\)[\s\S]*?\n\$\$;/,
    )[0];
    assert.match(
      triggerDefinition,
      /if tg_op='INSERT' then\s+perform pg_catalog.pg_advisory_xact_lock[\s\S]*?end if;/,
    );
    assert.equal(
      (triggerDefinition.match(/pg_advisory_xact_lock/g) || []).length,
      1,
    );
  });
  await test("exact migration applies to the reviewed live function baseline", async () => {
    await db.exec(migration);
  });
  await db.exec(
    `create trigger draw_limit before insert or update of event_key,vendor_bingo_id,vendor_bd_user_id,entry_id,couple_bd_user_id,selection_status,max_winners,exclude_previous_winners on qr_bingo_raffle_draws for each row execute function enforce_qr_bingo_raffle_draw_limit();
    create trigger verify_draw before insert or update on qr_bingo_raffle_draws for each row execute function enforce_qr_bingo_draw_verification();
`,
  );
  await insert("qr_bingo_raffle_settings", settings);
  await db.exec(
    await readFile(
      new URL("./fixtures/qr-reset-settings-triggers.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    "select set_config('request.qr_bingo_participant_responsibility_disclosure',$1,false)",
    [settings.participant_responsibility_disclosure_text],
  );
  await db.query(
    "update qr_bingo_raffle_settings set enabled=enabled where id=$1",
    [settings.id],
  );
  await db.exec(
    "select set_config('request.qr_bingo_participant_responsibility_disclosure','',false)",
  );
  await insert("qr_bingo_raffle_entries", entry);
  // Historical missing-proof candidate remains valid as preserved data, but never eligible.
  await insert("qr_bingo_raffle_entries", {
    ...entry,
    id: id(11),
    couple_bd_user_id: "799",
    in_show_scan_verified: null,
    in_show_scan_verified_at: null,
  });
  const entryBefore = (await row(
    "select to_jsonb(e) record from qr_bingo_raffle_entries e where id=$1",
    [entry.id],
  )).record;

  const settingsBefore = (await row(
    "select to_jsonb(s) record from qr_bingo_raffle_settings s where id=$1",
    [settings.id],
  )).record;
  const offersBefore = (await db.query(
    "select to_jsonb(v) record from qr_bingo_vendor_offer_versions v",
  )).rows;
  await db.exec(
    await readFile(
      new URL("./fixtures/qr-entry-access-live-functions.sql", import.meta.url),
      "utf8",
    ),
  );
  await test("entry access migration applies without rewriting any vendor acceptance offer or old entry", async () => {
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260911224030_allow_vendor_enabled_qr_draw_entry.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await row(
        "select to_jsonb(s) record from qr_bingo_raffle_settings s where id=$1",
        [settings.id],
      )).record,
      settingsBefore,
    );
    assert.deepEqual(
      (await db.query(
        "select to_jsonb(v) record from qr_bingo_vendor_offer_versions v",
      )).rows,
      offersBefore,
    );
    const old = (await row(
      "select to_jsonb(e) record from qr_bingo_raffle_entries e where id=$1",
      [entry.id],
    )).record;
    for (const [key, value] of Object.entries(entryBefore)) {
      assert.deepEqual(old[key], value);
    }
    assert.equal(old.vendor_draw_scan_verified, null);
  });
  await db.exec(
    `create trigger entry_offer before insert or update on qr_bingo_raffle_entries for each row execute function enforce_qr_bingo_entry_offer_version();
    create trigger entry_rules before insert or update on qr_bingo_raffle_entries for each row execute function enforce_qr_bingo_current_rules();`,
  );
  const newEntry = {
    ...entry,
    id: id(31),
    couple_bd_user_id: "703",
    vendor_offer_version: settingsBefore.updated_at,
    in_show_scan_verified: null,
    in_show_scan_verified_at: null,
    vendor_draw_scan_verified: true,
    vendor_draw_scan_verified_at: new Date().toISOString(),
    vendor_draw_scan_config_revision: 1,
    entry_access_policy_version: "2026-09-11-vendor-enabled-entry",
    entry_access_policy_disclosure:
      (await row("select qr_bingo_entry_access_policy_disclosure() value"))
        .value,
    vendor_marketing_consent: true,
    vendor_marketing_consented_at: new Date().toISOString(),
    vendor_marketing_consent_text:
      "I accept wedding-related offers and promotions and may unsubscribe.",
    promotion_disclosure_text:
      (await row("select qr_bingo_effective_entry_disclosure($1) value", [
        entry.promotion_disclosure_text,
      ])).value,
  };
  newEntry.entry_access_applied_at = newEntry.vendor_draw_scan_verified_at;
  await test("legacy show proof cannot be forged to gain early entry", async () => {
    await assert.rejects(
      insert("qr_bingo_raffle_entries", {
        ...entry,
        id: id(30),
        couple_bd_user_id: "702",
        vendor_offer_version: settingsBefore.updated_at,
        in_show_scan_verified: true,
        in_show_scan_verified_at: new Date().toISOString(),
      }),
      (e) =>
        e.code === "23514" && e.message.includes("outside_published_window"),
    );
  });
  await test("authorized early proof and exact server policy create one entry without claiming an in-show visit", async () => {
    await insert("qr_bingo_raffle_entries", newEntry);
    const saved = await row(
      "select * from qr_bingo_raffle_entries where id=$1",
      [newEntry.id],
    );
    assert.equal(saved.in_show_scan_verified, null);
    assert.equal(saved.in_show_scan_verified_at, null);
    assert.equal(saved.vendor_draw_scan_verified, true);
    assert.equal(
      saved.entry_access_policy_disclosure,
      newEntry.entry_access_policy_disclosure,
    );
    assert.equal(
      saved.promotion_disclosure_text,
      newEntry.promotion_disclosure_text,
    );
    assert.equal(
      (await row(
        "select qr_bingo_entry_access_evidence_valid(e) valid from qr_bingo_raffle_entries e where id=$1",
        [newEntry.id],
      )).valid,
      true,
    );
  });
  await test("stale revision altered policy changed disclosure missing applied timestamp and forged in-show flags fail closed", async () => {
    for (
      const patch of [
        { vendor_draw_scan_config_revision: 2 },
        { entry_access_policy_disclosure: "Different terms" },
        { entry_access_policy_version: "old" },
        { entry_access_applied_at: null },
        { promotion_disclosure_text: entry.promotion_disclosure_text },
        {
          promotion_disclosure_text: newEntry.promotion_disclosure_text +
            " Undisclosed changes",
        },
        {
          in_show_scan_verified: true,
          in_show_scan_verified_at: new Date().toISOString(),
        },
        { in_show_scan_verified: true, in_show_scan_verified_at: null },
        {
          vendor_draw_scan_verified_at: new Date(testNow - 7200000)
            .toISOString(),
          entry_access_applied_at: new Date(testNow - 7200000).toISOString(),
        },
      ]
    ) {
      await assert.rejects(
        insert("qr_bingo_raffle_entries", {
          ...newEntry,
          id: id(32),
          couple_bd_user_id: "704",
          ...patch,
        }),
        (e) => e.code === "23514",
        JSON.stringify(patch),
      );
    }
  });
  await test("paused scanner disabled vendor or closed entry window reject new authorized QR proof", async () => {
    await db.exec("update qr_bingo_event_configs set scan_enabled=false");
    await assert.rejects(
      insert("qr_bingo_raffle_entries", {
        ...newEntry,
        id: id(33),
        couple_bd_user_id: "705",
      }),
      (e) => e.code === "23514",
    );
    await db.exec(
      "update qr_bingo_event_configs set scan_enabled=true,scan_open_early=false",
    );
    await assert.rejects(
      insert("qr_bingo_raffle_entries", {
        ...newEntry,
        id: id(33),
        couple_bd_user_id: "705",
      }),
      (e) => e.code === "23514",
    );
    await db.exec(
      "update qr_bingo_event_configs set scan_open_early=true,vendor_draws_enabled=false",
    );
    await assert.rejects(
      insert("qr_bingo_raffle_entries", {
        ...newEntry,
        id: id(33),
        couple_bd_user_id: "705",
      }),
      (e) => e.code === "23514",
    );
    await db.exec(
      "update qr_bingo_event_configs set vendor_draws_enabled=true",
    );
    await db.query(
      "select set_config('request.qr_bingo_participant_responsibility_disclosure',$1,false)",
      [settings.participant_responsibility_disclosure_text],
    );
    await db.exec("update qr_bingo_raffle_settings set enabled=false");
    await assert.rejects(
      insert("qr_bingo_raffle_entries", {
        ...newEntry,
        id: id(33),
        couple_bd_user_id: "705",
      }),
      (e) => e.code === "23514",
    );
    await db.exec("update qr_bingo_raffle_settings set enabled=true");
    await db.exec(
      "update qr_bingo_event_configs set entry_closes_at=clock_timestamp()-interval '1 second'",
    );
    await assert.rejects(
      insert("qr_bingo_raffle_entries", {
        ...newEntry,
        id: id(33),
        couple_bd_user_id: "705",
      }),
      (e) => e.code === "23514",
    );
    await db.query("update qr_bingo_event_configs set entry_closes_at=$1", [
      closeAt,
    ]);
  });
  await test("entry amendment does not open winner selection before the original draw schedule", async () => {
    const result = await select();
    assert.equal(result.code, "draw_not_open", JSON.stringify(result));
    assert.equal(
      (await row("select count(*)::int n from qr_bingo_raffle_draws")).n,
      0,
    );
  });
  await test("the actual selector chooses early entry with applied policy at draw time and excludes the historical missing-proof candidate", async () => {
    // The single isolated connection cannot advance the OS clock. Replace only
    // clock_timestamp() inside the exact installed selector with a test clock;
    // every production eligibility query, lock, insert and draw trigger executes.
    const definition = (await row(
      "select pg_get_functiondef('public.select_qr_bingo_potential_winner(text,text,text,text,text,text,text,text)'::regprocedure) value",
    )).value;
    await db.exec(
      "create function public.test_entry_clock() returns timestamptz language sql as $$ select current_setting('test.entry_clock')::timestamptz $$",
    );
    await db.query("select set_config('test.entry_clock',$1,false)", [
      new Date(Date.parse(closeAt) + 1000).toISOString(),
    ]);
    await db.exec(
      definition.replaceAll("clock_timestamp()", "public.test_entry_clock()"),
    );
    await insert("qr_bingo_raffle_entry_selection_state", {
      entry_id: entry.id,
      event_key: event,
      vendor_bingo_id: vendor,
      vendor_bd_user_id: vendor,
      included: false,
    });
    const result = await select();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.draw.entry_id, newEntry.id);
    assert.equal(result.eligible_entry_count, 1);
    assert.equal(
      (await row(
        "select promotion_disclosure_text from qr_bingo_raffle_entries where id=$1",
        [newEntry.id],
      )).promotion_disclosure_text,
      newEntry.promotion_disclosure_text,
    );
    const second = await select();
    assert.equal(second.code, "awaiting_verification");
  });
  console.log(
    `PASS: ${passed} isolated SQL cases; no production connections or emails.`,
  );
} finally {
  await db.close();
}
