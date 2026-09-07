import { exportJWK, generateKeyPair, SignJWT } from "npm:jose@5.9.6";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policy_consent.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
type Handler = (request: Request) => Promise<Response>;
type Endpoint = "native" | "legacy";
let handlers: Record<Endpoint, Handler> | undefined;
let activeFetch: typeof fetch | undefined;
const offlineFetch: typeof fetch = (input, init) => {
  if (!activeFetch) {
    throw new Error("Offline Apple handler fixture is inactive");
  }
  return activeFetch(input, init);
};
const keys = await generateKeyPair("RS256");
const jwk = {
  ...await exportJWK(keys.publicKey),
  kid: "offline-preflight-handler",
  alg: "RS256",
  use: "sig",
};
const EMAIL = "apple-handler-preflight@example.invalid";
const PROFILE = "fa1151a0-0000-4000-8000-000000000012";
const MEMBER = "39048";
const SUBJECT = "offline-handler-apple-subject";
const IDENTITY = "fa1151a0-0000-4000-8000-000000000013";
const GENERATION = "fa1151a0-0000-4000-8000-000000000014";
const SETTINGS: Record<string, string> = {
  SUPABASE_URL: "https://offline-apple-handler-db.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "offline-handler-service-key",
  BD_API_BASE_URL: "https://offline-apple-handler-bd.example.invalid",
  BD_API_KEY: "offline-handler-bd-key",
  BD_DEFAULT_SUBSCRIPTION_ID: "18",
  BD_APPLE_LOGIN_URL: "",
  BD_APPLE_LOGIN_SECRET: "",
  ALLOW_SUPABASE_APPLE_FALLBACK: "0",
  APPLE_SERVICE_ID: "ca.weddingwin.web.test",
  APPLE_IOS_BUNDLE_ID: "ca.weddingwin.app",
  APPLE_TEAM_ID: "OFFLINETEAM",
  APPLE_KEY_ID: "OFFLINEKEY",
  APPLE_PRIVATE_KEY: "unused-with-no-authorization-code",
};

function currentConsent() {
  return {
    accepted_terms: true,
    accepted_privacy: true,
    accepted_at: new Date().toISOString(),
    terms_version: CURRENT_TERMS_VERSION,
    privacy_version: CURRENT_PRIVACY_VERSION,
  };
}

async function exercise(endpoint: Endpoint, options: {
  body?: Record<string, unknown>;
  existingPlan?: string;
  bdFailure?: { status?: number; body?: unknown };
  invalidSignature?: boolean;
} = {}) {
  const savedEnv = new Map(
    Object.keys(SETTINGS).map((key) => [key, Deno.env.get(key)]),
  );
  const previousFetch = globalThis.fetch;
  const previousServe = Deno.serve;
  const previousLog = console.log;
  const previousInfo = console.info;
  const previousError = console.error;
  const logs: unknown[] = [];
  const requests: { method: string; url: URL; body: string }[] = [];
  const writes: { method: string; url: URL; body: string }[] = [];
  const rpcActions: string[] = [];
  const unexpected: string[] = [];
  let member: Record<string, unknown> | undefined = options.existingPlan
    ? {
      user_id: MEMBER,
      email: EMAIL,
      subscription_id: options.existingPlan,
      active: "2",
    }
    : undefined;
  let authExists = !!options.existingPlan;
  let profileExists = !!options.existingPlan;
  let leaseToken = "";
  const memberReply = () =>
    Response.json({
      status: "success",
      message: member ? [member] : [],
      total: member ? 1 : 0,
    });
  for (const [key, value] of Object.entries(SETTINGS)) Deno.env.set(key, value);
  console.log = (...values) => {
    logs.push(values);
  };
  console.info = (...values) => {
    logs.push(values);
  };
  console.error = (...values) => {
    logs.push(values);
  };
  activeFetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ||
      (input instanceof Request ? input.method : "GET");
    const body = init?.body === undefined ? "" : String(init.body);
    const request = { method, url, body };
    requests.push(request);
    const leaseRpc = url.origin === SETTINGS.SUPABASE_URL &&
      url.pathname === "/rest/v1/rpc/apple_grant_operation";
    if (method !== "GET" && !leaseRpc) writes.push(request);
    if (
      url.origin === "https://appleid.apple.com" &&
      url.pathname === "/auth/keys" && method === "GET"
    ) {
      return Response.json({ keys: [jwk] });
    }
    if (leaseRpc && method === "POST") {
      const args = JSON.parse(body);
      rpcActions.push(args.p_action);
      if (args.p_action === "signin_begin") {
        assert(
          args.p_data.appleSub === SUBJECT,
          "lease subject not from verified Apple token",
        );
        leaseToken = args.p_data.leaseToken;
        return Response.json({
          identityId: IDENTITY,
          generation: GENERATION,
          leaseToken,
        });
      }
      if (["signin_check", "signin_release"].includes(args.p_action)) {
        assert(
          args.p_data.identityId === IDENTITY &&
            args.p_data.generation === GENERATION &&
            args.p_data.leaseToken === leaseToken,
          "lease ownership changed",
        );
        return Response.json({});
      }
    }
    if (url.origin === SETTINGS.SUPABASE_URL) {
      if (url.pathname === "/auth/v1/admin/users" && method === "GET") {
        return Response.json({
          users: authExists
            ? [{ id: PROFILE, email: EMAIL, user_metadata: {} }]
            : [],
          aud: "authenticated",
        });
      }
      if (
        url.pathname === `/auth/v1/admin/users/${PROFILE}` && method === "GET"
      ) {
        return Response.json({ id: PROFILE, email: EMAIL, user_metadata: {} });
      }
      if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
        authExists = true;
        return Response.json({ id: PROFILE, email: EMAIL, user_metadata: {} });
      }
      if (
        url.pathname === `/auth/v1/admin/users/${PROFILE}` && method === "PUT"
      ) {
        return Response.json({ id: PROFILE, email: EMAIL, user_metadata: {} });
      }
      if (url.pathname === "/rest/v1/profiles" && method === "GET") {
        return Response.json(
          profileExists
            ? [{ id: PROFILE, email: EMAIL, display_name: "Offline Apple" }]
            : [],
        );
      }
      if (
        url.pathname === "/rest/v1/profiles" &&
        ["POST", "PATCH"].includes(method)
      ) {
        profileExists = true;
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/rest/v1/bd_users_cache" && method === "GET") {
        return Response.json([{
          user_id: MEMBER,
          token: "offline-stable-handler-token",
          cookie: "offline-stable-handler-cookie",
        }]);
      }
      if (
        url.pathname === "/rest/v1/app_login_exchanges" && method === "POST"
      ) {
        return new Response(null, { status: 201 });
      }
    }
    if (url.origin === SETTINGS.BD_API_BASE_URL) {
      if (url.pathname === "/api/v2/user/get" && method === "GET") {
        if (options.bdFailure) {
          return Response.json(
            options.bdFailure.body ??
              { status: "error", message: "PRIVATE_BD_HANDLER_FAILURE" },
            { status: options.bdFailure.status ?? 200 },
          );
        }
        return memberReply();
      }
      if (url.pathname === `/api/v2/user/get/${MEMBER}` && method === "GET") {
        return memberReply();
      }
      if (url.pathname === "/api/v2/user/create" && method === "POST") {
        const form = new URLSearchParams(body);
        member = {
          user_id: MEMBER,
          email: EMAIL,
          active: "2",
          subscription_id: form.get("subscription_id"),
        };
        return memberReply();
      }
      if (url.pathname === "/api/v2/user/update" && method === "PUT") {
        return memberReply();
      }
    }
    unexpected.push(`${method} ${url.origin}${url.pathname}`);
    return Response.json({ error: "Unexpected offline dependency request" }, {
      status: 500,
    });
  };
  globalThis.fetch = offlineFetch;
  let response: Response | undefined;
  let result: Record<string, unknown> = {};
  try {
    if (!handlers) {
      let captured: Handler | undefined;
      Deno.serve = ((handler: Handler) => {
        captured = handler;
        return {};
      }) as typeof Deno.serve;
      await import("../apple-native-login/index.ts");
      const native = captured!;
      await import("../apple-web-login/index.ts");
      handlers = { native, legacy: captured! };
    }
    Deno.serve = previousServe;
    const token = await new SignJWT({ email: EMAIL, email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer("https://appleid.apple.com")
      .setAudience(
        endpoint === "native"
          ? SETTINGS.APPLE_IOS_BUNDLE_ID
          : SETTINGS.APPLE_SERVICE_ID,
      )
      .setSubject(SUBJECT).setIssuedAt().setExpirationTime("5m").sign(
        keys.privateKey,
      );
    response = await handlers[endpoint](
      new Request(
        `https://offline-edge.example.invalid/apple-${endpoint}-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_token: options.invalidSignature
              ? token.replace(/.$/, token.endsWith("A") ? "B" : "A")
              : token,
            email: EMAIL,
            full_name: "Offline Apple",
            ...options.body,
          }),
        },
      ),
    );
    result = await response.json();
    if (response.status !== 200) {
      assert(
        !("native_session" in result) && !("nativeSession" in result) &&
          !("redirect_url" in result) && !("redirectUrl" in result),
        "failed handler leaked login credentials",
      );
    }
    assert(
      !JSON.stringify({ result, logs }).includes(token),
      "signed identity token leaked into error or diagnostics",
    );
    assert(
      !JSON.stringify({ result, logs }).includes("PRIVATE_BD_HANDLER_FAILURE"),
      "private upstream error leaked",
    );
  } finally {
    globalThis.fetch = previousFetch;
    activeFetch = undefined;
    Deno.serve = previousServe;
    console.log = previousLog;
    console.info = previousInfo;
    console.error = previousError;
    for (const [key, value] of savedEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
  assert(
    unexpected.length === 0,
    `unexpected production dependency: ${unexpected.join(", ")}`,
  );
  assert(response, "production handler did not respond");
  assert(
    requests.every(({ url }) =>
      url.pathname !== "/auth/token" && url.pathname !== "/auth/revoke"
    ),
    "no-code compatibility flow unexpectedly issued or revoked Apple credentials",
  );
  return { response, result, requests, writes, rpcActions };
}

function assertZeroAccountWrites(f: Awaited<ReturnType<typeof exercise>>) {
  assert(
    f.writes.length === 0,
    `preflight failure performed account writes: ${
      f.writes.map((r) => `${r.method} ${r.url.pathname}`).join(", ")
    }`,
  );
  assert(
    f.rpcActions.every((action) =>
      ["signin_begin", "signin_release"].includes(action)
    ),
    "preflight failure enrolled a grant or authorized an account",
  );
}

Deno.test("actual native and legacy Apple handlers require signup for a missing no-consent account before all account writes", async () => {
  for (const endpoint of ["native", "legacy"] as const) {
    const f = await exercise(endpoint);
    assert(
      f.response.status === 400 && f.result.error_code === "signup_required",
      `${endpoint} missing account did not explicitly require signup`,
    );
    assertZeroAccountWrites(f);
    assert(
      f.rpcActions.join(",") === "signin_begin,signin_release",
      "failed no-code login did not release its lease",
    );
    assert(
      f.requests.some(({ url }) => url.pathname === "/auth/v1/admin/users") &&
        f.requests.some(({ url }) => url.pathname === "/rest/v1/profiles"),
      "missing-account protection skipped Auth/profile absence checks",
    );
  }
});

Deno.test("actual Apple handlers reject bare or incomplete consent before account writes", async () => {
  for (const endpoint of ["native", "legacy"] as const) {
    for (
      const body of [
        { accepted_terms: true, accepted_privacy: true },
        {
          accepted_terms: true,
          accepted_privacy: true,
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
        },
        {
          accepted_terms: true,
          accepted_privacy: true,
          accepted_at: new Date().toISOString(),
        },
        { ...currentConsent(), terms_version: "2020-01-01" },
        { ...currentConsent(), accepted_at: "" },
      ]
    ) {
      const f = await exercise(endpoint, { body });
      assert(
        f.response.status === 400,
        `${endpoint} accepted incomplete consent`,
      );
      assertZeroAccountWrites(f);
    }
  }
});

Deno.test("actual Apple handlers return503 for uncertain BD preflight without creating Auth or profiles", async () => {
  for (const endpoint of ["native", "legacy"] as const) {
    for (
      const bdFailure of [
        { status: 503 },
        { status: 404 },
        {
          body: {
            status: "error",
            message: "No user record with user_id=39048.",
          },
        },
        { body: { status: "success", message: [], total: 1 } },
        {
          body: {
            status: "success",
            message: [{ user_id: MEMBER, email: EMAIL, active: "2" }, {
              user_id: MEMBER,
              email: EMAIL,
              active: "2",
            }],
          },
        },
      ]
    ) {
      const f = await exercise(endpoint, { bdFailure });
      assert(
        f.response.status === 503 && f.result.error_code !== "signup_required",
        `${endpoint} uncertain lookup became signup or invalid credentials`,
      );
      assertZeroAccountWrites(f);
    }
  }
});

Deno.test("actual native Apple explicit signup retains selected vendor17 and couple18 plans", async () => {
  for (const [signup_role, plan] of [["vendor", "17"], ["couple", "18"]]) {
    const f = await exercise("native", {
      body: { ...currentConsent(), signup_role, subscription_id: plan },
    });
    assert(
      f.response.status === 200,
      `valid explicit ${signup_role} signup failed: ${
        JSON.stringify(f.result)
      }`,
    );
    const creates = f.writes.filter(({ url }) =>
      url.pathname === "/api/v2/user/create"
    );
    assert(
      creates.length === 1,
      "explicit signup did not create exactly one member",
    );
    const form = new URLSearchParams(creates[0].body);
    assert(
      form.get("subscription_id") === plan &&
        form.get("signup_terms_accepted") === "1" &&
        form.get("signup_terms_version") === CURRENT_TERMS_VERSION &&
        form.get("signup_privacy_version") === CURRENT_PRIVACY_VERSION,
      "explicit consent or selected plan changed",
    );
    const session = f.result.native_session as Record<string, unknown>;
    const user = f.result.user as Record<string, unknown>;
    assert(
      session.user_id === MEMBER && user.subscription_id === plan,
      "signup returned incorrect member role",
    );
  }
});

Deno.test("actual Apple ordinary existing login pins member and preserves its role despite caller plan override", async () => {
  for (const endpoint of ["native", "legacy"] as const) {
    for (const existingPlan of ["17", "18"]) {
      const f = await exercise(endpoint, {
        existingPlan,
        body: { subscription_id: existingPlan === "17" ? "18" : "17" },
      });
      assert(
        f.response.status === 200,
        `${endpoint} existing login failed: ${JSON.stringify(f.result)}`,
      );
      assert(
        !f.writes.some(({ url }) =>
          url.pathname === "/api/v2/user/create" ||
          url.pathname === "/auth/v1/admin/users"
        ),
        "existing login created another account",
      );
      for (
        const update of f.writes.filter(({ url }) =>
          url.pathname === "/api/v2/user/update"
        )
      ) {
        const form = new URLSearchParams(update.body);
        assert(
          !form.has("subscription_id") && !form.has("active"),
          "existing membership role/status was overwritten",
        );
      }
      const user = f.result.user as Record<string, unknown>;
      assert(
        user.user_id === MEMBER && user.subscription_id === existingPlan,
        "existing login returned caller-selected role",
      );
      const bdReads = f.requests.filter(({ url, method }) =>
        url.origin === SETTINGS.BD_API_BASE_URL && method === "GET"
      );
      assert(
        bdReads[0].url.searchParams.get("property") === "email" &&
          bdReads[0].url.searchParams.get("limit") === "2",
        "existing member was not preflighted with exact filtered lookup",
      );
      assert(
        bdReads.filter(({ url }) =>
          url.searchParams.get("property") === "email"
        ).length === 1,
        "existing login lost preflight pin and repeated mutable email lookup",
      );
    }
  }
});
