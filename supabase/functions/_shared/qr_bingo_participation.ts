import type { QrContactProfile } from "./qr_bingo_contacts.ts";

export const QR_BINGO_PARTICIPATION_NOTICE = "2026-09-14-showday-prize-lock";
type Config = { event_key: string; rules_version: string; revision: number };
export type QrParticipationReceipt = {
  recorded: true;
  couple_id: string;
  event_key: string;
  profile_event_key: string;
  rules_version: string;
  participation_notice_version: string;
  accepted_at: string;
  acceptance_id: string;
  excluded_from_master: boolean;
};
export class QrParticipationError extends Error {
  constructor(
    message = "QR Bingo agreement could not be saved. Please try again.",
    public code = "participation_agreement_unavailable",
    public status = 503,
  ) { super(message); this.name = "QrParticipationError"; }
}
function stale() {
  return new QrParticipationError(
    "The QR Bingo agreement changed. Reload QR Bingo before continuing.",
    "participation_agreement_stale", 409,
  );
}
export function qrParticipationVersion(config: Config) {
  return `${config.rules_version}|${QR_BINGO_PARTICIPATION_NOTICE}`;
}
export function validateQrParticipationRequest(body: Record<string, unknown>, config: Config) {
  if (body.accepted !== true || !["explicit", "cached"].includes(String(body.acceptance_source))) {
    throw new QrParticipationError("Accept the QR Bingo agreement before continuing.", "participation_notice_required", 428);
  }
  if (body.expected_event_key !== config.event_key || body.rules_version !== config.rules_version ||
    body.participation_notice_version !== qrParticipationVersion(config) ||
    (body.expected_config_revision !== undefined && body.expected_config_revision !== config.revision)) {
    throw stale();
  }
  return body.acceptance_source === "cached" ? "cached_notice" as const : "explicit_notice" as const;
}
function verifiedReceipt(row: any, config: Config, eventKey: string, coupleId: string): QrParticipationReceipt {
  if (!row || row.event_key !== eventKey || row.couple_bd_user_id !== coupleId ||
    row.rules_version !== config.rules_version || row.notice_version !== qrParticipationVersion(config) ||
    row.basis !== "explicit_notice" ||
    typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) ||
    typeof row.accepted_at !== "string" || !Number.isFinite(Date.parse(row.accepted_at)) ||
    typeof row.excluded_from_master !== "boolean") throw new QrParticipationError();
  return { recorded: true, couple_id: coupleId, event_key: config.event_key, profile_event_key: eventKey,
    rules_version: config.rules_version, participation_notice_version: row.notice_version,
    accepted_at: row.accepted_at, acceptance_id: row.id, excluded_from_master: row.excluded_from_master };
}
export async function loadQrParticipationReceipt(db: any, config: Config, eventKey: string, coupleId: string) {
  const { data, error } = await db.from("qr_bingo_participation_acceptances")
    .select("id,event_key,couple_bd_user_id,rules_version,notice_version,basis,accepted_at,excluded_from_master")
    .eq("event_key", eventKey).eq("couple_bd_user_id", coupleId)
    .eq("rules_version", config.rules_version).eq("notice_version", qrParticipationVersion(config)).maybeSingle();
  if (error) throw new QrParticipationError("QR Bingo agreement status is temporarily unavailable. Please try again.");
  return data ? verifiedReceipt(data, config, eventKey, coupleId) : null;
}
export async function recordQrParticipation(
  db: any, config: Config, eventKey: string, coupleId: string, profile: QrContactProfile,
  basis: "explicit_notice" | "cached_notice" | "notice_on_use",
  expectedRevision?: unknown,
) {
  if (!profile?.saved || !profile.complete || profile.event_key !== eventKey || profile.couple_id !== coupleId ||
    !Number.isSafeInteger(profile.version) || profile.version < 1) {
    throw new QrParticipationError("Complete your QR Bingo contact details before accepting the agreement.", "profile_incomplete", 422);
  }
  const { data, error } = await db.rpc("record_qr_bingo_participation_acceptance", {
    p_published_event_key: config.event_key, p_event_key: eventKey, p_couple_id: coupleId,
    p_rules_version: config.rules_version, p_notice_version: qrParticipationVersion(config),
    p_profile_version: profile.version, p_basis: basis,
    p_expected_revision: expectedRevision === undefined ? null : expectedRevision,
  });
  if (error) throw new QrParticipationError();
  if (data?.ok !== true) {
    if (data?.code === "participation_agreement_stale") throw stale();
    if (data?.code === "participation_notice_required") throw new QrParticipationError(
      "Review and accept the current QR Bingo agreement before continuing.", "participation_notice_required", 428);
    if (data?.code === "participation_profile_changed") throw new QrParticipationError(
      "Your QR Bingo contact details changed. Reload before accepting the agreement.", "participation_profile_changed", 409);
    if (data?.code === "profile_incomplete") throw new QrParticipationError(
      "Complete your QR Bingo contact details before accepting the agreement.", "profile_incomplete", 422);
    throw new QrParticipationError();
  }
  return verifiedReceipt(data.receipt, config, eventKey, coupleId);
}

// A cache or action carrying the exact current version may replay an existing
// explicit server receipt. PostgreSQL refuses to create first acceptance from
// these paths; historical notices and vendor-entry consent remain distinct.
export function shouldRecordQrParticipationOnUse(action: string, body: Record<string, unknown>, config: Config) {
  return ["scan", "raffle_offer", "raffle_opt_in"].includes(action) &&
    body.participation_notice_version === qrParticipationVersion(config);
}
