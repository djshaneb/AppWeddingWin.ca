import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Reuse an explicitly supplied, already-installed runtime; never install dependencies.
const root = process.env.QR_PHP_WASM_ROOT;
assert(root, 'Set QR_PHP_WASM_ROOT to the installed @php-wasm directory.');
assert.equal(JSON.parse(readFileSync(`${root}/node/package.json`, 'utf8')).version, '3.1.52');
const { PHP } = await import(pathToFileURL(`${root}/universal/index.js`));
const { loadNodeRuntime } = await import(pathToFileURL(`${root}/node/index.js`));
const runtime = new PHP(await loadNodeRuntime('7.4', { emscriptenOptions: { processId: process.pid } }));
after(() => runtime.exit());
const source = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
const b64 = value => Buffer.from(value).toString('base64');
const canonical = { user_id: '990001', active: '2', subscription_id: '18' };

async function request({ member = canonical, logged = true, origin = 'https://www.weddingwin.ca', cookie = '', setup = '', method = 'POST' } = {}) {
  const code = `<?php
    ini_set('display_errors','0');
    ini_set('session.save_path','/tmp');
    session_name('__Secure-sessionID5');
    session_set_cookie_params(array('secure'=>true,'httponly'=>true,'samesite'=>'Lax','path'=>'/'));
    $testMember=json_decode(base64_decode('${b64(JSON.stringify(member))}'),true);
    $testLogged=${logged ? 'true' : 'false'};
    $w=array('database'=>'offline');
    class user { static function isUserLogged($cookies){global $testLogged;return $testLogged;} }
    function getUser($id,$w){global $testMember;return $testMember;}
    function mysql($database,$sql){throw new Exception('Unexpected database read or write');}
    ${setup}
    ob_start();echo '<style>BD buffered presentation</style>';
    eval('?>'.base64_decode('${b64(source)}'));
  `;
  return runtime.run({ code, relativeUri: '/qr', protocol: 'https', method,
    headers: { Host: 'www.weddingwin.ca', 'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `userid=990001${cookie ? `; ${cookie}` : ''}`, ...(origin == null ? {} : { Origin: origin }) },
    body: new TextEncoder().encode('action=scanner_session'),
  });
}

test('actual PHP bootstrap issues secure session cookie and persists the same member-bound CSRF', async () => {
  const first = await request();
  assert.equal(first.httpStatusCode, 200, first.text);
  const body = first.json;
  assert.deepEqual(Object.keys(body).sort(), ['authenticated_member_id', 'qr_csrf', 'status']);
  assert.equal(body.status, 'success'); assert.equal(body.authenticated_member_id, canonical.user_id);
  assert.match(body.qr_csrf, /^[a-f0-9]{64}$/);
  const setCookie = first.headers['set-cookie'].find(value => value.startsWith('__Secure-sessionID5='));
  assert.match(setCookie, /secure/i); assert.match(setCookie, /HttpOnly/i);
  assert.match(first.headers['cache-control'].join(';'), /no-store/);
  const second = await request({ cookie: setCookie.split(';')[0] });
  assert.equal(second.httpStatusCode, 200, second.text);
  assert.deepEqual(second.json, body);
  assert(!first.text.includes('BD buffered presentation'));
});

test('actual PHP rejects wrong, missing, sibling-domain and deceptive origins before session issuance', async () => {
  for (const origin of [null, 'https://example.invalid', 'https://weddingwin.ca', 'https://www.weddingwin.ca.example.invalid']) {
    const response = await request({ origin });
    assert.equal(response.httpStatusCode, 403, response.text);
    assert.equal(response.json.status, 'error');
    assert(!response.headers['set-cookie']?.length);
  }
});

test('actual PHP unauthenticated or mismatched canonical member cannot bootstrap', async () => {
  for (const options of [{ logged: false }, { member: false }, { member: { ...canonical, user_id: '990002' } }]) {
    const response = await request(options);
    assert.equal(response.httpStatusCode, 401, response.text);
    assert.equal(response.json.status, 'error');
    assert(!response.headers['set-cookie']?.length);
  }
});

test('actual PHP bootstrap refuses inactive and non-couple members', async () => {
  for (const patch of [{ active: '1' }, { active: null }, { subscription_id: '17' }, { subscription_id: null }]) {
    const response = await request({ member: { ...canonical, ...patch } });
    assert.equal(response.httpStatusCode, 403, response.text);
    assert.equal(response.json.status, 'error');
    assert(!response.headers['set-cookie']?.length);
  }
  const legacy = await request({ member: { ...canonical, subscription_id: '4' } });
  assert.equal(legacy.httpStatusCode, 200, legacy.text);
});

test('actual PHP refuses nonpersistent session even when session_id is nonempty', async () => {
  const response = await request({ setup: "session_id('offline-nonpersistent');ini_set('session.save_path','/definitely-unavailable-session-directory');" });
  assert.equal(response.httpStatusCode, 503, response.text);
  assert.equal(response.json.status, 'error');
  assert(!Object.hasOwn(response.json, 'qr_csrf'));
});

test('bootstrap remains before expensive work, and existing scan CSRF remains mandatory', () => {
  const success = source.indexOf('/* WW_QR_SCANNER_SESSION_RESULT_END */');
  assert(success > source.indexOf('$qrWebsiteSessionWritten ='));
  for (const marker of ['$eventConfig = ww_qr_bingo_runtime_config();', '$qrContactProfile = ww_qr_bingo_contact_profile(', "$fixtureProbeResponse = ww_qr_bingo_vendor_draw_request("]) {
    assert(success < source.indexOf(marker), marker);
  }
  assert.match(source, /!hash_equals\(\$qrWebsiteCsrf, \$_POST\['qr_csrf'\]\)/);
  for (const marker of ['WW_QR_SCANNER_SESSION_BOOTSTRAP', 'WW_QR_SCANNER_SESSION_RESULT']) {
    const section = source.slice(source.indexOf(`/* ${marker}_START */`), source.indexOf(`/* ${marker}_END */`));
    assert(!section.includes('\\'), 'BD source stripping must not alter the new bootstrap');
  }
});
