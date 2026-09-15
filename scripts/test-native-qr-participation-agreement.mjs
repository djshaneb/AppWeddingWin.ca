import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

const notice = '2026-09-14-showday-prize-lock';
const receipt = { recorded: true, couple_id: '90001', event_key: 'published-event', profile_event_key: 'published-event',
  rules_version: 'rules-v1', participation_notice_version: `rules-v1|${notice}`,
  accepted_at: '2026-09-14T12:00:00Z', acceptance_id: 'd3e4a889-7ca4-46f2-8c88-9c637b35a099', excluded_from_master: false };
const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let restoreSource;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes('const restore = async () =>')) restoreSource = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast); assert(restoreSource, 'Extract the real restore effect');
function fixture(options = {}) {
  const calls = [], accepted = [], writes = [], errors = [], busy = [], backfill = [], deleted = [];
  let release, accountCurrent = true;
  const hold = options.held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const g = {
    useCallback: fn => fn, visible: true, contactProfileComplete: true, scannerConfigVerified: true,
    participationProfileEventKey: 'published-event', participationNoticeKey: options.noticeKey || 'notice.account.event.rules', participationNoticeScope: 'current-context',
    nativeSession: { user_id: '90001', token: 'fixture-only' }, eventConfig: { event_key: 'published-event', rules_version: 'rules-v1', revision: 3 },
    participationNoticeRequestRef: { current: null }, participationNoticeScopeRef: { current: 'current-context' },
    qrInteractionGenerationRef: { current: 1 }, reviewingParticipationNoticeRef: { current: false },
    accountDeletionIsInFlight: () => false, getAccountDeletionGeneration: () => 1, accountMutationIsCurrent: () => accountCurrent,
    setParticipationNoticeLoading: value => busy.push(value), setBingoError: value => errors.push(value),
    setAcceptedParticipationNoticeKey: value => accepted.push(value), setParticipationNoticeBackfillKey: value => backfill.push(value),
    setServerParticipationAgreement() {}, setReviewingParticipationNotice() {}, serverParticipationAgreement: options.serverReceipt ?? null,
    QR_BINGO_PARTICIPATION_NOTICE_VERSION: notice, QR_BINGO_SYNC_FUNCTION_URL: 'https://offline.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'offline',
    SecureStore: { deleteItemAsync: async key => { deleted.push(key); }, getItemAsync: async key => options.cachedKeys ? options.cachedKeys[key] || null : options.cached ? '1' : null,
      setItemAsync: async (key, value) => { writes.push([key, value]); if (options.storageFails) throw Error('storage unavailable'); } },
    fetchQrBingoJsonWithTimeout: async (_url, request) => {
      calls.push(JSON.parse(request.body)); await hold;
      if (options.error) throw options.error;
      return { response: { ok: options.ok !== false, status: options.status || 200 }, data: options.data ?? { ok: true, participation_agreement: receipt } };
    },
  };
  const api = loadAppDeclarations(['isCurrentQrParticipationAgreement', 'syncParticipationNotice', 'acceptParticipationNotice', 'retryParticipationNoticeSync'], g);
  const effectContext = vm.createContext({ ...g, ...api });
  vm.runInContext(ts.transpileModule(`globalThis.restoreEffect = ${restoreSource};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, effectContext);
  return { api, g, calls, accepted, writes, errors, busy, backfill, deleted, release: () => release?.(),
    retire: () => { accountCurrent = false; }, restore: effectContext.restoreEffect,
    async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); } };
}

test('real acceptance callback saves exact authenticated event agreement before local unlock; concurrent taps coalesce', async () => {
  const f = fixture({ held: true }); const a = f.api.acceptParticipationNotice(), b = f.api.acceptParticipationNotice();
  assert.equal(a, b); assert.equal(f.calls.length, 1); assert.deepEqual(f.accepted, []); assert.deepEqual(f.writes, []);
  assert.deepEqual(f.calls[0], { action: 'participation_accept', native_session: f.g.nativeSession, accepted: true,
    expected_event_key: 'published-event', expected_config_revision: 3, rules_version: 'rules-v1',
    participation_notice_version: `rules-v1|${notice}`, acceptance_source: 'explicit' });
  f.release(); assert.equal(await a, true); assert.deepEqual(f.accepted, ['notice.account.event.rules']);
  assert.deepEqual(f.busy, [true, false]); assert.equal(f.calls.some(c => c.action === 'raffle_opt_in'), false);
});

test('transport, rejection and mismatched receipts never accept; failed explicit save can retry', async () => {
  for (const options of [{ error: Error('offline') }, { ok: false }, { data: { ok: true } },
    ...['couple_id', 'event_key', 'profile_event_key', 'rules_version', 'participation_notice_version', 'acceptance_id', 'accepted_at'].map(key => ({ data: { ok: true, participation_agreement: { ...receipt, [key]: 'foreign' } } })),
    { data: { ok: true, participation_agreement: { ...receipt, recorded: false } } }]) {
    const f = fixture(options); assert.equal(await f.api.acceptParticipationNotice(), false);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.accepted, ['']); assert(f.errors.some(Boolean));
    assert.equal(f.g.participationNoticeRequestRef.current, null);
    await f.api.acceptParticipationNotice(); assert.equal(f.calls.length, 2, 'Failure releases the retry lock');
  }
});

test('closed scanner, switched session/event/revision, reset interaction and retired account ignore pending receipt', async () => {
  for (const change of [f => { f.g.participationNoticeScopeRef.current = 'changed-context'; },
    f => { f.g.qrInteractionGenerationRef.current++; }, f => f.retire()]) {
    const f = fixture({ held: true }); const pending = f.api.acceptParticipationNotice(); change(f); f.release();
    assert.equal(await pending, false); assert.deepEqual(f.accepted, []); assert.deepEqual(f.writes, []);
  }
});

test('valid durable receipt remains accepted even if local storage fails', async () => {
  const f = fixture({ storageFails: true }); assert.equal(await f.api.acceptParticipationNotice(), true);
  assert.deepEqual(f.accepted, ['notice.account.event.rules']);
});

test('real restore effect backfills exact cached agreement without a new decision and stays locked until saved', async () => {
  const f = fixture({ cached: true, held: true }); f.restore(); await f.flush();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].acceptance_source, 'cached');
  assert.deepEqual(f.accepted, ['']); assert.deepEqual(f.backfill, ['', 'notice.account.event.rules']);
  f.release(); await f.flush(); assert(f.accepted.includes('notice.account.event.rules'));
});

test('failed cached sync retains its retry identity and never claims acceptance', async () => {
  const f = fixture({ cached: true, error: Error('offline') }); f.restore(); await f.flush();
  assert.equal(f.accepted.includes('notice.account.event.rules'), false); assert.equal(f.backfill.at(-1), 'notice.account.event.rules');
  await f.api.retryParticipationNoticeSync(); assert.equal(f.calls.at(-1).acceptance_source, 'cached');
  assert.match(appSource, /testID="qr-bingo-agreement-sync-retry"/);
});

test('server-recorded agreement restores without local cache or another write; absent or foreign agreement cannot unlock', async () => {
  const f = fixture({ serverReceipt: receipt }); f.restore(); await f.flush();
  assert.deepEqual(f.accepted, ['notice.account.event.rules']); assert.deepEqual(f.calls, []);
  for (const serverReceipt of [null, { ...receipt, couple_id: 'other' }]) {
    const f = fixture({ serverReceipt }); f.restore(); await f.flush(); assert.deepEqual(f.accepted, ['']); assert.deepEqual(f.calls, []);
  }
});

test('unmounted restore cannot backfill or unlock after delayed storage read', async () => {
  const f = fixture({ cached: true }); const cancel = f.restore(); cancel(); await f.flush();
  assert.deepEqual(f.calls, []); assert.deepEqual(f.accepted, []);
});


test('the updated notice never treats an older cached agreement or receipt as new acceptance', async () => {
  const keys = loadAppDeclarations(['QR_BINGO_PARTICIPATION_NOTICE_VERSION', 'participationNoticeKey'], {
    useMemo: fn => fn(), nativeSession: { user_id: '90001' },
    eventConfig: { event_key: 'published-event', rules_version: 'rules-v1' },
  });
  assert.equal(keys.QR_BINGO_PARTICIPATION_NOTICE_VERSION, '2026-09-14-showday-prize-lock');
  const currentKey = keys.participationNoticeKey;
  const oldKey = currentKey.replace('2026-09-14-showday-prize-lock', '2026-09-04-pre-scan-draw-consent');
  assert.notEqual(currentKey, oldKey);
  const f = fixture({ noticeKey: currentKey, cachedKeys: { [oldKey]: '1' },
    serverReceipt: { ...receipt, participation_notice_version: 'rules-v1|2026-09-04-pre-scan-draw-consent' } });
  f.restore(); await f.flush();
  assert.deepEqual(f.calls, [], 'Old cache cannot create a cached acceptance of the new notice');
  assert.deepEqual(f.accepted, ['']);
  assert.deepEqual(f.writes, []);
  assert.match(appSource, /The updated Terms apply after you agree below/);
});


test('a cached notice rejected with 428 returns to explicit acceptance instead of a retry loop', async () => {
  const f = fixture({ cached: true, ok: false, status: 428,
    data: { ok: false, code: 'participation_notice_required' } });
  f.restore(); await f.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].acceptance_source, 'cached');
  assert.deepEqual(f.deleted, ['notice.account.event.rules']);
  assert.equal(f.backfill.at(-1), '');
  assert.equal(f.accepted.includes('notice.account.event.rules'), false);
  assert.match(f.errors.at(-1), /read and accept the updated/);
  assert.deepEqual(f.writes, []);
});
