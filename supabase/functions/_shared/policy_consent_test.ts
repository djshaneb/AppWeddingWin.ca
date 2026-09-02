import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  currentPolicyConsent,
} from "./policy_consent.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("current policy consent accepts only exact versions and a current timestamp", () => {
  const valid = currentPolicyConsent({
    acceptedAt: new Date().toISOString(),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  });
  assert(
    valid?.termsVersion === "2026-09-01",
    "current terms version should be preserved",
  );
  assert(
    valid?.privacyVersion === "2026-09-01",
    "current privacy version should be preserved",
  );

  assert(
    currentPolicyConsent({
      acceptedAt: new Date().toISOString(),
      termsVersion: "2026-08-29",
      privacyVersion: CURRENT_PRIVACY_VERSION,
    }) === null,
    "stale terms acceptance must fail closed",
  );
  assert(
    currentPolicyConsent({
      acceptedAt: "not-a-date",
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    }) === null,
    "invalid timestamps must fail closed",
  );
  assert(
    currentPolicyConsent({
      acceptedAt: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    }) === null,
    "replayed old signup consent must fail closed",
  );
});
