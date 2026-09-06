#!/usr/bin/env node
// Executes the real widget 220 IIFE with a minimal DOM and fake responses.
// No browser, account, credentials, network, database or email is used.
// Run: node --test scripts/test-vendor-dashboard-link.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const widgetPath = '../brilliant-directories/widgets/220-vendor-dashboard-menu';
const raw = readFileSync(new URL(`${widgetPath}.js`, import.meta.url), 'utf8');
const php = readFileSync(new URL(`${widgetPath}.php`, import.meta.url), 'utf8');
const css = readFileSync(new URL(`${widgetPath}.css`, import.meta.url), 'utf8');
const source = raw.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const configUrl = 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin?action=public_config';
const fixtureUrl = 'https://www.weddingwin.ca/qr-bingo-vendor-draw?ww_qrvd_bridge=1';
const fakeCsrf = 'a'.repeat(64);
const fakeToken = 'not-a-real-unit-test-credential';
const configBody = (patch = {}) => ({ ok: true, event_config: { vendor_tag_id: 30, revision: 8, ...patch } });
const fixtureBody = (patch = {}) => ({
  ok: true, app_review_fixture: true, email_test_fixture: false,
  vendor: { id: '39029', user_id: '39029' }, ...patch,
});
const response = (body, ok = true) => ({ ok, json: async () => body });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(options = {}) {
  const link = {
    hidden: false,
    isConnected: true,
    dataset: {
      userId: '39029', userActive: '2', memberTags: '[30]', token: fakeToken, csrf: fakeCsrf,
      ...options.dataset,
    },
    removeAttribute(name) {
      assert.equal(name, 'data-token');
      delete this.dataset.token;
    },
  };
  const requests = [], listeners = [], timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    AbortController,
    window: {
      setTimeout(callback, duration) { timers.set(++timerId, { callback, duration }); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
    document: {
      readyState: options.loading ? 'loading' : 'complete',
      querySelectorAll(selector) {
        assert.equal(selector, '[data-ww-vendor-bingo-launch]');
        return options.noLink ? [] : [link];
      },
      addEventListener(name, callback, config) {
        assert.equal(name, 'DOMContentLoaded');
        assert.equal(config.once, true);
        listeners.push(callback);
      },
    },
    fetch: async (url, request = {}) => {
      requests.push({ url, request });
      if (options.transport) return options.transport(url, request, requests.length);
      if (url === configUrl) {
        if (options.configError) throw new Error('Fictional public-config failure');
        return options.configResponse ?? response(options.configBody ?? configBody());
      }
      assert.equal(url, fixtureUrl);
      if (options.fixtureError) throw new Error('Fictional authenticated fixture failure');
      return options.fixtureResponse ?? response(options.fixtureBody ?? fixtureBody());
    },
  });
  const run = () => vm.runInContext(source, context, { filename: '220-vendor-dashboard-menu.js' });
  const settle = async () => { for (let index = 0; index < 5; index += 1) await new Promise(setImmediate); };
  run();
  return {
    link, requests, timers, run, settle,
    fireReady: () => listeners.splice(0).forEach(callback => callback()),
  };
}

test('active currently tagged vendor is shown using only public configuration, with no authenticated raffle-get or settings initialization', async () => {
  const h = harness();
  assert.equal(h.link.hidden, true, 'The link must start hidden until eligibility is checked');
  assert.equal(h.link.dataset.token, undefined, 'The DOM credential is removed synchronously');
  await h.settle();
  assert.equal(h.link.hidden, false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, configUrl);
  assert.equal(h.requests[0].request.method, undefined);
  assert.equal(h.requests[0].request.body, undefined);
  assert.equal(h.requests[0].request.headers, undefined);
  assert.equal(h.timers.size, 0);
});

test('the current published tag determines eligibility instead of a hardcoded tag', async () => {
  const oldTag = harness({ configBody: configBody({ vendor_tag_id: 31 }) });
  const currentTag = harness({ configBody: configBody({ vendor_tag_id: 31 }), dataset: { memberTags: '[31]' } });
  await Promise.all([oldTag.settle(), currentTag.settle()]);
  assert.equal(oldTag.link.hidden, true);
  assert.equal(currentTag.link.hidden, false);
  assert.equal(oldTag.requests.length, 1);
  assert.equal(currentTag.requests.length, 1);
});

for (const tags of ['[]', '[31]', '["30"]', '{}', 'not JSON']) {
  test(`nonparticipating or malformed member tags stay hidden: ${tags}`, async () => {
    const h = harness({ dataset: { memberTags: tags } });
    await h.settle();
    assert.equal(h.link.hidden, true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
  });
}

for (const userId of ['', '0', '-1', 'anonymous', '1.5']) {
  test(`invalid/anonymous member ID makes no request: ${JSON.stringify(userId)}`, async () => {
    const h = harness({ dataset: { userId } });
    await h.settle();
    assert.equal(h.link.hidden, true);
    assert.equal(h.requests.length, 0);
    assert.equal(h.link.dataset.token, undefined);
  });
}

test('a server-rendered anonymous page with no link makes no request', async () => {
  const h = harness({ noLink: true });
  await h.settle();
  assert.equal(h.requests.length, 0);
});

for (const [label, body] of [
  ['declared unsuccessful', { ...configBody(), ok: false }],
  ['missing success flag', { event_config: configBody().event_config }],
  ['null', null], ['empty', {}], ['missing event configuration', { ok: true }],
  ['noninteger tag', configBody({ vendor_tag_id: 30.5 })],
  ['string tag', configBody({ vendor_tag_id: '30' })],
  ['zero tag', configBody({ vendor_tag_id: 0 })],
  ['negative tag', configBody({ vendor_tag_id: -30 })],
  ['unsafe tag', configBody({ vendor_tag_id: Number.MAX_SAFE_INTEGER + 1 })],
  ['missing revision', configBody({ revision: undefined })],
  ['zero revision', configBody({ revision: 0 })],
  ['noninteger revision', configBody({ revision: 1.5 })],
]) {
  test(`unsuccessful/malformed public configuration fails closed: ${label}`, async () => {
    // A response wrapper intentionally distinguishes a JSON null response from the default fixture.
    const h = harness({ configResponse: response(body) });
    await h.settle();
    assert.equal(h.link.hidden, true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
  });
}

for (const [label, options] of [
  ['HTTP failure', { configResponse: response(configBody(), false) }],
  ['network failure', { configError: true }],
  ['invalid JSON', { configResponse: { ok: true, json: async () => { throw new SyntaxError('Fictional invalid JSON'); } } }],
]) {
  test(`public configuration ${label} remains hidden without an authenticated fallback`, async () => {
    const h = harness(options);
    await h.settle();
    assert.equal(h.link.hidden, true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
  });
}

test('inactive private review vendor requires a matching authenticated isolated fixture', async () => {
  const h = harness({ dataset: { userActive: '1' } });
  assert.equal(h.link.dataset.token, undefined);
  await h.settle();
  assert.equal(h.link.hidden, false);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].url, fixtureUrl);
  assert.equal(h.requests[1].request.method, 'POST');
  assert.equal(h.requests[1].request.credentials, 'same-origin');
  assert.equal(h.requests[1].request.cache, 'no-store');
  assert.equal(h.requests[1].request.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(h.requests[1].request.body), {
    action: 'vendor_dashboard_access',
    csrf: fakeCsrf,
  });
  assert.equal(h.timers.size, 0);
});

test('inactive private email-test vendor can use the matching authenticated fixture', async () => {
  const h = harness({ dataset: { userActive: '1' }, fixtureBody: fixtureBody({ app_review_fixture: false, email_test_fixture: true }) });
  await h.settle();
  assert.equal(h.link.hidden, false);
  assert.equal(h.requests.length, 2);
});

test('inactive vendor without a CSRF token never calls the authenticated bridge', async () => {
  const h = harness({ dataset: { userActive: '1', csrf: '' } });
  await h.settle();
  assert.equal(h.link.hidden, true);
  assert.equal(h.requests.length, 1);
});

test('untagged inactive account never calls the fixture endpoint', async () => {
  const h = harness({ dataset: { userActive: '1', memberTags: '[]' } });
  await h.settle();
  assert.equal(h.link.hidden, true);
  assert.equal(h.requests.length, 1);
});

for (const [label, body] of [
  ['ordinary inactive production vendor', fixtureBody({ app_review_fixture: false })],
  ['unknown fixture flag', { ok: true, unknown_fixture: true, vendor: { id: '39029', user_id: '39029' } }],
  ['nonboolean fixture flag', fixtureBody({ app_review_fixture: 'true' })],
  ['unsuccessful fixture response', fixtureBody({ ok: false })],
  ['missing vendor', fixtureBody({ vendor: undefined })],
  ['wrong vendor ID', fixtureBody({ vendor: { id: '39030', user_id: '39029' } })],
  ['wrong owner ID', fixtureBody({ vendor: { id: '39029', user_id: '39030' } })],
  ['missing owner ID', fixtureBody({ vendor: { id: '39029' } })],
]) {
  test(`inactive fixture gate fails closed for ${label}`, async () => {
    const h = harness({ dataset: { userActive: '1' }, fixtureBody: body });
    await h.settle();
    assert.equal(h.link.hidden, true);
    assert.equal(h.requests.length, 2);
    assert.equal(h.timers.size, 0);
  });
}

for (const [label, options] of [
  ['HTTP failure', { fixtureResponse: response(fixtureBody(), false) }],
  ['network failure', { fixtureError: true }],
  ['invalid JSON', { fixtureResponse: { ok: true, json: async () => { throw new SyntaxError('Fictional invalid JSON'); } } }],
]) {
  test(`authenticated fixture ${label} remains hidden`, async () => {
    const h = harness({ dataset: { userActive: '1' }, ...options });
    await h.settle();
    assert.equal(h.link.hidden, true);
    assert.equal(h.requests.length, 2);
    assert.equal(h.timers.size, 0);
  });
}

test('a timeout aborts the request, clears its timer and keeps the link hidden', async () => {
  const h = harness({ transport: async (_url, request) => new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new Error('Fictional timeout')), { once: true });
  }) });
  assert.equal(h.timers.size, 1);
  const [{ callback, duration }] = h.timers.values();
  assert.equal(duration, 15000);
  callback();
  await h.settle();
  assert.equal(h.link.hidden, true);
  assert.equal(h.requests[0].request.signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

for (const loading of [false, true]) {
  test(`duplicate widget execution runs just one eligibility check (DOMContentLoaded pending: ${loading})`, async () => {
    const wait = deferred();
    const h = harness({ loading, transport: async () => { await wait.promise; return response(configBody()); } });
    h.run();
    if (loading) h.fireReady();
    assert.equal(h.requests.length, 1);
    wait.resolve();
    await h.settle();
    assert.equal(h.link.hidden, false);
    h.run();
    if (loading) h.fireReady();
    await h.settle();
    assert.equal(h.requests.length, 1);
  });
}

for (const inactive of [false, true]) {
  for (const change of ['identity', 'detachment']) {
    test(`stale ${inactive ? 'fixture' : 'public-config'} response cannot reveal a link after ${change}`, async () => {
      const wait = deferred();
      const h = harness({
        dataset: { userActive: inactive ? '1' : '2' },
        transport: async (url) => {
          if (inactive && url === configUrl) return response(configBody());
          await wait.promise;
          return response(inactive ? fixtureBody() : configBody());
        },
      });
      await h.settle();
      if (change === 'identity') h.link.dataset.userId = '39030';
      else h.link.isConnected = false;
      wait.resolve();
      await h.settle();
      assert.equal(h.link.hidden, true);
      assert.equal(h.timers.size, 0);
    });
  }
}

test('the dashboard renders one accessible plain HTTPS link in the same window and safely scopes its hidden state', () => {
  const links = php.match(/<a\b[^]*?data-ww-vendor-bingo-launch[^]*?<\/a>/g) || [];
  assert.equal(links.length, 1);
  const link = links[0];
  assert.match(link, /href="https:\/\/www\.weddingwin\.ca\/qr-bingo-vendor-draw"/);
  assert.match(link, /data-ww-vendor-bingo-launch hidden/);
  assert.match(link, /<strong>Vendor Bingo<\/strong>/);
  assert.doesNotMatch(link, /\btarget=|\bonclick=|javascript:/i);
  assert.doesNotMatch(source, /window\.open|\.href\s*=|addEventListener\(['"]click/);
  assert.match(css, /\.ww-account-wrapper\s+\.ww-vendor-bingo-link\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /\.ww-account-wrapper\s+\.ww-vendor-bingo-link\s*\{\s*min-height:\s*(?:6[4-9]|[7-9][0-9]|[1-9][0-9]{2,})px;/);
  assert.match(css, /\.ww-vendor-bingo-link:focus-visible/);
  assert.match(raw, /^\s*<script>/);
  assert.match(raw, /<\/script>\s*$/);
});

test('server markup obtains a logged-in member, scopes tags to that member and does not render active-member tokens', () => {
  assert.match(php, /user::isUserLogged\(\$_COOKIE\)/);
  assert.match(php, /getUser\(\$_COOKIE\['userid'\], \$w\)/);
  assert.match(php, /SELECT DISTINCT tag_id FROM rel_tags WHERE tag_type_id = 1 AND object_id = '\s*\.\s*\(int\)\$wwvdMemberId/);
  assert.doesNotMatch(php, /data-token=|wwvdMemberToken/);
  assert.match(php, /data-csrf=/);
  assert.match(php, /ww_qr_vendor_website_csrf/);
});
