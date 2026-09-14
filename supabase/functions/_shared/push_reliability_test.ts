import {
  nextPushRetry,
  parseRetryAfterMs,
  PUSH_RETRY_AFTER_MAX_MS,
  PUSH_RETRY_MAX_MS,
} from "./push_retry.ts";
import { listBdRowsPaginated } from "./bd_push_pagination.ts";
import {
  buildMessageSnapshot,
  buildNotificationPayload,
} from "./notification_events.ts";
import {
  requestExpoPush,
  requestExpoReceipt,
} from "./notification_delivery.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

// These execute behavior across the production helpers. Worker orchestration
// (including generation fencing and partial batch release) is executed in
// scripts/test-notification-worker.mjs; SQL transaction/role behavior belongs
// in the durable notification migration tests. Retired unread-count source
// regex assertions must not silently stand in for those runtime checks.
Deno.test("Expo retries use bounded exponential delay and honor Retry-After", () => {
  const nowMs = Date.parse("2026-08-28T12:00:00.000Z");
  assert(
    parseRetryAfterMs("90", nowMs) === 90_000,
    "delta Retry-After must parse",
  );
  assert(
    parseRetryAfterMs("Fri, 28 Aug 2026 12:02:00 GMT", nowMs) === 120_000,
    "HTTP-date Retry-After must parse relative to response time",
  );
  assert(
    parseRetryAfterMs("not-a-date", nowMs) === undefined,
    "invalid Retry-After must not suppress exponential backoff",
  );
  const first = nextPushRetry(0, nowMs);
  const second = nextPushRetry(first.retryCount, nowMs);
  assert(first.delayMs === 30_000, "first retry must wait 30 seconds");
  assert(second.delayMs === 60_000, "retry delay must grow exponentially");
  assert(
    nextPushRetry(16, nowMs).delayMs === PUSH_RETRY_MAX_MS,
    "exponential delay must remain bounded",
  );
  assert(
    nextPushRetry(0, nowMs, 2 * 60 * 60 * 1000).delayMs === 2 * 60 * 60 * 1000,
    "longer Retry-After must win",
  );
  assert(
    nextPushRetry(0, nowMs, 48 * 60 * 60 * 1000).delayMs ===
      PUSH_RETRY_AFTER_MAX_MS,
    "server delay must retain a finite bound",
  );
});

const now = Date.parse("2026-09-14T20:00:00Z");
const thread = "0123456789abcdef0123456789abcdef";
const id = "11111111-1111-4111-8111-111111111111";
async function completeFixture(corrupt = false) {
  return await listBdRowsPaginated(
    async () => ({
      response: { ok: true, status: 200 },
      body: {
        status: "success",
        current_page: 1,
        total_pages: 1,
        total: corrupt ? 2 : 1,
        next_page: "opaque-phantom-final-cursor",
        message: [{
          message_id: "9",
          thread_token: thread,
          message_owner: "2",
          message_status: "0",
          created_at: "20260914155900",
        }],
      },
    }),
    "chat_message_items",
    {},
    { idField: "message_id" },
  );
}
function snapshot(rows: Record<string, unknown>[]) {
  return buildMessageSnapshot({
    memberId: "1",
    memberTokens: [],
    bdThreads: [{
      thread_token: thread,
      thread_owner: "1",
      thread_responders: "2",
      owner_user_id: "1",
      responder_user_id: "2",
    }],
    bdMessages: rows,
    nativeThreads: [],
    nativeMessages: [],
    blockedMemberIds: [],
    reportedThreadTokens: [],
    nowMs: now,
  });
}

Deno.test("complete BD phantom-final-cursor snapshot can produce a routed Expo ticket and receipt", async () => {
  const events = snapshot(await completeFixture());
  assert(
    events.events.length === 1 && events.unreadCount === 1,
    "valid complete snapshot must survive the formerly rejected phantom cursor",
  );
  const content = buildNotificationPayload({
    id,
    type: "chat_message",
    recipient_member_id: "1",
    thread_token: events.events[0].thread_token,
    expires_at: "2026-09-15T20:00:00Z",
  }, now);
  let sends = 0, receiptQueries = 0;
  const fetcher: typeof fetch = (request, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(request).endsWith("/push/send")) {
      sends++;
      assert(
        Array.isArray(body) && body.length === 1,
        "one event/device must reserve one send",
      );
      assert(
        body[0].data.event_id === id &&
          body[0].data.recipient_member_id === "1" &&
          body[0].data.thread_token === thread,
        "account and target binding must survive transport",
      );
      return Promise.resolve(
        Response.json({ data: [{ status: "ok", id: "accepted-ticket" }] }),
      );
    }
    receiptQueries++;
    assert(
      body.ids[0] === "accepted-ticket",
      "poll only the saved accepted ticket",
    );
    return Promise.resolve(
      Response.json({ data: { "accepted-ticket": { status: "ok" } } }),
    );
  };
  const ticket = await requestExpoPush(
    {
      to: "ExponentPushToken[fixture]",
      sound: "default",
      badge: events.unreadCount,
      ...content,
    },
    {},
    fetcher,
  );
  assert(
    ticket.status === "ticketed",
    "accepted transport response is not yet a delivery receipt",
  );
  const receipt = await requestExpoReceipt(ticket.ticketId!, {}, fetcher);
  assert(
    receipt.status === "delivered" && sends === 1 && receiptQueries === 1,
    "receipt lookup must not resend the event",
  );
});

Deno.test("a partial website snapshot fails before notification content or transport is used", async () => {
  let downstreamCalls = 0, rejected = false;
  try {
    snapshot(await completeFixture(true));
    downstreamCalls++;
  } catch {
    rejected = true;
  }
  assert(
    rejected && downstreamCalls === 0,
    "partial data cannot become an authoritative seen baseline",
  );
});

Deno.test("ambiguous network outcome is terminal for sends, while receipt failures stay queryable", async () => {
  const unavailable: typeof fetch = () =>
    Promise.reject(new TypeError("network unavailable"));
  const send = await requestExpoPush({ to: "fixture" }, {}, unavailable);
  assert(
    send.status === "ambiguous",
    "uncertain send must not auto-retry and duplicate an alert",
  );
  const receipt = await requestExpoReceipt("already-accepted", {}, unavailable);
  assert(
    receipt.status === "ticketed" && receipt.ticketId === "already-accepted",
    "a failed read cannot erase an accepted ticket or request another send",
  );
});

Deno.test("definitive rate rejection carries Retry-After into bounded retry scheduling", async () => {
  const fetcher: typeof fetch = () =>
    Promise.resolve(
      Response.json({}, { status: 429, headers: { "Retry-After": "90" } }),
    );
  const result = await requestExpoPush({ to: "fixture" }, {}, fetcher);
  assert(
    result.status === "retry",
    "definitive rate rejection is safe to retry",
  );
  const retry = nextPushRetry(0, now, result.retryAfterMs);
  assert(
    retry.delayMs === 90_000 &&
      retry.nextAttemptAt === "2026-09-14T20:01:30.000Z",
    "server-directed delay must reach durable retry scheduling",
  );
});
