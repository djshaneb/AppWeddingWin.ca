/* Printable WeddingWin cards. Requires the pinned jsPDF and qrcode globals. */
var WWVendorQrPdf = (function () {
  'use strict';
  const POINTS = 72, DPI = 300, MARGIN = 18, BORDER = .5;
  const FONT = 'Arial, Helvetica, sans-serif';
  const QR_PREFIX = 'https://www.weddingwin.ca/qr?vendor_id=';
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));

  function checkedInput(options) {
    if (!options || !options.layout) throw new Error('Choose a valid print layout first.');
    const layout = Object.assign({}, options.layout);
    const dimensions = ['width', 'height', 'pageWidth', 'pageHeight', 'qrSize'];
    if (!dimensions.every(key => Number.isFinite(layout[key]) && layout[key] > 0)
      || !['padding', 'gap'].every(key => Number.isFinite(layout[key]) && layout[key] >= 0)
      || !['nameSize', 'nameLongSize', 'nameLongestSize'].every(key => Number.isFinite(layout[key]) && layout[key] >= 5 && layout[key] <= 72)
      || !['columns', 'rows'].every(key => Number.isInteger(layout[key]) && layout[key] >= 1)
      || typeof layout.horizontal !== 'boolean'
      || !['letter', 'tabloid'].includes(layout.paper)
      || !['portrait', 'landscape'].includes(layout.pageOrientation)) throw new Error('The print layout is invalid.');
    const paper = layout.paper === 'letter' ? [8.5, 11] : [11, 17];
    if (layout.pageOrientation === 'landscape') paper.reverse();
    if (Math.abs(layout.pageWidth - paper[0]) > 1e-8 || Math.abs(layout.pageHeight - paper[1]) > 1e-8
      || layout.width * layout.columns > layout.pageWidth - .5 + 1e-8
      || layout.height * layout.rows > layout.pageHeight - .5 + 1e-8
      || layout.qrSize < 1) throw new Error('The cards do not fit the selected paper.');
    const innerWidth = layout.width - 2 * layout.padding - 1 / POINTS;
    const innerHeight = layout.height - 2 * layout.padding - 1 / POINTS;
    if (layout.qrSize > Math.min(innerWidth, innerHeight) + 1e-8
      || (layout.horizontal ? innerWidth : innerHeight) - layout.qrSize - layout.gap <= 0) {
      throw new Error('The card needs more room for its QR code and business name.');
    }
    if (!Array.isArray(options.vendors) || !options.vendors.length || options.vendors.length > 5000) {
      throw new Error('There are no verified vendor cards to download.');
    }
    const ids = new Set();
    const vendors = options.vendors.map(vendor => {
      if (!vendor || typeof vendor.id !== 'string' || !/^[1-9][0-9]{0,17}$/.test(vendor.id) || ids.has(vendor.id)
        || vendor.qr_url !== QR_PREFIX + vendor.id || typeof vendor.name !== 'string'
        || !vendor.name.trim() || Array.from(vendor.name).length > 200 || /[\u0000-\u001f\u007f]/.test(vendor.name)) {
        throw new Error('The vendor list could not be verified for PDF download.');
      }
      ids.add(vendor.id);
      return { id: vendor.id, name: vendor.name, qr_url: vendor.qr_url };
    });
    return { layout: layout, vendors: vendors };
  }

  function graphemes(text) {
    return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
      : Array.from(text);
  }

  function inkWidth(context, text) {
    const metrics = context.measureText(text);
    return Math.max(metrics.width, (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || metrics.width));
  }

  function wrapName(context, name, maxWidth) {
    const lines = [];
    let line = '';
    // HTML collapses whitespace too. Preserve every non-whitespace character;
    // split overlong words only at complete grapheme boundaries, never truncate.
    name.trim().split(/\s+/u).forEach(word => {
      const joined = line ? line + ' ' + word : word;
      if (inkWidth(context, joined) <= maxWidth) { line = joined; return; }
      if (line) { lines.push(line); line = ''; }
      graphemes(word).forEach(character => {
        if (line && inkWidth(context, line + character) > maxWidth) { lines.push(line); line = ''; }
        line += character;
      });
    });
    if (line) lines.push(line);
    return lines;
  }

  function nameImage(name, width, height, requestedSize) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot render printable business names.');
    const pixelsPerPoint = DPI / POINTS;
    const canvasWidth = Math.floor(width * pixelsPerPoint);
    // A two-pixel guard on each edge protects accents/antialiasing from clipping.
    const maxWidth = canvasWidth - 4, maxHeight = Math.floor(height * pixelsPerPoint) - 4;
    let size = requestedSize, lines, metrics, lineHeight, ascent, descent, contentHeight;
    while (true) {
      const fontPixels = size * pixelsPerPoint;
      context.font = '700 ' + fontPixels + 'px ' + FONT;
      context.textAlign = 'left';
      lines = wrapName(context, name, maxWidth);
      metrics = lines.map(line => context.measureText(line));
      lineHeight = fontPixels * 1.1;
      ascent = Math.max(fontPixels * .8, ...metrics.map(metric => metric.actualBoundingBoxAscent || 0));
      descent = Math.max(fontPixels * .2, ...metrics.map(metric => metric.actualBoundingBoxDescent || 0));
      contentHeight = Math.max(lines.length * lineHeight, (lines.length - 1) * lineHeight + ascent + descent);
      if (contentHeight <= maxHeight && lines.every(line => inkWidth(context, line) <= maxWidth)) break;
      if (size <= 5) throw new Error('A business name does not fit this card at 5 pt. Increase the custom card size or change its orientation.');
      size = Math.max(5, size - .25);
    }
    canvas.width = canvasWidth;
    canvas.height = Math.ceil(contentHeight + 4);
    context.font = '700 ' + size * pixelsPerPoint + 'px ' + FONT;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    const inkHeight = (lines.length - 1) * lineHeight + ascent + descent;
    const firstBaseline = (canvas.height - inkHeight) / 2 + ascent;
    lines.forEach((line, index) => context.fillText(line, canvas.width / 2, firstBaseline + index * lineHeight));
    const image = canvas.toDataURL('image/png');
    // Using the pixel dimensions gives at least 300 dpi without stretching text.
    const result = { image: image, width: canvas.width / pixelsPerPoint, height: canvas.height / pixelsPerPoint, fontSize: size };
    canvas.width = 0; canvas.height = 0;
    return result;
  }

  function drawQr(pdf, url, x, y, size) {
    const code = qrcode(0, 'M');
    code.addData(url, 'Byte'); code.make();
    const count = code.getModuleCount();
    if (!Number.isInteger(count) || count < 21 || count > 177 || (count - 21) % 4 !== 0) throw new Error('A vendor QR code could not be generated.');
    const moduleSize = size / (count + 8);
    pdf.setFillColor(255); pdf.rect(x, y, size, size, 'F');
    pdf.setFillColor(0);
    // Merge consecutive dark modules in each row: still true vector artwork,
    // with a full four-module white quiet zone and no raster scaling artifacts.
    for (let row = 0; row < count; row++) {
      let start = -1;
      for (let column = 0; column <= count; column++) {
        const dark = column < count && code.isDark(row, column);
        if (dark && start < 0) start = column;
        if (!dark && start >= 0) {
          pdf.rect(x + (start + 4) * moduleSize, y + (row + 4) * moduleSize, (column - start) * moduleSize, moduleSize, 'F');
          start = -1;
        }
      }
    }
  }

  function drawCard(pdf, layout, vendor, x, y) {
    const width = layout.width * POINTS, height = layout.height * POINTS;
    const inset = layout.padding * POINTS + BORDER;
    const innerWidth = width - 2 * inset, innerHeight = height - 2 * inset;
    const qr = layout.qrSize * POINTS, gap = layout.gap * POINTS;
    const qrX = layout.horizontal ? x + inset : x + (width - qr) / 2;
    const qrY = layout.horizontal ? y + (height - qr) / 2 : y + inset;
    const nameBox = layout.horizontal
      ? { x: x + inset + qr + gap, y: y + inset, width: innerWidth - qr - gap, height: innerHeight }
      : { x: x + inset, y: y + inset + qr + gap, width: innerWidth, height: innerHeight - qr - gap };
    const fontSize = vendor.name.length > 140 ? layout.nameLongestSize : vendor.name.length > 70 ? layout.nameLongSize : layout.nameSize;
    const label = nameImage(vendor.name, nameBox.width, nameBox.height, fontSize);
    // PDF strokes straddle their path; inset by half the stroke so the outer
    // painted rectangle has the exact requested physical card dimensions.
    pdf.setDrawColor(187); pdf.setLineWidth(BORDER);
    pdf.rect(x + BORDER / 2, y + BORDER / 2, width - BORDER, height - BORDER, 'S');
    drawQr(pdf, vendor.qr_url, qrX, qrY, qr);
    pdf.addImage(label.image, 'PNG', nameBox.x + (nameBox.width - label.width) / 2,
      nameBox.y + (nameBox.height - label.height) / 2, label.width, label.height, 'vendor-name-' + vendor.id, 'FAST');
  }

  function filenameFor(layout, count) {
    const size = value => String(Math.round(value * 1000) / 1000).replace('.', 'p');
    return 'weddingwin-qr-cards-' + layout.paper + '-' + size(layout.width) + 'x' + size(layout.height)
      + 'in-' + (layout.horizontal ? 'horizontal' : 'standard') + '-' + layout.columns * layout.rows
      + '-per-sheet-' + count + '-vendors.pdf';
  }

  async function build(options) {
    const input = checkedInput(options), layout = input.layout, vendors = input.vendors;
    if (typeof jspdf === 'undefined' || typeof jspdf.jsPDF !== 'function' || typeof qrcode !== 'function') {
      throw new Error('The PDF generator is unavailable. Reload this page and try again.');
    }
    await pause();
    const format = [layout.pageWidth * POINTS, layout.pageHeight * POINTS];
    const pdf = new jspdf.jsPDF({ unit: 'pt', format: format, orientation: layout.pageOrientation,
      precision: 8, floatPrecision: 16, compress: true, putOnlyUsedFonts: true });
    pdf.setProperties({ title: 'WeddingWin Vendor QR Cards', subject: 'Print at actual size (100%) on ' + (layout.paper === 'letter' ? 'Letter' : '11 x 17') + ' paper', creator: 'WeddingWin' });
    pdf.viewerPreferences({ PrintScaling: 'None' });
    const perSheet = layout.columns * layout.rows;
    const sheetX = (layout.pageWidth - layout.width * layout.columns) * POINTS / 2;
    for (let index = 0; index < vendors.length; index++) {
      if (index && index % 20 === 0) await pause();
      if (index && index % perSheet === 0) pdf.addPage(format, layout.pageOrientation);
      const slot = index % perSheet;
      drawCard(pdf, layout, vendors[index], sheetX + (slot % layout.columns) * layout.width * POINTS,
        MARGIN + Math.floor(slot / layout.columns) * layout.height * POINTS);
    }
    await pause();
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    return { bytes: bytes, blob: new Blob([bytes], { type: 'application/pdf' }), filename: filenameFor(layout, vendors.length),
      pageCount: Math.ceil(vendors.length / perSheet), vendorCount: vendors.length };
  }

  async function download(options) {
    const result = await build(options);
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url; link.download = result.filename; link.rel = 'noopener';
    link.style.display = 'none';
    try { document.body.appendChild(link); link.click(); }
    finally {
      link.remove();
      // Give Safari and slow devices time to consume the Blob before cleanup.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return result;
  }

  return { build: build, download: download };
}());
