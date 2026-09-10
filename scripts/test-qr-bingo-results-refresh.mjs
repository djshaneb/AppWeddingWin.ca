// Offline behavior checks for the actual public results script. No live data,
// browser interaction, account requests, or production mutations are used.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const path = new URL('../brilliant-directories/widgets/262-qr-bingo-results.js', import.meta.url);
const source = readFileSync(path, 'utf8').replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const flush = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor(tag = '') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this.hidden = false;
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  trigger(name) { return Promise.all((this.listeners[name] || []).map(listener => listener({ preventDefault() {} }))); }
  querySelector(tag) { return this.children.find(child => child.tagName === tag.toUpperCase()) || null; }
}

function fixture({ href = 'https://www.weddingwin.ca/qr-bingo-results?keep=1#board' } = {}) {
  const ids = ['wwQrResultsApp', 'wwQrrActive', 'wwQrrCompleted', 'wwQrrVendors', 'wwQrrSearch',
    'wwQrrRefresh', 'wwQrrStatus', 'wwQrrTableWrap', 'wwQrrBody', 'wwQrrEmpty', 'wwQrrUpdated'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element('div')]));
  nodes.wwQrResultsApp.dataset = { eventKey: 'private-test-event', configRevision: '15' };
  nodes.wwQrrEmpty.append(new Element('h2'), new Element('p'));
  for (const id of ['wwQrrActive', 'wwQrrCompleted', 'wwQrrVendors']) nodes[id].textContent = '-';
  const requests = [], intervals = [], timers = new Map(), navigations = [];
  let nextTimer = 1;
  const schedule = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; };
  const clear = id => timers.delete(id);
  const location = {
    href,
    replace(url) { navigations.push({ type: 'replace', url: String(url) }); this.href = String(url); },
    assign(url) { navigations.push({ type: 'assign', url: String(url) }); this.href = String(url); },
    reload() { navigations.push({ type: 'reload', url: this.href }); },
  };
  const fakeFetch = (url, init) => new Promise((resolve, reject) => {
    const request = { url, init, fields: Object.fromEntries(new URLSearchParams(init.body)), aborted: false,
      respond(data, httpStatus = 200) { resolve({ ok: httpStatus >= 200 && httpStatus < 300, status: httpStatus, json: async () => data }); },
      malformed(httpStatus = 200) { resolve({ ok: httpStatus >= 200 && httpStatus < 300, status: httpStatus, json: async () => { throw new SyntaxError('Invalid JSON'); } }); },
      fail(error = new Error('Synthetic network failure')) { reject(error); },
    };
    init.signal?.addEventListener('abort', () => {
      request.aborted = true;
      reject(Object.assign(new Error('Synthetic aborted request'), { name: 'AbortError' }));
    }, { once: true });
    requests.push(request);
  });
  const document = { getElementById: id => nodes[id] || null, createElement: tag => new Element(tag) };
  const window = { location, setTimeout: schedule, clearTimeout: clear,
    addEventListener() {},
    setInterval(callback, delay) { intervals.push({ callback, delay }); return intervals.length; } };
  const context = vm.createContext({ document, window, fetch: fakeFetch, URL, URLSearchParams,
    AbortController, Error, Date, setTimeout: schedule, clearTimeout: clear });
  vm.runInContext(source, context, { filename: 'actual-262-qr-bingo-results.js' });
  return { nodes, requests, intervals, timers, navigations, location,
    async poll() { for (const interval of intervals) interval.callback(); await flush(); },
    async click() { nodes.wwQrrRefresh.trigger('click'); await flush(); },
    async expire() {
      const matching = [...timers].filter(([, timer]) => timer.delay === 15000);
      assert.equal(matching.length, 1, 'Each in-flight request must have one 15-second timeout');
      for (const [id, timer] of matching) { timers.delete(id); timer.callback(); }
      await flush();
    },
  };
}

const participant = (label, scanned = 1, done = false) => ({ label, scanned_count: scanned,
  total_vendors: 14, progress_percentage: done ? 100 : Math.round(scanned / 14 * 100), is_completed: done });
function success(participants = [participant('Participant 1'), participant('Participant 2', 14, true)], extra = {}) {
  return { status: 'success', participants, active_participants: participants.length,
    completed_participants: participants.filter(row => row.is_completed).length, total_vendors: 14, ...extra };
}
async function loadInitial(f, data = success()) { f.requests[0].respond(data); await flush(); }
const rowLabel = row => row.children[0].children[0].textContent;
const counts = f => ['wwQrrActive', 'wwQrrCompleted', 'wwQrrVendors'].map(id => f.nodes[id].textContent);

test('initial load posts the pinned event and renders current counts and rows', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 1);
  assert.equal(f.nodes.wwQrrRefresh.disabled, true);
  assert.deepEqual(f.requests[0].fields, { action: 'get_scoreboard_data', expected_event_key: 'private-test-event', expected_config_revision: '15' });
  assert.equal(f.requests[0].init.credentials, 'same-origin');
  assert.equal(f.requests[0].init.cache, 'no-store');
  assert.equal(f.requests[0].init.method, 'POST');
  await loadInitial(f);
  assert.deepEqual(counts(f), ['2', '1', '14']);
  assert.deepEqual(f.nodes.wwQrrBody.children.map(rowLabel), ['Participant 1', 'Participant 2']);
  assert.equal(f.nodes.wwQrrRefresh.disabled, false);
  assert.equal(f.nodes.wwQrrTableWrap.hidden, false);
  assert.equal(f.nodes.wwQrrEmpty.hidden, true);
  assert.match(f.nodes.wwQrrUpdated.textContent, /Last refreshed/);
  assert.equal(f.timers.size, 0);
  assert.equal(f.intervals.length, 1);
  assert.equal(f.intervals[0].delay, 60000);
});

test('rapid refresh taps plus interval polls never overlap requests', async () => {
  const f = fixture();
  await f.click(); await f.click(); await f.poll();
  assert.equal(f.requests.length, 1);
  await loadInitial(f);
  await f.click(); await f.click(); await f.poll();
  assert.equal(f.requests.length, 2);
  assert.equal(f.nodes.wwQrrRefresh.disabled, true);
  f.requests[1].respond(success()); await flush();
  assert.equal(f.nodes.wwQrrRefresh.disabled, false);
});

test('15-second timeout releases refresh and preserves all last successful data', async () => {
  const f = fixture();
  await loadInitial(f);
  const previousRows = [...f.nodes.wwQrrBody.children], previousUpdated = f.nodes.wwQrrUpdated.textContent;
  await f.click(); await f.expire();
  assert.equal(f.requests[1].aborted, true);
  assert.equal(f.nodes.wwQrrRefresh.disabled, false);
  assert.equal(f.nodes.wwQrrStatus.classList.contains('is-error'), true);
  assert.match(f.nodes.wwQrrStatus.textContent, /too[k]? long|timed out|longer than expected/i);
  assert.deepEqual(counts(f), ['2', '1', '14']);
  assert.deepEqual(f.nodes.wwQrrBody.children, previousRows);
  assert.equal(f.nodes.wwQrrUpdated.textContent, previousUpdated);
  await f.click();
  assert.equal(f.requests.length, 3, 'The failed request left the single-flight lock stuck');
  f.requests[2].respond(success([participant('Participant 3', 2)])); await flush();
  assert.deepEqual(counts(f), ['1', '0', '14']);
  assert.equal(rowLabel(f.nodes.wwQrrBody.children[0]), 'Participant 3');
  assert.equal(f.nodes.wwQrrStatus.classList.contains('is-error'), false);
});

test('HTTP and malformed-response failures preserve counts, rows and refresh timestamp', async () => {
  const f = fixture();
  await loadInitial(f);
  const previousUpdated = f.nodes.wwQrrUpdated.textContent;
  await f.click();
  f.requests[1].respond({ status: 'error', message: 'Synthetic unavailable', active_participants: 0, participants: [] }, 503);
  await flush();
  assert.deepEqual(counts(f), ['2', '1', '14']);
  assert.equal(f.nodes.wwQrrBody.children.length, 2);
  assert.equal(f.nodes.wwQrrUpdated.textContent, previousUpdated);
  assert.equal(f.nodes.wwQrrRefresh.disabled, false);
  assert.match(f.nodes.wwQrrStatus.textContent, /Synthetic unavailable/);
  await f.click(); f.requests[2].malformed(); await flush();
  assert.deepEqual(counts(f), ['2', '1', '14']);
  assert.equal(f.nodes.wwQrrBody.children.length, 2);
  assert.equal(f.nodes.wwQrrRefresh.disabled, false);
  assert.equal(f.nodes.wwQrrUpdated.textContent, previousUpdated);
});

test('participant search is case-insensitive and distinguishes no matches from no scans', async () => {
  const f = fixture();
  await loadInitial(f, success([participant('Participant ALPHA'), participant('Participant Beta')]));
  f.nodes.wwQrrSearch.value = '  alpha  '; await f.nodes.wwQrrSearch.trigger('input');
  assert.deepEqual(f.nodes.wwQrrBody.children.map(rowLabel), ['Participant ALPHA']);
  f.nodes.wwQrrSearch.value = 'not-in-list'; await f.nodes.wwQrrSearch.trigger('input');
  assert.equal(f.nodes.wwQrrTableWrap.hidden, true);
  assert.equal(f.nodes.wwQrrEmpty.hidden, false);
  assert.match(f.nodes.wwQrrEmpty.querySelector('h2').textContent, /No members match/);
  assert.deepEqual(counts(f), ['2', '0', '14'], 'Local search must not change global totals');
  assert.equal(f.requests.length, 1, 'Search must not request or mutate live data');
  f.nodes.wwQrrSearch.value = ''; await f.nodes.wwQrrSearch.trigger('input');
  assert.equal(f.nodes.wwQrrBody.children.length, 2);
  await f.click(); f.requests[1].respond(success([])); await flush();
  assert.match(f.nodes.wwQrrEmpty.querySelector('h2').textContent, /No current-event scans yet/);
});

test('500-row display sample honestly retains the full participant totals', async () => {
  const f = fixture();
  const rows = Array.from({ length: 500 }, (_, i) => participant(`Participant ${i + 1}`));
  await loadInitial(f, success(rows, { active_participants: 713, completed_participants: 84 }));
  assert.deepEqual(counts(f), ['713', '84', '14']);
  assert.equal(f.nodes.wwQrrBody.children.length, 500);
  assert.match(f.nodes.wwQrrStatus.textContent, /500/);
  assert.match(f.nodes.wwQrrStatus.textContent, /713/);
  assert.match(f.nodes.wwQrrStatus.textContent, /show|display|list|sample/i);
  assert.doesNotMatch(f.nodes.wwQrrStatus.textContent, /^500 current-event participants$/);
});

test('stale event causes one marked cache-busting navigation without losing other URL context', async () => {
  const f = fixture();
  f.requests[0].respond({ status: 'error', code: 'stale_event_config' }, 409); await flush();
  assert.equal(f.navigations.length, 1);
  assert.equal(f.navigations[0].type, 'replace');
  const target = new URL(f.navigations[0].url);
  assert.equal(target.origin, 'https://www.weddingwin.ca');
  assert.equal(target.pathname, '/qr-bingo-results');
  assert.equal(target.searchParams.get('keep'), '1');
  assert.equal(target.hash, '#board');
  assert.equal(target.searchParams.get('results_refresh'), 'private-test-event:15');
  assert.equal(target.searchParams.getAll('results_refresh').length, 1);
  await f.click();
  f.requests[1].respond({ status: 'error', code: 'stale_event_config' }, 409); await flush();
  assert.equal(f.navigations.length, 1, 'A persistent stale revision caused a reload loop');
  assert.match(f.nodes.wwQrrStatus.textContent, /settings changed.*reload this page/i);
  assert.equal(f.nodes.wwQrrRefresh.disabled, false);
});

test('an already cache-busted stale page errors without navigation; unrelated409 also never reloads', async () => {
  const f = fixture({ href: 'https://www.weddingwin.ca/qr-bingo-results?results_refresh=private-test-event%3A15' });
  f.requests[0].respond({ status: 'error', code: 'stale_event_config' }, 409); await flush();
  assert.equal(f.navigations.length, 0);
  assert.equal(f.nodes.wwQrrStatus.classList.contains('is-error'), true);
  assert.match(f.nodes.wwQrrStatus.textContent, /settings changed.*reload this page/i);
  assert.equal(f.nodes.wwQrrRefresh.disabled, false);
  await f.click(); f.requests[1].respond({ status: 'error', code: 'different_conflict', message: 'Another conflict' }, 409); await flush();
  assert.equal(f.navigations.length, 0);
  assert.match(f.nodes.wwQrrStatus.textContent, /Another conflict/);
});
