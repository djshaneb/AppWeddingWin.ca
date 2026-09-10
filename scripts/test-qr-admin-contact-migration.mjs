import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Runs only a local WASM PostgreSQL instance; never connects to Supabase.
const runtime = process.env.QR_CONTACT_PGLITE;
if (!runtime) throw new Error('Set QR_CONTACT_PGLITE to the installed pinned PGlite module path.');
const { PGlite } = await import(pathToFileURL(runtime));
const db = new PGlite();
const root = new URL('../', import.meta.url);
const columns = JSON.parse(await readFile(new URL('scripts/fixtures/qr-contact-schema-columns.json', root), 'utf8'));
const migrations = [
  '20260907132342_add_qr_bingo_contact_profiles.sql',
  '20260907134716_add_qr_bingo_optional_wedding_venue.sql',
  '20260908173748_qr_bingo_admin_contact_list_management.sql',
];
let passed = 0;
let request = 0;
const event = 'offline-admin-contacts';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const contact = { name: 'Alex & Jamie', email: 'alex@example.test', phone: '555-010-7001', wedding_date: '2028-02-29', wedding_venue: 'Test Venue' };
async function scalar(query, params = []) { return (await db.query(query, params)).rows[0]; }
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function insert(table, row) {
  const keys = Object.keys(row);
  await db.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
}
async function mutate(action, member, version, options = {}) {
  const requestId = options.requestId || uuid(++request);
  const proof = options.proof === undefined ? { id: member, subscription_id: '18', active: '2' } : options.proof;
  return (await scalar('select public.manage_qr_bingo_admin_contact($1,$2,$3,$4,$5,$6,$7,$8) result', [
    action, options.event || event, member, version, requestId, options.operator || 'Offline Admin',
    action === 'contact_add' ? options.contact || contact : {}, action === 'contact_add' ? proof : null,
  ])).result;
}
async function list(status = 'active', queryEvent = event, vendor = '') {
  return (await scalar('select public.read_qr_bingo_admin_contacts($1,$2,$3,0,100,$4) result', [queryEvent, vendor, '', status])).result;
}
async function untouchedRows() {
  const tables = ['qr_bingo_raffle_entries', 'qr_bingo_raffle_draws', 'qr_bingo_entrant_consent_acceptance_audit'];
  return Promise.all(tables.map(async (table) => (await db.query(`select to_jsonb(r) row from public.${table} r order by to_jsonb(r)::text`)).rows));
}

try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const table of new Set(columns.map((c) => c.table_name))) {
    await db.exec(`create table public.${table} (${columns.filter((c) => c.table_name === table).map((c) => `"${c.column_name}" ${c.data_type}`).join(',')});`);
  }
  await db.exec(`
    alter table public.qr_bingo_raffle_entries add primary key(id);
    alter table public.qr_bingo_raffle_entry_identities add unique(event_key,vendor_bingo_id,entrant_identity_hash);
    create table if not exists public.qr_bingo_email_test_fixtures(event_key text,couple_bd_user_id text,enabled boolean);
    create table public.qr_bingo_entrant_consent_acceptance_audit(id text, evidence jsonb);
    insert into public.qr_bingo_entrant_consent_acceptance_audit values('preserve-consent','{"accepted":true}');
    create function public.compute_qr_bingo_entrant_identity_hash(text) returns text language sql immutable as $$select md5(lower(trim($1)))$$;
    create schema weddingwin_private;
    create table weddingwin_private.pending_deleted_chat_identities(member_hash text,identity_hash text,normalization text,expires_at timestamptz);
    create table weddingwin_private.deleted_chat_identities(identity_hash text,normalization text,unique(identity_hash,normalization));
    create function weddingwin_private.chat_identity_hash(text) returns text language sql immutable as $$select md5($1)$$;
    create function weddingwin_private.is_deleted_chat_identity(text) returns boolean language sql as $$select exists(select 1 from weddingwin_private.deleted_chat_identities where identity_hash=md5($1))$$;
    create function public.purge_weddingwin_member_data_chat_redaction_v1(text,text,text) returns jsonb language plpgsql as $$begin insert into weddingwin_private.deleted_chat_identities(identity_hash,normalization) values(md5($1),'exact') on conflict do nothing;return '{"ok":true}'::jsonb;end;$$;
  `);
  await insert('qr_bingo_event_configs', { event_key: event, published: true, rules_version: '2026-09-01-in-person-entry' });
  // Historical control rows precede profile storage, as can happen in real data.
  await insert('qr_bingo_raffle_entries', { id: uuid(800), event_key: event, vendor_bingo_id: '901', couple_bd_user_id: '701', couple_name: 'Historical Name', couple_email: 'original@example.test', consent_share_contact: true, contact_share_scope: 'named_vendor_draw_administration', draw_administration_contact_share_acknowledged: true, vendor_marketing_consent: true });
  await insert('qr_bingo_raffle_draws', { id: uuid(801), event_key: event, vendor_bingo_id: '901', couple_bd_user_id: '701', winner_name: 'Original winner', winner_email: 'original@example.test' });
  for (const migration of migrations.slice(0, 2)) await db.exec(await readFile(new URL(`supabase/migrations/${migration}`, root), 'utf8'));
  const baseline = await untouchedRows();
  await db.exec(await readFile(new URL(`supabase/migrations/${migrations[2]}`, root), 'utf8'));

  await test('migration compiles; anon and authenticated cannot access mutation/read RPCs or audit', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const fn of ['manage_qr_bingo_admin_contact(text,text,text,bigint,uuid,text,jsonb,jsonb)', 'read_qr_bingo_admin_contacts(text,text,text,integer,integer,text)']) {
        assert.equal((await scalar('select has_function_privilege($1,$2,$3) allowed', [role, `public.${fn}`, 'EXECUTE'])).allowed, false);
      }
      assert.equal((await scalar('select has_table_privilege($1,$2,$3) allowed', [role, 'public.qr_bingo_admin_contact_audit', 'SELECT,INSERT,UPDATE,DELETE'])).allowed, false);
    }
    assert.equal((await scalar("select relrowsecurity rls from pg_class where oid='public.qr_bingo_admin_contact_audit'::regclass")).rls, true);
  });
  await test('Add creates only an event-scoped profile for a verified genuine couple', async () => {
    const result = await mutate('contact_add', '701', 0);
    assert.equal(result.version, 1); assert.equal(result.removed, false); assert.equal(result.replayed, false);
    const row = (await list()).rows[0];
    assert.equal(row.name, contact.name); assert.equal(row.source, 'admin'); assert.equal(row.removed, false);
    assert.equal((await scalar("select date_sync_pending from public.qr_bingo_contact_profiles where couple_bd_user_id='701'")).date_sync_pending, false);
    assert.deepEqual(await untouchedRows(), baseline);
  });
  await test('wrong membership, inactive, missing and mismatched trusted proof cannot add', async () => {
    for (const proof of [null, {}, { id: '702', subscription_id: '4', active: '2' }, { id: '702', subscription_id: '18', active: '1' }, { id: '701', subscription_id: '18', active: '2' }]) {
      await assert.rejects(mutate('contact_add', '702', 0, { proof }), (e) => e.code === '22023');
    }
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_contact_profiles where couple_bd_user_id='702'")).n, 0);
  });
  await test('Add rejects unknown events; known disabled fixture allowed only for exact couple', async () => {
    assert.equal((await mutate('contact_add', '702', 0, { event: 'unknown-event' })).code, 'event_unavailable');
    await db.exec("insert into public.qr_bingo_email_test_fixtures(event_key,couple_bd_user_id,enabled) values('email-test-admin-offline','702',false)");
    assert.equal((await mutate('contact_add', '703', 0, { event: 'email-test-admin-offline' })).code, 'event_unavailable');
    assert.equal((await mutate('contact_add', '702', 0, { event: 'email-test-admin-offline' })).ok, true);
  });
  await test('duplicate Add never overwrites an existing profile', async () => {
    assert.equal((await mutate('contact_add', '701', 0, { contact: { ...contact, name: 'Overwrite' } })).code, 'contact_exists');
    assert.equal((await list()).rows[0].name, contact.name);
  });
  const removeRequest = uuid(++request);
  await test('Remove is recoverable list-only metadata, with version conflict protection', async () => {
    assert.equal((await mutate('contact_remove', '701', 2)).code, 'contact_conflict');
    const before = await scalar("select name,email,phone,wedding_date,wedding_venue,date_sync_pending from public.qr_bingo_contact_profiles where couple_bd_user_id='701'");
    const result = await mutate('contact_remove', '701', 1, { requestId: removeRequest });
    assert.equal(result.version, 2); assert.equal(result.removed, true);
    assert.deepEqual(await scalar("select name,email,phone,wedding_date,wedding_venue,date_sync_pending from public.qr_bingo_contact_profiles where couple_bd_user_id='701'"), before);
    assert.deepEqual(await untouchedRows(), baseline);
    assert.equal((await list()).total, 0); assert.equal((await list('removed')).total, 1); assert.equal((await list('all')).total, 1);
    const legacy = (await scalar("select public.read_qr_bingo_admin_data('contacts',$1,'','',0,50) result", [event])).result;
    assert.equal(legacy.total, 0);
  });
  await test('same request replay is idempotent; changed payload under same UUID is rejected', async () => {
    const before = (await scalar('select count(*)::int n from public.qr_bingo_admin_contact_audit')).n;
    const replay = await mutate('contact_remove', '701', 1, { requestId: removeRequest });
    assert.equal(replay.replayed, true); assert.equal(replay.version, 2);
    assert.equal((await mutate('contact_remove', '701', 1, { requestId: removeRequest, operator: 'Changed Admin' })).code, 'request_conflict');
    assert.equal((await scalar('select count(*)::int n from public.qr_bingo_admin_contact_audit')).n, before);
  });
  await test('wrong scope, wrong state and Add-on-removed fail without changing history', async () => {
    assert.equal((await mutate('contact_remove', '701', 2)).code, 'contact_state_conflict');
    assert.equal((await mutate('contact_restore', '701', 2, { event: 'another-event' })).code, 'contact_not_found');
    assert.equal((await mutate('contact_add', '701', 0)).code, 'contact_removed');
    assert.deepEqual(await untouchedRows(), baseline);
  });
  await test('Restore brings back the same profile and source with no entry/consent edits', async () => {
    const result = await mutate('contact_restore', '701', 2);
    assert.equal(result.version, 3); assert.equal(result.removed, false);
    const row = (await list()).rows[0];
    assert.equal(row.source, 'admin'); assert.equal(row.removed_at, null);
    assert.equal((await list('active', event, '901')).total, 1);
    assert.equal((await list('active', event, '902')).total, 0);
    assert.deepEqual(await untouchedRows(), baseline);
  });
  await test('admin audit has metadata and no contact values or synthetic consent', async () => {
    const audit = (await db.query('select to_jsonb(a)::text raw from public.qr_bingo_admin_contact_audit a')).rows.map((x) => x.raw).join('');
    for (const secret of [contact.name, contact.email, contact.phone, contact.wedding_venue]) assert.equal(audit.includes(secret), false);
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_contact_profile_audit where couple_bd_user_id='701'")).n, 0);
    assert.deepEqual(await untouchedRows(), baseline);
  });
  await test('ordinary couple saves cannot silently restore a removed list row', async () => {
    await mutate('contact_remove', '701', 3);
    const saved = (await scalar('select public.save_qr_bingo_contact_profile_with_venue($1,$2,4,$3,$4,$5,$6,false,$7) result', [event, '701', contact.name, contact.email, contact.phone, contact.wedding_date, contact.wedding_venue])).result;
    assert.equal(saved.version, 5);
    assert.equal((await list()).total, 0); assert.equal((await list('removed')).rows[0].version, 5);
    assert.equal((await mutate('contact_restore', '701', 4)).code, 'contact_conflict');
    assert.equal((await mutate('contact_restore', '701', 5)).version, 6);
  });
  await test('remove/restore can manage an existing inactive/deleted-marker row without creating one', async () => {
    await db.exec("insert into weddingwin_private.deleted_chat_identities values(md5('701'),'exact')");
    assert.equal((await mutate('contact_remove', '701', 6)).ok, true);
    assert.equal((await mutate('contact_restore', '701', 7)).ok, true);
  });
  await test('real account purge also purges metadata audit; stale Add cannot recreate member', async () => {
    await scalar("select public.purge_weddingwin_member_data_with_chat_redaction('701','','') result");
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_admin_contact_audit where couple_bd_user_id='701'")).n, 0);
    await assert.rejects(mutate('contact_add', '701', 0), (e) => e.code === '42501');
    assert.equal((await list('all')).total, 0);
    assert.equal((await list('all', 'email-test-admin-offline')).total, 1);
  });
  await test('malformed contact/date/relay values fail atomically; invalid filters reject', async () => {
    for (const bad of [{ ...contact, wedding_date: '2027-02-29' }, { ...contact, email: 'relay@privaterelay.appleid.com' }, { ...contact, name: '<b>Name</b>' }, { ...contact, wedding_date: '', wedding_venue: 'Venue' }]) {
      await assert.rejects(mutate('contact_add', '704', 0, { contact: bad }));
    }
    await assert.rejects(list('bogus'));
    assert.equal((await scalar("select count(*)::int n from public.qr_bingo_contact_profiles where couple_bd_user_id='704'")).n, 0);
  });
  console.log(`${passed} admin-contact PostgreSQL tests passed.`);
} catch (error) {
  console.error({ message: error.message, code: error.code, query: error.query?.slice(0, 500), stack: error.code ? undefined : error.stack });
  process.exitCode = 1;
} finally {
  await db.close();
}
