import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const event = 'niagara-wedding-show-2026';
const version = '2026-09-01-in-person-entry';
const acceptedBefore = '2026-09-01T15:00:00.000Z';
const acceptedNow = '2026-09-15T02:00:00.000Z';

function loadEndpoint(slug) {
  const source = readFileSync(new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url), 'utf8');
  const tree = ts.createSourceFile('endpoint.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = [
    'PLATFORM_ROLE', 'PRE_SHOWDAY_PLATFORM_ROLE', 'APPLE_NON_SPONSOR_DISCLAIMER',
    'LEGACY_CONTACT_SHARING_RULES_VERSION', 'PREVIOUS_CONTACT_SHARING_RULES_VERSION',
    'CONTACT_SHARING_RULES_VERSION', 'IN_PERSON_REACCEPTANCE_SOURCE_RULES_VERSIONS', 'MAX_RAFFLE_WINNERS',
    'cleanText', 'positiveCadValue', 'raffleMaxWinners',
    'vendorResponsibilityDisclosure', 'participantResponsibilityDisclosure',
    'nonConsentMaterialSettingsFingerprint', 'isPermittedInPersonEntryRulesTransition',
    'isPermittedShowdayPolicyAmendment', 'vendorRulesAcceptanceTimestamp',
  ];
  const parts = names.map(name => {
    const node = tree.statements.find(s => ts.isFunctionDeclaration(s) ? s.name?.text === name :
      ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(tree) === name));
    assert(node, `${slug}: missing shipped declaration ${name}`);
    return node.getText(tree);
  });
  const context = vm.createContext({});
  vm.runInContext(ts.transpileModule(parts.join('\n') + `\nglobalThis.api = { ${names.join(', ')} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return { source, api: context.api };
}

function fixture(api) {
  const vendor = 'Willow & Bloom Floral Studio';
  const current = {
    event_key: event, vendor_bingo_id: '38970', vendor_bd_user_id: '38970', vendor_name: vendor,
    administrator_name: 'Wedding Win Inc.', co_sponsor_name: '', prize_provider_name: vendor,
    synthetic_fixture_setup_id: null, legal_terms_version: version, legal_terms_accepted: true,
    legal_terms_accepted_at: acceptedBefore, rules_viewed_at: acceptedBefore,
    apple_non_sponsor_acknowledged: true, vendor_responsibility_acknowledged: true,
    vendor_responsibility_version: version, vendor_responsibility_acknowledged_at: acceptedBefore,
    prize_title: 'Flower credit', prize_description: 'A $250 credit; new bookings only.',
    prize_approx_value_cad: 250, official_rules_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
    eligibility_region: 'Ontario adults', entry_closes_at: '2026-10-18T20:00:00Z',
    draw_at: '2026-10-19T14:00:00Z', draw_opens_at: '2026-10-19T14:00:00Z',
    odds_basis: 'One chance per eligible entry', no_purchase_required: true,
    skill_testing_question_required: true, alternate_free_entry_url: 'https://www.weddingwin.ca/qr',
    max_winners: 1, exclude_previous_winners: true,
    vendor_responsibility_disclosure_text: api.vendorResponsibilityDisclosure(vendor)
      .replace(api.PLATFORM_ROLE, api.PRE_SHOWDAY_PLATFORM_ROLE),
    participant_responsibility_disclosure_text: api.participantResponsibilityDisclosure(vendor)
      .replace(api.PLATFORM_ROLE, api.PRE_SHOWDAY_PLATFORM_ROLE),
  };
  const next = {
    ...current, legal_terms_accepted_at: acceptedNow, rules_viewed_at: acceptedNow,
    vendor_responsibility_acknowledged_at: acceptedNow,
    vendor_responsibility_disclosure_text: api.vendorResponsibilityDisclosure(vendor),
    participant_responsibility_disclosure_text: api.participantResponsibilityDisclosure(vendor),
  };
  return { current, next };
}

for (const slug of ['bd-qr-bingo-sync', 'bd-qr-bingo-vendor-sync']) {
  const { source, api } = loadEndpoint(slug);
  const allows = (current, next, explicit = true, published = event) =>
    api.isPermittedShowdayPolicyAmendment(current, next, explicit, published);

  test(`${slug}: exact same-base amendment accepts both canonical texts and does not mutate old evidence`, () => {
    const { current, next } = fixture(api);
    const oldBytes = JSON.stringify(current);
    Object.freeze(current); Object.freeze(next);
    assert.equal(allows(current, next), true);
    assert.equal(JSON.stringify(current), oldBytes);
    assert.equal(api.isPermittedInPersonEntryRulesTransition(current, next), false);
    assert.deepEqual(Array.from(api.IN_PERSON_REACCEPTANCE_SOURCE_RULES_VERSIONS),
      ['2026-08-30-contact-share', '2026-09-01-vendor-marketing']);
  });

  test(`${slug}: arbitrary old or new wording, role replacement fragments and partial amendments fail closed`, () => {
    const { current, next } = fixture(api);
    for (const field of ['vendor_responsibility_disclosure_text', 'participant_responsibility_disclosure_text']) {
      for (const text of ['', null, current[field] + ' Extra promise.', api.PRE_SHOWDAY_PLATFORM_ROLE,
        current[field].replace('Wedding Win Inc.', 'Some other business')]) {
        assert.equal(allows({ ...current, [field]: text }, next), false, `old ${field}`);
      }
      for (const text of [current[field], '', next[field] + ' Extra promise.', api.PLATFORM_ROLE]) {
        assert.equal(allows(current, { ...next, [field]: text }), false, `new ${field}`);
      }
    }
  });

  test(`${slug}: prior acknowledgement or cached state cannot substitute for a new explicit vendor decision`, () => {
    const { current, next } = fixture(api);
    for (const explicit of [false, undefined, null, 'true', 1]) {
      assert.equal(api.isPermittedShowdayPolicyAmendment(current, next, explicit, event), false);
    }
    for (const patch of [
      { legal_terms_accepted: false }, { apple_non_sponsor_acknowledged: false },
      { vendor_responsibility_acknowledged: false }, { legal_terms_accepted_at: null },
      { rules_viewed_at: null }, { vendor_responsibility_acknowledged_at: null },
      { vendor_responsibility_version: 'old' },
    ]) assert.equal(allows({ ...current, ...patch }, next), false);
    assert.equal(allows(current, { ...next, vendor_responsibility_acknowledged: false }), false);
    assert.match(source, /const currentRulesAcceptanceRequested = legalTermsAccepted &&\s*rulesReviewed && vendorResponsibilityAcknowledged/);
    assert.match(source, /isPermittedShowdayPolicyAmendment\(\s*currentSettings, nextMaterialSettings,\s*currentRulesAcceptanceRequested, qrBingoConfig\(\)\.event_key/);
  });

  test(`${slug}: event, base version, synthetic context, identity, prize and schedule cannot change through the amendment`, () => {
    const { current, next } = fixture(api);
    for (const field of ['event_key', 'legal_terms_version', 'synthetic_fixture_setup_id',
      'vendor_bingo_id', 'vendor_bd_user_id', 'vendor_name', 'administrator_name', 'co_sponsor_name']) {
      assert.equal(allows(current, { ...next, [field]: 'other' }), false, field);
      assert.equal(allows({ ...current, [field]: 'other' }, next), false, field);
    }
    assert.equal(allows(current, next, true, 'other-show'), false);
    for (const [field, value] of Object.entries({
      prize_title: 'Different prize', prize_description: 'Different restriction', prize_approx_value_cad: 300,
      official_rules_url: 'https://www.weddingwin.ca/other', eligibility_region: 'Canada',
      entry_closes_at: '2026-10-18T21:00:00Z', draw_at: '2026-10-20T14:00:00Z',
      draw_opens_at: '2026-10-20T14:00:00Z', odds_basis: 'Different odds', no_purchase_required: false,
      skill_testing_question_required: false, prize_provider_name: 'Another vendor',
      alternate_free_entry_url: '', max_winners: 2, exclude_previous_winners: false,
    })) assert.equal(allows(current, { ...next, [field]: value }), false, field);
  });

  test(`${slug}: new amendment receives fresh legal/rules time and only exact already-current acceptance can reuse time`, () => {
    const { current, next } = fixture(api);
    const stamp = (settings, accept = true) => api.vendorRulesAcceptanceTimestamp(
      settings, settings.vendor_name, version, accept, acceptedNow);
    assert.equal(stamp(current), acceptedNow);
    assert.equal(stamp(current, false), null);
    const alreadyCurrent = { ...next, rules_viewed_at: acceptedBefore };
    assert.equal(stamp(alreadyCurrent), acceptedBefore);
    for (const field of ['vendor_responsibility_disclosure_text', 'participant_responsibility_disclosure_text']) {
      assert.equal(stamp({ ...alreadyCurrent, [field]: current[field] }), acceptedNow);
    }
    assert.equal(stamp({ ...alreadyCurrent, legal_terms_accepted: false }), acceptedNow);
    for (const patch of [{ apple_non_sponsor_acknowledged: false }, { vendor_responsibility_acknowledged: false },
      { vendor_responsibility_version: 'old' }, { vendor_responsibility_acknowledged_at: null }, { legal_terms_accepted_at: null }]) {
      assert.equal(stamp({ ...alreadyCurrent, ...patch }), acceptedNow);
    }
    assert.match(source, /const acceptedAt = vendorRulesAcceptanceTimestamp\(\s*currentSettings, vendor\.name, qrBingoConfig\(\)\.rules_version,\s*currentRulesAcceptanceRequested, acceptanceNow/);
    assert.match(source, /vendor_responsibility_acknowledged_at\s*:\s*responsibilityAcceptedAt/);
  });
}
