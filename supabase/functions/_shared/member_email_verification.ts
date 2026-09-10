export type MemberEmailVerification = {
  email_confirmation_required: boolean;
  pending_email: string | null;
  email_verification_status: "pending" | "expired" | "confirmed" | "none";
};

export class MemberEmailVerificationUnavailableError extends Error {
  constructor() {
    super("Email verification status is temporarily unavailable. Please try again.");
    this.name = "MemberEmailVerificationUnavailableError";
  }
}

export const EMAIL_CONFIRMATION_NOTICE = "Confirm your email to continue.";

export function requireConfirmedAuthEmailChange(
  plan: { previousAuthEmail: string; nextEmail: string } | null,
  state: MemberEmailVerification,
): void {
  if (plan && plan.previousAuthEmail !== plan.nextEmail &&
    (state.email_confirmation_required || state.email_verification_status !== "confirmed")) {
    throw new MemberEmailVerificationUnavailableError();
  }
}

export function isApplePrivateRelayEmail(value: unknown): boolean {
  return String(value || "").trim().toLowerCase().endsWith("@privaterelay.appleid.com");
}

function normalizedEmail(value: unknown): string {
  if (typeof value !== "string") throw new MemberEmailVerificationUnavailableError();
  const email = value.trim().toLowerCase();
  if (email.length > 254 || /[<>\s]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MemberEmailVerificationUnavailableError();
  }
  return email;
}

type StatusDependencies = {
  secret?: string;
  baseUrl?: string;
  now?: () => number;
  fetch?: typeof fetch;
};

/** Read server-owned website proof, never client profile flags or cached metadata. */
export async function loadMemberEmailVerification(
  userId: unknown,
  currentEmail: unknown,
  dependencies: StatusDependencies = {},
): Promise<MemberEmailVerification> {
  try {
    const id = String(userId || "").trim();
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new MemberEmailVerificationUnavailableError();
    }
    const expectedEmail = normalizedEmail(currentEmail);
    const secret = dependencies.secret ?? Deno.env.get("APP_EMAIL_CHANGE_SECRET") ?? "";
    if (secret.trim().length < 32) throw new MemberEmailVerificationUnavailableError();
    const base = new URL(dependencies.baseUrl ?? Deno.env.get("BD_API_BASE_URL") ?? "https://www.weddingwin.ca");
    if (base.protocol !== "https:" || base.username || base.password) {
      throw new MemberEmailVerificationUnavailableError();
    }
    const expires = Math.floor((dependencies.now?.() ?? Date.now()) / 1000) + 300;
    const action = "status_app";
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign(
      "HMAC", key, new TextEncoder().encode(`${action}|${id}|${expires}`),
    );
    const signature = Array.from(new Uint8Array(signatureBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const response = await (dependencies.fetch ?? fetch)(new URL("/verify-email-change-app", base), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "WeddingWinEmailVerification/1.0" },
      body: new URLSearchParams({ ww_email_change_action: action, user_id: id, expires: String(expires), signature }),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new MemberEmailVerificationUnavailableError();
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true ||
      String(data.user_id) !== id || normalizedEmail(data.current_email) !== expectedEmail) {
      throw new MemberEmailVerificationUnavailableError();
    }
    const status = data.email_verification_status;
    if (!["pending", "expired", "confirmed", "none"].includes(status)) {
      throw new MemberEmailVerificationUnavailableError();
    }
    const required = status === "pending" || status === "expired";
    if (data.email_confirmation_required !== required ||
      (!required && data.pending_email !== null)) {
      throw new MemberEmailVerificationUnavailableError();
    }
    return {
      email_confirmation_required: required,
      pending_email: required && !(status === "expired" && data.pending_email === null)
        ? normalizedEmail(data.pending_email) : null,
      email_verification_status: status,
    };
  } catch {
    // Never include a signature, confirmation address, URL, or raw website body.
    throw new MemberEmailVerificationUnavailableError();
  }
}
