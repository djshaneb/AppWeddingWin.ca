import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Isolated PostgreSQL/WASM. No production connections, credentials or email.
const runtime = process.env.QR_PRIZE_PGLITE;
if (!runtime) {
  throw new Error(
    "Set QR_PRIZE_PGLITE to a pinned local PGlite dist/index.js.",
  );
}
const { PGlite } = await import(pathToFileURL(runtime));
const db = new PGlite();
const columns = JSON.parse(
  await readFile(
    new URL("./fixtures/qr-prize-schema-columns.json", import.meta.url),
    "utf8",
  ),
);
const before = await readFile(
  new URL("./fixtures/qr-prize-live-functions.sql", import.meta.url),
  "utf8",
);
const helpers = await readFile(
  new URL("./fixtures/qr-prize-live-test-helpers.sql", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260908035734_qr_bingo_single_winner_and_editable_prize.sql",
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
  other = "902",
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
  alternate_free_entry_url: "",
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
  participant_responsibility_disclosure_text: "Participant responsibilities",
};
const settings = {
  id: id(1),
  event_key: event,
  vendor_bingo_id: vendor,
  vendor_bd_user_id: vendor,
  ...terms,
  ...acceptance,
  max_winners: 3,
  exclude_previous_winners: false,
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
  promotion_disclosure_text: "Participant responsibilities",
  entry_method: "qr_scan_opt_in",
  in_show_scan_verified: true,
  in_show_scan_verified_at: stamp,
  max_winners: 3,
  exclude_previous_winners: false,
};
delete entry.draw_opens_at; // Settings-only schedule field, not an entry column.
function drawForEntry(source, drawId, drawNumber, patch = {}) {
  const drawColumns = new Set(
    columns.filter((c) => c.table_name === "qr_bingo_raffle_draws").map((c) =>
      c.column_name
    ),
  );
  return {
    ...Object.fromEntries(
      Object.entries(source).filter(([key]) => drawColumns.has(key)),
    ),
    id: drawId,
    entry_id: source.id,
    winner_name: source.couple_name,
    winner_email: source.couple_email,
    winner_phone: source.couple_phone,
    winner_wedding_date: source.couple_wedding_date,
    rules_version: source.consent_version,
    scheduled_draw_at: source.draw_at,
    selection_status: "potential",
    draw_number: drawNumber,
    ...patch,
  };
}
async function save(patch, expected) {
  const current = await row(
    "select updated_at::text updated_at from qr_bingo_raffle_settings where id=$1",
    [id(1)],
  );
  return (await row(
    "select compare_and_update_qr_bingo_vendor_settings($1,$2,$3,$4::jsonb) result",
    [event, vendor, expected ?? current.updated_at, JSON.stringify(patch)],
  )).result;
}
async function select() {
  return (await row(
    "select select_qr_bingo_potential_winner($1,$2,$3,$3,$4,$5,$6,$7) result",
    [event, vendor, vendor, "initial", "TEST", "a".repeat(32), "b".repeat(64)],
  )).result;
}
try {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions; create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$; select set_config('request.jwt.claim.role','service_role',false);",
  );
  for (const table of new Set(columns.map((c) => c.table_name))) {
    const fields = columns.filter((c) => c.table_name === table).map((c) =>
      `\"${c.column_name}\" ${
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
  await db.exec(
    "alter table qr_bingo_draw_email_deliveries add unique(draw_id,channel); alter table qr_bingo_vendor_offer_versions add unique(event_key,vendor_bingo_id,vendor_offer_version); create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(substr(md5(random()::text),1,$1*2),'hex')$$;",
  );
  await db.exec(before + helpers);
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
  await insert("qr_bingo_raffle_settings", settings);
  await insert("qr_bingo_raffle_entries", entry);
  await insert("qr_bingo_raffle_entries", {
    ...entry,
    id: id(11),
    couple_bd_user_id: "702",
    couple_name: "Taylor and Robin",
    couple_email: "taylor@example.test",
  });
  // Seed real-shaped historical records before the new trigger is installed.
  // This is only the isolated database; no live account/history is modified.
  const legacyEntries = [30, 31].map((n) => ({
    ...entry,
    id: id(n),
    vendor_bingo_id: other,
    vendor_bd_user_id: other,
    couple_bd_user_id: String(800 + n),
    couple_name: `Legacy Couple ${n}`,
    couple_email: `legacy${n}@example.test`,
  }));
  await insert("qr_bingo_raffle_settings", {
    ...settings,
    id: id(3),
    vendor_bingo_id: other,
    vendor_bd_user_id: other,
  });
  for (const [index, historicalEntry] of legacyEntries.entries()) {
    await insert("qr_bingo_raffle_entries", historicalEntry);
    await insert(
      "qr_bingo_raffle_draws",
      drawForEntry(
        historicalEntry,
        id(50 + index),
        index + 1,
        {
          selection_status: "verified",
          verification_notes: "Legacy verification",
        },
      ),
    );
  }
  await test("exact migration applies over the live function baseline", async () => {
    await db.exec(migration);
  });
  await db.exec(
    "create trigger lock_activated before update on qr_bingo_raffle_settings for each row execute function lock_activated_qr_bingo_offer_material_terms(); create trigger lock_entered before update on qr_bingo_raffle_settings for each row execute function lock_entered_qr_bingo_material_terms(); create trigger capture after insert or update on qr_bingo_raffle_settings for each row execute function capture_qr_bingo_vendor_offer_version(); create trigger draw_limit before insert or update on qr_bingo_raffle_draws for each row execute function enforce_qr_bingo_raffle_draw_limit();",
  );
  await test("existing entries remain unchanged and old client settings normalize to one", async () => {
    await save({
      prize_title: "Updated prize",
      prize_description: "Updated description",
      prize_approx_value_cad: 250,
      max_winners: 3,
      exclude_previous_winners: false,
    });
    const s = await row("select * from qr_bingo_raffle_settings where id=$1", [
      id(1),
    ]);
    assert.equal(s.max_winners, 1);
    assert.equal(s.exclude_previous_winners, true);
    const e = await row("select * from qr_bingo_raffle_entries where id=$1", [
      id(10),
    ]);
    assert.equal(e.prize_title, "Original prize");
    assert.equal(e.max_winners, 3);
    assert.equal(e.consent_text, "Explicit consent");
  });
  await test("stale settings save is rejected atomically", async () => {
    await assert.rejects(
      save({ prize_title: "Lost update" }, stamp),
      (e) => e.code === "40001",
    );
  });
  await test("eligibility and schedule remain locked after entry", async () => {
    await assert.rejects(
      save({ eligibility_region: "Changed region" }),
      (e) => e.code === "55000",
    );
    await assert.rejects(
      save({ draw_at: "2028-01-01T00:00:00Z" }),
      (e) => e.code === "55000",
    );
  });
  let selected;
  await test("a prior entry remains eligible after prize edits and snapshot is preserved", async () => {
    selected = await select();
    assert.equal(selected.ok, true, JSON.stringify(selected));
    assert.equal(selected.max_winners, 1);
    assert.equal(selected.draw.prize_title, "Original prize");
    assert.equal(selected.draw.max_winners, 1);
  });
  await test("a pending selection consumes the one slot; second selection cannot occur", async () => {
    const result = await select();
    assert.equal(result.ok, false);
    assert.equal(result.code, "awaiting_verification");
  });
  await test("direct insertion of a second active winner is rejected for another valid entrant", async () => {
    const candidate = await row(
      "select * from qr_bingo_raffle_entries where event_key=$1 and vendor_bingo_id=$2 and id<>$3 limit 1",
      [event, vendor, selected.draw.entry_id],
    );
    assert.ok(candidate && candidate.id !== selected.draw.entry_id);
    await assert.rejects(
      insert("qr_bingo_raffle_draws", drawForEntry(candidate, id(90), 2)),
      (e) => e.code === "23514" && /already has its winner/.test(e.message),
    );
    assert.equal(
      (await row(
        "select count(*)::int n from qr_bingo_raffle_draws where event_key=$1 and vendor_bingo_id=$2 and selection_status in ('potential','verified')",
        [event, vendor],
      )).n,
      1,
    );
  });
  await test("same-scope legacy multiple-winner updates preserve historical prize and limit snapshots", async () => {
    await db.query(
      "update qr_bingo_raffle_draws set verification_notes='Legacy record retained' where event_key=$1 and vendor_bingo_id=$2",
      [event, other],
    );
    const historical = (await db.query(
      "select * from qr_bingo_raffle_draws where event_key=$1 and vendor_bingo_id=$2 order by draw_number",
      [event, other],
    )).rows;
    assert.equal(historical.length, 2);
    for (const [index, draw] of historical.entries()) {
      assert.equal(draw.id, id(50 + index));
      assert.equal(draw.selection_status, "verified");
      assert.equal(draw.verification_notes, "Legacy record retained");
      assert.equal(draw.max_winners, 3);
      assert.equal(draw.exclude_previous_winners, false);
      assert.equal(draw.prize_title, "Original prize");
      assert.equal(Number(draw.prize_approx_value_cad), 100);
      assert.equal(draw.entry_id, legacyEntries[index].id);
    }
  });
  await test("prize is still editable after selection, with an additional immutable offer", async () => {
    await save({
      prize_title: "Final prize",
      prize_description: "Final description",
      prize_approx_value_cad: 300,
    });
    assert.equal(
      (await row("select count(*)::int n from qr_bingo_vendor_offer_versions"))
        .n,
      2,
    );
    assert.equal(
      (await row("select prize_title from qr_bingo_raffle_draws where id=$1", [
        selected.draw.id,
      ])).prize_title,
      "Original prize",
    );
  });
  await test("one-click replacement preserves the old selection and chooses another entrant", async () => {
    const result = (await row(
      "select replace_qr_bingo_potential_winner_by_vendor($1,$2,$3,$4,$4,$5,$6,$7) result",
      [
        selected.draw.id,
        event,
        vendor,
        vendor,
        "TEST",
        "c".repeat(32),
        "d".repeat(64),
      ],
    )).result;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.notEqual(
      result.draw.couple_bd_user_id,
      selected.draw.couple_bd_user_id,
    );
    assert.equal(
      (await row(
        "select selection_status from qr_bingo_raffle_draws where id=$1",
        [selected.draw.id],
      )).selection_status,
      "replaced",
    );
    selected = result;
  });
  await db.query(
    "update qr_bingo_raffle_draws set selection_status='verified',eligibility_verified_at=$2,skill_question_verified_at=$2,verified_at=$2,verified_by='offline-test',winner_rules_confirmed_at=$2,verification_notes='TEST ONLY checks' where id=$1",
    [selected.draw.id, stamp],
  );
  await test("a verified winner prevents all further selections despite old 3-slot snapshots", async () => {
    const result = await select();
    assert.equal(result.ok, false);
    assert.equal(result.code, "winner_limit_reached");
  });
  await test("moving a legacy active draw into an occupied scope is rejected without changing either history", async () => {
    const destinationEntry = {
      ...entry,
      id: id(12),
      couple_bd_user_id: "703",
      couple_name: "Destination Couple",
      couple_email: "destination@example.test",
    };
    await insert("qr_bingo_raffle_entries", destinationEntry);
    const original = await row(
      "select * from qr_bingo_raffle_draws where id=$1",
      [id(50)],
    );
    await assert.rejects(
      db.query(
        "update qr_bingo_raffle_draws set event_key=$2,vendor_bingo_id=$3,vendor_bd_user_id=$3,entry_id=$4,couple_bd_user_id=$5,winner_name=$6,winner_email=$7 where id=$1",
        [
          id(50),
          event,
          vendor,
          destinationEntry.id,
          destinationEntry.couple_bd_user_id,
          destinationEntry.couple_name,
          destinationEntry.couple_email,
        ],
      ),
      (e) => e.code === "23514" && /already has its winner/.test(e.message),
    );
    assert.deepEqual(
      await row("select * from qr_bingo_raffle_draws where id=$1", [id(50)]),
      original,
    );
    assert.equal(
      (await row(
        "select count(*)::int n from qr_bingo_raffle_draws where event_key=$1 and vendor_bingo_id=$2 and selection_status in ('potential','verified')",
        [event, vendor],
      )).n,
      1,
    );
  });
  let claim;
  await test("claim atomically captures the revised prize and locks settings", async () => {
    claim = (await row(
      "select claim_verified_qr_bingo_draw_email_delivery($1,'couple',120) result",
      [selected.draw.id],
    )).result;
    assert.equal(claim.claimed, true, JSON.stringify(claim));
    assert.equal(claim.prize_snapshot.prize_title, "Final prize");
    assert.equal(claim.prize_snapshot.prize_approx_value_cad, 300);
    assert.equal(
      (await row("select qr_bingo_prize_details_lock($1,$2,$2) reason", [
        event,
        vendor,
      ])).reason,
      "sending",
    );
    await assert.rejects(
      save({ prize_description: "Race edit" }),
      (e) => e.code === "55000",
    );
  });
  await test("busy claim cannot duplicate sending and does not change captured prize", async () => {
    const repeat = (await row(
      "select claim_verified_qr_bingo_draw_email_delivery($1,'couple',120) result",
      [selected.draw.id],
    )).result;
    assert.equal(repeat.busy, true);
  });
  await test("definitive failure unlocks prize edits and retry captures the new revision", async () => {
    await row(
      "select finalize_qr_bingo_draw_email_delivery($1,$2,'retryable_failure','','TEST ONLY provider rejection') result",
      [claim.delivery_key, claim.claim_token],
    );
    assert.equal(
      (await row("select qr_bingo_prize_details_lock($1,$2,$2) reason", [
        event,
        vendor,
      ])).reason,
      null,
    );
    await save({ prize_title: "Retry prize", prize_approx_value_cad: 350 });
    claim = (await row(
      "select claim_verified_qr_bingo_draw_email_delivery($1,'couple',120) result",
      [selected.draw.id],
    )).result;
    assert.equal(claim.prize_snapshot.prize_title, "Retry prize");
  });
  await test("ambiguous delivery stays locked and cannot be retried", async () => {
    await row(
      "select finalize_qr_bingo_draw_email_delivery($1,$2,'ambiguous','','TEST ONLY uncertain transport') result",
      [claim.delivery_key, claim.claim_token],
    );
    assert.equal(
      (await row("select qr_bingo_prize_details_lock($1,$2,$2) reason", [
        event,
        vendor,
      ])).reason,
      "unconfirmed",
    );
    await assert.rejects(
      save({ prize_title: "Cannot edit" }),
      (e) => e.code === "55000",
    );
    assert.equal(
      (await row(
        "select claim_verified_qr_bingo_draw_email_delivery($1,'couple',120) result",
        [selected.draw.id],
      )).result.ambiguous,
      true,
    );
  });
  await test("confirmed sent channel locks prize even if another delivery failed", async () => {
    await db.query(
      "update qr_bingo_raffle_draws set vendor_email_sent_at=clock_timestamp() where id=$1",
      [selected.draw.id],
    );
    assert.equal(
      (await row("select qr_bingo_prize_details_lock($1,$2,$2) reason", [
        event,
        vendor,
      ])).reason,
      "sent",
    );
    await assert.rejects(
      save({ prize_approx_value_cad: 400 }),
      (e) => e.code === "55000",
    );
  });
  await test("lock is exact-event and exact-vendor scoped", async () => {
    assert.equal(
      (await row("select qr_bingo_prize_details_lock($1,$2,$2) reason", [
        event,
        other,
      ])).reason,
      null,
    );
    assert.equal(
      (await row("select qr_bingo_prize_details_lock($1,$2,$2) reason", [
        "another-event",
        vendor,
      ])).reason,
      null,
    );
  });
  await test("new lock/snapshot RPCs are inaccessible to public callers", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (
        const name of [
          "qr_bingo_prize_details_lock",
          "qr_bingo_current_prize_snapshot",
        ]
      ) {
        assert.equal(
          (await row("select has_function_privilege($1,$2,$3) access", [
            role,
            `public.${name}(text,text,text)`,
            "EXECUTE",
          ])).access,
          false,
        );
      }
    }
  });
  await test("opt-in test email migration preserves default-off vendor copies", async () => {
    await db.exec(
      "alter table qr_bingo_email_test_fixtures add constraint qr_bingo_email_test_fixture_couple_only check (not send_vendor_email and send_couple_email);",
    );
    const vendorCopyMigration = await readFile(
      new URL(
        "../supabase/migrations/20260908043424_qr_bingo_opt_in_vendor_test_email_copy.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(vendorCopyMigration);
    assert.equal(
      (await row(
        "select column_default from information_schema.columns where table_schema='public' and table_name='qr_bingo_email_test_fixtures' and column_name='send_vendor_email'",
      )).column_default,
      "false",
    );
  });
  const testEvent = "email-test-offline-vendor-copy",
    testVendor = "903",
    testCouple = "703";
  const testEntry = {
    ...entry,
    id: id(201),
    event_key: testEvent,
    vendor_bingo_id: testVendor,
    vendor_bd_user_id: testVendor,
    couple_bd_user_id: testCouple,
    couple_email: "approved@example.invalid",
    alternate_free_entry_url: "https://www.weddingwin.ca/qr-bingo-free-entry",
  };
  await insert("qr_bingo_email_test_fixtures", {
    id: id(203),
    event_key: testEvent,
    vendor_bingo_id: testVendor,
    vendor_bd_user_id: testVendor,
    couple_bd_user_id: testCouple,
    vendor_name: terms.vendor_name,
    vendor_qr_payload: "https://www.weddingwin.ca/qr?vendor_id=903",
    outbound_recipient_email: testEntry.couple_email,
    enabled: true,
    expires_at: "2099-01-01",
    authorized_by: "Offline fictional test only",
  });
  await insert("qr_bingo_email_test_fixture_scans", {
    id: id(204),
    fixture_id: id(203),
    vendor_bingo_id: testVendor,
    couple_bd_user_id: testCouple,
  });
  await insert("qr_bingo_raffle_settings", {
    ...settings,
    id: id(200),
    event_key: testEvent,
    vendor_bingo_id: testVendor,
    vendor_bd_user_id: testVendor,
    alternate_free_entry_url: testEntry.alternate_free_entry_url,
  });
  await insert("qr_bingo_raffle_entries", testEntry);
  const testDraw = drawForEntry(testEntry, id(202), 1, {
    selection_status: "verified",
    eligibility_verified_at: stamp,
    skill_question_verified_at: stamp,
    verified_at: stamp,
    verified_by: "offline-test",
    winner_rules_confirmed_at: stamp,
    verification_notes: "TEST ONLY fictional checks",
  });
  await insert("qr_bingo_raffle_draws", testDraw);
  const claimTest = async (channel) =>
    (await row(
      "select claim_verified_qr_bingo_test_draw_email_delivery($1,$2,120) result",
      [testDraw.id, channel],
    )).result;
  await test("vendor claim rejects a fixture without explicit opt-in", async () => {
    await assert.rejects(claimTest("vendor"), (e) => e.code === "42501");
    const couple = await claimTest("couple");
    assert.equal(couple.recipient, testEntry.couple_email);
    await row(
      "select finalize_qr_bingo_draw_email_delivery($1,$2,'retryable_failure','','Offline no-send')",
      [couple.delivery_key, couple.claim_token],
    );
  });
  let vendorCopyClaim, coupleCopyClaim;
  await test("opted-in test creates two separate channels with identical pinned recipient and prize", async () => {
    await db.query(
      "update qr_bingo_email_test_fixtures set send_vendor_email=true where id=$1",
      [id(203)],
    );
    vendorCopyClaim = await claimTest("vendor");
    coupleCopyClaim = await claimTest("couple");
    assert.equal(vendorCopyClaim.channel, "vendor");
    assert.equal(coupleCopyClaim.channel, "couple");
    assert.notEqual(vendorCopyClaim.delivery_key, coupleCopyClaim.delivery_key);
    assert.equal(vendorCopyClaim.recipient, testEntry.couple_email);
    assert.equal(coupleCopyClaim.recipient, testEntry.couple_email);
    assert.deepEqual(
      vendorCopyClaim.prize_snapshot,
      coupleCopyClaim.prize_snapshot,
    );
    assert.equal((await claimTest("vendor")).busy, true);
    assert.equal((await claimTest("couple")).busy, true);
  });
  await test("partial test failure retries only unsent channel; sent channel remains immutable", async () => {
    await row(
      "select finalize_qr_bingo_draw_email_delivery($1,$2,'sent','','')",
      [vendorCopyClaim.delivery_key, vendorCopyClaim.claim_token],
    );
    await row(
      "select finalize_qr_bingo_draw_email_delivery($1,$2,'retryable_failure','','Offline no-send')",
      [coupleCopyClaim.delivery_key, coupleCopyClaim.claim_token],
    );
    assert.equal((await claimTest("vendor")).already_sent, true);
    const retry = await claimTest("couple");
    assert.equal(retry.claimed, true);
    assert.deepEqual(retry.prize_snapshot, vendorCopyClaim.prize_snapshot);
    await row(
      "select finalize_qr_bingo_draw_email_delivery($1,$2,'ambiguous','','Offline uncertain outcome')",
      [retry.delivery_key, retry.claim_token],
    );
    assert.equal((await claimTest("couple")).ambiguous, true);
  });
  await test("test claims retain expiry, exact draw and entry recipient, channel and authorization guards", async () => {
    await assert.rejects(claimTest("sms"), (e) => e.code === "22023");
    await db.query(
      "update qr_bingo_email_test_fixtures set expires_at='2000-01-01' where id=$1",
      [id(203)],
    );
    await assert.rejects(claimTest("vendor"), (e) => e.code === "42501");
    await db.query(
      "update qr_bingo_email_test_fixtures set expires_at='2099-01-01' where id=$1",
      [id(203)],
    );
    await db.query(
      "update qr_bingo_raffle_entries set couple_email='wrong@example.invalid' where id=$1",
      [testEntry.id],
    );
    await assert.rejects(claimTest("vendor"), (e) => e.code === "55000");
    await db.query(
      "update qr_bingo_raffle_entries set couple_email=$2 where id=$1",
      [testEntry.id, testEntry.couple_email],
    );
    await db.query(
      "update qr_bingo_raffle_draws set winner_email='wrong@example.invalid' where id=$1",
      [testDraw.id],
    );
    await assert.rejects(claimTest("vendor"), (e) => e.code === "42501");
    await db.query(
      "update qr_bingo_raffle_draws set winner_email=$2 where id=$1",
      [testDraw.id, testEntry.couple_email],
    );
    await db.exec(
      "select set_config('request.jwt.claim.role','authenticated',false)",
    );
    await assert.rejects(claimTest("vendor"), (e) => e.code === "42501");
    await db.exec(
      "select set_config('request.jwt.claim.role','service_role',false)",
    );
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (await row(
          "select has_function_privilege($1,'public.claim_qr_bingo_test_draw_email_delivery(uuid,text,integer)','EXECUTE') access",
          [role],
        )).access,
        false,
      );
    }
  });
  console.log(
    `${passed} isolated PostgreSQL checks passed. No live writes or emails.`,
  );
} catch (error) {
  console.error("FAIL", error.message, error.code || "", error.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
