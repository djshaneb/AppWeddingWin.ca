#!/usr/bin/env node
// Execute the actual widget request function against fake, offline transport.
// PHP guard contracts supplement independent backend signature/replay tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const directory = '../brilliant-directories/widgets/';
const raw = readFileSync(new URL(`${directory}328-qr-bingo-vendor-draw-dashboard.js`, import.meta.url), 'utf8');
const source = raw.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const parsed = ts.createSourceFile('widget.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function find(predicate) {
  let result;
  function visit(node) { if (result) return; if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(parsed);
  assert.ok(result, 'Tested production function is missing');
  return result.getText(parsed);
}
const requestCode = ['text', 'request'].map(name => find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)).join('\n');
const bridgeDeclaration = find(node => ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'BRIDGE_URL');
const php = readFileSync(new URL(`${directory}328-qr-bingo-vendor-draw-dashboard.php`, import.meta.url), 'utf8');
const menuPhp = readFileSync(new URL(`${directory}220-vendor-dashboard-menu.php`, import.meta.url), 'utf8');
const scannerPhp = readFileSync(new URL(`${directory}258-julian-qr-code-bingo.php`, import.meta.url), 'utf8');
const csrf = 'c'.repeat(64);

function harness(options = {}) {
  const calls = [], timers = new Map();
  const root = { dataset: { userId: '39033', csrf, ...options.dataset } };
  const context = { AbortController, root, calls,
    window: { setTimeout: callback => { timers.set(1, callback); return 1; }, clearTimeout: id => timers.delete(id) },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (options.transport) return options.transport(url, init);
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, saved: true }) };
    },
  };
  vm.runInNewContext(`const ${bridgeDeclaration};\n${requestCode}\nglobalThis.perform = request;`, context);
  return { root, calls, timers, request: (action, extra) => context.perform(root, action, extra) };
}

test('vendor actions use only the same-origin CSRF bridge, never native credentials or a direct Edge URL', async () => {
  const h = harness();
  const result = await h.request('vendor_raffle_update', { prize_description: 'Fictional test only', enabled: false });
  assert.equal(result.ok, true);
  assert.equal(h.calls.length, 1);
  const { url, init } = h.calls[0];
  assert.equal(url, 'https://www.weddingwin.ca/qr-bingo-vendor-draw?ww_qrvd_bridge=1');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(init.body), { prize_description: 'Fictional test only', enabled: false, action: 'vendor_raffle_update', csrf });
  assert.equal(h.timers.size, 0);
  assert.doesNotMatch(source, /native_session|dataset\.token|PUBLISHABLE_KEY|functions\/v1\/bd-qr-bingo-vendor-sync/);
});

test('caller extras cannot override the intended action or session CSRF', async () => {
  const h = harness();
  await h.request('vendor_raffle_get', { action: 'vendor_raffle_send_notice', csrf: 'wrong' });
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { action: 'vendor_raffle_get', csrf });
});

for (const dataset of [{ userId: '' }, { csrf: '' }, { csrf: 'not-a-valid-csrf' }]) {
  test(`missing member or session CSRF makes no request: ${JSON.stringify(dataset)}`, async () => {
    const h = harness({ dataset });
    await assert.rejects(h.request('vendor_raffle_get'), error => error.status === 401);
    assert.equal(h.calls.length, 0);
  });
}

test('bridge rejection is surfaced without success or a direct-native fallback', async () => {
  const h = harness({ transport: async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ ok: false, error: 'Refresh the page before continuing.' }) }) });
  await assert.rejects(h.request('vendor_raffle_get'), error => error.status === 403 && /Refresh/.test(error.message));
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.size, 0);
});

test('a timed-out bridge request is aborted and cannot trigger an alternate request', async () => {
  const h = harness({ transport: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }, { once: true });
  }) });
  const pending = h.request('vendor_raffle_get');
  h.timers.get(1)();
  await assert.rejects(pending, /timed out|too long/i);
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.size, 0);
});

test('vendor PHP requires BD authentication, exact canonical member, Origin, JSON and member-bound CSRF before signing', () => {
  assert.match(php, /user::isUserLogged\(\$_COOKIE\)/);
  assert.match(php, /getUser\(\$_COOKIE\['userid'\], \$w\)/);
  assert.match(php, /\(string\)\$ww_qrvd_member\['user_id'\] === \(string\)\$_COOKIE\['userid'\]/);
  assert.match(php, /\$_SERVER\['HTTP_ORIGIN'\] !== 'https:\/\/www\.weddingwin\.ca'/);
  assert.match(php, /strtolower\(trim\(\$ww_qrvd_content_type\[0\]\)\) !== 'application\/json'/);
  assert.match(php, /hash_equals\(\$ww_qrvd_csrf, \$ww_qrvd_payload\['csrf'\]\)/);
  assert.ok(php.indexOf('hash_equals($ww_qrvd_csrf') < php.indexOf('$ww_qrvd_secret = ww_qrvd_signing_secret'));
  assert.match(php, /'native_session', 'website_member_id', 'website_session_token'/);
  assert.doesNotMatch(php + menuPhp, /data-token=|\$ww_qrvd_token|wwvdMemberToken/);
  assert.match(php, /\$ww_qrvd_payload\['website_member_id'\] = \$ww_qrvd_user_id/);
  assert.match(php, /for \(\$attempt = 0; \$attempt < \$levels; \$attempt\+\+\)/);
  assert.match(php, /ob_get_level\(\) >= \$before\) break/);
});

test('both PHP bridges sign exact bodies with separated scopes and transport only over the fixed TLS endpoint', () => {
  for (const code of [php, scannerPhp]) {
    assert.match(code, /weddingwin:qr-bingo:website-key:v1/);
    assert.match(code, /hash\('sha256', /);
    assert.match(code, /time\(\) \+ 30/);
    assert.match(code, /x-ww-website-body-sha256:/);
    assert.match(code, /CURLOPT_SSL_VERIFYPEER => true/);
    assert.match(code, /CURLOPT_SSL_VERIFYHOST => 2/);
    assert.match(code, /CURLOPT_FOLLOWLOCATION => false/);
    assert.match(code, /CURLOPT_MAXREDIRS => 0/);
  }
  assert.match(php, /weddingwin:qr-bingo:vendor-website:v1/);
  assert.match(scannerPhp, /weddingwin:qr-bingo:couple-website:v1/);
});

test('couple website auth and POST guards bind actual member, role and CSRF; no browser transport token is emitted', () => {
  assert.match(scannerPhp, /\(string\)\$member\['user_id'\] !== \(string\)\$_COOKIE\['userid'\]/);
  assert.match(scannerPhp, /in_array\(\(string\)\$member\['subscription_id'\], array\('4', '18'\), true\)/);
  assert.match(scannerPhp, /hash_equals\(\$qrWebsiteCsrf, \$_POST\['qr_csrf'\]\)/);
  assert.match(scannerPhp, /form\.set\('qr_csrf', QR_WEBSITE_CSRF\)/);
  assert.match(scannerPhp, /body: `qr_csrf=\$\{encodeURIComponent\(QR_WEBSITE_CSRF\)\}&action=scan_vendor/);
  assert.match(scannerPhp, /body: `qr_csrf=\$\{encodeURIComponent\(QR_WEBSITE_CSRF\)\}&action=get_scanned/);
  assert.match(scannerPhp, /const QR_AUTHENTICATED_MEMBER_ID =/);
  assert.match(scannerPhp, /const QR_WEBSITE_CSRF =/);
  const scriptBodies = [...scannerPhp.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  assert.doesNotMatch(scriptBodies, /website_session_token|native_session|data-token/);
});
