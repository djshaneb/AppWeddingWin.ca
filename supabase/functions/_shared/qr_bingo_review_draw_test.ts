import {
  handleReviewDrawAction,
  REVIEW_DRAW_MODE,
  ReviewDrawError,
} from "./qr_bingo_review_draw.ts";

const fixtureId = "11111111-1111-4111-8111-111111111111";
const drawId = "22222222-2222-4222-8222-222222222222";
const noticeId = "33333333-3333-4333-8333-333333333333";
const member = { user_id: "101", subscription_id: "18", active: "2" };
const state = {
  fixture_id: fixtureId,
  generation: 1,
  role: "couple",
  couple_id: "101",
  vendor_id: "102",
  couple_name: "Alex and Sam",
  vendor_name: "Cedar Floral Studio",
  prize_title: "Sample floral consultation",
  prize_description: "Nonbinding review sample.",
  expires_at: "2099-01-01T00:00:00Z",
  enabled: false,
  scanned: false,
  entered: false,
  draw_id: null,
  selection_status: "none",
  test_notice_id: null,
  test_notice_at: null,
  skill_question_prompt: "What is 3 × 4?",
  disclosure: "Review test only. No real prize, legal agreement or email.",
};
const context = {
  ok: true,
  review_mode: REVIEW_DRAW_MODE,
  review_state: state,
};
const body = { review_mode: REVIEW_DRAW_MODE, expected_generation: 1 };
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected value: ${JSON.stringify(actual)}`);
  }
}
function fakeDb(...responses: unknown[]) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (!responses.length) throw new Error("Unexpected extra RPC");
      return Promise.resolve({ data: responses.shift() });
    },
  };
}
async function denied(
  run: () => Promise<unknown>,
  status: number,
  code?: string,
) {
  try {
    await run();
  } catch (error) {
    if (
      !(error instanceof ReviewDrawError) || error.status !== status ||
      (code && error.code !== code)
    ) throw error;
    return;
  }
  throw new Error("Expected review action rejection");
}
function act(
  db: ReturnType<typeof fakeDb>,
  action: string,
  data: Record<string, unknown> = body,
) {
  return handleReviewDrawAction(db, "101", member, action, data);
}

Deno.test("unverified identity never queries review state", async () => {
  const db = fakeDb();
  await denied(
    () =>
      handleReviewDrawAction(
        db,
        "101",
        { ...member, user_id: "102" },
        "review_draw_context",
        {},
      ),
    401,
  );
  await denied(
    () =>
      handleReviewDrawAction(db, "invalid", member, "review_draw_context", {}),
    401,
  );
  equal(db.calls.length, 0);
});
Deno.test("ordinary accounts retain legacy behavior but cannot enable review mode with request flags", async () => {
  const ordinary = { ok: true, review_mode: null };
  equal(await act(fakeDb(ordinary), "scan"), null);
  equal(await act(fakeDb(ordinary), "fixture_context"), null);
  equal(await act(fakeDb(ordinary), "review_draw_context"), ordinary);
  const db = fakeDb(ordinary);
  await denied(
    () =>
      act(db, "review_draw_entry", {
        ...body,
        fixture_id: fixtureId,
        enter: true,
      }),
    403,
  );
  equal(db.calls.length, 1);
});
Deno.test("expired or revoked review pairs cannot fall through to a production action", async () => {
  const db = fakeDb({
    ok: false,
    status: 403,
    code: "review_expired",
    error: "Unavailable.",
  });
  await denied(() => act(db, "raffle_opt_in"), 403, "review_expired");
  equal(db.calls.length, 1);
});
Deno.test("review context sanitizes service data and supports the existing fixture discovery action", async () => {
  const privateContext = {
    ...context,
    private_operator_note: "exclude",
    review_state: { ...state, email: "exclude" },
  };
  equal(await act(fakeDb(privateContext), "review_draw_context", {}), context);
  equal(await act(fakeDb(privateContext), "fixture_context", {}), context);
});
Deno.test("fresh BD role changes revoke pair access and private vendor plan39 is supported", async () => {
  for (
    const changed of [{ ...member, subscription_id: "39" }, {
      ...member,
      active: "1",
    }]
  ) {
    await denied(
      () =>
        handleReviewDrawAction(
          fakeDb(context),
          "101",
          changed,
          "review_draw_context",
          {},
        ),
      403,
      "review_role_changed",
    );
  }
  const vendorContext = {
    ...context,
    review_state: { ...state, role: "vendor" },
  };
  equal(
    await handleReviewDrawAction(
      fakeDb(vendorContext),
      "102",
      { user_id: "102", subscription_id: "39", active: "2" },
      "review_draw_context",
      {},
    ),
    vendorContext,
  );
});
Deno.test("malformed server contexts fail closed before any mutation", async () => {
  for (
    const change of [
      { generation: 0 },
      { generation: 1.5 },
      { role: "admin" },
      { couple_id: "102" },
      { vendor_id: "outside" },
      { enabled: "true" },
      { expires_at: "2000-01-01" },
      { selection_status: "potential", draw_id: null },
      { test_notice_id: noticeId, test_notice_at: null },
      { entered: true, scanned: false },
    ]
  ) {
    const db = fakeDb({ ...context, review_state: { ...state, ...change } });
    await denied(
      () => act(db, "review_draw_entry", { ...body, enter: true }),
      503,
    );
    equal(db.calls.length, 1);
  }
});
Deno.test("known review pairs require isolated action, mode and positive integer generation", async () => {
  await denied(
    () => act(fakeDb(context), "raffle_opt_in"),
    403,
    "review_action_required",
  );
  await denied(
    () => act(fakeDb(context), "review_draw_entry", { enter: true }),
    400,
    "review_mode_required",
  );
  for (const generation of [0, -1, 1.5, "1", undefined]) {
    const db = fakeDb(context);
    await denied(
      () =>
        act(db, "review_draw_entry", {
          ...body,
          expected_generation: generation,
          enter: true,
        }),
      400,
      "invalid_review_generation",
    );
    equal(db.calls.length, 1);
  }
});
Deno.test("entry projects only an explicit Yes or No and cannot forward real consent or forged identities", async () => {
  for (const enter of [false, true]) {
    const db = fakeDb(context, context);
    await act(db, "review_draw_entry", {
      ...body,
      enter,
      member_id: "999",
      vendor_id: "999",
      consent_share_contact: true,
      rules_accepted: true,
    });
    equal(db.calls[1], {
      name: "perform_weddingwin_review_draw_action",
      args: {
        p_member_id: "101",
        p_action: "review_draw_entry",
        p_expected_generation: 1,
        p_payload: { enter },
      },
    });
  }
});
Deno.test("verification and Send use narrow RPC payloads without email, winner or delivery fields", async () => {
  const db = fakeDb(context, context);
  await act(db, "review_draw_verify", {
    ...body,
    checks_confirmed: true,
    skill_answer: "12",
    winner_email: "exclude",
    sent_at: "exclude",
  });
  equal(db.calls[1].args.p_payload, {
    checks_confirmed: true,
    skill_answer: "12",
  });
  const sendDb = fakeDb(context, context);
  await act(sendDb, "review_draw_send", {
    ...body,
    send_email: true,
    recipient_member_id: "999",
  });
  equal(sendDb.calls[1].args.p_payload, {});
});
Deno.test("stale generation and failed service calls do not claim success or disclose raw diagnostics", async () => {
  await denied(
    () =>
      act(
        fakeDb(context, {
          ok: false,
          code: "review_generation_changed",
          status: 409,
          error: "Reload.",
        }),
        "review_draw_reset",
      ),
    409,
    "review_generation_changed",
  );
  for (
    const db of [
      {
        rpc: () =>
          Promise.resolve({ error: { message: "private SQL diagnostic" } }),
      },
      {
        rpc: () => {
          throw new Error("private SQL diagnostic");
        },
      },
    ]
  ) {
    try {
      await handleReviewDrawAction(
        db,
        "101",
        member,
        "review_draw_context",
        {},
      );
    } catch (error) {
      if (
        !(error instanceof ReviewDrawError) || error.status !== 503 ||
        error.message.includes("private")
      ) throw error;
      continue;
    }
    throw new Error("Expected closed failure");
  }
});
const timestamp = "2026-09-15T22:00:00+00:00";
const resultState = {
  ...state,
  enabled: true,
  scanned: true,
  entered: true,
  draw_id: drawId,
  selection_status: "verified",
  test_notice_id: noticeId,
  test_notice_at: timestamp,
};
const result = {
  review_mode: REVIEW_DRAW_MODE,
  notice_id: noticeId,
  review_notice_id: noticeId,
  draw_id: drawId,
  generation: 1,
  viewer_role: "couple",
  notice_created_at: timestamp,
  review_state: resultState,
};
Deno.test("result access authenticates notice recipient and returns the direct sanitized envelope", async () => {
  const db = fakeDb(context, {
    ...result,
    internal_recipient_email: "exclude",
  });
  const answer = await act(db, "review_draw_result_get", {
    ...body,
    review_notice_id: noticeId,
    recipient_member_id: "102",
  });
  equal(db.calls[1], {
    name: "read_weddingwin_review_draw_notice",
    args: { p_member_id: "101", p_notice_id: noticeId },
  });
  equal(answer, {
    ok: true,
    review_mode: REVIEW_DRAW_MODE,
    review_state: resultState,
    notice_id: noticeId,
    review_notice_id: noticeId,
    draw_id: drawId,
    generation: 1,
    viewer_role: "couple",
    notice_created_at: timestamp,
  });
  await denied(
    () =>
      act(fakeDb(context, null), "review_draw_result_get", {
        ...body,
        review_notice_id: noticeId,
      }),
    404,
  );
});
Deno.test("malformed or mixed-generation result cannot open a review notification destination", async () => {
  await denied(
    () =>
      act(fakeDb(context), "review_draw_result_get", {
        ...body,
        review_notice_id: "invalid",
      }),
    400,
  );
  for (
    const change of [
      { viewer_role: "vendor" },
      { generation: 2 },
      { draw_id: fixtureId },
      { notice_created_at: "invalid" },
      { notice_id: fixtureId },
      { review_state: { ...resultState, test_notice_id: fixtureId } },
      { review_state: { ...resultState, selection_status: "potential" } },
    ]
  ) {
    await denied(
      () =>
        act(
          fakeDb(context, { ...result, ...change }),
          "review_draw_result_get",
          {
            ...body,
            review_notice_id: noticeId,
          },
        ),
      503,
    );
  }
});
