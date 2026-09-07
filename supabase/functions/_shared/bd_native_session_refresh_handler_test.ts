function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
type Handler = (request: Request) => Promise<Response>;
let captured: Handler | undefined;
async function loadHandler(): Promise<Handler> {
  if (captured) return captured;
  const saved = new Map<string, string | undefined>();
  for (
    const [key, value] of Object.entries({
      SUPABASE_URL: "https://offline-supabase.example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "offline-test-service-key",
      BD_API_BASE_URL: "https://offline-bd.example.invalid",
      BD_API_KEY: "offline-test-api-key",
    })
  ) {
    saved.set(key, Deno.env.get(key));
    Deno.env.set(key, value);
  }
  const descriptor = Object.getOwnPropertyDescriptor(Deno, "serve")!;
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    enumerable: descriptor.enumerable,
    writable: true,
    value: (handler: Handler) => {
      captured = handler;
      return {};
    },
  });
  try {
    await import("../bd-email-login/index.ts");
  } finally {
    Object.defineProperty(Deno, "serve", descriptor);
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
  assert(captured, "production handler was not captured");
  return captured;
}

async function nativeRequest(options: {
  status?: number;
  body?: unknown;
  network?: boolean;
  cacheStatus?: number;
  cacheToken?: string;
  session?: unknown;
}) {
  const handler = await loadHandler();
  const previousFetch = globalThis.fetch;
  const previousError = console.error;
  const paths: string[] = [];
  const memberLookups: URL[] = [];
  const diagnostics: unknown[] = [];
  console.error = (...values) => {
    diagnostics.push(values);
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    paths.push(url.pathname);
    assert(
      !init?.method || init.method === "GET",
      "failed refresh must not mutate API state",
    );
    if (url.hostname === "offline-bd.example.invalid") {
      memberLookups.push(url);
      if (options.network) throw new TypeError("offline-secret-network-detail");
      return Response.json(
        options.body ??
          {
            status: "success",
            message: [{
              user_id: "39048",
              email: "offline@example.invalid",
              active: "2",
            }],
          },
        { status: options.status ?? 200 },
      );
    }
    assert(
      url.hostname === "offline-supabase.example.invalid" &&
        url.pathname === "/rest/v1/bd_users_cache",
      "unexpected dependency request",
    );
    assert(
      url.searchParams.get("user_id") === "eq.39048",
      "cache lookup not bound to member ID",
    );
    return Response.json([{
      user_id: "39048",
      token: options.cacheToken ?? "offline-current-token",
      cookie: "",
    }], { status: options.cacheStatus ?? 200 });
  };
  try {
    const response = await handler(
      new Request("https://edge.example.invalid/bd-email-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          native_session: options.session ??
            { user_id: "39048", token: "offline-old-token" },
        }),
      }),
    );
    const body = await response.json();
    // Check outside the mocked fetch: the production handler intentionally
    // catches dependency exceptions, which could otherwise hide an incorrect
    // lookup URL as a passing 503 test.
    for (const url of memberLookups) {
      assert(
        url.pathname === "/api/v2/user/get",
        "request used direct get or escaped the filtered member endpoint",
      );
      assert(
        url.searchParams.get("property") === "user_id" &&
          url.searchParams.get("property_operator") === "eq" &&
          url.searchParams.get("property_value") === "39048" &&
          url.searchParams.get("limit") === "2",
        "member lookup was not an exact-ID, two-row bounded filter",
      );
      assert(
        [...url.searchParams.keys()].sort().join(",") ===
          "limit,property,property_operator,property_value",
        "member lookup contains duplicate, email or additional query fields",
      );
    }
    assert(
      response.headers.get("Cache-Control") === "no-store",
      "auth failure cacheable",
    );
    assert(
      !JSON.stringify({ body, diagnostics }).includes(
        "offline-secret-network-detail",
      ),
      "upstream detail leaked",
    );
    assert(
      !body.native_session && !body.app_login_url,
      "failure returned login credentials",
    );
    return { status: response.status, body, paths };
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousError;
  }
}

Deno.test("BD native refresh handler returns503 for upstream HTTP failures, not expired-session401", async () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    const result = await nativeRequest({
      status,
      body: { status: "success", message: [] },
    });
    assert(
      result.status === 503,
      `upstream ${status} caused a logout response`,
    );
    assert(
      result.paths.length === 1 &&
        result.body.error === "Login is temporarily unavailable.",
      "outage used fallback or leaked details",
    );
  }
});
Deno.test("BD native refresh handler returns503 for network, malformed success and cache outages", async () => {
  for (
    const options of [
      { network: true },
      { body: { status: "error", message: "offline-private-upstream-detail" } },
      { body: { status: "success", message: null } },
      { body: { status: "success", message: [{ user_id: "39049" }] } },
      { cacheStatus: 503 },
    ]
  ) {
    const result = await nativeRequest(options);
    assert(result.status === 503, "unconfirmed session status caused logout");
  }
});
Deno.test("BD native refresh handler preserves401 for confirmed missing member or mismatched canonical token", async () => {
  const missing = await nativeRequest({
    body: {
      status: "success",
      message: [],
      total: 0,
      pagination: { page: 1, limit: 2 },
    },
  });
  assert(
    missing.status === 401 && missing.paths.length === 1,
    "confirmed deletion did not expire session",
  );
  assert(
    missing.paths[0] === "/api/v2/user/get",
    "confirmed absence consulted cache or another lookup",
  );
  assert(
    missing.body.error === "Stored session expired. Please sign in again.",
    "confirmed deletion did not return the established expired-session contract",
  );
  const revoked = await nativeRequest({});
  assert(
    revoked.status === 401 && revoked.paths.length === 2,
    "canonical token mismatch did not expire session",
  );
  assert(
    revoked.body.error === "Stored session expired. Please sign in again.",
    "expired-session contract changed",
  );
});
Deno.test("BD native refresh handler rejects duplicate rows and ignored exact-ID filters with503", async () => {
  for (
    const message of [
      [{ user_id: "39048" }, { user_id: "39048" }],
      [{ user_id: "39048" }, { user_id: "39049" }],
      [{ user_id: "39049", email: "offline@example.invalid" }],
      { user_id: "39049", email: "offline@example.invalid" },
    ]
  ) {
    const result = await nativeRequest({
      body: { status: "success", message },
    });
    assert(
      result.status === 503,
      "ambiguous or ignored filter caused logout or login",
    );
    assert(
      result.paths.length === 1 && result.paths[0] === "/api/v2/user/get",
      "ambiguous member response attempted cache or email fallback",
    );
    assert(
      result.body.error === "Login is temporarily unavailable.",
      "ambiguous member response leaked backend details",
    );
  }
});
Deno.test("BD native refresh handler never interprets status errors or near-miss messages as confirmed absence", async () => {
  for (
    const body of [
      { status: "error", message: "No user record with user_id=39048." },
      { status: "error", message: "No user record with user_id=39049." },
      { status: "error", message: "No user record with user_id=39048" },
      {
        status: "error",
        message: "No user record with user_id=39048. Temporarily unavailable.",
      },
      { status: "error", message: [], total: 0 },
      { status: "success", message: "No user record with user_id=39048." },
      { status: "Success", message: [], total: 0 },
      { message: [], total: 0 },
    ]
  ) {
    const result = await nativeRequest({ body });
    assert(
      result.status === 503 && result.paths.length === 1,
      "uncertain absence was classified as deleted account or authorized from cache",
    );
    assert(
      result.body.error === "Login is temporarily unavailable.",
      "untrusted upstream message leaked into client response",
    );
  }
});
Deno.test("BD native refresh handler expires known inactive members before cache or auth writes", async () => {
  for (const active of ["1", 1, "3", 3, "4", 4, "5", 5, "6", 6]) {
    const result = await nativeRequest({
      body: { status: "success", message: [{ user_id: "39048", active }] },
    });
    assert(
      result.status === 401 &&
        result.body.error === "Stored session expired. Please sign in again.",
      "confirmed inactive session did not expire",
    );
    assert(
      result.paths.length === 1,
      "inactive refresh continued to cache or a write",
    );
  }
});

Deno.test("BD native refresh handler preserves session on missing or ambiguous active status", async () => {
  for (
    const active of [
      undefined,
      null,
      "",
      "0",
      0,
      "99",
      99,
      "2 ",
      "02",
      true,
      false,
      [2],
      [1],
      {},
    ]
  ) {
    const result = await nativeRequest({
      body: { status: "success", message: [{ user_id: "39048", active }] },
    });
    assert(
      result.status === 503 &&
        result.body.error === "Login is temporarily unavailable.",
      "unknown status caused expiry",
    );
    assert(
      result.paths.length === 1,
      "unknown status continued to cache or a write",
    );
  }
});

Deno.test("BD native refresh handler rejects malformed session locally without querying member or cache", async () => {
  const result = await nativeRequest({
    session: { user_id: "39048", token: "" },
  });
  assert(
    result.status === 401 && result.paths.length === 0,
    "invalid local credential reached dependencies",
  );
});
