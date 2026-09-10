import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Offline PostgreSQL rehearsal only. The pinned PGlite runtime is supplied by
// the caller; this script never connects to Supabase or loads credentials.
const runtime = process.env.QR_SCANNER_PGLITE;
if (!runtime) throw new Error('Set QR_SCANNER_PGLITE to the installed pinned PGlite module path.');
const { PGlite } = await import(pathToFileURL(runtime));
const db = new PGlite();
const root = new URL('../', import.meta.url);
const migrationName = '20260908182505_qr_bingo_early_scanner_control.sql';
// Schema-only pg_get_functiondef snapshots read on 2026-09-08. These exact
// definitions let the rehearsal exercise the migration's real baseline guards.
const baselineSql = await readFile(new URL('scripts/fixtures/qr-scanner-control-baseline.sql', root), 'utf8');
const keys = [
  'event_key', 'event_name', 'vendor_tag_id', 'history_starts_at', 'scan_enabled',
  'vendor_draws_enabled', 'email_delivery_mode', 'send_vendor_email', 'send_couple_email',
  'vendor_email_subject', 'couple_email_subject', 'rules_version', 'official_rules_url',
  'alternate_free_entry_url', 'eligibility_region', 'draw_opens_at', 'entry_closes_at', 'draw_at',
];
let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }
async function scalar(sql, params = []) { return (await db.query(sql, params)).rows[0]; }
async function current() { return (await scalar('select to_jsonb(c) value from public.qr_bingo_event_configs c where published')).value; }
async function publish(patch = {}, expectedRevision) {
  const before = await current();
  const config = Object.fromEntries(keys.map(key => [key, before[key]]));
  Object.assign(config, patch);
  return (await scalar('select public.publish_qr_bingo_event_config($1,$2,$3) result', [expectedRevision ?? before.revision, config, 'Offline scanner test'])).result;
}
async function counts() {
  return scalar('select (select count(*)::int from public.qr_bingo_event_configs) configs, (select count(*)::int from public.qr_bingo_event_config_audit) audits');
}
async function untouched() {
  const tables = ['qr_bingo_raffle_entries', 'qr_bingo_vendor_offer_versions', 'qr_bingo_legacy_qa_archives'];
  return Promise.all(tables.map(async table => (await db.query(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`)).rows));
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth to anon, authenticated, service_role;
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  const originalMigration = await readFile(new URL('supabase/migrations/20260829180000_create_qr_bingo_event_configuration.sql', root), 'utf8');
  await db.exec(originalMigration.slice(0, originalMigration.indexOf('-- Seed the current production event')));
  await db.exec(`
    alter table public.qr_bingo_event_configs add column venue_name text;
    alter table public.qr_bingo_event_configs add column app_card_enabled boolean not null default true;
    create table public.qr_bingo_vendor_offer_versions(event_key text,offer_enterable boolean,activation_excluded_as_legacy_qa boolean,evidence jsonb);
    create table public.qr_bingo_raffle_entries(id uuid,event_key text,evidence jsonb);
    create table public.qr_bingo_legacy_qa_archives(entry_id uuid,evidence jsonb);
  `);
  await db.exec(baselineSql);
  await db.exec(`
    revoke all on function public.apply_qr_bingo_app_card_controls() from public, anon, authenticated, service_role;
    revoke all on function public.publish_qr_bingo_event_config(bigint,jsonb,text) from public, anon, authenticated;
    revoke all on function public.publish_qr_bingo_event_config_locked(bigint,jsonb,text) from public, anon, authenticated;
    grant execute on function public.publish_qr_bingo_event_config(bigint,jsonb,text) to service_role;
    grant execute on function public.publish_qr_bingo_event_config_locked(bigint,jsonb,text) to service_role;
    create trigger apply_qr_bingo_app_card_controls before insert on public.qr_bingo_event_configs for each row execute function public.apply_qr_bingo_app_card_controls();
    create trigger gate_activated_qr_bingo_event_material_publish before insert on public.qr_bingo_event_configs for each row execute function public.gate_activated_qr_bingo_event_material_publish();
    create trigger require_qr_bingo_rules_version_bump before insert on public.qr_bingo_event_configs for each row execute function public.require_qr_bingo_rules_version_bump();
  `);
  const seed = {
    event_key: 'scanner-offline', event_name: 'Fictional Wedding Show', vendor_tag_id: 30,
    history_starts_at: '2026-10-18T15:00:00Z', scan_enabled: true, vendor_draws_enabled: true,
    email_delivery_mode: 'disabled', send_vendor_email: false, send_couple_email: false,
    vendor_email_subject: 'Offline vendor notice', couple_email_subject: 'Offline couple notice',
    rules_version: 'offline-rules-1', official_rules_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
    alternate_free_entry_url: 'https://www.weddingwin.ca/qr-bingo-free-entry', eligibility_region: 'Ontario',
    draw_opens_at: '2026-10-18T19:00:00Z', entry_closes_at: '2026-10-18T19:00:00Z', draw_at: '2026-10-18T19:00:00Z',
    venue_name: 'Fictional Hall', app_card_enabled: true,
  };
  const initial = (await scalar('select public.publish_qr_bingo_event_config(0,$1,$2) result', [seed, 'Offline seed'])).result;
  assert.equal(initial.ok, true);
  await db.exec(`
    insert into public.qr_bingo_vendor_offer_versions values('scanner-offline',true,false,'{"original_offer":"preserve"}');
    insert into public.qr_bingo_raffle_entries values('00000000-0000-4000-8000-000000000001','scanner-offline','{"original_consent":"preserve"}');
  `);
  const original = await current();
  const originalAudit = (await db.query('select to_jsonb(a) value from public.qr_bingo_event_config_audit a')).rows;
  const preserved = await untouched();
  const lockedBefore = await scalar("select md5(pg_get_functiondef('public.publish_qr_bingo_event_config_locked(bigint,jsonb,text)'::regprocedure)) hash");
  const migration = await readFile(new URL(`supabase/migrations/${migrationName}`, root), 'utf8');
  await db.exec(migration);

  await test('migration compiles against exact live signatures without publishing or rewriting history', async () => {
    const after = await current();
    assert.equal(after.scan_open_early, false); assert.equal(after.scan_early_access_starts_at, null);
    delete after.scan_open_early; delete after.scan_early_access_starts_at;
    assert.deepEqual(after, original);
    assert.deepEqual((await db.query('select to_jsonb(a) value from public.qr_bingo_event_config_audit a')).rows, originalAudit);
    assert.deepEqual(await counts(), { configs: 1, audits: 1 });
    assert.deepEqual(await untouched(), preserved);
    assert.deepEqual(await scalar("select md5(pg_get_functiondef('public.publish_qr_bingo_event_config_locked(bigint,jsonb,text)'::regprocedure)) hash"), lockedBefore);
  });

  let firstEnabledAt;
  await test('first enable records the database transaction timestamp and audit snapshot', async () => {
    await db.exec('begin');
    try {
      const transaction = await scalar('select transaction_timestamp()::text started');
      const result = await publish({ scan_open_early: true });
      assert.equal(result.ok, true); assert.equal(result.config.scan_open_early, true);
      firstEnabledAt = result.config.scan_early_access_starts_at;
      assert.equal(Date.parse(firstEnabledAt), Date.parse(transaction.started));
      const audit = (await scalar('select config_snapshot from public.qr_bingo_event_config_audit where revision=$1', [result.config.revision])).config_snapshot;
      assert.equal(audit.scan_early_access_starts_at, firstEnabledAt); assert.equal(audit.scan_open_early, true);
      await db.exec('commit');
    } catch (error) { await db.exec('rollback'); throw error; }
  });

  await test('unrelated publication and legacy callers preserve early timestamp, toggle, venue and card', async () => {
    const result = await publish({ vendor_email_subject: 'Updated offline subject' });
    assert.equal(result.ok, true); assert.equal(result.config.scan_open_early, true);
    assert.equal(result.config.scan_early_access_starts_at, firstEnabledAt);
    assert.equal(result.config.venue_name, 'Fictional Hall'); assert.equal(result.config.app_card_enabled, true);
  });

  await test('turning early access off preserves accepted progress history and the original schedule', async () => {
    const result = await publish({ scan_open_early: false });
    assert.equal(result.ok, true); assert.equal(result.config.scan_open_early, false);
    assert.equal(result.config.scan_early_access_starts_at, firstEnabledAt);
    for (const key of ['history_starts_at', 'entry_closes_at', 'draw_opens_at', 'draw_at', 'rules_version']) assert.equal(result.config[key], original[key]);
  });

  await test('turning on again and changing master pause never reset first access or override the pause value', async () => {
    const result = await publish({ scan_open_early: true, scan_enabled: false, app_card_enabled: false, venue_name: 'Updated Hall' });
    assert.equal(result.ok, true); assert.equal(result.config.scan_early_access_starts_at, firstEnabledAt);
    assert.equal(result.config.scan_open_early, true); assert.equal(result.config.scan_enabled, false);
    assert.equal(result.config.app_card_enabled, false); assert.equal(result.config.venue_name, 'Updated Hall');
  });

  await test('invalid boolean, client timestamps and unknown controls fail atomically without handoff leakage', async () => {
    for (const patch of [
      ...['true', 1, null, [], {}].map(scan_open_early => ({ scan_open_early })),
      { scan_early_access_starts_at: '2000-01-01T00:00:00Z' },
      { scan_opens_at: '2000-01-01T00:00:00Z' }, { scan_history_starts_at: '2000-01-01T00:00:00Z' },
      { scan_open_early: false, unknown_control: true },
    ]) {
      const before = await counts();
      const result = await publish(patch);
      assert.equal(result.ok, false); assert.equal(result.conflict, false);
      assert.deepEqual(await counts(), before);
      assert.equal((await current()).scan_early_access_starts_at, firstEnabledAt);
      assert(['', '{}', null].includes((await scalar("select current_setting('weddingwin.qr_bingo_app_card_controls',true) value")).value));
    }
    assert.equal((await publish()).config.scan_open_early, true);
  });

  await test('two publishers with one revision have one winner and one CAS conflict', async () => {
    const expected = (await current()).revision;
    const first = await publish({ scan_open_early: false }, expected);
    const beforeConflict = await counts();
    const second = await publish({ scan_open_early: true }, expected);
    assert.equal(first.ok, true); assert.equal(second.ok, false); assert.equal(second.conflict, true);
    assert.deepEqual(await counts(), beforeConflict);
    assert.equal((await current()).scan_open_early, false);
    assert.equal((await current()).scan_early_access_starts_at, firstEnabledAt);
  });

  await test('same-event material draw terms remain locked and all original offer/consent rows survive', async () => {
    const before = await counts();
    await assert.rejects(publish({ history_starts_at: '2026-10-18T04:00:00Z', rules_version: 'attempted-material-change' }), error => error.code === '55000');
    assert.deepEqual(await counts(), before);
    assert.deepEqual(await untouched(), preserved);
    assert.equal((await current()).history_starts_at, original.history_starts_at);
  });

  await test('a different future event starts disabled with no inherited early history', async () => {
    const result = await publish({ event_key: 'future-scanner-offline', rules_version: 'offline-rules-2', history_starts_at: '2027-01-18T16:00:00Z', entry_closes_at: '2027-01-18T20:00:00Z', draw_opens_at: '2027-01-18T20:00:00Z', draw_at: '2027-01-18T20:00:00Z' });
    assert.equal(result.ok, true); assert.equal(result.config.scan_open_early, false);
    assert.equal(result.config.scan_early_access_starts_at, null);
    assert.equal(result.config.venue_name, 'Venue to be announced'); assert.equal(result.config.app_card_enabled, true);
    const enabled = await publish({ scan_open_early: true });
    assert.equal(enabled.ok, true); assert.notEqual(enabled.config.scan_early_access_starts_at, firstEnabledAt);
  });

  await test('current Toronto midnight conversion handles daylight saving time without changing show time', async () => {
    const got = await scalar("select (date_trunc('day',timestamptz '2026-10-18 15:00Z' at time zone 'America/Toronto') at time zone 'America/Toronto')::text summer, (date_trunc('day',timestamptz '2027-01-18 16:00Z' at time zone 'America/Toronto') at time zone 'America/Toronto')::text winter");
    assert.equal(Date.parse(got.summer), Date.parse('2026-10-18T04:00:00Z'));
    assert.equal(Date.parse(got.winter), Date.parse('2027-01-18T05:00:00Z'));
  });

  await test('anonymous/authenticated callers cannot publish or access tables; existing RLS remains on', async () => {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await scalar('select has_function_privilege($1,$2,$3) allowed', [role, 'public.publish_qr_bingo_event_config(bigint,jsonb,text)', 'EXECUTE'])).allowed, false);
      assert.equal((await scalar('select has_table_privilege($1,$2,$3) allowed', [role, 'public.qr_bingo_event_configs', 'SELECT,INSERT,UPDATE,DELETE'])).allowed, false);
      await db.exec(`set role ${role}`);
      try { await assert.rejects(db.query("select public.publish_qr_bingo_event_config(1,'{}','Unauthorized')"), error => error.code === '42501'); }
      finally { await db.exec('reset role'); }
    }
    assert.equal((await scalar("select relrowsecurity enabled from pg_class where oid='public.qr_bingo_event_configs'::regclass")).enabled, true);
    assert.equal((await scalar("select has_table_privilege('service_role','public.qr_bingo_event_configs','INSERT,UPDATE,DELETE') allowed")).allowed, false);
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    try { await assert.rejects(publish({ scan_open_early: true }), error => error.code === '42501'); }
    finally { await db.exec("select set_config('request.jwt.claim.role','service_role',false)"); }
  });

  await test('immutable revisions and audit cannot be edited directly', async () => {
    await assert.rejects(db.exec('update public.qr_bingo_event_configs set scan_open_early=false where published'), error => error.code === '55000');
    await assert.rejects(db.exec('update public.qr_bingo_event_configs set scan_early_access_starts_at=null where published'), error => error.code === '55000');
    await assert.rejects(db.exec("update public.qr_bingo_event_config_audit set actor='Changed'"), error => error.code === '55000');
    assert.deepEqual(await untouched(), preserved);
  });

  await test('migration refuses a changed baseline rather than overwriting it', async () => {
    await assert.rejects(db.exec(migration), error => /baseline changed/.test(error.message));
  });
  console.log(`${passed} scanner-control PostgreSQL tests passed.`);
} catch (error) {
  console.error({ message: error.message, code: error.code, query: error.query?.slice(0, 300), stack: error.code ? undefined : error.stack });
  process.exitCode = 1;
} finally {
  await db.close();
}
