import { createClient } from "npm:@supabase/supabase-js@2.58.0";

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
const DEFAULT_FINAL = "https://www.weddingwin.ca/";
const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET") || "";
const BD_DEFAULT_SUBSCRIPTION_ID = Deno.env.get("BD_DEFAULT_SUBSCRIPTION_ID") || "18";
const BD_VENDOR_SUBSCRIPTION_ID = "17";

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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlFromString(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function createBdSessionCookie(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createBdLoginToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
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

async function ensureBdSessionCookie(user: BdUser | undefined): Promise<BdUser | undefined> {
  if (!user?.user_id) return user;

  const existingToken = typeof user.token === "string" ? user.token.trim() : "";
  const existingCookie = typeof user.cookie === "string" ? user.cookie.trim() : "";
  if (existingToken && existingCookie) return user;

  const loginToken = existingToken || createBdLoginToken();
  const sessionCookie = createBdSessionCookie();
  const updateValues: Record<string, string> = {
    user_id: String(user.user_id),
  };
  if (!existingToken) updateValues.token = loginToken;
  if (!existingCookie) updateValues.cookie = sessionCookie;
  const updateBody = new URLSearchParams(updateValues);

  const update = await callBd("/api/v2/user/update", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: updateBody.toString(),
  });

  if (!update.response.ok || update.body.status !== "success") {
    return user;
  }

  return { ...user, token: loginToken, cookie: existingCookie || sessionCookie };
}

async function createAppLoginUrl(user: BdUser | undefined, email: string): Promise<string> {
  if (!APP_LOGIN_SECRET) {
    throw new Error("APP_LOGIN_SECRET is not configured");
  }

  if (!user?.user_id || typeof user?.token !== "string" || !user.token.trim()) {
    throw new Error("BD member is missing a login token.");
  }

  const payload: Record<string, unknown> = {
    email,
    exp: Math.floor(Date.now() / 1000) + 120,
  };

  for (const field of APP_LOGIN_TICKET_FIELDS) {
    if (user[field] !== undefined && user[field] !== null) {
      payload[field] = user[field];
    }
  }

  const encodedPayload = base64UrlFromString(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_LOGIN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );
  const ticket = `${encodedPayload}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  return `${BD_API_BASE_URL}/app-login?t=${encodeURIComponent(ticket)}`;
}

async function makeDirectBdGoogleLoginResult(args: {
  email: string;
  fullName?: string | null;
  subscriptionId?: string;
  consent?: SignupConsent;
}): Promise<{ redirectUrl: string; user: Record<string, unknown>; nativeSession: BdNativeSession }> {
  const email = args.email.trim().toLowerCase();
  let user = await fetchBdUserByEmail(email);
  if (!user?.user_id) {
    user = await createBdUserForGoogle(
      email,
      args.fullName,
      args.subscriptionId,
      args.consent || null,
    );
  }

  user = await ensureBdSessionCookie(user);
  const redirectUrl = await createAppLoginUrl(user, email);

  return {
    redirectUrl,
    user: sanitizeBdUser(user, email),
    nativeSession: buildBdNativeSession(user, email),
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("invalid id_token");
  return JSON.parse(b64urlDecode(part));
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

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{background:#0b0b0c;color:#e5e5e7;font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{text-align:center;padding:32px;max-width:480px}.spinner{width:32px;height:32px;border:3px solid #2a2a2e;border-top-color:#d4af37;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.err{color:#ff6b6b;font-family:monospace;font-size:12px;word-break:break-all;margin-top:16px;text-align:left}</style>
</head><body><div class="card">${body}</div></body></html>`;
}

function errorPage(message: string): Response {
  const body = `<div style="color:#ff6b6b;font-weight:600;margin-bottom:12px">Sign-in failed</div><div>${message}</div><div style="margin-top:24px"><a href="${DEFAULT_FINAL}" style="color:#d4af37">Go back</a></div>`;
  return new Response(htmlPage("Sign-in failed", body), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
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

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) return errorPage(`Google returned: ${oauthError}`);
    if (!code) return errorPage("Missing authorization code.");

    let finalRedirect = DEFAULT_FINAL;
    let subscriptionId = BD_DEFAULT_SUBSCRIPTION_ID;
    let consent: SignupConsent = null;
    if (stateRaw) {
      try {
        const parsed = JSON.parse(b64urlDecode(stateRaw));
        if (parsed && typeof parsed.r === "string") finalRedirect = parsed.r;
        subscriptionId = requestedSubscriptionId(parsed?.s);
        if (parsed?.c?.acceptedAt) {
          consent = {
            acceptedAt: String(parsed.c.acceptedAt),
            termsVersion: String(parsed.c.termsVersion || ""),
            privacyVersion: String(parsed.c.privacyVersion || ""),
          };
        }
      } catch {
        // ignore malformed state, fall back to default
      }
    }

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

    const claims = decodeJwtPayload(tokenJson.id_token) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
      sub?: string;
      aud?: string;
      iss?: string;
    };

    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
      return errorPage("Invalid token issuer.");
    }
    if (claims.aud !== clientId) {
      return errorPage("Token audience mismatch.");
    }
    if (!claims.email) return errorPage("Google account has no email.");
    if (claims.email_verified === false) return errorPage("Google email is not verified.");

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
        });

        appRedirect.searchParams.set("ok", "1");
        appRedirect.searchParams.set("provider", "google");
        appRedirect.searchParams.set("app_login_url", bd.redirectUrl);
        appRedirect.searchParams.set("user", b64urlEncode(JSON.stringify(bd.user)));
        appRedirect.searchParams.set(
          "native_session",
          b64urlEncode(JSON.stringify(bd.nativeSession)),
        );

        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            Location: appRedirect.toString(),
            "Cache-Control": "no-store",
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return appRedirectWithError(appRedirect, message);
      }
    }

    let userId: string | null = null;
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return errorPage(`listUsers failed: ${listErr.message}`);
    const existing = list.users.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );

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
