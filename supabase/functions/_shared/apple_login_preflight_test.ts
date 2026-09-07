import {
  AppleSignupRequiredError,
  requireAppleLoginPreflight,
} from "./apple_login_preflight.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policy_consent.ts";

const EMAIL = "apple-preflight@example.invalid";
const PROFILE = "fa1151a0-0000-4000-8000-000000000008";
const MEMBER = "39048";
const CLAIMS = {
  iss: "https://appleid.apple.com",
  sub: "offline-apple-subject",
  aud: "ca.weddingwin.web.test",
  email: EMAIL,
  email_verified: true,
};
const MEMBER_ROW = { user_id: MEMBER, email: EMAIL, active: "2" };
type Args = Parameters<typeof requireAppleLoginPreflight>[0];
type Dependencies = Parameters<typeof requireAppleLoginPreflight>[1];

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function consent() {
  return {
    acceptedAt: new Date().toISOString(),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  };
}

function fixture(options: {
  members?: unknown;
  member?: Record<string, unknown> | null;
  auth?: { id?: unknown; email?: unknown } | null;
  hasAuth?: boolean;
  hasProfile?: boolean;
  fail?: keyof Dependencies;
} = {}) {
  const calls: { name: keyof Dependencies; input: unknown }[] = [];
  const record = (name: keyof Dependencies, input: unknown) => {
    calls.push({ name, input });
    if (options.fail === name) {
      throw new Error(`PRIVATE_PREFLIGHT_FAILURE ${name} ${EMAIL}`);
    }
  };
  const deps: Dependencies = {
    membersByEmail: (email) => {
      record("membersByEmail", email);
      return Promise.resolve(
        ("members" in options ? options.members : [MEMBER_ROW]) as unknown[],
      );
    },
    memberById: (id) => {
      record("memberById", id);
      return Promise.resolve(
        "member" in options ? options.member! : MEMBER_ROW,
      );
    },
    authUserById: (id) => {
      record("authUserById", id);
      return Promise.resolve(
        "auth" in options ? options.auth! : { id: PROFILE, email: EMAIL },
      );
    },
    hasAuthUserByEmail: (email) => {
      record("hasAuthUserByEmail", email);
      return Promise.resolve(options.hasAuth ?? false);
    },
    hasProfileByAppleSubject: (sub) => {
      record("hasProfileByAppleSubject", sub);
      return Promise.resolve(options.hasProfile ?? false);
    },
  };
  const run = (overrides: Partial<Args> = {}) =>
    requireAppleLoginPreflight({
      claims: { ...CLAIMS },
      consent: null,
      ...overrides,
    }, deps);
  return { calls, run };
}

async function rejected(run: () => Promise<unknown>): Promise<Error> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error, "preflight unexpectedly authorized login");
  return caught;
}

async function genericFailure(run: () => Promise<unknown>) {
  const error = await rejected(run);
  assert(
    !(error instanceof AppleSignupRequiredError),
    "uncertain/existing identity was offered fresh-signup cleanup",
  );
  assert(
    !error.message.includes("PRIVATE_PREFLIGHT_FAILURE") &&
      !error.message.includes(EMAIL),
    "preflight exposed private lookup error details",
  );
}

Deno.test("Apple preflight explicit current consent permits signup without account reads", async () => {
  const f = fixture({ fail: "membersByEmail" });
  const result = await f.run({ consent: consent() });
  assert(
    Object.keys(result).length === 0,
    "explicit signup was pinned to an inferred account",
  );
  assert(
    f.calls.length === 0,
    "explicit signup caused preflight account reads",
  );
});

Deno.test("Apple preflight invalid or stale explicit consent is rejected without account reads", async () => {
  for (
    const value of [
      false,
      true,
      "",
      [],
      {},
      { ...consent(), termsVersion: "2020-01-01" },
      { ...consent(), privacyVersion: "2020-01-01" },
      { ...consent(), acceptedAt: "not-a-date" },
      {
        ...consent(),
        acceptedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
      },
      {
        ...consent(),
        acceptedAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
      },
    ]
  ) {
    const f = fixture();
    await genericFailure(() => f.run({ consent: value }));
    assert(
      f.calls.length === 0,
      "invalid explicit agreement fell back to account lookup",
    );
  }
});

Deno.test("Apple preflight missing or unverified signed email cannot use request email or infer signup cleanup", async () => {
  for (
    const claims of [
      { ...CLAIMS, email: undefined },
      { ...CLAIMS, email: "" },
      { ...CLAIMS, email: "   " },
      ...[undefined, false, "false", "TRUE", "1"].map((email_verified) => ({
        ...CLAIMS,
        email_verified,
      })),
    ]
  ) {
    const f = fixture();
    await genericFailure(() =>
      f.run({ claims, email: EMAIL } as Partial<Args>)
    );
    assert(
      f.calls.length === 0,
      "missing Apple email proof reached account lookups",
    );
  }
});

Deno.test("Apple preflight rejects issuer, subject and audience proof mixups before lookups", async () => {
  for (
    const claims of [
      { ...CLAIMS, iss: "https://accounts.google.com" },
      { ...CLAIMS, iss: "https://appleid.apple.com.attacker.invalid" },
      { ...CLAIMS, sub: "" },
      { ...CLAIMS, sub: "   " },
      { ...CLAIMS, aud: "" },
      { ...CLAIMS, aud: "   " },
    ]
  ) {
    const f = fixture();
    await genericFailure(() => f.run({ claims }));
    assert(
      f.calls.length === 0,
      "invalid verified-identity contract reached lookup",
    );
  }
});

Deno.test("Apple preflight existing cross-provider account is pinned by signed verified email", async () => {
  const f = fixture();
  const result = await f.run();
  assert(
    result.expectedBdMemberId === MEMBER,
    "existing account was not pinned",
  );
  assert(
    f.calls.length === 1 && f.calls[0].name === "membersByEmail" &&
      f.calls[0].input === EMAIL,
    "unbound login did not use only the signed email lookup",
  );
});

Deno.test("Apple preflight normalizes signed verified email and accepts canonical numeric member IDs", async () => {
  const f = fixture({
    members: [{
      ...MEMBER_ROW,
      user_id: 39048,
      active: 2,
      email: EMAIL.toUpperCase(),
    }],
  });
  const result = await f.run({
    claims: {
      ...CLAIMS,
      email: ` ${EMAIL.toUpperCase()} `,
      email_verified: "true",
    },
  });
  assert(
    result.expectedBdMemberId === MEMBER,
    "canonical numeric member was not pinned",
  );
  assert(f.calls[0].input === EMAIL, "signed email was not normalized");
});

Deno.test("Apple preflight missing BD member requires separate Auth and Apple-profile absence before cleanup", async () => {
  const f = fixture({ members: [] });
  const error = await rejected(() => f.run());
  assert(
    error instanceof AppleSignupRequiredError && error.cleanupEligible === true,
    "fully absent account did not produce cleanup-eligible signup prompt",
  );
  assert(
    f.calls.some((call) =>
      call.name === "hasAuthUserByEmail" && call.input === EMAIL
    ),
    "Auth absence was not established",
  );
  assert(
    f.calls.some((call) =>
      call.name === "hasProfileByAppleSubject" && call.input === CLAIMS.sub
    ),
    "Apple-subject profile absence was not established",
  );
  assert(
    !f.calls.some((call) =>
      call.name === "memberById" || call.name === "authUserById"
    ),
    "missing account guessed a member/profile ID",
  );
});

Deno.test("Apple preflight never authorizes failed-signup cleanup when Auth or subject profile still exists", async () => {
  for (
    const flags of [{ hasAuth: true }, { hasProfile: true }, {
      hasAuth: true,
      hasProfile: true,
    }]
  ) {
    const f = fixture({ members: [], ...flags });
    const error = await rejected(() => f.run());
    assert(
      error instanceof AppleSignupRequiredError &&
        error.cleanupEligible === false,
      "existing app identity was declared safe for signup cleanup",
    );
  }
});

Deno.test("Apple preflight lookup outages never imply missing account or cleanup permission", async () => {
  for (
    const fail of [
      "membersByEmail",
      "hasAuthUserByEmail",
      "hasProfileByAppleSubject",
    ] as const
  ) {
    const f = fixture({ members: [], fail });
    await genericFailure(() => f.run());
  }
});

Deno.test("Apple preflight duplicate, malformed and wrong-email lookup rows are errors, not fresh signup", async () => {
  for (
    const members of [
      null,
      undefined,
      {},
      "unavailable",
      [null],
      [false],
      [[]],
      [{}],
      [MEMBER_ROW, MEMBER_ROW],
      [MEMBER_ROW, null],
      [{ ...MEMBER_ROW, email: "another@example.invalid" }],
      [{ ...MEMBER_ROW, email: "" }],
    ]
  ) {
    const f = fixture({ members });
    await genericFailure(() => f.run());
    assert(
      !f.calls.some((call) =>
        call.name === "hasAuthUserByEmail" ||
        call.name === "hasProfileByAppleSubject"
      ),
      "malformed or ambiguous BD lookup was converted to an absence check",
    );
  }
});

Deno.test("Apple preflight only accepts active status2 and canonical safe member IDs", async () => {
  for (
    const active of [
      undefined,
      null,
      "",
      "1",
      1,
      "0",
      0,
      "3",
      "02",
      " 2",
      true,
      {},
    ]
  ) {
    const f = fixture({ members: [{ ...MEMBER_ROW, active }] });
    await genericFailure(() => f.run());
  }
  for (
    const user_id of [
      undefined,
      null,
      "",
      "0",
      0,
      -1,
      "0123",
      " 39048",
      "39048\n",
      true,
      {},
      [],
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      "1".repeat(20),
    ]
  ) {
    const f = fixture({ members: [{ ...MEMBER_ROW, user_id }] });
    await genericFailure(() => f.run());
  }
});

Deno.test("Apple preflight enrolled owner uses immutable Auth and BD identities even if Apple email is old", async () => {
  const f = fixture();
  const result = await f.run({
    expectedBdMemberId: MEMBER,
    expectedProfileId: PROFILE,
    claims: { ...CLAIMS, email: "previous-apple-email@example.invalid" },
  });
  assert(
    result.expectedBdMemberId === MEMBER,
    "enrolled owner lost immutable member binding",
  );
  assert(
    f.calls.length === 2 &&
      f.calls.some((call) =>
        call.name === "memberById" && call.input === MEMBER
      ) &&
      f.calls.some((call) =>
        call.name === "authUserById" && call.input === PROFILE
      ),
    "enrolled login used mutable email instead of exact owners",
  );
});

Deno.test("Apple preflight enrolled missing Auth/member or current identity mismatch never becomes signup", async () => {
  for (
    const options of [
      { auth: null },
      { member: null },
      { auth: { id: "fa1151a0-0000-4000-8000-000000000009", email: EMAIL } },
      { auth: { id: PROFILE, email: "another@example.invalid" } },
      { auth: { id: PROFILE, email: "" } },
      { member: { ...MEMBER_ROW, user_id: "39049" } },
      { member: { ...MEMBER_ROW, email: "another@example.invalid" } },
      { member: { ...MEMBER_ROW, active: "1" } },
    ]
  ) {
    const f = fixture(options);
    await genericFailure(() =>
      f.run({ expectedBdMemberId: MEMBER, expectedProfileId: PROFILE })
    );
    assert(
      !f.calls.some((call) =>
        call.name === "membersByEmail" || call.name === "hasAuthUserByEmail" ||
        call.name === "hasProfileByAppleSubject"
      ),
      "enrolled identity failure attempted a new-account lookup",
    );
  }
});

Deno.test("Apple preflight enrolled dependency outages remain errors and cannot enable cleanup", async () => {
  for (const fail of ["memberById", "authUserById"] as const) {
    const f = fixture({ fail });
    await genericFailure(() =>
      f.run({ expectedBdMemberId: MEMBER, expectedProfileId: PROFILE })
    );
  }
});

Deno.test("Apple preflight malformed or partial immutable owner binding fails before all reads", async () => {
  for (
    const overrides of [
      { expectedBdMemberId: MEMBER },
      { expectedProfileId: PROFILE },
      { expectedBdMemberId: "0", expectedProfileId: PROFILE },
      { expectedBdMemberId: "39048\n", expectedProfileId: PROFILE },
      { expectedBdMemberId: MEMBER, expectedProfileId: "not-a-uuid" },
      { expectedBdMemberId: MEMBER, expectedProfileId: PROFILE + "\n" },
    ]
  ) {
    const f = fixture();
    await genericFailure(() => f.run(overrides));
    assert(
      f.calls.length === 0,
      "invalid immutable binding reached account APIs",
    );
  }
});
