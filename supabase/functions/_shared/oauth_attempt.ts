import type { SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";

export type WebOAuthProvider = "apple" | "google";

const OAUTH_ATTEMPT_TTL_SECONDS = 600;
const BINDING_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const OAUTH_BINDING_COOKIE_NAMES: Record<WebOAuthProvider, string> = {
  apple: "__Host-ww_apple_oauth",
  google: "__Host-ww_google_oauth",
};

type OAuthAttemptClient = Pick<SupabaseClient, "from" | "rpc">;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64UrlFromBytes(new Uint8Array(digest));
}

export function randomOAuthBindingSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

export function readOAuthBindingCookie(
  req: Request,
  provider: WebOAuthProvider,
): string | null {
  const expectedName = OAUTH_BINDING_COOKIE_NAMES[provider];
  const cookieHeader = req.headers.get("cookie") || "";

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== expectedName) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    return BINDING_SECRET_PATTERN.test(value) ? value : null;
  }

  return null;
}

export function serializeOAuthBindingCookie(
  provider: WebOAuthProvider,
  bindingSecret: string,
): string {
  if (!BINDING_SECRET_PATTERN.test(bindingSecret)) {
    throw new Error("OAuth browser binding secret is invalid.");
  }

  const sameSite = provider === "apple" ? "None" : "Lax";
  return [
    `${OAUTH_BINDING_COOKIE_NAMES[provider]}=${bindingSecret}`,
    "Path=/",
    `Max-Age=${OAUTH_ATTEMPT_TTL_SECONDS}`,
    "Secure",
    "HttpOnly",
    `SameSite=${sameSite}`,
  ].join("; ");
}

export function prepareOAuthBinding(
  req: Request,
  provider: WebOAuthProvider,
): { bindingSecret: string; setCookie: string } {
  const bindingSecret = readOAuthBindingCookie(req, provider) ||
    randomOAuthBindingSecret();
  return {
    bindingSecret,
    setCookie: serializeOAuthBindingCookie(provider, bindingSecret),
  };
}

export async function createOAuthLoginAttempt(args: {
  admin: OAuthAttemptClient;
  provider: WebOAuthProvider;
  state: string;
  bindingSecret: string;
  expiresAtSeconds: number;
}): Promise<void> {
  if (!args.state || !BINDING_SECRET_PATTERN.test(args.bindingSecret)) {
    throw new Error("OAuth login attempt is invalid.");
  }

  const [stateHash, bindingHash] = await Promise.all([
    sha256Base64Url(args.state),
    sha256Base64Url(args.bindingSecret),
  ]);
  const { error } = await args.admin.from("oauth_login_attempts").insert({
    state_hash: stateHash,
    provider: args.provider,
    binding_hash: bindingHash,
    expires_at: new Date(args.expiresAtSeconds * 1000).toISOString(),
  });

  if (error) {
    console.error("OAuth login attempt insert failed:", error.message);
    throw new Error("OAuth sign-in could not be started. Please try again.");
  }
}

export async function redeemOAuthLoginAttempt(args: {
  admin: OAuthAttemptClient;
  request: Request;
  provider: WebOAuthProvider;
  state: string;
}): Promise<void> {
  const bindingSecret = readOAuthBindingCookie(args.request, args.provider);
  if (!bindingSecret) {
    throw new Error(
      "OAuth sign-in must be completed in the same browser where it was started.",
    );
  }

  const [stateHash, bindingHash] = await Promise.all([
    sha256Base64Url(args.state),
    sha256Base64Url(bindingSecret),
  ]);
  const { data, error } = await args.admin.rpc("redeem_oauth_login_attempt", {
    p_state_hash: stateHash,
    p_provider: args.provider,
    p_binding_hash: bindingHash,
  });

  if (error) {
    console.error("OAuth login attempt redemption failed:", error.message);
    throw new Error(
      "OAuth sign-in validation is temporarily unavailable. Please try again.",
    );
  }
  if (data !== true) {
    throw new Error(
      "OAuth sign-in state is invalid, expired, already used, or belongs to another browser.",
    );
  }
}
