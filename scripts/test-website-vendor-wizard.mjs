#!/usr/bin/env node
// Executes the shipped widget's functions with a minimal DOM and fake transport.
// No browser, account, database, network or email is used.
// Run: node --test scripts/test-website-vendor-wizard.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const raw = readFileSync(new URL('../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js', import.meta.url), 'utf8');
const source = raw.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const parsed = ts.createSourceFile('widget.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const template = readFileSync(new URL('../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.php', import.meta.url), 'utf8');
function findNode(predicate) {
  let result;
  function visit(node) {
    if (result) return;
    if (predicate(node)) { result = node; return; }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(result, 'The tested production code must exist');
  return result;
}
function functionSource(name) {
  return findNode(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(parsed);
}
function listenerSource(target, event) {
  return findNode(node => ts.isCallExpression(node) &&
    node.expression.getText(parsed) === `${target}.addEventListener` &&
    node.arguments[0]?.text === event).arguments[1].getText(parsed);
}

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {};
    this.value = ''; this.checked = false; this.disabled = false; this.hidden = false;
    this._text = ''; this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, value) => {
        const add = value === undefined ? !this.classes.has(name) : value;
        if (add) this.classes.add(name); else this.classes.delete(name);
      },
      contains: name => this.classes.has(name),
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  closest() { return this; }
  querySelector() { return this.helpNode || null; }
  focus() { this.focused = true; }
}
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
const rulesVersion = 'unit-test-current-rules';
const originalDescription = 'TEST ONLY — 50% off a service\nMaximum savings $500.\nNo real prize.';
const normalized = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const before = '2026-09-04T20:00:00.000001Z';
const after = '2026-09-04T20:00:01.000002Z';
function dashboard(patch = {}) {
  return {
    ok: true, vendor: { id: 'fictional-vendor', name: 'Test Vendor' },
    rules_version: rulesVersion, rules_current: true,
    terms_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
    vendor_responsibility_disclosure: 'Fictional unit-test responsibility text.',
    material_terms_locked: false, prize_details_locked: false, event_key: 'unit-test-event', draws: [], entry_count: 0,
    settings: {
      enabled: false, prize_title: originalDescription.split('\n')[0],
      prize_description: normalized(originalDescription), prize_approx_value_cad: 500,
      max_winners: 1, exclude_previous_winners: true,
      legal_terms_accepted: false, vendor_responsibility_acknowledged: false,
      legal_terms_version: rulesVersion, updated_at: before,
    },
    ...patch,
  };
}
function responseFor(body, settingsPatch = {}, patch = {}) {
  return dashboard({ ...patch, settings: {
    ...dashboard().settings, enabled: body.enabled,
    prize_title: body.prize_title, prize_description: normalized(body.prize_description),
    prize_approx_value_cad: body.prize_approx_value_cad, max_winners: body.max_winners,
    exclude_previous_winners: body.exclude_previous_winners,
    legal_terms_accepted: body.legal_terms_accepted,
    vendor_responsibility_acknowledged: body.vendor_responsibility_acknowledged,
    updated_at: after, ...settingsPatch,
  } });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const commonFunctions = [
  'text', 'number', 'prizeDetailsLocked', 'firstLine', 'formatPrizeDraftDescription',
  'samePrizeWording', 'formatDate', 'trustedWeddingWinUrl', 'makeElement',
  'currentDraftSignature', 'activeDraws', 'verifiedDraws', 'configuredWinnerCount',
  'updateRulesReviewProgress', 'updateWizardSummary', 'setStatus', 'setBusy',
  'validateDraft', 'renderDashboard', 'save',
];
function harness(options = {}) {
  const calls = [], navigations = [], confirmations = [];
  const context = {
    URL, Number, String, Boolean, Date, Intl, Set, JSON,
    document: { createElement: tag => new Node(tag) },
    state: {
      data: dashboard(), busy: false, conflict: false, currentStep: 2,
      rulesViewedVersion: '', responsibilityViewedVersion: '',
      entries: [], entriesLoaded: true, entriesBusy: false, entrantQuery: '', entrantFilter: 'all',
      suppressedTestedDrawIds: new Set(), initialStepSelected: true,
    },
    root: new Node(), wizardButtons: [],
    renderDrawControls() {}, renderEntrants() {}, renderDrawHistory() {}, renderReviewControls() {},
    loadEntrants() { throw new Error('Unexpected automatic contact request'); },
    window: { confirm: message => { confirmations.push(message); return true; } },
  };
  for (const name of [
    'status', 'workspace', 'appReviewFixtureNotice', 'emailTestFixtureNotice',
    'enabled', 'description', 'prizeValue',
    'legalAccepted', 'vendorResponsibilityDisclosure', 'vendorResponsibilityDetails',
    'rulesLink', 'acceptanceState', 'eligibility', 'entryClose', 'drawAt', 'odds',
    'saveButton', 'reloadButton', 'materialLock', 'entryCount', 'entryCountLabel',
    'selectionPoolCount', 'excludedCount', 'participationReportButton', 'entriesReloadButton',
    'reviewConfirmButton', 'reviewReplaceButton', 'drawStatusLabel', 'drawStatus',
    'drawButton', 'emailNotice', 'wizardState1', 'wizardState2', 'wizardState3', 'wizardState4',
    'entrants', 'entryManagementLock', 'entrantVisibleCount', 'entryStatus',
  ]) context[name] = new Node();
  context.description.value = originalDescription;
  context.enabled.helpNode = new Node('small');
  context.prizeValue.value = '500.00';
  context.showWizardStep = (step, settings) => {
    navigations.push({ step, settings }); context.state.currentStep = Number(step);
  };
  context.request = async (_, action, body) => {
    calls.push({ action, body });
    return options.request ? options.request(action, body) : responseFor(body);
  };
  vm.createContext(context);
  vm.runInContext(commonFunctions.map(functionSource).join('\n'), context);
  vm.runInContext(`globalThis.changeAgreement = ${listenerSource('legalAccepted', 'change')};`, context);
  return { context, calls, navigations, confirmations };
}

test('the shipped website JavaScript parses and inputs remain manual-save', () => {
  assert.equal(parsed.parseDiagnostics.length, 0);
  const { context, calls } = harness();
  for (const name of ['description', 'prizeValue']) {
    vm.runInContext(`(${listenerSource(name, 'input')})()`, context);
  }
  assert.equal(calls.length, 0);
  assert.equal(context.saveButton.textContent, 'Save and continue');
  assert.match(context.enabled.helpNode.textContent, /^Off:/);
  assert.equal(listenerSource('saveButton', 'click'), 'save');
});

test('PHP keeps one agreement outside collapsed details, full responsibilities inside, and selectors unique', () => {
  const start = template.indexOf('<details class="ww-qrvd-rules-details">');
  assert.ok(start >= 0);
  let depth = 0, end = -1;
  for (const token of template.slice(start).matchAll(/<\/?details\b[^>]*>/g)) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (depth === 0) { end = start + token.index + token[0].length; break; }
  }
  assert.ok(end > start);
  const details = template.slice(start, end);
  assert.doesNotMatch(details.slice(0, details.indexOf('>')), /\bopen\b/);
  assert.match(details, /data-role="vendor-responsibility-disclosure"/);
  assert.match(details, /authorized to do so for this vendor/);
  assert.match(details, /data-role="rules-link"/);
  assert.ok(template.indexOf('data-field="legal_terms_accepted"') > end);
  assert.match(template, /I have read and agree to the rules above\./);
  for (const match of source.matchAll(/find\('\[(data-(?:role|field|action)="[^"]+")\]'\)/g)) {
    assert.equal(template.split(match[1]).length - 1, 1, `${match[1]} must appear exactly once`);
  }
  for (const attribute of ['data-wizard-step', 'data-wizard-panel']) {
    for (const step of [1, 2, 3, 4]) assert.equal(template.split(`${attribute}="${step}"`).length - 1, 1);
  }
});

test('initial load restores only an exact separate title and preserves existing multiline text', () => {
  const { context: c } = harness();
  assert.equal(c.formatPrizeDraftDescription('Gift', 'Gift Conditions apply.'), 'Gift\nConditions apply.');
  assert.equal(c.formatPrizeDraftDescription('Gift', 'Giftbox with bow'), 'Giftbox with bow');
  assert.equal(c.formatPrizeDraftDescription('Gift', 'A different prize'), 'A different prize');
  assert.equal(c.formatPrizeDraftDescription('Gift', 'Gift\nConditions\nDetails'), 'Gift\nConditions\nDetails');
  c.renderDashboard(dashboard());
  assert.equal(c.description.value, originalDescription.split('\n')[0] + '\nMaximum savings $500. No real prize.');
});

test('closed Save and continue preserves multiline/currency and advances once to Couples', async () => {
  const { context: c, calls, navigations } = harness();
  await c.save();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'vendor_raffle_update');
  assert.equal(calls[0].body.settings_updated_at, before);
  assert.equal(calls[0].body.prize_title, originalDescription.split('\n')[0]);
  assert.equal(calls[0].body.legal_terms_accepted, false);
  assert.equal(c.description.value, originalDescription);
  assert.equal(c.prizeValue.value, '500.00');
  assert.equal(c.state.data.settings.updated_at, after);
  assert.equal(c.state.currentStep, 3);
  assert.equal(navigations.length, 1);
  assert.equal(c.status.textContent, 'Saved. Your draw is closed for now.');
});

test('one checkbox accepts all required current rules; opening still needs the checkbox and valid prize', async () => {
  const { context: c, calls } = harness();
  c.enabled.checked = true;
  await c.save();
  assert.equal(calls.length, 0);
  assert.equal(c.state.currentStep, 2);
  c.legalAccepted.checked = true;
  c.changeAgreement();
  assert.equal(c.acceptanceState.textContent, 'Ready to save');
  assert.equal(c.enabled.helpNode.textContent, 'Save and continue to let couples enter your draw.');
  c.prizeValue.value = '0';
  assert.equal(c.validateDraft().step, 1);
  c.prizeValue.value = '500.00';
  await c.save();
  assert.equal(calls.length, 1);
  for (const key of ['legal_terms_accepted', 'rules_viewed', 'vendor_responsibility_acknowledged', 'apple_non_sponsor_acknowledged']) {
    assert.equal(calls[0].body[key], true, key);
  }
  assert.equal(calls[0].body.consent_version, rulesVersion);
  assert.equal(calls[0].body.vendor_responsibility_disclosure, c.state.data.vendor_responsibility_disclosure);
  assert.equal(c.acceptanceState.textContent, 'Agreed');
  assert.equal(c.enabled.helpNode.textContent, 'Couples can now choose to enter your draw.');
  assert.equal(c.state.currentStep, 3);
});

test('unavailable disclosures, untrusted links and a changed rules version cannot open a draw', () => {
  for (const patch of [
    { vendor_responsibility_disclosure: '' },
    { terms_url: 'https://example.com/rules' },
    { rules_version: '' },
  ]) {
    const { context: c } = harness();
    Object.assign(c.state.data, patch);
    c.enabled.checked = true; c.legalAccepted.checked = true; c.changeAgreement();
    assert.equal(c.legalAccepted.checked, false);
    assert.ok(c.validateDraft());
  }
  const { context: c } = harness();
  c.enabled.checked = true; c.legalAccepted.checked = true; c.changeAgreement();
  c.state.data.rules_version = 'new-rules';
  assert.ok(c.validateDraft());
});

test('rapid duplicate saves make one request and later edits survive its response', async () => {
  const waiting = deferred();
  const { context: c, calls, navigations } = harness({ request: () => waiting.promise });
  const saving = c.save();
  await c.save(); await c.save();
  assert.equal(calls.length, 1);
  c.description.value += '\nA newly typed condition.';
  c.prizeValue.value = '400.00';
  waiting.resolve(responseFor(calls[0].body));
  await saving;
  assert.ok(c.description.value.endsWith('A newly typed condition.'));
  assert.equal(c.prizeValue.value, '400.00');
  assert.equal(c.state.data.settings.updated_at, after);
  assert.equal(navigations.length, 0);
  assert.match(c.status.textContent, /latest edits/);
});

test('changed server wording is authoritative rather than falsely preserving an old draft', async () => {
  const { context: c } = harness({ request: (_, body) => responseFor(body, {
    prize_description: 'A changed prize description', prize_title: 'A changed prize', prize_approx_value_cad: 250,
  }) });
  await c.save();
  assert.equal(c.description.value, 'A changed prize\ndescription');
  assert.equal(c.prizeValue.value, '250');
});

test('winner-email lock submits canonical prize fields, while timestamps and locks refresh', async () => {
  const { context: c, calls } = harness({ request: (_, body) => responseFor(body, {}, { material_terms_locked: true, prize_details_locked: true }) });
  c.state.data.material_terms_locked = true;
  c.state.data.prize_details_locked = true;
  c.description.value = 'Unsaved attempted replacement';
  c.prizeValue.value = '999';
  await c.save();
  assert.equal(calls[0].body.prize_description, normalized(originalDescription));
  assert.equal(calls[0].body.prize_title, originalDescription.split('\n')[0]);
  assert.equal(calls[0].body.prize_approx_value_cad, 500);
  assert.equal(calls[0].body.max_winners, 1);
  assert.equal(calls[0].body.exclude_previous_winners, true);
  for (const key of ['description', 'prizeValue']) assert.equal(c[key].disabled, true);
  assert.equal(c.state.data.settings.updated_at, after);
});

test('one winner is fixed in every save without winner-count or repeat-winner controls', async () => {
  assert.doesNotMatch(template, /data-field="(?:max_winners|exclude_previous_winners)"|Number of winners|A different couple each time/);
  assert.doesNotMatch(source, /\bmaxWinners\b|\bexcludePreviousWinners\b/);
  const { context: c, calls } = harness();
  c.state.data.settings.max_winners = 3;
  c.state.data.settings.exclude_previous_winners = false;
  await c.save();
  assert.equal(calls[0].body.max_winners, 1);
  assert.equal(calls[0].body.exclude_previous_winners, true);
  assert.equal(c.configuredWinnerCount(), 1);
});

test('opening or selecting a winner does not lock prize edits before the email is sent', async () => {
  for (const draw of [null, { id: 'potential', selection_status: 'potential' }, { id: 'verified', selection_status: 'verified', notice_complete: false }]) {
    const { context: c, calls } = harness();
    c.renderDashboard(dashboard({ material_terms_locked: true, prize_details_locked: false, draws: draw ? [draw] : [] }));
    assert.equal(c.description.disabled, false);
    assert.equal(c.prizeValue.disabled, false);
    c.description.value = 'Updated gift\nUpdated conditions'; c.prizeValue.value = '750';
    await c.save();
    assert.equal(calls[0].body.prize_title, 'Updated gift');
    assert.equal(calls[0].body.prize_description, 'Updated gift\nUpdated conditions');
    assert.equal(calls[0].body.prize_approx_value_cad, 750);
    assert.equal(calls[0].body.max_winners, 1);
  }
});

test('older responses fail safe and the authoritative email flag locks or unlocks only prize fields', () => {
  const { context: c } = harness();
  for (const value of [undefined, null, 'false', true]) {
    c.renderDashboard(dashboard({ material_terms_locked: true, prize_details_locked: value }));
    assert.equal(c.description.disabled, true);
    assert.equal(c.prizeValue.disabled, true);
    assert.equal(c.materialLock.classList.contains('is-hidden'), false);
  }
  c.renderDashboard(dashboard({ material_terms_locked: true, prize_details_locked: false }));
  assert.equal(c.description.disabled, false);
  assert.equal(c.prizeValue.disabled, false);
  assert.equal(c.materialLock.classList.contains('is-hidden'), true);
  c.renderDashboard(dashboard({ material_terms_locked: false, prize_details_locked: true }));
  assert.equal(c.description.disabled, true);
  assert.equal(c.prizeValue.disabled, true);
  assert.equal(c.legalAccepted.disabled, false);
});

test('prize lock copy distinguishes sending, sent and unconfirmed delivery', () => {
  const { context: c } = harness();
  for (const [reason, copy] of [
    ['sending', 'The winner email is being sent. Prize details are temporarily locked.'],
    ['sent', 'Prize details are locked because the winner email has been sent.'],
    ['unconfirmed', 'Email delivery is being checked. Prize details are temporarily locked.'],
    [null, 'Prize details are currently locked. Refresh to check their status.'],
  ]) {
    c.renderDashboard(dashboard({ prize_details_locked: true, prize_details_lock_reason: reason }));
    assert.equal(c.description.disabled, true);
    assert.equal(c.prizeValue.disabled, true);
    assert.equal(c.materialLock.textContent, copy);
  }
});

test('409 preserves the visible unsaved draft and current step, updates metadata and requires reload', async () => {
  const conflict = Object.assign(new Error('Changed elsewhere.'), {
    status: 409, data: dashboard({ settings: { ...dashboard().settings, updated_at: after }, material_terms_locked: true, prize_details_locked: true }),
  });
  const { context: c, calls, navigations } = harness({ request: () => { throw conflict; } });
  c.state.currentStep = 1;
  await c.save();
  assert.equal(c.state.conflict, true);
  assert.equal(c.state.currentStep, 1);
  assert.equal(navigations.length, 0);
  assert.equal(c.description.value, originalDescription);
  assert.equal(c.state.data.settings.updated_at, after);
  assert.equal(c.description.disabled, true);
  assert.equal(c.saveButton.disabled, true);
  assert.equal(c.reloadButton.classList.contains('is-hidden'), false);
  await c.save();
  assert.equal(calls.length, 1);
});

test('a failed or incomplete save keeps the draft and cannot advance or report success', async () => {
  for (const request of [() => ({ ok: true }), () => { throw new Error('Offline'); }]) {
    const { context: c, navigations } = harness({ request });
    await c.save();
    assert.equal(c.description.value, originalDescription);
    assert.equal(c.state.data.settings.updated_at, before);
    assert.equal(navigations.length, 0);
    assert.equal(c.status.classList.contains('is-error'), true);
    assert.equal(c.state.busy, false);
  }
});

test('Step 3 shows contacts without raw IDs, retains protected actions and filters accurately', () => {
  const { context: c } = harness();
  vm.runInContext([
    'entryValue', 'pendingPotentialWinner', 'entrantSelectionDetails', 'entrantInitials',
    'formatWeddingDate', 'appendContactItem', 'renderEntrants',
  ].map(functionSource).join('\n'), c);
  c.state.entries = [
    { name: 'Test Couple', email: 'couple@example.invalid', phone: '905-555-0100', wedding_date: '2027-03-10', participant_reference: 'PROTECTED-DO-NOT-DISPLAY', included: true, pool_status: 'included' },
    { name: 'Previous Couple', email: 'previous@example.invalid', participant_reference: 'PREVIOUS-PRIVATE-ID', included: true, pool_status: 'previous_winner', pool_status_reason: 'INTERNAL-DATABASE-STATUS-DO-NOT-DISPLAY' },
    { name: 'Removed Couple', email: 'removed@example.invalid', participant_reference: 'REMOVED-PRIVATE-ID', included: false, pool_status: 'excluded' },
  ];
  c.renderEntrants();
  assert.match(c.entrants.textContent, /couple@example.invalid/);
  assert.match(c.entrants.textContent, /905-555-0100/);
  assert.doesNotMatch(c.entrants.textContent, /PROTECTED-|PRIVATE-ID|Entry reference|database/i);
  let buttons = descendants(c.entrants).filter(node => node.dataset.action === 'entry-update');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].dataset.participantReference, 'PROTECTED-DO-NOT-DISPLAY');
  assert.equal(buttons[0].textContent, 'Remove from draw');
  assert.equal(buttons[1].textContent, 'Add back to draw');
  assert.match(c.entrants.textContent, /contact details stay in your download/);
  c.state.entrantQuery = '905-555'; c.renderEntrants();
  assert.equal(c.entrantVisibleCount.textContent, 'Showing 1 of 3 contacts');
  c.state.entrantQuery = ''; c.state.entrantFilter = 'excluded'; c.renderEntrants();
  assert.equal(c.entrantVisibleCount.textContent, 'Showing 2 of 3 contacts');
  c.state.data.selection_in_progress = true; c.renderEntrants();
  buttons = descendants(c.entrants).filter(node => node.dataset.action === 'entry-update');
  assert.ok(buttons.every(node => node.disabled));
});

test('Step 3 displays optional wedding venues and searches both canonical and legacy entry keys', () => {
  const { context: c } = harness();
  vm.runInContext([
    'entryValue', 'pendingPotentialWinner', 'entrantSelectionDetails', 'entrantInitials',
    'formatWeddingDate', 'appendContactItem', 'renderEntrants',
  ].map(functionSource).join('\n'), c);
  c.state.entries = [
    { name: 'First Couple', wedding_venue: 'Garden Hall', included: true, pool_status: 'included' },
    { couple_name: 'Second Couple', couple_wedding_venue: 'Lake Resort', included: true, pool_status: 'included' },
    { name: 'No Venue Couple', included: true, pool_status: 'included' },
  ];
  c.renderEntrants();
  assert.match(c.entrants.textContent, /Wedding venue.*Garden Hall/);
  assert.match(c.entrants.textContent, /Wedding venue.*Lake Resort/);
  assert.match(c.entrants.textContent, /Wedding venue.*Not provided/);
  for (const query of ['garden', 'LAKE']) {
    c.state.entrantQuery = query; c.renderEntrants();
    assert.equal(c.entrantVisibleCount.textContent, 'Showing 1 of 3 contacts');
  }
});

test('winner gates still enforce pool, timing, pending review, one winner and separate email', async () => {
  const { context: c, calls } = harness();
  vm.runInContext(['renderDrawControls', 'drawPotentialWinner', 'sendWinnerNotice'].map(functionSource).join('\n'), c);
  for (const patch of [
    { can_draw: false, eligible_entry_count: 1 },
    { can_draw: true, eligible_entry_count: 0 },
    { can_draw: true, eligible_entry_count: 1, draw_limit_reached: true },
    { can_draw: true, eligible_entry_count: 1, draws: [{ id: 'pending', selection_status: 'potential' }] },
  ]) {
    c.state.data = dashboard(patch); c.renderDrawControls();
    assert.equal(c.drawButton.disabled, true);
  }
  c.state.data = dashboard({ can_draw: true, eligible_entry_count: 2 });
  c.renderDrawControls(); assert.equal(c.drawButton.disabled, false);
  assert.equal(c.drawButton.textContent, 'Select potential winner');
  await c.sendWinnerNotice('not-a-verified-selection');
  assert.equal(calls.length, 0);
  assert.match(c.status.textContent, /Winner email is not available/);
});

test('replaced couples stay visible as protected contact history without reason or management inputs', () => {
  for (const flags of [
    { included: true, pool_status: 'replaced', can_update: false },
    { included: false, pool_status: 'replaced', can_update: true },
    { included: true, selection_status: 'replaced', can_update: true },
    { included: true, pool_status: 'reacceptance_required', selection_status: 'replaced', can_update: false },
  ]) {
    const { context: c } = harness();
    vm.runInContext([
      'entryValue', 'pendingPotentialWinner', 'entrantSelectionDetails', 'entrantInitials',
      'formatWeddingDate', 'appendContactItem', 'renderEntrants',
    ].map(functionSource).join('\n'), c);
    c.state.entries = [{
      name: 'Earlier Fictional Couple', email: 'earlier@example.invalid', phone: '905-555-0112',
      participant_reference: 'PRIVATE-REPLACED-REFERENCE', ...flags,
    }];
    c.renderEntrants();
    const details = c.entrantSelectionDetails(c.state.entries[0]);
    assert.equal(details.selectionProtected, true); assert.equal(details.inSelectionPool, false);
    assert.equal(details.replaced, true); assert.equal(details.disqualified, false);
    assert.match(c.entrants.textContent, /Earlier Fictional Couple/);
    assert.match(c.entrants.textContent, /earlier@example.invalid/); assert.match(c.entrants.textContent, /905-555-0112/);
    assert.match(c.entrants.textContent, /Another couple selected/);
    assert.match(c.entrants.textContent, /Another couple was chosen\. Their contact details stay here and in your download\./);
    assert.match(c.entrants.textContent, /View details/);
    assert.doesNotMatch(c.entrants.textContent, /Reason to remove|Manage entry|Add back|Remove from draw|Not eligible|PRIVATE-REPLACED/);
    assert.equal(descendants(c.entrants).filter(node => node.dataset.action === 'entry-update' || node.dataset.role === 'exclude-reason').length, 0);
    c.state.entrantFilter = 'included'; c.renderEntrants();
    assert.equal(c.entrantVisibleCount.textContent, 'Showing 0 of 1 contacts');
    c.state.entrantFilter = 'excluded'; c.renderEntrants();
    assert.equal(c.entrantVisibleCount.textContent, '1 contact');
  }
});

test('contact loading clears duplicate success/empty messages but keeps actionable errors', async () => {
  const { context: c } = harness({ request: () => ({ entries: [], entrant_count: 0, eligible_entry_count: 0 }) });
  vm.runInContext(['applyEntrantData', 'loadEntrants'].map(functionSource).join('\n'), c);
  await c.loadEntrants();
  assert.equal(c.entryStatus.textContent, '');
  assert.equal(c.entryCount.textContent, '0');
  assert.equal(c.state.entriesBusy, false);
  c.request = async () => { throw new Error('Please retry this connection.'); };
  await c.loadEntrants();
  assert.equal(c.entryStatus.textContent, 'Please retry this connection.');
  assert.equal(c.entryStatus.classList.contains('is-error'), true);
});

test('an empty authorized contact export shows friendly copy without downloading a file', async () => {
  const waiting = deferred();
  const { context: c, calls } = harness({ request: () => waiting.promise });
  let downloads = 0;
  c.downloadCsv = () => { downloads += 1; };
  c.state.data.vendor.user_id = 'fictional-vendor-member';
  c.state.data.event_revision = 1;
  vm.runInContext(functionSource('downloadParticipationReport'), c);
  const exporting = c.downloadParticipationReport();
  assert.equal(c.status.textContent, 'Preparing your contact list…');
  assert.equal(c.state.busy, true);
  assert.equal(calls[0].action, 'vendor_raffle_export');
  assert.equal(calls[0].body.client_platform, 'website');
  waiting.resolve({ report: {
    contains_contact_data: true, contact_share_scope: 'named_vendor_draw_administration',
    marketing_consent_included: true, report_kind: 'named_vendor_draw_contacts',
    mime_type: 'text/csv;charset=utf-8', rules_version: rulesVersion,
    event_key: 'unit-test-event', event_revision: 1, vendor_bingo_id: 'fictional-vendor',
    vendor_bd_user_id: 'fictional-vendor-member', vendor_name: 'Test Vendor',
    csv: 'Name,Email,Phone\n', row_count: 0,
  } });
  await exporting;
  assert.equal(c.status.textContent, 'No couples have entered your draw yet.');
  assert.equal(c.status.classList.contains('is-success'), true);
  assert.equal(c.state.busy, false);
  assert.equal(downloads, 0);
});

test('failed contact-export privacy checks still prevent downloads with a friendly error', async () => {
  const { context: c } = harness({ request: () => ({ report: {
    contains_contact_data: true, contact_share_scope: 'named_vendor_draw_administration',
    marketing_consent_included: true, report_kind: 'named_vendor_draw_contacts',
    mime_type: 'text/csv;charset=utf-8', rules_version: rulesVersion,
    event_key: 'unit-test-event', event_revision: 1, vendor_bingo_id: 'a-different-vendor',
    vendor_bd_user_id: 'fictional-vendor-member', vendor_name: 'Test Vendor',
    csv: 'Name,Email,Phone\nFictional,couple@example.invalid,9055550100\n', row_count: 1,
  } }) });
  let downloads = 0;
  c.downloadCsv = () => { downloads += 1; };
  c.state.data.vendor.user_id = 'fictional-vendor-member';
  c.state.data.event_revision = 1;
  vm.runInContext(functionSource('downloadParticipationReport'), c);
  await c.downloadParticipationReport();
  assert.equal(c.status.textContent, 'Could not download your contacts. Please try again.');
  assert.equal(c.status.classList.contains('is-error'), true);
  assert.equal(c.state.busy, false);
  assert.equal(downloads, 0);
});

function winnerHarness(options = {}) {
  const h = harness({ request: options.request || (() => replacementDashboard()) });
  const c = h.context;
  c.draws = new Node();
  c.state.data = dashboard({ draws: [pendingDraw()] });
  vm.runInContext(['pendingPotentialWinner', 'currentPendingSelectionId', 'renderDrawHistory', 'sendWinnerNotice', 'replacePotentialWinner'].map(functionSource).join('\n'), c);
  c.renderDashboard = data => { c.state.data = data; c.renderDrawHistory(); };
  return h;
}
function pendingDraw(patch = {}) {
  return { id: 'unit-review', selection_status: 'potential', winner_name: 'Fictional Couple', winner_email: 'couple@example.invalid', can_confirm_and_send_notice: true, ...patch };
}
function replacementDashboard(patch = {}) {
  return dashboard({ draws: [
    pendingDraw({ selection_status: 'replaced', can_confirm_and_send_notice: false }),
    pendingDraw({ id: 'unit-replacement', winner_name: 'Different Fictional Couple' }),
  ], ...patch });
}
test('Step4 has no verification form or fabricated evidence; the selected card holds both actions', () => {
  const step4 = template.slice(template.indexOf('id="ww-qrvd-panel-winner"'));
  assert.doesNotMatch(step4, /review-panel|review-eligibility|review-verification|review-evidence|review-confirm|review-rules-release|type="checkbox"|Disqualification reason/);
  assert.doesNotMatch(source, /reviewDrawId|reviewVerification|reviewPotentialWinner|renderReviewControls|skill_testing_completed_externally|review_notes:|Date:.*review|Method:.*review/);
  assert.doesNotMatch(source, /Check your winner|Complete the checks below|after completing the checks/);
  const h = winnerHarness(); h.context.renderDrawHistory();
  const buttons = descendants(h.context.draws).filter(n => n.dataset.action);
  assert.deepEqual(buttons.map(n => n.dataset.action), ['replace-winner', 'send-notice']);
  assert.ok(buttons.every(n => !n.disabled && n.dataset.drawId === 'unit-review'));
  assert.match(h.context.draws.textContent, /Fictional Couple|couple@example.invalid/);
});
test('send shows exact recipient and completed rules checks, then sends only explicit confirmation', async () => {
  const h = winnerHarness({ request: () => dashboard({ draws: [pendingDraw({ selection_status: 'verified', can_send_notice: false, notice_complete: true })] }) });
  await h.context.sendWinnerNotice('unit-review');
  assert.equal(h.confirmations.length, 1);
  assert.match(h.confirmations[0], /I confirm my business has completed the required checks in the Draw Rules/);
  assert.match(h.confirmations[0], /couple@example.invalid/);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [{ action: 'vendor_raffle_send_notice', body: { draw_id: 'unit-review', winner_checks_confirmed: true, client_platform: 'website' } }]);
});
test('missing flags, recipient, stale id, and cancelled confirmation never send', async () => {
  for (const patch of [{ can_confirm_and_send_notice: false }, { can_confirm_and_send_notice: undefined }, { winner_email: '' }, { selection_status: 'replaced' }]) {
    const h = winnerHarness(); h.context.state.data.draws = [pendingDraw(patch)]; await h.context.sendWinnerNotice('unit-review'); assert.equal(h.calls.length, 0);
  }
  const h = winnerHarness(); h.context.window.confirm = () => false;
  await h.context.sendWinnerNotice('unit-review'); await h.context.sendWinnerNotice('old-id'); assert.equal(h.calls.length, 0);
});
test('rapid sends and replacement taps issue one mutation only', async () => {
  const wait = deferred(); const h = winnerHarness({ request: () => wait.promise });
  const first = h.context.sendWinnerNotice('unit-review');
  await h.context.sendWinnerNotice('unit-review'); await h.context.replacePotentialWinner('unit-review');
  assert.equal(h.calls.length, 1); assert.equal(h.context.state.busy, true);
  assert.ok(descendants(h.context.draws).filter(n => n.dataset.action).every(n => n.disabled));
  wait.resolve(dashboard({ draws: [pendingDraw({ selection_status: 'verified', can_send_notice: false, notice_complete: true })] }));
  await first; assert.equal(h.context.state.busy, false);
});
test('send failure displays authoritative verified state and retry never reselects', async () => {
  const current = dashboard({ draws: [pendingDraw({ selection_status: 'verified', can_send_notice: true, email_error: 'Delivery temporarily unavailable' })] });
  const failure = Object.assign(new Error('Delivery temporarily unavailable'), { data: current });
  const h = winnerHarness({ request: () => { throw failure; } });
  await h.context.sendWinnerNotice('unit-review');
  assert.equal(h.context.state.data, current); assert.equal(h.context.state.data.draws[0].selection_status, 'verified');
  h.context.request = async (_, action, body) => { h.calls.push({ action, body }); return current; };
  await h.context.sendWinnerNotice('unit-review'); assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.action === 'vendor_raffle_send_notice'));
});
test('suppressed AppReview uses its distinct per-draw permission and clearly promises no delivery', async () => {
  const h = winnerHarness({ request: () => dashboard({ outbound_email_suppressed: true, draws: [pendingDraw({ selection_status: 'verified' })] }) });
  h.context.state.data.outbound_email_suppressed = true;
  h.context.state.data.draws = [pendingDraw({ can_confirm_and_send_notice: false, can_confirm_and_test_suppressed_notice: true })];
  h.context.renderDrawHistory(); await h.context.sendWinnerNotice('unit-review');
  assert.equal(h.calls.length, 1); assert.match(h.confirmations[0], /couple@example.invalid.*will not be delivered/);
  assert.equal(h.context.state.suppressedTestedDrawIds.has('unit-review'), true);
});
test('replacement uses the exact current pending record with no form, reason, confirmation evidence, or email', async () => {
  const h = winnerHarness(); await h.context.replacePotentialWinner('unit-review');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [{ action: 'vendor_raffle_replace', body: { draw_id: 'unit-review' } }]);
  assert.equal(h.context.currentPendingSelectionId(), 'unit-replacement'); assert.equal(h.context.state.entriesLoaded, false);
  assert.match(h.context.status.textContent, /different couple was selected.*No email was sent/);
});
test('replacement cancellation, old id and verified record cannot mutate', async () => {
  for (const change of [c => { c.window.confirm = () => false; }, c => { c.state.data.draws[0].selection_status = 'verified'; }]) {
    const h = winnerHarness(); change(h.context); await h.context.replacePotentialWinner('unit-review'); assert.equal(h.calls.length, 0);
  }
  const h = winnerHarness(); await h.context.replacePotentialWinner('stale'); assert.equal(h.calls.length, 0);
});
test('rapid replacement and send share a single-flight lock', async () => {
  const wait = deferred(); const h = winnerHarness({ request: () => wait.promise });
  const first = h.context.replacePotentialWinner('unit-review');
  await h.context.replacePotentialWinner('unit-review'); await h.context.sendWinnerNotice('unit-review');
  assert.equal(h.calls.length, 1); wait.resolve(replacementDashboard()); await first;
  assert.equal(h.context.currentPendingSelectionId(), 'unit-replacement');
});
test('no alternate preserves current winner and contacts, without pretending a new selection', async () => {
  const failure = Object.assign(new Error('No alternative'), { status: 409, data: { code: 'no_replacement_available' } });
  const h = winnerHarness({ request: () => { throw failure; } }); const current = h.context.state.data;
  h.context.state.entries = [{ id: 'contact' }]; await h.context.replacePotentialWinner('unit-review');
  assert.equal(h.context.state.data, current); assert.equal(h.context.state.entries[0].id, 'contact');
  assert.equal(h.context.currentPendingSelectionId(), 'unit-review'); assert.match(h.context.status.textContent, /current selection is unchanged/);
});
test('incomplete or foreign replacement responses cannot overwrite current selection', async () => {
  for (const result of [replacementDashboard({ vendor: undefined }), replacementDashboard({ event_key: 'foreign' }), replacementDashboard({ settings: undefined }), replacementDashboard({ draws: [pendingDraw()] })]) {
    const h = winnerHarness({ request: () => result }); const current = h.context.state.data;
    await h.context.replacePotentialWinner('unit-review'); assert.equal(h.context.state.data, current); assert.match(h.context.status.textContent, /could not be verified/);
  }
});
test('late replacement cannot overwrite changed dashboard context', async () => {
  const wait = deferred(); const h = winnerHarness({ request: () => wait.promise });
  const first = h.context.replacePotentialWinner('unit-review'); h.context.state.data = dashboard({ event_key: 'other' }); const newer = h.context.state.data;
  wait.resolve(replacementDashboard()); await first; assert.equal(h.context.state.data, newer); assert.match(h.context.status.textContent, /displayed draw has changed/);
});

test('actual history click handler routes replacement and send buttons with their exact draw ids', async () => {
  for (const action of ['replace-winner', 'send-notice']) {
    const h = winnerHarness(); const c = h.context;
    c.Element = Node; c.draws.contains = node => descendants(c.draws).includes(node);
    vm.runInContext('globalThis.historyClick = ' + listenerSource('draws', 'click'), c);
    c.renderDrawHistory();
    const button = descendants(c.draws).find(n => n.dataset.action === action);
    assert.ok(button); c.historyClick({ target: button });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].action, action === 'replace-winner' ? 'vendor_raffle_replace' : 'vendor_raffle_send_notice');
    assert.equal(h.calls[0].body.draw_id, 'unit-review');
  }
});

test('late or foreign email responses cannot replace a newer displayed dashboard', async () => {
  for (const reject of [false, true]) {
    const wait = deferred(); const h = winnerHarness({ request: () => wait.promise }); const c = h.context;
    const sending = c.sendWinnerNotice('unit-review'); c.state.data = dashboard({ event_key: 'newer-event' }); const newer = c.state.data;
    const result = dashboard({ draws: [pendingDraw({ selection_status: 'verified', can_send_notice: true })] });
    if (reject) wait.reject(Object.assign(new Error('Email failed'), { data: result }));
    else wait.resolve(result);
    await sending; assert.equal(c.state.data, newer); assert.equal(c.state.busy, false); assert.equal(h.calls.length, 1);
  }
});

test('linked rules keep the question obligation while replacing technical answer scoring with vendor attestation', () => {
  for (const file of ['about-terms.html', 'qr-bingo-official-rules.html']) {
    const legal = readFileSync(new URL(`../brilliant-directories/pages/${file}`, import.meta.url), 'utf8');
    const copy = normalized(legal.replace(/<[^>]*>/g, ''));
    assert.match(copy, /must correctly answer one short mathematical skill-testing question without assistance/);
    assert.match(copy, /question is not part of entry/);
    assert.match(copy, /does not change the odds/);
    assert.match(copy, /outside WeddingWin/);
    assert.match(copy, /records the vendor's attestation that the required check was completed/);
    assert.match(copy, /does not administer the question, evaluate the answer, or certify the result/);
    assert.doesNotMatch(copy, /compares the answer|stored answer|technical record shows the required eligibility and skill-testing verification/);
  }
});

test('public rules match one winner and prize editing before email without removing replacement or history', () => {
  const legal = readFileSync(new URL('../brilliant-directories/pages/qr-bingo-official-rules.html', import.meta.url), 'utf8');
  const copy = normalized(legal.replace(/<[^>]*>/g, ''));
  assert.match(copy, /Each draw has one winner\./);
  assert.match(copy, /selects one potential winner at random/);
  assert.match(copy, /may edit the prize title, description, and value until the winner email starts sending/);
  assert.match(copy, /stay locked while the email is sending and after it has been sent/);
  assert.match(copy, /Eligibility, event dates, entry limits, and the other draw terms remain locked/);
  assert.match(copy, /Choose a different winner before confirming the current selection/);
  assert.match(copy, /The previous selection and contact details are kept\./);
  assert.match(copy, /remains in the vendor's complete entrant CSV and the audit record/);
  assert.doesNotMatch(copy, /one, two, or three|permits repeat winners|Prize and draw terms are locked after/);
});

// These are local UI response fixtures, not created accounts or email sends.
// The database selector is tested separately against its actual SQL transaction.
const drawTwentyCouples = Array.from({ length: 20 }, (_, index) => {
  const suffix = String(index + 1).padStart(2, '0');
  return {
    couple_name: `Fictional Draw Couple ${suffix}`,
    couple_email: `draw-couple-${suffix}@example.invalid`,
    couple_phone: `905-555-01${suffix}`,
    participant_reference: `PRIVATE-DRAW20-${suffix}`,
    included: true, pool_status: 'included', can_update: true,
  };
});
function drawTwentyWinner(index, patch = {}) {
  const couple = drawTwentyCouples[index];
  return pendingDraw({
    id: `draw20-selection-${index + 1}`, draw_number: 1,
    winner_name: couple.couple_name, winner_email: couple.couple_email,
    winner_phone: couple.couple_phone, ...patch,
  });
}
function drawTwentyDashboard(patch = {}) {
  return dashboard({ entry_count: 20, entrant_count: 20, eligible_entry_count: 20, can_draw: true, ...patch });
}
function drawTwentyHarness(options = {}) {
  const h = winnerHarness(options); const c = h.context;
  vm.runInContext([
    'entryValue', 'entrantSelectionDetails', 'entrantInitials', 'formatWeddingDate',
    'appendContactItem', 'renderEntrants', 'applyEntrantData', 'loadEntrants',
    'renderDrawControls', 'drawPotentialWinner', 'downloadParticipationReport',
  ].map(functionSource).join('\n'), c);
  c.state.data = drawTwentyDashboard();
  c.state.entries = drawTwentyCouples.map(entry => ({ ...entry }));
  c.state.entriesLoaded = true;
  return h;
}

test('20-couple pool displays every distinct synthetic email and name, with exact search and selection filters', () => {
  const h = drawTwentyHarness(); const c = h.context;
  assert.equal(new Set(drawTwentyCouples.map(entry => entry.couple_email)).size, 20);
  c.renderEntrants(); assert.equal(c.entrantVisibleCount.textContent, '20 contacts');
  for (const couple of drawTwentyCouples) {
    assert.ok(c.entrants.textContent.includes(couple.couple_name));
    assert.ok(c.entrants.textContent.includes(couple.couple_email));
    c.state.entrantQuery = couple.couple_email; c.renderEntrants();
    assert.equal(c.entrantVisibleCount.textContent, 'Showing 1 of 20 contacts');
    assert.ok(c.entrants.textContent.includes(couple.couple_name));
    c.state.entrantQuery = ''; c.renderEntrants();
  }
  assert.doesNotMatch(c.entrants.textContent, /PRIVATE-DRAW20/);
  for (const index of [3, 14]) Object.assign(c.state.entries[index], { included: false, pool_status: 'excluded' });
  c.state.entrantFilter = 'excluded'; c.renderEntrants();
  assert.equal(c.entrantVisibleCount.textContent, 'Showing 2 of 20 contacts');
  c.state.entrantFilter = 'included'; c.renderEntrants();
  assert.equal(c.entrantVisibleCount.textContent, 'Showing 18 of 20 contacts');
});

test('each of 20 possible server-returned selections renders the matching pool name/email without sending', async () => {
  const poolEmails = new Set(drawTwentyCouples.map(entry => entry.couple_email));
  for (let index = 0; index < 20; index++) {
    const selected = drawTwentyWinner(index);
    const h = drawTwentyHarness({ request: () => drawTwentyDashboard({ draws: [selected], selection_in_progress: true }) });
    await h.context.drawPotentialWinner();
    assert.deepEqual(h.calls.map(call => call.action), ['vendor_raffle_draw']);
    assert.equal(h.context.state.data.draws[0].winner_email, selected.winner_email);
    assert.ok(poolEmails.has(h.context.state.data.draws[0].winner_email));
    assert.ok(h.context.draws.textContent.includes(selected.winner_name));
    assert.ok(h.context.draws.textContent.includes(selected.winner_email));
    assert.match(h.context.status.textContent, /No email was sent/);
    assert.equal(h.context.drawButton.disabled, true); assert.equal(h.context.drawButton.hidden, true);
  }
});

test('20-couple replacement keeps the earlier selection history and reloads all 20 contact records', async () => {
  const prior = drawTwentyWinner(2), next = drawTwentyWinner(17, { draw_number: 2 });
  const history = [Object.assign({}, prior, { selection_status: 'replaced' }), next];
  const contacts = drawTwentyCouples.map((entry, index) => ({ ...entry,
    pool_status: index === 2 ? 'replaced' : index === 17 ? 'already_selected' : 'included',
  }));
  const h = drawTwentyHarness({ request: action => {
    if (action === 'vendor_raffle_replace') return drawTwentyDashboard({ draws: history, eligible_entry_count: 18 });
    if (action === 'vendor_raffle_entries_get') return { ...drawTwentyDashboard(), entries: contacts, eligible_entry_count: 18, selection_in_progress: true };
    throw new Error('Unexpected action: ' + action);
  } });
  const c = h.context; c.state.data.draws = [prior];
  await c.replacePotentialWinner(prior.id);
  assert.equal(c.currentPendingSelectionId(), next.id);
  assert.equal(c.state.data.draws[0].selection_status, 'replaced');
  assert.notEqual(prior.winner_email, next.winner_email);
  assert.ok(c.draws.textContent.includes(prior.winner_email)); assert.ok(c.draws.textContent.includes(next.winner_email));
  await c.loadEntrants();
  assert.equal(c.state.entries.length, 20); assert.equal(c.entrantVisibleCount.textContent, '20 contacts');
  for (const entry of drawTwentyCouples) assert.ok(c.entrants.textContent.includes(entry.couple_email));
  assert.equal(c.entrantSelectionDetails(c.state.entries[2]).selectionProtected, true);
  assert.deepEqual(h.calls.map(call => call.action), ['vendor_raffle_replace', 'vendor_raffle_entries_get']);
});

test('20-couple pool offers one winner and requires a separate explicit send action', async () => {
  const chosenIndex = 8; let sent = false; const history = [];
  const h = drawTwentyHarness({ request: (action, body) => {
    if (action === 'vendor_raffle_draw') {
      assert.equal(history.length, 0); history.push(drawTwentyWinner(chosenIndex, { draw_number: 1 }));
    } else if (action === 'vendor_raffle_send_notice') {
      assert.equal(body.draw_id, history.at(-1).id); assert.equal(body.winner_checks_confirmed, true);
      history[history.length - 1] = { ...history.at(-1), selection_status: 'verified', can_send_notice: false, notice_complete: true };
      sent = true;
    } else throw new Error('Unexpected action');
    return drawTwentyDashboard({ draws: history.map(draw => ({ ...draw })), eligible_entry_count: 20 - history.length,
      draw_limit_reached: sent, can_draw: !sent && !history.length, prize_details_locked: sent });
  } }); const c = h.context;
  vm.runInContext(functionSource('renderDashboard'), c);
  c.renderDrawControls(); assert.equal(c.drawButton.disabled, false);
  await c.drawPotentialWinner();
  assert.equal(h.calls.filter(call => call.action === 'vendor_raffle_send_notice').length, 0);
  assert.equal(c.drawButton.disabled, true);
  await c.sendWinnerNotice(c.currentPendingSelectionId());
  c.renderDrawControls(); assert.equal(c.configuredWinnerCount(), 1);
  assert.equal(c.verifiedDraws().length, 1); assert.equal(c.drawButton.disabled, true);
  assert.equal(c.drawStatusLabel.textContent, 'Winner chosen');
  assert.equal(c.description.disabled, true); assert.equal(c.prizeValue.disabled, true);
  await c.drawPotentialWinner();
  assert.deepEqual(h.calls.map(call => call.action), ['vendor_raffle_draw', 'vendor_raffle_send_notice']);
  assert.ok(h.confirmations.some(message => message.includes(drawTwentyCouples[chosenIndex].couple_email)));
});

test('legacy multiple-winner records stay visible but cannot create another winner', async () => {
  const history = [1, 8, 16].map((index, position) => drawTwentyWinner(index, {
    draw_number: position + 1, selection_status: 'verified', notice_complete: true, can_send_notice: false,
  }));
  const h = drawTwentyHarness(); const c = h.context;
  c.state.data = drawTwentyDashboard({ draws: history, can_draw: true, draw_limit_reached: false });
  c.state.data.settings.max_winners = 3;
  c.renderDrawControls(); c.renderDrawHistory();
  assert.equal(c.drawButton.disabled, true);
  assert.equal(c.configuredWinnerCount(), 1);
  await c.drawPotentialWinner();
  assert.equal(h.calls.length, 0);
  assert.equal(c.state.data.draws.length, 3);
  for (const draw of history) assert.ok(c.draws.textContent.includes(draw.winner_email));
});

test('20-couple fast-tap stress runs 60 selection/replacement/send attempts but starts one request per pending operation', async () => {
  for (const operation of ['select', 'replace', 'send']) {
    const wait = deferred(); const h = drawTwentyHarness({ request: () => wait.promise }); const c = h.context;
    const current = drawTwentyWinner(0), replacement = drawTwentyWinner(19);
    if (operation !== 'select') c.state.data.draws = [current];
    const run = operation === 'select' ? () => c.drawPotentialWinner()
      : operation === 'replace' ? () => c.replacePotentialWinner(current.id) : () => c.sendWinnerNotice(current.id);
    const pending = Array.from({ length: 60 }, run);
    assert.equal(h.calls.length, 1); assert.equal(c.state.busy, true);
    const draws = operation === 'replace' ? [{ ...current, selection_status: 'replaced' }, replacement]
      : operation === 'send' ? [{ ...current, selection_status: 'verified', can_send_notice: false, notice_complete: true }] : [current];
    wait.resolve(drawTwentyDashboard({ draws })); await Promise.all(pending);
    assert.equal(h.calls.length, 1); assert.equal(c.state.busy, false);
    assert.equal(drawTwentyCouples.length, 20);
  }
});

test('authorized 20-couple CSV export retains every email including replaced and excluded contacts', async () => {
  const csv = 'Name,Email,Phone\n' + drawTwentyCouples.map(entry => [entry.couple_name, entry.couple_email, entry.couple_phone].join(',')).join('\n');
  const report = {
    contains_contact_data: true, contact_share_scope: 'named_vendor_draw_administration', marketing_consent_included: true,
    report_kind: 'named_vendor_draw_contacts', mime_type: 'text/csv;charset=utf-8', rules_version: rulesVersion,
    event_key: 'unit-test-event', event_revision: 1, vendor_bingo_id: 'fictional-vendor', vendor_bd_user_id: 'fictional-member',
    vendor_name: 'Test Vendor', csv, row_count: 20,
  };
  const h = drawTwentyHarness({ request: () => ({ report }) }); const c = h.context; let downloaded;
  c.state.data.vendor.user_id = 'fictional-member'; c.state.data.event_revision = 1;
  c.state.entries[0].pool_status = 'replaced'; c.state.entries[1].included = false; c.state.entries[1].pool_status = 'excluded';
  c.downloadCsv = data => { downloaded = data; };
  await c.downloadParticipationReport();
  assert.equal(downloaded.row_count, 20); assert.equal(downloaded.csv.split('\n').length, 21);
  for (const entry of drawTwentyCouples) assert.ok(downloaded.csv.includes(entry.couple_email));
  assert.deepEqual(h.calls.map(call => call.action), ['vendor_raffle_export']);
});

test('website never reports a vendor delivery from the disabled-channel sent sentinel', async () => {
  for (const emailTestFixture of [false, true]) {
    const outputs = [];
    for (const vendorSentSentinel of [false, true]) {
      const delivered = pendingDraw({
        selection_status: 'verified', can_send_notice: false, notice_complete: true,
        couple_email_sent_at: '2026-09-05T15:00:00.000Z', vendor_email_sent_at: null,
      });
      const h = winnerHarness({ request: () => dashboard({
        email_test_fixture: emailTestFixture,
        email_result: { vendor: { sent: vendorSentSentinel }, couple: { sent: true } },
        draws: [delivered],
      }) });
      await h.context.sendWinnerNotice('unit-review');
      const status = h.context.status.textContent, history = h.context.draws.textContent;
      assert.doesNotMatch(status + history, /both|vendor email sent|email sent to (?:you|your business)|vendor and couple/i);
      assert.match(history, /Winner email sent/);
      assert.equal(h.context.state.data.draws[0].vendor_email_sent_at, null);
      assert.equal(h.context.state.data.draws[0].couple_email_sent_at, delivered.couple_email_sent_at);
      outputs.push({ status, history });
    }
    assert.deepEqual(outputs[0], outputs[1], 'A disabled-channel result sentinel must not change website delivery copy');
  }
  assert.doesNotMatch(functionSource('sendWinnerNotice') + functionSource('renderDrawHistory'), /email_result/);
});
