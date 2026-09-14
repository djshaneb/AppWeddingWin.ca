import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
// Actual PostgreSQL executes the migration. Synthetic cron catalog and function
// replace only extension scheduling, so tests never perform HTTP or run jobs.
const db=new PGlite();
const migration=await readFile(new URL('../supabase/migrations/20260914193506_increase_notification_cron_response_timeout.sql',import.meta.url),'utf8');
const command=`select net.http_post(
 url := 'https://example.test/functions/v1/bd-push-sweep',
 headers := jsonb_build_object('X-WeddingWin-Cron-Secret', (select secret from synthetic_vault)),
 body := '{}'::jsonb
);`;
// Bind the same exact-hash guard to the deliberately credential-free fixture.
const bound=migration.replace('4e4b13a2a4b057cb3916509156f8fe4f',crypto.createHash('md5').update(command).digest('hex'));
async function restricted(sql){await db.exec('begin; set local role cron_operator');try{await db.exec(sql);await db.exec('commit');}catch(e){await db.exec('rollback');throw e;}}
const row=async(q,p=[]) => (await db.query(q,p)).rows[0];
let count=0;async function test(name,fn){await fn();console.log('PASS '+name);count++;}
try{
 await db.exec(`create role cron_operator;create schema cron;create schema net;create table cron.job(jobid bigint primary key,jobname text unique,schedule text,active boolean,command text,database text,username text);
 create table cron.calls(jobid bigint);
 create function net.http_post(text,jsonb default '{}',jsonb default '{}',jsonb default '{}',integer default 5000)returns bigint language sql as $$select 1::bigint$$;
 create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null)returns void language plpgsql security definer set search_path='' as $$begin insert into cron.calls values(job_id);update cron.job j set command=coalesce(alter_job.command,j.command),schedule=coalesce(alter_job.schedule,j.schedule),active=coalesce(alter_job.active,j.active) where j.jobid=job_id;end$$;`);
 await db.query("insert into cron.job values(2,'weddingwin-chat-push-sweep','* * * * *',true,$1,'postgres','postgres'),(3,'other-job','*/5 * * * *',true,'unrelated','postgres','postgres')",[command]);
 await db.exec('grant usage on schema cron,net to cron_operator;grant select on cron.job to cron_operator;grant execute on function cron.alter_job(bigint,text,text,text,text,boolean) to cron_operator;');
 const before=await row('select to_jsonb(j) value from cron.job j where jobid=2');const other=await row('select to_jsonb(j) value from cron.job j where jobid=3');
 await test('restricted cron catalog reproduces row-lock denial before correction',async()=>{
  assert.equal((await row("select has_table_privilege('cron_operator','cron.job','UPDATE') value")).value,false);
  await assert.rejects(restricted(bound.replace("where jobname='weddingwin-chat-push-sweep';","where jobname='weddingwin-chat-push-sweep' for update;")),error=>error.code==='42501');
  assert.equal((await row('select count(*)::int n from cron.calls')).n,0);
 });
 await test('sets 180-second wait and preserves exact headers URL body job identity and schedule',async()=>{
  await restricted(bound);const after=await row('select to_jsonb(j) value from cron.job j where jobid=2');
  assert.equal(after.value.command,command.replace("body := '{}'::jsonb","body := '{}'::jsonb,\n    timeout_milliseconds := 180000"));
  assert.deepEqual({...after.value,command:before.value.command},before.value);assert.deepEqual(await row('select to_jsonb(j) value from cron.job j where jobid=3'),other);
 });
 await test('exact already-applied command is idempotent without another scheduler mutation',async()=>{
  await restricted(bound);assert.equal((await row('select count(*)::int n from cron.calls')).n,1);
 });
 await test('unexpected command headers body URL timeout or job state fails closed',async()=>{
  const applied=(await row('select command from cron.job where jobid=2')).command;
  for(const edited of [command.replace('example.test','wrong.test'),command.replace("body := '{}'::jsonb","body := '{\"other\":true}'::jsonb"),applied.replace('180000','300000'),command+' -- changed']){
   await db.query('update cron.job set command=$1 where jobid=2',[edited]);await assert.rejects(restricted(bound),/Unexpected notification cron command baseline/);assert.equal((await row('select count(*)::int n from cron.calls')).n,1);
  }
  await db.query('update cron.job set command=$1,active=false where jobid=2',[command]);await assert.rejects(restricted(bound),/Unexpected notification cron job baseline/);
  await db.exec("update cron.job set active=true,schedule='*/2 * * * *' where jobid=2");await assert.rejects(restricted(bound),/Unexpected notification cron job baseline/);
  await db.exec("update cron.job set schedule='* * * * *',jobid=4 where jobid=2");await assert.rejects(restricted(bound),/Unexpected notification cron job baseline/);
 });
 await test('missing expected extension signature refuses to mutate',async()=>{
  await db.exec('drop function net.http_post(text,jsonb,jsonb,jsonb,integer)');await assert.rejects(restricted(bound),/Expected notification scheduler signatures are unavailable/);assert.equal((await row('select count(*)::int n from cron.calls')).n,1);
 });
 console.log(`${count} cron timeout SQL tests passed`);
}finally{await db.close();}
