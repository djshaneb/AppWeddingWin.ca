import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');

test('couple and vendor fixture copy truthfully allows pinned test email channels', () => {
  const copy = source.replace(/\s+/g, ' ');
  const expected = 'Test emails are sent only to the approved test recipient. No real prize is awarded, and real draw entries are not included.';
  assert.equal(copy.split(expected).length - 1, 2);
  assert.doesNotMatch(copy, /no vendor (?:copy|email) is sent/i);
  assert.doesNotMatch(copy, /one notice is sent only to the allowlisted test mailbox/i);
});

test('fixture copy does not change the actual delivery confirmation or review suppression', () => {
  assert.match(source, /The couple and vendor notices were confirmed sent\./);
  assert.match(source, /Test mode — no real prizes or emails\./);
  assert.match(source, /Email test mode — no real prize/);
});
