// Offline UI contracts: synthetic members/draws; no network, account, or draw changes.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings-data.js', import.meta.url), 'utf8');
const EVENT = 'offline-reset-event';
const VENDOR = '90001';
const DRAW = '11111111-1111-4111-8111-111111111111';
const OTHER_DRAW = '22222222-2222-4222-8222-222222222222';
const flush = () => new Promise(resolve => setImmediate(resolve));

class Node {
  constructor(id = '') {
    Object.assign(this, { id, value: '', textContent: '', hidden: false, disabled: false, open: false,
      children: [], listeners: {}, dataset: {}, validity: true });
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  trigger(type) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {} }); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  blur() { this.blurred = true; }
  reportValidity() { return this.validity; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() {}
  click() { this.trigger('click'); }
}
const descend = node => node.children.flatMap(child => [child, ...descend(child)]);
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const row = patch => ({ id: DRAW, vendor_id: VENDOR, vendor_name: 'Offline Vendor',
  name: '<img src=x onerror=bad()>', selection_status: 'verified', draw_number: 1,
  draw_generation: 1, current_generation: 1,
  is_current_generation: true, can_reset_draw: true, reset_block_reason: '', ...patch });

function fixture({ rows: suppliedRows, respond } = {}) {
  const ids = ['wwQrData', 'wwQrDataForm', 'wwQrDataStatus', 'wwQrDataHead', 'wwQrDataRows',
    'wwQrDataPrevious', 'wwQrDataNext', 'wwQrDataEvent', 'wwQrDataVendor', 'wwQrDataSearch',
    'wwQrDataOperator', 'wwQrDataExport', 'wwQrDataScanNote', 'wwQrDataContactStatus',
    'wwQrDataContactStatusGroup', 'wwQrContactPanel', 'wwQrContactAddForm', 'wwQrContactStatus',
    'wwQrContactMatches', 'wwQrContactConfirm', 'wwQrContactConfirmAction', 'wwQrContactConfirmMessage',
    'wwQrContactConfirmCancel', 'wwQrContactAddOpen', 'wwQrContactEvent', 'wwQrContactLookupForm',
    'wwQrContactLookup', 'wwQrContactChosen', 'wwQrContactName', 'wwQrContactEmail', 'wwQrContactPhone',
    'wwQrContactDate', 'wwQrContactVenue', 'wwQrContactVenueGroup', 'wwQrContactCancel',
    'wwQrDrawResetConfirm', 'wwQrDrawResetMessage', 'wwQrDrawResetReason', 'wwQrDrawResetAction',
    'wwQrDrawResetCancel', 'token'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node(id)]));
  const document = { getElementById: id => nodes[id] || null, activeElement: new Node('active'),
    body: new Node('body'), createElement: tag => new Node(tag) };
  const n = nodes;
  n.wwQrDataEvent.value = EVENT; n.wwQrDataOperator.value = 'Offline Admin';
  n.wwQrDataContactStatus.value = 'active'; n.token.value = 'offline-csrf';
  for (const id of ['wwQrContactPanel', 'wwQrContactAddForm', 'wwQrContactConfirm', 'wwQrDrawResetConfirm']) n[id].hidden = true;
  n.wwQrDataForm.action = 'https://ww2.managemydirectory.com/admin/go.php?widget=ww_qr_bingo_settings';
  n.wwQrDataForm.querySelector = () => n.token;
  const tabs = ['contacts', 'scans', 'entries', 'winners'].map(dataset => {
    const tab = new Node(dataset); tab.dataset.dataset = dataset; return tab;
  });
  n.wwQrData.querySelectorAll = selector => selector === '[data-dataset]' ? tabs : [...Object.values(n), ...tabs, ...descend(n.wwQrDataRows)];
  const requests = [];
  let uuid = 0, generation = 1;
  const context = vm.createContext({ document, URLSearchParams, AbortController, Error,
    setTimeout: () => 1, clearTimeout() {}, Blob: class {},
    URL: { createObjectURL: () => 'blob:offline', revokeObjectURL() {} },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0') },
    fetch: async (url, request) => {
      const fields = Object.fromEntries(new URLSearchParams(request.body));
      const entry = { url, request, fields }; requests.push(entry);
      if (respond) { const result = await respond(fields, requests.length); if (result) return result; }
      if (fields.ww_qrbs_form_action === 'draw_reset') {
        generation = Number(fields.expected_generation) + 1;
        return json(resetResult(fields));
      }
      return json({ ok: true, dataset: fields.dataset, event_key: fields.event_key,
        contact_status: fields.contact_status, columns: [{ key: 'name', label: 'Winner' }],
        rows: suppliedRows || [row({ current_generation: generation, is_current_generation: generation === 1, can_reset_draw: generation === 1 })],
        page: Number(fields.page), page_size: 50, has_more: false, total: (suppliedRows || [1]).length });
    },
  });
  vm.runInContext(source, context);
  const mutations = () => requests.filter(r => r.fields.ww_qrbs_form_action === 'draw_reset');
  const resetButtons = () => descend(n.wwQrDataRows).filter(node => node.textContent === 'Reset draw' && !node.disabled);
  const showWinners = async () => { tabs[3].trigger('click'); await flush(); };
  const open = async () => {
    await showWinners();
    assert.equal(resetButtons().length, 1, 'one actionable reset is expected for the current resettable draw');
    resetButtons()[0].trigger('click');
    assert.equal(n.wwQrDrawResetConfirm.hidden, false, 'reset requires the dedicated confirmation panel');
    n.wwQrDrawResetReason.value = 'Repeat the offline draw';
  };
  return { nodes, document, tabs, requests, mutations, resetButtons, showWinners, open,
    initializeAgain: () => vm.runInContext(source, context) };
}
function resetResult(fields, patch = {}) {
  return { ok: true, action: 'draw_reset', dataset: 'winners', event_key: fields.event_key,
    vendor_id: fields.vendor_id, draw_id: fields.draw_id, request_id: fields.request_id,
    from_generation: Number(fields.expected_generation), to_generation: Number(fields.expected_generation) + 1,
    replayed: false, ...patch };
}

test('current winner reset is explicit, cancel is read-only, and untrusted labels render as text', async () => {
  const f = fixture(); await f.open();
  assert.match(f.nodes.wwQrDrawResetMessage.textContent, /Offline Vendor|90001/);
  assert.match(f.nodes.wwQrDrawResetMessage.textContent, /offline-reset-event/);
  assert.equal(f.nodes.wwQrDrawResetCancel.focused, true);
  assert.equal(f.mutations().length, 0);
  assert(descend(f.nodes.wwQrDataRows).some(node => node.textContent === '<img src=x onerror=bad()>'));
  f.nodes.wwQrDrawResetCancel.trigger('click');
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, true);
  assert.equal(f.mutations().length, 0);
});

test('only current resettable well-formed winner rows expose an actionable reset', async () => {
  const invalid = [{ can_reset_draw: false, reset_block_reason: 'Email delivery is awaiting confirmation.' },
    { can_reset_draw: 'true' }, { can_reset_draw: undefined }, { is_current_generation: false },
    { is_current_generation: undefined }, { draw_generation: 0 }, { draw_generation: '1' },
    { current_generation: 2 }, { current_generation: 0 }, { current_generation: '1' },
    { current_generation: Number.MAX_SAFE_INTEGER + 1 }, { vendor_id: '../90001' },
    { vendor_id: 90001 }, { id: 'not-a-draw-id' }];
  for (const patch of invalid) {
    const f = fixture({ rows: [row(patch)] }); await f.showWinners();
    assert.equal(f.resetButtons().length, 0, JSON.stringify(patch));
    assert.equal(f.mutations().length, 0);
  }
  for (const index of [0, 1, 2]) {
    const f = fixture(); f.tabs[index].trigger('click'); await flush();
    assert.equal(f.resetButtons().length, 0, 'other datasets cannot reset draws');
  }
});

test('reset requires operator, reason, and valid admin form before any mutation', async () => {
  for (const invalid of ['operator', 'reason', 'form']) {
    const f = fixture(); await f.open();
    if (invalid === 'operator') f.nodes.wwQrDataOperator.value = ' ';
    if (invalid === 'reason') f.nodes.wwQrDrawResetReason.value = ' ';
    if (invalid === 'form') f.nodes.wwQrDataForm.validity = false;
    f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
    assert.equal(f.mutations().length, 0, invalid);
    assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, false);
  }
});

test('confirmed reset uses the CSRF-protected same-origin admin proxy and exact generation identity', async () => {
  const f = fixture(); await f.open(); f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 1);
  const sent = f.mutations()[0];
  assert.equal(sent.url, f.nodes.wwQrDataForm.action);
  assert.equal(sent.request.credentials, 'same-origin');
  assert.deepEqual(sent.fields, { ww_qrbs_csrf_token: 'offline-csrf', ww_qrbs_form_action: 'draw_reset',
    dataset: 'winners', event_key: EVENT, vendor_id: VENDOR, draw_id: DRAW, expected_generation: '1',
    request_id: '00000000-0000-4000-8000-000000000001', operator_identity: 'Offline Admin', reason: 'Repeat the offline draw' });
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, true);
  assert.equal(f.requests.at(-1).fields.ww_qrbs_form_action, 'data_list');
  assert.equal(f.requests.at(-1).fields.dataset, 'winners');
  assert.equal(f.resetButtons().length, 0, 'old generation cannot immediately reset again');
  assert.deepEqual(f.requests.map(r => r.fields.ww_qrbs_form_action), ['data_list', 'draw_reset', 'data_list']);
});

test('duplicate reset clicks, tabs, and cancel cannot interrupt an in-flight mutation', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ respond: async fields => { if (fields.ww_qrbs_form_action === 'draw_reset') { await gate; } } });
  await f.open();
  f.nodes.wwQrDrawResetAction.trigger('click'); f.nodes.wwQrDrawResetAction.trigger('click');
  f.tabs[0].trigger('click'); f.nodes.wwQrDrawResetCancel.trigger('click');
  assert.equal(f.mutations().length, 1); assert.equal(f.requests.length, 2);
  assert.equal(f.nodes.wwQrDrawResetAction.disabled, true);
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, false);
  release(); await flush();
  assert.equal(f.mutations().length, 1);
  assert.equal(f.requests.at(-1).fields.dataset, 'winners');
});

test('unconfirmed network response permits retry with the same request ID and no automatic reset retry', async () => {
  let attempts = 0;
  const f = fixture({ respond: fields => { if (fields.ww_qrbs_form_action === 'draw_reset' && ++attempts === 1) throw new Error('Offline connection interrupted'); } });
  await f.open(); f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 1);
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, false);
  f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 2);
  assert.equal(f.mutations()[1].fields.request_id, f.mutations()[0].fields.request_id);
});

test('changing a retry reason changes the idempotency key rather than reusing different request content', async () => {
  const f = fixture({ respond: fields => { if (fields.ww_qrbs_form_action === 'draw_reset') throw new Error('Offline connection interrupted'); } });
  await f.open(); f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  f.nodes.wwQrDrawResetReason.value = 'A different justified reset reason';
  f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 2);
  assert.notEqual(f.mutations()[1].fields.request_id, f.mutations()[0].fields.request_id);
});

test('stale generation conflict closes confirmation and refreshes winners without resubmitting reset', async () => {
  const f = fixture({ respond: fields => fields.ww_qrbs_form_action === 'draw_reset' ? json({ ok: false, error: 'Draw changed. Refresh.' }, 409) : undefined });
  await f.open(); f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 1);
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, true);
  assert.equal(f.requests.at(-1).fields.ww_qrbs_form_action, 'data_list');
  assert.match(f.nodes.wwQrDataStatus.textContent, /changed|refresh|review/i);
  f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 1);
});

test('reset response must match every identity and advance exactly one integer generation', async () => {
  const patches = [{ action: 'contact_remove' }, { dataset: 'contacts' }, { event_key: 'other-event' },
    { vendor_id: '90003' }, { draw_id: OTHER_DRAW }, { request_id: '00000000-0000-4000-8000-000000000009' },
    { from_generation: 0 }, { from_generation: '1' }, { to_generation: 1 }, { to_generation: 3 },
    { to_generation: '2' }, { to_generation: Number.MAX_SAFE_INTEGER + 1 }, { replayed: 'true' }];
  for (const patch of patches) {
    const f = fixture({ respond: fields => fields.ww_qrbs_form_action === 'draw_reset' ? json(resetResult(fields, patch)) : undefined });
    await f.open(); f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
    assert.equal(f.mutations().length, 1);
    assert.match(f.nodes.wwQrDataStatus.textContent, /could not|not.*verified|refresh|failed/i, JSON.stringify(patch));
    assert.doesNotMatch(f.nodes.wwQrDataStatus.textContent, /^Draw reset[.!]|^Reset complete/i, JSON.stringify(patch));
  }
});

test('a valid idempotent replay refreshes history and does not start a second generation', async () => {
  const f = fixture({ respond: fields => fields.ww_qrbs_form_action === 'draw_reset' ? json(resetResult(fields, { replayed: true })) : undefined });
  await f.open(); f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 1);
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, true);
  assert.match(f.nodes.wwQrDataStatus.textContent, /already|previously/i);
  assert.equal(f.requests.at(-1).fields.ww_qrbs_form_action, 'data_list');
});

test('event, vendor, search, and dataset changes retire the old reset confirmation', async () => {
  for (const changed of ['wwQrDataEvent', 'wwQrDataVendor', 'wwQrDataSearch', 'dataset']) {
    const f = fixture(); await f.open();
    if (changed === 'dataset') f.tabs[0].trigger('click');
    else { f.nodes[changed].value = 'new-filter'; f.nodes[changed].trigger('input'); }
    await flush();
    assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, true, changed);
    f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
    assert.equal(f.mutations().length, 0, changed);
  }
});

test('reinitialization cannot install duplicate reset listeners', async () => {
  const f = fixture(); await f.open(); f.initializeAgain();
  f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 1);
});

test('the original generation zero can reset to generation one', async () => {
  const f = fixture({ rows: [row({ draw_generation: 0, current_generation: 0 })] });
  await f.open(); f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 1);
  assert.equal(f.mutations()[0].fields.expected_generation, '0');
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, true);
  assert.match(f.nodes.wwQrDataStatus.textContent, /^Draw reset/);
});

test('reset reason length and single-line plain text constraints prevent malformed requests', async () => {
  for (const reason of ['ab', 'x'.repeat(501), 'two\nlines', 'a\u0000b', 'a\u007fb', '<b>reason</b>']) {
    const f = fixture(); await f.open(); f.nodes.wwQrDrawResetReason.value = reason;
    f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
    assert.equal(f.mutations().length, 0, JSON.stringify(reason));
    assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, false);
  }
});

test('manual list refresh retires the previously confirmed draw', async () => {
  const f = fixture(); await f.open();
  f.nodes.wwQrDataForm.trigger('submit'); await flush();
  assert.equal(f.nodes.wwQrDrawResetConfirm.hidden, true);
  f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 0);
});

test('a changed event value cannot submit an old target even without its input event', async () => {
  const f = fixture(); await f.open(); f.nodes.wwQrDataEvent.value = 'different-event';
  f.nodes.wwQrDrawResetAction.trigger('click'); await flush();
  assert.equal(f.mutations().length, 0);
});
