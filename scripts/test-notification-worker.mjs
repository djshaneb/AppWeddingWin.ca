import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute production dispatcher declarations. External database/network work
// is isolated; the production snapshot and transport parsers have own tests.
const source = fs.readFileSync(new URL('../supabase/functions/bd-push-sweep/index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('worker.ts', source, ts.ScriptTarget.Latest, true);
const names = ['dispatchDeviceEvents', 'finalizeDelivery'];
const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).length, names.length);
const js = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const row = { id: 'device', bd_member_id: '22', expo_push_token: 'fixture', push_registration_generation: 3 };
const event = { event_key: 'chat:22:bd:1', aliases: ['chat:22:native:n'], eligible: true, sender_member_id: '11', thread_token: 'thread' };
const delivery = { id: 'delivery', event_id: 'event', event_key: event.event_key, type: 'chat_message', recipient_member_id: '22', thread_token: 'thread', status: 'claimed', attempt_count: 0, expires_at: new Date(Date.now() + 3600000).toISOString() };

function fixture(options = {}) {
  const trace = [];
  let current = options.delivery ? { ...delivery, ...options.delivery } : { ...delivery };
  const context = {
    Date, Map, Math, Error,
    EXPO_RECEIPT_INITIAL_DELAY_MS: 900000, EXPO_RECEIPT_EXPIRY_MS: 86400000,
    nextPushRetry: (count, now, after = 0) => ({ nextAttemptAt: new Date(now + Math.max(30000 * 2 ** count, after)).toISOString() }),
    admin: { rpc: async (name, params) => {
      trace.push({ name, params });
      if (name === 'claim_weddingwin_notification_deliveries') return { data: current ? [current] : [], error: null };
      if (name === 'begin_weddingwin_notification_delivery') return { data: options.begin !== false, error: options.beginError ? { message: 'unavailable' } : null };
      if (name === 'finalize_weddingwin_notification_delivery') {
        if (options.finalizeError) return { data: null, error: { message: 'unavailable' } };
        current = null;
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    } },
    buildMessageSnapshot: input => ({ events: input.blockedMemberIds?.includes('11') ? [{ ...event, eligible: false }] : options.currentIneligible && input.nowMs ? [{ ...event, eligible: false }] : [event], unreadCount: 4 }),
    refreshEventBdSnapshot: async input => input,
    moderationSnapshot: async () => { trace.push({ name: 'moderation' }); return { blockedMemberIds: options.blocked ? ['11'] : [] }; },
    nativeSnapshot: async () => { trace.push({ name: 'native' }); return {}; },
    renewPushClaim: async () => options.expired ? 0 : 1,
    currentClaimedRows: async () => options.changedRegistration ? [] : [row],
    buildNotificationPayload: supplied => { trace.push({ name: 'payload', supplied }); return { title: 'fixture', data: { event_id: supplied.id, recipient_member_id: supplied.recipient_member_id } }; },
    expoHeaders: () => ({}),
    requestExpoPush: async payload => { trace.push({ name: 'send', payload }); return options.outcome || { status: 'ticketed', ticketId: 'ticket' }; },
    requestExpoReceipt: async id => { trace.push({ name: 'receipt', id }); return options.receiptOutcome || { status: 'delivered', ticketId: id }; },
    updateClaimedPushToken: async (_row, _claim, values) => { trace.push({ name: 'token-update', values }); return true; },
  };
  vm.createContext(context);
  vm.runInContext(js, context);
  return { trace, run: () => context.dispatchDeviceEvents({ ...row }, 'lease', {}, { remaining: 100, deadline: Date.now() + 150000, bdCalls: 0 }, async () => ({})) };
}

test('actual dispatcher reserves durably before one send and persists accepted ticket', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.notified, 1);
  assert(f.trace.findIndex(x => x.name === 'begin_weddingwin_notification_delivery') < f.trace.findIndex(x => x.name === 'send'));
  assert.equal(f.trace.filter(x => x.name === 'send').length, 1);
  assert.equal(f.trace.find(x => x.name === 'send').payload.data.recipient_member_id, '22');
  assert.equal(f.trace.find(x => x.name === 'finalize_weddingwin_notification_delivery').params.p_expo_ticket_id, 'ticket');
  await f.run(); assert.equal(f.trace.filter(x => x.name === 'send').length, 1);
});

for (const options of [{ changedRegistration: true }, { expired: true }, { begin: false }, { blocked: true }, { currentIneligible: true }]) {
  test(`actual dispatcher stops send after state changes: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await f.run(); assert.equal(f.trace.filter(x => x.name === 'send').length, 0);
  });
}

test('failed durable reservation never contacts push provider', async () => {
  const f = fixture({ beginError: true }); await assert.rejects(f.run, /reservation failed/);
  assert.equal(f.trace.filter(x => x.name === 'send').length, 0);
});

test('recipient mismatch is rejected before payload or transport', async () => {
  const f = fixture({ delivery: { recipient_member_id: '33' } }); await assert.rejects(f.run, /recipient mismatch/);
  assert.equal(f.trace.filter(x => x.name === 'send').length, 0);
});

test('ambiguous provider response remains ambiguous and is never retried in dispatcher', async () => {
  const f = fixture({ outcome: { status: 'ambiguous', errorCode: 'ExpoRequestAmbiguous' } }); await f.run();
  assert.equal(f.trace.filter(x => x.name === 'send').length, 1);
  assert.equal(f.trace.find(x => x.name === 'finalize_weddingwin_notification_delivery').params.p_status, 'ambiguous');
});

test('receipt reconciliation never sends another notification', async () => {
  const f = fixture({ delivery: { status: 'ticketed', expo_ticket_id: 'ticket', receipt_expires_at: new Date(Date.now() + 60000).toISOString() } });
  await f.run(); assert.equal(f.trace.filter(x => x.name === 'send').length, 0);
  assert.equal(f.trace.find(x => x.name === 'finalize_weddingwin_notification_delivery').params.p_status, 'delivered');
});

test('expired receipt is terminal ambiguity without resending', async () => {
  const f = fixture({ delivery: { status: 'ticketed', expo_ticket_id: 'ticket', receipt_expires_at: new Date(Date.now() - 1000).toISOString() } });
  await f.run(); assert.equal(f.trace.filter(x => x.name === 'send' || x.name === 'receipt').length, 0);
  assert.equal(f.trace.find(x => x.name === 'finalize_weddingwin_notification_delivery').params.p_status, 'ambiguous');
});

test('dead token can only be disabled', async () => {
  const f = fixture({ outcome: { status: 'failed', errorCode: 'DeviceNotRegistered' } }); await f.run();
  assert.equal(f.trace.find(x => x.name === 'token-update').values.enabled, false);
});

test('draw sends use same durable reservation and authenticated destination', async () => {
  const f = fixture({ delivery: { type: 'draw_result', draw_id: 'draw', thread_token: null } }); await f.run();
  assert.equal(f.trace.find(x => x.name === 'payload').supplied.type, 'draw_result');
  assert.equal(f.trace.find(x => x.name === 'payload').supplied.draw_id, 'draw');
  assert(f.trace.findIndex(x => x.name === 'begin_weddingwin_notification_delivery') < f.trace.findIndex(x => x.name === 'send'));
});

test('final retry attempt becomes terminal failure', async () => {
  const f = fixture({ delivery: { attempt_count: 15 }, outcome: { status: 'retry', errorCode: 'MessageRateExceeded' } }); await f.run();
  assert.equal(f.trace.find(x => x.name === 'finalize_weddingwin_notification_delivery').params.p_status, 'failed');
});

test('a failed ticket persistence does not issue another provider request', async () => {
  const f = fixture({ finalizeError: true }); await assert.rejects(f.run, /finalization failed/);
  assert.equal(f.trace.filter(x => x.name === 'send').length, 1);
});

const refreshDecl = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'refreshEventBdSnapshot');
assert(refreshDecl, 'production fresh website eligibility helper must exist');
const refreshJs = ts.transpileModule(refreshDecl.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const bdThread = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const nativeThread = 'app:11111111111111111111111111111111';
function refreshFixture(options = {}) {
  const threadRow = { thread_id: '7', thread_token: bdThread, thread_owner: '22', thread_responders: '11', owner_user_id: '22', responder_user_id: '11', thread_status: '1' };
  const messageRow = { message_id: '1', message_token: 'mirror', thread_token: bdThread, message_owner: '11', message_status: '0' };
  const input = { memberId: '22', bdThreads: [threadRow], bdMessages: [messageRow], nativeThreads: [{ thread_token: nativeThread, bd_thread_token: bdThread }] };
  const event = { event_key: 'chat:22:bd:1', aliases: ['chat:22:bd:1'], thread_token: bdThread, thread_aliases: [bdThread, nativeThread] };
  if (options.nativeOnly) {
    event.event_key = 'chat:22:native:11111111-1111-4111-8111-111111111111';
    event.aliases = [event.event_key]; event.thread_token = nativeThread;
  }
  if (options.unlinked) { input.bdThreads = []; input.nativeThreads[0].bd_thread_token = null; event.thread_aliases = [nativeThread]; }
  if (options.missingPreviousMessage) input.bdMessages = [];
  if (options.missingPreviousThread) input.bdThreads = [];
  const calls = [];
  const context = { Set, String, Error, listBdRowsPaginated: async (_read, model, params, ids) => {
    calls.push({ model, params, ids });
    if (options.failedRead) throw new Error('partial fresh lookup');
    if (model === 'chat_message_items') return options.messages ?? [{ ...messageRow, message_status: '1' }];
    return options.threads ?? [{ thread_id: '7', thread_token: bdThread, thread_status: 'closed' }];
  } };
  vm.createContext(context); vm.runInContext(refreshJs, context);
  return { input, calls, run: () => context.refreshEventBdSnapshot(input, event, async () => ({})) };
}

test('fresh website eligibility reads exactly the event message and conversation, preserving cached member IDs', async () => {
  const f = refreshFixture(); const updated = await f.run();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].params.property, 'message_id'); assert.equal(f.calls[0].params.property_value, '1');
  assert.equal(f.calls[1].params.property, 'thread_token'); assert.equal(f.calls[1].params.property_value, bdThread);
  assert.equal(updated.bdMessages[0].message_status, '1');
  assert.equal(updated.bdThreads[0].thread_status, 'closed');
  assert.equal(updated.bdThreads[0].owner_user_id, '22');
  assert.equal(f.input.bdMessages[0].message_status, '0', 'do not mutate the complete snapshot used for baseline identity');
  assert.equal(f.input.bdThreads[0].thread_status, '1');
});

test('removed website message becomes read so its native mirror cannot resurrect an alert', async () => {
  const f = refreshFixture({ messages: [] }); const updated = await f.run();
  assert.equal(updated.bdMessages[0].message_status, '1');
  assert.equal(updated.bdMessages[0].message_token, 'mirror', 'retain proven mirror identity for read-wins reconciliation');
});

test('removed website thread becomes closed without losing participant identity', async () => {
  const f = refreshFixture({ threads: [] }); const updated = await f.run();
  assert.equal(updated.bdThreads[0].thread_status, 'closed'); assert.equal(updated.bdThreads[0].responder_user_id, '11');
});

for (const options of [
  { messages: [{ message_id: '2', thread_token: bdThread }] },
  { messages: [{ message_id: '1', thread_token: 'other-thread' }] },
  { messages: [{ message_id: '1', thread_token: bdThread }, { message_id: '1', thread_token: bdThread }] },
  { threads: [{ thread_token: 'other-thread' }] },
  { threads: [{ thread_token: bdThread }, { thread_token: bdThread }] },
]) {
  test(`fresh website lookup rejects changed or ambiguous identity: ${JSON.stringify(options)}`, async () => {
    const f = refreshFixture(options); await assert.rejects(f.run, /identity changed/);
  });
}

for (const options of [{ failedRead: true }, { missingPreviousMessage: true }, { missingPreviousThread: true }]) {
  test(`fresh website lookup fails closed on incomplete dependency: ${JSON.stringify(options)}`, async () => {
    const f = refreshFixture(options); await assert.rejects(f.run, /partial fresh lookup|absent from its complete snapshot/);
  });
}

test('unmirrored native message still refreshes its linked website thread status', async () => {
  const f = refreshFixture({ nativeOnly: true }); const updated = await f.run();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].model, 'chat_message_threads');
  assert.equal(updated.bdThreads[0].thread_status, 'closed');
});

test('unlinked native message needs no website lookup', async () => {
  const f = refreshFixture({ nativeOnly: true, unlinked: true }); const updated = await f.run();
  assert.equal(f.calls.length, 0); assert.equal(updated, f.input);
});
