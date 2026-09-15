import { buildNotificationPayload } from "./notification_events.ts";
import { ReviewDrawNotificationError, setReviewDrawPushEnabled } from "./review_draw_notifications.ts";

const now = Date.parse("2026-09-15T22:00:00Z");
const id = "11111111-1111-4111-8111-111111111111";
const noticeId = "22222222-2222-4222-8222-222222222222";
const base = { id, recipient_member_id: "101", expires_at: "2026-09-16T22:00:00Z", review_notice_id: noticeId };
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Values differ");
}
async function denied(run: () => Promise<unknown>, status: number) {
  try { await run(); } catch (e) {
    if (!(e instanceof ReviewDrawNotificationError) || e.status !== status) throw e;
    return;
  }
  throw new Error("Expected request rejection");
}
function invalid(run: () => unknown) {
  try { run(); } catch { return; }
  throw new Error("Expected payload rejection");
}
Deno.test("review notifications have explicit test copy and only authenticated review destinations", () => {
  for (const type of ["review_draw_result", "review_vendor_follow_up"] as const) {
    const payload = buildNotificationPayload({ ...base, type }, now);
    equal(payload.body, "Review test only. No real prize or email.");
    equal(payload.data, { v: 1, event_id: id, recipient_member_id: "101",
      expires_at: "2026-09-16T22:00:00.000Z", screen: "review_draw_result",
      review_mode: "nonbinding_draw_v1", review_notice_id: noticeId });
    if (!payload.title.startsWith("Test ")) throw new Error("Missing test label");
  }
});
Deno.test("review routing rejects malformed, expired and mixed production identities", () => {
  invalid(() => buildNotificationPayload({ ...base, type: "review_draw_result", review_notice_id: "invalid" }, now));
  invalid(() => buildNotificationPayload({ ...base, type: "review_draw_result", draw_id: id }, now));
  invalid(() => buildNotificationPayload({ ...base, type: "review_draw_result", thread_token: "thread" }, now));
  invalid(() => buildNotificationPayload({ ...base, type: "review_draw_result", recipient_member_id: "not-a-member" }, now));
  invalid(() => buildNotificationPayload({ ...base, type: "review_draw_result", expires_at: "2026-09-14T22:00:00Z" }, now));
  invalid(() => buildNotificationPayload({ ...base, type: "draw_result", draw_id: id }, now));
});
const body = { review_mode: "nonbinding_draw_v1", expected_generation: 2,
  expo_push_token: "ExpoPushToken[controlled-test-device]", enabled: true };
Deno.test("explicit review opt-in passes only the authenticated identity and exact registration to RPC", async () => {
  let called = 0;
  const db = { rpc(name: string, args: unknown) {
    called++;
    equal(name, "set_weddingwin_review_draw_push");
    equal(args, { p_member_id: "101", p_expected_generation: 2,
      p_expo_push_token: body.expo_push_token, p_enabled: true });
    return Promise.resolve({ data: { ok: true, review_mode: body.review_mode, review_push_enabled: true,
      secret_extra: "must never be forwarded" } });
  } };
  equal(await setReviewDrawPushEnabled(db, "101", { ...body, member_id: "999", device_id: "forged" }),
    { ok: true, review_mode: body.review_mode, review_push_enabled: true });
  equal(called, 1);
});
Deno.test("invalid requests never call the database", async () => {
  const db = { rpc() { throw new Error("Unexpected database call"); } };
  await denied(() => setReviewDrawPushEnabled(db, "invalid", body), 401);
  for (const change of [
    { review_mode: "production" }, { expected_generation: -1 }, { expected_generation: 0 }, { expected_generation: 1.5 },
    { enabled: "true" }, { expo_push_token: "wrong" }, { expo_push_token: "ExpoPushToken[with spaces]" },
  ]) await denied(() => setReviewDrawPushEnabled(db, "101", { ...body, ...change }), 400);
});
Deno.test("stale registration, unavailable service and foreign acknowledgements never claim success", async () => {
  await denied(() => setReviewDrawPushEnabled({ rpc: () => ({ data: null }) }, "101", body), 409);
  await denied(() => setReviewDrawPushEnabled({ rpc: () => ({ data: { ok: true, review_mode: "production", review_push_enabled: true } }) }, "101", body), 409);
  await denied(() => setReviewDrawPushEnabled({ rpc: () => ({ data: { ok: true, review_mode: body.review_mode, review_push_enabled: false } }) }, "101", body), 409);
  await denied(() => setReviewDrawPushEnabled({ rpc: () => ({ error: { message: "private diagnostic" } }) }, "101", body), 503);
  await denied(() => setReviewDrawPushEnabled({ rpc: () => { throw new Error("private diagnostic"); } }, "101", body), 503);
});
Deno.test("explicit disable is acknowledged without a notification send", async () => {
  const db = { rpc(_name: string, args: Record<string, unknown>) {
    equal(args.p_enabled, false);
    return { data: { ok: true, review_mode: body.review_mode, review_push_enabled: false } };
  } };
  equal(await setReviewDrawPushEnabled(db, "101", { ...body, enabled: false }),
    { ok: true, review_mode: body.review_mode, review_push_enabled: false });
});
