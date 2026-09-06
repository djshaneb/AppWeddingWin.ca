import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    var ensureInline = function(v) {');
const end = source.indexOf("    try {\n      Object.defineProperty(navigator, 'webdriver'", start);
assert(start !== -1 && end > start, 'Exercise the real inline-video injection');
const injection = source.slice(start, end);

function video(autoplay = false) {
  return {
    tagName: 'VIDEO', nodeType: 1, autoplay, muted: true, controls: false,
    attributes: new Map(autoplay ? [['autoplay', '']] : []),
    setAttribute(key, value) { this.attributes.set(key, value); },
    removeAttribute(key) { this.attributes.delete(key); },
  };
}

function setup(existing = []) {
  const handlers = new Map();
  let observe;
  vm.runInNewContext(injection, {
    document: {
      documentElement: {},
      querySelectorAll: () => existing,
      addEventListener: (event, handler) => handlers.set(event, handler),
    },
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
    },
  });
  return { loaded: () => handlers.get('DOMContentLoaded')(), added: node => observe([{ addedNodes: [node] }]) };
}

test('existing muted autoplay previews keep their playback intent and play inline', () => {
  const preview = video(true);
  setup([preview]).loaded();
  assert.equal(preview.autoplay, true);
  assert(preview.attributes.has('autoplay'));
  assert(preview.attributes.has('playsinline'));
  assert(preview.attributes.has('webkit-playsinline'));
  assert.equal(preview.muted, true);
});

test('ordinary click-to-play videos are not forced to autoplay or muted', () => {
  const regular = video();
  regular.muted = false;
  regular.controls = true;
  setup([regular]).loaded();
  assert.equal(regular.autoplay, false);
  assert(!regular.attributes.has('autoplay'));
  assert.equal(regular.muted, false);
  assert.equal(regular.controls, true);
});

test('lazy-added videos and nested players receive inline support without losing autoplay', () => {
  const events = setup();
  const lazy = video(true);
  events.added(lazy);
  assert(lazy.attributes.has('playsinline'));
  assert.equal(lazy.autoplay, true);
  const nested = video(true);
  events.added({ nodeType: 1, tagName: 'DIV', querySelectorAll: () => [nested] });
  assert(nested.attributes.has('webkit-playsinline'));
  assert.equal(nested.autoplay, true);
});

test('async embedded players and Android fullscreen are explicitly enabled', () => {
  assert.match(source, /mediaPlaybackRequiresUserAction=\{false\}/);
  assert.match(source, /\sallowsInlineMediaPlayback\s/);
  assert.match(source, /\sallowsFullscreenVideo\s/);
});

test('playback fix retains privacy, capture restrictions, and navigation checks', () => {
  assert.match(source, /thirdPartyCookiesEnabled=\{false\}/);
  assert.match(source, /sharedCookiesEnabled=\{false\}/);
  assert.match(source, /mediaCapturePermissionGrantType="deny"/);
  assert(source.includes('webViewSubframeUrlAllowed(url)'));
  assert(source.includes('webViewUrlAction(url)'));
  assert(source.includes('webViewUrlAction(target)'));
});
