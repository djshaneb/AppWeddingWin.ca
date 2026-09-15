import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const sql = await readFile(new URL('../supabase/migrations/20260915223013_add_nonbinding_review_draw_mode.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row = async(q,p=[]) => (await db.query(q,p)).rows[0];
const rpc = async(name,args=[]) => (await row(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).result;
async function service(fn) { await db.exec('begin; set local role service_role'); try { const r=await fn();await db.exec('commit');return r; } catch(e){await db.exec('rollback');throw e;} }
const action = (member,verb,generation=null,payload={}) => service(()=>rpc('perform_weddingwin_review_draw_action',[member,verb,generation,JSON.stringify(payload)]));
const context = member => action(member,'review_draw_context');
const notice = (member,noticeId) => service(()=>rpc('read_weddingwin_review_draw_notice',[member,noticeId]));
let passes=0;
async function test(name,fn){ await fn();console.log('PASS '+name);passes++; }
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table bd_users_cache(user_id text primary key);
 insert into bd_users_cache values('901'),('902'),('903'),('904'),('905'),('906'),('38970'),('38971');
 create table qr_bingo_raffle_entries(id int);insert into qr_bingo_raffle_entries values(1);
 create table qr_bingo_raffle_draws(id int);insert into qr_bingo_raffle_draws values(1);
 create table qr_bingo_draw_email_deliveries(id int);insert into qr_bingo_draw_email_deliveries values(1);
 create table qr_bingo_participation_receipts(id int);insert into qr_bingo_participation_receipts values(1);
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
 await db.exec(sql);
 const seed = (fixture,couple,vendor) => service(()=>db.query(`insert into review_draw_fixtures(id,couple_id,vendor_id,couple_name,vendor_name,prize_title,prize_description,active,expires_at,operator_note) values($1,$2,$3,'Review Couple','Review Vendor','Sample consultation','Fictional test only',true,clock_timestamp()+interval '30 days','Approved isolated testing')`,[fixture,couple,vendor]));
 await seed(id(1),'901','902');await seed(id(2),'903','904');
 await test('service-only RLS tables and invoker RPCs',async()=>{
  for(const table of ['review_draw_fixtures','review_draw_state','review_draw_notices']){
   assert.equal((await row('select relrowsecurity value from pg_class where oid=$1::regclass',[table])).value,true);
   for(const role of ['anon','authenticated'])assert.equal((await row("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') value",[role,table])).value,false);
  }
  assert.equal((await row("select count(*)::int n from pg_proc where proname like '%weddingwin_review_draw%' and prosecdef")).n,0);
  await db.exec('begin;set local role authenticated');await assert.rejects(rpc('perform_weddingwin_review_draw_action',['901','review_draw_context',null,'{}']),/permission denied/);await db.exec('rollback');
 });
 await test('ordinary account has no mode, cannot mutate or receive fictional access',async()=>{
  assert.deepEqual(await context('905'),{ok:true,review_mode:null});
  assert.deepEqual(await action('905','scan'),{ok:true,review_mode:null});
  assert.equal((await action('905','review_draw_enable',1,{enabled:true})).code,'review_unavailable');
 });
 await test('pair identity cannot overlap or reuse screenshot identities',async()=>{
  await assert.rejects(seed(id(3),'905','901'),/only one isolated pair/);
  await assert.rejects(seed(id(3),'38971','906'),/check constraint/);
  await assert.rejects(service(()=>db.query("update review_draw_fixtures set vendor_id='906' where id=$1",[id(1)])),/immutable/);
 });
 await test('context is sanitized, starts at generation one, and blocks production actions',async()=>{
  const c=await context('901');assert.equal(c.review_mode,'nonbinding_draw_v1');assert.equal(c.review_state.generation,1);
  assert.equal(c.review_state.role,'couple');assert.equal(c.review_state.skill_question_prompt,'What is 3 × 4?');
  assert.equal(c.review_state.test_notice_id,null);assert(!('operator_note' in c.review_state));assert(!('legal_terms_accepted' in c.review_state));
  assert.equal((await action('901','raffle_opt_in',1)).code,'review_action_required');
  assert.equal((await context('902')).review_state.role,'vendor');
 });
 await test('role boundaries, exact sample vendor and required generation',async()=>{
  assert.equal((await action('901','review_draw_enable',1,{enabled:true})).code,'review_role_required');
  assert.equal((await action('901','review_draw_reset',1)).code,'review_role_required');
  assert.equal((await action('902','review_draw_scan',1,{vendor_id:'902'})).code,'review_role_required');
  assert.equal((await action('901','review_draw_scan',1,{vendor_id:'904'})).code,'review_vendor_mismatch');
  assert.equal((await action('902','review_draw_enable',null,{enabled:true})).code,'review_generation_changed');
 });
 await test('No records only sample scan; Yes requires enabled draw and scan',async()=>{
  assert.equal((await action('901','review_draw_entry',1,{enter:true})).code,'review_scan_required');
  await action('902','review_draw_enable',1,{enabled:true});
  assert.equal((await action('901','review_draw_entry',1,{enter:true})).code,'review_scan_required');
  await action('901','review_draw_scan',1,{vendor_id:'902'});
  const c=await action('901','review_draw_entry',1,{enter:false});assert.equal(c.review_state.scanned,true);assert.equal(c.review_state.entered,false);
 });
 await test('Yes replay is idempotent; later No preserves existing simulated entry',async()=>{
  await action('901','review_draw_entry',1,{enter:true});await action('901','review_draw_entry',1,{enter:true});
  assert.equal((await action('901','review_draw_entry',1,{enter:false})).review_state.entered,true);
  assert.equal((await row('select count(*)::int n from review_draw_state where fixture_id=$1',[id(1)])).n,1);
 });
 await test('Select is idempotent and verification is explicitly simulated',async()=>{
  const selected=await action('902','review_draw_select',1);const repeated=await action('902','review_draw_select',1);
  assert.equal(selected.review_state.draw_id,repeated.review_state.draw_id);
  assert.equal(selected.review_state.selection_status,'potential');
  assert.equal((await action('902','review_draw_send',1)).code,'review_verification_required');
  assert.equal((await action('902','review_draw_verify',1,{checks_confirmed:true,skill_answer:'11'})).code,'review_checks_required');
  assert.equal((await action('902','review_draw_verify',1,{checks_confirmed:false,skill_answer:'12'})).code,'review_checks_required');
  const verified=await action('902','review_draw_verify',1,{checks_confirmed:true,skill_answer:'12'});assert.equal(verified.review_state.selection_status,'verified');
 });
 await test('notice creation requires explicit Send; Send replays create exactly two test notices',async()=>{
  const current=(await context('902')).review_state;
  await assert.rejects(service(()=>db.query(`insert into review_draw_notices(fixture_id,generation,draw_id,channel,recipient_member_id) values($1,1,$2,'couple','901')`,[id(1),current.draw_id])),/explicit verified review Send/);
  const first=await action('902','review_draw_send',1);const replay=await action('902','review_draw_send',1);
  assert.equal(first.review_state.test_notice_id,replay.review_state.test_notice_id);
  assert.equal((await row('select count(*)::int n from review_draw_notices')).n,2);
  assert.equal((await context('901')).review_state.test_notice_at,first.review_state.test_notice_at);
 });
 let oldNotice=(await context('901')).review_state.test_notice_id;
 await test('result authenticates recipient, active pair, current generation and verified selection',async()=>{
  const r=await notice('901',oldNotice);assert.equal(r.review_mode,'nonbinding_draw_v1');assert.equal(r.viewer_role,'couple');assert.equal(r.review_state.entered,true);
  assert.equal(await notice('902',oldNotice),null);assert.equal(await notice('903',oldNotice),null);assert.equal(await notice('905',oldNotice),null);
 });
 await test('reset advances generation, invalidates old result and fences stale action replay',async()=>{
  const reset=await action('902','review_draw_reset',1);assert.equal(reset.review_state.generation,2);
  for(const k of ['enabled','entered','scanned'])assert.equal(reset.review_state[k],false);
  assert.equal(reset.review_state.draw_id,null);assert.equal(reset.review_state.test_notice_id,null);
  assert.equal(await notice('901',oldNotice),null);
  assert.equal((await action('902','review_draw_send',1)).code,'review_generation_changed');
  assert.equal((await action('902','review_draw_reset',1)).code,'review_generation_changed');
  assert.equal((await row('select count(*)::int n from review_draw_notices')).n,2);
 });
 await test('disabled and expired pairs remain blocked rather than becoming production accounts',async()=>{
  await db.query('update review_draw_fixtures set active=false where id=$1',[id(1)]);
  assert.equal((await context('901')).code,'review_expired');assert.equal((await action('901','scan')).code,'review_expired');
  await db.query("update review_draw_fixtures set active=true,expires_at=created_at+interval '1 microsecond' where id=$1",[id(1)]);
  assert.equal((await action('902','review_draw_reset',2)).code,'review_expired');assert.equal(await notice('901',oldNotice),null);
 });
 await test('no production entry, winner, consent or email-delivery records changed',async()=>{
  for(const table of ['qr_bingo_raffle_entries','qr_bingo_raffle_draws','qr_bingo_draw_email_deliveries','qr_bingo_participation_receipts'])assert.equal((await row(`select count(*)::int n from ${table}`)).n,1);
 });
 await test('account deletion cascades isolated state and notices, preserving unrelated pair',async()=>{
  await db.query("delete from bd_users_cache where user_id='901'");
  assert.equal((await row('select count(*)::int n from review_draw_fixtures where id=$1',[id(1)])).n,0);
  assert.equal((await row('select count(*)::int n from review_draw_state where fixture_id=$1',[id(1)])).n,0);
  assert.equal((await row('select count(*)::int n from review_draw_notices where fixture_id=$1',[id(1)])).n,0);
  assert.equal((await context('903')).review_state.generation,1);
 });
 console.log(`${passes} isolated review draw SQL tests passed`);
} catch (error) { console.error({message:error.message,code:error.code,position:error.position,where:error.where});process.exitCode=1; } finally { await db.close(); }
