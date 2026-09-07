import { validateNativeAppleExchange } from "./apple_native_exchange_validation.ts";

const ID = "aabbccdd-1234-4321-8123-000000000001";
const EMAIL = "offline-apple-test@example.invalid";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function fixture() {
  const values = {
    profile: { id: ID, bd_member_id: "990001" } as
      | Record<string, unknown>
      | null,
    auth: { id: ID, email: EMAIL } as Record<string, unknown> | null,
    identity: {
      user_id: "990001",
      token: "offline-canonical-token",
      cookie: "offline-cookie",
    } as Record<string, unknown> | null,
    member: {
      user_id: "990001",
      email: EMAIL,
      active: "2",
      subscription_id: "17",
    } as
      | Record<string, unknown>
      | null,
    fail: "",
    deletedAfterIdentityRead: false,
  };
  const reads: string[] = [];
  const session = {
    user_id: "990001",
    token: "offline-canonical-token",
    cookie: "offline-cookie",
  };
  const user = { user_id: "990001", email: EMAIL, subscription_id: "17" };
  const lookup = (
    kind: "profile" | "auth" | "identity" | "member",
    id: string,
  ) => {
    assert(
      id === (kind === "profile" || kind === "auth" ? ID : "990001"),
      "lookup target not immutable ID",
    );
    reads.push(kind);
    if (values.fail === kind) throw new Error("offline-private-error");
    const result = values[kind];
    if (kind === "identity" && values.deletedAfterIdentityRead) {
      values.member = null;
    }
    return Promise.resolve(result);
  };
  const run = () =>
    validateNativeAppleExchange(session, user, ID, {
      profile: (id) => lookup("profile", id),
      authUser: (id) => lookup("auth", id),
      identity: (id) => lookup("identity", id),
      member: (id) => lookup("member", id),
    });
  return { values, session, user, reads, run };
}

Deno.test("Apple exchange validation requires exact profile/Auth/token and authoritative BD existence last", async () => {
  const f = fixture();
  assert(await f.run(), "valid current session rejected");
  assert(
    f.reads.join(",") === "profile,auth,identity,member",
    "authoritative existence was not the last read",
  );
});
Deno.test("Apple exchange validation rejects deleted, rebound or replaced exact profiles/Auth", async () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => {
      f.values.profile = null;
    },
    (f: ReturnType<typeof fixture>) => {
      f.values.profile!.id = "different-profile";
    },
    (f: ReturnType<typeof fixture>) => {
      f.values.profile!.bd_member_id = "990002";
    },
    (f: ReturnType<typeof fixture>) => {
      f.values.auth = null;
    },
    (f: ReturnType<typeof fixture>) => {
      f.values.auth!.id = "different-auth";
    },
    (f: ReturnType<typeof fixture>) => {
      f.values.auth!.email = "new-owner@example.invalid";
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    assert(!await f.run(), "old profile/Auth snapshot accepted");
  }
});
Deno.test("Apple exchange validation rejects missing canonical identity and changed tokens/cookies", async () => {
  for (const field of ["absent", "user_id", "token", "cookie"]) {
    const f = fixture();
    if (field === "absent") f.values.identity = null;
    else f.values.identity![field] = "changed";
    assert(!await f.run(), "old canonical session accepted");
    assert(!f.reads.includes("member"), "known invalid token continued");
  }
});
Deno.test("Apple exchange validation never lets a populated cache replace live BD existence", async () => {
  for (
    const mode of [
      "absent",
      "different_id",
      "new_owner",
      "inactive",
      "missing_active",
      "plan_changed",
      "plan_missing",
    ]
  ) {
    const f = fixture();
    if (mode === "absent") f.values.member = null;
    else if (mode === "different_id") f.values.member!.user_id = "990002";
    else if (mode === "new_owner") {
      f.values.member!.email = "new-owner@example.invalid";
    } else if (mode === "missing_active") delete f.values.member!.active;
    else if (mode === "plan_changed") f.values.member!.subscription_id = "18";
    else if (mode === "plan_missing") delete f.values.member!.subscription_id;
    else f.values.member!.active = "1";
    assert(!await f.run(), "stale/recreated/deactivated member accepted");
  }
});
Deno.test("Apple exchange validation rejects mismatched payload member identity before reads", async () => {
  const f = fixture();
  f.user.user_id = "990002";
  assert(
    !await f.run() && f.reads.length === 0,
    "payload and session identity disagreed",
  );
});

Deno.test("Apple exchange validation catches deletion between earlier reads and final BD read", async () => {
  const f = fixture();
  f.values.deletedAfterIdentityRead = true;
  assert(!await f.run(), "mid-validation deletion returned saved session");
});
Deno.test("Apple exchange validation never falls back when a dependency is unavailable", async () => {
  for (const kind of ["profile", "auth", "identity", "member"]) {
    const f = fixture();
    f.values.fail = kind;
    let failed = false;
    try {
      await f.run();
    } catch {
      failed = true;
    }
    assert(failed, "outage authorized old session");
    assert(f.reads.at(-1) === kind, "outage continued with weaker fallback");
  }
});
Deno.test("Apple exchange production adapter checks exact BD HTTP status with no email lookup", async () => {
  const source = await Deno.readTextFile(
    new URL("./apple_native_exchange_store.ts", import.meta.url),
  );
  assert(
    source.includes("/api/v2/user/get/${encodeURIComponent(id)}") &&
      source.includes('body.status !== "success"') &&
      source.includes("body.message.length !== 1"),
    "exact authoritative lookup missing",
  );
  assert(
    !source.includes("fetchBdUserByEmail") &&
      !source.includes('property: "email"'),
    "email-only lookup introduced",
  );
  const index = await Deno.readTextFile(
    new URL("../apple-native-exchange/index.ts", import.meta.url),
  );
  assert(
    index.includes("validateSession: validateStoredAppleNativeSession"),
    "redemption validator not wired",
  );
});
