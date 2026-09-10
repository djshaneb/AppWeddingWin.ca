// Contact fixture uses the fictional NANP 202-555-0147 number.
import assert from 'node:assert/strict';
import test from 'node:test';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

const validators = ['isApplePrivateRelayEmail', 'isValidEmail', 'isValidContactPhone', 'RESERVED_QR_CONTACT_NAMES', 'isReservedQrContactName', 'missingQrContactFields'];
const validation = loadAppDeclarations(validators);
const relay = 'private-test@privaterelay.appleid.com';
const nextEmail = 'confirmed@example.invalid';
const member = { user_id: 'test-member', email: relay, first_name: 'Test Couple', phone_number: '2025550147', subscription_id: '18' };
const session = { user_id: member.user_id, token: 'offline-only' };



test('Bingo contact hint describes its independent editor', () => {
  const ready = loadAppDeclarations(['qrContactProfileHint'], {
    qrNeedsContactEmail: false,
    qrNeedsContactName: false, qrNeedsContactPhone: false,
  });
  assert.equal(ready.qrContactProfileHint, 'Check your details, then continue to QR Bingo.');
});

function fixture(data, { status = 200, current = true, qr = false, initialMember = member } = {}) {
  const writes = [], requests = [], alerts = [], scanner = [], loading = [];
  const globals = {
    useCallback: fn => fn,
    logoutInFlightRef: { current: false },
    nativeBridgeSessionRef: { current: session },
    nativeMemberRef: { current: initialMember }, nativeMember: initialMember,
    beginAuthOperation: () => 1,
    getNativeSessionStorageGeneration: () => 0,
    profileCompletionIntentRef: { current: 0 },
    navigationIntentGenerationRef: { current: 1 },
    beginNavigationIntent: () => 1,
    qrContactCompletionRequested: qr,
    setProfileSaveLoading: value => loading.push(value),
    APP_BACKEND_URL: 'https://backend.example.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'public-offline',
    fetchAppJsonWithTimeout: async (_url, request) => { requests.push(JSON.parse(request.body)); return { response: { ok: status < 400, status }, data }; },
    authOperationIsCurrent: () => current,
    saveNativeSession: (user, savedSession) => writes.push({ user, session: savedSession }),
    withMemberRole: value => value,
    memberAccountRole: () => 'couple',
    setQrContactCompletionRequested: () => {},
    setShowNativeQrScanner: value => scanner.push(value),
    hideWebsiteBrowser: () => {}, finishAuthOperation: () => {}, addDebugLine: () => {},
    Alert: { alert: (...args) => alerts.push(args) },
  };
  return { ...loadAppDeclarations([...validators, 'runCompleteProfile'], globals), writes, requests, alerts, scanner, loading };
}

const profile = { firstName: 'Test Couple', email: nextEmail, phone: member.phone_number };
test('request saves server-returned OLD email, persists pending, and never opens scanner', async () => {
  const f = fixture({ ok: true, email_confirmation_required: true, pending_email: nextEmail, user: member, native_session: session });
  await f.runCompleteProfile(profile);
  assert.equal(f.writes[0].user.email, relay);
  assert.equal(f.writes[0].session.email, undefined);
  assert.equal(f.writes[0].user.pending_email, nextEmail);
  assert.equal(f.writes[0].user.email_confirmation_required, true);
  assert.equal(f.scanner.length, 0);
  assert.equal(f.alerts.length, 0, 'pending state is inline, not a repeated alert');
});

test('Check Again reads server state without resending the address', async () => {
  const f = fixture({ ok: true, email_confirmation_required: true, pending_email: nextEmail, user: member, native_session: session });
  await f.runCompleteProfile(null);
  assert.equal(f.requests[0].action, 'refresh');
  assert.equal(f.requests[0].profile, undefined);
  assert.equal(f.writes[0].user.email, relay);
  assert.equal(f.scanner.length, 0);
  assert.equal(f.alerts[0][0], 'Not confirmed yet');
});

test('ordinary account confirmation clears pending state without launching Bingo', async () => {
  const f = fixture({ ok: true, email_confirmation_required: false, email_verification_status: 'confirmed', user: { ...member, email: nextEmail }, native_session: { ...session, email: nextEmail } });
  await f.runCompleteProfile(null);
  assert.equal(f.writes[0].user.email, nextEmail);
  assert.equal(f.writes[0].user.pending_email, null);
  assert.equal(f.writes[0].user.email_confirmation_required, false);
  assert.deepEqual(f.scanner, []);
});

const datedMember = { ...member, email: nextEmail, wedding_date: '2027-10-18' };
function dateResponse(user) {
  return {
    ok: true, email_confirmation_required: false,
    email_verification_status: 'confirmed', user,
    native_session: { ...session, email: nextEmail },
  };
}

test('clearing a date sends an explicit empty wedding_date and keeps it cleared locally', async () => {
  const f = fixture(dateResponse({ ...datedMember, wedding_date: '' }), { initialMember: datedMember });
  assert.equal(await f.runCompleteProfile({ ...profile, weddingDate: '' }), true);
  assert.equal(f.requests.length, 1);
  assert.equal(Object.hasOwn(f.requests[0].profile, 'wedding_date'), true);
  assert.equal(f.requests[0].profile.wedding_date, '');
  assert.equal(f.requests[0].profile.phone, datedMember.phone_number);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].user.wedding_date, '');
  assert.equal(f.writes[0].user.phone_number, datedMember.phone_number);
  assert.equal(f.alerts.length, 0);
});

test('a supplied canonical date is serialized, but omitted date does not imply clearing', async () => {
  for (const supplied of [undefined, '2028-02-29']) {
    const f = fixture(dateResponse({ ...datedMember, wedding_date: supplied ?? datedMember.wedding_date }), { initialMember: datedMember });
    const input = supplied === undefined ? profile : { ...profile, weddingDate: supplied };
    await f.runCompleteProfile(input);
    assert.equal(Object.hasOwn(f.requests[0].profile, 'wedding_date'), supplied !== undefined);
    assert.equal(f.requests[0].profile.wedding_date, supplied);
    assert.equal(f.writes[0].user.wedding_date, supplied ?? datedMember.wedding_date);
  }
});

test('authoritative empty server date wins over both submitted and cached nonempty dates', async () => {
  const f = fixture(dateResponse({ ...datedMember, wedding_date: '' }), { initialMember: datedMember });
  await f.runCompleteProfile({ ...profile, weddingDate: '2028-02-29' });
  assert.equal(f.requests[0].profile.wedding_date, '2028-02-29');
  assert.equal(f.writes[0].user.wedding_date, '', 'an authoritative clear must not revive either fallback');
  assert.equal(f.alerts.length, 0);
});

test('an explicit requested clear survives absent or null response date without reviving cache', async () => {
  for (const returnedDate of [undefined, null]) {
    const user = { ...datedMember };
    if (returnedDate === undefined) delete user.wedding_date;
    else user.wedding_date = null;
    const f = fixture(dateResponse(user), { initialMember: datedMember });
    await f.runCompleteProfile({ ...profile, weddingDate: '' });
    assert.equal(f.requests[0].profile.wedding_date, '');
    assert.equal(f.writes[0].user.wedding_date, '');
  }
});

test('refresh imports the website canonical date without resending a stale app date', async () => {
  const f = fixture(dateResponse({ ...datedMember, wedding_date: '2028-02-29' }), { initialMember: datedMember });
  assert.equal(await f.runCompleteProfile(null, true), true);
  assert.equal(f.requests[0].action, 'refresh');
  assert.equal(Object.hasOwn(f.requests[0], 'profile'), false);
  assert.equal(f.writes[0].user.wedding_date, '2028-02-29');
  assert.equal(f.writes[0].user.phone_number, datedMember.phone_number);
  assert.deepEqual(f.scanner, [], 'refresh must not auto-launch the scanner');
  assert.equal(f.alerts.length, 0);
});

test('refresh propagates a website date clear instead of resurrecting cached wedding date', async () => {
  const f = fixture(dateResponse({ ...datedMember, wedding_date: '' }), { initialMember: datedMember });
  await f.runCompleteProfile(null, true);
  assert.equal(f.requests[0].action, 'refresh');
  assert.equal(Object.hasOwn(f.requests[0], 'profile'), false);
  assert.equal(f.writes[0].user.wedding_date, '');
  assert.deepEqual(f.scanner, []);
  assert.equal(f.alerts.length, 0);
});

test('failed, stale, and wrong-account confirmation responses never alter the account', async () => {
  for (const f of [
    fixture({ error: 'Unavailable' }, { status: 503 }),
    fixture({ ok: true, user: member, native_session: session }, { current: false }),
    fixture({ ok: true, email_confirmation_required: true, user: { ...member, user_id: 'other' }, native_session: session }),
  ]) {
    await f.runCompleteProfile(null);
    assert.equal(f.writes.length, 0);
    assert.equal(f.scanner.length, 0);
  }
});

test('Bingo editor is independent and ordinary chat still handles the account-email proof gate', () => {
  for (const expected of ['Contact email for QR Bingo', 'Your Apple sign-in stays the same.', "data.code === 'email_confirmation_required'", 'onCompleteProfile={runQrContactProfile}']) assert.ok(appSource.includes(expected), expected);
});
