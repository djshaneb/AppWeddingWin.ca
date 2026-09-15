import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
// Real PostgreSQL execution, isolated in WASM; no network, live accounts or sends.
const db = new PGlite();
// Exercise the deployed settings RPC, both material guards, real acceptance
// audit and immutable offer capture together; no production connections.
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
  await db.exec(migration);
  await db.exec(await read("../supabase/migrations/20260915005744_enforce_vendor_prize_edit_deadline.sql"));
  await db.exec(await read("../supabase/migrations/20260915010928_allow_exact_showday_responsibility_amendment.sql"));
  // The existing authenticated wrapper calls the latest four-argument saver.
  const prizeSource=await read("../supabase/migrations/20260908035734_qr_bingo_single_winner_and_editable_prize.sql");
  function functionBody(source,name,marker){
    const start=source.indexOf(marker||("CREATE OR REPLACE FUNCTION public."+name+"("));
    assert(start>=0);const rest=source.slice(start),tag=rest.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
    return rest.slice(0,rest.indexOf(';',rest.indexOf(tag,rest.indexOf(tag)+tag.length)+tag.length)+1);
  }
  await db.exec(functionBody(prizeSource,"compare_and_update_qr_bingo_vendor_settings"));
  await db.exec(functionBody(offerMigration,"compare_and_update_qr_bingo_vendor_settings","create or replace function public.compare_and_update_qr_bingo_vendor_settings(\n  p_event_key text,\n  p_vendor_bingo_id text,\n  p_expected_updated_at timestamptz,\n  p_patch jsonb,\n  p_authenticated_vendor_bd_user_id text"));
  const prodEvent="niagara-wedding-show-2026",owner="901",name="Meadow & Pine Photography";
  const textFor=async(kind,version)=>(await row("select public.qr_bingo_showday_responsibility_text($1,$2,$3) value",[name,kind,version])).value;
  const oldVendor=await textFor("vendor","previous"),newVendor=await textFor("vendor","current");
  const oldParticipant=await textFor("participant","previous"),newParticipant=await textFor("participant","current");
  async function actor(tx,authority=true,id=owner,source="app",participant=oldParticipant){
    await tx.query("select set_config('request.jwt.claim.role','service_role',true),set_config('request.qr_bingo_authenticated_vendor_bd_user_id',$1,true),set_config('request.qr_bingo_vendor_acceptance_source',$2,true),set_config('request.qr_bingo_vendor_authority_to_bind',$3,true),set_config('request.qr_bingo_participant_responsibility_disclosure',$4,true)",[id,source,String(authority),participant]);
  }
  await asRole("service_role",async tx=>{
    await actor(tx);
    await tx.query(`insert into public.qr_bingo_raffle_settings(
      event_key,vendor_bingo_id,vendor_bd_user_id,vendor_name,enabled,prize_title,prize_description,prize_approx_value_cad,
      legal_terms_accepted,legal_terms_version,legal_terms_accepted_at,rules_viewed_at,official_rules_url,administrator_name,
      co_sponsor_name,prize_provider_name,apple_non_sponsor_acknowledged,vendor_responsibility_acknowledged,
      vendor_responsibility_disclosure_text,vendor_responsibility_acknowledged_at,vendor_responsibility_version,
      participant_responsibility_disclosure_text,entry_closes_at,draw_opens_at,draw_at,eligibility_region,
      odds_basis,no_purchase_required,skill_testing_question_required,alternate_free_entry_url,max_winners,exclude_previous_winners)
      values($1,$2,$2,$3,true,'Original prize','Original prize description',125,true,'2026-09-01-in-person-entry',
      '2026-09-01T12:00Z','2026-09-01T12:00Z','https://www.weddingwin.ca/qr-bingo-vendor-draw-rules','Wedding Win Inc.',
      '',$3,true,true,$4,'2026-09-01T12:00Z','2026-09-01-in-person-entry',$5,$6,$6,$6,'Ontario','Equal chance',true,true,
      'https://www.weddingwin.ca/qr-bingo',1,true)`,[prodEvent,owner,name,oldVendor,oldParticipant,deadline]);
  });
  await insert("qr_bingo_raffle_entries",{id:uuid(902),event_key:prodEvent,vendor_bingo_id:owner,vendor_bd_user_id:owner,couple_bd_user_id:"902",prize_title:"Original prize",prize_description:"Original prize description",prize_approx_value_cad:125,promotion_disclosure_text:oldParticipant,consented_at:offerStamp,consent_version:"2026-09-01-in-person-entry"});
  const previousSettings=await row("select * from qr_bingo_raffle_settings where vendor_bingo_id=$1",[owner]);
  const originalSnapshots=(await db.query("select to_jsonb(o) value from qr_bingo_vendor_offer_versions o where vendor_bingo_id=$1 order by vendor_offer_version",[owner])).rows;
  const originalAudits=(await db.query("select to_jsonb(a) value from qr_bingo_vendor_responsibility_acceptance_audit a where vendor_bingo_id=$1 order by id",[owner])).rows;
  const originalEntries=(await db.query("select to_jsonb(e) value from qr_bingo_raffle_entries e where vendor_bingo_id=$1 order by id",[owner])).rows;
  async function amend(tx,patch={},opts={}){
    const stamp=new Date().toISOString();
    const payload={enabled:true,legal_terms_accepted:true,legal_terms_version:previousSettings.legal_terms_version,
      legal_terms_accepted_at:stamp,rules_viewed_at:stamp,apple_non_sponsor_acknowledged:true,
      vendor_responsibility_acknowledged:true,vendor_responsibility_disclosure_text:newVendor,
      vendor_responsibility_acknowledged_at:stamp,vendor_responsibility_version:previousSettings.legal_terms_version,...patch};
    await actor(tx,true,owner,"app",newParticipant);
    return tx.query("select public.compare_and_update_qr_bingo_vendor_settings($1,$2,$3,$4,$5,$6,$7,$8) result",
      [prodEvent,owner,previousSettings.updated_at,payload,opts.actor??owner,opts.source??"app",opts.authority??true,opts.participant??newParticipant]);
  }
  async function rejectAmend(patch={},opts={},code="55000"){
    await rejected(()=>asRole("service_role",tx=>amend(tx,patch,opts)),code);
  }
  await test("canonical current vendor and participant text exactly match API templates",async()=>{
    const api=await read("../supabase/functions/bd-qr-bingo-sync/index.ts");
    const role=JSON.parse(api.match(/const PLATFORM_ROLE =\s*("[^\n]+?");/)[1]);
    const apple=JSON.parse(api.match(/const APPLE_NON_SPONSOR_DISCLAIMER =\s*("[^\n]+?");/)[1]);
    for(const [func,text] of [["vendorResponsibilityDisclosure",newVendor],["participantResponsibilityDisclosure",newParticipant]]){
      const template=api.match(new RegExp("function "+func+"\\(vendorName: string\\) \\{\\s*return `([^`]+)`;"))[1];
      assert.equal(template.replaceAll("${vendorName}",name).replaceAll("${PLATFORM_ROLE}",role).replaceAll("${APPLE_NON_SPONSOR_DISCLAIMER}",apple),text);
    }
  });
  await test("missing explicit vendor authority and wrong signer/source cannot amend",async()=>{
    await rejectAmend({}, {authority:false},"55000");await rejectAmend({}, {actor:"902"},"42501");await rejectAmend({}, {source:"admin"},"22023");
  });
  await test("old, modified or partially updated disclosure text cannot pass the narrow amendment",async()=>{
    for(const text of [oldVendor,newVendor+" Extra term",newVendor.replace(name,"Another vendor")])await rejectAmend({vendor_responsibility_disclosure_text:text});
    for(const text of [oldParticipant,newParticipant+" Extra term"])await rejectAmend({}, {participant:text});
  });
  await test("all original prize, timing, identity and other obligations stay locked during amendment",async()=>{
    for(const patch of [{prize_title:"Different"},{prize_description:"Different"},{prize_approx_value_cad:999},{entry_closes_at:"2030-01-01T00:00Z"},{eligibility_region:"Anywhere"},{vendor_name:"Other vendor"},{alternate_free_entry_url:"https://www.weddingwin.ca/other"}])await rejectAmend(patch,{},["55000","P0001"]);
  });
  await test("reusing previous review timestamps does not establish fresh acceptance",async()=>{
    await rejectAmend({rules_viewed_at:previousSettings.rules_viewed_at});
    await rejectAmend({legal_terms_accepted_at:previousSettings.legal_terms_accepted_at});
  });
  await test("different published event/rules or synthetic context cannot use the amendment",async()=>{
    for(const sql of ["update qr_bingo_event_configs set event_key='other-show' where published","update qr_bingo_event_configs set rules_version='other-rules' where published"]){
      await temporary(sql,async tx=>{await tx.exec('set local role service_role');await rejected(()=>amend(tx),["55000","23514","P0001"]);});
    }
  });
  await test("acceptance-only amendment works after the prize cutoff without changing any prize",async()=>{
    await temporary("update qr_bingo_event_configs set history_starts_at='2020-10-18T15:00Z' where published",async tx=>{
      await tx.exec('set local role service_role');await amend(tx);
      const current=(await tx.query("select prize_title,prize_description,prize_approx_value_cad from qr_bingo_raffle_settings where vendor_bingo_id=$1",[owner])).rows[0];
      assert.equal(current.prize_title,previousSettings.prize_title);assert.equal(current.prize_approx_value_cad,previousSettings.prize_approx_value_cad);
    });
  });
  let saved;
  await test("actual explicit amendment succeeds with existing entries and activated immutable offers",async()=>{
    await asRole("service_role",async tx=>{const r=await amend(tx);assert.equal(r.rows[0].result.settings.vendor_responsibility_disclosure_text,newVendor);});
    saved=await row("select * from qr_bingo_raffle_settings where vendor_bingo_id=$1",[owner]);
    assert.equal(saved.participant_responsibility_disclosure_text,newParticipant);assert.equal(saved.prize_title,previousSettings.prize_title);
    assert(saved.rules_viewed_at>previousSettings.rules_viewed_at);assert(saved.vendor_responsibility_acknowledged_at>previousSettings.vendor_responsibility_acknowledged_at);
  });
  await test("predicate rejects synthetic ids and unrelated settings even with genuine explicit context",async()=>{
    await asRole("service_role",async tx=>{
      await actor(tx,true,owner,"app",newParticipant);
      const permitted=async(prev,next)=>(await tx.query("select public.qr_bingo_is_showday_responsibility_amendment(jsonb_populate_record(null::qr_bingo_raffle_settings,$1::jsonb),jsonb_populate_record(null::qr_bingo_raffle_settings,$2::jsonb)) allowed",[prev,next])).rows[0].allowed;
      assert.equal(await permitted(previousSettings,saved),true);
      for(const patch of [{synthetic_fixture_setup_id:uuid(999)},{claim_instructions:"Changed claim"},{max_winners:2},{draw_at:"2030-01-01T00:00:00Z"}])assert.equal(await permitted(previousSettings,{...saved,...patch}),false);
      assert.equal(await permitted({...previousSettings,synthetic_fixture_setup_id:uuid(999)},{...saved,synthetic_fixture_setup_id:uuid(999)}),false);
    });
  });
  await test("a fresh immutable offer and authenticated acceptance are appended together",async()=>{
    const offers=(await db.query("select * from qr_bingo_vendor_offer_versions where vendor_bingo_id=$1 order by vendor_offer_version",[owner])).rows;
    const audits=(await db.query("select * from qr_bingo_vendor_responsibility_acceptance_audit where vendor_bingo_id=$1 order by responsibility_accepted_at",[owner])).rows;
    assert.equal(offers.length,originalSnapshots.length+1);assert.equal(audits.length,originalAudits.length+1);
    assert.equal(offers.at(-1).participant_responsibility_disclosure_text,newParticipant);
    assert.equal(audits.at(-1).responsibility_disclosure_text,newVendor);assert.equal(audits.at(-1).authenticated_vendor_bd_user_id,owner);
    assert.equal(audits.at(-1).authority_to_bind_attested,true);assert.equal(audits.at(-1).acceptance_source,"app");
  });
  await test("old offers, legal acceptances and entrant records remain byte-equivalent",async()=>{
    assert.deepEqual((await db.query("select to_jsonb(o) value from qr_bingo_vendor_offer_versions o where vendor_bingo_id=$1 and vendor_offer_version=$2",[owner,previousSettings.updated_at])).rows,originalSnapshots);
    assert.deepEqual((await db.query("select to_jsonb(a) value from qr_bingo_vendor_responsibility_acceptance_audit a where id=$1",[originalAudits[0].value.id])).rows,originalAudits);
    assert.deepEqual((await db.query("select to_jsonb(e) value from qr_bingo_raffle_entries e where vendor_bingo_id=$1 order by id",[owner])).rows,originalEntries);
  });
  await test("the amendment creates no retrospective rewrite path or public RPC grant",async()=>{
    await rejected(()=>asRole("service_role",async tx=>{await actor(tx,true,owner,"app",oldParticipant);return tx.query("update qr_bingo_raffle_settings set participant_responsibility_disclosure_text=$1,vendor_responsibility_disclosure_text=$2 where vendor_bingo_id=$3",[oldParticipant,oldVendor,owner]);}),"55000");
    for(const role of ["anon","authenticated"])assert.equal((await row("select has_function_privilege($1,'public.qr_bingo_is_showday_responsibility_amendment(public.qr_bingo_raffle_settings,public.qr_bingo_raffle_settings)','EXECUTE') permitted",[role])).permitted,false);
  });
  console.log(`${passes} exact responsibility amendment SQL tests passed.`);
} finally { await db.close(); }
