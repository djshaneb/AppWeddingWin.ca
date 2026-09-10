import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const read = file => readFileSync(new URL(`../brilliant-directories/${file}`, import.meta.url), 'utf8');
const core = read('widgets/email-verification-core.php');
const page = read('widgets/email-verification-page.php');
const web = read('widgets/320-email-change-verification.php');
const app = read('widgets/329-app-email-change-verification.php');
const qr = read('widgets/258-julian-qr-code-bingo.php');
const js = read('widgets/320-email-change-verification.js');
const marked = (source, tag) => source.match(new RegExp(`/\\* ${tag}_START \\*/([\\s\\S]*?)/\\* ${tag}_END \\*/`))?.[1];

test('deployed standalone widgets share the exact private proof helper and page controller', () => {
  for (const target of [web, app, qr]) assert.equal(marked(target, 'WW_EMAIL_VERIFICATION_CORE'), marked(core, 'WW_EMAIL_VERIFICATION_CORE'));
  for (const target of [web, app]) assert.equal(marked(target, 'WW_EMAIL_VERIFICATION_PAGE'), marked(page, 'WW_EMAIL_VERIFICATION_PAGE'));
  assert.ok(web.includes('$wwEvApp = false;')); assert.ok(app.includes('$wwEvApp = true;'));
  assert.equal(js, read('widgets/329-app-email-change-verification.js'));
});

test('new status signature is purpose-bound; confirmation uses POST and fixed callback', () => {
  assert.ok(page.includes("'status_app|' . $id . '|' . $expires"));
  assert.ok(page.includes("$action === 'status_app' ? 300 : 600"));
  assert.ok(page.includes("'sync_verified_email|' . $id . '|' . $expires"));
  assert.ok(page.includes("$wwEvMethod === 'POST' && $wwEvAction === 'confirm'"));
  assert.equal((page.match(/ww_ev_confirm\(/g) || []).length, 1);
  assert.ok(page.includes('CURLOPT_FOLLOWLOCATION => false'));
  assert.ok(page.includes('weddingwin://email-confirmed'));
  assert.doesNotMatch(page, /email-confirmed\?email|CURLOPT_SSL_VERIFYPEER\s*=>\s*false|error_log|console\./);
  assert.ok(page.includes('WW_PRIVATE_EMAIL_CHANGE_SECRETS */ return array();'));
  assert.ok(read('pages/email-verification-head.html').includes('strict-origin'));
  assert.ok(page.includes("@header('Referrer-Policy: strict-origin');"));
  assert.ok(page.includes('<meta name="referrer" content="strict-origin">'));
  assert.doesNotMatch(page, /no-referrer/);
});

test('QR gate checks fresh authoritative contact proof before scan and draw writes', () => {
  assert.ok(qr.includes("$authoritativeMember = ww_ev_user(isset($user['user_id'])"));
  assert.ok(qr.includes('ww_email_verification_state($authoritativeMember)'));
  assert.ok(qr.includes("array('scan_vendor', 'raffle_offer', 'raffle_opt_in'), true)\n                && !$qrContactComplete"));
  assert.ok(qr.includes("'profile_edit_url' => $verificationRequired || $contactEmailRequired ? '/verify-email-change'"));
  assert.ok(qr.includes('$verificationRequired = true;'));
  assert.doesNotMatch(core, /CREATE TABLE|custom_email_confirmed_email|custom_email_confirmed_at/);
});

function fixture(responseBody, { hold = false, httpOk = true } = {}) {
  const listeners = {}, requests = [], nav = [], buttons = [{ disabled: false }, { disabled: false }];
  const status = { textContent: '' }, input = { value: 'contact@example.invalid' };
  const form = { reportValidity: () => true, querySelector: () => input, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const refresh = { addEventListener: (name, fn) => { listeners.refresh = fn; } };
  const root = { dataset: {}, querySelectorAll: () => buttons, querySelector: selector => ({ '[data-email-request-form]': form, '[data-email-status]': status, '[data-email-refresh]': refresh }[selector] || null) };
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const context = vm.createContext({ document: { querySelector: () => root }, URLSearchParams, AbortController, setTimeout: () => 1, clearTimeout: () => {}, window: { location: { assign: url => nav.push(url) } }, fetch: async (url, request) => { requests.push({ url, request }); if (hold) await pending; return { ok: httpOk, json: async () => responseBody }; } });
  const run = () => vm.runInContext(js, context); run();
  return { run, root, listeners, requests, nav, buttons, status, release };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('rapid submit sends one request, uses fixed same-origin route and restores controls', async () => {
  const f = fixture({ ok: true, message: 'Check your email.' }, { hold: true });
  for (let i = 0; i < 20; i++) f.listeners.submit({ preventDefault() {} });
  assert.equal(f.requests.length, 1); assert.ok(f.buttons.every(button => button.disabled));
  assert.equal(f.requests[0].url, '/verify-email-change'); assert.equal(f.requests[0].request.credentials, 'same-origin');
  assert.equal(new URLSearchParams(f.requests[0].request.body).get('new_email'), 'contact@example.invalid');
  f.release(); await tick(); assert.equal(f.status.textContent, 'Check your email.'); assert.ok(f.buttons.every(button => !button.disabled)); assert.deepEqual(f.nav, []);
});
test('status never resends email; pending, expired, relay and malformed results never open Bingo', async () => {
  for (const body of [
    { ok: true, current_email: 'direct@example.invalid', email_confirmation_required: true, email_verification_status: 'pending' },
    { ok: true, current_email: 'direct@example.invalid', email_confirmation_required: true, email_verification_status: 'expired' },
    { ok: true, current_email: 'relay@privaterelay.appleid.com', email_confirmation_required: false, email_verification_status: 'none' },
    { ok: true },
  ]) {
    const f = fixture(body); f.listeners.refresh(); await tick();
    assert.equal(new URLSearchParams(f.requests[0].request.body).get('new_email'), null); assert.deepEqual(f.nav, []); assert.ok(f.status.textContent);
  }
});
test('confirmed contact status opens only the fixed QR route; duplicate initialization has no effect', async () => {
  const f = fixture({ ok: true, current_email: 'direct@example.invalid', email_confirmation_required: false, email_verification_status: 'confirmed' });
  const listener = f.listeners.refresh; for (let i = 0; i < 20; i++) f.run(); assert.equal(f.listeners.refresh, listener);
  f.listeners.refresh(); await tick(); assert.deepEqual(f.nav, ['/qr']);
});
