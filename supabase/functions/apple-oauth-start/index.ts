import {
  admin,
  b64url,
  corsHeaders,
  DEFAULT_FINAL,
  getAppleConfig,
} from "../_shared/apple_auth.ts";

const APPLE_RETURN_URL =
  Deno.env.get("APPLE_RETURN_URL") || "https://www.weddingwin.ca/auth/apple-callback";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const finalRedirect = url.searchParams.get("redirect_to") || DEFAULT_FINAL;
    const cfg = await getAppleConfig(admin);
    const state = b64url(JSON.stringify({ r: finalRedirect, n: crypto.randomUUID() }));

    const params = new URLSearchParams({
      client_id: cfg.serviceId,
      redirect_uri: APPLE_RETURN_URL,
      response_type: "code",
      response_mode: "form_post",
      scope: "name email",
      state,
    });

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: `https://appleid.apple.com/auth/authorize?${params.toString()}`,
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
