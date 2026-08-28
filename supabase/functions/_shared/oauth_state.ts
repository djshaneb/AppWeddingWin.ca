export const DEFAULT_OAUTH_FINAL = "https://www.weddingwin.ca/";

export type VerifiedAppleOAuthState = {
  p: "apple";
  r: string;
  n: string;
  exp: number;
};

type CreateAppleOAuthStateOptions = {
  redirectTo: unknown;
  secret: string;
  nonce?: string;
  nowSeconds?: number;
};

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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
    if (url.protocol === "https:" && host === "weddingwin.ca") return url.toString();
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
): Promise<{ state: string; nonce: string; redirectTo: string; expiresAt: number }> {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const nonce = (options.nonce || crypto.randomUUID()).trim();
  if (!nonce) throw new Error("OAuth state nonce is required.");

  const payload: VerifiedAppleOAuthState = {
    p: "apple",
    r: allowedFinalRedirect(options.redirectTo),
    n: nonce,
    exp: now + 600,
  };
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
  const redirect = normalizeAllowedFinalRedirect(parsed.r);
  const nonce = typeof parsed.n === "string" ? parsed.n.trim() : "";
  const expires = Number(parsed.exp || 0);
  const signature = typeof parsed.h === "string" ? parsed.h.trim() : "";
  if (provider !== "apple" || !redirect || !nonce || !signature || !Number.isInteger(expires)) {
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
