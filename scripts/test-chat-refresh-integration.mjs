import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute production coordinator adapters with isolated transports/database.
// No request reaches Supabase or Brilliant Directories.
const shared = readFileSync(new URL('../supabase/functions/_shared/bd_chat.ts', import.meta.url), 'utf8');
const control = readFileSync(new URL('../supabase/functions/_shared/chat_refresh_control.ts', import.meta.url), 'utf8');
function declaration(source, name) {
  const ast = ts.createSourceFile('actual.ts', source, ts.ScriptTarget.Latest, true);
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(ast).replace(/^export\s+/, '');
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === name)) return node.getText(ast).replace(/^export\s+/, '');
  }
  throw Error(`Actual declaration not found: ${name}`);
}
function compile(names, globals, extras = '') {
  const code = names.map(n => declaration(shared, n)).join('\n') + '\n' + extras + '\nglobalThis.actual={' + names.join(',') + '};';
  const context = vm.createContext({ Date, Error, ...globals });
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.actual;
}
function storeFixture(result = { data: { key: 'coordinator' }, error: null }) {
  const calls = [];
  const admin = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const query = { then(resolve) { return Promise.resolve(result).then(resolve); }, maybeSingle: async () => result };
    for (const operation of ['select', 'delete', 'insert', 'update']) query[operation] = value => { call[operation] = value === undefined ? true : value; return query; };
    for (const filter of ['eq', 'lte', 'gt']) query[filter] = (key, value) => { call.filters.push([filter, key, value]); return query; };
    return query;
  } };
  return { calls, store: compile(['mirrorRefreshStore'], { admin, CHAT_REFRESH_KEY: 'bd:chat_refresh:v2' }).mirrorRefreshStore };
}
test('actual refresh store deletes only expired coordinator row and finishes only live exact owner', async () => {
  const f = storeFixture(); const now = Date.parse('2026-10-29T18:00:00Z');
  await f.store.deleteExpired(now);
  assert.deepEqual(f.calls[0].filters, [['eq', 'key', 'bd:chat_refresh:v2'], ['lte', 'expires_at', new Date(now).toISOString()]]);
  assert.equal(await f.store.finish('owner-a', now, 'complete', now + 20000), true);
  assert.deepEqual(f.calls[1].filters, [['eq', 'key', 'bd:chat_refresh:v2'], ['eq', 'value->>owner', 'owner-a'], ['eq', 'value->>kind', 'running'], ['gt', 'expires_at', new Date(now).toISOString()]]);
  assert.equal(f.calls[1].update.value.kind, 'complete');
  assert.equal(f.calls[1].update.expires_at, new Date(now + 20000).toISOString());
  assert.equal(await storeFixture({ data: null, error: null }).store.finish('stale', now, 'failed', now + 30000), false);
});
test('actual refresh store inserts without upsert; only duplicate key is a lost election', async () => {
  const row = { owner: 'owner-a', kind: 'running', expiresAt: 1793296800000 };
  const winner = storeFixture({ data: null, error: null }); assert.equal(await winner.store.insert(row), true);
  assert.equal(winner.calls[0].insert.key, 'bd:chat_refresh:v2'); assert.equal(winner.calls[0].insert.value.owner, row.owner);
  assert.equal(await storeFixture({ data: null, error: { code: '23505' } }).store.insert(row), false);
  await assert.rejects(storeFixture({ data: null, error: { code: '57014', message: 'timeout' } }).store.insert(row), /timeout/);
});
test('actual refresh store reads ownership from database and propagates lookup outages', async () => {
  const f = storeFixture({ data: { value: { owner: 'owner', kind: 'running' }, expires_at: '2026-10-29T18:00:00Z' }, error: null });
  const row = await f.store.read(); assert.equal(row.owner, 'owner'); assert.equal(row.kind, 'running'); assert.equal(row.expiresAt, Date.parse('2026-10-29T18:00:00Z'));
  assert.deepEqual(f.calls[0].filters, [['eq', 'key', 'bd:chat_refresh:v2']]);
  await assert.rejects(storeFixture({ data: null, error: { message: 'database unavailable' } }).store.read(), /database unavailable/);
});
test('actual refresh store delete and finish returned errors cannot become successful ownership changes', async () => {
  const failed = storeFixture({ data: null, error: { message: 'database unavailable' } }).store;
  await assert.rejects(failed.deleteExpired(1793296800000), /database unavailable/);
  await assert.rejects(failed.finish('owner-a', 1793296800000, 'complete', 1793296820000), /database unavailable/);
});

class ChatRefreshStoppedError extends Error {}
class BdRateLimitError extends Error {}
function refreshFixture(options = {}) {
  const counters = { fail: 0, complete: 0, claims: 0, pulls: [], outbox: 0, identity: 0, repair: 0 };
  const lease = { bdCalls: 0, complete: async () => { counters.complete++; return true; }, fail: async () => { counters.fail++; return true; } };
  const globals = { counters, ChatRefreshStoppedError, BdRateLimitError, mirrorRefreshStore: {},
    loadSharedRateLimit: async () => {}, rateLimitedNow: () => false,
    claimChatRefresh: async () => { counters.claims++; return options.noClaim ? undefined : lease; },
    withChatRefreshLease: async (_lease, fn) => fn(), beforeChatRefreshWork: async () => {},
    admin: { from: () => ({ select: async () => ({ count: 1, error: null }) }) },
    listPath: resource => resource, rows: value => value || [],
    callBd: async resource => { counters.pulls.push(resource); lease.bdCalls++; return { response: { ok: options.failureResource !== resource, status: options.failureResource === resource ? 503 : 200 }, body: { status: options.bodyFailureResource === resource ? 'error' : 'success', message: [], current_page: 1, total_pages: 1 } }; },
    upsertMirrorThreads: async () => {}, upsertMirrorMessages: async () => {},
    flushOutbox: async () => { counters.outbox++; }, resolveThreadIdentities: async () => { counters.identity++; }, repairThreadIdentitiesInBd: async () => { counters.repair++; },
    console: { info() {}, error() {} }, shortError: () => 'sanitized',
  };
  const actual = compile(['pullRecentThreads', 'pullRecentMessages', 'refreshMirrorIfStale'], globals, declaration(control, 'assertSuccessfulChatRefreshPull'));
  return { counters, run: actual.refreshMirrorIfStale };
}
for (const resource of ['chat_message_threads', 'chat_message_items']) {
  for (const failure of ['failureResource', 'bodyFailureResource']) test(`actual refresh rejects ${failure} ${resource} and enters failure cooldown`, async () => {
    const f = refreshFixture({ [failure]: resource }); assert.equal(await f.run(), false);
    assert.equal(f.counters.fail, 1); assert.equal(f.counters.complete, 0); assert.equal(f.counters.outbox, 0);
  });
}
test('actual refresh winner completes once; an existing lease skips all pulls even when force requested', async () => {
  const success = refreshFixture(); assert.equal(await success.run(), true); assert.equal(success.counters.complete, 1); assert.equal(success.counters.fail, 0); assert.equal(success.counters.pulls.length, 2);
  const busy = refreshFixture({ noClaim: true }); assert.equal(await busy.run(true), false); assert.equal(busy.counters.pulls.length, 0); assert.equal(busy.counters.outbox, 0);
});

function outboxFixture(error) {
  const calls = []; const globals = { ChatRefreshStoppedError, BdRateLimitError,
    ChatMemberBlockedError: class extends Error {}, ChatImageSharingDisabledError: class extends Error {},
    CHAT_IMAGES_ENABLED: false, beforeChatRefreshWork: async () => {}, crypto: { randomUUID: () => 'claim-a' },
    admin: { rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'claim_bd_chat_outbox' ? [{ id: 'row-a', kind: 'send', created_at: '2026-10-29T18:00:00Z' }] : true, error: null }; } },
    timeValue: Date.parse, rateLimitedNow: () => false,
    flushSendRow: async () => { throw error; }, markOutboxError: async () => { calls.push({ name: 'retry_increment' }); },
    markOutboxBlocked: async () => {}, markOutboxPaused: async () => {},
  };
  return { calls, run: compile(['flushOutbox'], globals).flushOutbox };
}
test('actual outbox lease stop releases claim without consuming retry attempts', async () => {
  const f = outboxFixture(new ChatRefreshStoppedError('lease changed'));
  await assert.rejects(f.run(4), /lease changed/);
  assert.deepEqual(f.calls.map(x => x.name), ['claim_bd_chat_outbox', 'release_bd_chat_outbox_claim']);
  assert.equal(f.calls[1].args.p_claim_token, 'claim-a');
});
test('actual outbox ordinary delivery failure retains its retry accounting and release', async () => {
  const f = outboxFixture(new Error('ordinary failure')); assert.equal(await f.run(4), 0);
  assert.deepEqual(f.calls.map(x => x.name), ['claim_bd_chat_outbox', 'retry_increment', 'release_bd_chat_outbox_claim']);
});
test('actual read receipt inner catch propagates lease stop without acknowledgement or retry charge', async () => {
  const calls = [];
  const stopped = new ChatRefreshStoppedError('lease ended before read receipt');
  const globals = { ChatRefreshStoppedError, BdRateLimitError,
    renewOutboxClaim: async () => calls.push('renew'),
    callBd: async () => { calls.push('guarded_call'); throw stopped; },
    formBody: () => '', markOutboxSent: async () => calls.push('mark_sent'),
    admin: { rpc: async () => { calls.push('acknowledge'); return { data: true, error: null }; } },
  };
  const { flushReadRow } = compile(['flushReadRow'], globals);
  await assert.rejects(flushReadRow({ id: 'read-a', claim_token: 'claim-a', payload: { message_ids: ['message-a'] } }, 4), error => error === stopped);
  assert.deepEqual(calls, ['renew', 'guarded_call']);
});
