import {
  type AppleWebCallbackDiagnostic,
  type AppleWebGrantLoginContext,
  createAppleWebCallbackHandler,
  createAppleWebStartHandler,
} from "./apple_web_oauth.ts";
import { readOAuthBindingCookie } from "./oauth_attempt.ts";
import {
  type AppleWebSignupRole,
  createSignedAppleOAuthState,
  verifySignedAppleOAuthState,
} from "./oauth_state.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  type CurrentPolicyConsent,
  requireCurrentPolicyConsent,
} from "./policy_consent.ts";
import { assertAppleSignupAccountType } from "./apple_signup_role.ts";
import { AppleSignupRequiredError } from "./apple_login_preflight.ts";

const SECRET = "offline-only-apple-web-oauth-test-secret";
const START = "https://backend.example.invalid/functions/v1/apple-oauth-start";
const CALLBACK =
  "https://backend.example.invalid/functions/v1/apple-oauth-callback";
const RETURN_URL = "https://www.weddingwin.ca/auth/apple-callback";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function postStart(
  overrides: Record<string, string> = {},
  origin = "https://www.weddingwin.ca",
) {
  return new Request(START, {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({
      policy_accepted: "1",
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      redirect_to: "https://www.weddingwin.ca/account/home",
      ...overrides,
    }),
  });
}

function fixture(settings: {
  withGrant?: boolean;
  resolvedGrantEmail?: string;
  boundGrantAccount?: boolean;
  diagnosticThrows?: boolean;
  defaultLogger?: boolean;
} = {}) {
  const attempts = new Map<
    string,
    { bindingSecret: string; consumed: boolean }
  >();
  const recorded = {
    configReads: 0,
    tokenExchanges: 0,
    upserts: 0,
    links: 0,
    loginCalls: [] as {
      consent: CurrentPolicyConsent | null;
      email: string;
      finalRedirect: string;
      subscriptionId?: string;
      expectedSignupRole?: AppleWebSignupRole;
      expectedBdMemberId?: string;
    }[],
    createdPlans: [] as string[],
    upsertEmail: "",
    upsertClaims: [] as NonNullable<
      AppleWebGrantLoginContext["verifiedClaims"]
    >[],
    originalClaims: [] as NonNullable<
      AppleWebGrantLoginContext["verifiedClaims"]
    >[],
    expectedProfileIds: [] as (string | undefined)[],
    diagnostics: [] as AppleWebCallbackDiagnostic[],
    grantDiagnosticIds: [] as (string | undefined)[],
  };
  const options = {
    existing: false,
    existingPlan: "18",
    wrongNonce: false,
    badToken: false,
    upstreamError: false,
    startUnavailable: false,
    loginError: "",
    emailVerified: true as boolean | string | undefined,
    omitEmail: false,
    credentialsError: "",
    upsertError: "",
    linkError: "",
    grantError: "",
    postGrantError: "",
    missingToken: false,
    missingRefresh: false,
    malformedTokenResponse: false,
  };
  let nonce = "";
  const start = createAppleWebStartHandler({
    secret: SECRET,
    returnUrl: RETURN_URL,
    getServiceId: () => {
      recorded.configReads++;
      if (options.startUnavailable) throw new Error("private config detail");
      return Promise.resolve("ca.example.test");
    },
    createAttempt: async ({ state, bindingSecret, expiresAtSeconds }) => {
      const parsed = await verifySignedAppleOAuthState(state, SECRET);
      assert(
        parsed.exp === expiresAtSeconds,
        "attempt lifetime differs from signed state",
      );
      nonce = parsed.n;
      attempts.set(state, { bindingSecret, consumed: false });
    },
  });
  const callback = createAppleWebCallbackHandler({
    secret: SECRET,
    returnUrl: RETURN_URL,
    redeemAttempt: (request, state) => {
      const attempt = attempts.get(state);
      if (
        !attempt || attempt.consumed ||
        readOAuthBindingCookie(request, "apple") !== attempt.bindingSecret
      ) {
        throw new Error(
          "OAuth sign-in state is invalid, expired, already used, or belongs to another browser.",
        );
      }
      attempt.consumed = true;
      return Promise.resolve();
    },
    getCredentials: () => {
      if (options.credentialsError) throw new Error(options.credentialsError);
      return Promise.resolve({
        serviceId: "ca.example.test",
        clientSecret: "never-display-client-secret",
      });
    },
    fetch: (_input, init) => {
      recorded.tokenExchanges++;
      const params = new URLSearchParams(String(init?.body));
      assert(
        params.get("redirect_uri") === RETURN_URL,
        "callback URL changed at token exchange",
      );
      if (options.upstreamError) {
        return Promise.resolve(
          new Response("secret upstream detail", { status: 400 }),
        );
      }
      if (options.malformedTokenResponse) {
        return Promise.resolve(new Response("secret upstream malformed JSON"));
      }
      return Promise.resolve(
        Response.json({
          ...(options.missingToken
            ? {}
            : { id_token: "offline-signed-token-placeholder" }),
          ...(options.missingRefresh
            ? {}
            : { refresh_token: "offline-refresh-token-placeholder" }),
        }),
      );
    },
    verifyIdentity: () => {
      if (options.badToken) {
        throw new Error("Invalid signature, secret upstream detail");
      }
      const claims = {
        sub: "apple-test-sub",
        aud: "ca.example.test",
        iss: "https://appleid.apple.com",
        email: options.omitEmail ? undefined : "couple@example.invalid",
        email_verified: options.emailVerified,
        nonce: options.wrongNonce ? "wrong" : nonce,
      };
      recorded.originalClaims.push(claims);
      return Promise.resolve(claims);
    },
    preflightLogin: async ({ consent, expectedBdMemberId }) => {
      if (consent) requireCurrentPolicyConsent(consent);
      else if (!options.existing) throw new AppleSignupRequiredError(true);
      return { expectedBdMemberId };
    },
    upsertUser: ({ claims, email, expectedProfileId }) => {
      recorded.upserts++;
      if (options.upsertError) throw new Error(options.upsertError);
      recorded.upsertEmail = email;
      recorded.upsertClaims.push(claims);
      recorded.expectedProfileIds.push(expectedProfileId);
      return Promise.resolve({
        userId: "offline-profile",
        appleSub: claims.sub,
        email: claims.email || "couple@example.invalid",
        fullName: "Test Couple",
      });
    },
    makeLogin: (args) => {
      recorded.loginCalls.push(args);
      if (options.loginError) throw new Error(options.loginError);
      if (options.existing) {
        assertAppleSignupAccountType(
          {
            user_id: "offline-existing-member",
            subscription_id: options.existingPlan,
          },
          args.expectedSignupRole,
        );
      } else {
        requireCurrentPolicyConsent(args.consent);
        recorded.createdPlans.push(args.subscriptionId || "18");
      }
      return Promise.resolve({
        redirectUrl: "https://www.weddingwin.ca/login/fromsignup/offline-test",
        nativeSession: {
          user_id: "offline-member",
          email: args.email,
          token: "offline-session",
        },
      });
    },
    linkProfile: () => {
      recorded.links++;
      if (options.linkError) throw new Error(options.linkError);
      return Promise.resolve();
    },
    ...(settings.withGrant
      ? {
        withGrant: async <T>(args: {
          claims: NonNullable<AppleWebGrantLoginContext["verifiedClaims"]>;
          diagnosticId?: string;
          preflight?: (context: AppleWebGrantLoginContext) => Promise<void>;
          login: (
            context: AppleWebGrantLoginContext,
          ) => Promise<{ value: T }>;
        }): Promise<T> => {
          recorded.grantDiagnosticIds.push(args.diagnosticId);
          if (options.grantError) throw new Error(options.grantError);
          // This fixture models the trusted wrapper's already-verified result.
          // Resolver proof/mismatch checks are tested in apple_grant_claims_test.
          const context = {
            ...(settings.resolvedGrantEmail
              ? {
                verifiedClaims: {
                  ...args.claims,
                  email: settings.resolvedGrantEmail,
                  email_verified: true,
                },
              }
              : {}),
            ...(settings.boundGrantAccount
              ? {
                expectedProfileId: "offline-bound-profile",
                expectedBdMemberId: "offline-bound-member",
              }
              : {}),
          };
          await args.preflight?.(context);
          const result = await args.login(context);
          if (options.postGrantError) throw new Error(options.postGrantError);
          return result.value;
        },
      }
      : {}),
    errorPage: (message) => new Response(message, { status: 400 }),
    ...(settings.defaultLogger ? {} : {
      diagnostic: (event: AppleWebCallbackDiagnostic) => {
        recorded.diagnostics.push(event);
        if (settings.diagnosticThrows) {
          throw new Error("secret diagnostic sink failure");
        }
      },
    }),
  });
  async function begin(request = postStart()) {
    const response = await start(request);
    assert(
      response.status === 302,
      "accepted form did not start Apple authorization",
    );
    const url = new URL(response.headers.get("Location")!);
    const state = url.searchParams.get("state")!;
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
    return { response, url, state, cookie };
  }
  function finish(
    state: string,
    cookie: string,
    extra: Record<string, string> = {},
  ) {
    return callback(
      new Request(CALLBACK, {
        method: "POST",
        headers: { Cookie: cookie },
        body: new URLSearchParams({
          code: "offline-authorization-code",
          state,
          ...extra,
        }),
      }),
    );
  }
  return {
    start,
    callback,
    begin,
    finish,
    attempts,
    recorded,
    options,
    setNonce: (value: string) => {
      nonce = value;
    },
  };
}

Deno.test("Apple website GET returns to the agreement without creating consent or starting OAuth", async () => {
  const f = fixture();
  const response = await f.start(
    new Request(
      `${START}?policy_accepted=1&redirect_to=https://attacker.invalid`,
    ),
  );
  const url = new URL(response.headers.get("Location")!);
  assert(
    response.status === 303 && url.pathname === "/auth/apple-start",
    "GET did not return to the website form",
  );
  assert(
    url.searchParams.get("redirect_to") ===
      "https://www.weddingwin.ca/account/home",
    "unsafe final redirect survived",
  );
  assert(
    f.attempts.size === 0 && f.recorded.configReads === 0,
    "GET started authorization",
  );
  assert(
    !response.headers.has("Set-Cookie"),
    "GET should not issue an OAuth binding cookie",
  );
});

Deno.test("Apple website keeps vendor and couple signup intent across GET and consent error redirects", async () => {
  for (
    const role of [
      "vendor",
      "vendor_basic",
      "vendor_show",
      "vendor_venue",
      "vendor_multi",
      "vendor_venue_multi",
      "couple",
    ]
  ) {
    const f = fixture();
    const get = await f.start(new Request(`${START}?signup_role=${role}`));
    assert(
      get.status === 303 &&
        new URL(get.headers.get("Location")!).searchParams.get(
            "signup_role",
          ) === role,
      "GET lost the selected account type",
    );
    for (
      const fields of [{ policy_accepted: "0" }, {
        terms_version: "old",
      }] as Record<string, string>[]
    ) {
      const response = await f.start(
        postStart({ signup_role: role, ...fields }),
      );
      const location = new URL(response.headers.get("Location")!);
      assert(
        response.status === 303 &&
          location.searchParams.get("signup_role") === role,
        "consent recovery lost the selected account type",
      );
    }
    assert(
      f.attempts.size === 0,
      "agreement recovery created an authorization attempt",
    );
  }
});

Deno.test("Apple website rejects unknown, empty and duplicate signup role fields before authorization", async () => {
  for (
    const role of [
      "admin",
      "17",
      "18",
      "paid",
      "Vendor",
      "vendor_claim",
      "28",
      "36",
      "",
      "vendor&signup_role=couple",
      "vendor&signup_role=vendor",
    ]
  ) {
    for (const method of ["GET", "POST"]) {
      const f = fixture();
      const request = method === "GET"
        ? new Request(`${START}?signup_role=${role}`)
        : new Request(START, {
          method: "POST",
          headers: {
            Origin: "https://www.weddingwin.ca",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `${await postStart().text()}&signup_role=${role}`,
        });
      const response = await f.start(request);
      assert(
        response.status === 303 &&
          new URL(response.headers.get("Location")!).searchParams.get(
              "error",
            ) === "invalid_account_type",
        "invalid or ambiguous role silently fell back to an account type",
      );
      assert(
        f.attempts.size === 0 && f.recorded.configReads === 0,
        "invalid role started authorization",
      );
    }
  }
});

Deno.test("Apple website keeps checkout intent when Apple authorization is temporarily unavailable", async () => {
  const f = fixture();
  f.options.startUnavailable = true;
  const response = await f.start(postStart({ signup_role: "vendor" }));
  const location = new URL(response.headers.get("Location")!);
  assert(
    response.status === 303 &&
      location.searchParams.get("signup_role") === "vendor" &&
      location.searchParams.get("error") === "sign_in_unavailable" &&
      !location.toString().includes("private"),
    "temporary provider failure lost signup role or exposed private details",
  );
});

Deno.test("Apple website rejects callback signup-role tampering before provider exchange or account writes", async () => {
  const f = fixture();
  const { state, cookie } = await f.begin(postStart({ signup_role: "couple" }));
  const base64 = state.replaceAll("-", "+").replaceAll("_", "/");
  const parsed = JSON.parse(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
  );
  parsed.s = "vendor";
  const tampered = btoa(JSON.stringify(parsed)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
  assert(
    (await f.finish(tampered, cookie)).status === 400 &&
      f.recorded.tokenExchanges === 0 && f.recorded.upserts === 0,
    "tampered signup role reached provider exchange or account writes",
  );
});

Deno.test("Apple website signs the checkout account type and forwards only its allowlisted member plan", async () => {
  for (
    const [role, plan] of [
      ["vendor", "17"],
      ["vendor_basic", "35"],
      ["vendor_venue", "23"],
      ["vendor_multi", "33"],
      ["vendor_venue_multi", "37"],
      [
        "vendor_show",
        "38",
      ],
      ["couple", "18"],
    ] as const
  ) {
    const f = fixture();
    const { state, cookie } = await f.begin(
      postStart({ signup_role: role, subscription_id: "4" }),
    );
    const verified = await verifySignedAppleOAuthState(state, SECRET);
    assert(verified.s === role, "signed state lost checkout role");
    const result = await f.finish(state, cookie, {
      signup_role: "admin",
      subscription_id: "4",
    });
    assert(
      result.status === 302 &&
        f.recorded.loginCalls[0].subscriptionId === plan &&
        f.recorded.loginCalls[0].expectedSignupRole === role &&
        f.recorded.createdPlans.join() === plan,
      "callback lost the selected plan or trusted an unsigned plan",
    );
  }
  const f = fixture();
  const { state, cookie } = await f.begin();
  assert(
    (await f.finish(state, cookie)).status === 302 &&
      f.recorded.loginCalls[0].subscriptionId === undefined &&
      f.recorded.loginCalls[0].expectedSignupRole === undefined,
    "plain login unexpectedly requested an account conversion",
  );
});

Deno.test("Apple website does not silently log a conflicting existing account into vendor or couple checkout", async () => {
  for (
    const [role, existingPlan] of [["vendor", "18"], ["vendor", "10"], [
      "couple",
      "17",
    ], ["vendor", "4"]] as const
  ) {
    const f = fixture();
    f.options.existing = true;
    f.options.existingPlan = existingPlan;
    const { state, cookie } = await f.begin(postStart({ signup_role: role }));
    const result = await f.finish(state, cookie);
    const location = new URL(result.headers.get("Location")!);
    assert(
      result.status === 303 &&
        location.searchParams.get("error") === "account_type_mismatch" &&
        location.searchParams.get("signup_role") === role &&
        f.recorded.links === 0 && f.recorded.createdPlans.length === 0,
      "conflicting existing member was changed or incorrectly signed into checkout",
    );
  }
  for (
    const [role, existingPlan] of [
      ["vendor", "17"],
      ["vendor_basic", "35"],
      ["vendor_show", "38"],
      ["vendor_venue", "23"],
      ["vendor_multi", "33"],
      ["vendor_venue_multi", "37"],
      ["couple", "18"],
      [
        undefined,
        "4",
      ],
    ] as const
  ) {
    const f = fixture();
    f.options.existing = true;
    f.options.existingPlan = existingPlan;
    const { state, cookie } = await f.begin(
      postStart(role ? { signup_role: role } : {}),
    );
    assert(
      (await f.finish(state, cookie)).status === 302 &&
        f.recorded.createdPlans.length === 0,
      "matching checkout or ordinary existing-account login was blocked",
    );
  }
});

Deno.test("Apple website requires one explicit checkbox, current versions, and a trusted form origin", async () => {
  for (
    const [fields, origin, expected] of [
      [
        { policy_accepted: "" },
        "https://www.weddingwin.ca",
        "agreement_required",
      ],
      [
        { policy_accepted: "true" },
        "https://www.weddingwin.ca",
        "agreement_required",
      ],
      [
        { terms_version: "old" },
        "https://www.weddingwin.ca",
        "policies_changed",
      ],
      [
        { privacy_version: "old" },
        "https://www.weddingwin.ca",
        "policies_changed",
      ],
      [{}, "https://attacker.invalid", "invalid_request"],
      [{}, "https://weddingwin.ca.attacker.invalid", "invalid_request"],
      [{}, "", "invalid_request"],
    ] as [Record<string, string>, string, string][]
  ) {
    const f = fixture();
    const result = await f.start(postStart(fields, origin));
    assert(
      result.status === 303 &&
        new URL(result.headers.get("Location")!).searchParams.get("error") ===
          expected,
      `invalid consent form was not rejected with ${expected}`,
    );
    assert(
      f.attempts.size === 0 && f.recorded.configReads === 0,
      "rejected form created authorization state",
    );
  }
});

Deno.test("Apple website signs server-timestamped consent and preserves Apple OAuth protections", async () => {
  const f = fixture();
  const earliest = Date.now();
  const { response, url, state } = await f.begin(
    postStart({ accepted_at: "2001-01-01T00:00:00.000Z" }),
  );
  const verified = await verifySignedAppleOAuthState(state, SECRET);
  assert(
    url.origin === "https://appleid.apple.com",
    "not the Apple authorization origin",
  );
  assert(
    url.searchParams.get("nonce") === verified.n,
    "nonce not linked to signed state",
  );
  assert(
    url.searchParams.get("response_mode") === "form_post",
    "Apple response mode changed",
  );
  assert(
    verified.c?.termsVersion === CURRENT_TERMS_VERSION &&
      verified.c.privacyVersion === CURRENT_PRIVACY_VERSION,
    "current consent missing",
  );
  assert(
    Date.parse(verified.c.acceptedAt) >= earliest &&
      Date.parse(verified.c.acceptedAt) <= Date.now(),
    "acceptance timestamp came from client",
  );
  assert(
    verified.exp - Math.floor(Date.parse(verified.c.acceptedAt) / 1000) === 600,
    "OAuth no longer has a ten-minute lifetime",
  );
  const cookie = response.headers.get("Set-Cookie")!;
  assert(
    cookie.includes("Secure") && cookie.includes("HttpOnly") &&
      cookie.includes("SameSite=None"),
    "Apple browser-binding cookie weakened",
  );
  assert(
    response.headers.get("Cache-Control") === "no-store",
    "sensitive start response is cacheable",
  );
});

Deno.test("Apple website clamps direct form redirects to the same trusted website origins as the UI", async () => {
  for (
    const redirect of [
      "https://attacker.invalid",
      "https://www.weddingwin.ca:8443/login",
      "https://user:password@www.weddingwin.ca/account",
      "weddingwin://bd-login",
      "not-a-url",
      "",
    ]
  ) {
    const f = fixture();
    const { state } = await f.begin(postStart({ redirect_to: redirect }));
    assert(
      (await verifySignedAppleOAuthState(state, SECRET)).r ===
        "https://www.weddingwin.ca/account/home",
      "website POST accepted an unsafe or nonwebsite destination",
    );
  }
});

Deno.test("Apple website rejects duplicate acceptance fields instead of interpreting an ambiguous form", async () => {
  const f = fixture();
  const source = postStart();
  const body = `${await source.text()}&policy_accepted=0`;
  const response = await f.start(
    new Request(START, { method: "POST", headers: source.headers, body }),
  );
  assert(
    response.status === 303 && f.attempts.size === 0,
    "duplicate checkbox values started authorization",
  );
});

Deno.test("native Apple signup keeps its separate explicit-consent and session-only flow", async () => {
  const source = await Deno.readTextFile(
    new URL("../apple-native-login/index.ts", import.meta.url),
  );
  assert(
    source.includes(
      "body.accepted_terms === true && body.accepted_privacy === true",
    ),
    "native explicit acceptance disappeared",
  );
  assert(
    source.includes("makeBdAppleLoginResult({") &&
      source.includes("includeWebsiteRedirect: false"),
    "native login is no longer using its native-only session path",
  );
  assert(
    !source.includes("createAppleWebStartHandler") &&
      !source.includes("createAppleWebCallbackHandler"),
    "native Apple login was routed through the website form",
  );
});

Deno.test("Apple website new-account callback forwards signed consent and ignores unsigned user email", async () => {
  const f = fixture();
  const { state, cookie } = await f.begin();
  const response = await f.finish(state, cookie, {
    user: JSON.stringify({
      email: "attacker@example.invalid",
      name: { firstName: "Test" },
    }),
  });
  assert(
    response.status === 302 && f.recorded.links === 1,
    "new-account callback did not complete",
  );
  const verified = await verifySignedAppleOAuthState(state, SECRET);
  assert(
    JSON.stringify(f.recorded.loginCalls[0].consent) ===
      JSON.stringify(verified.c),
    "callback lost accepted policy details",
  );
  assert(
    f.recorded.upsertEmail === "couple@example.invalid",
    "unsigned user blob overrode signed identity email",
  );
  assert(
    f.recorded.loginCalls[0].finalRedirect ===
      "https://www.weddingwin.ca/account/home",
    "callback lost intended destination",
  );
});

Deno.test("Apple website rejects replay and browser mismatch before token exchange or account creation", async () => {
  const f = fixture();
  const { state, cookie } = await f.begin();
  const mismatch = await f.finish(state, "");
  assert(
    mismatch.status === 400 && f.recorded.tokenExchanges === 0,
    "missing binding reached Apple token exchange",
  );
  assert(
    (await f.finish(state, cookie)).status === 302,
    "original bound callback failed",
  );
  const replay = await f.finish(state, cookie);
  assert(
    replay.status === 400 && Number(f.recorded.tokenExchanges) === 1 &&
      f.recorded.upserts === 1,
    "replay created a second session",
  );
});

Deno.test("Apple website rejects identity-token signature and nonce failures before account operations", async () => {
  for (const flag of ["badToken", "wrongNonce"] as const) {
    const f = fixture();
    f.options[flag] = true;
    const { state, cookie } = await f.begin();
    const response = await f.finish(state, cookie);
    assert(
      response.status === 400 && f.recorded.upserts === 0 &&
        f.recorded.loginCalls.length === 0,
      "invalid Apple identity reached account creation",
    );
    assert(
      !(await response.text()).includes("secret upstream"),
      "private token failure detail leaked",
    );
  }
});

Deno.test("Apple website requires Apple to verify every supplied email before account writes", async () => {
  for (const value of [false, "false", undefined, "", "TRUE", "1"]) {
    const f = fixture();
    f.options.emailVerified = value;
    const { state, cookie } = await f.begin();
    const response = await f.finish(state, cookie);
    assert(
      response.status === 400 && f.recorded.upserts === 0 &&
        f.recorded.loginCalls.length === 0 && f.recorded.links === 0,
      "unverified Apple email reached account writes",
    );
    assert(
      (await response.text()).includes("verify your email"),
      "unverified email error is not understandable",
    );
  }
  for (const value of [true, "true"]) {
    const f = fixture();
    f.options.emailVerified = value;
    const { state, cookie } = await f.begin();
    assert(
      (await f.finish(state, cookie)).status === 302 &&
        f.recorded.upserts === 1,
      "valid Apple verified-email encoding was rejected",
    );
  }
});

Deno.test("Apple website returning identities without a token email still reach the server-owned identity mapping", async () => {
  const f = fixture();
  f.options.omitEmail = true;
  f.options.emailVerified = undefined;
  f.options.existing = true;
  const { state, cookie } = await f.begin();
  const response = await f.finish(state, cookie, {
    user: JSON.stringify({ email: "untrusted@example.invalid" }),
  });
  assert(
    response.status === 302 && f.recorded.upsertEmail === "" &&
      f.recorded.upserts === 1,
    "returning identity was blocked or unsigned email replaced server-owned mapping",
  );
});

Deno.test("Apple website old in-flight state can sign in existing members but cannot create members without consent", async () => {
  for (const existing of [false, true]) {
    const f = fixture();
    f.options.existing = existing;
    const legacy = await createSignedAppleOAuthState({
      secret: SECRET,
      redirectTo: "https://www.weddingwin.ca/",
    });
    const binding = "A".repeat(43);
    f.attempts.set(legacy.state, { bindingSecret: binding, consumed: false });
    f.setNonce(legacy.nonce);
    const response = await f.finish(
      legacy.state,
      `__Host-ww_apple_oauth=${binding}`,
    );
    assert(
      response.status === (existing ? 302 : 400),
      "legacy consent handling changed account-creation guard",
    );
    if (existing) {
      assert(
        f.recorded.loginCalls[0].consent === null,
        "legacy state fabricated policy acceptance",
      );
    } else {assert(
        f.recorded.upserts === 0 && f.recorded.loginCalls.length === 0 &&
          f.recorded.links === 0,
        "missing ordinary login mutated an account",
      );}
    if (!existing) {
      assert(
        (await response.text()).includes("agree to the Terms"),
        "missing-consent recovery is not understandable",
      );
    }
  }
});

Deno.test("Apple website cancellation and upstream failures never expose upstream secrets", async () => {
  for (const mode of ["cancel", "token", "account"]) {
    const f = fixture();
    if (mode === "token") f.options.upstreamError = true;
    if (mode === "account") {
      f.options.loginError = "secret upstream detail with credentials";
    }
    const { state, cookie } = await f.begin();
    const response = await f.finish(
      state,
      cookie,
      mode === "cancel" ? { error: "secret upstream detail" } : {},
    );
    assert(
      response.status === 400 &&
        !(await response.text()).includes("secret upstream"),
      "provider error text leaked",
    );
    if (mode === "cancel") {
      assert(
        f.recorded.tokenExchanges === 0 && f.recorded.upserts === 0,
        "cancelled authorization still created an account",
      );
    }
  }
});

const DIAGNOSTIC_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function assertFailureDiagnostic(
  response: Response,
  diagnostics: AppleWebCallbackDiagnostic[],
  stage: AppleWebCallbackDiagnostic["stage"],
  category: AppleWebCallbackDiagnostic["category"],
) {
  assert(diagnostics.length === 1, "callback must record exactly one failure");
  const diagnostic = diagnostics[0];
  assert(
    Object.keys(diagnostic).sort().join() === "category,diagnosticId,stage",
    "diagnostic contains fields outside its allowlist",
  );
  assert(
    DIAGNOSTIC_UUID.test(diagnostic.diagnosticId),
    "diagnostic is not a generated UUID",
  );
  assert(
    diagnostic.stage === stage && diagnostic.category === category,
    "incorrect diagnostic stage/category",
  );
  assert(
    response.headers.get("X-WeddingWin-Apple-Diagnostic") ===
      diagnostic.diagnosticId,
    "response does not correlate to the failure log",
  );
  if (response.status === 303) {
    assert(
      new URL(response.headers.get("Location")!).searchParams.get(
        "diagnostic_id",
      ) === diagnostic.diagnosticId,
      "agreement recovery did not expose the diagnostic ID",
    );
  } else {
    assert(response.status === 400, "diagnostics changed error status");
    assert(
      (await response.text()).includes(
        `Diagnostic: ${diagnostic.diagnosticId}`,
      ),
      "error page lacks diagnostic ID",
    );
  }
  return diagnostic;
}

Deno.test("Apple callback request errors have safe generated diagnostics without changing account behavior", async () => {
  for (const method of ["GET", "POST", "malformed"]) {
    const f = fixture();
    const response = await f.callback(
      new Request(`${CALLBACK}?diagnostic_id=attacker-chosen-id`, {
        method: method === "GET" ? "GET" : "POST",
        ...(method === "GET" ? {} : {
          headers: {
            "Content-Type": method === "malformed"
              ? "text/plain"
              : "application/x-www-form-urlencoded",
          },
          body: "private-input-token=secret-input",
        }),
      }),
    );
    const diagnostic = await assertFailureDiagnostic(
      response,
      f.recorded.diagnostics,
      "request",
      method === "POST" ? "state_nonce" : "unknown",
    );
    assert(
      diagnostic.diagnosticId !== "attacker-chosen-id",
      "request chose diagnostic ID",
    );
    assert(
      f.recorded.tokenExchanges === 0 && f.recorded.upserts === 0,
      "request failure reached account operations",
    );
    assert(
      !JSON.stringify(diagnostic).includes("secret-input"),
      "request content leaked",
    );
  }
});

Deno.test("Apple callback distinguishes state, browser binding, provider, nonce and email failure stages", async () => {
  const cases = [
    ["state", "state", "state_nonce"],
    ["binding", "browser_binding", "state_nonce"],
    ["cancel", "provider_response", "provider"],
    ["code", "provider_response", "provider"],
    ["credentialsError", "credentials", "unknown"],
    ["upstreamError", "token_exchange", "provider"],
    ["malformedTokenResponse", "token_exchange", "provider"],
    ["missingToken", "token_exchange", "provider"],
    ["badToken", "identity_verification", "provider"],
    ["wrongNonce", "nonce_verification", "state_nonce"],
    ["email", "email_verification", "email_unavailable"],
  ] as const;
  for (const [mode, stage, category] of cases) {
    const f = fixture();
    const attempt = await f.begin();
    if (mode === "credentialsError") {
      f.options.credentialsError = "secret config path";
    } else if (mode === "email") f.options.emailVerified = false;
    else if (
      [
        "upstreamError",
        "malformedTokenResponse",
        "missingToken",
        "badToken",
        "wrongNonce",
      ].includes(mode)
    ) {
      Object.assign(f.options, { [mode]: true });
    }
    const response = await f.finish(
      mode === "state" ? "private-invalid-state" : attempt.state,
      mode === "binding" ? "" : attempt.cookie,
      mode === "cancel"
        ? { error: "private-provider-error-code" }
        : mode === "code"
        ? { code: "" }
        : {},
    );
    await assertFailureDiagnostic(
      response,
      f.recorded.diagnostics,
      stage,
      category,
    );
    assert(
      f.recorded.upserts === 0,
      "pre-login failure reached account writes",
    );
  }
});

Deno.test("Apple callback correlates grant email failures without copying claims or granting an account", async () => {
  const f = fixture({ withGrant: true });
  f.options.omitEmail = true;
  f.options.emailVerified = undefined;
  f.options.grantError =
    "Apple could not verify your account email. Please start again with Apple.";
  const { state, cookie } = await f.begin();
  const response = await f.finish(state, cookie, {
    email: "untrusted@example.invalid",
    user: JSON.stringify({
      email: "untrusted@example.invalid",
      name: { firstName: "PRIVATE-NAME" },
    }),
  });
  const diagnostic = await assertFailureDiagnostic(
    response,
    f.recorded.diagnostics,
    "grant_validation",
    "email_unavailable",
  );
  assert(
    f.recorded.grantDiagnosticIds[0] === diagnostic.diagnosticId,
    "grant boolean diagnostics cannot correlate to callback",
  );
  assert(
    f.recorded.upserts === 0 && f.recorded.loginCalls.length === 0 &&
      f.recorded.links === 0,
    "missing proof created account state",
  );
  assert(
    !JSON.stringify(diagnostic).includes("PRIVATE-NAME"),
    "optional Apple user data leaked",
  );
});

Deno.test("Apple callback missing refresh grant remains a failure before invoking grant or account code", async () => {
  const f = fixture({ withGrant: true });
  f.options.missingRefresh = true;
  const { state, cookie } = await f.begin();
  const response = await f.finish(state, cookie);
  await assertFailureDiagnostic(
    response,
    f.recorded.diagnostics,
    "grant_validation",
    "provider",
  );
  assert(
    f.recorded.grantDiagnosticIds.length === 0 && f.recorded.upserts === 0,
    "missing grant reached account creation",
  );
});

Deno.test("Apple callback reports account operation stages and restores wrapper stage for post-login failures", async () => {
  for (
    const [option, stage, message, category] of [
      [
        "upsertError",
        "account_upsert",
        "Apple could not verify the account owner. Please contact WeddingWin for help.",
        "account_binding",
      ],
      [
        "loginError",
        "account_login",
        "private account-service error",
        "unknown",
      ],
      ["linkError", "profile_link", "private profile-link error", "unknown"],
      [
        "postGrantError",
        "grant_validation",
        "private storage/lease error",
        "unknown",
      ],
      [
        "grantError",
        "grant_validation",
        "Apple could not verify this sign-in. Please try again.",
        "state_nonce",
      ],
    ] as const
  ) {
    const f = fixture({ withGrant: true });
    f.options[option] = message;
    const { state, cookie } = await f.begin();
    const response = await f.finish(state, cookie);
    await assertFailureDiagnostic(
      response,
      f.recorded.diagnostics,
      stage,
      category,
    );
  }
});

Deno.test("Apple callback adds diagnostic IDs to existing role error redirects without changing role or destination", async () => {
  for (
    const [message, expectedError] of [
      ["APPLE_SIGNUP_ROLE_MISMATCH", "account_type_mismatch"],
      ["APPLE_SIGNUP_ROLE_UNAVAILABLE", "sign_in_unavailable"],
    ]
  ) {
    const f = fixture();
    f.options.loginError = message;
    const { state, cookie } = await f.begin(
      postStart({ signup_role: "vendor" }),
    );
    const response = await f.finish(state, cookie);
    await assertFailureDiagnostic(
      response,
      f.recorded.diagnostics,
      "account_login",
      "account_binding",
    );
    const location = new URL(response.headers.get("Location")!);
    assert(
      location.origin === "https://www.weddingwin.ca" &&
        location.pathname === "/auth/apple-start",
      "error redirect destination changed",
    );
    assert(
      location.searchParams.get("signup_role") === "vendor" &&
        location.searchParams.get("error") === expectedError,
      "error recovery lost role or error",
    );
    assert(
      response.headers.get("Cache-Control") === "no-store",
      "error recovery became cacheable",
    );
    assert(f.recorded.links === 0, "role rejection linked an account");
  }
});

Deno.test("Apple callback generates distinct IDs and tolerates diagnostic sink failure", async () => {
  const ids = new Set<string>();
  const f = fixture({ diagnosticThrows: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await f.callback(new Request(CALLBACK));
    const diagnostic = f.recorded.diagnostics[attempt];
    assert(
      response.status === 400 &&
        (await response.text()).includes(diagnostic.diagnosticId),
      "logging failure changed recovery response",
    );
    ids.add(diagnostic.diagnosticId);
  }
  assert(
    ids.size === 2,
    "different callback requests reused one diagnostic ID",
  );
  assert(
    f.recorded.tokenExchanges === 0 && f.recorded.upserts === 0,
    "logging failure changed authentication behavior",
  );
});

Deno.test("Apple callback default logger emits only finite metadata, never raw provider or account content", async () => {
  const logs: unknown[][] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => logs.push(args);
  try {
    const f = fixture({ defaultLogger: true, withGrant: true });
    const privateValue =
      "PRIVATE-UNSAFE-ERROR email@example.invalid token=private-code <script>private</script>";
    f.options.grantError = privateValue;
    const { state, cookie } = await f.begin();
    const response = await f.finish(state, cookie, {
      error_description: privateValue,
      diagnostic_id: privateValue,
    });
    const body = await response.text();
    assert(
      logs.length === 1 && logs[0][0] === "apple-web-callback:failure",
      "missing production failure log",
    );
    const diagnostic = logs[0][1] as AppleWebCallbackDiagnostic;
    assert(
      Object.keys(diagnostic).sort().join() === "category,diagnosticId,stage",
      "production logger copied unrestricted fields",
    );
    assert(
      diagnostic.category === "unknown" &&
        diagnostic.stage === "grant_validation",
      "arbitrary error changed finite classification",
    );
    const output = JSON.stringify(logs) + body +
      JSON.stringify([...response.headers]);
    for (
      const forbidden of [
        privateValue,
        "private-code",
        "email@example.invalid",
        "offline-signed-token-placeholder",
        "offline-refresh-token-placeholder",
        "never-display-client-secret",
        state,
        cookie,
      ]
    ) {
      assert(
        !output.includes(forbidden),
        "diagnostics exposed a sensitive value",
      );
    }
    assert(
      body.includes(diagnostic.diagnosticId),
      "safe output lacks correlation ID",
    );
  } finally {
    console.info = original;
  }
});

Deno.test("successful Apple callback has no failure diagnostic and preserves normal login redirect", async () => {
  for (const withGrant of [false, true]) {
    const f = fixture({ withGrant });
    const { state, cookie } = await f.begin();
    const response = await f.finish(state, cookie);
    assert(
      response.status === 302 &&
        response.headers.get("Location") ===
          "https://www.weddingwin.ca/login/fromsignup/offline-test",
      "diagnostics changed successful redirect",
    );
    assert(
      !response.headers.has("X-WeddingWin-Apple-Diagnostic") &&
        f.recorded.diagnostics.length === 0,
      "successful callback emitted a failure",
    );
    assert(
      f.recorded.upserts === 1 && f.recorded.links === 1,
      "successful callback account sequence changed",
    );
  }
});

Deno.test("Apple website uses matching server-resolved redeemed email while preserving signed role and consent", async () => {
  for (const [role, plan] of [["vendor", "17"], ["couple", "18"]] as const) {
    const resolvedEmail = "redeemed-verified@example.invalid";
    const f = fixture({ withGrant: true, resolvedGrantEmail: resolvedEmail });
    f.options.omitEmail = true;
    f.options.emailVerified = undefined;
    const { state, cookie } = await f.begin(postStart({ signup_role: role }));
    const response = await f.finish(state, cookie, {
      email: "untrusted-form@example.invalid",
      user: JSON.stringify({
        email: "untrusted-user@example.invalid",
        name: { firstName: "Optional" },
      }),
      verifiedClaims: JSON.stringify({
        email: "untrusted-context@example.invalid",
        email_verified: true,
      }),
      signup_role: "admin",
      subscription_id: "4",
    });
    assert(
      response.status === 302 && f.recorded.diagnostics.length === 0,
      "resolved verified email did not finish signup",
    );
    const original = f.recorded.originalClaims[0];
    const forwarded = f.recorded.upsertClaims[0];
    assert(
      forwarded.email === resolvedEmail && forwarded.email_verified === true &&
        f.recorded.upsertEmail === resolvedEmail,
      "upsert lost the grant wrapper's verified email",
    );
    for (const key of ["sub", "aud", "iss", "nonce"] as const) {
      assert(
        forwarded[key] === original[key],
        "resolved claims changed Apple identity binding",
      );
    }
    assert(
      original.email === undefined && original.email_verified === undefined,
      "callback mutated original signed claims",
    );
    const login = f.recorded.loginCalls[0];
    const signed = await verifySignedAppleOAuthState(state, SECRET);
    assert(
      login.email === resolvedEmail && login.subscriptionId === plan &&
        login.expectedSignupRole === role,
      "resolved email changed account-role handling",
    );
    assert(
      JSON.stringify(login.consent) === JSON.stringify(signed.c),
      "resolved email changed signed consent",
    );
    assert(
      f.recorded.createdPlans.join() === plan && f.recorded.links === 1,
      "resolved email changed account creation sequence",
    );
  }
});

Deno.test("Apple website keeps original verified claims without a resolved grant context", async () => {
  for (const withGrant of [false, true]) {
    const f = fixture({ withGrant });
    const { state, cookie } = await f.begin();
    const response = await f.finish(state, cookie, {
      email: "untrusted-form@example.invalid",
      user: JSON.stringify({ email: "untrusted-user@example.invalid" }),
      verifiedClaims: JSON.stringify({
        email: "untrusted-context@example.invalid",
        email_verified: true,
      }),
    });
    assert(response.status === 302, "legacy/no-context callback was rejected");
    assert(
      f.recorded.upsertClaims[0] === f.recorded.originalClaims[0],
      "no-context callback replaced original verified claims",
    );
    assert(
      f.recorded.upsertEmail === "couple@example.invalid" &&
        f.recorded.loginCalls[0].email === "couple@example.invalid",
      "unsigned form email replaced signed identity email",
    );
  }
});

Deno.test("Apple website preserves exact enrolled profile/member context with recovered email", async () => {
  const f = fixture({
    withGrant: true,
    resolvedGrantEmail: "recovered@example.invalid",
    boundGrantAccount: true,
  });
  f.options.existing = true;
  f.options.existingPlan = "17";
  f.options.omitEmail = true;
  f.options.emailVerified = undefined;
  const { state, cookie } = await f.begin(postStart({ signup_role: "vendor" }));
  const response = await f.finish(state, cookie);
  assert(response.status === 302, "enrolled resolved-email login failed");
  assert(
    f.recorded.expectedProfileIds[0] === "offline-bound-profile" &&
      f.recorded.loginCalls[0].expectedBdMemberId === "offline-bound-member",
    "resolved email dropped immutable ownership checks",
  );
  assert(
    f.recorded.createdPlans.length === 0,
    "enrolled login created a replacement account",
  );
});

Deno.test("Apple website never takes a client-supplied verified-claims context for an email-less returning identity", async () => {
  const f = fixture({ withGrant: true });
  f.options.omitEmail = true;
  f.options.emailVerified = undefined;
  f.options.existing = true;
  const { state, cookie } = await f.begin();
  const response = await f.finish(state, cookie, {
    email: "attacker@example.invalid",
    user: JSON.stringify({ email: "attacker@example.invalid" }),
    verifiedClaims: JSON.stringify({
      email: "attacker@example.invalid",
      email_verified: true,
    }),
  });
  assert(
    response.status === 302 && f.recorded.upsertEmail === "",
    "unsigned client context replaced server-owned returning identity lookup",
  );
  assert(
    f.recorded.upsertClaims[0] === f.recorded.originalClaims[0] &&
      !f.recorded.upsertClaims[0].email,
    "unsigned claims became authenticated claims",
  );
});

Deno.test("Apple website resolved context does not bypass the existing original-email verification guard", async () => {
  const f = fixture({
    withGrant: true,
    resolvedGrantEmail: "recovered@example.invalid",
  });
  f.options.emailVerified = false;
  const { state, cookie } = await f.begin();
  const response = await f.finish(state, cookie);
  await assertFailureDiagnostic(
    response,
    f.recorded.diagnostics,
    "email_verification",
    "email_unavailable",
  );
  assert(
    f.recorded.upserts === 0 && f.recorded.grantDiagnosticIds.length === 0,
    "unverified original email bypassed existing guard",
  );
});
