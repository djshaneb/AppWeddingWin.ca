// Member IDs 90001/90002 are synthetic offline fixture identifiers.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const qr = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php', import.meta.url), 'utf8');
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, start);
  return source.slice(from + start.length, to);
};
const contactJs = readFileSync(new URL('../brilliant-directories/widgets/258-qr-bingo-contact-form.js', import.meta.url), 'utf8');
const adminJs = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings-data.js', import.meta.url), 'utf8');
const b64 = value => Buffer.from(value).toString('base64');
function php(code) {
  return JSON.parse(execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', code], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  }));
}

class Node {
  constructor(id = '') { this.id = id; this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.open = false; this.children = []; this.listeners = {}; this.dataset = {}; }
  addEventListener(type, fn) { this.listeners[type] = fn; this.listenerCount = (this.listenerCount || 0) + 1; }
  trigger(type) { return this.listeners[type]?.({ preventDefault() {} }); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  focus() { this.focused = true; }
  blur() { this.blurred = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  setAttribute(name, value) { this[name] = value; }
  remove() {}
  click() { this.clicked = true; }
  reportValidity() { return true; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function dom(ids) {
  const nodes = Object.fromEntries(ids.map(id => [id, new Node(id)]));
  const created = [];
  const document = {
    getElementById: id => nodes[id] || null, activeElement: new Node('active'), body: new Node('body'),
    createElement: tag => { const node = new Node(tag); created.push(node); return node; },
  };
  return { nodes, document, created };
}
function contactFixture({ ok = true, statusCode = 200, code = '', held = false, malformedJson = false, weddingDate = '2027-10-18', weddingVenue = '' } = {}) {
  const d = dom(['qrContactForm', 'qrContactGate', 'qrContactSave', 'qrContactStatus', 'qrContactDateOpen', 'qrContactDateDialog', 'qrContactDatePicker', 'qrContactDateClose', 'qrContactDateClear', 'qrContactDateUnsure', 'qrContactEdit', 'qrContactName', 'qrContactEmail', 'qrContactPhone', 'qrScannerExperience', 'qrContactReload', 'qrContactVenueGroup', 'qrContactVenue']);
  const { nodes } = d;
  // Exercise missing HTML values without relying on browser DOM introspection.
  nodes.qrContactForm.querySelectorAll = () => [nodes.qrContactName, nodes.qrContactEmail, nodes.qrContactPhone, nodes.qrContactVenue, nodes.qrContactSave, nodes.qrContactDateOpen, nodes.qrContactDateUnsure, nodes.qrContactReload];
  const requests = []; let reloads = 0, release;
  const ready = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const context = vm.createContext({
    document: d.document, URLSearchParams, AbortController, Error, setTimeout: () => 1, clearTimeout() {},
    QR_CONTACT_PROFILE: { event_key: 'private-event', version: 2, name: 'Test Couple', email: 'contact@example.invalid', phone: '5551234567', wedding_date: weddingDate, wedding_venue: weddingVenue },
    EVENT_CONFIG: { event_key: 'published-event', revision: 5 }, QR_WEBSITE_CSRF: 'offline-csrf',
    stopScanner() {}, window: { location: { reload() { reloads++; } } },
    fetch: async (url, request) => { requests.push({ url, request, fields: Object.fromEntries(new URLSearchParams(request.body)) }); await ready; return { ok: statusCode < 400, status: statusCode, json: async () => { if (malformedJson) throw new SyntaxError('Unexpected token <style>'); return { ok, profile_complete: ok, code, error: 'Synthetic failure' }; } }; },
  });
  vm.runInContext(contactJs, context);
  return { ...d, requests, release: () => release?.(), reloads: () => reloads, initializeAgain: () => vm.runInContext(contactJs, context) };
}

test('website asks for both partners first names and sends them intact', async () => {
  assert.match(qr, /<label for="qrContactName">Your name &amp; your partner’s name<\/label>/);
  assert.match(qr, /id="qrContactNameHint">First names are fine\.<\/p>/);
  assert.match(qr, /aria-describedby="qrContactNameHint"/);
  for (const name of ['Alex & Jamie', 'Sam and Jo', 'Renée & María-José']) {
    const f = contactFixture();
    f.nodes.qrContactName.value = name;
    await f.nodes.qrContactForm.trigger('submit');
    assert.equal(f.requests[0].fields.name, name);
    assert.equal(f.reloads(), 1);
  }
});

test('contact script safely initializes once when both direct route and BD field emit it', () => {
  const f = contactFixture();
  const count = f.nodes.qrContactForm.listenerCount;
  f.initializeAgain();
  assert.equal(f.nodes.qrContactForm.listenerCount, count);
  assert.equal(f.nodes.qrContactForm.dataset.qrContactInitialized, '1');
});

test('contact JSON prefills survive stripped HTML values and later script emission preserves typed edits', () => {
  const f = contactFixture({ weddingVenue: 'Test Garden Hall' });
  assert.equal(f.nodes.qrContactName.value, 'Test Couple');
  assert.equal(f.nodes.qrContactEmail.value, 'contact@example.invalid');
  assert.equal(f.nodes.qrContactPhone.value, '5551234567');
  assert.equal(f.nodes.qrContactVenue.value, 'Test Garden Hall');
  f.nodes.qrContactEmail.value = 'edited@example.invalid';
  f.nodes.qrContactPhone.value = '5559876543';
  f.nodes.qrContactVenue.value = 'New Draft Venue';
  f.initializeAgain();
  assert.equal(f.nodes.qrContactEmail.value, 'edited@example.invalid');
  assert.equal(f.nodes.qrContactPhone.value, '5559876543');
  assert.equal(f.nodes.qrContactVenue.value, 'New Draft Venue');
  const config = qr.split('const QR_CONTACT_PROFILE = ')[1].split('const PARTICIPATION_NOTICE_VERSION')[0];
  for (const key of ['name', 'email', 'phone', 'wedding_venue']) assert(config.includes("'" + key + "' => $qrContactFields['" + key + "']"));
  assert.match(config, /JSON_HEX_TAG \| JSON_HEX_AMP \| JSON_HEX_QUOT \| JSON_HEX_APOS/);
});

test('website QR form saves only scoped Bingo contacts and blocks duplicate taps', async () => {
  const f = contactFixture({ held: true });
  const first = f.nodes.qrContactForm.trigger('submit');
  await f.nodes.qrContactForm.trigger('submit');
  assert.equal(f.requests.length, 1);
  assert.equal(f.nodes.qrContactName.disabled, true);
  assert.equal(f.nodes.qrContactEmail.disabled, true);
  assert.equal(f.nodes.qrContactPhone.disabled, true);
  assert.equal(f.nodes.qrContactVenue.disabled, true);
  const { fields, request } = f.requests[0];
  assert.equal(fields.action, 'contact_profile_save');
  assert.equal(fields.contact_event_key, 'private-event');
  assert.equal(fields.expected_event_key, 'published-event');
  assert.equal(fields.expected_version, '2');
  assert.equal(fields.email, 'contact@example.invalid');
  assert.equal(fields.phone, '5551234567');
  assert.equal(fields.wedding_date, '2027-10-18');
  assert.equal(fields.wedding_venue, '');
  assert.equal(request.credentials, 'same-origin');
  assert.equal(Object.hasOwn(fields, 'user_id'), false);
  assert.equal(Object.hasOwn(fields, 'native_session'), false);
  f.release(); await first;
  assert.equal(f.reloads(), 1);
});

test('QR relay email is rejected locally without invoking account-email verification', async () => {
  const f = contactFixture();
  f.nodes.qrContactEmail.value = 'relay@privaterelay.appleid.com';
  await f.nodes.qrContactForm.trigger('submit');
  assert.equal(f.requests.length, 0);
  assert.match(f.nodes.qrContactStatus.textContent, /vendors can contact/);
  assert.doesNotMatch(contactJs, /verify-email-change|email_confirmation_required|password|native_session/);
});

test('calendar X and cancel preserve date, while selection and Clear change only wedding date', async () => {
  const f = contactFixture();
  const n = f.nodes;
  n.qrContactDateOpen.trigger('click');
  assert.equal(f.document.activeElement.blurred, true);
  assert.equal(n.qrContactDateDialog.open, true);
  n.qrContactDatePicker.value = '2028-02-29'; n.qrContactDateClose.trigger('click');
  assert.equal(n.qrContactDateOpen.textContent, '📅 October 18, 2027');
  n.qrContactDateOpen.trigger('click'); n.qrContactDateDialog.trigger('cancel');
  assert.equal(n.qrContactDateOpen.textContent, '📅 October 18, 2027');
  n.qrContactDateOpen.trigger('click'); n.qrContactDatePicker.value = '2028-02-29'; n.qrContactDatePicker.trigger('change');
  assert.equal(n.qrContactDateOpen.textContent, '📅 February 29, 2028');
  assert.equal(n.qrContactDateDialog.open, false);
  n.qrContactDateClear.trigger('click');
  await n.qrContactForm.trigger('submit');
  assert.equal(f.requests[0].fields.wedding_date, '');
  assert.equal(f.requests[0].fields.phone, '5551234567');
});

test('optional venue appears only after selecting a date and is sent with the QR contacts', async () => {
  const f = contactFixture({ weddingDate: '', weddingVenue: 'Stale hidden venue' });
  const n = f.nodes;
  assert.equal(n.qrContactVenueGroup.hidden, true);
  assert.equal(n.qrContactVenue.value, '');
  n.qrContactDateOpen.trigger('click'); n.qrContactDatePicker.value = '2028-02-29'; n.qrContactDatePicker.trigger('change');
  assert.equal(n.qrContactVenueGroup.hidden, false);
  n.qrContactVenue.value = '  Test Garden Hall  ';
  await n.qrContactForm.trigger('submit');
  assert.equal(f.requests[0].fields.wedding_venue, 'Test Garden Hall');
  assert.equal(f.requests[0].fields.wedding_date, '2028-02-29');
  assert.equal(f.requests[0].fields.phone, '5551234567');
});

test('calendar dismiss keeps venue, but clearing the date clears and hides venue without touching phone', async () => {
  const f = contactFixture({ weddingVenue: 'Test Garden Hall' });
  const n = f.nodes;
  assert.equal(n.qrContactVenueGroup.hidden, false);
  n.qrContactDateOpen.trigger('click'); n.qrContactDatePicker.value = ''; n.qrContactDateClose.trigger('click');
  assert.equal(n.qrContactVenue.value, 'Test Garden Hall');
  n.qrContactDateOpen.trigger('click'); n.qrContactDateDialog.trigger('cancel');
  assert.equal(n.qrContactVenue.value, 'Test Garden Hall');
  n.qrContactDateClear.trigger('click');
  assert.equal(n.qrContactVenueGroup.hidden, true);
  assert.equal(n.qrContactVenue.value, '');
  await n.qrContactForm.trigger('submit');
  assert.equal(f.requests[0].fields.wedding_venue, '');
  assert.equal(f.requests[0].fields.wedding_date, '');
  assert.equal(f.requests[0].fields.phone, '5551234567');
});

test('Not sure yet closes the calendar and submits empty date and venue, with phone unchanged', async () => {
  const f = contactFixture({ weddingVenue: 'Test Garden Hall' });
  const n = f.nodes;
  n.qrContactDateOpen.trigger('click');
  n.qrContactDateUnsure.trigger('click');
  assert.equal(n.qrContactDateDialog.open, false);
  assert.equal(n.qrContactVenueGroup.hidden, true);
  assert.equal(n.qrContactVenue.value, '');
  assert.equal(n.qrContactDateOpen.textContent, '📅 Choose wedding date');
  await n.qrContactForm.trigger('submit');
  assert.equal(f.requests[0].fields.wedding_date, '');
  assert.equal(f.requests[0].fields.wedding_venue, '');
  assert.equal(f.requests[0].fields.phone, '5551234567');
  const busy = contactFixture({ held: true, weddingVenue: 'Keep this venue' });
  const pending = busy.nodes.qrContactForm.trigger('submit');
  assert.equal(busy.nodes.qrContactDateUnsure.disabled, true);
  busy.nodes.qrContactDateUnsure.trigger('click');
  assert.equal(busy.nodes.qrContactVenue.value, 'Keep this venue');
  busy.release(); await pending;
});

test('failed or conflicting QR contact saves preserve the form and allow retry', async () => {
  for (const statusCode of [409, 503]) {
    const f = contactFixture({ ok: false, statusCode });
    await f.nodes.qrContactForm.trigger('submit');
    assert.equal(f.reloads(), 0);
    assert.equal(f.nodes.qrContactSave.disabled, false);
    assert.equal(f.nodes.qrContactEmail.disabled, false);
    if (statusCode === 409) assert.equal(f.nodes.qrContactReload.hidden, false);
    assert.equal(f.nodes.qrContactEmail.value, 'contact@example.invalid');
    await f.nodes.qrContactForm.trigger('submit');
    assert.equal(f.requests.length, 2);
  }
});

test('committed QR contacts with pending date sync offer an explicit refresh without an automatic retry', async () => {
  const f = contactFixture({ ok: false, statusCode: 503, code: 'contact_date_sync_pending' });
  await f.nodes.qrContactForm.trigger('submit');
  assert.equal(f.reloads(), 0);
  assert.equal(f.requests.length, 1);
  assert.equal(f.nodes.qrContactEmail.value, 'contact@example.invalid');
  assert.equal(f.nodes.qrContactReload.hidden, false);
  assert.match(f.nodes.qrContactStatus.textContent, /details were saved[.] Refresh contact details/);
  f.nodes.qrContactReload.trigger('click');
  assert.equal(f.reloads(), 1);
  assert.equal(f.requests.length, 1);
});

test('malformed save replies offer refresh and never retry a potentially committed mutation automatically', async () => {
  const f = contactFixture({ malformedJson: true });
  await f.nodes.qrContactForm.trigger('submit');
  assert.equal(f.requests.length, 1);
  assert.equal(f.reloads(), 0);
  assert.equal(f.nodes.qrContactReload.hidden, false);
  assert.match(f.nodes.qrContactStatus.textContent, /save could not be confirmed[.] Refresh contact details/);
  assert.doesNotMatch(f.nodes.qrContactStatus.textContent, /Unexpected token|style/);
  assert.equal(f.nodes.qrContactEmail.value, 'contact@example.invalid');
});

test('QR transport preserves roster/history and still gates scans and opt-ins behind contacts and terms', () => {
  const profile = section(qr, "if (!function_exists('ww_qr_bingo_contact_profile'))", "if (!function_exists('ww_qr_bingo_fixture_context'))");
  assert.match(profile, /contact_profile_get/);
  assert.doesNotMatch(profile, /ww_email_verification_state\(|ww_ev_user\(|UPDATE users_data|mail\(/);
  assert.match(qr, /array\('fixture_context', 'contact_profile_get', 'contact_profile_save', 'scan', 'raffle_offer', 'raffle_opt_in'\)/);
  assert.match(qr, /array\('scan_vendor', 'raffle_offer', 'raffle_opt_in'\), true\)\s*&& !\$qrContactComplete/);
  assert.match(qr, /code' => 'participation_notice_required'/);
  assert.match(qr, /if \(\$_POST\['action'\] === 'get_scanned'\)/);
  assert.match(qr, /const VENDORS =/);
  assert.match(qr, /if \(!hasCurrentParticipationNotice\(\)\)/);
  assert.match(qr, /© <\?php echo date\('Y'\); \?> Wedding Win Inc[.]/);
  assert.match(qr, /aria-label="Close wedding date calendar"/);
  assert.match(qr, /id="qrContactDatePicker" type="date"/);
  assert.match(qr, /<label for="qrContactDateOpen">Wedding date<\/label>/);
  assert.match(qr, /id="qrContactDateUnsure"[^>]*>Not sure yet<\/button>/);
  for (const key of ['name', 'email', 'phone']) assert(qr.includes('name="ww_qr_contact_' + key + '"'));
  assert.match(qr, /<label for="qrContactVenue">Wedding venue<\/label>/);
  assert.match(qr, /id="qrContactVenue" name="ww_qr_contact_venue"[^>]+maxlength="200"/);
});

function adminFixture({ response: supplied, held = false, respond } = {}) {
  const d = dom(['wwQrData', 'wwQrDataForm', 'wwQrDataStatus', 'wwQrDataHead', 'wwQrDataRows', 'wwQrDataPrevious', 'wwQrDataNext', 'wwQrDataEvent', 'wwQrDataVendor', 'wwQrDataSearch', 'wwQrDataOperator', 'wwQrDataExport', 'wwQrDataScanNote', 'wwQrDataContactStatus', 'wwQrDataContactStatusGroup', 'wwQrContactPanel', 'wwQrContactAddForm', 'wwQrContactStatus', 'wwQrContactMatches', 'wwQrContactConfirm', 'wwQrContactConfirmAction', 'wwQrContactConfirmMessage', 'wwQrContactConfirmCancel', 'wwQrContactAddOpen', 'wwQrContactEvent', 'wwQrContactLookupForm', 'wwQrContactLookup', 'wwQrContactChosen', 'wwQrContactName', 'wwQrContactEmail', 'wwQrContactPhone', 'wwQrContactDate', 'wwQrContactVenue', 'wwQrContactVenueGroup', 'wwQrContactCancel', 'token']);
  const n = d.nodes;
  n.wwQrDataEvent.value = 'published-event'; n.wwQrDataOperator.value = 'Test Admin'; n.token.value = 'offline-csrf';
  n.wwQrDataContactStatus.value = 'active'; n.wwQrContactPanel.hidden = true; n.wwQrContactAddForm.hidden = true; n.wwQrContactConfirm.hidden = true;
  n.wwQrDataForm.action = 'https://ww2.managemydirectory.com/admin/go.php?widget=ww_qr_bingo_settings';
  n.wwQrDataForm.querySelector = () => n.token;
  const tabs = ['contacts', 'scans', 'entries', 'winners'].map(dataset => { const node = new Node(dataset); node.dataset.dataset = dataset; return node; });
  n.wwQrData.querySelectorAll = selector => selector === '[data-dataset]' ? tabs : [...Object.values(n), ...tabs];
  const requests = [], blobs = []; let release, requestIds = 0;
  const ready = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const context = vm.createContext({
    document: d.document, URLSearchParams, AbortController, Error, setTimeout: () => 1, clearTimeout() {},
    URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:offline'; }, revokeObjectURL() {} },
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++requestIds).padStart(12, '0') },
    fetch: async (url, request) => {
      const fields = Object.fromEntries(new URLSearchParams(request.body)); requests.push({ url, request, fields }); await ready;
      if (respond) { const response = await respond(fields, requests.length); if (response) return response; }
      const result = supplied || (fields.ww_qrbs_form_action === 'contact_lookup'
        ? { ok: true, members: [{ couple_id: '90002', name: 'Alex & Jamie', email: 'couple@example.invalid' }] }
        : fields.ww_qrbs_form_action.startsWith('contact_')
          ? { ok: true, action: fields.ww_qrbs_form_action, dataset: 'contacts', event_key: fields.event_key, couple_id: fields.couple_id, request_id: fields.request_id, version: Number(fields.expected_version) + 1, removed: fields.ww_qrbs_form_action === 'contact_remove' }
          : { ok: true, dataset: fields.dataset, event_key: fields.event_key, contact_status: fields.contact_status, columns: [{ key: 'name', label: 'Name' }], rows: [{ couple_id: '90002', name: '<img src=x onerror=bad()>', version: 2, removed: fields.contact_status === 'removed' }], total: 51, page: Number(fields.page), page_size: 50, has_more: fields.page === '1' });
      return { ok: true, status: 200, json: async () => result };
    },
  });
  vm.runInContext(adminJs, context);
  return { ...d, tabs, requests, blobs, release: () => release?.(), initializeAgain: () => vm.runInContext(adminJs, context) };
}

test('admin data script safely initializes once when the direct route and BD both emit it', () => {
  const f = adminFixture();
  const count = f.nodes.wwQrDataForm.listenerCount;
  f.initializeAgain();
  assert.equal(f.nodes.wwQrDataForm.listenerCount, count);
  assert.equal(f.nodes.wwQrDataForm.dataset.qrDataInitialized, '1');
});

test('admin uses only authenticated same-origin proxy and renders untrusted record text literally', async () => {
  const f = adminFixture();
  f.nodes.wwQrDataForm.trigger('submit'); await flush();
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].url, /\/admin\/go.php\?widget=ww_qr_bingo_settings$/);
  assert.equal(f.requests[0].request.credentials, 'same-origin');
  assert.equal(f.requests[0].fields.ww_qrbs_form_action, 'data_list');
  assert.equal(f.requests[0].fields.page_size, '50');
  assert.equal(f.nodes.wwQrDataHead.children[0].children[0].textContent, 'Actions');
  assert.equal(f.nodes.wwQrDataRows.children[0].children[0].children[0].textContent, 'Remove');
  assert.equal(f.nodes.wwQrDataRows.children[0].children[1].textContent, '<img src=x onerror=bad()>');
  assert.doesNotMatch(adminJs, /innerHTML|service_role|supabase[.]co/);
});

test('admin rapid tabs and downloads cannot overlap an active request; paging is bounded', async () => {
  const f = adminFixture({ held: true });
  f.nodes.wwQrDataForm.trigger('submit'); f.tabs[1].trigger('click'); f.nodes.wwQrDataExport.trigger('click');
  assert.equal(f.requests.length, 1);
  f.release(); await flush();
  f.nodes.wwQrDataNext.trigger('click'); await flush();
  assert.equal(f.requests[1].fields.page, '2');
  assert.equal(f.nodes.wwQrDataNext.disabled, true);
});

test('admin filter changes clear stale rows and changing tabs uses the chosen dataset', async () => {
  const f = adminFixture();
  f.nodes.wwQrDataForm.trigger('submit'); await flush();
  f.nodes.wwQrDataSearch.value = 'Couple'; f.nodes.wwQrDataSearch.trigger('input');
  assert.equal(f.nodes.wwQrDataRows.children.length, 0);
  f.tabs[1].trigger('click'); await flush();
  assert.equal(f.requests.at(-1).fields.dataset, 'scans');
  assert.equal(f.requests.at(-1).fields.search, 'Couple');
  assert.equal(f.nodes.wwQrDataScanNote.hidden, false);
});

test('admin CSV requires operator identity and verified filtered response before downloading', async () => {
  const f = adminFixture({ response: { ok: true, dataset: 'contacts', event_key: 'published-event', contact_status: 'active', report: { filename: 'contacts.csv', mime_type: 'text/csv;charset=utf-8', csv: '"Name"', row_count: 1 } } });
  f.nodes.wwQrDataOperator.value = ''; f.nodes.wwQrDataExport.trigger('click'); await flush();
  assert.equal(f.requests.length, 0);
  f.nodes.wwQrDataOperator.value = 'Test Admin'; f.nodes.wwQrDataExport.trigger('click'); await flush();
  assert.equal(f.requests[0].fields.ww_qrbs_form_action, 'data_export');
  assert.equal(f.blobs.length, 1);
  assert(f.created.some(node => node.download === 'contacts.csv' && node.clicked));
  const mismatch = adminFixture({ response: { ok: true, dataset: 'winners', event_key: 'published-event' } });
  mismatch.nodes.wwQrDataExport.trigger('click'); await flush();
  assert.equal(mismatch.blobs.length, 0);
  assert.match(mismatch.nodes.wwQrDataStatus.textContent, /did not match/);
});

test('admin CSV downloads contain exactly one BOM for both local scans and backend reports', async () => {
  for (const csv of ['"Name"', '\uFEFF"Name"']) {
    const f = adminFixture({ response: { ok: true, dataset: 'contacts', event_key: 'published-event', contact_status: 'active', report: { filename: 'contacts.csv', mime_type: 'text/csv;charset=utf-8', csv, row_count: 1 } } });
    f.nodes.wwQrDataExport.trigger('click'); await flush();
    assert.equal(f.blobs.length, 1);
    assert.equal(f.blobs[0].parts.join(''), '\uFEFF"Name"');
  }
});

async function chooseAdminContact(f) {
  const n = f.nodes;
  n.wwQrContactAddOpen.trigger('click'); n.wwQrContactLookup.value = 'Alex';
  n.wwQrContactLookupForm.trigger('submit'); await flush();
  n.wwQrContactMatches.children[0].children[1].trigger('click');
  n.wwQrContactPhone.value = '289-555-0123';
}
function adminRowButton(f) { return f.nodes.wwQrDataRows.children[0].children[0].children[0]; }
const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('admin Add opens an existing-couple lookup, bounds search and sends only its approved fields', async () => {
  const f = adminFixture(), n = f.nodes;
  n.wwQrContactAddOpen.trigger('click');
  assert.equal(n.wwQrContactPanel.hidden, false);
  assert.equal(n.wwQrContactEvent.textContent, 'Event: published-event');
  n.wwQrContactLookup.value = 'a'; n.wwQrContactLookupForm.trigger('submit'); await flush();
  assert.equal(f.requests.length, 0);
  n.wwQrContactLookup.value = 'a'.repeat(121); n.wwQrContactLookupForm.trigger('submit'); await flush();
  assert.equal(f.requests.length, 0);
  n.wwQrContactLookup.value = 'Alex'; n.wwQrContactLookupForm.trigger('submit'); await flush();
  assert.deepEqual(f.requests[0].fields, { ww_qrbs_csrf_token: 'offline-csrf', ww_qrbs_form_action: 'contact_lookup', search: 'Alex' });
  assert.equal(n.wwQrContactAddForm.hidden, true);
  n.wwQrContactMatches.children[0].children[1].trigger('click');
  assert.equal(n.wwQrContactAddForm.hidden, false);
  assert.equal(n.wwQrContactName.value, 'Alex & Jamie');
  assert.equal(n.wwQrContactEmail.value, 'couple@example.invalid');
  n.wwQrContactCancel.trigger('click');
  assert.equal(n.wwQrContactPanel.hidden, true);
  assert.equal(f.requests.length, 1);
});

test('admin Add requires a chosen account and operator, preserves both names/date/venue, and creates no consent fields', async () => {
  const f = adminFixture(), n = f.nodes;
  n.wwQrContactAddForm.trigger('submit'); await flush(); assert.equal(f.requests.length, 0);
  await chooseAdminContact(f);
  n.wwQrDataOperator.value = ''; n.wwQrContactAddForm.trigger('submit'); await flush();
  assert.equal(f.requests.length, 1); assert.equal(n.wwQrDataOperator.focused, true);
  n.wwQrDataOperator.value = 'Test Admin'; n.wwQrContactDate.value = '2027-10-18'; n.wwQrContactDate.trigger('change');
  assert.equal(n.wwQrContactVenueGroup.hidden, false);
  n.wwQrContactVenue.value = 'Americana Resort'; n.wwQrContactAddForm.trigger('submit'); await flush();
  const added = f.requests[1].fields;
  assert.deepEqual(added, {
    ww_qrbs_csrf_token: 'offline-csrf', ww_qrbs_form_action: 'contact_add', dataset: 'contacts', event_key: 'published-event', couple_id: '90002', expected_version: '0', operator_identity: 'Test Admin',
    name: 'Alex & Jamie', email: 'couple@example.invalid', phone: '289-555-0123', wedding_date: '2027-10-18', wedding_venue: 'Americana Resort', request_id: '00000000-0000-4000-8000-000000000001',
  });
  assert.equal(n.wwQrContactPanel.hidden, true);
  assert.equal(f.requests[2].fields.ww_qrbs_form_action, 'data_list');
  assert.match(n.wwQrDataStatus.textContent, /Contact added/);
  assert.doesNotMatch(JSON.stringify(added), /consent|marketing|auth_token|password|user_id|vendor_id/);
});

test('admin blank wedding date sends no stale venue', async () => {
  const f = adminFixture(); await chooseAdminContact(f);
  f.nodes.wwQrContactVenue.value = 'Old venue'; f.nodes.wwQrContactDate.value = ''; f.nodes.wwQrContactDate.trigger('change');
  f.nodes.wwQrContactAddForm.trigger('submit'); await flush();
  assert.equal(f.requests[1].fields.wedding_date, ''); assert.equal(f.requests[1].fields.wedding_venue, '');
});

test('admin successful Add returns to unfiltered Active contacts on page one', async () => {
  const f = adminFixture(), n = f.nodes;
  n.wwQrDataVendor.value = '90001'; n.wwQrDataSearch.value = 'Other couple'; n.wwQrDataContactStatus.value = 'removed';
  n.wwQrDataForm.trigger('submit'); await flush();
  n.wwQrDataNext.trigger('click'); await flush();
  assert.equal(f.requests.at(-1).fields.page, '2');
  await chooseAdminContact(f); n.wwQrContactAddForm.trigger('submit'); await flush();
  assert.equal(n.wwQrDataVendor.value, ''); assert.equal(n.wwQrDataSearch.value, ''); assert.equal(n.wwQrDataContactStatus.value, 'active');
  const refreshed = f.requests.at(-1).fields;
  assert.equal(refreshed.ww_qrbs_form_action, 'data_list'); assert.equal(refreshed.page, '1');
  assert.equal(refreshed.vendor_id, ''); assert.equal(refreshed.search, ''); assert.equal(refreshed.contact_status, 'active');
});

test('admin failed or conflicting Add preserves current filters and page context', async () => {
  for (const status of [400, 409, 500]) {
    const f = adminFixture({ respond: fields => fields.ww_qrbs_form_action === 'contact_add' ? jsonResponse({ ok: false, error: 'Could not add contact' }, status) : undefined });
    const n = f.nodes;
    n.wwQrDataVendor.value = '90001'; n.wwQrDataSearch.value = 'Other couple'; n.wwQrDataContactStatus.value = 'removed';
    n.wwQrDataForm.trigger('submit'); await flush(); n.wwQrDataNext.trigger('click'); await flush();
    await chooseAdminContact(f); n.wwQrContactAddForm.trigger('submit'); await flush();
    assert.equal(n.wwQrDataVendor.value, '90001'); assert.equal(n.wwQrDataSearch.value, 'Other couple'); assert.equal(n.wwQrDataContactStatus.value, 'removed');
    assert.equal(n.wwQrContactName.value, 'Alex & Jamie'); assert.equal(n.wwQrContactPanel.hidden, false);
    if (status === 409) { const refreshed = f.requests.at(-1).fields; assert.equal(refreshed.page, '2'); assert.equal(refreshed.vendor_id, '90001'); assert.equal(refreshed.search, 'Other couple'); assert.equal(refreshed.contact_status, 'removed'); }
  }
});

test('admin removal is confirmed against exact member and event, Cancel writes nothing, and Restore uses removed row version', async () => {
  for (const removed of [false, true]) {
    const f = adminFixture(), n = f.nodes;
    n.wwQrDataContactStatus.value = removed ? 'removed' : 'active'; n.wwQrDataForm.trigger('submit'); await flush();
    adminRowButton(f).trigger('click');
    assert.equal(n.wwQrContactConfirm.hidden, false);
    assert.match(n.wwQrContactConfirmMessage.textContent, /member #90002/); assert.match(n.wwQrContactConfirmMessage.textContent, /published-event/);
    assert.equal(n.wwQrContactConfirmCancel.focused, true);
    n.wwQrContactConfirmCancel.trigger('click'); assert.equal(f.requests.length, 1);
    adminRowButton(f).trigger('click'); n.wwQrContactConfirmAction.trigger('click'); await flush();
    assert.deepEqual(f.requests[1].fields, { ww_qrbs_csrf_token: 'offline-csrf', ww_qrbs_form_action: removed ? 'contact_restore' : 'contact_remove', dataset: 'contacts', event_key: 'published-event', couple_id: '90002', expected_version: '2', operator_identity: 'Test Admin', request_id: '00000000-0000-4000-8000-000000000001' });
    assert.equal(n.wwQrContactConfirm.hidden, true);
    assert.equal(f.requests[2].fields.contact_status, removed ? 'removed' : 'active');
  }
});

test('admin malformed row identities, missing removal state and stale versions never receive action buttons', async () => {
  for (const record of [{ couple_id: '90002', version: 2 }, { couple_id: 'bad', version: 2, removed: false }, { couple_id: '1234567890123456789', version: 2, removed: false }, { couple_id: '90002', version: 0, removed: false }, { couple_id: '90002', version: '2', removed: false }]) {
    const f = adminFixture({ response: { ok: true, dataset: 'contacts', event_key: 'published-event', contact_status: 'active', columns: [{ key: 'couple_id', label: 'Member' }], rows: [record], page: 1, has_more: false, total: 1 } });
    f.nodes.wwQrDataForm.trigger('submit'); await flush();
    assert.equal(adminRowButton(f), undefined);
  }
});

test('admin rejects cross-list status and hides mutation controls on non-contact tabs', async () => {
  const f = adminFixture(); f.nodes.wwQrDataContactStatus.value = 'removed';
  f.nodes.wwQrDataForm.trigger('submit'); await flush(); assert.equal(f.requests[0].fields.contact_status, 'removed');
  f.tabs[1].trigger('click'); await flush();
  assert.equal(f.nodes.wwQrContactAddOpen.hidden, true); assert.equal(f.nodes.wwQrDataContactStatusGroup.hidden, true);
  assert.equal(f.requests[1].fields.contact_status, undefined);
  assert.equal(f.nodes.wwQrDataRows.children[0].children.length, 1);
  const mismatch = adminFixture({ response: { ok: true, dataset: 'contacts', event_key: 'published-event', contact_status: 'removed' } });
  mismatch.nodes.wwQrDataForm.trigger('submit'); await flush();
  assert.match(mismatch.nodes.wwQrDataStatus.textContent, /did not match/); assert.equal(mismatch.nodes.wwQrDataRows.children.length, 0);
});

test('admin rapid add taps and tabs stay locked; network retry reuses request UUID without clearing details', async () => {
  let release, attempts = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const f = adminFixture({ respond: async fields => {
    if (fields.ww_qrbs_form_action === 'contact_add' && ++attempts === 1) { await pending; throw new Error('Network interrupted'); }
  } });
  await chooseAdminContact(f); const n = f.nodes;
  n.wwQrContactAddForm.trigger('submit'); n.wwQrContactAddForm.trigger('submit'); f.tabs[1].trigger('click'); n.wwQrContactCancel.trigger('click');
  assert.equal(f.requests.length, 2); assert.equal(n.wwQrContactName.disabled, true); assert.equal(n.wwQrContactPanel.hidden, false);
  release(); await flush();
  assert.equal(n.wwQrContactName.value, 'Alex & Jamie'); assert.equal(n.wwQrContactPanel.hidden, false);
  n.wwQrContactAddForm.trigger('submit'); await flush();
  assert.equal(f.requests[2].fields.request_id, f.requests[1].fields.request_id);
  assert.equal(n.wwQrContactPanel.hidden, true);
});

test('admin stale 409 refreshes current list and preserves entered Add contact details', async () => {
  const f = adminFixture({ respond: fields => fields.ww_qrbs_form_action === 'contact_add' ? jsonResponse({ ok: false, error: 'Conflict' }, 409) : undefined });
  await chooseAdminContact(f); f.nodes.wwQrContactName.value = 'Renée & Jamie'; f.nodes.wwQrContactAddForm.trigger('submit'); await flush();
  assert.equal(f.requests[2].fields.ww_qrbs_form_action, 'data_list');
  assert.equal(f.nodes.wwQrContactName.value, 'Renée & Jamie'); assert.equal(f.nodes.wwQrContactPanel.hidden, false);
  assert.match(f.nodes.wwQrContactStatus.textContent, /changed or already exists/);
});

test('admin replayed Remove reports historical save neutrally and refreshes current state without another mutation', async () => {
  let removals = 0;
  const f = adminFixture({ respond: fields => {
    if (fields.ww_qrbs_form_action !== 'contact_remove') return;
    if (++removals === 1) throw new Error('Network interrupted after save');
    return jsonResponse({ ok: true, action: 'contact_remove', dataset: 'contacts', event_key: fields.event_key, couple_id: fields.couple_id, request_id: fields.request_id, version: 3, removed: true, replayed: true });
  } });
  const n = f.nodes;
  n.wwQrDataForm.trigger('submit'); await flush(); adminRowButton(f).trigger('click');
  n.wwQrContactConfirmAction.trigger('click'); await flush();
  assert.equal(n.wwQrContactConfirm.hidden, false);
  n.wwQrContactConfirmAction.trigger('click'); await flush();
  assert.equal(f.requests[2].fields.request_id, f.requests[1].fields.request_id);
  assert.equal(f.requests[3].fields.ww_qrbs_form_action, 'data_list');
  assert.equal(n.wwQrDataStatus.textContent, 'This change was already saved. The current list is shown below.');
  assert.equal(adminRowButton(f).textContent, 'Remove');
  assert.equal(n.wwQrContactConfirm.hidden, true);
  n.wwQrContactConfirmAction.trigger('click'); await flush();
  assert.equal(removals, 2); assert.equal(f.requests.length, 4);
});

test('admin validates mutation response identity and state before hiding forms or claiming success', async () => {
  for (const override of [{ action: 'contact_remove' }, { event_key: 'other-event' }, { couple_id: '999' }, { request_id: 'wrong' }, { version: 0 }, { removed: true }]) {
    const f = adminFixture({ respond: fields => fields.ww_qrbs_form_action === 'contact_add' ? jsonResponse({ ok: true, action: 'contact_add', dataset: 'contacts', event_key: fields.event_key, couple_id: fields.couple_id, request_id: fields.request_id, version: 1, removed: false, ...override }) : undefined });
    await chooseAdminContact(f); f.nodes.wwQrContactAddForm.trigger('submit'); await flush();
    assert.equal(f.nodes.wwQrContactPanel.hidden, false); assert.match(f.nodes.wwQrContactStatus.textContent, /could not be verified/);
    assert.equal(f.requests.length, 2);
  }
});

test('admin lookup validates genuine member shape and maximum result count, rendering names as plain text', async () => {
  for (const members of [Array.from({ length: 21 }, () => ({ couple_id: '90002', name: 'Name', email: 'a@example.invalid' })), [{ couple_id: '../90002', name: 'Name', email: 'a@example.invalid' }], [{ couple_id: '1234567890123456789', name: 'Name', email: 'a@example.invalid' }]]) {
    const f = adminFixture({ respond: fields => fields.ww_qrbs_form_action === 'contact_lookup' ? jsonResponse({ ok: true, members }) : undefined });
    f.nodes.wwQrContactAddOpen.trigger('click'); f.nodes.wwQrContactLookup.value = 'Alex'; f.nodes.wwQrContactLookupForm.trigger('submit'); await flush();
    assert.equal(f.nodes.wwQrContactMatches.children.length, 0); assert.match(f.nodes.wwQrContactStatus.textContent, /could not be verified/);
  }
  const f = adminFixture({ respond: fields => fields.ww_qrbs_form_action === 'contact_lookup' ? jsonResponse({ ok: true, members: [{ couple_id: '90002', name: '<script>literal</script>', email: 'a@example.invalid' }] }) : undefined });
  f.nodes.wwQrContactAddOpen.trigger('click'); f.nodes.wwQrContactLookup.value = 'Alex'; f.nodes.wwQrContactLookupForm.trigger('submit'); await flush();
  assert.match(f.nodes.wwQrContactMatches.children[0].children[0].textContent, /^<script>literal<\/script>/);
});

test('admin event or filter changes dismiss old confirmations and never reuse old event selection', async () => {
  const f = adminFixture(); await chooseAdminContact(f);
  f.nodes.wwQrDataEvent.value = 'another-event'; f.nodes.wwQrDataEvent.trigger('input'); f.nodes.wwQrContactAddForm.trigger('submit'); await flush();
  assert.equal(f.requests.length, 1); assert.equal(f.nodes.wwQrContactPanel.hidden, true);
  f.nodes.wwQrDataForm.trigger('submit'); await flush();
  adminRowButton(f).trigger('click'); f.nodes.wwQrDataContactStatus.value = 'removed'; f.nodes.wwQrDataContactStatus.trigger('change'); f.nodes.wwQrContactConfirmAction.trigger('click'); await flush();
  assert.equal(f.requests.length, 2); assert.equal(f.nodes.wwQrContactConfirm.hidden, true);
});

test('new inline scripts and data helpers survive BD backslash stripping unchanged', () => {
  for (const source of [contactJs, adminJs, section(admin, '/* WW_QR_ADMIN_DATA_HELPERS_START */', '/* WW_QR_ADMIN_DATA_HELPERS_END */'), section(admin, '/* WW_QR_ADMIN_DATA_REQUEST_START */', '/* WW_QR_ADMIN_DATA_REQUEST_END */')]) assert.equal(source.includes('\\'), false);
  new vm.Script(contactJs); new vm.Script(adminJs);
});

test('both complete PHP widgets parse in the existing offline PHP runtime', () => {
  const source = JSON.stringify([qr, admin]);
  const result = php(`$sources=json_decode(base64_decode('${b64(source)}'),true);$result=array();foreach($sources as $source){token_get_all($source,TOKEN_PARSE);$result[]=true;}echo json_encode($result);`);
  assert.deepEqual(result, [true, true]);
});

test('actual QR JSON preparation discards nested BD CSS/template buffers before emitting JSON', () => {
  const helper = section(qr, '/* WW_QR_JSON_RESPONSE_START */', '/* WW_QR_JSON_RESPONSE_END */');
  const result = php(`${helper}ob_start();echo '<style type="text/css">presentation-only</style>';ob_start();echo '<div>template prefix</div>';ww_qr_bingo_prepare_json_response();echo json_encode(array('ok'=>true,'buffers'=>ob_get_level()));`);
  assert.deepEqual(result, { ok: true, buffers: 0 });
  assert.match(qr, /if \(\$_SERVER\['REQUEST_METHOD'\] === 'POST' && isset\(\$_POST\['action'\]\)\) \{\s*ww_qr_bingo_prepare_json_response\(\);/);
  assert.match(qr, /if \(!\$eventConfig\) \{\s*if \(\$_SERVER\['REQUEST_METHOD'\] === 'POST'\) \{\s*ww_qr_bingo_prepare_json_response\(\);/);
});

test('actual standalone QR script delivery selects only widget258 and fails clearly without its companion', () => {
  const delivery = section(qr, '/* WW_QR_CONTACT_SCRIPT_DELIVERY_START */', '/* WW_QR_CONTACT_SCRIPT_DELIVERY_END */');
  const stored = '<script>/* WW_QR_CONTACT_FORM_START */ harmlessOfflineInitializer();</script>';
  const result = php(`${delivery}
    $w=array('database'=>'offline');$queries=array();$stored=base64_decode('${b64(stored)}');
    function mysql($database,$query){global $queries,$stored;$queries[]=$query;return (object)array('row'=>$stored===null?false:array('widget_javascript'=>$stored));}
    function mysql_fetch_assoc($result){return $result->row;}
    $cases=array(array('/qr','GET'),array('/qr/?fresh=1','GET'),array('/other','GET'),array('/qr','POST'));
    $out=array();foreach($cases as $case){$_SERVER=array('REQUEST_URI'=>$case[0],'REQUEST_METHOD'=>$case[1]);ob_start();$ok=ww_qr_bingo_emit_contact_script();$out[]=array('ok'=>$ok,'html'=>ob_get_clean());}
    $stored=null;$_SERVER=array('REQUEST_URI'=>'/qr','REQUEST_METHOD'=>'GET');ob_start();$ok=ww_qr_bingo_emit_contact_script();$out[]=array('ok'=>$ok,'html'=>ob_get_clean());
    echo json_encode(array('cases'=>$out,'queries'=>$queries));`);
  assert.deepEqual(result.cases.slice(0, 2), [{ ok: true, html: stored }, { ok: true, html: stored }]);
  assert.deepEqual(result.cases.slice(2, 4), [{ ok: false, html: '' }, { ok: false, html: '' }]);
  assert.equal(result.cases[4].ok, false);
  assert.match(result.cases[4].html, /role="alert".*Refresh QR Bingo/);
  assert.deepEqual(result.queries, Array(3).fill('SELECT widget_javascript FROM data_widgets WHERE widget_id=258 LIMIT 1'));
  assert(qr.indexOf('if (!empty($qrContactProfile[\'available\'])) ww_qr_bingo_emit_contact_script();') > qr.indexOf('const QR_CONTACT_PROFILE ='));
});

test('actual admin PHP validates bounded filters and formula-safe CSV without database access', () => {
  const baseHelpers = section(admin, '    function ww_qrbs_text_length', '    function ww_qrbs_normalize_plain_text');
  const helpers = 'function ww_qrbs_text_length' + baseHelpers + section(admin, '/* WW_QR_ADMIN_DATA_HELPERS_START */', '/* WW_QR_ADMIN_DATA_HELPERS_END */');
  const valid = { action: 'data_list', dataset: 'contacts', event_key: 'published-event', vendor_id: '', search: '', page: '1', page_size: '50', operator_identity: '' };
  const cases = [valid, { ...valid, action: 'data_export', operator_identity: 'Test Admin' }, { ...valid, action: 'data_export' }, { ...valid, dataset: 'users' }, { ...valid, vendor_id: "1' OR 1=1" }, { ...valid, page_size: '101' }, { ...valid, event_key: '../secret' }, { ...valid, search: '<script>' }, { ...valid, user_id: '999' }];
  const result = php(`${helpers}$cases=json_decode(base64_decode('${b64(JSON.stringify(cases))}'),true);$out=array();foreach($cases as $case){try{ww_qrbs_data_filters($case);$out[]=true;}catch(Exception $e){$out[]=false;}}$cells=array();foreach(array('=SUM(1,2)',' +12',chr(9).'@bad','-2','Safe "Name"','normal@example.invalid') as $cell)$cells[]=ww_qrbs_csv_cell($cell);echo json_encode(array('filters'=>$out,'cells'=>$cells));`);
  assert.deepEqual(result.filters, [true, true, false, false, false, false, false, false, false]);
  for (const cell of result.cells.slice(0, 4)) assert(cell.startsWith('"\''));
  assert.equal(result.cells[4], '"Safe ""Name"""');
  assert.equal(result.cells[5], '"normal@example.invalid"');
});

test('admin scans are current-event bounded and export auditing precedes CSV release', () => {
  const helper = section(admin, 'function ww_qrbs_scans_data(', 'function ww_qrbs_data_json(');
  assert.match(helper, /filters\['event_key'\] !== \(string\)\$config\['event_key'\]/);
  assert.match(helper, /vv[.]scan_date >=/); assert.match(helper, /vv[.]scan_date </);
  assert.match(helper, /EXISTS \(SELECT 1 FROM rel_tags/);
  assert.match(helper, /LIMIT ' [.] \(int\)\$limit/);
  assert.match(helper, /\$total > 5000/);
  assert.doesNotMatch(helper, /c[.]email|c[.]phone|UPDATE|INSERT/);
  const request = section(admin, '/* WW_QR_ADMIN_DATA_REQUEST_START */', '/* WW_QR_ADMIN_DATA_REQUEST_END */');
  assert(request.indexOf("'data_export_audit'") < request.indexOf("$csvRows = array()"));
  assert.match(request, /if \(!ww_qrbs_response_succeeded\(\$auditResult\)\) throw/);
  assert(admin.indexOf("$ww_qrbs_request_path !== '/admin/go.php'") < admin.indexOf('session_start()'));
  assert(admin.indexOf('hash_equals($ww_qrbs_csrf') < admin.indexOf('/* WW_QR_ADMIN_DATA_REQUEST_START */'));
});

test('actual PHP scan queries are read-only, paginated, event-scoped and fail closed above export limit', () => {
  const helpers = 'function ww_qrbs_validate_datetime' + section(admin, 'function ww_qrbs_validate_datetime', 'function ww_qrbs_validate_rfc3339_version')
    + section(admin, '/* WW_QR_ADMIN_DATA_HELPERS_START */', '/* WW_QR_ADMIN_DATA_HELPERS_END */');
  const config = { event_key: 'published-event', vendor_tag_id: 6, history_starts_at: '2026-10-18T15:00:00Z', entry_closes_at: '2026-10-18T19:00:00Z' };
  const filters = { dataset: 'scans', event_key: 'published-event', vendor_id: '123', search: 'Test%', page: 2, page_size: 50, operator_identity: 'Test Admin' };
  const result = php(`${helpers}
    date_default_timezone_set('America/Toronto');
    $queries=array();$total=51;$records=array(array('couple_id'=>'456','name'=>'Test Couple','vendor_id'=>'123','vendor_name'=>'Test Vendor','scanned_at'=>'2026-10-18 12:00:00'));
    function mysql_real_escape_string($text){return str_replace("'",chr(92)."'",$text);}
    function mysql($database,$sql){global $queries,$total,$records;$queries[]=$sql;return (object)array('rows'=>strpos($sql,'SELECT COUNT(*)')===0?array(array('total'=>$total)):$records);}
    function mysql_fetch_assoc($result){return count($result->rows)?array_shift($result->rows):false;}
    $config=json_decode(base64_decode('${b64(JSON.stringify(config))}'),true);$filters=json_decode(base64_decode('${b64(JSON.stringify(filters))}'),true);
    $list=ww_qrbs_scans_data('offline',$filters,$config,false);$listQueries=$queries;$queries=array();$total=5001;
    try{ww_qrbs_scans_data('offline',$filters,$config,true);$overflow=false;}catch(Exception $e){$overflow=true;}$overflowQueries=$queries;$queries=array();$filters['event_key']='old-event';
    try{ww_qrbs_scans_data('offline',$filters,$config,false);$mismatch=false;}catch(Exception $e){$mismatch=true;}
    echo json_encode(array('list'=>$list,'queries'=>$listQueries,'overflow'=>$overflow,'overflow_queries'=>$overflowQueries,'mismatch'=>$mismatch,'mismatch_queries'=>$queries));`);
  assert.equal(result.list.rows[0].couple_id, '456');
  assert.equal(result.list.rows[0].event_key, 'published-event');
  assert.equal(result.list.page, 2);
  assert.equal(result.list.has_more, false);
  assert.equal(result.queries.length, 2);
  for (const query of result.queries) {
    assert.match(query, /^SELECT /);
    assert.match(query, /vv[.]scan_date >= '2026-10-18 11:00:00'/);
    assert.match(query, /vv[.]scan_date < '2026-10-18 15:00:00'/);
    assert.match(query, /rt[.]tag_id='6'/);
    assert.match(query, /vv[.]vendor_id='123'/);
    assert(query.includes("LIKE '%Test\\%%'"));
    assert.doesNotMatch(query, /c[.]email|c[.]phone/);
  }
  assert.match(result.queries[1], /LIMIT 50 OFFSET 50$/);
  assert.equal(result.overflow, true);
  assert.equal(result.overflow_queries.length, 1);
  assert.equal(result.mismatch, true);
  assert.equal(result.mismatch_queries.length, 0);
});
