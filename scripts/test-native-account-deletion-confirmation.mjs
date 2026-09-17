import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise actual About declarations; no Expo imports, device or live service calls.
const source = readFileSync(new URL('../app/(tabs)/about.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('about.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  let result;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.getText(ast) === name) {
      assert.equal(result, undefined, `Unique About declaration: ${name}`);
      result = ts.isVariableDeclaration(node) ? `const ${node.getText(ast)};` : node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(result, `Missing About declaration: ${name}`);
  return result;
}
function load(names, globals) {
  const context = vm.createContext({ Error, Date, JSON, ...globals });
  const code = names.map(declaration).join('\n') + `\nglobalThis.exposed = { ${names.join(', ')} };`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exposed;
}
const identity = { user_id: '990001', token: 'offline-deletion-token' };
const newer = { user_id: '990002', token: 'new-offline-token' };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const success = () => response(200, { ok: true, deleted: true });
const reauth = () => response(409, { ok: false, requires_apple_reauthentication: true, error: 'Confirm with Apple.' });
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) { now += ms; for (const [id, timer] of timers) { if (timer.at <= now) { timers.delete(id); timer.fn(); } } },
  };
}
function harness(fetchImpl = async () => success(), options = {}) {
  const state = { session: { ...identity }, ref: { ...identity }, generation: 0, requests: [], alerts: [], events: [], writes: [], routes: [], sessionUI: [], deletingUI: [], finished: [], appleCalls: [], beginCalls: [] };
  const timer = clock();
  const inFlight = { current: true };
  const globals = {
    useCallback: fn => fn, AbortController,
    setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout,
    APP_BACKEND_URL: 'https://offline.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'offline-public',
    ACCOUNT_DELETED_EVENT_KEY: 'offline.deleted',
    getNativeSessionStorageGeneration: () => state.generation,
    loadNativeSession: options.loadSession || (async () => state.session),
    fetch: async (...args) => { state.requests.push(args); return fetchImpl(...args); },
    SecureStore: { setItemAsync: async (...args) => { state.writes.push(args); await options.write?.(...args); } },
    notifyAccountDeleted: event => {
      state.events.push(event);
      if (String(state.session?.user_id) === event.userId && state.session?.token === event.token) {
        state.session = null; state.generation++;
      }
    },
    nativeSessionRef: { get current() { return state.ref; }, set current(value) { state.ref = value; } },
    setHasNativeSession: value => state.sessionUI.push(value), setDeleting: value => state.deletingUI.push(value),
    finishAccountDeletion: (...args) => state.finished.push(args), deleteInFlightRef: inFlight,
    beginAccountDeletion: (...args) => { state.beginCalls.push(args); return true; },
    router: { replace: path => state.routes.push(path) }, Alert: { alert: (...args) => state.alerts.push(args) },
    Platform: { OS: 'ios' }, Crypto: { randomUUID: () => 'offline-nonce-state' },
    AppleAuthentication: {
      isAvailableAsync: options.appleAvailable || (async () => true),
      signInAsync: async request => {
        state.appleCalls.push(request);
        return options.appleSignIn ? options.appleSignIn(request) : { state: request.state, authorizationCode: 'offline-apple-code' };
      },
    },
  };
  const app = load([
    'ACCOUNT_DELETION_TIMEOUT_MS', 'DeletionConfirmationUnavailableError', 'sameNativeSessionIdentity',
    'deletionSessionIsCurrent', 'requestAccountDeletion', 'clearDeletedAccountSession',
    'deleteNativeAccount', 'startNativeAccountDeletion',
  ], globals);
  const switchAccount = (session = newer) => { state.session = session; state.ref = session; state.generation++; };
  return { app, state, timer, switchAccount, inFlight };
}

test('deletion succeeds after the old 18-second timeout without resending or aborting', async () => {
  const pending = deferred();
  const { app, state, timer } = harness(() => pending.promise);
  const request = app.requestAccountDeletion(identity);
  timer.advance(18001);
  assert.equal(state.requests[0][1].signal.aborted, false);
  assert.equal(app.ACCOUNT_DELETION_TIMEOUT_MS, 160000);
  pending.resolve(success());
  assert.equal((await request).result.deleted, true);
  assert.equal(state.requests.length, 1);
  assert.equal(timer.timers.size, 0);
});

test('deletion permits the complete gateway response window but aborts at its own bound', async () => {
  const aborted = new Error('Request aborted');
  const { app, state, timer } = harness((_url, request) => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(aborted))));
  const request = app.requestAccountDeletion(identity);
  const rejected = assert.rejects(request, error => error instanceof app.DeletionConfirmationUnavailableError && error.cause === aborted);
  timer.advance(150001);
  assert.equal(state.requests[0][1].signal.aborted, false);
  timer.advance(10000);
  await rejected;
  assert.equal(state.requests.length, 1);
  assert.equal(timer.timers.size, 0);
});

for (const mode of ['network', 'json', 'body-abort']) {
  test(`${mode} failure is retained as ambiguous confirmation, never success or retry`, async () => {
    const cause = new Error(mode);
    const { app, state, timer } = harness(async () => {
      if (mode === 'network') throw cause;
      return { status: 200, ok: true, json: async () => { throw cause; } };
    });
    await assert.rejects(app.requestAccountDeletion(identity), error => {
      assert.equal(error.cause, cause);
      assert.match(error.message, /may still have completed/);
      assert.match(error.message, /info@weddingwin.ca/);
      assert.doesNotMatch(error.message, /try again|Check your connection/);
      return error instanceof app.DeletionConfirmationUnavailableError;
    });
    assert.equal(state.requests.length, 1);
    assert.equal(timer.timers.size, 0);
  });
}

test('an abort while reading a successful response body remains ambiguous', async () => {
  const { app, timer } = harness(async (_url, request) => ({
    status: 200, ok: true,
    json: () => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('Body aborted')))),
  }));
  const request = app.requestAccountDeletion(identity);
  const rejected = assert.rejects(request, error => error instanceof app.DeletionConfirmationUnavailableError && error.cause.message === 'Body aborted');
  await flush();
  timer.advance(160001);
  await rejected;
});

for (const status of [408, 500, 502, 503, 504]) {
  test(`HTTP ${status} does not turn partial deletion into a definitive failure`, async () => {
    const { app } = harness(async () => response(status, { ok: false, error: 'Try again.', diagnostic_id: 'offline-diagnostic' }));
    await assert.rejects(app.requestAccountDeletion(identity), error => {
      assert.match(error.message, /Diagnostic: offline-diagnostic/);
      assert.doesNotMatch(error.message, /Try again/);
      return error instanceof app.DeletionConfirmationUnavailableError;
    });
  });
}

test('only an explicit successful response confirms deletion; malformed envelopes stay ambiguous', async () => {
  for (const body of [null, [], {}, { ok: true }, { deleted: true }, { ok: 'true', deleted: true }]) {
    const { app } = harness(async () => response(200, body));
    await assert.rejects(app.requestAccountDeletion(identity), error => error instanceof app.DeletionConfirmationUnavailableError);
  }
});

test('authoritative server rejection retains its error and diagnostic; no cleanup occurs', async () => {
  for (const status of [400, 401, 403, 409, 429]) {
    const { app, state } = harness(async () => response(status, { ok: false, error: 'Explicit rejection.', diagnostic_id: 'offline-rejection' }));
    await app.deleteNativeAccount(identity);
    assert.equal(state.events.length, 0);
    assert.equal(state.alerts[0][0], 'Could not delete account');
    assert.match(state.alerts[0][1], /Explicit rejection/);
    assert.match(state.alerts[0][1], /offline-rejection/);
    assert.equal(state.requests.length, 1);
  }
});

test('ambiguous outcome presents confirmation-unavailable UI and preserves local identity', async () => {
  const { app, state } = harness(async () => { throw new TypeError('Offline'); });
  await app.deleteNativeAccount(identity);
  assert.equal(state.alerts[0][0], 'Deletion confirmation unavailable');
  assert.equal(state.session.user_id, identity.user_id);
  assert.equal(state.writes.length, 0);
  assert.equal(state.events.length, 0);
  assert.equal(state.finished.length, 1);
});

test('confirmed deletion emits the original identity event and clears only its current UI', async () => {
  const { app, state } = harness();
  await app.deleteNativeAccount(identity);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].userId, identity.user_id);
  assert.equal(state.events[0].token, identity.token);
  assert.equal(JSON.parse(state.writes[0][1]).user_id, identity.user_id);
  assert.equal(state.session, null);
  assert.equal(state.ref, null);
  assert.equal(state.alerts[0][0], 'Account deleted');
  await state.alerts[0][2][0].onPress();
  assert.deepEqual(state.routes, ['/']);
});

test('confirmed server deletion still clears the mounted identity when event persistence fails', async () => {
  const { app, state } = harness(undefined, { write: async () => { throw new Error('Secure storage unavailable'); } });
  await app.deleteNativeAccount(identity);
  assert.equal(state.events.length, 1);
  assert.equal(state.session, null);
  assert.equal(state.alerts[0][0], 'Account deleted');
  assert.equal(state.requests.length, 1);
});

test('Apple reauthentication keeps state/nonce validation and retries only after current-account confirmation', async () => {
  let count = 0;
  const { app, state } = harness(async () => ++count === 1 ? reauth() : success());
  await app.deleteNativeAccount(identity);
  assert.equal(state.appleCalls.length, 1);
  assert.equal(state.requests.length, 2);
  const body = JSON.parse(state.requests[1][1].body);
  assert.equal(body.apple_authorization_code, 'offline-apple-code');
  assert.equal(body.apple_nonce, state.appleCalls[0].nonce);
  assert.equal(state.alerts[0][0], 'Account deleted');
});

test('Apple cancellation remains silent and mismatched state never dispatches a second deletion', async () => {
  for (const mode of ['cancel', 'state']) {
    const { app, state } = harness(async () => reauth(), { appleSignIn: async () => {
      if (mode === 'cancel') throw Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
      return { state: 'wrong-state', authorizationCode: 'offline-code' };
    } });
    await app.deleteNativeAccount(identity);
    assert.equal(state.requests.length, 1);
    assert.equal(state.events.length, 0);
    assert.equal(state.alerts.length, mode === 'cancel' ? 0 : 1);
  }
});

test('an account switch during Apple authorization prevents another request and stale alerts', async () => {
  const pending = deferred();
  const { app, state, switchAccount } = harness(async () => reauth(), { appleSignIn: () => pending.promise });
  const deletion = app.deleteNativeAccount(identity);
  await flush();
  assert.equal(state.appleCalls.length, 1);
  switchAccount();
  pending.resolve({ state: 'offline-nonce-state', authorizationCode: 'offline-code' });
  await deletion;
  assert.equal(state.requests.length, 1);
  assert.equal(state.events.length, 0);
  assert.equal(state.alerts.length, 0);
  assert.equal(state.session.user_id, newer.user_id);
});

test('an account switch while checking Apple availability prevents the Apple prompt', async () => {
  const pending = deferred();
  const { app, state, switchAccount } = harness(async () => reauth(), { appleAvailable: () => pending.promise });
  const deletion = app.deleteNativeAccount(identity);
  await flush(); switchAccount(); pending.resolve(true); await deletion;
  assert.equal(state.appleCalls.length, 0);
  assert.equal(state.requests.length, 1);
  assert.equal(state.alerts.length, 0);
});

test('a new account during an outstanding response is never cleared or shown stale deletion feedback', async () => {
  for (const result of [success(), response(503, { ok: false, error: 'Partial cleanup.' })]) {
    const pending = deferred();
    const { app, state, switchAccount } = harness(() => pending.promise);
    const deletion = app.deleteNativeAccount(identity);
    await flush(); switchAccount(); pending.resolve(result); await deletion;
    assert.equal(state.events.length, 0);
    assert.equal(state.alerts.length, 0);
    assert.equal(state.sessionUI.length, 0);
    assert.equal(state.session.user_id, newer.user_id);
  }
});

test('identity-scoped event cannot clear a new login during its storage write', async () => {
  const pending = deferred();
  const { app, state, switchAccount } = harness(undefined, { write: () => pending.promise });
  const deletion = app.deleteNativeAccount(identity);
  await flush(); assert.equal(state.writes.length, 1); switchAccount(); pending.resolve(); await deletion;
  assert.equal(state.events[0].userId, identity.user_id);
  assert.equal(state.session.user_id, newer.user_id);
  assert.equal(state.ref.user_id, newer.user_id);
  assert.equal(state.sessionUI.length, 0);
  assert.equal(state.alerts.length, 0);
});

test('success alert cannot navigate over a later account login', async () => {
  const { app, state, switchAccount } = harness();
  await app.deleteNativeAccount(identity);
  switchAccount();
  await state.alerts[0][2][0].onPress();
  assert.equal(state.routes.length, 0);
});

test('a stale confirmation cannot start deletion for the newly focused account', () => {
  const { app, state, switchAccount, inFlight } = harness();
  inFlight.current = false; switchAccount();
  app.startNativeAccountDeletion(identity);
  assert.equal(state.beginCalls.length, 0);
  assert.equal(state.requests.length, 0);
  assert.equal(state.sessionUI.length, 0);
});
