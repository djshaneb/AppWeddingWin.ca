import {
  type AppleRevocationJob,
  type AppleStoredGrant,
  runAppleRevocationJob,
} from "./apple_grant_lifecycle.ts";
import { runWebsiteAppleAccountCleanup } from "./website_apple_cleanup.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function same(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

async function rejects(action: () => Promise<unknown>, expected?: Error) {
  try {
    await action();
  } catch (error) {
    if (expected) {
      assert(error === expected, "Dependency error was not propagated");
    }
    return;
  }
  throw new Error("Expected rejection");
}

const fixtureNow = Date.parse("2035-04-12T12:00:00.000Z");
const fixtureProfileId = "00000000-0000-4000-8000-000000000101";
const unrelatedProfileId = "00000000-0000-4000-8000-000000000202";
const fixtureJob = {
  id: "website-cleanup-job-fixture",
  leaseToken: "website-cleanup-lease-fixture",
  bdMemberId: "900001",
  expectedGrants: 2,
  fullCleanup: true,
  profileId: fixtureProfileId,
};
const validLease = () => ({
  profileId: fixtureProfileId,
  leaseUntil: new Date(fixtureNow + 120_000).toISOString(),
});

type Event = { type: string; value: unknown };
type Lease = ReturnType<typeof validLease>;

function fixture(options: {
  job?: AppleRevocationJob;
  prepared?: Lease | Error;
  validated?: Lease | Error;
  absent?: (boolean | Error)[];
  auth?: { id: string } | null | Error;
  deleteError?: Error;
  finishError?: Error;
  afterFinalInspection?: () => void;
  now?: () => number;
} = {}) {
  const events: Event[] = [];
  const job = options.job ?? fixtureJob;
  const absent = [...(options.absent ?? [true, true])];
  let inspections = 0;
  const deps = {
    prepare: async (received: AppleRevocationJob) => {
      events.push({ type: "prepare", value: received });
      if (options.prepared instanceof Error) throw options.prepared;
      return options.prepared ?? validLease();
    },
    validate: async (received: AppleRevocationJob) => {
      events.push({ type: "validate", value: received });
      if (options.validated instanceof Error) throw options.validated;
      return options.validated ?? validLease();
    },
    inspectAbsent: async (bdMemberId: string) => {
      events.push({ type: "inspect", value: bdMemberId });
      const result = absent.shift();
      assert(result !== undefined, "Unexpected extra BD inspection");
      if (++inspections === 2) options.afterFinalInspection?.();
      if (result instanceof Error) throw result;
      return result;
    },
    getAuthUser: async (profileId: string) => {
      events.push({ type: "get-auth", value: profileId });
      if (options.auth instanceof Error) throw options.auth;
      return options.auth === undefined
        ? { id: fixtureProfileId }
        : options.auth;
    },
    deleteAuthUser: async (profileId: string) => {
      events.push({ type: "delete-auth", value: profileId });
      if (options.deleteError) throw options.deleteError;
    },
    finish: async (received: AppleRevocationJob) => {
      events.push({ type: "finish", value: received });
      if (options.finishError) throw options.finishError;
    },
    now: options.now ?? (() => fixtureNow),
  };
  return {
    events,
    stages: () => events.map((event) => event.type),
    run: () => runWebsiteAppleAccountCleanup(job, deps),
  };
}

function noDeletionOrFinish(test: ReturnType<typeof fixture>) {
  assert(
    !test.stages().some((stage) => ["delete-auth", "finish"].includes(stage)),
    "A failed ownership or lease check must not delete or finish",
  );
}

Deno.test("website Apple cleanup deletes only the snapshotted account after both fences", async () => {
  const test = fixture();
  await test.run();
  same(test.stages(), [
    "inspect",
    "prepare",
    "get-auth",
    "inspect",
    "validate",
    "delete-auth",
    "finish",
  ]);
  same(test.events.filter((event) => event.type === "inspect"), [
    { type: "inspect", value: fixtureJob.bdMemberId },
    { type: "inspect", value: fixtureJob.bdMemberId },
  ]);
  same(test.events.filter((event) => event.type.endsWith("auth")), [
    { type: "get-auth", value: fixtureProfileId },
    { type: "delete-auth", value: fixtureProfileId },
  ]);
  for (const stage of ["prepare", "validate", "finish"]) {
    assert(
      test.events.find((event) => event.type === stage)?.value === fixtureJob,
    );
  }
});

Deno.test("website Apple cleanup leaves legacy and revocation-only jobs untouched", async () => {
  const { fullCleanup: _full, profileId: _profile, ...legacy } = fixtureJob;
  for (const job of [legacy, { ...fixtureJob, fullCleanup: false }]) {
    const test = fixture({ job });
    await test.run();
    same(test.events, []);
  }
});

Deno.test("website Apple cleanup refuses a missing or blank snapshotted profile", async () => {
  const { profileId: _profile, ...withoutProfile } = fixtureJob;
  for (
    const job of [
      withoutProfile,
      { ...fixtureJob, profileId: "" },
      { ...fixtureJob, profileId: "   " },
    ]
  ) {
    const test = fixture({ job });
    await rejects(test.run);
    same(test.events, []);
  }
});

Deno.test("website Apple cleanup stops before prepare when the exact BD member exists", async () => {
  const test = fixture({ absent: [false] });
  await rejects(test.run);
  same(test.stages(), ["inspect"]);
});

Deno.test("website Apple cleanup propagates the initial BD outage without deleting", async () => {
  const outage = new Error("Fictional initial BD outage");
  const test = fixture({ absent: [outage] });
  await rejects(test.run, outage);
  same(test.stages(), ["inspect"]);
});

Deno.test("website Apple cleanup rejects an absent or mismatched prepare binding", async () => {
  for (const profileId of ["", unrelatedProfileId]) {
    const test = fixture({ prepared: { ...validLease(), profileId } });
    await rejects(test.run);
    same(test.stages(), ["inspect", "prepare"]);
    noDeletionOrFinish(test);
  }
});

Deno.test("website Apple cleanup propagates preparation failures without Auth access", async () => {
  const failure = new Error("Fictional prepare failure");
  const test = fixture({ prepared: failure });
  await rejects(test.run, failure);
  same(test.stages(), ["inspect", "prepare"]);
});

Deno.test("website Apple cleanup rejects invalid, expired, or nearly expired prepare leases", async () => {
  for (
    const leaseUntil of [
      "",
      "not-a-time",
      new Date(fixtureNow - 1).toISOString(),
      new Date(fixtureNow).toISOString(),
      new Date(fixtureNow + 9_999).toISOString(),
      new Date(fixtureNow + 10_000).toISOString(),
    ]
  ) {
    const test = fixture({ prepared: { ...validLease(), leaseUntil } });
    await rejects(test.run);
    same(test.stages(), ["inspect", "prepare"]);
    noDeletionOrFinish(test);
  }
});

Deno.test("website Apple cleanup accepts a prepare lease with more than ten seconds remaining", async () => {
  const test = fixture({
    prepared: {
      ...validLease(),
      leaseUntil: new Date(fixtureNow + 10_001).toISOString(),
    },
  });
  await test.run();
  same(test.stages().slice(-2), ["delete-auth", "finish"]);
});

Deno.test("website Apple cleanup rejects a different Auth user instead of deleting it", async () => {
  const test = fixture({ auth: { id: unrelatedProfileId } });
  await rejects(test.run);
  same(test.stages(), ["inspect", "prepare", "get-auth"]);
  noDeletionOrFinish(test);
});

Deno.test("website Apple cleanup propagates Auth lookup failures", async () => {
  const failure = new Error("Fictional Auth lookup failure");
  const test = fixture({ auth: failure });
  await rejects(test.run, failure);
  same(test.stages(), ["inspect", "prepare", "get-auth"]);
  noDeletionOrFinish(test);
});

Deno.test("website Apple cleanup revalidates and finishes an already absent Auth account", async () => {
  const test = fixture({ auth: null });
  await test.run();
  same(test.stages(), [
    "inspect",
    "prepare",
    "get-auth",
    "inspect",
    "validate",
    "finish",
  ]);
});

Deno.test("website Apple cleanup rejects an absent or changed final profile binding", async () => {
  for (const profileId of ["", unrelatedProfileId]) {
    const test = fixture({ validated: { ...validLease(), profileId } });
    await rejects(test.run);
    same(test.stages(), [
      "inspect",
      "prepare",
      "get-auth",
      "inspect",
      "validate",
    ]);
    noDeletionOrFinish(test);
  }
});

Deno.test("website Apple cleanup refuses stale or malformed final leases", async () => {
  for (
    const leaseUntil of [
      "",
      "invalid-date",
      new Date(fixtureNow - 1).toISOString(),
      new Date(fixtureNow).toISOString(),
      new Date(fixtureNow + 9_999).toISOString(),
      new Date(fixtureNow + 10_000).toISOString(),
    ]
  ) {
    const test = fixture({ validated: { ...validLease(), leaseUntil } });
    await rejects(test.run);
    same(test.stages(), [
      "inspect",
      "prepare",
      "get-auth",
      "inspect",
      "validate",
    ]);
    noDeletionOrFinish(test);
  }
});

Deno.test("website Apple cleanup propagates final fencing failures", async () => {
  const failure = new Error("Fictional final fence failure");
  const test = fixture({ validated: failure });
  await rejects(test.run, failure);
  same(test.stages(), [
    "inspect",
    "prepare",
    "get-auth",
    "inspect",
    "validate",
  ]);
  noDeletionOrFinish(test);
});

Deno.test("website Apple cleanup stops if the BD member appears before Auth deletion", async () => {
  const test = fixture({ absent: [true, false] });
  await rejects(test.run);
  same(test.stages(), ["inspect", "prepare", "get-auth", "inspect"]);
  noDeletionOrFinish(test);
});

Deno.test("website Apple cleanup propagates a final BD outage instead of treating it as absence", async () => {
  const outage = new Error("Fictional final BD outage");
  const test = fixture({ absent: [true, outage] });
  await rejects(test.run, outage);
  same(test.stages(), ["inspect", "prepare", "get-auth", "inspect"]);
  noDeletionOrFinish(test);
});

Deno.test("website Apple cleanup rechecks lease time after a slow final BD lookup", async () => {
  let currentTime = fixtureNow;
  const test = fixture({
    now: () => currentTime,
    afterFinalInspection: () => {
      currentTime = fixtureNow + 115_000;
    },
  });
  await rejects(test.run);
  noDeletionOrFinish(test);
});

Deno.test("website Apple cleanup never finishes after an Auth deletion failure", async () => {
  const failure = new Error("Fictional Auth deletion failure");
  const test = fixture({ deleteError: failure });
  await rejects(test.run, failure);
  same(test.stages().slice(-2), ["validate", "delete-auth"]);
  assert(!test.stages().includes("finish"));
});

Deno.test("website Apple cleanup propagates finish failure for retry after Auth deletion", async () => {
  const failure = new Error("Fictional cleanup finish failure");
  const test = fixture({ finishError: failure });
  await rejects(test.run, failure);
  same(test.stages().slice(-2), ["delete-auth", "finish"]);
  same(test.stages().filter((stage) => stage === "delete-auth").length, 1);
});

Deno.test("website Apple cleanup retry after Auth deletion is safely idempotent", async () => {
  const first = fixture({ finishError: new Error("Fictional finish outage") });
  await rejects(first.run);
  const retry = fixture({ auth: null });
  await retry.run();
  assert(!retry.stages().includes("delete-auth"));
  same(retry.stages().at(-1), "finish");
});

Deno.test("website Apple cleanup does not skip final fences merely because Auth is absent", async () => {
  const fenceFailure = fixture({
    auth: null,
    validated: { ...validLease(), profileId: unrelatedProfileId },
  });
  await rejects(fenceFailure.run);
  noDeletionOrFinish(fenceFailure);
  const presentMember = fixture({ auth: null, absent: [true, false] });
  await rejects(presentMember.run);
  noDeletionOrFinish(presentMember);
});

const fixtureGrant: AppleStoredGrant = {
  identityId: "website-identity-fixture",
  generation: "website-generation-fixture",
  grantId: "website-grant-fixture",
  clientId: "invalid.example.fixture.web",
  appleSub: "website-subject-fixture",
  bdMemberId: fixtureJob.bdMemberId,
  profileId: fixtureProfileId,
  ciphertext: "website-ciphertext-fixture",
  iv: "website-iv-fixture",
  keyVersion: 1,
};

function workerFixture(options: {
  grants?: AppleStoredGrant[];
  omitCleanup?: boolean;
  cleanupError?: Error;
  confirmError?: Error;
  revokeStatus?: number;
  fullCleanup?: boolean;
  expectedGrants?: number;
} = {}) {
  const events: string[] = [];
  const job = {
    ...fixtureJob,
    fullCleanup: options.fullCleanup ?? true,
    expectedGrants: options.expectedGrants ?? 2,
  };
  const deps = {
    claim: async () => {
      events.push("claim");
      return job;
    },
    inspect: async (bdMemberId: string) => {
      same(bdMemberId, job.bdMemberId);
      events.push("inspect");
      return true;
    },
    grants: async (received: AppleRevocationJob) => {
      assert(received === job);
      events.push("grants");
      return options.grants ?? [fixtureGrant];
    },
    revoke: async (grant: AppleStoredGrant) => {
      same(grant.bdMemberId, job.bdMemberId);
      events.push(`revoke:${grant.grantId}`);
      return options.revokeStatus ?? 200;
    },
    confirm: async (received: AppleRevocationJob, grant: AppleStoredGrant) => {
      assert(received === job);
      events.push(`confirm:${grant.grantId}`);
      if (options.confirmError) throw options.confirmError;
    },
    ...(options.omitCleanup ? {} : {
      cleanup: async (received: AppleRevocationJob) => {
        assert(received === job);
        events.push("cleanup");
        if (options.cleanupError) throw options.cleanupError;
      },
    }),
    finish: async (received: AppleRevocationJob) => {
      assert(received === job);
      events.push("finish");
    },
    retry: async (received: AppleRevocationJob, reason: string) => {
      assert(received === job);
      events.push(`retry:${reason}`);
    },
  };
  return { events, run: () => runAppleRevocationJob(deps) };
}

Deno.test("Apple revocation fails closed when full cleanup has no cleanup adapter", async () => {
  const test = workerFixture({ omitCleanup: true });
  same(await test.run(), { status: "retry", revoked: 1 });
  assert(!test.events.includes("finish"));
  same(test.events.at(-1), "retry:revocation_retry_required");
});

Deno.test("Apple revocation does not finish when full website cleanup fails", async () => {
  const test = workerFixture({
    cleanupError: new Error("Fictional cleanup outage"),
  });
  same(await test.run(), { status: "retry", revoked: 1 });
  assert(!test.events.includes("finish"));
  same(test.events.slice(-2), ["cleanup", "retry:revocation_retry_required"]);
});

Deno.test("Apple revocation starts website cleanup only after every pending grant is confirmed", async () => {
  const grants = Array.from({ length: 3 }, (_, index) => ({
    ...fixtureGrant,
    grantId: `website-grant-${index}`,
  }));
  const test = workerFixture({ grants, expectedGrants: grants.length });
  same(await test.run(), { status: "complete", revoked: 3 });
  same(test.events, [
    "claim",
    "inspect",
    "grants",
    "revoke:website-grant-0",
    "confirm:website-grant-0",
    "inspect",
    "revoke:website-grant-1",
    "confirm:website-grant-1",
    "inspect",
    "revoke:website-grant-2",
    "confirm:website-grant-2",
    "cleanup",
    "finish",
  ]);
});

Deno.test("Apple revocation resumes website cleanup with no pending but previously confirmed grants", async () => {
  const test = workerFixture({ grants: [], expectedGrants: 2 });
  same(await test.run(), { status: "complete", revoked: 0 });
  same(test.events, ["claim", "inspect", "grants", "cleanup", "finish"]);
});

Deno.test("Apple revocation never cleans the app when no Apple authorization was snapshotted", async () => {
  const test = workerFixture({ grants: [], expectedGrants: 0 });
  same(await test.run(), { status: "retry", revoked: 0 });
  same(test.events, [
    "claim",
    "inspect",
    "grants",
    "retry:missing_credentials",
  ]);
});

Deno.test("Apple revocation partial batches defer website cleanup and completion", async () => {
  const grants = Array.from({ length: 6 }, (_, index) => ({
    ...fixtureGrant,
    grantId: `website-grant-${index}`,
  }));
  const test = workerFixture({ grants, expectedGrants: grants.length });
  same(await test.run(), { status: "partial", revoked: 5 });
  assert(!test.events.includes("cleanup"));
  assert(!test.events.includes("finish"));
  same(test.events.at(-1), "retry:more_grants_pending");
});

Deno.test("Apple revocation never cleans the app after a failed receipt or confirmation", async () => {
  for (
    const options of [
      { revokeStatus: 503 },
      { confirmError: new Error("Fictional grant confirmation failure") },
    ]
  ) {
    const test = workerFixture(options);
    same(await test.run(), { status: "retry", revoked: 0 });
    assert(!test.events.includes("cleanup"));
    assert(!test.events.includes("finish"));
    same(test.events.at(-1), "retry:revocation_retry_required");
  }
});

Deno.test("Apple revocation legacy jobs finish without invoking website cleanup", async () => {
  const test = workerFixture({ fullCleanup: false });
  same(await test.run(), { status: "complete", revoked: 1 });
  assert(!test.events.includes("cleanup"));
  same(test.events.at(-1), "finish");
});
