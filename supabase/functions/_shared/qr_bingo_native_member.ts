/** Fresh website-SQL proof for an already authenticated native member. */
export class QrBingoMemberProofError extends Error {
  readonly status = 503;
  readonly code = "member_lookup_unavailable";
  constructor() {
    super("WeddingWin is busy. Please try again in a moment.");
    this.name = "QrBingoMemberProofError";
  }
}

const PURPOSE = "qr_bingo_member_v1";
const encoder = new TextEncoder();
const FIELD_LIMITS = {
  user_id: 18, active: 1, subscription_id: 18,
  first_name: 500, last_name: 500, email: 254,
  phone_number: 160, phone: 160, wedding_date: 40,
} as const;

type Dependencies = {
  secret?: string;
  baseUrl?: string;
  now?: () => number;
  fetch?: typeof fetch;
};

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}
function validEmail(value: unknown): value is string {
  return typeof value === "string" && value === value.trim().toLowerCase() &&
    value.length <= 254 && !/[<>\s\u0000-\u001f\u007f]/.test(value) && /^[^@]+@[^@]+\.[^@]+$/.test(value);
}

// This function is deliberately uncached. The caller must first validate the
// native session against the canonical server identity. No profile from the
// installed app, nor any stale positive lookup, can supply this proof.
export async function loadFreshQrBingoMember(
  userId: unknown,
  dependencies: Dependencies = {},
): Promise<Record<string, unknown>> {
  try {
    const id = typeof userId === "number" ? String(userId) : userId;
    if (typeof id !== "string" || !/^[1-9][0-9]{0,17}$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new QrBingoMemberProofError();
    }
    const secret = dependencies.secret ?? Deno.env.get("APP_EMAIL_CHANGE_SECRET") ?? "";
    if (secret.trim().length < 32) throw new QrBingoMemberProofError();
    const base = new URL(dependencies.baseUrl ?? Deno.env.get("BD_API_BASE_URL") ?? "https://www.weddingwin.ca");
    if (base.protocol !== "https:" || base.username || base.password) throw new QrBingoMemberProofError();
    const now = dependencies.now ?? Date.now;
    // The website accepts up to 60 seconds; leave 15 seconds for clock skew.
    const expires = String(Math.floor(now() / 1000) + 45);
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${PURPOSE}|${id}|${expires}|${nonce}`));
    const signature = Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const response = await (dependencies.fetch ?? fetch)(new URL("/verify-email-change-app", base), {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "WeddingWinQrMember/1.0" },
      body: new URLSearchParams({ ww_email_change_action: PURPOSE, user_id: id, expires, nonce, signature }),
    });
    if (!response.ok) throw new QrBingoMemberProofError();
    const data: unknown = await response.json();
    if (!object(data) || !exactKeys(data, ["ok", "purpose", "version", "user_id", "expires", "nonce", "member", "verification"]) ||
      data.ok !== true || data.purpose !== PURPOSE || data.version !== 1 || data.user_id !== id ||
      data.expires !== expires || data.nonce !== nonce || Number(expires) <= Math.floor(now() / 1000) ||
      !object(data.member) || !exactKeys(data.member, Object.keys(FIELD_LIMITS))) throw new QrBingoMemberProofError();
    const member = data.member;
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
      const value = member[field];
      if (typeof value !== "string" || encoder.encode(value).length > limit || value.includes("\u0000")) {
        throw new QrBingoMemberProofError();
      }
    }
    // Active=1 is only a vendor routing hint. The caller must still obtain the
    // full fresh BD vendor/tag row; private review vendors historically allow 1.
    const couple = ["4", "18"].includes(String(member.subscription_id));
    if (member.user_id !== id || (member.active !== "2" && !(member.active === "1" && !couple)) ||
      !/^[1-9][0-9]{0,17}$/.test(String(member.subscription_id)) || !Number.isSafeInteger(Number(member.subscription_id)) ||
      !validEmail(member.email)) throw new QrBingoMemberProofError();
    const state = data.verification;
    if (!object(state) || !exactKeys(state, ["email_confirmation_required", "pending_email", "email_verification_status"]) ||
      !["none", "confirmed", "pending", "expired"].includes(String(state.email_verification_status))) {
      throw new QrBingoMemberProofError();
    }
    const required = state.email_verification_status === "pending" || state.email_verification_status === "expired";
    if (state.email_confirmation_required !== required || (!required && state.pending_email !== null) ||
      (required && !(state.email_verification_status === "expired" && state.pending_email === null) && !validEmail(state.pending_email))) {
      throw new QrBingoMemberProofError();
    }
    // QR event contacts have their own consent/profile gate. A pending login-
    // email change must neither replace the current email nor add a new QR gate.
    return { ...member };
  } catch {
    // No response body, email, signature, or transport URL can enter logs.
    throw new QrBingoMemberProofError();
  }
}
