import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Isolated PostgreSQL/WASM. No production connections, credentials or email.
// Run: node scripts/test-qr-draw-reset-migration.mjs
// Optional QR_RESET_PGLITE=/absolute/path/to/pglite/dist/index.js overrides the pinned package.
// Fixtures are read-only pg_catalog/column metadata snapshots from 2026-09-10; no live rows.
const runtime = process.env.QR_RESET_PGLITE;
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
  entry_closes_at: stamp,
  draw_opens_at: stamp,
  draw_at: stamp,
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
    "I visited this vendor booth in person and accept participant responsibilities.",
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
async function reset(
  draw,
  generation,
  request = id(200 + generation),
  extra = {},
) {
  const p = {
    event,
    vendor,
    draw,
    generation,
    request,
    actor: "Offline Admin",
    reason: "Restart this draw for another round.",
    ...extra,
  };
  return (await row(
    "select admin_reset_qr_bingo_vendor_draw($1,$2,$3,$4,$5,$6,$7) result",
    [p.event, p.vendor, p.draw, p.generation, p.request, p.actor, p.reason],
  )).result;
}
async function confirm(draw) {
  return (await row(
    "select to_jsonb(confirm_qr_bingo_winner_checks_for_notice($1,$2,$3,$3,true,$4)) result",
    [draw, event, vendor, `vendor:${vendor}:Offline Vendor`],
  )).result;
}
async function claim(draw, channel = "couple") {
  return (await row(
    "select claim_verified_qr_bingo_draw_email_delivery($1,$2,120) result",
    [draw, channel],
  )).result;
}
async function finish(delivery, outcome = "sent") {
  return (await row(
    "select finalize_qr_bingo_draw_email_delivery($1,$2,$3,$4,$5) result",
    [
      delivery.delivery_key,
      delivery.claim_token,
      outcome,
      "offline-provider-id",
      outcome === "sent" ? "" : "Offline definitive result",
    ],
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
  await insert("qr_bingo_event_configs", {
    id: id(2),
    event_key: event,
    event_name: "Offline show",
    revision: 1,
    published: true,
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
  const entryBefore = (await row(
    "select to_jsonb(e) record from qr_bingo_raffle_entries e where id=$1",
    [entry.id],
  )).record;
  let first;
  await test("an untouched one-entrant promotion selects one winner and enforces its single slot", async () => {
    first = await select();
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.draw.draw_generation, 0);
    assert.equal(first.draw.entry_id, entry.id);
    assert.equal((await select()).code, "awaiting_verification");
  });
  let coupleDelivery, vendorDelivery;
  await test("actual verification and paired claims retain in-flight reset protection", async () => {
    const verified = await confirm(first.draw.id);
    assert.equal(verified.selection_status, "verified");
    coupleDelivery = await claim(first.draw.id);
    vendorDelivery = await claim(first.draw.id, "vendor");
    assert.equal(coupleDelivery.claimed, true);
    assert.equal(vendorDelivery.claimed, true);
    assert.equal(
      (await reset(first.draw.id, 0)).code,
      "draw_delivery_in_progress",
    );
    assert.equal(
      (await row("select count(*)::int n from qr_bingo_admin_draw_reset_audit"))
        .n,
      0,
    );
    await db.exec(
      "update qr_bingo_draw_email_deliveries set claim_expires_at=clock_timestamp()-interval '1 second'",
    );
    assert.equal(
      (await reset(first.draw.id, 0)).code,
      "draw_delivery_in_progress",
      "expired claims cannot be assumed unsent",
    );
  });
  let oldDraw, oldDeliveries;
  await test("definitive finalization allows reset while preserving exact winner and delivery history", async () => {
    await finish(coupleDelivery);
    await finish(vendorDelivery);
    oldDraw = (await row(
      "select to_jsonb(d) record from qr_bingo_raffle_draws d where id=$1",
      [first.draw.id],
    )).record;
    oldDeliveries = (await db.query(
      "select to_jsonb(d) record from qr_bingo_draw_email_deliveries d where draw_id=$1 order by channel",
      [first.draw.id],
    )).rows;
    const result = await reset(first.draw.id, 0);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(
      (await row(
        "select current_setting('request.qr_bingo_participant_responsibility_disclosure',true) value",
      )).value,
      "",
      "reset restores the previous request context",
    );
    assert.equal(
      (await row(
        "select participant_responsibility_disclosure_text value from qr_bingo_raffle_settings where id=$1",
        [settings.id],
      )).value,
      settings.participant_responsibility_disclosure_text,
    );
    assert.equal(result.from_generation, 0);
    assert.equal(result.to_generation, 1);
    assert.equal(result.replayed, false);
    assert.deepEqual(
      (await row(
        "select to_jsonb(d) record from qr_bingo_raffle_draws d where id=$1",
        [first.draw.id],
      )).record,
      oldDraw,
    );
    assert.deepEqual(
      (await db.query(
        "select to_jsonb(d) record from qr_bingo_draw_email_deliveries d where draw_id=$1 order by channel",
        [first.draw.id],
      )).rows,
      oldDeliveries,
    );
    assert.deepEqual(
      (await row(
        "select to_jsonb(e) record from qr_bingo_raffle_entries e where id=$1",
        [entry.id],
      )).record,
      entryBefore,
    );
    assert.equal(
      (await row("select qr_bingo_prize_details_lock($1,$2,$2) reason", [
        event,
        vendor,
      ])).reason,
      null,
    );
  });
  await test("exact reset retries replay and altered actor reason or scope conflict without another reset", async () => {
    assert.equal((await reset(first.draw.id, 0)).replayed, true);
    for (
      const extra of [
        { actor: "Different Admin" },
        { reason: "Another reason" },
        { vendor: "902" },
        { event: "another-event" },
        { draw: id(999) },
      ]
    ) {
      assert.equal(
        (await reset(first.draw.id, 0, id(200), extra)).code,
        "draw_reset_request_conflict",
      );
    }
    assert.equal(
      (await reset(first.draw.id, 0, id(209))).code,
      "draw_generation_conflict",
    );
    assert.equal(
      (await reset(first.draw.id, 1, id(209))).code,
      "draw_not_current",
    );
    assert.equal(
      (await row("select count(*)::int n from qr_bingo_admin_draw_reset_audit"))
        .n,
      1,
    );
  });
  let second;
  await test("reset permits the same sole entrant again with a fresh UUID and all-history draw number", async () => {
    second = await select();
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.draw.entry_id, first.draw.entry_id);
    assert.notEqual(second.draw.id, first.draw.id);
    assert.equal(second.draw.draw_generation, 1);
    assert.equal(second.draw.draw_number, first.draw.draw_number + 1);
    assert.equal((await select()).code, "awaiting_verification");
  });
  await test("stale verification replacement and every production/test claim RPC reject the old generation", async () => {
    for (
      const name of [
        "claim_qr_bingo_draw_email_delivery",
        "claim_qr_bingo_test_draw_email_delivery",
        "claim_verified_qr_bingo_draw_email_delivery",
        "claim_verified_qr_bingo_test_draw_email_delivery",
      ]
    ) {
      await assert.rejects(
        db.query(`select ${name}($1,'couple',120)`, [first.draw.id]),
        (e) => e.code === "55000",
      );
    }
    await assert.rejects(confirm(first.draw.id), (e) => e.code === "55000");
    await assert.rejects(
      db.query(
        "select replace_qr_bingo_potential_winner_by_vendor($1,$2,$3,$3,$3,$4,$5,$6)",
        [first.draw.id, event, vendor, "TEST", "a".repeat(32), "b".repeat(64)],
      ),
      (e) => e.code === "55000",
    );
    await assert.rejects(
      db.query(
        "update qr_bingo_raffle_draws set selection_status='potential' where id=$1",
        [first.draw.id],
      ),
      (e) => e.code === "55000",
    );
  });
  let secondDelivery;
  await test("new generation has a new website-compatible key; stale finalization cannot touch it", async () => {
    await confirm(second.draw.id);
    secondDelivery = await claim(second.draw.id);
    assert.equal(secondDelivery.claimed, true);
    assert.notEqual(secondDelivery.delivery_key, coupleDelivery.delivery_key);
    assert.equal(secondDelivery.delivery_key, second.draw.id + ":couple");
    assert.equal((await finish(coupleDelivery)).already_sent, true);
    assert.equal(
      (await row(
        "select status from qr_bingo_draw_email_deliveries where delivery_key=$1",
        [secondDelivery.delivery_key],
      )).status,
      "claimed",
    );
    await finish(secondDelivery, "ambiguous");
    assert.equal(
      (await reset(second.draw.id, 1)).code,
      "draw_delivery_uncertain",
    );
  });
  await test("explicit ambiguous reconciliation permits a later reset and old idempotent replay remains stable", async () => {
    await db.query(
      "select reconcile_qr_bingo_draw_email_delivery($1,'retryable_failure','offline','Provider confirmed no delivery')",
      [secondDelivery.delivery_key],
    );
    assert.equal((await reset(second.draw.id, 1)).to_generation, 2);
    const replay = await reset(first.draw.id, 0);
    assert.equal(replay.replayed, true);
    assert.equal(replay.to_generation, 1);
    assert.equal(
      (await row(
        "select draw_generation from qr_bingo_raffle_settings where id=$1",
        [settings.id],
      )).draw_generation,
      2,
    );
  });
  await test("resetting an unsent potential winner leaves history and frees the generation-scoped unique index", async () => {
    const third = await select();
    assert.equal(third.ok, true);
    assert.equal(third.draw.draw_generation, 2);
    assert.equal((await reset(third.draw.id, 2)).to_generation, 3);
    const fourth = await select();
    assert.equal(fourth.ok, true);
    assert.equal(fourth.draw.draw_generation, 3);
    assert.equal(fourth.draw.draw_number, 4);
    assert.equal(fourth.draw.entry_id, first.draw.entry_id);
    assert.equal(
      (await row(
        "select selection_status from qr_bingo_raffle_draws where id=$1",
        [third.draw.id],
      )).selection_status,
      "potential",
    );
  });
  await test("admin winner read labels historical rounds and only permits resetting the current selection", async () => {
    const data = (await row(
      "select read_qr_bingo_admin_data('winners',$1,$2,'',0,50) result",
      [event, vendor],
    )).result;
    assert.equal(data.total, 4);
    assert.equal(data.rows.filter((x) => x.can_reset_draw).length, 1);
    const original = data.rows.find((x) => x.id === first.draw.id);
    assert.equal(original.selection_status, "verified");
    assert.equal(original.draw_generation, 0);
    assert.equal(original.current_generation, 3);
    assert.equal(original.is_current_generation, false);
  });
  await test("unauthorized generation writes and anonymous reset calls fail closed", async () => {
    await assert.rejects(
      db.query(
        "update qr_bingo_raffle_settings set draw_generation=draw_generation+1 where id=$1",
        [settings.id],
      ),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      db.query(
        "update qr_bingo_raffle_draws set draw_generation=3 where id=$1",
        [first.draw.id],
      ),
      (e) => e.code === "55000",
    );
    await db.exec("set role anon");
    try {
      await assert.rejects(
        reset(first.draw.id, 3, id(290)),
        (e) => e.code === "42501",
      );
    } finally {
      await db.exec("reset role");
    }
  });
  console.log(
    `PASS: ${passed} isolated draw-reset SQL cases; no production connections or emails.`,
  );
} finally {
  await db.close();
}
