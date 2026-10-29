import {
  ChatMemberAccessError,
  loadChatMemberAccess,
} from "./chat_member_access.ts";
import {
  loadMemberEmailVerification,
  MemberEmailIdentityChangedError,
  MemberEmailVerificationUnavailableError,
} from "./member_email_verification.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
async function rejected(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected access to fail closed");
}

const EMAIL = "member@example.invalid";
const NEXT_EMAIL = "changed@example.invalid";
type User = Record<string, unknown>;
function fixture() {
  const authenticated: User = {
    user_id: "42",
    email: EMAIL,
    active: "2",
    subscription_id: "6",
  };
  const state = {
    active: "2" as string | null,
    email: EMAIL,
    verification: "none",
    required: false,
    pending: null as string | null,
    overrides: {} as Record<string, unknown>,
    httpStatus: 200,
    transportFailure: false,
    freshUser: { ...authenticated } as User | undefined,
    freshError: null as Error | null,
    reviewer: false,
    afterProof: undefined as (() => void) | undefined,
  };
  const calls = { fresh: 0, website: 0, activePolicy: 0 };
  const order: string[] = [];
  const dependencies = {
    fetchFreshUser: async () => {
      calls.fresh++;
      order.push("fresh");
      if (state.freshError) throw state.freshError;
      return state.freshUser;
    },
    assertFreshMember: async (user: User) => {
      calls.activePolicy++;
      order.push("active");
      if (user.active !== "2" && !state.reviewer) {
        throw new ChatMemberAccessError("Active membership required", 403);
      }
    },
    loadVerification: (id: unknown, email: unknown) =>
      loadMemberEmailVerification(id, email, {
        secret: "fixture-only-email-status-secret-0123456789",
        baseUrl: "https://www.weddingwin.ca",
        now: () => 2_000_000_000_000,
        fetch: (async () => {
          calls.website++;
          order.push("website");
          if (state.transportFailure) throw new Error("offline");
          // The real PHP endpoint requires a freshly read active member before
          // emitting any successful status. Its source contract is tested too.
          const status = state.active !== "2" ? 503 : state.httpStatus;
          const body = status === 200
            ? {
              ok: true,
              user_id: "42",
              current_email: state.email,
              pending_email: state.pending,
              email_confirmation_required: state.required,
              email_verification_status: state.verification,
              ...state.overrides,
            }
            : { ok: false };
          state.afterProof?.();
          return Response.json(body, { status });
        }) as typeof fetch,
      }),
  };
  return {
    authenticated,
    state,
    calls,
    order,
    run: (action: string) =>
      loadChatMemberAccess(action, authenticated, dependencies),
  };
}

for (const action of ["status", "list", "read"]) {
  Deno.test(`${action} reuses profile fields but obtains uncached account/email proof each time`, async () => {
    const f = fixture();
    for (let n = 0; n < 3; n++) {
      const result = await f.run(action);
      equal(result.user.user_id, "42");
      equal(result.emailVerification.email_confirmation_required, false);
    }
    equal(f.calls, { fresh: 0, website: 3, activePolicy: 0 });
  });
}

Deno.test("300 clients polling twice per minute use zero extra BD member reads for 1200 passive requests", async () => {
  const f = fixture();
  for (let n = 0; n < 600; n++) await f.run("status");
  for (let n = 0; n < 300; n++) await f.run("list");
  for (let n = 0; n < 300; n++) await f.run("read");
  equal(f.calls, { fresh: 0, website: 1200, activePolicy: 0 });
});

for (
  const action of [
    "send",
    "open_vendor_profile",
    "report",
    "close",
    "unknown",
    "LIST",
    "",
  ]
) {
  Deno.test(`${action || "empty action"} retains a fresh BD lookup and existing active/reviewer policy`, async () => {
    const f = fixture();
    await f.run(action);
    equal(f.calls, { fresh: 1, website: 1, activePolicy: 1 });
    equal(f.order, ["fresh", "active", "website"]);
  });
}

Deno.test("fresh active proof overrides a stale inactive profile without mutating cached data", async () => {
  const f = fixture();
  f.authenticated.active = "0";
  const result = await f.run("status");
  equal(result.user.active, "2");
  equal(f.authenticated.active, "0");
  equal(f.calls.fresh, 0);
});

for (
  const condition of [
    "inactive",
    "deleted",
    "transport failure",
    "HTTP failure",
    "wrong member",
    "invalid email",
    "malformed pending",
    "invalid flags",
  ]
) {
  Deno.test(`passive ${condition} fails closed without a BD fallback`, async () => {
    const f = fixture();
    if (condition === "inactive") f.state.active = "0";
    if (condition === "deleted") f.state.active = null;
    if (condition === "transport failure") f.state.transportFailure = true;
    if (condition === "HTTP failure") f.state.httpStatus = 503;
    if (condition === "wrong member") {
      f.state.overrides = { user_id: "43", current_email: NEXT_EMAIL };
    }
    if (condition === "invalid email") {
      f.state.overrides = { current_email: "not-an-email" };
    }
    if (condition === "malformed pending") {
      f.state.overrides = {
        current_email: NEXT_EMAIL,
        pending_email: "unexpected@example.invalid",
      };
    }
    if (condition === "invalid flags") {
      f.state.overrides = {
        current_email: NEXT_EMAIL,
        email_confirmation_required: "false",
      };
    }
    const error = await rejected(() => f.run("read"));
    equal(error instanceof MemberEmailVerificationUnavailableError, true);
    equal(error instanceof MemberEmailIdentityChangedError, false);
    equal(f.calls.fresh, 0);
  });
}

for (const status of ["pending", "expired"]) {
  Deno.test(`${status} confirmation blocks access on every passive request with no BD refresh`, async () => {
    const f = fixture();
    f.state.verification = status;
    f.state.required = true;
    f.state.pending = NEXT_EMAIL;
    const result = await f.run("list");
    equal(result.emailVerification.email_confirmation_required, true);
    equal(f.calls.fresh, 0);
    f.state.email = NEXT_EMAIL;
    const error = await rejected(() => f.run("list"));
    equal(error instanceof MemberEmailVerificationUnavailableError, true);
    equal(error instanceof MemberEmailIdentityChangedError, false);
    equal(f.calls.fresh, 0);
  });
}

Deno.test("a verified changed email allows exactly one BD refresh and a second fresh proof", async () => {
  const f = fixture();
  f.state.email = NEXT_EMAIL;
  f.state.verification = "confirmed";
  f.state.freshUser = { ...f.authenticated, email: NEXT_EMAIL };
  const result = await f.run("read");
  equal(result.user.email, NEXT_EMAIL);
  equal(result.emailVerification.email_verification_status, "confirmed");
  equal(f.calls, { fresh: 1, website: 2, activePolicy: 1 });
  equal(f.order, ["website", "fresh", "active", "website"]);
});

for (
  const failure of [
    "missing member",
    "wrong member",
    "inactive",
    "old email",
    "BD outage",
    "second proof outage",
    "email changes twice",
  ]
) {
  Deno.test(`verified changed-email refresh fails closed for ${failure} without another lookup`, async () => {
    const f = fixture();
    f.state.email = NEXT_EMAIL;
    f.state.freshUser = { ...f.authenticated, email: NEXT_EMAIL };
    if (failure === "missing member") f.state.freshUser = undefined;
    if (failure === "wrong member") f.state.freshUser!.user_id = "43";
    if (failure === "inactive") f.state.freshUser!.active = "0";
    if (failure === "old email") f.state.freshUser!.email = EMAIL;
    if (failure === "BD outage") {
      f.state.freshError = new Error("upstream unavailable");
    }
    if (failure === "second proof outage") {
      f.state.afterProof = () => {
        f.state.transportFailure = true;
      };
    }
    if (failure === "email changes twice") {
      f.state.afterProof = () => {
        f.state.email = "third@example.invalid";
      };
    }
    await rejected(() => f.run("status"));
    equal(f.calls.fresh, 1);
    equal(f.calls.website <= 2, true);
  });
}

Deno.test("mutations never repeat a completed fresh lookup on email mismatch", async () => {
  const f = fixture();
  f.state.email = NEXT_EMAIL;
  const error = await rejected(() => f.run("send"));
  equal(error instanceof MemberEmailIdentityChangedError, true);
  equal(f.calls, { fresh: 1, website: 1, activePolicy: 1 });
});

Deno.test("existing private reviewer policy is invoked on mutations without bypassing fresh website proof", async () => {
  const f = fixture();
  f.state.freshUser!.active = "0";
  f.state.reviewer = true;
  f.state.active = "0";
  const error = await rejected(() => f.run("report"));
  equal(error instanceof MemberEmailVerificationUnavailableError, true);
  equal(f.calls, { fresh: 1, website: 1, activePolicy: 1 });
});

Deno.test("unknown or invalid authenticated member fails before any lookup", async () => {
  const f = fixture();
  f.authenticated.user_id = "0";
  const error = await rejected(() => f.run("status"));
  equal(error instanceof ChatMemberAccessError, true);
  equal(f.calls, { fresh: 0, website: 0, activePolicy: 0 });
});
