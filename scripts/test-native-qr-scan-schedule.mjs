import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

// Execute actual native declarations with isolated clock/network/native mocks.
// No real camera, account, scan, consent, contact, or backend mutation occurs.
const api = loadAppDeclarations(['validQrScanTimestamp', 'normalizeQrBingoEventConfig', 'isQrBingoScanWindowOpen', 'isQrBingoInShowWindow', 'normalizeQrInShowScannedIds']);
const original = Object.freeze({ event_key: 'niagara-wedding-show-2026', revision: 12,
  event_name: 'Niagara Wedding Show', venue_name: 'Americana Resort', vendor_tag_id: 30,
  app_card_enabled: true, scan_enabled: true, vendor_draws_enabled: true,
  history_starts_at: '2026-10-18T15:00:00Z', entry_closes_at: '2026-10-18T19:00:00Z',
  rules_version: '2026-09-01-in-person-entry', official_rules_url: 'https://www.weddingwin.ca/qr-bingo-official-rules',
  email_delivery_mode: 'disabled', draw_at: '2026-10-18T20:00:00Z' });
const updated = Object.freeze({ ...original, scan_open_early: false,
  scan_opens_at: '2026-10-18T04:00:00Z', scan_history_starts_at: '2026-10-18T04:00:00Z',
  scan_early_access_starts_at: null });
const config = patch => api.normalizeQrBingoEventConfig({ ...updated, ...patch });
const open = (value, time) => api.isQrBingoScanWindowOpen(value, Date.parse(time));
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

test('legacy payloads keep the former window; new scanner fields never rewrite show/draw dates', () => {
  const old = api.normalizeQrBingoEventConfig(original);
  assert.equal(old.scan_open_early, false);
  assert.equal(old.scan_opens_at, original.history_starts_at);
  assert.equal(open(old, '2026-10-18T14:59:59.999Z'), false);
  assert.equal(open(old, original.history_starts_at), true);
  const next = config();
  assert.equal(next.history_starts_at, original.history_starts_at);
  assert.equal(next.entry_closes_at, original.entry_closes_at);
  assert.equal(next.scan_opens_at, updated.scan_opens_at);
  assert.equal(original.draw_at, '2026-10-18T20:00:00Z');
  assert(appSource.includes('formatQrMenuDate(qrMenuEventConfig.history_starts_at)'));
});

test('Toronto October18 midnight is inclusive; prize-entry close remains exclusive', () => {
  const current = config();
  for (const [time, expected] of [
    ['2026-10-18T03:59:59.999Z', false], ['2026-10-18T04:00:00Z', true],
    ['2026-10-18T04:00:00.001Z', true], ['2026-10-18T14:59:59.999Z', true],
    ['2026-10-18T18:59:59.999Z', true], ['2026-10-18T19:00:00Z', false],
    ['2026-10-19T00:00:00Z', false],
  ]) assert.equal(open(current, time), expected, time);
});

test('early-open is reversible before midnight but cannot bypass master pause or closing time', () => {
  assert.equal(open(config({ scan_open_early: true }), '2026-09-08T12:00:00Z'), true);
  assert.equal(open(config({ scan_open_early: false }), '2026-09-08T12:00:00Z'), false);
  for (const early of [true, false]) {
    for (const time of ['2026-09-08T12:00:00Z', '2026-10-18T04:00:00Z', '2026-10-18T19:00:00Z']) {
      assert.equal(open(config({ scan_enabled: false, scan_open_early: early }), time), false);
    }
    assert.equal(open(config({ scan_open_early: early }), original.entry_closes_at), false);
  }
  assert.equal(api.isQrBingoScanWindowOpen(null, Date.now()), false);
  assert.equal(api.isQrBingoScanWindowOpen(config(), NaN), false);
});

test('server-computed winter and DST-transition timestamps are honored without device timezone assumptions', () => {
  for (const [show, midnight, close] of [
    ['2027-01-17T16:00:00Z', '2027-01-17T05:00:00Z', '2027-01-17T20:00:00Z'],
    ['2027-03-14T15:00:00Z', '2027-03-14T05:00:00Z', '2027-03-14T19:00:00Z'],
    ['2026-11-01T16:00:00Z', '2026-11-01T04:00:00Z', '2026-11-01T20:00:00Z'],
  ]) {
    const current = config({ history_starts_at: show, scan_opens_at: midnight, entry_closes_at: close });
    assert(current);
    assert.equal(api.isQrBingoScanWindowOpen(current, Date.parse(midnight) - 1), false);
    assert.equal(api.isQrBingoScanWindowOpen(current, Date.parse(midnight)), true);
    assert.equal(current.history_starts_at, show);
  }
});

test('malformed explicitly supplied fields fail closed instead of activating legacy fallback', () => {
  for (const patch of [
    { scan_open_early: 'true' }, { scan_open_early: 1 }, { scan_open_early: null },
    { scan_opens_at: null }, { scan_opens_at: '' }, { scan_opens_at: 'tomorrow' },
    { scan_opens_at: '2026-02-30T00:00:00Z' }, { scan_opens_at: '2026-10-18T24:00:00Z' },
    { scan_opens_at: '2026-10-18T04:00:00+14:01' }, { scan_opens_at: original.entry_closes_at },
    { scan_history_starts_at: false }, { scan_early_access_starts_at: 0 },
  ]) assert.equal(config(patch), null, JSON.stringify(patch));
  assert(config({ scan_early_access_starts_at: '2026-09-08T12:00:00+00:00' }));
});

test('actual clock effect wakes at exact midnight and close, and clears native timers', () => {
  const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes('const nextBoundary =')) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(effect);
  let now = Date.parse(updated.scan_opens_at) - 1, nextId = 0;
  const timers = new Map(), values = [], cleared = [];
  const context = vm.createContext({ visible: true, eventConfig: config(),
    Date: class extends Date { static now() { return now; } },
    setScanWindowNow: value => values.push(value),
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => { timers.delete(id); cleared.push(id); },
    setInterval: (_fn, delay) => { assert.equal(delay, 30000); return 'interval'; },
    clearInterval: id => cleared.push(id),
  });
  vm.runInContext(ts.transpileModule('globalThis.start = ' + effect, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context);
  const cleanup = context.start();
  assert.equal([...timers.values()][0].delay, 1);
  now += 1; [...timers.values()][0].fn();
  assert.equal(values.at(-1), Date.parse(updated.scan_opens_at));
  assert.equal(api.isQrBingoScanWindowOpen(config(), values.at(-1)), true);
  assert.equal([...timers.values()][0].delay, Date.parse(original.history_starts_at) - now);
  now = Date.parse(original.history_starts_at); [...timers.values()][0].fn();
  assert.equal(api.isQrBingoInShowWindow(config(), values.at(-1)), true);
  assert.equal([...timers.values()][0].delay, Date.parse(original.entry_closes_at) - now);
  now = Date.parse(original.entry_closes_at); [...timers.values()][0].fn();
  assert.equal(api.isQrBingoScanWindowOpen(config(), values.at(-1)), false);
  cleanup(); assert.equal(timers.size, 0); assert(cleared.includes('interval'));
});

function refreshFixture({ next = config({ revision: 13, scan_open_early: true }), held = false, failed = false } = {}) {
  const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes('const refreshScannerEventConfig = async')) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(effect);
  const requests = [], configs = [], clear = [], timers = [];
  let state = config(), resolve, foreground, removed = false, verified = true, error = null;
  const pending = held ? new Promise(done => { resolve = done; }) : Promise.resolve();
  const globals = { visible: true, contactProfileComplete: true, eventConfig: state,
    qrInteractionGenerationRef: { current: 7 }, scanInFlightRef: { current: false },
    raffleOfferInFlightRef: { current: false }, raffleEntryInFlightRef: { current: false },
    AppState: { currentState: 'active', addEventListener: (_type, fn) => { foreground = fn; return { remove: () => { removed = true; } }; } },
    QR_BINGO_PUBLIC_CONFIG_URL: 'https://offline.invalid/public_config', QR_BINGO_MENU_CONFIG_REFRESH_MS: 60000,
    fetchQrBingoJsonWithTimeout: async (url, options) => { requests.push({ url, options }); await pending; if (failed) throw Error('offline'); return { response: { ok: true }, data: { ok: true, event_config: next } }; },
    normalizeQrBingoEventConfig: api.normalizeQrBingoEventConfig,
    setEventConfig: update => { state = typeof update === 'function' ? update(state) : update; configs.push(state); },
    setScannerConfigVerified: value => { verified = value; },
    setScanWindowNow() {}, setServerMissingContactFields: value => clear.push(['contacts', value]),
    clearBingoCardState: () => clear.push(['card']), setRaffleOffer: value => clear.push(['offer', value]),
    setAcceptedParticipationNoticeKey: value => clear.push(['notice', value]),
    loadBingoCard: () => clear.push(['reload']), setBingoError: value => {
      const nextError = typeof value === 'function' ? value(error) : value;
      if (nextError !== error) clear.push(['error', nextError]);
      error = nextError;
    },
    setInterval: (fn, delay) => { timers.push({ fn, delay }); return 1; }, clearInterval() {},
  };
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule('globalThis.start = ' + effect, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context);
  const cleanup = context.start();
  return { requests, configs, clear, timers, cleanup, foreground: () => foreground('active'),
    release: () => resolve?.(), state: () => state, verified: () => verified,
    setCurrent: value => { state = value; }, removed: () => removed, globals };
}

test('visible scanner polls only public GET and applies early toggle without roster/contact writes', async () => {
  const f = refreshFixture();
  assert.equal(f.timers[0].delay, 60000);
  f.timers[0].fn(); await flush();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].options.method, 'GET');
  assert.equal(f.requests[0].options.body, undefined); assert.equal(f.requests[0].options.cache, 'no-store');
  assert.equal(f.state().scan_open_early, true); assert.equal(f.state().history_starts_at, original.history_starts_at);
  assert.deepEqual(f.clear, []); f.cleanup(); assert(f.removed());
});

test('rapid refresh, close-during-request, and background state cannot create overlapping or stale updates', async () => {
  const f = refreshFixture({ held: true });
  f.timers[0].fn(); f.timers[0].fn(); f.foreground();
  assert.equal(f.requests.length, 1); f.cleanup(); f.release(); await flush();
  assert.equal(f.configs.length, 0);
  const background = refreshFixture(); background.globals.AppState.currentState = 'background';
  background.timers[0].fn(); await flush(); assert.equal(background.requests.length, 0); background.cleanup();
});

test('older configuration cannot replace new state; changed event requires authenticated reload', async () => {
  const old = refreshFixture({ next: config({ revision: 11 }) }); old.timers[0].fn(); await flush();
  assert.equal(old.configs.length, 0); old.cleanup();
  const raced = refreshFixture({ held: true }); raced.timers[0].fn();
  raced.setCurrent(config({ revision: 14, scan_enabled: false })); raced.release(); await flush();
  assert.equal(raced.state().revision, 14); assert.equal(raced.state().scan_enabled, false); raced.cleanup();
  const changed = refreshFixture({ next: config({ revision: 13, event_key: 'next-wedding-show' }) });
  changed.timers[0].fn(); await flush();
  assert(changed.clear.some(([type]) => type === 'contacts')); assert(changed.clear.some(([type]) => type === 'reload'));
  assert.equal(changed.configs.length, 0); changed.cleanup();
});

test('unverifiable current settings stop the camera rather than retaining potentially stale early access', async () => {
  const f = refreshFixture({ failed: true }); f.timers[0].fn(); await flush();
  assert.equal(f.verified(), false); assert.equal(f.state().event_key, original.event_key);
  assert(f.clear.some(([type]) => type === 'error')); f.cleanup();
});

test('both native scan entry points enforce current clock directly, not only delayed lock effects', async () => {
  for (const [name, expected] of [['saveBingoScan', false], ['handleBarcodeScanned', undefined]]) {
    const errors = [];
    const declarations = loadAppDeclarations([name], { useCallback: fn => fn,
      accountDeletionIsInFlight: () => false, getAccountDeletionGeneration: () => 1,
      qrInteractionGenerationRef: { current: 1 }, reviewingParticipationNoticeRef: { current: false },
      nativeSession: { user_id: 'offline', token: 'offline' }, contactProfileComplete: true,
      participationNoticeAccepted: true, scannerConfigVerified: true, eventScanEnabled: true, eventVendorDrawsEnabled: true,
      eventConfig: config(), isolatedFixtureActive: false, isQrBingoScanWindowOpen: () => false,
      setBingoError: error => errors.push(error), clearBingoCardState() {}, showScanFeedback() {},
      vendors: [], onScan() {}, raffleOffer: null, reopenVendorDrawOffer() {}, saveBingoScan() {},
      scanLocked: false, scannedVendorIds: new Set(), scanInFlightRef: { current: false },
      setSavingBingo: () => assert.fail('Closed scanning must not start a save'),
      setScanLocked: () => assert.fail('Closed scanning must not process camera callbacks'),
    });
    assert.equal(await declarations[name](name === 'saveBingoScan' ? { id: '901' } : { data: 'https://www.weddingwin.ca/qr?vendor_id=901' }), expected);
  }
  assert(appSource.includes('setTimeout(updateClock, Math.min(nextBoundary - now, 2_147_483_647))'));
  assert(appSource.includes('isQrBingoScanWindowOpen(eventConfig, scanWindowNow)'));
});

test('draw hours remain11AM inclusive until close, regardless of early scan access', () => {
  for (const early of [true, false]) {
    const current = config({ scan_open_early: early });
    assert.equal(api.isQrBingoInShowWindow(current, Date.parse('2026-10-18T04:00:00Z')), false);
    assert.equal(api.isQrBingoInShowWindow(current, Date.parse('2026-10-18T14:59:59.999Z')), false);
    assert.equal(api.isQrBingoInShowWindow(current, Date.parse(original.history_starts_at)), true);
    assert.equal(api.isQrBingoInShowWindow(current, Date.parse(original.entry_closes_at)), false);
  }
});

test('an actual duplicate camera scan refreshes proof only during show hours, with rapid-tap protection', async () => {
  for (const [inShow, isolated, expected] of [[false, false, 'none'], [true, false, 'save'], [false, true, 'preview']]) {
    const writes = [], previews = [], feedback = [], vendor = { id: '901', name: 'Offline vendor' };
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const globals = { useCallback: fn => fn, accountDeletionIsInFlight: () => false,
      reviewingParticipationNoticeRef: { current: false }, qrInteractionGenerationRef: { current: 1 },
      contactProfileComplete: true, participationNoticeAccepted: true, scannerConfigVerified: true, eventScanEnabled: true,
      eventVendorDrawsEnabled: true, eventConfig: config({ scan_open_early: true }),
      isolatedFixtureActive: isolated, isQrBingoScanWindowOpen: () => true, isQrBingoInShowWindow: () => inShow,
      scanLocked: false, scanInFlightRef: { current: false }, scanUnlockTimerRef: { current: null },
      raffleOffer: null, vendors: [vendor], scannedVendorIds: new Set(['901']),
      matchQrBingoVendor: () => vendor, setBingoError() {}, setScanLocked() {},
      saveBingoScan: async value => { writes.push(value.id); await pending; return true; },
      reopenVendorDrawOffer: async value => { previews.push(value.id); return true; },
      showScanFeedback: (...args) => feedback.push(args), onScan() {},
      setTimeout: () => 1, clearTimeout() {}, Haptics: { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } },
    };
    const { handleBarcodeScanned } = loadAppDeclarations(['handleBarcodeScanned'], globals);
    const first = handleBarcodeScanned({ data: 'https://www.weddingwin.ca/qr?vendor_id=901' });
    const second = handleBarcodeScanned({ data: 'https://www.weddingwin.ca/qr?vendor_id=901' });
    release(); await Promise.all([first, second]);
    assert.deepEqual(writes, expected === 'save' ? ['901'] : []);
    assert.deepEqual(previews, expected === 'preview' ? ['901'] : []);
    if (expected === 'none') assert(feedback[0][0].includes('during the wedding show'));
  }
});

test('in-show proof is independent of early progress and malformed/missing metadata fails closed', () => {
  for (const value of [undefined, null, {}, false, '901', [901, '0', '-1', ' 901', '901 ', '1.2', '']]) {
    assert.deepEqual([...api.normalizeQrInShowScannedIds(value)], []);
  }
  assert.deepEqual([...api.normalizeQrInShowScannedIds(['901', '902', '901'])], ['901', '902']);
  const cleared = [];
  const { clearBingoCardState } = loadAppDeclarations(['clearBingoCardState'], { useCallback: fn => fn,
    setEventConfig() {}, setAppReviewFixture() {}, setEmailTestFixture() {}, setVendors() {}, setBingoTotalCount() {},
    setScannerConfigVerified() {},
    setScannedVendorIds: value => cleared.push([...value]), setInShowScannedVendorIds: value => cleared.push([...value]),
  });
  clearBingoCardState(); assert.deepEqual(cleared, [[], []]);
});

function proofResponseFixture(data) {
  const progress = [], proof = [], offers = [], requests = [];
  const globals = { useCallback: fn => fn, nativeSession: { user_id: 'offline', token: 'offline' },
    bingoCardRequestIdRef: { current: 0 }, qrInteractionGenerationRef: { current: 1 },
    accountDeletionIsInFlight: () => false, getAccountDeletionGeneration: () => 1, accountMutationIsCurrent: () => true,
    contactProfileComplete: true, participationNoticeAccepted: true, scannerConfigVerified: true, eventScanEnabled: true, eventConfig: config(),
    isolatedFixtureActive: false, isQrBingoScanWindowOpen: () => true, isQrBingoInShowWindow: () => true,
    QR_BINGO_SYNC_FUNCTION_URL: 'https://offline.invalid/sync', APP_BACKEND_PUBLISHABLE_KEY: 'offline',
    QR_BINGO_PARTICIPATION_NOTICE_VERSION: 'offline',
    fetchQrBingoJsonWithTimeout: async (_url, options) => { requests.push(JSON.parse(options.body).action); return { response: { ok: true }, data }; },
    normalizeQrContactProfile: () => ({ saved: true, complete: true }),
    normalizeQrBingoEventConfig: api.normalizeQrBingoEventConfig, normalizeQrInShowScannedIds: api.normalizeQrInShowScannedIds,
    setScannedVendorIds: value => progress.push([...value]), setInShowScannedVendorIds: value => proof.push([...value]),
    clearBingoCardState() {}, setLoadingBingo() {}, setBingoError() {}, setSavingBingo() {}, setServerMissingContactFields() {},
    setEventConfig() {}, setAppReviewFixture() {}, setEmailTestFixture() {}, setVendors() {}, setBingoTotalCount() {},
    setScannerConfigVerified() {},
    showScanFeedback() {}, setRaffleOffer: value => offers.push(value), vendors: [],
  };
  return { ...loadAppDeclarations(['loadBingoCard', 'saveBingoScan'], globals), progress, proof, offers, requests };
}

test('actual list/scan callbacks retain early progress but only new in-show proof enables the offered draw', async () => {
  for (const inShow of [undefined, [], ['901']]) {
    const offered = { vendor_id: '901', vendor_name: 'Offline vendor' };
    const data = { event_config: config(), scanned: ['901', '902'], in_show_scanned: inShow, raffle_offer: offered };
    const f = proofResponseFixture(data);
    await f.loadBingoCard(); await f.saveBingoScan({ id: '901', name: 'Offline vendor' });
    assert.deepEqual(f.requests, ['list', 'scan']);
    assert.deepEqual(f.progress, [['901', '902'], ['901', '902']]);
    assert.deepEqual(f.proof, [inShow || [], inShow || []]);
    assert.deepEqual(f.offers, inShow?.length ? [offered] : [null]);
  }
});

test('actual production card preview cannot create scan proof or request a draw for an early-only visit', async () => {
  const errors = [], feedback = [], requests = [];
  const { reopenVendorDrawOffer } = loadAppDeclarations(['reopenVendorDrawOffer'], { useCallback: fn => fn,
    accountDeletionIsInFlight: () => false, getAccountDeletionGeneration: () => 1,
    raffleOfferInFlightRef: { current: false }, nativeSession: { user_id: 'offline', token: 'offline' },
    clearBingoCardState() {}, participationNoticeAccepted: true, scannerConfigVerified: true, eventVendorDrawsEnabled: true,
    eventConfig: config({ scan_open_early: true }), isolatedFixtureActive: false,
    isQrBingoInShowWindow: () => true, inShowScannedVendorIds: new Set(),
    setBingoError: value => errors.push(value), showScanFeedback: (...args) => feedback.push(args),
    fetchQrBingoJsonWithTimeout: () => requests.push('unexpected'),
  });
  assert.equal(await reopenVendorDrawOffer({ id: '901', name: 'Offline vendor' }), false);
  assert.deepEqual(requests, []); assert.deepEqual(errors, []);
  assert(feedback[0][0].includes('during the wedding show'));
  assert(appSource.includes('isScanned && (isolatedFixtureActive || inShowScannedVendorIds.has(vendor.id))'));
});

test('actual Enter Draw callback refuses an early-only vendor even with an otherwise visible stale offer', async () => {
  const requests = [];
  const { enterRaffle } = loadAppDeclarations(['enterRaffle'], { useCallback: fn => fn,
    accountDeletionIsInFlight: () => false, getAccountDeletionGeneration: () => 1,
    qrInteractionGenerationRef: { current: 1 }, nativeSession: { user_id: 'offline', token: 'offline' },
    clearBingoCardState() {}, scannerConfigVerified: true, eventVendorDrawsEnabled: true, eventConfig: config({ scan_open_early: true }),
    isolatedFixtureActive: false, isQrBingoInShowWindow: () => true, inShowScannedVendorIds: new Set(),
    raffleOffer: { vendor_id: '901' }, raffleSaving: false, raffleEntryInFlightRef: { current: false },
    ageOfMajorityAttested: true, exclusionsAttested: true, promotionResponsibilityAccepted: true,
    residencyAttested: true, raffleRulesViewedVersion: 'offline', reopenVendorDrawOffer() {}, showScanFeedback() {},
    fetchQrBingoJsonWithTimeout: () => requests.push('unexpected'),
  });
  await enterRaffle(); assert.deepEqual(requests, []);
});
