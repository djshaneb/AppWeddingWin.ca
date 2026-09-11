// Synthetic accounts and local DOM/transport doubles only; no live mutations.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings-data.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php', import.meta.url), 'utf8');
const EVENT = 'offline-card-event', COUPLE = '90002';
const member = { couple_id: COUPLE, name: 'Alex & Jamie', email: 'couple@example.test' };
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const descend = node => node.children.flatMap(child => [child, ...descend(child)]);
class Node {
  constructor(id = '', attrs = '') { Object.assign(this, { id, value: '', textContent: '', hidden: /\bhidden\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs), children: [], listeners: {}, dataset: {}, validity: true }); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  trigger(type) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {} }); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  reportValidity() { return this.validity; }
  remove() {}
  click() { this.trigger('click'); }
}
function preview(fields, patch = {}) {
  return { ok: true, action: 'card_reset_preview', dataset: 'scans', event_key: fields.event_key,
    couple_id: fields.couple_id, expected_generation: 2, preview_token: 'a'.repeat(64), scan_preview_token: 'b'.repeat(64),
    entry_count: 2, scan_count: 3, can_reset: true, reset_block_reason: '', member,
    card_state: { event_key: fields.event_key, couple_id: fields.couple_id, generation: 2, scan_reset_after: '2026-09-10T12:00:00Z' }, ...patch };
}
function saved(fields, patch = {}) {
  return { ok: true, action: 'card_reset', dataset: 'scans', event_key: fields.event_key, couple_id: fields.couple_id,
    request_id: fields.request_id, from_generation: Number(fields.expected_generation), to_generation: Number(fields.expected_generation) + 1,
    scan_reset_after: '2026-09-11T12:00:00Z', entry_count: 2, scan_count: 3, replayed: false, member, ...patch };
}
function fixture({ respond, previewPatch = {}, members = [member] } = {}) {
  const nodes = { token: new Node('token') };
  for (const match of markup.matchAll(/<[^>]+\bid="([A-Za-z0-9_-]+)"[^>]*>/g)) nodes[match[1]] = new Node(match[1], match[0]);
  const document = { getElementById: id => nodes[id] || null, createElement: tag => new Node(tag), body: new Node('body'), activeElement: new Node('active') };
  const n = nodes;
  n.wwQrDataEvent.value = EVENT; n.wwQrDataOperator.value = 'Offline Admin'; n.wwQrDataContactStatus.value = 'active'; n.token.value = 'offline-csrf';
  n.wwQrDataForm.action = 'https://ww2.managemydirectory.com/admin/go.php?widget=ww_qr_bingo_settings';
  n.wwQrDataForm.querySelector = () => n.token;
  const tabs = ['contacts', 'scans', 'entries', 'winners'].map(dataset => { const tab = new Node(dataset); tab.dataset.dataset = dataset; return tab; });
  n.wwQrData.querySelectorAll = selector => selector === '[data-dataset]' ? tabs : [...Object.values(n), ...tabs, ...descend(n.wwQrCardResetMatches), ...descend(n.wwQrDataRows)];
  const requests = []; let uuid = 0;
  const context = vm.createContext({ document, URLSearchParams, AbortController, Error, Date,
    setTimeout: () => 1, clearTimeout() {}, Blob: class {}, URL: { createObjectURL: () => 'blob:offline', revokeObjectURL() {} },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0') },
    fetch: async (url, request) => {
      const fields = Object.fromEntries(new URLSearchParams(request.body)); requests.push({ url, request, fields });
      if (respond) { const custom = await respond(fields, requests); if (custom) return custom; }
      if (fields.ww_qrbs_form_action === 'card_reset_lookup') return response({ ok: true, action: 'card_reset_lookup', members });
      if (fields.ww_qrbs_form_action === 'card_reset_preview') return response(preview(fields, previewPatch));
      if (fields.ww_qrbs_form_action === 'card_reset') return response(saved(fields, { entry_count: previewPatch.entry_count ?? 2, scan_count: previewPatch.scan_count ?? 3 }));
      return response({ ok: true, dataset: fields.dataset, event_key: fields.event_key, contact_status: fields.contact_status, rows: [], columns: [], page: Number(fields.page), has_more: false, total: 0 });
    },
  });
  vm.runInContext(source, context);
  const changes = () => requests.filter(r => r.fields.ww_qrbs_form_action === 'card_reset');
  const open = () => n.wwQrCardResetOpen.trigger('click');
  const search = async (text = 'Alex') => { n.wwQrCardResetLookup.value = text; n.wwQrCardResetLookupForm.trigger('submit'); await flush(); };
  const choose = async () => { const button = descend(n.wwQrCardResetMatches).find(node => node.textContent === 'Choose'); assert(button, 'lookup must require an explicit matching-account choice'); button.trigger('click'); await flush(); };
  const ready = async () => { open(); await search(); await choose(); n.wwQrCardResetReason.value = 'Couple requested a fresh card'; };
  return { nodes, tabs, requests, changes, open, search, choose, ready, confirm: async () => { n.wwQrCardResetAction.trigger('click'); await flush(); }, initializeAgain: () => vm.runInContext(source, context) };
}

test('reset lookup names the account and confirmation names both record groups without changing anything', async () => {
  const f = fixture(); f.open(); assert.equal(f.nodes.wwQrCardResetPanel.hidden, false); assert(f.nodes.wwQrCardResetLookup.focused);
  await f.search('couple@example.test');
  assert.equal(f.requests.length, 1); assert.equal(f.changes().length, 0);
  const label = descend(f.nodes.wwQrCardResetMatches).find(node => node.textContent.includes('#90002'));
  assert(label.textContent.includes(member.name) && label.textContent.includes(member.email));
  await f.choose();
  assert.equal(f.requests[1].fields.ww_qrbs_form_action, 'card_reset_preview');
  assert.equal(f.changes().length, 0); assert.equal(f.nodes.wwQrCardResetConfirm.hidden, false);
  assert.match(f.nodes.wwQrCardResetChosen.textContent, /Alex & Jamie.*Account #90002.*couple@example.test/);
  assert.match(f.nodes.wwQrCardResetSummary.textContent, /3 QR scans and 2 vendor draw entries/);
  assert(f.nodes.wwQrCardResetSummary.textContent.includes(EVENT)); assert(f.nodes.wwQrCardResetConfirmCancel.focused);
});

test('account search remains bounded and untrusted names are text only', async () => {
  const unsafe = { ...member, name: '<img src=x onerror=bad()>' }; const f = fixture({ members: [unsafe], previewPatch: { member: unsafe } });
  f.open(); await f.search('a'); assert.equal(f.requests.length, 0);
  await f.search('a'.repeat(121)); assert.equal(f.requests.length, 0);
  await f.search('90002'); assert(descend(f.nodes.wwQrCardResetMatches).some(node => node.textContent.includes(unsafe.name)));
  await f.choose(); assert(f.nodes.wwQrCardResetChosen.textContent.includes(unsafe.name)); assert.equal(f.nodes.wwQrCardResetChosen.innerHTML, undefined);
});

test('empty malformed or oversized lookup results never select an account', async () => {
  for (const members of [[], [{ ...member, couple_id: '0' }], [{ ...member, email: null }], [{ ...member, name: 'x'.repeat(501) }], Array(21).fill(member)]) {
    const f = fixture({ members }); f.open(); await f.search();
    assert.equal(descend(f.nodes.wwQrCardResetMatches).filter(n => n.textContent === 'Choose').length, 0);
    assert.equal(f.nodes.wwQrCardResetConfirm.hidden, true); assert.equal(f.changes().length, 0);
  }
});

test('malformed or foreign preview metadata cannot enable a reset', async () => {
  for (const patch of [{ action: 'draw_reset' }, { dataset: 'entries' }, { event_key: 'other-event' }, { couple_id: '90003' },
    { expected_generation: '2' }, { expected_generation: -1 }, { preview_token: '' }, { scan_preview_token: 'bad' },
    { entry_count: -1 }, { entry_count: '2' }, { scan_count: 10001 }, { scan_count: '3' }, { can_reset: 'true' },
    { can_reset: true, reset_block_reason: 'Email pending' }, { member: { ...member, couple_id: '90003' } },
    { card_state: { event_key: EVENT, couple_id: COUPLE, generation: 1, scan_reset_after: '2026-09-10T12:00:00Z' } },
    { card_state: { event_key: EVENT, couple_id: COUPLE, generation: 2, scan_reset_after: null } }]) {
    const f = fixture({ previewPatch: patch }); await f.ready(); await f.confirm();
    assert.equal(f.nodes.wwQrCardResetConfirm.hidden, true, JSON.stringify(patch)); assert.equal(f.changes().length, 0);
  }
});

test('blocked winner delivery displays a clear block and cannot reset', async () => {
  const f = fixture({ previewPatch: { can_reset: false, reset_block_reason: 'A winner email is still being sent. Try again when it finishes.' } });
  await f.ready(); assert.equal(f.nodes.wwQrCardResetAction.disabled, true); await f.confirm();
  assert.match(f.nodes.wwQrCardResetStatus.textContent, /winner email/); assert.equal(f.changes().length, 0);
});

test('explicit confirmation sends only the selected card scope and preview evidence through the same-origin proxy', async () => {
  const f = fixture(); await f.ready(); await f.confirm(); const call = f.changes()[0];
  assert.equal(f.changes().length, 1); assert.equal(call.request.credentials, 'same-origin'); assert.equal(call.url, f.nodes.wwQrDataForm.action);
  assert.deepEqual(call.fields, { ww_qrbs_csrf_token: 'offline-csrf', ww_qrbs_form_action: 'card_reset', event_key: EVENT,
    couple_id: COUPLE, expected_generation: '2', preview_token: 'a'.repeat(64), scan_preview_token: 'b'.repeat(64), dataset: 'scans',
    operator_identity: 'Offline Admin', reason: 'Couple requested a fresh card', request_id: '00000000-0000-4000-8000-000000000001' });
  assert.equal(f.nodes.wwQrCardResetPanel.hidden, true); assert.match(f.nodes.wwQrDataStatus.textContent, /Bingo card reset for Alex & Jamie/);
  assert.equal(f.requests.at(-1).fields.ww_qrbs_form_action, 'data_list');
});

test('operator reason and current form must be valid before any mutation', async () => {
  for (const bad of ['operator', 'reason', 'multiline', 'markup', 'long', 'form']) {
    const f = fixture(); await f.ready();
    if (bad === 'operator') f.nodes.wwQrDataOperator.value = '';
    if (bad === 'reason') f.nodes.wwQrCardResetReason.value = 'x';
    if (bad === 'multiline') f.nodes.wwQrCardResetReason.value = 'First\nSecond';
    if (bad === 'markup') f.nodes.wwQrCardResetReason.value = '<script>';
    if (bad === 'long') f.nodes.wwQrCardResetReason.value = 'a'.repeat(501);
    if (bad === 'form') f.nodes.wwQrDataForm.validity = false;
    await f.confirm(); assert.equal(f.changes().length, 0, bad);
  }
});

test('cancel close event changes tab changes and refreshed lists invalidate the selected preview', async () => {
  for (const change of ['cancel', 'close', 'event', 'tab', 'refresh', 'search']) {
    const f = fixture(); await f.ready();
    if (change === 'cancel') f.nodes.wwQrCardResetConfirmCancel.trigger('click');
    if (change === 'close') f.nodes.wwQrCardResetClose.trigger('click');
    if (change === 'event') { f.nodes.wwQrDataEvent.value = 'other-event'; f.nodes.wwQrDataEvent.trigger('input'); }
    if (change === 'tab') f.tabs[1].trigger('click');
    if (change === 'refresh') f.nodes.wwQrDataForm.trigger('submit');
    if (change === 'search') { f.nodes.wwQrCardResetLookup.value = 'Another'; f.nodes.wwQrCardResetLookup.trigger('input'); }
    await flush(); await f.confirm(); assert.equal(f.changes().length, 0, change);
  }
});

test('rapid confirms are single-flight and an uncertain retry retains the identical request', async () => {
  let release; const held = new Promise(resolve => { release = resolve; }); let attempts = 0;
  const f = fixture({ respond: async fields => {
    if (fields.ww_qrbs_form_action !== 'card_reset') return;
    if (++attempts === 1) { await held; return response({ ok: false, error: 'The result is unknown. Retry this same request.' }, 503); }
    return response(saved(fields, { replayed: true }));
  } });
  await f.ready(); f.nodes.wwQrCardResetAction.trigger('click'); f.nodes.wwQrCardResetAction.trigger('click'); await flush();
  assert.equal(f.changes().length, 1); f.nodes.wwQrCardResetClose.trigger('click'); assert.equal(f.nodes.wwQrCardResetPanel.hidden, false);
  release(); await flush(); assert.equal(f.nodes.wwQrCardResetReason.disabled, true); assert.equal(f.nodes.wwQrDataOperator.disabled, true);
  await f.confirm(); assert.equal(f.changes().length, 2); assert.deepEqual(f.changes()[1].fields, f.changes()[0].fields);
  assert.match(f.nodes.wwQrDataStatus.textContent, /already recorded/);
});

test('a stale reset requires a fresh account selection and cannot auto-retry', async () => {
  const f = fixture({ respond: fields => fields.ww_qrbs_form_action === 'card_reset' ? response({ ok: false, error: 'The card changed.' }, 409) : undefined });
  await f.ready(); await f.confirm(); await f.confirm();
  assert.equal(f.changes().length, 1); assert.equal(f.nodes.wwQrCardResetConfirm.hidden, true); assert.match(f.nodes.wwQrCardResetStatus.textContent, /review the current card/);
});

test('foreign or malformed reset acknowledgements never report success and preserve the original retry ID', async () => {
  for (const patch of [{ action: 'contact_remove' }, { dataset: 'entries' }, { event_key: 'other-event' }, { couple_id: '90003' },
    { request_id: 'wrong' }, { from_generation: 1 }, { to_generation: 4 }, { to_generation: '3' }, { scan_reset_after: 'bad' },
    { entry_count: 3 }, { scan_count: 4 }, { replayed: 'false' }]) {
    let attempts = 0; const f = fixture({ respond: fields => {
      if (fields.ww_qrbs_form_action === 'card_reset') return response(saved(fields, ++attempts === 1 ? patch : { replayed: true }));
    } });
    await f.ready(); await f.confirm(); assert.equal(f.nodes.wwQrCardResetPanel.hidden, false, JSON.stringify(patch));
    assert.match(f.nodes.wwQrCardResetStatus.textContent, /could not be confirmed/); await f.confirm();
    assert.equal(f.changes()[0].fields.request_id, f.changes()[1].fields.request_id);
  }
});

test('late search and preview responses cannot bind a changed account or event', async () => {
  for (const action of ['card_reset_lookup', 'card_reset_preview']) {
    let release; const held = new Promise(resolve => { release = resolve; });
    const f = fixture({ respond: async fields => { if (fields.ww_qrbs_form_action === action) await held; } });
    f.open();
    if (action === 'card_reset_lookup') { f.nodes.wwQrCardResetLookup.value = 'Alex'; f.nodes.wwQrCardResetLookupForm.trigger('submit'); }
    else { await f.search(); descend(f.nodes.wwQrCardResetMatches).find(n => n.textContent === 'Choose').trigger('click'); }
    f.nodes.wwQrDataEvent.value = 'different-event'; release(); await flush(); await f.confirm();
    assert.equal(f.nodes.wwQrCardResetConfirm.hidden, true); assert.equal(f.changes().length, 0);
  }
});

test('cards with scans but no draw entries can reset and initialization attaches no duplicate listeners', async () => {
  const f = fixture({ previewPatch: { entry_count: 0 } }); f.initializeAgain(); await f.ready(); await f.confirm();
  assert.equal(f.requests.filter(r => r.fields.ww_qrbs_form_action === 'card_reset_lookup').length, 1);
  assert.equal(f.changes().length, 1); assert.match(f.nodes.wwQrDataStatus.textContent, /3 scans and 0 draw entries/);
});
