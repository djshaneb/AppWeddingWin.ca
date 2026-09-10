/* Shared, inch-based geometry for browser printing and downloadable PDFs. */
var WWVendorQrLayout = (function () {
  'use strict';
  const presets = {
    'letter-eight': [3.74, 2.56, 2, 4, 'portrait', 2, 4, 'portrait'],
    'letter-six': [3, 4, 3, 2, 'landscape', 2, 3, 'portrait'],
    'letter-four': [3.5, 5, 2, 2, 'portrait', 2, 2, 'landscape'],
    'letter-two': [4, 6, 2, 1, 'landscape', 1, 2, 'portrait'],
    'tabloid-sixteen': [3.74, 2.56, 4, 4, 'landscape', 4, 4, 'landscape'],
    'tabloid-twelve': [3, 4, 3, 4, 'portrait', 4, 3, 'landscape'],
    'tabloid-nine': [3.5, 5, 3, 3, 'portrait', 3, 3, 'landscape'],
    'tabloid-four': [4, 6, 2, 2, 'portrait', 2, 2, 'landscape'],
  };
  function resolve(options) {
    const id = options.layout, custom = id === 'letter-custom' || id === 'tabloid-custom';
    if (!custom && !Object.prototype.hasOwnProperty.call(presets, id)) throw new Error('Choose a print layout.');
    const paper = id.startsWith('tabloid-') ? 'tabloid' : 'letter';
    const horizontal = options.orientation === 'horizontal';
    const preset = presets[id];
    let width = custom ? Number(options.width) : preset[0], height = custom ? Number(options.height) : preset[1];
    if (![width, height].every(n => Number.isFinite(n) && n >= 1.5 && n <= 16.5)) throw new Error('Enter a width and height between 1.5 and 16.5 inches.');
    if (custom && [width, height].some(n => Math.abs(n * 100 - Math.round(n * 100)) > 1e-7)) throw new Error('Use no more than two decimal places for each measurement.');
    if (horizontal && height > width) [width, height] = [height, width];
    const paperShort = paper === 'letter' ? 8.5 : 11, paperLong = paper === 'letter' ? 11 : 17;
    const candidates = ['portrait', 'landscape'].map(pageOrientation => {
      const pageWidth = pageOrientation === 'portrait' ? paperShort : paperLong;
      const pageHeight = pageOrientation === 'portrait' ? paperLong : paperShort;
      const columns = Math.floor((pageWidth - .5 + 1e-8) / width), rows = Math.floor((pageHeight - .5 + 1e-8) / height);
      return { pageOrientation, pageWidth, pageHeight, columns, rows, perSheet: columns * rows };
    });
    let page;
    if (custom) page = candidates.sort((a, b) => b.perSheet - a.perSheet)[0];
    else {
      const offset = horizontal ? 5 : 2;
      page = candidates.find(p => p.pageOrientation === preset[offset + 2]);
      page = Object.assign({}, page, { columns: preset[offset], rows: preset[offset + 1], perSheet: preset[offset] * preset[offset + 1] });
    }
    if (!page.perSheet) throw new Error('This card does not fit on that paper. Choose a smaller card or 11 × 17 paper.');
    const padding = .1, gap = .05, border = 1 / 72;
    const innerWidth = width - padding * 2 - border, innerHeight = height - padding * 2 - border;
    let qrSize, nameSize = 10, nameLongSize = 7, nameLongestSize = 5;
    if (horizontal) {
      // Keep a narrow, readable name column beside a near full-height QR code.
      if (width < 4) { nameSize = 8; nameLongSize = 6; }
      const nameColumn = Math.max(...[[70, nameSize], [140, nameLongSize], [200, nameLongestSize]].map(([length, font]) => {
        const lines = Math.max(1, Math.floor((innerHeight - .03) * 72 / (font * 1.1)));
        return Math.ceil(length / lines) * font * .96 / 72 + .015;
      }));
      qrSize = Math.min(innerHeight, innerWidth * .74 - gap, innerWidth - gap - nameColumn);
    } else {
      // Reserve enough room for even the maximum supported 200-character name.
      const longestLines = Math.ceil(200 / Math.max(1, Math.floor(innerWidth * 72 / (nameLongestSize * .96))));
      const shortLines = Math.ceil(70 / Math.max(1, Math.floor(innerWidth * 72 / (nameSize * .96))));
      const longLines = Math.ceil(140 / Math.max(1, Math.floor(innerWidth * 72 / (nameLongSize * .96))));
      const nameHeight = Math.max(longestLines * nameLongestSize, shortLines * nameSize, longLines * nameLongSize) * 1.1 / 72 + .03;
      qrSize = Math.min(innerWidth, innerHeight - gap - nameHeight);
      if (!custom && width === 3.74) { qrSize = 1.9; nameSize = 8; nameLongSize = 6; }
    }
    qrSize = Math.floor(qrSize * 1000) / 1000;
    if (qrSize < 1) throw new Error('This card is too small for a clear QR code and business name. Increase the size or change card orientation.');
    return Object.assign({ id, custom, width, height, horizontal, paper, padding, gap, qrSize, nameSize, nameLongSize, nameLongestSize,
      pageKey: paper + '-' + page.pageOrientation, sheetWidth: page.columns * width, sheetHeight: page.rows * height }, page);
  }
  return { resolve: resolve };
}());
