import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Offline PostgreSQL/WASM only. Existing columns come from the checked-in
// read-only schema metadata fixture (no live rows, credentials, or contact PII).
// The audit fixture uses the corresponding entry evidence column types; only
// source_entry_id differs. Existing contact/deletion locks are represented by
// their same advisory keys and an isolated deletion marker.
// Run: node scripts/test-qr-showday-notice-migration.mjs
const db = new PGlite();
const metadata = JSON.parse(await readFile(new URL("./fixtures/qr-reset-schema-columns.json",import.meta.url),"utf8"));
const migration = await readFile(new URL("../supabase/migrations/20260914163331_qr_bingo_participation_acceptance_ledger.sql",import.meta.url),"utf8");
const event="offline-participation", rules="2026-09-01-in-person-entry", notice=rules+"|2026-09-04-pre-scan-draw-consent";
const stamp="2026-09-01T12:00:00Z";
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
let passed=0;
async function test(name,fn){await fn();passed++;console.log("PASS "+name);}
async function row(sql,args=[]){return (await db.query(sql,args)).rows[0];}
async function insert(table,data){const keys=Object.keys(data);return db.query(`insert into ${table} (${keys.join(",")}) values (${keys.map((_,i)=>"$"+(i+1)).join(",")}) returning *`,Object.values(data));}
async function asService(fn){await db.exec("begin; set local role service_role");try{const result=await fn();await db.exec("commit");return result;}catch(error){await db.exec("rollback");throw error;}}
async function accept(couple="702",patch={}){
 const a={published:event,event,couple,rules,notice,version:1,basis:"explicit_notice",revision:15,...patch};
 return asService(async()=> (await row("select record_qr_bingo_participation_acceptance($1,$2,$3,$4,$5,$6,$7,$8) result",[a.published,a.event,a.couple,a.rules,a.notice,a.version,a.basis,a.revision])).result);
}
const profile=(couple,patch={})=>({event_key:event,couple_bd_user_id:couple,name:"Offline Couple "+couple,email:couple+"@example.test",phone:"5550100101",wedding_date:"",wedding_venue:"",version:1,...patch});
const proof=(couple,n,patch={})=>({id:uuid(n),event_key:event,vendor_bingo_id:"901",vendor_bd_user_id:"901",couple_bd_user_id:couple,couple_name:"Offline Couple",couple_email:couple+"@example.test",couple_phone:"5550100101",vendor_offer_version:stamp,consent_version:rules,consent_share_contact:true,contact_share_scope:"named_vendor_draw_administration",consent_text:"Actual named-vendor consent",consented_at:stamp,draw_administration_contact_share_acknowledged:true,draw_administration_contact_share_acknowledged_at:stamp,draw_administration_contact_share_version:rules,draw_administration_contact_share_consent_text:"Share with the named vendor",promotion_responsibility_acknowledged:true,promotion_responsibility_acknowledged_at:stamp,promotion_disclosure_text:"The vendor operates its draw",age_of_majority_attested:true,residency_attested:true,exclusions_attested:true,eligibility_attested_at:stamp,rules_viewed_at:stamp,apple_non_sponsor_acknowledged:true,...patch});
try {
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table deleted_members(id text primary key);create function lock_active_qr_bingo_contact_member(member text) returns void language plpgsql security definer set search_path='' as $$begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-contact-member:'||member,0));if exists(select 1 from public.deleted_members where id=member) then raise exception using errcode='42501',message='Deleted account';end if;end;$$;");
 const tables=["app_review_raffle_fixtures","qr_bingo_email_test_fixtures","qr_bingo_contact_profiles","qr_bingo_event_configs","qr_bingo_legacy_qa_archives","qr_bingo_raffle_entries","qr_bingo_vendor_offer_versions"];
 for(const table of tables){
  const fields=metadata.filter(c=>c.table_name===table).map(c=>`"${c.column_name}" ${c.data_type==='ARRAY'?c.udt_name.slice(1)+'[]':c.data_type}${c.column_default&&!c.column_default.includes('nextval(')?' default '+c.column_default:''}`);
  await db.exec(`create table ${table} (${fields.join(',')});alter table ${table} enable row level security;`);
 }
 await db.exec("alter table qr_bingo_raffle_entries add primary key(id),add column card_reset_at timestamptz;alter table qr_bingo_contact_profiles add primary key(event_key,couple_bd_user_id);create table app_review_raffle_fixture_participants(fixture_id uuid,couple_bd_user_id text);create table qr_bingo_entrant_consent_acceptance_audit as select * from qr_bingo_raffle_entries where false;alter table qr_bingo_entrant_consent_acceptance_audit rename column id to entry_id;grant select on all tables in schema public to service_role;grant insert,update,delete on qr_bingo_contact_profiles,qr_bingo_raffle_entries to service_role;");
 await insert("qr_bingo_event_configs",{id:uuid(1),event_key:event,revision:15,published:true,rules_version:rules});
 await insert("qr_bingo_vendor_offer_versions",{event_key:event,vendor_bingo_id:"901",vendor_bd_user_id:"901",vendor_offer_version:stamp,activation_excluded_as_legacy_qa:false});
 for(const couple of ["701","702","703","704","705","706","707","708","709"]) await insert("qr_bingo_contact_profiles",profile(couple));
 await insert("qr_bingo_raffle_entries",proof("701",101));
 await insert("qr_bingo_raffle_entries",proof("703",103,{consent_share_contact:false}));
 const audit=proof("703",103,{consent_version:"2026-08-30-contact-share",draw_administration_contact_share_version:"2026-08-30-contact-share",consented_at:"2026-08-30T12:00:00Z"});audit.entry_id=audit.id;delete audit.id;
 await insert("qr_bingo_entrant_consent_acceptance_audit",audit);
 await insert("qr_bingo_raffle_entries",proof("704",104));
 await insert("qr_bingo_legacy_qa_archives",{entry_id:uuid(104)});
 await insert("app_review_raffle_fixtures",{id:uuid(200),event_key:"app-review-offline",couple_bd_user_id:"705",vendor_bd_user_id:"905",enabled:true,expires_at:new Date(Date.now()+3600000).toISOString()});
 await insert("qr_bingo_raffle_entries",proof("705",105));
 await insert("qr_bingo_raffle_entries",proof("706",106,{draw_administration_contact_share_acknowledged:false}));
 await db.exec(migration);
 await accept("702");
 await accept("706",{basis:"cached_notice"});
 await accept("708",{basis:"notice_on_use"});
 const baseline=(await db.query("select to_jsonb(a) data from qr_bingo_participation_acceptances a order by id")).rows;
 const baselineIds=baseline.map(r=>r.data.id);
 const nextNotice=rules+"|2026-09-14-showday-prize-lock";
 const acceptNew=(couple="702",patch={})=>accept(couple,{notice:nextNotice,...patch});
 const newMigration=await readFile(new URL("../supabase/migrations/20260915010147_require_explicit_showday_prize_notice.sql",import.meta.url),"utf8");
 await db.exec(newMigration);
 await test("migration preserves historical named-vendor, explicit, cached and on-use receipts",async()=>{
  assert.deepEqual((await db.query("select to_jsonb(a) data from qr_bingo_participation_acceptances a order by id")).rows,baseline);
  assert.equal((await row("select count(*)::int n from qr_bingo_participation_acceptances where notice_version=$1",[nextNotice])).n,0);
 });
 await test("stale notice requests cannot extend the old ledger after cutover",async()=>{
  for(const basis of ["explicit_notice","cached_notice","notice_on_use"]){
   assert.equal((await accept("702",{basis})).code,"participation_agreement_stale");
   assert.equal((await accept("709",{basis})).code,"participation_agreement_stale");
  }
 });
 await test("old explicit or vendor-entry evidence cannot imply new first acceptance",async()=>{
  for(const couple of ["701","702","703","704","706","708","709"]){
   for(const basis of ["cached_notice","notice_on_use"])
    assert.equal((await acceptNew(couple,{basis})).code,"participation_notice_required");
  }
  assert.equal((await row("select count(*)::int n from qr_bingo_participation_acceptances where notice_version=$1",[nextNotice])).n,0);
 });
 let current;
 await test("new explicit acceptance creates a separate truthful version with server time",async()=>{
  const before=Date.now();current=(await acceptNew()).receipt;
  assert.equal(current.notice_version,nextNotice);assert.equal(current.basis,"explicit_notice");
  assert.equal(current.rules_version,rules);assert(Date.parse(current.accepted_at)>=before-1000);
  assert.equal((await row("select count(*)::int n from qr_bingo_participation_acceptances where couple_bd_user_id='702'")).n,2);
 });
 await test("cache, on-use and explicit retries return the same actual receipt without changing time or basis",async()=>{
  for(const basis of ["cached_notice","notice_on_use","explicit_notice"]){
   const result=await acceptNew("702",{basis});assert.equal(result.ok,true);assert.deepEqual(result.receipt,current);
  }
 });
 await test("new acceptance cannot be copied across account or profile event",async()=>{
  assert.equal((await acceptNew("709",{basis:"cached_notice"})).code,"participation_notice_required");
  assert.equal((await acceptNew("702",{event:"app-review-offline",basis:"cached_notice"})).code,"participation_agreement_stale");
 });
 await test("stale event, rules and revision still require reload",async()=>{
  for(const patch of [{published:"other"},{rules:"old"},{revision:14},{notice:notice}])assert.equal((await acceptNew("702",patch)).code,"participation_agreement_stale");
 });
 await test("existing receipt does not bypass contact version and deletion checks",async()=>{
  assert.equal((await acceptNew("702",{basis:"cached_notice",version:9})).code,"participation_profile_changed");
  await db.exec("insert into deleted_members values('702')");
  await assert.rejects(()=>acceptNew("702",{basis:"cached_notice"}),e=>e.code==='42501');
  await db.exec("delete from deleted_members where id='702'");
 });
 await test("direct service inserts cannot forge a new cached or on-use receipt",async()=>{
  for(const basis of ["cached_notice","notice_on_use"]){
   await assert.rejects(()=>asService(()=>db.query(`insert into qr_bingo_participation_acceptances
     (event_key,couple_bd_user_id,rules_version,notice_version,basis,accepted_at,profile_event_key,profile_couple_bd_user_id,contact_profile_version)
     values($1,'709',$2,$3,$4,clock_timestamp(),$1,'709',1)`,[event,rules,nextNotice,basis])),e=>e.code==='23514');
  }
 });
 await test("isolated fixture also requires explicit new acceptance and remains excluded",async()=>{
  await insert("qr_bingo_contact_profiles",profile("705",{event_key:"app-review-offline"}));
  assert.equal((await acceptNew("705",{event:"app-review-offline",basis:"cached_notice"})).code,"participation_notice_required");
  const result=await acceptNew("705",{event:"app-review-offline"});assert.equal(result.ok,true);assert.equal(result.receipt.excluded_from_master,true);assert.equal(result.receipt.basis,"explicit_notice");
 });
 await test("clients cannot call the RPC or read receipts and service cannot rewrite consent",async()=>{
  for(const role of ["anon","authenticated"]){
   assert.equal((await row("select has_function_privilege($1,'record_qr_bingo_participation_acceptance(text,text,text,text,text,bigint,text,bigint)','EXECUTE') permitted",[role])).permitted,false);
   assert.equal((await row("select has_table_privilege($1,'qr_bingo_participation_acceptances','SELECT') permitted",[role])).permitted,false);
  }
  assert.equal((await row("select has_table_privilege('service_role','qr_bingo_participation_acceptances','UPDATE') permitted")).permitted,false);
 });
 await test("all original receipt bytes, identifiers, versions and timestamps remain unchanged",async()=>{
  assert.deepEqual((await db.query("select to_jsonb(a) data from qr_bingo_participation_acceptances a where id=any($1::uuid[]) order by id",[baselineIds])).rows,baseline);
 });
 console.log(`${passed} show-day notice SQL tests passed.`);
} finally { await db.close(); }
