#!/usr/bin/env node
// Runs the actual PHP test-delivery policy with synthetic payloads only.
// Offline cached PHP.wasm; no credentials, database, network or mail transport.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const widget = readFileSync(new URL('../brilliant-directories/widgets/336-qr-bingo-draw-email-sender.php', import.meta.url), 'utf8');
function slice(start, end) {
  const from = widget.indexOf(start), to = widget.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Actual PHP section missing: ${start}`);
  return widget.slice(from, to);
}
const cleaners = slice('    function ww_qbdes_clean(', '    function ww_qbdes_e(');
const productionGate = slice('    if ($isEmailTestFixture) {', '    if (!$sendVendor && !$sendCouple) {');
const base = 'qa.tester@example.invalid';
const alias = 'qa.tester+couple-test@example.invalid';
// Change the two allowlist hashes only in this isolated PHP test copy.
// The production sender and its authorized recipients are never modified.
const syntheticHashes = [base, alias].map(value => createHash('sha256').update(value).digest('hex'));
const hashNames = ['expectedRecipientHash', 'expectedCoupleAliasHash'];
let gate = productionGate;
for (const [index, name] of hashNames.entries()) {
  const pattern = new RegExp('(\\$' + name + "\\s*=\\s*')[a-f0-9]{64}(')");
  assert.equal([...gate.matchAll(new RegExp(pattern, 'g'))].length, 1, 'Expected exactly one pinned production hash');
  gate = gate.replace(pattern, (_, prefix, suffix) => prefix + syntheticHashes[index] + suffix);
}
const valid = {
  draw_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  fixture_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email_test_fixture: '1',
};
const cases = [];
function check(name, recipient, allowed, overrides = {}) {
  cases.push({ name, recipient, allowed, fixture: true, vendor: false, couple: true,
    subject: 'Your name was selected for a QR Bingo booth draw', data: valid, ...overrides });
}
check('authorized base address', base, true);
check('exact authorized plan18 couple alias', alias, true);
check('unapproved alias', 'qa.tester+unapproved-1@example.invalid', false);
check('vendor alias is not a couple recipient', 'qa.tester+unapproved-2@example.invalid', false);
check('different dated alias', 'qa.tester+unapproved-3@example.invalid', false);
check('lookalike domain', `${alias}.evil.example`, false);
check('no automatic mailbox dot normalization', 'qatester@example.invalid', false);
check('blank recipient', '', false);
check('vendor copy prohibited', alias, false, { vendor: true });
check('couple channel required', alias, false, { couple: false });
check('fixture marker required', alias, false, { data: { ...valid, email_test_fixture: '0' } });
check('draw UUID required', alias, false, { data: { ...valid, draw_id: 'bad' } });
check('fixture UUID required', alias, false, { data: { ...valid, fixture_id: 'bad' } });
check('exact test subject required', alias, false, { subject: 'Changed subject' });
check('ordinary production recipient unaffected', 'couple@example.invalid', true,
  { fixture: false, data: { ...valid, email_test_fixture: '0' } });
check('test marker prohibited on production', alias, false, { fixture: false });
check('explicit vendor copy goes to exact base mailbox', base, true,
  { vendor: true, data: { ...valid, email_test_vendor_copy: '1' }, vendorRecipient: base });
check('vendor-only retry after couple sent', base, true,
  { vendor: true, couple: false, data: { ...valid, email_test_vendor_copy: '1' }, vendorRecipient: base });
check('couple-only retry after vendor sent', base, true,
  { data: { ...valid, email_test_vendor_copy: '1' }, vendorRecipient: base });
check('vendor copy cannot use old authorized couple alias', alias, false,
  { vendor: true, data: { ...valid, email_test_vendor_copy: '1' }, vendorRecipient: alias });
check('vendor copy cannot use actual vendor mailbox', base, false,
  { vendor: true, data: { ...valid, email_test_vendor_copy: '1' }, vendorRecipient: 'vendor@example.invalid' });
check('vendor copy cannot smuggle recipient on couple-only retry', base, false,
  { data: { ...valid, email_test_vendor_copy: '1' }, vendorRecipient: 'vendor@example.invalid' });

test('actual PHP preserves production and admits only the two exact authorized test recipients', () => {
  const encoded = Buffer.from(JSON.stringify(cases)).toString('base64');
  const code = `${cleaners}
    function ww_qbdes_json($ok, $message, $extra = array()) { throw new RuntimeException('blocked'); }
    $cases = json_decode(base64_decode('${encoded}'), true);
    $results = array();
    foreach ($cases as $case) {
      $data = $case['data']; $coupleTo = $case['recipient'];
      $vendorTo = isset($case['vendorRecipient']) ? $case['vendorRecipient'] : '';
      $isEmailTestFixture = $case['fixture']; $sendVendor = $case['vendor'];
      $sendCouple = $case['couple']; $incomingCoupleSubject = $case['subject'];
      $allowed = true;
      try { ${gate} } catch (RuntimeException $error) { $allowed = false; }
      $results[] = array('name' => $case['name'], 'allowed' => $allowed);
    }
    echo json_encode($results);
  `;
  const stdout = execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', code], {
    encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 60000,
  });
  const results = JSON.parse(stdout);
  assert.equal(results.length, cases.length);
  for (const [index, result] of results.entries()) {
    assert.equal(result.name, cases[index].name);
    assert.equal(result.allowed, cases[index].allowed, result.name);
  }
  assert.equal([...gate.matchAll(/hash_equals\(/g)].length, 4, 'Existing exact couple hashes plus stricter exact base and equal vendor-copy target');
  assert.ok(widget.indexOf("strpos($eventKey, 'app-review-') === 0") < widget.indexOf(productionGate),
    'App Review suppression must remain before the test allowlist');
});
