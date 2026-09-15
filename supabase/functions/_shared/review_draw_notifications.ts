// Review push access is pinned to one explicit current device registration.
// The caller must already have verified the ordinary native session and member.
export class ReviewDrawNotificationError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ReviewDrawNotificationError";
  }
}

export async function setReviewDrawPushEnabled(
  db: any,
  memberId: string,
  body: Record<string, unknown>,
) {
  if (!/^[1-9][0-9]{0,17}$/.test(memberId)) {
    throw new ReviewDrawNotificationError(401, "native_session_expired", "Please sign in again.");
  }
  const token = body.expo_push_token;
  if (body.review_mode !== "nonbinding_draw_v1" ||
    !Number.isSafeInteger(body.expected_generation) || Number(body.expected_generation) < 1 ||
    typeof body.enabled !== "boolean" || typeof token !== "string" ||
    token.length > 500 || !/^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(token)) {
    throw new ReviewDrawNotificationError(400, "invalid_review_push_request", "A current review device registration is required.");
  }
  let response;
  try {
    response = await db.rpc("set_weddingwin_review_draw_push", {
      p_member_id: memberId,
      p_expected_generation: body.expected_generation,
      p_expo_push_token: token,
      p_enabled: body.enabled,
    });
  } catch {
    throw new ReviewDrawNotificationError(503, "review_push_unavailable", "Test notification settings are temporarily unavailable.");
  }
  if (response?.error) {
    throw new ReviewDrawNotificationError(503, "review_push_unavailable", "Test notification settings are temporarily unavailable.");
  }
  const result = response?.data;
  if (!result || result.ok !== true || result.review_mode !== "nonbinding_draw_v1" ||
    result.review_push_enabled !== body.enabled) {
    throw new ReviewDrawNotificationError(409, "review_device_unavailable", "Reload the review test and register this device again.");
  }
  return { ok: true, review_mode: "nonbinding_draw_v1", review_push_enabled: result.review_push_enabled };
}
