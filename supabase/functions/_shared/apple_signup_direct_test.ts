import { type AppleWebSignupRole } from "./oauth_state.ts";
import { appleSignupSubscriptionId } from "./apple_signup_role.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policy_consent.ts";
import {
  nativeSignupRoleFromBody,
  nativeSignupSubscriptionId,
  parseNativeSignupBody,
} from "./native_signup_intent.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

let activeFetch: typeof fetch | undefined;
const offlineFetch: typeof fetch = (input, init) => {
  if (!activeFetch) throw new Error("Offline fixture is not active");
  return activeFetch(input, init);
};

// Exercise the production BD provisioning/session path against strictly offline
// HTTP fixtures. Unknown requests throw; no real Apple or member data is used.
async function directFixture(
  run: (f: {
    login: typeof import("./apple_auth.ts").makeBdAppleLoginResult;
    records: {
      creates: URLSearchParams[];
      updates: URLSearchParams[];
      tickets: Record<string, unknown>[];
      cacheReads: number;
    };
    setMember: (plan: string) => void;
    raceWithPlan: (plan: string) => void;
  }) => Promise<void>,
) {
  const savedFetch = globalThis.fetch;
  const settings: Record<string, string> = {
    SUPABASE_URL: "https://offline-supabase.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "offline-only-service-key",
    BD_API_BASE_URL: "https://offline-bd.example.invalid",
    BD_API_KEY: "offline-only-bd-key",
    BD_DEFAULT_SUBSCRIPTION_ID: "18",
    BD_APPLE_LOGIN_URL: "",
    ALLOW_SUPABASE_APPLE_FALLBACK: "0",
  };
  const previous = new Map(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  let member: Record<string, unknown> | undefined;
  let racePlan = "";
  const records = {
    creates: [] as URLSearchParams[],
    updates: [] as URLSearchParams[],
    tickets: [] as Record<string, unknown>[],
    cacheReads: 0,
  };
  const setMember = (plan: string) => {
    member = {
      user_id: "offline-member",
      email: "signup@example.invalid",
      subscription_id: plan,
      active: "2",
    };
  };
  try {
    for (const [key, value] of Object.entries(settings)) {
      Deno.env.set(key, value);
    }
    activeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
      );
      const method = init?.method || "GET";
      const params = new URLSearchParams(String(init?.body || ""));
      if (url.origin === settings.BD_API_BASE_URL) {
        if (url.pathname === "/api/v2/user/get" && method === "GET") {
          return Response.json({
            status: "success",
            message: member ? [member] : [],
          });
        }
        if (
          url.pathname === "/api/v2/user/get/offline-member" &&
          method === "GET"
        ) {
          return Response.json({ status: "success", message: member });
        }
        if (url.pathname === "/api/v2/user/create" && method === "POST") {
          records.creates.push(params);
          if (racePlan) {
            setMember(racePlan);
            return Response.json({
              status: "error",
              message: "Email already exists",
            }, { status: 409 });
          }
          setMember(params.get("subscription_id") || "");
          return Response.json({ status: "success", message: member });
        }
        if (url.pathname === "/api/v2/user/update" && method === "PUT") {
          records.updates.push(params);
          assert(
            !params.has("subscription_id") && !params.has("active"),
            "login changed membership or activation",
          );
          return Response.json({ status: "success", message: member });
        }
      }
      if (url.origin === settings.SUPABASE_URL) {
        if (url.pathname === "/rest/v1/bd_users_cache" && method === "GET") {
          records.cacheReads++;
          return Response.json([{
            user_id: "offline-member",
            token: "offline-stable-token",
            cookie: "offline-stable-cookie",
          }]);
        }
        if (
          url.pathname === "/rest/v1/app_login_exchanges" && method === "POST"
        ) {
          records.tickets.push(JSON.parse(String(init?.body)));
          return new Response(null, { status: 201 });
        }
      }
      throw new Error(
        `Unexpected offline request: ${method} ${url.origin}${url.pathname}`,
      );
    }) as typeof fetch;
    globalThis.fetch = offlineFetch;
    const { makeBdAppleLoginResult } = await import("./apple_auth.ts");
    await run({
      login: makeBdAppleLoginResult,
      records,
      setMember,
      raceWithPlan: (plan) => {
        racePlan = plan;
      },
    });
  } finally {
    globalThis.fetch = savedFetch;
    activeFetch = undefined;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

function loginArgs(role?: AppleWebSignupRole) {
  return {
    appleSub: "offline-apple-subject",
    email: "signup@example.invalid",
    fullName: "Offline Signup",
    finalRedirect: "https://www.weddingwin.ca/account/home",
    consent: {
      acceptedAt: new Date().toISOString(),
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    },
    ...(role
      ? {
        expectedSignupRole: role,
        subscriptionId: appleSignupSubscriptionId(role),
      }
      : {}),
  };
}

Deno.test("Apple direct website signup creates the selected public plan and carries it into the website login ticket", async () => {
  for (
    const role of [
      "vendor",
      "vendor_basic",
      "vendor_show",
      "vendor_venue",
      "vendor_multi",
      "vendor_venue_multi",
      "couple",
    ] as const
  ) {
    await directFixture(async (f) => {
      const result = await f.login(loginArgs(role));
      const plan = appleSignupSubscriptionId(role);
      assert(
        f.records.creates.length === 1 &&
          f.records.creates[0].get("subscription_id") === plan,
        "production create request ignored the selected membership plan",
      );
      assert(
        f.records.creates[0].get("signup_terms_accepted") === "1" &&
          f.records.creates[0].get("active") === "2",
        "verified Apple signup lost consent or active membership",
      );
      assert(
        result.user.subscription_id === plan &&
          (f.records.tickets[0].payload as Record<string, unknown>)
              .subscription_id === plan,
        "website login ticket lost the account plan",
      );
      assert(
        new URL(result.redirectUrl).pathname === "/app-login",
        "website handoff was not generated",
      );
    });
  }
});

Deno.test("Apple direct website signup leaves conflicting existing members unchanged and issues no session", async () => {
  for (
    const [role, existing] of [["vendor", "18"], ["vendor_show", "17"], [
      "vendor_basic",
      "4",
    ], ["couple", "38"]] as const
  ) {
    await directFixture(async (f) => {
      f.setMember(existing);
      let message = "";
      try {
        await f.login(loginArgs(role));
      } catch (error) {
        message = (error as Error).message;
      }
      assert(
        message === "APPLE_SIGNUP_ROLE_MISMATCH",
        "wrong account type was silently signed in",
      );
      assert(
        f.records.creates.length === 0 && f.records.updates.length === 0 &&
          f.records.tickets.length === 0 && f.records.cacheReads === 0,
        "mismatched signup mutated an account or issued a session",
      );
    });
  }
});

Deno.test("Apple direct signup catches a conflicting duplicate-email race before session issuance", async () => {
  await directFixture(async (f) => {
    f.raceWithPlan("18");
    let message = "";
    try {
      await f.login(loginArgs("vendor_show"));
    } catch (error) {
      message = (error as Error).message;
    }
    assert(
      message === "APPLE_SIGNUP_ROLE_MISMATCH" &&
        f.records.creates[0].get("subscription_id") === "38",
      "concurrent existing-account mismatch was not caught",
    );
    assert(
      f.records.updates.length === 0 && f.records.tickets.length === 0 &&
        f.records.cacheReads === 0,
      "duplicate-email recovery issued the wrong account session",
    );
  });
});

Deno.test("Apple direct plain login retains existing account plan and native session-only login remains separate", async () => {
  await directFixture(async (f) => {
    f.setMember("4");
    const result = await f.login({
      ...loginArgs(),
      includeWebsiteRedirect: false,
    });
    assert(
      result.user.subscription_id === "4" &&
        result.nativeSession.user_id === "offline-member" &&
        result.redirectUrl === "",
      "plain native login changed the account plan or web handoff behavior",
    );
    assert(
      f.records.creates.length === 0 && f.records.tickets.length === 0,
      "plain login created a new member or unexpected website handoff",
    );
  });
});

Deno.test("native Apple explicit signup checks existing membership while preserving ordinary login", async () => {
  for (const role of ["vendor", "couple"] as const) {
    const body = parseNativeSignupBody(
      JSON.stringify({
        signup_role: role,
        subscription_id: nativeSignupSubscriptionId(role),
      }),
    );
    const signupRole = nativeSignupRoleFromBody(body);
    await directFixture(async (f) => {
      f.setMember(role === "vendor" ? "18" : "17");
      let message = "";
      try {
        await f.login({
          ...loginArgs(),
          subscriptionId: String(body.subscription_id),
          expectedSignupRole: signupRole,
          includeWebsiteRedirect: false,
        });
      } catch (error) {
        message = (error as Error).message;
      }
      assert(
        message === "APPLE_SIGNUP_ROLE_MISMATCH" &&
          f.records.updates.length === 0 && f.records.cacheReads === 0,
        "native explicit signup silently opened a conflicting membership",
      );
      const ordinary = await f.login({
        ...loginArgs(),
        subscriptionId: String(body.subscription_id),
        includeWebsiteRedirect: false,
      });
      assert(
        ordinary.user.subscription_id === (role === "vendor" ? "18" : "17"),
        "ordinary native login incorrectly enforced signup intent",
      );
    });
    await directFixture(async (f) => {
      const created = await f.login({
        ...loginArgs(),
        subscriptionId: String(body.subscription_id),
        expectedSignupRole: signupRole,
        includeWebsiteRedirect: false,
      });
      assert(
        created.user.subscription_id === nativeSignupSubscriptionId(role) &&
          created.redirectUrl === "" && f.records.tickets.length === 0,
        "new native signup lost its membership or created a web session",
      );
    });
  }
});
