import type { AppleRevocationJob } from "./apple_grant_lifecycle.ts";

export type WebsiteAppleCleanupContext = {
  profileId: string;
  leaseUntil: string;
};

export type WebsiteAppleCleanupDependencies = {
  prepare: (job: AppleRevocationJob) => Promise<WebsiteAppleCleanupContext>;
  validate: (job: AppleRevocationJob) => Promise<WebsiteAppleCleanupContext>;
  inspectAbsent: (bdMemberId: string) => Promise<boolean>;
  getAuthUser: (profileId: string) => Promise<{ id: string } | null>;
  deleteAuthUser: (profileId: string) => Promise<void>;
  finish: (job: AppleRevocationJob) => Promise<void>;
  now?: () => number;
};

/** Complete only the immutable app identity captured by a website receipt.
 * The SQL lease/identity barrier remains held until the caller's job_finish.
 * Never resolve a deletion target from a mutable email or display name.
 */
export async function runWebsiteAppleAccountCleanup(
  job: AppleRevocationJob,
  deps: WebsiteAppleCleanupDependencies,
): Promise<void> {
  if (!job.fullCleanup) return;
  const profileId = String(job.profileId || "").trim();
  if (!profileId) throw new Error("Website account cleanup has no verified owner.");
  const now = deps.now || Date.now;
  const verifyContext = (context: WebsiteAppleCleanupContext) => {
    if (
      context.profileId !== profileId ||
      !(Date.parse(context.leaseUntil) - now() > 10_000)
    ) throw new Error("Website account cleanup authorization expired.");
  };

  if (!await deps.inspectAbsent(job.bdMemberId)) {
    throw new Error("Website member still exists.");
  }
  // Capture one-way redaction evidence before deleting GoTrue can cascade
  // profiles. The RPC refuses any unconfirmed Apple grant or rebound profile.
  verifyContext(await deps.prepare(job));
  const authUser = await deps.getAuthUser(profileId);
  if (authUser && authUser.id !== profileId) {
    throw new Error("Website account cleanup owner mismatch.");
  }
  if (!await deps.inspectAbsent(job.bdMemberId)) {
    throw new Error("Website member reappeared.");
  }
  // Validate again immediately before the external deletion, after both
  // network lookups. A missing Auth row is an idempotent retry, not a lookup
  // failure; the adapter must keep those outcomes distinct.
  verifyContext(await deps.validate(job));
  if (authUser) await deps.deleteAuthUser(profileId);
  // SQL asserts Auth absence, purges only this BD member, and records a
  // durable milestone. It leaves the Apple identity barrier for job_finish.
  await deps.finish(job);
}
