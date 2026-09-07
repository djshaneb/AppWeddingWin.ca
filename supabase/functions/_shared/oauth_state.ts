import type { CurrentPolicyConsent } from "./policy_consent.ts";

export const DEFAULT_OAUTH_FINAL = "https://www.weddingwin.ca/";
export const APPLE_NATIVE_RETURN_URL = "weddingwin://bd-apple-return";

export type AppleNativeOAuthIntent = {
  returnTo: typeof APPLE_NATIVE_RETURN_URL;
  codeChallenge: string;
};

export function requireAppleNativeOAuthIntent(
  value: unknown,
): AppleNativeOAuthIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid OAuth native intent.");
  }
  const intent = value as Record<string, unknown>;
  if (
    Object.keys(intent).some((key) =>
      key !== "returnTo" && key !== "codeChallenge"
    ) ||
    intent.returnTo !== APPLE_NATIVE_RETURN_URL ||
    typeof intent.codeChallenge !== "string" ||
    intent.codeChallenge.length !== 43 ||
    !/^[A-Za-z0-9_-]{43}$/.test(intent.codeChallenge)
  ) throw new Error("Invalid OAuth native intent.");
  return {
    returnTo: APPLE_NATIVE_RETURN_URL,
    codeChallenge: intent.codeChallenge,
  };
}

export type AppleWebSignupRole =
  | "vendor"
  | "vendor_basic"
  | "vendor_show"
  | "vendor_venue"
  | "vendor_multi"
  | "vendor_venue_multi"
  | "couple";

export function requireAppleWebSignupRole(value: unknown): AppleWebSignupRole {
  if (
    value !== "vendor" && value !== "vendor_basic" && value !== "vendor_show" &&
    value !== "vendor_venue" && value !== "vendor_multi" &&
    value !== "vendor_venue_multi" && value !== "couple"
  ) {
    throw new Error("Invalid OAuth signup role.");
  }
  return value;
}

export type VerifiedAppleOAuthState = {
  p: "apple";
  r: string;
  n: string;
  exp: number;
  c?: CurrentPolicyConsent;
  s?: AppleWebSignupRole;
  native?: AppleNativeOAuthIntent;
};

type CreateAppleOAuthStateOptions = {
  redirectTo: unknown;
  secret: string;
  nonce?: string;
  nowSeconds?: number;
  consent?: CurrentPolicyConsent;
  signupRole?: AppleWebSignupRole;
  native?: AppleNativeOAuthIntent;
};

function normalizeStateConsent(
  value: unknown,
  expires: number,
): CurrentPolicyConsent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid OAuth consent.");
  }
  const consent = value as Record<string, unknown>;
  const acceptedAt = typeof consent.acceptedAt === "string"
    ? consent.acceptedAt
    : "";
  const acceptedSeconds = new Date(acceptedAt).getTime() / 1000;
  const termsVersion = typeof consent.termsVersion === "string"
    ? consent.termsVersion
    : "";
  const privacyVersion = typeof consent.privacyVersion === "string"
    ? consent.privacyVersion
    : "";
  if (
    !Number.isFinite(acceptedSeconds) || acceptedSeconds < expires - 605 ||
    acceptedSeconds > expires || !termsVersion || termsVersion.length > 64 ||
    !privacyVersion || privacyVersion.length > 64
  ) {
    throw new Error("Invalid OAuth consent.");
  }
  return { acceptedAt, termsVersion, privacyVersion };
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}

function base64UrlFromString(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + pad);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function requireSecret(secret: string) {
  if (!secret) throw new Error("APP_LOGIN_SECRET is not configured");
}

function normalizeAllowedFinalRedirect(value: unknown): string | null {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (url.protocol === "https:" && host === "weddingwin.ca") {
      return url.toString();
    }
    if (url.protocol === "weddingwin:") {
      const nativeHost = url.hostname.toLowerCase();
      const nativePath = url.pathname.replace(/\/+$/, "");
      if (
        (nativeHost === "bd-login" && !nativePath) ||
        (!nativeHost && nativePath === "/bd-login")
      ) {
        return url.toString();
      }
    }
  } catch {
    // Invalid or untrusted redirect.
  }
  return null;
}

export function allowedFinalRedirect(value: unknown): string {
  return normalizeAllowedFinalRedirect(value) || DEFAULT_OAUTH_FINAL;
}

async function importHmacKey(secret: string, usages: KeyUsage[]) {
  requireSecret(secret);
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function createSignedAppleOAuthState(
  options: CreateAppleOAuthStateOptions,
): Promise<
  { state: string; nonce: string; redirectTo: string; expiresAt: number }
> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const nonce = (options.nonce || crypto.randomUUID()).trim();
  if (!nonce) throw new Error("OAuth state nonce is required.");
  const native = options.native === undefined
    ? undefined
    : requireAppleNativeOAuthIntent(options.native);
  if (native && options.redirectTo !== native.returnTo) {
    throw new Error("Invalid OAuth native redirect.");
  }

  const payload: VerifiedAppleOAuthState = {
    p: "apple",
    r: native?.returnTo || allowedFinalRedirect(options.redirectTo),
    n: nonce,
    exp: now + 600,
  };
  if (options.consent !== undefined) {
    payload.c = normalizeStateConsent(options.consent, payload.exp);
  }
  if (options.signupRole !== undefined) {
    payload.s = requireAppleWebSignupRole(options.signupRole);
  }
  if (native) {
    if (payload.s && payload.s !== "vendor" && payload.s !== "couple") {
      throw new Error("Invalid OAuth native signup role.");
    }
    if (!!payload.s !== !!payload.c) {
      throw new Error("Invalid OAuth native consent.");
    }
    payload.native = native;
  }
  const payloadText = JSON.stringify(payload);
  const key = await importHmacKey(options.secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadText),
  );

  return {
    state: base64UrlFromString(JSON.stringify({
      ...payload,
      h: base64UrlFromBytes(new Uint8Array(signature)),
    })),
    nonce,
    redirectTo: payload.r,
    expiresAt: payload.exp,
  };
}

export async function verifySignedAppleOAuthState(
  encoded: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifiedAppleOAuthState> {
  requireSecret(secret);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(base64UrlToString(encoded)) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid OAuth state.");
  }

  const provider = parsed.p;
  const native = Object.hasOwn(parsed, "native")
    ? requireAppleNativeOAuthIntent(parsed.native)
    : undefined;
  const redirect = native
    ? (parsed.r === native.returnTo ? native.returnTo : null)
    : normalizeAllowedFinalRedirect(parsed.r);
  const nonce = typeof parsed.n === "string" ? parsed.n.trim() : "";
  const expires = Number(parsed.exp || 0);
  const signature = typeof parsed.h === "string" ? parsed.h.trim() : "";
  if (
    provider !== "apple" || !redirect || !nonce || !signature ||
    !Number.isInteger(expires)
  ) {
    throw new Error("Invalid OAuth state.");
  }
  if (expires < nowSeconds || expires > nowSeconds + 600) {
    throw new Error("OAuth state expired.");
  }

  const signedPayload: VerifiedAppleOAuthState = {
    p: "apple",
    r: redirect,
    n: nonce,
    exp: expires,
  };
  // Preserve older in-flight sign-ins, but never invent missing acceptance.
  // New member creation still enforces the current policy-consent requirement.
  if (Object.hasOwn(parsed, "c")) {
    signedPayload.c = normalizeStateConsent(parsed.c, expires);
  }
  if (Object.hasOwn(parsed, "s")) {
    signedPayload.s = requireAppleWebSignupRole(parsed.s);
  }
  if (native) {
    if (
      signedPayload.s && signedPayload.s !== "vendor" &&
      signedPayload.s !== "couple"
    ) {
      throw new Error("Invalid OAuth native signup role.");
    }
    if (!!signedPayload.s !== !!signedPayload.c) {
      throw new Error("Invalid OAuth native consent.");
    }
    signedPayload.native = native;
  }
  let valid = false;
  try {
    const key = await importHmacKey(secret, ["verify"]);
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature) as BufferSource,
      new TextEncoder().encode(JSON.stringify(signedPayload)) as BufferSource,
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new Error("Invalid OAuth state signature.");
  return signedPayload;
}

export function assertAppleOAuthNonce(expected: string, actual: unknown) {
  if (!expected || typeof actual !== "string" || actual !== expected) {
    throw new Error("OAuth nonce mismatch.");
  }
}
