import { createAppleNativeStartHandler } from "./apple_native_oauth.ts";
import { createAppleWebCallbackHandler } from "./apple_web_oauth.ts";
import type { resolveAppleGrantClaims } from "./apple_grant_store.ts";
import { readOAuthBindingCookie } from "./oauth_attempt.ts";
import {
  APPLE_NATIVE_RETURN_URL,
  createSignedAppleOAuthState,
  verifySignedAppleOAuthState,
} from "./oauth_state.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policy_consent.ts";
import {
  AppleLoginPreflightUnavailableError,
  AppleSignupRequiredError,
} from "./apple_login_preflight.ts";

const SECRET = "offline-native-apple-callback-secret";
const CALLBACK =
  "https://backend.example.invalid/functions/v1/apple-oauth-callback";
const RETURN = "https://www.weddingwin.ca/auth/apple-callback";
const CHALLENGE = "C".repeat(43);
const CODE = "E".repeat(43);
const EMAIL = "apple-browser-test@example.invalid";
let resolver: typeof resolveAppleGrantClaims | undefined;
async function resolveClaims(
  args: Parameters<typeof resolveAppleGrantClaims>[0],
) {
  if (!resolver) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    Deno.env.set("SUPABASE_URL", "https://fixture.example.invalid");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "offline-fixture-key");
    try {
      resolver =
        (await import("./apple_grant_store.ts")).resolveAppleGrantClaims;
    } finally {
      if (url === undefined) Deno.env.delete("SUPABASE_URL");
      else Deno.env.set("SUPABASE_URL", url);
      if (key === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);
    }
  }
  return resolver(args);
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function fixture(
  settings: { wrapper?: boolean; exchange?: boolean; skipPreflight?: boolean } =
    {},
) {
  const attempts = new Map<string, { binding: string; consumed: boolean }>();
  const recorded = {
    events: [] as string[],
    makeLogin: [] as Record<string, unknown>[],
    exchanges: [] as Record<string, unknown>[],
  };
  const options = {
    nonce: "",
    badSignature: false,
    badNonce: false,
    noEmail: false,
    unverified: false,
    grantError: "",
    postGrantError: "",
    loginError: "",
    exchangeError: "",
    memberId: "990001",
    malformedSession: false,
    missingOrdinaryMember: false,
    preflightUnavailable: false,
  };
  const start = createAppleNativeStartHandler({
    secret: SECRET,
    returnUrl: RETURN,
    getServiceId: async () => "ca.example.apple.web",
    createAttempt: async ({ state, bindingSecret }) => {
      const parsed = await verifySignedAppleOAuthState(state, SECRET);
      options.nonce = parsed.n;
      attempts.set(state, { binding: bindingSecret, consumed: false });
    },
  });
  const callback = createAppleWebCallbackHandler({
    secret: SECRET,
    returnUrl: RETURN,
    redeemAttempt: async (request, state) => {
      recorded.events.push("attempt");
      const attempt = attempts.get(state);
      if (
        !attempt || attempt.consumed ||
        readOAuthBindingCookie(request, "apple") !== attempt.binding
      ) {
        throw new Error(
          "OAuth sign-in is expired, used, or belongs to another browser.",
        );
      }
      attempt.consumed = true;
    },
    getCredentials: async () => ({
      serviceId: "ca.example.apple.web",
      clientSecret: "offline-secret-do-not-emit",
    }),
    fetch: async (_url, init) => {
      recorded.events.push("token");
      assert(
        new URLSearchParams(String(init?.body)).get("redirect_uri") === RETURN,
        "registered callback changed",
      );
      return Response.json({
        id_token: "offline-provider-token",
        refresh_token: "offline-refresh-secret",
      });
    },
    verifyIdentity: async () => {
      recorded.events.push("verify");
      if (options.badSignature) {
        throw new Error("provider secret invalid signature");
      }
      return {
        sub: "offline-apple-subject",
        iss: "https://appleid.apple.com",
        aud: "ca.example.apple.web",
        nonce: options.badNonce ? "wrong" : options.nonce,
        ...(options.noEmail
          ? {}
          : { email: EMAIL, email_verified: !options.unverified }),
      };
    },
    preflightLogin: async ({ consent }) => {
      recorded.events.push("preflight");
      if (options.preflightUnavailable) {
        throw new AppleLoginPreflightUnavailableError();
      }
      if (!consent && options.missingOrdinaryMember) {
        throw new AppleSignupRequiredError(true);
      }
      return {};
    },
    upsertUser: async ({ claims, email }) => {
      recorded.events.push("upsert");
      assert(
        email === EMAIL && claims.email === EMAIL,
        "unsigned email reached account creation",
      );
      return {
        userId: "offline-profile",
        appleSub: claims.sub,
        email,
        fullName: "Offline Test",
      };
    },
    makeLogin: async (args) => {
      recorded.events.push("login");
      recorded.makeLogin.push(args);
      if (options.loginError) throw new Error(options.loginError);
      return {
        redirectUrl:
          "https://www.weddingwin.ca/app-login?code=unused-website-code",
        user: {
          email: EMAIL,
          user_id: options.memberId,
          subscription_id: args.subscriptionId || "17",
        },
        nativeSession: {
          user_id: options.memberId,
          token: options.malformedSession
            ? ""
            : "offline-native-session-secret",
          email: EMAIL,
        },
      };
    },
    linkProfile: async () => {
      recorded.events.push("link");
    },
    ...(settings.wrapper === false ? {} : {
      withGrant: (async (args) => {
        recorded.events.push("grant-begin");
        if (options.grantError) throw new Error(options.grantError);
        const resolved = await resolveClaims({
          original: args.claims,
          requireVerifiedEmail: true,
        });
        const context = { verifiedClaims: resolved.claims };
        if (!settings.skipPreflight) await args.preflight?.(context);
        const result = await args.login(context);
        if (options.postGrantError) throw new Error(options.postGrantError);
        recorded.events.push("grant-stored-and-checked");
        return result.value;
      }) satisfies NonNullable<
        Parameters<typeof createAppleWebCallbackHandler>[0]["withGrant"]
      >,
    }),
    ...(settings.exchange === false ? {} : {
      createNativeExchange: (async (args) => {
        recorded.events.push("exchange");
        recorded.exchanges.push(args);
        if (options.exchangeError) throw new Error(options.exchangeError);
        assert(
          recorded.events.includes("grant-stored-and-checked"),
          "code created before grant completion",
        );
        return CODE;
      }) satisfies NonNullable<
        Parameters<
          typeof createAppleWebCallbackHandler
        >[0]["createNativeExchange"]
      >,
    }),
    errorPage: (message) =>
      new Response(message, {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }),
    diagnostic: () => {},
  });
  async function begin(role?: "vendor" | "couple") {
    const params = new URLSearchParams({
      return_to: APPLE_NATIVE_RETURN_URL,
      code_challenge: CHALLENGE,
    });
    if (role) {
      Object.entries({
        signup_role: role,
        accepted_terms: "1",
        accepted_privacy: "1",
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: CURRENT_PRIVACY_VERSION,
        accepted_at: new Date().toISOString(),
      }).forEach(([key, value]) => params.set(key, value));
    }
    const response = await start(
      new Request(
        `https://backend.example.invalid/functions/v1/apple-native-oauth-start?${params}`,
      ),
    );
    assert(response.status === 302, "start failed");
    const state = new URL(response.headers.get("Location")!).searchParams.get(
      "state",
    )!;
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
    return { state, cookie };
  }
  function post(
    attempt: { state: string; cookie: string },
    extras: Record<string, string> = {},
  ) {
    return callback(
      new Request(CALLBACK, {
        method: "POST",
        headers: { Cookie: attempt.cookie },
        body: new URLSearchParams({
          code: "offline-single-use-apple-code",
          state: attempt.state,
          ...extras,
        }),
      }),
    );
  }
  return { options, recorded, begin, post, callback, attempts };
}

function appError(response: Response) {
  assert(response.status === 302, "native error must return to app");
  const location = new URL(response.headers.get("Location")!);
  assert(
    location.protocol === "weddingwin:" &&
      location.hostname === "bd-apple-return" && !location.pathname,
    "unsafe return URL",
  );
  assert(location.searchParams.get("provider") === "apple", "provider missing");
  assert(
    !location.searchParams.has("exchange_code"),
    "failure issued exchange",
  );
  assert(
    response.headers.get("Cache-Control") === "no-store",
    "error is cacheable",
  );
  assert(
    !/offline-(?:native|refresh|provider|apple-subject)|example\.invalid/.test(
      location.toString(),
    ),
    "secret leaked into error",
  );
  return location;
}

Deno.test("Apple browser-native callback creates only a PKCE-bound Apple exchange after verified grant storage", async () => {
  const f = fixture();
  const response = await f.post(await f.begin("vendor"));
  assert(response.status === 302, "callback failed");
  const location = new URL(response.headers.get("Location")!);
  assert(
    location.origin === "null" && location.protocol === "weddingwin:" &&
      location.hostname === "bd-apple-return",
    "wrong native target",
  );
  assert(
    [...location.searchParams.keys()].sort().join(",") ===
      "exchange_code,provider",
    "credentials or unexpected data in callback",
  );
  assert(
    location.searchParams.get("exchange_code") === CODE &&
      location.searchParams.get("provider") === "apple",
    "wrong handoff",
  );
  assert(
    f.recorded.exchanges.length === 1 &&
      f.recorded.exchanges[0].provider === "apple" &&
      f.recorded.exchanges[0].codeChallenge === CHALLENGE,
    "PKCE/provider lost",
  );
  assert(
    f.recorded.makeLogin[0].subscriptionId === "17" &&
      f.recorded.makeLogin[0].expectedSignupRole === "vendor",
    "vendor became couple",
  );
  assert(
    f.recorded.makeLogin[0].includeWebsiteRedirect === false,
    "unneeded website credential ticket created",
  );
  const consent = f.recorded.makeLogin[0].consent as Record<string, unknown>;
  assert(
    consent.termsVersion === CURRENT_TERMS_VERSION &&
      consent.privacyVersion === CURRENT_PRIVACY_VERSION,
    "consent lost",
  );
  assert(
    response.headers.get("Cache-Control") === "no-store",
    "session callback cacheable",
  );
});

Deno.test("Apple browser-native preserves couple signup and ordinary login without imposing picker role", async () => {
  for (const role of ["couple", undefined] as const) {
    const f = fixture();
    await f.post(await f.begin(role));
    const args = f.recorded.makeLogin[0];
    assert(
      role
        ? args.subscriptionId === "18" && args.expectedSignupRole === "couple"
        : args.subscriptionId === undefined &&
          args.expectedSignupRole === undefined && args.consent === null,
      "role/consent semantics changed",
    );
  }
});

Deno.test("Apple browser-native missing ordinary account returns signup_required before any account write", async () => {
  const f = fixture();
  f.options.missingOrdinaryMember = true;
  const response = await f.post(await f.begin());
  const location = new URL(response.headers.get("Location")!);
  assert(
    response.status === 302 &&
      location.searchParams.get("provider") === "apple" &&
      location.searchParams.get("error") === "signup_required",
    "missing account did not return strict signup code",
  );
  assert(
    !location.searchParams.has("exchange_code"),
    "missing account received session code",
  );
  assert(
    !f.recorded.events.some((event) =>
      ["upsert", "login", "link", "exchange"].includes(event)
    ),
    "missing ordinary account caused a write",
  );
  assert(f.recorded.events.includes("preflight"), "preflight was skipped");
});

Deno.test("Apple browser-native unavailable preflight never suggests signup or mutates accounts", async () => {
  const f = fixture();
  f.options.preflightUnavailable = true;
  const response = await f.post(await f.begin());
  const location = new URL(response.headers.get("Location")!);
  assert(
    location.searchParams.get("error") === "sign_in_unavailable",
    "uncertain account lookup became signup_required",
  );
  assert(
    !f.recorded.events.some((event) =>
      ["upsert", "login", "link", "exchange"].includes(event)
    ),
    "uncertain account lookup caused a write",
  );
});

Deno.test("Apple callback refuses account writes when an older grant adapter skips preflight", async () => {
  const f = fixture({ skipPreflight: true });
  const response = await f.post(await f.begin());
  assert(
    new URL(response.headers.get("Location")!).searchParams.get("error") ===
      "sign_in_unavailable",
    "older adapter bypassed preflight",
  );
  assert(
    !f.recorded.events.some((event) =>
      ["upsert", "login", "link", "exchange"].includes(event)
    ),
    "un-preflighted login wrote account",
  );
});

Deno.test("Apple browser-native ignores unsigned form emails and context", async () => {
  const f = fixture();
  await f.post(await f.begin("vendor"), {
    user: JSON.stringify({ email: "attacker@example.invalid" }),
    email: "attacker@example.invalid",
    verifiedClaims: JSON.stringify({
      email: "attacker@example.invalid",
      email_verified: true,
    }),
  });
  assert(
    f.recorded.makeLogin[0].email === EMAIL,
    "unsigned form replaced signed email",
  );
});

Deno.test("Apple browser-native missing or unverified signed email never creates an account or exchange", async () => {
  for (const option of ["noEmail", "unverified"] as const) {
    const f = fixture();
    f.options[option] = true;
    appError(
      await f.post(await f.begin("vendor"), {
        email: EMAIL,
        user: JSON.stringify({ email: EMAIL }),
      }),
    );
    assert(
      !f.recorded.events.includes("upsert") && !f.recorded.exchanges.length,
      "missing proof created account/session",
    );
  }
});

Deno.test("Apple browser-native pending deletion and post-login storage failure never issue an exchange", async () => {
  const pending =
    "Your previous Apple permission is being removed. Please try signing in again shortly.";
  for (const field of ["grantError", "postGrantError"] as const) {
    const f = fixture();
    f.options[field] = pending;
    const location = appError(await f.post(await f.begin("vendor")));
    assert(
      location.searchParams.get("error") === "cleanup_pending",
      "actionable pending error lost",
    );
    assert(!f.recorded.exchanges.length, "deletion barrier bypassed");
  }
});

Deno.test("Apple browser-native membership mismatch returns a safe actionable error without exchange", async () => {
  const f = fixture();
  f.options.loginError = "APPLE_SIGNUP_ROLE_MISMATCH";
  const location = appError(await f.post(await f.begin("vendor")));
  assert(
    location.searchParams.get("error") === "account_type_mismatch",
    "role mismatch lost",
  );
  assert(!f.recorded.exchanges.length, "mismatched role issued session");
});

Deno.test("Apple browser-native rejects wrong browser and replay before provider exchange", async () => {
  const f = fixture();
  const attempt = await f.begin("vendor");
  appError(await f.post({ ...attempt, cookie: "" }));
  assert(
    !f.recorded.events.includes("token"),
    "wrong browser contacted token endpoint",
  );
  await f.post(attempt);
  const exchanges = f.recorded.exchanges.length;
  appError(await f.post(attempt));
  assert(
    f.recorded.exchanges.length === exchanges,
    "replay issued second session",
  );
});

Deno.test("Apple browser-native rejects signature and nonce failures before account operations", async () => {
  for (const option of ["badSignature", "badNonce"] as const) {
    const f = fixture();
    f.options[option] = true;
    appError(await f.post(await f.begin("vendor")));
    assert(
      !f.recorded.events.includes("upsert") && !f.recorded.exchanges.length,
      "unverified identity reached account",
    );
  }
});

Deno.test("Apple browser-native signed intent cannot be changed, removed, or injected", async () => {
  for (const mutation of ["challenge", "return", "remove", "role"] as const) {
    const f = fixture();
    const attempt = await f.begin("vendor");
    const padded = attempt.state.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(atob(padded));
    if (mutation === "challenge") data.native.codeChallenge = "Z".repeat(43);
    else if (mutation === "return") {
      data.native.returnTo = "weddingwin://bd-apple-return.evil";
    } else if (mutation === "remove") delete data.native;
    else data.s = "couple";
    const state = btoa(JSON.stringify(data)).replace(/\+/g, "-").replace(
      /\//g,
      "_",
    ).replace(/=+$/, "");
    const response = await f.post({ ...attempt, state });
    assert(
      response.status === 400 && !response.headers.has("Location"),
      "unverified intent got trusted native redirect",
    );
    assert(
      !f.recorded.events.includes("token") && !f.recorded.exchanges.length,
      "tampering reached provider",
    );
  }
});

Deno.test("Apple browser-native rejects expired signed state before native redirect or token exchange", async () => {
  const f = fixture();
  const old = await createSignedAppleOAuthState({
    secret: SECRET,
    redirectTo: APPLE_NATIVE_RETURN_URL,
    native: { returnTo: APPLE_NATIVE_RETURN_URL, codeChallenge: CHALLENGE },
    nowSeconds: Math.floor(Date.now() / 1000) - 601,
  });
  const response = await f.post({ state: old.state, cookie: "" });
  assert(
    response.status === 400 && !response.headers.has("Location") &&
      !f.recorded.events.includes("token"),
    "expired state reached native session flow",
  );
});

Deno.test("Apple browser-native fails closed if production grant/exchange adapters are absent", async () => {
  for (const settings of [{ wrapper: false }, { exchange: false }]) {
    const f = fixture(settings);
    appError(await f.post(await f.begin("vendor")));
    assert(
      !f.recorded.events.includes("token"),
      "incomplete deployment redeemed provider credentials",
    );
  }
});

Deno.test("Apple browser-native rejects malformed session and hides exchange backend errors", async () => {
  const f = fixture();
  f.options.malformedSession = true;
  appError(await f.post(await f.begin("vendor")));
  assert(!f.recorded.exchanges.length, "empty native token handed off");
  const g = fixture();
  g.options.exchangeError =
    "offline-native-session-secret private database failure";
  appError(await g.post(await g.begin("vendor")));
});

Deno.test("Apple browser-native provider cancellation returns to app without credential exchange", async () => {
  const f = fixture();
  appError(
    await f.post(await f.begin("vendor"), {
      error: "user_cancelled_authorize",
    }),
  );
  assert(
    !f.recorded.events.includes("token") && !f.recorded.exchanges.length,
    "cancel redeemed token",
  );
});

Deno.test("Apple callback production wiring uses fixed Apple native exchange adapter", async () => {
  const source = await Deno.readTextFile(
    new URL("../apple-oauth-callback/index.ts", import.meta.url),
  );
  const exchange = await Deno.readTextFile(
    new URL("../apple-native-exchange/index.ts", import.meta.url),
  );
  assert(
    source.includes("createNativeExchange: createValidatedAppleNativeExchange"),
    "production exchange adapter not wired",
  );
  assert(
    exchange.includes('admin.rpc("redeem_native_auth_exchange"') &&
      exchange.includes("p_provider: provider"),
    "atomic PKCE exchange not wired",
  );
});
