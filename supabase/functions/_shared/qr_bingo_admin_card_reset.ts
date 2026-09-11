import { parseQrBingoCardState } from "./qr_bingo_card_state.ts";

export class QrAdminCardResetError extends Error {
  constructor(
    message: string,
    public status = 422,
    public code = "invalid_card_reset",
  ) {
    super(message);
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const messages: Record<string, string> = {
  stale_card_generation:
    "This Bingo card changed. Refresh and choose the account again.",
  card_reset_preview_changed:
    "The card or its draw entries changed. Preview the reset again.",
  card_reset_preview_expired:
    "This reset preview expired. Preview the card again.",
  card_reset_request_conflict:
    "This request was already used with different details. Preview the card again.",
  draw_delivery_in_progress:
    "A winner email is being sent. Wait for delivery to finish before resetting this card.",
  draw_delivery_uncertain:
    "An email outcome needs administrator reconciliation before this card can be reset.",
  event_unavailable: "This event is not currently available for a card reset.",
};
function invalid(
  message = "Choose the exact couple and event, then preview the reset.",
): never {
  throw new QrAdminCardResetError(message);
}
function plain(value: unknown, min: number, max: number): string {
  if (
    typeof value !== "string" || value !== value.trim() || value.length < min ||
    value.length > max || /[<>\u0000-\u001f\u007f]/.test(value)
  ) invalid();
  return value as string;
}
function scope(body: Record<string, unknown>) {
  const event_key = plain(body.event_key, 1, 100);
  const couple_id = plain(body.couple_id, 1, 18);
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event_key) ||
    !/^[1-9][0-9]{0,17}$/.test(couple_id)
  ) invalid();
  return { event_key, couple_id };
}
function verifiedCouple(value: unknown, couple: string) {
  const proof = value as Record<string, unknown> | null;
  if (
    !proof || typeof proof !== "object" || Array.isArray(proof) ||
    Object.keys(proof).sort().join(",") !== "active,id,subscription_id" ||
    proof.id !== couple || proof.active !== "2" ||
    !["4", "18"].includes(String(proof.subscription_id))
  ) {
    invalid(
      "Choose a currently active couple account. Vendor accounts cannot have a couple card reset.",
    );
  }
}
function generation(value: unknown): number {
  if (
    !Number.isSafeInteger(value) || Number(value) < 0 ||
    Number(value) >= Number.MAX_SAFE_INTEGER
  ) invalid();
  return Number(value);
}
function unavailable(code = "card_reset_unavailable"): never {
  throw new QrAdminCardResetError(
    "The card reset could not be confirmed. Retry the same request before starting another reset.",
    503,
    code,
  );
}
async function rpc(db: any, name: string, args: Record<string, unknown>) {
  let result;
  try {
    result = await db.rpc(name, args);
  } catch {
    unavailable();
  }
  if (result?.error || !result?.data) unavailable();
  if (result.data.ok !== true) {
    const code = typeof result.data.code === "string"
      ? result.data.code
      : "card_reset_unavailable";
    if (!messages[code]) unavailable();
    throw new QrAdminCardResetError(messages[code], 409, code);
  }
  return result.data;
}

export async function handleQrAdminCardReset(
  db: any,
  body: Record<string, unknown>,
) {
  const action = body.action;
  const isPreview = action === "card_reset_preview";
  if (!isPreview && action !== "card_reset") invalid();
  const keys = new Set([
    "action",
    "dataset",
    "event_key",
    "couple_id",
    "verified_couple",
    ...(isPreview ? [] : [
      "expected_generation",
      "preview_token",
      "request_id",
      "operator_identity",
      "reason",
      "website_scan_lock_held",
      "website_scan_reset_at",
    ]),
  ]);
  if (
    body.dataset !== "scans" || Object.keys(body).some((key) => !keys.has(key))
  ) invalid();
  const { event_key, couple_id } = scope(body);
  verifiedCouple(body.verified_couple, couple_id);
  if (isPreview) {
    const data = await rpc(db, "qr_bingo_card_reset_snapshot", {
      p_event_key: event_key,
      p_couple_id: couple_id,
    });
    try {
      const card_state = parseQrBingoCardState(
        data.card_state,
        event_key,
        couple_id,
      );
      if (
        data.action !== action || data.dataset !== "scans" ||
        data.event_key !== event_key || data.couple_id !== couple_id ||
        data.expected_generation !== card_state.generation ||
        typeof data.preview_token !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.preview_token) ||
        !Number.isSafeInteger(data.entry_count) || data.entry_count < 0 ||
        typeof data.can_reset !== "boolean" ||
        typeof data.reset_block_reason !== "string" || (data.can_reset
          ? data.reset_block_reason !== ""
          : !messages[data.reset_block_reason])
      ) {
        unavailable("card_reset_result_unconfirmed");
      }
      return {
        ok: true,
        action,
        dataset: "scans",
        event_key,
        couple_id,
        card_state,
        expected_generation: data.expected_generation,
        preview_token: data.preview_token,
        entry_count: data.entry_count,
        can_reset: data.can_reset,
        reset_block_reason: data.can_reset
          ? ""
          : messages[data.reset_block_reason],
        reset_block_code: data.reset_block_reason,
      };
    } catch {
      unavailable("card_reset_result_unconfirmed");
    }
  }
  const expected_generation = generation(body.expected_generation);
  const preview_token = plain(body.preview_token, 64, 64);
  const request_id = plain(body.request_id, 36, 36);
  const operator_identity = plain(body.operator_identity, 3, 160);
  const reason = plain(body.reason, 3, 500);
  const cutoff = plain(body.website_scan_reset_at, 20, 20);
  if (
    !/^[a-f0-9]{64}$/.test(preview_token) || !uuid.test(request_id) ||
    body.website_scan_lock_held !== true ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(cutoff) ||
    !Number.isFinite(Date.parse(cutoff)) ||
    new Date(cutoff).toISOString() !== cutoff.replace("Z", ".000Z")
  ) invalid();
  const data = await rpc(db, "admin_reset_qr_bingo_couple_card", {
    p_event_key: event_key,
    p_couple_id: couple_id,
    p_expected_generation: expected_generation,
    p_preview_token: preview_token,
    p_request_id: request_id,
    p_operator_identity: operator_identity,
    p_reason: reason,
    p_scan_reset_at: cutoff,
  });
  if (
    data.action !== action || data.dataset !== "scans" ||
    data.event_key !== event_key || data.couple_id !== couple_id ||
    data.request_id !== request_id ||
    data.from_generation !== expected_generation ||
    data.to_generation !== expected_generation + 1 ||
    typeof data.scan_reset_after !== "string" ||
    Date.parse(data.scan_reset_after) !== Date.parse(cutoff) ||
    !Number.isSafeInteger(data.entry_count) || data.entry_count < 0 ||
    typeof data.replayed !== "boolean"
  ) unavailable("card_reset_result_unconfirmed");
  return {
    ok: true,
    action,
    dataset: "scans",
    event_key,
    couple_id,
    request_id,
    from_generation: data.from_generation,
    to_generation: data.to_generation,
    scan_reset_after: data.scan_reset_after,
    entry_count: data.entry_count,
    replayed: data.replayed,
    message:
      "Bingo card reset. This couple can scan vendors and choose to enter their draws again. Earlier winners and email records are preserved.",
  };
}

export async function handleQrAdminCardResetCutoffs(
  db: any,
  body: Record<string, unknown>,
) {
  if (
    body.action !== "card_reset_cutoffs" ||
    Object.keys(body).some((key) => !["action", "event_key"].includes(key))
  ) invalid();
  const event_key = plain(body.event_key, 1, 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event_key)) invalid();
  const result = await rpc(db, "read_qr_bingo_card_reset_cutoffs", {
    p_event_key: event_key,
  });
  if (
    result.action !== "card_reset_cutoffs" || result.event_key !== event_key ||
    result.has_more !== false || !Array.isArray(result.rows) ||
    result.rows.length > 10000
  ) unavailable("card_cutoffs_unavailable");
  const seen = new Set<string>();
  const rows = result.rows.map((row: any) => {
    if (
      typeof row.couple_id !== "string" ||
      !/^[1-9][0-9]{0,17}$/.test(row.couple_id) || seen.has(row.couple_id)
    ) unavailable("card_cutoffs_unavailable");
    seen.add(row.couple_id);
    try {
      const state = parseQrBingoCardState(
        { ...row, event_key },
        event_key,
        row.couple_id,
      );
      if (state.generation === 0) unavailable("card_cutoffs_unavailable");
      return {
        couple_id: state.couple_id,
        generation: state.generation,
        scan_reset_after: state.scan_reset_after,
      };
    } catch {
      unavailable("card_cutoffs_unavailable");
    }
  });
  return {
    ok: true,
    action: "card_reset_cutoffs",
    event_key,
    rows,
    has_more: false,
  };
}
