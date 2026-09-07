import { isAppleNativeMemberId } from "./apple_native_exchange.ts";

export type NativeAppleExchangeValidationDependencies = {
  profile: (
    id: string,
  ) => Promise<{ id?: unknown; bd_member_id?: unknown } | null>;
  authUser: (id: string) => Promise<{ id?: unknown; email?: unknown } | null>;
  identity: (
    bdMemberId: string,
  ) => Promise<{ user_id?: unknown; token?: unknown; cookie?: unknown } | null>;
  member: (
    bdMemberId: string,
  ) => Promise<
    {
      user_id?: unknown;
      email?: unknown;
      active?: unknown;
      subscription_id?: unknown;
    } | null
  >;
};

/** No email lookup, no cached existence fallback. Cache is needed ONLY for the
 * canonical app token because BD deliberately omits tokens from v2 reads. The
 * exact authoritative member read is last; any unavailable dependency fails. */
export async function validateNativeAppleExchange(
  session: Record<string, unknown>,
  user: Record<string, unknown>,
  profileId: string,
  deps: NativeAppleExchangeValidationDependencies,
): Promise<boolean> {
  if (
    !isAppleNativeMemberId(session.user_id) ||
    typeof session.token !== "string" || !session.token.trim() ||
    typeof user.email !== "string" || !user.email.trim() ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      profileId,
    )
  ) return false;
  const memberId = String(session.user_id);
  if (
    !isAppleNativeMemberId(user.user_id) || String(user.user_id) !== memberId ||
    !isAppleNativeMemberId(user.subscription_id)
  ) return false;
  const email = user.email.trim().toLowerCase();
  const profile = await deps.profile(profileId);
  if (profile?.id !== profileId || String(profile.bd_member_id) !== memberId) {
    return false;
  }
  const auth = await deps.authUser(profileId);
  if (
    auth?.id !== profileId || typeof auth.email !== "string" ||
    auth.email.trim().toLowerCase() !== email
  ) return false;
  const identity = await deps.identity(memberId);
  if (
    String(identity?.user_id) !== memberId ||
    identity?.token !== session.token ||
    (session.cookie && identity?.cookie !== session.cookie)
  ) return false;
  const member = await deps.member(memberId);
  if (
    String(member?.user_id) !== memberId || typeof member?.email !== "string" ||
    member.email.trim().toLowerCase() !== email ||
    String(member.active) !== "2" ||
    !isAppleNativeMemberId(member.subscription_id) ||
    String(member.subscription_id) !== String(user.subscription_id)
  ) return false;
  return true;
}
