import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, 'brilliant-directories', name), 'utf8');
const php = read('widgets/ww-vendor-bingo-qr-codes.php');
const shell = read('widgets/ww-vendor-bingo-qr-codes.html');
const css = read('widgets/ww-vendor-bingo-qr-codes.css');
const library = read('assets/qrcode-generator-1.4.4.js');
const pdfLibrary = read('assets/jspdf-4.2.1.umd.min.js');
const layout = read('assets/ww-vendor-qr-layout.js');
const pdf = read('assets/ww-vendor-qr-pdf.js');
const ui = read('widgets/ww-vendor-bingo-qr-codes.js');
const metadata = JSON.parse(read('pages/vendor-bingo-qr-codes-metadata.json'));
// BD strips literal CDATA terminators even inside JavaScript comparisons.
const js = [library, pdfLibrary, layout, pdf, ui].join('\n;\n').replaceAll(']]>', '] ] >');

assert(!php.includes('\\'), 'BD widget_data strips backslashes');
assert(php.includes(shell.trim()), 'PHP must contain the current complete HTML shell');
assert(!/<script[ >]|<style[ >]/i.test(php), 'Scripts and CSS belong in their own widget fields');
assert(!/<\/script/i.test(js), 'Inline script must not close its wrapper');
assert.equal(metadata.show_form, 1, 'BD native noindex,nofollow must be on');
// No public navigation link is created. BD's native noindex flag excludes indexing.
assert.equal(metadata.content_footer, '', 'Page must be public');
new vm.Script(js, { filename: 'vendor-bingo-qr-codes-widget.js' });

const payload = {
  widget_name: 'WeddingWin Vendor Bingo QR Codes',
  widget_viewport: 'front',
  widget_data: php,
  widget_style: css,
  widget_javascript: '<script>\n' + js + '\n</script>',
};

if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ ok: true, phpBytes: Buffer.byteLength(php), cssBytes: Buffer.byteLength(css), scriptBytes: Buffer.byteLength(js), unlisted: true, public: true }));
} else {
  console.log(JSON.stringify(payload));
}
