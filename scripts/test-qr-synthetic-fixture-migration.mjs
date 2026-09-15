import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
// Real PostgreSQL execution, isolated in WASM; no network, live accounts or sends.
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const columns = JSON.parse(
  await read("./fixtures/qr-reset-schema-columns.json"),
);
const migration = await read(
  "../supabase/migrations/20260914203407_add_nonbinding_synthetic_draw_fixture.sql",
);
const sourceId = "623e7f5c-5d47-46dc-9d58-1df9e192667f";
const sourceEvent = "app-review-weddingwin-2026-38970";
const targetEvent = "app-review-willow-demo-2026-38970";
const fixtureStamp = "2026-08-28T16:26:02.975125Z";
const offerStamp = "2026-09-02T08:25:06.219026Z";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const params = [
  uuid(50),
  sourceId,
  fixtureStamp,
  offerStamp,
  16,
  "Offline fixture test",
  "Nonbinding named preview only",
];
let passes = 0;
async function test(name, fn) {
  await fn();
  console.log(`PASS ${++passes}: ${name}`);
}
const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
async function insert(table, data) {
  const keys = Object.keys(data);
  return db.query(
    `insert into public.${table}(${keys.join(",")}) values(${
      keys.map((_, i) => "$" + (i + 1)).join(",")
    }) returning *`,
    Object.values(data),
  );
}
async function asRole(role, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(
      `set local role ${role}; select set_config('request.jwt.claim.role','${role}',true)`,
    );
    return fn(tx);
  });
}
const rpc = (tx, args = params) =>
  tx.query(
    "select public.provision_qr_bingo_synthetic_fixture($1,$2,$3,$4,$5,$6,$7) result",
    args,
  ).then((r) => r.rows[0].result);
async function rejected(fn, code) {
  await assert.rejects(fn, (e) => {
    assert.ok(
      (Array.isArray(code) ? code : [code]).includes(e.code),
      `${e.message}: expected ${code}, got ${e.code}`,
    );
    return true;
  });
}
async function temporary(sql, fn) {
  const sentinel = new Error("intentional fixture rollback");
  try {
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await fn(tx);
      throw sentinel;
    });
  } catch (e) {
    if (e !== sentinel) throw e;
  }
}
async function rejectChangedSource(sql, code = "55000") {
  await temporary(sql, async (tx) => {
    await tx.exec("set local role service_role");
    await rejected(() => rpc(tx), code);
  });
}
try {
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions;
 create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
 create function extensions.gen_random_uuid() returns uuid language sql as $$select pg_catalog.gen_random_uuid()$$;
 create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1),'hex')$$;`,
  );
  for (const table of new Set(columns.map((c) => c.table_name))) {
    const fields = columns.filter((c) => c.table_name === table).map((c) =>
      `"${c.column_name}" ${
        c.data_type === "ARRAY" ? c.udt_name.slice(1) + "[]" : c.data_type
      }${
        c.column_default && !c.column_default.includes("nextval(")
          ? " default " + c.column_default
          : ""
      }`
    );
    await db.exec(`create table public.${table}(${fields.join(",")})`);
  }
  await db.exec(`alter table app_review_raffle_fixtures add primary key(id);
 create unique index app_review_raffle_fixture_couple_idx on app_review_raffle_fixtures(couple_bd_user_id);
 create unique index app_review_raffle_fixture_vendor_idx on app_review_raffle_fixtures(vendor_bd_user_id);
 alter table qr_bingo_raffle_settings add primary key(id),add unique(event_key,vendor_bingo_id);
 alter table qr_bingo_vendor_offer_versions add unique(event_key,vendor_bingo_id,vendor_offer_version);
 alter table qr_bingo_raffle_entries add column card_reset_at timestamptz;
 create table app_review_raffle_fixture_participants(fixture_id uuid,couple_bd_user_id text);
 create table app_review_raffle_fixture_scans(fixture_id uuid,couple_bd_user_id text,vendor_bingo_id text,created_at timestamptz default now(),unique(fixture_id,couple_bd_user_id,vendor_bingo_id));
 grant select,insert,update,delete on all tables in schema public to service_role;
 revoke insert,update,delete on qr_bingo_event_configs,qr_bingo_vendor_offer_versions,qr_bingo_draw_email_deliveries from service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  const auditSource = await read(
    "../supabase/migrations/20260830110000_add_qr_bingo_alternate_entry_reconciliation.sql",
  );
  await db.exec(
    auditSource.match(
      /create table if not exists public\.qr_bingo_vendor_responsibility_acceptance_audit \([\s\S]*?\n\);/i,
    )[0],
  );
  await db.exec(
    "alter table qr_bingo_vendor_responsibility_acceptance_audit add vendor_offer_version timestamptz,add authenticated_vendor_bd_user_id text,add acceptance_source text,add authority_to_bind_attested boolean,add responsibility_disclosure_sha256 text;",
  );
  const deadline = new Date(Date.now() + 86400000 * 20).toISOString();
  await insert("qr_bingo_event_configs", {
    id: uuid(1),
    event_key: "niagara-wedding-show-2026",
    event_name: "Unchanged live show",
    revision: 16,
    published: true,
    rules_version: "2026-09-01-in-person-entry",
    official_rules_url: "https://www.weddingwin.ca/qr-bingo-vendor-draw-rules",
    alternate_free_entry_url: "https://www.weddingwin.ca/qr-bingo",
    entry_closes_at: deadline,
    draw_opens_at: deadline,
    draw_at: deadline,
    history_starts_at: deadline,
  });
  await insert("app_review_raffle_fixtures", {
    id: sourceId,
    event_key: sourceEvent,
    couple_bd_user_id: "38971",
    vendor_bd_user_id: "38970",
    vendor_bingo_id: "38970",
    vendor_name: "Willow & Bloom Floral Studio",
    vendor_qr_payload: "https://www.weddingwin.ca/qr?vendor_id=38970",
    enabled: true,
    allow_early_draw: true,
    suppress_outbound_email: true,
    expires_at: deadline,
    updated_at: fixtureStamp,
  });
  await insert("app_review_raffle_fixtures", {
    id: uuid(2),
    event_key: "app-review-other",
    couple_bd_user_id: "9001",
    vendor_bd_user_id: "9002",
    vendor_bingo_id: "9002",
    vendor_name: "Other fixture",
    enabled: false,
    allow_early_draw: false,
    suppress_outbound_email: true,
    expires_at: deadline,
  });
  await insert("qr_bingo_raffle_settings", {
    id: uuid(3),
    event_key: sourceEvent,
    vendor_bingo_id: "38970",
    vendor_bd_user_id: "38970",
    vendor_name: "Wedding Win App Review Test Vendor",
    enabled: true,
    legal_terms_accepted: true,
    legal_terms_version: "2026-09-01-in-person-entry",
    legal_terms_accepted_at: offerStamp,
    rules_viewed_at: offerStamp,
    vendor_responsibility_acknowledged: true,
    vendor_responsibility_acknowledged_at: offerStamp,
    updated_at: offerStamp,
  });
  await insert("qr_bingo_vendor_offer_versions", {
    event_key: sourceEvent,
    vendor_bingo_id: "38970",
    vendor_bd_user_id: "38970",
    vendor_offer_version: offerStamp,
    vendor_name: "Wedding Win App Review Test Vendor",
    enabled: true,
    offer_enterable: true,
    legal_terms_accepted: true,
    legal_terms_accepted_at: offerStamp,
  });
  await insert("qr_bingo_raffle_entries", {
    id: uuid(5),
    event_key: sourceEvent,
    vendor_bingo_id: "38970",
    couple_bd_user_id: "38971",
    card_reset_at: offerStamp,
  });
  await insert("app_review_raffle_fixture_participants", {
    fixture_id: sourceId,
    couple_bd_user_id: "38809",
  });
  await insert("app_review_raffle_fixture_scans", {
    fixture_id: sourceId,
    couple_bd_user_id: "38971",
    vendor_bingo_id: "38970",
  });
  await insert("qr_bingo_raffle_entries", {
    id: uuid(6),
    event_key: "niagara-wedding-show-2026",
    vendor_bingo_id: "23608",
    couple_bd_user_id: "100",
  });
  await insert("qr_bingo_vendor_responsibility_acceptance_audit", {
    id: uuid(9),
    settings_id: uuid(3),
    event_key: sourceEvent,
    vendor_bingo_id: "38970",
    vendor_bd_user_id: "38970",
    vendor_name: "Wedding Win App Review Test Vendor",
    rules_version: "2026-09-01-in-person-entry",
    responsibility_disclosure_text:
      "Historical offline test attestation; must remain byte equivalent.",
    responsibility_accepted_at: offerStamp,
    legal_terms_accepted_at: offerStamp,
    rules_viewed_at: offerStamp,
    enabled_when_recorded: true,
    vendor_offer_version: offerStamp,
    authenticated_vendor_bd_user_id: "38970",
    acceptance_source: "app",
    authority_to_bind_attested: true,
    responsibility_disclosure_sha256: "a".repeat(64),
  });
  const historicalAudit = await row(
    "select to_jsonb(a) value from qr_bingo_vendor_responsibility_acceptance_audit a",
  );
  const oldParticipants = await row(
    "select jsonb_agg(to_jsonb(p)) value from app_review_raffle_fixture_participants p",
  );
  const participationSource = await read(
    "../supabase/migrations/20260914163331_qr_bingo_participation_acceptance_ledger.sql",
  );
  await db.exec(
    "create table qr_bingo_participation_test_accounts(couple_bd_user_id text)",
  );
  await db.exec(
    participationSource.match(
      /create function public\.qr_bingo_participation_is_test\([\s\S]*?\$\$;/i,
    )[0],
  );
  const preserved = await row(
    `select (select jsonb_agg(to_jsonb(x)) from qr_bingo_raffle_settings x) settings,(select jsonb_agg(to_jsonb(x)) from qr_bingo_vendor_offer_versions x) offers,(select jsonb_agg(to_jsonb(x) order by id) from qr_bingo_raffle_entries x) entries,(select jsonb_agg(to_jsonb(x)) from app_review_raffle_fixture_scans x) scans,(select jsonb_agg(to_jsonb(x)) from qr_bingo_event_configs x) config`,
  );
  // Existing production settings triggers include real legal audit, timestamp,
  // immutable snapshot capture and publication/promotion locks; no simplified mocks.
  await db.exec(await read("./fixtures/qr-reset-live-helpers.sql"));
  await db.exec(await read("./fixtures/qr-reset-live-functions.sql"));
  await db.exec(await read("./fixtures/qr-reset-settings-triggers.sql"));
  const offerMigration = await read(
    "../supabase/migrations/20260830120000_add_qr_bingo_vendor_offer_versions.sql",
  );
  const immutable = offerMigration.match(
    /create or replace function public\.reject_qr_bingo_vendor_offer_version_mutation\(\)[\s\S]*?\$\$;/i,
  )[0];
  await db.exec(
    immutable +
      `; create trigger reject_qr_bingo_vendor_offer_version_mutation before update or delete on qr_bingo_vendor_offer_versions for each row execute function reject_qr_bingo_vendor_offer_version_mutation();`,
  );
  await test("migration applies with default grants and existing real settings/offer triggers", () =>
    db.exec(migration));
  if (process.env.QR_SYNTHETIC_CUTOFF === "1") {
    await test("show-day cutoff coexists with original synthetic provenance guards", () =>
      read("../supabase/migrations/20260915005744_enforce_vendor_prize_edit_deadline.sql").then(sql => db.exec(sql)));
    await test("arbitrary synthetic id or missing setup cannot bypass a real prize deadline", async () => {
      for (const event of ["niagara-wedding-show-2026", "app-review-missing-setup"]) {
        await rejected(() => asRole("service_role", async tx => {
          await tx.query("select set_config('request.qr_bingo_synthetic_setup_id',$1,true)",[uuid(999)]);
          return tx.query("insert into qr_bingo_raffle_settings(event_key,vendor_bingo_id,vendor_bd_user_id,prize_title,synthetic_fixture_setup_id) values($1,'999','999','Forged prize',$2)",[event,uuid(999)]);
        }), "55000");
      }
      assert.equal((await row("select has_table_privilege('service_role','qr_bingo_event_prize_edit_policies','UPDATE') allowed")).allowed,false);
    });
  }
  await test("anonymous/authenticated cannot provision or read provenance; service config/offer/ledger writes stay revoked", async () => {
    for (const role of ["anon", "authenticated"]) {
      await rejected(() => asRole(role, (tx) => rpc(tx)), "42501");
      await rejected(
        () =>
          asRole(
            role,
            (tx) => tx.query("select * from qr_bingo_synthetic_fixture_setups"),
          ),
        "42501",
      );
    }
    const p = await row(
      `select has_table_privilege('service_role','qr_bingo_event_configs','UPDATE') configwrite,has_table_privilege('service_role','qr_bingo_draw_email_deliveries','UPDATE') mailwrite,has_table_privilege('service_role','qr_bingo_vendor_offer_versions','INSERT') offerwrite,has_table_privilege('service_role','qr_bingo_synthetic_fixture_setups','DELETE') auditdelete,relrowsecurity rls from pg_class where oid='qr_bingo_synthetic_fixture_setups'::regclass`,
    );
    assert.deepEqual(p, {
      configwrite: false,
      mailwrite: false,
      offerwrite: false,
      auditdelete: false,
      rls: true,
    });
  });
  await test("exact pair, required audit identity and well formed request are enforced", async () => {
    for (
      const [index, value] of [
        [0, null],
        [1, uuid(7)],
        [2, null],
        [3, null],
        [4, 0],
        [5, " "],
        [5, "<script>"],
        [6, "bad\nreason"],
      ]
    ) {
      const bad = [...params];
      bad[index] = value;
      await rejected(
        () => asRole("service_role", (tx) => rpc(tx, bad)),
        "22023",
      );
    }
  });
  await test("stale source, offer and published revision cannot create data", async () => {
    for (
      const [index, value] of [[2, "2026-01-01T00:00:00Z"], [
        3,
        "2026-01-01T00:00:00Z",
      ], [4, 15]]
    ) {
      const bad = [...params];
      bad[index] = value;
      await rejected(
        () => asRole("service_role", (tx) => rpc(tx, bad)),
        "55000",
      );
    }
  });
  await test("disabled, expired, unsuppressed or changed-identity source fails closed", async () => {
    for (
      const change of [
        "enabled=false",
        "expires_at=now()-interval '1 minute'",
        "suppress_outbound_email=false",
        "couple_bd_user_id='123'",
        "vendor_name='Altered name'",
      ]
    ) {
      await rejectChangedSource(
        `update app_review_raffle_fixtures set ${change} where id='${sourceId}'`,
      );
    }
  });
  await test("active entries or any prior draw prevent transition", async () => {
    await rejectChangedSource(
      `update qr_bingo_raffle_entries set card_reset_at=null where id='${
        uuid(5)
      }'`,
    );
    await rejectChangedSource(
      `insert into qr_bingo_raffle_draws(id,event_key) values('${
        uuid(7)
      }','${sourceEvent}')`,
    );
  });
  let result;
  await test("service-role provision commits a fresh immutable nonbinding snapshot without real acceptance", async () => {
    result = await asRole("service_role", (tx) => rpc(tx));
    assert.equal(result.ok, true);
    assert.equal(result.replayed, false);
    assert.notEqual(result.fixture_id, sourceId);
    assert.equal(result.event_key, targetEvent);
    const s = await row(
      `select f.enabled,f.suppress_outbound_email,f.allow_early_draw,s.enabled settings_enabled,s.legal_terms_accepted,s.legal_terms_accepted_at,s.vendor_responsibility_acknowledged,s.vendor_responsibility_acknowledged_at,s.rules_viewed_at,o.offer_enterable,o.vendor_name,o.prize_approx_value_cad,o.synthetic_fixture_setup_id=o2.id bound,o.vendor_offer_version=o2.vendor_offer_version version_bound from app_review_raffle_fixtures f join qr_bingo_synthetic_fixture_setups o2 on o2.fixture_id=f.id join qr_bingo_raffle_settings s on s.event_key=f.event_key join qr_bingo_vendor_offer_versions o on o.event_key=f.event_key where f.id=$1`,
      [result.fixture_id],
    );
    assert.deepEqual(s, {
      enabled: true,
      suppress_outbound_email: true,
      allow_early_draw: false,
      settings_enabled: false,
      legal_terms_accepted: false,
      legal_terms_accepted_at: null,
      vendor_responsibility_acknowledged: false,
      vendor_responsibility_acknowledged_at: null,
      rules_viewed_at: null,
      offer_enterable: false,
      vendor_name: "Willow & Bloom Floral Studio",
      prize_approx_value_cad: "0",
      bound: true,
      version_bound: true,
    });
    assert.equal(
      (await row(
        "select count(*) n from qr_bingo_vendor_responsibility_acceptance_audit",
      )).n,
      1,
    );
    assert.equal(
      (await row(
        "select count(*) n from qr_bingo_vendor_responsibility_acceptance_audit where event_key=$1",
        [targetEvent],
      )).n,
      0,
    );
    assert.equal(
      (await row(
        "select count(*) n from app_review_raffle_fixture_scans where fixture_id=$1",
        [result.fixture_id],
      )).n,
      0,
    );
  });
  await test("same request replays without new rows; changed payload conflicts", async () => {
    const replay = await asRole("service_role", (tx) => rpc(tx));
    assert.deepEqual({ ...replay, replayed: false }, result);
    const bad = [...params];
    bad[6] = "Different reason";
    await rejected(() => asRole("service_role", (tx) => rpc(tx, bad)), "23505");
    assert.equal(
      (await row("select count(*) n from qr_bingo_synthetic_fixture_setups")).n,
      1,
    );
  });
  await test("old scans, offers, real legal timestamps, entries and public configuration remain byte equivalent", async () => {
    const after = await row(
      `select (select jsonb_agg(to_jsonb(x)-'synthetic_fixture_setup_id') from qr_bingo_raffle_settings x where event_key='${sourceEvent}') settings,(select jsonb_agg(to_jsonb(x)-'synthetic_fixture_setup_id') from qr_bingo_vendor_offer_versions x where event_key='${sourceEvent}') offers,(select jsonb_agg(to_jsonb(x) order by id) from qr_bingo_raffle_entries x) entries,(select jsonb_agg(to_jsonb(x)) from app_review_raffle_fixture_scans x) scans,(select jsonb_agg(to_jsonb(x)) from qr_bingo_event_configs x) config`,
    );
    assert.deepEqual(after, preserved);
    assert.deepEqual(
      await row(
        "select to_jsonb(a) value from qr_bingo_vendor_responsibility_acceptance_audit a",
      ),
      historicalAudit,
    );
    assert.deepEqual(
      await row(
        "select jsonb_agg(to_jsonb(p)) value from app_review_raffle_fixture_participants p",
      ),
      oldParticipants,
    );
    assert.deepEqual(
      await row(
        `select enabled,primary_superseded_at is not null retired,suppress_outbound_email from app_review_raffle_fixtures where id=$1`,
        [sourceId],
      ),
      { enabled: true, retired: true, suppress_outbound_email: true },
    );
  });
  await test("synthetic event and superseded primary cannot create entries or winners or reactivate old entries", async () => {
    for (const event of [sourceEvent, targetEvent]) {
      for (
        const table of ["qr_bingo_raffle_entries", "qr_bingo_raffle_draws"]
      ) {
        await rejected(() =>
          asRole("service_role", (tx) =>
            tx.query(
              `insert into ${table}(id,event_key,couple_bd_user_id) values($1,$2,'38971')`,
              [uuid(8), event],
            )), "55000");
      }
    }
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update qr_bingo_raffle_entries set card_reset_at=null where id=$1",
            [uuid(5)],
          )),
      "55000",
    );
    assert.equal(
      (await row("select count(*) n from qr_bingo_raffle_draws")).n,
      0,
    );
    assert.equal(
      (await row("select count(*) n from qr_bingo_draw_email_deliveries")).n,
      0,
    );
  });
  await test("synthetic settings cannot enable, accept terms, remove provenance or change expiry", async () => {
    for (
      const change of [
        "enabled=true",
        "legal_terms_accepted=true",
        "synthetic_fixture_setup_id=null",
        "entry_closes_at=now()+interval '2 days'",
      ]
    ) {
      await rejected(() =>
        asRole("service_role", (tx) =>
          tx.exec(
            `update qr_bingo_raffle_settings set ${change} where event_key='${targetEvent}'`,
          )), ["55000", "P0001"]);
    }
  });
  await test("superseded primary and synthetic identities cannot be changed or unsuppressed", async () => {
    for (const id of [sourceId, result.fixture_id]) {
      for (
        const change of [
          "suppress_outbound_email=false",
          "couple_bd_user_id='567'",
          "primary_superseded_at=null",
          "enabled=false",
        ]
      ) {
        if (
          id === result.fixture_id &&
          ["primary_superseded_at=null", "enabled=false"].includes(change)
        ) continue;
        await rejected(() =>
          asRole("service_role", (tx) =>
            tx.query(
              `update app_review_raffle_fixtures set ${change} where id=$1`,
              [id],
            )), "55000");
      }
    }
  });
  await test("ordinary mapping cannot supersede to bypass the one account mapping invariant", async () => {
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update app_review_raffle_fixtures set primary_superseded_at=now() where id=$1",
            [uuid(2)],
          )),
      "42501",
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.exec(
            "insert into app_review_raffle_fixtures(couple_bd_user_id,vendor_bd_user_id,event_key) values('9001','9004','another')",
          )),
      "23505",
    );
  });
  await test("synthetic provenance and snapshots are immutable", async () => {
    await rejected(
      () =>
        asRole(
          "service_role",
          (tx) => tx.query("delete from qr_bingo_synthetic_fixture_setups"),
        ),
      "42501",
    );
    await rejected(
      () =>
        db.query("update qr_bingo_synthetic_fixture_setups set reason=reason"),
      "55000",
    );
    await rejected(
      () =>
        db.query(
          "update qr_bingo_vendor_offer_versions set vendor_name=vendor_name where event_key=$1",
          [targetEvent],
        ),
      "55000",
    );
  });
  await test("the extra participant retains original event access; primary migration preserves its row", async () => {
    assert.deepEqual(
      await row(
        "select * from app_review_raffle_fixture_participants where fixture_id=$1",
        [sourceId],
      ),
      { fixture_id: sourceId, couple_bd_user_id: "38809" },
    );
    await asRole(
      "service_role",
      (tx) =>
        tx.query(
          "insert into qr_bingo_raffle_entries(id,event_key,couple_bd_user_id) values($1,$2,$3)",
          [uuid(80), sourceEvent, "38809"],
        ),
    );
    await asRole(
      "service_role",
      (tx) =>
        tx.query(
          "insert into app_review_raffle_fixture_scans(fixture_id,couple_bd_user_id,vendor_bingo_id) values($1,$2,$3)",
          [sourceId, "38809", "38970"],
        ),
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update qr_bingo_raffle_entries set couple_bd_user_id=$1 where id=$2",
            ["38971", uuid(80)],
          )),
      "55000",
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update qr_bingo_raffle_entries set event_key=$1 where id=$2",
            [targetEvent, uuid(80)],
          )),
      "55000",
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update qr_bingo_raffle_entries set event_key=$1 where id=$2",
            ["ordinary", uuid(5)],
          )),
      "55000",
    );
  });
  await test("old/new events and extra participant remain excluded from real master/push eligibility", async () => {
    assert.deepEqual(
      await row(
        "select qr_bingo_participation_is_test($1,$2) old_pair,qr_bingo_participation_is_test($3,$2) new_pair,qr_bingo_participation_is_test($1,$4) extra,qr_bingo_participation_is_test($5,$4) extra_any_event",
        [
          sourceEvent,
          "38971",
          targetEvent,
          "38809",
          "niagara-wedding-show-2026",
        ],
      ),
      { old_pair: true, new_pair: true, extra: true, extra_any_event: true },
    );
  });
  await test("current exact synthetic scan works while stale primary and extra synthetic mapping fail", async () => {
    await asRole(
      "service_role",
      (tx) =>
        tx.query(
          "insert into app_review_raffle_fixture_scans(fixture_id,couple_bd_user_id,vendor_bingo_id) values($1,$2,$3)",
          [result.fixture_id, "38971", "38970"],
        ),
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update app_review_raffle_fixture_scans set vendor_bingo_id=vendor_bingo_id where fixture_id=$1 and couple_bd_user_id=$2",
            [sourceId, "38971"],
          )),
      "42501",
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "insert into app_review_raffle_fixture_scans(fixture_id,couple_bd_user_id,vendor_bingo_id) values($1,$2,$3)",
            [result.fixture_id, "38809", "38970"],
          )),
      "42501",
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "insert into app_review_raffle_fixture_participants values($1,$2)",
            [result.fixture_id, "38809"],
          )),
      "42501",
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update app_review_raffle_fixture_scans set fixture_id=$1 where fixture_id=$2",
            [uuid(2), result.fixture_id],
          )),
      "55000",
    );
  });
  await test("later safe shutdown is permitted but cannot re-enable the preview", async () => {
    await asRole(
      "service_role",
      (tx) =>
        tx.query(
          "update app_review_raffle_fixtures set enabled=false where id=$1",
          [result.fixture_id],
        ),
    );
    await rejected(
      () =>
        asRole("service_role", (tx) =>
          tx.query(
            "update app_review_raffle_fixtures set enabled=true where id=$1",
            [result.fixture_id],
          )),
      "55000",
    );
  });
  console.log(`${passes} synthetic fixture SQL cases passed.`);
} catch (e) {
  console.error(e.message, e.code, e.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
