import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const finalRedirect =
      url.searchParams.get("redirect_to") || "https://www.weddingwin.ca/";

    const { data, error } = await admin
      .from("admin_config")
      .select("key, value")
      .eq("key", "google_client_id")
      .maybeSingle();

    if (error || !data?.value) {
      return new Response(
        JSON.stringify({ error: "google_client_id not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = data.value;
    const nonce = crypto.randomUUID();
    const state = b64url(JSON.stringify({ r: finalRedirect, n: nonce }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: CALLBACK_URL,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      include_granted_scopes: "true",
      prompt: "select_account",
      state,
    });

    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: googleUrl,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
