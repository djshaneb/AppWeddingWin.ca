#!/usr/bin/env node
// Executes the real app callback with mocked transport and state setters.
// No device, account, network, database, credentials or production data is used.
// Run: node --test scripts/test-vendor-draw-autosave.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const appSource = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate) {
  let found;
  function visit(node) {
    if (found) return;
    if (predicate(node)) { found = node; return; }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return found;
}
function variable(name) {
  const node = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(parsed) === name);
  assert.ok(node, `App variable missing: ${name}`);
  return `const ${node.getText(parsed)};`;
}
function functionSource(name) {
  const node = findNode(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `App function missing: ${name}`);
  return node.getText(parsed);
}
function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
}
const saveProgram = transpile([
  functionSource('normalizeRaffleMaxWinners'),
  functionSource('isCompleteVendorRaffleDashboard'),
  variable('vendorRaffleSignature'),
  variable('saveVendorRaffle'),
  'globalThis.tested = { save: saveVendorRaffle, signature: vendorRaffleSignature };',
].join('\n'));
const normalized = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const originalDescription = 'TEST ONLY — 50% off a photography package\nMaximum savings $500. No real prize is awarded.';
const rulesVersion = '2026-09-01-in-person-entry';
const timestampBefore = '2026-09-04T20:00:00.000001Z';
const timestampAfter = '2026-09-04T20:00:01.000002Z';

function dashboard(patch = {}) {
  return {
    ok: true,
    vendor: { id: 'test-vendor', user_id: 'test-vendor', name: 'Fictional Test Vendor' },
    rules_version: rulesVersion,
    vendor_acceptance_current: false,
    material_terms_locked: false,
    settings: {
      enabled: false,
      prize_title: originalDescription.split('\n')[0],
      prize_description: normalized(originalDescription),
      prize_approx_value_cad: 500,
      max_winners: 3,
      exclude_previous_winners: true,
      legal_terms_accepted: false,
      legal_terms_version: rulesVersion,
      updated_at: timestampBefore,
    },
    ...patch,
  };
}
function replyFor(body, settingsPatch = {}, dashboardPatch = {}) {
  return dashboard({
    ...dashboardPatch,
    settings: {
      ...dashboard().settings,
      enabled: body.enabled,
      prize_title: body.prize_title,
      prize_description: normalized(body.prize_description),
      prize_approx_value_cad: body.prize_approx_value_cad || null,
      max_winners: body.max_winners,
      exclude_previous_winners: body.exclude_previous_winners,
      legal_terms_accepted: body.legal_terms_accepted,
      updated_at: timestampAfter,
      ...settingsPatch,
    },
  });
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness(options = {}) {
  const requests = [], alerts = [], hydrations = [];
  const state = {
    nativeSession: { user_id: 'test-vendor', token: 'non-authentic-unit-test-value' },
    vendorRaffle: dashboard(),
    raffleEnabled: false,
    rafflePrizeTitle: originalDescription.split('\n')[0],
    rafflePrizeDescription: originalDescription,
    rafflePrizeApproxValueCad: '500.00',
    raffleMaxWinners: 3,
    raffleExcludePreviousWinners: true,
    raffleLegalAccepted: false,
    vendorRaffleRulesViewedVersion: '',
    vendorRaffleRulesVersion: rulesVersion,
    vendorResponsibilityDisclosure: 'Fictional unit-test disclosure, never sent.',
    vendorRaffleSaveInFlightRef: { current: false },
    vendorRaffleLocalEditGenerationRef: { current: 0 },
    vendorRaffleSaveSeqRef: { current: 0 },
    vendorRaffleLastSavedRef: { current: '' },
    vendorRaffleLastFailedSignatureRef: { current: '' },
    vendorRaffleHydratingRef: { current: false },
    vendorRaffleLoadedRef: { current: true },
    vendorRaffleSaving: false,
    vendorRaffleSaveError: null,
    vendorRaffleSaveMessage: '',
    vendorRaffleError: null,
    accountDeletionIsInFlight: () => false,
    getAccountDeletionGeneration: () => 0,
    accountMutationIsCurrent: () => true,
    useCallback: fn => fn,
    VENDOR_RAFFLE_FUNCTION_URL: 'https://invalid.example/unit-test-only',
    APP_BACKEND_PUBLISHABLE_KEY: 'non-authentic-unit-test-value',
    Platform: { OS: 'ios' },
    Alert: { alert: (...args) => alerts.push(args) },
    ...options.state,
  };
  for (const name of [
    'vendorRaffle', 'raffleEnabled', 'rafflePrizeTitle', 'rafflePrizeDescription',
    'rafflePrizeApproxValueCad', 'raffleMaxWinners', 'raffleExcludePreviousWinners',
    'raffleLegalAccepted', 'vendorRaffleRulesViewedVersion', 'vendorRaffleSaving',
    'vendorRaffleSaveError', 'vendorRaffleSaveMessage', 'vendorRaffleError',
  ]) {
    state[`set${name[0].toUpperCase()}${name.slice(1)}`] = value => {
      state[name] = typeof value === 'function' ? value(state[name]) : value;
    };
  }
  state.finishVendorRaffleHydration = () => { state.vendorRaffleHydratingRef.current = false; };
  state.applyVendorRaffle = (data, applyOptions) => {
    hydrations.push({ data, options: applyOptions });
    state.vendorRaffle = data;
    Object.assign(state, {
      raffleEnabled: Boolean(data.settings.enabled),
      rafflePrizeTitle: data.settings.prize_title,
      rafflePrizeDescription: data.settings.prize_description,
      rafflePrizeApproxValueCad: String(data.settings.prize_approx_value_cad || ''),
      raffleMaxWinners: data.settings.max_winners,
      raffleExcludePreviousWinners: data.settings.exclude_previous_winners,
      raffleLegalAccepted: data.vendor_acceptance_current,
      vendorRaffleRulesViewedVersion: data.vendor_acceptance_current ? data.rules_version : '',
    });
    state.vendorRaffleLastSavedRef.current = currentSignature();
  };
  state.fetchQrBingoJsonWithTimeout = async (_url, request) => {
    const body = JSON.parse(request.body);
    requests.push(body);
    if (options.transport) return options.transport(body, requests.length);
    return { response: { ok: true, status: 200 }, data: replyFor(body) };
  };
  vm.runInNewContext(saveProgram, state);
  function currentSignature() {
    return state.tested.signature(
      state.raffleEnabled, state.rafflePrizeDescription, state.rafflePrizeApproxValueCad,
      state.raffleMaxWinners, state.raffleExcludePreviousWinners, state.raffleLegalAccepted,
      state.vendorRaffleRulesViewedVersion,
    );
  }
  return { state, requests, alerts, hydrations, currentSignature, save: state.tested.save };
}

test('normalizing server response keeps multiline draft and currency formatting without a resave loop', async () => {
  const h = harness();
  assert.equal(await h.save({ silent: true }), true);
  assert.equal(h.state.rafflePrizeDescription, originalDescription);
  assert.equal(h.state.rafflePrizeApproxValueCad, '500.00');
  assert.equal(h.state.vendorRaffle.settings.prize_description, normalized(originalDescription));
  assert.equal(h.state.vendorRaffle.settings.updated_at, timestampAfter);
  assert.equal(h.state.vendorRaffleLastSavedRef.current, h.currentSignature());
  assert.equal(h.requests[0].prize_title, originalDescription.split('\n')[0]);
  assert.equal(h.alerts.length, 0);
  assert.equal(h.hydrations.length, 0);
});

test('meaningful server changes replace the draft and establish its exact accepted baseline', async () => {
  const h = harness({ transport: async body => ({
    response: { ok: true, status: 200 },
    data: replyFor(body, { prize_description: 'Different authoritative prize', prize_approx_value_cad: 250 }),
  }) });
  assert.equal(await h.save({ silent: true }), true);
  assert.equal(h.state.rafflePrizeDescription, 'Different authoritative prize');
  assert.equal(h.state.rafflePrizeApproxValueCad, '250');
  assert.equal(h.state.vendorRaffleLastSavedRef.current, h.currentSignature());
});

test('server truncation is not treated as equivalent whitespace normalization', async () => {
  const longDraft = `Test prize\n${'Important restriction. '.repeat(70)}`;
  const serverDescription = normalized(longDraft).slice(0, 1000);
  const h = harness({
    state: { rafflePrizeDescription: longDraft },
    transport: async body => ({ response: { ok: true, status: 200 }, data: replyFor(body, { prize_description: serverDescription }) }),
  });
  assert.equal(await h.save({ silent: true }), true);
  assert.equal(h.state.rafflePrizeDescription, serverDescription);
  assert.equal(h.state.vendorRaffleLastSavedRef.current, h.currentSignature());
});

test('typing during an in-flight save survives and the next request uses the refreshed server timestamp', async () => {
  const wait = deferred();
  const h = harness({ transport: async (body, count) => {
    if (count === 1) await wait.promise;
    return { response: { ok: true, status: 200 }, data: replyFor(body) };
  } });
  const first = h.save({ silent: true });
  assert.equal(h.requests.length, 1);
  const newerDraft = `${originalDescription}\nA later typed restriction.`;
  h.state.rafflePrizeDescription = newerDraft;
  h.state.vendorRaffleLocalEditGenerationRef.current += 1;
  wait.resolve();
  assert.equal(await first, true);
  assert.equal(h.state.rafflePrizeDescription, newerDraft);
  assert.equal(h.state.vendorRaffle.settings.updated_at, timestampAfter);
  assert.notEqual(h.state.vendorRaffleLastSavedRef.current, h.currentSignature());
  assert.equal(await h.save({ silent: true }), true);
  assert.equal(h.requests[1].settings_updated_at, timestampAfter);
  assert.equal(h.requests[1].prize_description, newerDraft);
  assert.equal(h.requests[1].prize_title, originalDescription.split('\n')[0]);
  assert.equal(h.state.rafflePrizeDescription, newerDraft);
  assert.equal(h.state.vendorRaffleLastSavedRef.current, h.currentSignature());
});

test('complete conflicts retain authoritative rehydration instead of attaching a new version to stale edits', async () => {
  const authoritative = dashboard();
  authoritative.settings.prize_description = 'Changed in another tab';
  authoritative.settings.updated_at = timestampAfter;
  authoritative.conflict = true;
  authoritative.ok = false;
  const h = harness({ transport: async () => ({ response: { ok: false, status: 409 }, data: authoritative }) });
  assert.equal(await h.save({ silent: true }), false);
  assert.equal(h.hydrations.length, 1);
  assert.equal(h.hydrations[0].options.preserveWizardContext, true);
  assert.equal(h.state.rafflePrizeDescription, 'Changed in another tab');
  assert.equal(h.state.vendorRaffle.settings.updated_at, timestampAfter);
  assert.equal(h.state.vendorRaffleLastFailedSignatureRef.current, '');
});

test('partial conflict cannot replace the current dashboard or erase the typed draft', async () => {
  const h = harness({ transport: async () => ({ response: { ok: false, status: 409 }, data: { ok: false, conflict: true, error: 'Changed elsewhere' } }) });
  const initial = h.state.vendorRaffle;
  assert.equal(await h.save({ silent: true }), false);
  assert.equal(h.hydrations.length, 0);
  assert.equal(h.state.vendorRaffle, initial);
  assert.equal(h.state.rafflePrizeDescription, originalDescription);
});

test('incomplete success and ordinary failure keep the draft visible and suppress automatic retry of that signature', async () => {
  for (const status of [200, 503]) {
    const h = harness({ transport: async () => ({ response: { ok: status === 200, status }, data: { ok: status === 200, error: 'Unit-test failure' } }) });
    assert.equal(await h.save({ silent: true }), false);
    assert.equal(h.state.rafflePrizeDescription, originalDescription);
    assert.equal(h.state.vendorRaffleLastFailedSignatureRef.current, h.currentSignature());
    assert.equal(h.state.vendorRaffleSaving, false);
    assert.equal(h.state.vendorRaffleSaveInFlightRef.current, false);
  }
});

test('material locks keep request fields canonical while permitting current rules reacceptance', async () => {
  const locked = dashboard({ material_terms_locked: true });
  locked.settings.prize_description = 'Existing locked prize';
  locked.settings.prize_title = 'Existing locked title';
  locked.settings.prize_approx_value_cad = 99;
  locked.settings.max_winners = 1;
  const h = harness({
    state: { vendorRaffle: locked, raffleLegalAccepted: true, vendorRaffleRulesViewedVersion: rulesVersion },
    transport: async body => ({ response: { ok: true, status: 200 }, data: replyFor(body, {}, { material_terms_locked: true, vendor_acceptance_current: true }) }),
  });
  assert.equal(await h.save({ silent: true }), true);
  assert.equal(h.requests[0].prize_description, 'Existing locked prize');
  assert.equal(h.requests[0].prize_title, 'Existing locked title');
  assert.equal(h.requests[0].prize_approx_value_cad, 99);
  assert.equal(h.requests[0].max_winners, 1);
  assert.equal(h.requests[0].legal_terms_accepted, true);
  assert.equal(h.requests[0].rules_viewed, true);
  assert.equal(h.requests[0].vendor_responsibility_acknowledged, true);
  assert.equal(h.requests[0].consent_version, rulesVersion);
  assert.equal(h.state.vendorRaffle.material_terms_locked, true);
});

test('text inputs remain editable during autosave only, while material and opening/action locks still apply', () => {
  const start = appSource.indexOf('const vendorRaffleMaterialLocked =');
  const end = appSource.indexOf('const vendorRaffleSaveMessageLower =', start);
  assert.ok(start >= 0 && end > start, 'App draft-input guard section missing');
  for (const testId of ['vendor-draw-prize-details', 'vendor-draw-prize-value']) {
    const input = findNode(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === 'TextInput' && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'testID' && ts.isStringLiteral(attr.initializer) && attr.initializer.text === testId));
    assert.ok(input, `${testId} TextInput missing`);
    const editable = input.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.text === 'editable');
    const expression = editable?.initializer?.expression?.getText(parsed);
    assert.ok(expression, `${testId} must expose its editability guard`);
    const code = transpile(`${appSource.slice(start, end)}\nglobalThis.editableResult = (${expression});`);
    const defaults = {
      vendorRaffle: { material_terms_locked: false }, raffleEnabled: false, raffleLegalAccepted: false,
      vendorRaffleSaving: true, vendorRaffleDrawing: false, vendorRaffleSendingDrawId: '',
      vendorRaffleReviewing: false, vendorRaffleExporting: false, vendorRaffleEntryUpdatingReference: '',
    };
    const evaluate = overrides => {
      const context = { ...defaults, ...overrides };
      vm.runInNewContext(code, context);
      return context.editableResult;
    };
    assert.equal(evaluate({}), true, `${testId} must not lose focus when only autosave starts`);
    assert.equal(evaluate({ raffleLegalAccepted: true }), true, `${testId} remains editable after rules acceptance while the draw is still closed and unlocked`);
    for (const override of [
      { vendorRaffle: { material_terms_locked: true } }, { raffleEnabled: true },
      { vendorRaffleDrawing: true }, { vendorRaffleSendingDrawId: 'test-draw' },
      { vendorRaffleReviewing: true }, { vendorRaffleExporting: true }, { vendorRaffleEntryUpdatingReference: 'test-entry' },
    ]) assert.equal(evaluate(override), false, `${testId} must retain opening/material/action guard ${JSON.stringify(override)}`);
  }
});

test('initial hydration restores only an unambiguous exact title boundary and preserves existing multiline text', () => {
  const context = {};
  vm.runInNewContext(transpile(`${functionSource('formatVendorPrizeDraftDescription')}\nglobalThis.format = formatVendorPrizeDraftDescription;`), context);
  assert.equal(context.format('Test prize', 'Test prize Maximum savings $500.'), 'Test prize\nMaximum savings $500.');
  assert.equal(context.format('Test prize', 'Test prize\nMaximum savings $500.'), 'Test prize\nMaximum savings $500.');
  assert.equal(context.format('Gift', 'Gifted services only.'), 'Gifted services only.');
  assert.equal(context.format('Test prize', 'Different authoritative text.'), 'Different authoritative text.');
  assert.equal(context.format('Test prize', 'Test prize'), 'Test prize');
  assert.equal(context.format('', 'Details only.'), 'Details only.');
});
