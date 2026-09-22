// Execute the production start handler with an offline database transport.
// This proves the protocol bounds, not Safari's cross-site cookie behavior.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
let activeFetch: typeof fetch;
const backend = "https://offline-google-cookie.example.invalid";
const endpoint = `${backend}/functions/v1/google-oauth-start`;
const params = () => new URLSearchParams({
  redirect_to: "weddingwin://bd-login",
  code_challenge: "A".repeat(43),
  signup_role: "vendor",
  subscription_id: "17",
  accepted_terms: "1",
  accepted_privacy: "1",
  accepted_at: "2026-09-22T00:00:00.000Z",
  terms_version: "fixture-terms",
  privacy_version: "fixture-privacy",
});

async function fixture(run: (f: {
  request: (url?: URL | string, cookie?: string) => Promise<Response>;
  records: { reads: number; attempts: Record<string, unknown>[] };
}) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const originalWarn = console.warn;
  const settings = {
    SUPABASE_URL: backend,
    SUPABASE_SERVICE_ROLE_KEY: "offline-cookie-service-key",
    APP_LOGIN_SECRET: "offline-cookie-confirmation-signing-secret",
  };
  const previous = new Map(Object.keys(settings).map((key) => [key, Deno.env.get(key)]));
  const records = { reads: 0, attempts: [] as Record<string, unknown>[] };
  try {
    Object.entries(settings).forEach(([key, value]) => Deno.env.set(key, value));
    console.warn = () => {};
    activeFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert(url.origin === backend, "Unexpected network origin in offline test");
      if (url.pathname === "/rest/v1/admin_config") {
        records.reads++;
        return Response.json({ key: "google_client_id", value: "offline-google-client" });
      }
      if (url.pathname === "/rest/v1/oauth_login_attempts" && init?.method === "POST") {
        records.attempts.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 201 });
      }
      throw new Error("Unexpected offline database request");
    };
    globalThis.fetch = (input, init) => activeFetch(input, init);
    if (!handler) {
      Deno.serve = ((captured: Handler) => { handler = captured; return {}; }) as typeof Deno.serve;
      await import("../google-oauth-start/index.ts");
    }
    Deno.serve = originalServe;
    await run({
      request: (url = `${endpoint}?${params()}`, cookie) => handler(new Request(url, {
        headers: cookie ? { Cookie: cookie } : {},
      })),
      records,
    });
  } finally {
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    console.warn = originalWarn;
    previous.forEach((value, key) => value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value));
  }
}

function started(response: Response) {
  assert(response.status === 302, "Expected start redirect");
  const location = new URL(response.headers.get("Location")!);
  const setCookie = response.headers.get("Set-Cookie")!;
  assert(setCookie, "Missing browser binding cookie");
  return { location, cookie: setCookie.split(";")[0], setCookie };
}

function decode(value: string): Record<string, unknown> {
  return JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/")));
}

async function stopped(response: Response) {
  assert(response.status === 400, "Unconfirmed browser was allowed to continue");
  assert(!response.headers.has("Location"), "Invalid continuation looped");
  assert(!response.headers.has("Set-Cookie"), "Invalid continuation rotated browser binding");
  assert((await response.text()).includes("close this window"), "Missing recovery instruction");
}

Deno.test("fresh Google start confirms the exact browser cookie before creating one attempt", () => fixture(async ({ request, records }) => {
  const first = started(await request());
  assert(first.location.origin === backend, "Continuation left the configured backend");
  assert(first.location.pathname === "/functions/v1/google-oauth-start", "Unexpected continuation path");
  assert(records.reads === 0 && records.attempts.length === 0, "OAuth work began before cookie confirmation");
  assert(first.setCookie.includes("Secure; HttpOnly; SameSite=None"), "Cookie security attributes changed");
  const marker = first.location.searchParams.get("ww_cookie_check")!;
  assert(marker && !marker.includes(first.cookie.split("=")[1]), "Continuation leaked the raw cookie");
  const decodedMarker = decode(marker);
  assert(!JSON.stringify(decodedMarker).includes(first.cookie.split("=")[1]), "Marker payload leaked the raw cookie");
  assert(decodedMarker.purpose === "google-cookie-confirmation", "Missing domain separation");
  const result = started(await request(first.location, first.cookie));
  assert(result.location.origin === "https://accounts.google.com", "Confirmed request did not reach Google");
  assert(result.cookie === first.cookie, "Confirmed browser binding changed");
  assert(Number(records.attempts.length) === 1, "Expected one confirmed attempt");
  assert(!result.location.searchParams.has("ww_cookie_check"), "Internal continuation marker reached Google");
  const state = decode(result.location.searchParams.get("state")!);
  assert(state.r === "weddingwin://bd-login" && state.p === "A".repeat(43), "Callback or PKCE changed");
  assert(state.g === "vendor" && state.s === "17", "Signup membership changed");
  assert(JSON.stringify(state.c) === JSON.stringify({ acceptedAt: "2026-09-22T00:00:00.000Z", termsVersion: "fixture-terms", privacyVersion: "fixture-privacy" }), "Consent changed");
}));

Deno.test("Google start stops after one continuation when the browser does not store cookies", () => fixture(async ({ request, records }) => {
  const first = started(await request());
  await stopped(await request(first.location));
  assert(records.attempts.length === 0 && records.reads === 0, "Rejected browser created an OAuth attempt");
}));

Deno.test("existing valid Google binding keeps the direct provider redirect", () => fixture(async ({ request, records }) => {
  const cookie = `__Host-ww_google_oauth=${"B".repeat(43)}`;
  const result = started(await request(undefined, cookie));
  assert(result.location.origin === "https://accounts.google.com", "Existing browser took an unnecessary continuation");
  assert(result.cookie === cookie && records.attempts.length === 1, "Existing binding was not preserved");
}));

Deno.test("invalid native PKCE fails before any cookie, continuation, or database work", () => fixture(async ({ request, records }) => {
  const query = params();
  query.set("code_challenge", "invalid");
  const response = await request(`${endpoint}?${query}`);
  assert(response.status === 400, "Invalid PKCE was accepted");
  assert(!response.headers.has("Location") && !response.headers.has("Set-Cookie"), "Invalid PKCE initialized a browser flow");
  assert(records.reads === 0 && records.attempts.length === 0, "Invalid PKCE reached database");
}));

Deno.test("Google cookie continuation rejects cookie substitution and query tampering", () => fixture(async ({ request, records }) => {
  const first = started(await request());
  await stopped(await request(first.location, `__Host-ww_google_oauth=${"B".repeat(43)}`));
  for (const [key, value] of [["code_challenge", "C".repeat(43)], ["redirect_to", "weddingwin://bd-login?changed=1"], ["terms_version", "changed"]]) {
    const changed = new URL(first.location);
    changed.searchParams.set(key, value);
    await stopped(await request(changed, first.cookie));
  }
  assert(records.attempts.length === 0, "Tampered continuation created an attempt");
}));

Deno.test("Google cookie continuation rejects duplicate, malformed, and forged markers", () => fixture(async ({ request, records }) => {
  const first = started(await request());
  const original = first.location.searchParams.get("ww_cookie_check")!;
  for (const extra of [original, "invalid"]) {
    const duplicate = new URL(first.location);
    duplicate.searchParams.append("ww_cookie_check", extra);
    await stopped(await request(duplicate, first.cookie));
  }
  for (const replacement of ["", "!invalid", "A".repeat(1025), btoa(JSON.stringify({ ...decode(original), exp: Math.floor(Date.now() / 1000) + 30 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")]) {
    const forged = new URL(first.location);
    forged.searchParams.set("ww_cookie_check", replacement);
    await stopped(await request(forged, first.cookie));
  }
  assert(records.attempts.length === 0, "Invalid marker created an attempt");
}));

Deno.test("Google cookie continuation expires after sixty seconds without restarting", () => fixture(async ({ request, records }) => {
  const first = started(await request());
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 61_000;
    await stopped(await request(first.location, first.cookie));
  } finally {
    Date.now = originalNow;
  }
  assert(records.attempts.length === 0, "Expired marker created an attempt");
}));

Deno.test("Google cookie continuation never trusts the incoming host or a requested continuation URL", () => fixture(async ({ request }) => {
  const query = params();
  query.set("continue_to", "https://attacker.example.invalid/collect");
  const first = started(await request(`https://attacker.example.invalid/untrusted?${query}`));
  assert(first.location.origin === backend && first.location.pathname === "/functions/v1/google-oauth-start", "Continuation trusted an unconfigured origin");
}));
