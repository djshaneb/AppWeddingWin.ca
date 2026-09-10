#!/usr/bin/env node
// Execute the production PHP renderers offline. No database, credentials or mail.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const widget = readFileSync(new URL('../brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php', import.meta.url), 'utf8');
function section(start, end) {
  const from = widget.indexOf(start), to = widget.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing production section: ${start}`);
  return widget.slice(from, to);
}
const helpers = section('    function ww_qbdes_clean(', '    function ww_qbdes_send_mail(');
const renderer = section("    $winnerName = ww_qbdes_line_after($vendorText, 'Name:');", '    $vendorPayloadHash =');
const email254 = `${'q'.repeat(64)}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(61)}`;
assert.equal(email254.length, 254);
const makeCase = (name, description, value = '$125.50 CAD', options = {}) => {
  const vendor = `Winner details\nName: Jamie & Taylor\nEmail: ${options.email || 'couple@example.invalid'}\nPhone: 5555550100\nWedding date: 2027-10-18\n\nDraw record\nPrize details are included below for your reference.\nCurrent prize title\n${description}${value ? `\nApproximate value: ${value}` : ''}\n\nCouple notification\nPrivate fixture only.`;
  const couple = `Hi Jamie,\n\nYour draw\nVendor: Example Vendor\nDraw item: ${description}${value ? `\nApproximate value: ${value}` : ''}\n\nWhat happens next\nExample Vendor will follow up.\nVendor profile: https://www.weddingwin.ca/example\n\nWhy you received this\nYou opted in.`;
  return { name, description, value, vendor, couple, ...options };
};
const cases = [
  makeCase('full allowed description', `${'A'.repeat(984)} end-of-prize!!!`, '$1234.56 CAD', { email: email254 }),
  makeCase('multiline and blank lines', 'First line\nSecond line\n\nLast paragraph'),
  makeCase('unicode full length', `${'é'.repeat(995)} FIN!`),
  makeCase('HTML is text, not markup', 'Gift <img src=x onerror="alert(1)"> & a <script>bad()</script>\nNext line'),
  makeCase('description can mention value', 'Package note\nApproximate value: $1.00 CAD\nThis is only an example', '$250.00 CAD'),
  makeCase('legacy Draw item', 'Legacy prize', '', { couple: '', vendor: 'Winner details\nName: Jamie\nEmail: couple@example.invalid\n\nDraw item\nLegacy prize\n\nContact information\nTerms.' }),
  makeCase('vendor Draw record fallback', 'Full fallback\nSecond line', '$49.00 CAD', { couple: '' }),
  makeCase('legacy Prize line', 'Legacy couple prize', '', { vendor: '', couple: 'Vendor: Vendor\nPrize: Legacy couple prize\n\nNext steps\nContact vendor.' }),
  makeCase('no invented value', 'Prize without a quoted value', ''),
  makeCase('signed fields override stale prose and heading collisions', 'First paragraph\n\nWhat happens next\nThis is part of the prize\n\nWhy you received this\nStill part of the prize', '$250.00 CAD', {
    vendor: 'Draw item\nSTALE PRIZE\nApproximate value: $1.00 CAD',
    couple: 'Draw item: STALE PRIZE\nApproximate value: $1.00 CAD\n\nWhat happens next\nStale body.',
    data: { prize_description: 'First paragraph\n\nWhat happens next\nThis is part of the prize\n\nWhy you received this\nStill part of the prize', prize_approx_value_cad: '250' },
  }),
  makeCase('exact native photography test snapshot', 'A $250 credit toward a wedding photography package. TEST EMAIL — app preview only; no prize is awarded.', '$250.00 CAD', {
    data: { prize_description: 'A $250 credit toward a wedding photography package. TEST EMAIL — app preview only; no prize is awarded.', prize_approx_value_cad: '250' },
  }),
];
assert.equal(cases[0].description.length, 1000);
assert.equal(cases[2].description.length, 1000);
const encoded = Buffer.from(JSON.stringify(cases)).toString('base64');
const code = `${helpers}
  function ww_qbdes_json($ok, $message, $extra = array()) { throw new RuntimeException($message); }
  $cases = json_decode(base64_decode('${encoded}'), true); $results = array();
  foreach ($cases as $case) {
    $vendorText = $case['vendor']; $incomingCoupleText = $case['couple'];
    $data = isset($case['data']) ? $case['data'] : array();
    $incomingCoupleSubject = 'Your name was selected for a QR Bingo booth draw';
    ${renderer}
    $results[] = array('name' => $case['name'], 'details' => $prizeDetails,
      'text' => $coupleText, 'html' => $coupleHtml, 'vendor_html' => $vendorHtml,
      'vendor_text' => $vendorText);
  }
  echo json_encode($results);
`;
const output = execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', code], {
  encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000,
});
const results = JSON.parse(output);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#039;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

test('BD-style stripslashes leaves actual PHP helpers and callsite behavior unchanged', () => {
  assert.ok(!helpers.includes('\\') && !renderer.includes('\\'), 'PHP source needs no backslash-preservation assumption');
  const helperBytes = Buffer.from(helpers).toString('base64');
  const rendererBytes = Buffer.from(renderer).toString('base64');
  const strippedCode = `eval(stripslashes(base64_decode('${helperBytes}')));
    function ww_qbdes_json($ok, $message, $extra = array()) { throw new RuntimeException($message); }
    $cases = json_decode(base64_decode('${encoded}'), true); $results = array();
    foreach ($cases as $case) {
      $vendorText = $case['vendor']; $incomingCoupleText = $case['couple'];
      $data = isset($case['data']) ? $case['data'] : array();
      $incomingCoupleSubject = 'Your name was selected for a QR Bingo booth draw';
      eval(stripslashes(base64_decode('${rendererBytes}')));
      $results[] = array('name' => $case['name'], 'details' => $prizeDetails,
        'text' => $coupleText, 'html' => $coupleHtml, 'vendor_html' => $vendorHtml,
        'vendor_text' => $vendorText);
    }
    echo json_encode($results);`;
  const stripped = execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', strippedCode], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000,
  });
  assert.deepEqual(JSON.parse(stripped), results, 'all descriptions, values, text and HTML must survive BD render stripping byte-for-byte');
});

test('older PHP NUL-pattern restriction cannot reject valid signed prize details', () => {
  // PHP bug77726: pre-2022 runtimes reject literal NUL bytes inside patterns.
  // Run actual helper bodies with that runtime restriction, not a simplified parser.
  const compatibleHelpers = helpers.replace(/\bpreg_(match|replace|split)\(/g, 'ww_compat_preg_$1(');
  const helperBytes = Buffer.from(compatibleHelpers).toString('base64');
  const rendererBytes = Buffer.from(renderer).toString('base64');
  const compatCode = `
    function ww_compat_pattern($pattern) { if (strpos($pattern, chr(0)) !== false) { throw new RuntimeException('Null byte in regex'); } }
    function ww_compat_preg_match($pattern, $subject, &$matches = array(), $flags = 0, $offset = 0) { ww_compat_pattern($pattern); return preg_match($pattern, $subject, $matches, $flags, $offset); }
    function ww_compat_preg_replace($pattern, $replacement, $subject) { ww_compat_pattern($pattern); return preg_replace($pattern, $replacement, $subject); }
    function ww_compat_preg_split($pattern, $subject, $limit = -1, $flags = 0) { ww_compat_pattern($pattern); return preg_split($pattern, $subject, $limit, $flags); }
    eval(stripslashes(base64_decode('${helperBytes}')));
    function ww_qbdes_json($ok, $message, $extra = array()) { throw new RuntimeException($message); }
    $cases = json_decode(base64_decode('${encoded}'), true); $results = array();
    foreach ($cases as $case) {
      $vendorText = $case['vendor']; $incomingCoupleText = $case['couple'];
      $data = isset($case['data']) ? $case['data'] : array();
      $incomingCoupleSubject = 'Your name was selected for a QR Bingo booth draw';
      eval(stripslashes(base64_decode('${rendererBytes}')));
      $results[] = array('name' => $case['name'], 'details' => $prizeDetails,
        'text' => $coupleText, 'html' => $coupleHtml, 'vendor_html' => $vendorHtml,
        'vendor_text' => $vendorText);
    }
    echo json_encode($results);`;
  const compatible = execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', compatCode], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000,
  });
  assert.deepEqual(JSON.parse(compatible), results);
});

for (const [index, fixture] of cases.entries()) {
  test(`actual PHP renderer: ${fixture.name}`, () => {
    const result = results[index];
    assert.equal(result.name, fixture.name);
    assert.deepEqual(result.details, { description: fixture.description, value: fixture.value });
    assert.ok(result.text.includes(`Draw item: ${fixture.description}`));
    assert.ok(result.html.includes(escape(fixture.description).replaceAll('\n', '<br />\n')));
    assert.ok(result.vendor_html.includes(escape(fixture.description).replaceAll('\n', '<br />\n')));
    if (fixture.value) {
      assert.ok(result.text.includes(`Approximate value: ${fixture.value}`));
      for (const html of [result.html, result.vendor_html]) assert.ok(html.includes(`<strong>Approximate value:</strong> ${fixture.value}`));
    } else {
      assert.ok(!result.text.includes('Approximate value:'));
      assert.ok(!result.html.includes('Approximate value:'));
    }
    assert.equal(result.vendor_text, fixture.vendor, 'vendor plain text remains the complete signed Edge copy');
  });
}

test('254-character contact email is complete and can wrap', () => {
  const html = results[0].vendor_html;
  assert.ok(html.includes(`href="mailto:${email254}"`));
  assert.ok(html.includes(`>${email254}</a>`));
  assert.ok(html.includes('overflow-wrap:anywhere'));
});

test('HTML-looking prize details cannot inject markup', () => {
  for (const html of [results[3].html, results[3].vendor_html]) {
    assert.doesNotMatch(html, /<img|<script/i);
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&lt;script&gt;'));
  }
});

test('renderer reads the signed payload and preserves delivery identity checks', () => {
  assert.ok(widget.indexOf('ww_qbdes_valid_signature($payload, $expires, $signature)') < widget.indexOf("$prizeDetails = ww_qbdes_prize_details"));
  assert.ok(widget.includes("$couplePayloadHash = hash('sha256', json_encode(array($coupleTo, $coupleSubject, $coupleText)))"));
  assert.ok(widget.includes("$vendorPayloadHash = hash('sha256', json_encode(array($vendorTo, $vendorSubject, $vendorText)))"));
  assert.ok(widget.includes("ww_qbdes_claim_delivery($eventKey, 'couple', $coupleDeliveryKey, $couplePayloadHash)"));
  assert.ok(widget.includes("ww_qbdes_claim_delivery($eventKey, 'vendor', $vendorDeliveryKey, $vendorPayloadHash)"));
});

test('invalid or incomplete explicit snapshots cannot fall back to older prose', () => {
  const invalid = [
    { prize_description: 'Only a description' },
    { prize_approx_value_cad: '125.00' },
    { prize_description: '', prize_approx_value_cad: '125.00' },
    { prize_description: 'X'.repeat(1001), prize_approx_value_cad: '125.00' },
    { prize_description: 'Prize\u0000bad', prize_approx_value_cad: '125.00' },
    { prize_description: 'Prize', prize_approx_value_cad: '0' },
    { prize_description: 'Prize', prize_approx_value_cad: '-1' },
    { prize_description: 'Prize', prize_approx_value_cad: 'NaN' },
    { prize_description: 'Prize', prize_approx_value_cad: '125<script>' },
    { prize_description: ['not text'], prize_approx_value_cad: '125.00' },
  ];
  const encodedInvalid = Buffer.from(JSON.stringify(invalid)).toString('base64');
  const helperBytes = Buffer.from(helpers).toString('base64');
  const validationCode = `eval(stripslashes(base64_decode('${helperBytes}')));
    $cases = json_decode(base64_decode('${encodedInvalid}'), true); $result = array();
    foreach ($cases as $data) {
      $result[] = ww_qbdes_prize_details('Draw item\\nOld prize', 'Draw item: Old prize', $data) === false;
    }
    echo json_encode($result);`;
  const validation = execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', validationCode], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000,
  });
  assert.deepEqual(JSON.parse(validation), invalid.map(() => true));
  assert.ok(widget.indexOf("if ($prizeDetails === false)") < widget.indexOf("$vendorPayloadHash ="), 'reject before acquiring delivery keys or sending');
});
