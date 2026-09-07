import { requireCurrentPolicyConsent } from "./policy_consent.ts";

export class AppleSignupRequiredError extends Error {
  constructor(readonly cleanupEligible = false) {
    super("APPLE_SIGNUP_REQUIRED");
    this.name = "AppleSignupRequiredError";
  }
}
export class AppleLoginPreflightUnavailableError extends Error {
  constructor() {
    super("Apple account lookup is temporarily unavailable. Please try again.");
    this.name = "AppleLoginPreflightUnavailableError";
  }
}
export type AppleLoginPreflightArgs = {
  claims: {
    sub: string;
    iss: string;
    aud: string;
    email?: string;
    email_verified?: string | boolean;
  };
  consent: unknown;
  expectedBdMemberId?: string;
  expectedProfileId?: string;
};
export type AppleLoginPreflightDependencies = {
  membersByEmail: (email: string) => Promise<unknown[]>;
  memberById: (id: string) => Promise<Record<string, unknown> | null>;
  authUserById: (
    id: string,
  ) => Promise<{ id?: unknown; email?: unknown } | null>;
  hasAuthUserByEmail: (email: string) => Promise<boolean>;
  hasProfileByAppleSubject: (subject: string) => Promise<boolean>;
};
function memberId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
      value.trim() === value
    ? value
    : null;
}
function email(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function requireMatchingMember(
  value: unknown,
  expectedEmail: string,
  id?: string,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error();
  }
  const member = value as Record<string, unknown>;
  const actualId = memberId(member.user_id);
  if (
    !actualId || (id && actualId !== id) || !expectedEmail ||
    email(member.email) !== expectedEmail ||
    (member.active !== "2" && member.active !== 2)
  ) throw new Error();
  return actualId;
}

/** Read-only authorization to begin account writes. Only the caller's verified
 * Apple claims or a server-enrolled immutable profile/member binding may select
 * the lookup. No request/form email is accepted. A no-consent login never
 * creates a membership; it carries the existing exact member into login. */
export async function requireAppleLoginPreflight(
  args: AppleLoginPreflightArgs,
  deps: AppleLoginPreflightDependencies,
): Promise<{ expectedBdMemberId?: string }> {
  if (args.consent != null) {
    requireCurrentPolicyConsent(args.consent);
    return {};
  }
  try {
    if (args.expectedBdMemberId || args.expectedProfileId) {
      const id = memberId(args.expectedBdMemberId);
      const profileId = args.expectedProfileId || "";
      if (
        !id ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          profileId,
        )
      ) throw new Error();
      const auth = await deps.authUserById(profileId);
      if (auth?.id !== profileId || !email(auth.email)) throw new Error();
      const member = await deps.memberById(id);
      return {
        expectedBdMemberId: requireMatchingMember(
          member,
          email(auth.email),
          id,
        ),
      };
    }
    const signedEmail = email(args.claims.email);
    if (
      args.claims.iss !== "https://appleid.apple.com" ||
      typeof args.claims.sub !== "string" || !args.claims.sub.trim() ||
      typeof args.claims.aud !== "string" || !args.claims.aud.trim() ||
      !signedEmail ||
      (args.claims.email_verified !== true &&
        args.claims.email_verified !== "true")
    ) throw new Error();
    const members = await deps.membersByEmail(signedEmail);
    if (!Array.isArray(members) || members.length > 1) throw new Error();
    if (members.length === 1) {
      return {
        expectedBdMemberId: requireMatchingMember(members[0], signedEmail),
      };
    }
    // This extra absence proof is solely compensation eligibility, never an
    // account-linking fallback. Existing Auth or profile owners are not revoked.
    const [hasAuth, hasProfile] = await Promise.all([
      deps.hasAuthUserByEmail(signedEmail),
      deps.hasProfileByAppleSubject(args.claims.sub),
    ]);
    if (typeof hasAuth !== "boolean" || typeof hasProfile !== "boolean") {
      throw new Error();
    }
    throw new AppleSignupRequiredError(!hasAuth && !hasProfile);
  } catch (error) {
    if (error instanceof AppleSignupRequiredError) throw error;
    throw new AppleLoginPreflightUnavailableError();
  }
}
