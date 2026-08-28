import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { findAuthUserByEmail } from "./auth_users.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export class AuthEmailConflictError extends Error {
  constructor() {
    super("That email is already connected to another account.");
    this.name = "AuthEmailConflictError";
  }
}

export class AuthEmailSyncError extends Error {
  constructor(
    message = "Account email synchronization is temporarily unavailable.",
  ) {
    super(message);
    this.name = "AuthEmailSyncError";
  }
}

export type LinkedAuthEmailPlan = {
  profileId: string;
  previousProfileEmail: string;
  previousAuthEmail: string;
  nextEmail: string;
};

export type AppliedAuthEmailChange = {
  changed: boolean;
  rollback: () => Promise<void>;
};

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Resolves the one Supabase identity linked to a BD member and rejects a target
 * email owned by any other GoTrue user before a provider-side update starts.
 */
export async function preflightLinkedAuthEmail(
  bdMemberId: unknown,
  nextEmail: unknown,
): Promise<LinkedAuthEmailPlan | null> {
  const memberId = String(bdMemberId || "").trim();
  const normalizedNextEmail = normalizedEmail(nextEmail);
  if (!memberId || !normalizedNextEmail) {
    throw new AuthEmailSyncError();
  }

  const { data: linkedProfiles, error: profileLookupError } = await admin
    .from("profiles")
    .select("id,email")
    .eq("bd_member_id", memberId)
    .limit(2);
  if (profileLookupError) throw new AuthEmailSyncError();
  const targetOwner = await findAuthUserByEmail(normalizedNextEmail).catch(
    () => {
      throw new AuthEmailSyncError();
    },
  );
  if (!linkedProfiles?.length) {
    // Without a durable member link, an existing GoTrue owner cannot safely be
    // assumed to be the same person as the authenticated BD member.
    if (targetOwner) throw new AuthEmailConflictError();
    return null;
  }
  if (linkedProfiles.length !== 1) throw new AuthEmailSyncError();

  const profile = linkedProfiles[0];
  const profileId = String(profile.id || "").trim();
  if (!profileId) throw new AuthEmailSyncError();

  const currentAuth = await admin.auth.admin.getUserById(profileId);
  if (currentAuth.error || !currentAuth.data.user) {
    throw new AuthEmailSyncError();
  }
  const previousAuthEmail = normalizedEmail(currentAuth.data.user.email);
  if (!previousAuthEmail) throw new AuthEmailSyncError();

  if (targetOwner && targetOwner.id !== profileId) {
    throw new AuthEmailConflictError();
  }

  return {
    profileId,
    previousProfileEmail: normalizedEmail(profile.email),
    previousAuthEmail,
    nextEmail: normalizedNextEmail,
  };
}

async function updateProfileEmail(profileId: string, email: string) {
  const { data, error } = await admin
    .from("profiles")
    .update({ email, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .select("id")
    .maybeSingle();
  if (error || !data?.id) throw new AuthEmailSyncError();
}

async function updateAuthEmail(profileId: string, email: string) {
  const { error } = await admin.auth.admin.updateUserById(profileId, {
    email,
    email_confirm: true,
  });
  if (error) throw new AuthEmailSyncError();
}

/**
 * Applies a preflighted change in GoTrue-first order. If the profile write
 * fails, the GoTrue write is rolled back before the error reaches the caller.
 * The returned rollback is used when the final BD update is rejected.
 */
export async function applyLinkedAuthEmail(
  plan: LinkedAuthEmailPlan | null,
): Promise<AppliedAuthEmailChange> {
  if (!plan) return { changed: false, rollback: async () => {} };

  let authChanged = false;
  let profileChanged = false;
  try {
    if (plan.previousAuthEmail !== plan.nextEmail) {
      await updateAuthEmail(plan.profileId, plan.nextEmail);
      authChanged = true;
    }
    if (plan.previousProfileEmail !== plan.nextEmail) {
      await updateProfileEmail(plan.profileId, plan.nextEmail);
      profileChanged = true;
    }
  } catch {
    const rollbackErrors: unknown[] = [];
    if (profileChanged) {
      try {
        await updateProfileEmail(plan.profileId, plan.previousProfileEmail);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    if (authChanged) {
      try {
        await updateAuthEmail(plan.profileId, plan.previousAuthEmail);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    throw new AuthEmailSyncError(
      rollbackErrors.length
        ? "Account email synchronization failed and requires support review."
        : undefined,
    );
  }

  let rolledBack = false;
  return {
    changed: authChanged || profileChanged,
    rollback: async () => {
      if (rolledBack || (!authChanged && !profileChanged)) return;
      const rollbackErrors: unknown[] = [];
      if (profileChanged) {
        try {
          await updateProfileEmail(plan.profileId, plan.previousProfileEmail);
        } catch (error) {
          rollbackErrors.push(error);
        }
      }
      if (authChanged) {
        try {
          await updateAuthEmail(plan.profileId, plan.previousAuthEmail);
        } catch (error) {
          rollbackErrors.push(error);
        }
      }
      if (rollbackErrors.length) {
        throw new AuthEmailSyncError(
          "Account email synchronization failed and requires support review.",
        );
      }
      rolledBack = true;
    },
  };
}
