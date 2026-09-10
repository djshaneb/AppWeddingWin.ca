// Execute the actual website scan/progress callbacks against local doubles.
// No PHP/database execution, real account, camera or network is involved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
const message = 'Congratulations! You’ve completed Vendor Bingo. You’re now entered in the grand prize draw.';
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, `Missing actual source section: ${start}`);
  return source.slice(first, last);
}
const callbacks = section('    async function saveVendorScan(', '    async function loadScannedVendors(') +
  section('    async function markScanned(', '    function showSuccessAnimation(');

function fixture({ ids = ['901', '902'], recorded = [], ok = true, held = false } = {}) {
  const scans = new Set(recorded), requests = [], classes = new Set(), attributes = new Map();
  const progress = { style: {} }, text = { textContent: '' };
  let release;
  const pending = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const context = vm.createContext({
    VENDORS: ids.map(id => ({ id })), scanned: scans, inShowScanned: new Set(), vendorScanRequests: new Map(),
    hasCurrentParticipationNotice: () => true, isWebsiteDrawWindowOpen: () => false,
    canReviewVendorDraw: () => false, eventConfigRefreshStarted: false,
    refreshPageAfterStaleEventConfig: () => false,
    QR_WEBSITE_CSRF: 'offline-csrf', PARTICIPATION_NOTICE_VERSION: 'offline-notice',
    EVENT_CONFIG: { event_key: 'offline-event', revision: 1 },
    document: { getElementById: () => null, querySelector: () => ({ setAttribute: (key, value) => attributes.set(key, value) }) },
    progressEl: progress, progressTextEl: text,
    doneBar: { classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) } },
    console: { log() {}, error() {} },
    fetch: async (_url, init) => {
      requests.push(new URLSearchParams(init.body)); await pending;
      return { ok, json: async () => ({ status: ok ? 'success' : 'error', completed: true, message: 'Offline rejection' }) };
    },
  });
  vm.runInContext(callbacks + '\nglobalThis.testApi = { markScanned, updateProgress };', context);
  context.testApi.updateProgress();
  return { ...context.testApi, requests, scans, progress, text, attributes, visible: () => classes.has('on'), release: () => release?.() };
}

test('website completion banner contains only the requested grand-prize congratulations', () => {
  const banner = section('<section class="done" id="doneBar"', '</section>');
  const text = banner.replace(/<[^>]*>/g, '').replace(/&rsquo;|&#8217;|&#x2019;/gi, '’').replace(/\s+/g, ' ').trim();
  assert.equal(text, message);
  assert.doesNotMatch(text, /vendor draw|vendor prize|optional|separate/i);
});

test('website banner stays hidden until the final scan is successfully saved', async () => {
  const f = fixture({ recorded: ['901'], held: true });
  assert.equal(f.visible(), false);
  const pending = f.markScanned('902');
  assert.equal(f.visible(), false); assert.equal(f.scans.size, 1);
  f.release(); assert.equal(await pending, true);
  assert.equal(f.visible(), true); assert.equal(f.text.textContent, '2 / 2 scanned');
  assert.equal(f.progress.style.width, '100%');
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].get('action'), 'scan_vendor');
});

test('failed final scan or incomplete roster never displays the completion banner', async () => {
  const failed = fixture({ recorded: ['901'], ok: false });
  assert.equal(await failed.markScanned('902'), false);
  assert.equal(failed.visible(), false); assert.equal(failed.scans.size, 1);
  const incomplete = fixture(); assert.equal(await incomplete.markScanned('901'), true);
  assert.equal(incomplete.visible(), false); assert.equal(incomplete.text.textContent, '1 / 2 scanned');
});

test('an empty website roster cannot claim completion or produce an invalid percentage', () => {
  const empty = fixture({ ids: [] });
  assert.equal(empty.visible(), false); assert.equal(empty.progress.style.width, '0%');
});
