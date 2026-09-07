import assert from 'node:assert/strict';
import test from 'node:test';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

const roleDeclarations = [
  'COUPLE_MEMBERSHIP_PLAN_ID', 'VENDOR_MEMBERSHIP_PLAN_IDS',
  'normalizeWeddingDate', 'normalizeMemberRole', 'memberAccountRole',
  'withMemberRole', 'isCoupleAccount',
];
const app = loadAppDeclarations(roleDeclarations);
const vendorPlans = ['11', '13', '14', '15', '16', '17', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '35', '36', '37', '38'];
const member = (subscription_id, extra = {}) => ({
  user_id: 'offline-member', email: 'member@example.invalid', subscription_id,
  first_name: 'Offline Member', company: '', ...extra,
});

test('every verified vendor plan is authoritative without company or role metadata', () => {
  assert.deepEqual([...app.VENDOR_MEMBERSHIP_PLAN_IDS], vendorPlans);
  for (const plan of vendorPlans) {
    for (const value of [plan, Number(plan)]) {
      assert.equal(app.memberAccountRole(member(value)), 'vendor', plan);
      assert.equal(app.isCoupleAccount(member(value)), false, plan);
    }
  }
});

test('known vendor plans override stale couple cache and couple-like profile fields', () => {
  for (const plan of vendorPlans) {
    const input = member(plan, { account_role: 'couple', role: 'couple', first_name: 'WeddingWin Couple', wedding_date: '2027-03-10' });
    assert.equal(app.withMemberRole(input, 'couple').account_role, 'vendor', plan);
    assert.equal(input.account_role, 'couple', 'classification must not mutate the supplied member');
  }
});

test('the couple plan overrides vendor picker, stale cache, and company metadata', () => {
  for (const value of ['18', 18]) {
    const input = member(value, { account_role: 'vendor', company: 'Offline Vendor' });
    assert.equal(app.withMemberRole(input, 'vendor').account_role, 'couple');
    assert.equal(app.isCoupleAccount(input), true);
  }
});

test('admin, beta and unknown IDs are not newly granted vendor classification', () => {
  for (const plan of ['4', '39', '99999', '', undefined]) {
    assert.equal(app.VENDOR_MEMBERSHIP_PLAN_IDS.has(plan), false);
    assert.equal(app.memberAccountRole(member(plan)), 'couple');
  }
  assert.equal(app.memberAccountRole(null), 'couple');
  assert.equal(app.memberAccountRole(member('99999', { account_role: 'vendor' })), 'vendor', 'existing explicit-role fallback must be preserved');
});

test('saving and cold restoration repair old vendor cache without changing membership or sessions', async () => {
  const writes = [];
  const storage = new Map();
  let committed;
  let bridge;
  let expiredSessionLoginRequest = null;
  const expiredSessionUpdates = [];
  const runtime = loadAppDeclarations([...roleDeclarations, 'commitNativeMember', 'saveNativeSession'], {
    useCallback: fn => fn,
    pendingAppLogoutRef: { current: false },
    nativeMemberRef: { current: null },
    setNativeMember: value => { committed = value; },
    setExpiredSessionLoginRequest: update => {
      expiredSessionUpdates.push(update);
      expiredSessionLoginRequest = typeof update === 'function'
        ? update(expiredSessionLoginRequest)
        : update;
    },
    NATIVE_MEMBER_SESSION_KEY: 'offline-member-storage',
    queueNativeSessionStorageMutation: fn => { writes.push(fn()); },
    SecureStore: {
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async key => { storage.delete(key); },
    },
    commitNativeBridgeSession: value => { bridge = value; },
  });
  for (const plan of ['23', '33', '35', '37', '38']) {
    const session = { user_id: 'offline-member', token: 'offline-session' };
    expiredSessionLoginRequest = { id: 1, role: 'couple' };
    const updatesBeforeSave = expiredSessionUpdates.length;
    runtime.saveNativeSession(member(plan, { account_role: 'couple' }), session, 'couple');
    await Promise.all(writes);
    assert.equal(expiredSessionLoginRequest, null, 'successful member commit must clear the old expiry-login request');
    assert.equal(expiredSessionUpdates.length, updatesBeforeSave + 1, 'member commit must reset expiry UI exactly once');
    assert.equal(expiredSessionUpdates.at(-1), null, 'member commit must explicitly reset rather than replace the expiry request');
    assert.equal(committed.account_role, 'vendor', plan);
    assert.equal(committed.subscription_id, plan);
    assert.equal(bridge, session);
    const stored = JSON.parse(storage.get('offline-member-storage'));
    // Same role resolution used by the real hydration callback.
    const restored = runtime.withMemberRole(stored, stored.account_role || 'couple');
    assert.equal(restored.account_role, 'vendor', plan);
    const legacyStored = { ...stored, account_role: 'couple' };
    assert.equal(runtime.withMemberRole(legacyStored, legacyStored.account_role || 'couple').account_role, 'vendor', plan);
  }
  assert.match(appSource, /withMemberRole\(member, member\.account_role \|\| 'couple'\)/);
});
