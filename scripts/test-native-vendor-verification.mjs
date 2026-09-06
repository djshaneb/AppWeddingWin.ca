#!/usr/bin/env node
// Execute the actual native review callback with mocked state/transport.
// No account, database, device, email or live credentials are used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let found;
  function visit(node) { if (found) return; if (predicate(node)) found = node; else ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(found, 'Expected native source node');
  return found;
}
const variable = name => `const ${find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name).getText(ast)};`;
const declaration = name => find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast);
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const sendProgram = compile([
  declaration('isCompleteVendorRaffleDashboard'),
  variable('sendVendorWinnerNotice'), 'globalThis.runSend = sendVendorWinnerNotice;',
].join('\n'));
const replacementProgram = compile([
  declaration('isCompleteVendorRaffleDashboard'), variable('replaceVendorPotentialWinner'),
  'globalThis.runReplacement = replaceVendorPotentialWinner;',
].join('\n'));
const selectionProgram = compile([
  declaration('isCompleteVendorRaffleDashboard'), variable('drawVendorWinner'),
  'globalThis.runSelection = drawVendorWinner;',
].join('\n'));
const drawID = '00000000-0000-4000-8000-000000000001';
const dashboard = { ok: true, vendor: { id: 'unit-vendor' }, event_key: 'unit-event', settings: {}, rules_version: 'unit-rules' };
function harness(options = {}) {
  const requests = [], alerts = [], errors = [], applied = [];
  let generation = 1;
  const state = {
    nativeSession: { user_id: 'unit-vendor', token: 'non-authentic-unit-test' },
    vendorRaffleReviewing: false,
    vendorRaffleDrawing: false,
    vendorRaffleSelectionPoolCount: 20,
    vendorRaffleSendingDrawId: null,
    vendorRaffle: { ...dashboard, draws: [{ id: drawID, selection_status: 'potential', winner_name: 'QA Couple', can_confirm_and_send_notice: true }] },
    vendorRaffleActionInFlightRef: { current: null },
    vendorRaffleEntriesRequestGenerationRef: { current: 0 },
    vendorRaffleEntriesInFlightRef: { current: null },
    accountDeletionIsInFlight: () => options.deleting === true,
    getAccountDeletionGeneration: () => generation,
    accountMutationIsCurrent: value => generation === value,
    prepareVendorRaffleAction: async () => options.prepare !== false,
    setVendorRaffleError: value => errors.push(value),
    setVendorRaffleReviewing: value => { state.vendorRaffleReviewing = value; },
    setVendorRaffleDrawing: value => { state.vendorRaffleDrawing = value; },
    setVendorRaffleSendingDrawId: value => { state.vendorRaffleSendingDrawId = value; },
    applyVendorRaffle: (data, config) => applied.push({ data, config }),
    fetchVendorRaffleEntries: async () => {},
    VENDOR_RAFFLE_FUNCTION_URL: 'https://example.invalid/review',
    APP_BACKEND_PUBLISHABLE_KEY: 'non-authentic-unit-test-key',
    fetchQrBingoJsonWithTimeout: async (url, init) => {
      requests.push(JSON.parse(init.body));
      if (options.transportError) throw new Error('Unit network failure');
      if (options.beforeReply) await options.beforeReply();
      return options.reply || { response: { ok: true }, data: dashboard };
    },
    Alert: { alert: (title, message, buttons = []) => alerts.push({ title, message, buttons }) },
    ...options.state,
  };
  const context = vm.createContext(state);
  vm.runInContext(sendProgram, context);
  vm.runInContext(replacementProgram, context);
  vm.runInContext(selectionProgram, context);
  return {
    requests, alerts, errors, applied, state,
    send: (draw = { id: drawID }) => context.runSend(draw),
    replace: (id = drawID) => context.runReplacement(id),
    select: () => context.runSelection(),
    button: (title, text) => alerts.findLast(alert => alert.title === title)?.buttons.find(button => button.text === text),
    stale: () => { generation++; },
  };
}


const replacementID = '00000000-0000-4000-8000-000000000002';
const replacementDashboard = { ...dashboard, draw: { id: replacementID, selection_status: 'potential' }, draws: [{ id: drawID, selection_status: 'replaced' }, { id: replacementID, selection_status: 'potential' }] };
const replaceReply = data => ({ response: { ok: true, status: 200 }, data });
const confirmReplacement = h => h.button('Choose a different winner?', 'Choose a different winner').onPress();

test('native UI offers one different-winner button with no verification form or reason pathway', () => {
  assert.equal((source.match(/testID="vendor-draw-replace-potential-winner"/g) || []).length, 1);
  assert.ok(source.includes('accessibilityLabel="Choose a different winner"'));
  for (const oldUI of ['accessibilityLabel="Disqualify potential winner"', 'Additional notes or disqualification reason', 'Optional for confirmation; a reason is required to disqualify']) assert.ok(!source.includes(oldUI));
  for (const oldForm of ['Vendor verification required', 'vendor-draw-winner-eligibility', 'vendor-draw-winner-release', 'vendor-draw-verification-date', 'vendor-draw-verification-method', 'vendor-draw-verification-reference', 'vendor-draw-verification-notes', 'reviewVendorPotentialWinner', 'vendorPotentialWinnerConfirmationReady', 'Additional notes (optional)', 'Verification is recorded. Use', 'A potential winner is awaiting verification.']) assert.ok(!source.includes(oldForm), oldForm);
  assert.ok(source.includes("poolStatus === 'replaced'"));
  assert.ok(source.includes('Your selected couple'));
});

const twentyContacts = Array.from({ length: 20 }, (_, index) => ({
  id: `unit-entry-${index + 1}`, couple_bd_user_id: `unit-couple-${index + 1}`,
  name: `Synthetic Couple ${index + 1}`, email: `unit-couple-${index + 1}@example.invalid`,
}));
const confirmSelection = h => h.button('Select a potential winner?', 'Select Potential Winner').onPress();
test('20-email pool: native accepts each server-selected couple without choosing or sending client-side', async () => {
  for (const contact of twentyContacts) {
    const selected = { ...dashboard, entries: twentyContacts, entry_count: 20, selection_pool_count: 19,
      remaining_winner_slots: 2, draw: { id: drawID, selection_status: 'potential', winner_name: contact.name, winner_email: contact.email },
      draws: [{ id: drawID, selection_status: 'potential', winner_name: contact.name, winner_email: contact.email }] };
    const h = harness({ state: { vendorRaffle: { ...dashboard, entries: twentyContacts, entry_count: 20, can_draw: true } }, reply: replaceReply(selected) });
    await h.select();
    assert.match(h.alerts[0].message, /from 20 included entrants/);
    assert.equal(h.requests.length, 0);
    await confirmSelection(h);
    assert.deepEqual(h.requests, [{ action: 'vendor_raffle_draw', native_session: { user_id: 'unit-vendor', token: 'non-authentic-unit-test' } }]);
    assert.deepEqual(h.applied[0].data.entries, twentyContacts);
    assert.equal(h.applied[0].data.entry_count, 20);
    assert.equal(h.applied[0].data.draw.winner_email, contact.email);
    assert.match(h.alerts.at(-1).message, /No email was sent/);
  }
});
test('20-email pool: fast taps and repeated confirmation issue one selection, never a notice', async () => {
  const h = harness({ reply: replaceReply({ ...dashboard, entries: twentyContacts, draw: { id: drawID, winner_name: twentyContacts[12].name } }) });
  await h.select(); await h.select(); await h.select();
  assert.equal(h.alerts.length, 1);
  await Promise.all([confirmSelection(h), confirmSelection(h), confirmSelection(h)]);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].action, 'vendor_raffle_draw');
  assert.equal(h.state.vendorRaffleDrawing, false);
  assert.equal(h.state.vendorRaffleActionInFlightRef.current, null);
});
test('20-email pool: cancel or server cap/conflict failure does not select locally or retry', async () => {
  const cancelled = harness(); await cancelled.select(); cancelled.button('Select a potential winner?', 'Cancel').onPress();
  assert.equal(cancelled.requests.length, 0);
  const h = harness({ reply: { response: { ok: false, status: 409 }, data: { ok: false, error: 'All winner spots are filled.' } } });
  await h.select(); await confirmSelection(h);
  assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 0);
  assert.equal(h.alerts.at(-1).title, 'Potential winner not selected');
  assert.match(h.alerts.at(-1).message, /spots are filled/);
});

test('replacement accepts only the current pending draw and requires no notes or attestations', async () => {
  for (const options of [{ state: { vendorRaffle: null } }, { state: { vendorRaffle: { ...dashboard, draws: [{ id: drawID, selection_status: 'verified' }] } } }]) {
    const h = harness(options); await h.replace(); assert.equal(h.alerts.length, 0); assert.equal(h.requests.length, 0);
  }
  const unknown = harness(); await unknown.replace(replacementID); assert.equal(unknown.alerts.length, 0);
  const h = harness({ state: { vendorEligibilityConfirmed: false, vendorRulesReleaseConfirmed: false, vendorReviewNotes: '', vendorVerificationDate: '', vendorVerificationMethod: '', vendorVerificationReference: '' }, reply: replaceReply(replacementDashboard) });
  await h.replace(); assert.equal(h.requests.length, 0); await confirmReplacement(h);
  assert.deepEqual(h.requests, [{ action: 'vendor_raffle_replace', native_session: { user_id: 'unit-vendor', token: 'non-authentic-unit-test' }, draw_id: drawID }]);
  assert.equal(h.applied.length, 1); assert.equal(h.applied[0].config.preserveWizardContext, true);
  assert.equal(h.alerts.at(-1).title, 'New potential winner selected');
  assert.match(h.alerts.at(-1).message, /No email was sent/);
});

test('replacement cancel, rapid taps and repeated confirmation do not duplicate effects', async () => {
  const cancelled = harness(); await cancelled.replace(); cancelled.button('Choose a different winner?', 'Cancel').onPress();
  assert.equal(cancelled.requests.length, 0); assert.equal(cancelled.state.vendorRaffleActionInFlightRef.current, null);
  const h = harness({ reply: replaceReply(replacementDashboard) }); await h.replace(); await h.replace();
  assert.equal(h.alerts.length, 1); await Promise.all([confirmReplacement(h), confirmReplacement(h)]);
  assert.equal(h.requests.length, 1); assert.equal(h.state.vendorRaffleActionInFlightRef.current, null);
});

test('replacement auth deletion busy preparation and changed-generation guards fail closed', async () => {
  for (const options of [{ deleting: true }, { state: { nativeSession: null } }, { state: { nativeSession: { user_id: 'unit-vendor' } } }, { state: { vendorRaffleReviewing: true } }, { state: { vendorRaffleActionInFlightRef: { current: 'other' } } }, { prepare: false }]) {
    const h = harness(options); await h.replace(); assert.equal(h.alerts.length, 0); assert.equal(h.requests.length, 0);
  }
  const h = harness(); await h.replace(); h.stale(); await confirmReplacement(h);
  assert.equal(h.requests.length, 0); assert.equal(h.applied.length, 0);
});

test('no alternative preserves the canonical pending winner with a friendly message and no retry', async () => {
  const unchanged = { ...dashboard, ok: false, code: 'no_replacement_available', draws: [{ id: drawID, selection_status: 'potential' }] };
  const h = harness({ reply: { response: { ok: false, status: 409 }, data: unchanged } });
  await h.replace(); await confirmReplacement(h);
  assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 1);
  assert.equal(h.applied[0].data.draws[0].selection_status, 'potential');
  assert.equal(h.alerts.at(-1).title, 'No other eligible couples');
  assert.match(h.alerts.at(-1).message, /current potential winner stays selected/);
  assert.equal(h.errors.at(-1), null);
});

test('replacement rejects incomplete mismatched or non-atomic success payloads', async () => {
  for (const data of [{ ok: true }, { ...replacementDashboard, vendor: { id: 'other' } }, { ...replacementDashboard, event_key: 'other' }, { ...replacementDashboard, draw: { id: drawID, selection_status: 'potential' } }, { ...replacementDashboard, draws: [{ id: replacementID, selection_status: 'potential' }] }, { ...replacementDashboard, draws: [{ id: drawID, selection_status: 'disqualified' }, { id: replacementID, selection_status: 'potential' }] }]) {
    const h = harness({ reply: replaceReply(data) }); await h.replace(); await confirmReplacement(h);
    assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 0);
    assert.equal(h.alerts.at(-1).title, 'Check the winner status');
    assert.equal(h.state.vendorRaffleActionInFlightRef.current, null);
  }
});

test('other replacement conflicts apply fresh authorized state but never retry or claim success', async () => {
  const h = harness({ reply: { response: { ok: false, status: 409 }, data: { ...dashboard, ok: false, code: 'selection_already_reviewed', error: 'The winner changed in another tab.' } } });
  await h.replace(); await confirmReplacement(h);
  assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 1);
  assert.match(h.errors.at(-1), /changed in another tab/);
  assert.equal(h.alerts.at(-1).title, 'Check the winner status');
});

test('replacement transport failure never sends or automatically repeats a selection', async () => {
  const h = harness({ transportError: true }); await h.replace(); await confirmReplacement(h);
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].action, 'vendor_raffle_replace');
  assert.equal(h.applied.length, 0); assert.equal(h.state.vendorRaffleReviewing, false);
  assert.equal(h.state.vendorRaffleActionInFlightRef.current, null);
});

test('late replacement response cannot overwrite a changed account', async () => {
  const options = { reply: replaceReply(replacementDashboard) };
  const h = harness(options); options.beforeReply = () => h.stale();
  await h.replace(); await confirmReplacement(h);
  assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 0);
  assert.equal(h.alerts.length, 1, 'Only the original confirmation dialog is shown');
});

const sentDashboard = { ...dashboard, draw: { id: drawID, selection_status: 'verified', couple_email_sent_at: '2026-09-05T00:00:00Z', vendor_email_sent_at: null }, email_result: { complete: true, couple: { sent: true }, vendor: { sent: false } } };
const confirmSend = h => h.button('Send winner email?', 'Send Winner Email').onPress();
test('sending a pending selection requires a fresh explicit Draw Rules confirmation', async () => {
  const h = harness({ reply: replaceReply(sentDashboard) });
  await h.send();
  assert.equal(h.requests.length, 0);
  assert.equal(h.alerts[0].message, 'Confirm you have completed the checks in the Draw Rules. WeddingWin.ca will email QA Couple.');
  await confirmSend(h);
  assert.deepEqual(h.requests, [{ action: 'vendor_raffle_send_notice', native_session: { user_id: 'unit-vendor', token: 'non-authentic-unit-test' }, draw_id: drawID, winner_checks_confirmed: true, client_platform: 'ios' }]);
  assert.equal(h.applied.length, 1);
  assert.equal(h.alerts.at(-1).title, 'Winner Email Sent');
  assert.equal(h.alerts.at(-1).message, 'The couple notice was confirmed sent.');
});
test('new send flow has no separate review call or client-generated verification evidence', () => {
  const callback = variable('sendVendorWinnerNotice');
  for (const forbidden of ['vendor_raffle_review', 'review_notes', 'skill_question_answer', 'skill_testing_completed_externally', 'verification_date', 'eligibility_confirmed', 'disqualification_reason']) assert.ok(!callback.includes(forbidden), forbidden);
  for (const retained of ['skill_question_verified_at?: string', 'skill_question_vendor_attested_at?: string', 'can_confirm_and_send_notice?: boolean', 'can_confirm_and_test_suppressed_notice?: boolean']) assert.ok(source.includes(retained), retained);
});
test('disabled vendor delivery is not falsely reported as sent when the sender reports both complete', async () => {
  const h = harness({ reply: replaceReply({ ...sentDashboard, email_result: { complete: true, couple: { sent: true }, vendor: { sent: true, already_sent: true } } }) });
  await h.send(); await confirmSend(h);
  assert.equal(h.alerts.at(-1).message, 'The couple notice was confirmed sent.');
  assert.equal(h.requests.length, 1);
});
test('recipient messages require persisted timestamps for the exact selected draw', async () => {
  const cases = [
    { draw: { ...sentDashboard.draw, vendor_email_sent_at: '2026-09-05T00:00:01Z' }, message: 'The couple and vendor notices were confirmed sent.' },
    { draw: { ...sentDashboard.draw, couple_email_sent_at: null, vendor_email_sent_at: '2026-09-05T00:00:01Z' }, message: 'The vendor notice was confirmed sent.' },
    { draw: { ...sentDashboard.draw, id: replacementID }, message: 'The server confirmed this notice was already processed.' },
    { draw: undefined, draws: [sentDashboard.draw], message: 'The couple notice was confirmed sent.' },
  ];
  for (const { message, ...data } of cases) {
    const h = harness({ reply: replaceReply({ ...sentDashboard, ...data }) });
    await h.send(); await confirmSend(h);
    assert.equal(h.alerts.at(-1).message, message);
  }
});
test('unknown, completed, replaced and unapproved pending selections cannot send', async () => {
  const blocked = [null, { ...dashboard, draws: [] }, ...[
    { id: drawID, selection_status: 'potential' },
    { id: drawID, selection_status: 'potential', can_send_notice: true },
    { id: drawID, selection_status: 'verified', can_confirm_and_send_notice: true },
    { id: drawID, selection_status: 'replaced', can_confirm_and_send_notice: true },
    { id: drawID, selection_status: 'potential', can_confirm_and_send_notice: true, notice_complete: true },
  ].map(draw => ({ ...dashboard, draws: [draw] }))];
  for (const vendorRaffle of blocked) { const h = harness({ state: { vendorRaffle } }); await h.send(); assert.equal(h.alerts.length, 0); assert.equal(h.requests.length, 0); }
  const h = harness(); await h.send({ id: replacementID }); assert.equal(h.alerts.length, 0);
});
test('verified-only sending retains its existing capability and confirmation', async () => {
  const h = harness({ state: { vendorRaffle: { ...dashboard, draws: [{ id: drawID, selection_status: 'verified', can_send_notice: true, winner_name: 'Verified QA Couple' }] } }, reply: replaceReply(sentDashboard) });
  await h.send(); await confirmSend(h); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].winner_checks_confirmed, true);
});
test('cancel and rapid repeated send callbacks cannot submit duplicate requests', async () => {
  const cancelled = harness(); await cancelled.send(); cancelled.button('Send winner email?', 'Cancel').onPress();
  assert.equal(cancelled.requests.length, 0); assert.equal(cancelled.state.vendorRaffleActionInFlightRef.current, null);
  const h = harness({ reply: replaceReply(sentDashboard) }); await h.send(); await h.send();
  assert.equal(h.alerts.length, 1); await Promise.all([confirmSend(h), confirmSend(h)]);
  assert.equal(h.requests.length, 1); assert.equal(h.state.vendorRaffleSendingDrawId, null);
});
test('send auth deletion preparation and synchronous action ownership remain enforced', async () => {
  for (const options of [{ deleting: true }, { state: { nativeSession: null } }, { state: { nativeSession: { user_id: 'unit-vendor' } } }, { prepare: false }, { state: { vendorRaffleSendingDrawId: drawID } }, { state: { vendorRaffleActionInFlightRef: { current: 'another' } } }]) {
    const h = harness(options); await h.send(); assert.equal(h.requests.length, 0); assert.equal(h.alerts.length, 0);
  }
  const h = harness(); await h.send(); h.stale(); await confirmSend(h); assert.equal(h.requests.length, 0);
});
test('late send completion cannot overwrite another account', async () => {
  const options = { reply: replaceReply(sentDashboard) }; const h = harness(options); options.beforeReply = () => h.stale();
  await h.send(); await confirmSend(h); assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 0); assert.equal(h.alerts.length, 1);
});
test('App Review pending confirmation remains explicitly suppressed', async () => {
  const h = harness({ state: { vendorRaffle: { ...dashboard, app_review_fixture: true, draws: [{ id: drawID, selection_status: 'potential', can_confirm_and_test_suppressed_notice: true }] } }, reply: replaceReply({ ...dashboard, suppressed_test_complete: true }) });
  await h.send(); assert.match(h.alerts[0].message, /will not send email/);
  await h.button('Test the send step?', 'Run Safe Test').onPress();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].winner_checks_confirmed, true);
  assert.equal(h.alerts.at(-1).title, 'Test Send Completed');
});
test('send rejects incomplete or wrong vendor/event success instead of claiming delivery', async () => {
  for (const data of [{ ok: true }, { ...sentDashboard, vendor: { id: 'other' } }, { ...sentDashboard, event_key: 'other' }]) {
    const h = harness({ reply: replaceReply(data) }); await h.send(); await confirmSend(h);
    assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 0); assert.equal(h.alerts.at(-1).title, 'Winner email not sent');
  }
});
test('failed delivery preserves authoritative confirmation state without automatic retries', async () => {
  const h = harness({ reply: { response: { ok: false, status: 502 }, data: { ...dashboard, ok: false, partial_delivery: true, error: 'Delivery was not confirmed.', draws: [{ id: drawID, selection_status: 'verified' }] } } });
  await h.send(); await confirmSend(h);
  assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 1); assert.equal(h.applied[0].data.draws[0].selection_status, 'verified');
  assert.equal(h.alerts.at(-1).title, 'Winner email not sent'); assert.equal(h.state.vendorRaffleActionInFlightRef.current, null);
});
test('transport failure releases send lock but does not retry or fabricate delivery', async () => {
  const h = harness({ transportError: true }); await h.send(); await confirmSend(h);
  assert.equal(h.requests.length, 1); assert.equal(h.applied.length, 0); assert.equal(h.state.vendorRaffleSendingDrawId, null);
  assert.equal(h.alerts.at(-1).title, 'Winner email not sent');
});
