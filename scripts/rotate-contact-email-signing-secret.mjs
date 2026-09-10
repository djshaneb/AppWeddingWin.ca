// Explicitly authorized operational rotation only. No secret output or files.
import { readFileSync, mkdtempSync, chmodSync, createWriteStream, unlinkSync, rmdirSync, openSync, closeSync, constants, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHmac, randomBytes } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = 'pszcjoyabwvzsxxjtkhs';
const mode = process.argv[2] || 'inspect';
const fail = () => { throw new Error('Scoped signing-key rotation check failed.'); };
const normalize = value => String(value || '').replace(/\r\n/g, '\n');
if (!['inspect', 'rotate', 'resume'].includes(mode)) fail();
let client, transport, phase = 'connect';
async function call(name, args) {
  const response = await client.callTool({ name, arguments: args });
  if (response.isError) fail();
  const body = JSON.parse(response.content?.find(item => item.type === 'text')?.text || '{}');
  if (body.status !== 'success') fail();
  return body;
}
async function widget(id) {
  const response = await call('getWidget', { widget_id: id, include_code: 1 });
  const rows = Array.isArray(response.message) ? response.message : [response.message];
  if (rows.length !== 1 || Number(rows[0]?.widget_id) !== id) fail();
  return rows[0];
}
const functionPattern = /function\s+ww_aecv_secrets\s*\(\s*\)\s*\{[\s\S]*?\}/g;
function keysFrom(source) {
  const functions = normalize(source).match(functionPattern);
  if (functions?.length !== 1) fail();
  const body = functions[0].match(/^function\s+ww_aecv_secrets\s*\(\s*\)\s*\{\s*return\s+array\(([\s\S]*?)\);\s*\}$/)?.[1];
  if (!body) fail();
  const matches = [...body.matchAll(/(['"])([A-Za-z0-9_+\/=.-]{32,256})\1/g)];
  if (!matches.length || matches.length > 4 || body.replace(/(['"])([A-Za-z0-9_+\/=.-]{32,256})\1/g, '').replace(/[\s,]/g, '') !== '') fail();
  return matches.map(match => match[2]);
}
async function setWidgetKeys(id, keys) {
  const before = await widget(id);
  keysFrom(before.widget_data);
  if (keys.some(key => !/^[A-Za-z0-9_+\/=.-]{32,256}$/.test(key))) fail();
  const source = normalize(before.widget_data).replace(functionPattern, `function ww_aecv_secrets() { return array(${keys.map(key => `'${key}'`).join(',')}); }`);
  const response = await call('updateWidget', { widget_id: id, widget_data: source });
  if (response.auto_cache_refreshed === false) await call('refreshSiteCache', {});
  const after = await widget(id);
  if (normalize(after.widget_data) !== source || normalize(after.widget_style) !== normalize(before.widget_style) || normalize(after.widget_javascript) !== normalize(before.widget_javascript)) fail();
}
function signedPayload(key, purpose, id) {
  const expires = Math.floor(Date.now() / 1000) + 120;
  return { user_id: id, expires, signature: createHmac('sha256', key).update(`${purpose}|${id}|${expires}`).digest('hex') };
}
async function callbackStatus(key) {
  // Synthetic non-existent member: successful authentication cannot mutate accounts.
  const payload = signedPayload(key, 'sync_verified_email', '9007199254740991');
  const response = await fetch(`https://${project}.supabase.co/functions/v1/bd-sync-confirmed-profile-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(25000) });
  const body = await response.json();
  if (body.ok !== false) fail();
  return response.status;
}
async function websiteStatus(key, expected) {
  const payload = signedPayload(key, 'status_app', '9007199254740991');
  const response = await fetch('https://www.weddingwin.ca/verify-email-change-app', { method: 'POST', body: new URLSearchParams({ ww_email_change_action: 'status_app', ...payload }), redirect: 'error', signal: AbortSignal.timeout(25000) });
  const body = await response.json();
  if (response.status !== expected || body.ok !== false) fail();
}
async function setBackendSecret(cliPath, nextKey) {
  const require = createRequire(pathToFileURL(cliPath));
  const packagePath = require.resolve('@supabase/cli-darwin-arm64/package.json');
  const binary = resolve(dirname(packagePath), 'bin/supabase');
  if (!binary.startsWith(resolve(homedir(), '.npm') + '/')) fail();
  const temporary = mkdtempSync('/tmp/weddingwin-email-key-pipe.');
  chmodSync(temporary, 0o700);
  const fifo = resolve(temporary, 'secret-input');
  let writer, child, timeout, out = '', err = '';
  try {
    const made = spawnSync('/usr/bin/mkfifo', ['-m', '600', fifo], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
    if (made.status !== 0) fail();
    const result = await new Promise(resolveResult => {
      child = spawn(binary, ['secrets', 'set', '--project-ref', project, '--env-file', fifo], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', data => { if (out.length < 1048576) out += data; });
      child.stderr.on('data', data => { if (err.length < 1048576) err += data; });
      child.on('error', () => resolveResult({ status: null, error: true }));
      child.on('exit', status => resolveResult({ status }));
      writer = createWriteStream(fifo, { flags: 'w', mode: 0o600 });
      writer.on('error', () => { child.kill('SIGTERM'); });
      writer.end(`APP_EMAIL_CHANGE_SECRET=${nextKey}\n`);
      timeout = setTimeout(() => { child.kill('SIGKILL'); resolveResult({ status: null, error: true }); }, 60000);
    });
    return { ...result, stdout: out, stderr: err };
  } finally {
    clearTimeout(timeout);
    writer?.destroy();
    // Release any writer waiting for a reader if CLI validation failed early.
    try { const fd = openSync(fifo, constants.O_RDONLY | constants.O_NONBLOCK); closeSync(fd); } catch {}
    try { unlinkSync(fifo); } catch {}
    try { rmdirSync(temporary); } catch {}
  }
}
async function main() {
  const toolsDir = resolve(homedir(), '.cursor/weddingwin-tools');
  const sdk = resolve(toolsDir, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client');
  const config = JSON.parse(readFileSync(resolve(repo, '.cursor/mcp.json'), 'utf8'));
  const command = resolve(homedir(), '.local/bin/node');
  const args = [resolve(toolsDir, 'launch-bd-mcp.mjs')];
  if (Object.values(config.mcpServers || {}).filter(server => server.type === 'stdio' && server.command === command && JSON.stringify(server.args) === JSON.stringify(args)).length !== 1) fail();
  const { Client } = await import(pathToFileURL(resolve(sdk, 'index.js')));
  const { StdioClientTransport } = await import(pathToFileURL(resolve(sdk, 'stdio.js')));
  transport = new StdioClientTransport({ command, args, stderr: 'pipe' });
  client = new Client({ name: 'weddingwin-contact-email-key-rotation', version: '1.0.0' });
  await client.connect(transport); transport.stderr?.on('data', () => {});
  const app = await widget(329), web = await widget(320);
  if (!normalize(app.widget_data).includes('WW_EMAIL_VERIFICATION_PAGE_START') || !normalize(web.widget_data).includes('WW_EMAIL_VERIFICATION_PAGE_START')) fail();
  const appKeys = keysFrom(app.widget_data), webKeys = keysFrom(web.widget_data);
  if (JSON.stringify(appKeys) !== JSON.stringify(webKeys)) fail();
  const previousKeys = [...new Set([...appKeys, ...webKeys])];
  const nextKey = mode === 'resume' ? previousKeys[0] : randomBytes(32).toString('hex');
  const oldKeys = mode === 'resume' ? previousKeys.slice(1) : previousKeys;
  if (mode === 'resume' && (!/^[a-f0-9]{64}$/.test(nextKey) || oldKeys.length < 1)) fail();
  if (oldKeys.length > 3) fail();
  console.log(JSON.stringify({ mode, project, widgets: [329, 320], scope: 'APP_EMAIL_CHANGE_SECRET only', privateConfigurationValidated: true }));
  if (mode === 'inspect') {
    const traceRoot = resolve(homedir(), '.supabase/traces');
    let checked = 0, secretFound = false;
    if (existsSync(traceRoot)) for (const entry of readdirSync(traceRoot, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = resolve(traceRoot, entry.name), stat = statSync(file);
      if (stat.size > 5 * 1024 * 1024 || Date.now() - stat.mtimeMs > 60 * 60 * 1000) continue;
      checked++;
      const trace = readFileSync(file, 'utf8');
      if (previousKeys.some(key => trace.includes(key))) secretFound = true;
    }
    console.log(JSON.stringify({ recentCliTraceFilesChecked: checked, currentSecretFoundInTraces: secretFound }));
    if (secretFound) fail();
    return;
  }
  phase = 'publish overlapping CMS verification keys';
  if (mode !== 'resume') for (const id of [329, 320]) await setWidgetKeys(id, [nextKey, ...oldKeys]);
  await websiteStatus(nextKey, 503);
  console.log(JSON.stringify({ overlappingCmsKeysVerified: true }));
  phase = 'set backend secret through private stdin';
  const located = spawnSync(resolve(homedir(), '.local/bin/npm'), ['exec', '--offline', '--package=supabase', '--', 'which', 'supabase'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, maxBuffer: 1024 * 1024 });
  const cliPath = String(located.stdout || '').trim();
  if (located.status !== 0 || !cliPath.startsWith(resolve(homedir(), '.npm') + '/') || !cliPath.endsWith('/node_modules/.bin/supabase') || /[\r\n]/.test(cliPath)) fail();
  // A private named FIFO carries bytes in the kernel only; no secret file/argv.
  const result = await setBackendSecret(cliPath, nextKey);
  // Never echo stdout/stderr or a child-process exception containing stdin.
  if (result.error || result.status !== 0) {
    const diagnostic = String(result.stderr || '') + String(result.stdout || '');
    console.log(JSON.stringify({ cliFailed: true, exitStatus: result.status, timeout: result.error?.code === 'ETIMEDOUT', fileReadError: /(?:read|open).*(?:stdin|env|file)|device not configured|no such file/i.test(diagnostic), authError: /access token|unauthorized|login|authentication/i.test(diagnostic), apiError: /unexpected status|api|server|forbidden/i.test(diagnostic), inputError: /parse|invalid|format|empty/i.test(diagnostic) }));
    fail();
  }
  phase = 'verify backend acceptance of new key';
  if (await callbackStatus(nextKey) !== 503) fail();
  for (const oldKey of oldKeys) if (await callbackStatus(oldKey) !== 401) fail();
  console.log(JSON.stringify({ backendNewKeyAccepted: true, backendOldKeysRejected: true }));
  phase = 'remove all old CMS keys';
  for (const id of [329, 320]) await setWidgetKeys(id, [nextKey]);
  await websiteStatus(nextKey, 503);
  for (const oldKey of oldKeys) await websiteStatus(oldKey, 401);
  for (const id of [329, 320]) {
    const saved = await widget(id), keys = keysFrom(saved.widget_data);
    if (keys.length !== 1 || keys[0] !== nextKey || oldKeys.some(key => normalize(saved.widget_data).includes(key))) fail();
  }
  console.log(JSON.stringify({ rotationComplete: true, oldKeysRemovedFromBothWidgets: true, secretFilesWritten: 0, appleIdentityChanges: 0, accountMutations: 0, emailsSent: 0 }));
}
try { await main(); }
catch { console.error(`Contact-email key rotation stopped during ${phase}. No credentials printed. Inspect the current state before retrying.`); process.exitCode = 1; }
finally { try { await client?.close(); await transport?.close(); } catch {} }
