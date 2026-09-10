// Isolated local Chromium regression. No user browser/profile, site, email or account.
// Argument: absolute path to an installed playwright-core package (no browser download).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const packagePath = process.argv[2];
assert.ok(packagePath?.startsWith('/'), 'Pass an installed playwright-core package path');
const { chromium } = await import(pathToFileURL(resolve(packagePath, 'index.mjs')));
const controller = readFileSync(new URL('../brilliant-directories/widgets/email-verification-page.php', import.meta.url), 'utf8');
const head = readFileSync(new URL('../brilliant-directories/pages/email-verification-head.html', import.meta.url), 'utf8');
const deployedPolicy = controller.match(/@header\('Referrer-Policy: ([a-z-]+)'\)/)?.[1];
assert.equal(deployedPolicy, 'strict-origin');
assert.ok(head.includes(`content="${deployedPolicy}"`));
const requests = [];
const server = createServer((request, response) => {
  if (request.method === 'POST') {
    let body = ''; request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push({ origin: request.headers.origin, referer: request.headers.referer, body });
      response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('Offline form received');
    }); return;
  }
  const policy = new URL(request.url, 'http://localhost').searchParams.get('policy');
  if (!['no-referrer', deployedPolicy].includes(policy)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html', 'Referrer-Policy': policy, 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><html><head><meta name="referrer" content="${policy}"></head><body><form method="post" action="/confirm"><input name="token" type="hidden" value="offline-proof-token"><button>Confirm Email</button></form></body></html>`);
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  for (const policy of ['no-referrer', deployedPolicy]) {
    await page.goto(`${origin}/verify-email-change-app?policy=${policy}&token=offline-proof-token`);
    await Promise.all([page.waitForURL(`${origin}/confirm`), page.getByRole('button', { name: 'Confirm Email' }).click()]);
  }
  assert.equal(requests.length, 2);
  assert.equal(requests[0].origin, 'null', 'reproduce rejected old HTML form Origin');
  assert.equal(requests[0].referer, undefined);
  assert.equal(requests[1].origin, origin, 'fixed HTML form preserves same-origin Origin');
  assert.equal(requests[1].referer, `${origin}/`, 'only origin in referrer; no path or token');
  for (const request of requests) assert.equal(new URLSearchParams(request.body).get('token'), 'offline-proof-token', 'proof token still submitted explicitly');
  console.log('PASS: real Chromium reproduces null Origin with no-referrer; strict-origin preserves POST Origin and excludes token/path from referrers. No live requests.');
} finally { await browser?.close(); await new Promise(resolveClose => server.close(resolveClose)); }
