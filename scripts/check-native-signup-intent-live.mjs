import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Live negative checks only: each request must fail before provider identity
// verification, OAuth-attempt creation, or member access. No real identity,
// accepted terms, authorization codes, account changes, or email sends.
const app = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const backend = app.match(/const APP_BACKEND_URL = '([^']+)'/)[1];
const publicKey = app.match(/const APP_BACKEND_PUBLISHABLE_KEY =\s*'([^']+)'/)[1];
const headers = {
  Authorization: `Bearer ${publicKey}`,
  apikey: publicKey,
  'Content-Type': 'application/json',
};
const appleCases = [
  ['invalid role', '{"signup_role":"admin"}', /Invalid signup account type/],
  ['duplicate role', '{"signup_role":"vendor","signup_role":"couple"}', /Duplicate signup account details/],
  ['conflicting plan', '{"signup_role":"vendor","subscription_id":"18"}', /Signup account details do not match/],
  ['ordinary login without token', '{}', /Missing Apple identity token/],
];
const googleCases = [
  ['invalid role', 'signup_role=admin', /Invalid signup account type/],
  ['duplicate role', 'signup_role=vendor&signup_role=couple', /Duplicate signup account details/],
  ['conflicting plan', 'signup_role=vendor&subscription_id=18', /Signup account details do not match/],
  ['ordinary login without PKCE', '', /valid native PKCE code challenge/],
  ['signup without PKCE', 'signup_role=vendor&subscription_id=17', /valid native PKCE code challenge/],
];

for (const [name, body, expected] of appleCases) {
  const response = await fetch(`${backend}/functions/v1/apple-native-login`, {
    method: 'POST', headers, body, redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 400, `Apple: ${name}`);
  const data = await response.json();
  assert.match(data.error, expected, `Apple: ${name}`);
  assert(!data.user && !data.native_session && !response.headers.get('location'));
  console.log(`PASS Apple: ${name}`);
}

for (const [name, query, expected] of googleCases) {
  const url = new URL(`${backend}/functions/v1/google-oauth-start?${query}`);
  url.searchParams.set('redirect_to', 'weddingwin://bd-login');
  const response = await fetch(url, {
    redirect: 'manual', signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 400, `Google: ${name}`);
  const data = await response.json();
  assert.match(data.error, expected, `Google: ${name}`);
  // The edge/CDN may set its own bot-management cookie even on a 400. Only
  // an application OAuth-binding cookie would indicate a started login flow.
  assert(!response.headers.get('location'));
  const cookieNames = response.headers.getSetCookie().map(value => value.split('=')[0]);
  assert(cookieNames.every(name => name === '__cf_bm'), 'Unexpected application cookie on rejected signup');
  console.log(`PASS Google: ${name}`);
}
console.log('9 live rejection checks passed; no provider flow or member mutation requested.');
