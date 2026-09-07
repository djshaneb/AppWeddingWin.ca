import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAppDeclarations } from './native-app-source-fixture.mjs';

// Actual app handler, entirely offline: no Apple sheets, requests, account
// writes or credentials. The server remains responsible for identity checks.
const consent = {
  acceptedTerms: true, acceptedPrivacy: true,
  acceptedAt: '2026-09-06T00:00:00.000Z',
  termsVersion: 'offline-terms', privacyVersion: 'offline-privacy',
};
const credential = {
  identityToken: 'offline-apple-id-token', user: 'offline-apple-subject',
  authorizationCode: 'offline-one-time-authorization-code',
  email: 'apple@example.invalid', fullName: { givenName: 'Offline', familyName: 'Member' },
};
const success = plan => ({
  response: { ok: true, status: 200 },
  data: {
    user: { user_id: 'offline-member', email: 'apple@example.invalid', subscription_id: plan },
    native_session: { user_id: 'offline-member', token: 'offline-session' },
  },
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(overrides = {}) {
  const behavior = { platform: 'ios', available: async () => true, credential: async options => ({ ...credential, state: options.state }), exchange: async () => success('18'), ...overrides };
  const state = { auth: null, generation: 0, navigation: 0, sessionGeneration: 0, recoveries: [], uuidCalls: 0, availabilityChecks: 0, appleCalls: [], requests: [], saved: [], hidden: 0, alerts: [] };
  const current = (operation, generation) => state.auth === operation && state.generation === generation;
  const app = loadAppDeclarations([
    'COUPLE_MEMBERSHIP_PLAN_ID', 'VENDOR_MEMBERSHIP_PLAN_ID', 'membershipPlanForRole',
    'hasNativeTokenSession', 'appleNativeScopeDiagnostics', 'shouldOfferAppleBrowserRecovery', 'runNativeAppleLogin',
  ], {
    useCallback: fn => fn,
    Crypto: { randomUUID: () => `00000000-0000-4000-a000-${String(++state.uuidCalls).padStart(12, '0')}` },
    Platform: { OS: behavior.platform },
    TARGET_URL: 'https://www.weddingwin.ca', APP_BACKEND_URL: 'https://backend.example.invalid',
    APP_BACKEND_PUBLISHABLE_KEY: 'offline-public-key',
    Constants: { appOwnership: 'standalone', nativeAppVersion: 'offline', expoConfig: { runtimeVersion: 'offline' } },
    beginAuthOperation(operation) { if (state.auth) return null; state.auth = operation; return ++state.generation; },
    authOperationIsCurrent: current,
    authOperationGenerationRef: { get current() { return state.generation; } },
    navigationIntentGenerationRef: { get current() { return state.navigation; } },
    nativeSessionGenerationRef: { get current() { return state.sessionGeneration; } },
    runAppleLoginInSystemBrowser(...args) { state.recoveries.push(args); },
    finishAuthOperation(operation, generation) { if (current(operation, generation)) state.auth = null; },
    AppleAuthentication: {
      AppleAuthenticationScope: { FULL_NAME: 'full-name', EMAIL: 'email' },
      isAvailableAsync() { state.availabilityChecks++; return behavior.available(); },
      signInAsync(options) { state.appleCalls.push(options); return behavior.credential(options); },
    },
    fetchAppJsonWithTimeout(...args) { state.requests.push(args); return behavior.exchange(...args); },
    Alert: { alert(...args) { state.alerts.push(args); } },
    saveNativeSession(...args) { state.saved.push(args); },
    hideWebsiteBrowser() { state.hidden++; },
  });
  return { state, behavior, run: app.runNativeAppleLogin, invalidate() { state.generation++; state.auth = null; } };
}

test('native missing-email failure offers explicit browser recovery without retrying automatically', async () => {
  const h = harness({ exchange: async () => ({ response: { ok: false }, data: {
    error: 'Apple could not verify your account email. Please start again with Apple.',
  } }) });
  await h.run('vendor', consent);
  assert.equal(h.state.recoveries.length, 0);
  const buttons = h.state.alerts[0][2];
  assert.equal(buttons[0].style, 'cancel');
  assert.equal(buttons[1].text, 'Use Apple in browser');
  buttons[1].onPress();
  assert.equal(h.state.recoveries.length, 1);
  assert.equal(h.state.recoveries[0][0], 'vendor');
  assert.equal(h.state.recoveries[0][1], consent);
});

test('pending Apple permission cleanup offers browser recovery without automatically retrying', async () => {
  const h = harness({ exchange: async () => ({ response: { ok: false }, data: {
    error: 'Your previous Apple permission is being removed. Please try signing in again shortly.',
  } }) });
  await h.run('vendor', consent);
  assert.equal(h.state.recoveries.length, 0);
  assert.equal(h.state.alerts[0][2][1].text, 'Use Apple in browser');
});

for (const change of ['generation', 'navigation', 'sessionGeneration']) {
  test(`old Apple recovery alert cannot run after ${change} changes`, async () => {
    const h = harness({ available: async () => false });
    await h.run('vendor', consent);
    h.state[change]++;
    h.state.alerts[0][2][1].onPress();
    assert.equal(h.state.recoveries.length, 0);
  });
}

const payload = h => JSON.parse(h.state.requests[0][1].body);
function noSession(h) { assert.equal(h.state.saved.length, 0); assert.equal(h.state.hidden, 0); assert.equal(h.state.auth, null); }

test('Apple sign-in sends the one-time code and fresh bound nonce only to the backend', async () => {
  const h = harness();
  await h.run();
  const body = payload(h);
  assert.equal(body.authorization_code, credential.authorizationCode);
  assert.equal(body.apple_nonce, h.state.appleCalls[0].nonce);
  assert.notEqual(h.state.appleCalls[0].state, h.state.appleCalls[0].nonce);
  assert(!JSON.stringify(h.state.saved).includes(credential.authorizationCode));
  await h.run();
  assert.notEqual(h.state.appleCalls[0].nonce, h.state.appleCalls[1].nonce);
});

test('native scope telemetry is unknown without a patched bridge and never inferred from an email', async () => {
  const h = harness();
  await h.run();
  assert.deepEqual(payload(h).client_context.appleScopeDiagnostics, {
    diagnosticVersion: null, requestedEmail: null, requestedName: null,
    authorizedEmail: null, authorizedName: null, credentialEmailPresent: null,
  });
  assert.equal(payload(h).email, credential.email);
});

test('native scope telemetry forwards only boolean/null values without changing credential or signup data', async () => {
  const h = harness({ credential: async options => ({
    ...credential, state: options.state,
    weddingWinScopeDiagnostics: {
      diagnosticVersion: 1, requestedEmail: true, requestedName: true,
      authorizedEmail: false, authorizedName: false, credentialEmailPresent: false,
      email: 'never-log@example.invalid', identityToken: 'never-log-token', user: 'never-log-user',
    },
  }) });
  await h.run('vendor', consent);
  const body = payload(h);
  assert.deepEqual(body.client_context.appleScopeDiagnostics, {
    diagnosticVersion: 1, requestedEmail: true, requestedName: true,
    authorizedEmail: false, authorizedName: false, credentialEmailPresent: false,
  });
  assert.equal(body.id_token, credential.identityToken);
  assert.equal(body.authorization_code, credential.authorizationCode);
  assert.equal(body.apple_user, credential.user);
  assert.equal(body.email, credential.email);
  assert.equal(body.given_name, credential.fullName.givenName);
  assert.equal(body.family_name, credential.fullName.familyName);
  assert.equal(body.signup_role, 'vendor');
  assert.equal(body.subscription_id, '17');
  assert.equal(body.accepted_terms, true);
  assert.equal(h.state.saved.length, 1, 'diagnostic false flags must not control login');
  assert(!JSON.stringify(body.client_context).includes('never-log'));
});

test('missing or mismatched Apple state cannot reach the backend', async () => {
  for (const returnedState of [null, undefined, 'different-request']) {
    const h = harness({ credential: async () => ({ ...credential, state: returnedState }) });
    await h.run();
    noSession(h);
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.alerts.length, 1);
  }
});

test('missing Apple authorization code cannot create an unrevokable new session', async () => {
  const h = harness({ credential: async options => ({ ...credential, state: options.state, authorizationCode: null }) });
  await h.run();
  noSession(h);
  assert.equal(h.state.requests.length, 0);
});

test('explicit native Apple signup preserves vendor/couple intent, plan and accepted policies', async () => {
  for (const [role, plan] of [['vendor', '17'], ['couple', '18']]) {
    const h = harness({ exchange: async () => success(plan) });
    await h.run(role, consent);
    const body = payload(h);
    assert.equal(body.signup_role, role);
    assert.equal(body.subscription_id, plan);
    assert.equal(body.accepted_terms, true);
    assert.equal(body.accepted_privacy, true);
    assert.equal(body.accepted_at, consent.acceptedAt);
    assert.equal(body.terms_version, consent.termsVersion);
    assert.equal(body.privacy_version, consent.privacyVersion);
    assert.equal(h.state.saved[0][0].subscription_id, plan);
    assert.equal(h.state.saved[0][2], role);
    assert.equal(h.state.alerts.length, 0);
    assert.equal(h.state.auth, null);
  }
});

test('ordinary Apple login never sends signup intent or rewrites the returned membership to the picker', async () => {
  for (const [picker, actualPlan] of [['couple', '38'], ['vendor', '18']]) {
    const h = harness({ exchange: async () => success(actualPlan) });
    await h.run(picker);
    const body = payload(h);
    assert.equal(Object.hasOwn(body, 'signup_role'), false);
    assert.equal(body.accepted_terms, false);
    assert.equal(body.accepted_privacy, false);
    assert.equal(body.accepted_at, '');
    assert.equal(h.state.saved[0][0].subscription_id, actualPlan);
    assert.equal(h.state.saved[0][2], picker, 'picker is only the unknown-plan UI fallback');
    assert.equal(h.state.auth, null);
  }
});

test('native Apple signup mismatch displays the server explanation without issuing a fallback login', async () => {
  const message = 'This Apple account already has a different WeddingWin membership. Please sign in to your existing account.';
  const h = harness({ exchange: async () => ({ response: { ok: false, status: 409 }, data: { error: message } }) });
  await h.run('vendor', consent);
  noSession(h);
  assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.alerts[0][1], message);
});

test('rapid Apple signup taps launch one credential sheet and one account request', async () => {
  const pending = deferred();
  const h = harness({ available: () => pending.promise, exchange: async () => success('17') });
  const first = h.run('vendor', consent);
  await Promise.all(Array.from({ length: 20 }, () => h.run('couple', consent)));
  pending.resolve(true);
  await first;
  assert.equal(h.state.availabilityChecks, 1);
  assert.equal(h.state.appleCalls.length, 1);
  assert.equal(h.state.requests.length, 1);
  assert.equal(payload(h).signup_role, 'vendor');
  assert.equal(h.state.saved.length, 1);
});

test('another authentication operation is not replaced by Apple signup', async () => {
  const h = harness();
  h.state.auth = 'google-login';
  await h.run('vendor', consent);
  assert.equal(h.state.auth, 'google-login');
  assert.equal(h.state.availabilityChecks, 0);
});

test('Apple cancellation does not create an account or display a failure', async () => {
  const h = harness({ credential: async () => { throw { code: 'ERR_REQUEST_CANCELED' }; } });
  await h.run('vendor', consent);
  noSession(h);
  assert.equal(h.state.requests.length, 0);
  assert.equal(h.state.alerts.length, 0);
});

for (const [name, overrides] of [
  ['non-iOS platform', { platform: 'android' }],
  ['Apple unavailable', { available: async () => false }],
  ['missing identity token', { credential: async () => ({ user: 'offline-subject' }) }],
]) {
  test(`${name} cannot reach account creation`, async () => {
    const h = harness(overrides);
    await h.run('vendor', consent);
    noSession(h);
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.state.alerts.length, 1);
  });
}

for (const [name, result] of [
  ['HTTP failure', { response: { ok: false }, data: { error: 'Try again later.' } }],
  ['missing user email', { response: { ok: true }, data: { user: {}, native_session: { user_id: 'offline', token: 'offline' } } }],
  ['missing session token', { response: { ok: true }, data: { user: { email: 'apple@example.invalid' }, native_session: { user_id: 'offline' } } }],
]) {
  test(`${name} cannot persist a partial Apple session`, async () => {
    const h = harness({ exchange: async () => result });
    await h.run('vendor', consent);
    noSession(h);
    assert.equal(h.state.alerts.length, 1);
  });
}

for (const stage of ['available', 'credential', 'exchange']) {
  test(`stale Apple ${stage} completion after logout cannot restore a session`, async () => {
    const pending = deferred();
    const arrived = deferred();
    const h = harness({ [stage]: () => { arrived.resolve(); return pending.promise; } });
    const run = h.run('vendor', consent);
    await arrived.promise;
    h.invalidate();
    pending.resolve(stage === 'available' ? true : stage === 'credential' ? credential : success('17'));
    await run;
    noSession(h);
    assert.equal(h.state.alerts.length, 0);
    if (stage !== 'exchange') assert.equal(h.state.requests.length, 0);
  });
}
