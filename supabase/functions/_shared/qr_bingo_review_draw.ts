// Nonbinding App Review workflow. Only service-owned account allowlists activate
// this branch; a request flag can never grant review access or production consent.
export const REVIEW_DRAW_MODE = "nonbinding_draw_v1";
export class ReviewDrawError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ReviewDrawError";
  }
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mutationActions = new Set([
  "review_draw_enable",
  "review_draw_scan",
  "review_draw_entry",
  "review_draw_select",
  "review_draw_verify",
  "review_draw_send",
  "review_draw_reset",
]);
const stateFields = [
  "fixture_id",
  "generation",
  "role",
  "couple_id",
  "vendor_id",
  "couple_name",
  "vendor_name",
  "prize_title",
  "prize_description",
  "expires_at",
  "enabled",
  "scanned",
  "entered",
  "draw_id",
  "selection_status",
  "test_notice_id",
  "test_notice_at",
  "skill_question_prompt",
  "disclosure",
];
type ReviewMember = {
  user_id?: unknown;
  active?: unknown;
  subscription_id?: unknown;
};
type ReviewDb = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data?: unknown; error?: unknown }>;
};
type JsonRecord = Record<string, unknown>;
function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validState(value: unknown, memberId: string): value is JsonRecord {
  if (!record(value)) return false;
  const role = value.role;
  return (role === "couple" || role === "vendor") &&
    value[role === "couple" ? "couple_id" : "vendor_id"] === memberId &&
    typeof value.couple_id === "string" &&
    /^[1-9][0-9]{0,17}$/.test(value.couple_id) &&
    typeof value.vendor_id === "string" &&
    /^[1-9][0-9]{0,17}$/.test(value.vendor_id) &&
    value.couple_id !== value.vendor_id &&
    typeof value.fixture_id === "string" && uuid.test(value.fixture_id) &&
    Number.isSafeInteger(value.generation) && Number(value.generation) >= 1 &&
    ["enabled", "scanned", "entered"].every((key) =>
      typeof value[key] === "boolean"
    ) &&
    [
      "couple_name",
      "vendor_name",
      "prize_title",
      "prize_description",
      "disclosure",
      "skill_question_prompt",
    ].every((key) => typeof value[key] === "string") &&
    typeof value.expires_at === "string" &&
    Date.parse(value.expires_at) > Date.now() &&
    ["none", "potential", "verified"].includes(
      String(value.selection_status),
    ) &&
    (value.draw_id === null ||
      (typeof value.draw_id === "string" && uuid.test(value.draw_id))) &&
    (value.test_notice_id === null ||
      (typeof value.test_notice_id === "string" &&
        uuid.test(value.test_notice_id))) &&
    (value.test_notice_at === null ||
      (typeof value.test_notice_at === "string" &&
        Number.isFinite(Date.parse(value.test_notice_at)))) &&
    (value.selection_status === "none") === (value.draw_id === null) &&
    (value.test_notice_id === null) === (value.test_notice_at === null) &&
    (value.test_notice_id === null || value.selection_status === "verified") &&
    (!value.entered || value.scanned === true);
}
function stateResponse(value: JsonRecord) {
  return {
    ok: true,
    review_mode: REVIEW_DRAW_MODE,
    review_state: Object.fromEntries(
      stateFields.map((key) => [key, (value.review_state as JsonRecord)[key]]),
    ),
  };
}
async function reviewRpc(
  db: ReviewDb,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let result;
  try {
    result = await db.rpc(name, args);
  } catch {
    throw new ReviewDrawError(
      503,
      "review_unavailable",
      "Review testing is temporarily unavailable.",
    );
  }
  if (result.error) {
    throw new ReviewDrawError(
      503,
      "review_unavailable",
      "Review testing is temporarily unavailable.",
    );
  }
  if (record(result.data) && result.data.ok === false) {
    const statuses = [400, 401, 403, 404, 409];
    throw new ReviewDrawError(
      statuses.includes(Number(result.data.status))
        ? Number(result.data.status)
        : 503,
      typeof result.data.code === "string"
        ? result.data.code
        : "review_unavailable",
      typeof result.data.error === "string"
        ? result.data.error
        : "Review testing is unavailable.",
    );
  }
  return result.data;
}
function validateMemberRole(member: ReviewMember, state: JsonRecord) {
  const couple = ["4", "18"].includes(String(member.subscription_id));
  const correctRole = state.role === "couple"
    ? couple && String(member.active) === "2"
    : !couple && /^[1-9][0-9]*$/.test(String(member.subscription_id)) &&
      ["1", "2"].includes(String(member.active));
  if (!correctRole) {
    throw new ReviewDrawError(
      403,
      "review_role_changed",
      "This review account is no longer available for its assigned role.",
    );
  }
}
/** Called only after native session/signature and fresh BD identity validation. */
export async function handleReviewDrawAction(
  db: ReviewDb,
  authenticatedMemberId: string,
  member: ReviewMember,
  action: string,
  body: JsonRecord,
): Promise<JsonRecord | null> {
  if (
    !/^[1-9][0-9]{0,17}$/.test(authenticatedMemberId) ||
    String(member.user_id) !== authenticatedMemberId
  ) {
    throw new ReviewDrawError(
      401,
      "review_session_required",
      "Sign in to the review account.",
    );
  }
  // Reading context even for legacy actions prevents an expired/revoked review
  // account from falling through into a real event or real acceptance flow.
  const context = await reviewRpc(db, "perform_weddingwin_review_draw_action", {
    p_member_id: authenticatedMemberId,
    p_action: "review_draw_context",
    p_expected_generation: null,
    p_payload: {},
  });
  if (!record(context) || context.ok !== true) {
    throw new ReviewDrawError(
      503,
      "review_unavailable",
      "Review context could not be verified.",
    );
  }
  if (context.review_mode === null) {
    if (action === "review_draw_context") {
      return { ok: true, review_mode: null };
    }
    if (action.startsWith("review_draw_")) {
      throw new ReviewDrawError(
        403,
        "review_unavailable",
        "This account has no active review draw.",
      );
    }
    return null;
  }
  if (
    context.review_mode !== REVIEW_DRAW_MODE ||
    !validState(context.review_state, authenticatedMemberId)
  ) {
    throw new ReviewDrawError(
      503,
      "review_unavailable",
      "Review context could not be verified.",
    );
  }
  validateMemberRole(member, context.review_state);
  if (action === "fixture_context" || action === "review_draw_context") {
    return stateResponse(context);
  }
  if (body.review_mode !== REVIEW_DRAW_MODE) {
    throw new ReviewDrawError(
      400,
      "review_mode_required",
      "Use the isolated review draw controls.",
    );
  }
  if (action === "review_draw_result_get") {
    if (
      typeof body.review_notice_id !== "string" ||
      !uuid.test(body.review_notice_id)
    ) {
      throw new ReviewDrawError(
        400,
        "invalid_review_notice",
        "A valid review notification is required.",
      );
    }
    const result = await reviewRpc(db, "read_weddingwin_review_draw_notice", {
      p_member_id: authenticatedMemberId,
      p_notice_id: body.review_notice_id,
    });
    if (result === null) {
      throw new ReviewDrawError(
        404,
        "review_result_unavailable",
        "This review result is no longer available.",
      );
    }
    if (
      !record(result) || result.review_mode !== REVIEW_DRAW_MODE ||
      result.notice_id !== body.review_notice_id ||
      !validState(result.review_state, authenticatedMemberId) ||
      result.viewer_role !== result.review_state.role ||
      result.generation !== result.review_state.generation ||
      result.draw_id !== result.review_state.draw_id ||
      result.review_state.selection_status !== "verified" ||
      result.notice_id !== result.review_state.test_notice_id ||
      typeof result.notice_created_at !== "string" ||
      !Number.isFinite(Date.parse(result.notice_created_at)) ||
      result.notice_created_at !== result.review_state.test_notice_at
    ) {
      throw new ReviewDrawError(
        503,
        "review_unavailable",
        "The review result could not be verified.",
      );
    }
    return {
      ...stateResponse(result),
      notice_id: result.notice_id,
      review_notice_id: result.notice_id,
      draw_id: result.draw_id,
      generation: result.generation,
      viewer_role: result.viewer_role,
      notice_created_at: result.notice_created_at,
    };
  }
  if (!mutationActions.has(action)) {
    throw new ReviewDrawError(
      403,
      "review_action_required",
      "Use the isolated review draw controls for this account.",
    );
  }
  if (
    !Number.isSafeInteger(body.expected_generation) ||
    Number(body.expected_generation) < 1
  ) {
    throw new ReviewDrawError(
      400,
      "invalid_review_generation",
      "Reload this review draw before continuing.",
    );
  }
  const payload: JsonRecord = {};
  if (action === "review_draw_enable") payload.enabled = body.enabled;
  if (action === "review_draw_scan") payload.vendor_id = body.vendor_id;
  if (action === "review_draw_entry") payload.enter = body.enter;
  if (action === "review_draw_verify") {
    payload.checks_confirmed = body.checks_confirmed;
    payload.skill_answer = body.skill_answer;
  }
  const result = await reviewRpc(db, "perform_weddingwin_review_draw_action", {
    p_member_id: authenticatedMemberId,
    p_action: action,
    p_expected_generation: body.expected_generation,
    p_payload: payload,
  });
  if (
    !record(result) || result.ok !== true ||
    result.review_mode !== REVIEW_DRAW_MODE ||
    !validState(result.review_state, authenticatedMemberId)
  ) {
    throw new ReviewDrawError(
      503,
      "review_unavailable",
      "The review action could not be verified. Reload before trying again.",
    );
  }
  return stateResponse(result);
}
