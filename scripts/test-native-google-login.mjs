import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual application functions, not a parallel reimplementation.
// Every browser, random-byte, digest, and HTTP dependency below is isolated.
// This suite never opens OAuth, creates accounts, or contacts the backend.
const source = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function declaration(name) {
  let result;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) {
      assert.equal(result, undefined, `Expected one declaration of ${name}`);
      result = ts.isVariableDeclaration(node) ? `const ${node.getText(ast)};` : node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(result, `Missing real application function ${name}`);
  return result;
}

function load(names, globals = {}) {
  const context = vm.createContext({ URL, URLSearchParams, ...globals });
  const code = names.map(declaration).join('\n') +
    `\nglobalThis.exposed = { ${names.join(', ')} };`;
  vm.runInContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return { context, ...context.exposed };
}

const callbackBase = 'weddingwin://bd-login';
const exchangeCode = 'x'.repeat(43);
const codeVerifier = '12'.repeat(32);
const codeChallenge = 'c'.repeat(43);
const callback = `${callbackBase}?exchange_code=${exchangeCode}`;
const success = () => ({
  response: { ok: true, status: 200 },
  data: {
    ok: true,
    user: { user_id: 'test-member', email: 'native-google@example.invalid' },
    native_session: { user_id: 'test-member', token: 'fictional-session-token' },
  },
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(overrides = {}) {
  const behavior = {
    redirect: () => callbackBase,
    pkce: async () => ({ codeVerifier, codeChallenge }),
    browser: async () => ({ type: 'success', url: callback }),
    exchange: async () => success(),
    ...overrides,
  };
  const state = {
    auth: null, generation: 0, loading: false, browserLock: { current: false },
    redirects: [], pkceCalls: 0, browsers: [], exchanges: [], saved: [], hidden: 0,
    alerts: [], debug: [], loadingChanges: [],
  };
  const current = (operation, generation) => state.auth === operation && state.generation === generation;
  const app = load([
    'membershipPlanForRole', 'buildNativeGoogleStartUrl', 'hasNativeTokenSession',
    'runBdGoogleLoginInSystemBrowser',
  ], {
    useCallback: (fn) => fn,
    TARGET_URL: 'https://www.weddingwin.ca',
    COUPLE_MEMBERSHIP_PLAN_ID: '18', VENDOR_MEMBERSHIP_PLAN_ID: '17',
    APP_BACKEND_URL: 'https://backend.example.invalid',
    APP_BACKEND_PUBLISHABLE_KEY: 'fictional-public-key',
    BD_GOOGLE_RETURN_PATH: 'bd-login',
    browserAuthInFlightRef: state.browserLock,
    beginAuthOperation(operation) {
      if (state.auth) return null;
      state.auth = operation;
      return ++state.generation;
    },
    authOperationIsCurrent: current,
    finishAuthOperation(operation, generation) {
      if (current(operation, generation)) state.auth = null;
    },
    setGoogleLoginLoading(value) { state.loading = value; state.loadingChanges.push(value); },
    AuthSession: { makeRedirectUri(options) { state.redirects.push(options); return behavior.redirect(options); } },
    createGooglePkcePair() { state.pkceCalls++; return behavior.pkce(); },
    WebBrowser: { openAuthSessionAsync(...args) { state.browsers.push(args); return behavior.browser(...args); } },
    fetchAppJsonWithTimeout(...args) { state.exchanges.push(args); return behavior.exchange(...args); },
    Alert: { alert(...args) { state.alerts.push(args); } },
    addDebugLine(message) { state.debug.push(message); },
    saveNativeSession(...args) { state.saved.push(args); },
    hideWebsiteBrowser() { state.hidden++; },
  });
  return {
    state, behavior, run: app.runBdGoogleLoginInSystemBrowser,
    invalidate() {
      // Mirrors clearNativeSession: invalidate the owner and reset visible busy state.
      state.generation++;
      state.auth = null;
      state.loading = false;
    },
  };
}

function released(h) {
  assert.equal(h.state.auth, null, 'Auth operation must release its lock');
  assert.equal(h.state.browserLock.current, false, 'Browser operation must release its lock');
  assert.equal(h.state.loading, false, 'Google button must become available again');
}

function noSession(h) {
  assert.equal(h.state.saved.length, 0, 'A failed/cancelled/stale flow must not sign in');
  assert.equal(h.state.hidden, 0);
}

test('PKCE uses all 32 secure random bytes without btoa, atob, or Buffer globals', async () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index * 7 % 256);
  const calls = [];
  const app = load(['createGooglePkcePair'], {
    // Explicitly undefined even on host runtimes that normally provide these.
    btoa: undefined, atob: undefined, Buffer: undefined,
    Crypto: {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' },
      async getRandomBytesAsync(size) { calls.push(['random', size]); return bytes; },
      async digestStringAsync(algorithm, text, options) {
        calls.push(['digest', algorithm, text, options.encoding]);
        return createHash('sha256').update(text).digest('base64');
      },
    },
  });
  const pair = await app.createGooglePkcePair();
  const expectedVerifier = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  assert.equal(pair.codeVerifier, expectedVerifier);
  assert.match(pair.codeVerifier, /^[0-9a-f]{64}$/);
  assert.equal(pair.codeChallenge, createHash('sha256').update(expectedVerifier).digest('base64url'));
  assert.match(pair.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(calls, [['random', 32], ['digest', 'SHA-256', expectedVerifier, 'base64']]);
});

test('successful Google sign-in uses stable callback, PKCE-only exchange, and returns to native menu', async () => {
  const h = harness();
  await h.run();
  released(h);
  assert.equal(h.state.alerts.length, 0);
  assert.equal(h.state.saved.length, 1);
  assert.equal(h.state.saved[0][2], 'couple');
  assert.equal(h.state.hidden, 1);
  assert.equal(h.state.redirects[0].native, callbackBase);
  assert.equal(h.state.redirects[0].scheme, 'weddingwin');
  assert.equal(h.state.redirects[0].path, 'bd-login');
  const [start, redirect] = h.state.browsers[0];
  const url = new URL(start);
  assert.equal(url.origin, 'https://www.weddingwin.ca');
  assert.equal(url.pathname, '/auth/google-start');
  assert.equal(url.searchParams.get('redirect_to'), callbackBase);
  assert.equal(url.searchParams.get('code_challenge'), codeChallenge);
  assert.equal(url.searchParams.get('subscription_id'), '18');
  assert(!url.searchParams.has('code_verifier'));
  assert.equal(redirect, callbackBase);
  assert.equal(h.state.exchanges[0][0], 'https://backend.example.invalid/functions/v1/google-native-exchange');
  assert.deepEqual(JSON.parse(h.state.exchanges[0][1].body), { code: exchangeCode, code_verifier: codeVerifier });
  assert(!JSON.stringify(h.state.debug).includes(exchangeCode));
  assert(!JSON.stringify(h.state.debug).includes(codeVerifier));
});

test('vendor signup forwards selected role and supplied consent without inventing acceptance', async () => {
  const h = harness();
  const consent = { acceptedAt: '2026-09-05T00:00:00.000Z', termsVersion: 'fixture-terms', privacyVersion: 'fixture-privacy' };
  await h.run('vendor', consent);
  const url = new URL(h.state.browsers[0][0]);
  assert.equal(url.searchParams.get('subscription_id'), '17');
  assert.equal(url.searchParams.get('accepted_terms'), '1');
  assert.equal(url.searchParams.get('accepted_privacy'), '1');
  assert.equal(url.searchParams.get('accepted_at'), consent.acceptedAt);
  assert.equal(h.state.saved[0][2], 'vendor');
  const login = harness();
  await login.run();
  assert(!new URL(login.state.browsers[0][0]).searchParams.has('accepted_terms'));
});

for (const stage of ['redirect', 'pkce', 'browser', 'exchange']) {
  test(`${stage} failure shows an error, releases locks, and permits a successful retry`, async () => {
    const h = harness();
    const original = h.behavior[stage];
    h.behavior[stage] = () => { throw new Error(`PRIVATE-DETAIL-${stage}-${exchangeCode}`); };
    await h.run();
    released(h);
    noSession(h);
    assert.equal(h.state.alerts.length, 1);
    assert(!JSON.stringify(h.state.debug).includes('PRIVATE-DETAIL'));
    assert(!JSON.stringify(h.state.debug).includes(exchangeCode));
    assert(!JSON.stringify(h.state.alerts).includes('PRIVATE-DETAIL'));
    h.behavior[stage] = original;
    await h.run();
    released(h);
    assert.equal(h.state.saved.length, 1);
  });
}

for (const resultType of ['cancel', 'dismiss', 'locked']) {
  test(`browser ${resultType} does not exchange credentials and permits a retry`, async () => {
    const h = harness({ browser: async () => ({ type: resultType }) });
    await h.run();
    released(h);
    noSession(h);
    assert.equal(h.state.exchanges.length, 0);
    assert.equal(h.state.alerts.length, 0);
    h.behavior.browser = async () => ({ type: 'success', url: callback });
    await h.run();
    assert.equal(h.state.saved.length, 1);
  });
}

test('exchange timeout clears busy UI and does not persist a partial session', async () => {
  const h = harness({ exchange: async () => { throw new Error('AbortError: fictional timeout'); } });
  await h.run();
  released(h);
  noSession(h);
  assert.equal(h.state.exchanges.length, 1);
  assert.equal(h.state.alerts.length, 1);
  assert.match(h.state.alerts[0][1], /could not finish|connection/i);
});

for (const [label, response] of [
  ['HTTP failure', { response: { ok: false, status: 503 }, data: { ok: false, error: 'Temporarily unavailable' } }],
  ['expired exchange', { response: { ok: true, status: 200 }, data: { ok: false } }],
  ['missing member email', { response: { ok: true }, data: { ok: true, user: {}, native_session: { user_id: 'test', token: 'fictional' } } }],
  ['missing session token', { response: { ok: true }, data: { ok: true, user: { email: 'fixture@example.invalid' }, native_session: { user_id: 'test' } } }],
]) {
  test(`${label} cannot create a signed-in state`, async () => {
    const h = harness({ exchange: async () => response });
    await h.run();
    released(h);
    noSession(h);
    assert.equal(h.state.alerts.length, 1);
  });
}

for (const [label, url] of [
  ['wrong scheme', `evil://bd-login?exchange_code=${exchangeCode}`],
  ['HTTPS website URL', `https://www.weddingwin.ca/bd-login?exchange_code=${exchangeCode}`],
  ['wrong hostname', `weddingwin://other?exchange_code=${exchangeCode}`],
  ['wrong path', `weddingwin://bd-login/extra?exchange_code=${exchangeCode}`],
  ['unexpected port', `weddingwin://bd-login:443?exchange_code=${exchangeCode}`],
  ['userinfo', `weddingwin://attacker@bd-login?exchange_code=${exchangeCode}`],
  ['password', `weddingwin://attacker:password@bd-login?exchange_code=${exchangeCode}`],
  ['fragment credentials', `${callbackBase}#exchange_code=${exchangeCode}`],
  ['query plus credential fragment', `${callback}#access_token=fictional-fragment-token`],
  ['malformed URL', 'this is not a URL'],
]) {
  test(`rejects ${label} before attempting the one-time exchange`, async () => {
    const h = harness({ browser: async () => ({ type: 'success', url }) });
    await h.run();
    released(h);
    noSession(h);
    assert.equal(h.state.exchanges.length, 0);
    assert.equal(h.state.alerts.length, 1);
    assert(!JSON.stringify(h.state.debug).includes(exchangeCode));
  });
}

test('expected callback with provider error or missing exchange code cannot sign in', async () => {
  for (const url of [`${callbackBase}?error=access_denied&error_description=Test+cancelled`, callbackBase]) {
    const h = harness({ browser: async () => ({ type: 'success', url }) });
    await h.run();
    released(h);
    noSession(h);
    assert.equal(h.state.exchanges.length, 0);
    assert.equal(h.state.alerts.length, 1);
  }
});

test('rapid duplicate taps launch one browser and redeem one exchange', async () => {
  const pending = deferred();
  const h = harness({ pkce: () => pending.promise });
  const first = h.run();
  await h.run();
  assert.equal(h.state.pkceCalls, 1);
  pending.resolve({ codeVerifier, codeChallenge });
  await first;
  released(h);
  assert.equal(h.state.browsers.length, 1);
  assert.equal(h.state.exchanges.length, 1);
  assert.equal(h.state.saved.length, 1);
});

test('another active auth operation is never replaced by a Google tap', async () => {
  const h = harness();
  h.state.auth = 'email-login';
  await h.run();
  assert.equal(h.state.auth, 'email-login');
  assert.equal(h.state.pkceCalls, 0);
  assert.equal(h.state.browsers.length, 0);
  assert.equal(h.state.browserLock.current, false);
});

for (const stage of ['pkce', 'browser', 'exchange']) {
  test(`stale ${stage} result after logout cannot sign the user back in`, async () => {
    const pending = deferred();
    const arrived = deferred();
    const h = harness({ [stage]: () => { arrived.resolve(); return pending.promise; } });
    const login = h.run();
    await arrived.promise;
    h.invalidate();
    pending.resolve(stage === 'pkce' ? { codeVerifier, codeChallenge } : stage === 'browser' ? { type: 'success', url: callback } : success());
    await login;
    released(h);
    noSession(h);
    assert.equal(h.state.alerts.length, 0);
    if (stage !== 'exchange') assert.equal(h.state.exchanges.length, 0);
  });
}
