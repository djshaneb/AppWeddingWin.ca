import {
  nextPushRetry,
  parseRetryAfterMs,
  PUSH_RETRY_AFTER_MAX_MS,
  PUSH_RETRY_MAX_MS,
} from "./push_retry.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const pushMigrationUrl = new URL(
  "../../migrations/20260828211801_harden_push_sweep_leasing_retry.sql",
  import.meta.url,
);
const pushRetryMigrationUrl = new URL(
  "../../migrations/20260828214927_harden_expo_push_retry_backoff.sql",
  import.meta.url,
);
const pushSweepUrl = new URL("../bd-push-sweep/index.ts", import.meta.url);

Deno.test("push sweep claims a fair bounded batch instead of newest 100 devices", async () => {
  const [migration, worker] = await Promise.all([
    Deno.readTextFile(pushMigrationUrl),
    Deno.readTextFile(pushSweepUrl),
  ]);

  assert(
    worker.includes('"claim_weddingwin_push_tokens"') &&
      worker.includes("p_limit: 100"),
    "the worker must obtain its bounded device batch through the claim RPC",
  );
  assert(
    !/\.order\("updated_at",\s*\{\s*ascending:\s*false\s*\}\)\s*\.limit\(100\)/
      .test(worker),
    "the worker must not repeatedly select only the newest 100 device rows",
  );
  assert(
    /order by[\s\S]*last_push_checked_at asc nulls first[\s\S]*updated_at asc[\s\S]*id asc/i
      .test(migration),
    "claims must rotate in least-recently-checked order with deterministic ties",
  );
  assert(
    /last_push_checked_at = clock_timestamp\(\)[\s\S]*push_claim_token = null/i
      .test(migration),
    "releasing a batch must advance its fairness cursor and clear ownership",
  );
});

Deno.test("push claims prevent overlapping cron runs from owning one device", async () => {
  const [migration, worker] = await Promise.all([
    Deno.readTextFile(pushMigrationUrl),
    Deno.readTextFile(pushSweepUrl),
  ]);

  assert(
    /push_claim_expires_at <= clock_timestamp\(\)[\s\S]*for update skip locked/i
      .test(migration),
    "claim selection must recover expired leases and skip rows locked by another run",
  );
  assert(
    /push_claim_expires_at = clock_timestamp\(\)[\s\S]*make_interval\(secs => bounded_lease_seconds\)/i
      .test(migration),
    "claimed devices must receive a durable expiring lease",
  );
  assert(
    /create or replace function public\.release_weddingwin_push_claim_except[\s\S]*id = any\(coalesce\(p_retain_ids, array\[\]::uuid\[\]\)\)/i
      .test(migration),
    "partial release must retain only explicitly ambiguous device rows",
  );
  assert(
    /finally\s*\{[\s\S]*if \(claimEstablished\)[\s\S]*"release_weddingwin_push_claim_except"[\s\S]*p_retain_ids: \[\.\.\.ambiguousRowIds\]/i
      .test(worker),
    "the worker must release healthy claim rows while retaining only ambiguous delivery outcomes until lease expiry",
  );

  assert(
    /async function updateClaimedPushToken[\s\S]*\.eq\("push_registration_generation", row\.push_registration_generation\)[\s\S]*\.eq\("enabled", true\)[\s\S]*\.eq\("push_claim_token", claimToken\)[\s\S]*\.gt\("push_claim_expires_at"[\s\S]*\.select\("id"\)[\s\S]*\.maybeSingle\(\)/
      .test(worker) &&
      /\.eq\("push_claim_token", claimToken\)[\s\S]*\.eq\("enabled", true\)[\s\S]*\.gt\("push_claim_expires_at"[\s\S]*\.in\("id"/s
        .test(worker),
    "receipt, ticket, and unread-state writes must remain scoped to a live registration lease",
  );

  for (const role of ["public", "anon", "authenticated"]) {
    assert(
      new RegExp(
        `revoke all on function public\\.claim_weddingwin_push_tokens\\(uuid, integer, integer\\) from ${role}`,
        "i",
      ).test(migration),
      `the push claim RPC must be unavailable to ${role}`,
    );
  }
  assert(
    /grant execute on function public\.claim_weddingwin_push_tokens\(uuid, integer, integer\) to service_role/i
      .test(migration),
    "only service-role code may claim push devices",
  );
});

Deno.test("push sweep paginates BD reads and fails closed on partial dependencies", async () => {
  const worker = await Deno.readTextFile(pushSweepUrl);

  assert(
    worker.includes("listBdRowsPaginated") &&
      worker.includes("result.body.next_page") &&
      worker.includes("seenPages.has(nextPage)") &&
      worker.includes("BD_MAX_PAGES_PER_LIST"),
    "BD lists must follow next-page cursors with loop and volume guards",
  );
  assert(
    worker.includes("if (!nextPage)") &&
      worker.includes("pagination omitted next_page before its final page") &&
      worker.includes("pagination returned next_page after its final page"),
    "missing, extra, or contradictory page cursors must fail closed against explicit metadata",
  );
  assert(
    /const unreadMessages = byMember\.size \? await listUnreadMessages\(\) : \[\]/
      .test(worker) &&
      /countUnreadMessages\([\s\S]*unreadMessages/s.test(worker),
    "one complete unread snapshot must be reused across the claimed member batch",
  );
  assert(
    /if \(!result\.response\.ok \|\| result\.body\.status !== "success"\) \{[\s\S]*throw new Error/
      .test(worker) &&
      /if \(error\) throw new Error\(`Chat report lookup failed:/.test(worker),
    "failed BD or moderation reads must not be converted to authoritative zero",
  );
});

Deno.test("registration changes invalidate stale sends and workers never re-enable opt-outs", async () => {
  const [migration, retryMigration, worker] = await Promise.all([
    Deno.readTextFile(pushMigrationUrl),
    Deno.readTextFile(pushRetryMigrationUrl),
    Deno.readTextFile(pushSweepUrl),
  ]);

  assert(
    /push_registration_generation = old\.push_registration_generation \+ 1[\s\S]*new\.push_claim_token = null[\s\S]*new\.push_claim_expires_at = null/i
      .test(migration),
    "registration or opt-out changes must invalidate the worker's stale lease generation",
  );
  assert(
    worker.includes('"renew_weddingwin_push_claim"') &&
      worker.includes("currentClaimedRows") &&
      worker.includes("push_registration_generation"),
    "the worker must renew and revalidate registration ownership immediately before sends",
  );
  assert(
    !worker.includes("enabled: !deviceNotRegistered") &&
      !worker.includes("enabled: !disable") &&
      /if \(deviceNotRegistered\) update\.enabled = false/.test(worker) &&
      /if \(disable\) update\.enabled = false/.test(worker),
    "delivery errors may disable a dead token but must never re-enable a user opt-out",
  );
  assert(
    worker.includes('errorCode: "ExpoRequestAmbiguous"') &&
      worker.includes('"ExpoTicketResponseAmbiguous"') &&
      worker.includes("const ambiguous = !accepted && !rejected") &&
      worker.includes("scheduleClaimedPushRetry") &&
      worker.includes("delivery.retryAfterMs") &&
      /ambiguousRowIds\.delete\(delivery\.row\.id\)[\s\S]*if \(persisted\) deferred \+= 1/
        .test(
          worker,
        ),
    "uncertain Expo outcomes must persist a delayed retry before their protective lease is released",
  );
  assert(
    /if \(delivery\.accepted \|\| delivery\.ambiguous\)[\s\S]*ambiguousRowIds\.add\(delivery\.row\.id\)[\s\S]*ambiguousRowIds\.delete\(delivery\.row\.id\)/
      .test(worker) &&
      worker.includes("Push evaluation failed for member"),
    "accepted tickets stay retained until persisted and one member failure must not strand the rest of the batch",
  );
  assert(
    worker.includes("const registrationChanged = !live") &&
      worker.includes(
        "Push claim was lost while finalizing a delivery; outcome is ambiguous",
      ),
    "a zero-row finalization may be ignored only for a proven opt-out or registration generation change",
  );
  assert(
    /new\.expo_receipt_expires_at = null[\s\S]*new\.push_retry_count = 0[\s\S]*new\.push_next_attempt_at = null/i
      .test(retryMigration),
    "registration changes must clear all retry and receipt state inherited from the old token",
  );
});

Deno.test("Expo retries use bounded exponential delay and honor Retry-After", () => {
  const nowMs = Date.parse("2026-08-28T12:00:00.000Z");
  assert(
    parseRetryAfterMs("90", nowMs) === 90_000,
    "delta Retry-After must parse",
  );
  assert(
    parseRetryAfterMs("Fri, 28 Aug 2026 12:02:00 GMT", nowMs) === 120_000,
    "HTTP-date Retry-After must parse relative to the response time",
  );
  assert(
    parseRetryAfterMs("not-a-date", nowMs) === undefined,
    "invalid Retry-After must not suppress exponential backoff",
  );

  const first = nextPushRetry(0, nowMs);
  const second = nextPushRetry(first.retryCount, nowMs);
  const bounded = nextPushRetry(16, nowMs);
  const serverDirected = nextPushRetry(0, nowMs, 2 * 60 * 60 * 1000);
  const serverBounded = nextPushRetry(0, nowMs, 48 * 60 * 60 * 1000);
  assert(first.delayMs === 30_000, "first retry must wait 30 seconds");
  assert(second.delayMs === 60_000, "retry delay must grow exponentially");
  assert(
    bounded.delayMs === PUSH_RETRY_MAX_MS,
    "exponential delay must be bounded",
  );
  assert(
    serverDirected.delayMs === 2 * 60 * 60 * 1000,
    "a longer Retry-After must take precedence over local backoff",
  );
  assert(
    serverBounded.delayMs === PUSH_RETRY_AFTER_MAX_MS,
    "even server-directed delay must retain a finite safety bound",
  );
});

Deno.test("push retry state gates claims and missing receipts expire without duplicate resend", async () => {
  const [migration, worker] = await Promise.all([
    Deno.readTextFile(pushRetryMigrationUrl),
    Deno.readTextFile(pushSweepUrl),
  ]);

  assert(
    /add column if not exists push_retry_count integer not null default 0[\s\S]*add column if not exists push_next_attempt_at timestamptz[\s\S]*add column if not exists expo_receipt_expires_at timestamptz/i
      .test(migration),
    "the database must persist retry count, due time, and a finite receipt deadline",
  );
  assert(
    /tokens\.push_next_attempt_at is null[\s\S]*tokens\.push_next_attempt_at <= clock_timestamp\(\)[\s\S]*for update skip locked/i
      .test(migration),
    "a released retry must remain unclaimable until its due time",
  );
  assert(
    /last_expo_ticket_at \+ interval '24 hours'[\s\S]*last_expo_ticket_at \+ interval '15 minutes'/i
      .test(migration),
    "pre-existing accepted tickets must receive both a receipt poll time and an expiry",
  );
  assert(
    /response\.status === 429 \|\| response\.status >= 500/.test(worker) ||
      /status === 429 \|\| status >= 500/.test(worker),
    "HTTP 429 and 5xx responses must be classified as retryable",
  );
  assert(
    worker.includes('response.headers.get("Retry-After")') &&
      worker.includes("nextPushRetry") &&
      worker.includes("push_retry_count: retry.retryCount") &&
      worker.includes("push_next_attempt_at: nextAttemptAt") &&
      worker.includes("retryAtMs > notAfterMs"),
    "the worker must honor Retry-After and persist the computed retry state",
  );
  const expiryBranch = worker.slice(
    worker.indexOf("if (nowMs >= expiresAtMs)"),
    worker.indexOf("const firstReceiptAtMs"),
  );
  assert(
    expiryBranch.includes(
      '"ExpoReceiptExpired: no delivery receipt arrived within 24 hours"',
    ) &&
      expiryBranch.includes("last_expo_ticket_id: null") &&
      !expiryBranch.includes("last_unread_count:"),
    "expired missing receipts must clear the ticket without lowering the accepted unread baseline and duplicating the push",
  );
  assert(
    /if \(receiptRows\.has\(row\.id\)\) continue/.test(worker),
    "a registration awaiting receipt resolution must not send and overwrite its pending ticket",
  );
});

Deno.test("durable unsynced app messages participate in push unread counts", async () => {
  const [migration, worker] = await Promise.all([
    Deno.readTextFile(pushMigrationUrl),
    Deno.readTextFile(pushSweepUrl),
  ]);

  assert(
    /messages\.sender_bd_user_id <> p_bd_member_id[\s\S]*messages\.read_at is null[\s\S]*messages\.bd_synced_at is null/i
      .test(migration),
    "only incoming, unread, not-yet-BD-synced native messages may be counted",
  );
  assert(
    /app_chat_member_blocks[\s\S]*blocks\.status = 'active'[\s\S]*app_chat_thread_reports[\s\S]*reports\.status <> 'resolved'/i
      .test(migration),
    "blocked and unresolved-reported native conversations must remain silent",
  );
  assert(
    worker.includes('"count_weddingwin_unsynced_native_unread"') &&
      worker.includes("const unreadCount = bdUnreadCount + nativeUnreadCount"),
    "the worker must add the durable native count to the website unread count",
  );
  assert(
    /revoke all on function public\.count_weddingwin_unsynced_native_unread\(text\) from authenticated/i
      .test(migration) &&
      /grant execute on function public\.count_weddingwin_unsynced_native_unread\(text\) to service_role/i
        .test(migration),
    "the native unread aggregate must stay behind the service role",
  );
});
