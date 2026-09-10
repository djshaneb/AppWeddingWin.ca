// Contact fixture uses the fictional NANP 202-555-0147 number.
import assert from 'node:assert/strict';
import test from 'node:test';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

const validators = ['isApplePrivateRelayEmail', 'isValidEmail', 'isValidContactPhone', 'RESERVED_QR_CONTACT_NAMES', 'isReservedQrContactName', 'missingQrContactFields'];
const oldEmail = 'old-contact@example.invalid';
const pendingEmail = 'pending-contact@example.invalid';
const member = { user_id: '42', email: oldEmail, first_name: 'Test Couple', phone_number: '2025550147', subscription_id: '18' };
const session = { user_id: '42', token: 'offline-only' };
const pendingResponse = { ok: true, email_confirmation_required: true, pending_email: pendingEmail, email_verification_status: 'pending', user: member, native_session: session };
const confirmedResponse = { ok: true, email_confirmation_required: false, pending_email: null, email_verification_status: 'confirmed', user: { ...member, email: pendingEmail }, native_session: { ...session, email: pendingEmail } };
const flush = () => new Promise(resolve => setImmediate(resolve));

function profileFixture(data = pendingResponse, { held = false, initialMember = member, qr = false, status = 200 } = {}) {
  const requests = [], writes = [], alerts = [], scanner = [], completion = [], loading = [];
  let release;
  let storageGeneration = 0;
  const responseReady = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const globals = {
    useCallback: fn => fn,
    getNativeSessionStorageGeneration: () => storageGeneration,
    accountDeletionIsInFlight: () => false,
    logoutInFlightRef: { current: false }, pendingAppLogoutRef: { current: false },
    authOperationInFlightRef: { current: null }, authOperationGenerationRef: { current: 0 },
    profileCompletionIntentRef: { current: 0 }, navigationIntentGenerationRef: { current: 0 },
    nativeBridgeSessionRef: { current: session }, nativeMemberRef: { current: initialMember }, nativeMember: initialMember,
    qrContactCompletionRequested: qr,
    setProfileSaveLoading: value => loading.push(value),
    APP_BACKEND_URL: 'https://backend.example.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'public-offline',
    COUPLE_MEMBERSHIP_PLAN_ID: '18',
    fetchAppJsonWithTimeout: async (_url, request) => {
      requests.push(JSON.parse(request.body));
      await responseReady;
      return { response: { ok: status < 400, status }, data };
    },
    saveNativeSession: (user, savedSession) => writes.push({ user, session: savedSession }),
    withMemberRole: value => value, memberAccountRole: () => 'couple',
    setQrContactCompletionRequested: value => completion.push(value),
    setShowNativeQrScanner: value => scanner.push(value),
    hideWebsiteBrowser: () => {}, addDebugLine: () => {},
    Alert: { alert: (...args) => alerts.push(args) },
  };
  globals.invalidateNavigationIntent = () => { globals.navigationIntentGenerationRef.current += 1; };
  globals.beginNavigationIntent = () => { globals.invalidateNavigationIntent(); return globals.navigationIntentGenerationRef.current; };
  return {
    ...loadAppDeclarations([...validators, 'beginAuthOperation', 'authOperationIsCurrent', 'finishAuthOperation', 'runCompleteProfile'], globals),
    requests, writes, alerts, scanner, completion, loading, globals,
    release: () => release?.(),
    advanceStorageGeneration: () => { storageGeneration += 1; },
  };
}

test('rapid Check Again and Save requests share the real synchronous auth lock', async () => {
  const f = profileFixture(pendingResponse, { held: true });
  const first = f.runCompleteProfile(null);
  const second = f.runCompleteProfile({ firstName: member.first_name, email: pendingEmail, phone: member.phone_number });
  assert.equal(f.requests.length, 1);
  f.release();
  await Promise.all([first, second]);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].user.pending_email, pendingEmail);
  assert.equal(f.globals.authOperationInFlightRef.current, null);
  assert.deepEqual(f.loading, [true, false]);
});


test('cancelled contact-completion intent cannot overwrite the member with a late response', async () => {
  const f = profileFixture(pendingResponse, { held: true });
  const pending = f.runCompleteProfile(null);
  f.globals.profileCompletionIntentRef.current += 1;
  f.release();
  await pending;
  assert.equal(f.writes.length, 0);
  assert.equal(f.scanner.length, 0);
  assert.equal(f.globals.authOperationInFlightRef.current, null);
});

test('late profile response cannot overwrite newer email-confirmed storage', async () => {
  const f = profileFixture(pendingResponse, { held: true });
  const pending = f.runCompleteProfile(null);
  // The confirmation route completes a separate, serialized native-session
  // write while the home request still has the old pending response in flight.
  f.advanceStorageGeneration();
  f.release();
  await pending;
  assert.equal(f.writes.length, 0);
  assert.equal(f.scanner.length, 0);
  assert.equal(f.globals.authOperationInFlightRef.current, null);
  assert.deepEqual(f.loading, [true, false]);
});

test('focus rehydration is guarded and leaving the route retires pending profile work', () => {
  const start = appSource.indexOf('  useFocusEffect(');
  const end = appSource.indexOf('  const finishLogoutInApp', start);
  const focus = appSource.slice(start, end);
  assert.ok(focus.includes('readNativeSessionStorage(async () =>'));
  assert.ok(focus.includes('storageGeneration !== getNativeSessionStorageGeneration()'));
  assert.ok(focus.includes('storedSession.token !== currentSession.token'));
  assert.ok(focus.includes('String(storedMember.user_id) !== String(currentSession.user_id)'));
  assert.ok(focus.includes('profileCompletionIntentRef.current += 1'));
});


test('refresh-only confirmed status does not auto-open the scanner or dismiss the editor', async () => {
  const f = profileFixture(confirmedResponse);
  assert.equal(await f.runCompleteProfile(null, true), true);
  assert.equal(f.writes[0].user.email, pendingEmail);
  assert.equal(f.completion.length, 0);
  assert.equal(f.scanner.length, 0);
});

test('authoritative null pending email clears stale cached pending address', async () => {
  const f = profileFixture({ ...pendingResponse, pending_email: null, email_verification_status: 'expired' }, {
    initialMember: { ...member, pending_email: 'stale-pending@example.invalid', email_confirmation_required: true },
  });
  await f.runCompleteProfile(null, true);
  assert.equal(f.writes[0].user.pending_email, null);
  assert.equal(f.writes[0].user.email_confirmation_required, true);
});


// Bingo-specific editor/loading/resend replacement is covered by
// test-native-bingo-contact-profile.mjs. The account proof lifecycle above is retained.
