import type { AppleClaims } from "./apple_auth.ts";

const PROFILE = "fa1151a0-0000-4000-8000-000000000061";
const OTHER_PROFILE = "fa1151a0-0000-4000-8000-000000000062";
const SUBJECT = "offline-confirmed-contact-apple-subject";
const RELAY = "offline-private@privaterelay.appleid.com";
const CONTACT = "confirmed-contact@example.invalid";
const CLAIMS: AppleClaims = {
  sub: SUBJECT,
  iss: "https://appleid.apple.com",
  aud: "ca.weddingwin.offline.web",
  email: RELAY,
  email_verified: true,
};

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

type Options = {
  profile?: Record<string, unknown> | null;
  profileStatus?: number;
  authEmail?: string;
  authStatus?: number;
  upsertStatus?: number;
};

let activeFetch: typeof fetch | undefined;
const offlineFetch: typeof fetch = (input, init) => {
  if (!activeFetch) {
    throw new Error("Offline contact-email fixture is inactive");
  }
  return activeFetch(input, init);
};

// Exercise the real upsertAppleUser function and Supabase client request path.
// Every request is intercepted. Unknown URLs/methods are recorded and rejected;
// fixtures cannot contact Apple, Supabase, BD, or read real account data.
async function exercise(
  options: Options = {},
  overrides: Partial<
    Parameters<typeof import("./apple_auth.ts").upsertAppleUser>[0]
  > = {},
) {
  const savedFetch = globalThis.fetch;
  const settings: Record<string, string> = {
    SUPABASE_URL: "https://offline-contact-supabase.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "offline-only-contact-service-key",
    BD_API_BASE_URL: "https://offline-contact-bd.example.invalid",
    BD_API_KEY: "offline-only-contact-bd-key",
  };
  const savedSettings = new Map(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  const requests: { url: URL; method: string }[] = [];
  const upserts: Record<string, unknown>[] = [];
  const unexpected: string[] = [];
  let result:
    | Awaited<ReturnType<typeof import("./apple_auth.ts").upsertAppleUser>>
    | undefined;
  let error: unknown;
  try {
    for (const [key, value] of Object.entries(settings)) {
      Deno.env.set(key, value);
    }
    activeFetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ||
        (input instanceof Request ? input.method : "GET");
      requests.push({ url, method });
      if (url.origin === settings.SUPABASE_URL) {
        if (url.pathname === "/rest/v1/profiles" && method === "GET") {
          const profile = "profile" in options ? options.profile : {
            id: PROFILE,
            // Intentionally leave the profile mirror stale. The immutable
            // enrollment must prefer current Auth, not this old relay email.
            email: RELAY,
            display_name: "Offline Existing Member",
          };
          return Promise.resolve(Response.json(
            options.profileStatus
              ? { message: "offline profile failure" }
              : profile
              ? [profile]
              : [],
            { status: options.profileStatus || 200 },
          ));
        }
        if (
          url.pathname === `/auth/v1/admin/users/${PROFILE}` && method === "GET"
        ) {
          return Promise.resolve(Response.json(
            options.authStatus ? { message: "offline auth failure" } : {
              id: PROFILE,
              email: options.authEmail ?? CONTACT,
            },
            { status: options.authStatus || 200 },
          ));
        }
        if (url.pathname === "/rest/v1/profiles" && method === "POST") {
          upserts.push(JSON.parse(String(init?.body || "{}")));
          return Promise.resolve(
            options.upsertStatus
              ? Response.json({ message: "offline profile write failure" }, {
                status: options.upsertStatus,
              })
              : new Response(null, { status: 201 }),
          );
        }
      }
      unexpected.push(`${method} ${url.origin}${url.pathname}`);
      return Promise.resolve(
        Response.json({ error: "unexpected offline request" }, {
          status: 500,
        }),
      );
    };
    globalThis.fetch = offlineFetch;
    const { upsertAppleUser } = await import("./apple_auth.ts");
    try {
      result = await upsertAppleUser({
        claims: CLAIMS,
        expectedProfileId: PROFILE,
        ...overrides,
      });
    } catch (caught) {
      error = caught;
    }
  } finally {
    globalThis.fetch = savedFetch;
    activeFetch = undefined;
    for (const [key, value] of savedSettings) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
  // Assert outside the production helper, so generic error handling cannot
  // turn an unexpected write or email-owner lookup into a passing rejection.
  assert(
    unexpected.length === 0,
    `Unexpected requests: ${unexpected.join(", ")}`,
  );
  for (const { url, method } of requests) {
    if (url.pathname === "/rest/v1/profiles" && method === "GET") {
      assert(
        url.searchParams.get("select") === "id,email,display_name" &&
          url.searchParams.get("apple_sub") === `eq.${SUBJECT}` &&
          [...url.searchParams.keys()].sort().join(",") === "apple_sub,select",
        "profile lookup must remain scoped to the signed Apple subject",
      );
    }
    if (url.pathname.startsWith("/auth/")) {
      assert(
        method === "GET" &&
          url.pathname === `/auth/v1/admin/users/${PROFILE}` &&
          !url.search,
        "returning login must not change Auth email or find another email owner",
      );
    }
  }
  return { result, error, requests, upserts };
}

function preserved(outcome: Awaited<ReturnType<typeof exercise>>) {
  assert(!outcome.error, "confirmed-contact returning login failed");
  assert(outcome.result?.userId === PROFILE, "immutable profile UUID changed");
  assert(outcome.result?.appleSub === SUBJECT, "Apple subject changed");
  assert(
    outcome.result?.email === CONTACT,
    "provider relay replaced confirmed Auth contact",
  );
  assert(
    outcome.upserts.length === 1,
    "expected one existing-profile mirror update",
  );
  assert(
    outcome.upserts[0].id === PROFILE &&
      outcome.upserts[0].apple_sub === SUBJECT &&
      outcome.upserts[0].email === CONTACT,
    "persisted profile lost immutable owner or confirmed contact email",
  );
  assert(
    outcome.requests.length === 3,
    "returning contact update should need only subject lookup, exact Auth read and profile mirror",
  );
}

Deno.test("actual Apple upsert preserves confirmed contact when a returning token still contains the original private relay", async () => {
  const outcome = await exercise({}, { email: RELAY });
  preserved(outcome);
  assert(
    outcome.result?.fullName === "Offline Existing Member",
    "returning Apple login discarded the existing display name",
  );
});

Deno.test("actual Apple upsert keeps immutable ownership and confirmed contact when returning Apple claims omit email", async () => {
  preserved(
    await exercise({}, {
      claims: { ...CLAIMS, email: undefined, email_verified: undefined },
      email: undefined,
    }),
  );
});

Deno.test("actual Apple upsert cannot replace confirmed contact with an unsigned supplied email when Apple omits email", async () => {
  preserved(
    await exercise({}, {
      claims: { ...CLAIMS, email: undefined, email_verified: undefined },
      email: "unsigned-replacement@example.invalid",
    }),
  );
});

Deno.test("actual Apple upsert retains normal contact when both Auth and profile already reflect the verified change", async () => {
  preserved(
    await exercise({
      profile: {
        id: PROFILE,
        email: CONTACT,
        display_name: "Offline Existing Member",
      },
    }),
  );
});

Deno.test("actual Apple upsert rejects a missing or different enrolled profile without account creation", async () => {
  for (const profile of [null, { id: OTHER_PROFILE, email: CONTACT }]) {
    const outcome = await exercise({ profile });
    assert(
      outcome.error instanceof Error && !outcome.result,
      "enrollment mismatch was accepted",
    );
    assert(outcome.upserts.length === 0, "enrollment mismatch wrote a profile");
    assert(
      outcome.requests.length === 1,
      "enrollment mismatch performed a new-account lookup",
    );
  }
});

Deno.test("actual Apple upsert rejects mismatched caller profile IDs before Auth reads or writes", async () => {
  const outcome = await exercise({}, { expectedProfileId: OTHER_PROFILE });
  assert(
    outcome.error instanceof Error && !outcome.result,
    "wrong enrolled owner was accepted",
  );
  assert(
    outcome.upserts.length === 0 && outcome.requests.length === 1,
    "wrong owner reached account mutations",
  );
});

Deno.test("actual Apple upsert fails closed when authoritative Auth lookup fails or lacks email", async () => {
  for (
    const options of [{ authStatus: 404 }, { authStatus: 503 }, {
      authEmail: "",
    }]
  ) {
    const outcome = await exercise(options);
    assert(
      outcome.error instanceof Error && !outcome.result,
      "missing authoritative Auth email was accepted",
    );
    assert(outcome.upserts.length === 0, "Auth lookup failure wrote a profile");
  }
});

Deno.test("actual Apple upsert cannot infer an email change from a mutable profile without the enrolled owner context", async () => {
  const outcome = await exercise({}, { expectedProfileId: undefined });
  assert(
    outcome.error instanceof Error && !outcome.result,
    "mutable profile alone authorized an email mismatch",
  );
  assert(outcome.upserts.length === 0, "unenrolled mismatch updated a profile");
});

Deno.test("actual Apple upsert rejects supplied email disagreement with signed relay before account access", async () => {
  const outcome = await exercise({}, { email: CONTACT });
  assert(
    outcome.error instanceof Error && !outcome.result,
    "unsigned email overrode provider claims",
  );
  assert(
    outcome.requests.length === 0 && outcome.upserts.length === 0,
    "mismatched input reached account APIs",
  );
});

Deno.test("actual Apple upsert reports lookup and mirror-write failures rather than successful contact updates", async () => {
  for (const options of [{ profileStatus: 500 }, { upsertStatus: 500 }]) {
    const outcome = await exercise(options);
    assert(
      outcome.error instanceof Error && !outcome.result,
      "profile failure returned an identity success",
    );
  }
});
