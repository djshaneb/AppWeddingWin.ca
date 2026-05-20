import bcrypt from "npm:bcryptjs@2.4.3";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY");
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BdEnvelope = {
  status?: string;
  message?: unknown;
};

type BdUser = Record<string, unknown>;
type NativeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};

const SAFE_USER_FIELDS = [
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function sanitizeUser(user: BdUser | undefined, email: string) {
  const safe: Record<string, unknown> = { email };

  if (!user) return safe;

  for (const field of SAFE_USER_FIELDS) {
    if (user[field] !== undefined && user[field] !== null) {
      safe[field] = user[field];
    }
  }

  return safe;
}

function buildNativeSession(user: BdUser | undefined, email: string) {
  const session: Record<string, unknown> = { email };

  for (const field of ["user_id", "token", "cookie"] as const) {
    if (user?.[field] !== undefined && user[field] !== null) {
      session[field] = user[field];
    }
  }

  return session;
}

function createBdSessionCookie() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getPasswordHash(user: BdUser | undefined) {
  const hash = typeof user?.password === "string" ? user.password.trim() : "";

  return hash && hash !== "********" ? hash : "";
}

function unwrapBdUser(message: unknown): BdUser | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdUser) : undefined;
  }

  return message && typeof message === "object" ? (message as BdUser) : undefined;
}

function getBdLoginUrl(user: BdUser | undefined) {
  const token = typeof user?.token === "string" ? user.token.trim() : "";

  if (!token) return "";

  return `${BD_API_BASE_URL}/login/token/${encodeURIComponent(token)}/home`;
}

function base64UrlFromBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlFromString(value: string) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

async function createAppLoginUrl(user: BdUser | undefined, email: string) {
  if (!APP_LOGIN_SECRET) {
    return "";
  }

  if (!user?.user_id || typeof user?.token !== "string" || !user.token.trim()) {
    return "";
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
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  const ticket = `${encodedPayload}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  return `${BD_API_BASE_URL}/app-login?t=${encodeURIComponent(ticket)}`;
}

async function callBd(path: string, init: RequestInit = {}) {
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

async function fetchFullUserById(userId: string | number) {
  const fullUser = await callBd(
    `/api/v2/user/get/${encodeURIComponent(String(userId))}?include_password=1`
  );

  if (fullUser.response.ok && fullUser.body.status === "success") {
    return unwrapBdUser(fullUser.body.message);
  }

  return undefined;
}

async function ensureBdSessionCookie(user: BdUser | undefined) {
  if (!user?.user_id) {
    return user;
  }

  const existingCookie = typeof user.cookie === "string" ? user.cookie.trim() : "";
  if (existingCookie) {
    return user;
  }

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
    console.error("Unable to persist BD session cookie", {
      user_id: user.user_id,
      http_status: update.response.status,
      bd_status: update.body.status,
      bd_message:
        typeof update.body.message === "string"
          ? update.body.message.slice(0, 180)
          : JSON.stringify(update.body.message).slice(0, 180),
    });
    return user;
  }

  return {
    ...user,
    cookie: sessionCookie,
  };
}

function nativeSessionMatchesUser(session: NativeSession, user: BdUser | undefined) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { email, password, native_session } = body;

    if (native_session && typeof native_session === "object") {
      const session = native_session as NativeSession;
      let user = session.user_id ? await fetchFullUserById(session.user_id) : undefined;

      if (!nativeSessionMatchesUser(session, user)) {
        return jsonResponse({ error: "Stored session expired. Please sign in again." }, 401);
      }

      const cleanEmail = String(user?.email || session.email || "").trim().toLowerCase();
      user = await ensureBdSessionCookie(user);
      const appLoginUrl = await createAppLoginUrl(user, cleanEmail);
      const loginUrl = getBdLoginUrl(user);

      if (!appLoginUrl && !loginUrl) {
        return jsonResponse({ error: "Dashboard sign-in is not available for this account." }, 502);
      }

      return jsonResponse({
        ok: true,
        user: sanitizeUser(user, cleanEmail),
        native_session: buildNativeSession(user, cleanEmail),
        app_login_url: appLoginUrl,
        login_url: loginUrl,
        dashboard_url: `${BD_API_BASE_URL}/account/home`,
      });
    }

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();

    if (!cleanEmail || !cleanPassword) {
      return jsonResponse({ error: "Email and password are required." }, 400);
    }

    const loginBody = new URLSearchParams({
      email: cleanEmail,
      password: cleanPassword,
      pass: cleanPassword,
    });

    const login = await callBd("/api/v2/user/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: loginBody.toString(),
    });

    let bdCredentialAccepted = login.response.ok && login.body.status === "success";
    let user: BdUser | undefined;

    const usersUrl = new URL("/api/v2/user/get", BD_API_BASE_URL);
    usersUrl.searchParams.set("limit", "1");
    usersUrl.searchParams.set("property", "email");
    usersUrl.searchParams.set("property_value", cleanEmail);
    usersUrl.searchParams.set("property_operator", "eq");
    usersUrl.searchParams.set("include_password", "1");

    const users = await callBd(`${usersUrl.pathname}${usersUrl.search}`);
    const rows = Array.isArray(users.body.message) ? users.body.message : [];
    user = rows[0] as BdUser | undefined;

    if (user?.user_id) {
      const fullUser = await callBd(
        `/api/v2/user/get/${encodeURIComponent(String(user.user_id))}?include_password=1`
      );
      if (fullUser.response.ok && fullUser.body.status === "success") {
        user = unwrapBdUser(fullUser.body.message) || user;
      }
    }

    if (!bdCredentialAccepted) {
      const passwordHash = getPasswordHash(user);
      if (passwordHash) {
        bdCredentialAccepted = await bcrypt.compare(cleanPassword, passwordHash);
      }
    }

    if (!bdCredentialAccepted) {
      console.error("BD credential check rejected login", {
        email: cleanEmail,
        http_status: login.response.status,
        bd_status: login.body.status,
        bd_message:
          typeof login.body.message === "string"
            ? login.body.message.slice(0, 180)
            : JSON.stringify(login.body.message).slice(0, 180),
      });
      return jsonResponse(
        {
          error: "Invalid email or password.",
          detail: `user_found=${Boolean(user?.user_id)} has_hash=${Boolean(
            getPasswordHash(user)
          )} api=${login.response.status}`,
        },
        401
      );
    }

    user = await ensureBdSessionCookie(user);

    const loginUrl = getBdLoginUrl(user);
    const appLoginUrl = await createAppLoginUrl(user, cleanEmail);

    if (!appLoginUrl && !loginUrl) {
      console.error("BD login succeeded but no member token was returned", {
        email: cleanEmail,
        user_id: user?.user_id,
      });
      return jsonResponse({ error: "Dashboard sign-in is not available for this account." }, 502);
    }

    return jsonResponse({
      ok: true,
      user: sanitizeUser(user, cleanEmail),
      native_session: buildNativeSession(user, cleanEmail),
      app_login_url: appLoginUrl,
      login_url: loginUrl,
      dashboard_url: `${BD_API_BASE_URL}/account/home`,
    });
  } catch (error) {
    console.error("bd-email-login failed", error);
    return jsonResponse({
      error: "Login is temporarily unavailable.",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
