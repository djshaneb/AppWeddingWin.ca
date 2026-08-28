import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APP_LOGIN_TICKET_FIELDS = [
  "user_id",
  "first_name",
  "last_name",
  "email",
  "company",
  "active",
  "subscription_id",
  "profession_id",
  "filename",
  "token",
  "cookie",
] as const;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlFromBytes(new Uint8Array(digest));
}

export function randomExchangeCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

export async function createOneTimeAppLoginUrl(
  user: Record<string, unknown> | undefined,
  email: string,
  destination: "home" | "builder-sso" = "home",
): Promise<string> {
  if (!user?.user_id || typeof user?.token !== "string" || !user.token.trim()) {
    throw new Error("BD member is missing a login token.");
  }

  const payload: Record<string, unknown> = {
    email,
    login_destination: destination,
    exp: Math.floor(Date.now() / 1000) + 120,
  };
  for (const field of APP_LOGIN_TICKET_FIELDS) {
    if (user[field] !== undefined && user[field] !== null) payload[field] = user[field];
  }

  const code = randomExchangeCode();
  const codeHash = await sha256Base64Url(code);
  const { error } = await admin.from("app_login_exchanges").insert({
    code_hash: codeHash,
    bd_member_id: String(user.user_id).trim(),
    payload,
    expires_at: new Date(Date.now() + 120_000).toISOString(),
  });
  if (error) throw new Error(`App login exchange could not be created: ${error.message}`);

  return `${BD_API_BASE_URL}/app-login?code=${encodeURIComponent(code)}`;
}

export async function createNativeAuthExchange(args: {
  provider: string;
  codeChallenge: string;
  bdMemberId?: string | number;
  payload: Record<string, unknown>;
}): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(args.codeChallenge)) {
    throw new Error("Native authentication code challenge is invalid.");
  }

  const code = randomExchangeCode();
  const codeHash = await sha256Base64Url(code);
  const { error } = await admin.from("app_native_auth_exchanges").insert({
    code_hash: codeHash,
    bd_member_id: String(args.bdMemberId || "").trim() || null,
    provider: args.provider,
    code_challenge: args.codeChallenge,
    payload: args.payload,
    expires_at: new Date(Date.now() + 300_000).toISOString(),
  });
  if (error) throw new Error(`Native authentication exchange could not be created: ${error.message}`);
  return code;
}
