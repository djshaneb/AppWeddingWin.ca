// No member deletion or real Apple authorization. Secrets never leave memory.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
process.on('uncaughtException', () => {
  console.error('Apple cleanup live check failed. Credentials and response bodies were withheld.');
  process.exit(1);
});
const project = 'pszcjoyabwvzsxxjtkhs';
const base = `https://${project}.supabase.co/functions/v1`;
function query(sql) {
  return JSON.parse(execFileSync('npm', ['exec', '--offline', '--package=supabase', '--', 'supabase', 'db', 'query', '--linked', '--project-ref', project, sql, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 })).rows;
}
const secrets = Object.fromEntries(query("select name,decrypted_secret from vault.decrypted_secrets where name in ('apple_member_deleted_secret','apple_revocation_worker_secret')").map(row => [row.name, row.decrypted_secret]));
assert(Object.values(secrets).length === 2 && Object.values(secrets).every(value => /^[a-f0-9]{64}$/.test(value)));
const receipt = new URL(`${base}/apple-member-deleted`);
receipt.searchParams.set('secret', secrets.apple_member_deleted_secret);
async function check(name, url, expected, init, test = () => {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, expected, name);
  const raw = await response.text();
  assert(Object.values(secrets).every(value => !raw.includes(value)), 'Credential disclosure');
  test(JSON.parse(raw));
  console.log(JSON.stringify({ check: name, http: response.status, passed: true }));
}
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
await check('receipt GET rejected', receipt, 405, {});
await check('receipt missing secret rejected', `${base}/apple-member-deleted`, 401, post({ user_action: 'member_updated' }));
await check('receipt wrong secret rejected', `${base}/apple-member-deleted?secret=not-authorized`, 401, post({ user_action: 'member_updated' }));
await check('authenticated unrelated event ignored', receipt, 200, post({ user_action: 'member_updated' }), body => assert.equal(body.ignored, true));
await check('authenticated malformed deletion rejected', receipt, 400, post({ user_action: 'member_deleted', user_id: 'invalid-id' }));
await check('ambiguous deletion rejected', receipt, 400, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"user_action":"member_deleted","user_id":"1","user_id":"2"}' });
await check('worker GET rejected', `${base}/apple-revocation-worker`, 405, {});
await check('worker unauthenticated rejected', `${base}/apple-revocation-worker`, 401, post({}));
const pending = query("select count(*)::integer as count from apple_private.deletion_jobs where status in ('pending','retry','running')")[0].count;
if (pending === 0) {
  await check('authenticated empty worker idle', `${base}/apple-revocation-worker`, 200,
    { ...post({}), headers: { 'Content-Type': 'application/json', 'X-WeddingWin-Apple-Worker-Secret': secrets.apple_revocation_worker_secret } },
    body => { assert.equal(body.status, 'idle'); assert.equal(body.revoked, 0); });
} else {
  console.log(JSON.stringify({ check: 'authenticated empty worker idle', skipped: 'Real pending jobs exist; no test dispatch performed' }));
}
