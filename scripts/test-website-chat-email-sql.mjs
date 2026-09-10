import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// These are offline contract/structure checks, not a substitute for installing
// the SQL in the supported BD database and exercising its real message routes.
const sql = readFileSync(new URL('../brilliant-directories/sql/chat-email-confirmation-guards.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../brilliant-directories/sql/chat-email-confirmation-guards-rollback.sql', import.meta.url), 'utf8');
const blocks = [...sql.matchAll(/CREATE TRIGGER (\w+)\s+BEFORE (INSERT|UPDATE) ON (\w+)\s+FOR EACH ROW\s+BEGIN([\s\S]*?)END\$\$/g)];
const member = { user_id: '76101', token: 'OfflineStableToken76101', email: 'relay@privaterelay.appleid.com' };
const other = { user_id: '76102', token: 'OfflineStableToken76102', email: 'other@example.invalid' };
const pending = { verification_required: 1, pending_email: 'contact@example.invalid', requested_at: '2000-01-01 00:00:00' };

function stateBlocks(privateState, legacy = []) {
  if (privateState) return privateState.verification_required === 1 || String(privateState.pending_email ?? '').trim() !== '';
  const latest = (key) => legacy.filter(row => row.key === key).sort((a, b) => b.meta_id - a.meta_id)[0]?.value ?? '';
  return latest('custom_email_verification_required') === '1' || String(latest('custom_pending_email')).trim() !== '';
}
function blockedOwner(owner, states, legacy = {}) {
  return [member, other].some(row => (row.token === owner || row.user_id === owner) &&
    stateBlocks(states[row.user_id], legacy[row.user_id]));
}
function writeBlocked(table, action, oldRow, newRow, states, legacy) {
  const owner = table === 'message' ? 'message_owner' : 'thread_owner';
  const changes = table === 'message'
    ? ['message_owner', 'message_content', 'thread_token', 'message_token']
    : ['thread_owner', 'thread_responders', 'thread_token'];
  if (action === 'update' && !changes.some(key => (oldRow[key] ?? null) !== (newRow[key] ?? null))) return false;
  return blockedOwner(newRow[owner], states, legacy) || (action === 'update' && blockedOwner(oldRow[owner], states, legacy));
}

test('SQL installs four narrowly named BEFORE guards and rollback removes only the new triggers', () => {
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.map(row => row[1]), [
    'ww_chat_email_pending_bi', 'ww_chat_email_pending_bu',
    'ww_chat_thread_email_pending_bi', 'ww_chat_thread_email_pending_bu',
  ]);
  assert.deepEqual(blocks.map(row => row.slice(2, 4)), [
    ['INSERT', 'chat_message_items'], ['UPDATE', 'chat_message_items'],
    ['INSERT', 'chat_message_threads'], ['UPDATE', 'chat_message_threads'],
  ]);
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|ALTER)\s/im);
  assert.doesNotMatch(sql, /CREATE\s+DEFINER/i);
  assert.deepEqual([...rollback.matchAll(/DROP TRIGGER IF EXISTS (\w+);/g)].map(row => row[1]), [...blocks.map(row => row[1]), 'ww_member_email_state_ad']);
  assert.doesNotMatch(rollback, /DROP TABLE|DELETE FROM|TRUNCATE|ALTER TABLE/i);
});

test('every SQL guard maps exact current token or exact legacy ID and uses private-state precedence', () => {
  for (const block of blocks) {
    assert.match(block[4], /BINARY ww_sender\.token = BINARY (?:NEW|OLD)\.(?:message|thread)_owner/);
    assert.match(block[4], /BINARY CAST\(ww_sender\.user_id AS CHAR\) = BINARY/);
    assert.match(block[4], /REGEXP '\^\[1-9\]\[0-9\]\{0,18\}\$'/);
    assert.match(block[4], /ww_state\.user_id IS NOT NULL AND/);
    assert.match(block[4], /ww_state\.verification_required = 1/);
    assert.match(block[4], /LENGTH\(TRIM\(COALESCE\(ww_state\.pending_email, ''\)\)\) > 0/);
    assert.match(block[4], /ww_state\.user_id IS NULL AND/);
    assert.equal((block[4].match(/ORDER BY ww_meta\.meta_id DESC LIMIT 1/g) ?? []).length, 2);
    assert.match(block[4], /SIGNAL SQLSTATE '45000'/);
    assert.match(block[4], /Confirm your new email address before sending messages\./);
    assert.doesNotMatch(block[4], /privaterelay|NOW\(|requested_at|DATE_SUB|CONTINUE HANDLER/i);
  }
});

test('member deletion cleanup removes only the deleted member private verification row', () => {
  const deletion = sql.match(/CREATE TRIGGER ww_member_email_state_ad\s+AFTER DELETE ON users_data\s+FOR EACH ROW\s+BEGIN([\s\S]*?)END\$\$/);
  assert.ok(deletion);
  assert.equal(deletion[1].trim(), 'DELETE FROM ww_email_verification_state WHERE user_id = OLD.user_id;');
  assert.equal((sql.match(/DELETE FROM/g) ?? []).length, 1);
});

test('SQL updates inspect old and new owners only for content or routing mutations', () => {
  for (const block of blocks.filter(row => row[2] === 'UPDATE')) {
    assert.match(block[4], /BINARY ww_sender\.token = BINARY OLD\./);
    assert.match(block[4], /BINARY ww_sender\.token = BINARY NEW\./);
    assert.match(block[4], /NOT \(BINARY NEW\./);
    assert.doesNotMatch(block[4], /NEW\.(?:message_status|thread_status|created_at|updated_at|deleted_at)/);
  }
  assert.match(blocks[1][4], /BINARY NEW\.message_content <=> BINARY OLD\.message_content/);
  assert.match(blocks[1][4], /BINARY NEW\.thread_token <=> BINARY OLD\.thread_token/);
  assert.match(blocks[3][4], /BINARY NEW\.thread_responders <=> BINARY OLD\.thread_responders/);
});

test('pending and expired requests block canonical and legacy senders, never another member', () => {
  const states = { [member.user_id]: pending };
  assert.equal(blockedOwner(member.token, states), true);
  assert.equal(blockedOwner(member.user_id, states), true);
  assert.equal(blockedOwner(other.token, states), false);
  assert.equal(blockedOwner(member.token.toLowerCase(), states), false);
  assert.equal(blockedOwner('0' + member.user_id, states), false);
  assert.equal(blockedOwner(member.user_id + 'suffix', states), false);
  assert.equal(blockedOwner('unknown-owner', states), false);
});

test('private state blocks either pending field or required flag, with no domain-only restriction', () => {
  assert.equal(stateBlocks({ verification_required: 1, pending_email: null }), true);
  assert.equal(stateBlocks({ verification_required: 0, pending_email: 'contact@example.invalid' }), true);
  assert.equal(stateBlocks({ verification_required: 0, pending_email: '   ' }), false);
  assert.equal(blockedOwner(member.token, {}), false, 'Apple relay with no change request may send');
  assert.equal(blockedOwner(member.token, { [member.user_id]: { verification_required: 0, pending_email: null } }), false);
});

test('latest legacy metadata is only a block fallback; a confirmed private row overrides stale metadata', () => {
  const legacy = [
    { key: 'custom_pending_email', meta_id: 1, value: 'old@example.invalid' },
    { key: 'custom_pending_email', meta_id: 2, value: '' },
    { key: 'custom_email_verification_required', meta_id: 3, value: '1' },
  ];
  assert.equal(stateBlocks(null, legacy), true);
  assert.equal(stateBlocks(null, legacy.slice(0, 2)), false);
  assert.equal(stateBlocks({ verification_required: 0, pending_email: null }, legacy), false);
  assert.equal(stateBlocks(null, [{ key: 'custom_email_confirmed_email', meta_id: 4, value: member.email }]), false);
});

test('message inserts and edits block while read receipts remain usable', () => {
  const states = { [member.user_id]: pending };
  const row = { message_owner: member.token, message_content: 'old', thread_token: 'thread1', message_token: 'message1', message_status: 0 };
  assert.equal(writeBlocked('message', 'insert', {}, row, states), true);
  for (const [key, value] of [['message_content', 'new'], ['thread_token', 'thread2'], ['message_token', 'message2'], ['message_owner', other.token]]) {
    assert.equal(writeBlocked('message', 'update', row, { ...row, [key]: value }, states), true, key);
  }
  assert.equal(writeBlocked('message', 'update', row, { ...row, message_status: 1 }, states), false);
  assert.equal(writeBlocked('message', 'update', { ...row, message_owner: other.token }, row, states), true);
  assert.equal(writeBlocked('message', 'insert', {}, row, {}), false, 'confirmed/resolved request permits send');
});

test('thread creation and participant changes block, but opening/closing/read metadata do not', () => {
  const states = { [member.user_id]: pending };
  const row = { thread_owner: member.token, thread_responders: other.token, thread_token: 'thread1', thread_status: 1 };
  assert.equal(writeBlocked('thread', 'insert', {}, row, states), true);
  for (const [key, value] of [['thread_owner', other.token], ['thread_responders', 'someone-else'], ['thread_token', 'thread2']]) {
    assert.equal(writeBlocked('thread', 'update', row, { ...row, [key]: value }, states), true, key);
  }
  assert.equal(writeBlocked('thread', 'update', row, { ...row, thread_status: 0, updated_at: 'new', deleted_at: 'new' }, states), false);
  assert.equal(writeBlocked('thread', 'insert', {}, { ...row, thread_owner: other.token, thread_responders: member.token }, states), false, 'pending recipient may receive');
});
