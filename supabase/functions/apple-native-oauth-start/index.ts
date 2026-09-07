import { admin, corsHeaders, getAppleConfig } from "../_shared/apple_auth.ts";
import { createOAuthLoginAttempt } from "../_shared/oauth_attempt.ts";
import { createAppleNativeStartHandler } from "../_shared/apple_native_oauth.ts";

const handleStart = createAppleNativeStartHandler({
  secret: Deno.env.get("APP_LOGIN_SECRET") || "",
  returnUrl: Deno.env.get("APPLE_RETURN_URL") ||
    "https://www.weddingwin.ca/auth/apple-callback",
  getServiceId: async () => (await getAppleConfig(admin)).serviceId,
  createAttempt: (attempt) =>
    createOAuthLoginAttempt({ admin, provider: "apple", ...attempt }),
});

Deno.serve((request: Request) =>
  request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: corsHeaders })
    : handleStart(request)
);
