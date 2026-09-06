#!/usr/bin/env node
// Actual homepage video script in a fake DOM. No network or account actions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { prepareHomeVideoFooter } from './prepare-home-video-footer.mjs';

const source = readFileSync(new URL('../brilliant-directories/pages/home-video-player.js', import.meta.url), 'utf8');

test('homepage script survives the CMS render-time backslash stripping', () => {
  assert.doesNotThrow(() => new vm.Script(source.replaceAll('\\', '')));
  assert.equal(source.includes('\\'), false);
});

test('CMS footer preparation preserves dollar regex, whole script, and unrelated footer exactly', () => {
  const prefix = '<script>const preserveBefore = "unchanged";</script>\n';
  const old = '<script>(function(){function playNiagara(card){} playNiagara(null);})();</script>';
  const suffix = '\n<script data-ww-homepage-newsletter-hardstop="1">const preserveAfter = "unchanged";</script>';
  const result = prepareHomeVideoFooter(prefix + old + suffix, source);
  assert.equal(result, prefix + '<script data-ww-home-video-playback="1">\n' + source + '</script>' + suffix);
  assert.equal((result.match(/<script/g) || []).length, 3);
  assert.equal(prepareHomeVideoFooter(result, source), result);
});

test('CMS footer preparation refuses ambiguity and syntax errors', () => {
  const old = '<script>function playNiagara(card){}</script>';
  assert.throws(() => prepareHomeVideoFooter('', source));
  assert.throws(() => prepareHomeVideoFooter(old + old, source));
  assert.throws(() => prepareHomeVideoFooter(old, 'var broken = ;'));
});

function harness({ reducedMotion = false, observer = true, top = 1800 } = {}) {
  const listeners = {}, frameListeners = {}, buttonListeners = {}, timers = new Map(), sent = [], attrs = {};
  const classes = new Set();
  let timerId = 0, intersection;
  const iframe = {
    attrs: { 'data-src': 'https://player.vimeo.com/video/1176337844?background=1&autoplay=1&muted=1&loop=1' },
    contentWindow: { postMessage(message, origin) { sent.push({ ...message, origin }); } },
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, callback) { frameListeners[name] = callback; },
  };
  const button = {
    addEventListener(name, callback) { buttonListeners[name] = callback; },
    setAttribute(name, value) { attrs[name] = value; },
  };
  const card = {
    getAttribute(name) { return attrs[name]; },
    setAttribute(name, value) { attrs[name] = value; },
    querySelector(selector) { return selector.includes('iframe') ? iframe : button; },
    getBoundingClientRect() { return { top, bottom: top + 400 }; },
    classList: {
      contains(name) { return classes.has(name); },
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
    },
  };
  const window = {
    innerHeight: 844,
    addEventListener(name, callback) { listeners[name] = callback; },
    removeEventListener(name) { delete listeners[name]; },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia() { return { matches: reducedMotion }; },
  };
  class IntersectionObserver {
    constructor(callback, options) { intersection = { callback, options, disconnected: false }; }
    observe(node) { intersection.node = node; }
    disconnect() { intersection.disconnected = true; }
  }
  if (observer) window.IntersectionObserver = IntersectionObserver;
  const context = { window, document: { readyState: 'complete', querySelector() { return card; } }, URL, Number, JSON, IntersectionObserver };
  vm.runInNewContext(source, context);
  return {
    sent, classes, attrs, iframe, timers,
    intersection: () => intersection,
    near() { intersection.callback([{ isIntersecting: true }]); },
    click() { buttonListeners.click(); },
    load() { frameListeners.load(); },
    message(data, patch = {}) { listeners.message({ origin: 'https://player.vimeo.com', source: iframe.contentWindow, data, ...patch }); },
    expire() { [...timers.values()].forEach(callback => callback()); },
    scroll(newTop) { top = newTop; listeners.scroll?.(); },
    rerun() { vm.runInNewContext(source, context); },
  };
}

test('keeps the existing lazy threshold and does not load while offscreen', () => {
  const h = harness();
  assert.equal(h.iframe.attrs.src, undefined);
  assert.equal(h.intersection().options.rootMargin, '420px 0px 420px 0px');
  h.near();
  assert.match(h.iframe.attrs.src, /muted=1/);
  assert.equal(h.intersection().disconnected, true);
});

test('ready never hides the poster or play button', () => {
  const h = harness(); h.near(); h.load(); h.message({ event: 'ready' });
  assert.equal(h.classes.has('is-playing'), false);
  assert.equal(h.classes.has('is-video-ready'), false);
  assert.ok(h.sent.some(message => message.method === 'play'));
});

test('actual play or positive timeupdate reveals the player', () => {
  for (const data of [{ event: 'play' }, { event: 'timeupdate', data: { seconds: 0.2 } }]) {
    const h = harness(); h.near(); h.message({ event: 'ready' }); h.message(data);
    assert.equal(h.classes.has('is-playing'), true);
    assert.equal(h.classes.has('is-video-ready'), true);
    assert.equal(h.classes.has('is-loading'), false);
    assert.equal(h.timers.size, 0);
  }
});

test('a tap can retry loaded autoplay immediately without waiting for the timeout', () => {
  const h = harness(); h.near(); h.message({ event: 'ready' });
  const count = h.sent.length;
  h.click(); h.click();
  assert.equal(h.sent.length, count + 2);
  assert.equal(h.sent.at(-1).method, 'play');
});

test('zero timeupdate is not playback evidence', () => {
  const h = harness(); h.near(); h.message({ event: 'timeupdate', data: { seconds: 0 } });
  assert.equal(h.classes.has('is-playing'), false);
});

test('denied autoplay leaves a usable direct play retry without reloading iframe', () => {
  const h = harness(); h.near(); h.message({ event: 'ready' });
  h.message({ event: 'error', data: { method: 'play', name: 'NotAllowedError' } });
  const url = h.iframe.attrs.src;
  const count = h.sent.filter(message => message.method === 'play').length;
  h.click();
  assert.equal(h.sent.filter(message => message.method === 'play').length, count + 1);
  assert.equal(h.iframe.attrs.src, url);
  assert.equal(h.classes.has('is-playing'), false);
  h.message({ event: 'play' });
  assert.equal(h.classes.has('is-playing'), true);
});

test('timeout permits retry and duplicate quick taps do not duplicate play requests', () => {
  const h = harness(); h.near(); h.message({ event: 'ready' }); h.expire();
  assert.equal(h.classes.has('is-video-fallback'), true);
  const count = h.sent.length;
  h.click(); h.click(); h.click();
  assert.equal(h.sent.length, count + 2); // One setMuted plus one play.
});

test('pause and ended restore play action on a loaded iframe', () => {
  for (const event of ['pause', 'ended']) {
    const h = harness(); h.near(); h.message({ event: 'ready' }); h.message({ event: 'play' });
    h.message({ event });
    assert.equal(h.classes.has('is-playing'), false);
    assert.equal(h.classes.has('is-video-ready'), false);
    h.click();
    assert.equal(h.sent.at(-1).method, 'play');
  }
});

test('only exact Vimeo origin AND this iframe may change playback state', () => {
  const h = harness(); h.near();
  for (const patch of [{ origin: 'https://player.vimeo.com.attacker.test' }, { origin: 'http://player.vimeo.com' }, { source: {} }, { origin: 'https://vimeo.com' }]) {
    h.message({ event: 'play' }, patch);
    assert.equal(h.classes.has('is-playing'), false);
  }
  h.message('{invalid'); h.message(null);
  assert.equal(h.classes.has('is-playing'), false);
});

test('transport subscribes to actual events and never uses a wildcard target origin', () => {
  const h = harness(); h.near(); h.load(); h.message({ method: 'ping', value: true });
  assert.ok(h.sent.some(message => message.method === 'addEventListener' && message.value === 'timeupdate'));
  assert.ok(h.sent.every(message => message.origin === 'https://player.vimeo.com'));
});

test('reduced-motion visitors only load video after an explicit tap', () => {
  const h = harness({ reducedMotion: true });
  assert.equal(h.intersection(), undefined);
  assert.equal(h.iframe.attrs.src, undefined);
  h.click();
  assert.match(h.iframe.attrs.src, /video\/1176337844/);
});

test('fallback scroll stays lazy and initializes only once', () => {
  const h = harness({ observer: false });
  assert.equal(h.iframe.attrs.src, undefined);
  h.scroll(1000);
  assert.ok(h.iframe.attrs.src);
  h.rerun();
  assert.equal(h.attrs['data-ww-video-bound'], '1');
  assert.equal(h.timers.size, 1);
});

test('invalid or non-Vimeo iframe target is never loaded', () => {
  for (const url of ['https://attacker.test/video/1176337844', 'https://player.vimeo.com.evil.test/video/1', 'javascript:alert(1)', 'https://player.vimeo.com/untrusted']) {
    const h = harness(); h.iframe.attrs['data-src'] = url; h.click();
    assert.equal(h.iframe.attrs.src, undefined);
    assert.equal(h.sent.length, 0);
  }
});
