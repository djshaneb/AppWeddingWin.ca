import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

function invitationFixture() {
  const nodes = Object.fromEntries(['vendorDrawEnter', 'vendorDrawDecline', 'vendorDrawModal', 'vendorDrawDisclosure', 'vendorDrawPrivacy', 'vendorDrawTerms', 'vendorDrawRules', 'vendorDrawTitle', 'vendorDrawVendor', 'vendorDrawDescription', 'vendorDrawStatus'].map(key => [key, { ...node(), focus() {} }]));
  nodes.vendorDrawModal.hidden = true;
  const calls = [], timers = [];
  const context = vm.createContext({
    ...nodes, currentVendorDrawOffer: null, currentVendorDrawVendor: null, vendorDrawReturnFocus: null,
    vendorDrawEntryInFlight: false, vendorDrawEntryRecorded: false,
    EVENT_CONFIG: canonical(), hasCurrentParticipationNotice: () => true, canReviewVendorDraw: () => true,
    cleanPromotionText: value => String(value || '').trim(),
    trustedWeddingWinPromotionUrl: value => value === canonical().official_rules_url ? value : '',
    formatPromotionDate: value => value,
    requestVendorDraw: async (action, body) => { calls.push({ action, body }); return { ok: true, message: 'Your entry is confirmed.' }; },
    window: { setTimeout: fn => timers.push(fn) },
  });
  vm.runInContext(section(website, '    function trustedVendorOfferVersion(', '    async function requestVendorDraw('), context);
  vm.runInContext(section(website, '    function resetVendorDrawChoice()', '    function showVendorDrawStatus('), context);
  vm.runInContext(section(website, '    async function enterVendorDraw()', "    vendorDrawDecline.addEventListener"), context);
  const offer = { vendor_business_name: 'Sound of Harmony', prize_title: 'Test prize',
    consent_version: canonical().rules_version, vendor_offer_version: '2026-09-11T12:00:00Z',
    terms_url: canonical().official_rules_url, prize_count: 1, exclude_previous_winners: true,
    participant_responsibility_disclosure: 'I scanned this vendor QR code during authorized scanning.',
  };
  return { context, calls, nodes, timers, offer,
    show: () => context.showVendorDrawOffer({ id: '23608', name: 'Sound of Harmony' }, offer) };
}

test('website shows named Yes/No invitation and No preserves scan without submitting entry', () => {
  const f = invitationFixture();
  assert.equal(f.show(), true);
  assert.equal(f.nodes.vendorDrawTitle.textContent, 'Enter Sound of Harmony’s draw?');
  assert.equal(f.nodes.vendorDrawEnter.disabled, false);
  assert.equal(f.nodes.vendorDrawDecline.textContent, 'No');
  const modal = section(website, '  <div class="vendor-draw-modal"', '  <!-- Vendor Data -->');
  assert.doesNotMatch(modal, /vendorDrawPrivacy|vendorDrawRules|vendorDrawDisclosure|vendorDrawDescription/);
  assert.match(modal, />Yes<\/button>/);
  assert.match(modal, />No<\/button>/);
  assert.deepEqual(f.calls, []);
  f.context.closeVendorDraw();
  assert.equal(f.nodes.vendorDrawModal.hidden, true);
  assert.equal(f.context.currentVendorDrawOffer, null);
  assert.deepEqual(f.calls, []);
});

test('website explicit Yes uses the prior agreement and current offer once without fabricating new consent', async () => {
  const f = invitationFixture(); f.show();
  await Promise.all([f.context.enterVendorDraw(), f.context.enterVendorDraw()]);
  assert.equal(f.calls.length, 1);
  const { action, body } = f.calls[0];
  assert.equal(action, 'raffle_opt_in');
  assert.equal(body.vendor_id, '23608');
  for (const key of ['participant_responsibility_disclosure', 'vendor_offer_version']) assert.equal(body[key], f.offer[key]);
  assert.equal(body.rules_viewed, true);
  assert.equal(body.vendor_marketing_consent_acknowledged, true);
  assert.equal('entry_access_acknowledged' in body, false);
  assert.equal('entry_access_disclosure' in body, false);
  assert.equal('in_show_scan_verified' in body, false);
  assert.equal(f.nodes.vendorDrawStatus.textContent, 'Your entry is confirmed.');
  assert.equal(f.nodes.vendorDrawEnter.disabled, true);
  await f.context.enterVendorDraw();
  assert.equal(f.calls.length, 1);
});

test('website refuses incomplete offers and stops entry after proof or prior agreement is lost', async () => {
  for (const patch of [{ consent_version: 'old' }, { prize_count: 0 }, { participant_responsibility_disclosure: '' }]) {
    const f = invitationFixture(); Object.assign(f.offer, patch); assert.equal(f.show(), false);
    await f.context.enterVendorDraw(); assert.deepEqual(f.calls, []);
  }
  for (const gate of ['canReviewVendorDraw', 'hasCurrentParticipationNotice']) {
    const f = invitationFixture(); f.show(); f.context[gate] = () => false;
    await f.context.enterVendorDraw(); assert.deepEqual(f.calls, []);
  }
});

test('website failed opt-in preserves invitation and permits an explicit retry', async () => {
  const f = invitationFixture(); f.show();
  f.context.requestVendorDraw = async () => { throw new Error('Entry could not be saved.'); };
  await f.context.enterVendorDraw();
  assert.equal(f.context.vendorDrawEntryRecorded, false);
  assert.equal(f.nodes.vendorDrawModal.hidden, false);
  assert.equal(f.nodes.vendorDrawEnter.disabled, false);
  assert.equal(f.nodes.vendorDrawDecline.disabled, false);
  assert.match(f.nodes.vendorDrawStatus.textContent, /could not be/);
});


const website = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php', import.meta.url), 'utf8');
const section = (source, start, end) => { const from = source.indexOf(start), to = source.indexOf(end, from + start.length); assert(from >= 0 && to > from, start); return source.slice(from, to); };
const b64 = text => Buffer.from(text).toString('base64');
function php(code) {
  // Full widget sources exceed Linux's per-argument limit; execute a temporary
  // PHP file with the same installed runtime used by the other PHP fixtures.
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'ww-scanner-opening-'));
  const file = join(directory, 'fixture.php');
  try {
    writeFileSync(file, '<?php\n' + code);
    return JSON.parse(execFileSync(process.execPath, [
      fileURLToPath(new URL('../node_modules/@php-wasm/cli/php-wasm.js', import.meta.url)), file,
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const phpHelpers = section(website, '    function ww_qr_bingo_is_rfc3339_timestamp(', '    /* WW_QR_SCANNER_WINDOW_HELPERS_START */') + section(website, '    /* WW_QR_SCANNER_WINDOW_HELPERS_START */', '    /* WW_QR_SCANNER_WINDOW_HELPERS_END */');
const webHelpers = section(website, '    /* WW_QR_WEB_SCANNER_WINDOW_START */', '    /* WW_QR_WEB_SCANNER_WINDOW_END */');
const canonical = () => ({ event_key: 'niagara-wedding-show-2026', event_name: 'Niagara Wedding Show', vendor_tag_id: 30, revision: 12, rules_version: 'current-rules', official_rules_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules', history_starts_at: '2026-10-18T15:00:00Z', entry_closes_at: '2026-10-18T19:00:00Z', draw_opens_at: '2026-10-18T19:00:00Z', draw_at: '2026-10-18T20:00:00Z', scan_enabled: true, vendor_draws_enabled: true, scan_open_early: false, scan_opens_at: '2026-10-18T04:00:00Z', scan_history_starts_at: '2026-10-18T04:00:00Z' });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('actual PHP scanner window opens at midnight Toronto, permits early override, and preserves master pause/closing', () => {
  const result = php(`${phpHelpers}
    date_default_timezone_set('America/Toronto');
    $config=json_decode(base64_decode('${b64(JSON.stringify(canonical()))}'),true);
    $config['history_starts_at_unix']=strtotime($config['history_starts_at']);$config['entry_closes_at_unix']=strtotime($config['entry_closes_at']);
    $config=ww_qr_bingo_scanner_config($config);$before=strtotime('2026-10-18T03:59:59Z');$midnight=strtotime('2026-10-18T04:00:00Z');$close=strtotime('2026-10-18T19:00:00Z');
    $states=array(ww_qr_bingo_scan_window_open($config,$before),ww_qr_bingo_scan_window_open($config,$midnight),ww_qr_bingo_scan_window_open($config,$close));
    $config['scan_open_early']=true;$states[]=ww_qr_bingo_scan_window_open($config,$before);$states[]=ww_qr_bingo_scan_window_open($config,$close);
    $config['scan_enabled']=false;$states[]=ww_qr_bingo_scan_window_open($config,$before);$states[]=ww_qr_bingo_scan_window_open($config,$midnight,true);
    echo json_encode(array('states'=>$states,'sql'=>$config['scan_history_starts_at_sql'],'show'=>$config['history_starts_at']));`);
  assert.deepEqual(result.states, [false, true, false, true, false, false, false]);
  assert.equal(result.sql, '2026-10-18 00:00:00'); assert.equal(result.show, canonical().history_starts_at);
});

test('actual PHP fallback is conservative and malformed partial scanner config fails closed', () => {
  const legacy = canonical(); delete legacy.scan_open_early; delete legacy.scan_opens_at; delete legacy.scan_history_starts_at;
  const cases = [legacy, { ...legacy, scan_open_early: true }, { ...canonical(), scan_open_early: 'true' }, { ...canonical(), scan_opens_at: '2026-02-30T00:00:00Z' }, { ...canonical(), scan_history_starts_at: '2026-10-18T05:00:00Z' }, { ...canonical(), scan_early_access_starts_at: 'yesterday' }];
  const result = php(`${phpHelpers}$cases=json_decode(base64_decode('${b64(JSON.stringify(cases))}'),true);$results=array();foreach($cases as $c){$results[]=ww_qr_bingo_scanner_config($c);}echo json_encode($results);`);
  assert.equal(result[0].scan_open_early, false); assert.equal(result[0].scan_opens_at, legacy.history_starts_at);
  for (const invalid of result.slice(1)) assert.equal(invalid, null);
});

test('actual PHP progress retains the first early floor but duplicate scan floor changes at the unchanged 11AM show start', () => {
  const config = { ...canonical(), scan_history_starts_at: '2026-09-08T17:00:00Z', scan_open_early: false, scan_early_access_starts_at: '2026-09-08T17:00:00Z' };
  const result = php(`${phpHelpers}$c=json_decode(base64_decode('${b64(JSON.stringify(config))}'),true);$c['history_starts_at_unix']=strtotime($c['history_starts_at']);$c=ww_qr_bingo_scanner_config($c);echo json_encode(array('floor'=>$c['scan_history_starts_at'],'before'=>ww_qr_bingo_duplicate_scan_floor($c,strtotime('2026-10-18T14:59:59Z')),'show'=>ww_qr_bingo_duplicate_scan_floor($c,strtotime('2026-10-18T15:00:00Z'))));`);
  assert.equal(result.floor, config.scan_history_starts_at);
  assert.equal(result.before, Date.parse(config.scan_history_starts_at) / 1000); assert.equal(result.show, Date.parse(config.history_starts_at) / 1000);
  assert.match(website, /\$eventHistoryStartsAt = \(string\)\$eventConfig\['scan_history_starts_at_sql'\]/);
  assert.match(website, /ww_qr_bingo_duplicate_scan_floor\(\$eventConfig, \$scanRequestTime\)/);
  assert.match(website, /scan_date >= '\$duplicateFloor'/);
  const draw = section(website, "if ($_POST['action'] === 'raffle_offer' ||", "if ($_POST['action'] === 'scan_vendor')");
  assert.match(draw, /ww_qr_bingo_scan_window_open\(\$eventConfig, time\(\)/); assert.match(draw, /vendor_draw_window_closed/);
});

test('admin posts only early-open boolean, preserves show/draw times, and rejects computed schedule injection', () => {
  const validators = section(admin, '    function ww_qrbs_text_length(', '    function ww_qrbs_validate_calendar_date(');
  const input = { csrf_token: 'offline', action: 'publish', expected_revision: '12', event_name: 'Niagara Wedding Show', venue_name: 'Americana Resort', vendor_tag_id: '30', history_starts_at: '2026-10-18T11:00:00', app_card_enabled: '1', scan_enabled: '1', vendor_draws_enabled: '1', email_delivery_mode: 'disabled', vendor_notice_title: 'Vendor notice', couple_notice_title: 'Couple notice', rules_version: 'current-rules', official_rules_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules', alternate_free_entry_url: 'https://www.weddingwin.ca/qr-bingo-free-entry', eligibility_region: 'Ontario', draw_opens_at: '2026-10-18T15:00:00', entry_closes_at: '2026-10-18T15:00:00', draw_at: '2026-10-18T16:00:00' };
  const cases = [input, { ...input, scan_open_early: '1' }, { ...input, scan_open_early: 'true' }, { ...input, scan_opens_at: '2026-09-08T00:00:00Z' }, { ...input, scan_history_starts_at: '2000-01-01T00:00:00Z' }, { ...input, scan_early_access_starts_at: '2000-01-01T00:00:00Z' }];
  const result = php(`${validators}$cases=json_decode(base64_decode('${b64(JSON.stringify(cases))}'),true);$r=array();foreach($cases as $c){$r[]=ww_qrbs_validate_publish($c);}echo json_encode($r);`);
  assert.equal(result[0].ok, true, JSON.stringify(result[0].errors)); assert.equal(result[1].ok, true, JSON.stringify(result[1].errors));
  assert.equal(result[0].config.scan_open_early, false); assert.equal(result[1].config.scan_open_early, true);
  for (const key of ['history_starts_at', 'entry_closes_at', 'draw_opens_at', 'draw_at']) assert.equal(result[0].config[key], result[1].config[key]);
  for (const invalid of result.slice(2)) assert.equal(invalid.ok, false);
  assert.match(admin, /<strong>Open scanner early<\/strong>/); assert.match(admin, /midnight on the wedding show date, Toronto time/);
  assert.match(admin, /name="scan_open_early" type="checkbox" value="1"/);
});

function node() { const classes = new Set(); return { disabled: false, hidden: false, textContent: '', title: '', value: 'Preserve my typed details', classList: { contains: value => classes.has(value), add: value => classes.add(value), remove: value => classes.delete(value) } }; }
function browser({ config = canonical(), now = '2026-10-18T03:59:59Z', fixture = false, notice = true, complete = true, respond, held = false } = {}) {
  const nodes = Object.fromEntries(['qrScannerAvailability', 'qrScannerRefreshNotice', 'vendor-draw-review-707'].map(id => [id, node()]));
  const controls = Object.fromEntries(['startBtn', 'stopBtn', 'mobileStartBtn', 'mobileStopBtn', 'cameraLoading'].map(id => [id, node()]));
  const requests = [], intervals = [], timers = [], listeners = {}; let clock = Date.parse(now), stops = 0, loads = 0, release;
  const ready = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({
    ...controls, EVENT_CONFIG: { ...config }, QR_SCANNER_FIXTURE: fixture, CONTACT_PROFILE_COMPLETE: complete, inShowScanned: new Set(), vendorDrawScanned: new Set(), VENDORS: [{ id: '707' }], stream: null, vendorScanRequests: new Map(), vendorDrawOfferInFlight: false, vendorDrawEntryInFlight: false, qrFixtureScanInFlight: false,
    Date: TestDate, AbortController, hasCurrentParticipationNotice: () => notice,
    document: { hidden: false, getElementById: id => nodes[id] || null, addEventListener: (type, fn) => { listeners[type] = fn; } },
    stopScanner: () => { stops++; context.stream = null; }, updateVendorDrawEntryButton() {}, updateFixtureScanButton() {},
    formatPromotionDate: value => value, trustedVendorOfferVersion: value => typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value)) ? value : '',
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {}, setInterval: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    loadScannedVendors: () => { loads++; }, fetch: async (url, options) => { requests.push({ url, options }); await ready; return respond ? respond() : { ok: true, text: async () => JSON.stringify({ event_config: config }) }; },
  });
  vm.runInContext(webHelpers, context);
  return { nodes, controls, context, requests, intervals, timers, listeners, run: text => vm.runInContext(text, context), setTime: iso => { clock = Date.parse(iso); }, release: () => release?.(), stops: () => stops, loads: () => loads };
}

test('midnight makes an already-open website scanner manually available without camera, agreement, reload or contact changes', () => {
  const f = browser(); f.run('initializeWebsiteScannerPolling()');
  assert.equal(f.controls.startBtn.disabled, true); assert.equal(f.context.EVENT_CONFIG.show_scan_window_open, false);
  f.setTime('2026-10-18T04:00:00Z'); f.run('syncWebsiteScannerAvailability()');
  assert.equal(f.controls.startBtn.disabled, false); assert.equal(f.controls.startBtn.textContent, 'Start Scanner');
  assert.equal(f.context.EVENT_CONFIG.show_scan_window_open, true); assert.equal(f.requests.length, 0);
  assert.equal(f.controls.startBtn.value, 'Preserve my typed details'); assert.equal(f.intervals[0].delay, 30000);
  assert.doesNotMatch(webHelpers, /getUserMedia|startScanner\(|\.checked\s*=|location[.]|scrollIntoView|[.]focus\(/);
  const noAgreement = browser({ notice: false, now: '2026-10-18T04:00:00Z' }); noAgreement.run('syncWebsiteScannerAvailability()'); assert.equal(noAgreement.controls.startBtn.disabled, true);
});

test('enabled vendor draws can be reviewed during early scanner access only with authoritative QR proof', () => {
  const f = browser({ config: { ...canonical(), scan_open_early: true } }); f.run('syncWebsiteScannerAvailability()');
  assert.equal(f.run('isWebsiteScannerWindowOpen()'), true); assert.equal(f.run('isWebsiteDrawWindowOpen()'), true);
  assert.equal(f.run("canReviewVendorDraw('707')"), false);
  f.context.vendorDrawScanned.add('707'); f.run('syncWebsiteScannerAvailability()');
  assert.equal(f.run("canReviewVendorDraw('707')"), true); assert.equal(f.nodes['vendor-draw-review-707'].hidden, false);
  f.context.EVENT_CONFIG.vendor_draws_enabled = false; assert.equal(f.run("canReviewVendorDraw('707')"), false);
  f.context.EVENT_CONFIG.vendor_draws_enabled = true; f.context.EVENT_CONFIG.scan_enabled = false; assert.equal(f.run("canReviewVendorDraw('707')"), false);
  f.context.EVENT_CONFIG.scan_enabled = true; f.setTime('2026-10-18T19:00:00Z'); f.run('syncWebsiteScannerAvailability()'); assert.equal(f.run("canReviewVendorDraw('707')"), false); assert.equal(f.controls.startBtn.disabled, true);
});

test('master pause stops an active camera and overrides early access and private fixtures', () => {
  for (const fixture of [false, true]) {
    const f = browser({ config: { ...canonical(), scan_open_early: true }, fixture }); f.context.stream = {}; f.context.EVENT_CONFIG.scan_enabled = false;
    f.run('syncWebsiteScannerAvailability()'); assert.equal(f.stops(), 1); assert.equal(f.controls.startBtn.disabled, true); assert.equal(f.run('isWebsiteScannerWindowOpen()'), false);
  }
});

test('public config polling applies safe early toggle and revision only, with no overlap or hidden-page requests', async () => {
  const next = { ...canonical(), revision: 13, scan_open_early: true, scan_history_starts_at: '2026-09-08T17:00:00Z' };
  const f = browser({ held: true, respond: () => ({ ok: true, text: async () => JSON.stringify({ event_config: next }) }) });
  f.run('refreshWebsiteScannerConfig()'); f.run('refreshWebsiteScannerConfig()'); assert.equal(f.requests.length, 1);
  f.release(); await flush(); assert.equal(f.context.EVENT_CONFIG.revision, 13); assert.equal(f.context.EVENT_CONFIG.scan_open_early, true); assert.equal(f.loads(), 1);
  assert.equal(f.controls.startBtn.disabled, false); assert.equal(f.context.EVENT_CONFIG.history_starts_at, canonical().history_starts_at);
  assert.equal(f.requests[0].options.method, 'GET'); assert.equal(f.requests[0].options.credentials, 'omit'); assert.equal(f.requests[0].options.cache, 'no-store');
  assert.match(f.requests[0].url, /action=public_config$/);
  f.context.document.hidden = true; f.run('refreshWebsiteScannerConfig()'); await flush(); assert.equal(f.requests.length, 1);
});

test('bad/missing config pauses scanning without clearing entries; changed event/rules/tag requires manual refresh', async () => {
  for (const next of [{ ...canonical(), scan_open_early: 'true' }, { ...canonical(), scan_opens_at: undefined }, { ...canonical(), revision: 11 }]) {
    const f = browser({ config: { ...canonical(), scan_open_early: true }, respond: () => ({ ok: true, text: async () => JSON.stringify({ event_config: next }) }) });
    f.context.stream = {}; await f.run('refreshWebsiteScannerConfig()');
    assert.equal(f.controls.startBtn.disabled, true); assert.equal(f.stops(), 1); assert.match(f.nodes.qrScannerAvailability.textContent, /could not be checked/);
    assert.equal(f.controls.startBtn.value, 'Preserve my typed details');
  }
  for (const changed of [{ event_key: 'new-event' }, { vendor_tag_id: 31 }, { rules_version: 'new-rules' }, { history_starts_at: '2026-10-18T16:00:00Z' }]) {
    const f = browser({ respond: () => ({ ok: true, text: async () => JSON.stringify({ event_config: { ...canonical(), ...changed, revision: 13 } }) }) });
    await f.run('refreshWebsiteScannerConfig()'); assert.equal(f.nodes.qrScannerRefreshNotice.hidden, false); assert.equal(f.controls.startBtn.disabled, true); assert.equal(f.context.EVENT_CONFIG.revision, 12);
  }
});

test('actual markScanned retries missing draw proof and deduplicates confirmed scans', async () => {
  const f = browser({ config: { ...canonical(), scan_open_early: true } }); let saves = 0;
  f.context.scanned = new Set(['707']); f.context.document.getElementById = () => null;
  f.context.saveVendorScan = async id => { saves++; f.context.vendorDrawScanned.add(id); return true; }; f.context.updateProgress = () => {};
  vm.runInContext(section(website, '    async function markScanned(id)', '    function updateProgress()'), f.context);
  assert.equal(await f.run("markScanned('707')"), true); assert.equal(saves, 1);
  f.setTime('2026-10-18T15:00:00Z'); await Promise.all([f.run("markScanned('707')"), f.run("markScanned('707')")]);
  assert.equal(saves, 1); assert.equal(f.context.vendorDrawScanned.has('707'), true); assert.equal(f.context.inShowScanned.has('707'), false);
  await f.run("markScanned('707')"); assert.equal(saves, 1);
  const save = section(website, '    async function saveVendorScan(', '    async function loadScannedVendors()');
  assert.match(save, /data[.]vendor_draw_scan === true/);
  const render = section(website, '    function renderGrid()', '    async function markScanned(id)');
  assert.match(render, /drawButton.hidden = !canReviewVendorDraw\(v.id\)/);
});

test('new scanner helpers contain no stripping-sensitive backslashes and complete PHP and scanner JavaScript parse', () => {
  assert.equal(webHelpers.includes('\\'), false);
  assert.equal(section(website, '/* WW_QR_SCANNER_WINDOW_HELPERS_START */', '/* WW_QR_SCANNER_WINDOW_HELPERS_END */').includes('\\'), false);
  assert.doesNotThrow(() => new vm.Script(section(website, '    // --- State Management ---', '  </script>'), { filename: 'widget258-complete-scanner.js' }));
  const result = php(`$files=json_decode(base64_decode('${b64(JSON.stringify([website, admin]))}'),true);$ok=array();foreach($files as $source){try{token_get_all($source,TOKEN_PARSE);$ok[]=true;}catch(ParseError $error){$ok[]=$error->getMessage();}}echo json_encode($ok);`);
  assert.deepEqual(result, [true, true]);
});
