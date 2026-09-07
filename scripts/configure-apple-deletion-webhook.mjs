// Operational helper: keeps BD and Vault credentials in memory, never in output.
// The disabled admin_members row must already exist. No member is deleted here.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Operational failures must not dump an API response, child stdout, or secret URL.
process.on('uncaughtException', () => {
  console.error('Webhook configuration failed. No credentials were printed; inspect the current state before retrying.');
  process.exit(1);
});

const project = 'pszcjoyabwvzsxxjtkhs';
const endpoint = `https://${project}.supabase.co/functions/v1/apple-member-deleted`;
const mode = process.argv[2] || 'inspect';
assert(['inspect', 'enable', 'disable'].includes(mode), 'Use inspect, enable, or disable');
const config = readFileSync(join(homedir(), '.codex/config.toml'), 'utf8');
const section = config.match(/^\[mcp_servers\.brilliant-directories\.env\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
assert(section, 'Existing Brilliant Directories connector configuration not found');
const setting = (name) => {
  const line = section.split('\n').find((line) => line.startsWith(`${name} = `));
  assert(line, 'Required connector setting missing');
  return JSON.parse(line.slice(name.length + 3));
};
const site = setting('BD_SITE_URL');
assert.equal(site, 'https://www.weddingwin.ca');
const key = setting('BD_API_KEY');
async function api(path, method = 'GET', body) {
  const response = await fetch(`${site}/api/v2/bd_webhooks/${path}`, {
    method, headers: { 'X-Api-Key': key, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? new URLSearchParams(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, 'BD webhook API failed');
  const value = await response.json();
  assert.equal(value.status, 'success', 'BD webhook API did not confirm success');
  return value;
}
async function current() {
  const value = await api('get?property=webhook_type&property_operator=eq&property_value=admin_members');
  const rows = Array.isArray(value.message) ? value.message : Object.values(value.message || {});
  const matching = rows.filter((row) => row.webhook_type === 'admin_members');
  assert.equal(matching.length, 1, 'Expected exactly one staged admin_members webhook');
  const row = matching[0];
  assert.equal(String(row.webhook_id), '1', 'Unexpected webhook ID; inspect before editing');
  const url = new URL(row.webhook_link);
  assert.equal(`${url.origin}${url.pathname}`, endpoint, 'Existing webhook has a different destination');
  return row;
}
function safeSummary(row) {
  const url = new URL(row.webhook_link);
  return { webhookId: row.webhook_id, event: row.webhook_type, enabled: String(row.webhook_status) === '1', endpoint, hasSecret: url.searchParams.has('secret') };
}
const before = await current();
if (mode === 'inspect') {
  console.log(JSON.stringify(safeSummary(before)));
} else {
  let destination = before.webhook_link;
  if (mode === 'enable') {
    const raw = execFileSync('npm', ['exec', '--offline', '--package=supabase', '--', 'supabase', 'db', 'query', '--linked', '--project-ref', project,
      "select decrypted_secret as secret from vault.decrypted_secrets where name='apple_member_deleted_secret'", '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
    const rows = JSON.parse(raw).rows;
    assert.equal(rows?.length, 1, 'Expected exactly one private webhook secret');
    assert.match(rows[0].secret, /^[a-f0-9]{64}$/, 'Unexpected private secret format');
    const url = new URL(endpoint);
    url.searchParams.set('secret', rows[0].secret);
    destination = url.href;
    // Do not enable a dead or unprotected receiver. This is an update, not deletion.
    const probe = await fetch(destination, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_action: 'member_updated', user_id: '999999999999999999' }), signal: AbortSignal.timeout(20000) });
    assert.equal(probe.status, 200, 'Authenticated non-delete probe failed');
    const result = await probe.json();
    assert.equal(result.ignored, true, 'Non-delete event must be ignored');
    const unauthorized = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_action: 'member_updated' }), signal: AbortSignal.timeout(20000) });
    assert.equal(unauthorized.status, 401, 'Receiver must reject events without its secret');
    const incorrect = await fetch(`${endpoint}?secret=incorrect-test-secret`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_action: 'member_updated' }),
      signal: AbortSignal.timeout(20000) });
    assert.equal(incorrect.status, 401, 'Receiver must reject an incorrect secret');
  }
  await api('update', 'PUT', { webhook_id: String(before.webhook_id), webhook_status: mode === 'enable' ? '1' : '0', webhook_link: destination });
  const after = await current();
  assert.equal(String(after.webhook_status), mode === 'enable' ? '1' : '0');
  assert(after.webhook_link === destination, 'Webhook destination did not round-trip');
  console.log(JSON.stringify({ ...safeSummary(after), verified: true }));
}
