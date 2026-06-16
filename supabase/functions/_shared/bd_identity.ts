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

async function readCachedIdentity(userId: string) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bd_users_cache?user_id=eq.${encodeURIComponent(userId)}&select=token,cookie`,
      { headers: restHeaders() },
    );
    if (!res.ok) return { token: "", cookie: "" };
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return {
      token: typeof row?.token === "string" ? row.token.trim() : "",
      cookie: typeof row?.cookie === "string" ? row.cookie.trim() : "",
    };
  } catch {
    return { token: "", cookie: "" };
  }
}

async function writeCachedIdentity(userId: string, token: string, cookie: string, email = "") {
  try {
    const payload: Record<string, string> = { user_id: userId, token, cookie };
    if (email) payload.email = email.toLowerCase();
    await fetch(
      `${SUPABASE_URL}/rest/v1/bd_users_cache?on_conflict=user_id`,
      {
        method: "POST",
        headers: { ...restHeaders(), Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([payload]),
      },
    );
  } catch {
    // Cache write failures must never block a login.
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

  const userId = String(user.user_id);
  const email = typeof user.email === "string" ? user.email : "";
  const cached = await readCachedIdentity(userId);
  const token = cached.token || createBdLoginToken();
  const cookie = cached.cookie || createBdSessionCookie();

  const updateBody = new URLSearchParams({ user_id: userId, token, cookie });
  try {
    await callBd("/api/v2/user/update", {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: updateBody.toString(),
    });
  } catch (error) {
    console.error("ensureStableBdIdentity: BD push failed", { userId, error: String(error) });
  }

  if (token !== cached.token || cookie !== cached.cookie) {
    await writeCachedIdentity(userId, token, cookie, email);
  }

  return { ...user, token, cookie };
}
