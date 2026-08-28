import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import {
  getAppleConfig,
  makeAppleClientSecret,
  verifyAppleIdentityToken,
} from "../_shared/apple_auth.ts";
import { nativeSessionMatchesCachedBdIdentity } from "../_shared/bd_identity.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NativeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};

type BdEnvelope = {
  status?: string;
  message?: unknown;
  next_page?: string | null;
  current_page?: number | string;
  total_pages?: number | string;
};

type BdUser = Record<string, unknown>;
type BdUserMeta = {
  meta_id: string;
  database: string;
  database_id: string;
};

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

function unwrapBdUser(message: unknown): BdUser | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? first as BdUser : undefined;
  }
  return message && typeof message === "object" ? message as BdUser : undefined;
}

async function callBd(path: string, init: RequestInit = {}) {
  if (!BD_API_KEY) throw new Error("BD_API_KEY is not configured.");
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

function bdResponseMeansMissing(result: { response: Response; body: BdEnvelope }) {
  if (result.response.status === 404) return true;
  const message = typeof result.body.message === "string"
    ? result.body.message.trim().toLowerCase()
    : "";
  return result.body.status === "error" && [400, 404].includes(result.response.status) &&
    /^(?:user |member )?(?:record )?(?:not found|does not exist|already deleted|was already deleted)$/.test(message);
}

async function fetchBdUser(userId: string) {
  const result = await callBd(`/api/v2/user/get/${encodeURIComponent(userId)}`);
  if (result.response.ok && result.body.status === "success") {
    return unwrapBdUser(result.body.message);
  }
  if (bdResponseMeansMissing(result)) return undefined;
  throw new Error(`BD member lookup failed (${result.response.status}).`);
}

async function deleteBdUser(userId: string) {
  const body = new URLSearchParams({ user_id: userId, delete_images: "1" });
  const result = await callBd("/api/v2/user/delete", {
    method: "DELETE",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (result.response.ok && result.body.status === "success") return;
  if (bdResponseMeansMissing(result)) return;
  throw new Error(`BD account deletion failed (${result.response.status}).`);
}

async function listBdUserMeta(userId: string) {
  const rows: BdUserMeta[] = [];
  const seenMetaIds = new Set<string>();
  let page = "";
  for (let requestNumber = 0; requestNumber < 100; requestNumber += 1) {
    const query = new URLSearchParams({ limit: "100" });
    query.append("property[]", "database");
    query.append("property[]", "database_id");
    query.append("property_value[]", "users_data");
    query.append("property_value[]", userId);
    query.append("property_logic[]", "eq");
    query.append("property_logic[]", "eq");
    if (page) query.set("page", page);

    const result = await callBd(`/api/v2/users_meta/get?${query.toString()}`);
    if (!result.response.ok || result.body.status !== "success") {
      throw new Error(`BD account metadata lookup failed (${result.response.status}).`);
    }
    const message = Array.isArray(result.body.message) ? result.body.message : [];
    for (const value of message) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      if (String(row.database || "") !== "users_data" || String(row.database_id || "") !== userId) {
        continue;
      }
      const metaId = String(row.meta_id || "").trim();
      if (metaId && !seenMetaIds.has(metaId)) {
        seenMetaIds.add(metaId);
        rows.push({ meta_id: metaId, database: "users_data", database_id: userId });
      }
    }
    const currentPage = Number(result.body.current_page || 1);
    const totalPages = Number(result.body.total_pages || 1);
    if (Number.isFinite(currentPage) && Number.isFinite(totalPages) && currentPage >= totalPages) {
      break;
    }
    page = String(result.body.next_page || "").trim();
    if (!page) break;
  }
  return rows;
}

async function deleteBdUserMeta(rows: BdUserMeta[]) {
  for (const row of rows) {
    if (row.database !== "users_data") throw new Error("BD metadata identity mismatch.");
    const result = await callBd("/api/v2/users_meta/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ meta_id: row.meta_id }).toString(),
    });
    if (result.response.ok && result.body.status === "success") continue;
    if (bdResponseMeansMissing(result)) continue;
    throw new Error(`BD account metadata deletion failed (${result.response.status}).`);
  }
}

async function findProfile(userId: string) {
  const byMember = await admin
    .from("profiles")
    .select("id, email, apple_sub")
    .eq("bd_member_id", userId)
    .maybeSingle();
  if (byMember.error) throw new Error(`Profile lookup failed: ${byMember.error.message}`);
  return byMember.data;
}

async function revokeAppleAuthorization(authorizationCode: string, expectedAppleSub: string) {
  const cfg = await getAppleConfig(admin);
  const clientSecret = await makeAppleClientSecret(cfg, cfg.iosBundleId);
  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: authorizationCode,
      client_id: cfg.iosBundleId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
    }),
  });
  const tokenJson = await tokenResponse.json().catch(() => ({})) as {
    refresh_token?: string;
    id_token?: string;
    error?: string;
  };
  if (!tokenResponse.ok || !tokenJson.refresh_token || !tokenJson.id_token) {
    throw new Error(`Apple authorization exchange failed (${tokenJson.error || tokenResponse.status}).`);
  }

  const claims = await verifyAppleIdentityToken(tokenJson.id_token, [cfg.iosBundleId]);
  if (claims.sub !== expectedAppleSub) {
    throw new Error("Apple confirmation did not match the account being deleted.");
  }

  const revokeResponse = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: tokenJson.refresh_token,
      token_type_hint: "refresh_token",
      client_id: cfg.iosBundleId,
      client_secret: clientSecret,
    }),
  });
  if (!revokeResponse.ok) {
    throw new Error(`Apple authorization revocation failed (${revokeResponse.status}).`);
  }
}

function authErrorMeansMissing(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string } | null;
  return value?.status === 404 || value?.code === "user_not_found" ||
    String(value?.message || "").trim().toLowerCase() === "user not found";
}

async function supabaseAuthUserExists(userId: string) {
  const lookup = await admin.auth.admin.getUserById(userId);
  if (!lookup.error) return true;
  if (authErrorMeansMissing(lookup.error)) return false;
  throw new Error(`Auth lookup failed: ${lookup.error.message}`);
}

async function deleteSupabaseAuthUser(userId: string) {
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (!deleted.error || authErrorMeansMissing(deleted.error)) return;
  throw new Error(`Auth deletion failed: ${deleted.error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405);

  const diagnosticId = crypto.randomUUID();
  let diagnosticStage = "parse_request";
  try {
    const body = await req.json();
    const session = body?.native_session as NativeSession | undefined;
    if (body?.confirmation !== "DELETE") {
      return jsonResponse({ ok: false, error: "Deletion confirmation is required." }, 400);
    }
    if (!session?.user_id || !session.token) {
      return jsonResponse({ ok: false, error: "Please sign in again before deleting your account." }, 401);
    }
    diagnosticStage = "authenticate_session";
    if (!await nativeSessionMatchesCachedBdIdentity(session)) {
      return jsonResponse({ ok: false, error: "Stored session expired. Please sign in again." }, 401);
    }

    const userId = String(session.user_id).trim();
    diagnosticStage = "load_cached_identity";
    const cached = await admin
      .from("bd_users_cache")
      .select("token, cookie")
      .eq("user_id", userId)
      .maybeSingle();
    if (cached.error) throw new Error(`Identity lookup failed: ${cached.error.message}`);

    diagnosticStage = "lookup_bd_member";
    await fetchBdUser(userId);
    diagnosticStage = "lookup_profile";
    const profile = await findProfile(userId);
    const appleSub = String(profile?.apple_sub || "").trim();
    const authUserPresent = profile?.id ? await supabaseAuthUserExists(profile.id) : false;

    if (appleSub && authUserPresent) {
      const authorizationCode = String(body?.apple_authorization_code || "").trim();
      if (!authorizationCode) {
        return jsonResponse({
          ok: false,
          requires_apple_reauthentication: true,
          error: "Confirm with Sign in with Apple to finish deleting this account.",
        }, 409);
      }
      diagnosticStage = "revoke_apple_authorization";
      await revokeAppleAuthorization(authorizationCode, appleSub);
    }

    // Preflight Advanced API access and capture only metadata whose full
    // compound parent identity matches this member. BD does not cascade these
    // rows when a user is deleted.
    diagnosticStage = "list_bd_metadata";
    const bdUserMeta = await listBdUserMeta(userId);
    // Remove child metadata while its parent still exists. BD may cascade these
    // rows as part of member deletion on some installations; deleting the
    // parent first can therefore turn an otherwise-successful cleanup into a
    // misleading 400 and strand the later app-data purge.
    diagnosticStage = "delete_bd_metadata";
    await deleteBdUserMeta(bdUserMeta);
    diagnosticStage = "delete_bd_member";
    await deleteBdUser(userId);

    // Delete GoTrue before the transactional public-data purge. If this step
    // or the later RPC fails, bd_users_cache remains available for an
    // idempotent retry with the same app-issued native session.
    diagnosticStage = "delete_supabase_auth";
    if (profile?.id && authUserPresent) await deleteSupabaseAuthUser(profile.id);

    diagnosticStage = "purge_app_data";
    const purge = await admin.rpc("purge_weddingwin_member_data", {
      p_bd_user_id: userId,
      p_bd_token: String(cached.data?.token || ""),
      p_bd_cookie: String(cached.data?.cookie || ""),
    });
    if (purge.error) throw new Error(`App data purge failed: ${purge.error.message}`);

    return jsonResponse({
      ok: true,
      deleted: true,
      purged: purge.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("bd-delete-account:error", {
      diagnosticId,
      diagnosticStage,
      error: message,
    });
    return jsonResponse({
      ok: false,
      error: "Account deletion could not be completed. Please try again or contact info@weddingwin.ca.",
      diagnostic_id: diagnosticId,
      diagnostic_stage: diagnosticStage,
    }, 500);
  }
});
