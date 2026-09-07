import {
  type AppleWebSignupRole,
  requireAppleWebSignupRole,
} from "./oauth_state.ts";

export function appleSignupSubscriptionId(
  role: AppleWebSignupRole,
): "17" | "18" | "23" | "33" | "35" | "37" | "38" {
  const plans = {
    vendor: "17",
    vendor_basic: "35",
    vendor_show: "38",
    vendor_venue: "23",
    vendor_multi: "33",
    vendor_venue_multi: "37",
    couple: "18",
  } as const;
  return plans[requireAppleWebSignupRole(role)];
}

/** Signup intent never authorizes converting an existing member's plan. */
export function assertAppleSignupAccountType(
  member: Record<string, unknown> | undefined,
  role?: AppleWebSignupRole,
): void {
  if (!role || !member?.user_id) return;
  if (
    String(member.subscription_id || "") !== appleSignupSubscriptionId(role)
  ) {
    throw new Error("APPLE_SIGNUP_ROLE_MISMATCH");
  }
}
