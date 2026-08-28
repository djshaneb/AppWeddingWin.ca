import {
  admin,
  corsHeaders,
  getAppleConfig,
} from "../_shared/apple_auth.ts";
import {
  createSignedAppleOAuthState,
  DEFAULT_OAUTH_FINAL,
} from "../_shared/oauth_state.ts";
import {
  createOAuthLoginAttempt,
  prepareOAuthBinding,
} from "../_shared/oauth_attempt.ts";

const APPLE_RETURN_URL =
  Deno.env.get("APPLE_RETURN_URL") || "https://www.weddingwin.ca/auth/apple-callback";
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET") || "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const { state, nonce, expiresAt } = await createSignedAppleOAuthState({
      redirectTo: url.searchParams.get("redirect_to") || DEFAULT_OAUTH_FINAL,
      secret: APP_LOGIN_SECRET,
    });
    const binding = prepareOAuthBinding(req, "apple");
    await createOAuthLoginAttempt({
      admin,
      provider: "apple",
      state,
      bindingSecret: binding.bindingSecret,
      expiresAtSeconds: expiresAt,
    });
    const cfg = await getAppleConfig(admin);

    const params = new URLSearchParams({
      client_id: cfg.serviceId,
      redirect_uri: APPLE_RETURN_URL,
      response_type: "code",
      response_mode: "form_post",
      scope: "name email",
      state,
      nonce,
    });

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: `https://appleid.apple.com/auth/authorize?${params.toString()}`,
        "Cache-Control": "no-store",
        "Set-Cookie": binding.setCookie,
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
