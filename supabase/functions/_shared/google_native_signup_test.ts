import { exportJWK, generateKeyPair, SignJWT } from "npm:jose@5.9.6";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policy_consent.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
type Handler = (request: Request) => Promise<Response>;
let startHandler: Handler;
let callbackHandler: Handler;
let verifyState:
  typeof import("../google-oauth-callback/index.ts").verifyGoogleState;
let activeFetch: typeof fetch | undefined;
const offlineFetch: typeof fetch = (input, init) => {
  if (!activeFetch) throw new Error("Offline Google fixture is inactive");
  return activeFetch(input, init);
};
const keyPair = await generateKeyPair("RS256");
const publicJwk = {
  ...await exportJWK(keyPair.publicKey),
  kid: "offline-test-key",
  alg: "RS256",
  use: "sig",
};

async function fixture(
  run: (f: {
    start: (query?: string) => Promise<Response>;
    begin: (
      role?: "vendor" | "couple",
      includeConsent?: boolean,
    ) => Promise<{ state: string; cookie: string; nonce: string }>;
    finish: (
      attempt: { state: string; cookie: string; nonce: string },
      oauthError?: string,
      authorizationCode?: string,
    ) => Promise<Response>;
    callbackRequest: (url: string | URL, cookie?: string) => Promise<Response>;
    verify: typeof verifyState;
    records: {
      creates: URLSearchParams[];
      updates: URLSearchParams[];
      exchanges: Record<string, unknown>[];
      tokenRequests: number;
      attempts: number;
      redemptions: number;
      cacheReads: number;
      logs: unknown[][];
    };
    existing: (plan: string) => void;
    race: (plan: string) => void;
    redemptionError: (message: string) => void;
    bdReadResponse: (read: "search" | "full", response: Response | Error) => void;
  }) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const originalWarn = console.warn;
  const originalError = console.error;
  const settings: Record<string, string> = {
    SUPABASE_URL: "https://offline-google-db.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "offline-only-service-key",
    BD_API_BASE_URL: "https://offline-google-bd.example.invalid",
    BD_API_KEY: "offline-only-bd-key",
    BD_DEFAULT_SUBSCRIPTION_ID: "18",
    APP_LOGIN_SECRET: "offline-google-signup-state-secret",
  };
  const previous = new Map(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  const records = {
    creates: [] as URLSearchParams[],
    updates: [] as URLSearchParams[],
    exchanges: [] as Record<string, unknown>[],
    tokenRequests: 0,
    attempts: 0,
    redemptions: 0,
    cacheReads: 0,
    logs: [] as unknown[][],
  };
  let member: Record<string, unknown> | undefined;
  let racePlan = "";
  let idToken = "";
  let storedAttempt: Record<string, unknown> | undefined;
  let attemptConsumed = false;
  let redemptionErrorMessage = "";
  const bdReadResponses = new Map<"search" | "full", Response | Error>();
  const mockedBdRead = (read: "search" | "full") => {
    const response = bdReadResponses.get(read);
    if (response instanceof Error) throw response;
    return response?.clone();
  };
  const existing = (plan: string) => {
    member = {
      user_id: "offline-google-member",
      email: "native-google@example.invalid",
      subscription_id: plan,
      active: "2",
    };
  };
  try {
    console.warn = (...args: unknown[]) => records.logs.push(args);
    console.error = (...args: unknown[]) => records.logs.push(args);
    for (const [key, value] of Object.entries(settings)) {
      Deno.env.set(key, value);
    }
    activeFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method || "GET";
      if (url.origin === settings.SUPABASE_URL) {
        if (url.pathname === "/rest/v1/admin_config" && method === "GET") {
          return Response.json(
            url.searchParams.get("key")?.startsWith("eq.")
              ? { key: "google_client_id", value: "offline-google-client" }
              : [{ key: "google_client_id", value: "offline-google-client" }, {
                key: "google_client_secret",
                value: "offline-client-secret",
              }],
          );
        }
        if (
          url.pathname === "/rest/v1/oauth_login_attempts" && method === "POST"
        ) {
          storedAttempt = JSON.parse(String(init?.body));
          records.attempts++;
          return new Response(null, { status: 201 });
        }
        if (
          url.pathname === "/rest/v1/rpc/redeem_oauth_login_attempt" &&
          method === "POST"
        ) {
          const body = JSON.parse(String(init?.body));
          records.redemptions++;
          if (redemptionErrorMessage) {
            return Response.json({ message: redemptionErrorMessage }, { status: 500 });
          }
          const valid = !attemptConsumed &&
            body.p_provider === storedAttempt?.provider &&
            body.p_state_hash === storedAttempt?.state_hash &&
            body.p_binding_hash === storedAttempt?.binding_hash;
          if (valid) attemptConsumed = true;
          return Response.json(valid);
        }
        if (url.pathname === "/rest/v1/bd_users_cache" && method === "GET") {
          records.cacheReads++;
          return Response.json([{
            user_id: "offline-google-member",
            token: "offline-stable-token",
            cookie: "offline-stable-cookie",
          }]);
        }
        if (
          url.pathname === "/rest/v1/app_native_auth_exchanges" &&
          method === "POST"
        ) {
          records.exchanges.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 201 });
        }
      }
      if (url.origin === settings.BD_API_BASE_URL) {
        if (url.pathname === "/api/v2/user/get" && method === "GET") {
          return mockedBdRead("search") || Response.json({
            status: "success",
            message: member ? [member] : [],
          });
        }
        if (
          url.pathname === "/api/v2/user/get/offline-google-member" &&
          method === "GET"
        ) return mockedBdRead("full") || Response.json({ status: "success", message: member });
        const body = new URLSearchParams(String(init?.body || ""));
        if (url.pathname === "/api/v2/user/create" && method === "POST") {
          records.creates.push(body);
          existing(racePlan || body.get("subscription_id") || "");
          return racePlan
            ? Response.json({
              status: "error",
              message: "Email already exists",
            }, { status: 409 })
            : Response.json({ status: "success", message: member });
        }
        if (url.pathname === "/api/v2/user/update" && method === "PUT") {
          assert(
            !body.has("subscription_id") && !body.has("active"),
            "Google login changed existing membership",
          );
          records.updates.push(body);
          return Response.json({ status: "success", message: member });
        }
      }
      if (
        url.origin === "https://oauth2.googleapis.com" &&
        url.pathname === "/token"
      ) {
        records.tokenRequests++;
        return Response.json({ id_token: idToken });
      }
      if (
        url.origin === "https://www.googleapis.com" &&
        url.pathname === "/oauth2/v3/certs"
      ) return Response.json({ keys: [publicJwk] });
      throw new Error(
        `Unexpected offline Google request: ${method} ${url.origin}${url.pathname}`,
      );
    };
    globalThis.fetch = offlineFetch;
    if (!startHandler) {
      let captured: Handler | undefined;
      Deno.serve = ((handler: Handler) => {
        captured = handler;
        return {};
      }) as typeof Deno.serve;
      await import("../google-oauth-start/index.ts");
      startHandler = captured!;
      const callback = await import("../google-oauth-callback/index.ts");
      callbackHandler = captured!;
      verifyState = callback.verifyGoogleState;
    }
    Deno.serve = originalServe;
    const defaultParams = (includeConsent = true) =>
      new URLSearchParams({
        redirect_to: "weddingwin://bd-login",
        code_challenge: "A".repeat(43),
        ...(includeConsent ? {
          accepted_terms: "1",
          accepted_privacy: "1",
          accepted_at: new Date().toISOString(),
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
        } : {}),
      });
    const start = (query = "", includeConsent = true) =>
      startHandler(
        new Request(
          `https://offline-google-db.example.invalid/functions/v1/google-oauth-start?${defaultParams(includeConsent)}${
            query ? `&${query}` : ""
          }`,
        ),
      );
    const begin = async (role?: "vendor" | "couple", includeConsent = true) => {
      let response = await start(
        role
          ? `signup_role=${role}&subscription_id=${
            role === "vendor" ? "17" : "18"
          }`
          : "subscription_id=17",
        includeConsent,
      );
      assert(response.status === 302, "Google authorization did not start");
      let location = new URL(response.headers.get("Location")!);
      const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
      if (
        location.origin === settings.SUPABASE_URL &&
        location.pathname === "/functions/v1/google-oauth-start"
      ) {
        assert(location.searchParams.has("ww_cookie_check"), "missing cookie continuation marker");
        assert(records.attempts === 0, "cold start created an unconfirmed login attempt");
        response = await startHandler(new Request(location, { headers: { Cookie: cookie } }));
        assert(response.status === 302, "cookie confirmation did not continue authorization");
        location = new URL(response.headers.get("Location")!);
        assert(
          response.headers.get("Set-Cookie")!.split(";")[0] === cookie,
          "cookie confirmation replaced the established binding",
        );
      }
      assert(location.origin === "https://accounts.google.com", "Google start looped or changed provider");
      return {
        state: location.searchParams.get("state")!,
        nonce: location.searchParams.get("nonce")!,
        cookie,
      };
    };
    const finish = async (
      attempt: { state: string; cookie: string; nonce: string },
      oauthError?: string,
      authorizationCode = "offline-code",
    ) => {
      idToken = await new SignJWT({
        email: "native-google@example.invalid",
        email_verified: true,
        name: "Offline Google",
        nonce: attempt.nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid: "offline-test-key" })
        .setIssuer("https://accounts.google.com").setAudience(
          "offline-google-client",
        ).setSubject("offline-google-subject").setIssuedAt().setExpirationTime(
          "5m",
        ).sign(keyPair.privateKey);
      return callbackHandler(
        new Request(
          `https://offline-google-db.example.invalid/functions/v1/google-oauth-callback?${new URLSearchParams(
            oauthError
              ? { error: oauthError, state: attempt.state }
              : { code: authorizationCode, state: attempt.state },
          )}`,
          { headers: { Cookie: attempt.cookie } },
        ),
      );
    };
    await run({
      start,
      begin,
      finish,
      callbackRequest: (url, cookie = "") => callbackHandler(new Request(url, {
        headers: { Cookie: cookie },
      })),
      verify: verifyState,
      records,
      existing,
      race: (plan) => {
        racePlan = plan;
      },
      redemptionError: (message) => {
        redemptionErrorMessage = message;
      },
      bdReadResponse: (read, response) => {
        bdReadResponses.set(read, response);
      },
    });
  } finally {
    Deno.serve = originalServe;
    console.warn = originalWarn;
    console.error = originalError;
    globalThis.fetch = originalFetch;
    activeFetch = undefined;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

function mutateState(state: string, value: unknown, remove = false) {
  const b64 = state.replaceAll("-", "+").replaceAll("_", "/");
  const parsed = JSON.parse(
    atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")),
  );
  if (remove) delete parsed.g;
  else parsed.g = value;
  return btoa(JSON.stringify(parsed)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
}

function assertCallbackDiagnostic(
  logs: unknown[][],
  reason: string,
  privateValues: string[] = [],
) {
  const expected = [
    ...(reason === "attempt_unavailable"
      ? [["OAuth login attempt redemption failed."]]
      : []),
    [JSON.stringify({ event: "google_oauth_callback_failed", reason })],
  ];
  const serialized = JSON.stringify(logs);
  assert(
    serialized === JSON.stringify(expected),
    "callback logs must contain only the fixed event and safe reason",
  );
  for (const value of privateValues) {
    assert(value && !serialized.includes(value), "callback log exposed private input");
  }
}

Deno.test("Google callback stops after one absent or malformed cookie continuation before redemption", async () => {
  for (const cookie of ["", "__Host-ww_google_oauth=PRIVATE-malformed-binding"]) {
    await fixture(async (f) => {
      const attempt = await f.begin();
      const code = "PRIVATE-authorization-code";
      const first = await f.finish({ ...attempt, cookie }, undefined, code);
      const continuation = new URL(first.headers.get("Location")!);
      assert(
        continuation.origin === "https://offline-google-db.example.invalid" &&
          continuation.searchParams.has("ww_callback_cookie_check") &&
          !first.headers.has("Set-Cookie"),
        "missing binding must only re-request the trusted callback once",
      );
      const response = await f.callbackRequest(continuation, cookie);
      const target = new URL(response.headers.get("Location")!);
      assert(
        target.searchParams.get("error") === "google_sign_in_failed" &&
          target.searchParams.get("error_description") ===
            "Your Google sign-in was interrupted or expired. Please close this window and tap Sign in with Google again." &&
          [...target.searchParams.keys()].length === 2,
        "diagnostics changed the public native error contract",
      );
      assertCallbackDiagnostic(f.records.logs, "binding_missing", [
        attempt.state, attempt.cookie, attempt.nonce, code, "PRIVATE-malformed-binding",
      ]);
      assert(
        f.records.redemptions === 0 && f.records.tokenRequests === 0 &&
          f.records.creates.length === 0 && f.records.updates.length === 0 &&
          f.records.exchanges.length === 0,
        "missing browser binding reached authentication operations",
      );
    });
  }
});

Deno.test("Google callback distinguishes a rejected bound attempt without logging secrets", async () => {
  await fixture(async (f) => {
    const attempt = await f.begin();
    const cookie = `__Host-ww_google_oauth=${"Z".repeat(43)}`;
    const code = "PRIVATE-authorization-code";
    const response = await f.finish({ ...attempt, cookie }, undefined, code);
    assert(
      new URL(response.headers.get("Location")!).searchParams.get("error") ===
        "google_sign_in_failed",
      "mismatched binding was accepted",
    );
    assertCallbackDiagnostic(f.records.logs, "attempt_rejected", [
      attempt.state, attempt.cookie, attempt.nonce, cookie, code,
    ]);
    assert(
      f.records.redemptions === 1 && f.records.tokenRequests === 0 &&
        f.records.creates.length === 0 && f.records.updates.length === 0 &&
        f.records.exchanges.length === 0,
      "rejected attempt reached provider or identity operations",
    );
  });
});

Deno.test("Google callback distinguishes unavailable redemption and redacts database diagnostics", async () => {
  await fixture(async (f) => {
    const attempt = await f.begin();
    const code = "PRIVATE-authorization-code";
    const privateError = `PRIVATE-database-error ${attempt.state} ${attempt.cookie} ${code} private@example.invalid`;
    f.redemptionError(privateError);
    const response = await f.finish(attempt, undefined, code);
    const location = response.headers.get("Location")!;
    assert(
      new URL(location).searchParams.get("error_description") ===
        "Google sign-in could not be completed. Please try again.",
      "redemption outage changed the safe error message",
    );
    assertCallbackDiagnostic(f.records.logs, "attempt_unavailable", [
      attempt.state, attempt.cookie, attempt.nonce, code, privateError,
      "private@example.invalid",
    ]);
    assert(!location.includes("PRIVATE"), "database diagnostics leaked into redirect");
    assert(
      f.records.redemptions === 1 && f.records.tokenRequests === 0 &&
        f.records.creates.length === 0 && f.records.updates.length === 0 &&
        f.records.exchanges.length === 0,
      "redemption outage reached provider or identity operations",
    );
  });
});

Deno.test("Google callback logs missing authorization code only after valid binding redemption", async () => {
  await fixture(async (f) => {
    const attempt = await f.begin();
    const response = await f.finish(attempt, undefined, "");
    const target = new URL(response.headers.get("Location")!);
    assert(
      target.searchParams.get("error") === "google_sign_in_failed" &&
        !target.searchParams.has("exchange_code"),
      "missing authorization code produced success",
    );
    assertCallbackDiagnostic(f.records.logs, "authorization_code_missing", [
      attempt.state, attempt.cookie, attempt.nonce,
    ]);
    assert(
      f.records.redemptions === 1 && f.records.tokenRequests === 0 &&
        f.records.creates.length === 0 && f.records.updates.length === 0 &&
        f.records.exchanges.length === 0,
      "missing authorization code skipped redemption or reached provider operations",
    );
  });
});

Deno.test("Google successful and cancelled callbacks do not emit failure diagnostics", async () => {
  for (const oauthError of [undefined, "access_denied"]) {
    await fixture(async (f) => {
      f.existing("18");
      const attempt = await f.begin();
      const response = await f.finish(attempt, oauthError);
      const target = new URL(response.headers.get("Location")!);
      assert(
        oauthError
          ? target.searchParams.get("error") === "access_denied"
          : target.searchParams.get("ok") === "1",
        "expected success or cancellation response",
      );
      assert(f.records.logs.length === 0, "success or cancellation was logged as a failure");
    });
  }
});

Deno.test("Google native signup carries explicit role through signed state, provider verification and exact-plan account creation", async () => {
  for (const role of ["vendor", "couple"] as const) {
    await fixture(async (f) => {
      const attempt = await f.begin(role);
      const state = await f.verify(attempt.state);
      assert(
        state.g === role && state.s === (role === "vendor" ? "17" : "18"),
        "Google signed state lost explicit role",
      );
      const response = await f.finish(attempt);
      const location = new URL(response.headers.get("Location")!);
      assert(
        location.searchParams.get("ok") === "1" &&
          f.records.creates.length === 1 &&
          f.records.creates[0].get("subscription_id") === state.s &&
          f.records.exchanges.length === 1,
        "Google signup did not create or hand off the selected account plan",
      );
      const payload = f.records.exchanges[0].payload as {
        user: { subscription_id: string };
      };
      assert(
        payload.user.subscription_id === state.s,
        "native Google exchange changed the membership plan",
      );
    });
  }
});

Deno.test("Google explicit signup blocks conflicting existing accounts without membership or session writes", async () => {
  for (
    const [role, plan] of [["vendor", "18"], ["couple", "17"], [
      "vendor",
      "38",
    ]] as const
  ) {
    await fixture(async (f) => {
      f.existing(plan);
      const response = await f.finish(await f.begin(role));
      const location = new URL(response.headers.get("Location")!);
      assert(
        location.searchParams.get("error") === "google_app_bridge_failed" &&
          location.searchParams.get("error_description")?.includes(
            "Sign in to your existing account",
          ),
        "Google membership mismatch was not explained",
      );
      assert(
        f.records.creates.length === 0 && f.records.updates.length === 0 &&
          f.records.exchanges.length === 0 && f.records.cacheReads === 0,
        "Google mismatch wrote to an existing account or issued a session",
      );
    });
  }
});

Deno.test("Google ordinary login without signup consent preserves existing membership", async () => {
  for (const plan of ["18", "17", "38"]) {
    await fixture(async (f) => {
      f.existing(plan);
      const attempt = await f.begin(undefined, false);
      assert(
        (await f.verify(attempt.state)).g === undefined &&
          (await f.verify(attempt.state)).c === null,
        "ordinary login invented signup intent or consent",
      );
      const response = await f.finish(attempt);
      assert(
        new URL(response.headers.get("Location")!).searchParams.get("ok") ===
            "1" && f.records.creates.length === 0,
        "ordinary existing-member login was blocked by picker role",
      );
    });
  }
});

Deno.test("Google ordinary login explains a confirmed missing account without attempting signup", async () => {
  await fixture(async (f) => {
    const response = await f.finish(await f.begin(undefined, false));
    const target = new URL(response.headers.get("Location")!);
    assert(
      target.searchParams.get("error") === "google_app_bridge_failed" &&
        target.searchParams.get("error_description") ===
          "No WeddingWin account uses this Google email yet. Please create an account, then sign in with Google." &&
        !target.searchParams.has("exchange_code"),
      "missing-account login did not give an actionable error",
    );
    assert(
      f.records.creates.length === 0 && f.records.updates.length === 0 &&
        f.records.exchanges.length === 0 && f.records.cacheReads === 0,
      "ordinary missing-account login attempted account or session changes",
    );
  });
});

Deno.test("Google legacy signup with current consent and no explicit role still creates the selected plan", async () => {
  await fixture(async (f) => {
    const attempt = await f.begin();
    const state = await f.verify(attempt.state);
    assert(state.g === undefined && state.c !== null, "legacy signup fixture lost consent");
    const response = await f.finish(attempt);
    assert(
      new URL(response.headers.get("Location")!).searchParams.get("ok") === "1" &&
        f.records.creates.length === 1 &&
        f.records.creates[0].get("subscription_id") === "17" &&
        f.records.creates[0].get("signup_terms_version") === CURRENT_TERMS_VERSION &&
        f.records.creates[0].get("signup_privacy_version") === CURRENT_PRIVACY_VERSION &&
        f.records.exchanges.length === 1,
      "legacy consented signup lost its selected plan, recorded consent or session",
    );
  });
});

Deno.test("Google member search errors and malformed replies fail closed for ordinary login and consented signup", async () => {
  const failures = [
    Response.json({ status: "success", message: [] }, { status: 503 }),
    Response.json({ status: "error", message: "PRIVATE database failure" }),
    new Response("PRIVATE invalid JSON"),
    Response.json(null),
    Response.json({ status: "success", message: {} }),
    Response.json({ status: "success", message: [null] }),
    Response.json({ status: "success", message: [{ email: "native-google@example.invalid" }] }),
    new Error("PRIVATE backend network failure"),
  ];
  for (const includeConsent of [false, true]) {
    for (const failure of failures) {
      await fixture(async (f) => {
        f.bdReadResponse("search", failure);
        const response = await f.finish(await f.begin(undefined, includeConsent));
        const target = new URL(response.headers.get("Location")!);
        assert(
          target.searchParams.get("error") === "google_app_bridge_failed" &&
            target.searchParams.get("error_description") ===
              "WeddingWin could not check your account right now. Please try again shortly." &&
            !target.searchParams.has("exchange_code"),
          "member search failure was exposed or mistaken for an absent account",
        );
        assert(
          f.records.creates.length === 0 && f.records.updates.length === 0 &&
            f.records.exchanges.length === 0 && f.records.cacheReads === 0,
          "failed member search created an account or session",
        );
      });
    }
  }
});

Deno.test("Google full member read failures cannot become account creation or an incorrect session", async () => {
  const failures = [
    Response.json({ status: "success", message: {} }, { status: 503 }),
    Response.json({ status: "error", message: "PRIVATE full-read failure" }),
    new Response("PRIVATE invalid JSON"),
    Response.json(null),
    Response.json({ status: "success", message: [] }),
    Response.json({ status: "success", message: [{ user_id: "offline-google-member", email: "native-google@example.invalid" }, {}] }),
    Response.json({ status: "success", message: { email: "native-google@example.invalid" } }),
    Response.json({ status: "success", message: { user_id: "different-member", email: "native-google@example.invalid" } }),
    Response.json({ status: "success", message: { user_id: "offline-google-member", email: "different@example.invalid" } }),
    new Error("PRIVATE full-read network failure"),
  ];
  for (const includeConsent of [false, true]) {
    for (const failure of failures) {
      await fixture(async (f) => {
        f.existing("18");
        f.bdReadResponse("full", failure);
        const response = await f.finish(await f.begin(undefined, includeConsent));
        const target = new URL(response.headers.get("Location")!);
        assert(
          target.searchParams.get("error") === "google_app_bridge_failed" &&
            target.searchParams.get("error_description") ===
              "WeddingWin could not check your account right now. Please try again shortly." &&
            !target.searchParams.has("exchange_code"),
          "full member read failure was exposed or mistaken for an absent account",
        );
        assert(
          f.records.creates.length === 0 && f.records.updates.length === 0 &&
            f.records.exchanges.length === 0 && f.records.cacheReads === 0,
          "failed full member read created an account or session",
        );
      });
    }
  }
});

Deno.test("Google signup rejects role insertion, removal and tampering before provider exchange", async () => {
  for (const role of [undefined, "vendor", "couple"] as const) {
    await fixture(async (f) => {
      const attempt = await f.begin(role);
      for (
        const change of [
          undefined,
          "vendor",
          "couple",
          "vendor_show",
          "admin",
          "17",
        ]
      ) {
        if (change === role) continue;
        const altered = {
          ...attempt,
          state: mutateState(attempt.state, change, change === undefined),
        };
        const response = await f.finish(altered);
        assert(
          response.status === 400 && f.records.tokenRequests === 0 &&
            f.records.creates.length === 0 && f.records.redemptions === 0 &&
            !response.headers.has("Location"),
          "tampered signup intent reached provider or account operations",
        );
        assert(
          response.headers.get("Content-Type") ===
              "text/plain; charset=utf-8" &&
            !(await response.text()).includes("<"),
          "unverified state must fail without HTML source or a native redirect",
        );
      }
    });
  }
});

Deno.test("Google callback recovers only when its one continuation supplies the original binding", async () => {
  await fixture(async (f) => {
    f.existing("18");
    const attempt = await f.begin();
    const response = await f.finish({ ...attempt, cookie: "" });
    assert(
      response.status === 302,
      "verified missing binding did not request one continuation",
    );
    const target = new URL(response.headers.get("Location")!);
    assert(
      target.origin === "https://offline-google-db.example.invalid" &&
        target.pathname === "/functions/v1/google-oauth-callback" &&
        target.searchParams.has("ww_callback_cookie_check") &&
        target.searchParams.get("state") === attempt.state &&
        target.searchParams.get("code") === "offline-code" &&
        !response.headers.has("Set-Cookie") &&
        !target.searchParams.has("exchange_code") &&
        !target.searchParams.has("ok"),
      "cookie failure produced an unsafe or successful callback",
    );
    assert(
      f.records.redemptions === 0 && f.records.tokenRequests === 0 &&
        f.records.exchanges.length === 0 && f.records.creates.length === 0 &&
        f.records.updates.length === 0,
      "missing browser binding reached provider, member or session operations",
    );
    const retry = await f.callbackRequest(target, attempt.cookie);
    assert(
      new URL(retry.headers.get("Location")!).searchParams.get("ok") === "1" &&
        Number(f.records.exchanges.length) === 1,
      "continuation did not redeem the original browser-bound attempt",
    );
    const replay = await f.callbackRequest(target, attempt.cookie);
    assert(
      new URL(replay.headers.get("Location")!).searchParams.get("error") === "google_sign_in_failed" &&
        Number(f.records.tokenRequests) === 1 && Number(f.records.exchanges.length) === 1 &&
        f.records.attempts === 1,
      "continuation replay repeated provider exchange or created an attempt/session",
    );
  });
});

Deno.test("Google callback continuation rejects substituted cookies and never rotates the binding", async () => {
  await fixture(async (f) => {
    f.existing("18");
    const attempt = await f.begin(undefined, false);
    const first = await f.finish({ ...attempt, cookie: "" });
    const retry = await f.callbackRequest(first.headers.get("Location")!, `__Host-ww_google_oauth=${"Z".repeat(43)}`);
    assert(
      new URL(retry.headers.get("Location")!).searchParams.get("error") === "google_sign_in_failed" &&
        !retry.headers.has("Set-Cookie") && f.records.attempts === 1 &&
        f.records.redemptions === 1 && f.records.tokenRequests === 0 &&
        f.records.creates.length === 0 && f.records.exchanges.length === 0,
      "substituted binding reached provider exchange, member/session creation, or another continuation",
    );
  });
});

Deno.test("Google callback rejects changed or duplicated continuation markers before authentication", async () => {
  for (const change of ["code", "state", "marker", "duplicate"] as const) {
    await fixture(async (f) => {
      const attempt = await f.begin(undefined, false);
      const first = await f.finish({ ...attempt, cookie: "" });
      const target = new URL(first.headers.get("Location")!);
      if (change === "code") target.searchParams.set("code", "PRIVATE-changed-code");
      if (change === "state") target.searchParams.set("state", mutateState(attempt.state, "couple"));
      if (change === "marker") target.searchParams.set("ww_callback_cookie_check", "PRIVATE-invalid-marker");
      if (change === "duplicate") target.searchParams.append("ww_callback_cookie_check", target.searchParams.get("ww_callback_cookie_check")!);
      const result = await f.callbackRequest(target, attempt.cookie);
      assert(
        !result.headers.has("Set-Cookie") && f.records.attempts === 1 &&
          f.records.redemptions === 0 && f.records.tokenRequests === 0 &&
          f.records.creates.length === 0 && f.records.updates.length === 0 &&
          f.records.exchanges.length === 0 &&
          !result.headers.get("Location")?.includes("ww_callback_cookie_check"),
        "altered continuation reached an authentication operation or another continuation",
      );
    });
  }
});

Deno.test("Google callback rejects an expired continuation before redemption even if its cookie returns", async () => {
  await fixture(async (f) => {
    const attempt = await f.begin(undefined, false);
    const first = await f.finish({ ...attempt, cookie: "" });
    const originalNow = Date.now;
    const later = originalNow() + 61_000;
    try {
      Date.now = () => later;
      const result = await f.callbackRequest(first.headers.get("Location")!, attempt.cookie);
      assert(
        new URL(result.headers.get("Location")!).searchParams.get("error") === "google_sign_in_failed" &&
          !result.headers.has("Set-Cookie") && f.records.redemptions === 0 &&
          f.records.tokenRequests === 0 && f.records.exchanges.length === 0 &&
          f.records.creates.length === 0 && f.records.updates.length === 0 &&
          f.records.attempts === 1,
        "expired continuation reached authentication operations or another continuation",
      );
      assertCallbackDiagnostic(f.records.logs, "callback_continuation_rejected", [attempt.state, attempt.cookie]);
    } finally { Date.now = originalNow; }
  });
});

Deno.test("Google cancellation consumes the bound attempt and cannot be replayed as success", async () => {
  await fixture(async (f) => {
    const attempt = await f.begin();
    const response = await f.finish(attempt, "access_denied");
    const target = new URL(response.headers.get("Location")!);
    assert(
      response.status === 302 &&
        target.searchParams.get("error") === "access_denied" &&
        !target.searchParams.has("exchange_code"),
      "Google cancellation was not returned without credentials",
    );
    assert(
      f.records.redemptions === 1 && f.records.tokenRequests === 0 &&
        f.records.creates.length === 0 && f.records.exchanges.length === 0,
      "cancelled authorization reached identity operations",
    );
    const replay = await f.finish(attempt);
    assert(
      new URL(replay.headers.get("Location")!).searchParams.get("error") ===
          "google_sign_in_failed" &&
        f.records.tokenRequests === 0 &&
        f.records.exchanges.length === 0,
      "cancelled authorization was replayable",
    );
  });
});

Deno.test("Google successful native callback cannot redeem the same authorization twice", async () => {
  await fixture(async (f) => {
    f.existing("18");
    const attempt = await f.begin();
    const first = await f.finish(attempt);
    assert(
      new URL(first.headers.get("Location")!).searchParams.get("ok") === "1",
      "initial authorization failed",
    );
    const replay = await f.finish(attempt);
    const target = new URL(replay.headers.get("Location")!);
    assertCallbackDiagnostic(f.records.logs, "attempt_rejected", [
      attempt.state, attempt.cookie, attempt.nonce,
    ]);
    assert(
      replay.status === 302 &&
        target.searchParams.get("error") === "google_sign_in_failed" &&
        !target.searchParams.has("exchange_code") &&
        f.records.tokenRequests === 1 && f.records.exchanges.length === 1,
      "replayed authorization issued another provider exchange or session",
    );
  });
});

Deno.test("Google signup rejects duplicate or conflicting untrusted intent fields before authorization", async () => {
  for (
    const query of [
      "signup_role=admin",
      "signup_role=vendor_show",
      "signup_role=",
      "signup_role=vendor&signup_role=couple",
      "signup_role=vendor&signup_role=vendor",
      "signup_role=vendor&subscription_id=18",
      "signup_role=vendor&subscription_id=17&subscription_id=17",
    ]
  ) {
    await fixture(async (f) => {
      const response = await f.start(query);
      assert(
        response.status === 400 && f.records.attempts === 0,
        "invalid Google signup intent started authorization",
      );
    });
  }
});

Deno.test("Google signup duplicate-email race cannot issue a conflicting account session", async () => {
  await fixture(async (f) => {
    f.race("18");
    const response = await f.finish(await f.begin("vendor"));
    assert(
      new URL(response.headers.get("Location")!).searchParams.get("error") ===
          "google_app_bridge_failed" &&
        f.records.creates[0].get("subscription_id") === "17" &&
        f.records.updates.length === 0 && f.records.exchanges.length === 0,
      "Google duplicate-email recovery issued the wrong membership session",
    );
  });
});
