import {
  admin,
  type AppleClaims,
  getAppleConfig,
  makeAppleClientSecret,
  verifyAppleIdentityToken,
} from "./apple_auth.ts";
import {
  type AppleGrantBinding,
  type AppleRevocationJob,
  type AppleStoredGrant,
  inspectBdAbsence,
  openAppleRefreshToken,
  runAppleRevocationJob,
  sealAppleRefreshToken,
} from "./apple_grant_lifecycle.ts";
import {
  runWebsiteAppleAccountCleanup,
  type WebsiteAppleCleanupContext,
} from "./website_apple_cleanup.ts";
import { AppleSignupRequiredError } from "./apple_login_preflight.ts";
import {
  type AppleFailedSignupBinding,
  type AppleFailedSignupEnqueue,
  type AppleFailedSignupJob,
  invalidateAppleFailedSignupToken,
  runAppleFailedSignupRevocation,
  sealAppleFailedSignupGrant,
} from "./apple_failed_signup.ts";

const UNAVAILABLE =
  "Apple sign-in is temporarily unavailable. Please try again shortly.";
const PENDING =
  "Your previous Apple permission is being removed. Please try signing in again shortly.";
type IdentityLease = {
  identityId: string;
  generation: string;
  leaseToken: string;
  bdMemberId?: string;
  profileId?: string;
};

export async function appleGrantOperation<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const result = await admin.rpc("apple_grant_operation", {
    p_action: action,
    p_data: data,
  }).abortSignal(AbortSignal.timeout(5_000));
  if (result.error) {
    if (/APPLE_PERMISSION_REVOCATION_PENDING/.test(result.error.message)) {
      throw new Error(PENDING);
    }
    throw new Error(UNAVAILABLE);
  }
  return result.data as T;
}

export async function appleGrantPrivateConfig(): Promise<
  Record<string, string>
> {
  const result = await admin.rpc("apple_grant_private_config").abortSignal(
    AbortSignal.timeout(5_000),
  );
  if (result.error || !result.data) throw new Error(UNAVAILABLE);
  for (
    const name of [
      "apple_grant_encryption_v1",
      "apple_member_deleted_secret",
      "apple_revocation_worker_secret",
    ]
  ) {
    if (!/^[a-f0-9]{64}$/.test(result.data[name] || "")) {
      throw new Error(UNAVAILABLE);
    }
  }
  return result.data;
}

export async function appleFailedSignupOperation<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const result = await admin.rpc("apple_failed_signup_operation", {
    p_action: action,
    p_data: data,
  }).abortSignal(AbortSignal.timeout(5_000));
  if (result.error) throw new Error(UNAVAILABLE);
  return result.data as T;
}

async function exactBdMember(
  id: string,
): Promise<Record<string, unknown> | null> {
  if (!/^[1-9][0-9]{0,18}$/.test(id)) throw new Error(UNAVAILABLE);
  const key = Deno.env.get("BD_API_KEY");
  if (!key) throw new Error(UNAVAILABLE);
  const url = new URL(
    "/api/v2/user/get",
    Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca",
  );
  url.search = new URLSearchParams({
    property: "user_id",
    property_operator: "eq",
    property_value: id,
    limit: "2",
  }).toString();
  const response = await fetch(url, {
    headers: { "X-Api-Key": key },
    signal: AbortSignal.timeout(5_000),
  });
  const missing = await inspectBdAbsence(response.clone(), id);
  if (missing) return null;
  return (await response.json()).message[0];
}

export async function enqueueAppleMemberDeletion(
  bdMemberId: string,
  options: { fullCleanup?: boolean } = {},
): Promise<{ jobId: string; status: string; expectedGrants: number }> {
  return await appleGrantOperation("enqueue", {
    bdMemberId,
    fullCleanup: options.fullCleanup ?? true,
  });
}

function authUserIsMissing(error: unknown): boolean {
  const value = error as
    | { status?: number; code?: string; message?: string }
    | null;
  return value?.status === 404 || value?.code === "user_not_found" ||
    String(value?.message || "").trim().toLowerCase() === "user not found";
}

async function completeWebsiteAppleAccountCleanup(job: AppleRevocationJob) {
  await runWebsiteAppleAccountCleanup(job, {
    inspectAbsent: async (id) => !await exactBdMember(id),
    prepare: (target) =>
      appleGrantOperation<WebsiteAppleCleanupContext>(
        "job_cleanup_prepare",
        target,
      ),
    validate: (target) =>
      appleGrantOperation<WebsiteAppleCleanupContext>(
        "job_cleanup_validate",
        target,
      ),
    getAuthUser: async (profileId) => {
      const result = await admin.auth.admin.getUserById(profileId);
      if (result.error) {
        if (authUserIsMissing(result.error)) return null;
        throw new Error("App login lookup is temporarily unavailable.");
      }
      if (!result.data.user?.id) {
        throw new Error("App login lookup is incomplete.");
      }
      return { id: result.data.user.id };
    },
    deleteAuthUser: async (profileId) => {
      const result = await admin.auth.admin.deleteUser(profileId);
      if (result.error && !authUserIsMissing(result.error)) {
        throw new Error("App login cleanup will retry.");
      }
    },
    finish: async (target) => {
      await appleGrantOperation("job_cleanup_finish", target);
    },
  });
}

export async function runStoredAppleRevocations() {
  const [cfg, secrets] = await Promise.all([
    getAppleConfig(admin),
    appleGrantPrivateConfig(),
  ]);
  const failedSignup = await runAppleFailedSignupRevocation({
    claim: () =>
      appleFailedSignupOperation<AppleFailedSignupJob | null>("claim"),
    invalidateToken: (job) =>
      invalidateAppleFailedSignupToken(job, {
        allowedClientIds: [cfg.serviceId, cfg.iosBundleId],
        encryptionKey: secrets.apple_grant_encryption_v1,
        makeClientSecret: (clientId) => makeAppleClientSecret(cfg, clientId),
        authorize: (target) => appleFailedSignupOperation("validate", target),
        fetch: globalThis.fetch,
      }),
    complete: async (job) => {
      await appleFailedSignupOperation("complete", job);
    },
    retry: async (job) => {
      await appleFailedSignupOperation("retry", job);
    },
  });
  let currentJob: AppleRevocationJob | null = null;
  const memberCleanup = await runAppleRevocationJob({
    claim: async () =>
      currentJob = await appleGrantOperation<AppleRevocationJob | null>(
        "claim",
      ),
    inspect: async (id) => !await exactBdMember(id),
    grants: (job) => appleGrantOperation<AppleStoredGrant[]>("job_grants", job),
    revoke: async (grant) => {
      if (![cfg.serviceId, cfg.iosBundleId].includes(grant.clientId)) {
        throw new Error(UNAVAILABLE);
      }
      const refreshToken = await openAppleRefreshToken(
        grant,
        grant,
        secrets.apple_grant_encryption_v1,
      );
      const clientSecret = await makeAppleClientSecret(cfg, grant.clientId);
      // Re-authorize the immutable generation immediately before the external
      // side effect, not only after it. SQL requires at least 10s of lease.
      const authorization = await appleGrantOperation<{ leaseUntil: string }>(
        "job_validate",
        { ...currentJob, grantId: grant.grantId, generation: grant.generation },
      );
      if (!(Date.parse(authorization.leaseUntil) - Date.now() > 10_000)) {
        throw new Error(UNAVAILABLE);
      }
      const response = await fetch("https://appleid.apple.com/auth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: grant.clientId,
          client_secret: clientSecret,
          token: refreshToken,
          token_type_hint: "refresh_token",
        }),
        signal: AbortSignal.timeout(5_000),
      });
      return response.status;
    },
    confirm: async (job, grant) => {
      await appleGrantOperation("job_confirm", {
        ...job,
        grantId: grant.grantId,
        generation: grant.generation,
      });
    },
    cleanup: completeWebsiteAppleAccountCleanup,
    finish: async (job) => {
      await appleGrantOperation("job_finish", job);
    },
    retry: async (job, reason) => {
      await appleGrantOperation("job_retry", { ...job, reason });
    },
  });
  // Failed-signup outages do not starve the established member-deletion queue.
  return { ...memberCleanup, failedSignup };
}

export type AppleGrantEmailSource = "original" | "redeemed" | "both" | "none";
export type AppleGrantClaimsResolution = {
  claims: AppleClaims;
  source: AppleGrantEmailSource;
};

function signedClaimEmail(claims?: AppleClaims): string {
  return typeof claims?.email === "string"
    ? claims.email.trim().toLowerCase()
    : "";
}

function claimEmailVerified(claims?: AppleClaims): boolean {
  return claims?.email_verified === true || claims?.email_verified === "true";
}

function claimEmailExplicitlyUnverified(claims?: AppleClaims): boolean {
  return claims?.email_verified === false || claims?.email_verified === "false";
}

/** Resolve email only from already cryptographically verified Apple tokens.
 * A missing native email can be supplied by the matching code-exchange token,
 * never by a request-body email or by a deleted/unenrolled profile mapping.
 */
export function resolveAppleGrantClaims(args: {
  original: AppleClaims;
  redeemed?: AppleClaims;
  expectedNonce?: string;
  requireVerifiedEmail: boolean;
}): AppleGrantClaimsResolution {
  const { original, redeemed, expectedNonce } = args;
  if (
    original.iss !== "https://appleid.apple.com" || !original.sub ||
    !original.aud ||
    redeemed && (
        redeemed.iss !== original.iss || redeemed.sub !== original.sub ||
        redeemed.aud !== original.aud
      ) ||
    expectedNonce && (
        original.nonce !== expectedNonce ||
        redeemed && redeemed.nonce !== expectedNonce
      )
  ) {
    throw new Error("Apple could not verify this sign-in. Please try again.");
  }
  const originalEmail = signedClaimEmail(original);
  const redeemedEmail = signedClaimEmail(redeemed);
  if (originalEmail && redeemedEmail && originalEmail !== redeemedEmail) {
    throw new Error(
      "Apple sign-in email did not match the verified identity token.",
    );
  }
  const explicitlyUnverified = claimEmailExplicitlyUnverified(original) ||
    claimEmailExplicitlyUnverified(redeemed);
  const originalProof = !!originalEmail && claimEmailVerified(original);
  const redeemedProof = !!redeemedEmail && claimEmailVerified(redeemed);
  if (explicitlyUnverified || !originalProof && !redeemedProof) {
    if (args.requireVerifiedEmail) {
      throw new Error(
        "Apple could not verify your account email. Please start again with Apple.",
      );
    }
    // Existing enrolled owners authenticate against their immutable private
    // profile/BD binding. Missing/false email is not new verified-email proof.
    return { claims: original, source: "none" };
  }
  const selected = originalProof ? original : redeemed!;
  return {
    claims: {
      ...selected,
      email: originalProof ? originalEmail : redeemedEmail,
      email_verified: true,
    },
    source: originalProof && redeemedProof
      ? "both"
      : originalProof
      ? "original"
      : "redeemed",
  };
}

function logAppleEmailProof(
  diagnosticId: string | undefined,
  original: AppleClaims,
  redeemed: AppleClaims | undefined,
  chosenSource: AppleGrantEmailSource | "rejected",
) {
  if (!diagnosticId || !/^[0-9a-f-]{36}$/i.test(diagnosticId)) return;
  console.info("apple-grant-signin:email-proof", {
    diagnosticId,
    originalEmailPresent: !!signedClaimEmail(original),
    originalEmailVerified: claimEmailVerified(original),
    originalEmailExplicitlyUnverified: claimEmailExplicitlyUnverified(original),
    redeemedEmailPresent: !!signedClaimEmail(redeemed),
    redeemedEmailVerified: claimEmailVerified(redeemed),
    redeemedEmailExplicitlyUnverified: claimEmailExplicitlyUnverified(redeemed),
    chosenSource,
  });
}

export type AppleGrantLoginContext = {
  expectedBdMemberId?: string;
  expectedProfileId?: string;
  verifiedClaims?: AppleClaims;
};
export type AppleGrantLoginResult<T> = {
  value: T;
  bdMemberId: string;
  profileId: string;
  email: string;
};
const signinDefaults = {
  getConfig: () => getAppleConfig(admin),
  operate: appleGrantOperation,
  exactMember: exactBdMember,
  enqueue: enqueueAppleMemberDeletion,
  makeClientSecret: makeAppleClientSecret,
  verifyIdentityToken: verifyAppleIdentityToken,
  fetch: globalThis.fetch,
  authUserById: async (id: string) => {
    const auth = await admin.auth.admin.getUserById(id);
    if (auth.error) throw new Error(UNAVAILABLE);
    return auth.data.user;
  },
  privateConfig: appleGrantPrivateConfig,
  enqueueFailedSignup: (data: AppleFailedSignupEnqueue) =>
    appleFailedSignupOperation<{ id: string; status: string }>("enqueue", data),
};
export type AppleGrantSigninDependencies =
  & Omit<
    typeof signinDefaults,
    "enqueueFailedSignup"
  >
  & {
    enqueueFailedSignup?: typeof signinDefaults.enqueueFailedSignup;
  };

const EMAIL_UNAVAILABLE =
  "Apple could not verify your account email. Please start again with Apple.";

async function queueUnboundFailedSignup(
  args: { clientId: string; claims: AppleClaims; diagnosticId?: string },
  lease: IdentityLease,
  refreshToken: string,
  deps: AppleGrantSigninDependencies,
): Promise<boolean> {
  if (!deps.enqueueFailedSignup) return false;
  let outcome: "queued" | "unconfirmed" = "unconfirmed";
  try {
    const binding: AppleFailedSignupBinding = {
      identityId: lease.identityId,
      generation: lease.generation,
      jobId: crypto.randomUUID(),
      clientId: args.clientId,
      appleSub: args.claims.sub,
    };
    const secrets = await deps.privateConfig();
    const sealed = await sealAppleFailedSignupGrant(
      refreshToken,
      binding,
      secrets.apple_grant_encryption_v1,
    );
    const tokenHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(refreshToken),
        ),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    // This service-only RPC atomically refuses any legacy profile or member
    // binding and marks the same identity generation revoking before release.
    const result = await deps.enqueueFailedSignup({
      ...binding,
      ...sealed,
      tokenHash,
      leaseToken: lease.leaseToken,
    });
    if (result?.id && ["pending", "running", "retry"].includes(result.status)) {
      outcome = "queued";
    }
  } catch { /* An uncertain enqueue is not a claim of successful cleanup. */ }
  if (args.diagnosticId && /^[0-9a-f-]{36}$/i.test(args.diagnosticId)) {
    console.info("apple-grant-signin:failed-grant-cleanup", {
      diagnosticId: args.diagnosticId,
      outcome,
    });
  }
  return outcome === "queued";
}

/** Only verified provider claims enter this function. All credentials stay server-side. */
export async function withAppleGrantSignin<T>(args: {
  claims: AppleClaims;
  clientId: string;
  refreshToken?: string;
  authorizationCode?: string;
  expectedNonce?: string;
  diagnosticId?: string;
  preflight?: (context: AppleGrantLoginContext) => Promise<void>;
  login: (context: AppleGrantLoginContext) => Promise<AppleGrantLoginResult<T>>;
}, deps: AppleGrantSigninDependencies = signinDefaults): Promise<T> {
  const cfg = await deps.getConfig();
  if (
    args.claims.iss !== "https://appleid.apple.com" ||
    args.claims.aud !== args.clientId ||
    ![cfg.serviceId, cfg.iosBundleId].includes(args.clientId)
  ) throw new Error(UNAVAILABLE);
  if (
    args.authorizationCode &&
    (!args.expectedNonce || args.claims.nonce !== args.expectedNonce)
  ) throw new Error("Apple could not verify this sign-in. Please try again.");
  const lease = await deps.operate<IdentityLease>("signin_begin", {
    teamId: cfg.teamId,
    appleSub: args.claims.sub,
    leaseToken: crypto.randomUUID(),
  });
  try {
    if (lease.bdMemberId && !await deps.exactMember(lease.bdMemberId)) {
      // This is an exact, previously enrolled owner check, never an orphan scan.
      await deps.enqueue(lease.bdMemberId);
      throw new Error(PENDING);
    }
    let refreshToken = args.refreshToken;
    let redeemedClaims: AppleClaims | undefined;
    if (args.authorizationCode || refreshToken) {
      const params = new URLSearchParams({
        client_id: args.clientId,
        client_secret: await deps.makeClientSecret(cfg, args.clientId),
      });
      if (args.authorizationCode) {
        params.set("grant_type", "authorization_code");
        params.set("code", args.authorizationCode);
      } else {
        // Web code exchange precedes acquisition of the verified-subject lock.
        // Revalidate its grant inside the lock before it can create an account.
        params.set("grant_type", "refresh_token");
        params.set("refresh_token", refreshToken!);
      }
      const response = await deps.fetch(
        "https://appleid.apple.com/auth/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) {
        throw new Error(
          "Apple could not complete sign-in. Please start again.",
        );
      }
      const tokenData = await response.json();
      if (typeof tokenData.id_token !== "string") throw new Error(UNAVAILABLE);
      const redeemed = await deps.verifyIdentityToken(tokenData.id_token, [
        args.clientId,
      ]);
      if (
        redeemed.iss !== args.claims.iss ||
        redeemed.sub !== args.claims.sub || redeemed.aud !== args.clientId ||
        args.authorizationCode && redeemed.nonce !== args.expectedNonce
      ) {
        throw new Error(
          "Apple could not verify this sign-in. Please try again.",
        );
      }
      redeemedClaims = redeemed;
      if (args.authorizationCode) refreshToken = tokenData.refresh_token;
      // A refresh validation normally omits a replacement refresh token.
      if (typeof refreshToken !== "string" || !refreshToken.trim()) {
        throw new Error(UNAVAILABLE);
      }
    }
    let resolution: AppleGrantClaimsResolution;
    try {
      resolution = resolveAppleGrantClaims({
        original: args.claims,
        redeemed: redeemedClaims,
        expectedNonce: args.authorizationCode ? args.expectedNonce : undefined,
        requireVerifiedEmail: !lease.bdMemberId,
      });
    } catch (error) {
      logAppleEmailProof(
        args.diagnosticId,
        args.claims,
        redeemedClaims,
        "rejected",
      );
      if (
        error instanceof Error && error.message === EMAIL_UNAVAILABLE &&
        !lease.bdMemberId && !lease.profileId && redeemedClaims &&
        typeof refreshToken === "string" && refreshToken.trim()
      ) {
        // Only a verified, matching exchange followed by this known pre-login
        // failure is eligible. Never compensate a partially created account,
        // an enrolled owner, an invalid token, or a legacy no-code request.
        if (await queueUnboundFailedSignup(args, lease, refreshToken, deps)) {
          throw new Error(PENDING);
        }
      }
      throw error;
    }
    logAppleEmailProof(
      args.diagnosticId,
      args.claims,
      redeemedClaims,
      resolution.source,
    );
    const signedEmail = signedClaimEmail(resolution.claims);
    const loginContext: AppleGrantLoginContext = {
      expectedBdMemberId: lease.bdMemberId || undefined,
      expectedProfileId: lease.profileId || undefined,
      verifiedClaims: resolution.claims,
    };
    // This hook is read-only and runs before account writes begin. A missing
    // ordinary-login account may safely compensate only its fresh unbound
    // grant; errors thrown from login itself are never handled here.
    if (args.preflight) {
      try {
        await args.preflight(loginContext);
      } catch (error) {
        if (
          error instanceof AppleSignupRequiredError &&
          error.cleanupEligible === true &&
          !lease.bdMemberId && !lease.profileId && redeemedClaims &&
          typeof refreshToken === "string" && refreshToken.trim()
        ) {
          await queueUnboundFailedSignup(args, lease, refreshToken, deps);
        }
        // The error says only that signup is required, never that cleanup has
        // succeeded. An uncertain enqueue remains visible in safe diagnostics.
        throw error;
      }
    }
    const result = await args.login(loginContext);
    if (
      lease.bdMemberId &&
      (result.bdMemberId !== lease.bdMemberId ||
        result.profileId !== lease.profileId)
    ) throw new Error(UNAVAILABLE);
    const member = await deps.exactMember(result.bdMemberId);
    if (!member) throw new Error(PENDING);
    if (refreshToken) {
      const auth = await deps.authUserById(result.profileId);
      const verifiedEmail = lease.bdMemberId
        ? String(member.email || "").trim().toLowerCase()
        : signedEmail;
      if (
        !auth || !verifiedEmail ||
        String(auth.email || "").trim().toLowerCase() !== verifiedEmail ||
        result.email.trim().toLowerCase() !== verifiedEmail ||
        String(member.email || "").trim().toLowerCase() !== verifiedEmail
      ) {
        throw new Error(
          "Apple could not verify the account owner. Please contact WeddingWin for help.",
        );
      }
      const binding: AppleGrantBinding = {
        identityId: lease.identityId,
        generation: lease.generation,
        grantId: crypto.randomUUID(),
        clientId: args.clientId,
        appleSub: args.claims.sub,
        bdMemberId: result.bdMemberId,
        profileId: result.profileId,
      };
      const secrets = await deps.privateConfig();
      const sealed = await sealAppleRefreshToken(
        refreshToken,
        binding,
        secrets.apple_grant_encryption_v1,
      );
      const tokenHash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(refreshToken),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      await deps.operate("signin_store", {
        ...binding,
        ...sealed,
        tokenHash,
        leaseToken: lease.leaseToken,
      });
    }
    await deps.operate("signin_check", {
      ...lease,
      bdMemberId: result.bdMemberId,
      profileId: result.profileId,
    });
    return result.value;
  } finally {
    try {
      await deps.operate("signin_release", lease);
    } catch { /* Expired leases cannot release a newer owner's lock. */ }
  }
}
