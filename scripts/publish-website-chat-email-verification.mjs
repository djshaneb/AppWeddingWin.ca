#!/usr/bin/env node
// Scoped BD MCP publisher. Default is read-only. Uses the existing secure-store
// launcher; never reads, prints, writes, or passes any connector credential.
// Run --apply --private-table-confirmed only after the authenticated DB preflight.
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localTools = resolve(homedir(), '.cursor/weddingwin-tools');
const baseline = {
  "356": {
    "name": "WeddingWin Chat New Thread Guard API",
    "widget_data": "16dcde6879b212aee1e514833a344fa4552b59535b4071c98bc233385b5d41ed",
    "widget_style": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "widget_javascript": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "357": {
    "name": "Bootstrap Theme - Member Profile - Contact Page",
    "widget_data": "9d0e7cc6afc4c1fa73f630924032ac1f768d6e2637a7fbde5c11166dc8702d06",
    "widget_style": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "widget_javascript": "95ee72ca844d499d9c202db9bf04d58fa2c75053c9742ec13b7a6023743d699e"
  }
};
const codeFields = ['widget_data', 'widget_style', 'widget_javascript'];
const files = {
  356: { widget_data: '356-chat-new-thread-guard.php' },
  357: {
    widget_data: '357-member-profile-contact.php',
    widget_style: '357-member-profile-contact.css',
    widget_javascript: '357-member-profile-contact.js',
  },
};
const normalize = value => String(value ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const hash = value => createHash('sha256').update(normalize(value)).digest('hex');
const ownError = message => Object.assign(new Error(message), { safeToPrint: true });
function unpack(result) {
  if (!result || result.isError) throw ownError('The website connector rejected the operation.');
  let payload;
  try { payload = JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}'); }
  catch { throw ownError('The website connector returned an unexpected response.'); }
  if (payload.status !== 'success') throw ownError('The website operation was not confirmed successful.');
  return payload;
}
function sameCode(a, b) { return codeFields.every(key => hash(a[key]) === hash(b[key])); }

async function main(args) {
  if (args.some(arg => !['--apply', '--private-table-confirmed'].includes(arg))) throw ownError('Unknown argument.');
  const apply = args.includes('--apply');
  if (apply && !args.includes('--private-table-confirmed')) throw ownError('Private table provisioning must be confirmed before publishing.');
  const config = JSON.parse(readFileSync(resolve(repo, '.cursor/mcp.json'), 'utf8'));
  const server = config.mcpServers?.['WeddingWin-Website'];
  const launcher = resolve(localTools, 'launch-bd-mcp.mjs');
  if (server?.type !== 'stdio' || server.command !== resolve(homedir(), '.local/bin/node') ||
      JSON.stringify(server.args) !== JSON.stringify([launcher])) {
    throw ownError('Unexpected website connector configuration; review it before publishing.');
  }
  const sdk = resolve(localTools, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client');
  const { Client } = await import(pathToFileURL(resolve(sdk, 'index.js')));
  const { StdioClientTransport } = await import(pathToFileURL(resolve(sdk, 'stdio.js')));
  const transport = new StdioClientTransport({ command: server.command, args: server.args, stderr: 'pipe' });
  // Consume but never print launcher diagnostics: they may contain private URLs.
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'weddingwin-scoped-chat-email-publisher', version: '1.0.0' });
  let stage = 'connect';
  const updates = [];
  const timer = setTimeout(() => { void transport.close(); }, 120_000);
  const get = async id => {
    const payload = unpack(await client.callTool({ name: 'getWidget', arguments: { widget_id: id, include_code: 1 } }));
    const rows = Array.isArray(payload.message) ? payload.message : [payload.message];
    const row = rows.find(item => item && String(item.widget_id) === String(id));
    if (!row || row.widget_name !== baseline[id].name || codeFields.some(key => typeof row[key] !== 'string')) {
      throw ownError('The exact expected website widget was not returned.');
    }
    return row;
  };
  try {
    await client.connect(transport);
    const plan = [];
    for (const id of [356, 357]) {
      stage = 'preflight-' + id;
      const current = await get(id);
      const desired = { ...current };
      for (const [key, name] of Object.entries(files[id])) desired[key] = readFileSync(resolve(repo, 'brilliant-directories/widgets', name), 'utf8');
      for (const key of codeFields) {
        if (hash(current[key]) !== baseline[id][key] && hash(current[key]) !== hash(desired[key])) {
          throw ownError('Widget ' + id + ' changed since review. No unreviewed content will be overwritten.');
        }
      }
      if (id === 357 && (!desired.widget_javascript.trimStart().startsWith('<script>') || /<style/i.test(desired.widget_style))) {
        throw ownError('The website code-field wrappers are invalid.');
      }
      plan.push({ id, current, desired, needsUpdate: !sameCode(current, desired) });
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'read-only', plan: plan.map(item => ({ widgetId: item.id, needsUpdate: item.needsUpdate, fields: Object.keys(files[item.id]) })) }));
    if (!apply) return;
    const backupDir = mkdtempSync(resolve(tmpdir(), 'weddingwin-chat-widget-backup-'));
    writeFileSync(resolve(backupDir, 'widgets-before.json'), JSON.stringify(plan.map(item => ({
      widget_id: item.id, widget_name: item.current.widget_name,
      ...Object.fromEntries(codeFields.map(key => [key, item.current[key]])),
    }))), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ backupDirectory: backupDir }));
    for (const item of plan) {
      if (!item.needsUpdate) { updates.push({ widgetId: item.id, result: 'already-current' }); continue; }
      stage = 'recheck-' + item.id;
      if (!sameCode(await get(item.id), item.current)) throw ownError('Widget changed during preflight; publishing stopped.');
      stage = 'update-' + item.id;
      const payload = { widget_id: item.id };
      for (const key of Object.keys(files[item.id])) payload[key] = item.desired[key];
      unpack(await client.callTool({ name: 'updateWidget', arguments: payload }));
      stage = 'verify-' + item.id;
      const after = await get(item.id);
      if (!sameCode(after, item.desired)) throw ownError('Saved widget did not match the scoped update; inspect before any retry.');
      updates.push({ widgetId: item.id, result: 'saved-and-roundtrip-verified' });
      console.log(JSON.stringify(updates[updates.length - 1]));
    }
  } catch (error) {
    // Never print arbitrary SDK/HTTP/server errors, source code, or raw payloads.
    console.error(JSON.stringify({ stage, completed: updates,
      error: error?.safeToPrint ? error.message : 'Connector operation failed or was interrupted. Re-read current widgets before retrying.' }));
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}
main(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({ error: error?.safeToPrint ? error.message : 'Local configuration or runtime could not be verified.' }));
  process.exitCode = 1;
});

