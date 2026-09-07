import {
  admin,
  corsHeaders,
  decodeJwtPayloadUnsafe,
  DEFAULT_FINAL,
  getAppleConfig,
  getNativeAppleAudiences,
  linkProfileToBdMember,
  makeBdAppleLoginResult,
  upsertAppleUser,
  verifyAppleIdentityToken,
} from "../_shared/apple_auth.ts";
import { allowedFinalRedirect } from "../_shared/oauth_state.ts";
import { withAppleGrantSignin } from "../_shared/apple_grant_store.ts";
import { normalizeAppleScopeDiagnostics } from "../_shared/apple_scope_diagnostics.ts";
import { preflightAppleAccountLogin } from "../_shared/apple_login_preflight_store.ts";
import {
  AppleLoginPreflightUnavailableError,
  AppleSignupRequiredError,
} from "../_shared/apple_login_preflight.ts";
import {
  nativeSignupErrorMessage,
  nativeSignupRoleFromBody,
  nativeSignupSubscriptionId,
  parseNativeSignupBody,
} from "../_shared/native_signup_intent.ts";

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
    const body = parseNativeSignupBody(await req.text());
    const signupRole = nativeSignupRoleFromBody(body);
    const idToken = String(body.id_token || "");
    if (!idToken) throw new Error("Missing Apple identity token.");

    const cfg = await getAppleConfig(admin);
    const audiences = getNativeAppleAudiences(cfg);
    const tokenPreview = decodeJwtPayloadUnsafe(idToken);
    const clientContext =
      body.client_context && typeof body.client_context === "object"
        ? body.client_context as Record<string, unknown>
        : {};
    console.log("apple-native-login:start", {
      diagnosticId,
      aud: tokenPreview.aud,
      iss: tokenPreview.iss,
      subPresent: typeof tokenPreview.sub === "string",
      expectedAudiences: audiences,
      appOwnership: clientContext.appOwnership,
      platform: clientContext.platform,
    });
    // Client-reported booleans only. This telemetry cannot establish identity,
    // verified email, consent or any account/linking/deletion authorization.
    console.log("apple-native-login:scope-diagnostics", {
      diagnosticId,
      clientReported: normalizeAppleScopeDiagnostics(
        clientContext.appleScopeDiagnostics,
      ),
    });

    const claims = await verifyAppleIdentityToken(idToken, audiences);
    const fullName = [body.given_name, body.family_name].filter((part) =>
      typeof part === "string"
    ).join(" ");
    const consent =
      body.accepted_terms === true && body.accepted_privacy === true
        ? {
          acceptedAt: String(body.accepted_at || ""),
          termsVersion: String(body.terms_version || ""),
          privacyVersion: String(body.privacy_version || ""),
        }
        : null;
    let preflightComplete = false;
    let preflightBdMemberId: string | undefined;
    const bdLogin = await withAppleGrantSignin({
      claims,
      diagnosticId,
      clientId: cfg.iosBundleId,
      authorizationCode: typeof body.authorization_code === "string"
        ? body.authorization_code
        : undefined,
      expectedNonce: typeof body.apple_nonce === "string"
        ? body.apple_nonce
        : undefined,
      preflight: async (context) => {
        const result = await preflightAppleAccountLogin({
          claims: context.verifiedClaims || claims,
          consent,
          expectedBdMemberId: context.expectedBdMemberId,
          expectedProfileId: context.expectedProfileId,
        });
        preflightBdMemberId = context.expectedBdMemberId ||
          result.expectedBdMemberId;
        preflightComplete = true;
      },
      login: async (
        { expectedBdMemberId, expectedProfileId, verifiedClaims },
      ) => {
        if (!preflightComplete) throw new AppleLoginPreflightUnavailableError();
        const accountClaims = verifiedClaims || claims;
        const user = await upsertAppleUser({
          claims: accountClaims,
          expectedProfileId,
          email: typeof body.email === "string"
            ? body.email
            : accountClaims.email || null,
          fullName: fullName ||
            (typeof body.full_name === "string" ? body.full_name : null),
        });

        const redirectTo = allowedFinalRedirect(
          body.redirect_to || DEFAULT_FINAL,
        );
        const bdLogin = await makeBdAppleLoginResult({
          appleSub: user.appleSub,
          email: user.email,
          fullName: user.fullName,
          finalRedirect: redirectTo,
          subscriptionId: signupRole
            ? nativeSignupSubscriptionId(signupRole)
            : String(body.subscription_id || ""),
          expectedSignupRole: signupRole,
          expectedBdMemberId: expectedBdMemberId || preflightBdMemberId,
          consent,
          includeWebsiteRedirect: false,
        });
        if (bdLogin.nativeSession.user_id) {
          await linkProfileToBdMember(user.userId, bdLogin.nativeSession);
        }
        return {
          value: bdLogin,
          bdMemberId: String(bdLogin.nativeSession.user_id || ""),
          profileId: user.userId,
          email: user.email,
        };
      },
    });

    return new Response(
      JSON.stringify({
        ...(bdLogin.redirectUrl ? { redirect_url: bdLogin.redirectUrl } : {}),
        user: bdLogin.user,
        native_session: bdLogin.nativeSession,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    const signupRequired = e instanceof AppleSignupRequiredError;
    const msg = signupRequired
      ? "No WeddingWin account was found. Choose Sign up to create your account."
      : nativeSignupErrorMessage(e instanceof Error ? e.message : String(e));
    console.error("apple-native-login:error", { diagnosticId, error: msg });
    return new Response(
      JSON.stringify({
        error: msg,
        diagnostic_id: diagnosticId,
        ...(signupRequired ? { error_code: "signup_required" } : {}),
      }),
      {
        status: e instanceof AppleLoginPreflightUnavailableError ? 503 : 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
});
