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
    ) => Promise<{ state: string; cookie: string; nonce: string }>;
    finish: (
      attempt: { state: string; cookie: string; nonce: string },
    ) => Promise<Response>;
    verify: typeof verifyState;
    records: {
      creates: URLSearchParams[];
      updates: URLSearchParams[];
      exchanges: Record<string, unknown>[];
      tokenRequests: number;
      attempts: number;
      cacheReads: number;
    };
    existing: (plan: string) => void;
    race: (plan: string) => void;
  }) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
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
    cacheReads: 0,
  };
  let member: Record<string, unknown> | undefined;
  let racePlan = "";
  let idToken = "";
  let storedAttempt: Record<string, unknown> | undefined;
  let attemptConsumed = false;
  const existing = (plan: string) => {
    member = {
      user_id: "offline-google-member",
      email: "native-google@example.invalid",
      subscription_id: plan,
      active: "2",
    };
  };
  try {
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
          const valid = !attemptConsumed &&
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
          return Response.json({
            status: "success",
            message: member ? [member] : [],
          });
        }
        if (
          url.pathname === "/api/v2/user/get/offline-google-member" &&
          method === "GET"
        ) return Response.json({ status: "success", message: member });
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
    const defaultParams = () =>
      new URLSearchParams({
        redirect_to: "weddingwin://bd-login",
        code_challenge: "A".repeat(43),
        accepted_terms: "1",
        accepted_privacy: "1",
        accepted_at: new Date().toISOString(),
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: CURRENT_PRIVACY_VERSION,
      });
    const start = (query = "") =>
      startHandler(
        new Request(
          `https://offline-google-db.example.invalid/functions/v1/google-oauth-start?${defaultParams()}${
            query ? `&${query}` : ""
          }`,
        ),
      );
    const begin = async (role?: "vendor" | "couple") => {
      const response = await start(
        role
          ? `signup_role=${role}&subscription_id=${
            role === "vendor" ? "17" : "18"
          }`
          : "subscription_id=17",
      );
      assert(response.status === 302, "Google authorization did not start");
      const location = new URL(response.headers.get("Location")!);
      return {
        state: location.searchParams.get("state")!,
        nonce: location.searchParams.get("nonce")!,
        cookie: response.headers.get("Set-Cookie")!.split(";")[0],
      };
    };
    const finish = async (
      attempt: { state: string; cookie: string; nonce: string },
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
            { code: "offline-code", state: attempt.state },
          )}`,
          { headers: { Cookie: attempt.cookie } },
        ),
      );
    };
    await run({
      start,
      begin,
      finish,
      verify: verifyState,
      records,
      existing,
      race: (plan) => {
        racePlan = plan;
      },
    });
  } finally {
    Deno.serve = originalServe;
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

Deno.test("Google ordinary login and old in-flight state without signup role preserve existing membership", async () => {
  for (const plan of ["18", "17", "38"]) {
    await fixture(async (f) => {
      f.existing(plan);
      const attempt = await f.begin();
      assert(
        (await f.verify(attempt.state)).g === undefined,
        "ordinary login invented signup intent",
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
            f.records.creates.length === 0,
          "tampered signup intent reached provider or account operations",
        );
      }
    });
  }
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
