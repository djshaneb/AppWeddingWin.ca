import {
  loadMemberEmailVerification,
  MemberEmailIdentityChangedError,
  type MemberEmailVerification,
  MemberEmailVerificationUnavailableError,
} from "./member_email_verification.ts";

type Member = Record<string, unknown>;
type Dependencies<T extends Member> = {
  fetchFreshUser: (userId: string) => Promise<T | undefined>;
  assertFreshMember: (user: T) => Promise<unknown>;
  loadVerification?: (
    userId: unknown,
    email: unknown,
  ) => Promise<MemberEmailVerification>;
};

export class ChatMemberAccessError extends Error {
  constructor(message = "Native session expired", readonly status = 401) {
    super(message);
    this.name = "ChatMemberAccessError";
  }
}

/**
 * Call only after live canonical-session authentication. Passive polling reuses
 * profile fields, never authorization: the uncached signed website status
 * endpoint reads users_data and requires this exact member to be active (2).
 * Pending confirmation, deleted/inactive accounts and unavailable proof fail
 * closed. Sends, reports and conversation creation keep the fresh BD check.
 */
export async function loadChatMemberAccess<T extends Member>(
  action: string,
  authenticatedUser: T,
  dependencies: Dependencies<T>,
): Promise<{ user: T; emailVerification: MemberEmailVerification }> {
  const userId = String(authenticatedUser.user_id || "").trim();
  if (!/^[1-9][0-9]*$/.test(userId)) throw new ChatMemberAccessError();
  const passive = action === "status" || action === "list" || action === "read";
  const loadVerification = dependencies.loadVerification ||
    loadMemberEmailVerification;
  const freshUser = async () => {
    const user = await dependencies.fetchFreshUser(userId);
    if (!user || String(user.user_id || "").trim() !== userId) {
      throw new ChatMemberAccessError();
    }
    await dependencies.assertFreshMember(user);
    return user;
  };

  let user = passive ? authenticatedUser : await freshUser();
  let emailVerification: MemberEmailVerification;
  try {
    emailVerification = await loadVerification(userId, user.email);
  } catch (error) {
    if (
      !passive || !(error instanceof MemberEmailIdentityChangedError) ||
      error.userId !== userId
    ) throw error;
    // A verified email change is the only reason passive polling retries the
    // BD profile lookup. Never turn website outages into an API request storm.
    user = await freshUser();
    if (String(user.email || "").trim().toLowerCase() !== error.currentEmail) {
      throw new MemberEmailVerificationUnavailableError();
    }
    emailVerification = await loadVerification(userId, user.email);
  }

  // This is fresh website evidence, not the potentially stale profile flag.
  // Mutation paths retain their original fresh-member/reviewer policy result.
  return { user: passive ? { ...user, active: "2" } : user, emailVerification };
}
