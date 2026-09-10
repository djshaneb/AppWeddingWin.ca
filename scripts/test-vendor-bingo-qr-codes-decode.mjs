import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Offline only: exercise the real frontend SVG renderer and both real scanner
// parsers. No browser, network, database, contacts, or scan writes are involved.
// Supply jsqr via the existing dependency tree, or install it in a temporary
// directory and set QR_DECODER_MODULE to that directory's node_modules/jsqr.
const require = createRequire(import.meta.url);
const decoderModule = process.env.QR_DECODER_MODULE || 'jsqr';
let decoderPath;
try {
  decoderPath = require.resolve(decoderModule);
} catch {
  throw new Error('Install jsqr@1.4.0 in a temporary directory and set QR_DECODER_MODULE to its node_modules/jsqr path.');
}
const { default: jsQR } = await import(pathToFileURL(decoderPath).href);
assert.equal(typeof jsQR, 'function', 'The decoder must export jsQR.');

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('brilliant-directories/widgets/ww-vendor-bingo-qr-codes.js');
const ast = ts.createSourceFile('qr-ui.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let renderSource;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.getText(ast) === 'qrSvg') {
    assert.equal(renderSource, undefined, 'There must be one QR SVG renderer.');
    renderSource = node.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert(renderSource, 'The actual QR SVG renderer must exist.');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.attributes = {};
    this.children = [];
    this.textContent = '';
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  appendChild(child) { this.children.push(child); return child; }
}

const renderer = vm.createContext({ document: { createElementNS: (_namespace, tag) => new Element(tag) } });
vm.runInContext(
  read('brilliant-directories/assets/qrcode-generator-1.4.4.js') +
    '\n' + renderSource + '\nglobalThis.render = qrSvg;',
  renderer,
);
const compile = text => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const native = vm.createContext({ exports: {}, URL });
vm.runInContext(compile(read('lib/webview_url_policy.ts')), native);
const websiteSource = read('brilliant-directories/widgets/258-julian-qr-code-bingo.php');
const start = websiteSource.indexOf('    function extractWeddingWinQrVendorId(');
const end = websiteSource.indexOf('    function resetLastDecodedForRetry(', start);
assert(start > 0 && end > start, 'The actual website QR parser must exist.');
const website = vm.createContext({ URL });
vm.runInContext(websiteSource.slice(start, end) + '\nglobalThis.parse = extractWeddingWinQrVendorId;', website);

// Stable-ID fixtures from the 2026-09-08 published-tag roster snapshot. The test
// does not query live membership and does not assert that these remain members.
const vendorIds = ['16849', '23608', '27768', '29211', '29215', '31521', '37878',
  '38085', '38117', '38118', '38140', '38290', '38519', '39061',
  // Longest accepted IDs exercise the densest supported payload at compact size.
  '123456789012345678', '999999999999999999'];

function svgPixels(svg, pixels) {
  assert.equal(svg.attributes.role, 'img');
  const side = Number(svg.attributes.viewBox.split(' ')[2]);
  assert(Number.isInteger(side) && side >= 29 && side <= 185);
  assert.equal(svg.children.find(child => child.tagName === 'rect').attributes.fill, '#ffffff');
  const path = svg.children.find(child => child.tagName === 'path');
  assert.equal(path.attributes.fill, '#000000');
  const segments = [...path.attributes.d.matchAll(/M([0-9]+) ([0-9]+)h([0-9]+)v1h-([0-9]+)z/g)];
  assert.equal(segments.map(segment => segment[0]).join(''), path.attributes.d, 'Every SVG path command must be rasterized.');
  const grid = new Uint8Array(side * side);
  for (const segment of segments) {
    const [x, y, length, back] = segment.slice(1).map(Number);
    assert.equal(length, back);
    assert(x >= 4 && y >= 4 && x + length <= side - 4 && y < side - 4, 'Preserve the four-module quiet zone.');
    for (let offset = 0; offset < length; offset++) grid[y * side + x + offset] = 1;
  }
  // Rasterize the SVG path output, not the encoder's internal module matrix:
  // this catches path-construction, offset, quiet-zone, and sizing regressions.
  const image = new Uint8ClampedArray(pixels * pixels * 4);
  for (let y = 0; y < pixels; y++) {
    for (let x = 0; x < pixels; x++) {
      const color = grid[Math.floor((y + 0.5) * side / pixels) * side + Math.floor((x + 0.5) * side / pixels)] ? 0 : 255;
      const offset = (y * pixels + x) * 4;
      image[offset] = image[offset + 1] = image[offset + 2] = color;
      image[offset + 3] = 255;
    }
  }
  return image;
}

for (const id of vendorIds) {
  test(`frontend SVG for vendor ${id} decodes to the same app and website identity`, () => {
    const expected = 'https://www.weddingwin.ca/qr?vendor_id=' + id;
    const svg = renderer.render({ id, name: 'Offline vendor ' + id, qr_url: expected });
    // Custom cards allow QR codes down to 1in: 96px at 96dpi and 300px
    // at 300dpi. Retain earlier compact-card and screen-size coverage as well.
    for (const pixels of [96, 120, 189, 240, 300, 375, 378]) {
      const decoded = jsQR(svgPixels(svg, pixels), pixels, pixels, { inversionAttempts: 'dontInvert' });
      assert(decoded, `Vendor ${id} must decode at ${pixels}px.`);
      assert.equal(decoded.data, expected);
      assert(native.exports.qrPayloadUrlAllowed(decoded.data));
      assert.equal(website.parse(decoded.data), id);
    }
  });
}
