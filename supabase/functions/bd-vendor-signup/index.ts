const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET") || "";
const BD_VENDOR_SUBSCRIPTION_ID = Deno.env.get("BD_VENDOR_SUBSCRIPTION_ID") || "17";

type BdEnvelope = {
  status?: string;
  message?: unknown;
};

type BdUser = Record<string, unknown>;

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function cleanPlainText(value: unknown, maxLength: number) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (/[<>]/.test(text)) {
    throw new Error("Details cannot contain HTML.");
  }
  return text.slice(0, maxLength);
}

function cleanEmail(value: unknown) {
  const email = cleanPlainText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (email.endsWith("@privaterelay.appleid.com")) {
    throw new Error("Please use your regular email address.");
  }
  return email;
}

function cleanPassword(value: unknown) {
  const password = String(value || "").trim();
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (/[<>]/.test(password)) {
    throw new Error("Password cannot contain HTML characters.");
  }
  return password.slice(0, 120);
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

function unwrapBdUser(message: unknown): BdUser | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdUser) : undefined;
  }

  return message && typeof message === "object" ? (message as BdUser) : undefined;
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

function buildBdNativeSession(user: BdUser | undefined, email: string) {
  const session: Record<string, unknown> = { email };

  if (user?.user_id !== undefined && user.user_id !== null) {
    session.user_id = user.user_id;
  }
  if (typeof user?.token === "string" && user.token.trim()) {
    session.token = user.token;
  }
  if (typeof user?.cookie === "string" && user.cookie.trim()) {
    session.cookie = user.cookie;
  }

  return session;
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

async function ensureBdSessionCookie(user: BdUser | undefined): Promise<BdUser | undefined> {
  if (!user?.user_id) return user;

  const existingCookie = typeof user.cookie === "string" ? user.cookie.trim() : "";
  if (existingCookie) return user;

  const sessionCookie = createBdSessionCookie();
  const updateBody = new URLSearchParams({
    user_id: String(user.user_id),
    cookie: sessionCookie,
  });

  const update = await callBd("/api/v2/user/update", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: updateBody.toString(),
  });

  if (!update.response.ok || update.body.status !== "success") {
    return user;
  }

  return { ...user, cookie: sessionCookie };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const email = cleanEmail(body.email);
    const password = cleanPassword(body.password);
    const firstName = cleanPlainText(body.first_name, 80) || "WeddingWin Vendor";
    const acceptedAt = cleanPlainText(body.accepted_at, 40);

    if (body.accepted_terms !== true || body.accepted_privacy !== true || !acceptedAt) {
      throw new Error("Agreement to the Terms of Use and Privacy Policy is required.");
    }

    const existing = await fetchBdUserByEmail(email);
    if (existing?.user_id) {
      return jsonResponse(
        { error: "An account already exists with this email. Please log in instead." },
        409,
      );
    }

    const createBody = new URLSearchParams({
      email,
      first_name: firstName,
      company: firstName,
      active: "2",
      subscription_id: BD_VENDOR_SUBSCRIPTION_ID,
      country_code: "CA",
      password,
      pass: password,
      send_email_notifications: "0",
      signup_terms_accepted: "1",
      signup_privacy_accepted: "1",
      signup_terms_accepted_at: acceptedAt,
      signup_terms_version: cleanPlainText(body.terms_version, 40),
      signup_privacy_version: cleanPlainText(body.privacy_version, 40),
    });

    const created = await callBd("/api/v2/user/create", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createBody.toString(),
    });

    if (!created.response.ok || created.body.status !== "success") {
      const detail =
        typeof created.body.message === "string"
          ? created.body.message
          : JSON.stringify(created.body.message).slice(0, 180);
      console.error("bd-vendor-signup:create-failed", {
        email,
        status: created.response.status,
        detail,
      });
      return jsonResponse({ error: "Account could not be created.", detail }, 502);
    }

    let user = await fetchBdUserByEmail(email);
    if (user?.user_id) {
      user = await fetchFullBdUserById(user.user_id);
    }

    user = await ensureBdSessionCookie(user);
    const appLoginUrl = await createAppLoginUrl(user, email);

    return jsonResponse({
      ok: true,
      user: sanitizeBdUser(user, email),
      native_session: buildBdNativeSession(user, email),
      app_login_url: appLoginUrl,
      dashboard_url: `${BD_API_BASE_URL}/account/home`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signup failed.";
    console.error("bd-vendor-signup:error", message);
    return jsonResponse({ error: message }, 400);
  }
});
