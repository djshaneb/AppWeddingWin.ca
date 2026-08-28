// Stable BD identity management.
//
// BD's website chat (and token login links) match members by users_data.token.
// BD's v2 API STRIPS token/cookie from every read, so we cannot ask BD what a
// member's current token is. Supabase (bd_users_cache.token/cookie) is the
// source of truth: once we issue an identity for a user we re-use it forever
// and push the same value back to BD on every login. Re-generating tokens on
// each login (the old behavior) orphaned every existing chat thread from the
// member's website inbox.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

type BdUserLike = Record<string, unknown> | undefined;
export type BdIdentitySession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};
export type CachedBdIdentity = {
  user_id: string;
  token: string;
  cookie: string;
};
type CallBd = (
  path: string,
  init?: RequestInit,
) => Promise<{ response: Response; body: { status?: string; message?: unknown } }>;

function restHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

export function createBdSessionCookie() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createBdLoginToken() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function readCachedBdIdentity(userId: string | number): Promise<CachedBdIdentity> {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return { user_id: "", token: "", cookie: "" };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("BD identity cache is not configured.");
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bd_users_cache?user_id=eq.${encodeURIComponent(normalizedUserId)}&select=user_id,token,cookie`,
    { headers: restHeaders() },
  );
  if (!res.ok) {
    throw new Error(`BD identity cache read failed (${res.status}).`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("BD identity cache returned an invalid response.");
  const row = rows[0];
  return {
    user_id: row?.user_id === undefined || row?.user_id === null
      ? ""
      : String(row.user_id).trim(),
    token: typeof row?.token === "string" ? row.token.trim() : "",
    cookie: typeof row?.cookie === "string" ? row.cookie.trim() : "",
  };
}

/**
 * Verifies an app-issued BD session against the canonical identity persisted at
 * login. BD deliberately strips token/cookie from v2 user reads, so comparing
 * against a freshly fetched BD row always rejects otherwise-valid sessions.
 * Cache errors and missing identities fail closed.
 */
export function nativeSessionMatchesCachedBdIdentityValues(
  session: BdIdentitySession,
  cached: CachedBdIdentity,
) {
  const userId = String(session.user_id || "").trim();
  const sessionToken = String(session.token || "").trim();
  if (!userId || !sessionToken) return false;

  if (cached.user_id !== userId || !cached.token || cached.token !== sessionToken) return false;

  const sessionCookie = String(session.cookie || "").trim();
  if (sessionCookie && cached.cookie && sessionCookie !== cached.cookie) return false;
  return true;
}

export async function nativeSessionMatchesCachedBdIdentity(session: BdIdentitySession) {
  const cached = await readCachedBdIdentity(session.user_id || "");
  return nativeSessionMatchesCachedBdIdentityValues(session, cached);
}

async function writeCachedIdentity(
  userId: string,
  token: string,
  cookie: string,
  email = "",
  ignoreDuplicates = false,
) {
  const payload: Record<string, string> = { user_id: userId, token, cookie };
  if (email) payload.email = email.toLowerCase();
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/bd_users_cache?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        ...restHeaders(),
        Prefer: ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates",
      },
      body: JSON.stringify([payload]),
    },
  );
  if (!response.ok) {
    throw new Error(`BD identity cache write failed (${response.status}).`);
  }
}

async function fillMissingCachedIdentityField(
  userId: string,
  field: "token" | "cookie",
  value: string,
) {
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    or: `(${field}.is.null,${field}.eq.)`,
  });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/bd_users_cache?${query.toString()}`,
    {
      method: "PATCH",
      headers: restHeaders(),
      body: JSON.stringify({ [field]: value }),
    },
  );
  if (!response.ok) {
    throw new Error(`BD identity cache ${field} repair failed (${response.status}).`);
  }
}

/**
 * Returns the user with a STABLE token/cookie attached.
 * - Reuses the identity stored in bd_users_cache when present.
 * - Generates one (once per user, ever) when missing.
 * - Pushes the identity to BD on every call so users_data.token always
 *   matches what our chat threads and login links reference.
 */
export async function ensureStableBdIdentity(
  user: BdUserLike,
  callBd: CallBd,
): Promise<BdUserLike> {
  if (!user?.user_id) return user;

  const userId = String(user.user_id).trim();
  if (!userId) return user;
  const email = typeof user.email === "string" ? user.email : "";
  let cached = await readCachedBdIdentity(userId);
  if (cached.user_id && cached.user_id !== userId) {
    throw new Error("BD identity cache returned the wrong member.");
  }

  // On a cold cache, let the unique user_id constraint select one winner when
  // concurrent login providers race to create the member's first identity.
  if (!cached.user_id) {
    await writeCachedIdentity(
      userId,
      createBdLoginToken(),
      createBdSessionCookie(),
      email,
      true,
    );
    cached = await readCachedBdIdentity(userId);
  }

  // Repair older cache rows that predate either stable field, then read back
  // the canonical values instead of returning an unconfirmed candidate. Each
  // conditional PATCH can win only while that field is NULL/blank, so two
  // concurrent first-logins cannot overwrite one another's repaired secret.
  if (!cached.token) {
    await fillMissingCachedIdentityField(userId, "token", createBdLoginToken());
  }
  if (!cached.cookie) {
    await fillMissingCachedIdentityField(userId, "cookie", createBdSessionCookie());
  }
  if (!cached.token || !cached.cookie) {
    cached = await readCachedBdIdentity(userId);
  }

  if (cached.user_id !== userId || !cached.token || !cached.cookie) {
    throw new Error("BD identity cache did not persist a complete identity.");
  }
  const token = cached.token;
  const cookie = cached.cookie;

  const updateBody = new URLSearchParams({ user_id: userId, token, cookie });
  const update = await callBd("/api/v2/user/update", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: updateBody.toString(),
  });
  if (!update.response.ok || update.body.status !== "success") {
    throw new Error(`BD identity update failed (${update.response.status}).`);
  }

  return { ...user, token, cookie };
}
