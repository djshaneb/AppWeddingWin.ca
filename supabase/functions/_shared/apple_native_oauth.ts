import {
  APPLE_NATIVE_RETURN_URL,
  createSignedAppleOAuthState,
  requireAppleNativeOAuthIntent,
} from "./oauth_state.ts";
import { prepareOAuthBinding } from "./oauth_attempt.ts";
import { requireNativeSignupRole } from "./native_signup_intent.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  type CurrentPolicyConsent,
} from "./policy_consent.ts";

type StartDependencies = {
  secret: string;
  returnUrl: string;
  getServiceId: () => Promise<string>;
  createAttempt: (attempt: {
    state: string;
    bindingSecret: string;
    expiresAtSeconds: number;
  }) => Promise<void>;
  now?: () => number;
};

const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
const CONSENT_FIELDS = [
  "accepted_terms",
  "accepted_privacy",
  "accepted_at",
  "terms_version",
  "privacy_version",
] as const;
const ALLOWED_PARAMS = new Set([
  "return_to",
  "code_challenge",
  "signup_role",
  ...CONSENT_FIELDS,
]);

/** App-only start. Unlike the website GET, explicit signup consent is supplied
 * by the native agreement screen. No absent flag/date/version is inferred. */
export function createAppleNativeStartHandler(deps: StartDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, {
        status: 405,
        headers: { ...NO_STORE, Allow: "GET, OPTIONS" },
      });
    }
    let redirectAllowed = false;
    try {
      const url = new URL(request.url);
      if (url.search.length > 4096) throw new Error("invalid");
      const params = url.searchParams;
      for (const key of params.keys()) {
        if (!ALLOWED_PARAMS.has(key) || params.getAll(key).length !== 1) {
          throw new Error("invalid");
        }
      }
      const native = requireAppleNativeOAuthIntent({
        returnTo: params.get("return_to"),
        codeChallenge: params.get("code_challenge"),
      });
      const role = params.has("signup_role")
        ? requireNativeSignupRole(params.get("signup_role"))
        : undefined;
      const now = (deps.now || Date.now)();
      let consent: CurrentPolicyConsent | undefined;
      if (role) {
        const accepted = params.get("accepted_at") || "";
        const acceptedAt = Date.parse(accepted);
        if (
          params.get("accepted_terms") !== "1" ||
          params.get("accepted_privacy") !== "1" ||
          params.get("terms_version") !== CURRENT_TERMS_VERSION ||
          params.get("privacy_version") !== CURRENT_PRIVACY_VERSION ||
          !/^\d{4}-\d{2}-\d{2}T/.test(accepted) ||
          !Number.isFinite(acceptedAt) ||
          acceptedAt < now - 600_000 || acceptedAt > now + 30_000
        ) throw new Error("invalid");
        // Date is validated above. Timestamp the server receipt of the explicit
        // app agreement, matching the website's signed-consent lifetime.
        consent = {
          acceptedAt: new Date(now).toISOString(),
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
        };
      } else if (CONSENT_FIELDS.some((key) => params.has(key))) {
        throw new Error("invalid");
      }
      redirectAllowed = true;
      const { state, nonce, expiresAt } = await createSignedAppleOAuthState({
        secret: deps.secret,
        redirectTo: native.returnTo,
        native,
        signupRole: role,
        consent,
        nowSeconds: Math.floor(now / 1000),
      });
      const serviceId = await deps.getServiceId();
      const binding = prepareOAuthBinding(request, "apple");
      await deps.createAttempt({
        state,
        bindingSecret: binding.bindingSecret,
        expiresAtSeconds: expiresAt,
      });
      const authorize = new URL("https://appleid.apple.com/auth/authorize");
      authorize.search = new URLSearchParams({
        client_id: serviceId,
        redirect_uri: deps.returnUrl,
        response_type: "code",
        response_mode: "form_post",
        scope: "name email",
        state,
        nonce,
      }).toString();
      return new Response(null, {
        status: 302,
        headers: {
          ...NO_STORE,
          Location: authorize.toString(),
          "Set-Cookie": binding.setCookie,
        },
      });
    } catch {
      // Never echo arbitrary query values, provider errors, or credential data.
      if (redirectAllowed) {
        const callback = new URL(APPLE_NATIVE_RETURN_URL);
        callback.searchParams.set("provider", "apple");
        callback.searchParams.set("error", "sign_in_unavailable");
        callback.searchParams.set(
          "error_description",
          "Apple sign-in could not start. Please try again.",
        );
        return new Response(null, {
          status: 302,
          headers: { ...NO_STORE, Location: callback.toString() },
        });
      }
      return Response.json({
        error:
          "Invalid Apple app sign-in request. Please start again in WeddingWin.",
      }, {
        status: 400,
        headers: NO_STORE,
      });
    }
  };
}
