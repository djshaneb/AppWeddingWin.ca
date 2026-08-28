import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { sha256Base64Url } from "../_shared/auth_exchange.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body?.code || "").trim();
    const verifier = String(body?.code_verifier || "").trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      return response({ ok: false, error: "Google login exchange is invalid or expired" }, 400);
    }

    const { data, error } = await admin.rpc("redeem_native_auth_exchange", {
      p_code_hash: await sha256Base64Url(code),
      p_code_challenge: await sha256Base64Url(verifier),
      p_provider: "google",
    });
    if (error) throw error;
    if (!data || typeof data !== "object") {
      return response({ ok: false, error: "Google login exchange is invalid or expired" }, 410);
    }
    const payload = data as Record<string, unknown>;
    const user = payload.user as Record<string, unknown> | undefined;
    const nativeSession = payload.native_session as Record<string, unknown> | undefined;
    if (
      typeof user?.email !== "string" ||
      !nativeSession?.user_id ||
      typeof nativeSession.token !== "string" ||
      !nativeSession.token.trim()
    ) {
      return response({ ok: false, error: "Google login exchange is invalid or expired" }, 410);
    }
    return response({ ok: true, ...data }, 200);
  } catch (error) {
    console.error("google-native-exchange:error", error instanceof Error ? error.message : String(error));
    return response({ ok: false, error: "Google login exchange unavailable" }, 500);
  }
});
