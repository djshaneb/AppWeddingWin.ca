import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

const { vendorDrawEntryStatus } = loadAppDeclarations(['vendorDrawEntryStatus']);
const saved = {
  vendor: { id: '901', name: 'Fictional Test Vendor' },
  settings: { enabled: true },
  vendor_acceptance_current: true, rules_current: true, entry_count: 0,
};

test('vendor readiness waits for a successful authoritative save', () => {
  const off = { ...saved, settings: { enabled: false } };
  assert.match(vendorDrawEntryStatus(off, true, false, false).title, /Saving/);
  assert.match(vendorDrawEntryStatus(saved, true, true, false).title, /Saving/);
  assert.match(vendorDrawEntryStatus(off, true, false, true).title, /not confirmed/);
  assert.doesNotMatch(vendorDrawEntryStatus(off, true, false, true).message, /ready|couples can enter/i);
  assert.equal(vendorDrawEntryStatus(saved, true, false, false).title, 'Your draw is on');
  assert.match(vendorDrawEntryStatus(saved, true, false, false).message, /Saved to the app and website.*ready and waiting/);
});

test('persisted on/off status survives reload and reflects actual entrants and rules', () => {
  assert.match(vendorDrawEntryStatus(saved, false, false, false).title, /Saving/);
  assert.equal(vendorDrawEntryStatus({ ...saved, settings: { enabled: false } }, false, false, false).title, 'Your draw is off');
  for (const entry_count of [1, 3]) {
    const result = vendorDrawEntryStatus({ ...saved, entry_count }, true, false, false);
    assert.match(result.message, new RegExp(`${entry_count} couple`));
    assert.doesNotMatch(result.message, /waiting/);
  }
  for (const patch of [{ vendor_acceptance_current: false }, { rules_current: false }]) {
    assert.equal(vendorDrawEntryStatus({ ...saved, ...patch }, true, false, false).title, 'Your draw needs attention');
  }
  assert(appSource.includes('testID="vendor-draw-entry-status" accessibilityLiveRegion="polite"'));
});

test('server availability distinguishes open, scheduled, paused and closed entry', () => {
  const open = vendorDrawEntryStatus({ ...saved, entry_status: 'open', entry_open: true }, true, false, false);
  assert.match(open.message, /waiting for couples.*scan your QR code and choose Yes/);
  for (const [entry_status, title] of [['scheduled', 'Your draw is on and ready'], ['paused', 'Draw entries are paused'], ['closed', 'Draw entries are closed']]) {
    const result = vendorDrawEntryStatus({ ...saved, entry_status, entry_status_message: 'Server-owned availability message' }, true, false, false);
    assert.equal(result.title, title);
    assert.equal(result.message, 'Server-owned availability message');
  }
});

test('the named invitation keeps Yes as the only entry action and No only dismisses it', () => {
  const start = appSource.indexOf('<Text style={styles.raffleModalTitle}>');
  const end = appSource.indexOf('</Modal>', start);
  const invitation = appSource.slice(start, end);
  assert.match(invitation, /Enter \{raffleOffer\?\.vendor_name.*draw\?/);
  assert.match(invitation, />\s*Yes\s*</);
  assert.match(invitation, />No</);
  assert.match(invitation, /onPress=\{enterRaffle\}/);
  assert.doesNotMatch(invitation, /prize_description|eligibility_region|entry_access|View draw rules|View vendor/);
  const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let decline;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'TouchableOpacity') {
      const label = node.openingElement.attributes.properties.find(attribute =>
        ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'accessibilityLabel');
      if (label?.getText(ast).includes('No, decline')) decline = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(decline);
  const handler = decline.openingElement.attributes.properties.find(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'onPress').initializer.expression;
  const cleared = [];
  const program = ts.transpileModule(`globalThis.decline = ${handler.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { setRaffleOffer: value => cleared.push(['offer', value]), setBingoError: value => cleared.push(['error', value]) };
  vm.runInNewContext(program, context);
  context.decline();
  assert.deepEqual(cleared, [['offer', null], ['error', null]]);
});

function entryFixture(patch = {}) {
  const requests = [], errors = [], offers = [], feedback = [];
  const offer = { vendor_id: '901', vendor_name: 'Fictional Test Vendor',
    vendor_offer_version: '2026-09-11T12:00:00Z', consent_version: 'current-test-rules',
    participant_responsibility_disclosure: 'Exact current participant disclosure' };
  const globals = { useCallback: fn => fn, accountDeletionIsInFlight: () => false, getAccountDeletionGeneration: () => 1,
    accountMutationIsCurrent: () => true, qrInteractionGenerationRef: { current: 1 },
    nativeSession: { user_id: 'offline', token: 'offline' }, clearBingoCardState() {},
    scannerConfigVerified: true, participationNoticeAccepted: true, eventVendorDrawsEnabled: true, eventConfig: { rules_version: offer.consent_version },
    isolatedFixtureActive: false, isQrBingoScanWindowOpen: () => true, vendorDrawScannedVendorIds: new Set(['901']),
    raffleOffer: offer, raffleSaving: false, raffleEntryInFlightRef: { current: false },
    ageOfMajorityAttested: true, residencyAttested: true, exclusionsAttested: true,
    promotionResponsibilityAccepted: true, raffleRulesViewedVersion: offer.consent_version,
    reopenVendorDrawOffer: () => assert.fail('Current offer should not need a refresh'),
    setBingoError: value => errors.push(value), setRaffleSaving() {}, setAcceptedParticipationNoticeKey() {},
    setRaffleOffer: value => offers.push(value), setEventConfig() {}, normalizeQrBingoEventConfig: value => value,
    showScanFeedback: (...args) => feedback.push(args),
    QR_BINGO_SYNC_FUNCTION_URL: 'https://offline.invalid', APP_BACKEND_PUBLISHABLE_KEY: 'offline', QR_BINGO_PARTICIPATION_NOTICE_VERSION: 'offline',
    Haptics: { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success' } },
    fetchQrBingoJsonWithTimeout: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { response: { ok: true }, data: { ok: true, event_config: {} } };
    }, ...patch,
  };
  return { ...loadAppDeclarations(['enterRaffle'], globals), requests, errors, offers, feedback, globals };
}

test('explicit Yes enters once under the existing pre-scan agreement and exact vendor offer', async () => {
  const f = entryFixture();
  assert.deepEqual(f.requests, [], 'Displaying the invitation must never opt in');
  await f.enterRaffle();
  assert.equal(f.requests.length, 1);
  const body = f.requests[0];
  assert.equal(body.action, 'raffle_opt_in');
  assert.equal(body.vendor_id, '901');
  assert.equal(body.vendor_offer_version, f.globals.raffleOffer.vendor_offer_version);
  assert.equal(body.participation_notice_version, 'current-test-rules|offline');
  assert.equal(body.rules_viewed, true);
  assert.equal(body.promotion_responsibility_acknowledged, true);
  assert.equal(Object.keys(body).some(key => key.startsWith('entry_access_')), false,
    'Yes must not claim a hidden policy amendment was displayed or newly accepted');
  assert.equal(body.participant_responsibility_disclosure, f.globals.raffleOffer.participant_responsibility_disclosure);
  assert.equal('in_show_scanned' in body, false, 'The client must not fabricate show proof');
  assert.match(f.feedback[0][0], /Entered: Fictional Test Vendor draw/);
});

test('Yes cannot bypass paused scanning, missing proof, disabled draws or missing prior agreement', async () => {
  for (const patch of [
    { isQrBingoScanWindowOpen: () => false }, { scannerConfigVerified: false },
    { vendorDrawScannedVendorIds: new Set() }, { eventVendorDrawsEnabled: false },
    { raffleRulesViewedVersion: 'older-rules' }, { promotionResponsibilityAccepted: false },
    { participationNoticeAccepted: false },
  ]) {
    const f = entryFixture(patch); await f.enterRaffle(); assert.deepEqual(f.requests, []);
  }
});
