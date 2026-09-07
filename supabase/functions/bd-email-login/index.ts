import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import {
  ensureStableBdIdentity,
  nativeSessionMatchesCachedBdIdentity,
} from "../_shared/bd_identity.ts";
import {
  createOneTimeAppLoginUrl,
  sha256Base64Url,
} from "../_shared/auth_exchange.ts";
import {
  BdNativeSessionRefreshUnavailable,
  resolveBdNativeSessionRefresh,
} from "../_shared/bd_native_session_refresh.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") ||
  "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

function unwrapBdUser(message: unknown): BdUser | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdUser) : undefined;
  }

  return message && typeof message === "object"
    ? (message as BdUser)
    : undefined;
}

async function createAppLoginUrl(
  user: BdUser | undefined,
  email: string,
  destination: "home" | "builder-sso" = "home",
) {
  return await createOneTimeAppLoginUrl(user, email, destination);
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

async function fetchCachedUserByVerifiedEmail(email: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("BD identity cache is not configured.");
  }

  const url = new URL("/rest/v1/bd_users_cache", SUPABASE_URL);
  url.searchParams.set("email", `eq.${email}`);
  url.searchParams.set(
    "select",
    "user_id,token,cookie,email,company,first_name,last_name,avatar_url,filename",
  );
  url.searchParams.set("limit", "2");

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`BD identity cache fallback failed (${response.status}).`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("BD identity cache fallback returned an invalid response.");
  }
  if (rows.length > 1) {
    throw new Error("BD identity cache fallback found an ambiguous email.");
  }

  const row = rows[0] as BdUser | undefined;
  if (!row?.user_id || String(row.email || "").trim().toLowerCase() !== email) {
    return undefined;
  }
  return row.avatar_url && !row.image_main_file
    ? { ...row, image_main_file: row.avatar_url }
    : row;
}

async function ensureBdSessionCookie(user: BdUser | undefined) {
  // BD strips token/cookie from API reads, so the stable identity lives in
  // bd_users_cache. Never regenerate a token for a user who already has one -
  // doing so orphans their chat threads from the website inbox.
  return (await ensureStableBdIdentity(user, callBd)) as BdUser | undefined;
}

type LoginRateKey = {
  hash: string;
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
  clearOnSuccess: boolean;
};

function requestSourceAddress(req: Request) {
  const forwarded = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";
  return forwarded.trim().toLowerCase().slice(0, 128) || "unknown";
}

async function loginRateKeys(req: Request, email: string): Promise<LoginRateKey[]> {
  const source = requestSourceAddress(req);
  return [
    {
      hash: await sha256Base64Url(`source:${source}`),
      maxAttempts: 40,
      windowSeconds: 900,
      blockSeconds: 900,
      clearOnSuccess: false,
    },
    {
      hash: await sha256Base64Url(`source-email:${source}:${email}`),
      maxAttempts: 10,
      windowSeconds: 900,
      blockSeconds: 900,
      clearOnSuccess: true,
    },
  ];
}

async function loginRateLimitStatus(keys: LoginRateKey[]) {
  const { data, error } = await admin
    .from("app_login_rate_limits")
    .select("key_hash,window_started_at,attempt_count,blocked_until")
    .in("key_hash", keys.map((key) => key.hash));
  if (error) throw new Error("Login rate limiting is temporarily unavailable.");

  const now = Date.now();
  let retryAfterSeconds = 0;
  for (const key of keys) {
    const row = (data || []).find((candidate) => candidate.key_hash === key.hash);
    if (!row) continue;
    const blockedUntil = Date.parse(String(row.blocked_until || ""));
    if (Number.isFinite(blockedUntil) && blockedUntil > now) {
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((blockedUntil - now) / 1000));
      continue;
    }
    const windowStartedAt = Date.parse(String(row.window_started_at || ""));
    const windowEndsAt = windowStartedAt + key.windowSeconds * 1000;
    if (
      Number(row.attempt_count || 0) >= key.maxAttempts &&
      Number.isFinite(windowEndsAt) &&
      windowEndsAt > now
    ) {
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((windowEndsAt - now) / 1000));
    }
  }
  return { allowed: retryAfterSeconds <= 0, retry_after_seconds: retryAfterSeconds };
}

async function recordFailedLogin(keys: LoginRateKey[]) {
  const results = await Promise.all(keys.map((key) =>
    admin.rpc("consume_app_login_rate_limit", {
      p_key_hash: key.hash,
      p_max_attempts: key.maxAttempts,
      p_window_seconds: key.windowSeconds,
      p_block_seconds: key.blockSeconds,
    })
  ));
  if (results.some((result) => result.error)) {
    throw new Error("Login rate limiting is temporarily unavailable.");
  }
  const states = results.map((result) =>
    result.data && typeof result.data === "object"
      ? result.data as { allowed?: boolean; retry_after_seconds?: number }
      : { allowed: false }
  );
  return {
    allowed: states.every((state) => state.allowed === true),
    retry_after_seconds: Math.max(
      0,
      ...states.map((state) => Number(state.retry_after_seconds || 0)),
    ),
  };
}

async function clearSuccessfulLoginRateLimits(keys: LoginRateKey[]) {
  // A valid login may clear only the budget for that source+account pair. The
  // global source budget is intentionally cumulative so an attacker cannot use
  // credentials for one known account to reset an IP-wide password-spray limit.
  const hashesToClear = keys
    .filter((key) => key.clearOnSuccess)
    .map((key) => key.hash);
  if (!hashesToClear.length) return;
  const { error } = await admin
    .from("app_login_rate_limits")
    .delete()
    .in("key_hash", hashesToClear);
  if (error) throw new Error("Login rate limiting is temporarily unavailable.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const diagnosticId = crypto.randomUUID();
  try {
    const body = await req.json();
    const { email, password, native_session } = body;

    if (native_session && typeof native_session === "object") {
      const session = native_session as NativeSession;
      let user = await resolveBdNativeSessionRefresh(session, {
        fetchMember: (id) => {
          // BD's single-record route returns a non-success envelope when a
          // member is gone. Its exact-ID filter returns success + [] instead,
          // matching the authoritative absence check used by account cleanup.
          const query = new URLSearchParams({
            property: "user_id",
            property_operator: "eq",
            property_value: id,
            limit: "2",
          });
          return callBd(`/api/v2/user/get?${query}`, {
            signal: AbortSignal.timeout(5000),
          });
        },
        // Membership is checked live first. The cache supplies only the
        // canonical token because BD's v2 API deliberately omits it.
        matchesIdentity: nativeSessionMatchesCachedBdIdentity,
      });

      if (!user) {
        return jsonResponse({
          error: "Stored session expired. Please sign in again.",
        }, 401);
      }

      const cleanEmail = String(user?.email || session.email || "").trim()
        .toLowerCase();
      user = await ensureBdSessionCookie(user);
      const destination = body?.target_path === "/builder-sso"
        ? "builder-sso"
        : "home";
      const appLoginUrl = await createAppLoginUrl(
        user,
        cleanEmail,
        destination,
      );

      if (!appLoginUrl) {
        return jsonResponse({
          error: "Dashboard sign-in is not available for this account.",
        }, 502);
      }

      return jsonResponse({
        ok: true,
        user: sanitizeUser(user, cleanEmail),
        native_session: buildNativeSession(user, cleanEmail),
        app_login_url: appLoginUrl,
        dashboard_url: `${BD_API_BASE_URL}/account/home`,
      });
    }

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();

    if (!cleanEmail || !cleanPassword) {
      return jsonResponse({ error: "Email and password are required." }, 400);
    }

    const rateKeys = await loginRateKeys(req, cleanEmail);
    const rateLimit = await loginRateLimitStatus(rateKeys);
    if (rateLimit.allowed !== true) {
      return jsonResponse({
        error: "Too many login attempts. Please wait and try again.",
        retry_after_seconds: Math.max(1, Number(rateLimit.retry_after_seconds || 900)),
      }, 429);
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

    const bdCredentialAccepted = login.response.ok &&
      login.body.status === "success";
    let user: BdUser | undefined;

    const usersUrl = new URL("/api/v2/user/get", BD_API_BASE_URL);
    usersUrl.searchParams.set("limit", "1");
    usersUrl.searchParams.set("property", "email");
    usersUrl.searchParams.set("property_value", cleanEmail);
    usersUrl.searchParams.set("property_operator", "eq");

    const users = await callBd(`${usersUrl.pathname}${usersUrl.search}`);
    const rows = Array.isArray(users.body.message) ? users.body.message : [];
    user = rows[0] as BdUser | undefined;

    if (user?.user_id) {
      const fullUser = await callBd(
        `/api/v2/user/get/${encodeURIComponent(String(user.user_id))}`,
      );
      if (fullUser.response.ok && fullUser.body.status === "success") {
        user = unwrapBdUser(fullUser.body.message) || user;
      }
    }

    // BD can accept a valid credential check while a same-request profile
    // lookup is temporarily empty or rate-limited. Only after credentials are
    // verified, fall back to the unique server-side identity cache row for
    // that exact email. This preserves authentication while avoiding a false
    // "missing login token" failure for an already-linked member.
    if (bdCredentialAccepted && !user?.user_id) {
      user = await fetchCachedUserByVerifiedEmail(cleanEmail);
    }

    if (!bdCredentialAccepted) {
      const failedRateLimit = await recordFailedLogin(rateKeys);
      console.warn("bd-email-login:credential-rejected", {
        diagnostic_id: diagnosticId,
        http_status: login.response.status,
        bd_status: typeof login.body.status === "string"
          ? login.body.status.slice(0, 40)
          : "unknown",
      });
      if (failedRateLimit.allowed !== true) {
        return jsonResponse({
          error: "Too many login attempts. Please wait and try again.",
          retry_after_seconds: Math.max(1, Number(failedRateLimit.retry_after_seconds || 900)),
        }, 429);
      }
      return jsonResponse({ error: "Invalid email or password." }, 401);
    }

    if (!user?.user_id) {
      return jsonResponse({ error: "Login is temporarily unavailable." }, 503);
    }

    user = await ensureBdSessionCookie(user);
    const nativeSession = buildNativeSession(user, cleanEmail);
    if (!nativeSession.user_id || !nativeSession.token) {
      return jsonResponse({ error: "Login is temporarily unavailable." }, 503);
    }
    await clearSuccessfulLoginRateLimits(rateKeys);

    return jsonResponse({
      ok: true,
      user: sanitizeUser(user, cleanEmail),
      native_session: nativeSession,
      dashboard_url: `${BD_API_BASE_URL}/account/home`,
    });
  } catch (error) {
    console.error("bd-email-login:error", {
      diagnostic_id: diagnosticId,
      error_type: error instanceof Error ? error.name : "unknown",
    });
    return jsonResponse({
      error: "Login is temporarily unavailable.",
    }, error instanceof BdNativeSessionRefreshUnavailable ? 503 : 500);
  }
});
