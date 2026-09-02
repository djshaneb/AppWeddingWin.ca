export const CURRENT_TERMS_VERSION = "2026-09-01";
export const CURRENT_PRIVACY_VERSION = "2026-09-01";

export type CurrentPolicyConsent = {
  acceptedAt: string;
  termsVersion: string;
  privacyVersion: string;
};

export function currentPolicyConsent(
  value: unknown,
): CurrentPolicyConsent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const acceptedAt = String(candidate.acceptedAt || "").trim();
  const acceptedTime = new Date(acceptedAt).getTime();
  const now = Date.now();
  if (
    String(candidate.termsVersion || "").trim() !== CURRENT_TERMS_VERSION ||
    String(candidate.privacyVersion || "").trim() !== CURRENT_PRIVACY_VERSION ||
    !Number.isFinite(acceptedTime) ||
    acceptedTime > now + 5 * 60_000 ||
    acceptedTime < now - 24 * 60 * 60_000
  ) return null;
  return {
    acceptedAt: new Date(acceptedTime).toISOString(),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  };
}

export function requireCurrentPolicyConsent(
  value: unknown,
): CurrentPolicyConsent {
  const consent = currentPolicyConsent(value);
  if (!consent) {
    throw new Error(
      `Explicit acceptance of Terms ${CURRENT_TERMS_VERSION} and Privacy ${CURRENT_PRIVACY_VERSION} with a current timestamp is required.`,
    );
  }
  return consent;
}
