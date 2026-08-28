import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "npm:jose@5.9.6";
import { verifiedAppleEmail } from "./apple_identity.ts";
import { ensureStableBdIdentity } from "./bd_identity.ts";
import { allowedFinalRedirect } from "./oauth_state.ts";
import { createOneTimeAppLoginUrl } from "./auth_exchange.ts";
import { findAuthUserByEmail } from "./auth_users.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const DEFAULT_FINAL = "https://www.weddingwin.ca/";
const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const BD_DEFAULT_SUBSCRIPTION_ID = Deno.env.get("BD_DEFAULT_SUBSCRIPTION_ID") || "18";
const BD_VENDOR_SUBSCRIPTION_ID = "17";
const BD_APPLE_LOGIN_URL = Deno.env.get("BD_APPLE_LOGIN_URL") || "";
const BD_APPLE_LOGIN_SECRET = Deno.env.get("BD_APPLE_LOGIN_SECRET") || "";
const ALLOW_SUPABASE_APPLE_FALLBACK = Deno.env.get("ALLOW_SUPABASE_APPLE_FALLBACK") === "1";

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type AppleConfig = {
  serviceId: string;
  iosBundleId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
};

export type AppleClaims = {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  aud: string;
  iss: string;
  nonce?: string;
};

type BdEnvelope = {
  status?: string;
  message?: unknown;
};

type BdUser = Record<string, unknown>;

type SignupConsent = {
  acceptedAt: string;
  termsVersion?: string;
  privacyVersion?: string;
} | null;

export type BdNativeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};

const SAFE_BD_USER_FIELDS = [
  "user_id",
  "first_name",
  "last_name",
  "email",
  "company",
  "active",
  "subscription_id",
  "filename",
  "image_main_file",
  "phone_number",
  "city",
  "state_code",
  "state_ln",
  "country_code",
  "country_ln",
  "zip_code",
  "wedding_date",
] as const;

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{background:#0b0b0c;color:#e5e5e7;font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{text-align:center;padding:32px;max-width:480px}.spinner{width:32px;height:32px;border:3px solid #2a2a2e;border-top-color:#d4af37;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style>
</head><body><div class="card">${body}</div></body></html>`;
}

export function errorPage(message: string): Response {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  const safeMessage = message.replace(/[&<>"']/g, (character) => entities[character] || character);
  const body = `<div style="color:#ff6b6b;font-weight:600;margin-bottom:12px">Sign-in failed</div><div>${safeMessage}</div><div style="margin-top:24px"><a href="${DEFAULT_FINAL}" style="color:#d4af37">Go back</a></div>`;
  return new Response(htmlPage("Sign-in failed", body), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function getAppleConfig(db: SupabaseClient = admin): Promise<AppleConfig> {
  const envCfg = {
    serviceId: Deno.env.get("APPLE_SERVICE_ID") || "",
    iosBundleId: Deno.env.get("APPLE_IOS_BUNDLE_ID") || "",
    teamId: Deno.env.get("APPLE_TEAM_ID") || "",
    keyId: Deno.env.get("APPLE_KEY_ID") || "",
    privateKey: (Deno.env.get("APPLE_PRIVATE_KEY") || "").replace(/\\n/g, "\n"),
  };
  if (Object.values(envCfg).every(Boolean)) {
    return envCfg;
  }

  const keys = [
    "apple_service_id",
    "apple_ios_bundle_id",
    "apple_team_id",
    "apple_key_id",
    "apple_private_key",
  ];
  const { data, error } = await db.from("admin_config").select("key, value").in("key", keys);
  if (error) throw new Error(`config read failed: ${error.message}`);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const cfg = {
    serviceId: map.get("apple_service_id") || "",
    iosBundleId: map.get("apple_ios_bundle_id") || "",
    teamId: map.get("apple_team_id") || "",
    keyId: map.get("apple_key_id") || "",
    privateKey: (map.get("apple_private_key") || "").replace(/\\n/g, "\n"),
  };
  const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`apple config missing: ${missing.join(", ")}`);
  return cfg;
}

export async function makeAppleClientSecret(cfg: AppleConfig, clientId: string): Promise<string> {
  const key = await importPKCS8(cfg.privateKey, "ES256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt()
    .setExpirationTime("180d")
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);
}

export async function verifyAppleIdentityToken(
  idToken: string,
  audiences: string[],
): Promise<AppleClaims> {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: audiences,
  });
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Apple token has no subject.");
  }
  return payload as AppleClaims;
}

export function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) return {};

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

export function getNativeAppleAudiences(cfg: AppleConfig): string[] {
  const audiences = [cfg.iosBundleId, cfg.serviceId];
  const extraAudiences = (Deno.env.get("APPLE_EXTRA_AUDIENCES") || "")
    .split(",")
    .map((aud) => aud.trim())
    .filter(Boolean);

  // The production endpoint must never accept Expo Go's shared container
  // audience unless a developer explicitly opts in for a temporary test.
  if (Deno.env.get("ALLOW_EXPO_GO_APPLE_AUD") === "1") {
    extraAudiences.push("host.exp.Exponent");
  }

  return Array.from(new Set([...audiences, ...extraAudiences].filter(Boolean)));
}

export async function upsertAppleUser(args: {
  claims: AppleClaims;
  email?: string | null;
  fullName?: string | null;
}): Promise<{ userId: string; email: string; appleSub: string; fullName: string }> {
  const appleSub = args.claims.sub;
  const providedEmail = verifiedAppleEmail(args.claims.email, args.email);
  const fullName = args.fullName || "";

  const { data: profileByApple, error: profileErr } = await admin
    .from("profiles")
    .select("id, email")
    .eq("apple_sub", appleSub)
    .maybeSingle();
  if (profileErr) throw new Error(`profile lookup failed: ${profileErr.message}`);

  let userId = profileByApple?.id || "";
  let email = profileByApple?.email || providedEmail;

  if (!userId) {
    if (!email) {
      throw new Error("Apple did not provide an email and this Apple account is not linked yet.");
    }

    const existing = await findAuthUserByEmail(email);

    if (existing) {
      userId = existing.id;
      const md = existing.user_metadata || {};
      await admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: {
          ...md,
          full_name: md.full_name || fullName,
          name: md.name || fullName,
          provider: "apple",
          apple_sub: appleSub,
        },
      });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          name: fullName,
          provider: "apple",
          apple_sub: appleSub,
        },
      });
      if (createErr || !created.user) {
        throw new Error(`createUser failed: ${createErr?.message ?? "unknown"}`);
      }
      userId = created.user.id;
    }
  }

  const { error: upsertErr } = await admin.from("profiles").upsert({
    id: userId,
    email,
    display_name: fullName,
    apple_sub: appleSub,
    updated_at: new Date().toISOString(),
  });
  if (upsertErr) throw new Error(`profile upsert failed: ${upsertErr.message}`);

  return { userId, email, appleSub, fullName };
}

export async function makeMagicRedirect(email: string, finalRedirect: string): Promise<string> {
  const safeFinalRedirect = allowedFinalRedirect(finalRedirect);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: safeFinalRedirect },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no link"}`);
  }

  const verifyRes = await fetch(linkData.properties.action_link, {
    redirect: "manual",
    headers: { "User-Agent": "WeddingWinAppleBridge/1.0" },
  });
  const verifyLocation = verifyRes.headers.get("location") || "";
  if (!verifyLocation) {
    throw new Error(`Supabase verify did not redirect (status ${verifyRes.status}).`);
  }
  const parsedVerify = new URL(verifyLocation);
  const hash = parsedVerify.hash.replace(/^#/, "");
  if (!hash || !hash.includes("access_token")) {
    throw new Error(`Supabase verify produced no tokens.`);
  }

  const finalUrl = new URL(safeFinalRedirect);
  finalUrl.searchParams.set("ww_oauth", "apple");
  finalUrl.hash = hash;
  return finalUrl.toString();
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function splitName(fullName?: string | null): { firstName: string; lastName: string } {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "",
    lastName: parts.join(" "),
  };
}

function requestedSubscriptionId(value: unknown): string {
  return String(value || "") === BD_VENDOR_SUBSCRIPTION_ID
    ? BD_VENDOR_SUBSCRIPTION_ID
    : BD_DEFAULT_SUBSCRIPTION_ID;
}

export function sanitizeBdUser(user: BdUser | undefined, email: string) {
  const safe: Record<string, unknown> = { email };

  if (!user) return safe;

  for (const field of SAFE_BD_USER_FIELDS) {
    if (user[field] !== undefined && user[field] !== null) {
      safe[field] = user[field];
    }
  }

  return safe;
}

export function buildBdNativeSession(user: BdUser | undefined, email: string): BdNativeSession {
  const session: BdNativeSession = { email };

  if (user?.user_id !== undefined && user.user_id !== null) {
    session.user_id = user.user_id as string | number;
  }
  if (typeof user?.token === "string" && user.token.trim()) {
    session.token = user.token;
  }
  if (typeof user?.cookie === "string" && user.cookie.trim()) {
    session.cookie = user.cookie;
  }

  return session;
}

export function nativeSessionMatchesBdUser(session: BdNativeSession, user: BdUser | undefined) {
  if (!user?.user_id || String(user.user_id) !== String(session.user_id || "")) {
    return false;
  }

  const sessionToken = String(session.token || "").trim();
  const userToken = String(user.token || "").trim();
  if (!sessionToken || !userToken || sessionToken !== userToken) {
    return false;
  }

  const sessionCookie = String(session.cookie || "").trim();
  const userCookie = String(user.cookie || "").trim();
  if (sessionCookie && userCookie && sessionCookie !== userCookie) {
    return false;
  }

  return true;
}

function unwrapBdUser(message: unknown): BdUser | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdUser) : undefined;
  }

  return message && typeof message === "object" ? (message as BdUser) : undefined;
}

export async function callBd(path: string, init: RequestInit = {}): Promise<{ response: Response; body: BdEnvelope }> {
  if (!BD_API_KEY) {
    throw new Error("BD_API_KEY is not configured");
  }

  const response = await fetch(`${BD_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": BD_API_KEY,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: BdEnvelope;

  try {
    body = JSON.parse(text);
  } catch {
    body = { status: "error", message: text };
  }

  return { response, body };
}

export async function fetchBdUserByEmail(email: string): Promise<BdUser | undefined> {
  const usersUrl = new URL("/api/v2/user/get", BD_API_BASE_URL);
  usersUrl.searchParams.set("limit", "1");
  usersUrl.searchParams.set("property", "email");
  usersUrl.searchParams.set("property_value", email);
  usersUrl.searchParams.set("property_operator", "eq");

  const users = await callBd(`${usersUrl.pathname}${usersUrl.search}`);
  const rows = Array.isArray(users.body.message) ? users.body.message : [];
  const user = rows[0] as BdUser | undefined;

  return user?.user_id ? await fetchFullBdUserById(user.user_id) : user;
}

export async function fetchFullBdUserById(userId: unknown): Promise<BdUser | undefined> {
  const fullUser = await callBd(`/api/v2/user/get/${encodeURIComponent(String(userId))}`);
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return unwrapBdUser(fullUser.body.message);
  }

  return undefined;
}

async function createBdUserForApple(
  email: string,
  fullName?: string | null,
  subscriptionId = BD_DEFAULT_SUBSCRIPTION_ID,
  consent: SignupConsent = null,
): Promise<BdUser | undefined> {
  if (!consent?.acceptedAt) {
    throw new Error("Agreement to the Terms of Use and Privacy Policy is required.");
  }

  const { firstName, lastName } = splitName(fullName);
  const passwordBytes = new Uint8Array(24);
  crypto.getRandomValues(passwordBytes);

  const body = new URLSearchParams({
    email,
    first_name: firstName || "WeddingWin",
    last_name: lastName,
    active: "2",
    subscription_id: requestedSubscriptionId(subscriptionId),
    password: base64UrlFromBytes(passwordBytes),
    send_email_notifications: "0",
    signup_terms_accepted: "1",
    signup_privacy_accepted: "1",
    signup_terms_accepted_at: consent.acceptedAt,
    signup_terms_version: consent.termsVersion || "",
    signup_privacy_version: consent.privacyVersion || "",
  });

  const created = await callBd("/api/v2/user/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!created.response.ok || created.body.status !== "success") {
    const detail =
      typeof created.body.message === "string"
        ? created.body.message
        : JSON.stringify(created.body.message).slice(0, 180);
    if (/already|duplicate|exists|registered/i.test(detail)) {
      const existing = await fetchBdUserByEmail(email);
      if (existing?.user_id) return existing;
    }

    throw new Error(
      `BD member create failed: ${detail}`,
    );
  }

  const createdUser = unwrapBdUser(created.body.message);
  if (createdUser?.user_id) {
    return await fetchFullBdUserById(createdUser.user_id);
  }

  return await fetchBdUserByEmail(email);
}

export async function ensureBdSessionCookie(user: BdUser | undefined): Promise<BdUser | undefined> {
  // Token must stay stable across logins or website chat threads orphan.
  return (await ensureStableBdIdentity(user, callBd)) as BdUser | undefined;
}

export async function createAppLoginUrl(user: BdUser | undefined, email: string): Promise<string> {
  return await createOneTimeAppLoginUrl(user, email);
}

export async function linkProfileToBdMember(
  profileId: string,
  nativeSession: BdNativeSession,
): Promise<void> {
  const bdMemberId = String(nativeSession.user_id || "").trim();
  if (!profileId || !bdMemberId) {
    throw new Error("Apple profile could not be linked to the WeddingWin member.");
  }
  const { error } = await admin
    .from("profiles")
    .update({ bd_member_id: bdMemberId, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw new Error(`Apple profile link failed: ${error.message}`);
}

async function makeDirectBdAppleLoginResult(args: {
  email: string;
  fullName?: string | null;
  subscriptionId?: string;
  consent?: SignupConsent;
  includeWebsiteRedirect?: boolean;
}): Promise<{ redirectUrl: string; user: Record<string, unknown>; nativeSession: BdNativeSession }> {
  const email = args.email.trim().toLowerCase();
  let user = await fetchBdUserByEmail(email);
  if (!user?.user_id) {
    user = await createBdUserForApple(
      email,
      args.fullName,
      args.subscriptionId,
      args.consent || null,
    );
  }

  user = await ensureBdSessionCookie(user);
  const nativeSession = buildBdNativeSession(user, email);
  if (!nativeSession.user_id || !nativeSession.token) {
    throw new Error("WeddingWin could not create a secure app session. Please try again.");
  }
  const redirectUrl = args.includeWebsiteRedirect === false
    ? ""
    : await createAppLoginUrl(user, email);

  return {
    redirectUrl,
    user: sanitizeBdUser(user, email),
    nativeSession,
  };
}

export async function makeBdAppleLoginResult(args: {
  appleSub: string;
  email: string;
  fullName?: string | null;
  finalRedirect: string;
  subscriptionId?: string;
  consent?: SignupConsent;
  includeWebsiteRedirect?: boolean;
}): Promise<{ redirectUrl: string; user: Record<string, unknown>; nativeSession: BdNativeSession }> {
  if (!args.email) {
    throw new Error("Apple did not provide an email and this Apple account is not linked yet.");
  }
  const finalRedirect = allowedFinalRedirect(args.finalRedirect);

  if (!BD_APPLE_LOGIN_URL) {
    if (BD_API_KEY) {
      return await makeDirectBdAppleLoginResult({
        email: args.email,
        fullName: args.fullName,
        subscriptionId: args.subscriptionId,
        consent: args.consent || null,
        includeWebsiteRedirect: args.includeWebsiteRedirect,
      });
    }
    if (ALLOW_SUPABASE_APPLE_FALLBACK) {
      return {
        redirectUrl: await makeMagicRedirect(args.email, finalRedirect),
        user: { email: args.email },
        nativeSession: { email: args.email },
      };
    }
    throw new Error(
      "BD Apple login bridge is not configured yet. Set BD_APPLE_LOGIN_URL after the BD endpoint can issue a login token.",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "WeddingWinAppleBridge/1.0",
  };
  if (BD_APPLE_LOGIN_SECRET) {
    headers.Authorization = `Bearer ${BD_APPLE_LOGIN_SECRET}`;
  }

  const res = await fetch(BD_APPLE_LOGIN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: "apple",
      apple_sub: args.appleSub,
      email: args.email,
      full_name: args.fullName || "",
      final_redirect: finalRedirect,
      subscription_id: requestedSubscriptionId(args.subscriptionId),
    }),
  });

  let data: { token?: string; login_url?: string; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    // Keep the clearer status-based error below.
  }

  if (!res.ok) {
    throw new Error(data.error || `BD Apple login bridge failed with status ${res.status}.`);
  }

  if (data.login_url) {
    return {
      redirectUrl: new URL(data.login_url, DEFAULT_FINAL).toString(),
      user: { email: args.email },
      nativeSession: { email: args.email },
    };
  }
  if (data.token) {
    return {
      redirectUrl: new URL(`/login/fromsignup/${encodeURIComponent(data.token)}`, DEFAULT_FINAL).toString(),
      user: { email: args.email },
      nativeSession: { email: args.email },
    };
  }

  throw new Error("BD Apple login bridge did not return token or login_url.");
}

export async function makeBdAppleLoginRedirect(args: {
  appleSub: string;
  email: string;
  fullName?: string | null;
  finalRedirect: string;
}): Promise<string> {
  return (await makeBdAppleLoginResult(args)).redirectUrl;
}
