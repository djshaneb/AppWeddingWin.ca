import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource, appDeclaration, loadAppDeclarations } from './native-app-source-fixture.mjs';

const scanner = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../brilliant-directories/widgets/328-qr-bingo-vendor-draw-dashboard.js', import.meta.url), 'utf8');
function sourceFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist in shipped code`);
  const parsed = ts.createSourceFile('function.js', source.slice(start), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return parsed.statements[0].getText(parsed);
}
function nativeRender(offer, expanded) {
  const context = {
    URL, Intl, Array, Number, String, Date,
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) },
    Text: 'Text', View: 'View', TouchableOpacity: 'TouchableOpacity',
    useState: () => [expanded, () => {}], styles: {},
    Linking: { openURL: () => assert.fail('Rendering must not open links or submit entry') }, Alert: {},
  };
  const names = ['PROMOTION_TIME_ZONE', 'promotionDateFormatter', 'formatPromotionDate', 'vendorDrawPrizeSummary', 'vendorDrawDemoPresentation', 'trustedVendorDrawRulesUrl', 'QrVendorPrizeDetails'];
  vm.runInNewContext(ts.transpileModule(names.map(appDeclaration).join('\n') + '\nglobalThis.render = QrVendorPrizeDetails;', {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.render({ offer });
}
function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.children || []).flatMap(descendants)];
}
function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return (node.children || []).map(textContent).join('');
}
const offer = {
  vendor_id: '38970', vendor_name: 'Willow & Bloom Floral Studio', prize_title: 'Wedding flower credit',
  app_review_fixture: false, email_test_fixture: false, outbound_email_suppressed: false,
  prize_description: 'Wedding flower credit. '.repeat(14) + 'Only new bookings; valid until 31 December 2027. Travel is excluded.',
  prize_approx_value_cad: 250, prize_count: 1,
  eligibility_region: 'Ontario residents aged 18 or older', eligibility_exclusions: 'Vendor staff and their household members are excluded.',
  entry_opens_at: '2026-10-18T15:00:00Z', entry_closes_at: '2026-10-18T20:00:00Z', draw_at: '2026-10-19T14:00:00Z',
  entry_limit: 'One entry per couple per vendor', odds_basis: 'Depends on the number of eligible entries',
  terms_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules', no_purchase_required: true, skill_testing_question_required: true,
};
const syntheticSource = readFileSync(new URL('../supabase/functions/_shared/qr_bingo_synthetic_fixture.ts', import.meta.url), 'utf8');
function canonicalSyntheticText(name) {
  const match = syntheticSource.match(new RegExp(`export const ${name} = ("[^"\\n]*");`));
  assert(match, `${name} must remain a canonical API fixture constant`);
  return JSON.parse(match[1]);
}
const syntheticOffer = Object.freeze({
  ...offer,
  synthetic_fixture_setup_id: 'b74acb9e-b1f0-4014-a41c-1339dcf6ceca',
  provenance: 'synthetic_fixture_setup', display_only: true, entry_allowed: false, legal_acceptance: false,
  app_review_fixture: true, email_test_fixture: false, outbound_email_suppressed: true,
  vendor_id: '38970', vendor_name: canonicalSyntheticText('SYNTHETIC_FIXTURE_VENDOR_NAME'),
  prize_title: canonicalSyntheticText('SYNTHETIC_FIXTURE_PRIZE_TITLE'),
  prize_description: canonicalSyntheticText('SYNTHETIC_FIXTURE_PRIZE_DESCRIPTION'),
  participant_responsibility_disclosure: canonicalSyntheticText('SYNTHETIC_FIXTURE_DISCLOSURE'),
  prize_approx_value_cad: 0,
});
const demoTitle = 'Wedding floral consultation';
const demoDescription = 'Plan your bouquet, ceremony flowers and reception arrangements in a one-hour consultation with Willow & Bloom Floral Studio.';
function websiteRenderer() {
  const context = { Array, Number, String, Date, Intl };
  for (const key of ['vendorDrawPrize', 'vendorDrawPrizeTitle', 'vendorDrawPrizeValue', 'vendorDrawPrizeSummaryText', 'vendorDrawPrizeDescription', 'vendorDrawPrizeFacts', 'vendorDrawPrizeDetails', 'vendorDrawPrizeRules', 'vendorDrawPreviewNotice', 'vendorDrawDemoNotice']) context[key] = {};
  const code = ['cleanPromotionText', 'formatPromotionDate', 'vendorDrawPrizeSummary', 'vendorDrawDemoPresentation', 'renderVendorDrawPrize'].map(name => sourceFunction(scanner, name)).join('\n');
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('collapsed native prize summary is short and retains value while full terms are one action away', () => {
  const tree = nativeRender(offer, false), copy = textContent(tree), nodes = descendants(tree);
  assert.match(copy, /Wedding flower credit/);
  assert.match(copy, /\$250\.00 CAD/);
  assert.match(copy, /…/);
  assert(!copy.includes('Travel is excluded.'));
  assert(nodes.some(n => n.props.testID === 'vendor-draw-prize-read-more' && n.props.accessibilityState.expanded === false));
  assert(nodes.some(n => n.props.accessibilityRole === 'link' && textContent(n) === 'Draw rules'));
  assert(!nodes.some(n => n.props.accessibilityRole === 'checkbox'));
});

test('expanded native prize view retains complete recorded conditions, dates, eligibility, and rules', () => {
  const tree = nativeRender(offer, true), copy = textContent(tree);
  assert(copy.includes(offer.prize_description));
  for (const value of [offer.eligibility_region, offer.eligibility_exclusions, offer.entry_limit, offer.odds_basis, 'Entries open:', 'Entries close:', 'Scheduled draw:', 'No purchase required.', 'skill-testing question']) assert(copy.includes(value), value);
  assert.match(copy, /11:00.*(?:a\.m\.|AM|am)/i);
  assert.match(copy, /written details and draw rules apply/);
  assert(descendants(tree).some(n => n.props.accessibilityState?.expanded === true));
});

test('full prize content scrolls independently of the native Yes and No actions', () => {
  const start = appSource.indexOf('testID="vendor-draw-offer"');
  const modal = appSource.slice(start, appSource.indexOf('</Modal>', start));
  assert(modal.indexOf('</ScrollView>') < modal.indexOf('style={styles.raffleModalActions}'));
  assert.match(modal, /key=\{`\$\{raffleOffer.vendor_id\}:\$\{raffleOffer.vendor_offer_version\}`\}/);
});

test('nonbinding previews stay explicit and never invent positive prize value', () => {
  const copy = textContent(nativeRender({ ...offer, display_only: true, prize_title: 'No real prize', prize_description: 'Sample only', prize_approx_value_cad: 0 }, false));
  assert.match(copy, /Preview only\. No real prize or draw entry\./);
  assert.doesNotMatch(copy, /\$0|\$250/);
});

test('recognized demo shows approved natural copy and keeps every canonical limitation under Read more', () => {
  const before = JSON.stringify(syntheticOffer);
  const collapsed = textContent(nativeRender(syntheticOffer, false));
  assert(collapsed.includes(demoTitle));
  assert(collapsed.includes(demoDescription));
  assert.doesNotMatch(collapsed, /demonstration|Preview only|Fictional|\$0|\$250/);
  const expanded = nativeRender(syntheticOffer, true);
  const details = descendants(expanded).find(node => node.props.testID === 'vendor-draw-prize-full-details');
  for (const value of [syntheticOffer.prize_title, syntheticOffer.prize_description, syntheticOffer.participant_responsibility_disclosure, 'Preview only. No real prize or draw entry.']) {
    assert(textContent(details).includes(value), value);
  }
  assert.equal(JSON.stringify(syntheticOffer), before, 'Display rendering cannot change canonical submission data');

  const web = websiteRenderer();
  web.renderVendorDrawPrize(syntheticOffer, offer.terms_url);
  assert.equal(web.vendorDrawPrizeTitle.textContent, demoTitle);
  assert.equal(web.vendorDrawPrizeSummaryText.textContent, demoDescription);
  assert.equal(web.vendorDrawPrizeValue.hidden, true);
  assert.equal(web.vendorDrawPreviewNotice.hidden, true);
  assert.equal(web.vendorDrawPrizeDetails.open, false);
  assert.equal(web.vendorDrawPrizeDescription.textContent, syntheticOffer.prize_description);
  assert.equal(web.vendorDrawDemoNotice.hidden, false);
  for (const value of [syntheticOffer.prize_title, syntheticOffer.participant_responsibility_disclosure, 'Preview only. No real prize or draw entry.']) assert(web.vendorDrawDemoNotice.textContent.includes(value));
  assert.match(scanner, /<details id="vendorDrawPrizeDetails">[\s\S]*?id="vendorDrawDemoNotice"[\s\S]*?<\/details>/);
  assert.equal(JSON.stringify(syntheticOffer), before);
});

test('natural demo copy fails closed on any missing or changed fixture identity, provenance, restriction or canonical detail', () => {
  const native = loadAppDeclarations(['vendorDrawDemoPresentation']).vendorDrawDemoPresentation;
  const web = websiteRenderer();
  const invalid = [
    { provenance: undefined }, { provenance: 'app_review_fixture' },
    { synthetic_fixture_setup_id: undefined }, { synthetic_fixture_setup_id: 'arbitrary' },
    { display_only: false }, { display_only: 'true' }, { entry_allowed: true }, { entry_allowed: undefined },
    { legal_acceptance: true }, { legal_acceptance: undefined },
    { app_review_fixture: false }, { email_test_fixture: true }, { outbound_email_suppressed: false },
    { vendor_id: '38972' }, { vendor_id: 38970 }, { vendor_name: 'Another florist' },
    { prize_title: 'Wedding flower credit' }, { prize_description: 'A real prize' },
    { prize_approx_value_cad: 250 }, { prize_approx_value_cad: '0' },
    { participant_responsibility_disclosure: 'Entry creates a real prize' },
  ];
  for (const patch of invalid) {
    const changed = Object.freeze({ ...syntheticOffer, ...patch });
    assert.equal(native(changed), null, JSON.stringify(patch));
    assert.equal(web.vendorDrawDemoPresentation(changed), null, JSON.stringify(patch));
    web.renderVendorDrawPrize(changed, offer.terms_url);
    assert.equal(web.vendorDrawPrizeTitle.textContent, changed.prize_title);
    assert.equal(web.vendorDrawPrizeSummaryText.textContent, changed.prize_description);
    assert.equal(web.vendorDrawDemoNotice.hidden, true);
  }
  assert.equal(native(offer), null);
  assert.equal(web.vendorDrawDemoPresentation(offer), null);
  web.renderVendorDrawPrize(offer, offer.terms_url);
  assert.equal(web.vendorDrawPrizeTitle.textContent, offer.prize_title);
  assert.equal(web.vendorDrawDemoNotice.textContent, '', 'A subsequent real offer clears demo text');
  assert.equal(web.vendorDrawPreviewNotice.hidden, true);
});

test('summary keeps Unicode intact and native rules links reject untrusted destinations', () => {
  const { vendorDrawPrizeSummary, trustedVendorDrawRulesUrl } = loadAppDeclarations(['vendorDrawPrizeSummary', 'trustedVendorDrawRulesUrl']);
  assert.equal(vendorDrawPrizeSummary('  A\n\tflower  credit  '), 'A flower credit');
  assert.equal(vendorDrawPrizeSummary('💐'.repeat(181)), '💐'.repeat(180) + '…');
  assert.equal(trustedVendorDrawRulesUrl(offer.terms_url), offer.terms_url);
  for (const url of ['javascript:alert(1)', 'https://weddingwin.ca.evil.test/rules', 'https://user@weddingwin.ca/rules', 'http://weddingwin.ca/rules', 'https://weddingwin.ca:444/rules']) assert.equal(trustedVendorDrawRulesUrl(url), '');
});

test('website renders complete terms as plain text, truncates the summary, and resets expanded state per offer', () => {
  const context = websiteRenderer();
  context.vendorDrawPrizeDetails.open = true;
  context.renderVendorDrawPrize(offer, offer.terms_url);
  assert.equal(context.vendorDrawPrizeDetails.open, false);
  assert.equal(context.vendorDrawPrizeDescription.textContent, offer.prize_description);
  assert(context.vendorDrawPrizeFacts.textContent.includes(offer.eligibility_exclusions));
  assert.equal(context.vendorDrawPrizeRules.href, offer.terms_url);
  assert.equal(context.vendorDrawPreviewNotice.hidden, true);
  context.renderVendorDrawPrize({ ...offer, prize_description: '<img src=x onerror=alert(1)>', display_only: true, prize_approx_value_cad: 0 }, offer.terms_url);
  assert.equal(context.vendorDrawPrizeDescription.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(context.vendorDrawPrizeValue.hidden, true);
  assert.equal(context.vendorDrawPreviewNotice.hidden, false);
  assert(!sourceFunction(scanner, 'renderVendorDrawPrize').includes('innerHTML'));
  assert.match(scanner, /<details id="vendorDrawPrizeDetails">\s*<summary>Read more<\/summary>/);
  assert.match(scanner, /overflow-wrap:anywhere/);
  assert.match(scanner, /querySelectorAll\('a\[href\], summary, button/);
});

test('both vendor clients show the API deadline in event-local time and preserve earlier locks', () => {
  const native = loadAppDeclarations(['areVendorPrizeDetailsLocked', 'vendorPrizeEditHelp'], { Intl, Date }).vendorPrizeEditHelp;
  const context = { Date, Intl };
  vm.runInNewContext(['prizeDetailsLocked', 'prizeEditHelp'].map(name => sourceFunction(widget, name)).join('\n'), context);
  const dashboard = { prize_details_locked: false, prize_edit_deadline_at: '2026-10-18T15:00:00Z', prize_edit_timezone: 'America/Toronto' };
  for (const fn of [native, context.prizeEditHelp]) {
    assert.match(fn(dashboard), /11:00.*(?:a\.m\.|AM|am)/i);
    assert.match(fn(dashboard), /winner email locks the prize earlier/);
    assert.match(fn({ ...dashboard, prize_details_locked: true, prize_details_lock_reason: 'deadline' }), /deadline was/);
    assert.match(fn({ ...dashboard, prize_details_locked: true, prize_details_lock_reason: 'sending' }), /being sent/);
    assert.match(fn({ ...dashboard, prize_details_locked: true, prize_details_lock_reason: 'sent' }), /has been sent/);
    assert.match(fn({ ...dashboard, prize_edit_deadline_at: 'bad' }), /unavailable/);
    assert.match(fn({ ...dashboard, prize_edit_timezone: 'bad' }), /unavailable/);
    assert.match(fn({ ...dashboard, prize_details_lock_reason: 'synthetic_fixture' }), /preview has no real prize/);
  }
});

test('website cached notice rejection restores an unchecked, enabled explicit agreement', async () => {
  const removed = [], requests = [];
  const context = {
    Error, Promise, AbortController, URLSearchParams,
    currentParticipationNoticeScope: () => 'account-event-current-notice',
    currentParticipationRequestScope: () => 'current-request',
    CONTACT_PROFILE_COMPLETE: true, eventConfigRefreshStarted: false,
    qrRulesNoticeRequest: null, qrRulesNoticeRequestId: 0,
    qrRulesNoticeAcknowledged: { checked: true }, qrRulesNoticeRetry: { hidden: false },
    qrRulesNoticeStatus: {}, qrRulesNotice: { dataset: { storageKey: 'current-key' }, hidden: true },
    qrRulesNoticeAccepted: false, qrRulesNoticeAcceptedScope: '', QR_WEBSITE_CSRF: 'offline',
    EVENT_CONFIG: { event_key: 'offline', revision: 1, rules_version: 'current-rules' },
    PARTICIPATION_NOTICE_VERSION: 'current-rules|2026-09-14-showday-prize-lock',
    window: { location: { href: 'https://offline.invalid/' }, setTimeout: () => 1, clearTimeout: () => {},
      localStorage: { removeItem: key => removed.push(key) } },
    fetch: async (_url, request) => {
      requests.push(new URLSearchParams(request.body));
      return { ok: false, status: 428, json: async () => ({ ok: false, code: 'participation_notice_required' }) };
    },
    validParticipationReceipt: () => assert.fail('A rejected notice must not validate a receipt'),
    applyParticipationReceipt: () => assert.fail('A rejected notice must not unlock the scanner'),
  };
  vm.runInNewContext(sourceFunction(scanner, 'saveParticipationNotice'), context);
  assert.equal(await context.saveParticipationNotice('cached'), false);
  assert.deepEqual(removed, ['current-key']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].get('action'), 'participation_accept');
  assert.equal(context.qrRulesNoticeAcknowledged.checked, false);
  assert.equal(context.qrRulesNoticeAcknowledged.disabled, false);
  assert.equal(context.qrRulesNotice.hidden, false);
  assert.equal(context.qrRulesNoticeRetry.hidden, true);
  assert.match(context.qrRulesNoticeStatus.textContent, /read and accept the updated/);
  assert.equal(context.qrRulesNoticeRequest, null);
});
