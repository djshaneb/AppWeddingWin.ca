#!/usr/bin/env node
// Real extracted widget functions/listeners; local DOM, camera, storage and
// transport doubles. No browser, camera, database or network is accessed.
// Run: node --test scripts/test-qr-draw-single-agreement.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const widget = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
function section(start, end) {
  const from = widget.indexOf(start), to = widget.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Widget section must exist: ${start}`);
  return widget.slice(from, to);
}
const markup = section('<div class="vendor-draw-modal"', '<!-- Vendor Data -->');
const noticeMarkup = section('<div id="qrScannerExperience"', '<section class="controls"');
const sources = [
  section('    // --- State Management ---', '    // --- Server Communication ---'),
  section('    async function saveVendorScan(', '    async function loadScannedVendors('),
  section("    const vendorDrawModal = document.getElementById('vendorDrawModal');", '    function renderGrid()'),
  section('    async function markScanned(', '    function updateProgress('),
  section('    let scannerConfigUnavailable =', '    function websiteScannerRefreshConfig('),
  section('    async function startScanner()', '    function scanLoop()'),
  section('    function extractWeddingWinQrVendorId(', '    // Event listeners for desktop controls'),
  section('    function initApp()', '    // Ensure DOM is ready before initializing'),
];
const noticeVersion = '2026-09-01-in-person-entry|2026-09-04-pre-scan-draw-consent';
const websiteCsrf = 'd'.repeat(64);
const vendor = { id: '38970', user_id: '38970', name: 'Fictional Wedding Vendor' };
const validOffer = {
  terms_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
  vendor_offer_version: '2026-09-04T19:00:00.123456Z',
  consent_version: '2026-09-01-in-person-entry',
  participant_responsibility_disclosure: 'Exact test disclosure supplied by the server.',
  prize_count: 1, exclude_previous_winners: true, vendor_business_name: vendor.name,
  prize_title: 'Fictional test prize', prize_description: 'Test only; no real prize is awarded.', prize_approx_value_cad: 50,
  eligibility_region: 'Ontario test residents', entry_closes_at: '2026-10-18T19:00:00Z',
  draw_at: '2026-10-18T19:05:00Z', odds_basis: 'One equal chance per eligible entry.',
};
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createHarness(options = {}) {
  const calls = [], responses = [], redirects = [], timers = new Map();
  const storage = options.storage || new Map();
  const effects = { cameraRequests: 0, progressUpdates: 0 };
  let nextTimer = 1, document;
  class Element {
    constructor(id, attrs = '') {
      Object.assign(this, { id, checked: /\bchecked\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs),
        hidden: /\bhidden\b/.test(attrs), isConnected: true, textContent: '', href: '', dataset: {}, style: {}, children: [] });
      this.listeners = new Map(); this.classes = new Set();
      this.classList = { add: v => this.classes.add(v), remove: v => this.classes.delete(v), contains: v => this.classes.has(v) };
    }
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }
    async emit(type, extra = {}) {
      await Promise.all((this.listeners.get(type) || []).map(listener => listener({ target: this, preventDefault() {}, stopPropagation() {}, ...extra })));
    }
    async click() { if (!this.disabled) await this.emit('click'); }
    focus() { document.activeElement = this; }
    getAttribute() { return null; }
    removeAttribute(name) { if (name === 'href') this.href = ''; }
    contains(element) { return elements.has(element?.id); }
    querySelectorAll() { return [...elements.values()]; }
    appendChild(element) { this.children.push(element); if (element.id) elements.set(element.id, element); }
    replaceChildren() { this.children = []; }
  }
  const elements = new Map();
  const domMarkup = `${noticeMarkup}${markup}`.replace(/<\?php[\s\S]*?\?>/g, '');
  for (const tag of domMarkup.matchAll(/<[^>]+\sid="([^"]+)"[^>]*>/g)) elements.set(tag[1], new Element(tag[1], tag[0]));
  for (const leaf of domMarkup.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\sid="([^"]+)"[^>]*>([^<]*)<\/\1>/gi)) {
    elements.get(leaf[2]).textContent = leaf[3];
  }
  // PHP omits this entire section for production; fixture tests opt into the
  // same exact-vendor data attribute that the authenticated PHP render emits.
  if (options.fixture) elements.get('qrFixtureScanButton').dataset.vendorId = options.fixtureVendorId ?? vendor.id;
  else for (const id of ['qrFixtureScanButton', 'qrFixtureScanTitle']) elements.delete(id);
  elements.get('qrRulesNotice').dataset.storageKey = options.accountKey || 'wwQrRulesNotice:server-hash-account-a';
  const scannerElements = ['startBtn', 'mobileStartBtn', 'stopBtn', 'mobileStopBtn', 'cameraLoading', 'lastScanEl'];
  for (const id of scannerElements) elements.set(id, new Element(id));
  if (options.realGrid) elements.set('grid', new Element('grid'));
  document = { activeElement: null, getElementById: id => elements.get(id) || null, createElement: () => new Element(''), addEventListener() {} };
  const schedule = (callback, milliseconds) => {
    const id = nextTimer++; timers.set(id, { callback, milliseconds }); return id;
  };
  const config = { event_key: 'isolated-local-test-event', revision: 7, rules_version: validOffer.consent_version,
    vendor_draws_enabled: true, scan_enabled: true, show_scan_window_open: true,
    history_starts_at: '2026-10-18T15:00:00Z', scan_opens_at: '2026-09-08T12:00:00Z',
    entry_closes_at: validOffer.entry_closes_at, scan_open_early: true, ...options.config };
  // Offer tests begin after a saved scan. Scan-path tests explicitly start empty.
  const initialScanned = options.scanned ?? (options.fixture ? [] : [vendor.id]);
  class FixtureDate extends Date { static now() { return Date.parse('2026-09-11T12:00:00Z'); } }
  const context = vm.createContext({
    document, HTMLElement: Element, INITIAL_SCANNED: initialScanned, VENDOR_DRAW_SCANNED: initialScanned,
    IN_SHOW_SCANNED: [], QR_SCANNER_FIXTURE: options.fixture === true,
    VENDORS: options.vendors || [vendor], EVENT_CONFIG: config, Date: FixtureDate,
    gridEl: elements.get('grid'),
    QR_WEBSITE_CSRF: websiteCsrf,
    PARTICIPATION_NOTICE_VERSION: options.noticeVersion || noticeVersion, CONTACT_PROFILE_COMPLETE: options.profileComplete !== false,
    URL, URLSearchParams, AbortController, console: { error() {}, log() {}, warn() {} },
    ...Object.fromEntries(scannerElements.map(id => [id, elements.get(id)])), lastScan: elements.get('lastScanEl'),
    navigator: { mediaDevices: { getUserMedia: async () => {
      effects.cameraRequests++;
      if (options.cameraDenied) throw new Error('Test camera permission denied');
      return { getTracks: () => [{ stop() {} }] };
    } } },
    isAndroid: () => false, renderGrid() {}, hydrateTiles() {}, showSuccessAnimation() {}, enumerateCameras: async () => {},
    updateProgress: () => effects.progressUpdates++, formatPromotionDate: value => String(value),
    setTimeout: schedule, cancelAnimationFrame() {},
    window: {
      setTimeout: schedule, clearTimeout: id => timers.delete(id),
      location: { href: 'https://www.weddingwin.ca/qr', assign: url => redirects.push(url), replace: url => redirects.push(url) },
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    },
    fetch: async (url, request) => {
      calls.push({ url, request, form: new URLSearchParams(request.body) });
      assert.equal(new URLSearchParams(request.body).get('qr_csrf'), websiteCsrf,
        'Every couple POST must carry the current session-bound CSRF');
      assert.ok(responses.length, 'Unexpected transport call: queue each local response explicitly');
      const response = await responses.shift();
      if (response instanceof Error) throw response;
      const { status = 200, data = { ok: true } } = response;
      return { status, ok: status >= 200 && status < 300, json: async () => data, text: async () => JSON.stringify(data) };
    },
  });
  vm.runInContext([...sources, ...(options.realGrid ? [section('    function renderGrid()', '    async function markScanned(')] : []), `globalThis.drawTest = {
    show: showVendorDrawOffer, open: openVendorDrawOffer, close: closeVendorDraw,
    enter: enterVendorDraw, ready: vendorDrawEntryReady, update: updateVendorDrawEntryButton,
    refresh: refreshVendorDrawAfterStale, accepted: hasCurrentParticipationNotice,
    init: initApp, start: startScanner, save: saveVendorScan, mark: markScanned, decode: handleDecoded,
    fixtureScan: scanFixtureBooth, fixtureReady: canScanFixtureBooth, updateFixture: updateFixtureScanButton,
    state: () => ({ offer: currentVendorDrawOffer, scope: qrRulesNoticeAcceptedScope, scanned: [...scanned] })
  };`].join('\n'), context, { filename: '258-julian-qr-code-bingo.php:real-extracted-script' });
  return { api: context.drawTest, config, elements, calls, effects, timers, storage, redirects, document,
    queue: response => responses.push(response), el: id => elements.get(id),
    async check(value = true) {
      const checkbox = elements.get('qrRulesNoticeAcknowledged'); checkbox.checked = value; await checkbox.emit('change');
    },
  };
}

test('one compact linked agreement is before the scanner; detailed terms and second checkboxes stay out of the main flow', () => {
  assert.equal([...noticeMarkup.matchAll(/<input\b[^>]*\btype="checkbox"/g)].length, 1);
  assert.match(noticeMarkup, /<h2>Before you scan<\/h2>/);
  assert.match(noticeMarkup.replace(/<\?php[\s\S]*?\?>/g, '').replace(/<[^>]*>/g, ''), /I have read and agree to the QR Bingo Terms and Draw Rules\./);
  assert.match(noticeMarkup, /href="\/about\/terms#qr-bingo" target="_blank" rel="noopener">QR Bingo Terms<\/a>/);
  assert.match(noticeMarkup, /href="<\?php echo htmlspecialchars\(\$officialRulesUrl, ENT_QUOTES, 'UTF-8'\); \?>" target="_blank" rel="noopener">Draw Rules<\/a>/);
  assert.match(noticeMarkup, /href="\/about\/privacy"[^>]*>Privacy Policy<\/a>/);
  const checkboxAt = noticeMarkup.indexOf('id="qrRulesNoticeAcknowledged"');
  for (const id of ['qrNoticeVisit', 'qrNoticeEligibility', 'qrNoticeContact', 'qrNoticeRoles']) {
    assert.doesNotMatch(noticeMarkup, new RegExp(`id="${id}"`));
  }
  assert.ok(checkboxAt >= 0 && checkboxAt < noticeMarkup.indexOf('id="qrFixtureScanButton"'));
  assert.doesNotMatch(noticeMarkup, /age and residency requirements|entry\/consent evidence|Each vendor is responsible|Apple Inc\.|Scroll to read/);
  assert.equal([...markup.matchAll(/type="checkbox"/g)].length, 0);
  assert.match(markup, />Yes<\/button>/); assert.match(markup, />No<\/button>/);
  assert.equal([...markup.matchAll(/<button\b/g)].length, 2);
  assert.doesNotMatch(markup, /id="vendorDraw(?:Vendor|Description|Disclosure|Privacy|Terms|Rules|Roles|Apple)"/);
});

test('the linked QR Bingo terms preserve consent and explain authorized early entry', () => {
  const terms = readFileSync(new URL('../brilliant-directories/pages/about-terms.html', import.meta.url), 'utf8');
  const start = terms.indexOf('<h2 id="qr-bingo">'), end = terms.indexOf('<h2', start + 1);
  assert.ok(start >= 0 && end > start, 'The exact linked QR Bingo terms section must exist');
  const sectionText = terms.slice(start, end).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  for (const disclosure of [
    'Scanning records QR Bingo progress. It does not enter a draw.',
    'While the organizer has opened QR scanning, including early access, scanning a vendor whose draw is on can offer an optional entry.',
    "Read and agree to the QR Bingo Terms and Draw Rules before scanning. When asked whether to enter the named vendor's draw, choose Yes to enter under that agreement or No to keep only the scan.",
    'The displayed entry closing time and scheduled draw time still apply.',
    'I have read and agree to the QR Bingo Terms and Draw Rules. I confirm I meet the age and residency requirements and am not excluded under those rules.',
    "If I choose Yes to enter a named vendor's draw, Wedding Win Inc. will share my name, email address, phone number, wedding date, wedding venue if provided, and entry/consent evidence with that named vendor. I agree that the vendor may use these details for its draw and wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time.",
    'Each vendor is responsible for its draw, winner verification, and prize fulfilment. Wedding Win Inc. provides the technical system. Apple Inc. is not a sponsor of and is not involved in these promotions.',
  ]) assert.ok(sectionText.includes(disclosure), `The linked terms must retain: ${disclosure}`);
});

test('without pre-scan consent, camera, saved scans, offers and entry are blocked', async () => {
  const h = createHarness(); h.api.init(); await h.api.start();
  assert.equal(h.effects.cameraRequests, 0); assert.equal(h.api.accepted(), false);
  assert.equal(await h.api.save(vendor.id), false); assert.equal(await h.api.mark(vendor.id), false);
  await h.api.open(vendor); assert.equal(h.api.show(vendor, validOffer), false); await h.api.enter();
  assert.equal(h.calls.length, 0); assert.equal(h.el('vendorDrawEnter').disabled, true);
});

test('checking pre-scan agreement launches camera setup only, never a draw entry', async () => {
  const h = createHarness(); await h.check();
  assert.equal(h.api.accepted(), true); assert.equal(h.el('qrRulesNotice').hidden, true);
  assert.equal(h.effects.cameraRequests, 1); assert.equal(h.calls.length, 0);
  await h.check(); assert.equal(h.effects.cameraRequests, 1, 'Repeated taps cannot initialize another scanner');
});

test('profile completion, administrator switch and show-date gates still prevent camera launch', async () => {
  for (const options of [{ profileComplete: false }, { config: { scan_enabled: false } },
    { config: { show_scan_window_open: false, scan_open_early: false, scan_opens_at: '2026-10-18T04:00:00Z' } }]) {
    const h = createHarness(options); await h.check(); h.api.init(); await h.api.start();
    assert.equal(h.effects.cameraRequests, 0, JSON.stringify(options)); assert.equal(h.calls.length, 0);
  }
  const h = createHarness({ profileComplete: false }); await h.api.start();
  assert.equal(h.effects.cameraRequests, 0); assert.deepEqual(h.redirects, [], 'Incomplete contact remains gated on the current page');
});

test('old values, wrong account, changed event, rules or notice version cannot restore consent', async () => {
  const old = createHarness({ storage: new Map([['wwQrRulesNotice:server-hash-account-a', '1']]) });
  assert.equal(old.api.accepted(), false);
  const original = createHarness(); await original.check();
  for (const change of [
    { accountKey: 'wwQrRulesNotice:server-hash-account-b' }, { config: { event_key: 'different-event' } },
    { config: { rules_version: 'different-rules' } }, { noticeVersion: '2026-09-01-in-person-entry|2026-09-01-in-person-entry' },
  ]) {
    const h = createHarness({ storage: new Map(original.storage), ...change }); h.api.init();
    assert.equal(h.api.accepted(), false, JSON.stringify(change)); assert.equal(h.effects.cameraRequests, 0);
    assert.equal(await h.api.save(vendor.id), false); assert.equal(h.calls.length, 0);
  }
  const restored = createHarness({ storage: new Map(original.storage) });
  assert.equal(restored.api.accepted(), true); restored.api.init(); assert.equal(restored.effects.cameraRequests, 1);
});

test('account/event/rules changes after acceptance fail closed; unchecking revokes consent', async () => {
  for (const change of [
    h => { h.el('qrRulesNotice').dataset.storageKey = 'different-account'; },
    h => { h.config.event_key = 'different-event'; }, h => { h.config.rules_version = 'different-rules'; },
  ]) {
    const h = createHarness(); await h.check(); h.api.show(vendor, validOffer); change(h); h.api.update();
    assert.equal(h.api.accepted(), false); assert.equal(h.el('vendorDrawEnter').disabled, true);
    await h.api.enter(); assert.equal(h.calls.length, 0);
  }
  const h = createHarness(); await h.check(); await h.check(false);
  assert.equal(h.api.accepted(), false); assert.equal(h.storage.size, 0);
});

test('QR scan saves Bingo progress and loads optional offer, without submitting an entry', async () => {
  const h = createHarness({ scanned: [] }); await h.check();
  h.queue({ data: { status: 'success', completed: true, vendor_draw_scan: true, in_show_scan: false } }); h.queue({ data: { ok: true, raffle_offer: validOffer } });
  await h.api.decode('https://www.weddingwin.ca/qr?vendor_id=38970');
  assert.deepEqual(h.calls.map(call => call.form.get('action')), ['scan_vendor', 'raffle_offer']);
  assert.equal(h.api.state().scanned.length, 1); assert.equal(h.effects.progressUpdates, 1);
  assert.equal(h.el('vendorDrawModal').hidden, false); assert.equal(h.el('vendorDrawEnter').disabled, false);
  assert.equal(h.el('vendorDrawTitle').textContent, 'Enter Fictional Wedding Vendor’s draw?');
  assert.equal(h.el('vendorDrawStatus').textContent, '');
  assert.equal(h.el('vendorDrawEnter').textContent, 'Yes');
  assert.equal(h.el('vendorDrawDecline').textContent, 'No');
  assert.equal(h.document.activeElement, h.el('vendorDrawDecline'));
  for (const id of ['vendorDrawVendor', 'vendorDrawDescription', 'vendorDrawDisclosure', 'vendorDrawPrivacy', 'vendorDrawTerms', 'vendorDrawRules']) assert.equal(h.el(id), undefined);
  for (const call of h.calls) assert.equal(call.form.get('participation_notice_version'), noticeVersion);
});

test('No keeps scan progress; reopening requires only Yes or No', async () => {
  const h = createHarness({ scanned: [] }); await h.check(); h.queue({ data: { status: 'success', vendor_draw_scan: true } }); await h.api.mark(vendor.id);
  h.api.show(vendor, validOffer); await h.el('vendorDrawDecline').click();
  assert.equal(h.el('vendorDrawModal').hidden, true); assert.equal(h.api.accepted(), true);
  assert.equal(h.api.state().scanned.length, 1); h.api.show(vendor, validOffer);
  assert.equal(h.el('vendorDrawEnter').disabled, false);
  assert.equal(h.calls.length, 1, 'Reopening the prompt must not submit an entry');
});

test('missing or stale offer evidence fails closed despite current pre-scan agreement', async () => {
  for (const patch of [{ consent_version: '' }, { consent_version: 'old-rules' }, { vendor_offer_version: '' },
    { vendor_offer_version: '2026-02-30T12:00:00Z' }, { participant_responsibility_disclosure: '' },
    { terms_url: 'https://untrusted.invalid/rules' }, { prize_count: 4 }, { exclude_previous_winners: undefined }]) {
    const h = createHarness(); await h.check();
    assert.equal(h.api.show(vendor, { ...validOffer, ...patch }), false, JSON.stringify(patch)); await h.api.enter();
    assert.equal(h.api.ready(), false); assert.equal(h.calls.length, 0);
  }
});

test('explicit Yes sends current vendor evidence and prior agreement without a new policy acceptance claim', async () => {
  const h = createHarness(); await h.check(); h.api.show(vendor, validOffer); assert.equal(h.calls.length, 0);
  h.queue({ data: { ok: true, message: 'Test entry confirmed.' } }); await h.el('vendorDrawEnter').click();
  assert.equal(h.calls.length, 1); const { url, request, form } = h.calls[0];
  assert.equal(url, ''); assert.equal(request.method, 'POST'); assert.equal(request.credentials, 'same-origin');
  assert.equal(request.cache, 'no-store'); assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
  for (const [key, value] of Object.entries({ action: 'raffle_opt_in', participation_notice_version: noticeVersion,
    expected_event_key: h.config.event_key, expected_config_revision: '7', vendor_id: vendor.id,
    consent_version: validOffer.consent_version, vendor_offer_version: validOffer.vendor_offer_version,
    participant_responsibility_disclosure: validOffer.participant_responsibility_disclosure })) assert.equal(form.get(key), value, key);
  for (const field of ['rules_viewed', 'age_of_majority_attested', 'residency_attested', 'exclusions_attested',
    'promotion_responsibility_acknowledged', 'draw_administration_contact_share_acknowledged',
    'vendor_marketing_consent_acknowledged', 'apple_non_sponsor_acknowledged']) assert.equal(form.get(field), '1', field);
  for (const key of form.keys()) assert.equal(key.startsWith('entry_access_'), false, 'The browser must not invent a new policy acceptance');
  assert.equal(h.el('vendorDrawStatus').textContent, 'Test entry confirmed.');
});

test('stale vendor offer requires another explicit choice but no new checkbox or automatic retry', async () => {
  const h = createHarness(); await h.check(); h.api.show(vendor, validOffer);
  const updated = { ...validOffer, vendor_offer_version: '2026-09-04T20:00:00Z' };
  h.queue({ status: 409, data: { ok: false, code: 'stale_vendor_offer' } }); h.queue({ data: { ok: true, raffle_offer: updated } });
  await h.el('vendorDrawEnter').click();
  assert.deepEqual(h.calls.map(call => call.form.get('action')), ['raffle_opt_in', 'raffle_offer']);
  assert.equal(h.api.state().offer.vendor_offer_version, updated.vendor_offer_version);
  assert.equal(h.api.accepted(), true); assert.equal(h.el('vendorDrawEnter').disabled, false);
  assert.match(h.el('vendorDrawStatus').textContent, /Choose Yes or No/);
  h.queue({ data: { ok: true } }); await h.el('vendorDrawEnter').click();
  assert.equal(h.calls.length, 3); assert.equal(h.calls[2].form.get('vendor_offer_version'), updated.vendor_offer_version);
});

test('invalid stale-offer refresh leaves no eligible submission', async () => {
  const h = createHarness(); await h.check(); h.api.show(vendor, validOffer);
  h.queue({ status: 409, data: { ok: false, code: 'stale_vendor_offer' } });
  h.queue({ data: { ok: true, raffle_offer: { ...validOffer, consent_version: 'changed-published-rules' } } });
  await h.el('vendorDrawEnter').click(); assert.equal(h.api.state().offer, null);
  assert.equal(h.el('vendorDrawEnter').disabled, true); await h.api.enter(); assert.equal(h.calls.length, 2);
  assert.match(h.el('vendorDrawStatus').textContent, /No entry was recorded/);
});

test('rapid Enter calls and closing while pending cannot duplicate or discard the submission', async () => {
  const h = createHarness(); await h.check(); h.api.show(vendor, validOffer);
  const pending = deferred(); h.queue(pending.promise); h.queue({ data: { ok: true } });
  const first = h.api.enter(), second = h.api.enter(); assert.equal(h.el('vendorDrawDecline').disabled, true);
  h.api.close(); assert.equal(h.el('vendorDrawModal').hidden, false); h.api.update();
  const disabled = h.el('vendorDrawEnter').disabled, callCount = h.calls.length;
  pending.resolve({ data: { ok: true } }); await Promise.all([first, second]);
  assert.equal(callCount, 1); assert.equal(disabled, true);
});

test('successful entry cannot resubmit during the confirmation', async () => {
  const h = createHarness(); await h.check(); h.api.show(vendor, validOffer); h.queue({ data: { ok: true } });
  await h.el('vendorDrawEnter').click(); h.api.update(); await h.api.enter(); await h.el('vendorDrawEnter').click();
  assert.equal(h.calls.length, 1); assert.equal(h.el('vendorDrawEnter').disabled, true);
  const closeTimer = [...h.timers.values()].find(timer => timer.milliseconds === 1600); assert.ok(closeTimer);
  closeTimer.callback(); assert.equal(h.el('vendorDrawModal').hidden, true); assert.equal(h.api.accepted(), true);
});

test('ordinary request failure restores controls and permits an explicit retry only', async () => {
  const h = createHarness(); await h.check(); h.api.show(vendor, validOffer);
  h.queue({ status: 503, data: { ok: false, message: 'Test service unavailable.' } }); await h.el('vendorDrawEnter').click();
  assert.equal(h.calls.length, 1); assert.equal(h.el('vendorDrawDecline').disabled, false); assert.equal(h.el('vendorDrawEnter').disabled, false);
  h.queue({ data: { ok: true } }); await h.el('vendorDrawEnter').click(); assert.equal(h.calls.length, 2);
});

test('production has no test control and cannot start a fixture scan', async () => {
  const h = createHarness(); await h.check();
  assert.equal(h.el('qrFixtureScanButton'), undefined); assert.equal(h.api.fixtureReady(), false);
  await h.api.fixtureScan(); assert.equal(h.calls.length, 0);
});

test('test scan remains blocked without consent, complete contact, current event or exact sole vendor', async () => {
  const unaccepted = createHarness({ fixture: true }); unaccepted.api.init();
  await unaccepted.el('qrFixtureScanButton').click(); await unaccepted.api.fixtureScan();
  assert.equal(unaccepted.calls.length, 0); assert.equal(unaccepted.api.fixtureReady(), false);
  for (const options of [
    { profileComplete: false }, { config: { scan_enabled: false } }, { config: { show_scan_window_open: false } },
    { config: { scan_enabled: 'true' } }, { config: { event_key: '' } }, { config: { rules_version: 'old-rules' } },
    { fixtureVendorId: 'another-vendor' }, { fixtureVendorId: '' }, { vendors: [] },
    { vendors: [vendor, { ...vendor, id: '100' }] }, { vendors: [{ ...vendor, user_id: '100' }] },
  ]) {
    const h = createHarness({ fixture: true, ...options }); await h.check(); h.api.init();
    await h.el('qrFixtureScanButton').click(); await h.api.fixtureScan();
    assert.equal(h.api.fixtureReady(), false, JSON.stringify(options)); assert.equal(h.calls.length, 0);
  }
  const revoked = createHarness({ fixture: true }); await revoked.check(); await revoked.check(false);
  assert.equal(revoked.el('qrFixtureScanButton').disabled, true); await revoked.api.fixtureScan();
  assert.equal(revoked.calls.length, 0);
});

test('camera-denied test button follows ordinary scan and offer with current CSRF; entry stays optional', async () => {
  const h = createHarness({ fixture: true, cameraDenied: true }); await h.check();
  assert.equal(h.el('qrFixtureScanButton').disabled, false);
  h.queue({ data: { status: 'success', completed: true } }); h.queue({ data: { ok: true, raffle_offer: validOffer } });
  await h.el('qrFixtureScanButton').click();
  assert.deepEqual(h.calls.map(call => call.form.get('action')), ['scan_vendor', 'raffle_offer']);
  for (const call of h.calls) {
    assert.equal(call.form.get('vendor_id'), vendor.id); assert.equal(call.form.get('qr_csrf'), websiteCsrf);
    assert.equal(call.form.get('expected_event_key'), h.config.event_key);
    assert.equal(call.form.get('expected_config_revision'), String(h.config.revision));
    assert.equal(call.form.get('participation_notice_version'), noticeVersion);
  }
  assert.deepEqual([...h.api.state().scanned], [vendor.id]); assert.equal(h.el('vendorDrawModal').hidden, false);
  await h.el('vendorDrawDecline').click(); assert.equal(h.calls.length, 2, 'No cannot enter the draw');
  assert.deepEqual([...h.api.state().scanned], [vendor.id]);
});

test('rapid test scan taps use one save and offer; modal cannot be replaced while choosing', async () => {
  const h = createHarness({ fixture: true, cameraDenied: true }); await h.check();
  const pending = deferred(); h.queue(pending.promise); h.queue({ data: { ok: true, raffle_offer: validOffer } });
  const first = h.el('qrFixtureScanButton').click();
  assert.equal(h.el('qrFixtureScanButton').disabled, true);
  await h.el('qrFixtureScanButton').click(); await h.api.fixtureScan(); assert.equal(h.calls.length, 1);
  pending.resolve({ data: { status: 'success' } }); await first;
  assert.deepEqual(h.calls.map(call => call.form.get('action')), ['scan_vendor', 'raffle_offer']);
  await h.api.fixtureScan(); assert.equal(h.calls.length, 2);
});

test('failed test scan never claims progress or opens an offer and can be explicitly retried', async () => {
  const h = createHarness({ fixture: true, cameraDenied: true }); await h.check();
  h.queue({ status: 403, data: { status: 'error', message: 'Fixture has expired.' } });
  await h.el('qrFixtureScanButton').click();
  assert.equal(h.calls.length, 1); assert.equal(h.api.state().scanned.length, 0);
  assert.equal(h.el('vendorDrawModal').hidden, true); assert.equal(h.el('qrFixtureScanButton').disabled, false);
  assert.match(h.el('lastScanEl').textContent, /could not be saved/);
  h.queue({ data: { status: 'success' } }); h.queue({ data: { ok: true, raffle_offer: null } });
  await h.el('qrFixtureScanButton').click();
  assert.deepEqual(h.calls.map(call => call.form.get('action')), ['scan_vendor', 'scan_vendor', 'raffle_offer']);
  assert.equal(h.api.state().scanned.length, 1); assert.equal(h.el('vendorDrawModal').hidden, true);
});

test('actual grid review shows already-entered-or-closed server feedback without offering another entry', async () => {
  const h = createHarness({ realGrid: true, scanned: [vendor.id], cameraDenied: true }); await h.check();
  const button = h.el(`vendor-draw-review-${vendor.id}`); assert.ok(button); assert.equal(button.hidden, false);
  button.focus();
  const status = 'You are already entered, or this vendor draw is not currently open.';
  h.queue({ data: { ok: true, raffle_offer: null, message: status } });
  await button.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].form.get('action'), 'raffle_offer');
  assert.equal(h.el('vendorDrawModal').hidden, false); assert.equal(h.el('vendorDrawTitle').textContent, 'Draw status');
  assert.equal(h.el('vendorDrawStatus').textContent, status);
  assert.equal(h.el('vendorDrawEnter').hidden, true); assert.equal(h.el('vendorDrawEnter').disabled, true);
  assert.equal(h.api.state().offer, null);
  assert.equal(h.el('vendorDrawDecline').textContent, 'Close'); assert.equal(h.document.activeElement, h.el('vendorDrawDecline'));
  await h.api.enter(); assert.equal(h.calls.length, 1, 'Status must not allow duplicate entry');
  await h.el('vendorDrawDecline').click(); assert.equal(h.el('vendorDrawModal').hidden, true);
  const restoreFocus = [...h.timers.values()].find(timer => timer.milliseconds === 0); assert.ok(restoreFocus);
  restoreFocus.callback(); assert.equal(h.document.activeElement, button);
});

test('ordinary scanning does not interrupt with a status dialog when a vendor has no available prize', async () => {
  const h = createHarness({ cameraDenied: true, scanned: [] }); await h.check();
  h.queue({ data: { status: 'success', vendor_draw_scan: true } });
  h.queue({ data: { ok: true, raffle_offer: null, message: 'You are already entered, or this vendor draw is not currently open.' } });
  await h.api.decode('https://www.weddingwin.ca/qr?vendor_id=' + vendor.id);
  assert.equal(h.el('vendorDrawModal').hidden, true); assert.equal(h.api.state().scanned.length, 1);
  assert.deepEqual(h.calls.map(call => call.form.get('action')), ['scan_vendor', 'raffle_offer']);
});

test('explicit review failures are visible and closing permits a fresh normal offer with restored controls', async () => {
  for (const response of [
    { status: 503, data: { ok: false, message: 'Unavailable' } },
    { data: { ok: true } },
    { data: { ok: true, raffle_offer: { ...validOffer, consent_version: 'wrong-version' } } },
  ]) {
    const h = createHarness({ cameraDenied: true }); await h.check(); h.queue(response);
    await h.api.open(vendor, true);
    assert.equal(h.el('vendorDrawModal').hidden, false); assert.equal(h.el('vendorDrawEnter').hidden, true);
    assert.equal(h.el('vendorDrawStatus').classList.contains('is-error'), true);
    assert.match(h.el('vendorDrawStatus').textContent, /could not load this draw/);
    await h.api.enter(); assert.equal(h.calls.length, 1);
    await h.el('vendorDrawDecline').click(); h.queue({ data: { ok: true, raffle_offer: validOffer } });
    await h.api.open(vendor, true);
    assert.equal(h.el('vendorDrawEnter').hidden, false);
    assert.equal(h.el('vendorDrawTitle').textContent, 'Enter Fictional Wedding Vendor’s draw?');
    assert.equal(h.el('vendorDrawStatus').textContent, '');
    assert.equal(h.el('vendorDrawEnter').disabled, false); assert.equal(h.el('vendorDrawDecline').textContent, 'No');
    assert.equal(h.el('vendorDrawStatus').classList.contains('is-error'), false);
  }
});

test('status clears an earlier offer and reopening restores only the simple named choice', async () => {
  const h = createHarness(); await h.check();
  assert.equal(h.api.show(vendor, validOffer), true);
  assert.equal(h.api.state().offer.vendor_offer_version, validOffer.vendor_offer_version);
  await h.el('vendorDrawDecline').click();
  h.queue({ data: { ok: true, raffle_offer: null, message: 'This draw is not currently open.' } });
  await h.api.open(vendor, true);
  assert.equal(h.api.state().offer, null);
  assert.equal(h.el('vendorDrawEnter').hidden, true);
  assert.equal(h.el('vendorDrawStatus').textContent, 'This draw is not currently open.');
  assert.equal(h.document.activeElement, h.el('vendorDrawDecline'));
  await h.el('vendorDrawDecline').click();
  assert.equal(h.api.show(vendor, validOffer), true);
  assert.equal(h.el('vendorDrawTitle').textContent, 'Enter Fictional Wedding Vendor’s draw?');
  assert.equal(h.el('vendorDrawStatus').textContent, '');
  assert.equal(h.el('vendorDrawEnter').hidden, false);
  assert.equal(h.el('vendorDrawEnter').disabled, false);
  assert.equal(h.el('vendorDrawDecline').textContent, 'No');
  for (const id of ['vendorDrawDescription', 'vendorDrawDisclosure', 'vendorDrawPrivacy', 'vendorDrawTerms', 'vendorDrawRules']) assert.equal(h.el(id), undefined);
});

test('rapid explicit reviews issue one request and cannot replace an open choice or pending entry', async () => {
  const h = createHarness({ cameraDenied: true }); await h.check(); const pending = deferred(); h.queue(pending.promise);
  const first = h.api.open(vendor, true); await h.api.open(vendor, true);
  assert.equal(h.calls.length, 1); pending.resolve({ data: { ok: true, raffle_offer: validOffer } }); await first;
  await h.api.open(vendor, true); assert.equal(h.calls.length, 1, 'An open choice cannot be overwritten');
  const entry = deferred(); h.queue(entry.promise); const entering = h.api.enter();
  await h.api.open(vendor, true); assert.equal(h.calls.length, 2);
  entry.resolve({ data: { ok: true } }); await entering;
});

test('acceptance revoked during review prevents late status or entry UI', async () => {
  const h = createHarness({ cameraDenied: true }); await h.check(); const pending = deferred(); h.queue(pending.promise);
  const opening = h.api.open(vendor, true); await h.check(false);
  pending.resolve({ data: { ok: true, raffle_offer: null, message: 'No offer available.' } }); await opening;
  assert.equal(h.el('vendorDrawModal').hidden, true); assert.equal(h.api.ready(), false); assert.equal(h.calls.length, 1);
});

test('the previous entry confirmation timer cannot dismiss a freshly reopened status dialog', async () => {
  const h = createHarness({ cameraDenied: true }); await h.check(); h.api.show(vendor, validOffer);
  h.queue({ data: { ok: true } }); await h.api.enter();
  const oldTimer = [...h.timers.values()].find(timer => timer.milliseconds === 1600); assert.ok(oldTimer);
  h.api.close(); h.queue({ data: { ok: true, raffle_offer: null, message: 'You are already entered, or this vendor draw is not currently open.' } });
  await h.api.open(vendor, true); assert.equal(h.el('vendorDrawModal').hidden, false);
  oldTimer.callback(); assert.equal(h.el('vendorDrawModal').hidden, false);
  assert.equal(h.el('vendorDrawEnter').hidden, true); assert.equal(h.calls.length, 2);
});
