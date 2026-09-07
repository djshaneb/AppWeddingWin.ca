import {
  type AppleGrantBinding,
  AppleReceiptError,
  type AppleRevocationJob,
  type AppleStoredGrant,
  equalAppleSecret,
  inspectBdAbsence,
  openAppleRefreshToken,
  parseAppleDeletionReceipt,
  runAppleRevocationJob,
  sealAppleRefreshToken,
} from "./apple_grant_lifecycle.ts";
import type {
  AppleGrantLoginContext,
  AppleGrantSigninDependencies,
} from "./apple_grant_store.ts";
import type { AppleClaims } from "./apple_auth.ts";
import { AppleSignupRequiredError } from "./apple_login_preflight.ts";
import {
  type AppleFailedSignupEnqueue,
  openAppleFailedSignupGrant,
} from "./apple_failed_signup.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}
async function rejects(action: () => Promise<unknown>, status?: number) {
  try {
    await action();
  } catch (error) {
    if (status !== undefined) {
      assert(
        error instanceof AppleReceiptError && error.status === status,
        `Expected receipt status ${status}`,
      );
    }
    return;
  }
  throw new Error("Expected rejection");
}

const secret = "test-only-webhook-secret-".repeat(3);
const key = "12".repeat(32);
const binding: AppleGrantBinding = {
  identityId: "identity-fixture",
  generation: "generation-fixture",
  grantId: "grant-fixture",
  clientId: "ca.example.fixture",
  appleSub: "apple-fixture",
  bdMemberId: "123",
  profileId: "profile-fixture",
};
const sealedFixture = {
  ciphertext: "ciphertext-fixture",
  iv: "iv-fixture",
  keyVersion: 1 as const,
};
const grant: AppleStoredGrant = { ...binding, ...sealedFixture };
const job: AppleRevocationJob = {
  id: "job-fixture",
  leaseToken: "lease-fixture",
  bdMemberId: "123",
  expectedGrants: 1,
};

function receipt(
  body: string,
  options: { query?: string; type?: string; method?: string } = {},
) {
  const method = options.method || "POST";
  return new Request(
    `https://example.invalid/deleted?${
      options.query ?? `secret=${encodeURIComponent(secret)}`
    }`,
    {
      method,
      headers: {
        "Content-Type": options.type || "application/x-www-form-urlencoded",
      },
      ...(method === "GET" ? {} : { body }),
    },
  );
}
const validForm = "user_action=member_deleted&user_id=123";

Deno.test("Apple grant encryption uses fresh IVs and accepts the full stored grant as binding", async () => {
  const token = "fictional-apple-refresh-token";
  const one = await sealAppleRefreshToken(token, binding, key);
  const two = await sealAppleRefreshToken(token, binding, key);
  assert(one.iv !== two.iv && one.ciphertext !== two.ciphertext);
  assert(!JSON.stringify(one).includes(token));
  same(await openAppleRefreshToken(one, binding, key), token);
  const stored: AppleStoredGrant = { ...binding, ...one };
  same(await openAppleRefreshToken(stored, stored, key), token);
});

Deno.test("Apple grant ciphertext authenticates every immutable ownership field", async () => {
  const sealed = await sealAppleRefreshToken("fictional-refresh", binding, key);
  for (const field of Object.keys(binding) as (keyof AppleGrantBinding)[]) {
    await rejects(() =>
      openAppleRefreshToken(sealed, {
        ...binding,
        [field]: `${binding[field]}-other`,
      }, key)
    );
  }
  const flip = (value: string) =>
    (value[0] === "A" ? "B" : "A") + value.slice(1);
  await rejects(() =>
    openAppleRefreshToken(
      { ...sealed, ciphertext: flip(sealed.ciphertext) },
      binding,
      key,
    )
  );
  await rejects(() =>
    openAppleRefreshToken({ ...sealed, iv: flip(sealed.iv) }, binding, key)
  );
  await rejects(() => openAppleRefreshToken(sealed, binding, "34".repeat(32)));
  await rejects(() =>
    openAppleRefreshToken({ ...sealed, keyVersion: 2 as 1 }, binding, key)
  );
});

Deno.test("Apple grant encryption rejects blank tokens, malformed key material and missing binding fields", async () => {
  for (const token of ["", "   ", "x".repeat(12_001)]) {
    await rejects(() => sealAppleRefreshToken(token, binding, key));
  }
  for (const invalidKey of ["", "12", "AB".repeat(32), "zz".repeat(32)]) {
    await rejects(() =>
      sealAppleRefreshToken("fictional", binding, invalidKey)
    );
  }
  for (const field of Object.keys(binding) as (keyof AppleGrantBinding)[]) {
    await rejects(() =>
      sealAppleRefreshToken("fictional", { ...binding, [field]: "" }, key)
    );
  }
});

Deno.test("Apple deletion receipts accept exact authenticated form and JSON identities", async () => {
  same(await parseAppleDeletionReceipt(receipt(validForm), secret), {
    bdMemberId: "123",
  });
  for (const id of ['"123"', "123", '"9007199254740993"']) {
    const result = await parseAppleDeletionReceipt(
      receipt(`{"user_action":"member_deleted","user_id":${id}}`, {
        type: "application/json",
      }),
      secret,
    );
    same(result.bdMemberId, id.replaceAll('"', ""));
  }
});

Deno.test("Apple deletion receipt authentication rejects missing, duplicate, weak and incorrect secrets", async () => {
  for (
    const query of [
      "",
      "secret=wrong",
      `secret=${secret}&secret=${secret}`,
      `secret=${secret}&secret=wrong`,
    ]
  ) {
    await rejects(
      () => parseAppleDeletionReceipt(receipt(validForm, { query }), secret),
      401,
    );
  }
  await rejects(() => parseAppleDeletionReceipt(receipt(validForm), ""), 401);
  same(await equalAppleSecret("short", "short"), false);
  same(await equalAppleSecret(secret, secret), true);
  same(await equalAppleSecret(secret + "x", secret), false);
  await rejects(
    () =>
      parseAppleDeletionReceipt(receipt(validForm, { method: "GET" }), secret),
    405,
  );
  await rejects(
    () =>
      parseAppleDeletionReceipt(receipt(validForm, { method: "PUT" }), secret),
    405,
  );
});

Deno.test("Apple deletion receipts reject duplicate identities and cross-channel overrides", async () => {
  for (
    const body of [
      validForm + "&user_id=456",
      validForm + "&user_action=member_deleted",
      validForm + "&secret=x",
      "user_id=123",
      "user_action=member_deleted",
    ]
  ) await rejects(() => parseAppleDeletionReceipt(receipt(body), secret), 400);
  for (const extra of ["&user_id=123", "&user_action=member_deleted"]) {
    await rejects(
      () =>
        parseAppleDeletionReceipt(
          receipt(validForm, { query: `secret=${secret}${extra}` }),
          secret,
        ),
      400,
    );
  }
  for (
    const body of [
      '{"user_action":"member_deleted","user_id":"123","user_id":"456"}',
      '{"user_action":"member_deleted","user_id":"123","user_\\u0069d":"456"}',
      '{"user_action":"member_deleted","user_id":"123","secret":"x"}',
      "null",
      "[]",
      "not-json",
    ]
  ) {
    await rejects(() =>
      parseAppleDeletionReceipt(
        receipt(body, { type: "application/json" }),
        secret,
      ), 400);
  }
});

Deno.test("authenticated non-deletion admin events are ignored without a revocation target", async () => {
  for (
    const body of [
      "user_action=member_updated&user_id=123",
      "user_action=member_created",
    ]
  ) {
    same(await parseAppleDeletionReceipt(receipt(body), secret), {
      bdMemberId: "",
      ignored: true,
    });
  }
  same(
    await parseAppleDeletionReceipt(
      receipt('{"user_action":"member_updated"}', { type: "application/json" }),
      secret,
    ),
    { bdMemberId: "", ignored: true },
  );
  await rejects(
    () =>
      parseAppleDeletionReceipt(
        receipt("user_action=member_updated", { query: "secret=wrong" }),
        secret,
      ),
    401,
  );
});

Deno.test("Apple deletion receipts reject ambiguous, unsafe numeric and oversized IDs", async () => {
  for (
    const id of [
      "0",
      "01",
      "-1",
      "+123",
      "123.0",
      "123 ",
      " 123",
      "123@example.invalid",
      "9".repeat(20),
    ]
  ) {
    await rejects(
      () =>
        parseAppleDeletionReceipt(
          receipt(
            `user_action=member_deleted&user_id=${encodeURIComponent(id)}`,
          ),
          secret,
        ),
      400,
    );
  }
  for (
    const value of ["9007199254740993", "123.1", "null", "true", "[]", "{}"]
  ) {
    await rejects(() =>
      parseAppleDeletionReceipt(
        receipt(`{"user_action":"member_deleted","user_id":${value}}`, {
          type: "application/json",
        }),
        secret,
      ), 400);
  }
  await rejects(
    () =>
      parseAppleDeletionReceipt(
        receipt(validForm + "&x=" + "x".repeat(65_536)),
        secret,
      ),
    400,
  );
  await rejects(
    () =>
      parseAppleDeletionReceipt(
        receipt(validForm, { type: "text/plain" }),
        secret,
      ),
    415,
  );
});

function bdResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
Deno.test("BD absence requires a successful exact lookup, never an outage or malformed response", async () => {
  same(
    await inspectBdAbsence(
      bdResponse(200, { status: "success", message: [] }),
      "123",
    ),
    true,
  );
  same(
    await inspectBdAbsence(
      bdResponse(200, { status: "success", message: [{ user_id: 123 }] }),
      "123",
    ),
    false,
  );
  for (
    const response of [
      bdResponse(503, { status: "success", message: [] }),
      bdResponse(404, { status: "error", message: "not found" }),
      bdResponse(200, { status: "error", message: [] }),
      bdResponse(200, { status: "success", message: [{ user_id: 456 }] }),
      bdResponse(200, {
        status: "success",
        message: [{ user_id: 123 }, { user_id: 456 }],
      }),
      bdResponse(200, { status: "success", message: null }),
      bdResponse(200, {}),
      new Response("invalid-json"),
    ]
  ) await rejects(() => inspectBdAbsence(response, "123"));
});

function workerFixture(options: {
  claimed?: AppleRevocationJob | null;
  grants?: AppleStoredGrant[];
  statuses?: number[];
  existence?: (boolean | Error)[];
  confirmationError?: boolean;
  finishError?: boolean;
} = {}) {
  const events: { type: string; value?: unknown }[] = [];
  const exist = [...(options.existence || [true])];
  const statuses = [...(options.statuses || [200])];
  const deps = {
    claim: async () => {
      events.push({ type: "claim" });
      return options.claimed === undefined ? job : options.claimed;
    },
    inspect: async (id: string) => {
      events.push({ type: "inspect", value: id });
      const value = exist.length > 1 ? exist.shift()! : exist[0];
      if (value instanceof Error) throw value;
      return value;
    },
    grants: async (claimed: AppleRevocationJob) => {
      events.push({ type: "grants", value: claimed });
      return options.grants || [grant];
    },
    revoke: async (stored: AppleStoredGrant) => {
      events.push({ type: "revoke", value: stored });
      return statuses.length > 1 ? statuses.shift()! : statuses[0];
    },
    confirm: async (claimed: AppleRevocationJob, stored: AppleStoredGrant) => {
      events.push({ type: "confirm", value: [claimed, stored] });
      if (options.confirmationError) {
        throw new Error("Lease/generation changed");
      }
    },
    finish: async (claimed: AppleRevocationJob) => {
      events.push({ type: "finish", value: claimed });
      if (options.finishError) throw new Error("Pending grants");
    },
    retry: async (claimed: AppleRevocationJob, reason: string) => {
      events.push({ type: "retry", value: [claimed, reason] });
    },
  };
  return { events, run: () => runAppleRevocationJob(deps) };
}

Deno.test("idle and duplicate revocation claims do not perform any external work", async () => {
  const test = workerFixture({ claimed: null });
  same(await test.run(), { status: "idle", revoked: 0 });
  same(test.events.map((event) => event.type), ["claim"]);
});
Deno.test("Apple revocation worker never revokes present members or unavailable lookups", async () => {
  for (const value of [false, new Error("BD outage")]) {
    const test = workerFixture({ existence: [value] });
    same(await test.run(), { status: "retry", revoked: 0 });
    assert(
      !test.events.some((event) =>
        ["grants", "revoke", "confirm", "finish"].includes(event.type)
      ),
    );
  }
});
Deno.test("Apple revocation worker rejects a grant belonging to another BD member", async () => {
  const test = workerFixture({ grants: [{ ...grant, bdMemberId: "456" }] });
  same(await test.run(), { status: "retry", revoked: 0 });
  assert(
    !test.events.some((event) =>
      ["revoke", "confirm", "finish"].includes(event.type)
    ),
  );
});
Deno.test("Apple revocation worker treats only HTTP 200 as confirmed completion", async () => {
  for (const status of [201, 202, 204, 400, 401, 429, 500, 503]) {
    const test = workerFixture({ statuses: [status] });
    same(await test.run(), { status: "retry", revoked: 0 });
    assert(
      !test.events.some((event) => ["confirm", "finish"].includes(event.type)),
    );
  }
  const test = workerFixture();
  same(await test.run(), { status: "complete", revoked: 1 });
  same(test.events.map((event) => event.type), [
    "claim",
    "inspect",
    "grants",
    "revoke",
    "confirm",
    "finish",
  ]);
  same(test.events.find((event) => event.type === "confirm")?.value, [
    job,
    grant,
  ]);
});
Deno.test("missing credentials are not confused with already confirmed snapshot grants", async () => {
  const missing = workerFixture({
    claimed: { ...job, expectedGrants: 0 },
    grants: [],
  });
  same(await missing.run(), { status: "retry", revoked: 0 });
  assert(!missing.events.some((event) => event.type === "finish"));
  const confirmed = workerFixture({ grants: [] });
  same(await confirmed.run(), { status: "complete", revoked: 0 });
  assert(!confirmed.events.some((event) => event.type === "revoke"));
});
Deno.test("lease or generation fencing failure never reports a completed revocation job", async () => {
  const test = workerFixture({ confirmationError: true });
  same(await test.run(), { status: "retry", revoked: 0 });
  assert(!test.events.some((event) => event.type === "finish"));
  const late = workerFixture({ finishError: true });
  same(await late.run(), { status: "retry", revoked: 1 });
});
Deno.test("revocation batch remains bounded and rechecks member presence between grants", async () => {
  const grants = Array.from(
    { length: 6 },
    (_, i) => ({ ...grant, grantId: `grant-${i}` }),
  );
  const batch = workerFixture({ grants });
  same(await batch.run(), { status: "partial", revoked: 5 });
  same(batch.events.filter((event) => event.type === "inspect").length, 5);
  same(batch.events.filter((event) => event.type === "revoke").length, 5);
  assert(!batch.events.some((event) => event.type === "finish"));
  const recreated = workerFixture({ grants, existence: [true, false] });
  same(await recreated.run(), { status: "retry", revoked: 1 });
  same(recreated.events.filter((event) => event.type === "revoke").length, 1);
});

async function permissionSql() {
  return (await Deno.readTextFile(
    new URL(
      "../../migrations/20260906190000_apple_permission_revocation.sql",
      import.meta.url,
    ),
  )).replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();
}

Deno.test("Apple permission storage is server-only and cannot cascade away with the user profile", async () => {
  const sql = await permissionSql();
  assert(
    sql.includes(
      "revoke all on schema apple_private from public, anon, authenticated",
    ),
  );
  assert(
    sql.includes(
      "revoke all on all tables in schema apple_private from public,anon,authenticated",
    ),
  );
  for (const table of ["identities", "grants", "deletion_jobs", "job_grants"]) {
    assert(
      sql.includes(
        `alter table apple_private.${table} enable row level security`,
      ),
    );
  }
  for (
    const signature of [
      "apple_grant_private_config()",
      "apple_grant_operation(text,jsonb)",
    ]
  ) {
    assert(
      sql.includes(
        `revoke all on function public.${signature} from public,anon,authenticated`,
      ),
    );
    assert(
      sql.includes(
        `grant execute on function public.${signature} to service_role`,
      ),
    );
  }
  assert(!/references\s+(?:public\.profiles|auth\.users)/.test(sql));
  assert(
    !/\bdelete from public\./.test(sql),
    "Permission-only work must not introduce an account-data purge",
  );
});

Deno.test("Apple deletion enrollment is a future receipt snapshot, not an orphan sweep or mutable email target", async () => {
  const sql = await permissionSql();
  const enqueue = sql.split("elsif p_action='enqueue' then")[1].split(
    "elsif p_action='claim' then",
  )[0];
  assert(
    enqueue.includes(
      "on conflict(bd_member_id) do nothing returning id into v_id",
    ),
  );
  const duplicateReturn = enqueue.indexOf("return jsonb_build_object");
  const snapshot = enqueue.indexOf("insert into apple_private.job_grants");
  assert(
    duplicateReturn >= 0 && duplicateReturn < snapshot,
    "Duplicate events must return without expanding the original snapshot",
  );
  assert(enqueue.indexOf("set status='revoking'") < snapshot);
  assert(enqueue.includes("from apple_private.grants where bd_member_id=v_bd"));
  assert(enqueue.includes("'no_credential'"));
  assert(enqueue.includes("'manual_apple_revocation_required'"));
  assert(!/\b(?:profiles|email|apple_sub)\b/.test(enqueue));
  const claim = sql.split("elsif p_action='claim' then")[1].split(
    "elsif p_action in ('job_grants'",
  )[0];
  assert(claim.includes("expected_grants>0"));
  assert(claim.includes("for update skip locked"));
});

Deno.test("grant issuance and confirmation fence generation, member ownership and leases", async () => {
  const sql = await permissionSql();
  const signup = sql.split("elsif p_action in ('signin_store'")[1].split(
    "elsif p_action='enqueue' then",
  )[0];
  assert(
    signup.includes("v_identity.generation<>(p_data->>'generation')::uuid"),
  );
  assert(
    signup.includes(
      "v_identity.lease_token is distinct from (p_data->>'leasetoken')::uuid",
    ),
  );
  assert(signup.includes("v_identity.lease_until<=now()"));
  assert(signup.includes("v_identity.bd_member_id<>v_bd"));
  assert(
    signup.includes(
      "v_identity.profile_id is distinct from (p_data->>'profileid')::uuid",
    ),
  );
  assert(
    signup.includes(
      "on conflict(identity_id,generation,client_id,token_hash) do nothing",
    ),
  );
  const jobs = sql.split("elsif p_action in ('job_grants'")[1];
  assert(
    jobs.includes(
      "v_job.lease_token is distinct from (p_data->>'leasetoken')::uuid",
    ),
  );
  assert(jobs.includes("v_job.lease_until<=now()"));
  const confirm =
    jobs.split("elsif p_action in ('job_validate','job_confirm') then")[1]
      .split(
        "elsif p_action='job_finish' then",
      )[0];
  assert(confirm.includes("g.generation=(p_data->>'generation')::uuid"));
  assert(confirm.includes("g.bd_member_id=v_job.bd_member_id"));
  assert(
    confirm.includes("i.lease_token=v_job.lease_token and i.lease_until>now()"),
  );
  assert(
    confirm.indexOf("set revoked_at=now()") <
      confirm.indexOf("delete from apple_private.grants"),
  );
  assert(confirm.includes("v_until<=now()+interval '10 seconds'"));
  assert(confirm.includes("return jsonb_build_object('leaseuntil',v_until)"));
});

Deno.test("completion releases every original identity generation even after last-confirm crash or batch retry", async () => {
  const sql = await permissionSql();
  const finish =
    sql.split("elsif p_action='job_finish' then")[1].split(" else ")[0];
  assert(
    finish.includes(
      "revoked_at is null) then raise exception 'apple_grants_remain'",
    ),
  );
  assert(
    finish.includes(
      "v_job.expected_grants=0 then raise exception 'apple_credential_missing'",
    ),
  );
  const cleanup = finish.split("delete from apple_private.identities")[1];
  assert(cleanup, "Completion must release the completed identity barrier");
  assert(cleanup.includes("j.job_id=v_job.id"));
  assert(cleanup.includes("j.identity_id=i.id and j.generation=i.generation"));
  assert(cleanup.includes("not exists(select 1 from apple_private.grants"));
  assert(
    !cleanup.includes("lease_token"),
    "A new worker lease must also release identities confirmed by an earlier lease",
  );
});

let adapter: Promise<typeof import("./apple_grant_store.ts")> | undefined;
async function signinAdapter() {
  if (!adapter) {
    adapter = (async () => {
      // Construct production clients with fictional configuration; every
      // dependency below is injected. Deno grants no network permission.
      const previousUrl = Deno.env.get("SUPABASE_URL");
      const previousKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      Deno.env.set("SUPABASE_URL", "https://fixture.example.invalid");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-role");
      try {
        return await import("./apple_grant_store.ts");
      } finally {
        if (previousUrl === undefined) Deno.env.delete("SUPABASE_URL");
        else Deno.env.set("SUPABASE_URL", previousUrl);
        if (previousKey === undefined) {
          Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
        } else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", previousKey);
      }
    })();
  }
  return await adapter;
}

const nativeClaims: AppleClaims = {
  iss: "https://appleid.apple.com",
  aud: "ca.example.fixture",
  sub: "apple-fixture",
  email: "fixture@example.invalid",
  email_verified: true,
  nonce: "fixture-nonce",
};
function signupFixture(options: {
  claims?: AppleClaims;
  redeemed?: AppleClaims;
  authorizationCode?: string;
  expectedNonce?: string;
  refreshToken?: string;
  responseRefresh?: string | null;
  previous?: boolean;
  member?: Record<string, unknown> | null | Error;
  authEmail?: string;
  resultEmail?: string;
  resultBdId?: string;
  resultProfileId?: string;
  checkFails?: boolean;
  failedCleanup?: "queue" | "reject" | "unexpected";
  preflightError?: Error;
  loginError?: Error;
} = {}) {
  const events: { type: string; value?: unknown }[] = [];
  const claims = options.claims || nativeClaims;
  const lease = {
    identityId: binding.identityId,
    generation: binding.generation,
    leaseToken: "fixture-lease",
    ...(options.previous
      ? { bdMemberId: "123", profileId: "profile-fixture" }
      : {}),
  };
  const deps: AppleGrantSigninDependencies = {
    getConfig: async () => ({
      serviceId: "ca.example.web",
      iosBundleId: nativeClaims.aud,
      teamId: "fixture-team",
      keyId: "fixture-key",
      privateKey: "fixture-not-a-real-key",
    }),
    operate: async <T>(action: string, data: Record<string, unknown> = {}) => {
      events.push({ type: action, value: data });
      if (action === "signin_check" && options.checkFails) {
        throw new Error("Lease lost");
      }
      return (action === "signin_begin" ? lease : {}) as T;
    },
    exactMember: async (id: string) => {
      events.push({ type: "exact_member", value: id });
      if (options.member instanceof Error) throw options.member;
      return options.member === undefined
        ? { user_id: "123", email: nativeClaims.email }
        : options.member;
    },
    enqueue: async (id: string) => {
      events.push({ type: "enqueue", value: id });
      return { jobId: "fixture-job", status: "pending", expectedGrants: 1 };
    },
    makeClientSecret: async (_cfg, id) => {
      events.push({ type: "client_secret", value: id });
      return "fictional-client-secret";
    },
    verifyIdentityToken: async (token, audiences) => {
      events.push({ type: "verify", value: { token, audiences } });
      return options.redeemed || claims;
    },
    fetch: async (input, init) => {
      events.push({
        type: "token_exchange",
        value: {
          url: String(input),
          form: Object.fromEntries(new URLSearchParams(String(init?.body))),
        },
      });
      return new Response(
        JSON.stringify({
          id_token: "fixture-signed-identity",
          ...(options.responseRefresh === null ? {} : {
            refresh_token: options.responseRefresh ?? "fixture-refresh-token",
          }),
        }),
      );
    },
    authUserById: async (id) => {
      events.push({ type: "auth_owner", value: id });
      return {
        id,
        email: options.authEmail ?? nativeClaims.email,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-09-06T00:00:00Z",
      };
    },
    privateConfig: async () => ({ apple_grant_encryption_v1: key }),
    ...(options.failedCleanup
      ? {
        enqueueFailedSignup: async (data: AppleFailedSignupEnqueue) => {
          events.push({ type: "enqueue_failed_signup", value: data });
          if (options.failedCleanup === "reject") {
            throw new Error(
              "Legacy owner or unavailable fence",
            );
          }
          return {
            id: data.jobId,
            status: options.failedCleanup === "unexpected"
              ? "complete"
              : "pending",
          };
        },
      }
      : {}),
  };
  const args = {
    claims,
    clientId: claims.aud,
    ...(options.authorizationCode !== undefined
      ? { authorizationCode: options.authorizationCode }
      : {}),
    ...(options.expectedNonce !== undefined
      ? { expectedNonce: options.expectedNonce }
      : {}),
    ...(options.refreshToken !== undefined
      ? { refreshToken: options.refreshToken }
      : {}),
    ...(options.preflightError
      ? {
        preflight: async () => {
          events.push({ type: "preflight" });
          throw options.preflightError;
        },
      }
      : {}),
    login: async (context: AppleGrantLoginContext) => {
      events.push({ type: "login", value: context });
      if (options.loginError) throw options.loginError;
      return {
        value: { session: "fixture-session" },
        bdMemberId: options.resultBdId || "123",
        profileId: options.resultProfileId || "profile-fixture",
        email: options.resultEmail ?? nativeClaims.email!,
      };
    },
  };
  return {
    events,
    run: async () => (await signinAdapter()).withAppleGrantSignin(args, deps),
  };
}

const codeOptions = {
  authorizationCode: "fixture-one-time-code",
  expectedNonce: "fixture-nonce",
};
function storedPayload(events: { type: string; value?: unknown }[]) {
  return events.find((event) => event.type === "signin_store")?.value as
    | AppleStoredGrant
    | undefined;
}

Deno.test("production native grant adapter verifies code and exact owners before encrypted storage", async () => {
  const test = signupFixture(codeOptions);
  same(await test.run(), { session: "fixture-session" });
  const types = test.events.map((event) => event.type);
  for (
    const prerequisite of [
      "signin_begin",
      "token_exchange",
      "verify",
      "login",
      "exact_member",
      "auth_owner",
    ]
  ) {
    assert(types.indexOf(prerequisite) < types.indexOf("signin_store"));
  }
  assert(types.indexOf("signin_store") < types.indexOf("signin_check"));
  same(types.at(-1), "signin_release");
  const stored = storedPayload(test.events);
  assert(
    stored && stored.bdMemberId === "123" &&
      stored.appleSub === nativeClaims.sub &&
      stored.clientId === nativeClaims.aud &&
      stored.profileId === "profile-fixture",
  );
  assert(!JSON.stringify(stored).includes("fixture-refresh-token"));
  same(
    await openAppleRefreshToken(stored, stored, key),
    "fixture-refresh-token",
  );
});

Deno.test("production native adapter rejects missing nonce and redeemed subject, audience or nonce mismatch", async () => {
  for (const expectedNonce of [undefined, "wrong-nonce"]) {
    const test = signupFixture({
      authorizationCode: "fixture-code",
      expectedNonce,
    });
    await rejects(test.run);
    same(test.events.length, 0);
  }
  for (
    const redeemed of [
      { ...nativeClaims, sub: "wrong-sub" },
      {
        ...nativeClaims,
        aud: "ca.example.web",
      },
      { ...nativeClaims, nonce: "wrong-nonce" },
      {
        ...nativeClaims,
        iss: "https://issuer.example.invalid",
      },
    ]
  ) {
    const test = signupFixture({ ...codeOptions, redeemed });
    await rejects(test.run);
    assert(
      !test.events.some((event) =>
        ["login", "signin_store", "signin_check"].includes(event.type)
      ),
    );
    same(test.events.at(-1)?.type, "signin_release");
  }
});

Deno.test("production web adapter revalidates the original refresh token inside the identity lease", async () => {
  const claims = { ...nativeClaims, aud: "ca.example.web" };
  const test = signupFixture({
    claims,
    refreshToken: "fixture-web-refresh",
    responseRefresh: null,
  });
  await test.run();
  const exchange = test.events.find((event) => event.type === "token_exchange")
    ?.value as { form: Record<string, string> };
  same(exchange.form.grant_type, "refresh_token");
  same(exchange.form.refresh_token, "fixture-web-refresh");
  same(exchange.form.client_id, "ca.example.web");
  assert(
    test.events.findIndex((event) => event.type === "signin_begin") <
      test.events.findIndex((event) => event.type === "token_exchange"),
  );
  const stored = storedPayload(test.events);
  assert(stored);
  same(await openAppleRefreshToken(stored, stored, key), "fixture-web-refresh");
});

Deno.test("production first enrollment requires signed verified email and all server owners to match", async () => {
  for (
    const claims of [{ ...nativeClaims, email: undefined }, {
      ...nativeClaims,
      email_verified: false,
    }, { ...nativeClaims, email_verified: "false" }]
  ) {
    const test = signupFixture({ ...codeOptions, claims });
    await rejects(test.run);
    assert(
      !test.events.some((event) =>
        ["login", "signin_store"].includes(event.type)
      ),
    );
  }
  for (
    const mismatch of [{ authEmail: "other@example.invalid" }, {
      resultEmail: "other@example.invalid",
    }, { member: { user_id: "123", email: "other@example.invalid" } }]
  ) {
    const test = signupFixture({ ...codeOptions, ...mismatch });
    await rejects(test.run);
    assert(!storedPayload(test.events));
  }
});

Deno.test("native grant adapter passes redeemed verified claims into fresh account creation", async () => {
  const test = signupFixture({
    ...codeOptions,
    claims: { ...nativeClaims, email: undefined, email_verified: undefined },
    redeemed: nativeClaims,
  });
  same(await test.run(), { session: "fixture-session" });
  const context = test.events.find((event) => event.type === "login")
    ?.value as AppleGrantLoginContext;
  assert(context.verifiedClaims);
  same(context.verifiedClaims.email, nativeClaims.email);
  assert([true, "true"].includes(context.verifiedClaims.email_verified!));
  same(context.expectedBdMemberId, undefined);
  same(context.expectedProfileId, undefined);
  assert(storedPayload(test.events));
});

Deno.test("native grant adapter retains original email when redeemed token has no email", async () => {
  const test = signupFixture({
    ...codeOptions,
    redeemed: { ...nativeClaims, email: undefined, email_verified: undefined },
  });
  same(await test.run(), { session: "fixture-session" });
  const context = test.events.find((event) => event.type === "login")
    ?.value as AppleGrantLoginContext;
  same(context.verifiedClaims?.email, nativeClaims.email);
  assert(storedPayload(test.events));
});

Deno.test("native grant adapter rejects conflicting signed emails before account writes", async () => {
  const test = signupFixture({
    ...codeOptions,
    redeemed: { ...nativeClaims, email: "different-fixture@example.invalid" },
  });
  await rejects(test.run);
  assert(
    !test.events.some((event) =>
      ["login", "signin_store", "signin_check"].includes(event.type)
    ),
  );
  same(test.events.at(-1)?.type, "signin_release");
});

Deno.test("native grant adapter never rescues explicitly unverified new-account claims", async () => {
  for (const email_verified of [false, "false"] as const) {
    for (const originalIsFalse of [true, false]) {
      const test = signupFixture({
        ...codeOptions,
        claims: originalIsFalse
          ? { ...nativeClaims, email_verified }
          : nativeClaims,
        redeemed: originalIsFalse
          ? nativeClaims
          : { ...nativeClaims, email_verified },
      });
      await rejects(test.run);
      assert(
        !test.events.some((event) =>
          ["login", "signin_store", "signin_check"].includes(event.type)
        ),
      );
      same(test.events.at(-1)?.type, "signin_release");
    }
  }
});

Deno.test("native grant recovery preserves exact server ownership checks", async () => {
  const test = signupFixture({
    ...codeOptions,
    claims: { ...nativeClaims, email: undefined, email_verified: undefined },
    redeemed: nativeClaims,
    authEmail: "different-fixture@example.invalid",
  });
  await rejects(test.run);
  assert(test.events.some((event) => event.type === "auth_owner"));
  assert(!storedPayload(test.events));
  assert(!test.events.some((event) => event.type === "signin_check"));
});

Deno.test("native grant adapter keeps email-less enrolled owner bound to the existing account", async () => {
  const noEmail = {
    ...nativeClaims,
    email: undefined,
    email_verified: undefined,
  };
  const test = signupFixture({
    ...codeOptions,
    previous: true,
    claims: noEmail,
    redeemed: noEmail,
    member: { user_id: "123", email: "updated@example.invalid" },
    authEmail: "updated@example.invalid",
    resultEmail: "updated@example.invalid",
  });
  same(await test.run(), { session: "fixture-session" });
  const context = test.events.find((event) => event.type === "login")
    ?.value as AppleGrantLoginContext;
  same(context.expectedBdMemberId, "123");
  same(context.expectedProfileId, "profile-fixture");
  assert(!context.verifiedClaims?.email);
  assert(storedPayload(test.events));
});

Deno.test("native grant adapter retains enrolled ownership without inventing email verification", async () => {
  for (const email_verified of [false, "false"] as const) {
    const claims = { ...nativeClaims, email_verified };
    const test = signupFixture({
      ...codeOptions,
      previous: true,
      claims,
      redeemed: claims,
    });
    same(await test.run(), { session: "fixture-session" });
    const context = test.events.find((event) => event.type === "login")
      ?.value as AppleGrantLoginContext;
    same(context.expectedBdMemberId, "123");
    same(context.expectedProfileId, "profile-fixture");
    assert(![true, "true"].includes(context.verifiedClaims?.email_verified!));
    assert(storedPayload(test.events));
  }
});

Deno.test("dropping an authorization code cannot bypass new-account email verification", async () => {
  for (
    const claims of [
      { ...nativeClaims, email: undefined, email_verified: undefined },
      { ...nativeClaims, email_verified: false },
      { ...nativeClaims, email_verified: "false" },
    ]
  ) {
    const test = signupFixture({ claims });
    await rejects(test.run);
    assert(
      !test.events.some((event) =>
        ["login", "signin_store", "signin_check"].includes(event.type)
      ),
    );
    same(test.events.at(-1)?.type, "signin_release");
  }
});

Deno.test("legacy no-code sign-in does not invent a credential or erase previously stored grants", async () => {
  const test = signupFixture();
  same(await test.run(), { session: "fixture-session" });
  assert(
    !test.events.some((event) =>
      ["token_exchange", "signin_store", "auth_owner"].includes(event.type)
    ),
  );
  assert(test.events.some((event) => event.type === "signin_check"));
  for (const responseRefresh of ["", "   ", null]) {
    const failed = signupFixture({
      ...codeOptions,
      previous: true,
      responseRefresh,
    });
    await rejects(failed.run);
    assert(
      !failed.events.some((event) =>
        ["login", "signin_store"].includes(event.type)
      ),
    );
  }
});

Deno.test("an enrolled missing member cannot be recreated and an outage cannot enqueue revocation", async () => {
  const deleted = signupFixture({
    ...codeOptions,
    previous: true,
    member: null,
  });
  await rejects(deleted.run);
  same(deleted.events.find((event) => event.type === "enqueue")?.value, "123");
  assert(
    !deleted.events.some((event) =>
      ["token_exchange", "login", "signin_store"].includes(event.type)
    ),
  );
  const outage = signupFixture({
    ...codeOptions,
    previous: true,
    member: new Error("BD offline"),
  });
  await rejects(outage.run);
  assert(
    !outage.events.some((event) =>
      ["enqueue", "token_exchange", "login", "signin_store"].includes(
        event.type,
      )
    ),
  );
});

Deno.test("private ownership and final lease fences cannot silently switch or return an account", async () => {
  for (
    const mismatch of [{ resultBdId: "456" }, {
      resultProfileId: "other-profile",
    }]
  ) {
    const test = signupFixture({ ...codeOptions, previous: true, ...mismatch });
    await rejects(test.run);
    const context = test.events.find((event) => event.type === "login")
      ?.value as AppleGrantLoginContext;
    same(context.expectedBdMemberId, "123");
    same(context.expectedProfileId, "profile-fixture");
    assert(!storedPayload(test.events));
  }
  const expired = signupFixture({ ...codeOptions, checkFails: true });
  await rejects(expired.run);
  same(expired.events.at(-1)?.type, "signin_release");
});

Deno.test("an enrolled immutable owner can update their verified contact email without changing grant ownership", async () => {
  const test = signupFixture({
    ...codeOptions,
    previous: true,
    member: { user_id: "123", email: "updated@example.invalid" },
    authEmail: "updated@example.invalid",
    resultEmail: "updated@example.invalid",
  });
  same(await test.run(), { session: "fixture-session" });
  const stored = storedPayload(test.events);
  assert(
    stored && stored.bdMemberId === "123" &&
      stored.profileId === "profile-fixture" &&
      stored.appleSub === nativeClaims.sub,
  );
});

Deno.test("all native, current web and legacy Apple issuers use the permission barrier", async () => {
  for (const endpoint of ["apple-native-login", "apple-web-login"]) {
    const source = await Deno.readTextFile(
      new URL(`../${endpoint}/index.ts`, import.meta.url),
    );
    assert(source.includes("withAppleGrantSignin"));
    assert(
      source.indexOf("await withAppleGrantSignin(") <
        source.indexOf("await upsertAppleUser("),
    );
    assert(
      source.includes("expectedProfileId") &&
        source.includes("expectedBdMemberId"),
    );
  }
  const native = await Deno.readTextFile(
    new URL("../apple-native-login/index.ts", import.meta.url),
  );
  assert(/authorizationCode:[\s\S]*?body\.authorization_code/.test(native));
  assert(/expectedNonce:[\s\S]*?body\.apple_nonce/.test(native));
  const callback = await Deno.readTextFile(
    new URL("../apple-oauth-callback/index.ts", import.meta.url),
  );
  assert(callback.includes("withGrant: withAppleGrantSignin"));
  const web = await Deno.readTextFile(
    new URL("./apple_web_oauth.ts", import.meta.url),
  );
  assert(/refreshToken:\s*tokenJson\.refresh_token/.test(web));
  assert(
    web.includes("context.expectedProfileId") &&
      web.includes("context.expectedBdMemberId"),
  );
});

Deno.test("production worker reauthorizes the exact grant before Apple POST and bounds the remaining lease", async () => {
  const source = await Deno.readTextFile(
    new URL("./apple_grant_store.ts", import.meta.url),
  );
  const revoke = source.slice(
    source.indexOf("revoke: async"),
    source.indexOf("confirm: async"),
  );
  const authorization = revoke.indexOf('"job_validate"');
  const sideEffect = revoke.indexOf(
    'fetch("https://appleid.apple.com/auth/revoke"',
  );
  assert(authorization >= 0 && sideEffect > authorization);
  assert(
    revoke.includes("grantId: grant.grantId") &&
      revoke.includes("generation: grant.generation"),
  );
  assert(
    revoke.includes(
      "Date.parse(authorization.leaseUntil) - Date.now() > 10_000",
    ),
  );
  assert(revoke.includes("AbortSignal.timeout(5_000)"));
});

Deno.test("receipt and worker endpoints do not expose or log their authentication secrets", async () => {
  const receiptSource = await Deno.readTextFile(
    new URL("../apple-member-deleted/index.ts", import.meta.url),
  );
  const authenticateAt = receiptSource.indexOf("parseAppleDeletionReceipt(");
  const enqueueAt = receiptSource.indexOf(
    "enqueueAppleMemberDeletion(receipt.bdMemberId,",
  );
  assert(authenticateAt >= 0 && enqueueAt > authenticateAt);
  assert(receiptSource.includes("fullCleanup: true"));
  assert(receiptSource.includes("receipt.ignored"));
  const workerSource = await Deno.readTextFile(
    new URL("../apple-revocation-worker/index.ts", import.meta.url),
  );
  assert(
    workerSource.indexOf("equalAppleSecret(") <
      workerSource.indexOf("await runStoredAppleRevocations()"),
  );
  for (const source of [receiptSource, workerSource]) {
    assert(!source.includes("console."));
    assert(
      !/JSON\.stringify\(\s*(?:secrets|request|receipt|job)\s*\)/.test(source),
    );
    assert(
      !source.includes("purge_weddingwin") && !source.includes("deleteUser("),
    );
  }
});

const unavailableEmailClaims = {
  ...nativeClaims,
  email: undefined,
  email_verified: undefined,
};
async function rejectionMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error.message : "";
  }
  throw new Error("Expected rejection");
}
function failedSignupPayload(events: { type: string; value?: unknown }[]) {
  return events.find((event) => event.type === "enqueue_failed_signup")
    ?.value as AppleFailedSignupEnqueue | undefined;
}

Deno.test("failed fresh native signup queues only encrypted matching grant before releasing its lease", async () => {
  const test = signupFixture({
    ...codeOptions,
    claims: unavailableEmailClaims,
    failedCleanup: "queue",
  });
  const message = await rejectionMessage(test.run);
  assert(message.includes("being removed") && message.includes("shortly"));
  const payload = failedSignupPayload(test.events);
  assert(payload);
  same(payload.identityId, binding.identityId);
  same(payload.generation, binding.generation);
  same(payload.clientId, nativeClaims.aud);
  same(payload.appleSub, nativeClaims.sub);
  same(payload.leaseToken, "fixture-lease");
  assert(/^[0-9a-f]{64}$/.test(payload.tokenHash));
  assert(!("bdMemberId" in payload) && !("profileId" in payload));
  assert(!JSON.stringify(payload).includes("fixture-refresh-token"));
  same(
    await openAppleFailedSignupGrant(payload, payload, key),
    "fixture-refresh-token",
  );
  const types = test.events.map((event) => event.type);
  assert(types.indexOf("verify") < types.indexOf("enqueue_failed_signup"));
  same(types.at(-1), "signin_release");
  assert(
    !types.some((type) =>
      ["login", "signin_store", "signin_check", "auth_owner"].includes(type)
    ),
  );
});

Deno.test("failed fresh web signup queues the validated original web refresh grant", async () => {
  const test = signupFixture({
    claims: { ...unavailableEmailClaims, aud: "ca.example.web" },
    refreshToken: "fixture-original-web-refresh",
    responseRefresh: null,
    failedCleanup: "queue",
  });
  await rejects(test.run);
  const payload = failedSignupPayload(test.events);
  assert(payload);
  same(payload.clientId, "ca.example.web");
  same(
    await openAppleFailedSignupGrant(payload, payload, key),
    "fixture-original-web-refresh",
  );
  assert(!test.events.some((event) => event.type === "login"));
});

Deno.test("failed-signup cleanup never targets an enrolled owner or a successful signup", async () => {
  for (
    const options of [
      { ...codeOptions, previous: true, claims: unavailableEmailClaims },
      codeOptions,
    ]
  ) {
    const test = signupFixture({ ...options, failedCleanup: "queue" });
    same(await test.run(), { session: "fixture-session" });
    assert(!failedSignupPayload(test.events));
  }
});

Deno.test("failed-signup cleanup excludes invalid exchange identities and conflicting signed emails", async () => {
  for (
    const redeemed of [
      { ...unavailableEmailClaims, sub: "wrong-subject" },
      { ...unavailableEmailClaims, aud: "wrong-client" },
      { ...unavailableEmailClaims, iss: "https://wrong-issuer.invalid" },
      { ...unavailableEmailClaims, nonce: "wrong-nonce" },
      { ...nativeClaims, email: "wrong-email@example.invalid" },
    ]
  ) {
    const test = signupFixture({
      ...codeOptions,
      redeemed,
      failedCleanup: "queue",
    });
    await rejects(test.run);
    assert(!failedSignupPayload(test.events));
  }
});

Deno.test("failed-signup cleanup does not invent credentials for legacy requests or blank exchanges", async () => {
  for (
    const options of [
      { claims: unavailableEmailClaims },
      { ...codeOptions, claims: unavailableEmailClaims, responseRefresh: "" },
      { ...codeOptions, claims: unavailableEmailClaims, responseRefresh: null },
    ]
  ) {
    const test = signupFixture({ ...options, failedCleanup: "queue" });
    await rejects(test.run);
    assert(!failedSignupPayload(test.events));
  }
});

Deno.test("failed-signup cleanup never compensates after account creation has begun", async () => {
  for (
    const options of [
      { authEmail: "other@example.invalid" },
      { checkFails: true },
      { member: null },
    ]
  ) {
    const test = signupFixture({
      ...codeOptions,
      ...options,
      failedCleanup: "queue",
    });
    await rejects(test.run);
    assert(test.events.some((event) => event.type === "login"));
    assert(!failedSignupPayload(test.events));
  }
});

Deno.test("ordinary missing-account preflight compensates only its verified unbound grant before any account writes", async () => {
  const test = signupFixture({
    ...codeOptions,
    preflightError: new AppleSignupRequiredError(true),
    failedCleanup: "queue",
  });
  same(await rejectionMessage(test.run), "APPLE_SIGNUP_REQUIRED");
  const payload = failedSignupPayload(test.events);
  assert(payload);
  same(
    await openAppleFailedSignupGrant(payload, payload, key),
    "fixture-refresh-token",
  );
  same(payload.identityId, binding.identityId);
  same(payload.generation, binding.generation);
  same(payload.leaseToken, "fixture-lease");
  assert(
    !test.events.some((event) =>
      ["login", "signin_store", "auth_owner"].includes(event.type)
    ),
  );
  same(test.events.at(-1)?.type, "signin_release");
});

Deno.test("signup-required compensation excludes enrolled, legacy, ineligible and lookalike errors", async () => {
  for (
    const options of [
      {
        ...codeOptions,
        previous: true,
        preflightError: new AppleSignupRequiredError(true),
      },
      { ...codeOptions, preflightError: new AppleSignupRequiredError(false) },
      { ...codeOptions, preflightError: new Error("APPLE_SIGNUP_REQUIRED") },
      { ...codeOptions, preflightError: new Error("Auth lookup unavailable") },
      { preflightError: new AppleSignupRequiredError(true) },
    ]
  ) {
    const test = signupFixture({ ...options, failedCleanup: "queue" });
    await rejects(test.run);
    assert(!failedSignupPayload(test.events));
    assert(!test.events.some((event) => event.type === "login"));
  }
});

Deno.test("even typed signup-required errors after account writes begin never enqueue compensation", async () => {
  const test = signupFixture({
    ...codeOptions,
    loginError: new AppleSignupRequiredError(true),
    failedCleanup: "queue",
  });
  await rejects(test.run);
  assert(test.events.some((event) => event.type === "login"));
  assert(!failedSignupPayload(test.events));
});

Deno.test("signup-required enqueue refusal and unknown results never claim cleanup succeeded", async () => {
  for (const failedCleanup of ["reject", "unexpected"] as const) {
    const test = signupFixture({
      ...codeOptions,
      preflightError: new AppleSignupRequiredError(true),
      failedCleanup,
    });
    same(await rejectionMessage(test.run), "APPLE_SIGNUP_REQUIRED");
    assert(failedSignupPayload(test.events));
    assert(!test.events.some((event) => event.type === "login"));
    same(test.events.at(-1)?.type, "signin_release");
  }
});

Deno.test("failed-signup refused or unconfirmed enqueue keeps original failure and never claims cleanup", async () => {
  for (const failedCleanup of ["reject", "unexpected"] as const) {
    const test = signupFixture({
      ...codeOptions,
      claims: unavailableEmailClaims,
      failedCleanup,
    });
    same(
      await rejectionMessage(test.run),
      "Apple could not verify your account email. Please start again with Apple.",
    );
    assert(failedSignupPayload(test.events));
    same(test.events.at(-1)?.type, "signin_release");
    assert(!test.events.some((event) => event.type === "login"));
  }
});
