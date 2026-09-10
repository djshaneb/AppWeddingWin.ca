export class QrAdminDrawResetError extends Error {
  constructor(
    message: string,
    public status = 422,
    public code = "invalid_draw_reset",
    public current_generation?: number,
  ) {
    super(message);
  }
}
const allowed = new Set([
  "action",
  "dataset",
  "event_key",
  "vendor_id",
  "draw_id",
  "expected_generation",
  "request_id",
  "operator_identity",
  "reason",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function plain(value: unknown, min: number, max: number): string {
  if (
    typeof value !== "string" || value !== value.trim() || value.length < min ||
    value.length > max || /[<>\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new QrAdminDrawResetError(
      "Add a valid operator and reason, then reload the exact draw before resetting.",
    );
  }
  return value;
}
export function parseQrAdminDrawReset(body: Record<string, unknown>) {
  if (
    Object.keys(body).some((key) => !allowed.has(key)) ||
    body.action !== "draw_reset" || body.dataset !== "winners"
  ) {
    throw new QrAdminDrawResetError("Choose the exact vendor draw to reset.");
  }
  const event_key = plain(body.event_key, 1, 100);
  const vendor_id = plain(body.vendor_id, 1, 18);
  const draw_id = plain(body.draw_id, 36, 36);
  const request_id = plain(body.request_id, 36, 36);
  const operator_identity = plain(body.operator_identity, 3, 160);
  const reason = plain(body.reason, 3, 500);
  const expected_generation = body.expected_generation;
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event_key) ||
    !/^[1-9][0-9]{0,17}$/.test(vendor_id) ||
    !uuid.test(draw_id) || !uuid.test(request_id) ||
    !Number.isSafeInteger(expected_generation) ||
    Number(expected_generation) < 0 ||
    Number(expected_generation) >= Number.MAX_SAFE_INTEGER
  ) {
    throw new QrAdminDrawResetError(
      "The draw changed or its identifiers are invalid. Reload the winners list.",
    );
  }
  return {
    action: "draw_reset" as const,
    dataset: "winners" as const,
    event_key,
    vendor_id,
    draw_id,
    request_id,
    operator_identity,
    reason,
    expected_generation: expected_generation as number,
  };
}
export async function handleQrAdminDrawReset(
  db: any,
  body: Record<string, unknown>,
) {
  const input = parseQrAdminDrawReset(body);
  let result;
  try {
    result = await db.rpc("admin_reset_qr_bingo_vendor_draw", {
      p_event_key: input.event_key,
      p_vendor_id: input.vendor_id,
      p_draw_id: input.draw_id,
      p_expected_generation: input.expected_generation,
      p_request_id: input.request_id,
      p_operator_identity: input.operator_identity,
      p_reason: input.reason,
    });
  } catch {
    throw new QrAdminDrawResetError(
      "The reset could not be confirmed. Retry the same request after reloading.",
      503,
      "draw_reset_unavailable",
    );
  }
  const { data, error } = result || {};
  if (error) {
    throw new QrAdminDrawResetError(
      "The reset could not be confirmed. Retry the same request after reloading.",
      503,
      "draw_reset_unavailable",
    );
  }
  if (data?.ok !== true) {
    const messages: Record<string, string> = {
      draw_not_found: "That draw is no longer available for this vendor.",
      draw_not_current: "This is an earlier draw. Reload the winners list.",
      draw_not_active:
        "Only the current potential or verified winner can be reset.",
      draw_generation_conflict:
        "The vendor draw changed. Reload before resetting it.",
      draw_reset_request_conflict:
        "This request was already used with different reset details. Reload the winners list.",
      draw_delivery_in_progress:
        "A winner email is being sent. Wait for delivery to finish before resetting.",
      draw_delivery_uncertain:
        "An earlier email outcome needs administrator reconciliation before this draw can be reset.",
      event_unavailable:
        "This draw's event is not currently available for a reset.",
    };
    const code = typeof data?.code === "string"
      ? data.code
      : "draw_reset_unavailable";
    throw new QrAdminDrawResetError(
      messages[code] ||
        "The reset could not be confirmed. Reload the winners list.",
      code === "draw_not_found" ? 404 : messages[code] ? 409 : 503,
      code,
      Number.isSafeInteger(data?.current_generation)
        ? data.current_generation
        : undefined,
    );
  }
  if (
    data.action !== input.action || data.dataset !== input.dataset ||
    data.event_key !== input.event_key ||
    data.vendor_id !== input.vendor_id || data.draw_id !== input.draw_id ||
    data.request_id !== input.request_id ||
    data.from_generation !== input.expected_generation ||
    data.to_generation !== input.expected_generation + 1 ||
    typeof data.replayed !== "boolean"
  ) {
    throw new QrAdminDrawResetError(
      "The reset response could not be confirmed. Reload the winners list.",
      503,
      "draw_reset_result_unconfirmed",
    );
  }
  return {
    ok: true,
    action: input.action,
    dataset: input.dataset,
    event_key: data.event_key,
    vendor_id: data.vendor_id,
    draw_id: data.draw_id,
    request_id: data.request_id,
    from_generation: data.from_generation,
    to_generation: data.to_generation,
    replayed: data.replayed,
    message:
      "Draw reset. The vendor can select a new winner from the existing eligible entries. Earlier winners and email records are preserved.",
  };
}
