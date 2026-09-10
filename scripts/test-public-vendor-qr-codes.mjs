import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const source = readFileSync(new URL('../brilliant-directories/widgets/ww-vendor-bingo-qr-codes.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../brilliant-directories/widgets/ww-vendor-bingo-qr-codes.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../brilliant-directories/widgets/ww-vendor-bingo-qr-codes.css', import.meta.url), 'utf8');
const encoderSource = readFileSync(new URL('../brilliant-directories/assets/qrcode-generator-1.4.4.js', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../brilliant-directories/assets/ww-vendor-qr-layout.js', import.meta.url), 'utf8');
const layoutContext = vm.createContext({});
vm.runInContext(layoutSource, layoutContext);
const resolveLayout = options => layoutContext.WWVendorQrLayout.resolve(options);
const decoder = process.env.VENDOR_QR_JSQR ? (await import(pathToFileURL(process.env.VENDOR_QR_JSQR))).default : null;
const canonical = id => 'https://www.weddingwin.ca/qr?vendor_id=' + id;
const feed = () => ({ ok: true, event: { key: 'niagara-wedding-show-2026', name: 'Niagara Wedding Show', venue: 'Americana Resort', starts_at: '2026-10-18T15:00:00+00:00', revision: 12 }, vendors: [{ id: '39061', name: 'Rose Photography', qr_url: canonical('39061') }, { id: '123456789012345678', name: 'Wedding Music & More', qr_url: canonical('123456789012345678') }], total: 2, generated_at: '2026-09-08T17:00:00Z' });
const response = (value = feed(), { status = 200, type = 'application/json; charset=utf-8', body, length = null } = {}) => ({ ok: status < 400, headers: { get: key => key === 'content-type' ? type : key === 'content-length' ? length : null }, text: async () => body === undefined ? JSON.stringify(value) : body });
const flush = () => new Promise(resolve => setImmediate(resolve));
const cardQr = card => card.children.find(node => node.tag === 'svg');
const cardName = card => card.children.find(node => node.tag === 'h3');
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const cardsOf = f => descendants(f.nodes.wwVendorCodesGrid).filter(node => node.tag === 'article');
// Required physical arrangements, independent of the UI's layout metadata.
// [layout, card orientation, card inches, paper inches, columns/rows, page key]
const printGeometries = [
  ['letter-eight', 'standard', [3.74, 2.56], [8.5, 11], [2, 4], 'letter-portrait'],
  ['letter-six', 'standard', [3, 4], [11, 8.5], [3, 2], 'letter-landscape'],
  ['letter-four', 'standard', [3.5, 5], [8.5, 11], [2, 2], 'letter-portrait'],
  ['letter-two', 'standard', [4, 6], [11, 8.5], [2, 1], 'letter-landscape'],
  ['tabloid-sixteen', 'standard', [3.74, 2.56], [17, 11], [4, 4], 'tabloid-landscape'],
  ['tabloid-twelve', 'standard', [3, 4], [11, 17], [3, 4], 'tabloid-portrait'],
  ['tabloid-nine', 'standard', [3.5, 5], [11, 17], [3, 3], 'tabloid-portrait'],
  ['tabloid-four', 'standard', [4, 6], [11, 17], [2, 2], 'tabloid-portrait'],
  ['letter-eight', 'horizontal', [3.74, 2.56], [8.5, 11], [2, 4], 'letter-portrait'],
  ['letter-six', 'horizontal', [4, 3], [8.5, 11], [2, 3], 'letter-portrait'],
  ['letter-four', 'horizontal', [5, 3.5], [11, 8.5], [2, 2], 'letter-landscape'],
  ['letter-two', 'horizontal', [6, 4], [8.5, 11], [1, 2], 'letter-portrait'],
  ['tabloid-sixteen', 'horizontal', [3.74, 2.56], [17, 11], [4, 4], 'tabloid-landscape'],
  ['tabloid-twelve', 'horizontal', [4, 3], [17, 11], [4, 3], 'tabloid-landscape'],
  ['tabloid-nine', 'horizontal', [5, 3.5], [17, 11], [3, 3], 'tabloid-landscape'],
  ['tabloid-four', 'horizontal', [6, 4], [17, 11], [2, 2], 'tabloid-landscape'],
];

class Element {
  constructor(tag) { this.tag = tag; this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.dataset = {}; this.children = []; this.attributes = {}; this.listeners = {}; this.replacements = 0; this.parentNode = null; this.style = { setProperty(key, value) { this[key] = String(value); }, getPropertyValue(key) { return this[key] || ''; } }; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  removeAttribute(key) { delete this.attributes[key]; }
  removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentNode = null; return node; }
  appendChild(node) {
    if (node.tag === '#fragment') { [...node.children].forEach(child => this.appendChild(child)); return node; }
    if (node.parentNode) node.parentNode.removeChild(node);
    this.children.push(node); node.parentNode = this; return node;
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren(...nodes) { [...this.children].forEach(node => this.removeChild(node)); this.append(...nodes); this.replacements++; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  trigger(type) { (this.listeners[type] || []).forEach(handler => handler({ preventDefault() {} })); }
}
function fixture({ respond, held = false, useEncoder = true, feedUrl = '/vendor-bingo-qr-codes?format=json', download } = {}) {
  const ids = ['wwVendorCodes', 'wwVendorCodesGrid', 'wwVendorCodesStatus', 'wwVendorCodesSearch', 'wwVendorCodesRefresh', 'wwVendorCodesPrint', 'wwVendorCodesPrintLayout', 'wwVendorCodesCardOrientation', 'wwVendorCodesPrintHelp', 'wwVendorCodesEmpty', 'wwVendorCodesCount', 'wwVendorCodesChecked', 'wwVendorCodesEventName', 'wwVendorCodesEventDetails', 'wwVendorCodesPrintSummary', 'wwVendorCodesCustomSize', 'wwVendorCodesCardWidth', 'wwVendorCodesCardHeight', 'wwVendorCodesDownload', 'wwVendorCodesLayoutError'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  nodes.wwVendorCodes.dataset.feedUrl = feedUrl;
  nodes.wwVendorCodesPrintLayout.value = 'letter-eight';
  nodes.wwVendorCodesCardOrientation.value = 'standard';
  nodes.wwVendorCodesCardWidth.value = '3.74';
  nodes.wwVendorCodesCardHeight.value = '2.56';
  const created = [], requests = [], intervals = [], pdfs = [], timers = new Map(); let timerId = 0, clock = Date.parse('2026-09-08T17:00:00Z'), prints = 0, release;
  const pending = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const events = {};
  const document = {
    readyState: 'complete', hidden: false,
    head: new Element('head'),
    getElementById: id => nodes[id],
    createElement: tag => { const node = new Element(tag); created.push(node); return node; },
    createElementNS: (namespace, tag) => { const node = new Element(tag); node.namespace = namespace; created.push(node); return node; },
    createDocumentFragment: () => new Element('#fragment'),
    addEventListener: (type, callback) => { (events[type] ||= []).push(callback); },
  };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({
    document, Intl, Date: ClockDate, AbortController,
    setTimeout: (fn, delay) => { const id = ++timerId; if (delay === 0) queueMicrotask(fn); else timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    print: () => { prints++; },
    WWVendorQrPdf: { download: async value => { pdfs.push(value); if (download) await download(value); } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (held) await Promise.race([pending, new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timeout')), { once: true }))]);
      return respond ? respond(requests.length, options) : response();
    },
  });
  context.window = context;
  vm.runInContext(layoutSource, context);
  if (useEncoder) vm.runInContext(encoderSource, context);
  vm.runInContext(source, context);
  return { nodes, created, requests, intervals, pdfs, timers, document, prints: () => prints, release: () => release?.(), initializeAgain: () => vm.runInContext(source, context), advance: milliseconds => { clock += milliseconds; }, visibility: hidden => { document.hidden = hidden; (events.visibilitychange || []).forEach(fn => fn()); } };
}

function assertRootGeometry(f, expected) {
  const inchFields = { 'card-width': 'width', 'card-height': 'height', 'sheet-width': 'sheetWidth', 'sheet-height': 'sheetHeight', 'card-padding': 'padding', 'card-gap': 'gap', 'qr-size': 'qrSize' };
  for (const [property, field] of Object.entries(inchFields)) assert.equal(f.nodes.wwVendorCodes.style.getPropertyValue('--' + property), expected[field] + 'in');
  for (const field of ['columns', 'rows']) assert.equal(f.nodes.wwVendorCodes.style.getPropertyValue('--' + field), String(expected[field]));
  for (const [property, field] of [['name-size', 'nameSize'], ['name-long-size', 'nameLongSize'], ['name-longest-size', 'nameLongestSize']]) {
    assert.equal(f.nodes.wwVendorCodes.style.getPropertyValue('--' + property), expected[field] + 'pt');
  }
}

test('public page fetches only its exact read-only same-origin feed and renders event/date/venue', async () => {
  const f = fixture(); await flush();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, '/vendor-bingo-qr-codes?format=json');
  assert.equal(f.requests[0].options.method, 'GET'); assert.equal(f.requests[0].options.cache, 'no-store'); assert.equal(f.requests[0].options.redirect, 'error');
  assert.equal(f.nodes.wwVendorCodesEventName.textContent, 'Niagara Wedding Show');
  assert.match(f.nodes.wwVendorCodesEventDetails.textContent, /Sunday, October 18, 2026.*Americana Resort/);
  assert.equal(f.nodes.wwVendorCodesCount.textContent, '2 vendors');
  assert.equal(cardsOf(f).length, 2); assert.equal(f.nodes.wwVendorCodesPrint.disabled, false);
  assert.equal(f.created.some(node => ['a', 'iframe', 'script'].includes(node.tag)), false);
  assert.equal(source.includes('\\'), false);
});

test('QR SVG uses local encoder matrix with a white four-module quiet zone and black paths', async () => {
  const f = fixture(); await flush();
  for (const card of cardsOf(f)) {
    const svg = cardQr(card);
    assert.equal(svg.tag, 'svg'); assert.equal(svg.namespace, 'http://www.w3.org/2000/svg'); assert.equal(svg.attributes.role, 'img');
    assert.equal(svg.children[1].attributes.fill, '#ffffff'); assert.equal(svg.children[2].attributes.fill, '#000000');
    const [x, y, width, height] = svg.attributes.viewBox.split(' ').map(Number); assert.equal(x, 0); assert.equal(y, 0); assert.equal(width, height);
    assert.equal(svg.children[1].attributes.width, String(width));
    const runs = [...svg.children[2].attributes.d.matchAll(/M([0-9]+) ([0-9]+)h([0-9]+)v1h-([0-9]+)z/g)];
    assert(runs.length > 100);
    assert.equal(runs.map(run => run[0]).join(''), svg.children[2].attributes.d);
    for (const [, left, top, run, reverse] of runs) { assert(Number(left) >= 4); assert(Number(top) >= 4); assert(Number(left) + Number(run) <= width - 4); assert(Number(top) + 1 <= height - 4); assert.equal(run, reverse); }
    assert.match(svg.attributes['aria-label'], /Vendor Bingo QR code/);
  }
});

test('every card contains only its locally generated QR followed by the complete business name, with no logo', async () => {
  const value = feed();
  value.vendors[1].name = 'A long business name — ' + 'Wedding '.repeat(22);
  const f = fixture({ respond: () => response(value) }); await flush();
  const cards = cardsOf(f);
  assert.equal(cards.length, value.vendors.length);
  for (const [index, card] of cards.entries()) {
    const qr = cardQr(card), name = cardName(card);
    assert(qr, 'Every card must retain its locally generated QR.');
    assert(name, 'Every card must label the business.');
    assert.deepEqual(card.children.map(node => node.tag), ['svg', 'h3'], 'Only QR then name, without logo/caption/vendor ID.');
    assert.equal(name.textContent, value.vendors[index].name);
    assert.equal(qr.attributes.class || qr.className, 'ww-vendor-codes-qr');
  }
  assert.equal(f.requests.length, 1, 'Card rendering must not make QR or scan requests.');
  assert.equal(f.created.some(node => node.tag === 'img'), false);
  assert.doesNotMatch(source, /vendorLogoDataUrl|ww-vendor-codes-logo|base64|createElement\(['"]img['"]\)/);
  assert.doesNotMatch(css, /ww-vendor-codes-logo|--logo-/);
});

test('long business names remain complete and get readable print sizing rather than truncation', async () => {
  const value = feed(), lengths = [70, 71, 140, 141, 200];
  value.vendors = lengths.map((length, index) => ({ id: String(800 + index), name: 'W'.repeat(length), qr_url: canonical(800 + index) })); value.total = value.vendors.length;
  const f = fixture({ respond: () => response(value) }); await flush();
  assert.equal(cardsOf(f).length, lengths.length);
  for (const [index, card] of cardsOf(f).entries()) {
    const name = cardName(card); assert.equal(name.textContent, 'W'.repeat(lengths[index]));
    const sizing = lengths[index] > 140 ? 'ww-vendor-codes-name-longest' : lengths[index] > 70 ? 'ww-vendor-codes-name-long' : '';
    assert.equal(name.className, 'ww-vendor-codes-name' + (sizing ? ' ' + sizing : ''));
  }
  assert.match(css, /\.ww-vendor-codes-name-long\{font-size:var\(--name-long-size\)/);
  assert.match(css, /\.ww-vendor-codes-name-longest\{font-size:var\(--name-longest-size\)/);
  assert.match(css, /\.ww-vendor-codes-name\{[^}]*overflow-wrap:anywhere/);
  assert.doesNotMatch(css, /line-clamp|text-overflow:ellipsis/);
});

function raster(svg, scale = 8) {
  const modules = Number(svg.attributes.viewBox.split(' ')[2]), size = modules * scale;
  const pixels = new Uint8ClampedArray(size * size * 4); pixels.fill(255);
  for (const [, left, top, width] of svg.children[2].attributes.d.matchAll(/M([0-9]+) ([0-9]+)h([0-9]+)v1h-[0-9]+z/g)) {
    for (let y = Number(top) * scale; y < (Number(top) + 1) * scale; y++) for (let x = Number(left) * scale; x < (Number(left) + Number(width)) * scale; x++) { const offset = (y * size + x) * 4; pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0; }
  }
  return { pixels, size };
}
test('actual generated SVG pixels decode to each exact canonical vendor URL', { skip: !decoder && 'Set VENDOR_QR_JSQR to the installed pinned jsQR module path for decoder verification.' }, async () => {
  const f = fixture(); await flush();
  for (const [index, card] of cardsOf(f).entries()) {
    const { pixels, size } = raster(cardQr(card)); const decoded = decoder(pixels, size, size, { inversionAttempts: 'dontInvert' });
    assert(decoded); assert.equal(decoded.data, feed().vendors[index].qr_url);
  }
});

test('search is local, preserves all cards, and Print All opens printing without following QR URLs', async () => {
  const f = fixture(); await flush();
  f.nodes.wwVendorCodesSearch.value = 'music'; f.nodes.wwVendorCodesSearch.trigger('input');
  assert.equal(cardsOf(f)[0].hidden, true); assert.equal(cardsOf(f)[1].hidden, false);
  assert.equal(f.nodes.wwVendorCodesCount.textContent, '1 of 2 vendors shown'); assert.equal(f.requests.length, 1);
  f.nodes.wwVendorCodesPrint.trigger('click'); assert.equal(f.prints(), 1); assert.equal(f.requests.length, 1);
  assert.equal(cardsOf(f).length, 2);
  assert.match(css, /@media print[\s\S]*\.ww-vendor-codes-card\[hidden\]\{display:grid!important/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*grid-template-columns:1fr/);
  f.nodes.wwVendorCodesSearch.value = 'no match'; f.nodes.wwVendorCodesSearch.trigger('input');
  assert.equal(f.nodes.wwVendorCodesEmpty.hidden, false); assert.match(f.nodes.wwVendorCodesEmpty.textContent, /No vendors match/);
  assert.equal(f.nodes.wwVendorCodesPrint.disabled, false);
});

test('all 16 layout and card-orientation combinations preserve 17 QR cards, roster order, and search', async () => {
  const value = feed();
  value.vendors = Array.from({ length: 17 }, (_, index) => ({ id: String(707 + index), name: 'Wedding Vendor ' + index, qr_url: canonical(707 + index) }));
  value.total = value.vendors.length;
  const f = fixture({ respond: () => response(value) }); await flush();
  const originalCards = cardsOf(f), originalQrs = originalCards.map(cardQr);
  const sheets = () => f.nodes.wwVendorCodesGrid.children;
  assert.equal(f.nodes.wwVendorCodes.dataset.printLayout, 'letter-eight');
  assert.equal(f.nodes.wwVendorCodes.dataset.cardOrientation, 'standard');
  assert.equal(f.nodes.wwVendorCodes.dataset.printPage, 'letter-portrait');
  assert.match(f.nodes.wwVendorCodesPrintHelp.textContent, /3[.]74\s*×\s*2[.]56/);
  assert.deepEqual(sheets().map(sheet => sheet.children.length), [8, 8, 1]);
  assert(sheets().every(sheet => sheet.className === 'ww-vendor-codes-sheet'));
  f.nodes.wwVendorCodesSearch.value = 'Vendor 16'; f.nodes.wwVendorCodesSearch.trigger('input');
  assert.equal(cardsOf(f).filter(card => !card.hidden).length, 1);
  for (const [layout, orientation, size, , [columns, rows], page] of printGeometries) {
    const perSheet = columns * rows;
    const counts = Array.from({ length: Math.ceil(17 / perSheet) }, (_, index) => Math.min(perSheet, 17 - index * perSheet));
    f.nodes.wwVendorCodesCardOrientation.value = orientation; f.nodes.wwVendorCodesCardOrientation.trigger('change');
    f.nodes.wwVendorCodesPrintLayout.value = layout; f.nodes.wwVendorCodesPrintLayout.trigger('change'); await flush();
    assert.equal(f.nodes.wwVendorCodes.dataset.printLayout, layout);
    assert.equal(f.nodes.wwVendorCodes.dataset.cardOrientation, orientation);
    assert.equal(f.nodes.wwVendorCodes.dataset.printPage, page);
    assertRootGeometry(f, resolveLayout({ layout, orientation }));
    assert.equal(f.nodes.wwVendorCodesCardOrientation.value, orientation);
    assert.match(f.nodes.wwVendorCodesPrintHelp.textContent, layout.startsWith('tabloid-') ? /11\s*[×x]\s*17|17\s*[×x]\s*11/i : /Letter/i);
    assert(f.nodes.wwVendorCodesPrintHelp.textContent.includes(size.join(' × ')), layout + '/' + orientation + ' help gives actual card dimensions');
    assert.match(f.nodes.wwVendorCodesPrintHelp.textContent, page.endsWith('landscape') ? /landscape/i : /portrait/i);
    assert.deepEqual(sheets().map(sheet => sheet.children.length), counts);
    assert.equal(sheets().length, Math.ceil(value.vendors.length / perSheet));
    assert(sheets().every(sheet => sheet.className === 'ww-vendor-codes-sheet'));
    assert.equal(cardsOf(f).length, 17, 'Print all retains search-hidden vendors.');
    cardsOf(f).forEach((card, index) => {
      assert.equal(card, originalCards[index], 'Layout changes reuse the original card in roster order.');
      assert.equal(cardQr(card), originalQrs[index], 'Layout changes reuse the exact generated QR.');
      assert.equal(card.hidden, index !== 16);
      assert.deepEqual(card.children.map(node => node.tag), ['svg', 'h3'], 'No orientation adds logos or other card content.');
    });
    assert.equal(f.nodes.wwVendorCodesSearch.value, 'Vendor 16');
    assert.equal(f.nodes.wwVendorCodesCount.textContent, '1 of 17 vendors shown');
    assert.equal(f.requests.length, 1);
    const printsBefore = f.prints(); f.nodes.wwVendorCodesPrint.trigger('click');
    assert.equal(f.prints(), printsBefore + 1); assert.equal(f.requests.length, 1);
  }
  // An invalid orientation changes only the orientation fallback, preserving
  // the selected paper/layout, vendor nodes, and active search.
  for (const invalid of ['', 'unexpected-orientation', '__proto__', 'constructor']) {
    f.nodes.wwVendorCodesCardOrientation.value = invalid; f.nodes.wwVendorCodesCardOrientation.trigger('change'); await flush();
    assert.equal(f.nodes.wwVendorCodes.dataset.cardOrientation, 'standard');
    assert.equal(f.nodes.wwVendorCodesCardOrientation.value, 'standard');
    assert.equal(f.nodes.wwVendorCodes.dataset.printLayout, 'tabloid-four');
    assert.equal(f.nodes.wwVendorCodes.dataset.printPage, 'tabloid-portrait');
    assert.deepEqual(sheets().map(sheet => sheet.children.length), [4, 4, 4, 4, 1]);
    assert.equal(cardsOf(f)[16], originalCards[16]); assert.equal(cardsOf(f)[16].hidden, false);
    assert.equal(f.requests.length, 1);
  }
  for (const invalid of ['unexpected-layout', 'tabloid-unknown', '__proto__', 'constructor']) {
    f.nodes.wwVendorCodesPrintLayout.value = invalid; f.nodes.wwVendorCodesPrintLayout.trigger('change'); await flush();
    assert.equal(f.nodes.wwVendorCodes.dataset.printLayout, 'letter-eight');
    assert.equal(f.nodes.wwVendorCodes.dataset.cardOrientation, 'standard');
    assert.equal(f.nodes.wwVendorCodes.dataset.printPage, 'letter-portrait');
    assert.deepEqual(sheets().map(sheet => sheet.children.length), [8, 8, 1]);
    assert.equal(cardsOf(f)[16], originalCards[16]); assert.equal(f.requests.length, 1);
  }
});

test('custom card sizes automatically regroup cards and update exact print geometry without losing the search', async () => {
  const value = feed();
  value.vendors = Array.from({ length: 17 }, (_, index) => ({ id: String(707 + index), name: 'Wedding Vendor ' + index, qr_url: canonical(707 + index) })); value.total = 17;
  const f = fixture({ respond: () => response(value) }); await flush();
  const originalCards = cardsOf(f), originalQrs = originalCards.map(cardQr);
  f.nodes.wwVendorCodesSearch.value = 'Vendor 16'; f.nodes.wwVendorCodesSearch.trigger('input');
  for (const [layout, orientation, width, height] of [
    ['letter-custom', 'standard', '3', '4'], ['letter-custom', 'horizontal', '3', '4'],
    ['tabloid-custom', 'standard', '5', '3.5'], ['tabloid-custom', 'horizontal', '5', '3.5'],
    ['letter-custom', 'standard', '3.21', '4.56'], ['tabloid-custom', 'standard', '10.5', '16.5'],
  ]) {
    f.nodes.wwVendorCodesCardWidth.value = width; f.nodes.wwVendorCodesCardHeight.value = height;
    f.nodes.wwVendorCodesCardOrientation.value = orientation;
    f.nodes.wwVendorCodesPrintLayout.value = layout; f.nodes.wwVendorCodesPrintLayout.trigger('change'); await flush();
    const expected = resolveLayout({ layout, orientation, width, height });
    assert.equal(f.nodes.wwVendorCodesCustomSize.hidden, false); assert.equal(f.nodes.wwVendorCodesLayoutError.hidden, true);
    assert.equal(f.nodes.wwVendorCodes.dataset.printPage, expected.pageKey); assertRootGeometry(f, expected);
    assert.deepEqual(f.nodes.wwVendorCodesGrid.children.map(sheet => sheet.children.length), Array.from({ length: Math.ceil(17 / expected.perSheet) }, (_, index) => Math.min(expected.perSheet, 17 - index * expected.perSheet)));
    assert(f.nodes.wwVendorCodesPrintHelp.textContent.includes(expected.width + ' × ' + expected.height));
    assert.equal(f.nodes.wwVendorCodesPrint.disabled, false); assert.equal(f.nodes.wwVendorCodesDownload.disabled, false);
    cardsOf(f).forEach((card, index) => { assert.equal(card, originalCards[index]); assert.equal(cardQr(card), originalQrs[index]); assert.equal(card.hidden, index !== 16); });
    assert.equal(f.requests.length, 1, 'Editing print dimensions does not refetch or scan a vendor');
  }
  f.nodes.wwVendorCodesPrintLayout.value = 'letter-four'; f.nodes.wwVendorCodesPrintLayout.trigger('change');
  assert.equal(f.nodes.wwVendorCodesCustomSize.hidden, true);
  assert.equal(f.nodes.wwVendorCodesSearch.value, 'Vendor 16');
  assert.equal(cardsOf(f)[16], originalCards[16]);
});

test('invalid custom sizes disable print and PDF, preserve cards, and recover as dimensions are corrected', async () => {
  const f = fixture(); await flush(); const originalCards = cardsOf(f);
  f.nodes.wwVendorCodesPrintLayout.value = 'letter-custom'; f.nodes.wwVendorCodesPrintLayout.trigger('change');
  for (const [width, height] of [['', '4'], ['1.49', '4'], ['16.51', '4'], ['8.01', '10.51'], ['1.5', '1.5'], ['3.211', '4']]) {
    f.nodes.wwVendorCodesCardWidth.value = width; f.nodes.wwVendorCodesCardHeight.value = height;
    f.nodes.wwVendorCodesCardWidth.trigger('input'); await flush();
    assert.equal(f.nodes.wwVendorCodes.dataset.layoutValid, 'false'); assert.equal(f.nodes.wwVendorCodesLayoutError.hidden, false);
    assert(f.nodes.wwVendorCodesLayoutError.textContent.length > 10); assert.equal(f.nodes.wwVendorCodesCardWidth.getAttribute('aria-invalid'), 'true');
    assert.equal(f.nodes.wwVendorCodesPrint.disabled, true); assert.equal(f.nodes.wwVendorCodesDownload.disabled, true);
    const before = f.prints(); f.nodes.wwVendorCodesPrint.trigger('click'); f.nodes.wwVendorCodesDownload.trigger('click'); await flush();
    assert.equal(f.prints(), before); assert.equal(f.pdfs.length, 0); assert.deepEqual(cardsOf(f), originalCards);
    f.nodes.wwVendorCodesRefresh.trigger('click'); await flush();
    assert.equal(f.nodes.wwVendorCodesPrint.disabled, true, 'Refreshing cannot accidentally enable invalid print geometry');
    assert.equal(f.nodes.wwVendorCodesDownload.disabled, true);
    f.nodes.wwVendorCodesCardWidth.value = '3'; f.nodes.wwVendorCodesCardHeight.value = '4';
    f.nodes.wwVendorCodesCardHeight.trigger('input'); await flush();
    assert.equal(f.nodes.wwVendorCodes.dataset.layoutValid, 'true'); assert.equal(f.nodes.wwVendorCodesLayoutError.hidden, true);
    assert.equal(f.nodes.wwVendorCodesCardWidth.getAttribute('aria-invalid'), undefined);
    assert.equal(f.nodes.wwVendorCodesPrint.disabled, false); assert.equal(f.nodes.wwVendorCodesDownload.disabled, false);
    assertRootGeometry(f, resolveLayout({ layout: 'letter-custom', orientation: 'standard', width: 3, height: 4 }));
  }
});

test('Download PDF exports the selected geometry and full verified roster, including search-hidden vendors', async () => {
  const f = fixture(); await flush();
  f.nodes.wwVendorCodesSearch.value = 'music'; f.nodes.wwVendorCodesSearch.trigger('input');
  f.nodes.wwVendorCodesPrintLayout.value = 'tabloid-custom'; f.nodes.wwVendorCodesCardOrientation.value = 'horizontal';
  f.nodes.wwVendorCodesCardWidth.value = '3.21'; f.nodes.wwVendorCodesCardHeight.value = '4.56'; f.nodes.wwVendorCodesPrintLayout.trigger('change');
  f.nodes.wwVendorCodesDownload.trigger('click'); await flush();
  assert.equal(f.pdfs.length, 1); assert.equal(f.prints(), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(f.pdfs[0].vendors)), feed().vendors);
  assert.deepEqual(JSON.parse(JSON.stringify(f.pdfs[0].layout)), JSON.parse(JSON.stringify(resolveLayout({ layout: 'tabloid-custom', orientation: 'horizontal', width: 3.21, height: 4.56 }))));
  assert.equal(f.requests.length, 1); assert.equal(f.nodes.wwVendorCodesDownload.disabled, false);
  assert.match(f.nodes.wwVendorCodesStatus.textContent, /PDF.*ready.*100%/);
});

test('rapid PDF clicks cannot duplicate exports or overlap a feed refresh, and failure allows retry', async () => {
  let resolveDownload, calls = 0;
  const f = fixture({ download: () => { calls++; return new Promise(resolve => { resolveDownload = resolve; }); } }); await flush();
  f.nodes.wwVendorCodesDownload.trigger('click'); f.nodes.wwVendorCodesDownload.trigger('click');
  f.nodes.wwVendorCodesPrint.trigger('click'); f.nodes.wwVendorCodesRefresh.trigger('click'); f.intervals[0].fn();
  assert.equal(calls, 1); assert.equal(f.pdfs.length, 1); assert.equal(f.requests.length, 1); assert.equal(f.prints(), 0);
  assert.equal(f.nodes.wwVendorCodesDownload.disabled, true); assert.equal(f.nodes.wwVendorCodesPrint.disabled, true); assert.equal(f.nodes.wwVendorCodesRefresh.disabled, true);
  assert.match(f.nodes.wwVendorCodesDownload.textContent, /Preparing/);
  resolveDownload(); await flush();
  assert.equal(f.nodes.wwVendorCodesDownload.disabled, false); assert.equal(f.nodes.wwVendorCodesRefresh.disabled, false);
  let fail = true;
  const retry = fixture({ download: () => { if (fail) throw new Error('Offline PDF failure'); } }); await flush();
  retry.nodes.wwVendorCodesDownload.trigger('click'); await flush();
  assert.match(retry.nodes.wwVendorCodesStatus.textContent, /PDF could not be created/); assert.equal(retry.nodes.wwVendorCodesDownload.disabled, false);
  fail = false; retry.nodes.wwVendorCodesDownload.trigger('click'); await flush();
  assert.equal(retry.pdfs.length, 2); assert.match(retry.nodes.wwVendorCodesStatus.textContent, /PDF.*ready/);
});

test('all standard and horizontal card arrangements fit the selected paper at actual size with quarter-inch margins', () => {
  const compact = css.replace(/\s+/g, '');
  assert.match(html, /<label[^>]*for="wwVendorCodesPrintLayout"[^>]*>/);
  assert.match(html, /<select[^>]*id="wwVendorCodesPrintLayout"[^>]*>/);
  const select = html.match(/<select[^>]*id="wwVendorCodesPrintLayout"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  const options = [...select.matchAll(/<option[^>]*value="([^"]+)"[^>]*>/g)].map(match => match[1]);
  const letterOptions = ['letter-eight', 'letter-six', 'letter-four', 'letter-two', 'letter-custom'];
  const tabloidOptions = ['tabloid-sixteen', 'tabloid-twelve', 'tabloid-nine', 'tabloid-four', 'tabloid-custom'];
  assert.deepEqual(options, [...letterOptions, ...tabloidOptions]);
  const groups = [...select.matchAll(/<optgroup[^>]*label="([^"]+)"[^>]*>([\s\S]*?)<\/optgroup>/g)];
  assert.equal(groups.length, 2, 'Paper sizes have distinct, labeled option groups.');
  assert.match(groups[0][1], /Letter/i); assert.match(groups[1][1], /11\s*[×x]\s*17/i);
  const groupOptions = group => [...group[2].matchAll(/<option[^>]*value="([^"]+)"[^>]*>/g)].map(match => match[1]);
  assert.deepEqual(groupOptions(groups[0]), letterOptions); assert.deepEqual(groupOptions(groups[1]), tabloidOptions);
  assert.match(html, /data-print-layout="letter-eight"/);
  assert.match(html, /data-card-orientation="standard"/); assert.match(html, /data-print-page="letter-portrait"/);
  assert.match(html, /<label[^>]*for="wwVendorCodesCardOrientation"[^>]*>/);
  const orientationSelect = html.match(/<select[^>]*id="wwVendorCodesCardOrientation"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  assert.deepEqual([...orientationSelect.matchAll(/<option[^>]*value="([^"]+)"[^>]*>/g)].map(match => match[1]), ['standard', 'horizontal']);
  assert.match(html, /100%/); assert.match(html, /Letter/);
  const page = name => {
    const block = compact.match(new RegExp('@page' + name + '[{]([^}]+)[}]'))?.[1]; assert(block, name + ' print page is defined'); return block;
  };
  assert.match(page('ww-vendor-portrait'), /size:(?:letter(?:portrait)?|8[.]5in11in)(?:;|$)/);
  assert.match(page('ww-vendor-landscape'), /size:(?:letterlandscape|11in8[.]5in)(?:;|$)/);
  assert.match(page('ww-vendor-tabloid-portrait'), /size:11in17in(?:;|$)/);
  assert.match(page('ww-vendor-tabloid-landscape'), /size:17in11in(?:;|$)/);
  for (const name of ['ww-vendor-portrait', 'ww-vendor-landscape', 'ww-vendor-tabloid-portrait', 'ww-vendor-tabloid-landscape']) {
    assert.match(page(name), /margin:(?:0)?[.]25in(?:;|$)/);
  }
  // Naming only the inner sheets creates extra unnamed Letter pages around
  // the CMS ancestors. The print document itself must use the same page.
  const printCss = compact.slice(compact.indexOf('@mediaprint{'));
  const rules = [...printCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const declarations = (...wantedSelectors) => Object.fromEntries(rules.filter(([, selectors]) => selectors.split(',').some(selector => wantedSelectors.some(wanted => wanted.replace(/\s+/g, '') === selector)))
    .flatMap(([, , body]) => body.split(';').filter(Boolean).map(declaration => {
      const separator = declaration.indexOf(':'); return [declaration.slice(0, separator), declaration.slice(separator + 1)];
    })));
  assert.equal(declarations('html:has(#wwVendorCodes)').page, 'ww-vendor-portrait');
  const sheet = declarations('.ww-vendor-codes-sheet');
  assert.equal(sheet.page, 'ww-vendor-portrait');
  assert.equal(sheet['grid-template-columns'], 'repeat(var(--columns),var(--card-width))');
  assert.equal(sheet['grid-template-rows'], 'repeat(var(--rows),var(--card-height))');
  assert.equal(sheet.width, 'var(--sheet-width)'); assert.equal(sheet.height, 'var(--sheet-height)');
  assert.equal(sheet.gap, '0');
  assert.equal(sheet['break-after'], 'page'); assert.equal(sheet['break-inside'], 'avoid');
  assert.equal(declarations('.ww-vendor-codes-sheet:last-child')['break-after'], 'auto');
  const card = declarations('.ww-vendor-codes .ww-vendor-codes-card');
  assert.equal(card.width, 'var(--card-width)'); assert.equal(card.height, 'var(--card-height)');
  assert.equal(card['box-sizing'], 'border-box'); assert.equal(card['break-inside'], 'avoid');
  assert.equal(card['grid-template-columns'], 'minmax(0,1fr)');
  assert.equal(card['grid-template-rows'], 'var(--qr-size)minmax(0,1fr)');
  for (const selector of ['.ww-vendor-codes[data-card-orientation="horizontal"] .ww-vendor-codes-card', '.ww-vendor-codes[data-card-orientation="horizontal"] .ww-vendor-codes-card[hidden]']) {
    const horizontalCard = declarations(selector);
    assert.equal(horizontalCard['grid-template-columns'], 'var(--qr-size)minmax(0,1fr)');
    assert.equal(horizontalCard['grid-template-rows'], 'minmax(0,1fr)');
  }
  const qr = declarations('.ww-vendor-codes-card .ww-vendor-codes-qr');
  assert.equal(qr.width, 'var(--qr-size)'); assert.equal(qr.height, 'var(--qr-size)');
  assert.doesNotMatch(compact, /(?:transform:scale|zoom:)/);
  const equivalents = { 'tabloid-sixteen': 'letter-eight', 'tabloid-twelve': 'letter-six', 'tabloid-nine': 'letter-four', 'tabloid-four': 'letter-two' };
  const earlierQrSizes = { 'letter-eight': 1.25, 'letter-six': 2.15, 'letter-four': 2.6, 'letter-two': 3, 'tabloid-sixteen': 1.25, 'tabloid-twelve': 2.15, 'tabloid-nine': 2.6, 'tabloid-four': 3 };
  for (const [id, orientation, size, paper, [columns, rows], pageKey] of printGeometries) {
    const description = id + '/' + orientation, values = resolveLayout({ layout: id, orientation });
    const { width, height, sheetWidth, sheetHeight, qrSize, padding, gap } = values;
    assert.deepEqual([width, height], size, description + ' exact card size');
    assert.equal(values.columns, columns); assert.equal(values.rows, rows); assert.equal(values.perSheet, columns * rows);
    assert.deepEqual([values.pageWidth, values.pageHeight], paper); assert.equal(values.pageKey, pageKey);
    assert(Math.abs(sheetWidth - width * columns) < 0.00001, description + ' sheet fits its columns');
    assert(Math.abs(sheetHeight - height * rows) < 0.00001, description + ' sheet fits its rows');
    assert(sheetWidth <= paper[0] - 0.5, description + ' fits printable paper width');
    assert(sheetHeight <= paper[1] - 0.5, description + ' fits printable paper height');
    assert(qrSize >= 1.25, description + ' preserves the minimum tested QR size');
    const oldQr = orientation === 'horizontal' && width === 3.74 ? 1.5 : earlierQrSizes[id];
    assert(qrSize >= oldQr * 1.15, description + ' makes the QR materially larger than before');
    assert(values.nameSize <= 10, description + ' keeps the business name visually secondary');
    assert(values.nameLongestSize <= values.nameLongSize && values.nameLongSize <= values.nameSize);
    assert(qrSize + padding * 2 < width, description + ' QR fits horizontally');
    if (orientation === 'horizontal') {
      assert(qrSize + padding * 2 < height, description + ' QR fits the shorter card height');
      assert(width - padding * 2 - qrSize - gap > 0, description + ' reserves a name column');
    } else {
      assert(qrSize + padding * 2 + gap < height, description + ' reserves space below QR for the business name');
    }
    const namedPage = pageKey.startsWith('letter-') ? 'ww-vendor-' + pageKey.slice('letter-'.length) : 'ww-vendor-' + pageKey;
    assert.equal(declarations('html:has(#wwVendorCodes[data-print-page="' + pageKey + '"])').page, namedPage);
    assert.equal(declarations('.ww-vendor-codes[data-print-page="' + pageKey + '"] .ww-vendor-codes-sheet').page, namedPage);
    if (equivalents[id]) {
      const equivalent = resolveLayout({ layout: equivalents[id], orientation });
      for (const property of ['width', 'height', 'padding', 'gap', 'qrSize', 'nameSize', 'nameLongSize', 'nameLongestSize']) {
        assert.equal(values[property], equivalent[property], description + ' retains the same QR and typography across paper sizes: ' + property);
      }
    }
  }
});

test('unchanged refreshed feeds retain card DOM and search without moving focus or scrolling', async () => {
  const f = fixture({ respond: number => { const value = feed(); value.generated_at = number === 1 ? '2026-09-08T17:00:00Z' : '2026-09-08T17:01:00Z'; return response(value); } }); await flush();
  const originalCard = cardsOf(f)[0]; const replacements = f.nodes.wwVendorCodesGrid.replacements;
  f.nodes.wwVendorCodesSearch.value = 'Rose'; f.nodes.wwVendorCodesSearch.trigger('input'); f.advance(60000);
  f.nodes.wwVendorCodesRefresh.trigger('click'); await flush();
  assert.equal(cardsOf(f)[0], originalCard); assert.equal(f.nodes.wwVendorCodesGrid.replacements, replacements);
  assert.equal(f.nodes.wwVendorCodesSearch.value, 'Rose'); assert.equal(cardsOf(f)[1].hidden, true);
  assert.doesNotMatch(source, /scrollTo|scrollIntoView|location[.]|[.]focus\(/);
  assert.match(f.nodes.wwVendorCodesChecked.attributes.title, /17:01:00Z/);
});

test('rapid Refresh, initialization and interval callbacks cannot overlap requests', async () => {
  const f = fixture({ held: true });
  f.initializeAgain(); f.nodes.wwVendorCodesRefresh.trigger('click'); f.intervals[0].fn(); f.nodes.wwVendorCodesPrint.trigger('click'); f.nodes.wwVendorCodesDownload.trigger('click');
  assert.equal(f.requests.length, 1); assert.equal(f.intervals.length, 1); assert.equal(f.nodes.wwVendorCodesRefresh.disabled, true); assert.equal(f.prints(), 0);
  assert.equal(f.nodes.wwVendorCodesDownload.disabled, true); assert.equal(f.pdfs.length, 0);
  f.release(); await flush(); assert.equal(f.nodes.wwVendorCodesRefresh.disabled, false);
  f.nodes.wwVendorCodesRefresh.trigger('click'); await flush(); assert.equal(f.requests.length, 2);
});

test('automatic refresh adds and removes vendors and follows newly published show details', async () => {
  let current = feed();
  const f = fixture({ respond: () => response(current) }); await flush();
  f.nodes.wwVendorCodesSearch.value = 'new'; f.nodes.wwVendorCodesSearch.trigger('input');
  current.vendors.push({ id: '98765', name: 'New Show Vendor', qr_url: canonical('98765') });
  current.total = 3;
  f.advance(60000); f.intervals[0].fn(); await flush();
  assert.equal(cardsOf(f).length, 3);
  assert.equal(f.nodes.wwVendorCodesCount.textContent, '1 of 3 vendors shown');
  assert.equal(cardName(cardsOf(f)[2]).textContent, 'New Show Vendor');
  current.vendors = current.vendors.slice(2); current.total = 1;
  current.event = { ...current.event, key: 'next-wedding-show', name: 'Next Wedding Show', venue: 'New Venue', starts_at: '2027-01-10T16:00:00Z', revision: 13 };
  f.advance(60000); f.intervals[0].fn(); await flush();
  assert.equal(cardsOf(f).length, 1);
  assert.equal(f.nodes.wwVendorCodesEventName.textContent, 'Next Wedding Show');
  assert.match(f.nodes.wwVendorCodesEventDetails.textContent, /January 10, 2027.*New Venue/);
  assert.equal(f.nodes.wwVendorCodesSearch.value, 'new');
  assert.equal(f.nodes.wwVendorCodesCount.textContent, '1 of 1 vendor shown');
});

test('automatic refresh is once per minute only while visible; return after a minute refreshes', async () => {
  const f = fixture(); await flush(); assert.equal(f.intervals[0].delay, 60000);
  f.visibility(true); f.advance(60000); f.intervals[0].fn(); await flush(); assert.equal(f.requests.length, 1);
  f.visibility(false); await flush(); assert.equal(f.requests.length, 2);
  f.visibility(true); f.visibility(false); await flush(); assert.equal(f.requests.length, 2);
  f.advance(60000); f.intervals[0].fn(); await flush(); assert.equal(f.requests.length, 3);
});

test('refresh failure retains verified QR cards, last-check time and search with clear outdated state', async () => {
  let fail = false;
  const f = fixture({ respond: () => fail ? response(null, { status: 503 }) : response() }); await flush();
  const original = cardsOf(f)[0], checked = f.nodes.wwVendorCodesChecked.textContent;
  f.nodes.wwVendorCodesSearch.value = 'music'; f.nodes.wwVendorCodesSearch.trigger('input'); fail = true;
  f.nodes.wwVendorCodesRefresh.trigger('click'); await flush();
  assert.equal(cardsOf(f)[0], original); assert.equal(f.nodes.wwVendorCodesChecked.textContent, checked);
  assert.equal(f.nodes.wwVendorCodesSearch.value, 'music'); assert.match(f.nodes.wwVendorCodesStatus.textContent, /may be outdated/);
  assert.match(f.nodes.wwVendorCodesPrintSummary.textContent, /Possibly outdated/); assert.equal(f.nodes.wwVendorCodesPrint.disabled, false);
  fail = false; f.nodes.wwVendorCodesRefresh.trigger('click'); await flush();
  assert.equal(f.nodes.wwVendorCodesStatus.dataset.state, 'ready'); assert.doesNotMatch(f.nodes.wwVendorCodesPrintSummary.textContent, /outdated/);
});

test('strict feed validation rejects changed IDs, duplicate IDs, altered QR URLs and private extra fields before rendering', async () => {
  const mutations = [
    value => { value.total = 1; }, value => { value.vendors[1].id = value.vendors[0].id; value.vendors[1].qr_url = value.vendors[0].qr_url; },
    value => { value.vendors[0].id = '1234567890123456789'; value.vendors[0].qr_url = canonical(value.vendors[0].id); },
    value => { value.vendors[0].id = 39061; }, value => { value.vendors[0].id = '039061'; value.vendors[0].qr_url = canonical('039061'); },
    value => { value.vendors[0].qr_url += '&scan=1'; }, value => { value.vendors[0].qr_url = 'https://other.example/qr?vendor_id=39061'; },
    value => { value.vendors[0].qr_url = 'https://weddingwin.ca/qr?vendor_id=39061'; }, value => { value.vendors[0].email = 'private@example.invalid'; },
    value => { value.vendors[0].logo_url = 'https://other.example/tracking.png'; },
    value => { value.event.key = '../event'; }, value => { value.event.revision = 0; }, value => { value.event.venue = null; },
    value => { value.event.starts_at = '2026-02-31T12:00:00Z'; }, value => { value.event.starts_at = '2026-10-18T24:00:00Z'; }, value => { value.generated_at = 'yesterday'; },
    value => { value.vendors[0].name = 'a'.repeat(201); }, value => { value.vendors[0].name = 'A\nVendor'; },
    value => { value.vendors = Array.from({ length: 5001 }, (_, index) => ({ id: String(index + 1), name: 'Vendor', qr_url: canonical(index + 1) })); value.total = 5001; },
  ];
  for (const mutate of mutations) {
    const value = feed(); mutate(value); const f = fixture({ respond: () => response(value) }); await flush();
    assert.equal(cardsOf(f).length, 0); assert.equal(f.nodes.wwVendorCodesPrint.disabled, true); assert.equal(f.nodes.wwVendorCodesDownload.disabled, true); assert.equal(f.nodes.wwVendorCodesStatus.dataset.state, 'error');
  }
});

test('bad response formats, oversize bodies, timeouts and missing encoder fail closed without an empty-success claim', async () => {
  for (const reply of [response({}, { type: 'text/html' }), response(null, { body: '<html>Not JSON</html>' }), response(feed(), { length: '8388609' }), response(null, { body: ' '.repeat(8388609) })]) {
    const f = fixture({ respond: () => reply }); await flush(); assert.equal(cardsOf(f).length, 0); assert.match(f.nodes.wwVendorCodesCount.textContent, /unavailable/);
  }
  const unavailable = fixture({ useEncoder: false }); await flush(); assert.equal(unavailable.nodes.wwVendorCodesPrint.disabled, true);
  const blocked = fixture({ feedUrl: 'https://other.example/qr' }); await flush(); assert.equal(blocked.requests.length, 0);
  const slow = fixture({ held: true }); [...slow.timers.values()].filter(timer => timer.delay === 20000).forEach(timer => timer.fn()); await flush();
  assert.equal(slow.nodes.wwVendorCodesStatus.dataset.state, 'error'); assert.equal(slow.nodes.wwVendorCodesRefresh.disabled, false);
});

test('valid empty roster is distinct from load failure and HTML-like vendor names remain literal text', async () => {
  const none = feed(); none.vendors = []; none.total = 0;
  const f = fixture({ respond: () => response(none) }); await flush();
  assert.equal(f.nodes.wwVendorCodesCount.textContent, '0 vendors'); assert.match(f.nodes.wwVendorCodesEmpty.textContent, /No participating vendors/); assert.equal(f.nodes.wwVendorCodesPrint.disabled, true); assert.equal(f.nodes.wwVendorCodesDownload.disabled, true);
  const value = feed(); value.vendors[0].name = '<img src=x onerror=alert(1)> ❤';
  const literal = fixture({ respond: () => response(value) }); await flush();
  assert.equal(cardName(cardsOf(literal)[0]).textContent, value.vendors[0].name);
  assert.equal(literal.created.filter(node => node.tag === 'img').length, 0, 'An HTML-like vendor name never creates an image element.');
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|eval\(|createObjectURL/);
});

test('standalone shell has labeled controls and no external QR requests or auto-opening scan links', () => {
  assert.match(html, /id="wwVendorCodes" data-feed-url="\/vendor-bingo-qr-codes\?format=json"/);
  assert.match(html, /<label for="wwVendorCodesSearch">Find a vendor<\/label>/);
  assert.match(html, /Print all QR codes/); assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /id="wwVendorCodesDownload"[^>]*disabled>Download PDF<\/button>/);
  assert.match(html, /id="wwVendorCodesCustomSize" hidden/);
  assert.match(html, /id="wwVendorCodesLayoutError" role="alert" hidden/);
  for (const id of ['wwVendorCodesCardWidth', 'wwVendorCodesCardHeight']) {
    assert.match(html, new RegExp('<label[^>]*for="' + id + '"[^>]*>'));
    const input = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'))?.[0] || '';
    for (const attribute of ['type="number"', 'inputmode="decimal"', 'min="1.5"', 'max="16.5"', 'step="0.01"', 'aria-describedby="wwVendorCodesLayoutError"']) assert(input.includes(attribute), id + ' must include ' + attribute);
  }
  assert.doesNotMatch(html, /<a |<iframe|<img|<script/);
  assert.equal((source.match(/fetch\(/g) || []).length, 1);
  assert.match(source, /qrcode\(0, 'M'\)/); assert.match(source, /addData\(vendor.qr_url, 'Byte'\)/);
});
