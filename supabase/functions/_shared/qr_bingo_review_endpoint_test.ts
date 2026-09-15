import {
  handleReviewDrawAction,
  REVIEW_DRAW_MODE,
  ReviewDrawError,
} from "./qr_bingo_review_draw.ts";
import {
  ReviewDrawNotificationError,
  setReviewDrawPushEnabled,
} from "./review_draw_notifications.ts";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function assert(value: unknown, message = "Assertion failed") {
  if (!value) throw new Error(message);
}
const vendor = { user_id: "102", subscription_id: "39", active: "2" };
const state = {
  fixture_id: "11111111-1111-4111-8111-111111111111",
  generation: 1,
  role: "vendor",
  couple_id: "101",
  vendor_id: "102",
  couple_name: "Alex and Sam",
  vendor_name: "Cedar Floral Studio",
  prize_title: "Sample consultation",
  prize_description: "Nonbinding sample",
  expires_at: "2099-01-01T00:00:00Z",
  enabled: false,
  scanned: false,
  entered: false,
  draw_id: null,
  selection_status: "none",
  test_notice_id: null,
  test_notice_at: null,
  skill_question_prompt: "What is 3 × 4?",
  disclosure: "Review test only.",
};
const context = {
  ok: true,
  review_mode: REVIEW_DRAW_MODE,
  review_state: state,
};

for (const endpoint of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
  Deno.test(`${endpoint}: authenticated review dispatcher isolates actions before production workflow`, async () => {
    const source = await Deno.readTextFile(
      new URL(`../${endpoint}/index.ts`, import.meta.url),
    );
    const start = source.indexOf("const freshAuthenticatedUser =");
    const end = source.indexOf('if (action === "fixture_context")', start);
    assert(
      start >
          source.indexOf(
            "if (!await nativeSessionMatchesCachedBdIdentity(nativeSession))",
          ) && end > start,
    );
    const dispatch = new AsyncFunction(
      "websiteCoupleUser",
      "fetchFullBdUserById",
      "authenticatedMemberId",
      "action",
      "body",
      "requireAdmin",
      "handleReviewDrawAction",
      "ReviewDrawError",
      "REVIEW_DRAW_MODE",
      "setReviewDrawPushEnabled",
      "ReviewDrawNotificationError",
      "jsonResponse",
      source.slice(start, end) + "\nreturn { productionFallback: true };",
    );
    async function invoke(
      action: string,
      responses: unknown[],
      request: Record<string, unknown> = {},
      freshUser: unknown = vendor,
    ) {
      const trace: string[] = [];
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const db = {
        rpc(name: string, args: Record<string, unknown>) {
          trace.push("rpc");
          calls.push({ name, args });
          assert(responses.length, "Unexpected extra database call");
          return Promise.resolve({ data: responses.shift() });
        },
      };
      const result = await dispatch(
        undefined,
        async (id: string) => {
          trace.push("fresh_identity");
          assert(id === "102");
          return freshUser;
        },
        "102",
        action,
        request,
        () => db,
        handleReviewDrawAction,
        ReviewDrawError,
        REVIEW_DRAW_MODE,
        setReviewDrawPushEnabled,
        ReviewDrawNotificationError,
        (body: unknown, status: number, participationGate: boolean) => ({
          body,
          status,
          participationGate,
        }),
      );
      return { result, calls, trace };
    }
    const ordinary = await invoke("vendor_raffle_get", [{
      ok: true,
      review_mode: null,
    }]);
    assert(ordinary.result.productionFallback === true);
    assert(ordinary.trace.join(",") === "fresh_identity,rpc");
    const enabled = await invoke("review_draw_enable", [context, {
      ...context,
      review_state: { ...state, enabled: true },
    }], {
      review_mode: REVIEW_DRAW_MODE,
      expected_generation: 1,
      enabled: true,
    });
    assert(
      enabled.result.status === 200 &&
        enabled.result.body.review_state.enabled === true,
    );
    assert(
      enabled.result.participationGate === false,
      "Review must not invent or require production consent",
    );
    assert(
      enabled.calls.length === 2 && enabled.calls[1].args.p_member_id === "102",
    );
    const rejected = await invoke("vendor_raffle_draw", [context], {
      review_mode: REVIEW_DRAW_MODE,
    });
    assert(
      rejected.result.status === 403 &&
        rejected.result.body.code === "review_action_required",
    );
    assert(rejected.calls.length === 1 && !rejected.result.productionFallback);
    const changed = await invoke("review_draw_context", [], {}, {
      ...vendor,
      user_id: "999",
    });
    assert(changed.result.status === 401 && changed.calls.length === 0);
    const optedIn = await invoke("review_draw_push_enable", [context, {
      ok: true,
      review_mode: REVIEW_DRAW_MODE,
      review_push_enabled: true,
    }], {
      review_mode: REVIEW_DRAW_MODE,
      expected_generation: 1,
      enabled: true,
      expo_push_token: "ExpoPushToken[offline-test]",
    });
    assert(
      optedIn.result.status === 200 &&
        optedIn.result.body.review_push_enabled === true,
    );
    assert(optedIn.calls[1].name === "set_weddingwin_review_draw_push");
    const forged = await invoke("review_draw_push_enable", [{
      ok: true,
      review_mode: null,
    }], {
      review_mode: REVIEW_DRAW_MODE,
      expected_generation: 1,
      enabled: true,
      expo_push_token: "ExpoPushToken[offline-test]",
    });
    assert(forged.result.status === 403 && forged.calls.length === 1);
  });
}
