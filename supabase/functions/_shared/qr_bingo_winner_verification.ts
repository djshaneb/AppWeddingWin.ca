export const QR_BINGO_EXTERNAL_SKILL_ATTESTATION =
  "The vendor confirms it independently completed the required skill-testing verification outside Wedding Win and retained evidence. Wedding Win records this attestation and did not check the answer.";

type SkillEvidence = {
  vendor_bd_user_id?: unknown;
  verified_by?: unknown;
  verification_notes?: unknown;
  winner_rules_confirmed_at?: unknown;
  skill_question_verified_at?: unknown;
  skill_question_vendor_attested_at?: unknown;
  skill_question_vendor_attested_by?: unknown;
  skill_question_vendor_attestation?: unknown;
};

function timestamp(value: unknown) {
  return typeof value === "string" && value.trim() !== "" &&
    Number.isFinite(Date.parse(value));
}

export function hasQrBingoVendorSkillAttestation(draw: SkillEvidence) {
  const vendorId = String(draw.vendor_bd_user_id || "");
  const attestedBy = draw.skill_question_vendor_attested_by;
  return /^[1-9][0-9]{0,19}$/.test(vendorId) &&
    timestamp(draw.skill_question_vendor_attested_at) &&
    typeof attestedBy === "string" &&
    attestedBy.startsWith(`vendor:${vendorId}:`) &&
    attestedBy.length > `vendor:${vendorId}:`.length &&
    attestedBy === draw.verified_by &&
    draw.skill_question_vendor_attestation ===
      QR_BINGO_EXTERNAL_SKILL_ATTESTATION &&
    timestamp(draw.winner_rules_confirmed_at) &&
    typeof draw.verification_notes === "string" &&
    draw.verification_notes.trim() !== "";
}

export function hasQrBingoSkillVerification(draw: SkillEvidence) {
  // A historical platform check is never rewritten as a vendor attestation.
  return timestamp(draw.skill_question_verified_at) ||
    hasQrBingoVendorSkillAttestation(draw);
}
