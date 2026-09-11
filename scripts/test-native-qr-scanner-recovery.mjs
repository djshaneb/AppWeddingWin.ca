import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

// Execute current app callbacks/effects with isolated native, network and timer
// dependencies. These tests never invoke a camera, backend or real account.
const api = loadAppDeclarations(['validQrScanTimestamp', 'normalizeQrBingoEventConfig', 'normalizeQrInShowScannedIds', 'normalizeQrVendorDrawScannedIds']);
const event = Object.freeze({ event_key: 'offline-show', revision: 14,
  event_name: 'Offline show', venue_name: 'Offline venue', vendor_tag_id: 30,
  app_card_enabled: true, scan_enabled: true, scan_open_early: true,
  scan_opens_at: '2026-10-18T04:00:00Z', history_starts_at: '2026-10-18T15:00:00Z',
  entry_closes_at: '2026-10-18T19:00:00Z', vendor_draws_enabled: true,
  rules_version: 'offline-rules', official_rules_url: 'https://www.weddingwin.ca/qr-bingo-official-rules', email_delivery_mode: 'disabled' });
const vendor = Object.freeze({ id: '901', name: 'Offline vendor' });
const barcode = Object.freeze({ data: 'https://www.weddingwin.ca/qr?vendor_id=901' });
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

function cameraFixture({ parserFailure = false, saveFailure = false, cueFailure = false,
  asyncCueFailure = false, saveCallback, saved = true, held = false, duplicate = false, verified = true } = {}) {
  const timers = [], locks = [], errors = [], feedback = [], saves = [], cues = [];
  const generation = { current: 1 }, inFlight = { current: false };
  let release;
  const pending = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const globals = { useCallback: fn => fn, reviewingParticipationNoticeRef: { current: false },
    accountDeletionIsInFlight: () => false, qrInteractionGenerationRef: generation,
    contactProfileComplete: true, participationNoticeAccepted: true, scannerConfigVerified: verified,
    eventScanEnabled: true, eventConfig: event, eventVendorDrawsEnabled: true, isolatedFixtureActive: false,
    isQrBingoScanWindowOpen: () => true,
    scanLocked: false, scanInFlightRef: inFlight, scanUnlockTimerRef: { current: null }, raffleOffer: null,
    setBingoError: value => errors.push(value), setScanLocked: value => locks.push(value),
    vendors: [vendor], scannedVendorIds: new Set(duplicate ? [vendor.id] : []),
    matchQrBingoVendor: () => { if (parserFailure) throw Error('offline parser failure'); return vendor; },
    showScanFeedback: (...args) => feedback.push(args),
    saveBingoScan: async () => { saves.push(vendor.id); await pending; if (saveCallback) return saveCallback(vendor); if (saveFailure) throw Error('offline save failure'); return saved; },
    reopenVendorDrawOffer: () => assert.fail('Production camera rescan must use scan endpoint'),
    onScan: () => { cues.push(vendor.id); if (cueFailure) throw Error('offline cue failure'); if (asyncCueFailure) return Promise.reject(Error('offline async cue failure')); },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
    Haptics: { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } },
  };
  return { ...loadAppDeclarations(['handleBarcodeScanned'], globals), timers, locks, errors,
    feedback, saves, cues, generation, inFlight, release: () => release?.() };
}

for (const [name, options] of [
  ['parser exception', { parserFailure: true }], ['unexpected save exception', { saveFailure: true }],
  ['rejected scan', { saved: false }], ['unexpected duplicate-save exception', { duplicate: true, saveFailure: true }],
]) test(`${name} shows failure and always rearms the camera`, async () => {
  const f = cameraFixture(options);
  await f.handleBarcodeScanned(barcode);
  assert.equal(f.inFlight.current, true);
  assert.equal(f.timers.length, 1); assert(f.timers[0].delay >= 1200 && f.timers[0].delay <= 1600);
  assert(f.feedback.some(([, tone]) => tone === 'error'));
  f.timers[0].fn(); assert.equal(f.inFlight.current, false); assert.equal(f.locks.at(-1), false);
});

test('optional completion cue cannot turn a successful scan into an error or a stuck camera', async () => {
  const f = cameraFixture({ cueFailure: true }); await f.handleBarcodeScanned(barcode);
  assert.deepEqual(f.saves, ['901']); assert.deepEqual(f.cues, ['901']); assert.deepEqual(f.errors, []);
  assert.equal(f.timers.length, 1); f.timers[0].fn(); assert.equal(f.inFlight.current, false);
});

test('a rejected asynchronous completion cue is consumed without losing a successful scan', async () => {
  const f = cameraFixture({ asyncCueFailure: true }); await f.handleBarcodeScanned(barcode); await flush();
  assert.deepEqual(f.saves, ['901']); assert.deepEqual(f.cues, ['901']); assert.deepEqual(f.errors, []);
  assert.equal(f.timers.length, 1); f.timers[0].fn(); assert.equal(f.inFlight.current, false);
});

test('rapid frames share one save, then a bounded reset permits another scan', async () => {
  const f = cameraFixture({ held: true });
  const first = f.handleBarcodeScanned(barcode); await f.handleBarcodeScanned(barcode);
  assert.equal(f.saves.length, 1); assert.equal(f.timers.length, 0);
  f.release(); await first; await f.handleBarcodeScanned(barcode); assert.equal(f.saves.length, 1);
  f.timers[0].fn(); await f.handleBarcodeScanned(barcode); assert.equal(f.saves.length, 2);
});

test('retired request and retired reset timer cannot mutate a newer scanner session', async () => {
  const pending = cameraFixture({ held: true, saveFailure: true });
  const result = pending.handleBarcodeScanned(barcode); pending.generation.current += 1;
  pending.release(); await result;
  assert.deepEqual(pending.errors, []); assert.deepEqual(pending.feedback, []); assert.equal(pending.timers.length, 0);
  const complete = cameraFixture(); await complete.handleBarcodeScanned(barcode);
  complete.generation.current += 1; complete.locks.length = 0; complete.timers[0].fn();
  assert.deepEqual(complete.locks, []); assert.equal(complete.inFlight.current, true);
});

test('unverified settings refuse camera frames before any lock or save', async () => {
  const f = cameraFixture({ verified: false }); await f.handleBarcodeScanned(barcode);
  assert.deepEqual(f.saves, []); assert.deepEqual(f.locks, []); assert.equal(f.timers.length, 0);
});

function saveFixture({ response = { ok: false }, data = { ok: false, error: 'The scan service is temporarily unavailable.' }, held = false, verified = true, transport } = {}) {
  const configs = [], verifications = [], errors = [], progress = [], offers = [], requests = [], feedback = [];
  const generation = { current: 1 }; let currentAccount = true, release;
  const pending = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const globals = { Error, useCallback: fn => fn, accountDeletionIsInFlight: () => false,
    getAccountDeletionGeneration: () => 1, accountMutationIsCurrent: () => currentAccount,
    qrInteractionGenerationRef: generation, nativeSession: { user_id: 'offline', token: 'offline' },
    contactProfileComplete: true, participationNoticeAccepted: true, scannerConfigVerified: verified,
    eventScanEnabled: true, eventConfig: event, isolatedFixtureActive: false,
    isQrBingoScanWindowOpen: () => true,
    clearBingoCardState: () => assert.fail('A failed save must not erase a loaded card'), setSavingBingo() {},
    setBingoError: value => errors.push(value), setEventConfig: value => configs.push(value),
    setScannerConfigVerified: value => verifications.push(value),
    fetchQrBingoJsonWithTimeout: async (url, options, message) => { requests.push(JSON.parse(options.body).action); await pending; return transport ? transport(url, options, message) : { response, data }; },
    QR_BINGO_SYNC_FUNCTION_URL: 'https://offline.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'offline', QR_BINGO_PARTICIPATION_NOTICE_VERSION: 'offline',
    normalizeQrBingoEventConfig: api.normalizeQrBingoEventConfig, normalizeQrVendorDrawScannedIds: api.normalizeQrVendorDrawScannedIds,
    vendors: [vendor], setVendors() {}, setBingoTotalCount() {}, showScanFeedback: (...args) => feedback.push(args),
    setScannedVendorIds: value => progress.push([...value]), setVendorDrawScannedVendorIds() {},
    setRaffleOffer: value => offers.push(value),
  };
  return { ...loadAppDeclarations(['saveBingoScan'], globals), configs, verifications, errors, progress, offers, requests, feedback,
    generation, release: () => release?.(), retireAccount: () => { currentAccount = false; } };
}

const completionMessage = 'Congratulations! You’ve completed Vendor Bingo. You’re now entered in the grand prize draw.';

test('confirmed native completion shows the exact clean grand-prize message', async () => {
  const f = saveFixture({ response: { ok: true }, data: { ok: true, completed: true, event_config: event, scanned: ['901'] } });
  assert.equal(await f.saveBingoScan(vendor), true);
  assert.equal(f.feedback.length, 1);
  assert.deepEqual(f.feedback[0], [completionMessage, 'success', undefined]);
  assert.doesNotMatch(f.feedback[0][0], /vendor draw|vendor prize|optional|separate/i);
});

test('an incomplete native scan never claims grand-prize completion', async () => {
  const f = saveFixture({ response: { ok: true }, data: { ok: true, completed: false, event_config: event, scanned: ['901'] } });
  assert.equal(await f.saveBingoScan(vendor), true);
  assert.deepEqual(f.feedback[0], [`Scanned: ${vendor.name}`, 'success', 5000]);
  assert(!f.feedback.some(([message]) => message === completionMessage));
});

test('failed or unverifiable native scan cannot claim completion even if its payload says completed', async () => {
  for (const options of [
    { response: { ok: false }, data: { ok: false, completed: true, event_config: event, error: 'Offline rejection' } },
    { response: { ok: true }, data: { ok: true, completed: true, event_config: {} } },
  ]) {
    const f = saveFixture(options); assert.equal(await f.saveBingoScan(vendor), false);
    assert.deepEqual(f.feedback, []); assert.deepEqual(f.progress, []);
  }
});

test('failed scan without config preserves known settings, rejects success and exposes its real error', async () => {
  const f = saveFixture(); assert.equal(await f.saveBingoScan(vendor), false);
  assert.deepEqual(f.configs, []); assert.deepEqual(f.verifications, []); assert.deepEqual(f.progress, []);
  assert.deepEqual(f.offers, []); assert.equal(f.errors.at(-1), 'The scan service is temporarily unavailable.');
  assert(appSource.includes("bingoError || 'Close and reopen the scanner to refresh the event settings.'"));
});

function timedRequestFixture({ headersAfter = 0, bodyAfter = 0 } = {}) {
  let now = 0, timerId = 0, signal;
  const timers = new Map(), fetches = [];
  const clock = {
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const wait = (delay, requestSignal) => new Promise((resolve, reject) => {
    const abort = () => { clock.clearTimeout(id); reject(Error('offline transport aborted')); };
    const id = clock.setTimeout(() => { requestSignal.removeEventListener('abort', abort); resolve(); }, delay);
    requestSignal.addEventListener('abort', abort, { once: true });
    if (requestSignal.aborted) abort();
  });
  const request = loadAppDeclarations(['QR_BINGO_REQUEST_TIMEOUT_MS', 'fetchQrBingoJsonWithTimeout'], {
    Error, AbortController, ...clock,
    fetch: async (url, options) => {
      fetches.push({ url, options }); signal = options.signal; await wait(headersAfter, signal);
      return { ok: true, json: async () => { await wait(bodyAfter, signal); return { ok: true, event_config: event, scanned: ['901'] }; } };
    },
  });
  return { ...request, fetches, timers, signal: () => signal,
    advance(ms) { const target = now + ms; let next;
      while ((next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0])) {
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = target;
    },
  };
}

test('QR timeout permits a successful native round trip after the old 12-second cutoff', async () => {
  const f = timedRequestFixture({ headersAfter: 15_000 });
  assert.equal(f.QR_BINGO_REQUEST_TIMEOUT_MS, 30_000);
  const result = f.fetchQrBingoJsonWithTimeout('https://offline.invalid', { method: 'POST' }, 'offline timeout');
  f.advance(12_000); await flush(); assert.equal(f.signal().aborted, false);
  f.advance(3_000); await flush(); f.advance(0); const { data } = await result;
  assert.equal(data.ok, true); assert.equal(f.signal().aborted, false); assert.equal(f.timers.size, 0);
  assert.equal(f.fetches.length, 1, 'No automatic retry or duplicate write');
});

test('QR timeout still aborts while reading the response body and clears its timer', async () => {
  const f = timedRequestFixture({ bodyAfter: 60_000 });
  const result = f.fetchQrBingoJsonWithTimeout('https://offline.invalid', {}, 'body not confirmed');
  const rejection = assert.rejects(result, /body not confirmed/);
  f.advance(0); await flush(); f.advance(29_999); await flush(); assert.equal(f.signal().aborted, false);
  f.advance(1); await rejection;
  assert.equal(f.signal().aborted, true); assert.equal(f.timers.size, 0); assert.equal(f.fetches.length, 1);
});

test('scan timeout retains its lock until bounded recovery, preserves progress and explains uncertainty', async () => {
  const request = timedRequestFixture({ headersAfter: 60_000 });
  const save = saveFixture({ transport: request.fetchQrBingoJsonWithTimeout });
  const camera = cameraFixture({ saveCallback: save.saveBingoScan });
  const first = camera.handleBarcodeScanned(barcode); await flush();
  request.advance(29_999); await flush(); await camera.handleBarcodeScanned(barcode);
  assert.equal(camera.inFlight.current, true); assert.equal(camera.saves.length, 1); assert.equal(camera.timers.length, 0);
  request.advance(1); await first;
  assert.equal(save.errors.at(-1), 'We could not confirm this scan. Please scan again to check your progress.');
  assert.deepEqual(save.configs, []); assert.deepEqual(save.progress, []);
  assert.equal(camera.inFlight.current, true); assert.equal(camera.timers.length, 1);
  assert.equal(camera.feedback.at(-1)[0], save.errors.at(-1));
  camera.timers[0].fn(); assert.equal(camera.inFlight.current, false); assert.equal(camera.locks.at(-1), false);
  assert.equal(request.fetches.length, 1, 'Timeout must not automatically resubmit the scan');
});

test('explicit malformed or successful-but-unverifiable config fails closed without erasing last settings', async () => {
  for (const options of [{ data: { ok: false, event_config: {}, error: 'Rejected' } }, { response: { ok: true }, data: { ok: true } }]) {
    const f = saveFixture(options); assert.equal(await f.saveBingoScan(vendor), false);
    assert.deepEqual(f.configs, []); assert.deepEqual(f.verifications, [false]); assert.deepEqual(f.progress, []);
  }
});

test('server rejection with current master pause applies the pause but never stores progress', async () => {
  const f = saveFixture({ data: { ok: false, event_config: { ...event, scan_enabled: false }, error: 'Scanning is paused' } });
  assert.equal(await f.saveBingoScan(vendor), false); assert.equal(f.configs[0].scan_enabled, false);
  assert.deepEqual(f.verifications, [true]); assert.deepEqual(f.progress, []);
});

test('unverified direct save is refused and stale successful responses cannot restore verification', async () => {
  const unverified = saveFixture({ verified: false }); assert.equal(await unverified.saveBingoScan(vendor), false);
  assert.deepEqual(unverified.requests, []);
  for (const retire of ['generation', 'account']) {
    const f = saveFixture({ held: true, response: { ok: true }, data: { ok: true, event_config: event, scanned: ['901'] } });
    const result = f.saveBingoScan(vendor); if (retire === 'generation') f.generation.current += 1; else f.retireAccount();
    f.release(); assert.equal(await result, false); assert.deepEqual(f.configs, []); assert.deepEqual(f.verifications, []); assert.deepEqual(f.progress, []);
  }
});

function pollFixture({ held = false } = {}) {
  const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes('const refreshScannerEventConfig = async')) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(effect);
  const intervals = [], requests = [], changes = []; let verified = true, current = event, error = null, fail = true, release;
  const generation = { current: 1 };
  const pending = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const globals = { visible: true, contactProfileComplete: true, eventConfig: current, qrInteractionGenerationRef: generation,
    scanInFlightRef: { current: false }, raffleOfferInFlightRef: { current: false }, raffleEntryInFlightRef: { current: false },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    QR_BINGO_PUBLIC_CONFIG_URL: 'https://offline.invalid/config', QR_BINGO_MENU_CONFIG_REFRESH_MS: 60000,
    fetchQrBingoJsonWithTimeout: async (_url, options) => { requests.push(options); await pending; if (fail) throw Error('offline'); return { response: { ok: true }, data: { ok: true, event_config: event } }; },
    normalizeQrBingoEventConfig: api.normalizeQrBingoEventConfig,
    setEventConfig: update => { current = typeof update === 'function' ? update(current) : update; changes.push('config'); },
    setScannerConfigVerified: value => { verified = value; changes.push('verification'); },
    setBingoError: update => { error = typeof update === 'function' ? update(error) : update; changes.push('error'); },
    setRaffleOffer() {}, setScanWindowNow() {}, setServerMissingContactFields() {}, clearBingoCardState() {},
    setAcceptedParticipationNoticeKey() {}, loadBingoCard() {},
    setInterval: (fn, delay) => { intervals.push({ fn, delay }); return 1; }, clearInterval() {},
  };
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule('globalThis.start = ' + effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const cleanup = context.start();
  return { cleanup, intervals, requests, changes, generation, release: () => release?.(), succeed: () => { fail = false; },
    state: () => ({ verified, current, error }), setError: value => { error = value; } };
}

test('one failed public refresh stops actions but the same live poll recovers without closing scanner', async () => {
  const f = pollFixture(); f.intervals[0].fn(); await flush();
  assert.equal(f.state().verified, false); assert.equal(f.state().current, event); assert.match(f.state().error, /Retrying shortly/);
  f.succeed(); f.intervals[0].fn(); await flush();
  assert.equal(f.state().verified, true); assert.equal(f.state().current.event_key, event.event_key); assert.equal(f.state().error, null);
  assert.equal(f.requests.length, 2); assert(f.requests.every(request => request.method === 'GET' && request.body === undefined));
  assert.equal(f.intervals.length, 1); f.cleanup();
  assert(appSource.includes('const scanEnabled = scannerConfigVerified &&'));
  assert(appSource.includes(') : !scannerConfigVerified ? ('));
});

test('successful public refresh does not hide an unrelated scan error', async () => {
  const f = pollFixture(); f.setError('Specific scan error'); f.succeed(); f.intervals[0].fn(); await flush();
  assert.equal(f.state().error, 'Specific scan error'); f.cleanup();
});

test('closed or retired refresh and rapid poll retries cannot change a newer session', async () => {
  for (const retire of ['close', 'generation']) {
    const f = pollFixture({ held: true }); f.succeed(); f.intervals[0].fn(); f.intervals[0].fn();
    assert.equal(f.requests.length, 1); if (retire === 'close') f.cleanup(); else f.generation.current += 1;
    f.release(); await flush(); assert.deepEqual(f.changes, []); f.cleanup();
  }
});
