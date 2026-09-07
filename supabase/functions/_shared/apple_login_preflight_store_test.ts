import {
  type AppleLoginPreflightArgs,
  AppleSignupRequiredError,
} from "./apple_login_preflight.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policy_consent.ts";

const EMAIL = "preflight-adapter@example.invalid";
const SUBJECT = "offline-preflight-adapter-subject";
const MEMBER = "39048";
const PROFILE = "fa1151a0-0000-4000-8000-000000000010";
const ROW = { user_id: MEMBER, email: EMAIL, active: "2" };
const ARGS: AppleLoginPreflightArgs = {
  claims: {
    iss: "https://appleid.apple.com",
    aud: "ca.weddingwin.web.test",
    sub: SUBJECT,
    email: EMAIL,
    email_verified: true,
  },
  consent: null,
};

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

type FixtureOptions = {
  bdStatus?: number;
  bdBody?: unknown;
  bdText?: string;
  bdNetworkError?: boolean;
  authPages?: unknown[];
  authListStatus?: number;
  authBody?: unknown;
  authGetStatus?: number;
  profileBody?: unknown;
  profileStatus?: number;
};

async function exercise(
  options: FixtureOptions = {},
  overrides: Partial<AppleLoginPreflightArgs> = {},
) {
  const previousFetch = globalThis.fetch;
  const saved = new Map<string, string | undefined>();
  for (
    const [key, value] of Object.entries({
      SUPABASE_URL: "https://offline-preflight-supabase.example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "offline-service-key-never-production",
      BD_API_BASE_URL: "https://offline-preflight-bd.example.invalid",
      BD_API_KEY: "offline-bd-key-never-production",
    })
  ) {
    saved.set(key, Deno.env.get(key));
    Deno.env.set(key, value);
  }
  const requests: { url: URL; method: string }[] = [];
  const unexpected: string[] = [];
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ||
      (input instanceof Request ? input.method : "GET");
    requests.push({ url, method });
    if (method !== "GET") {
      unexpected.push(`write: ${method} ${url.pathname}`);
      return Promise.resolve(
        Response.json({ error: "writes forbidden" }, { status: 500 }),
      );
    }
    if (
      url.hostname === "offline-preflight-bd.example.invalid" &&
      url.pathname === "/api/v2/user/get"
    ) {
      if (options.bdNetworkError) {
        return Promise.reject(new Error("PRIVATE_BD_PREFLIGHT_OUTAGE"));
      }
      if (options.bdText !== undefined) {
        return Promise.resolve(
          new Response(options.bdText, { status: options.bdStatus || 200 }),
        );
      }
      return Promise.resolve(
        Response.json(
          "bdBody" in options
            ? options.bdBody
            : { status: "success", message: [ROW], total: 1 },
          { status: options.bdStatus || 200 },
        ),
      );
    }
    if (url.hostname === "offline-preflight-supabase.example.invalid") {
      if (url.pathname === "/auth/v1/admin/users") {
        const page = Number(url.searchParams.get("page"));
        const users = options.authPages?.[page - 1] ?? [];
        return Promise.resolve(
          Response.json({ users, aud: "authenticated" }, {
            status: options.authListStatus || 200,
          }),
        );
      }
      if (url.pathname === `/auth/v1/admin/users/${PROFILE}`) {
        return Promise.resolve(
          Response.json(
            "authBody" in options
              ? options.authBody
              : { id: PROFILE, email: EMAIL },
            { status: options.authGetStatus || 200 },
          ),
        );
      }
      if (url.pathname === "/rest/v1/profiles") {
        return Promise.resolve(
          Response.json("profileBody" in options ? options.profileBody : [], {
            status: options.profileStatus || 200,
          }),
        );
      }
    }
    unexpected.push(`unexpected: ${url.origin}${url.pathname}`);
    return Promise.resolve(
      Response.json({ error: "unexpected dependency" }, { status: 500 }),
    );
  };
  let result: { expectedBdMemberId?: string } | undefined;
  let error: unknown;
  try {
    const { preflightAppleAccountLogin } = await import(
      "./apple_login_preflight_store.ts"
    );
    try {
      result = await preflightAppleAccountLogin({ ...ARGS, ...overrides });
    } catch (caught) {
      error = caught;
    }
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
  // These assertions MUST be outside the adapter: otherwise its generic error
  // handling could turn an incorrect URL or attempted write into a passing test.
  assert(
    unexpected.length === 0,
    `production adapter escaped read-only contract: ${unexpected.join(", ")}`,
  );
  assert(
    requests.every((request) => request.method === "GET"),
    "preflight attempted an account mutation",
  );
  for (const { url } of requests) {
    if (url.hostname === "offline-preflight-bd.example.invalid") {
      const expectedProperty = overrides.expectedBdMemberId
        ? "user_id"
        : "email";
      const expectedValue = overrides.expectedBdMemberId || EMAIL;
      assert(
        url.pathname === "/api/v2/user/get",
        "BD lookup not filtered endpoint",
      );
      assert(
        url.searchParams.get("property") === expectedProperty &&
          url.searchParams.get("property_operator") === "eq" &&
          url.searchParams.get("property_value") === expectedValue &&
          url.searchParams.get("limit") === "2",
        "BD lookup not bound to exact identity",
      );
      assert(
        [...url.searchParams.keys()].sort().join(",") ===
          "limit,property,property_operator,property_value",
        "BD lookup contained duplicate or additional filters",
      );
    } else if (url.pathname === "/auth/v1/admin/users") {
      assert(
        url.searchParams.get("per_page") === "200" &&
          Number(url.searchParams.get("page")) > 0,
        "Auth ownership scan did not use supported bounded pagination",
      );
      assert(
        [...url.searchParams.keys()].sort().join(",") === "page,per_page",
        "Auth lookup used an unsupported email filter",
      );
    } else if (url.pathname === "/rest/v1/profiles") {
      assert(
        url.searchParams.get("apple_sub") === `eq.${SUBJECT}` &&
          url.searchParams.get("select") === "id" &&
          url.searchParams.get("limit") === "1",
        "profile absence was not scoped to signed Apple subject",
      );
      assert(
        [...url.searchParams.keys()].sort().join(",") ===
          "apple_sub,limit,select",
        "profile lookup used mutable email or extra predicates",
      );
    }
  }
  return { result, error, requests };
}

function unavailable(result: Awaited<ReturnType<typeof exercise>>) {
  assert(
    result.error instanceof Error &&
      !(result.error instanceof AppleSignupRequiredError),
    "uncertain production lookup was treated as a new absent account",
  );
  assert(!result.result, "uncertain lookup authorized an account");
  assert(
    !result.error.message.includes("PRIVATE_BD_PREFLIGHT_OUTAGE"),
    "raw dependency error leaked",
  );
}

Deno.test("production Apple preflight pins an existing active member using only one exact email GET", async () => {
  const f = await exercise();
  assert(
    !f.error && f.result?.expectedBdMemberId === MEMBER,
    "existing member not pinned",
  );
  assert(
    f.requests.length === 1 &&
      f.requests[0].url.hostname === "offline-preflight-bd.example.invalid",
    "existing account caused Auth creation, profile lookup or other request",
  );
});

Deno.test("production Apple preflight explicit agreement performs zero reads or writes", async () => {
  const f = await exercise({}, {
    consent: {
      acceptedAt: new Date().toISOString(),
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    },
  });
  assert(
    !f.error && f.result && Object.keys(f.result).length === 0,
    "explicit signup preflight failed",
  );
  assert(
    f.requests.length === 0,
    "explicit agreement preflight touched accounts",
  );
});

Deno.test("production Apple preflight accepts final-page BD cursors with an exact email total", async () => {
  for (const total of [1, "1"]) {
    const f = await exercise({
      bdBody: {
        status: "success",
        message: [ROW],
        total,
        current_page: 1,
        total_pages: 1,
        next_page: "MipfKjI=",
      },
    });
    assert(
      !f.error && f.result?.expectedBdMemberId === MEMBER,
      "informational cursor blocked a unique verified member",
    );
    assert(f.requests.length === 1, "informational cursor was followed");
  }
});

Deno.test("production Apple preflight accepts observed final-page cursor for enrolled exact ID", async () => {
  const f = await exercise({
    bdBody: {
      status: "success",
      message: [ROW],
      total: "1",
      current_page: 1,
      total_pages: 1,
      next_page: "MipfKjI=",
    },
  }, { expectedBdMemberId: MEMBER, expectedProfileId: PROFILE });
  assert(
    !f.error && f.result?.expectedBdMemberId === MEMBER,
    "informational cursor blocked the immutable enrolled owner",
  );
  assert(
    f.requests.length === 2 &&
      f.requests[1].url.searchParams.get("property") === "user_id",
    "enrolled cursor caused extra reads or an email fallback",
  );
});

Deno.test("production Apple preflight consistent zero-total cursors still require separate Auth and profile absence", async () => {
  for (const total of [0, "0"]) {
    const f = await exercise({
      bdBody: {
        status: "success",
        message: [],
        total,
        current_page: 1,
        total_pages: 0,
        next_page: "informational-next",
        prev_page: "informational-previous",
      },
    });
    assert(
      f.error instanceof AppleSignupRequiredError && f.error.cleanupEligible,
      "exact absence proof failed",
    );
    assert(
      f.requests.length === 3 &&
        f.requests.some(({ url }) => url.pathname === "/auth/v1/admin/users") &&
        f.requests.some(({ url }) => url.pathname === "/rest/v1/profiles"),
      "zero-total cursor bypassed independent ownership checks",
    );
  }
});

Deno.test("production Apple preflight cursor tolerance never permits ambiguous or inconsistent envelopes", async () => {
  for (
    const metadata of [
      {},
      { total: 0 },
      { total: 2 },
      { total: "01" },
      { total: "unknown" },
      { total: null },
      { total: true },
      { total: 1, next_page: {} },
      { total: 1, prev_page: [] },
      { total: 1, current_page: 2 },
      { total: 1, current_page: -1 },
      { total: 1, current_page: 0.5 },
      { total: 1, current_page: "unknown" },
      { total: 1, total_pages: 2 },
      { total: 1, message: [ROW, ROW] },
    ]
  ) {
    const f = await exercise({
      bdBody: {
        status: "success",
        message: [ROW],
        next_page: "MipfKjI=",
        ...metadata,
      },
    });
    unavailable(f);
    assert(f.requests.length === 1, "ambiguous cursor authorized more work");
  }
});

Deno.test("production Apple preflight proves missing BD, paginated Auth and signed-subject profile with GETs only", async () => {
  const unrelated = Array.from(
    { length: 200 },
    (_, i) => ({
      id: `offline-unrelated-${i}`,
      email: `unrelated-${i}@example.invalid`,
    }),
  );
  const f = await exercise({
    bdBody: {
      status: "success",
      message: [],
      total: 0,
      current_page: 0,
      total_pages: 0,
      next_page: "",
      prev_page: "",
    },
    authPages: [unrelated, []],
  });
  assert(
    f.error instanceof AppleSignupRequiredError &&
      f.error.cleanupEligible === true,
    "complete absence proof not recognized",
  );
  const authCalls = f.requests.filter(({ url }) =>
    url.pathname === "/auth/v1/admin/users"
  );
  assert(
    authCalls.length === 2 &&
      authCalls[0].url.searchParams.get("page") === "1" &&
      authCalls[1].url.searchParams.get("page") === "2",
    "Auth absence did not inspect final page",
  );
  assert(
    f.requests.filter(({ url }) => url.pathname === "/rest/v1/profiles")
      .length === 1,
    "profile absence was not checked",
  );
  assert(
    f.requests.length === 4,
    "absence triggered account writes or fallback requests",
  );
});

Deno.test("production Apple preflight protects an Auth account found on a later page", async () => {
  const unrelated = Array.from(
    { length: 200 },
    (_, i) => ({
      id: `offline-unrelated-${i}`,
      email: `unrelated-${i}@example.invalid`,
    }),
  );
  const f = await exercise({
    bdBody: { status: "success", message: [], total: 0 },
    authPages: [unrelated, [{ id: PROFILE, email: EMAIL.toUpperCase() }]],
  });
  assert(
    f.error instanceof AppleSignupRequiredError &&
      f.error.cleanupEligible === false,
    "existing Auth account permitted cleanup",
  );
  assert(
    f.requests.filter(({ url }) => url.pathname === "/auth/v1/admin/users")
      .length === 2,
    "later Auth page was skipped",
  );
});

Deno.test("production Apple preflight protects existing Apple-subject profile despite absent Auth email", async () => {
  const f = await exercise({
    bdBody: { status: "success", message: [], total: 0 },
    profileBody: [{ id: PROFILE }],
  });
  assert(
    f.error instanceof AppleSignupRequiredError &&
      f.error.cleanupEligible === false,
    "existing subject profile permitted cleanup",
  );
});

Deno.test("production Apple preflight enrolled identity uses exact Auth UUID and BD ID without email search", async () => {
  const f = await exercise({}, {
    expectedBdMemberId: MEMBER,
    expectedProfileId: PROFILE,
    claims: { ...ARGS.claims, email: "old-apple-address@example.invalid" },
  });
  assert(
    !f.error && f.result?.expectedBdMemberId === MEMBER,
    "enrolled identity rejected",
  );
  assert(
    f.requests.length === 2 &&
      f.requests[0].url.pathname === `/auth/v1/admin/users/${PROFILE}` &&
      f.requests[1].url.searchParams.get("property") === "user_id",
    "enrolled lookup used mutable email or profile sweep",
  );
});

Deno.test("production Apple preflight HTTP, network and malformed BD failures never imply absence", async () => {
  for (
    const options of [
      ...[400, 401, 403, 404, 429, 500, 503].map((bdStatus) => ({
        bdStatus,
        bdBody: { status: "success", message: [], total: 0 },
      })),
      { bdNetworkError: true },
      { bdText: "<html>Gateway error</html>" },
      ...[null, {}, [], { status: "error", message: [] }, {
        status: "success",
        message: {},
      }, { status: "success", message: [ROW, ROW] }].map((bdBody) => ({
        bdBody,
      })),
    ]
  ) {
    const f = await exercise(options);
    unavailable(f);
    assert(
      f.requests.length === 1,
      "uncertain BD response probed or created accounts",
    );
  }
});

Deno.test("production Apple preflight rejects inconsistent totals and truncated paging", async () => {
  for (
    const metadata of [
      { total: 1 },
      { total: 2 },
      { total: -1 },
      { total: "unknown" },
      { total_pages: 2 },
      { total_pages: -1 },
      { total_pages: "unknown" },
      { next_page: "https://offline-preflight-bd.example.invalid/next" },
      { prev_page: "https://offline-preflight-bd.example.invalid/previous" },
    ]
  ) {
    const f = await exercise({
      bdBody: { status: "success", message: [], ...metadata },
    });
    unavailable(f);
    assert(
      f.requests.length === 1,
      "uncertain pagination was treated as absence",
    );
  }
  const f = await exercise({
    bdBody: { status: "success", message: [ROW], total: 0 },
  });
  unavailable(f);
  assert(
    f.requests.length === 1,
    "contradictory membership caused further reads or writes",
  );
});

Deno.test("production Apple preflight Auth and profile outages never authorize cleanup", async () => {
  for (
    const options of [{ authListStatus: 503 }, { profileStatus: 503 }, {
      authPages: [{}],
    }]
  ) {
    const f = await exercise({
      bdBody: { status: "success", message: [], total: 0 },
      ...options,
    });
    unavailable(f);
    assert(
      f.requests.every(({ url }) =>
        ["/api/v2/user/get", "/auth/v1/admin/users", "/rest/v1/profiles"]
          .includes(url.pathname)
      ),
      "absence proof outage caused an account mutation or fallback",
    );
  }
});

Deno.test("production Apple preflight enrolled missing or mismatched owners never become fresh signup", async () => {
  for (
    const options of [
      {
        authGetStatus: 404,
        authBody: { code: "user_not_found", message: "User not found" },
      },
      { authGetStatus: 503, authBody: { message: "temporarily unavailable" } },
      {
        authBody: { id: "fa1151a0-0000-4000-8000-000000000011", email: EMAIL },
      },
      { bdBody: { status: "success", message: [], total: 0 } },
      {
        bdBody: {
          status: "success",
          message: [{ ...ROW, user_id: "39049" }],
          total: 1,
        },
      },
      {
        bdBody: {
          status: "success",
          message: [{ ...ROW, email: "different@example.invalid" }],
          total: 1,
        },
      },
    ]
  ) {
    const f = await exercise(options, {
      expectedBdMemberId: MEMBER,
      expectedProfileId: PROFILE,
    });
    unavailable(f);
    assert(
      !f.requests.some(({ url }) =>
        url.pathname === "/auth/v1/admin/users" ||
        url.pathname === "/rest/v1/profiles"
      ),
      "enrolled failure attempted an email/profile fallback",
    );
  }
});
