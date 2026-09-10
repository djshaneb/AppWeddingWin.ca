import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { loadAppDeclarations } from './native-app-source-fixture.mjs';

// Execute the published widget's real JavaScript offline. Never opens Apple,
// contacts a backend, reads credentials, or creates an authentication attempt.
const path = '../brilliant-directories/pages/app-apple-sign-in';
const read = suffix => readFileSync(new URL(path + suffix, import.meta.url), 'utf8');
const html = read('.html');
const css = read('.css');
const head = read('-head.html');
const wrapped = read('.js');
const js = wrapped.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const gateway = 'https://www.weddingwin.ca/app-apple-sign-in';
const endpoint = 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/apple-native-oauth-start';
const login = { return_to: 'weddingwin://bd-apple-return', code_challenge: 'B'.repeat(43) };
const consent = { accepted_terms: '1', accepted_privacy: '1', accepted_at: '2026-09-06T02:03:04.005Z',
  terms_version: '2026-09-01', privacy_version: '2026-09-01' };
const signup = role => ({ ...login, signup_role: role, ...consent });
const urlFor = values => gateway + '#' + new URLSearchParams(values);

function setup(href = urlFor(login), options = {}) {
  const status = { hidden: false, textContent: 'Opening your secure Apple sign-in…' };
  const error = { hidden: true,
    textContent: 'We couldn’t open this sign-in link. Close this window and try Apple again in the WeddingWin app.' };
  const state = { cleaned: [], navigated: [], order: [] };
  const location = {
    href,
    replace(value) {
      state.order.push('navigate');
      if (options.navigationFails) throw new Error('private-navigation-error');
      state.navigated.push(value);
      this.href = value;
    },
  };
  const context = vm.createContext({
    URL, URLSearchParams,
    document: { getElementById: id => id === 'ww-app-apple-status' ? status : id === 'ww-app-apple-error' ? error : null },
    window: {
      location,
      history: {
        replaceState(data, title, value) {
          state.order.push('clean');
          if (options.cleanupFails) throw new Error('private-cleanup-error');
          state.cleaned.push({ data, title, value });
          location.href = new URL(value, location.href).toString();
        },
      },
    },
  });
  const run = () => vm.runInContext(js, context);
  run();
  return { ...state, state, status, error, location, context, run };
}

function rejected(href) {
  const result = setup(href);
  assert.equal(result.navigated.length, 0, href);
  assert.equal(result.status.hidden, true, href);
  assert.equal(result.error.hidden, false, href);
  return result;
}

test('valid login uses a single browser navigation to the exact native backend after fragment cleanup', () => {
  const result = setup();
  assert.deepEqual(result.order, ['clean', 'navigate']);
  assert.deepEqual(result.cleaned, [{ data: null, title: '', value: '/app-apple-sign-in' }]);
  assert.equal(result.navigated.length, 1);
  const target = new URL(result.navigated[0]);
  assert.equal(target.origin + target.pathname, endpoint);
  assert.equal(target.hash, '');
  assert.deepEqual(Object.fromEntries(target.searchParams), login);
  assert.equal(result.error.hidden, true);
});

for (const role of ['vendor', 'couple']) {
  test(`explicit ${role} signup preserves all native consent and PKCE values without another agreement`, () => {
    const values = signup(role);
    const result = setup(urlFor(values));
    assert.equal(result.navigated.length, 1);
    assert.deepEqual(Object.fromEntries(new URL(result.navigated[0]).searchParams), values);
    assert.equal(result.error.hidden, true);
  });
}

test('gateway does not invent fresh timestamps or enforce its own current-policy version', () => {
  const values = { ...signup('vendor'), accepted_at: '2001-02-03T04:05:06.007Z',
    terms_version: '2001-02-03', privacy_version: '2001-02-04' };
  const result = setup(urlFor(values));
  assert.deepEqual(Object.fromEntries(new URL(result.navigated[0]).searchParams), values);
  assert.doesNotMatch(js, /Date\.now|CURRENT_TERMS_VERSION|CURRENT_PRIVACY_VERSION/);
});

test('only exact first-party HTTPS origin and path are allowed', () => {
  for (const candidate of [
    gateway.replace('https:', 'http:'), gateway.replace('www.weddingwin.ca', 'weddingwin.ca'),
    gateway.replace('www.weddingwin.ca', 'www.weddingwin.ca.evil.invalid'),
    gateway.replace('www.weddingwin.ca', 'evil.invalid'),
    gateway.replace('www.weddingwin.ca', 'user:secret@www.weddingwin.ca'),
    gateway.replace('www.weddingwin.ca', 'www.weddingwin.ca:444'),
    gateway + '/', gateway + '-extra', 'https://www.weddingwin.ca/other',
    'file:///app-apple-sign-in', 'javascript:alert(1)', 'not a URL',
  ]) rejected(candidate + '#' + new URLSearchParams(login));
});

test('query parameters, empty fragments and oversized or malformed fragments fail closed', () => {
  for (const candidate of [
    gateway, gateway + '#', gateway + '?' + new URLSearchParams(login),
    gateway + '?ignored=1#' + new URLSearchParams(login),
    gateway + '?#' + new URLSearchParams(login),
    gateway + '#' + 'a'.repeat(4097),
    urlFor(login) + '&accepted_at=%', urlFor(login) + '&return_to=%ZZ',
    urlFor(login) + '&%FF=1',
  ]) {
    const result = rejected(candidate);
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.location.href, gateway);
  }
});

test('rejects every duplicated or unexpected parameter including credentials and redirect controls', () => {
  for (const values of [login, signup('vendor')]) {
    for (const [key, value] of Object.entries(values)) {
      rejected(urlFor(values) + '&' + new URLSearchParams({ [key]: value }));
    }
  }
  for (const key of ['redirect_to', 'next', 'url', 'provider', 'client_id', 'subscription_id',
    'email', 'password', 'id_token', 'access_token', 'code', 'code_verifier',
    'state', 'nonce', '__proto__', 'constructor', 'toString', '']) {
    rejected(urlFor({ ...login, [key]: 'private-untrusted-value' }));
  }
});

test('fixed native return and exact S256 challenge shape prevent open redirects', () => {
  for (const value of ['', 'https://evil.invalid', 'javascript:alert(1)',
    'weddingwin://bd-google-return', 'weddingwin://bd-apple-return/',
    'weddingwin://user:pass@bd-apple-return', 'weddingwin://bd-apple-return:42',
    'weddingwin://bd-apple-return#fragment', 'weddingwin://bd-apple-return?next=evil',
    'weddingwin://bd-apple-return.evil.invalid']) rejected(urlFor({ ...login, return_to: value }));
  for (const value of ['', 'short', 'A'.repeat(42), 'A'.repeat(44), '+'.repeat(43),
    'A'.repeat(42) + '=', 'A'.repeat(42) + '\n']) rejected(urlFor({ ...login, code_challenge: value }));
  for (const key of ['return_to', 'code_challenge']) {
    const values = { ...login };
    delete values[key];
    rejected(urlFor(values));
  }
});

test('explicit signup needs a known role and complete affirmative consent; login cannot carry consent', () => {
  for (const role of ['', 'admin', 'vendor_show', 'Vendor', 'constructor']) {
    rejected(urlFor({ ...signup('vendor'), signup_role: role }));
  }
  for (const key of Object.keys(consent)) {
    const values = signup('couple');
    delete values[key];
    rejected(urlFor(values));
    rejected(urlFor({ ...login, [key]: consent[key] }));
  }
  for (const key of ['accepted_terms', 'accepted_privacy']) {
    for (const value of ['', '0', 'true', 'yes']) rejected(urlFor({ ...signup('couple'), [key]: value }));
  }
});

test('signup validates timestamp and bounded date-version syntax without repairing supplied values', () => {
  for (const accepted_at of ['', 'not-a-date', '2026-09-06', '2026-09-06T02:03:04Z',
    '2026-02-30T02:03:04.005Z', '2026-13-06T02:03:04.005Z',
    '2026-09-06T25:03:04.005Z', '2026-09-06T02:03:04.005+00:00', '1'.repeat(200)]) {
    rejected(urlFor({ ...signup('vendor'), accepted_at }));
  }
  for (const key of ['terms_version', 'privacy_version']) {
    for (const value of ['', 'offline-terms', '2026-9-1', '2026-02-30', '2026-13-01',
      '2026-09-01-extra', '2026-09-01T00:00:00.000Z', '1'.repeat(200)]) {
      rejected(urlFor({ ...signup('vendor'), [key]: value }));
    }
  }
});

test('repeat initialization and restored fragments never navigate twice', () => {
  const result = setup();
  for (let i = 0; i < 20; i++) {
    result.location.href = urlFor(signup('vendor'));
    result.run();
  }
  assert.equal(result.navigated.length, 1);
  assert.equal(result.cleaned.length, 1);
  const invalid = rejected(gateway);
  invalid.location.href = urlFor(login);
  invalid.run();
  assert.equal(invalid.navigated.length, 0);
});

test('fragment-clearing or navigation failure shows a fixed friendly message and never retries', () => {
  for (const options of [{ cleanupFails: true }, { navigationFails: true }]) {
    const result = setup(urlFor(login), options);
    assert.equal(result.navigated.length, 0);
    assert.equal(result.error.hidden, false);
    assert.equal(result.status.hidden, true);
    result.run();
    assert.equal(result.navigated.length, 0);
    assert.equal(result.order.filter(value => value === 'clean').length, 1);
    assert.doesNotMatch(result.error.textContent, /private-|B{43}|return_to|code_challenge/);
    if (options.cleanupFails) assert.deepEqual(result.order, ['clean']);
  }
});

test('markup is minimal first-party content with no agreement, external assets, or reflected errors', () => {
  assert.match(wrapped, /^<script>/);
  assert.match(wrapped, /<\/script>\s*$/);
  assert.match(html, /src="\/images\/CoralLogoTransB\.png"/);
  assert.match(html, /id="ww-app-apple-error" role="alert" hidden/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /<form|checkbox|https?:\/\/|<iframe/);
  assert.doesNotMatch(js, /innerHTML|document\.write|textContent\s*=|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|console\.|setTimeout|setInterval|appleid\.apple\.com|window\.open/);
  assert.match(css, /\.ww-app-apple \[hidden\]\{display:none!important\}/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.doesNotMatch(css, /@import|font-family|url\(/);
  assert.match(head, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(head, /name="referrer" content="no-referrer"/);
});

test('real app URL builds fragment-only login and signup inputs accepted by the real gateway script', () => {
  const app = loadAppDeclarations(['APPLE_BROWSER_RETURN_URL', 'buildNativeAppleStartUrl']);
  for (const role of ['couple', 'vendor']) {
    for (const creating of [false, true]) {
      const supplied = creating ? { acceptedTerms: true, acceptedPrivacy: true,
        acceptedAt: consent.accepted_at, termsVersion: consent.terms_version,
        privacyVersion: consent.privacy_version } : undefined;
      const value = app.buildNativeAppleStartUrl(role, login.code_challenge, supplied);
      const initial = new URL(value);
      assert.equal(initial.origin + initial.pathname, gateway);
      assert.equal(initial.search, '');
      assert.equal(initial.href.split('#')[0], gateway);
      const result = setup(value);
      assert.equal(result.navigated.length, 1);
      assert.deepEqual(Object.fromEntries(new URL(result.navigated[0]).searchParams), creating ? signup(role) : login);
    }
  }
});
