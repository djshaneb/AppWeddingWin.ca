import { admin, corsHeaders, getAppleConfig } from "../_shared/apple_auth.ts";
import { createOAuthLoginAttempt } from "../_shared/oauth_attempt.ts";
import { createAppleWebStartHandler } from "../_shared/apple_web_oauth.ts";

const APPLE_RETURN_URL = Deno.env.get("APPLE_RETURN_URL") ||
  "https://www.weddingwin.ca/auth/apple-callback";
const handleStart = createAppleWebStartHandler({
  secret: Deno.env.get("APP_LOGIN_SECRET") || "",
  returnUrl: APPLE_RETURN_URL,
  getServiceId: async () => (await getAppleConfig(admin)).serviceId,
  createAttempt: (attempt) =>
    createOAuthLoginAttempt({ admin, provider: "apple", ...attempt }),
});

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return handleStart(req);
});
