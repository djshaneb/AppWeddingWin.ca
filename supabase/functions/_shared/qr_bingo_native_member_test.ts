import { loadFreshQrBingoMember, QrBingoMemberProofError } from "./qr_bingo_native_member.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const secret = "offline-only-member-proof-secret-0123456789";
const now = 2_000_000_000_000;
const member = {
  user_id: "42", active: "2", subscription_id: "18", first_name: "Alex", last_name: "Taylor",
  email: "current@example.invalid", phone_number: "5551234567", phone: "", wedding_date: "2027-09-12",
};
function reply(params: URLSearchParams) {
  return { ok: true, purpose: "qr_bingo_member_v1", version: 1, user_id: params.get("user_id"),
    expires: params.get("expires"), nonce: params.get("nonce"), member: { ...member },
    verification: { email_confirmation_required: false, pending_email: null, email_verification_status: "none" } };
}
function deps(change: (value: any) => unknown = (value) => value) {
  return { secret, baseUrl: "https://www.weddingwin.ca", now: () => now,
    fetch: (async (_url, init) => Response.json(change(reply(new URLSearchParams(String(init?.body)))))) as typeof fetch };
}
async function rejects(run: () => Promise<unknown>) {
  try { await run(); } catch (error) {
    assert(error instanceof QrBingoMemberProofError);
    assert(error.status === 503 && error.code === "member_lookup_unavailable");
    assert(!error.message.includes(secret) && !error.message.includes(member.email));
    return;
  }
  throw new Error("Expected unavailable proof");
}

Deno.test("native QR proof is exact-user, purpose/nonce bound, uncached and short-lived", async () => {
  const nonces = new Set<string>();
  let calls = 0;
  const options = { ...deps(), fetch: (async (url, init) => {
    calls++;
    assert(String(url) === "https://www.weddingwin.ca/verify-email-change-app");
    assert(init?.method === "POST" && init.redirect === "error" && init.cache === "no-store");
    const params = new URLSearchParams(String(init.body));
    assert(params.get("ww_email_change_action") === "qr_bingo_member_v1");
    assert(params.get("user_id") === "42" && params.get("expires") === "2000000045");
    const nonce = params.get("nonce")!;
    assert(/^[a-f0-9]{32}$/.test(nonce) && !nonces.has(nonce)); nonces.add(nonce);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`qr_bingo_member_v1|42|2000000045|${nonce}`));
    const expected = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    assert(params.get("signature") === expected);
    return Response.json(reply(params));
  }) as typeof fetch };
  for (let i = 0; i < 300; i++) {
    const result = await loadFreshQrBingoMember("42", options);
    assert(JSON.stringify(result) === JSON.stringify(member));
  }
  assert(calls === 300 && nonces.size === 300);
});

for (const [label, change] of Object.entries({
  "wrong envelope user": (x: any) => ({ ...x, user_id: "43" }),
  "wrong member user": (x: any) => ({ ...x, member: { ...x.member, user_id: "43" } }),
  "numeric member ID": (x: any) => ({ ...x, member: { ...x.member, user_id: 42 } }),
  "inactive current member": (x: any) => ({ ...x, member: { ...x.member, active: "0" } }),
  "pending couple member": (x: any) => ({ ...x, member: { ...x.member, active: "1" } }),
  "missing current member": (x: any) => ({ ...x, member: null }),
  "malformed current role": (x: any) => ({ ...x, member: { ...x.member, subscription_id: "18x" } }),
  "zero current role": (x: any) => ({ ...x, member: { ...x.member, subscription_id: "0" } }),
  "unsafe current role": (x: any) => ({ ...x, member: { ...x.member, subscription_id: "9007199254740992" } }),
  "invalid canonical email": (x: any) => ({ ...x, member: { ...x.member, email: "invalid" } }),
  "noncanonical email": (x: any) => ({ ...x, member: { ...x.member, email: " Current@example.invalid " } }),
  "oversized member field": (x: any) => ({ ...x, member: { ...x.member, first_name: "é".repeat(251) } }),
  "null member field": (x: any) => ({ ...x, member: { ...x.member, first_name: null } }),
  "embedded NUL": (x: any) => ({ ...x, member: { ...x.member, phone: "123\u0000" } }),
  "extra private field": (x: any) => ({ ...x, member: { ...x.member, token: "must-not-be-accepted" } }),
  "old purpose": (x: any) => ({ ...x, purpose: "status_app" }),
  "wrong version": (x: any) => ({ ...x, version: 2 }),
  "old nonce": (x: any) => ({ ...x, nonce: "0".repeat(32) }),
  "different expiry": (x: any) => ({ ...x, expires: "2000000044" }),
  "numeric expiry": (x: any) => ({ ...x, expires: 2000000045 }),
  "missing envelope field": (x: any) => { delete x.nonce; return x; },
  "malformed verification": (x: any) => ({ ...x, verification: null }),
  "inconsistent verification": (x: any) => ({ ...x, verification: { ...x.verification, email_confirmation_required: true } }),
  "pending without address": (x: any) => ({ ...x, verification: { email_confirmation_required: true, pending_email: null, email_verification_status: "pending" } }),
  "pending invalid address": (x: any) => ({ ...x, verification: { email_confirmation_required: true, pending_email: "invalid", email_verification_status: "pending" } }),
  "unexpected pending address": (x: any) => ({ ...x, verification: { ...x.verification, pending_email: "next@example.invalid" } }),
  "unknown verification status": (x: any) => ({ ...x, verification: { ...x.verification, email_verification_status: "verified" } }),
})) {
  Deno.test(`native QR proof fails closed: ${label}`, () => rejects(() => loadFreshQrBingoMember("42", deps(change))));
}

Deno.test("valid pending login email remains separate from canonical member and event contact gates", async () => {
  for (const status of ["pending", "expired"]) {
    const got = await loadFreshQrBingoMember("42", deps((x: any) => ({ ...x,
      verification: { email_confirmation_required: true, pending_email: "next@example.invalid", email_verification_status: status } })));
    assert(got.email === member.email && !("pending_email" in got));
  }
  const expired = await loadFreshQrBingoMember("42", deps((x: any) => ({ ...x,
    verification: { email_confirmation_required: true, pending_email: null, email_verification_status: "expired" } })));
  assert(expired.email === member.email);
});

Deno.test("fresh role is retained for vendor tag checks and both couple plans", async () => {
  for (const plan of ["4", "18", "17"]) {
    const got = await loadFreshQrBingoMember("42", deps((x: any) => ({ ...x, member: { ...x.member, subscription_id: plan } })));
    assert(got.subscription_id === plan);
  }
  const reviewer = await loadFreshQrBingoMember("42", deps((x: any) => ({ ...x,
    member: { ...x.member, active: "1", subscription_id: "17" } })));
  assert(reviewer.active === "1" && reviewer.subscription_id === "17");
  await rejects(() => loadFreshQrBingoMember("42", deps((x: any) => ({ ...x,
    member: { ...x.member, active: "0", subscription_id: "17" } }))));
});

Deno.test("proof transport/HTTP/JSON failures never fall back or leak provider data", async () => {
  for (const fetcher of [
    async () => { throw new Error(secret + member.email); },
    async () => new Response(secret, { status: 429 }),
    async () => new Response("not-json", { status: 200 }),
    async () => Response.json({ ok: false, error: secret }),
  ]) await rejects(() => loadFreshQrBingoMember("42", { ...deps(), fetch: fetcher as typeof fetch }));
});

Deno.test("expired returned proof and cached replay cannot authorize another request", async () => {
  let time = now;
  await rejects(() => loadFreshQrBingoMember("42", { ...deps(), now: () => time,
    fetch: (async (_url, init) => { time += 45001; return Response.json(reply(new URLSearchParams(String(init?.body)))); }) as typeof fetch }));
  let cached: unknown;
  const options = { ...deps(), fetch: (async (_url, init) => {
    cached ??= reply(new URLSearchParams(String(init?.body))); return Response.json(cached);
  }) as typeof fetch };
  await loadFreshQrBingoMember("42", options);
  await rejects(() => loadFreshQrBingoMember("42", options));
});

Deno.test("invalid member/configuration never starts transport", async () => {
  let calls = 0;
  const options = { ...deps(), fetch: (() => { calls++; throw new Error(); }) as typeof fetch };
  for (const id of [null, "", "0", "042", "42 ", "4|2", "9007199254740992", {}, []])
    await rejects(() => loadFreshQrBingoMember(id, options));
  for (const patch of [{ secret: "short" }, { baseUrl: "http://www.weddingwin.ca" }, { baseUrl: "https://x:y@www.weddingwin.ca" }])
    await rejects(() => loadFreshQrBingoMember("42", { ...options, ...patch }));
  assert(calls === 0);
});
