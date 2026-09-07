import assert from 'node:assert/strict';
import test from 'node:test';
import { appDeclaration, appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

// Actual client declarations with offline network/storage/UI doubles only.
const session = { user_id: '990001', token: 'offline-session', email: 'offline@example.invalid' };
const expired = { error: 'Stored session expired. Please sign in again.' };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness(fetchImpl = async () => response(401, expired)) {
  const state = {
    session: { ...session }, member: { user_id: session.user_id, email: session.email, account_role: 'vendor' },
    generation: 1, navigation: 1, authGeneration: 1, clears: 0, resets: 0, hidden: 0,
    websiteClears: 0, scanner: true, loginRequest: null, alerts: [], urls: [], requests: [], events: [],
  };
  const refreshes = new Map();
  let app;
  app = loadAppDeclarations([
    'hasNativeBridgeSession', 'isTrustedWebsiteBridgeUrl', 'isOneTimeAppLoginUrl',
    'isConfirmedNativeSessionExpiry', 'expireNativeSessionIfCurrent',
    'createWebsiteLoginBridge', 'refreshNativeBridgeSession', 'openDashboardWithBridge',
    'openWebsiteBuilderWithBridge',
  ], {
    useCallback: fn => fn, AbortController, setTimeout, clearTimeout,
    TARGET_URL: 'https://www.weddingwin.ca', APP_BACKEND_URL: 'https://backend.example.invalid',
    APP_BACKEND_PUBLISHABLE_KEY: 'offline-public-key', WEBSITE_BRIDGE_REQUEST_TIMEOUT_MS: 500,
    nativeBridgeSessionRef: { get current() { return state.session; } },
    nativeMemberRef: { get current() { return state.member; } },
    nativeSessionGenerationRef: { get current() { return state.generation; } },
    navigationIntentGenerationRef: { get current() { return state.navigation; } },
    nativeSessionRefreshPromisesRef: { current: refreshes }, logoutInFlightRef: { current: false },
    invalidateNavigationIntent() { state.navigation++; state.events.push('invalidate'); },
    clearNativeSession() {
      state.events.push('clear'); state.clears++; state.generation++; state.authGeneration++;
      state.session = null; state.member = null; refreshes.clear();
    },
    setShowNativeQrScanner(v) { state.scanner = v; },
    setExpiredSessionLoginRequest(update) { state.loginRequest = update(state.loginRequest); },
    clearWebsiteStorage() { state.websiteClears++; },
    resetWebsiteBrowser() { state.resets++; },
    hideWebsiteBrowser() { state.hidden++; },
    Alert: { alert(...args) { state.alerts.push(args); } },
    fetch(...args) { state.requests.push(args); return fetchImpl(...args); },
    commitNativeBridgeSession(v) { state.session = v; state.generation++; },
    commitNativeMember(v) { state.member = v; },
    withMemberRole: (member, role) => ({ ...member, account_role: role }),
    memberAccountRole: member => member?.account_role || 'couple',
    beginNavigationIntent() { return ++state.navigation; },
    prepareExclusiveWebsiteDestination() {}, addDebugLine() {}, startBridgeRedirect() {},
    openAbsoluteUrl(url) { state.urls.push(url); },
    createCoalescedWebsiteLoginBridge: (...args) => app.createWebsiteLoginBridge(...args),
  });
  return { state, app, refreshes };
}

test('only exact authoritative 401 session rejection triggers expiry', () => {
  const { app } = harness();
  assert.equal(app.isConfirmedNativeSessionExpiry(401, expired), true);
  for (const status of [0, 200, 400, 403, 404, 408, 429, 500, 502, 503]) {
    assert.equal(app.isConfirmedNativeSessionExpiry(status, expired), false);
  }
  for (const body of [null, [], {}, { error: 'Unauthorized' }, { error: 'Invalid email or password.' },
    { error: `Network error: ${expired.error}` }, { error: 'Login is temporarily unavailable.' }]) {
    assert.equal(app.isConfirmedNativeSessionExpiry(401, body), false);
  }
});
test('confirmed current expiry clears local/browser state once and shows one friendly sign-in prompt', () => {
  const { state, app } = harness();
  assert.equal(app.expireNativeSessionIfCurrent(session, 1, 401, expired), true);
  assert.equal(app.expireNativeSessionIfCurrent(session, 1, 401, expired), false);
  assert.equal(state.clears, 1);
  assert.equal(state.session, null);
  assert.equal(state.member, null);
  assert.equal(state.scanner, false);
  assert.equal(state.loginRequest.role, 'vendor');
  assert.equal(state.loginRequest.id, 1);
  assert.equal(state.websiteClears, 1);
  assert.equal(state.resets, 1);
  assert.equal(state.hidden, 1);
  assert.deepEqual(state.events, ['invalidate', 'clear']);
  assert.equal(state.alerts.length, 1);
  assert.equal(state.alerts[0][0], 'Please sign in again');
});
test('old generation, different account, replaced token and already-signed-out states never clear a newer login', () => {
  for (const change of ['generation', 'account', 'token', 'signed-out']) {
    const { state, app } = harness();
    if (change === 'generation') state.generation++;
    if (change === 'account') state.session.user_id = '990002';
    if (change === 'token') state.session.token = 'new-session';
    if (change === 'signed-out') state.session = null;
    assert.equal(app.expireNativeSessionIfCurrent(session, 1, 401, expired), false);
    assert.equal(state.clears, 0);
    assert.equal(state.alerts.length, 0);
  }
});
for (const name of ['openDashboardWithBridge', 'openWebsiteBuilderWithBridge']) {
  test(`${name} returns to sign-in instead of leaving expired account menu or a second error`, async () => {
    const { state, app } = harness();
    await app[name]();
    assert.equal(state.requests.length, 1);
    assert.equal(state.clears, 1);
    assert.equal(state.member, null);
    assert.equal(state.urls.length, 0);
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0][0], 'Please sign in again');
  });
}
test('network errors, upstream outages and feature denials preserve dashboard login', async () => {
  for (const fetchImpl of [
    async () => { throw new TypeError('Network request failed'); },
    async () => response(503, expired), async () => response(401, { error: 'Unauthorized' }),
    async () => response(403, { error: 'Feature unavailable for this membership' }),
    async () => ({ status: 502, ok: false, json: async () => { throw new Error('invalid-json'); } }),
  ]) {
    const { state, app } = harness(fetchImpl);
    await app.openDashboardWithBridge();
    assert.equal(state.clears, 0);
    assert.equal(state.session.user_id, session.user_id);
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0][0], 'Dashboard unavailable');
  }
});
test('concurrent expired dashboard results produce only one session clear and prompt', async () => {
  const { state, app } = harness();
  await Promise.all([app.openDashboardWithBridge(), app.openDashboardWithBridge()]);
  assert.equal(state.clears, 1);
  assert.equal(state.alerts.length, 1);
  assert.equal(state.urls.length, 0);
});
test('shared chat/session refresh clears a confirmed expired account and its in-flight map', async () => {
  const { state, app, refreshes } = harness();
  assert.equal(await app.refreshNativeBridgeSession(session), null);
  assert.equal(state.clears, 1);
  assert.equal(state.alerts.length, 1);
  assert.equal(refreshes.size, 0);
});
test('shared refresh preserves login and stays quiet on transient failures', async () => {
  for (const fetchImpl of [async () => response(503, expired), async () => { throw new Error('offline'); }]) {
    const { state, app, refreshes } = harness(fetchImpl);
    assert.equal(await app.refreshNativeBridgeSession(session), null);
    assert.equal(state.clears, 0);
    assert.equal(state.alerts.length, 0);
    assert.equal(state.session.user_id, session.user_id);
    assert.equal(refreshes.size, 0);
  }
});
for (const name of ['createWebsiteLoginBridge', 'refreshNativeBridgeSession']) {
  test(`stale ${name} expiry after replacement login cannot clear that login`, async () => {
    const pending = deferred();
    const { state, app } = harness(() => pending.promise);
    const request = app[name](session, '/account/home');
    state.generation++;
    state.session = { user_id: '990002', token: 'new-session' };
    pending.resolve(response(401, expired));
    await request.catch(() => null);
    assert.equal(state.clears, 0);
    assert.equal(state.alerts.length, 0);
    assert.equal(state.session.user_id, '990002');
  });
}
test('successful refresh still updates the current session and returned member', async () => {
  const updated = { ...session, cookie: 'offline-cookie' };
  const { state, app } = harness(async () => response(200, {
    ok: true, native_session: updated, user: { user_id: session.user_id, email: session.email, first_name: 'Updated' },
  }));
  assert.equal((await app.refreshNativeBridgeSession(session)).cookie, updated.cookie);
  assert.equal(state.member.first_name, 'Updated');
  assert.equal(state.clears, 0);
  assert.equal(state.alerts.length, 0);
});
test('chat does not start WebView recovery or resurrect stale messages after expiry clears the session', () => {
  const source = appDeclaration('syncNativeChat');
  assert.match(source, /await refreshNativeBridgeSession\(activeNativeSession\);\s*if \(!requestIsCurrent\(\)\) return null;/);
  assert.match(source, /await waitForWebsiteSessionBridge\(1200\);\s*if \(!requestIsCurrent\(\)\) return null;/);
  assert.match(appDeclaration('clearNativeSession'), /authOperationGenerationRef\.current \+= 1/);
  assert.match(appDeclaration('clearNativeSession'), /nativeChatRequestGenerationRef\.current \+= 1/);
});
test('expired-session UI explicitly opens login and clears old signup password/agreement state', () => {
  assert.match(appSource, /if \(!expiredSessionLoginRequest\) return;\s*setRole\(expiredSessionLoginRequest.role\);\s*setAuthMode\('login'\);\s*setWizardStep\(2\);\s*setSignupConsentAccepted\(false\);\s*setPassword\(''\);\s*setShowPassword\(false\);/);
  assert.match(appSource, /expiredSessionLoginRequest=\{expiredSessionLoginRequest\}/);
  assert.match(appDeclaration('commitNativeMember'), /if \(member\) \{\s*pendingAppLogoutRef.current = false;\s*setExpiredSessionLoginRequest\(null\);/);
});
