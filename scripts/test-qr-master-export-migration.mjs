import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Local PostgreSQL only. These source tables expose the agreed production column
// contract; every export function, grant, trigger and query comes from migration.
const db = new PGlite();
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260914163442_qr_bingo_master_contacts_export.sql",
    import.meta.url,
  ),
  "utf8",
);
const ledger = await readFile(
  new URL(
    "../supabase/migrations/20260914163331_qr_bingo_participation_acceptance_ledger.sql",
    import.meta.url,
  ),
  "utf8",
);
const row = async (query, params = []) =>
  (await db.query(query, params)).rows[0];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function service(fn) {
  await db.exec("begin; set local role service_role");
  try {
    const result = await fn();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const call = (
  action,
  {
    actor = "Offline Admin",
    request = null,
    exp = null,
    cursor = null,
    count = null,
  } = {},
) =>
  service(async () =>
    (await row(
      "select public.qr_bingo_master_contacts_export($1,$2,$3,$4,$5,$6) result",
      [action, actor, request, exp, cursor, count],
    )).result
  );
const accept = async (couple, event = "event-one", extra = {}) => {
  const columns = {
    event_key: event,
    couple_bd_user_id: String(couple),
    rules_version: "rules-one",
    notice_version: "notice-one",
    basis: "explicit_notice",
    accepted_at: "2026-09-01T00:00:00Z",
    recorded_at: "2026-09-02T00:00:00Z",
    excluded_from_master: false,
    ...extra,
  };
  return row(
    `insert into qr_bingo_participation_acceptances (${
      Object.keys(columns).join(",")
    }) values (${
      Object.keys(columns).map((_, i) => "$" + (i + 1)).join(",")
    }) returning *`,
    Object.values(columns),
  );
};
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table qr_bingo_contact_profiles(event_key text,couple_bd_user_id text,name text,email text,phone text,wedding_date text,wedding_venue text,updated_at timestamptz,version bigint,admin_removed_at timestamptz,primary key(event_key,couple_bd_user_id));
    create table qr_bingo_raffle_entries(id uuid primary key,event_key text,vendor_bingo_id text,vendor_offer_version timestamptz,couple_name text,couple_email text,couple_phone text,couple_wedding_date text,couple_wedding_venue text,card_reset_at timestamptz);
    create table qr_bingo_participation_acceptances(id uuid primary key default gen_random_uuid(),event_key text,couple_bd_user_id text,rules_version text,notice_version text,basis text,accepted_at timestamptz,recorded_at timestamptz,excluded_from_master boolean,source_entry_id uuid references qr_bingo_raffle_entries(id) on delete cascade,profile_event_key text,profile_couple_bd_user_id text,foreign key(profile_event_key,profile_couple_bd_user_id) references qr_bingo_contact_profiles(event_key,couple_bd_user_id) on delete cascade);
    create table qr_bingo_vendor_offer_versions(event_key text,vendor_bingo_id text,vendor_offer_version timestamptz,activation_excluded_as_legacy_qa boolean);
    create table qr_bingo_legacy_qa_archives(entry_id uuid);
    create table app_review_raffle_fixtures(id uuid,event_key text,couple_bd_user_id text,enabled boolean,expires_at timestamptz,vendor_bd_user_id text);
    create table app_review_raffle_fixture_participants(fixture_id uuid,couple_bd_user_id text);
    create table qr_bingo_email_test_fixtures(event_key text,couple_bd_user_id text,enabled boolean,expires_at timestamptz,vendor_bd_user_id text);
    create schema cron;
    create table cron.job(jobname text primary key,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.job values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end;$$;
    grant select on all tables in schema public to service_role;
    grant delete on qr_bingo_contact_profiles,qr_bingo_raffle_entries to service_role;
    -- Reproduce hosted defaults so selective grants cannot accidentally retain ALL.
    alter default privileges in schema public grant all on tables to service_role;
  `);
  const helperStart = ledger.indexOf(
    "create table public.qr_bingo_participation_test_accounts (",
  );
  const helperEnd = ledger.indexOf(
    "\ncreate function public.record_qr_bingo_participation_acceptance(",
    helperStart,
  );
  assert(helperStart >= 0 && helperEnd > helperStart);
  await db.exec(ledger.slice(helperStart, helperEnd));
  await db.exec(migration);
  await test("documented QA registry is service-readable only and excludes 39077 without changing fixture privileges", async () => {
    const table = "qr_bingo_participation_test_accounts";
    assert.deepEqual(
      await row(
        "select has_table_privilege('service_role',$1,'SELECT') can_read,has_table_privilege('service_role',$1,'INSERT') can_add,has_table_privilege('service_role',$1,'UPDATE') can_edit,has_table_privilege('service_role',$1,'DELETE') can_remove",
        [table],
      ),
      { can_read: true, can_add: false, can_edit: false, can_remove: false },
    );
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (await row("select has_table_privilege($1,$2,'SELECT') allowed", [
          role,
          table,
        ])).allowed,
        false,
      );
    }
    assert.equal(
      (await row(
        "select relrowsecurity enabled from pg_class where oid=$1::regclass",
        [table],
      )).enabled,
      true,
    );
    assert.equal(
      (await service(() =>
        row(
          "select qr_bingo_participation_is_test('ordinary-event','39077') excluded",
        )
      )).excluded,
      true,
    );
    assert.equal(
      (await row(
        "select count(*)::int n from app_review_raffle_fixtures where couple_bd_user_id='39077'",
      )).n,
      0,
    );
  });
  await test("export RPC and every personal table reject anon/authenticated; service is an actual non-superuser role", async () => {
    for (const [table, allowed] of [
      ["qr_bingo_master_exports", [true, true, true, true]],
      ["qr_bingo_master_export_rows", [true, true, false, true]],
      ["qr_bingo_master_export_audit", [true, true, false, false]],
    ]) {
      const permissions = [];
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        permissions.push((await row("select has_table_privilege('service_role',$1,$2) allowed", [table, privilege])).allowed);
      }
      assert.deepEqual(permissions, allowed, "hosted default grants must be narrowed for " + table);
      assert.equal((await row("select has_table_privilege('service_role',$1,'TRUNCATE') allowed", [table])).allowed, false);
    }
    assert.deepEqual(
      await service(() =>
        row(
          "select current_user username,rolsuper from pg_roles where rolname=current_user",
        )
      ),
      { username: "service_role", rolsuper: false },
    );
    for (const role of ["anon", "authenticated"]) {
      for (
        const table of [
          "qr_bingo_master_exports",
          "qr_bingo_master_export_rows",
          "qr_bingo_master_export_audit",
        ]
      ) {
        assert.equal(
          (await row("select has_table_privilege($1,$2,'SELECT') allowed", [
            role,
            table,
          ])).allowed,
          false,
        );
        assert.equal(
          (await row(
            "select relrowsecurity rls from pg_class where oid=$1::regclass",
            [table],
          )).rls,
          true,
        );
      }
      await db.exec("begin; set local role " + role);
      try {
        await assert.rejects(
          row(
            "select qr_bingo_master_contacts_export('start','Offline Admin',$1)",
            [id(1)],
          ),
          (e) => e.code === "42501",
        );
      } finally {
        await db.exec("rollback");
      }
    }
    assert.equal(
      (await row(
        "select prosecdef from pg_proc where proname='qr_bingo_master_contacts_export'",
      )).prosecdef,
      false,
    );
  });
  await test("profile-only contacts are excluded; an empty list exports one header with a single completion audit", async () => {
    await db.exec(
      "insert into qr_bingo_contact_profiles values('event-one','100','Profile only','profile@example.test','00123456789','','',now(),1,null)",
    );
    const snapshot = await call("start", { request: id(2) });
    assert.equal(snapshot.total, 0);
    const page = await call("page", { exp: snapshot.export_id, cursor: 0 });
    assert.deepEqual(page.rows, []);
    assert.equal(page.done, true);
    const complete = await call("complete", {
      exp: snapshot.export_id,
      count: 0,
    });
    assert.equal(complete.ok, true);
    assert.equal(complete.generated_at, snapshot.generated_at);
    assert.equal(
      (await call("complete", { exp: snapshot.export_id, count: 0 })).ok,
      true,
    );
    assert.equal(
      (await row(
        "select count(*)::int n from qr_bingo_master_export_audit where export_id=$1",
        [snapshot.export_id],
      )).n,
      1,
    );
  });
  let snapshot;
  await test("all events dedupe by account; latest accepted-event contact wins even if removed; historical reset entry supplies fallback", async () => {
    await accept(101);
    await accept(101, "event-two", {
      accepted_at: "2026-09-05T00:00:00Z",
      rules_version: "rules-two",
    });
    await db.exec(`insert into qr_bingo_contact_profiles values
      ('event-one','101','Earlier','earlier@example.test','0123456789','','', '2026-09-01',1,null),
      ('event-two','101','Latest accepted','latest@example.test','00123456789','2027-01-02','Venue','2026-09-05',2,now()),
      ('unaccepted-event','101','Must not export','wrong@example.test','123456789','','','2026-09-10',3,null);
      insert into qr_bingo_raffle_entries values('${
      id(102)
    }','old-event','901','2026-09-01','Historic','historic@example.test','0123456789','2027-02-01','Old venue',now());`);
    await accept(102, "old-event", {
      source_entry_id: id(102),
      notice_version: "",
      basis: "vendor_draw_entry",
    });
    await db.exec(
      "update qr_bingo_participation_acceptances set profile_event_key=event_key,profile_couple_bd_user_id=couple_bd_user_id where couple_bd_user_id='101'",
    );
    snapshot = await call("start", { request: id(3) });
    assert.equal(snapshot.total, 2);
    const rows =
      (await call("page", { exp: snapshot.export_id, cursor: 0 })).rows;
    assert.equal(rows[0].couple_id, "101");
    assert.equal(rows[0].name, "Latest accepted");
    assert.equal(rows[0].event_keys, "event-one; event-two");
    assert.equal(rows[0].rules_versions, "rules-one; rules-two");
    assert.equal(rows[1].name, "Historic");
    assert.equal(rows[1].evidence_bases, "vendor_draw_entry");
  });
  await test("snapshot stays identical through contact edits, added agreement and start/page/complete retries", async () => {
    const before = await call("page", { exp: snapshot.export_id, cursor: 0 });
    await db.exec(
      "update qr_bingo_contact_profiles set name='Changed after snapshot' where couple_bd_user_id='101'",
    );
    await accept(103);
    const retry = await call("start", { request: id(3) });
    assert.equal(retry.export_id, snapshot.export_id);
    assert.equal(retry.total, 2);
    assert.deepEqual(
      await call("page", { exp: snapshot.export_id, cursor: 0 }),
      before,
    );
    assert.equal(
      (await call("complete", { exp: snapshot.export_id, count: 2 })).ok,
      true,
    );
    assert.equal(
      (await call("start", { request: id(3) })).export_id,
      snapshot.export_id,
    );
    assert.deepEqual(
      await call("page", { exp: snapshot.export_id, cursor: 0 }),
      before,
    );
  });
  await test("expired/disabled fixture accounts, fixture events, QA markers, archived and excluded evidence never enter the master", async () => {
    await db.exec(
      `insert into app_review_raffle_fixtures values('${
        id(4)
      }','private-fixture','201',false,'2020-01-01','209');
      insert into app_review_raffle_fixture_participants values('${
        id(4)
      }','202');
      insert into qr_bingo_email_test_fixtures values('email-fixture','203',false,'2020-01-01','210');
      insert into qr_bingo_raffle_entries(id,event_key,vendor_bingo_id,vendor_offer_version) values('${
        id(207)
      }','old-event','902','2026-09-01'),('${
        id(208)
      }','old-event','903','2026-09-01');
      insert into qr_bingo_vendor_offer_versions values('old-event','902','2026-09-01',true);
      insert into qr_bingo_legacy_qa_archives values('${id(208)}');`,
    );
    for (const couple of [201, 202, 203, 209, 210, 39077]) await accept(couple);
    await accept(211, "app-review-unknown");
    await accept(212, "email-test-old");
    await accept(204, "private-fixture");
    await accept(205, "email-fixture");
    await accept(206, "event-one", { excluded_from_master: true });
    await accept(207, "old-event", { source_entry_id: id(207) });
    await accept(208, "old-event", { source_entry_id: id(208) });
    const s = await call("start", { request: id(5) });
    assert.equal(s.total, 3);
    assert.deepEqual(
      (await call("page", { exp: s.export_id, cursor: 0 })).rows.map((r) =>
        r.couple_id
      ),
      ["101", "102", "103"],
    );
  });
  await test("cross-admin identities and unexpected request fields fail without accessing the snapshot", async () => {
    assert.equal(
      (await call("start", { request: id(3), actor: "Other Admin" })).code,
      "export_identity_mismatch",
    );
    assert.equal(
      (await call("page", {
        exp: snapshot.export_id,
        cursor: 0,
        actor: "Other Admin",
      })).code,
      "export_unavailable",
    );
    assert.equal(
      (await call("start", { request: id(6), cursor: 0 })).code,
      "invalid_export_request",
    );
  });
  await test("5001-plus rows page without a cap, reject gaps, and release only after the exact complete count", async () => {
    await db.exec(
      "insert into qr_bingo_participation_acceptances(event_key,couple_bd_user_id,rules_version,notice_version,basis,accepted_at,recorded_at,excluded_from_master) select 'bulk-event',i::text,'bulk-rules','bulk-notice','explicit_notice',now(),now(),false from generate_series(10000,15000)i",
    );
    const s = await call("start", { request: id(7) });
    assert.equal(s.total, 5004);
    assert.equal(
      (await call("page", { exp: s.export_id, cursor: 250 })).code,
      "export_page_gap",
    );
    assert.equal(
      (await call("complete", { exp: s.export_id, count: s.total })).code,
      "export_incomplete",
    );
    const all = [];
    let cursor = 0;
    for (;;) {
      const p = await call("page", { exp: s.export_id, cursor });
      assert.equal(p.ok, true);
      all.push(...p.rows.map((r) => r.couple_id));
      if (p.done) break;
      assert.equal(p.next_cursor, cursor + 250);
      cursor = p.next_cursor;
    }
    assert.equal(all.length, s.total);
    assert.equal(new Set(all).size, s.total);
    assert.equal(
      (await call("complete", { exp: s.export_id, count: s.total - 1 })).code,
      "invalid_export_request",
    );
    assert.equal(
      (await call("complete", { exp: s.export_id, count: s.total })).ok,
      true,
    );
  });
  await test("expired snapshots reject retry, purge personal rows, and never release a file", async () => {
    await db.query(
      "update qr_bingo_master_exports set expires_at=now()-interval '1 second' where id=$1",
      [snapshot.export_id],
    );
    const job = await row(
      "select * from cron.job where jobname='weddingwin-qr-master-export-retention'",
    );
    assert.equal(job.schedule, "* * * * *");
    await service(() => db.exec(job.command));
    assert.equal(
      (await row(
        "select count(*)::int n from qr_bingo_master_export_rows where export_id=$1",
        [snapshot.export_id],
      )).n,
      0,
    );
    assert.equal(
      (await call("page", { exp: snapshot.export_id, cursor: 0 })).code,
      "export_expired",
    );
    assert.equal(
      (await call("start", { request: id(3) })).code,
      "export_expired",
    );
    assert.equal(
      (await row(
        "select count(*)::int n from qr_bingo_master_export_rows where export_id=$1",
        [snapshot.export_id],
      )).n,
      0,
    );
  });
  await test("missing snapshot rows and audit failures block completion without marking complete", async () => {
    const s = await call("start", { request: id(8), actor: "Integrity Admin" });
    await db.query(
      "delete from qr_bingo_master_export_rows where export_id=$1 and row_number=1",
      [s.export_id],
    );
    assert.equal(
      (await call("page", {
        exp: s.export_id,
        cursor: 0,
        actor: "Integrity Admin",
      })).code,
      "export_snapshot_incomplete",
    );
    const empty = await call("start", { request: id(9), actor: "Audit Admin" });
    await db.query(
      "update qr_bingo_master_exports set served_through=total where id=$1",
      [empty.export_id],
    );
    await db.exec(
      "revoke insert on qr_bingo_master_export_audit from service_role",
    );
    await assert.rejects(
      call("complete", {
        exp: empty.export_id,
        count: empty.total,
        actor: "Audit Admin",
      }),
      (e) => e.code === "42501",
    );
    assert.equal(
      (await row(
        "select completed_at from qr_bingo_master_exports where id=$1",
        [empty.export_id],
      )).completed_at,
      null,
    );
    await db.exec(
      "grant insert on qr_bingo_master_export_audit to service_role",
    );
  });
  await test("actual privacy erasure invalidates all pending snapshots containing the account and preserves metadata audits", async () => {
    const s = await call("start", { request: id(10), actor: "Privacy Admin" });
    // Ledger remains SELECT/INSERT-only; deletion is the real profile FK cascade.
    await assert.rejects(
      service(() =>
        db.exec(
          "delete from qr_bingo_participation_acceptances where couple_bd_user_id='101'",
        )
      ),
      (e) => e.code === "42501",
    );
    await service(() =>
      db.exec(
        "delete from qr_bingo_contact_profiles where couple_bd_user_id='101'",
      )
    );
    assert.equal(
      (await call("page", {
        exp: s.export_id,
        cursor: 0,
        actor: "Privacy Admin",
      })).code,
      "export_unavailable",
    );
    assert.equal(
      (await row(
        "select count(*)::int n from qr_bingo_master_export_rows where couple_id='101'",
      )).n,
      0,
    );
    assert.ok(
      (await row("select count(*)::int n from qr_bingo_master_export_audit"))
        .n > 0,
    );
  });
  await test("per-operator start limits are enforced while request replays remain available", async () => {
    for (let n = 20; n < 25; n++) {
      assert.equal(
        (await call("start", { request: id(n), actor: "Rate Admin" })).ok,
        true,
      );
    }
    assert.equal(
      (await call("start", { request: id(25), actor: "Rate Admin" })).code,
      "export_rate_limited",
    );
    assert.equal(
      (await call("start", { request: id(20), actor: "Rate Admin" })).ok,
      true,
    );
  });
} finally {
  await db.close();
}
