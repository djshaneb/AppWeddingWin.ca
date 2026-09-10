// Operational CMS deployment. Private widget configuration stays only in memory.
// Never log MCP payloads, child output, source diffs, credentials, or caught errors.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'inspect';
const fail = () => { throw new Error('Scoped verification deployment check failed.'); };
if (!['inspect', 'deploy', 'deploy-email-pages'].includes(mode)) fail();
const normalize = value => String(value || '').replace(/\r\n/g, '\n');
const local = path => normalize(readFileSync(resolve(repo, 'brilliant-directories', path), 'utf8'));
const privateFunction = /function\s+ww_aecv_secrets\s*\(\s*\)\s*\{[\s\S]*?\}/g;
const stub = 'function ww_aecv_secrets() { /* WW_PRIVATE_EMAIL_CHANGE_SECRETS */ return array(); }';
let client, transport;
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) fail();
  const text = result.content?.find(item => item.type === 'text')?.text;
  const payload = JSON.parse(text || '{}');
  if (payload.status !== 'success') fail();
  return payload;
}
async function widget(id) {
  const payload = await call('getWidget', { widget_id: id, include_code: 1 });
  const rows = Array.isArray(payload.message) ? payload.message : [payload.message];
  if (rows.length !== 1 || Number(rows[0]?.widget_id) !== id) fail();
  return rows[0];
}
async function page(id) {
  const payload = await call('getWebPage', { seo_id: id, include_code: 1, include_content: 1 });
  const rows = Array.isArray(payload.message) ? payload.message : [payload.message];
  if (rows.length !== 1 || Number(rows[0]?.seo_id) !== id) fail();
  return rows[0];
}
async function cachedWrite(name, args) {
  const response = await call(name, args);
  if (response.auto_cache_refreshed === false) await call('refreshSiteCache', {});
}
async function main() {
  const toolsDir = resolve(homedir(), '.cursor/weddingwin-tools');
  const config = JSON.parse(readFileSync(resolve(repo, '.cursor/mcp.json'), 'utf8'));
  const expectedCommand = resolve(homedir(), '.local/bin/node');
  const expectedLauncher = resolve(toolsDir, 'launch-bd-mcp.mjs');
  const matches = Object.values(config.mcpServers || {}).filter(server => server.type === 'stdio' && server.command === expectedCommand && JSON.stringify(server.args) === JSON.stringify([expectedLauncher]));
  if (matches.length !== 1) fail();
  const sdk = resolve(toolsDir, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client');
  const { Client } = await import(pathToFileURL(resolve(sdk, 'index.js')));
  const { StdioClientTransport } = await import(pathToFileURL(resolve(sdk, 'stdio.js')));
  transport = new StdioClientTransport({ command: expectedCommand, args: [expectedLauncher], stderr: 'pipe' });
  client = new Client({ name: 'weddingwin-email-verification-deployment', version: '1.0.0' });
  await client.connect(transport);
  transport.stderr?.on('data', () => {});
  const originals = new Map();
  for (const id of [329, 320, 258]) originals.set(id, await widget(id));
  const source = normalize(originals.get(329).widget_data);
  const functions = source.match(privateFunction);
  if (functions?.length !== 1) fail();
  const secretSource = functions[0];
  const arrayBody = secretSource.match(/^function\s+ww_aecv_secrets\s*\(\s*\)\s*\{\s*return\s+array\(([\s\S]*?)\);\s*\}$/)?.[1];
  if (!arrayBody) fail();
  const quoted = [...arrayBody.matchAll(/(['"])([A-Za-z0-9_+\/=.-]{32,256})\1/g)];
  if (!quoted.length || quoted.length > 4 || arrayBody.replace(/(['"])([A-Za-z0-9_+\/=.-]{32,256})\1/g, '').replace(/[\s,]/g, '') !== '') fail();
  const secrets = quoted.map(match => match[2]);
  const prepared = [];
  for (const [id, prefix] of [[329, '329-app-email-change-verification'], [320, '320-email-change-verification']]) {
    const clean = local(`widgets/${prefix}.php`);
    if (clean.split(stub).length !== 2 || secrets.some(secret => clean.includes(secret))) fail();
    prepared.push({ id, patch: { widget_id: id, widget_data: clean.replace(stub, secretSource), widget_style: local(`widgets/${prefix}.css`), widget_javascript: `<script>\n${local(`widgets/${prefix}.js`)}\n</script>` } });
  }
  const qr = local('widgets/258-julian-qr-code-bingo.php');
  if (!qr.includes('WW_EMAIL_VERIFICATION_CORE_START') || !qr.includes('Confirm Contact Email') || secrets.some(secret => qr.includes(secret))) fail();
  if (mode !== 'deploy-email-pages') prepared.push({ id: 258, patch: { widget_id: 258, widget_data: qr } });
  const pages = [];
  for (const [id, expectedPath] of [[4298, 'verify-email-change'], [4309, 'verify-email-change-app']]) {
    const before = await page(id);
    if (String(before.filename).replace(/^\//, '') !== expectedPath) fail();
    const markerStart = '<!-- WW_EMAIL_VERIFICATION_HEAD_START -->';
    const markerEnd = '<!-- WW_EMAIL_VERIFICATION_HEAD_END -->';
    const previousHead = normalize(before.content_head);
    const cleanHead = previousHead.replace(/<!-- WW_EMAIL_VERIFICATION_HEAD_START -->[\s\S]*?<!-- WW_EMAIL_VERIFICATION_HEAD_END -->\s*/g, '').trimEnd();
    const head = `${cleanHead}${cleanHead ? '\n' : ''}${markerStart}\n${local('pages/email-verification-head.html')}${markerEnd}`;
    pages.push({ id, before, head });
  }
  console.log(JSON.stringify({ mode, preparedWidgets: prepared.map(item => item.id), preparedPages: pages.map(item => item.id), privateConfiguration: 'validated in memory; no values persisted or printed' }));
  if (mode === 'inspect') return;
  // Re-read immediately before each write; abort rather than overwrite concurrent work.
  for (const { id, patch } of prepared) {
    const current = await widget(id), before = originals.get(id);
    for (const field of ['widget_data', 'widget_style', 'widget_javascript']) if (normalize(current[field]) !== normalize(before[field])) fail();
    await cachedWrite('updateWidget', patch);
    const after = await widget(id);
    for (const [field, value] of Object.entries(patch)) if (field !== 'widget_id' && normalize(after[field]) !== normalize(value)) fail();
    if (id === 258) for (const field of ['widget_style', 'widget_javascript']) if (normalize(after[field]) !== normalize(before[field])) fail();
    console.log(JSON.stringify({ widgetId: id, roundTripVerified: true }));
  }
  for (const { id, before, head } of pages) {
    const current = await page(id);
    if (normalize(current.content_head) !== normalize(before.content_head) || current.filename !== before.filename || current.content !== before.content) fail();
    await cachedWrite('updateWebPage', { seo_id: id, content_head: head });
    const after = await page(id);
    if (normalize(after.content_head) !== normalize(head) || after.filename !== before.filename || after.content !== before.content) fail();
    console.log(JSON.stringify({ pageId: id, headRoundTripVerified: true }));
  }
  const endpoint = 'https://www.weddingwin.ca/verify-email-change-app';
  for (const action of ['status_app', 'request_app']) {
    for (const invalid of ['', 'f'.repeat(64)]) {
      const body = new URLSearchParams({ ww_email_change_action: action, user_id: '999999999999999999', expires: String(Math.floor(Date.now() / 1000) + 120), signature: invalid, new_email: 'offline-probe@example.invalid' });
      const response = await fetch(endpoint, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(25000) });
      const value = await response.json();
      if (response.status !== 401 || value.ok !== false) fail();
    }
  }
  console.log(JSON.stringify({ unsignedAndBadSignatureProbes: 4, rejected: true, accountMutations: 0, testEmails: 0 }));
}
try { await main(); }
catch { console.error('Verification deployment stopped. No private source or credentials printed. Inspect saved state before retrying.'); process.exitCode = 1; }
finally { try { await client?.close(); await transport?.close(); } catch {} }
