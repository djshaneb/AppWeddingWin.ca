import { retryGoogleCallbackCookieOnce } from "./google_callback_cookie_recovery.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const backendUrl = "https://offline-google-recovery.example.invalid";
const parameter = "ww_callback_cookie_check";
const signingSecret = "offline-callback-continuation-test-secret";
const cookie = `__Host-ww_google_oauth=${"A".repeat(43)}`;
const options = () => ({
  backendUrl, signingSecret, stateExpiresAt: Math.floor(Date.now() / 1000) + 600,
});
const request = (url: URL | string, binding = "") => new Request(url, {
  headers: { Cookie: binding, Host: "untrusted.example.invalid", "X-Forwarded-Host": "untrusted.example.invalid" },
});
const firstUrl = `${backendUrl}/functions/v1/google-oauth-callback?code=PRIVATE-code&state=PRIVATE-verified-state`;
function decode(marker: string) {
  return JSON.parse(atob(marker.replaceAll("-", "+").replaceAll("_", "/")));
}
function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function rejected(input: Request, settings = options()) {
  let error = "";
  try { await retryGoogleCallbackCookieOnce(input, settings); }
  catch (value) { error = value instanceof Error ? value.message : String(value); }
  assert(error === "Invalid Google sign-in state continuation.", "Continuation did not fail closed with a fixed message");
}

Deno.test("Google callback continuation uses only the trusted HTTPS endpoint and carries no binding secret", async () => {
  const input = request("https://untrusted.example.invalid/attacker/path?code=PRIVATE-code&state=PRIVATE-verified-state");
  const response = await retryGoogleCallbackCookieOnce(input, options());
  assert(response?.status === 302, "Missing binding did not produce a continuation");
  const target = new URL(response.headers.get("Location")!);
  assert(target.origin === backendUrl && target.pathname === "/functions/v1/google-oauth-callback", "Request host/path controlled the continuation");
  assert(target.searchParams.get("code") === "PRIVATE-code" && target.searchParams.get("state") === "PRIVATE-verified-state", "Provider response changed");
  assert(!response.headers.has("Set-Cookie") && response.headers.get("Cache-Control") === "no-store" && response.headers.get("Referrer-Policy") === "no-referrer", "Continuation stored or leaked its response");
  const marker = decode(target.searchParams.get(parameter)!);
  assert(marker.purpose === "google-callback-cookie-confirmation" && /^[A-Za-z0-9_-]{43}$/.test(marker.q) && /^[A-Za-z0-9_-]{43}$/.test(marker.h), "Marker lacks purpose or signed query binding");
  assert(Object.keys(marker).sort().join(",") === "exp,h,purpose,q" && !JSON.stringify(marker).includes("PRIVATE"), "Marker exposes OAuth inputs or a binding secret");
  assert(await retryGoogleCallbackCookieOnce(request(target), options()) === null, "A valid continuation retried despite a still-missing cookie");
  assert(await retryGoogleCallbackCookieOnce(request(target, cookie), options()) === null, "Original binding was blocked before independent redemption");
});

Deno.test("Google callback with an existing valid binding has no added redirect", async () => {
  assert(await retryGoogleCallbackCookieOnce(request(firstUrl, cookie), options()) === null, "Valid binding took a new path");
});

Deno.test("Google callback continuation expires in at most 60 seconds and never outlives signed state", async () => {
  const originalNow = Date.now;
  let now = 2_000_000_000_000;
  Date.now = () => now;
  try {
    const settings = options();
    const response = await retryGoogleCallbackCookieOnce(request(firstUrl), settings);
    const target = new URL(response!.headers.get("Location")!);
    assert(decode(target.searchParams.get(parameter)!).exp === now / 1000 + 60, "Continuation TTL changed");
    now += 60_000;
    await rejected(request(target, cookie), settings);
    now -= 60_000;
    const shortSettings = { ...settings, stateExpiresAt: now / 1000 + 5 };
    const short = await retryGoogleCallbackCookieOnce(request(firstUrl), shortSettings);
    assert(decode(new URL(short!.headers.get("Location")!).searchParams.get(parameter)!).exp === shortSettings.stateExpiresAt, "Continuation outlived signed state");
    await rejected(request(firstUrl), { ...settings, stateExpiresAt: now / 1000 });
  } finally { Date.now = originalNow; }
});

Deno.test("Google callback continuation rejects malformed duplicate forged and modified markers even with a cookie", async () => {
  const response = await retryGoogleCallbackCookieOnce(request(firstUrl), options());
  const original = new URL(response!.headers.get("Location")!);
  const marker = original.searchParams.get(parameter)!;
  for (const replacement of ["", "!", "A".repeat(1025), encode(null), encode({}), encode({ ...decode(marker), purpose: "google-cookie-confirmation" }), encode({ ...decode(marker), exp: Math.floor(Date.now() / 1000) + 601 }), encode({ ...decode(marker), h: "A".repeat(43) })]) {
    const target = new URL(original);
    target.searchParams.set(parameter, replacement);
    await rejected(request(target, cookie));
  }
  const duplicate = new URL(original);
  duplicate.searchParams.append(parameter, marker);
  await rejected(request(duplicate, cookie));
  for (const key of ["code", "state", "error"]) {
    const changed = new URL(original);
    changed.searchParams.set(key, "PRIVATE-changed");
    await rejected(request(changed, cookie));
  }
  await rejected(request(original, cookie), { ...options(), signingSecret: "different-test-secret" });
});

Deno.test("Google callback continuation refuses unsafe configured destinations without issuing a cookie", async () => {
  for (const backend of ["http://insecure.example.invalid", "https://user:password@invalid.example.invalid"]) {
    await rejected(request(firstUrl), { ...options(), backendUrl: backend });
  }
});
