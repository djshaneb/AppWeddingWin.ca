import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
// Offline real PostgreSQL/WASM with synthetic rows. Current email finalizer and
// skill-proof SQL are catalog snapshots, never production rows or credentials.
// Run: node scripts/test-review-draw-notifications-migration.mjs
const db=new PGlite();
// Reuse the same production prerequisites, then apply both isolated review migrations.
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
for(const file of ['20260915223013_add_nonbinding_review_draw_mode.sql','20260915223039_isolate_review_draw_notifications.sql']) await db.exec(await load('../supabase/migrations/'+file));
let nextPair=100;
const register=(member,token,previous=null)=>service(()=>rpc('register_weddingwin_push_token',[member,'session'+member,`ExpoPushToken[${token}]`,'ios',previous?`ExpoPushToken[${previous}]`:null]));
async function fixture(){
 const couple=String(++nextPair),vendor=String(++nextPair);
 await db.query('insert into bd_users_cache(user_id,token) values($1,$2),($3,$4)',[couple,'session'+couple,vendor,'session'+vendor]);
 const f=await service(()=>row("insert into review_draw_fixtures(couple_id,vendor_id,couple_name,vendor_name,prize_title,prize_description,active,created_at,expires_at,operator_note) values($1,$2,'John and Jane','Willow Florals','Wedding floral consultation','A sample consultation for reviewer testing.',true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 days','Synthetic offline test') returning id",[couple,vendor]));
 return {id:f.id,couple,vendor,generation:1,coupleToken:'C'+couple,vendorToken:'V'+vendor};
}
const action=(f,member,name,payload={})=>service(()=>rpc('perform_weddingwin_review_draw_action',[member,'review_draw_'+name,f.generation,JSON.stringify(payload)]));
const opt=(f,member,token,enabled=true,generation=f.generation)=>service(()=>rpc('set_weddingwin_review_draw_push',[member,generation,`ExpoPushToken[${token}]`,enabled]));
const readNotice=(member,notice)=>service(()=>rpc('read_weddingwin_review_draw_notice',[member,notice]));
async function prepare(f){
 for(const [member,name,payload] of [[f.vendor,'enable',{enabled:true}],[f.couple,'scan',{vendor_id:f.vendor}],[f.couple,'entry',{enter:true}],[f.vendor,'select',{}],[f.vendor,'verify',{checks_confirmed:true,skill_answer:'12'}]])assert.equal((await action(f,member,name,payload)).ok,true);
}
async function send(f){assert.equal((await action(f,f.vendor,'send')).ok,true);return (await db.query('select e.*,n.channel from app_notification_events e join review_draw_notices n on n.id=e.review_notice_id where n.fixture_id=$1 and n.generation=$2 order by channel',[f.id,f.generation])).rows;}
const claimToken=id(999);
async function lease(device){await db.query("update app_push_tokens set push_claim_token=$2,push_claim_expires_at=clock_timestamp()+interval '10 minutes' where id=$1",[device.device_id,claimToken]);}
const claim=device=>service(()=>rpc('claim_weddingwin_notification_deliveries',[device.device_id,device.registration_generation,claimToken,100]));
const begin=delivery=>service(()=>rpc('begin_weddingwin_notification_delivery',[delivery.id,claimToken]));
const eligible=(event,device)=>service(()=>rpc('weddingwin_review_notification_eligible',[event.id,device.device_id,device.registration_generation]));
const enqueue=event=>service(()=>rpc('enqueue_weddingwin_notification_event',[event.id]));
const deliveries=async f=>(await row('select count(*)::int n from app_notification_deliveries q join app_notification_events e on e.id=q.event_id join review_draw_notices n on n.id=e.review_notice_id where n.fixture_id=$1',[f.id])).n;
async function ready({both=false,optin=true}={}){
 const f=await fixture();const couple=await register(f.couple,f.coupleToken),vendor=await register(f.vendor,f.vendorToken);
 if(optin){assert.equal((await opt(f,f.couple,f.coupleToken)).ok,true);if(both)assert.equal((await opt(f,f.vendor,f.vendorToken)).ok,true);}
 await prepare(f);const events=await send(f);return {f,couple,vendor,events,event:events.find(e=>e.channel==='couple')};
}
await test('RLS and privileges deny actual anonymous/authenticated reads, writes and RPCs',async()=>{
 assert.equal((await row("select relrowsecurity value from pg_class where oid='review_draw_push_devices'::regclass")).value,true);
 for(const role of ['anon','authenticated']){
  for(const query of ['select * from review_draw_push_devices',"insert into review_draw_push_devices(fixture_id,device_id,fixture_generation,registration_generation,member_id,enabled_at,enabled) values(gen_random_uuid(),gen_random_uuid(),1,0,'1',clock_timestamp(),true)","select set_weddingwin_review_draw_push('101',1,'ExpoPushToken[A]',true)",`select weddingwin_review_notification_eligible('${id(1)}','${id(2)}',0)`,`select enqueue_weddingwin_notification_event('${id(1)}')`,`select claim_weddingwin_notification_deliveries('${id(1)}',0,'${id(2)}',20)`,`select begin_weddingwin_notification_delivery('${id(1)}','${id(2)}')`]){
   await db.exec('begin; set local role '+role);
   try{await assert.rejects(db.exec(query),e=>e.code==='42501');}finally{await db.exec('rollback');}
  }
 }
 assert.equal((await row("select count(*)::int n from pg_proc where proname in ('set_weddingwin_review_draw_push','weddingwin_review_notification_eligible','capture_weddingwin_review_draw_notification') and prosecdef")).n,0);
});
await test('exact current member/device and generation are required; idempotent opt-in keeps its timestamp',async()=>{
 const f=await fixture(),other=await fixture();await register(f.couple,f.coupleToken);await register(other.couple,other.coupleToken);
 for(const args of [[f.vendor,f.coupleToken,true,1],[other.couple,f.coupleToken,true,1],[f.couple,f.coupleToken,true,0],[f.couple,'missing',true,1]])assert.equal(await opt(f,...args),null);
 assert.deepEqual(await opt(f,f.couple,f.coupleToken),{ok:true,review_mode:'nonbinding_draw_v1',review_push_enabled:true});
 const before=await row('select * from review_draw_push_devices where fixture_id=$1',[f.id]);await opt(f,f.couple,f.coupleToken);
 assert.deepEqual(await row('select * from review_draw_push_devices where fixture_id=$1',[f.id]),before);
 await db.query('update bd_users_cache set token=$2 where user_id=$1',[f.couple,'expired-session']);
 assert.equal(await opt(f,f.couple,f.coupleToken),null);
});
await test('explicit verified Send queues both channels exactly once on opted-in devices',async()=>{
 const f=await fixture();const couple=await register(f.couple,f.coupleToken),vendor=await register(f.vendor,f.vendorToken),extra=await register(f.couple,'other-device');
 await opt(f,f.couple,f.coupleToken);await opt(f,f.vendor,f.vendorToken);
 assert.equal((await action(f,f.vendor,'send')).ok,false);assert.equal(await deliveries(f),0);
 await prepare(f);assert.equal(await deliveries(f),0);
 const events=await send(f);assert.equal(events.length,2);assert.equal(await deliveries(f),2);
 for(const event of events){assert.equal(event.draw_id,null);assert.equal(event.thread_token,null);assert.equal(event.sender_member_id,null);assert.equal(new Date(event.expires_at)-new Date(event.occurred_at),24*3600000);assert.equal(await enqueue(event),0);}
 assert.equal((await send(f)).length,2);assert.equal(await deliveries(f),2);
 assert.equal(await eligible(events[0],extra),false);
 for(const device of [couple,vendor]){await lease(device);const [q]=await claim(device);assert.ok(q.review_notice_id);assert.equal(q.draw_id,null);assert.equal(await begin(q),true);assert.equal(await begin(q),false);}
 assert.equal((await row('select count(*)::int n from qr_bingo_raffle_draws')).n,0);
 assert.equal((await row('select count(*)::int n from qr_bingo_draw_email_deliveries')).n,0);
});
await test('notice remains readable without push permission; late opt-in never enqueues historical notices',async()=>{
 const {f,couple,event}=await ready({optin:false});assert.equal(await deliveries(f),0);
 assert.equal((await readNotice(f.couple,event.review_notice_id)).review_mode,'nonbinding_draw_v1');assert.equal(await readNotice(f.vendor,event.review_notice_id),null);
 assert.equal((await opt(f,f.couple,f.coupleToken)).ok,true);assert.equal(await eligible(event,couple),false);assert.equal(await enqueue(event),0);assert.equal(await deliveries(f),0);
 await send(f);assert.equal(await deliveries(f),0);
});
await test('review routes cannot masquerade as production draws/messages and cannot cross channel or recipient',async()=>{
 const {f,couple,vendor,event}=await ready();
 for(const sql of ["update app_notification_events set type='draw_result' where id=$1","update app_notification_events set thread_token='production-thread' where id=$1","update app_notification_events set review_notice_id=null where id=$1","update app_notification_events set type='chat_message',thread_token='t' where id=$1"])
  await assert.rejects(service(()=>db.query(sql,[event.id])),e=>e.code==='23514');
 assert.equal(await eligible(event,vendor),false);
 await service(()=>db.query("update app_notification_events set type='review_vendor_follow_up' where id=$1",[event.id]));assert.equal(await eligible(event,couple),false);
 await service(()=>db.query("update app_notification_events set type='review_draw_result',recipient_member_id=$2 where id=$1",[event.id,f.vendor]));assert.equal(await eligible(event,vendor),false);
});
await test('opt-out after claim cancels before sending; re-enabling cannot replay prior notice',async()=>{
 const {f,couple,event}=await ready();await lease(couple);const [q]=await claim(couple);
 assert.deepEqual(await opt(f,f.couple,f.coupleToken,false),{ok:true,review_mode:'nonbinding_draw_v1',review_push_enabled:false});
 assert.equal(await begin(q),false);assert.equal((await row('select status from app_notification_deliveries where id=$1',[q.id])).status,'canceled');
 await opt(f,f.couple,f.coupleToken,true);assert.equal(await eligible(event,couple),false);assert.equal(await enqueue(event),0);
});
await test('generation reset invalidates old notices/pins and fresh Send needs new explicit opt-in',async()=>{
 const {f,couple,event}=await ready();await lease(couple);const [q]=await claim(couple);
 assert.equal((await action(f,f.vendor,'reset')).ok,true);f.generation++;
 assert.equal(await readNotice(f.couple,event.review_notice_id),null);assert.equal(await begin(q),false);
 assert.equal(await opt(f,f.couple,f.coupleToken,true,f.generation-1),null);
 await prepare(f);const nextEvents=await send(f);assert.equal(await deliveries(f),1);
 const nextEvent=nextEvents.find(e=>e.channel==='couple');assert.equal(await eligible(nextEvent,couple),false);
 await opt(f,f.couple,f.coupleToken);assert.equal(await enqueue(nextEvent),0);
 await action(f,f.vendor,'reset');f.generation++;await opt(f,f.couple,f.coupleToken);await prepare(f);await send(f);assert.equal(await deliveries(f),2);
});
await test('fixture revocation and expiry block opt-in and revalidate queued sends',async()=>{
 for(const mode of ['revoked','expired']){
  const {f,couple,event}=await ready();await lease(couple);const [q]=await claim(couple);
  await service(()=>db.query(mode==='revoked'?'update review_draw_fixtures set active=false where id=$1':"update review_draw_fixtures set expires_at=clock_timestamp()-interval '1 second' where id=$1",[f.id]));
  assert.equal(await opt(f,f.couple,f.coupleToken),null);assert.equal(await eligible(event,couple),false);assert.equal(await begin(q),false);assert.equal(await readNotice(f.couple,event.review_notice_id),null);
 }
});
await test('event expiry is capped by shorter fixture lifetime',async()=>{
 const f=await fixture();await register(f.couple,f.coupleToken);await opt(f,f.couple,f.coupleToken);
 await service(()=>db.query("update review_draw_fixtures set expires_at=clock_timestamp()+interval '2 hours' where id=$1",[f.id]));await prepare(f);
 const [event]=await send(f);assert.deepEqual(event.expires_at,(await row('select expires_at from review_draw_fixtures where id=$1',[f.id])).expires_at);
});
await test('claim cancels queued events after opt-out or current cached-session change',async()=>{
 for(const mode of ['optout','session']){
  const {f,couple}=await ready();await lease(couple);
  if(mode==='optout')await opt(f,f.couple,f.coupleToken,false);else await db.query("update bd_users_cache set token='revoked' where user_id=$1",[f.couple]);
  assert.deepEqual(await claim(couple),[]);assert.equal((await row('select q.status from app_notification_deliveries q join app_notification_events e on e.id=q.event_id where e.recipient_member_id=$1',[f.couple])).status,'canceled');
 }
});
await test('account switching and token rollover invalidate exact device registration pins',async()=>{
 const {f,couple,event}=await ready();await lease(couple);const [q]=await claim(couple);
 const switched=await register(f.vendor,f.coupleToken);assert.equal(switched.device_id,couple.device_id);assert.ok(switched.registration_generation>couple.registration_generation);
 assert.equal(await begin(q),false);assert.equal(await eligible(event,switched),false);assert.equal(await opt(f,f.couple,f.coupleToken),null);
 const restored=await register(f.couple,f.coupleToken);assert.equal(await eligible(event,restored),false);await opt(f,f.couple,f.coupleToken);assert.equal(await eligible(event,restored),false);
 const rolled=await register(f.couple,'rollover',f.coupleToken);assert.equal((await row('select enabled from app_push_tokens where id=$1',[couple.device_id])).enabled,false);
 assert.equal(await eligible(event,rolled),false);await opt(f,f.couple,'rollover');assert.equal(await enqueue(event),0);
});
await test('losing verified state after claim prevents notification begin',async()=>{
 const {f,couple}=await ready();await lease(couple);const [q]=await claim(couple);
 await service(()=>db.query("update review_draw_state set selection_status='potential',verified_at=null where fixture_id=$1",[f.id]));assert.equal(await begin(q),false);
});
await test('production chat delivery remains available without review opt-in',async()=>{
 const f=await fixture(),device=await register(f.couple,f.coupleToken);
 const e=await service(()=>row("insert into app_notification_events(event_key,type,recipient_member_id,sender_member_id,thread_token,occurred_at,expires_at) values('ordinary-chat','chat_message',$1,$2,'real-thread',clock_timestamp(),clock_timestamp()+interval '1 day') returning *",[f.couple,f.vendor]));
 assert.equal(await enqueue(e),1);await lease(device);const [q]=await claim(device);assert.equal(q.type,'chat_message');assert.equal(q.review_notice_id,null);assert.equal(await begin(q),true);
});
await test('member deletion cascades isolated pins, notices, events and deliveries',async()=>{
 const {f}=await ready();await service(()=>db.query('delete from bd_users_cache where user_id=$1',[f.couple]));
 assert.equal((await row('select count(*)::int n from review_draw_push_devices where fixture_id=$1',[f.id])).n,0);
 assert.equal((await row('select count(*)::int n from review_draw_notices where fixture_id=$1',[f.id])).n,0);
 assert.equal(await deliveries(f),0);
});
console.log(`${passes} review notification migration tests passed`);
} finally {await db.close();}
