import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Pure, offline geometry tests. These exercise the shared source used by both
// browser print CSS and PDF export, without fetching or modifying a vendor.
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../brilliant-directories/assets/ww-vendor-qr-layout.js', import.meta.url), 'utf8'), context);
const resolve = options => context.WWVendorQrLayout.resolve(options);
const epsilon = 1e-7;

function verifyGeometry(result) {
  const numeric = ['width', 'height', 'columns', 'rows', 'perSheet', 'pageWidth', 'pageHeight', 'qrSize', 'padding', 'gap', 'nameSize', 'nameLongSize', 'nameLongestSize', 'sheetWidth', 'sheetHeight'];
  for (const field of numeric) assert(Number.isFinite(result[field]) && result[field] > 0, field + ' must be positive and finite');
  assert(Number.isInteger(result.columns) && Number.isInteger(result.rows));
  assert.equal(result.columns * result.rows, result.perSheet);
  assert(Math.abs(result.sheetWidth - result.columns * result.width) < epsilon);
  assert(Math.abs(result.sheetHeight - result.rows * result.height) < epsilon);
  assert(result.sheetWidth <= result.pageWidth - 0.5 + epsilon, 'Cards fit inside quarter-inch side margins');
  assert(result.sheetHeight <= result.pageHeight - 0.5 + epsilon, 'Cards fit inside quarter-inch top/bottom margins');
  assert(result.qrSize >= 1, 'Custom layouts never shrink the QR below one inch');
  assert(result.qrSize + result.padding * 2 < result.width, 'QR fits the card width');
  assert(result.qrSize + result.padding * 2 < result.height, 'QR fits the card height');
  const nameSpace = (result.horizontal ? result.width : result.height) - result.padding * 2 - result.gap - result.qrSize;
  assert(nameSpace > 0, 'Business name has a separate positive area');
  assert(result.nameSize <= 10, 'Business name is visually secondary to the QR');
  assert(result.nameLongestSize <= result.nameLongSize && result.nameLongSize <= result.nameSize);
  assert.equal(result.pageKey, result.paper + '-' + result.pageOrientation);
  // Worst supported names must still fit beside/below the enlarged QR. A W
  // occupies just under 0.96em in the print font, so use that conservative width.
  const innerWidth = result.width - result.padding * 2 - 1 / 72;
  const innerHeight = result.height - result.padding * 2 - 1 / 72;
  const nameWidth = result.horizontal ? innerWidth - result.qrSize - result.gap : innerWidth;
  const nameHeight = result.horizontal ? innerHeight : innerHeight - result.qrSize - result.gap;
  for (const [length, font] of [[70, result.nameSize], [140, result.nameLongSize], [200, result.nameLongestSize]]) {
    const charsPerLine = Math.floor(nameWidth * 72 / (font * 0.96));
    assert(charsPerLine >= 1, 'At least one wide character fits beside the QR');
    const textHeight = Math.ceil(length / charsPerLine) * font * 1.1 / 72;
    assert(textHeight <= nameHeight + epsilon, length + '-character business name fits without clipping');
  }
}

test('custom cards select the paper rotation with the most exact-size cards', () => {
  const cases = [
    ['letter-custom', 'standard', 3.74, 2.56, 2, 4, 'portrait'],
    ['letter-custom', 'standard', 3, 4, 3, 2, 'landscape'],
    ['letter-custom', 'horizontal', 3, 4, 2, 3, 'portrait'],
    ['letter-custom', 'standard', 4, 6, 2, 1, 'portrait'],
    ['letter-custom', 'horizontal', 4, 6, 1, 2, 'portrait'],
    ['tabloid-custom', 'standard', 3.74, 2.56, 4, 4, 'landscape'],
    ['tabloid-custom', 'standard', 3, 4, 3, 4, 'portrait'],
    ['tabloid-custom', 'horizontal', 3, 4, 4, 3, 'landscape'],
    ['tabloid-custom', 'standard', 5, 3.5, 3, 3, 'landscape'],
    ['tabloid-custom', 'standard', 13, 4, 1, 2, 'landscape'],
  ];
  for (const [layout, orientation, width, height, columns, rows, pageOrientation] of cases) {
    const actual = resolve({ layout, orientation, width, height });
    assert.equal(actual.columns, columns); assert.equal(actual.rows, rows);
    assert.equal(actual.pageOrientation, pageOrientation);
    verifyGeometry(actual);
  }
});

test('custom dimensions remain exact and horizontal only swaps tall cards', () => {
  for (const orientation of ['standard', 'horizontal']) {
    for (const [width, height] of [[3.21, 4.56], [4.56, 3.21], [3.21, 3.21]]) {
      const actual = resolve({ layout: 'letter-custom', orientation, width: String(width), height: String(height) });
      const expected = orientation === 'horizontal' && height > width ? [height, width] : [width, height];
      assert.deepEqual([actual.width, actual.height], expected, 'No silent scaling or rounding of user card dimensions');
      assert.equal(actual.horizontal, orientation === 'horizontal');
      verifyGeometry(actual);
    }
  }
});

test('exact printable boundaries fit while oversized cards fail with helpful errors', () => {
  for (const [layout, width, height] of [['letter-custom', 8, 10.5], ['letter-custom', 10.5, 8], ['tabloid-custom', 10.5, 16.5], ['tabloid-custom', 16.5, 10.5]]) {
    const actual = resolve({ layout, orientation: 'standard', width, height });
    assert.equal(actual.perSheet, 1); verifyGeometry(actual);
  }
  for (const [layout, width, height] of [['letter-custom', 8.01, 10.51], ['letter-custom', 12, 4], ['tabloid-custom', 10.51, 16.5], ['tabloid-custom', 16.5, 16.5]]) {
    assert.throws(() => resolve({ layout, orientation: 'standard', width, height }), /fit|smaller|paper/i);
  }
});

test('equal-capacity custom sheet rotations choose portrait predictably', () => {
  for (const [layout, width, height] of [['letter-custom', 3.5, 3.5], ['tabloid-custom', 5, 5]]) {
    const actual = resolve({ layout, orientation: 'standard', width, height });
    assert.equal(actual.pageOrientation, 'portrait'); verifyGeometry(actual);
  }
});

test('invalid dimensions and layout keys fail closed without NaN geometry', () => {
  for (const value of ['', 'not a number', null, undefined, NaN, Infinity, -Infinity, -1, 0, 1.49, 16.51]) {
    for (const field of ['width', 'height']) {
      assert.throws(() => resolve({ layout: 'letter-custom', orientation: 'standard', width: 4, height: 6, [field]: value }), /width|height|inch|size/i);
    }
  }
  for (const layout of ['', undefined, 'custom', 'letter-unknown', '__proto__', 'constructor']) {
    assert.throws(() => resolve({ layout, orientation: 'standard', width: 4, height: 6 }), /layout/i);
  }
  for (const orientation of ['standard', 'horizontal']) {
    assert.throws(() => resolve({ layout: 'letter-custom', orientation, width: 1.5, height: 1.5 }), /small|clear QR|increase/i);
  }
});

test('custom sizes reject excess decimal precision and cramped horizontal name columns', () => {
  for (const value of [3.211, '3.999', 4.0001]) for (const field of ['width', 'height']) {
    assert.throws(() => resolve({ layout: 'letter-custom', orientation: 'standard', width: 4, height: 6, [field]: value }), /two decimal places/i);
  }
  assert.throws(() => resolve({ layout: 'letter-custom', orientation: 'horizontal', width: 1.75, height: 1.75 }), /small|clear QR|increase/i);
  for (const [width, height] of [[2.25, 2.25], [3.74, 2.56], [3, 4], [4, 1.5]]) {
    verifyGeometry(resolve({ layout: 'letter-custom', orientation: 'horizontal', width, height }));
  }
});

test('thousands of custom width-height combinations fit and use maximum uniform sheet capacity', () => {
  let verified = 0;
  for (const paper of ['letter', 'tabloid']) for (const orientation of ['standard', 'horizontal']) {
    const paperShort = paper === 'letter' ? 8.5 : 11, paperLong = paper === 'letter' ? 11 : 17;
    for (let width = 1.5; width <= 16.5; width += 0.25) for (let height = 1.5; height <= 16.5; height += 0.25) {
      let actual;
      try { actual = resolve({ layout: paper + '-custom', orientation, width, height }); }
      catch (error) { assert.match(error.message, /fit|small|size|inch/i); continue; }
      verifyGeometry(actual);
      const cols = pageWidth => Math.floor((pageWidth - 0.5 + epsilon) / actual.width);
      const rows = pageHeight => Math.floor((pageHeight - 0.5 + epsilon) / actual.height);
      const portraitCount = cols(paperShort) * rows(paperLong), landscapeCount = cols(paperLong) * rows(paperShort);
      assert.equal(actual.perSheet, Math.max(portraitCount, landscapeCount), 'Automatic layout maximizes capacity without shrinking cards');
      assert.equal(actual.pageOrientation, portraitCount >= landscapeCount ? 'portrait' : 'landscape');
      verified++;
    }
  }
  assert(verified > 5000, 'Exercise a broad range of valid custom geometries');
});
