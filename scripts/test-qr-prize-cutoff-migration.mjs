import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const read = (name) => readFile(new URL(name,import.meta.url),'utf8');
const migration = await read('../supabase/migrations/20260915005744_enforce_vendor_prize_edit_deadline.sql');
const resetMigration = await read('../supabase/migrations/20260910195501_add_admin_vendor_draw_reset_generations.sql');
const prizeMigration = await read('../supabase/migrations/20260908035734_qr_bingo_single_winner_and_editable_prize.sql');
function existingFunction(source,name) {
  const begin=source.toLowerCase().indexOf('create or replace function public.'+name+'(');
  assert(begin>=0,name);
  const rest=source.slice(begin);
  const tag=rest.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return rest.slice(0,rest.indexOf(';',rest.indexOf(tag,rest.indexOf(tag)+tag.length)+tag.length)+1);
}
let passed=0;
const row=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const status=async(vendor='901',event='niagara-wedding-show-2026',identity=vendor) =>
  (await row('select public.qr_bingo_prize_edit_status($1,$2,$3) status',[event,vendor,identity])).status;
const deny=async(fn,pattern=/prize_edit_closed:/) => assert.rejects(fn,(e)=>{assert.equal(e.code,'55000');assert.match(e.message,pattern);return true;});
async function test(name,fn){await fn();console.log(`PASS ${++passed}: ${name}`);}
async function temporary(sql,fn){
  const sentinel=new Error('rollback');
  try {await db.transaction(async(tx)=>{await tx.exec(sql);await fn(tx);throw sentinel;});}
  catch(e){if(e!==sentinel)throw e;}
}
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create table public.qr_bingo_event_configs(event_key text,revision integer,published boolean,history_starts_at timestamptz);
create table public.qr_bingo_raffle_settings(
 id uuid default gen_random_uuid(), event_key text not null,vendor_bingo_id text not null,vendor_bd_user_id text not null,
 prize_title text default '',prize_description text default '',prize_approx_value_cad numeric,
 enabled boolean default false,max_winners integer default 1,exclude_previous_winners boolean default true,
 draw_generation integer default 0,synthetic_fixture_setup_id uuid,
 primary key(event_key,vendor_bingo_id));
create table public.qr_bingo_raffle_draws(id uuid default gen_random_uuid() primary key,event_key text,vendor_bingo_id text,
 vendor_bd_user_id text,draw_generation integer default 0,vendor_email_sent_at timestamptz,couple_email_sent_at timestamptz);
create table public.qr_bingo_draw_email_deliveries(draw_id uuid,status text);
create table public.qr_bingo_synthetic_fixture_setups(id uuid,provenance text,event_key text,vendor_bingo_id text,vendor_bd_user_id text,prize_title text,prize_description text,prize_approx_value_cad numeric);
grant select on public.qr_bingo_synthetic_fixture_setups to service_role;
create table public.immutable_history(kind text, snapshot jsonb);
insert into public.immutable_history values('offer','{"prize":"Original"}'),('entry','{"accepted":true}'),('consent','{"version":"historic"}');
insert into public.qr_bingo_event_configs values('niagara-wedding-show-2026',16,true,clock_timestamp()+interval '2 days');
insert into public.qr_bingo_raffle_settings(event_key,vendor_bingo_id,vendor_bd_user_id,prize_title,prize_description,prize_approx_value_cad)
values('niagara-wedding-show-2026','901','901','Original','Original description',100);
grant select on public.qr_bingo_event_configs,public.qr_bingo_raffle_draws,public.qr_bingo_draw_email_deliveries to service_role;
grant select,insert,update on public.qr_bingo_raffle_settings to service_role;
`);
await db.exec(existingFunction(resetMigration,'qr_bingo_current_draw_generation'));
await db.exec(existingFunction(resetMigration,'qr_bingo_prize_details_lock'));
await db.exec(existingFunction(prizeMigration,'enforce_qr_bingo_single_winner_prize_edit'));
await db.exec(`create trigger aa_qr_bingo_single_winner_prize_edit before insert or update on public.qr_bingo_raffle_settings
 for each row execute function public.enforce_qr_bingo_single_winner_prize_edit()`);
const baseline=await db.query('select * from public.immutable_history order by kind');
await db.exec(migration);
await test('migration adds policy and preserves all historical records',async()=>{
 assert.deepEqual(await db.query('select * from public.immutable_history order by kind'),baseline);
 assert.equal((await row('select count(*)::int n from public.qr_bingo_event_prize_edit_policies')).n,1);
});
for (const [name,start,expected] of [
 ['summer','2026-10-18T15:00:00Z','2026-10-18T15:00:00.000Z'],
 ['winter','2026-01-18T16:00:00Z','2026-01-18T16:00:00.000Z'],
 ['spring DST transition','2026-03-08T05:00:00Z','2026-03-08T15:00:00.000Z'],
 ['fall DST transition','2026-11-01T04:00:00Z','2026-11-01T16:00:00.000Z'],
 ['local day differs from UTC','2026-10-19T01:00:00Z','2026-10-18T15:00:00.000Z'],
]) await test('11am uses event-local date: '+name,async()=>{
 const r=await row("select public.qr_bingo_prize_edit_deadline($1,'America/Toronto') d",[start]);
 assert.equal(r.d.toISOString(),expected);
});
await test('invalid/missing timezone and event time fail closed',async()=>{
 for (const [stamp,zone] of [[null,'America/Toronto'],['infinity','America/Toronto'],['2026-10-18','invalid/zone'],['2026-10-18',null]]) {
  assert.equal((await row('select public.qr_bingo_prize_edit_deadline($1,$2) d',[stamp,zone])).d,null);
 }
});
await test('deadline boundary accepts immediately before, denies exactly11am and after',async()=>{
 for(const [now,expected] of [['2026-10-18T14:59:59.999999Z',true],['2026-10-18T15:00:00Z',false],['2026-10-18T15:00:00.000001Z',false]]){
  assert.equal((await row("select public.qr_bingo_prize_edit_window_open('2026-10-18T15:00:00Z',$1) allowed",[now])).allowed,expected);
 }
 assert.equal((await row("select public.qr_bingo_prize_edit_window_open(null,now()) allowed")).allowed,false);
});
await test('status is exact event and vendor scoped',async()=>{
 const s=await status(); assert.equal(s.prize_editable,true);assert.equal(s.prize_details_locked,false);
 assert.equal(s.prize_edit_timezone,'America/Toronto');assert.equal(s.event_revision,16);
 for(const s of [await status('902'),await status('901','other-event'),await status('901','niagara-wedding-show-2026','902')]){
  assert.equal(s.prize_editable,false);assert.equal(s.prize_details_lock_reason,'unavailable');
 }
});
await test('service-role prize write works before deadline and retains one-winner controls',async()=>{
 await db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.exec("update public.qr_bingo_raffle_settings set prize_title='Updated',prize_description='Updated description',prize_approx_value_cad=125,max_winners=3,exclude_previous_winners=false where vendor_bingo_id='901'");});
 const r=await row("select * from public.qr_bingo_raffle_settings where vendor_bingo_id='901'");assert.equal(r.prize_title,'Updated');assert.equal(r.max_winners,1);assert.equal(r.exclude_previous_winners,true);
});
await test('a vendor cannot move saved settings to a different event or identity',async()=>{
 for(const change of ["event_key='other-event'","vendor_bingo_id='903'","vendor_bd_user_id='903'"])
  await deny(()=>db.exec('update public.qr_bingo_raffle_settings set '+change),/cannot be moved/);
});
await test('deadline status and database trigger block all three prize fields',async()=>{
 await temporary("update public.qr_bingo_event_configs set history_starts_at='2020-10-18T15:00Z'",async tx=>{
  const s=(await tx.query("select public.qr_bingo_prize_edit_status('niagara-wedding-show-2026','901','901') s")).rows[0].s;
  assert.equal(s.prize_editable,false);assert.equal(s.prize_details_lock_reason,'deadline');
  for(const change of ["prize_title='Late'","prize_description='Late'","prize_approx_value_cad=200"]){
   await tx.exec('savepoint attempt');await deny(()=>tx.exec('update public.qr_bingo_raffle_settings set '+change));await tx.exec('rollback to savepoint attempt');
  }
 });
});
await test('non-prize changes and empty dashboard initialization remain available after deadline',async()=>{
 await temporary("update public.qr_bingo_event_configs set history_starts_at='2020-10-18T15:00Z'",async tx=>{
  await tx.exec("update public.qr_bingo_raffle_settings set enabled=false where vendor_bingo_id='901'");
  await tx.exec("insert into public.qr_bingo_raffle_settings(event_key,vendor_bingo_id,vendor_bd_user_id) values('niagara-wedding-show-2026','902','902')");
 });
});
await test('insertion cannot bypass cutoff with a new prefilled prize',async()=>{
 await temporary("update public.qr_bingo_event_configs set history_starts_at='2020-10-18T15:00Z'",async tx=>{
  await deny(()=>tx.exec("insert into public.qr_bingo_raffle_settings(event_key,vendor_bingo_id,vendor_bd_user_id,prize_title) values('niagara-wedding-show-2026','902','902','Late prize')"));
 });
});
await test('missing timezone policy and invalid timezone fail closed',async()=>{
 for(const sql of ["delete from public.qr_bingo_event_prize_edit_policies","update public.qr_bingo_event_prize_edit_policies set event_timezone='bad/zone'"]){
  await temporary(sql,async tx=>{const s=(await tx.query("select public.qr_bingo_prize_edit_status('niagara-wedding-show-2026','901','901') s")).rows[0].s;assert.equal(s.prize_editable,false);assert.equal(s.prize_edit_deadline_at,null);await deny(()=>tx.exec("update public.qr_bingo_raffle_settings set prize_title='Unsafe'"));});
 }
});
await test('unpublished or ambiguous current event configuration fails closed',async()=>{
 for(const sql of ["update public.qr_bingo_event_configs set published=false","insert into public.qr_bingo_event_configs select event_key,17,true,history_starts_at from public.qr_bingo_event_configs"]){
  await temporary(sql,async tx=>{await deny(()=>tx.exec("update public.qr_bingo_raffle_settings set prize_title='Unsafe'"));});
 }
});
await test('synthetic fixture remains immutable even with copied production event context',async()=>{
 await temporary("update public.qr_bingo_raffle_settings set synthetic_fixture_setup_id='00000000-0000-4000-8000-000000000001'",async tx=>{
  const s=(await tx.query("select public.qr_bingo_prize_edit_status('niagara-wedding-show-2026','901','901') s")).rows[0].s;
  assert.equal(s.prize_details_lock_reason,'synthetic_fixture');await deny(()=>tx.exec("update public.qr_bingo_raffle_settings set prize_title='Unsafe'"));
 });
});
for(const [delivery,expected] of [['pending','sending'],['claimed','sending'],['ambiguous','unconfirmed'],['sent','sent']]) {
 await test('existing '+delivery+' delivery locks earlier than deadline',async()=>{
  await temporary(`insert into public.qr_bingo_raffle_draws(id,event_key,vendor_bingo_id,vendor_bd_user_id) values('00000000-0000-4000-8000-000000000003','niagara-wedding-show-2026','901','901');insert into public.qr_bingo_draw_email_deliveries values('00000000-0000-4000-8000-000000000003','${delivery}')`,async tx=>{
   const s=(await tx.query("select public.qr_bingo_prize_edit_status('niagara-wedding-show-2026','901','901') s")).rows[0].s;
   assert.equal(s.prize_editable,false);assert.equal(s.prize_details_lock_reason,expected);
   await deny(()=>tx.exec("update public.qr_bingo_raffle_settings set prize_title='Late'"),/locked/);
  });
 });
}
await test('prior generation sent history retains current reset behavior before cutoff',async()=>{
 await temporary("insert into public.qr_bingo_raffle_draws(event_key,vendor_bingo_id,vendor_bd_user_id,draw_generation,couple_email_sent_at) values('niagara-wedding-show-2026','901','901',0,now());update public.qr_bingo_raffle_settings set draw_generation=1",async tx=>{
  const s=(await tx.query("select public.qr_bingo_prize_edit_status('niagara-wedding-show-2026','901','901') s")).rows[0].s;assert.equal(s.prize_editable,true);
  await tx.exec("update public.qr_bingo_raffle_settings set prize_title='Current generation prize'");
 });
});
await test('generation reset cannot reopen a passed show-day deadline',async()=>{
 await temporary("update public.qr_bingo_event_configs set history_starts_at='2020-10-18T15:00Z';update public.qr_bingo_raffle_settings set draw_generation=draw_generation+1",async tx=>{await deny(()=>tx.exec("update public.qr_bingo_raffle_settings set prize_title='Reopened'"));});
});
await test('vendor-controlled schedules cannot move the deadline',async()=>{
 assert.doesNotMatch(migration,/settings_row\.(entry_closes_at|draw_at|draw_opens_at)/);
 assert.match(migration,/cfg\.history_starts_at,event_zone/);
});
await test('RLS and service-only permissions hide policy/RPC from both clients',async()=>{
 assert.equal((await row("select relrowsecurity rls from pg_class where oid='public.qr_bingo_event_prize_edit_policies'::regclass")).rls,true);
 for(const role of ['anon','authenticated']){
  assert.equal((await row("select has_table_privilege($1,'public.qr_bingo_event_prize_edit_policies','SELECT') ok",[role])).ok,false);
  assert.equal((await row("select has_function_privilege($1,'public.qr_bingo_prize_edit_status(text,text,text)','EXECUTE') ok",[role])).ok,false);
 }
 assert.equal((await row("select has_function_privilege('service_role','public.qr_bingo_prize_edit_status(text,text,text)','EXECUTE') ok")).ok,true);
 assert.equal((await row("select has_table_privilege('service_role','public.qr_bingo_event_prize_edit_policies','UPDATE') ok")).ok,false);
});
await test('all historical snapshots remain byte-for-byte unchanged after edits and rejects',async()=>{
 assert.deepEqual(await db.query('select * from public.immutable_history order by kind'),baseline);
});
await db.close();console.log(`${passed} prize-cutoff SQL tests passed.`);
