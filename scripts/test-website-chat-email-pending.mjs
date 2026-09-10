import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../brilliant-directories/widgets/chat-email-pending-ui.js', import.meta.url), 'utf8');
const js = source.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

function fixture(required = true, hasNotice = true, loading = false) {
  const listeners = {};
  const prefilters = [];
  const notice = { hidden: false, getAttribute: () => required ? '1' : '0' };
  const context = vm.createContext({ URL, URLSearchParams, window: {
    location: { href: 'https://www.weddingwin.ca/offline-member/connect', origin: 'https://www.weddingwin.ca' },
    jQuery: { ajaxPrefilter: callback => prefilters.push(callback) },
  }, document: {
    readyState: loading ? 'loading' : 'complete',
    getElementById: id => id === 'ww-chat-email-pending-notice' && hasNotice ? notice : null,
    addEventListener: (name, callback, capture) => { assert.equal(capture, true); listeners[name] = callback; },
  } });
  const run = () => vm.runInContext(js, context);
  run();
  return { listeners, prefilters, notice, run };
}

function event(inside = true, overrides = {}) {
  const calls = [];
  const target = { closest: selector => selector === 'button,input[type="submit"],a'
    ? target : inside ? target : null };
  return { target, key: 'Enter', keyCode: 13, shiftKey: false, calls,
    preventDefault: () => calls.push('prevent'), stopPropagation: () => calls.push('stop'),
    stopImmediatePropagation: () => calls.push('immediate'), ...overrides };
}

test('pending UI guards compose click, submit and Enter but preserves typing and Shift-Enter', () => {
  const f = fixture();
  for (const name of ['click', 'submit', 'keydown']) {
    const e = event();
    f.listeners[name](e);
    assert.deepEqual(e.calls, ['prevent', 'stop', 'immediate']);
  }
  for (const changes of [{ shiftKey: true }, { key: 'a', keyCode: 65 }]) {
    const e = event(true, changes);
    f.listeners.keydown(e);
    assert.deepEqual(e.calls, []);
  }
});

test('non-chat actions and confirmed/ordinary pages are unaffected', () => {
  const f = fixture();
  for (const name of ['click', 'submit', 'keydown']) {
    const e = event(false);
    f.listeners[name](e);
    assert.deepEqual(e.calls, []);
  }
  for (const f of [fixture(false), fixture(true, false)]) {
    assert.equal(Object.keys(f.listeners).length, 0);
    assert.equal(f.prefilters.length, 0);
  }
});

test('pending UI aborts both exact add-on writes for object, encoded and FormData-like inputs', () => {
  const f = fixture();
  for (const action of ['init-pmb-thread', 'add-thread-message']) {
    for (const data of [{ subaction: action }, new URLSearchParams({ subaction: action }).toString(),
      new URLSearchParams({ subaction: action })]) {
      const aborted = [];
      f.prefilters[0]({ url: '/wapi/widget', data }, { data }, { abort: reason => aborted.push(reason) });
      assert.deepEqual(aborted, ['email_confirmation_required']);
    }
  }
});

test('pending UI leaves read/list and unrelated-origin AJAX unchanged and never replays requests', () => {
  const f = fixture();
  for (const options of [
    { url: '/wapi/widget', data: { subaction: 'get-thread-messages' } },
    { url: '/wapi/widget', data: { subaction: 'ww-chat-guard-check' } },
    { url: '/different', data: { subaction: 'add-thread-message' } },
    { url: 'https://other.example.invalid/wapi/widget', data: { subaction: 'add-thread-message' } },
    { url: 'http://[', data: 'invalid' },
  ]) {
    const aborted = [];
    f.prefilters[0](options, options, { abort: reason => aborted.push(reason) });
    assert.deepEqual(aborted, []);
  }
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|\.ajax\(|innerHTML|console\.|localStorage|setTimeout/);
});

test('duplicate initialization cannot stack click or AJAX handlers', () => {
  const f = fixture();
  const firstClick = f.listeners.click;
  for (let i = 0; i < 20; i++) f.run();
  assert.equal(f.listeners.click, firstClick);
  assert.equal(f.prefilters.length, 1);
});

test('initialization waits for server markup when widget JavaScript loads before the document', () => {
  const f = fixture(true, true, true);
  assert.deepEqual(Object.keys(f.listeners), ['DOMContentLoaded']);
  assert.equal(f.prefilters.length, 0);
  f.listeners.DOMContentLoaded();
  assert.equal(typeof f.listeners.click, 'function');
  assert.equal(f.prefilters.length, 1);
  f.listeners.DOMContentLoaded();
  assert.equal(f.prefilters.length, 1);
});
