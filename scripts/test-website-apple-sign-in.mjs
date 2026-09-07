import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = name => readFileSync(new URL('../brilliant-directories/pages/apple-sign-in.' + name, import.meta.url), 'utf8');
const html = page('html');
const js = page('js').replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const policy = readFileSync(new URL('../supabase/functions/_shared/policy_consent.ts', import.meta.url), 'utf8');

function setup(search = '') {
  const handlers = {};
  const button = { disabled: true };
  const status = { textContent: '' };
  const error = { hidden: true, textContent: '' };
  const intro = { textContent: 'Sign in or create your WeddingWin account.' };
  const form = {
    valid: false, reported: 0,
    elements: { redirect_to: { value: 'https://www.weddingwin.ca/account/home' }, signup_role: { disabled: true, value: '' } },
    checkValidity() { return this.valid; },
    reportValidity() { this.reported++; },
    querySelector: selector => selector.startsWith('button') ? button : status,
    addEventListener: (name, fn) => { handlers[name] = fn; },
  };
  const context = {
    URL, URLSearchParams,
    document: { getElementById: id => id === 'ww-apple-signin-form' ? form : id === 'ww-apple-signin-intro' ? intro : error },
    window: { location: { search }, addEventListener: (name, fn) => { handlers[name] = fn; } },
  };
  vm.runInNewContext(js, context);
  return { form, button, status, error, intro, handlers };
}

test('one unchecked required agreement posts only to the official Apple start endpoint', () => {
  assert.equal((html.match(/type="checkbox"/g) || []).length, 1);
  assert.match(html, /name="policy_accepted" value="1" required/);
  assert.doesNotMatch(html, /\schecked(?:\s|=|>)/);
  assert.match(html, /method="post" action="https:\/\/pszcjoyabwvzsxxjtkhs\.supabase\.co\/functions\/v1\/apple-oauth-start"/);
  assert.match(html, /href="\/about\/terms"/);
  assert.match(html, /href="\/about\/privacy"/);
});

test('page versions match the server policies and do not invent an acceptance timestamp', () => {
  for (const kind of ['TERMS', 'PRIVACY']) {
    const version = policy.match(new RegExp('CURRENT_' + kind + '_VERSION = "([^"]+)"'))[1];
    assert.ok(html.includes('name="' + kind.toLowerCase() + '_version" value="' + version + '"'));
  }
  assert.doesNotMatch(html + js, /acceptedAt|accepted_at|Date\.now/);
});

test('unchecked form cannot proceed', () => {
  const ui = setup();
  let prevented = 0;
  ui.handlers.submit({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(ui.form.reported, 1);
  assert.equal(ui.button.disabled, false);
});

test('rapid submissions proceed only once and back navigation restores the button', () => {
  const ui = setup();
  ui.form.valid = true;
  let prevented = 0;
  for (let i = 0; i < 20; i++) ui.handlers.submit({ preventDefault() { prevented++; } });
  assert.equal(prevented, 19);
  assert.equal(ui.button.disabled, true);
  assert.equal(ui.status.textContent, 'Opening Apple sign-in…');
  ui.handlers.pageshow();
  assert.equal(ui.button.disabled, false);
  assert.equal(ui.status.textContent, '');
  ui.handlers.submit({ preventDefault() { prevented++; } });
  assert.equal(prevented, 19);
});

test('allows site redirects, never off-site or credential-bearing redirects', () => {
  const allowed = 'https://www.weddingwin.ca/account/home?section=profile';
  assert.equal(setup('?redirect_to=' + encodeURIComponent(allowed)).form.elements.redirect_to.value, allowed);
  for (const url of ['https://evil.invalid', 'javascript:alert(1)', 'https://weddingwin.ca.evil.invalid/', 'https://user:pass@weddingwin.ca/', 'https://weddingwin.ca:444/', 'weddingwin://bd-login']) {
    assert.equal(setup('?redirect_to=' + encodeURIComponent(url)).form.elements.redirect_to.value, 'https://www.weddingwin.ca/account/home');
  }
});

test('displays only fixed friendly errors and never reflects arbitrary messages', () => {
  const ui = setup('?error=agreement_required');
  assert.equal(ui.error.hidden, false);
  assert.match(ui.error.textContent, /Please agree/);
  const unknown = setup('?error=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
  assert.equal(unknown.error.hidden, true);
  assert.equal(unknown.error.textContent, '');
  for (const key of ['constructor', '__proto__', 'toString']) {
    assert.equal(setup('?error=' + key).error.hidden, true);
  }
});

test('does not redirect or auto-submit when the page loads', () => {
  assert.doesNotMatch(js, /location\.(?:replace|assign)|form\.submit\(|requestSubmit\(/);
  assert.match(page('css'), /@media\(max-width:480px\)/);
});

test('carries explicit signup type into POST and explains the selected account', () => {
  for (const role of ['vendor', 'vendor_basic', 'vendor_show', 'vendor_venue', 'vendor_multi', 'vendor_venue_multi', 'couple']) {
    const ui = setup('?signup_role=' + role);
    assert.equal(ui.form.elements.signup_role.value, role);
    assert.equal(ui.form.elements.signup_role.disabled, false);
    assert.match(ui.intro.textContent, new RegExp((role === 'couple' ? 'couple' : role.includes('venue') ? 'venue' : 'vendor') + ' account'));
  }
  assert.equal(setup().form.elements.signup_role.disabled, true);
  assert.match(html, /name="signup_role" value="" disabled/);
  assert.match(html, /type="submit" disabled>Continue with Apple/);
  assert.match(html, /<noscript>/);
  assert.equal(setup('?signup_role=vendor').button.disabled, false);
});

test('unknown or duplicate signup roles fail closed, including after browser back', () => {
  for (const search of ['?signup_role=admin', '?signup_role=', '?signup_role=vendor&signup_role=couple', '?signup_role=vendor&signup_role=vendor']) {
    const ui = setup(search);
    assert.equal(ui.form.elements.signup_role.disabled, true);
    assert.equal(ui.button.disabled, true);
    assert.match(ui.error.textContent, /choose your account type again/);
    ui.form.valid = true;
    let prevented = 0;
    ui.handlers.submit({ preventDefault() { prevented++; } });
    assert.equal(prevented, 1);
    ui.handlers.pageshow();
    assert.equal(ui.button.disabled, true);
  }
});

test('existing membership mismatch offers normal login without a repeat signup loop', () => {
  const ui = setup('?signup_role=vendor&error=account_type_mismatch');
  assert.equal(ui.form.elements.signup_role.value, 'vendor');
  assert.match(ui.error.textContent, /existing account/);
  assert.equal(ui.button.disabled, true);
  ui.handlers.pageshow();
  assert.equal(ui.button.disabled, true);
  assert.match(html, /href="\/login">Back to other sign-in options/);
});
