import {
  type AppleFailedSignupBinding,
  type AppleFailedSignupJob,
  invalidateAppleFailedSignupToken,
  openAppleFailedSignupGrant,
  runAppleFailedSignupRevocation,
  sealAppleFailedSignupGrant,
} from "./apple_failed_signup.ts";
import {
  openAppleRefreshToken,
  sealAppleRefreshToken,
} from "./apple_grant_lifecycle.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    "Values did not match",
  );
}
async function rejects(run: () => Promise<unknown>) {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
const key = "15".repeat(32);
const binding: AppleFailedSignupBinding = {
  identityId: "fixture-identity",
  generation: "fixture-generation",
  jobId: "fixture-job",
  clientId: "ca.fixture.native",
  appleSub: "fixture-apple-subject",
};
const token = "fixture-refresh-not-real";
async function job(): Promise<AppleFailedSignupJob> {
  return {
    ...(await sealAppleFailedSignupGrant(token, binding, key)),
    id: binding.jobId,
    leaseToken: "fixture-lease",
    identityId: binding.identityId,
    generation: binding.generation,
    clientId: binding.clientId,
    appleSub: binding.appleSub,
  };
}

Deno.test("failed-signup grants encrypt with fresh IVs without invented member IDs", async () => {
  const a = await sealAppleFailedSignupGrant(token, binding, key);
  const b = await sealAppleFailedSignupGrant(token, binding, key);
  assert(a.iv !== b.iv && a.ciphertext !== b.ciphertext);
  same(await openAppleFailedSignupGrant(a, binding, key), token);
  assert(!JSON.stringify(a).includes(token));
});

Deno.test("failed-signup encryption binds job, client, subject and exact identity generation", async () => {
  const sealed = await sealAppleFailedSignupGrant(token, binding, key);
  for (
    const field of Object.keys(binding) as (keyof AppleFailedSignupBinding)[]
  ) {
    await rejects(() =>
      openAppleFailedSignupGrant(
        sealed,
        { ...binding, [field]: "different" },
        key,
      )
    );
    await rejects(() =>
      sealAppleFailedSignupGrant(token, { ...binding, [field]: "" }, key)
    );
  }
});

Deno.test("failed-signup and established member ciphertext domains cannot be substituted", async () => {
  const member = {
    ...binding,
    grantId: binding.jobId,
    bdMemberId: "123",
    profileId: "fixture-profile",
  };
  const failed = await sealAppleFailedSignupGrant(token, binding, key);
  const established = await sealAppleRefreshToken(token, member, key);
  await rejects(() => openAppleRefreshToken(failed, member, key));
  await rejects(() => openAppleFailedSignupGrant(established, binding, key));
});

Deno.test("failed-signup encryption refuses blank credentials, malformed keys and versions", async () => {
  for (const bad of ["", " ", "x".repeat(12_001)]) {
    await rejects(() => sealAppleFailedSignupGrant(bad, binding, key));
  }
  for (const bad of ["", "15", key.toUpperCase().replace("15", "AF")]) {
    await rejects(() => sealAppleFailedSignupGrant(token, binding, bad));
  }
  const sealed = await sealAppleFailedSignupGrant(token, binding, key);
  await rejects(() =>
    openAppleFailedSignupGrant({ ...sealed, keyVersion: 2 as 1 }, binding, key)
  );
  await rejects(() =>
    openAppleFailedSignupGrant({ ...sealed, iv: "a" }, binding, key)
  );
  await rejects(() =>
    openAppleFailedSignupGrant({ ...sealed, ciphertext: "!!" }, binding, key)
  );
});

async function adapterFixture(
  options: {
    remaining?: number;
    authorizeError?: boolean;
    status?: number;
    client?: string;
  } = {},
) {
  const current = await job();
  if (options.client) current.clientId = options.client;
  const events: string[] = [];
  const now = Date.parse("2026-09-06T22:00:00Z");
  return {
    current,
    events,
    run: () =>
      invalidateAppleFailedSignupToken(current, {
        allowedClientIds: [binding.clientId],
        encryptionKey: key,
        makeClientSecret: async (client) => {
          same(client, binding.clientId);
          events.push("sign");
          return "fixture-client-secret";
        },
        authorize: async (target) => {
          same(target.id, binding.jobId);
          same(target.generation, binding.generation);
          events.push("authorize");
          if (options.authorizeError) throw new Error("Ownership changed");
          return {
            leaseUntil: new Date(now + (options.remaining ?? 11_000))
              .toISOString(),
          };
        },
        now: () => now,
        fetch: async (url, init) => {
          events.push("post");
          same(String(url), "https://appleid.apple.com/auth/revoke");
          same(init?.method, "POST");
          assert(init?.signal instanceof AbortSignal);
          const body = new URLSearchParams(String(init?.body));
          same(body.get("client_id"), binding.clientId);
          same(body.get("token_type_hint"), "refresh_token");
          same(body.get("token"), token);
          same([...body.keys()].sort(), [
            "client_id",
            "client_secret",
            "token",
            "token_type_hint",
          ]);
          return new Response(null, { status: options.status ?? 200 });
        },
      }),
  };
}

Deno.test("failed-signup production token adapter signs then fences immediately before exact-client POST", async () => {
  const test = await adapterFixture();
  same(await test.run(), 200);
  same(test.events, ["sign", "authorize", "post"]);
});

Deno.test("failed-signup adapter refuses stale, near-expired or changed-owner authorization", async () => {
  for (const remaining of [-1, 0, 9_999, 10_000]) {
    const test = await adapterFixture({ remaining });
    await rejects(test.run);
    same(test.events, ["sign", "authorize"]);
  }
  const changed = await adapterFixture({ authorizeError: true });
  await rejects(changed.run);
  same(changed.events, ["sign", "authorize"]);
});

Deno.test("failed-signup adapter rejects an unconfigured client before signing or HTTP", async () => {
  const test = await adapterFixture({ client: "ca.other.client" });
  await rejects(test.run);
  same(test.events, []);
});

Deno.test("failed-signup adapter refuses ciphertext moved to another subject or generation", async () => {
  for (const field of ["appleSub", "generation", "identityId", "id"] as const) {
    const test = await adapterFixture();
    test.current[field] = "wrong";
    await rejects(test.run);
    same(test.events, []);
  }
});

async function runnerFixture(
  options: {
    absent?: boolean;
    claimFails?: boolean;
    status?: number;
    invalidateFails?: boolean;
    completeFails?: boolean;
    retryFails?: boolean;
  } = {},
) {
  const current = await job();
  const events: string[] = [];
  return {
    events,
    run: () =>
      runAppleFailedSignupRevocation({
        claim: async () => {
          events.push("claim");
          if (options.claimFails) throw Error("RPC unavailable");
          return options.absent ? null : current;
        },
        invalidateToken: async (target) => {
          same(target, current);
          events.push("invalidate");
          if (options.invalidateFails) throw Error("timeout");
          return options.status ?? 200;
        },
        complete: async (target) => {
          same(target, current);
          events.push("complete");
          if (options.completeFails) throw Error("lease lost");
        },
        retry: async (target) => {
          same(target, current);
          events.push("retry");
          if (options.retryFails) throw Error("new worker owns lease");
        },
      }),
  };
}

Deno.test("failed-signup idle worker performs no provider or account actions", async () => {
  const test = await runnerFixture({ absent: true });
  same(await test.run(), { status: "idle", invalidated: 0 });
  same(test.events, ["claim"]);
});

Deno.test("failed-signup only HTTP200 plus durable confirmation reports token invalidation", async () => {
  const test = await runnerFixture();
  same(await test.run(), { status: "complete", invalidated: 1 });
  same(test.events, ["claim", "invalidate", "complete"]);
  for (const status of [201, 204, 400, 401, 429, 500]) {
    const failed = await runnerFixture({ status });
    same(await failed.run(), { status: "retry", invalidated: 0 });
    same(failed.events, ["claim", "invalidate", "retry"]);
  }
});

Deno.test("failed-signup retry retains uncertainty after timeout or durable-confirmation failure", async () => {
  for (
    const options of [{ invalidateFails: true }, { completeFails: true }, {
      completeFails: true,
      retryFails: true,
    }]
  ) {
    const test = await runnerFixture(options);
    same(await test.run(), { status: "retry", invalidated: 0 });
    assert(test.events.includes("retry"));
  }
});

Deno.test("failed-signup claim outage returns retry without starving the member worker", async () => {
  const test = await runnerFixture({ claimFails: true });
  same(await test.run(), { status: "retry", invalidated: 0 });
  same(test.events, ["claim"]);
});
