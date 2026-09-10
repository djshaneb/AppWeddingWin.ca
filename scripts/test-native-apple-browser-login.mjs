import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { appDeclaration, appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

// Offline execution of the actual app handlers; never opens a browser, contacts
// Apple or the backend, reads credentials, or creates/deletes an account.
const backend = 'https://backend.example.invalid';
const exchangeCode = 'A'.repeat(43);
const callback = `weddingwin://bd-apple-return?provider=apple&exchange_code=${exchangeCode}`;
const consent = {
  acceptedTerms: true, acceptedPrivacy: true, acceptedAt: '2026-09-06T00:00:00.000Z',
  termsVersion: 'offline-terms', privacyVersion: 'offline-privacy',
};
const helpers = ['APPLE_BROWSER_RETURN_URL', 'buildNativeAppleStartUrl', 'parseNativeAppleReturnUrl'];
const pure = loadAppDeclarations(helpers, { APP_BACKEND_URL: backend });
const appStartParams = value => new URLSearchParams(new URL(value).hash.slice(1));
const success = () => ({ response: { ok: true }, data: {
  ok: true, user: { user_id: 'offline-member', email: 'apple@example.invalid', subscription_id: '17' },
  native_session: { user_id: 'offline-member', token: 'offline-session' },
} });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness(overrides = {}) {
  const behavior = {
    pkce: async () => ({ codeVerifier: 'offline-memory-only-verifier', codeChallenge: 'B'.repeat(43) }),
    browser: async () => ({ type: 'success', url: callback }), exchange: async () => success(),
    ...overrides,
  };
  const state = { auth: null, generation: 0, navigation: 0, sessionGeneration: 0,
    browserBusy: false, loading: false, browserCalls: [], requests: [], saved: [], hidden: 0, alerts: [] };
  const current = (operation, generation) => state.auth === operation && state.generation === generation;
  const app = loadAppDeclarations([...helpers, 'hasNativeTokenSession', 'runAppleLoginInSystemBrowser'], {
    APP_BACKEND_URL: backend, APP_BACKEND_PUBLISHABLE_KEY: 'offline-public-key', useCallback: fn => fn,
    browserAuthInFlightRef: { get current() { return state.browserBusy; }, set current(v) { state.browserBusy = v; } },
    navigationIntentGenerationRef: { get current() { return state.navigation; } },
    nativeSessionGenerationRef: { get current() { return state.sessionGeneration; } },
    authOperationGenerationRef: { get current() { return state.generation; } },
    beginAuthOperation(operation) { if (state.auth) return null; state.auth = operation; return ++state.generation; },
    authOperationIsCurrent: current,
    finishAuthOperation(operation, generation) { if (current(operation, generation)) state.auth = null; },
    beginNavigationIntent() { return ++state.navigation; },
    setAppleBrowserLoginLoading(v) { state.loading = v; },
    createGooglePkcePair: (...args) => behavior.pkce(...args),
    WebBrowser: { openAuthSessionAsync(...args) { state.browserCalls.push(args); return behavior.browser(...args); } },
    fetchAppJsonWithTimeout(...args) { state.requests.push(args); return behavior.exchange(...args); },
    Alert: { alert(...args) { state.alerts.push(args); } },
    saveNativeSession(...args) { state.saved.push(args); }, hideWebsiteBrowser() { state.hidden++; },
  });
  return { state, behavior, run: app.runAppleLoginInSystemBrowser };
}
function finished(h) {
  assert.equal(h.state.auth, null);
  assert.equal(h.state.browserBusy, false);
  assert.equal(h.state.loading, false);
}

test('Apple builder uses the branded HTTPS gateway with fragment-only app intent and explicit consent', () => {
  for (const role of ['vendor', 'couple']) {
    const start = new URL(pure.buildNativeAppleStartUrl(role, 'B'.repeat(43), consent));
    assert.equal(start.origin, 'https://www.weddingwin.ca');
    assert.equal(start.pathname, '/app-apple-sign-in');
    assert.equal(start.search, '');
    const params = appStartParams(start);
    assert.equal(params.get('return_to'), 'weddingwin://bd-apple-return');
    assert.equal(params.get('signup_role'), role);
    assert.equal(params.get('accepted_terms'), '1');
    assert.equal(params.get('accepted_privacy'), '1');
    assert.equal(params.get('terms_version'), consent.termsVersion);
    assert.equal(params.get('privacy_version'), consent.privacyVersion);
    assert.equal(params.get('accepted_at'), consent.acceptedAt);
    assert.equal(params.has('subscription_id'), false);
  }
});
test('ordinary Apple browser login omits signup role and all consent', () => {
  const start = new URL(pure.buildNativeAppleStartUrl('vendor', 'B'.repeat(43)));
  assert.deepEqual([...appStartParams(start).keys()].sort(), ['code_challenge', 'return_to']);
});
test('invalid challenges and unaccepted signup agreements fail before opening Apple', () => {
  for (const challenge of ['', 'short', 'x'.repeat(44), '+'.repeat(43)]) {
    assert.throws(() => pure.buildNativeAppleStartUrl('vendor', challenge, consent));
  }
  for (const changes of [{ acceptedTerms: false }, { acceptedPrivacy: false },
    { acceptedAt: '' }, { termsVersion: '' }, { privacyVersion: '' }]) {
    assert.throws(() => pure.buildNativeAppleStartUrl('vendor', 'B'.repeat(43), { ...consent, ...changes }));
  }
});
test('callback parser accepts only the exact Apple callback and a one-time code', () => {
  assert.equal(pure.parseNativeAppleReturnUrl(callback).code, exchangeCode);
  for (const value of [
    callback.replace('weddingwin:', 'https:'), callback.replace('bd-apple-return', 'bd-google-return'),
    callback.replace('bd-apple-return', 'bd-apple-return.attacker.invalid'),
    callback.replace('bd-apple-return?', 'bd-apple-return/?'), callback.replace('bd-apple-return', 'bd-apple-return:42'),
    callback.replace('bd-apple-return', 'user@bd-apple-return'), `${callback}#fragment`,
    `${callback}&provider=apple`, `${callback}&exchange_code=${exchangeCode}`, `${callback}&error=access_denied`,
    callback.replace('provider=apple', 'provider=google'), callback.replace('provider=apple&', ''),
    callback.replace(exchangeCode, 'short'), `${callback}&id_token=untrusted`,
    `${callback}&error_description=untrusted`, 'not-a-url',
  ]) assert.equal(pure.parseNativeAppleReturnUrl(value), null, value);
});
test('provider error descriptions are never returned as UI text or identity', () => {
  for (const [error, expected] of [['access_denied', 'cancelled'], ['cleanup_pending', 'retry'],
    ['account_type_mismatch', 'account_type_mismatch'], ['email_unavailable', 'email_unavailable'],
    ['signup_required', 'signup_required'], ['SIGNUP_REQUIRED', 'failed'], ['signup_required_extra', 'failed'], ['unknown', 'failed']]) {
    const parsed = pure.parseNativeAppleReturnUrl(`weddingwin://bd-apple-return?provider=apple&error=${error}&error_description=untrusted-secret&diagnostic_id=opaque`);
    assert.equal(parsed.error, expected);
    assert.equal(JSON.stringify(parsed).includes('untrusted'), false);
  }
});
test('signup-required callback asks the selected role to sign up without exchanging or creating an account', async () => {
  for (const role of ['vendor', 'couple']) {
    const h = harness({ browser: async () => ({ type: 'success',
      url: 'weddingwin://bd-apple-return?provider=apple&error=signup_required&error_description=untrusted-secret',
    }) });
    await h.run(role);
    assert.deepEqual(h.state.alerts, [[
      'Create your WeddingWin account',
      `This Apple sign-in isn’t linked to a WeddingWin account yet. Sign up to create your ${role} account.`,
      undefined,
    ]]);
    assert.equal(h.state.browserCalls.length, 1);
    assert.equal(appStartParams(h.state.browserCalls[0][0]).has('signup_role'), false);
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.saved.length, 0);
    assert.equal(h.state.hidden, 0);
    finished(h);
  }
});
const signupRequiredResult = {
  type: 'success', url: 'weddingwin://bd-apple-return?provider=apple&error=signup_required',
};
test('Create account opens the selected signup screen once after auth finishes, with fresh consent', async () => {
  for (const role of ['couple', 'vendor']) {
    const h = harness({ browser: async () => signupRequiredResult });
    const screen = { role, mode: 'login', step: 2, consent: true, password: 'offline-dummy', showPassword: true };
    let run;
    let opened = 0;
    const ui = loadAppDeclarations(['showSignupAfterAppleLogin', 'startAppleSignIn'], {
      role, appleBrowserLoginLoading: false,
      setSignupConsentAccepted(value) { screen.consent = value; },
      setPassword(value) { screen.password = value; },
      setShowPassword(value) { screen.showPassword = value; },
      setAuthMode(value) { screen.mode = value; opened++; },
      setWizardStep(value) { screen.step = value; },
      onAppleSignIn(...args) { run = h.run(...args); },
    });
    ui.startAppleSignIn();
    await run;
    finished(h);
    assert.equal(screen.mode, 'login', 'showing the alert must not navigate');
    const buttons = h.state.alerts[0][2];
    assert.deepEqual(Array.from(buttons, button => button.text), ['Not now', 'Create account']);
    assert.equal(buttons[0].style, 'cancel');
    assert.equal(buttons[0].onPress, undefined);
    buttons[1].onPress();
    buttons[1].onPress();
    assert.deepEqual(screen, { role, mode: 'signup', step: 2, consent: false, password: '', showPassword: false });
    assert.equal(opened, 1, 'rapid taps open signup only once');
    assert.equal(h.state.browserCalls.length, 1, 'signup must wait for another explicit Apple tap');
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.saved.length, 0);
  }
});
test('a stale Create account alert cannot reopen signup after another login, navigation or session change', async () => {
  for (const mutation of ['generation', 'navigation', 'sessionGeneration']) {
    const h = harness({ browser: async () => signupRequiredResult });
    let opened = 0;
    await h.run('vendor', undefined, () => { opened++; });
    finished(h);
    h.state[mutation]++;
    h.state.alerts[0][2][1].onPress();
    assert.equal(opened, 0, mutation);
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.saved.length, 0);
  }
});
test('connection, provider, security and uncertain lookup errors never offer account creation', async () => {
  for (const error of ['failed', 'sign_in_unavailable', 'state_nonce', 'cleanup_pending',
    'email_unavailable', 'account_type_mismatch', 'SIGNUP_REQUIRED', 'signup_required_extra']) {
    const h = harness({ browser: async () => ({ type: 'success',
      url: `weddingwin://bd-apple-return?provider=apple&error=${error}`,
    }) });
    await h.run('couple', undefined, () => { assert.fail('must not open signup'); });
    assert.equal(h.state.alerts.length, 1);
    assert.equal(h.state.alerts[0][0], 'Apple sign-in failed');
    assert.equal(h.state.alerts[0][2], undefined);
    assert.equal(h.state.requests.length, 0);
    finished(h);
  }
});
test('the login screen wires the recovery action without submitting signup consent', () => {
  assert.match(appSource, /onPress=\{startAppleSignIn\}/);
  let calls = 0;
  const ui = loadAppDeclarations(['startAppleSignIn'], {
    role: 'vendor', appleBrowserLoginLoading: true,
    onAppleSignIn() { calls++; }, showSignupAfterAppleLogin() {},
  });
  ui.startAppleSignIn();
  assert.equal(calls, 0, 'loading guard prevents duplicate sign-in');
});
test('signup-required callback cannot show a stale prompt after auth, navigation or session changes', async () => {
  for (const mutation of ['generation', 'navigation', 'sessionGeneration']) {
    const pending = deferred();
    const arrived = deferred();
    const h = harness({ browser: () => { arrived.resolve(); return pending.promise; } });
    const first = h.run('vendor');
    await arrived.promise;
    h.state[mutation]++;
    pending.resolve({ type: 'success', url: 'weddingwin://bd-apple-return?provider=apple&error=signup_required' });
    await first;
    assert.equal(h.state.alerts.length, 0);
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.saved.length, 0);
  }
});
test('browser signup uses in-memory PKCE, Apple-only exchange, and server-returned membership', async () => {
  const h = harness();
  await h.run('vendor', consent);
  assert.equal(h.state.browserCalls.length, 1);
  assert.equal(h.state.browserCalls[0][1], 'weddingwin://bd-apple-return');
  assert.equal(appStartParams(h.state.browserCalls[0][0]).get('signup_role'), 'vendor');
  assert.equal(h.state.browserCalls[0][0].includes('offline-memory-only-verifier'), false);
  assert.equal(h.state.requests[0][0], `${backend}/functions/v1/apple-native-exchange`);
  assert.deepEqual(JSON.parse(h.state.requests[0][1].body), { code: exchangeCode, code_verifier: 'offline-memory-only-verifier' });
  assert.equal(h.state.saved[0][0].subscription_id, '17');
  assert.equal(h.state.saved[0][2], 'vendor');
  assert.equal(h.state.hidden, 1);
  finished(h);
});
test('ordinary browser login preserves the returned membership even when picker differs', async () => {
  const h = harness();
  await h.run('couple');
  assert.equal(appStartParams(h.state.browserCalls[0][0]).has('signup_role'), false);
  assert.equal(h.state.saved[0][0].subscription_id, '17');
  finished(h);
});
test('rapid taps launch only one browser and exchange', async () => {
  const pending = deferred();
  const h = harness({ browser: () => pending.promise });
  const first = h.run('vendor', consent);
  await Promise.resolve();
  await Promise.all(Array.from({ length: 20 }, () => h.run('couple', consent)));
  pending.resolve({ type: 'success', url: callback });
  await first;
  assert.equal(h.state.browserCalls.length, 1);
  assert.equal(h.state.requests.length, 1);
  finished(h);
});
test('other authentication/browser operations prevent a new Apple session', async () => {
  for (const busy of ['auth', 'browser']) {
    const h = harness();
    if (busy === 'auth') h.state.auth = 'google-login'; else h.state.browserBusy = true;
    await h.run('vendor', consent);
    assert.equal(h.state.browserCalls.length, 0);
    assert.equal(h.state.requests.length, 0);
  }
});
test('browser cancel/dismiss/provider cancellation never exchanges or displays failure', async () => {
  for (const result of [{ type: 'cancel' }, { type: 'dismiss' },
    { type: 'success', url: 'weddingwin://bd-apple-return?provider=apple&error=access_denied' }]) {
    const h = harness({ browser: async () => result });
    await h.run('vendor', consent);
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.saved.length, 0);
    assert.equal(h.state.alerts.length, 0);
    finished(h);
  }
});
for (const stage of ['pkce', 'browser', 'exchange']) {
  for (const mutation of ['generation', 'navigation', 'sessionGeneration']) {
    test(`stale ${stage} result after ${mutation} changes cannot restore login`, async () => {
      const pending = deferred();
      const arrived = deferred();
      const h = harness({ [stage]: () => { arrived.resolve(); return pending.promise; } });
      const first = h.run('vendor', consent);
      await arrived.promise;
      h.state[mutation]++;
      pending.resolve(stage === 'pkce' ? { codeVerifier: 'offline', codeChallenge: 'B'.repeat(43) }
        : stage === 'browser' ? { type: 'success', url: callback } : success());
      await first;
      assert.equal(h.state.saved.length, 0);
      assert.equal(h.state.hidden, 0);
      assert.equal(h.state.alerts.length, 0);
      if (stage !== 'exchange') assert.equal(h.state.requests.length, 0);
      assert.equal(h.state.loading, false);
      assert.equal(h.state.browserBusy, false);
    });
  }
}
test('malformed callback cannot call the exchange endpoint', async () => {
  const h = harness({ browser: async () => ({ type: 'success', url: `${callback}&provider=google` }) });
  await h.run();
  assert.equal(h.state.requests.length, 0);
  assert.equal(h.state.alerts.length, 1);
  finished(h);
});
test('failed/partial exchange cannot persist an app session', async () => {
  for (const result of [
    { response: { ok: false }, data: success().data },
    { response: { ok: true }, data: { ...success().data, ok: false } },
    { response: { ok: true }, data: { ...success().data, user: {} } },
    { response: { ok: true }, data: { ...success().data, native_session: { user_id: 'offline' } } },
  ]) {
    const h = harness({ exchange: async () => result });
    await h.run();
    assert.equal(h.state.saved.length, 0);
    assert.equal(h.state.alerts.length, 1);
    finished(h);
  }
});
test('PKCE generator uses 256 random bits and correct S256 without browser globals', async () => {
  const pair = loadAppDeclarations(['createGooglePkcePair'], { Crypto: {
    getRandomBytesAsync: async count => Uint8Array.from({ length: count }, (_, n) => n),
    CryptoDigestAlgorithm: { SHA256: 'sha256' }, CryptoEncoding: { BASE64: 'base64' },
    digestStringAsync: async (algorithm, input, options) => createHash(algorithm).update(input).digest(options.encoding),
  } });
  const { codeVerifier, codeChallenge } = await pair.createGooglePkcePair();
  assert.equal(codeVerifier.length, 64);
  assert.equal(codeChallenge, createHash('sha256').update(codeVerifier).digest('base64url'));
  assert.match(codeChallenge, /^[A-Za-z0-9_-]{43}$/);
});
test('primary Apple signup preserves explicit consent and role and ignores busy taps', () => {
  for (const role of ['vendor', 'couple']) {
    for (const [busy, agreed] of [[false, true], [false, false], [true, true]]) {
      const calls = [];
      let consentChecks = 0;
      const entry = loadAppDeclarations(['startAppleSignup'], {
        role, appleBrowserLoginLoading: busy,
        requireSignupConsent() { consentChecks++; return agreed; },
        buildSignupConsent: () => consent,
        onAppleSignIn: (...args) => calls.push(args),
      });
      entry.startAppleSignup();
      assert.equal(consentChecks, busy ? 0 : 1);
      assert.equal(calls.length, !busy && agreed ? 1 : 0);
      if (calls.length) assert.deepEqual(calls[0], [role, consent]);
    }
  }
});
test('primary branded Apple buttons use the browser flow without duplicate links or a native-first attempt', () => {
  assert.match(appDeclaration('startAppleSignup'), /if \(!requireSignupConsent\(\)\) return/);
  assert.match(appDeclaration('startAppleSignup'), /onAppleSignIn\(role, buildSignupConsent\(\)\)/);
  assert.match(appSource, /onAppleSignIn=\{runAppleLoginInSystemBrowser\}/);
  assert.doesNotMatch(appSource, /onAppleSignIn=\{runNativeAppleLogin\}|onAppleBrowserSignIn|startAppleBrowserSignup|accessibilityLabel="Use Apple in browser"/);
  assert.match(appSource, /onPress=\{startAppleSignup\}/);
  assert.match(appDeclaration('startAppleSignIn'), /if \(appleBrowserLoginLoading\) return/);
  assert.match(appDeclaration('startAppleSignIn'), /onAppleSignIn\(role, undefined, showSignupAfterAppleLogin\)/);
  assert.equal((appSource.match(/<AppleAuthentication\.AppleAuthenticationButton\b/g) || []).length, 2);
  assert.equal((appSource.match(/accessibilityState=\{\{ busy: appleBrowserLoginLoading \}\}/g) || []).length, 2);
});
test('browser auth remains navigation-safe and credential-free while native diagnostics stay isolated', () => {
  assert.match(appSource, /onAuthIntentChange=\{invalidateNavigationIntent\}/);
  assert.match(appSource, /\[role, authMode, wizardStep, signupConsentAccepted, onAuthIntentChange\]/);
  const handler = appDeclaration('runAppleLoginInSystemBrowser');
  assert.doesNotMatch(handler, /addDebugLine|console\.|SecureStore|injectJavaScript|google-native-exchange|id_token|authorization_code/);
  assert.match(appDeclaration('runNativeAppleLogin'), /shouldOfferAppleBrowserRecovery\(data\) \? browserRecoveryButtons\(\)/);
});
