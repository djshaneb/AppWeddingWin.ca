import {
  createOAuthLoginAttempt,
  prepareOAuthBinding,
  readOAuthBindingCookie,
  redeemOAuthLoginAttempt,
  serializeOAuthBindingCookie,
  sha256Base64Url,
} from "./oauth_attempt.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function assertRejects(
  run: () => Promise<unknown> | unknown,
  expectedMessage: RegExp,
) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expectedMessage.test(message), `unexpected rejection: ${message}`);
    return;
  }
  throw new Error("expected operation to reject");
}

const BINDING = "b".repeat(43);
const OTHER_BINDING = "c".repeat(43);
const STATE = "signed-oauth-state-fixture";

type AttemptAdmin = Parameters<typeof createOAuthLoginAttempt>[0]["admin"];

Deno.test("OAuth cross-site binding cookies retain exact host, lifetime, and security attributes", () => {
  for (const provider of ["google", "apple"] as const) {
    const cookie = serializeOAuthBindingCookie(provider, BINDING);
    const attributes = cookie.split("; ");
    assert(
      attributes[0] === `__Host-ww_${provider}_oauth=${BINDING}`,
      `${provider} cookie name or value is wrong`,
    );
    assert(attributes.length === 6, "unexpected cookie attribute added");
    assert(attributes.includes("Path=/"), "host-prefix path must be retained");
    assert(
      attributes.includes("Max-Age=600"),
      "cookie lifetime must match state",
    );
    assert(attributes.includes("Secure"), "SameSite=None requires Secure");
    assert(
      attributes.includes("HttpOnly"),
      "scripts must not read the binding",
    );
    assert(
      attributes.includes("SameSite=None"),
      `${provider} binding must survive the cross-site provider and website bridge`,
    );
    assert(!/Domain=/i.test(cookie), "a __Host- cookie must not have Domain");
  }
});

Deno.test("OAuth start reuses a valid browser binding and rejects malformed cookies", () => {
  const request = new Request(
    "https://project.supabase.co/functions/v1/google-oauth-start",
    {
      headers: { cookie: `unrelated=1; __Host-ww_google_oauth=${BINDING}` },
    },
  );
  const prepared = prepareOAuthBinding(request, "google");
  assert(
    prepared.bindingSecret === BINDING,
    "parallel starts should reuse the browser binding",
  );
  assert(
    prepared.setCookie.includes("SameSite=None"),
    "reused Google bindings must receive the redirect-compatible policy too",
  );
  assert(
    readOAuthBindingCookie(request, "apple") === null,
    "provider cookies must be isolated",
  );

  const malformed = new Request(
    "https://project.supabase.co/functions/v1/apple-oauth-start",
    {
      headers: { cookie: "__Host-ww_apple_oauth=too-short" },
    },
  );
  const replacement = prepareOAuthBinding(malformed, "apple");
  assert(
    replacement.bindingSecret !== "too-short",
    "a malformed binding must be replaced",
  );
  assert(
    /^[A-Za-z0-9_-]{43}$/.test(replacement.bindingSecret),
    "replacement entropy is malformed",
  );
});

Deno.test("OAuth attempt creation persists hashes, never raw state or cookie secrets", async () => {
  let inserted: Record<string, unknown> | null = null;
  const admin = {
    from(table: string) {
      assert(table === "oauth_login_attempts", "wrong OAuth attempt table");
      return {
        insert: async (row: Record<string, unknown>) => {
          inserted = row;
          return { error: null };
        },
      };
    },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as AttemptAdmin;

  await createOAuthLoginAttempt({
    admin,
    provider: "google",
    state: STATE,
    bindingSecret: BINDING,
    expiresAtSeconds: 2_000,
  });

  assert(inserted !== null, "attempt row was not inserted");
  assert(
    inserted!.state_hash === await sha256Base64Url(STATE),
    "state hash is wrong",
  );
  assert(
    inserted!.binding_hash === await sha256Base64Url(BINDING),
    "binding hash is wrong",
  );
  assert(inserted!.state_hash !== STATE, "raw state must not be persisted");
  assert(
    inserted!.binding_hash !== BINDING,
    "raw binding must not be persisted",
  );
  assert(
    inserted!.expires_at === new Date(2_000_000).toISOString(),
    "expiry is wrong",
  );
});

Deno.test("OAuth attempt redemption sends provider and browser-bound hashes to the atomic RPC", async () => {
  let rpcName = "";
  let rpcArgs: Record<string, unknown> | null = null;
  const admin = {
    from: () => ({ insert: async () => ({ error: null }) }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcName = name;
      rpcArgs = args;
      return { data: true, error: null };
    },
  } as unknown as AttemptAdmin;
  const request = new Request(
    "https://project.supabase.co/functions/v1/apple-oauth-callback",
    {
      headers: { cookie: `__Host-ww_apple_oauth=${BINDING}` },
    },
  );

  await redeemOAuthLoginAttempt({
    admin,
    request,
    provider: "apple",
    state: STATE,
  });

  assert(
    rpcName === "redeem_oauth_login_attempt",
    "redemption must use the atomic RPC",
  );
  assert(rpcArgs!.p_provider === "apple", "provider binding was not sent");
  assert(
    rpcArgs!.p_state_hash === await sha256Base64Url(STATE),
    "state hash was not sent",
  );
  assert(
    rpcArgs!.p_binding_hash === await sha256Base64Url(BINDING),
    "binding hash was not sent",
  );
});

Deno.test("OAuth redemption fails closed for a missing cookie, replay, or database error", async () => {
  const missingCookieAdmin = {
    from: () => ({ insert: async () => ({ error: null }) }),
    rpc: async () => {
      throw new Error("RPC must not run without the cookie");
    },
  } as unknown as AttemptAdmin;
  for (
    const cookie of [
      "",
      `__Host-ww_apple_oauth=${BINDING}`,
      "__Host-ww_google_oauth=too-short",
      `__Host-ww_google_oauth=${BINDING}%0A`,
    ]
  ) {
    await assertRejects(
      () =>
        redeemOAuthLoginAttempt({
          admin: missingCookieAdmin,
          request: new Request(
            "https://project.supabase.co/functions/v1/google-oauth-callback",
            { headers: { cookie } },
          ),
          provider: "google",
          state: STATE,
        }),
      /same browser/i,
    );
  }

  const request = new Request(
    "https://project.supabase.co/functions/v1/google-oauth-callback",
    {
      headers: { cookie: `__Host-ww_google_oauth=${OTHER_BINDING}` },
    },
  );
  const replayAdmin = {
    from: () => ({ insert: async () => ({ error: null }) }),
    rpc: async () => ({ data: false, error: null }),
  } as unknown as AttemptAdmin;
  await assertRejects(
    () =>
      redeemOAuthLoginAttempt({
        admin: replayAdmin,
        request,
        provider: "google",
        state: STATE,
      }),
    /invalid, expired, already used, or belongs to another browser/i,
  );

  const failedAdmin = {
    from: () => ({ insert: async () => ({ error: null }) }),
    rpc: async () => ({
      data: null,
      error: { message: "database unavailable" },
    }),
  } as unknown as AttemptAdmin;
  await assertRejects(
    () =>
      redeemOAuthLoginAttempt({
        admin: failedAdmin,
        request,
        provider: "google",
        state: STATE,
      }),
    /temporarily unavailable/i,
  );
});

Deno.test("OAuth callbacks redeem before exchange and Apple never trusts a browser id_token", async () => {
  const google = await Deno.readTextFile(
    new URL("../google-oauth-callback/index.ts", import.meta.url),
  );
  const appleCallback = await Deno.readTextFile(
    new URL("../apple-oauth-callback/index.ts", import.meta.url),
  );
  const apple = await Deno.readTextFile(
    new URL("./apple_web_oauth.ts", import.meta.url),
  );
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260828214932_bind_web_oauth_attempts.sql",
      import.meta.url,
    ),
  );
  const fixture = await Deno.readTextFile(
    new URL("../../tests/oauth_login_attempt_fixture.sql", import.meta.url),
  );

  const googleRedeem = google.indexOf("await redeemOAuthLoginAttempt");
  const googleExchange = google.indexOf(
    'fetch("https://oauth2.googleapis.com/token"',
  );
  assert(
    googleRedeem >= 0 && googleRedeem < googleExchange,
    "Google must redeem before exchange",
  );

  assert(
    appleCallback.includes("redeemOAuthLoginAttempt({") &&
      appleCallback.includes("return handleCallback(req)"),
    "Apple endpoint must wire its callback handler to real browser-bound attempt redemption",
  );
  const appleRedeem = apple.indexOf("await deps.redeemAttempt(req, stateRaw)");
  const appleExchange = apple.search(
    /deps\.fetch\(\s*"https:\/\/appleid\.apple\.com\/auth\/token"/,
  );
  assert(
    appleRedeem >= 0 && appleRedeem < appleExchange,
    "Apple must redeem before exchange",
  );
  assert(
    !apple.includes('form.get("id_token")'),
    "Apple must ignore browser-supplied id_token",
  );
  assert(
    apple.indexOf("if (!code)") > appleRedeem &&
      apple.indexOf("if (!code)") < appleExchange,
    "Apple must require an authorization code",
  );

  assert(
    /delete from public\.oauth_login_attempts[\s\S]*?state_hash = p_state_hash[\s\S]*?provider = p_provider[\s\S]*?binding_hash = p_binding_hash[\s\S]*?expires_at > now\(\)/i
      .test(migration),
    "the redemption RPC must atomically bind state, provider, browser, and expiry",
  );
  assert(
    /revoke all on function public\.redeem_oauth_login_attempt[\s\S]*?from public, anon, authenticated/i
      .test(migration),
    "untrusted roles must not execute redemption",
  );
  assert(
    /grant execute on function public\.redeem_oauth_login_attempt[\s\S]*?to service_role/i
      .test(migration),
    "only service_role should receive redemption execution",
  );
  assert(
    /^\s*--[\s\S]*?\bbegin;[\s\S]*rollback;\s*$/i.test(fixture),
    "the live database regression fixture must always roll back",
  );
});
