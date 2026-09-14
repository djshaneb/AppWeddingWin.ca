// Authenticated result reads do not depend on the scan/show entry window.
// The RPC rechecks owner, verified channel, current generations and QA exclusion.
export type QrBingoDrawResult = {
  draw_id: string; event_key: string; viewer_role: "couple" | "vendor";
  vendor_id: string; vendor_name: string; prize_title: string;
  prize_description: string; prize_approx_value_cad: number | null;
  claim_instructions: string; official_rules_url: string; drawn_at: string;
  notice_sent_at: string; apple_non_sponsor_disclaimer: string;
};
export class QrBingoDrawResultError extends Error {
  constructor(public status = 503, public code = "draw_result_unavailable",
    message = "This draw result is temporarily unavailable. Please try again.") {
    super(message); this.name = "QrBingoDrawResultError";
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function loadQrBingoDrawResult(db: any, memberId: string, drawId: unknown): Promise<QrBingoDrawResult> {
  if (typeof drawId !== "string" || !uuid.test(drawId)) {
    throw new QrBingoDrawResultError(400, "invalid_draw_id", "A valid draw result is required.");
  }
  if (!/^[1-9][0-9]{0,17}$/.test(memberId)) throw new QrBingoDrawResultError(401, "native_session_expired", "Please sign in again.");
  let reply;
  try { reply = await db.rpc("read_weddingwin_draw_result", { p_member_id: memberId, p_draw_id: drawId }); }
  catch { throw new QrBingoDrawResultError(); }
  if (reply?.error) throw new QrBingoDrawResultError();
  const row = reply?.data;
  if (row === null) throw new QrBingoDrawResultError(404, "draw_result_unavailable", "This draw result is no longer available.");
  const strings = ["event_key", "vendor_name", "prize_title", "prize_description", "claim_instructions", "official_rules_url", "apple_non_sponsor_disclaimer"] as const;
  if (!row || row.draw_id?.toLowerCase() !== drawId.toLowerCase() ||
    !["couple", "vendor"].includes(row.viewer_role) || !/^[1-9][0-9]{0,17}$/.test(row.vendor_id) ||
    strings.some(key => typeof row[key] !== "string") ||
    ![row.drawn_at, row.notice_sent_at].every(value => typeof value === "string" && Number.isFinite(Date.parse(value))) ||
    !(row.prize_approx_value_cad === null || (typeof row.prize_approx_value_cad === "number" && Number.isFinite(row.prize_approx_value_cad) && row.prize_approx_value_cad >= 0))) {
    throw new QrBingoDrawResultError();
  }
  // Explicit DTO: never forward winner contact columns or opaque DB extras.
  return { draw_id: row.draw_id, event_key: row.event_key, viewer_role: row.viewer_role,
    vendor_id: row.vendor_id, vendor_name: row.vendor_name, prize_title: row.prize_title,
    prize_description: row.prize_description, prize_approx_value_cad: row.prize_approx_value_cad,
    claim_instructions: row.claim_instructions, official_rules_url: row.official_rules_url,
    drawn_at: row.drawn_at, notice_sent_at: row.notice_sent_at,
    apple_non_sponsor_disclaimer: row.apple_non_sponsor_disclaimer };
}
