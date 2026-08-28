import {
  admin,
  corsHeaders,
  errorPage,
  getAppleConfig,
  linkProfileToBdMember,
  makeBdAppleLoginResult,
  makeAppleClientSecret,
  upsertAppleUser,
  verifyAppleIdentityToken,
} from "../_shared/apple_auth.ts";
import {
  assertAppleOAuthNonce,
  verifySignedAppleOAuthState,
} from "../_shared/oauth_state.ts";
import { redeemOAuthLoginAttempt } from "../_shared/oauth_attempt.ts";

const APPLE_RETURN_URL =
  Deno.env.get("APPLE_RETURN_URL") || "https://www.weddingwin.ca/auth/apple-callback";
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET") || "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const form = await req.formData();
    const code = String(form.get("code") || "");
    const stateRaw = String(form.get("state") || "");
    const appleError = String(form.get("error") || "");

    if (!stateRaw) return errorPage("Missing Apple sign-in state.");

    const state = await verifySignedAppleOAuthState(stateRaw, APP_LOGIN_SECRET);
    const finalRedirect = state.r;
    await redeemOAuthLoginAttempt({
      admin,
      request: req,
      provider: "apple",
      state: stateRaw,
    });
    if (appleError) return errorPage(`Apple returned: ${appleError}`);
    if (!code) return errorPage("Missing Apple authorization code.");

    const cfg = await getAppleConfig(admin);
    const clientSecret = await makeAppleClientSecret(cfg, cfg.serviceId);
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.serviceId,
        client_secret: clientSecret,
        redirect_uri: APPLE_RETURN_URL,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return errorPage(`Apple token exchange failed: ${text.slice(0, 300)}`);
    }
    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    const idToken = tokenJson.id_token || "";
    if (!idToken) return errorPage("Apple did not return an identity token.");

    const claims = await verifyAppleIdentityToken(idToken, [cfg.serviceId]);
    assertAppleOAuthNonce(state.n, claims.nonce);
    const userJson = String(form.get("user") || "");
    let providedName = "";
    let providedEmail = claims.email || "";
    if (userJson) {
      try {
        const parsed = JSON.parse(userJson);
        providedEmail = parsed.email || providedEmail;
        providedName = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ");
      } catch {
        // Apple only sends this on first authorization; ignore malformed user blob.
      }
    }

    const user = await upsertAppleUser({
      claims,
      email: providedEmail,
      fullName: providedName,
    });
    const login = await makeBdAppleLoginResult({
      appleSub: user.appleSub,
      email: user.email,
      fullName: user.fullName,
      finalRedirect,
    });
    if (login.nativeSession.user_id) {
      await linkProfileToBdMember(user.userId, login.nativeSession);
    }

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: login.redirectUrl,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorPage(msg);
  }
});
