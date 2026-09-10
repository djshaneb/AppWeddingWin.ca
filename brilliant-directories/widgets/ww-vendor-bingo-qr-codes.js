/* WW_PUBLIC_VENDOR_QR_UI_START */
function initializeVendorBingoQrCodes() {
  const root = document.getElementById('wwVendorCodes');
  if (!root || root.dataset.initialized === '1') return;
  root.dataset.initialized = '1';
  const byId = id => document.getElementById(id);
  const grid = byId('wwVendorCodesGrid'), status = byId('wwVendorCodesStatus');
  const search = byId('wwVendorCodesSearch'), refreshButton = byId('wwVendorCodesRefresh');
  const printButton = byId('wwVendorCodesPrint'), empty = byId('wwVendorCodesEmpty');
  const printLayout = byId('wwVendorCodesPrintLayout');
  const cardOrientation = byId('wwVendorCodesCardOrientation');
  const customSize = byId('wwVendorCodesCustomSize'), cardWidth = byId('wwVendorCodesCardWidth'), cardHeight = byId('wwVendorCodesCardHeight');
  const downloadButton = byId('wwVendorCodesDownload'), layoutError = byId('wwVendorCodesLayoutError');
  let activeLayout = null, pdfBusy = false;
  const printLayouts = {
    'letter-eight': { perSheet: 8, note: 'Letter paper, portrait: eight 3.74 × 2.56 inch cards per sheet.' },
    'letter-six': { perSheet: 6, note: 'Letter paper, landscape: six 3 × 4 inch cards per sheet.' },
    'letter-four': { perSheet: 4, note: 'Letter paper, portrait: four 3.5 × 5 inch cards per sheet.' },
    'letter-two': { perSheet: 2, note: 'Letter paper, landscape: two full-size 4 × 6 inch cards per sheet.' },
    'tabloid-sixteen': { perSheet: 16, note: '11 × 17 inch paper, landscape: sixteen 3.74 × 2.56 inch cards per sheet.' },
    'tabloid-twelve': { perSheet: 12, note: '11 × 17 inch paper, portrait: twelve 3 × 4 inch cards per sheet.' },
    'tabloid-nine': { perSheet: 9, note: '11 × 17 inch paper, portrait: nine 3.5 × 5 inch cards per sheet.' },
    'tabloid-four': { perSheet: 4, note: '11 × 17 inch paper, portrait: four full-size 4 × 6 inch cards per sheet.' },
  };
  root.dataset.printLayout = 'letter-eight';

  const expectedFeed = '/vendor-bingo-qr-codes?format=json';
  const qrPrefix = 'https://www.weddingwin.ca/qr?vendor_id=';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Toronto' });
  const checkedFormatter = new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  let busy = false, loaded = false, stale = false, fingerprint = '', cards = [], lastChecked = '', lastAttempt = 0;

  function exactObject(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  }
  function plainText(value, max) {
    return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max && !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,9})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const calendarDay = new Date(value.slice(0, 10) + 'T00:00:00Z');
    return Number.isFinite(calendarDay.getTime()) && calendarDay.toISOString().slice(0, 10) === value.slice(0, 10);
  }
  function validateFeed(value) {
    const invalid = () => { throw new Error('The vendor list could not be verified.'); };
    if (!exactObject(value, ['ok', 'event', 'vendors', 'total', 'generated_at']) || value.ok !== true || !timestamp(value.generated_at)) invalid();
    const event = value.event;
    if (!exactObject(event, ['key', 'name', 'venue', 'starts_at', 'revision']) || typeof event.key !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(event.key) || !plainText(event.name, 200) || !plainText(event.venue, 200) || !timestamp(event.starts_at) || !Number.isInteger(event.revision) || event.revision < 1 || event.revision > 2147483647) invalid();
    if (!Array.isArray(value.vendors) || value.vendors.length > 5000 || !Number.isInteger(value.total) || value.total !== value.vendors.length) invalid();
    const ids = new Set();
    value.vendors.forEach(vendor => {
      if (!exactObject(vendor, ['id', 'name', 'qr_url']) || typeof vendor.id !== 'string' || !/^[1-9][0-9]{0,17}$/.test(vendor.id) || ids.has(vendor.id) || !plainText(vendor.name, 200) || vendor.qr_url !== qrPrefix + vendor.id) invalid();
      ids.add(vendor.id);
    });
    return value;
  }
  function qrSvg(vendor) {
    if (typeof qrcode !== 'function') throw new Error('The QR-code generator is not available.');
    const code = qrcode(0, 'M'); code.addData(vendor.qr_url, 'Byte'); code.make();
    const size = code.getModuleCount();
    if (!Number.isInteger(size) || size < 21 || size > 177 || (size - 21) % 4 !== 0) throw new Error('A vendor QR code could not be generated.');
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + (size + 8) + ' ' + (size + 8));
    svg.setAttribute('width', '240'); svg.setAttribute('height', '240');
    svg.setAttribute('class', 'ww-vendor-codes-qr');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Vendor Bingo QR code for ' + vendor.name);
    svg.setAttribute('shape-rendering', 'crispEdges');
    const title = document.createElementNS(namespace, 'title'); title.textContent = 'Scan for ' + vendor.name; svg.appendChild(title);
    const background = document.createElementNS(namespace, 'rect');
    background.setAttribute('width', String(size + 8)); background.setAttribute('height', String(size + 8)); background.setAttribute('fill', '#ffffff'); svg.appendChild(background);
    let pathData = '';
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (!code.isDark(row, column)) continue;
        let run = 1;
        while (column + run < size && code.isDark(row, column + run)) run++;
        pathData += 'M' + (column + 4) + ' ' + (row + 4) + 'h' + run + 'v1h-' + run + 'z';
        column += run - 1;
      }
    }
    if (!pathData) throw new Error('A vendor QR code was empty.');
    const path = document.createElementNS(namespace, 'path'); path.setAttribute('d', pathData); path.setAttribute('fill', '#000000'); svg.appendChild(path);
    return svg;
  }
  function groupCards(items) {
    const fragment = document.createDocumentFragment();
    const perSheet = activeLayout ? activeLayout.perSheet : 8;
    let sheet;
    items.forEach((card, index) => {
      if (index % perSheet === 0) {
        sheet = document.createElement('div'); sheet.className = 'ww-vendor-codes-sheet';
        fragment.appendChild(sheet);
      }
      sheet.appendChild(card.node);
    });
    return fragment;
  }
  function applyPrintLayout() {
    const selected = printLayout && printLayout.value;
    root.dataset.printLayout = Object.prototype.hasOwnProperty.call(printLayouts, selected) || selected === 'letter-custom' || selected === 'tabloid-custom' ? selected : 'letter-eight';
    if (printLayout) printLayout.value = root.dataset.printLayout;
    const horizontal = cardOrientation && cardOrientation.value === 'horizontal';
    root.dataset.cardOrientation = horizontal ? 'horizontal' : 'standard';
    if (cardOrientation) cardOrientation.value = root.dataset.cardOrientation;
    const note = byId('wwVendorCodesPrintHelp');
    customSize.hidden = !root.dataset.printLayout.endsWith('-custom');
    try {
      activeLayout = WWVendorQrLayout.resolve({ layout: root.dataset.printLayout, orientation: root.dataset.cardOrientation, width: cardWidth.value, height: cardHeight.value });
      root.dataset.printPage = activeLayout.pageKey;
      root.dataset.layoutValid = 'true';
      const fields = { 'card-width': 'width', 'card-height': 'height', 'sheet-width': 'sheetWidth', 'sheet-height': 'sheetHeight', 'card-padding': 'padding', 'card-gap': 'gap', 'qr-size': 'qrSize' };
      Object.keys(fields).forEach(key => root.style.setProperty('--' + key, activeLayout[fields[key]] + 'in'));
      root.style.setProperty('--columns', String(activeLayout.columns)); root.style.setProperty('--rows', String(activeLayout.rows));
      root.style.setProperty('--name-size', activeLayout.nameSize + 'pt'); root.style.setProperty('--name-long-size', activeLayout.nameLongSize + 'pt'); root.style.setProperty('--name-longest-size', activeLayout.nameLongestSize + 'pt');
      layoutError.hidden = true; layoutError.textContent = '';
      cardWidth.removeAttribute('aria-invalid'); cardHeight.removeAttribute('aria-invalid');
      if (cards.length) grid.replaceChildren(groupCards(cards));
      if (note) note.textContent = (activeLayout.paper === 'letter' ? 'Letter paper' : '11 × 17 inch paper') + ', ' + activeLayout.pageOrientation + ': ' + activeLayout.perSheet + ' cards per sheet · ' + activeLayout.width + ' × ' + activeLayout.height + ' inches each. Print and PDF include all vendors.';
    } catch (error) {
      activeLayout = null; root.dataset.layoutValid = 'false';
      layoutError.hidden = false; layoutError.textContent = error.message;
      cardWidth.setAttribute('aria-invalid', 'true'); cardHeight.setAttribute('aria-invalid', 'true');
      if (note) note.textContent = 'Adjust the custom size to continue.';
    }
    updateButtons();
  }
  function updateButtons() {
    const disabled = busy || pdfBusy || !loaded || cards.length === 0 || !activeLayout;
    printButton.disabled = disabled; downloadButton.disabled = disabled;
    refreshButton.disabled = busy || pdfBusy;
  }
  async function buildCards(vendors) {
    const fragment = document.createDocumentFragment(), built = [];
    for (let index = 0; index < vendors.length; index++) {
      const vendor = vendors[index], card = document.createElement('article'); card.className = 'ww-vendor-codes-card';
      card.appendChild(qrSvg(vendor));
      const name = document.createElement('h3'); name.textContent = vendor.name;
      name.className = vendor.name.length > 140 ? 'ww-vendor-codes-name ww-vendor-codes-name-longest'
        : vendor.name.length > 70 ? 'ww-vendor-codes-name ww-vendor-codes-name-long' : 'ww-vendor-codes-name';
      card.appendChild(name);
      fragment.appendChild(card); built.push({ node: card, vendor: vendor, searchText: (vendor.name + ' ' + vendor.id).toLocaleLowerCase() });
      // Large valid rosters must not freeze search, scrolling, or the browser UI.
      if ((index + 1) % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { fragment: groupCards(built), cards: built };
  }
  function vendorCount(number) { return number + (number === 1 ? ' vendor' : ' vendors'); }
  function applySearch() {
    const query = search.value.trim().toLocaleLowerCase(); let visible = 0;
    cards.forEach(card => { card.node.hidden = query !== '' && !card.searchText.includes(query); if (!card.node.hidden) visible++; });
    if (!loaded) return;
    byId('wwVendorCodesCount').textContent = query ? visible + ' of ' + vendorCount(cards.length) + ' shown' : vendorCount(cards.length);
    empty.hidden = visible > 0;
    empty.textContent = cards.length ? 'No vendors match your search.' : 'No participating vendors are listed for this wedding show yet.';
  }
  function printSummary() {
    byId('wwVendorCodesPrintSummary').textContent = vendorCount(cards.length) + ' · ' + (stale ? 'Possibly outdated — last successful check: ' : 'Last checked: ') + lastChecked;
  }
  function showError() {
    stale = loaded;
    status.dataset.state = 'error';
    status.textContent = loaded ? 'Could not refresh. The QR codes shown may be outdated. Try Refresh.' : 'The vendor QR codes could not be loaded. Please try Refresh.';
    if (!loaded) { empty.hidden = false; empty.textContent = 'No verified QR codes are available yet.'; byId('wwVendorCodesCount').textContent = 'Vendor list unavailable'; }
    printSummary();
  }
  async function refresh() {
    if (busy || pdfBusy) return;
    if (root.dataset.feedUrl !== expectedFeed) { showError(); grid.setAttribute('aria-busy', 'false'); return; }
    busy = true; lastAttempt = Date.now(); updateButtons();
    grid.setAttribute('aria-busy', 'true'); status.dataset.state = 'loading'; status.textContent = loaded ? 'Checking for updates…' : 'Loading QR codes…';
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(expectedFeed, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok || String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('The vendor list could not be loaded.');
      const declaredSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > 8388608) throw new Error('The vendor list was too large.');
      const body = await response.text();
      if (typeof body !== 'string' || body.length > 8388608) throw new Error('The vendor list was too large.');
      const feed = validateFeed(JSON.parse(body));
      const nextFingerprint = JSON.stringify({ event: feed.event, vendors: feed.vendors });
      if (nextFingerprint !== fingerprint) {
        const built = await buildCards(feed.vendors);
        byId('wwVendorCodesEventName').textContent = feed.event.name;
        byId('wwVendorCodesEventDetails').textContent = dateFormatter.format(new Date(feed.event.starts_at)) + ' · ' + feed.event.venue;
        grid.replaceChildren(built.fragment); cards = built.cards; fingerprint = nextFingerprint;
      }
      loaded = true; stale = false;
      lastChecked = checkedFormatter.format(new Date());
      byId('wwVendorCodesChecked').textContent = 'Last checked ' + lastChecked;
      byId('wwVendorCodesChecked').setAttribute('title', 'Vendor list generated ' + feed.generated_at);
      applySearch(); printSummary(); status.dataset.state = 'ready';
      status.textContent = 'Updates automatically every minute while this page is visible.';
    } catch (error) { showError(); }
    finally { clearTimeout(timeout); busy = false; updateButtons(); grid.setAttribute('aria-busy', 'false'); }
  }
  search.addEventListener('input', applySearch);
  refreshButton.addEventListener('click', () => { void refresh(); });
  if (printLayout) printLayout.addEventListener('change', applyPrintLayout);
  if (cardOrientation) cardOrientation.addEventListener('change', applyPrintLayout);
  cardWidth.addEventListener('input', applyPrintLayout); cardHeight.addEventListener('input', applyPrintLayout);
  printButton.addEventListener('click', () => { if (!busy && !pdfBusy && loaded && cards.length > 0 && activeLayout) window.print(); });
  downloadButton.addEventListener('click', async () => {
    if (busy || pdfBusy || !loaded || !cards.length || !activeLayout) return;
    pdfBusy = true; updateButtons(); downloadButton.textContent = 'Preparing PDF…';
    try {
      await WWVendorQrPdf.download({ layout: Object.assign({}, activeLayout), vendors: cards.map(card => card.vendor) });
      status.dataset.state = 'ready'; status.textContent = 'Your printable PDF is ready. Print it at 100% / Actual size.';
    } catch (error) {
      status.dataset.state = 'error'; status.textContent = 'The PDF could not be created. Please try again, or use Print all QR codes.';
    } finally { pdfBusy = false; downloadButton.textContent = 'Download PDF'; updateButtons(); }
  });
  applyPrintLayout();
  setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastAttempt >= 60000) void refresh(); });
  void refresh();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeVendorBingoQrCodes, { once: true });
else initializeVendorBingoQrCodes();
/* WW_PUBLIC_VENDOR_QR_UI_END */
