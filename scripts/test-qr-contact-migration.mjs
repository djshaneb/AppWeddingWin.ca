import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Isolated WASM PostgreSQL only. Pass a pinned PGlite package path installed
// outside this repository; this harness never opens a production connection.
const runtime = process.env.QR_CONTACT_PGLITE;
if (!runtime) throw new Error('Set QR_CONTACT_PGLITE to the installed @electric-sql/pglite/dist/index.js path.');
const { PGlite } = await import(pathToFileURL(runtime));
const db = new PGlite();
const columns = JSON.parse(await readFile(new URL('./fixtures/qr-contact-schema-columns.json', import.meta.url),'utf8'));
const sql = await readFile(new URL('../supabase/migrations/20260907132342_add_qr_bingo_contact_profiles.sql',import.meta.url),'utf8');
const venueSql = await readFile(new URL('../supabase/migrations/20260907134716_add_qr_bingo_optional_wedding_venue.sql',import.meta.url),'utf8');
let passed = 0;
async function test(name,fn) { await fn(); passed++; console.log('PASS '+name); }
async function scalar(query,params=[]) { return (await db.query(query,params)).rows[0]; }
const event='offline-contact-test';
const base = {event_key:event,vendor_bingo_id:'901',vendor_bd_user_id:'901',vendor_name:'Offline Vendor',couple_bd_user_id:'701',couple_name:'Original Couple',couple_email:'original@example.test',couple_phone:'555-010-7001',couple_wedding_date:'2027-10-18',consent_share_contact:true,contact_share_scope:'named_vendor_draw_administration',draw_administration_contact_share_acknowledged:true,vendor_marketing_consent:true,draw_administration_contact_share_version:'2026-09-01-in-person-entry',consent_version:'2026-09-01-in-person-entry',entry_method:'qr_scan_opt_in',created_at:'2026-09-01T00:00:00Z',draw_at:'2026-10-18T00:00:00Z'};
async function insert(table, row) { const keys=Object.keys(row); await db.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row)); }
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function save(member,email,version=0,overrides={}) { return (await scalar('select public.save_qr_bingo_contact_profile($1,$2,$3,$4,$5,$6,$7,$8) result',[event,member,version,overrides.name??'Updated Couple',email,'555-010-7001',overrides.date??'2028-02-29',true])).result; }
async function saveVenue(member,email,version,venue,date='2028-02-29') { return (await scalar('select public.save_qr_bingo_contact_profile_with_venue($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[event,member,version,'Venue Couple',email,'5550107001',date,true,venue])).result; }
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for(const table of new Set(columns.map(c=>c.table_name))) {
    await db.exec(`create table public.${table} (${columns.filter(c=>c.table_name===table).map(c=>`"${c.column_name}" ${c.data_type}`).join(',')});`);
  }
  await db.exec(`alter table public.qr_bingo_raffle_entries add primary key(id);
    alter table public.qr_bingo_raffle_entry_identities add unique(event_key,vendor_bingo_id,entrant_identity_hash);
    create function public.compute_qr_bingo_entrant_identity_hash(text) returns text language sql immutable as $$select md5(lower(trim($1)))$$;
    create schema weddingwin_private;
    create table weddingwin_private.pending_deleted_chat_identities(member_hash text,identity_hash text,normalization text,expires_at timestamptz);
    create table weddingwin_private.deleted_chat_identities(identity_hash text,normalization text,unique(identity_hash,normalization));
    create function weddingwin_private.chat_identity_hash(text) returns text language sql immutable as $$select md5($1)$$;
    create function weddingwin_private.is_deleted_chat_identity(text) returns boolean language sql as $$select exists(select 1 from weddingwin_private.deleted_chat_identities where identity_hash=md5($1))$$;
    create function public.purge_weddingwin_member_data_chat_redaction_v1(text,text,text) returns jsonb language plpgsql as $$begin insert into weddingwin_private.deleted_chat_identities(identity_hash,normalization) values(md5($1),'exact') on conflict do nothing;return '{"ok":true}'::jsonb;end;$$;`);
  // Existing entries predate the new profile table. Include closed, old-version,
  // archived, non-sharing, different-event and different-couple controls.
  await insert('qr_bingo_raffle_entries',{...base,id:id(1)});
  await insert('qr_bingo_raffle_entries',{...base,id:id(2),vendor_bingo_id:'902',consent_version:'2026-09-01-vendor-marketing',draw_administration_contact_share_version:'2026-09-01-vendor-marketing'});
  await insert('qr_bingo_raffle_entries',{...base,id:id(3),vendor_bingo_id:'903',consent_share_contact:false});
  await insert('qr_bingo_raffle_entries',{...base,id:id(4),vendor_bingo_id:'904'});
  await insert('qr_bingo_legacy_qa_archives',{entry_id:id(4)});
  await insert('qr_bingo_raffle_entries',{...base,id:id(5),event_key:'another-event'});
  await insert('qr_bingo_raffle_entries',{...base,id:id(6),couple_bd_user_id:'702',couple_email:'other@example.test'});
  await db.exec(sql);
  await db.exec(venueSql);
  await db.exec(`create trigger b_offer_guard before update on public.qr_bingo_raffle_entries for each row execute function public.enforce_qr_bingo_entry_offer_version();
    create trigger c_rules_guard before update on public.qr_bingo_raffle_entries for each row execute function public.enforce_qr_bingo_current_rules();
    create trigger d_identity_guard before insert or update on public.qr_bingo_raffle_entries for each row execute function public.set_and_reserve_qr_bingo_entry_identity();`);
  await test('actual migration compiles tables, functions and triggers in PostgreSQL',async()=>assert.equal((await scalar("select count(*)::int n from pg_tables where tablename='qr_bingo_contact_profiles'")).n,1));
  await test('current and older named opt-ins update after closed rules; controls untouched',async()=>{
    assert.equal((await save('701','updated@example.test')).updated_entry_count,2);
    const rows=(await db.query('select id,couple_email,consent_version from public.qr_bingo_raffle_entries order by id')).rows;
    assert.deepEqual(rows.map(r=>r.couple_email),['updated@example.test','updated@example.test','original@example.test','original@example.test','original@example.test','other@example.test']);
    assert.equal(rows[1].consent_version,'2026-09-01-vendor-marketing');
    assert.equal((await scalar('select count(*)::int n from public.qr_bingo_raffle_entries')).n,6);
  });
  await test('stale version rejects without mutation or new audit',async()=>{
    assert.equal((await save('701','stale@example.test',0)).code,'contact_profile_conflict');
    assert.equal((await scalar('select count(*)::int n from public.qr_bingo_contact_profile_audit')).n,1);
  });
  await test('same entry may change email A to B and back to A',async()=>{
    assert.equal((await save('701','another@example.test',1)).version,2);
    assert.equal((await save('701','updated@example.test',2)).version,3);
  });
  await test('another couple cannot reuse protected vendor email; entire save rolls back',async()=>{
    await assert.rejects(save('702','updated@example.test'),e=>e.code==='23505');
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_contact_profiles where couple_bd_user_id='702'")).n,0);
    assert.equal((await scalar("select couple_email from public.qr_bingo_raffle_entries where id=$1",[id(6)])).couple_email,'other@example.test');
  });
  await test('contact-only exemptions do not allow material rule or archived edits',async()=>{
    await assert.rejects(db.query('update public.qr_bingo_raffle_entries set prize_title=$1 where id=$2',['Changed prize',id(1)]));
    await assert.rejects(db.query('update public.qr_bingo_raffle_entries set couple_name=$1 where id=$2',['Changed archive',id(4)]));
  });
  await test('shared rules trigger still handles settings UPDATE and grand-prize INSERT without missing entry fields',async()=>{
    await insert('qr_bingo_event_configs',{event_key:event,published:true,rules_version:'2026-09-01-in-person-entry'});
    await insert('qr_bingo_raffle_settings',{event_key:event,vendor_bingo_id:'901',enabled:false});
    await db.exec('create trigger test_settings_rules before update on public.qr_bingo_raffle_settings for each row execute function public.enforce_qr_bingo_current_rules(); create trigger test_grand_rules before insert on public.qr_bingo_grand_prize_entries for each row execute function public.enforce_qr_bingo_current_rules();');
    await db.exec("update public.qr_bingo_raffle_settings set enabled=false where event_key='offline-contact-test'");
    await assert.rejects(insert('qr_bingo_grand_prize_entries',{id:id(80),event_key:event,rules_version:'outdated'}),e=>e.message==='Review and accept the current official rules before entering the grand-prize draw.');
  });
  await test('invalid date and relay email cannot persist',async()=>{
    await assert.rejects(save('703','valid@example.test',0,{date:'2027-02-29'}));
    await assert.rejects(save('703','relay@privaterelay.appleid.com'));
  });
  await test('insert trigger replaces stale caller contact with latest saved profile',async()=>{
    await insert('qr_bingo_raffle_entries',{...base,id:id(7),vendor_bingo_id:'907',couple_email:'stale@example.test'});
    assert.equal((await scalar('select couple_email from public.qr_bingo_raffle_entries where id=$1',[id(7)])).couple_email,'updated@example.test');
  });
  await test('admin data filters event, vendor consent and literal search with bounded pages',async()=>{
    const q=(dataset,vendor='',search='',offset=0,limit=50)=>scalar('select public.read_qr_bingo_admin_data($1,$2,$3,$4,$5,$6) result',[dataset,event,vendor,search,offset,limit]).then(x=>x.result);
    assert.equal((await q('contacts','901')).total,1);
    assert.equal((await q('contacts','903')).total,0);
    assert.equal((await q('contacts','','%')).total,0);
    assert.equal((await q('entries','','',0,2)).rows.length,2);
    await assert.rejects(q('contacts','','',0,5002));
  });
  await test('anonymous/authenticated roles have no contact table or RPC access',async()=>{
    for (const role of ['anon','authenticated']) {
      assert.equal((await scalar('select has_table_privilege($1,$2,$3) access',[role,'public.qr_bingo_contact_profiles','SELECT'])).access,false);
      assert.equal((await scalar('select has_function_privilege($1,$2,$3) access',[role,'public.save_qr_bingo_contact_profile(text,text,bigint,text,text,text,text,boolean)','EXECUTE'])).access,false);
    }
  });
  await test('existing deletion entry point purges exact member all-event contacts and audit only',async()=>{
    await save('704','survivor@example.test');
    await db.query("insert into public.qr_bingo_contact_profiles(event_key,couple_bd_user_id,name,email,phone) values('another-event','701','Other Event','other-event@example.test','5550107001')");
    const result=(await scalar("select public.purge_weddingwin_member_data_with_chat_redaction('701','','') result")).result;
    assert.equal(result.qr_bingo_contact_profiles_deleted,2);
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_contact_profile_audit where couple_bd_user_id='701'")).n,0);
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_contact_profiles where couple_bd_user_id='704'")).n,1);
  });
  await test('a previously authenticated save or scan cannot recreate a deleted member contact',async()=>{
    await assert.rejects(save('701','resurrect@example.test'),e=>e.code==='42501');
    await assert.rejects(insert('qr_bingo_raffle_entries',{...base,id:id(90),vendor_bingo_id:'990'}),e=>e.code==='42501');
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_contact_profiles where couple_bd_user_id='701'")).n,0);
  });
  await test('venue saves to profile and only opted-in entry without changing consent',async()=>{
    await insert('qr_bingo_raffle_entries',{...base,id:id(100),couple_bd_user_id:'705',vendor_bingo_id:'995',couple_email:'venue@example.test'});
    const result=await saveVenue('705','venue@example.test',0,'  Americana Resort  ');
    assert.equal(result.updated_entry_count,1);
    assert.equal((await scalar("select wedding_venue from public.qr_bingo_contact_profiles where couple_bd_user_id='705'")).wedding_venue,'Americana Resort');
    const entry=await scalar('select couple_wedding_venue,consent_version from public.qr_bingo_raffle_entries where id=$1',[id(100)]);
    assert.equal(entry.couple_wedding_venue,'Americana Resort');assert.equal(entry.consent_version,base.consent_version);
    assert.equal((await scalar("select current_contact->>'wedding_venue' venue from public.qr_bingo_contact_profile_audit where couple_bd_user_id='705' order by profile_version desc limit 1")).venue,'Americana Resort');
  });
  await test('old eight-argument client preserves venue but clearing date clears both profile and entry venue',async()=>{
    await save('705','venue@example.test',1);
    assert.equal((await scalar("select wedding_venue from public.qr_bingo_contact_profiles where couple_bd_user_id='705'")).wedding_venue,'Americana Resort');
    await save('705','venue@example.test',2,{date:''});
    assert.equal((await scalar("select wedding_venue from public.qr_bingo_contact_profiles where couple_bd_user_id='705'")).wedding_venue,'');
    assert.equal((await scalar('select couple_wedding_venue from public.qr_bingo_raffle_entries where id=$1',[id(100)])).couple_wedding_venue,'');
  });
  await test('venue accepts 200 chars, rejects markup or oversized values atomically, and blank date normalizes venue empty',async()=>{
    await saveVenue('705','venue@example.test',3,'v'.repeat(200));
    for(const invalid of ['v'.repeat(201),'<b>Venue</b>','Venue\nHall']) await assert.rejects(saveVenue('705','venue@example.test',4,invalid),e=>e.code==='22023');
    assert.equal((await scalar("select version::int version from public.qr_bingo_contact_profiles where couple_bd_user_id='705'")).version,4);
    await saveVenue('705','venue@example.test',4,'Stale venue','');
    assert.equal((await scalar("select wedding_venue from public.qr_bingo_contact_profiles where couple_bd_user_id='705'")).wedding_venue,'');
  });
  await test('latest venue snapshot, admin filtering and new RPC access remain correctly scoped',async()=>{
    await saveVenue('706','other-venue@example.test',0,'Venue Search Hall');
    await insert('qr_bingo_raffle_entries',{...base,id:id(101),couple_bd_user_id:'706',vendor_bingo_id:'996',couple_email:'stale@example.test',couple_wedding_venue:'Stale venue'});
    assert.equal((await scalar('select couple_wedding_venue from public.qr_bingo_raffle_entries where id=$1',[id(101)])).couple_wedding_venue,'Venue Search Hall');
    for(const dataset of ['contacts','entries']) {
      const result=(await scalar('select public.read_qr_bingo_admin_data($1,$2,$3,$4,0,50) result',[dataset,event,'996','Venue Search Hall'])).result;
      assert.equal(result.total,1);assert.equal(result.rows[0].wedding_venue,'Venue Search Hall');
    }
    for(const role of ['anon','authenticated']) assert.equal((await scalar('select has_function_privilege($1,$2,$3) access',[role,'public.save_qr_bingo_contact_profile_with_venue(text,text,bigint,text,text,text,text,boolean,text)','EXECUTE'])).access,false);
  });
  await test('partners first names persist intact in contacts, existing and new opt-ins, and admin data',async()=>{
    await insert('qr_bingo_raffle_entries',{...base,id:id(102),couple_bd_user_id:'707',vendor_bingo_id:'997',couple_email:'partners@example.test'});
    const result=await save('707','partners@example.test',0,{name:'Alex & Jamie'});
    assert.equal(result.updated_entry_count,1);
    assert.equal((await scalar("select name from public.qr_bingo_contact_profiles where event_key=$1 and couple_bd_user_id='707'",[event])).name,'Alex & Jamie');
    await insert('qr_bingo_raffle_entries',{...base,id:id(103),couple_bd_user_id:'707',vendor_bingo_id:'998',couple_email:'partners@example.test'});
    for(const entryId of [id(102),id(103)]) assert.equal((await scalar('select couple_name from public.qr_bingo_raffle_entries where id=$1',[entryId])).couple_name,'Alex & Jamie');
    for(const dataset of ['contacts','entries']) {
      const report=(await scalar('select public.read_qr_bingo_admin_data($1,$2,$3,$4,0,50) result',[dataset,event,'997','Alex & Jamie'])).result;
      assert.equal(report.total,1);assert.equal(report.rows[0].name,'Alex & Jamie');
    }
  });
  console.log(`${passed} PostgreSQL migration tests passed.`);
} finally { await db.close(); }
