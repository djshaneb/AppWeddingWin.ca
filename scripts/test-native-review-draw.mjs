import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource, appDeclaration, loadAppDeclarations } from './native-app-source-fixture.mjs';

function loadLib(name) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Date, Promise });
  return exports;
}
const { REVIEW_DRAW_MODE, normalizeReviewDrawState, normalizeReviewDrawNotice, reviewDrawActionAllowed } = loadLib('review_draw');
const { parseNotificationIntent, createNotificationIntentStore } = loadLib('notification_intent');
const fixtureId = '0e3bce68-f24b-4e50-b2eb-6f06a135caef';
const drawId = '8f6d0e36-008a-40fc-8be6-0f78a64a73bd';
const noticeId = 'fb21a5a9-20a0-4e57-872c-bb474ac7a21c';
const eventId = '76c2ac7e-1c91-45a8-9d67-ded0bd6c4e07';
const now = Date.now(), expires = new Date(now + 3600000).toISOString();
const state = (extra = {}) => ({ fixture_id: fixtureId, generation: 1, role: 'couple', couple_id: '38971', vendor_id: '38970',
  vendor_name: 'Review florist', couple_name: 'Review couple', prize_title: 'Review consultation', prize_description: 'No real prize.',
  expires_at: expires, enabled: true, scanned: false, entered: false, draw_id: null, selection_status: 'none',
  skill_question_prompt: 'What is 3 × 4?', test_notice_id: null, test_notice_at: null, ...extra });
const notice = (role = 'couple', extra = {}) => ({ review_mode: REVIEW_DRAW_MODE, notice_id: noticeId, draw_id: drawId,
  generation: 1, viewer_role: role, notice_created_at: new Date(now).toISOString(),
  review_state: state({ role, scanned: true, entered: true, draw_id: drawId, selection_status: 'verified',
    test_notice_id: noticeId, test_notice_at: new Date(now).toISOString() }), ...extra });
const payload = (extra = {}) => ({ v: 1, event_id: eventId, recipient_member_id: '38971', expires_at: expires,
  screen: 'review_draw_result', review_mode: REVIEW_DRAW_MODE, review_notice_id: noticeId, ...extra });

test('review context requires exact account, role, valid current generation and bounded fixture state', () => {
  assert(normalizeReviewDrawState(state(), '38971', 'couple'));
  for (const change of [{ role: 'vendor' }, { couple_id: '999' }, { fixture_id: 'bad' }, { generation: 0 },
    { expires_at: new Date(now - 1000).toISOString() }, { enabled: 'true' }, { selection_status: 'verified' },
    { draw_id: drawId }, { test_notice_id: noticeId }, { skill_question_prompt: undefined }]) {
    assert.equal(normalizeReviewDrawState(state(change), '38971', 'couple'), null, JSON.stringify(change));
  }
});

test('review actions cannot bypass scan, entry, verification, explicit send or role boundaries', () => {
  assert(reviewDrawActionAllowed(state(), 'review_draw_scan'));
  assert.equal(reviewDrawActionAllowed(state(), 'review_draw_entry'), false);
  assert(reviewDrawActionAllowed(state({ scanned: true }), 'review_draw_entry'));
  assert.equal(reviewDrawActionAllowed(state({ scanned: true, entered: true }), 'review_draw_entry'), false);
  for (const action of ['review_draw_enable', 'review_draw_select', 'review_draw_verify', 'review_draw_send', 'review_draw_reset']) {
    assert.equal(reviewDrawActionAllowed(state(), action), false, action);
  }
  assert.equal(reviewDrawActionAllowed(state({ role: 'vendor' }), 'review_draw_select'), false);
  assert(reviewDrawActionAllowed(state({ role: 'vendor', entered: true }), 'review_draw_select'));
  assert.equal(reviewDrawActionAllowed(state({ role: 'vendor', entered: true }), 'review_draw_send'), false);
  assert(reviewDrawActionAllowed(state({ role: 'vendor', draw_id: drawId, selection_status: 'potential' }), 'review_draw_verify'));
  assert(reviewDrawActionAllowed(state({ role: 'vendor', draw_id: drawId, selection_status: 'verified' }), 'review_draw_send'));
  assert.equal(reviewDrawActionAllowed(notice('vendor').review_state, 'review_draw_send'), false);
  assert.equal(reviewDrawActionAllowed(state({ role: 'vendor' }), 'vendor_raffle_draw'), false);
});

test('review result binds notice, role, member, generation and verified current draw', () => {
  assert(normalizeReviewDrawNotice(notice(), noticeId, '38971', 'couple'));
  assert(normalizeReviewDrawNotice(notice('vendor'), noticeId, '38970', 'vendor'));
  for (const change of [{ review_mode: null }, { notice_id: eventId }, { generation: 2 }, { viewer_role: 'vendor' },
    { draw_id: fixtureId }, { notice_created_at: 'bad' }, { review_state: state() }]) {
    assert.equal(normalizeReviewDrawNotice(notice('couple', change), noticeId, '38971', 'couple'), null);
  }
  assert.equal(normalizeReviewDrawNotice(notice(), noticeId, '999', 'couple'), null);
});

test('strict review notification discriminator cannot become a real draw or chat destination', () => {
  const parsed = parseNotificationIntent(payload(), 'os-response', now);
  assert.equal(parsed.reviewMode, REVIEW_DRAW_MODE); assert.equal(parsed.reviewNoticeId, noticeId);
  for (const change of [{ review_mode: undefined }, { review_mode: true }, { review_mode: 'other' },
    { review_notice_id: 'bad' }, { draw_id: drawId }, { thread_token: 'app:0123456789abcdef0123456789abcdef' },
    { screen: 'draw_result', draw_id: drawId }, { screen: 'vendor_draw_result', draw_id: drawId }, { screen: 'chat' }]) {
    assert.equal(parseNotificationIntent(payload(change), 'os-response', now), null, JSON.stringify(change));
  }
});

test('a review notice ID alone cannot fall through to production or legacy notification destinations', () => {
  for (const screen of ['chat', 'draw_result', 'vendor_draw_result']) {
    const production = payload({ screen, review_mode: undefined, ...(screen !== 'chat' ? { draw_id: drawId } : {}) });
    assert.equal(parseNotificationIntent(production, 'response', now), null, screen);
    delete production.review_notice_id;
    assert(parseNotificationIntent(production, 'response', now), `ordinary ${screen} remains supported`);
  }
  assert.equal(parseNotificationIntent({ screen: 'chat', review_notice_id: noticeId }, 'legacy-response', now), null);
  assert(parseNotificationIntent({ screen: 'chat' }, 'legacy-response', now));
});

test('review notice persists across signed-out cold start and opens only the correct account once', async () => {
  const values = new Map(), storage = { getItemAsync: async k => values.get(k) ?? null, setItemAsync: async (k, v) => values.set(k, v) };
  const first = createNotificationIntentStore(storage, () => now);
  await first.receive(payload(), 'response');
  assert.equal(await first.process(null, () => true, async () => { throw Error('must not route'); }), 'waiting');
  const cold = createNotificationIntentStore(storage, () => now);
  assert.equal((await cold.peek()).reviewNoticeId, noticeId);
  let routed = 0;
  assert.equal(await cold.process('38971', () => true, async intent => { routed++; assert.equal(intent.reviewMode, REVIEW_DRAW_MODE); return 'handled'; }), 'handled');
  assert.equal(await cold.process('38971', () => true, async () => { routed++; return 'handled'; }), 'idle');
  assert.equal(routed, 1);
});

function routingFixture(options = {}) {
  const writes = [], requests = [], ref = current => ({ current });
  const role = options.role || 'couple', id = role === 'couple' ? '38971' : '38970';
  let release; const hold = options.hold ? new Promise(r => release = r) : Promise.resolve();
  const g = { useCallback: fn => fn, hasNativeTokenSession: s => !!s?.token, memberAccountRole: m => m.role,
    nativeBridgeSessionRef: ref({ user_id: id, token: 'synthetic' }), nativeMemberRef: ref({ user_id: id, role }),
    nativeSessionGenerationRef: ref(1), notificationRouteGenerationRef: ref(1), logoutInFlightRef: ref(false), pendingAppLogoutRef: ref(false),
    accountDeletionIsInFlight: () => false, beginNavigationIntent: async () => 1, syncNativeChat() {},
    REVIEW_DRAW_MODE, normalizeReviewDrawNotice, QR_BINGO_SYNC_FUNCTION_URL: 'https://offline.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'offline',
    fetchQrBingoJsonWithTimeout: async (_, init) => { requests.push(JSON.parse(init.body)); await hold;
      return { response: { ok: (options.status || 200) === 200, status: options.status || 200 }, data: { ok: true, ...(options.notice || notice(role)) } }; },
  };
  for (const name of ['dismissAnyKeyboard', 'hideWebsiteBrowser', 'setShowNativeQrScanner', 'setShowNativeChat',
    'setNotificationDrawResult', 'setReviewDrawNoticeRequest', 'openVendorDrawSettings']) g[name] = (...args) => writes.push([name, ...args]);
  return { g, writes, requests, release: () => release?.(), api: loadAppDeclarations(['routeNotificationIntent'], g) };
}

test('actual review notification route authenticates both roles and never opens the production winner panel', async () => {
  for (const role of ['couple', 'vendor']) {
    const f = routingFixture({ role });
    const intent = parseNotificationIntent(payload({ recipient_member_id: role === 'couple' ? '38971' : '38970' }), 'response', now);
    assert.equal(await f.api.routeNotificationIntent(intent), 'handled');
    assert.equal(f.requests[0].action, 'review_draw_result_get'); assert.equal(f.requests[0].review_notice_id, noticeId);
    assert(f.writes.some(x => x[0] === 'setReviewDrawNoticeRequest'));
    assert(!f.writes.some(x => x[0] === 'openVendorDrawSettings'));
  }
});

test('actual review route rejects reset or foreign results and fences account changes without losing retriable failures', async () => {
  const intent = parseNotificationIntent(payload(), 'response', now);
  for (const status of [400, 403, 404, 410]) assert.equal(await routingFixture({ status }).api.routeNotificationIntent(intent), 'unavailable');
  for (const status of [401, 429, 503]) assert.equal(await routingFixture({ status }).api.routeNotificationIntent(intent), 'retry');
  assert.equal(await routingFixture({ notice: notice('couple', { generation: 2 }) }).api.routeNotificationIntent(intent), 'unavailable');
  const stale = routingFixture({ hold: true }); const pending = stale.api.routeNotificationIntent(intent);
  stale.g.nativeSessionGenerationRef.current++; stale.release(); assert.equal(await pending, 'retry'); assert.equal(stale.writes.length, 0);
});

function pushFixture(options = {}) {
  const calls = [], ref = current => ({ current });
  const g = { useCallback: fn => fn, hasNativeTokenSession: s => !!s?.token, nativeBridgeSessionRef: ref({ user_id: '38971', token: 'session' }),
    nativeSessionGenerationRef: ref(1), logoutInFlightRef: ref(false), accountDeletionIsInFlight: () => false,
    expoPushTokenRef: ref(options.noToken ? '' : 'ExponentPushToken[synthetic]'), pushRegistrationKeyRef: ref('38971:session'),
    Notifications: { getPermissionsAsync: async () => ({ status: options.denied ? 'denied' : 'granted' }) },
    registerPushNotifications: async () => { calls.push('register'); if (options.switched) g.nativeSessionGenerationRef.current++; },
    REVIEW_DRAW_MODE, QR_BINGO_SYNC_FUNCTION_URL: 'https://offline.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'offline',
    fetchQrBingoJsonWithTimeout: async (_, init) => { const body = JSON.parse(init.body); calls.push(body);
      return { response: { ok: !options.serverReject }, data: { ok: !options.serverReject, review_mode: REVIEW_DRAW_MODE, review_push_enabled: body.enabled } }; },
  };
  return { calls, api: loadAppDeclarations(['enableReviewPush'], g) };
}

test('actual explicit test push opt-in sends only the current registered token and cycle after permission', async () => {
  const f = pushFixture(); await f.api.enableReviewPush(3, true);
  assert.equal(f.calls[0], 'register'); assert.equal(f.calls[1].action, 'review_draw_push_enable');
  assert.equal(f.calls[1].expected_generation, 3); assert.equal(f.calls[1].enabled, true);
  for (const options of [{ noToken: true }, { denied: true }, { switched: true }]) {
    const bad = pushFixture(options); await assert.rejects(bad.api.enableReviewPush(3, true));
    assert(!bad.calls.some(x => typeof x === 'object'));
  }
  await assert.rejects(pushFixture({ serverReject: true }).api.enableReviewPush(3, true));
});

test('explicit test push disable works without requesting new notification permission', async () => {
  const f = pushFixture({ denied: true }); await f.api.enableReviewPush(3, false);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].enabled, false);
});

// Render the actual component with a small isolated hook/JSX runtime, exercising
// its effects and button handlers without a simulator, account or network.
function panelFixture({ authorized = true, heldScan = false, contextFailures = 0, contextStatus = 503 } = {}) {
  const slots = [], requests = [], pushActions = [], timers = new Map(), appListeners = new Set();
  let timerId = 0;
  let cursor = 0, dirty = true, effects = [], tree, review = state(), release;
  const hold = heldScan ? new Promise(r => release = r) : Promise.resolve();
  const props = { nativeSession: { user_id: '38971', token: 'synthetic' }, member: { user_id: '38971', role: 'couple' },
    noticeRequest: null, onNoticeHandled() {}, onEnablePush: async (...args) => pushActions.push(args) };
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => v !== b[i]);
  const globals = {
    Date, Promise, REVIEW_DRAW_MODE, normalizeReviewDrawState, normalizeReviewDrawNotice, reviewDrawActionAllowed,
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    AppState: { addEventListener(_, fn) { appListeners.add(fn); return { remove() { appListeners.delete(fn); } }; } },
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: initial };
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn, deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) {
      const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
    memberAccountRole: m => m.role, accountDeletionIsInFlight: () => false,
    getAccountDeletionGeneration: () => 1, accountMutationIsCurrent: g => g === 1,
    QR_BINGO_SYNC_FUNCTION_URL: 'https://offline.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'offline',
    React: { Fragment: 'Fragment', createElement: (type, attributes, ...children) => ({ type, attributes, children }) },
    styles: {}, BRAND_COLOR: 'test', Alert: { alert() {} },
    fetchQrBingoJsonWithTimeout: async (_, init) => {
      const body = JSON.parse(init.body); requests.push(body);
      if (body.action === 'review_draw_context' && contextFailures > 0) {
        contextFailures--;
        return { response: { ok: false, status: contextStatus }, data: { ok: false, error: 'Synthetic unavailable response' } };
      }
      if (body.action === 'review_draw_scan') { await hold; review = { ...review, scanned: true }; }
      if (body.action === 'review_draw_entry' && body.enter) review = { ...review, entered: true };
      return { response: { ok: true, status: 200 }, data: { ok: true,
        review_mode: authorized && body.native_session.user_id === '38971' ? REVIEW_DRAW_MODE : null,
        review_state: review } };
    },
  };
  for (const name of ['TouchableOpacity', 'Text', 'Modal', 'SafeAreaProvider', 'SafeAreaView', 'View', 'X', 'ScrollView', 'TextInput', 'ActivityIndicator']) globals[name] = name;
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule(appDeclaration('NativeReviewDraw') + '\nglobalThis.component = NativeReviewDraw;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, context);
  const render = () => { cursor = 0; dirty = false; effects = []; tree = context.component(props); effects.forEach(fn => fn()); };
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(child => Array.isArray(child) ? child.flatMap(all) : all(child))];
  return { props, requests, pushActions, timers, release: () => release?.(), render,
    setContextFailures(value) { contextFailures = value; },
    appState(value) { appListeners.forEach(fn => fn(value)); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    runTimer() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); },
    tree: () => tree,
    nodes: () => all(tree),
    button: label => all(tree).find(n => n.type === 'TouchableOpacity' && n.attributes.accessibilityLabel === label),
    async settle() { for (let i = 0; i < 5; i++) { if (dirty) render(); await new Promise(r => setImmediate(r)); } if (dirty) render(); },
  };
}

test('actual review panel stays absent for ordinary accounts and performs separate explicit sample, No and Yes actions', async () => {
  const ordinary = panelFixture({ authorized: false }); await ordinary.settle(); assert.equal(ordinary.tree(), null);
  const f = panelFixture(); await f.settle();
  assert(f.button('Open review test — no real prize or email'));
  f.button('Open review test — no real prize or email').attributes.onPress(); await f.settle();
  f.button('Use review QR sample').attributes.onPress(); await f.settle();
  f.button('No').attributes.onPress(); await f.settle();
  assert(f.button('Yes'), 'No retains an explicit later choice and does not enter');
  f.button('Yes').attributes.onPress(); await f.settle();
  assert.equal(f.button('Yes'), undefined); assert.equal(f.button('No'), undefined);
  assert.deepEqual(f.requests.map(r => r.action), ['review_draw_context', 'review_draw_context', 'review_draw_scan', 'review_draw_entry', 'review_draw_entry']);
  assert.equal(f.requests[3].enter, false); assert.equal(f.requests[4].enter, true);
  assert(f.requests.every(r => r.review_mode === REVIEW_DRAW_MODE && !('legal_acceptance' in r)));
  assert(f.button('Disable test notifications on this device'), 'Disable remains available even before this component knows saved device opt-in');
});

test('actual panel coalesces rapid sample taps and ignores an old account result after a switch', async () => {
  const f = panelFixture({ heldScan: true }); await f.settle();
  const scan = f.button('Use review QR sample').attributes.onPress;
  scan(); scan(); assert.equal(f.requests.filter(r => r.action === 'review_draw_scan').length, 1);
  f.props.nativeSession = { user_id: '999', token: 'new-session' }; f.props.member = { user_id: '999', role: 'couple' };
  f.render(); await f.settle(); assert.equal(f.tree(), null);
  f.release(); await f.settle(); assert.equal(f.tree(), null);
});

test('review discovery retries a transient failure without exposing review UI before authorization', async () => {
  const f = panelFixture({ contextFailures: 1 }); await f.settle();
  assert.equal(f.tree(), null); assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].delay, 1500);
  f.runTimer(); await f.settle();
  assert(f.button('Open review test — no real prize or email')); assert.equal(f.requests.length, 2); assert.equal(f.timers.size, 0);
});

test('review discovery bounds automatic retries and recovers once on foreground after connectivity returns', async () => {
  const f = panelFixture({ contextFailures: 20 }); await f.settle();
  f.runTimer(); await f.settle(); assert.equal([...f.timers.values()][0].delay, 5000);
  f.runTimer(); await f.settle(); assert.equal(f.requests.length, 3); assert.equal(f.timers.size, 0); assert.equal(f.tree(), null);
  f.appState('background'); await f.settle(); assert.equal(f.requests.length, 3);
  f.setContextFailures(0); f.appState('active'); await f.settle();
  assert(f.button('Open review test — no real prize or email')); assert.equal(f.requests.length, 4);
  f.appState('active'); await f.settle(); assert.equal(f.requests.length, 4);
});

test('ordinary or permanently denied accounts do not retry discovery, and retired timers cannot send requests', async () => {
  for (const options of [{ authorized: false }, { contextFailures: 20, contextStatus: 403 }]) {
    const f = panelFixture(options); await f.settle(); f.appState('active'); await f.settle();
    assert.equal(f.tree(), null); assert.equal(f.requests.length, 1); assert.equal(f.timers.size, 0);
  }
  const old = panelFixture({ contextFailures: 1 }); await old.settle();
  const queued = [...old.timers.values()][0].fn; old.unmount(); queued(); old.appState('active'); await old.settle();
  assert.equal(old.requests.length, 1); assert.equal(old.timers.size, 0);
});

test('review notification Enable stays available for explicit re-pin after a registration change', async () => {
  const f = panelFixture(); await f.settle();
  f.button('Enable test notifications on this device').attributes.onPress(); await f.settle();
  const enable = f.button('Enable test notifications on this device'); assert.equal(enable.attributes.disabled, false);
  enable.attributes.onPress(); await f.settle();
  assert.equal(f.pushActions.length, 2); assert(f.pushActions.every(([, enabled]) => enabled));
  f.button('Disable test notifications on this device').attributes.onPress(); await f.settle();
  assert.equal(f.pushActions.at(-1)[1], false);
});

test('review UI labels every review entry point and keeps synthetic fixture production-entry protection', () => {
  assert.match(appSource, /Review test — no real prize or email/);
  assert.match(appSource, /Uses the review sample without scanning a physical QR code/);
  assert.match(appSource, /action: 'review_draw_push_enable'/);
  assert.match(appSource, /offer\.display_only !== true \|\| offer\.entry_allowed !== false \|\| offer\.legal_acceptance !== false/);
});
