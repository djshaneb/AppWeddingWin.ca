import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Offline PostgreSQL/WASM only. Existing columns come from the checked-in
// read-only schema metadata fixture (no live rows, credentials, or contact PII).
// The audit fixture uses the corresponding entry evidence column types; only
// source_entry_id differs. Existing contact/deletion locks are represented by
// their same advisory keys and an isolated deletion marker.
// Run: node scripts/test-qr-participation-migration.mjs
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
 await test("backfill requires real named-vendor consent; saved-only profiles and QA do not qualify",async()=>{
  const rows=(await db.query("select couple_bd_user_id,notice_version,basis from qr_bingo_participation_acceptances order by couple_bd_user_id")).rows;
  assert.deepEqual(rows,[{couple_bd_user_id:"701",notice_version:"",basis:"vendor_draw_entry"},{couple_bd_user_id:"703",notice_version:"",basis:"vendor_draw_entry"}]);
 });
 await test("historical immutable consent retains its true version and timestamp",async()=>{
  const r=await row("select rules_version,accepted_at::text from qr_bingo_participation_acceptances where couple_bd_user_id='703'");assert.equal(r.rules_version,"2026-08-30-contact-share");assert.equal(Date.parse(r.accepted_at),Date.parse("2026-08-30T12:00:00Z"));
 });
 await test("actual service role records a zero-scan zero-entry couple using SELECT-only config permissions",async()=>{
  const result=await accept();assert.equal(result.ok,true);assert.equal(result.receipt.basis,"explicit_notice");assert.equal(result.receipt.excluded_from_master,false);
  assert.equal((await row("select count(*)::int n from qr_bingo_raffle_entries where couple_bd_user_id='702'")).n,0);
  assert.equal((await row("select has_table_privilege('service_role','qr_bingo_event_configs','UPDATE') allowed")).allowed,false);
 });
 await test("retries and cached uploads keep one immutable receipt and its original acceptance time",async()=>{
  const first=(await accept()).receipt;const again=(await accept("702",{basis:"cached_notice"})).receipt;assert.equal(first.id,again.id);assert.equal(first.accepted_at,again.accepted_at);assert.equal(again.basis,"explicit_notice");
 });
 await test("current event rules notice and revision are checked in the database",async()=>{
  for(const patch of [{published:"different"},{rules:"old"},{notice:"old"},{revision:14},{event:"unknown-event"}])assert.equal((await accept("702",patch)).code,"participation_agreement_stale");
 });
 await test("profile version races and incomplete contact details cannot record acceptance",async()=>{
  assert.equal((await accept("702",{version:9})).code,"participation_profile_changed");
  await db.exec("update qr_bingo_contact_profiles set phone='' where couple_bd_user_id='707'");assert.equal((await accept("707")).code,"profile_incomplete");
  assert.equal((await row("select count(*)::int n from qr_bingo_participation_acceptances where couple_bd_user_id='707'")).n,0);
 });
 await test("current isolated fixture receipt is genuine and excluded; expired fixture is rejected",async()=>{
  await insert("qr_bingo_contact_profiles",profile("705",{event_key:"app-review-offline"}));
  const result=await accept("705",{event:"app-review-offline"});assert.equal(result.ok,true);assert.equal(result.receipt.excluded_from_master,true);
  await db.exec("update app_review_raffle_fixtures set expires_at=clock_timestamp()-interval '1 second'");
  assert.equal((await accept("705",{event:"app-review-offline"})).code,"participation_agreement_stale");
 });
 await test("known fixture accounts remain excluded when disabled even in a production event",async()=>{
  await db.exec("update app_review_raffle_fixtures set enabled=false");assert.equal((await accept("705")).receipt.excluded_from_master,true);
 });
 await test("documented ordinary QA is excluded only from reporting, with no fixture authorization",async()=>{
  assert.equal((await row("select qr_bingo_participation_is_test($1,'39077') excluded",[event])).excluded,true);
  assert.equal((await row("select count(*)::int n from app_review_raffle_fixtures where couple_bd_user_id='39077'")).n,0);
  for(const role of ["anon","authenticated","service_role"])assert.equal((await row("select has_table_privilege($1,'qr_bingo_participation_test_accounts','INSERT') allowed",[role])).allowed,false);
 });
 await test("validated legacy entry insertion captures separately labelled evidence automatically",async()=>{
  await asService(()=>insert("qr_bingo_raffle_entries",proof("708",108)));const r=await row("select basis,notice_version from qr_bingo_participation_acceptances where couple_bd_user_id='708'");assert.deepEqual(r,{basis:"vendor_draw_entry",notice_version:""});
 });
 await test("card reset and admin list removal preserve agreement without reacceptance",async()=>{
  const before=(await row("select count(*)::int n from qr_bingo_participation_acceptances")).n;
  await db.exec("update qr_bingo_raffle_entries set card_reset_at=clock_timestamp() where couple_bd_user_id='701';update qr_bingo_contact_profiles set admin_removed_at=clock_timestamp() where couple_bd_user_id='702'");
  assert.equal((await row("select count(*)::int n from qr_bingo_participation_acceptances")).n,before);
 });
 await test("actual profile privacy deletion cascades newly recorded agreement",async()=>{
  await accept("709");await asService(()=>db.exec("delete from qr_bingo_contact_profiles where couple_bd_user_id='709'"));assert.equal((await row("select count(*)::int n from qr_bingo_participation_acceptances where couple_bd_user_id='709'")).n,0);
 });
 await test("actual entry privacy deletion cascades historical agreement evidence",async()=>{
  await asService(()=>db.exec("delete from qr_bingo_raffle_entries where couple_bd_user_id='708'"));assert.equal((await row("select count(*)::int n from qr_bingo_participation_acceptances where couple_bd_user_id='708'")).n,0);
 });
 await test("deleted-account lock prevents agreement resurrection",async()=>{
  await insert("deleted_members",{id:"702"});await assert.rejects(()=>accept(),e=>e.code==="42501");
 });
 await test("ledger is RLS protected with no public/authenticated access or mutable service receipt grants",async()=>{
  const state=await row("select relrowsecurity enabled from pg_class where oid='qr_bingo_participation_acceptances'::regclass");assert.equal(state.enabled,true);
  for(const role of ["anon","authenticated"]){assert.equal((await row("select has_table_privilege($1,'qr_bingo_participation_acceptances','SELECT') allowed",[role])).allowed,false);assert.equal((await row("select has_function_privilege($1,'record_qr_bingo_participation_acceptance(text,text,text,text,text,bigint,text,bigint)','EXECUTE') allowed",[role])).allowed,false);}
  for(const permission of ["UPDATE","DELETE"])assert.equal((await row("select has_table_privilege('service_role','qr_bingo_participation_acceptances',$1) allowed",[permission])).allowed,false);
 });
 console.log(`Participation migration: ${passed} tests passed.`);
} finally {await db.close();}
