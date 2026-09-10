import {
  isApplePrivateRelayEmail,
  loadMemberEmailVerification,
  MemberEmailVerificationUnavailableError,
  requireConfirmedAuthEmailChange,
} from "./member_email_verification.ts";
import { createConfirmedProfileEmailHandler } from "./confirmed_profile_email_handler.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

const secret = "fixture-only-secret-for-email-status-0123456789";
const currentEmail = "contact@example.invalid";
const response = (values: Record<string, unknown> = {}) => ({
  ok: true, user_id: "42", current_email: currentEmail, pending_email: null,
  email_confirmation_required: false, email_verification_status: "none", ...values,
});
const options = (values: Record<string, unknown> = {}) => ({
  secret, baseUrl: "https://www.weddingwin.ca", now: () => 2_000_000_000_000,
  fetch: (() => Promise.resolve(Response.json(response(values)))) as typeof fetch,
});

async function rejects(operation: () => Promise<unknown>) {
  try { await operation(); } catch (error) {
    assert(error instanceof MemberEmailVerificationUnavailableError);
    assert(!error.message.includes(secret) && !error.message.includes(currentEmail));
    return;
  }
  throw new Error("Expected fail-closed verification error");
}

Deno.test("member email status signs a purpose-bound exact member request with short expiry", async () => {
  let called = false;
  const state = await loadMemberEmailVerification("42", currentEmail, {
    ...options(),
    fetch: (async (url, init) => {
      called = true;
      assert(String(url) === "https://www.weddingwin.ca/verify-email-change-app");
      assert(init?.method === "POST" && init.redirect === "error");
      const params = new URLSearchParams(String(init.body));
      assert(params.get("ww_email_change_action") === "status_app");
      assert(params.get("user_id") === "42" && params.get("expires") === "2000000300");
      assert(params.get("new_email") === null);
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const bytes = await crypto.subtle.sign("HMAC", key,
        new TextEncoder().encode("status_app|42|2000000300"));
      const expected = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
      assert(params.get("signature") === expected);
      return Response.json(response());
    }) as typeof fetch,
  });
  assert(called && !state.email_confirmation_required && state.pending_email === null);
});

Deno.test("member email pending and expired proof both block access", async () => {
  for (const status of ["pending", "expired"]) {
    const state = await loadMemberEmailVerification("42", currentEmail, options({
      pending_email: " Next@Example.invalid ", email_confirmation_required: true,
      email_verification_status: status,
    }));
    assert(state.email_confirmation_required && state.pending_email === "next@example.invalid");
    assert(state.email_verification_status === status);
  }
});

Deno.test("member email confirmed and legacy none require no pending email", async () => {
  for (const status of ["confirmed", "none"]) {
    const state = await loadMemberEmailVerification("42", " CONTACT@example.invalid ",
      options({ email_verification_status: status }));
    assert(!state.email_confirmation_required && state.pending_email === null);
  }
});

Deno.test("confirmed contact email is usable immediately without waiting for a status cache", async () => {
  let confirmed = false;
  const nextEmail = "new-contact@example.invalid";
  const freshMember = () => ({ user_id: "42", email: confirmed ? nextEmail : currentEmail });
  const dependencies = { ...options(), fetch: (async () => Response.json(response(confirmed
    ? { current_email: nextEmail, email_verification_status: "confirmed" }
    : { pending_email: nextEmail, email_confirmation_required: true, email_verification_status: "pending" }
  ))) as typeof fetch };
  const before = freshMember();
  assert((await loadMemberEmailVerification(before.user_id, before.email, dependencies)).email_confirmation_required);
  confirmed = true;
  const after = freshMember();
  const state = await loadMemberEmailVerification(after.user_id, after.email, dependencies);
  assert(!state.email_confirmation_required && state.email_verification_status === "confirmed");
  // A stale email is still rejected rather than being mistaken for the
  // current contact identity. Routes must pass their fresh member read.
  await rejects(() => loadMemberEmailVerification(before.user_id, before.email, dependencies));
});

Deno.test("member email proof rejects wrong owner and stale authoritative address", async () => {
  for (const change of [{ user_id: "43" }, { current_email: "other@example.invalid" },
    { user_id: "042" }, { ok: false }, { current_email: null }]) {
    await rejects(() => loadMemberEmailVerification("42", currentEmail, options(change)));
  }
});

Deno.test("member email proof rejects inconsistent flags and malformed pending data", async () => {
  for (const change of [
    { email_confirmation_required: "false" },
    { email_verification_status: "unknown" },
    { email_verification_status: "pending", email_confirmation_required: false },
    { email_verification_status: "expired", email_confirmation_required: true, pending_email: undefined },
    { pending_email: "next@example.invalid" },
    { email_verification_status: "pending", email_confirmation_required: true, pending_email: "invalid" },
  ]) await rejects(() => loadMemberEmailVerification("42", currentEmail, options(change)));
});

Deno.test("expired durable proof requirement remains blocked even if pending address is unavailable", async () => {
  const state = await loadMemberEmailVerification("42", currentEmail, options({
    email_verification_status: "expired", email_confirmation_required: true, pending_email: null,
  }));
  assert(state.email_confirmation_required && state.pending_email === null);
  // Only the authoritative expired/missing-address recovery case may omit
  // the address. A live pending request without its address is malformed.
  await rejects(() => loadMemberEmailVerification("42", currentEmail, options({
    email_verification_status: "pending", email_confirmation_required: true, pending_email: null,
  })));
});

Deno.test("changed Auth email needs confirmed proof while matching legacy emails remain unchanged", async () => {
  const legacy = { email_confirmation_required: false, pending_email: null, email_verification_status: "none" as const };
  requireConfirmedAuthEmailChange({ previousAuthEmail: currentEmail, nextEmail: currentEmail }, legacy);
  const change = { previousAuthEmail: "old@example.invalid", nextEmail: currentEmail };
  await rejects(async () => requireConfirmedAuthEmailChange(change, legacy));
  requireConfirmedAuthEmailChange(change, { ...legacy, email_verification_status: "confirmed" });
  await rejects(async () => requireConfirmedAuthEmailChange(change,
    { ...legacy, email_confirmation_required: true, email_verification_status: "pending" }));
});

async function callbackBody(userId = "42", expires = 2_000_000_300, purpose = "sync_verified_email") {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}|${userId}|${expires}`));
  return { user_id: userId, expires,
    signature: Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("") };
}

Deno.test("confirmed-email callback accepts only purpose-bound short-lived exact member proof", async () => {
  const synced: string[] = [];
  const handler = createConfirmedProfileEmailHandler({ secret: () => secret,
    now: () => 2_000_000_000_000, sync: async (id) => { synced.push(id); } });
  const request = (body: unknown, method = "POST") => new Request("https://example.invalid/sync", {
    method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
  const success = await handler(request(await callbackBody()));
  assert(success.status === 200 && JSON.stringify(await success.json()) === '{"ok":true}');
  assert(synced.join() === "42");
  for (const body of [await callbackBody("42", 2_000_000_000),
    await callbackBody("42", 2_000_000_301), await callbackBody("042"),
    await callbackBody("42", 2_000_000_300, "status_app"),
    { ...await callbackBody(), user_id: "43" },
    { ...await callbackBody(), expires: "2000000300" }, null, []]) {
    assert((await handler(request(body))).status === 401);
  }
  assert((await handler(request(null, "GET"))).status === 405);
  assert(synced.length === 1);
});

Deno.test("confirmed-email callback never leaks secret or sync failure details", async () => {
  const handler = createConfirmedProfileEmailHandler({ secret: () => secret,
    now: () => 2_000_000_000_000, sync: async () => { throw new Error(`${secret}:${currentEmail}`); } });
  const result = await handler(new Request("https://example.invalid/sync", {
    method: "POST", body: JSON.stringify(await callbackBody()),
  }));
  assert(result.status === 503);
  const text = await result.text();
  assert(!text.includes(secret) && !text.includes(currentEmail));
});

Deno.test("website sync requires durable proof and cannot create or relink accounts", async () => {
  const source = await Deno.readTextFile(new URL("./confirmed_profile_email_sync.ts", import.meta.url));
  assert(source.includes('proof.email_verification_status !== "confirmed"'));
  assert(source.indexOf("loadMemberEmailVerification") < source.indexOf("await applyLinkedAuthEmail"));
  assert(source.includes("if (!plan) return"));
  assert(!/createUser|createBdUser|apple_sub\s*[:=]/.test(source));
});

Deno.test("member email proof fails closed on network HTTP and malformed JSON without leaking response", async () => {
  for (const fetcher of [
    async () => { throw new Error(`${secret}: sensitive network detail`); },
    async () => new Response(secret, { status: 500 }),
    async () => new Response(`<html>${secret}</html>`),
    async () => Response.json(null),
    async () => Response.json([]),
  ]) await rejects(() => loadMemberEmailVerification("42", currentEmail,
    { ...options(), fetch: fetcher as typeof fetch }));
});

Deno.test("member email proof rejects invalid member email secret and insecure destination before fetch", async () => {
  let calls = 0;
  const base = { ...options(), fetch: (() => { calls++; throw new Error(); }) as typeof fetch };
  for (const id of ["0", "-1", "42x", "0042", "9007199254740992"]) {
    await rejects(() => loadMemberEmailVerification(id, currentEmail, base));
  }
  for (const email of ["", "not-an-email", "<a@example.invalid>"]) {
    await rejects(() => loadMemberEmailVerification("42", email, base));
  }
  await rejects(() => loadMemberEmailVerification("42", currentEmail, { ...base, secret: "short" }));
  await rejects(() => loadMemberEmailVerification("42", currentEmail, { ...base, baseUrl: "http://www.weddingwin.ca" }));
  assert(calls === 0);
});

Deno.test("relay detection is exact domain and does not affect ordinary email validation", () => {
  assert(isApplePrivateRelayEmail(" Alias@PrivateRelay.AppleID.com "));
  for (const email of [currentEmail, "a@privaterelay.appleid.com.example.invalid", "a@appleid.com"]) {
    assert(!isApplePrivateRelayEmail(email));
  }
});

Deno.test("profile responses include server proof and never replace the email before confirmation", async () => {
  const source = await Deno.readTextFile(new URL("../bd-complete-profile/index.ts", import.meta.url));
  assert((source.match(/await loadMemberEmailVerification\(/g) || []).length === 3);
  assert(source.includes("user: { ...sanitizeBdUser(user, existingEmail), ...emailVerification }"));
  assert(source.includes("emailVerification.pending_email !== nextEmail"));
  const refresh = source.slice(source.indexOf('body.action === "refresh"'), source.indexOf("const profile ="));
  assert(refresh.indexOf("loadMemberEmailVerification") < refresh.indexOf("applyLinkedAuthEmail"));
});

Deno.test("chat routes gate before any mirror access and do not trust session proof flags", async () => {
  for (const path of ["../bd-chat-sync/index.ts", "../bd-chat-status/index.ts"]) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const handler = source.slice(source.indexOf("Deno.serve(async"));
    const gate = handler.indexOf("await loadMemberEmailVerification(user.user_id, user.email)");
    assert(gate > 0 && gate < handler.indexOf("await refreshMirrorIfStale"));
    assert(handler.includes('code: "email_confirmation_required"') && handler.includes("}, 428)"));
    assert(handler.includes('code: "email_verification_unavailable"') && handler.includes("}, 503)"));
    assert(!handler.includes("session.email_confirmation_required"));
  }
});

Deno.test("chat proof and QR contact gates re-read the authenticated member instead of cached session fields", async () => {
  for (const path of ["../bd-chat-sync/index.ts", "../bd-chat-status/index.ts"]) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const handler = source.slice(source.indexOf("Deno.serve(async"));
    const auth = handler.indexOf("await getSessionUser(");
    const fresh = handler.indexOf("await bdFetchUserById(");
    const proof = handler.indexOf("await loadMemberEmailVerification(user.user_id, user.email)");
    assert(auth >= 0 && fresh > auth && proof > fresh);
    assert(!handler.includes("loadMemberEmailVerification(authenticatedUser.user_id, authenticatedUser.email)"));
  }
  for (const path of ["../bd-qr-bingo-sync/index.ts", "../bd-qr-bingo-vendor-sync/index.ts"]) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const fetcher = source.slice(source.indexOf("async function fetchFullBdUserById("), source.indexOf("function appendCookie("));
    assert(fetcher.includes("await callBd(") && fetcher.includes("/api/v2/user/get/"));
    assert(!/cache|cached/i.test(fetcher));
    const handler = source.slice(source.indexOf("Deno.serve(async"));
    const fresh = handler.indexOf("const user = websiteCoupleUser || await fetchFullBdUserById(authenticatedMemberId)");
    const contacts = handler.indexOf("await loadQrContactProfile(requireAdmin(), contactEventKey, authenticatedMemberId, user)");
    assert(fresh >= 0 && contacts > fresh);
    assert(!handler.includes("loadMemberEmailVerification"));
    assert(handler.includes('websitePrincipal?.kind === "couple"\n        ? await fetchFullBdUserById(authenticatedMemberId)'));
  }
});

Deno.test("both QR routes require separate saved direct contacts without changing account-email verification", async () => {
  for (const path of ["../bd-qr-bingo-sync/index.ts", "../bd-qr-bingo-vendor-sync/index.ts"]) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    assert(source.includes("isApplePrivateRelayEmail(email)"));
    assert(source.includes('"contact_profile_get", "contact_profile_save"'));
    assert(!source.includes("loadMemberEmailVerification"));
    assert(!source.includes("email_confirmation_required"));
    const handler = source.slice(source.indexOf("Deno.serve(async"));
    assert(handler.indexOf("loadQrContactProfile") < handler.indexOf('if (action === "scan")'));
    assert(handler.includes('code: "profile_incomplete"') && handler.includes("contact_profile: bingoContactProfile"));
  }
});
