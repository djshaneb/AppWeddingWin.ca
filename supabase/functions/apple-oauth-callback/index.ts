import {
  admin,
  corsHeaders,
  errorPage,
  getAppleConfig,
  linkProfileToBdMember,
  makeAppleClientSecret,
  makeBdAppleLoginResult,
  upsertAppleUser,
  verifyAppleIdentityToken,
} from "../_shared/apple_auth.ts";
import { redeemOAuthLoginAttempt } from "../_shared/oauth_attempt.ts";
import { createAppleWebCallbackHandler } from "../_shared/apple_web_oauth.ts";
import { withAppleGrantSignin } from "../_shared/apple_grant_store.ts";
import { createValidatedAppleNativeExchange } from "../_shared/apple_native_exchange_store.ts";
import { preflightAppleAccountLogin } from "../_shared/apple_login_preflight_store.ts";

const APPLE_RETURN_URL = Deno.env.get("APPLE_RETURN_URL") ||
  "https://www.weddingwin.ca/auth/apple-callback";
const handleCallback = createAppleWebCallbackHandler({
  secret: Deno.env.get("APP_LOGIN_SECRET") || "",
  returnUrl: APPLE_RETURN_URL,
  redeemAttempt: (request, state) =>
    redeemOAuthLoginAttempt({ admin, request, provider: "apple", state }),
  getCredentials: async () => {
    const cfg = await getAppleConfig(admin);
    return {
      serviceId: cfg.serviceId,
      clientSecret: await makeAppleClientSecret(cfg, cfg.serviceId),
    };
  },
  fetch,
  verifyIdentity: (token, serviceId) =>
    verifyAppleIdentityToken(token, [serviceId]),
  upsertUser: upsertAppleUser,
  preflightLogin: preflightAppleAccountLogin,
  makeLogin: makeBdAppleLoginResult,
  linkProfile: linkProfileToBdMember,
  withGrant: withAppleGrantSignin,
  createNativeExchange: createValidatedAppleNativeExchange,
  errorPage,
});

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return handleCallback(req);
});
