import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { ensureStableBdIdentity } from "../_shared/bd_identity.ts";
import {
  createNativeAuthExchange,
} from "../_shared/auth_exchange.ts";
import { findAuthUserByEmail } from "../_shared/auth_users.ts";
import { redeemOAuthLoginAttempt } from "../_shared/oauth_attempt.ts";
import { googleOAuthErrorResponse } from "../_shared/google_oauth_error.ts";
import { requireCurrentPolicyConsent } from "../_shared/policy_consent.ts";
import { assertAppleSignupAccountType } from "../_shared/apple_signup_role.ts";
import {
  type NativeSignupRole,
  nativeSignupErrorMessage,
  nativeSignupSubscriptionId,
  requireNativeSignupRole,
} from "../_shared/native_signup_intent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CALLBACK_URL =
  Deno.env.get("GOOGLE_CALLBACK_URL") ||
  "https://www.weddingwin.ca/auth/google-callback";
const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET") || "";
const BD_DEFAULT_SUBSCRIPTION_ID = Deno.env.get("BD_DEFAULT_SUBSCRIPTION_ID") || "18";
const BD_VENDOR_SUBSCRIPTION_ID = "17";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

type BdEnvelope = {
  status?: string;
  message?: unknown;
};

type BdUser = Record<string, unknown>;

type BdNativeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};

type SignupConsent = {
  acceptedAt: string;
  termsVersion?: string;
  privacyVersion?: string;
} | null;

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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const binary = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return new TextDecoder().decode(Uint8Array.from(binary, (value) => value.charCodeAt(0)));
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function allowedFinalRedirect(value: unknown): string | null {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (url.protocol === "https:" && host === "weddingwin.ca") return url.toString();
    if (
      url.protocol === "weddingwin:" &&
      (url.hostname.toLowerCase() === "bd-login" || url.pathname.replace(/\/+$/, "").endsWith("/bd-login"))
    ) {
      return url.toString();
    }
  } catch {
    // Invalid or untrusted redirect.
  }
  return null;
}

type VerifiedGoogleState = {
  r: string;
  n: string;
  s: string;
  c: SignupConsent;
  p: string;
  exp: number;
  g?: NativeSignupRole;
};

export async function verifyGoogleState(encoded: string): Promise<VerifiedGoogleState> {
  if (!APP_LOGIN_SECRET) throw new Error("APP_LOGIN_SECRET is not configured");
  const parsed = JSON.parse(b64urlDecode(encoded)) as Record<string, unknown>;
  const redirect = allowedFinalRedirect(parsed.r);
  const nonce = String(parsed.n || "").trim();
  const expires = Number(parsed.exp || 0);
  const signature = String(parsed.h || "").trim();
  const codeChallenge = String(parsed.p || "").trim();
  if (
    !redirect ||
    !nonce ||
    !signature ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) ||
    !Number.isFinite(expires)
  ) {
    throw new Error("Invalid Google sign-in state.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (expires < now || expires > now + 600) throw new Error("Google sign-in state expired.");

  const consent = parsed.c && typeof parsed.c === "object" && (parsed.c as Record<string, unknown>).acceptedAt
    ? {
        acceptedAt: String((parsed.c as Record<string, unknown>).acceptedAt),
        termsVersion: String((parsed.c as Record<string, unknown>).termsVersion || ""),
        privacyVersion: String((parsed.c as Record<string, unknown>).privacyVersion || ""),
      }
    : null;
  const signedPayload = {
    r: redirect,
    n: nonce,
    s: requestedSubscriptionId(parsed.s),
    c: consent,
    p: codeChallenge,
    exp: expires,
    ...(Object.hasOwn(parsed, "g") ? { g: requireNativeSignupRole(parsed.g) } : {}),
  };
  if (signedPayload.g && (!redirect.startsWith("weddingwin:") || String(parsed.s) !== nativeSignupSubscriptionId(signedPayload.g))) {
    throw new Error("Invalid Google signup account type.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_LOGIN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signature) as BufferSource,
    new TextEncoder().encode(JSON.stringify(signedPayload)) as BufferSource,
  );
  if (!valid) throw new Error("Invalid Google sign-in state signature.");
  return signedPayload;
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

function sanitizeBdUser(user: BdUser | undefined, email: string) {
  const safe: Record<string, unknown> = { email };
  if (!user) return safe;

  for (const field of SAFE_BD_USER_FIELDS) {
    if (user[field] !== undefined && user[field] !== null) {
      safe[field] = user[field];
    }
  }

  return safe;
}

function buildBdNativeSession(user: BdUser | undefined, email: string): BdNativeSession {
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

function unwrapBdUser(message: unknown): BdUser | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdUser) : undefined;
  }

  return message && typeof message === "object" ? (message as BdUser) : undefined;
}

async function callBd(path: string, init: RequestInit = {}): Promise<{ response: Response; body: BdEnvelope }> {
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

async function fetchFullBdUserById(userId: unknown): Promise<BdUser | undefined> {
  const fullUser = await callBd(`/api/v2/user/get/${encodeURIComponent(String(userId))}`);
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return unwrapBdUser(fullUser.body.message);
  }

  return undefined;
}

async function fetchBdUserByEmail(email: string): Promise<BdUser | undefined> {
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

async function createBdUserForGoogle(
  email: string,
  fullName?: string | null,
  subscriptionId = BD_DEFAULT_SUBSCRIPTION_ID,
  consent: SignupConsent = null,
  expectedSignupRole?: NativeSignupRole,
): Promise<BdUser | undefined> {
  const policyConsent = requireCurrentPolicyConsent(consent);

  const { firstName, lastName } = splitName(fullName);
  const passwordBytes = new Uint8Array(24);
  crypto.getRandomValues(passwordBytes);

  const body = new URLSearchParams({
    email,
    first_name: firstName || "WeddingWin",
    last_name: lastName,
    active: "2",
    subscription_id: expectedSignupRole ? nativeSignupSubscriptionId(expectedSignupRole) : requestedSubscriptionId(subscriptionId),
    password: base64UrlFromBytes(passwordBytes),
    send_email_notifications: "0",
    signup_terms_accepted: "1",
    signup_privacy_accepted: "1",
    signup_terms_accepted_at: policyConsent.acceptedAt,
    signup_terms_version: policyConsent.termsVersion,
    signup_privacy_version: policyConsent.privacyVersion,
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

async function ensureBdSessionCookie(user: BdUser | undefined): Promise<BdUser | undefined> {
  // Token must stay stable across logins or website chat threads orphan.
  return (await ensureStableBdIdentity(user, callBd)) as BdUser | undefined;
}

async function makeDirectBdGoogleLoginResult(args: {
  email: string;
  fullName?: string | null;
  subscriptionId?: string;
  consent?: SignupConsent;
  expectedSignupRole?: NativeSignupRole;
}): Promise<{ user: Record<string, unknown>; nativeSession: BdNativeSession }> {
  const email = args.email.trim().toLowerCase();
  let user = await fetchBdUserByEmail(email);
  assertAppleSignupAccountType(user, args.expectedSignupRole);
  if (!user?.user_id) {
    user = await createBdUserForGoogle(
      email,
      args.fullName,
      args.subscriptionId,
      args.consent || null,
      args.expectedSignupRole,
    );
  }

  assertAppleSignupAccountType(user, args.expectedSignupRole);
  user = await ensureBdSessionCookie(user);
  const nativeSession = buildBdNativeSession(user, email);
  if (!nativeSession.user_id || !nativeSession.token) {
    throw new Error("WeddingWin could not create a secure app session. Please try again.");
  }

  return {
    user: sanitizeBdUser(user, email),
    nativeSession,
  };
}

function isNativeAppRedirect(url: URL): boolean {
  const path = url.pathname.replace(/\/+$/, "");
  return (
    url.protocol === "weddingwin:" ||
    (url.protocol === "exp:" && path.endsWith("/bd-login")) ||
    path.endsWith("/bd-login")
  );
}

function appRedirectWithError(appRedirect: URL, message: string): Response {
  appRedirect.searchParams.set("error", "google_app_bridge_failed");
  appRedirect.searchParams.set("error_description", message);
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: appRedirect.toString(),
      "Cache-Control": "no-store",
    },
  });
}

async function getConfig(): Promise<{ id: string; secret: string }> {
  const { data, error } = await admin
    .from("admin_config")
    .select("key, value")
    .in("key", ["google_client_id", "google_client_secret"]);
  if (error) throw new Error(`config read failed: ${error.message}`);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const id = map.get("google_client_id");
  const secret = map.get("google_client_secret");
  if (!id || !secret) throw new Error("google credentials not configured");
  return { id, secret };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let verifiedReturnUrl: string | null = null;
  const errorPage = (message: string) =>
    googleOAuthErrorResponse(message, verifiedReturnUrl, corsHeaders);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (!stateRaw) return errorPage("Missing Google sign-in state.");

    let state: VerifiedGoogleState;
    try {
      state = await verifyGoogleState(stateRaw);
    } catch (error) {
      return errorPage(error instanceof Error ? error.message : "Invalid Google sign-in state.");
    }
    const finalRedirect = state.r;
    verifiedReturnUrl = finalRedirect;
    const subscriptionId = state.s;
    const consent = state.c;

    try {
      await redeemOAuthLoginAttempt({
        admin,
        request: req,
        provider: "google",
        state: stateRaw,
      });
    } catch (error) {
      return errorPage(error instanceof Error ? error.message : "Invalid Google sign-in state.");
    }

    if (oauthError) return errorPage(`Google returned: ${oauthError}`);
    if (!code) return errorPage("Missing authorization code.");

    const { id: clientId, secret: clientSecret } = await getConfig();

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return errorPage(`Token exchange failed: ${text.slice(0, 300)}`);
    }

    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) return errorPage("Google did not return an ID token.");

    let claims: {
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
      sub?: string;
      aud?: string;
      iss?: string;
      nonce?: string;
    };
    try {
      const verified = await jwtVerify(tokenJson.id_token, GOOGLE_JWKS, {
        audience: clientId,
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        algorithms: ["RS256"],
      });
      claims = verified.payload as typeof claims;
    } catch {
      return errorPage("Google ID token signature verification failed.");
    }
    if (claims.nonce !== state.n) return errorPage("Google sign-in nonce mismatch.");
    if (!claims.email) return errorPage("Google account has no email.");
    if (claims.email_verified !== true) return errorPage("Google email is not verified.");

    const email = claims.email;

    let appRedirect: URL | null = null;
    try {
      appRedirect = new URL(finalRedirect);
    } catch {
      appRedirect = null;
    }

    if (appRedirect && isNativeAppRedirect(appRedirect)) {
      try {
        const bd = await makeDirectBdGoogleLoginResult({
          email,
          fullName: claims.name || "",
          subscriptionId,
          consent,
          expectedSignupRole: state.g,
        });

        const exchangeCode = await createNativeAuthExchange({
          provider: "google",
          codeChallenge: state.p,
          bdMemberId: bd.nativeSession.user_id,
          payload: {
            user: bd.user,
            native_session: bd.nativeSession,
          },
        });

        appRedirect.searchParams.set("ok", "1");
        appRedirect.searchParams.set("provider", "google");
        appRedirect.searchParams.set("exchange_code", exchangeCode);

        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            Location: appRedirect.toString(),
            "Cache-Control": "no-store",
          },
        });
      } catch (err) {
        const message = nativeSignupErrorMessage(err instanceof Error ? err.message : String(err));
        return appRedirectWithError(appRedirect, message);
      }
    }

    let userId: string | null = null;
    const existing = await findAuthUserByEmail(email);

    if (existing) {
      userId = existing.id;
      const md = existing.user_metadata || {};
      await admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: {
          ...md,
          full_name: md.full_name || claims.name || "",
          name: md.name || claims.name || "",
          avatar_url: md.avatar_url || claims.picture || "",
          picture: md.picture || claims.picture || "",
          provider: "google",
        },
      });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: claims.name || "",
          name: claims.name || "",
          avatar_url: claims.picture || "",
          picture: claims.picture || "",
          provider: "google",
        },
      });
      if (createErr || !created.user) {
        return errorPage(`createUser failed: ${createErr?.message ?? "unknown"}`);
      }
      userId = created.user.id;
    }

    if (!userId) return errorPage("Could not establish user.");

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: finalRedirect },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return errorPage(`generateLink failed: ${linkErr?.message ?? "no link"}`);
    }

    const verifyRes = await fetch(linkData.properties.action_link, {
      redirect: "manual",
      headers: { "User-Agent": "WeddingWinOAuthBridge/1.0" },
    });

    const verifyLocation = verifyRes.headers.get("location") || "";
    if (!verifyLocation) {
      return errorPage(
        `Supabase verify did not redirect (status ${verifyRes.status}). Body: ${(await verifyRes.text()).slice(0, 300)}`
      );
    }

    let parsedVerify: URL;
    try {
      parsedVerify = new URL(verifyLocation);
    } catch {
      return errorPage(`Verify returned invalid Location: ${verifyLocation.slice(0, 300)}`);
    }

    const hash = parsedVerify.hash.replace(/^#/, "");
    const queryError =
      parsedVerify.searchParams.get("error_description") ||
      parsedVerify.searchParams.get("error");

    if (!hash || !hash.includes("access_token")) {
      const detail = queryError
        ? `Supabase rejected the sign-in: ${queryError}`
        : `Supabase verify produced no tokens. Redirect was: ${verifyLocation.slice(0, 300)}`;
      return errorPage(detail);
    }

    const finalUrl = new URL(finalRedirect);
    finalUrl.searchParams.set("ww_oauth", "v2");
    finalUrl.hash = hash;

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: finalUrl.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorPage(msg);
  }
});
