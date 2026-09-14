import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
// Offline real PostgreSQL/WASM with synthetic rows. Current email finalizer and
// skill-proof SQL are catalog snapshots, never production rows or credentials.
// Run: node scripts/test-notification-events-migration.mjs
const db=new PGlite();
const sql=await readFile(new URL('../supabase/migrations/20260914190037_durable_member_notifications.sql',import.meta.url),'utf8');
const load=p=>readFile(new URL(p,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=async(q,p=[]) => (await db.query(q,p)).rows[0];
let passes=0;async function test(n,fn){await fn();console.log('PASS '+n);passes++;}
async function service(fn){await db.exec("begin; set local role service_role; set local request.jwt.claim.role='service_role'");try{const r=await fn();await db.exec('commit');return r;}catch(e){await db.exec('rollback');throw e;}}
const rpc=async(name,args=[]) => (await row(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).result;
try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth to service_role;
create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table bd_users_cache(user_id text primary key,token text);
create table qr_bingo_raffle_settings(event_key text,vendor_bingo_id text,vendor_bd_user_id text,draw_generation bigint default0);
create table qr_bingo_raffle_entries(id uuid primary key,event_key text,vendor_bd_user_id text,couple_bd_user_id text,card_generation bigint default0,card_reset_at timestamptz);
create table qr_bingo_raffle_draws(id uuid primary key,event_key text,vendor_bingo_id text,vendor_bd_user_id text,couple_bd_user_id text,entry_id uuid references qr_bingo_raffle_entries,draw_generation bigint default0,entry_card_generation bigint default0,vendor_name text,prize_title text,prize_description text,prize_approx_value_cad numeric,claim_instructions text,official_rules_url text,apple_non_sponsor_disclaimer text,drawn_at timestamptz default now(),selection_status text,eligibility_verified_at timestamptz,verified_at timestamptz,skill_question_verified_at timestamptz,skill_question_vendor_attested_at timestamptz,skill_question_vendor_attested_by text,verified_by text,skill_question_vendor_attestation text,winner_rules_confirmed_at timestamptz,verification_notes text,vendor_email_sent_at timestamptz,couple_email_sent_at timestamptz);
create table qr_bingo_draw_email_deliveries(id uuid primary key default gen_random_uuid(),draw_id uuid references qr_bingo_raffle_draws,channel text,delivery_key text unique,status text,claim_token uuid,claim_expires_at timestamptz,attempt_count integer default0,sent_at timestamptz,provider_message_id text,last_error text,updated_at timestamptz,prize_snapshot jsonb);
create table qr_bingo_participation_test_accounts(couple_bd_user_id text);
create table app_review_raffle_fixtures(event_key text,couple_bd_user_id text,vendor_bd_user_id text);
create table app_review_raffle_fixture_participants(couple_bd_user_id text);
create table qr_bingo_email_test_fixtures(event_key text,couple_bd_user_id text,vendor_bd_user_id text);
`.replaceAll('default0','default 0'));
for(const f of ['20260517024733_create_app_push_tokens.sql','20260828190234_track_expo_push_delivery.sql','20260828211801_harden_push_sweep_leasing_retry.sql','20260828214927_harden_expo_push_retry_backoff.sql']){let prior=await load('../supabase/migrations/'+f);if(f==='20260828211801_harden_push_sweep_leasing_retry.sql')prior=prior.slice(0,prior.indexOf('create or replace function public.count_weddingwin_unsynced_native_unread'));await db.exec(prior);}
const helpers=await load('./fixtures/qr-reset-live-helpers.sql');await db.exec(helpers.match(/CREATE OR REPLACE FUNCTION public\.qr_bingo_skill_verification_complete[\s\S]*?\$function\$\s*;/)[0]);
const ledger=await load('../supabase/migrations/20260914163331_qr_bingo_participation_acceptance_ledger.sql');await db.exec(ledger.match(/create function public\.qr_bingo_participation_is_test[\s\S]*?\$\$;/)[0]);
await db.exec(await load('./fixtures/notification-email-finalizer.sql'));
await db.exec('grant select,insert,update,delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role; alter default privileges in schema public grant all on tables to anon,authenticated,service_role;');
await db.exec(sql);
await db.exec("insert into bd_users_cache values('101','session101'),('102','session102'),('103','session103'),('104','session104');");
await test('new tables revoke inherited public grants and RPCs stay invoker',async()=>{
 for(const name of ['app_notification_events','app_notification_deliveries','app_notification_event_aliases','app_notification_member_baselines']){
 assert.equal((await row("select relrowsecurity value from pg_class where oid=$1::regclass",[name])).value,true);
 for(const role of ['anon','authenticated'])assert.equal((await row("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') value",[role,name])).value,false);
 }
 assert.equal((await row("select count(*)::int n from pg_proc where proname like '%weddingwin_notification%' and prosecdef")).n,0);
});
const register=(member,token,previous=null)=>service(()=>rpc('register_weddingwin_push_token',[member,'session'+member,`ExpoPushToken[${token}]`,'ios',previous?`ExpoPushToken[${previous}]`:null]));
let a=await register('101','A'),b=await register('102','B');
await test('registration refresh preserves watermark; rollover retires exact same-session device only',async()=>{
 const before=await row('select registration_eligible_at from app_push_tokens where id=$1',[a.device_id]);
 await register('101','A');assert.deepEqual(await row('select registration_eligible_at from app_push_tokens where id=$1',[a.device_id]),before);
 const c=await register('101','C','B');assert.equal((await row('select enabled from app_push_tokens where id=$1',[b.device_id])).enabled,true);
 a=await register('101','A','C');assert.equal((await row('select enabled from app_push_tokens where id=$1',[c.device_id])).enabled,false);
 await assert.rejects(service(()=>rpc('register_weddingwin_push_token',['101','wrong','ExpoPushToken[X]','ios',null])),/Native session expired/);
});
const started=new Date().toISOString();
const event=(n,extra={})=>({event_key:'chat:101:bd:'+n,sender_member_id:'102',thread_token:'thread1',occurred_at:new Date().toISOString(),eligible:true,aliases:['chat:101:bd:'+n],thread_aliases:['thread1'],...extra});
const snapshot=events=>service(()=>rpc('record_weddingwin_notification_snapshot',['101',JSON.stringify(events),true,started]));
await test('incomplete snapshot makes no baseline or event mutation',async()=>{
 await assert.rejects(service(()=>rpc('record_weddingwin_notification_snapshot',['101','[]',false,started])),/complete bounded/);
 assert.equal((await row('select count(*)::int n from app_notification_member_baselines')).n,0);
});
await test('first complete snapshot atomically records all history and never enqueues backlog',async()=>{
 const r=await snapshot([event(1),event(2,{sender_member_id:null,eligible:false})]);assert.equal(r.baseline_created,true);assert.equal(r.events_created,2);assert.equal(r.deliveries_created,0);
});
await test('new unread identity enqueues once, even when unread count would stay equal',async()=>{
 const r=await snapshot([event(1),event(3)]);assert.equal(r.deliveries_created,1);assert.equal((await snapshot([event(3)])).deliveries_created,0);
});
await test('late historical identity and ineligible rows are remembered without replay',async()=>{
 assert.equal((await snapshot([event(4,{occurred_at:new Date(Date.now()-3600000).toISOString()}),event(5,{eligible:false})])).deliveries_created,0);
 assert.equal((await snapshot([event(5)])).deliveries_created,0);
});
await test('malformed required fields and conflicting sender recipient or route roll back atomically',async()=>{
 const invalid=[event(3,{sender_member_id:'103'}),event(3,{aliases:['chat:104:bd:3']}),event(3,{thread_token:'different',thread_aliases:['different']})];
 for(const key of ['eligible','thread_aliases']){const e=event(8);delete e[key];invalid.push(e);}
 const before=await row('select count(*)::int n from app_notification_events');
 for(const e of invalid)await assert.rejects(snapshot([e]),/Invalid notification|Notification alias identity conflict/);
 assert.deepEqual(await row('select count(*)::int n from app_notification_events'),before);
});
await test('late validated native alias and changed canonical thread reuse existing event',async()=>{
 const r=await snapshot([event(3,{event_key:'chat:101:native:'+id(3),thread_token:'app:'+id(77),thread_aliases:['thread1','app:'+id(77)],aliases:['chat:101:bd:3','chat:101:native:'+id(3)]})]);assert.equal(r.events_created,0);assert.equal(r.deliveries_created,0);
 assert.equal((await row("select thread_token from app_notification_events where event_key='chat:101:bd:3'")).thread_token,'app:'+id(77));
});
const claimToken=id(700);
async function lease(device){await db.query('update app_push_tokens set push_claim_token=$2,push_claim_expires_at=clock_timestamp()+interval \'10 minutes\' where id=$1',[device.device_id,claimToken]);}
const claim=()=>service(()=>rpc('claim_weddingwin_notification_deliveries',[a.device_id,a.registration_generation,claimToken,20]));
let delivery;
await test('device lease required; claim and durable begin isolate ambiguous transport',async()=>{
 assert.deepEqual(await claim(),[]);await lease(a);delivery=(await claim())[0];assert.equal(delivery.status,'claimed');assert.equal(await service(()=>rpc('begin_weddingwin_notification_delivery',[delivery.id,claimToken])),true);
 assert.equal((await row('select status,attempt_count from app_notification_deliveries where id=$1',[delivery.id])).status,'ambiguous');
 await db.query("update app_notification_deliveries set claim_expires_at=clock_timestamp()-interval '1 second' where id=$1",[delivery.id]);assert.deepEqual(await claim(),[]);
 await db.query("update app_notification_deliveries set claim_expires_at=clock_timestamp()+interval '10 minutes' where id=$1",[delivery.id]);
});
await test('accepted ticket waits for receipt; finalization replay is idempotent and never resends',async()=>{
 const args=[delivery.id,claimToken,'ticketed','expo-ticket-1',null,null];assert.equal(await service(()=>rpc('finalize_weddingwin_notification_delivery',args)),true);assert.equal(await service(()=>rpc('finalize_weddingwin_notification_delivery',args)),true);assert.deepEqual(await claim(),[]);
 await db.query("update app_notification_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[delivery.id]);assert.equal((await claim())[0].status,'ticketed');
 assert.equal(await service(()=>rpc('finalize_weddingwin_notification_delivery',[delivery.id,claimToken,'delivered',null,null,null])),true);
});
await test('definitive receipt rejection permits bounded retry; unknown receipt expires ambiguous',async()=>{
 await snapshot([event(6)]);let q=(await claim())[0];await service(()=>rpc('begin_weddingwin_notification_delivery',[q.id,claimToken]));await service(()=>rpc('finalize_weddingwin_notification_delivery',[q.id,claimToken,'ticketed','ticket2',null,null]));
 await db.query("update app_notification_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[q.id]);await claim();
 assert.equal(await service(()=>rpc('finalize_weddingwin_notification_delivery',[q.id,claimToken,'retry',null,'MessageRateExceeded',new Date(Date.now()+10000).toISOString()])),true);
 assert.equal((await row('select expo_ticket_id from app_notification_deliveries where id=$1',[q.id])).expo_ticket_id,null);
 await db.query("update app_notification_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[q.id]);await claim();await service(()=>rpc('begin_weddingwin_notification_delivery',[q.id,claimToken]));await service(()=>rpc('finalize_weddingwin_notification_delivery',[q.id,claimToken,'ticketed','ticket3',null,null]));await db.query("update app_notification_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[q.id]);await claim();assert.equal(await service(()=>rpc('finalize_weddingwin_notification_delivery',[q.id,claimToken,'ambiguous',null,'receipt_expired',null])),true);assert.deepEqual(await claim(),[]);
});
await test('registration disable/re-enable cancels pending old generation and never replays seen IDs',async()=>{
 await snapshot([event(7)]);await db.query('update app_push_tokens set enabled=false where id=$1',[a.device_id]);a=await register('101','A');await lease(a);assert.deepEqual(await claim(),[]);assert.equal((await snapshot([event(7)])).deliveries_created,0);
});
await db.exec(`insert into qr_bingo_raffle_settings values('show','102','102',0);insert into qr_bingo_raffle_entries values('${id(20)}','show','102','101',0,null);insert into qr_bingo_raffle_draws(id,event_key,vendor_bingo_id,vendor_bd_user_id,couple_bd_user_id,entry_id,vendor_name,prize_title,prize_description,prize_approx_value_cad,claim_instructions,official_rules_url,apple_non_sponsor_disclaimer,selection_status,eligibility_verified_at,verified_at,skill_question_verified_at)values('${id(21)}','show','102','102','101','${id(20)}','Fictional Vendor','original','original',100,'Contact vendor','https://www.weddingwin.ca/rules','Apple is not a sponsor','verified',now(),now(),now());insert into qr_bingo_draw_email_deliveries(draw_id,channel,delivery_key,status,claim_token,prize_snapshot)values('${id(21)}','couple','couple-key','claimed','${id(900)}','{"prize_title":"Email frozen prize","prize_description":"Email frozen description","prize_approx_value_cad":150}'),('${id(21)}','vendor','vendor-key','claimed','${id(901)}',null);`);
await test('actual existing email finalizer creates only first successful corresponding channel event',async()=>{
 assert.equal(await service(()=>rpc('read_weddingwin_draw_result',['101',id(21)])),null);
 const r=await service(()=>rpc('finalize_qr_bingo_draw_email_delivery',['couple-key',id(900),'sent','provider','']));assert.equal(r.status,'sent');
 assert.equal((await row("select count(*)::int n from app_notification_events where type='draw_result'")).n,1);assert.equal((await row("select count(*)::int n from app_notification_events where type='vendor_draw_follow_up'")).n,0);
 await service(()=>rpc('finalize_qr_bingo_draw_email_delivery',['couple-key',id(900),'sent','provider','']));assert.equal((await row("select count(*)::int n from app_notification_events where type='draw_result'")).n,1);
 const result=await service(()=>rpc('read_weddingwin_draw_result',['101',id(21)]));assert.equal(result.prize_title,'Email frozen prize');assert.equal(result.viewer_role,'couple');assert.equal(result.prize_approx_value_cad,150);assert.equal(await service(()=>rpc('read_weddingwin_draw_result',['103',id(21)])),null);assert.equal(await service(()=>rpc('read_weddingwin_draw_result',['102',id(21)])),null);
 await service(()=>rpc('finalize_qr_bingo_draw_email_delivery',['vendor-key',id(901),'sent','provider','']));assert.equal((await service(()=>rpc('read_weddingwin_draw_result',['102',id(21)]))).viewer_role,'vendor');
});
await test('card reset after claim fences begin; reentry cannot resurrect old selected result',async()=>{
 const q=(await claim()).find(x=>x.draw_id===id(21));assert.ok(q);
 await db.exec('update qr_bingo_raffle_entries set card_reset_at=clock_timestamp(),card_generation=1');assert.equal(await service(()=>rpc('begin_weddingwin_notification_delivery',[q.id,claimToken])),false);
 await db.exec('update qr_bingo_raffle_entries set card_reset_at=null');assert.equal(await service(()=>rpc('read_weddingwin_draw_result',['101',id(21)])),null);
});
await test('old draw generation, missing skill proof and archived private fixture never expose a result',async()=>{
 await db.exec('update qr_bingo_raffle_entries set card_generation=0;update qr_bingo_raffle_settings set draw_generation=1');assert.equal(await service(()=>rpc('read_weddingwin_draw_result',['101',id(21)])),null);
 await db.exec('update qr_bingo_raffle_settings set draw_generation=0;update qr_bingo_raffle_draws set skill_question_verified_at=null');assert.equal(await service(()=>rpc('read_weddingwin_draw_result',['101',id(21)])),null);
 await db.exec("update qr_bingo_raffle_draws set skill_question_verified_at=now();insert into app_review_raffle_fixtures values('old-fixture','103','102')");assert.equal(await service(()=>rpc('read_weddingwin_draw_result',['101',id(21)])),null);
});
await test('fair release checks only completed devices and does not retry ambiguous network work',async()=>{
 await lease(a);await lease(b);
 const before=await row('select last_push_checked_at from app_push_tokens where id=$1',[b.device_id]);
 assert.equal(await service(()=>rpc('release_weddingwin_notification_claim',[claimToken,[a.device_id]])),2);
 assert.deepEqual(await row('select last_push_checked_at from app_push_tokens where id=$1',[b.device_id]),before);
 assert.ok((await row('select last_push_checked_at from app_push_tokens where id=$1',[a.device_id])).last_push_checked_at);
 assert.equal((await row("select count(*)::int n from app_notification_deliveries where status='ambiguous'")).n,1);
});
await test('existing account purge cache deletion cascades events, aliases and deliveries for either participant',async()=>{
 await db.exec("delete from bd_users_cache where user_id='102'");assert.equal((await row("select count(*)::int n from app_notification_events where sender_member_id='102' or recipient_member_id='102'")).n,0);
 await db.exec("delete from bd_users_cache where user_id='101'");assert.equal((await row('select count(*)::int n from app_notification_deliveries')).n,0);assert.equal((await row('select count(*)::int n from app_notification_event_aliases')).n,0);assert.equal((await row('select count(*)::int n from app_notification_member_baselines')).n,0);
});
console.log(`${passes} notification SQL tests passed`);
}catch(e){console.error('SQL TEST FAILURE:',e.message,e.code||'',e.where||'');process.exitCode=1;}finally{await db.close();}
