import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { sha256Base64Url } from "../_shared/auth_exchange.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
function response(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body?.code || "").trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(code)) {
      return response({ ok: false, error: "Login link is invalid or expired" }, 400);
    }

    const { data, error } = await admin.rpc("redeem_app_login_exchange", {
      p_code_hash: await sha256Base64Url(code),
    });
    if (error) throw error;
    if (!data || typeof data !== "object") {
      return response({ ok: false, error: "Login link is invalid or expired" }, 410);
    }
    return response({ ok: true, payload: data }, 200);
  } catch (error) {
    console.error("bd-app-login-exchange:error", error instanceof Error ? error.message : String(error));
    return response({ ok: false, error: "Login exchange unavailable" }, 500);
  }
});
