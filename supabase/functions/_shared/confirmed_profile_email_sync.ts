import { fetchFullBdUserById } from "./apple_auth.ts";
import { applyLinkedAuthEmail, preflightLinkedAuthEmail } from "./auth_email_sync.ts";
import { loadMemberEmailVerification, MemberEmailVerificationUnavailableError } from "./member_email_verification.ts";

/** The website has already proved ownership; this completes only its linked app identity. */
export async function syncConfirmedWebsiteProfileEmail(userId: string): Promise<void> {
  const user = await fetchFullBdUserById(userId);
  const email = String(user?.email || "").trim().toLowerCase();
  if (String(user?.user_id || "") !== userId || !email) {
    throw new MemberEmailVerificationUnavailableError();
  }
  const proof = await loadMemberEmailVerification(userId, email);
  if (proof.email_confirmation_required || proof.email_verification_status !== "confirmed") {
    throw new MemberEmailVerificationUnavailableError();
  }
  const plan = await preflightLinkedAuthEmail(userId, email);
  // A website-only member may have no app identity. Never create or link an
  // account by email here; the normal explicit signup flow owns that decision.
  if (!plan) return;
  await applyLinkedAuthEmail(plan);
  const current = await fetchFullBdUserById(userId);
  if (String(current?.user_id || "") !== userId ||
    String(current?.email || "").trim().toLowerCase() !== email) {
    // A newer confirmed change may have completed concurrently. Do not roll
    // back over its Auth email; the caller can retry against current proof.
    throw new MemberEmailVerificationUnavailableError();
  }
}
