import assert from "node:assert/strict";
import {
  assertSuccessfulChatRefreshPull,
  beforeChatRefreshBdCall,
  beforeChatRefreshWork,
  CHAT_REFRESH_POLICY,
  type ChatRefreshRow,
  ChatRefreshStoppedError,
  type ChatRefreshStore,
  claimChatRefresh,
  withChatRefreshLease,
} from "./chat_refresh_control.ts";

// Each client below has independent methods and no shared application cache.
// Only the fake database row is shared; insert/conditional writes are atomic,
// matching bd_edge_cache's primary key and UPDATE/DELETE predicates.
function database() {
  let row: ChatRefreshRow | undefined;
  let clock = 1_000_000;
  let sequence = 0;
  const stats = { reads: 0, deletes: 0, inserts: 0, finishes: 0 };
  const clients = (): ChatRefreshStore => ({
    async read() {
      stats.reads++;
      await Promise.resolve();
      return row && { ...row };
    },
    async deleteExpired(now) {
      stats.deletes++;
      await Promise.resolve();
      if (row && row.expiresAt <= now) row = undefined;
    },
    async insert(value) {
      stats.inserts++;
      await Promise.resolve();
      if (row) return false;
      row = { ...value };
      return true;
    },
    async finish(owner, now, kind, expiresAt) {
      stats.finishes++;
      await Promise.resolve();
      if (
        !row || row.owner !== owner || row.kind !== "running" ||
        row.expiresAt <= now
      ) return false;
      row = { owner, kind, expiresAt, finishedAt: now };
      return true;
    },
  });
  return {
    clients,
    stats,
    get row() {
      return row;
    },
    set row(value: ChatRefreshRow | undefined) {
      row = value;
    },
    advance(ms: number) {
      clock += ms;
    },
    options: { now: () => clock, newOwner: () => `owner-${++sequence}` },
  };
}

Deno.test("300 independent simultaneous claimants elect one refresh", async () => {
  const db = database();
  let externalCalls = 0;
  let completions = 0;
  await Promise.all(Array.from({ length: 300 }, async () => {
    const lease = await claimChatRefresh(db.clients(), db.options);
    if (!lease) return;
    await withChatRefreshLease(lease, async () => {
      await beforeChatRefreshBdCall();
      externalCalls++;
      await beforeChatRefreshBdCall();
      externalCalls++;
      if (await lease.complete()) completions++;
    });
  }));
  assert.equal(
    externalCalls,
    2,
    "one threads + messages pull across all polls",
  );
  assert.equal(completions, 1);
  assert.equal(db.row?.kind, "complete");
});

Deno.test("300 polls during completed freshness read once each without writes", async () => {
  const db = database();
  const lease = (await claimChatRefresh(db.clients(), db.options))!;
  assert(await lease.complete());
  const before = { ...db.stats };
  const claims = await Promise.all(
    Array.from(
      { length: 300 },
      () => claimChatRefresh(db.clients(), db.options),
    ),
  );
  assert(claims.every((claim) => !claim));
  assert.equal(db.stats.reads - before.reads, 300);
  assert.equal(db.stats.deletes, before.deletes);
  assert.equal(db.stats.inserts, before.inserts);
  db.advance(CHAT_REFRESH_POLICY.freshMs - 1);
  assert.equal(await claimChatRefresh(db.clients(), db.options), undefined);
  db.advance(1);
  assert(await claimChatRefresh(db.clients(), db.options));
});

Deno.test("300 background polls at30s skip writes and elect one refresh at60s", async () => {
  const db = database();
  const background = { ...db.options, demand: "background" as const };
  const lease = (await claimChatRefresh(db.clients(), background))!;
  assert(await lease.complete());
  assert.equal(db.row!.expiresAt - db.row!.finishedAt!, 20_000);
  db.advance(30_000);
  const before = { ...db.stats };
  const skipped = await Promise.all(
    Array.from(
      { length: 300 },
      () => claimChatRefresh(db.clients(), background),
    ),
  );
  assert(skipped.every((claim) => !claim));
  assert.equal(db.stats.reads - before.reads, 300);
  assert.equal(db.stats.deletes, before.deletes);
  assert.equal(db.stats.inserts, before.inserts);
  db.advance(30_000);
  const claims = await Promise.all(
    Array.from(
      { length: 300 },
      () => claimChatRefresh(db.clients(), background),
    ),
  );
  assert.equal(claims.filter(Boolean).length, 1);
});

Deno.test("opening Messages can claim after20s despite a background caller's60s cadence", async () => {
  const db = database();
  const background = { ...db.options, demand: "background" as const };
  const initial = (await claimChatRefresh(db.clients(), background))!;
  assert(await initial.complete());
  db.advance(20_000);
  assert.equal(await claimChatRefresh(db.clients(), background), undefined);
  const active = await claimChatRefresh(db.clients(), db.options);
  assert(active);
  assert(await active.complete());
  db.advance(20_000);
  assert.equal(await claimChatRefresh(db.clients(), background), undefined);
  assert(
    await claimChatRefresh(db.clients(), { ...db.options, demand: "active" }),
  );
});

Deno.test("background cadence never lengthens failure cooldown or defeats running ownership", async () => {
  const db = database();
  const background = { ...db.options, demand: "background" as const };
  const lease = (await claimChatRefresh(db.clients(), background))!;
  assert(await lease.fail());
  db.advance(29_999);
  assert.equal(await claimChatRefresh(db.clients(), background), undefined);
  db.advance(1);
  const recovered = await claimChatRefresh(db.clients(), background);
  assert(recovered);
  db.advance(60_000);
  assert.equal(await claimChatRefresh(db.clients(), background), undefined);
});

for (const timestamp of [undefined, NaN, Infinity, 9_999_999_999_999]) {
  Deno.test(`background completed timestamp ${timestamp} has bounded fallback`, async () => {
    const db = database();
    const background = { ...db.options, demand: "background" as const };
    const initial = (await claimChatRefresh(db.clients(), background))!;
    assert(await initial.complete());
    db.row = { ...db.row!, finishedAt: timestamp };
    db.advance(59_999);
    assert.equal(await claimChatRefresh(db.clients(), background), undefined);
    db.advance(1);
    assert(await claimChatRefresh(db.clients(), background));
  });
}

Deno.test("invalid/future completion timestamp cannot slow active conversation refresh", async () => {
  const db = database();
  const initial = (await claimChatRefresh(db.clients(), db.options))!;
  assert(await initial.complete());
  db.row = { ...db.row!, finishedAt: 9_999_999_999_999 };
  db.advance(20_000);
  assert(await claimChatRefresh(db.clients(), db.options));
});

Deno.test("running lease blocks polls and 300 claimants recover one expired crash", async () => {
  const db = database();
  const previous = (await claimChatRefresh(db.clients(), db.options))!;
  db.advance(CHAT_REFRESH_POLICY.leaseMs - 1);
  assert.equal(await claimChatRefresh(db.clients(), db.options), undefined);
  db.advance(1);
  const claims = await Promise.all(
    Array.from(
      { length: 300 },
      () => claimChatRefresh(db.clients(), db.options),
    ),
  );
  const winners = claims.filter((claim) => claim);
  assert.equal(winners.length, 1);
  assert.notEqual(winners[0]!.owner, previous.owner);
  assert.equal(await previous.fail(), false);
  await assert.rejects(() => previous.complete(), ChatRefreshStoppedError);
  assert.equal(db.row?.owner, winners[0]!.owner);
  assert.equal(db.row?.kind, "running");
});

Deno.test("delayed stale delete cannot remove a newer unexpired owner", async () => {
  const db = database();
  const client = db.clients();
  db.row = { owner: "expired", kind: "running", expiresAt: 0 };
  const originalDelete = client.deleteExpired;
  client.deleteExpired = async (now) => {
    db.row = { owner: "new-owner", kind: "running", expiresAt: now + 120_000 };
    await originalDelete(now);
  };
  assert.equal(await claimChatRefresh(client, db.options), undefined);
  assert.equal(db.row?.owner, "new-owner");
});

Deno.test("failed refresh creates cooldown and prevents a 300-request retry herd", async () => {
  const db = database();
  const lease = (await claimChatRefresh(db.clients(), db.options))!;
  assert(await lease.fail());
  assert.equal(db.row?.kind, "failed");
  const claims = await Promise.all(
    Array.from(
      { length: 300 },
      () => claimChatRefresh(db.clients(), db.options),
    ),
  );
  assert(claims.every((claim) => !claim));
  db.advance(CHAT_REFRESH_POLICY.failureMs);
  assert(await claimChatRefresh(db.clients(), db.options));
});

Deno.test("late failure cannot replace an already completed marker", async () => {
  const db = database();
  const lease = (await claimChatRefresh(db.clients(), db.options))!;
  assert(await lease.complete());
  assert.equal(await lease.fail(), false);
  assert.equal(db.row?.kind, "complete");
});

for (const operation of ["read", "deleteExpired", "insert"] as const) {
  Deno.test(`database ${operation} errors fail closed before any work`, async () => {
    const db = database();
    const client = db.clients();
    if (operation === "deleteExpired") {
      db.row = { owner: "expired", kind: "running", expiresAt: 0 };
    }
    client[operation] = (): Promise<never> =>
      Promise.reject(new Error("database unavailable"));
    await assert.rejects(
      () => claimChatRefresh(client, db.options),
      /unavailable/,
    );
    assert.equal(
      db.row?.owner,
      operation === "deleteExpired" ? "expired" : undefined,
    );
  });
}

Deno.test("ownership read errors stop requests and cannot be swallowed into freshness", async () => {
  const db = database();
  const client = db.clients();
  const lease = (await claimChatRefresh(client, db.options))!;
  const goodRead = client.read;
  client.read = () => Promise.reject(new Error("database unavailable"));
  await assert.rejects(() => lease.beforeBdCall(), ChatRefreshStoppedError);
  client.read = goodRead;
  await assert.rejects(() => lease.complete(), ChatRefreshStoppedError);
  assert.equal(lease.bdCalls, 0);
  assert.equal(db.row?.kind, "running");
});

Deno.test("database completion errors never report a successful refresh", async () => {
  const db = database();
  const client = db.clients();
  const lease = (await claimChatRefresh(client, db.options))!;
  client.finish = () => Promise.reject(new Error("write unavailable"));
  await assert.rejects(() => lease.complete(), /write unavailable/);
  assert.equal(db.row?.kind, "running");
});

Deno.test("changed owner stops external calls even before the original lease deadline", async () => {
  const db = database();
  const lease = (await claimChatRefresh(db.clients(), db.options))!;
  db.row = {
    owner: "replacement",
    kind: "running",
    expiresAt: lease.expiresAt,
  };
  await assert.rejects(() => lease.beforeBdCall(), /lease changed/);
  assert.equal(lease.bdCalls, 0);
  assert.equal(await lease.fail(), false);
});

Deno.test("slow ownership query rechecks deadline before starting a 20-second request", async () => {
  const db = database();
  const client = db.clients();
  const lease = (await claimChatRefresh(client, db.options))!;
  const read = client.read;
  client.read = async () => {
    const row = await read();
    db.advance(
      CHAT_REFRESH_POLICY.workMs - CHAT_REFRESH_POLICY.requestHeadroomMs,
    );
    return row;
  };
  await assert.rejects(() => lease.beforeBdCall(), /time budget ended/);
  assert.equal(lease.bdCalls, 0);
});

Deno.test("nested parallel requests respect the actual 32-call budget", async () => {
  const db = database();
  const lease = (await claimChatRefresh(db.clients(), db.options))!;
  const results = await withChatRefreshLease(
    lease,
    () =>
      Promise.allSettled(
        Array.from({ length: 80 }, () => beforeChatRefreshBdCall()),
      ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    32,
  );
  assert.equal(lease.bdCalls, 32);
  await assert.rejects(() => lease.complete(), /request budget ended/);
});

Deno.test("refresh context does not restrict a simultaneous independent send request", async () => {
  const db = database();
  const lease = (await claimChatRefresh(db.clients(), db.options))!;
  let resume!: () => void;
  const suspended = new Promise<void>((resolve) => resume = resolve);
  const guarded = withChatRefreshLease(lease, async () => {
    await suspended;
    await assert.rejects(() => beforeChatRefreshBdCall(), /time budget ended/);
    await assert.rejects(() => beforeChatRefreshWork(), /time budget ended/);
  });
  db.advance(CHAT_REFRESH_POLICY.workMs);
  // This request is outside run(), despite sharing its isolate and module.
  await beforeChatRefreshWork();
  await beforeChatRefreshBdCall();
  resume();
  await guarded;
  await beforeChatRefreshBdCall();
  assert.equal(lease.bdCalls, 0);
});

Deno.test("two overlapping refresh contexts keep independent budgets", async () => {
  const firstDb = database();
  const secondDb = database();
  const first = (await claimChatRefresh(firstDb.clients(), firstDb.options))!;
  const second =
    (await claimChatRefresh(secondDb.clients(), secondDb.options))!;
  await Promise.all([
    withChatRefreshLease(first, async () => {
      await beforeChatRefreshBdCall();
      await Promise.resolve();
      await beforeChatRefreshBdCall();
    }),
    withChatRefreshLease(second, async () => {
      await Promise.resolve();
      await beforeChatRefreshBdCall();
    }),
  ]);
  assert.equal(first.bdCalls, 2);
  assert.equal(second.bdCalls, 1);
});

Deno.test("HTTP or business-level list errors never count as successful empty pulls", () => {
  for (
    const [ok, status, bodyStatus] of [
      [false, 429, "error"],
      [false, 503, "success"],
      [true, 200, "error"],
      [true, 200, undefined],
    ] as const
  ) {
    assert.throws(() =>
      assertSuccessfulChatRefreshPull({ ok, status }, bodyStatus, "messages")
    );
  }
  assertSuccessfulChatRefreshPull(
    { ok: true, status: 200 },
    "success",
    "threads",
  );
});
