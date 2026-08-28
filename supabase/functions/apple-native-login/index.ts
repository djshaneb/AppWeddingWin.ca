import {
  admin,
  corsHeaders,
  DEFAULT_FINAL,
  decodeJwtPayloadUnsafe,
  getAppleConfig,
  getNativeAppleAudiences,
  linkProfileToBdMember,
  makeBdAppleLoginResult,
  upsertAppleUser,
  verifyAppleIdentityToken,
} from "../_shared/apple_auth.ts";
import { allowedFinalRedirect } from "../_shared/oauth_state.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const diagnosticId = crypto.randomUUID();

  try {
    const body = await req.json();
    const idToken = String(body.id_token || "");
    if (!idToken) throw new Error("Missing Apple identity token.");

    const cfg = await getAppleConfig(admin);
    const audiences = getNativeAppleAudiences(cfg);
    const tokenPreview = decodeJwtPayloadUnsafe(idToken);
    console.log("apple-native-login:start", {
      diagnosticId,
      aud: tokenPreview.aud,
      iss: tokenPreview.iss,
      subPresent: typeof tokenPreview.sub === "string",
      expectedAudiences: audiences,
      appOwnership: body.client_context?.appOwnership,
      platform: body.client_context?.platform,
    });

    const claims = await verifyAppleIdentityToken(idToken, audiences);
    const fullName = [body.given_name, body.family_name].filter(Boolean).join(" ");
    const user = await upsertAppleUser({
      claims,
      email: body.email || claims.email || null,
      fullName: fullName || body.full_name || null,
    });

    const redirectTo = allowedFinalRedirect(body.redirect_to || DEFAULT_FINAL);
    const bdLogin = await makeBdAppleLoginResult({
      appleSub: user.appleSub,
      email: user.email,
      fullName: user.fullName,
      finalRedirect: redirectTo,
      subscriptionId: String(body.subscription_id || ""),
      consent:
        body.accepted_terms === true && body.accepted_privacy === true
          ? {
              acceptedAt: String(body.accepted_at || new Date().toISOString()),
              termsVersion: String(body.terms_version || ""),
              privacyVersion: String(body.privacy_version || ""),
            }
          : null,
      includeWebsiteRedirect: false,
    });
    if (bdLogin.nativeSession.user_id) {
      await linkProfileToBdMember(user.userId, bdLogin.nativeSession);
    }

    return new Response(JSON.stringify({
      ...(bdLogin.redirectUrl ? { redirect_url: bdLogin.redirectUrl } : {}),
      user: bdLogin.user,
      native_session: bdLogin.nativeSession,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("apple-native-login:error", { diagnosticId, error: msg });
    return new Response(JSON.stringify({ error: msg, diagnostic_id: diagnosticId }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
