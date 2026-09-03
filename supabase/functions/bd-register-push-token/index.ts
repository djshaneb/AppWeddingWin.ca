import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { nativeSessionMatchesCachedBdIdentity } from "../_shared/bd_identity.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") ||
  "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type BdEnvelope = {
  status?: string;
  message?: unknown;
};
type BdRow = Record<string, unknown>;
type NativeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
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

function firstRow(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdRow) : undefined;
  }
  return message && typeof message === "object"
    ? (message as BdRow)
    : undefined;
}

async function callBd(path: string) {
  if (!BD_API_KEY) throw new Error("BD_API_KEY is not configured");
  const response = await fetch(`${BD_API_BASE_URL}${path}`, {
    headers: { "X-Api-Key": BD_API_KEY },
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

async function fetchFullBdUserById(userId: string | number) {
  const fullUser = await callBd(
    `/api/v2/user/get/${encodeURIComponent(String(userId))}`,
  );
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return firstRow(fullUser.body.message);
  }
  return undefined;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const nativeSession = body?.native_session as NativeSession | undefined;
    const action = String(body?.action || "register")
      .trim()
      .toLowerCase();
    const expoPushToken = String(body?.expo_push_token || "").trim();
    const platform = String(body?.platform || "").trim();

    if (!nativeSession?.user_id || !nativeSession?.token) {
      return jsonResponse({ ok: false, error: "Native session required" }, 401);
    }
    if (action !== "register" && action !== "unregister") {
      return jsonResponse(
        { ok: false, error: "Unsupported push token action" },
        400,
      );
    }
    if (
      !/^ExponentPushToken\[[^\]]+\]$/.test(expoPushToken) &&
      !/^ExpoPushToken\[[^\]]+\]$/.test(expoPushToken)
    ) {
      return jsonResponse(
        { ok: false, error: "Valid Expo push token required" },
        400,
      );
    }

    if (!(await nativeSessionMatchesCachedBdIdentity(nativeSession))) {
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }

    if (action === "register") {
      // Token/cookie are intentionally stripped from BD v2 reads. Fetch the
      // member only when enabling notifications, to confirm the account still
      // exists. Unregister must remain available during a BD outage or after an
      // account closes; cache auth plus the exact member/token filter below is
      // sufficient to disable only this session's push row.
      const user = await fetchFullBdUserById(nativeSession.user_id);
      if (
        !user?.user_id ||
        String(user.user_id) !== String(nativeSession.user_id)
      ) {
        return jsonResponse(
          { ok: false, error: "Native session expired" },
          401,
        );
      }
    }

    const now = new Date().toISOString();
    const operation = action === "unregister"
      ? admin
        .from("app_push_tokens")
        .update({ enabled: false, bd_member_token: "", updated_at: now })
        .eq("expo_push_token", expoPushToken)
        .eq("bd_member_id", String(nativeSession.user_id))
        .eq("bd_member_token", String(nativeSession.token || ""))
      : admin.from("app_push_tokens").upsert(
        {
          bd_member_id: String(nativeSession.user_id),
          bd_member_token: String(nativeSession.token || ""),
          expo_push_token: expoPushToken,
          platform,
          enabled: true,
          updated_at: now,
        },
        { onConflict: "expo_push_token" },
      );

    const { error } = await operation;

    if (error) throw error;

    return jsonResponse({ ok: true, action });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "Push registration failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
