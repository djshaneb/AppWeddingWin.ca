import assert from 'node:assert/strict';
import test from 'node:test';
import { appSource, appDeclaration, loadAppDeclarations } from './native-app-source-fixture.mjs';

const account = Object.freeze({ user_id: '42', email: 'test@privaterelay.appleid.com',
  first_name: 'Apple account', phone_number: '5550001111', subscription_id: '18',
  email_confirmation_required: true, pending_email: 'account-change@example.invalid' });
const session = Object.freeze({ user_id: '42', token: 'offline-only', email: account.email });
const contact = Object.freeze({ event_key: 'offline-wedding-show', couple_id: '42',
  name: 'Bingo Couple', email: 'bingo@example.invalid', phone: '5551234567', wedding_date: '', wedding_venue: '',
  version: 1, saved: true, complete: true, missing_fields: [] });
const input = { firstName: contact.name, email: contact.email, phone: contact.phone, weddingDate: '', weddingVenue: '' };
const flush = () => new Promise(resolve => setImmediate(resolve));
const ok = value => ({ status: 200, data: { ok: true, contact_profile: value } });

function fixture({ currentContact = contact, replies = [ok({ ...contact, version: 2 })], held = false } = {}) {
  const requests = [], contacts = [], loading = [], alerts = [], scanner = [], completion = [], accountWrites = [];
  let release, storageGeneration = 0;
  const gate = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const globals = {
    useCallback: fn => fn,
    accountDeletionIsInFlight: () => false,
    logoutInFlightRef: { current: false }, pendingAppLogoutRef: { current: false },
    authOperationInFlightRef: { current: null }, authOperationGenerationRef: { current: 0 },
    profileCompletionIntentRef: { current: 0 }, navigationIntentGenerationRef: { current: 0 },
    nativeBridgeSessionRef: { current: session }, nativeMemberRef: { current: account },
    getNativeSessionStorageGeneration: () => storageGeneration,
    qrContactProfile: currentContact,
    QR_BINGO_SYNC_FUNCTION_URL: 'https://backend.example.invalid/functions/v1/bd-qr-bingo-sync',
    APP_BACKEND_PUBLISHABLE_KEY: 'offline-public-key',
    setProfileSaveLoading: value => loading.push(value),
    setQrContactProfile: value => { contacts.push(value); globals.qrContactProfile = value; },
    setQrContactCompletionRequested: value => completion.push(value),
    setShowNativeQrScanner: value => scanner.push(value),
    saveNativeSession: (...args) => accountWrites.push(args),
    setNativeMember: (...args) => accountWrites.push(args),
    fetchAppJsonWithTimeout: () => assert.fail('Bingo contacts must never call account/email-verification endpoints'),
    hideWebsiteBrowser() {},
    Alert: { alert: (...args) => alerts.push(args) },
    fetchQrBingoJsonWithTimeout: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      const next = replies.shift();
      assert(next, 'Unexpected extra request');
      await gate;
      if (next.error) throw next.error;
      return { response: { ok: next.status >= 200 && next.status < 300, status: next.status }, data: next.data };
    },
  };
  globals.invalidateNavigationIntent = () => { globals.navigationIntentGenerationRef.current += 1; };
  globals.beginNavigationIntent = () => { globals.invalidateNavigationIntent(); return globals.navigationIntentGenerationRef.current; };
  // Rebind between invocations like a React render after setQrContactProfile;
  // retain the same refs so concurrent invocations still share the real lock.
  const render = () => loadAppDeclarations(['normalizeQrContactProfile', 'beginAuthOperation', 'authOperationIsCurrent',
    'finishAuthOperation', 'runQrContactProfile', 'openQrContactCompletion'], globals);
  return { runQrContactProfile: (...args) => render().runQrContactProfile(...args),
    openQrContactCompletion: () => render().openQrContactCompletion(),
    globals, requests, contacts, loading, alerts, scanner, completion, accountWrites,
    release: () => release?.(), advanceStorage: () => { storageGeneration += 1; } };
}

test('partners first names survive native save and reload without changing account identity', async () => {
  for (const name of ['Alex & Jamie', 'Sam and Jo', 'Renée & María-José']) {
    const saved = { ...contact, name, version: 2 };
    const f = fixture({ replies: [ok(saved), ok(saved)] });
    assert.equal(await f.runQrContactProfile({ ...input, firstName: name }), true);
    assert.equal(f.requests[0].body.contact_profile.name, name);
    assert.equal(await f.runQrContactProfile(null), true);
    assert.equal(f.contacts.at(-1).name, name);
    assert.deepEqual(f.accountWrites, []);
  }
  assert.ok(appSource.includes('Your name &amp; your partner’s name'));
  assert.ok(appSource.includes('First names are fine.'));
  assert.ok(appSource.includes('placeholder="e.g. Alex & Jamie"'));
  assert.equal(appSource.includes('Full name required for QR Bingo'), false);
});

test('Bingo save is event/version bound and does not alter Apple/account email, profile or proof state', async () => {
  const f = fixture();
  const before = JSON.stringify(account);
  assert.equal(await f.runQrContactProfile(input), true);
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].url, /\/bd-qr-bingo-sync$/);
  assert.deepEqual(f.requests[0].body, { action: 'contact_profile_save', native_session: session,
    expected_event_key: contact.event_key,
    contact_profile: { name: input.firstName, email: input.email, phone: input.phone,
      wedding_date: '', wedding_venue: '', expected_version: 1 } });
  assert.equal(JSON.stringify(account), before);
  assert.equal(f.globals.nativeBridgeSessionRef.current, session);
  assert.deepEqual(f.accountWrites, []);
  assert.deepEqual(f.scanner, [true]);
  assert.deepEqual(f.completion, [false]);
  assert.deepEqual(f.alerts, []);
  assert.equal(f.contacts[0].email, contact.email);
  assert.equal(account.email_confirmation_required, true, 'Bingo must not clear independent chat/account-email proof');
});

test('GET imports only Bingo contacts, does not submit account/contact fields, and never auto-opens scanner', async () => {
  const f = fixture({ currentContact: null, replies: [ok(contact)] });
  assert.equal(await f.runQrContactProfile(null), true);
  assert.deepEqual(f.requests[0].body, { action: 'contact_profile_get', native_session: session });
  assert.deepEqual(f.scanner, []);
  assert.deepEqual(f.accountWrites, []);
  assert.equal(f.contacts[0].couple_id, session.user_id);
});

test('venue save is QR-only and cannot modify canonical account or Apple identity', async () => {
  const draft = { ...input, weddingDate: '2030-10-18', weddingVenue: 'Offline Venue' };
  const f = fixture({ replies: [ok({ ...contact, version: 2, wedding_date: draft.weddingDate, wedding_venue: draft.weddingVenue })] });
  assert.equal(await f.runQrContactProfile(draft), true);
  assert.deepEqual(f.requests[0].body.contact_profile, {
    name: input.firstName, email: input.email, phone: input.phone, expected_version: 1,
    wedding_date: draft.weddingDate, wedding_venue: draft.weddingVenue,
  });
  assert.deepEqual(f.accountWrites, []);
  assert.equal(f.globals.nativeBridgeSessionRef.current, session);
  assert.equal(f.contacts[0].wedding_venue, draft.weddingVenue);
});

test('old profile responses default missing venue to blank and no-date profiles discard hidden venue', async () => {
  const legacy = { ...contact, wedding_date: '2030-10-18' }; delete legacy.wedding_venue;
  for (const response of [legacy, { ...contact, wedding_venue: 'Stale hidden venue' }]) {
    const f = fixture({ replies: [ok(response)] });
    assert.equal(await f.runQrContactProfile(null), true);
    assert.equal(f.contacts[0].wedding_venue, '');
    assert.deepEqual(f.scanner, []);
    assert.deepEqual(f.accountWrites, []);
  }
});

test('invalid server venue cannot replace contacts or open the scanner', async () => {
  for (const venue of [42, 'V'.repeat(201), 'Venue\nInjected', '<Venue>']) {
    const f = fixture({ replies: [ok({ ...contact, wedding_date: '2030-10-18', wedding_venue: venue })] });
    assert.equal(await f.runQrContactProfile(input), false);
    assert.deepEqual(f.contacts, []);
    assert.deepEqual(f.scanner, []);
    assert.deepEqual(f.accountWrites, []);
  }
});

test('prefill version zero and saved-but-incomplete responses keep the editor open', async () => {
  for (const value of [
    { ...contact, version: 0, saved: false, complete: false, missing_fields: ['contact details'] },
    { ...contact, version: 2, saved: true, complete: false, missing_fields: ['phone number'] },
    { ...contact, version: 2, saved: true, complete: true, missing_fields: ['email'] },
  ]) {
    const f = fixture({ replies: [ok(value)] });
    await f.runQrContactProfile(input);
    assert.deepEqual(f.scanner, []);
    assert.deepEqual(f.completion, []);
    assert.deepEqual(f.accountWrites, []);
  }
});

test('save refuses an absent contact draft or a draft belonging to another couple before networking', async () => {
  for (const currentContact of [null, { ...contact, couple_id: 'other' }]) {
    const f = fixture({ currentContact });
    assert.equal(await f.runQrContactProfile(input), false);
    assert.deepEqual(f.requests, []);
    assert.deepEqual(f.contacts, []);
  }
});

test('malformed, wrong-couple or changed-event response cannot open scanner or replace contacts', async () => {
  for (const value of [null, {}, { ...contact, couple_id: 'other' }, { ...contact, event_key: 'other-event' },
    { ...contact, version: -1 }, { ...contact, version: 1.5 }, { ...contact, email: null },
    { ...contact, missing_fields: [false] }, { ...contact, complete: 'true' }, { ...contact, saved: 'true' }]) {
    const f = fixture({ replies: [ok(value)] });
    assert.equal(await f.runQrContactProfile(input), false);
    assert.deepEqual(f.contacts, []);
    assert.deepEqual(f.scanner, []);
    assert.deepEqual(f.accountWrites, []);
    assert.equal(f.alerts.length, 1);
  }
});

test('rapid save/get taps share the synchronous auth-operation lock', async () => {
  const f = fixture({ held: true });
  const first = f.runQrContactProfile(input);
  const second = f.runQrContactProfile(input);
  const third = f.runQrContactProfile(null);
  assert.equal(f.requests.length, 1);
  f.release();
  assert.deepEqual(await Promise.all([first, second, third]), [true, false, false]);
  assert.equal(f.contacts.length, 1);
  assert.deepEqual(f.loading, [true, false]);
  assert.equal(f.globals.authOperationInFlightRef.current, null);
});

test('rapid contact-open taps issue one GET and do not retire its current request', async () => {
  const f = fixture({ currentContact: null, replies: [ok(contact)], held: true });
  f.openQrContactCompletion();
  f.openQrContactCompletion();
  assert.equal(f.requests.length, 1);
  f.release();
  await flush();
  assert.equal(f.contacts.filter(Boolean).length, 1);
  assert.deepEqual(f.completion, [true]);
  assert.equal(f.scanner.includes(true), false);
});

test('cancel, navigation, logout, changed session storage or different account discard late responses', async () => {
  for (const invalidate of [
    f => { f.globals.profileCompletionIntentRef.current += 1; },
    f => { f.globals.navigationIntentGenerationRef.current += 1; },
    f => { f.globals.logoutInFlightRef.current = true; },
    f => { f.advanceStorage(); },
    f => { f.globals.nativeBridgeSessionRef.current = { user_id: 'other', token: 'other-offline' }; },
  ]) {
    const f = fixture({ held: true });
    const pending = f.runQrContactProfile(input);
    invalidate(f); f.release();
    assert.equal(await pending, false);
    assert.deepEqual(f.contacts, []);
    assert.deepEqual(f.scanner, []);
    assert.deepEqual(f.alerts, []);
    assert.deepEqual(f.accountWrites, []);
  }
});

test('409 clears stale draft, GET reloads current version and explicit retry sends the new version', async () => {
  const f = fixture({ replies: [{ status: 409, data: { ok: false, error: 'Reload details' } },
    ok({ ...contact, version: 7 }), ok({ ...contact, version: 8 })] });
  assert.equal(await f.runQrContactProfile(input), false);
  assert.equal(f.contacts[0], null);
  assert.equal(await f.runQrContactProfile(input), false, 'cannot resubmit a retired draft');
  assert.equal(f.requests.length, 1);
  assert.equal(await f.runQrContactProfile(null), true);
  assert.equal(await f.runQrContactProfile(input), true);
  assert.equal(f.requests[2].body.contact_profile.expected_version, 7);
  assert.equal(f.alerts.length, 1);
  assert.deepEqual(f.scanner, [true]);
  assert.deepEqual(f.accountWrites, []);
});

test('network and HTTP failures release loading and allow an explicit successful retry', async () => {
  for (const failure of [{ error: new Error('Offline') }, { status: 503, data: { ok: false, error: 'Unavailable' } }]) {
    const f = fixture({ replies: [failure, ok({ ...contact, version: 2 })] });
    assert.equal(await f.runQrContactProfile(input), false);
    assert.deepEqual(f.scanner, []);
    assert.equal(f.alerts.length, 1);
    assert.equal(f.globals.authOperationInFlightRef.current, null);
    assert.equal(await f.runQrContactProfile(input), true);
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.loading, [true, false, true, false]);
  }
});

test('missing login or active logout cannot invoke Bingo contact API', async () => {
  for (const invalidate of [f => { f.globals.nativeBridgeSessionRef.current = null; },
    f => { f.globals.logoutInFlightRef.current = true; }]) {
    const f = fixture(); invalidate(f);
    assert.equal(await f.runQrContactProfile(null), false);
    assert.deepEqual(f.requests, []);
    assert.equal(f.alerts[0][0], 'Sign in again');
  }
});

test('Bingo UI uses separate handlers with no verification mail controls or implicit draw entry', () => {
  assert.ok(appSource.includes('onCompleteProfile={runQrContactProfile}'));
  assert.ok(appSource.includes('onRefreshQrContact={() => runQrContactProfile(null)}'));
  for (const absent of ['Resend confirmation email', 'Check email confirmation', 'Send confirmation email', 'profile-wedding-date-input']) {
    assert.equal(appSource.includes(absent), false, absent);
  }
  const handler = appDeclaration('runQrContactProfile');
  assert.doesNotMatch(handler, /bd-complete-profile|saveNativeSession|setNativeMember\(|raffle_opt_in|acceptedTerms|email_confirmation_required:/);
  assert.ok(appSource.includes("data.code === 'email_confirmation_required'"), 'ordinary chat proof remains enforced');
});
