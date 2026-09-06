#!/usr/bin/env node
// Execute the actual fixture validator and conditional HTML in PHP.wasm.
// Requires the existing cached @php-wasm/cli; --offline prevents installation
// or network access. All inputs below are fictional, public unit-test data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const widget = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
function slice(start, end) {
  const from = widget.indexOf(start), to = widget.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Actual PHP section missing: ${start}`);
  return widget.slice(from, to);
}
const validator = slice("if (!function_exists('ww_qr_bingo_fixture_context'))", '// Check if user is logged in');
const markup = slice("    <?php if ($fixtureContext && $qrContactComplete", '\t    <section class="controls"');
const valid = {
  ok: true, app_review_fixture: false, email_test_fixture: true,
  vendors: [{ id: '707', user_id: '707', name: 'Fictional & "quoted" test booth' }],
  scanned: [], total_count: 1, scanned_count: 0, completed: false,
};
const cases = [];
function check(name, body, show, options = {}) {
  cases.push({ name, response: { status_code: 200, body }, show, complete: true, enabled: true, window: true, ...options });
}
check('authenticated email fixture', valid, true);
check('authenticated app-review fixture', { ...valid, email_test_fixture: false, app_review_fixture: true }, true);
check('already-scanned fixture still supports optional offer review', { ...valid, scanned: ['707'], scanned_count: 1, completed: true }, true);
check('ordinary production account', { ...valid, email_test_fixture: false }, false);
check('both fixture flags cannot be true', { ...valid, app_review_fixture: true }, false);
check('string truthiness is not a fixture', { ...valid, email_test_fixture: 'true' }, false);
check('unsuccessful response', { ...valid, ok: false }, false);
check('expired or unauthenticated response', valid, false, { response: { status_code: 401, body: valid } });
check('failed transport', valid, false, { response: null });
check('no fixture booth', { ...valid, vendors: [] }, false);
check('multiple booths', { ...valid, vendors: [valid.vendors[0], { ...valid.vendors[0], id: '708', user_id: '708' }] }, false);
check('different vendor identity', { ...valid, vendors: [{ ...valid.vendors[0], user_id: '708' }] }, false);
check('non-string vendor ID', { ...valid, vendors: [{ ...valid.vendors[0], id: 707 }] }, false);
check('unsafe vendor text', { ...valid, vendors: [{ ...valid.vendors[0], name: '<script>bad()</script>' }] }, false);
check('foreign scan history', { ...valid, scanned: ['708'], scanned_count: 1, completed: true }, false);
check('inconsistent fixture count', { ...valid, total_count: 2 }, false);
check('incomplete contacts', valid, false, { complete: false });
check('administrator disabled scanning', valid, false, { enabled: false });
check('closed scan window', valid, false, { window: false });
const b64 = value => Buffer.from(value).toString('base64');

test('actual PHP emits the test button only for a validated, gated, exact single-vendor fixture', () => {
  const code = `${validator}
    $cases = json_decode(base64_decode('${b64(JSON.stringify(cases))}'), true);
    $template = base64_decode('${b64(markup)}');
    $results = array();
    foreach ($cases as $case) {
      $fixtureContext = ww_qr_bingo_fixture_context($case['response']);
      $qrContactComplete = $case['complete'];
      $eventConfig = array('scan_enabled' => $case['enabled']);
      $showScanWindowOpen = $case['window'];
      ob_start(); eval('?>' . $template); $html = ob_get_clean();
      $results[] = array('name' => $case['name'], 'html' => $html);
    }
    echo json_encode($results);
  `;
  const stdout = execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', code], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000,
  });
  const rendered = JSON.parse(stdout);
  assert.equal(rendered.length, cases.length);
  for (const [index, result] of rendered.entries()) {
    const expected = cases[index]; assert.equal(result.name, expected.name);
    if (expected.show) {
      assert.match(result.html, /id="qrFixtureScanButton"[^>]*data-vendor-id="707"[^>]*disabled/, expected.name);
      assert.match(result.html, /Private test booth/); assert.match(result.html, /Scan test booth/);
      assert.match(result.html, /Fictional &amp; &quot;quoted&quot; test booth/);
      assert.match(result.html, /without a camera/); assert.match(result.html, /test progress only, not a real show visit/);
    } else {
      assert.doesNotMatch(result.html, /qr-fixture-scan|qrFixtureScan|data-vendor-id|707|708|Fictional/, expected.name);
    }
  }
});

test('fixture render stays downstream of canonical authenticated couple and signed fixture context checks', () => {
  const button = widget.indexOf(markup);
  for (const fragment of [
    'user::isUserLogged($_COOKIE)',
    "(string)$loggedInUser['user_id'] !== (string)$_COOKIE['userid']",
    'if ($isCoupleScannerMember)',
    "$fixtureContext = ww_qr_bingo_fixture_context($fixtureProbeResponse);",
  ]) assert.ok(widget.indexOf(fragment) >= 0 && widget.indexOf(fragment) < button, fragment);
  assert.equal([...widget.matchAll(/\$fixtureContext\s*=/g)].length, 1, 'Only the authenticated response may set fixture context');
  assert.doesNotMatch(markup, /\$_(?:GET|POST|COOKIE)|39033|37823|39035/);
  const handler = slice('    async function scanFixtureBooth()', '    // Event listeners for desktop controls');
  assert.match(handler, /await handleDecoded\('https:\/\/www[.]weddingwin[.]ca\/qr\?vendor_id='/);
  assert.doesNotMatch(handler, /fetch\(|raffle_opt_in|saveVendorScan\(|markScanned\(|getUserMedia\(/);
  assert.doesNotMatch(handler, /\\/, 'Inline JS stays safe for the BD widget_data backslash behavior');
});

test('actual PHP renders a short unchecked agreement with working terms, official-rules and privacy links', () => {
  const start = widget.lastIndexOf('<section', widget.indexOf('class="qr-rules-notice"'));
  const end = widget.indexOf('</section>', start) + '</section>'.length;
  assert.ok(start >= 0 && end > start);
  const template = widget.slice(start, end);
  const code = `
    $rulesNoticeStorageKey = 'wwQrRulesNotice:fictional-member-scope';
    $officialRulesUrl = 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules';
    ob_start(); eval('?>' . base64_decode('${b64(template)}'));
    echo json_encode(ob_get_clean());
  `;
  const html = JSON.parse(execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', code], {
    encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000,
  }));
  assert.equal([...html.matchAll(/<input[^>]*type="checkbox"/g)].length, 1);
  assert.doesNotMatch(html, /<input[^>]*\bchecked\b/);
  assert.match(html, /data-storage-key="wwQrRulesNotice:fictional-member-scope"/);
  assert.match(html, /<label for="qrRulesNoticeAcknowledged">/);
  assert.match(html, /href="\/about\/terms#qr-bingo" target="_blank" rel="noopener">QR Bingo Terms/);
  assert.match(html, /href="https:\/\/www[.]weddingwin[.]ca\/qr-bingo-vendor-draw-rules" target="_blank" rel="noopener">Draw Rules/);
  assert.match(html, /href="\/about\/privacy"[^>]*>Privacy Policy/);
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(text, 'Before you scan I have read and agree to the QR Bingo Terms and Draw Rules. Privacy Policy');
});

test('actual PHP renders no placeholder rules destination or visible empty terms panel before a valid offer', () => {
  const template = slice('  <div class="vendor-draw-modal"', '  <!-- Vendor Data -->');
  const code = `
    ob_start(); eval('?>' . base64_decode('${b64(template)}'));
    echo json_encode(ob_get_clean());
  `;
  const html = JSON.parse(execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', code], {
    encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000,
  }));
  assert.match(html, /<div class="vendor-draw-terms" id="vendorDrawTerms" hidden>/);
  const rulesTag = html.match(/<a\b[^>]*id="vendorDrawRules"[^>]*>/)?.[0];
  assert.ok(rulesTag);
  assert.match(rulesTag, /\bhidden\b/);
  assert.match(rulesTag, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(rulesTag, /\bhref\s*=/, 'Only a validated offer may provide a rules destination');
});
