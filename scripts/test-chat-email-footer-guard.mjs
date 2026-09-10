import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const artifact = process.env.WEDDINGWIN_TEST_MINIFIED ? 'chat-email-footer-guard.min.html' : 'chat-email-footer-guard.js';
const source = readFileSync(new URL('../brilliant-directories/widgets/' + artifact, import.meta.url), 'utf8');
const js = source.slice(source.indexOf('<script>') + 8, source.lastIndexOf('</script>'));
const flush = () => new Promise(resolve => setImmediate(resolve));
const confirmed = { ok: true, email_confirmation_required: false, email_verification_status: 'confirmed' };
const pending = { ok: true, email_confirmation_required: true, email_verification_status: 'pending' };

function fixture({ path = '/test-vendor/connect', hasCompose = true, loading = false } = {}) {
  const listeners = {}, windowListeners = {}, prefilters = [], requests = [], observers = [], timers = new Map();
  let textChanges = 0;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.style = {}; this.isConnected = false; this.value = ''; }
    set textContent(value) { this.value = value; textChanges += 1; }
    get textContent() { return this.value; }
    setAttribute(name, value) { this.attributes[name] = value; }
    appendChild(node) { this.children.push(node); node.parentNode = this; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    insertBefore(node, before) {
      const old = this.children.indexOf(node);
      if (old >= 0) this.children.splice(old, 1);
      this.children.splice(this.children.indexOf(before), 0, node); node.parentNode = this; node.isConnected = true;
    }
  }
  const root = new Element('root'), history = new Element('history'), form = new Element('form');
  root.appendChild(history); root.appendChild(form);
  let composePresent = hasCompose;
  const document = {
    readyState: loading ? 'loading' : 'complete', hidden: false, body: root,
    querySelector: () => composePresent ? form : null,
    createElement: tag => new Element(tag),
    addEventListener: (name, callback) => { (listeners[name] ||= []).push(callback); },
  };
  class Observer { constructor(callback) { observers.push(callback); } observe() {} }
  const location = new URL('https://www.weddingwin.ca' + path);
  const window = {
    location, MutationObserver: Observer,
    jQuery: { ajaxPrefilter: callback => prefilters.push(callback) },
    addEventListener: (name, callback) => { (windowListeners[name] ||= []).push(callback); },
  };
  const context = vm.createContext({ window, document, URL, URLSearchParams, AbortController,
    MutationObserver: Observer,
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
      options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }),
  });
  const run = () => vm.runInContext(js, context);
  run();
  return {
    run, listeners, windowListeners, prefilters, requests, observers, timers, root, history,
    notice: () => root.children.find(node => node.id === 'ww-chat-email-status'),
    setCompose: value => { composePresent = value; },
    textChanges: () => textChanges,
    respond: async (data, status = 200, index = requests.length - 1) => {
      requests[index].resolve({ ok: status >= 200 && status < 300, json: async () => data }); await flush();
    },
  };
}
function event(inside = true, overrides = {}) {
  const calls = [];
  const target = { closest: selector => selector === 'button,input[type="submit"],a,#bd-chat-pmb-sm-sm' ? target : inside ? target : null };
  return { target, key: 'Enter', keyCode: 13, shiftKey: false,
    preventDefault: () => calls.push('prevent'), stopPropagation: () => calls.push('stop'),
    stopImmediatePropagation: () => calls.push('immediate'), calls, ...overrides };
}

test('footer is scoped to connect/account chat, requires actual compose DOM, and survives BD serialization', () => {
  assert.equal(source.includes(String.fromCharCode(92)), false, 'BD footer strips backslashes');
  for (const path of ['/', '/checkout/17', '/account/home', '/test-vendor', '/account/chat_messages-other']) {
    const f = fixture({ path });
    assert.equal(f.requests.length, 0); assert.equal(Object.keys(f.listeners).length, 0);
  }
  const absent = fixture({ hasCompose: false });
  assert.equal(absent.requests.length, 0); assert.equal(absent.notice(), undefined);
  absent.setCompose(true); absent.observers[0]();
  assert.equal(absent.requests.length, 1);
  for (const path of ['/test-vendor/connect/', '/account/chat_messages', '/account/chat_messages/thread']) assert.equal(fixture({ path }).requests.length, 1);
});

test('first-load/rapid sends are blocked until a bounded same-origin authoritative check finishes', async () => {
  const f = fixture({ loading: true });
  assert.equal(f.requests.length, 1, 'guard starts before DOMContentLoaded when compose already exists');
  assert.equal(f.prefilters.length, 1);
  const request = f.requests[0];
  assert.equal(request.url, '/verify-email-change');
  assert.equal(request.options.body, 'ww_email_change_action=status');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.redirect, 'error');
  for (let i = 0; i < 20; i++) {
    const e = event(); f.listeners.click[0](e); assert.deepEqual(e.calls, ['prevent', 'stop', 'immediate']);
    f.windowListeners.focus[0]();
  }
  assert.equal(f.requests.length, 1);
  await f.respond(confirmed);
  const allowed = event(); f.listeners.click[0](allowed); assert.deepEqual(allowed.calls, []);
  assert.equal(f.notice().hidden, true);
});

test('pending/expired users get friendly retry without hiding or rewriting conversation history', async () => {
  for (const status of ['pending', 'expired']) {
    const f = fixture();
    await f.respond({ ...pending, email_verification_status: status, pending_email: null });
    const notice = f.notice();
    assert.equal(notice.hidden, false); assert.match(notice.children[0].textContent, /Confirm your new email/);
    assert.equal(notice.children[1].href, '/verify-email-change');
    assert.equal(f.root.children[0], f.history);
    for (const name of ['click', 'submit', 'keydown']) {
      const e = event(); f.listeners[name][0](e); assert.deepEqual(e.calls, ['prevent', 'stop', 'immediate']);
    }
    notice.children[2].listeners.click({ preventDefault() {} });
    await f.respond(confirmed);
    assert.equal(notice.hidden, true);
    const e = event(); f.listeners.submit[0](e); assert.deepEqual(e.calls, []);
  }
});

test('proprietary misspelled buton send element and its icon are guarded by exact ID', async () => {
  const f = fixture();
  const send = {
    tagName: 'BUTON', id: 'bd-chat-pmb-sm-sm',
    closest: selector => selector.includes('#bd-chat-pmb-sm-sm') ? send : null,
  };
  const icon = { tagName: 'I', closest: selector => send.closest(selector) };
  for (const target of [send, icon]) {
    const e = event(true, { target }); f.listeners.click[0](e);
    assert.deepEqual(e.calls, ['prevent', 'stop', 'immediate']);
  }
  await f.respond(pending);
  const blocked = event(true, { target: icon }); f.listeners.click[0](blocked);
  assert.deepEqual(blocked.calls, ['prevent', 'stop', 'immediate']);
  f.notice().children[2].listeners.click({ preventDefault() {} });
  await f.respond(confirmed);
  const allowed = event(true, { target: icon }); f.listeners.click[0](allowed);
  assert.deepEqual(allowed.calls, []);
});

test('network failures, timeout, and malformed state stay blocked with clean retry', async () => {
  for (const kind of ['network', 'timeout', 'malformed', 'http', 'inconsistent']) {
    const f = fixture();
    if (kind === 'network') { f.requests[0].reject(new Error('private-error-must-not-render')); await flush(); }
    else if (kind === 'timeout') { [...f.timers.values()][0](); await flush(); }
    else await f.respond(kind === 'malformed' ? {} : kind === 'inconsistent' ? { ...confirmed, email_confirmation_required: true } : confirmed, kind === 'http' ? 503 : 200);
    assert.match(f.notice().children[0].textContent, /could not check/);
    assert.equal(f.notice().children[2].disabled, false);
    const e = event(); f.listeners.click[0](e); assert.deepEqual(e.calls, ['prevent', 'stop', 'immediate']);
    f.notice().children[2].listeners.click({ preventDefault() {} });
    await f.respond(confirmed); assert.equal(f.notice().hidden, true);
  }
});

test('AJAX guard aborts only the exact proprietary new/reply writes while status is unknown/pending', async () => {
  const f = fixture();
  for (const action of ['init-pmb-thread', 'add-thread-message']) {
    for (const data of [{ subaction: action }, new URLSearchParams({ subaction: action }), 'subaction=' + action]) {
      const aborts = [];
      f.prefilters[0]({ url: '/wapi/widget' }, { data }, { abort: reason => aborts.push(reason) });
      assert.deepEqual(aborts, ['email_confirmation_required']);
    }
  }
  for (const options of [
    { url: '/wapi/widget', data: { subaction: 'get-thread-messages' } },
    { url: '/wapi/widget', data: { subaction: 'ww-chat-guard-check' } },
    { url: 'https://other.example.invalid/wapi/widget', data: { subaction: 'add-thread-message' } },
  ]) {
    const aborts = []; f.prefilters[0](options, options, { abort: reason => aborts.push(reason) }); assert.deepEqual(aborts, []);
  }
  await f.respond(confirmed);
  const aborts = []; f.prefilters[0]({ url: '/wapi/widget', data: { subaction: 'add-thread-message' } }, {}, { abort: reason => aborts.push(reason) });
  assert.deepEqual(aborts, []);
});

test('typing, Shift-Enter, unrelated controls, and duplicate initialization remain unchanged', () => {
  const f = fixture();
  for (const e of [event(false), event(true, { shiftKey: true }), event(true, { key: 'a', keyCode: 65 })]) {
    f.listeners.keydown[0](e); assert.deepEqual(e.calls, []);
  }
  const click = f.listeners.click[0];
  for (let i = 0; i < 20; i++) f.run();
  assert.equal(f.listeners.click.length, 1); assert.equal(f.listeners.click[0], click); assert.equal(f.prefilters.length, 1);
});

test('mutation observer cannot trigger a self-render loop or repeated status requests', async () => {
  const f = fixture();
  await f.respond(confirmed);
  const changes = f.textChanges();
  for (let i = 0; i < 20; i++) f.observers[0]();
  assert.equal(f.textChanges(), changes); assert.equal(f.requests.length, 1);
  f.windowListeners.focus[0]();
  assert.equal(f.requests.length, 2, 'returning from a confirmation tab rechecks authoritative state');
  const e = event(); f.listeners.click[0](e); assert.deepEqual(e.calls, ['prevent', 'stop', 'immediate']);
});
