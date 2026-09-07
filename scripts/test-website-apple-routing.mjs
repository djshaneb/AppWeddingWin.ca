import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../brilliant-directories/widgets/321-apple-login-bridge.js', import.meta.url), 'utf8')
  .replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const checkoutSource = readFileSync(new URL('../brilliant-directories/widgets/189-checkout-apple-bridge.js', import.meta.url), 'utf8')
  .replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

// Execute the actual CMS widget against a minimal DOM, including its delayed
// passes. This tests both new buttons and stale links from earlier rendering.
function run(pathname, { existing = false, userAgent = '', search = '', checkout = false, claimValue = '' } = {}) {
  const timers = [];
  const links = [];
  let mounted = existing ? makeElement('div') : null;
  function makeElement(tag) {
    const node = { tagName: tag.toUpperCase(), children: [], attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(child) { this.children.push(child); if (child.id === 'ww-web-apple-login') mounted = child; },
      querySelector() { return this.children.find(child => child.tagName === 'A'); },
      remove() { mounted = null; },
      set innerHTML(value) {
        this.html = value;
        if (value.includes('id="ww-web-apple-login"')) {
          mounted = makeElement('div');
          const link = makeElement('a');
          link.href = value.match(/<a href="([^"]+)"/)[1];
          mounted.appendChild(link);
        }
      },
    };
    if (tag === 'a') links.push(node);
    return node;
  }
  if (existing) { mounted.appendChild(makeElement('a')); links[0].href = 'https://www.weddingwin.ca/auth/apple-start'; }
  const anchor = { closest() { return this; }, insertAdjacentElement(_, node) { this.node = node; } };
  const body = { appendChild(node) { mounted = node; }, classList: { contains: () => false } };
  const document = {
    readyState: 'complete', body,
    getElementById() { return mounted; },
    createElement: makeElement,
    createElementNS: (_, tag) => makeElement(tag),
    createTextNode: text => ({ textContent: text }),
    querySelector(selector) {
      if (checkout) {
        if (selector === '#containerGoogleLogin' || selector.startsWith('form[id^=')) return anchor;
        return null;
      }
      return selector.includes('#containerFBLogin') ? anchor : null;
    },
    querySelectorAll(selector) { return selector.includes('input[name="claim"]') ? [{ value: claimValue }] : []; },
  };
  vm.runInNewContext(checkout ? checkoutSource : source, { URL, URLSearchParams, window: { location: { pathname, search } }, navigator: { userAgent }, document, setTimeout: fn => timers.push(fn) });
  for (const timer of timers) timer();
  return { links, mounted };
}

const routes = {
  '/checkout/17': 'vendor',
  '/checkout/pro-members-copy-11-copy-17': 'vendor',
  '/checkout/10': 'couple',
  '/checkout/18': 'couple',
  '/checkout/23': 'vendor_venue',
  '/checkout/33': 'vendor_multi',
  '/checkout/basic': 'vendor_basic',
  '/checkout/35': 'vendor_basic',
  '/checkout/37': 'vendor_venue_multi',
  '/checkout/niagara-wedding-show': 'vendor_show',
  '/checkout/38': 'vendor_show',
};

test('each supported checkout and trailing-slash alias carries its own signup intent', () => {
  for (const [path, role] of Object.entries(routes)) {
    for (const suffix of ['', '/']) {
      for (const checkout of [false, true]) {
        const result = run(path + suffix, { checkout });
        assert.equal(result.links.length, 1, path);
        const url = new URL(result.links[0].href);
        assert.equal(url.pathname, '/auth/apple-start');
        assert.equal(url.searchParams.get('signup_role'), role, path);
      }
    }
  }
});

test('updates existing Apple links and never uses URL query to select a plan', () => {
  for (const checkout of [false, true]) {
    const result = run('/checkout/17', { existing: true, search: '?signup_role=couple&subscription_id=1', checkout });
    assert.equal(result.links.length, 1);
    assert.equal(new URL(result.links[0].href).searchParams.get('signup_role'), 'vendor');
  }
});

test('login leaves existing-account membership selection to the server', () => {
  const result = run('/login');
  assert.equal(result.links.length, 1);
  assert.equal(new URL(result.links[0].href).searchParams.has('signup_role'), false);
  assert.equal(run('/login', { checkout: true }).links.length, 0);
});

test('unsupported, paid and malformed checkout paths never silently create couples', () => {
  for (const path of ['/checkout/1', '/checkout/4', '/checkout/28', '/checkout/36', '/checkout/unknown', '/checkout/constructor', '/checkout/__proto__', '/checkout/17/extra']) {
    for (const checkout of [false, true]) {
      assert.equal(run(path, { checkout }).links.length, 0, path);
      assert.equal(run(path, { existing: true, checkout }).mounted, null, path);
    }
  }
});

test('website Apple bridge leaves native app login alone', () => {
  for (const checkout of [false, true]) assert.equal(run('/checkout/17', { userAgent: 'WeddingWinApp iOS', checkout }).links.length, 0);
});

test('claim listing links are not treated as new-account signup', () => {
  for (const search of ['?claim=listing-token', '?claim=', '?claim_listing=listing-token', '?claim_listing=']) {
    for (const checkout of [false, true]) assert.equal(run('/checkout/17', { search, checkout }).links.length, 0);
  }
  for (const checkout of [false, true]) assert.equal(run('/checkout/17', { claimValue: 'listing-token', checkout }).links.length, 0);
});

test('shared checkout fragment survives Design Settings footer serialization', () => {
  // The live website_footer renderer strips backslashes. Keep this fragment
  // independent of escapes; the widget_javascript field alone preserves them.
  assert.equal(checkoutSource.includes('\\'), false);
  assert.doesNotThrow(() => new vm.Script(checkoutSource));
});
