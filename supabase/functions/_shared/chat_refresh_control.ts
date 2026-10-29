import { AsyncLocalStorage } from "node:async_hooks";

// One row is both the lease and the completed/cooldown marker. Keeping these
// together lets the database fence every state change with the current owner.
export const CHAT_REFRESH_KEY = "bd:chat_refresh:v2";
export const CHAT_REFRESH_POLICY = {
  leaseMs: 120_000,
  workMs: 90_000,
  requestHeadroomMs: 25_000, // callBd aborts its request after 20 seconds.
  freshMs: 20_000,
  backgroundFreshMs: 60_000,
  failureMs: 30_000,
  maxBdCalls: 32,
} as const;

export type ChatRefreshRow = {
  owner: string;
  kind: "running" | "complete" | "failed";
  expiresAt: number;
  finishedAt?: number;
};

export type ChatRefreshDemand = "active" | "background";

export interface ChatRefreshStore {
  read(): Promise<ChatRefreshRow | undefined>;
  // Delete must include expires_at <= the supplied cutoff. A stale reader
  // must never delete a successor's unexpired row.
  deleteExpired(now: number): Promise<void>;
  // INSERT, never UPSERT. A duplicate key is a lost claim, not an error.
  insert(row: ChatRefreshRow): Promise<boolean>;
  // Conditional UPDATE of this owner's still-running, unexpired row only.
  finish(
    owner: string,
    now: number,
    kind: "complete" | "failed",
    expiresAt: number,
  ): Promise<boolean>;
}

export class ChatRefreshStoppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatRefreshStoppedError";
  }
}

export class ChatRefreshLease {
  readonly owner: string;
  readonly expiresAt: number;
  readonly deadline: number;
  bdCalls = 0;
  private stopped: ChatRefreshStoppedError | undefined;

  constructor(
    private readonly store: ChatRefreshStore,
    private readonly now: () => number,
    owner: string,
    startedAt: number,
  ) {
    this.owner = owner;
    this.expiresAt = startedAt + CHAT_REFRESH_POLICY.leaseMs;
    this.deadline = startedAt + CHAT_REFRESH_POLICY.workMs;
  }

  private stop(message: string): never {
    this.stopped ||= new ChatRefreshStoppedError(message);
    throw this.stopped;
  }

  private checkTime(needsRequestHeadroom: boolean) {
    if (this.stopped) throw this.stopped;
    const reserve = needsRequestHeadroom
      ? CHAT_REFRESH_POLICY.requestHeadroomMs
      : 0;
    if (
      this.now() + reserve >= this.deadline ||
      this.now() + reserve >= this.expiresAt
    ) this.stop("Chat refresh time budget ended; defer remaining work.");
    if (
      needsRequestHeadroom && this.bdCalls >= CHAT_REFRESH_POLICY.maxBdCalls
    ) {
      this.stop("Chat refresh request budget ended; defer remaining work.");
    }
  }

  async assertOwned(needsRequestHeadroom = true): Promise<void> {
    this.checkTime(needsRequestHeadroom);
    let row: ChatRefreshRow | undefined;
    try {
      row = await this.store.read();
    } catch {
      this.stop("Chat refresh ownership could not be checked; defer work.");
    }
    // The ownership read itself may be slow. Never start a request based on
    // the time at which that read started.
    this.checkTime(needsRequestHeadroom);
    if (
      !row || row.owner !== this.owner || row.kind !== "running" ||
      row.expiresAt <= this.now()
    ) this.stop("Chat refresh lease changed; defer remaining work.");
  }

  async beforeBdCall(): Promise<void> {
    await this.assertOwned();
    // Recheck after the await so parallel nested requests cannot exceed the
    // budget by all observing the same counter before their ownership reads.
    this.checkTime(true);
    this.bdCalls += 1;
  }

  async complete(): Promise<boolean> {
    await this.assertOwned(false);
    const now = this.now();
    return await this.store.finish(
      this.owner,
      now,
      "complete",
      now + CHAT_REFRESH_POLICY.freshMs,
    );
  }

  async fail(): Promise<boolean> {
    const now = this.now();
    return await this.store.finish(
      this.owner,
      now,
      "failed",
      now + CHAT_REFRESH_POLICY.failureMs,
    );
  }
}

export async function claimChatRefresh(
  store: ChatRefreshStore,
  options: {
    now?: () => number;
    newOwner?: () => string;
    demand?: ChatRefreshDemand;
  } = {},
): Promise<ChatRefreshLease | undefined> {
  const now = options.now || Date.now;
  const existing = await store.read();
  // Steady-state polls are one read, without a write or unique violation.
  if (existing && existing.expiresAt > now()) return undefined;
  if (existing?.kind === "complete" && options.demand === "background") {
    // Keep the physical 20-second expiry so opening Messages can still elect
    // an active refresh. Only passive badge demand waits a full minute after
    // success; this adds no per-member writes and never extends failure/crash
    // leases. Existing rows already persist finished_at; derive it for older
    // rows and bound malformed/future timestamps by the known expiry.
    const fromExpiry = existing.expiresAt - CHAT_REFRESH_POLICY.freshMs;
    const finishedAt = Number.isFinite(existing.finishedAt) &&
        existing.finishedAt! <= now()
      ? Math.min(existing.finishedAt!, fromExpiry)
      : fromExpiry;
    if (
      Number.isFinite(finishedAt) &&
      finishedAt + CHAT_REFRESH_POLICY.backgroundFreshMs > now()
    ) return undefined;
  }
  if (existing) await store.deleteExpired(now());
  const startedAt = now();
  const owner = (options.newOwner || (() => crypto.randomUUID()))();
  const lease = new ChatRefreshLease(store, now, owner, startedAt);
  if (
    !await store.insert({ owner, kind: "running", expiresAt: lease.expiresAt })
  ) return undefined;
  return lease;
}

const refreshScope = new AsyncLocalStorage<ChatRefreshLease>();

export function withChatRefreshLease<T>(
  lease: ChatRefreshLease,
  work: () => Promise<T>,
): Promise<T> {
  return refreshScope.run(lease, work);
}

// AsyncLocalStorage scopes the guard to the elected refresh. A simultaneous
// user's send/read request in the same isolate must not inherit its budget.
export async function beforeChatRefreshBdCall(): Promise<void> {
  await refreshScope.getStore()?.beforeBdCall();
}

export async function beforeChatRefreshWork(): Promise<void> {
  await refreshScope.getStore()?.assertOwned();
}

export function assertSuccessfulChatRefreshPull(
  response: { ok: boolean; status: number },
  status: unknown,
  resource: "threads" | "messages",
) {
  if (!response.ok || status !== "success") {
    throw new Error(
      `Directory chat ${resource} refresh failed (HTTP ${response.status}).`,
    );
  }
}
