import {
  type AppleNativeOAuthIntent,
  type AppleWebSignupRole,
  assertAppleOAuthNonce,
  createSignedAppleOAuthState,
  requireAppleWebSignupRole,
  verifySignedAppleOAuthState,
} from "./oauth_state.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  type CurrentPolicyConsent,
} from "./policy_consent.ts";
import { prepareOAuthBinding } from "./oauth_attempt.ts";
import { appleSignupSubscriptionId } from "./apple_signup_role.ts";
import { isAppleNativeMemberId } from "./apple_native_exchange.ts";
import {
  type AppleLoginPreflightArgs,
  AppleLoginPreflightUnavailableError,
  AppleSignupRequiredError,
} from "./apple_login_preflight.ts";

const WEBSITE_START = "https://www.weddingwin.ca/auth/apple-start";
const WEBSITE_FINAL = "https://www.weddingwin.ca/account/home";
const WEBSITE_ORIGINS = new Set([
  "https://www.weddingwin.ca",
  "https://weddingwin.ca",
]);
const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

type StartDependencies = {
  secret: string;
  returnUrl: string;
  getServiceId: () => Promise<string>;
  createAttempt: (attempt: {
    state: string;
    bindingSecret: string;
    expiresAtSeconds: number;
  }) => Promise<void>;
};

function websiteFinalRedirect(value: unknown): string {
  try {
    const url = new URL(String(value || WEBSITE_FINAL));
    if (WEBSITE_ORIGINS.has(url.origin) && !url.username && !url.password) {
      return url.toString();
    }
  } catch {
    // Missing or invalid destinations fall back to the member dashboard.
  }
  return WEBSITE_FINAL;
}

function signupRoleFromParams(params: URLSearchParams) {
  const roles = params.getAll("signup_role");
  if (roles.length === 0) return undefined;
  if (roles.length !== 1) throw new Error("Invalid OAuth signup role.");
  return requireAppleWebSignupRole(roles[0]);
}

function returnToAgreement(
  redirectTo: unknown,
  error?: string,
  signupRole?: AppleWebSignupRole,
): Response {
  const url = new URL(WEBSITE_START);
  url.searchParams.set("redirect_to", websiteFinalRedirect(redirectTo));
  if (error) url.searchParams.set("error", error);
  if (signupRole) url.searchParams.set("signup_role", signupRole);
  return new Response(null, {
    status: 303,
    headers: { ...NO_STORE, Location: url.toString() },
  });
}

/** A GET never implies agreement or starts an Apple authorization attempt. */
export function createAppleWebStartHandler(deps: StartDependencies) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "GET") {
      try {
        return returnToAgreement(
          url.searchParams.get("redirect_to"),
          undefined,
          signupRoleFromParams(url.searchParams),
        );
      } catch {
        return returnToAgreement(null, "invalid_account_type");
      }
    }
    if (req.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: { ...NO_STORE, Allow: "GET, POST, OPTIONS" },
      });
    }
    if (
      !WEBSITE_ORIGINS.has(req.headers.get("origin") || "") ||
      !req.headers.get("content-type")?.startsWith(
        "application/x-www-form-urlencoded",
      )
    ) {
      return returnToAgreement(null, "invalid_request");
    }

    let redirectTo: unknown = null;
    let signupRole: AppleWebSignupRole | undefined;
    try {
      const body = await req.text();
      if (body.length > 8_192) {
        return returnToAgreement(null, "invalid_request");
      }
      const form = new URLSearchParams(body);
      redirectTo = websiteFinalRedirect(form.get("redirect_to"));
      signupRole = signupRoleFromParams(form);
      if (
        form.getAll("policy_accepted").length !== 1 ||
        form.get("policy_accepted") !== "1"
      ) {
        return returnToAgreement(redirectTo, "agreement_required", signupRole);
      }
      if (
        form.getAll("terms_version").length !== 1 ||
        form.getAll("privacy_version").length !== 1 ||
        form.get("terms_version") !== CURRENT_TERMS_VERSION ||
        form.get("privacy_version") !== CURRENT_PRIVACY_VERSION
      ) {
        return returnToAgreement(redirectTo, "policies_changed", signupRole);
      }
      // Client-supplied acceptance dates are ignored. Only the explicit form
      // submission creates consent, timestamped when the server receives it.
      const now = Date.now();
      const consent: CurrentPolicyConsent = {
        acceptedAt: new Date(now).toISOString(),
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      };
      const { state, nonce, expiresAt } = await createSignedAppleOAuthState({
        redirectTo,
        secret: deps.secret,
        nowSeconds: Math.floor(now / 1000),
        consent,
        signupRole,
      });
      const binding = prepareOAuthBinding(req, "apple");
      const serviceId = await deps.getServiceId();
      await deps.createAttempt({
        state,
        bindingSecret: binding.bindingSecret,
        expiresAtSeconds: expiresAt,
      });
      const params = new URLSearchParams({
        client_id: serviceId,
        redirect_uri: deps.returnUrl,
        response_type: "code",
        response_mode: "form_post",
        scope: "name email",
        state,
        nonce,
      });
      return new Response(null, {
        status: 302,
        headers: {
          ...NO_STORE,
          Location: `https://appleid.apple.com/auth/authorize?${params}`,
          "Set-Cookie": binding.setCookie,
        },
      });
    } catch (error) {
      return returnToAgreement(
        redirectTo,
        error instanceof Error &&
          /Invalid OAuth signup role/.test(error.message)
          ? "invalid_account_type"
          : "sign_in_unavailable",
        signupRole,
      );
    }
  };
}

type AppleWebClaims = {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  aud: string;
  iss: string;
  nonce?: string;
};
type AppleWebUser = {
  userId: string;
  appleSub: string;
  email: string;
  fullName: string;
};
type WebSession = {
  user_id?: string | number;
  token?: string;
  cookie?: string;
  email?: string;
};
export type AppleWebGrantLoginContext = {
  expectedBdMemberId?: string;
  expectedProfileId?: string;
  verifiedClaims?: AppleWebClaims;
};
export type AppleWebCallbackStage =
  | "request"
  | "state"
  | "browser_binding"
  | "provider_response"
  | "credentials"
  | "token_exchange"
  | "identity_verification"
  | "nonce_verification"
  | "email_verification"
  | "grant_validation"
  | "account_preflight"
  | "account_upsert"
  | "account_login"
  | "profile_link"
  | "native_exchange"
  | "redirect";
export type AppleWebCallbackErrorCategory =
  | "email_unavailable"
  | "provider"
  | "state_nonce"
  | "account_binding"
  | "unknown";
export type AppleWebCallbackDiagnostic = {
  diagnosticId: string;
  stage: AppleWebCallbackStage;
  category: AppleWebCallbackErrorCategory;
};

function callbackErrorCategory(
  stage: AppleWebCallbackStage,
  error: unknown,
): AppleWebCallbackErrorCategory {
  // Error text is used only for these finite classifications. Never include it
  // (or arbitrary provider error codes, claims, request data) in a diagnostic.
  const message = error instanceof Error ? error.message : "";
  if (
    message ===
      "Apple could not verify your account email. Please start again with Apple." ||
    message ===
      "Apple did not provide an email and this Apple account is not linked yet."
  ) return "email_unavailable";
  if (
    message === "APPLE_SIGNUP_ROLE_MISMATCH" ||
    message === "APPLE_SIGNUP_ROLE_UNAVAILABLE" ||
    message ===
      "Apple sign-in email did not match the verified identity token." ||
    message ===
      "Apple could not verify the account owner. Please contact WeddingWin for help." ||
    message ===
      "Your previous Apple permission is being removed. Please try signing in again shortly."
  ) return "account_binding";
  if (
    message === "Apple could not verify this sign-in. Please try again." ||
    /same browser|another browser|OAuth state|OAuth nonce/.test(message) ||
    ["state", "browser_binding", "nonce_verification"].includes(stage)
  ) return "state_nonce";
  if (
    message === "Apple could not complete sign-in. Please start again." ||
    message === "Apple did not complete sign-in. Please start again." ||
    ["provider_response", "token_exchange", "identity_verification"].includes(
      stage,
    )
  ) return "provider";
  return "unknown";
}

type CallbackDependencies = {
  secret: string;
  returnUrl: string;
  redeemAttempt: (request: Request, state: string) => Promise<void>;
  getCredentials: () => Promise<{ serviceId: string; clientSecret: string }>;
  fetch: typeof fetch;
  verifyIdentity: (token: string, serviceId: string) => Promise<AppleWebClaims>;
  preflightLogin: (
    args: AppleLoginPreflightArgs,
  ) => Promise<{ expectedBdMemberId?: string }>;
  upsertUser: (
    args: {
      claims: AppleWebClaims;
      email: string;
      fullName: string;
      expectedProfileId?: string;
    },
  ) => Promise<AppleWebUser>;
  makeLogin: (args: {
    appleSub: string;
    email: string;
    fullName: string;
    finalRedirect: string;
    consent: CurrentPolicyConsent | null;
    subscriptionId?: ReturnType<typeof appleSignupSubscriptionId>;
    expectedSignupRole?: AppleWebSignupRole;
    expectedBdMemberId?: string;
    includeWebsiteRedirect?: boolean;
  }) => Promise<
    {
      redirectUrl: string;
      nativeSession: WebSession;
      user?: Record<string, unknown>;
    }
  >;
  linkProfile: (id: string, session: WebSession) => Promise<void>;
  withGrant?: <T>(args: {
    claims: AppleWebClaims;
    clientId: string;
    refreshToken?: string;
    diagnosticId?: string;
    preflight?: (context: AppleWebGrantLoginContext) => Promise<void>;
    login: (
      context: AppleWebGrantLoginContext,
    ) => Promise<
      { value: T; bdMemberId: string; profileId: string; email: string }
    >;
  }) => Promise<T>;
  errorPage: (message: string) => Response;
  diagnostic?: (event: AppleWebCallbackDiagnostic) => void;
  createNativeExchange?: (args: {
    provider: "apple";
    codeChallenge: string;
    bdMemberId: string;
    payload: {
      user: Record<string, unknown>;
      native_session: WebSession;
      apple_profile_id: string;
    };
  }) => Promise<string>;
};

export function createAppleWebCallbackHandler(deps: CallbackDependencies) {
  return async (req: Request): Promise<Response> => {
    const diagnosticId = crypto.randomUUID();
    let stage: AppleWebCallbackStage = "request";
    let nativeIntent: AppleNativeOAuthIntent | undefined;
    function recordFailure(category: AppleWebCallbackErrorCategory) {
      const event: AppleWebCallbackDiagnostic = {
        diagnosticId,
        stage,
        category,
      };
      try {
        if (deps.diagnostic) deps.diagnostic(event);
        else console.info("apple-web-callback:failure", event);
      } catch {
        // Diagnostics must not change authentication or error recovery.
      }
    }
    function tagFailure(response: Response): Response {
      const headers = new Headers(response.headers);
      headers.set("X-WeddingWin-Apple-Diagnostic", diagnosticId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    function fail(
      message: string,
      category: AppleWebCallbackErrorCategory,
      errorCode:
        | AppleWebCallbackErrorCategory
        | "cleanup_pending"
        | "account_type_mismatch"
        | "signup_required"
        | "sign_in_unavailable" = category,
    ): Response {
      recordFailure(category);
      if (nativeIntent) {
        const location = new URL(nativeIntent.returnTo);
        location.searchParams.set("provider", "apple");
        location.searchParams.set("error", errorCode);
        location.searchParams.set("error_description", message);
        location.searchParams.set("diagnostic_id", diagnosticId);
        return tagFailure(
          new Response(null, {
            status: 302,
            headers: { ...NO_STORE, Location: location.toString() },
          }),
        );
      }
      return tagFailure(
        deps.errorPage(`${message}\n\nDiagnostic: ${diagnosticId}`),
      );
    }
    function failAgreement(
      error: string,
      category: AppleWebCallbackErrorCategory,
    ): Response {
      if (nativeIntent) {
        return fail(
          error === "account_type_mismatch"
            ? "This sign-in is already linked to a different WeddingWin membership. Sign in to your existing account or use another sign-in account for this signup. Your existing account has not been changed."
            : "Apple sign-in is temporarily unavailable. Please try again.",
          category,
          error === "account_type_mismatch"
            ? "account_type_mismatch"
            : "sign_in_unavailable",
        );
      }
      recordFailure(category);
      const response = returnToAgreement(finalRedirect, error, signupRole);
      const location = new URL(response.headers.get("Location")!);
      location.searchParams.set("diagnostic_id", diagnosticId);
      response.headers.set("Location", location.toString());
      return tagFailure(response);
    }
    if (req.method !== "POST") {
      return fail("Please start again with Continue with Apple.", "unknown");
    }
    let signupRole: AppleWebSignupRole | undefined;
    let finalRedirect: string | undefined;
    try {
      const form = await req.formData();
      const code = String(form.get("code") || "");
      const stateRaw = String(form.get("state") || "");
      if (!stateRaw) {
        return fail(
          "Please start again with Continue with Apple.",
          "state_nonce",
        );
      }
      stage = "state";
      const state = await verifySignedAppleOAuthState(stateRaw, deps.secret);
      nativeIntent = state.native;
      signupRole = state.s;
      finalRedirect = state.r;
      stage = "browser_binding";
      await deps.redeemAttempt(req, stateRaw);
      if (nativeIntent && (!deps.withGrant || !deps.createNativeExchange)) {
        return fail(
          "Apple app sign-in is temporarily unavailable. Please try again.",
          "unknown",
        );
      }
      stage = "provider_response";
      if (form.get("error")) {
        return fail(
          "Apple sign-in was not completed. Please try again when you are ready.",
          "provider",
        );
      }
      if (!code) {
        return fail(
          "Apple did not complete sign-in. Please try again.",
          "provider",
        );
      }
      stage = "credentials";
      const cfg = await deps.getCredentials();
      stage = "token_exchange";
      const tokenRes = await deps.fetch(
        "https://appleid.apple.com/auth/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: cfg.serviceId,
            client_secret: cfg.clientSecret,
            redirect_uri: deps.returnUrl,
            grant_type: "authorization_code",
          }),
        },
      );
      if (!tokenRes.ok) {
        return fail(
          "Apple could not complete sign-in. Please start again.",
          "provider",
        );
      }
      const tokenJson = await tokenRes.json() as {
        id_token?: string;
        refresh_token?: string;
      };
      if (!tokenJson.id_token) {
        return fail(
          "Apple did not complete sign-in. Please start again.",
          "provider",
        );
      }
      stage = "identity_verification";
      const claims = await deps.verifyIdentity(
        tokenJson.id_token,
        cfg.serviceId,
      );
      stage = "nonce_verification";
      assertAppleOAuthNonce(state.n, claims.nonce);
      // Provider sign-in replaces a confirmation email only for an address
      // explicitly verified by Apple. Returning subjects without an email use
      // the existing server-side Apple identity mapping in upsertUser.
      stage = "email_verification";
      if (
        claims.email && claims.email_verified !== true &&
        claims.email_verified !== "true"
      ) {
        return fail(
          "Apple could not verify your email address. Please use another sign-in option or contact WeddingWin for help.",
          "email_unavailable",
        );
      }
      let fullName = "";
      try {
        const parsed = JSON.parse(String(form.get("user") || "{}"));
        fullName = [parsed.name?.firstName, parsed.name?.lastName].filter((
          part,
        ) => typeof part === "string").join(" ");
      } catch {
        // Apple supplies this optional display name only on first authorization.
      }
      let nativeProfileId = "";
      let preflightBdMemberId: string | undefined;
      let preflightComplete = false;
      const preflightLogin = async (
        context: AppleWebGrantLoginContext = {},
      ) => {
        // The server-side grant wrapper may recover a verified email from the
        // matching redeemed token. Request/form data never supplies this context.
        const accountClaims = context.verifiedClaims || claims;
        stage = "account_preflight";
        const preflight = await deps.preflightLogin({
          claims: accountClaims,
          consent: state.c || null,
          expectedBdMemberId: context.expectedBdMemberId,
          expectedProfileId: context.expectedProfileId,
        });
        preflightBdMemberId = context.expectedBdMemberId ||
          preflight.expectedBdMemberId;
        preflightComplete = true;
      };
      const completeLogin = async (context: AppleWebGrantLoginContext = {}) => {
        if (!preflightComplete) throw new AppleLoginPreflightUnavailableError();
        const accountClaims = context.verifiedClaims || claims;
        const expectedBdMemberId = context.expectedBdMemberId ||
          preflightBdMemberId;
        stage = "account_upsert";
        const user = await deps.upsertUser({
          claims: accountClaims,
          ...(context.expectedProfileId
            ? { expectedProfileId: context.expectedProfileId }
            : {}),
          email: accountClaims.email || "",
          fullName,
        });
        nativeProfileId = user.userId;
        stage = "account_login";
        const login = await deps.makeLogin({
          appleSub: user.appleSub,
          email: user.email,
          fullName: user.fullName,
          finalRedirect: state.r,
          consent: state.c || null,
          ...(nativeIntent ? { includeWebsiteRedirect: false } : {}),
          ...(expectedBdMemberId ? { expectedBdMemberId } : {}),
          ...(state.s
            ? {
              subscriptionId: appleSignupSubscriptionId(state.s),
              expectedSignupRole: state.s,
            }
            : {}),
        });
        if (login.nativeSession.user_id) {
          stage = "profile_link";
          await deps.linkProfile(user.userId, login.nativeSession);
        }
        // The wrapper resumes its post-login ownership and storage checks.
        // Failures there must not be incorrectly attributed to profile linking.
        if (deps.withGrant) stage = "grant_validation";
        return {
          value: login,
          bdMemberId: String(login.nativeSession.user_id || ""),
          profileId: user.userId,
          email: user.email,
        };
      };
      stage = "grant_validation";
      if (deps.withGrant && !tokenJson.refresh_token) {
        throw new Error("Apple did not complete sign-in. Please start again.");
      }
      const login = deps.withGrant
        ? await deps.withGrant({
          claims,
          clientId: cfg.serviceId,
          refreshToken: tokenJson.refresh_token,
          diagnosticId,
          preflight: preflightLogin,
          login: completeLogin,
        })
        : (await preflightLogin(), (await completeLogin()).value);
      stage = "redirect";
      if (nativeIntent) {
        stage = "native_exchange";
        if (
          !login.user || typeof login.user.email !== "string" ||
          !login.user.email.trim() ||
          !isAppleNativeMemberId(login.nativeSession.user_id) ||
          typeof login.nativeSession.token !== "string" ||
          !login.nativeSession.token.trim()
        ) {
          return fail(
            "WeddingWin could not finish the secure app login. Please try again.",
            "account_binding",
          );
        }
        // The wrapper has now completed grant storage and ownership/deletion
        // checks. Never issue this code from inside its account-creation callback.
        const code = await deps.createNativeExchange!({
          provider: "apple",
          codeChallenge: nativeIntent.codeChallenge,
          bdMemberId: String(login.nativeSession.user_id),
          payload: {
            user: login.user,
            native_session: login.nativeSession,
            apple_profile_id: nativeProfileId,
          },
        });
        if (code.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
          throw new Error("Invalid native exchange result");
        }
        const destination = new URL(nativeIntent.returnTo);
        destination.searchParams.set("provider", "apple");
        destination.searchParams.set("exchange_code", code);
        return new Response(null, {
          status: 302,
          headers: { ...NO_STORE, Location: destination.toString() },
        });
      }
      return new Response(null, {
        status: 302,
        headers: { ...NO_STORE, Location: login.redirectUrl },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const category = callbackErrorCategory(stage, error);
      if (error instanceof AppleSignupRequiredError) {
        return fail(
          "No WeddingWin account was found. Choose Sign up to create your account and agree to the Terms of Service and Privacy Policy.",
          "account_binding",
          "signup_required",
        );
      }
      if (error instanceof AppleLoginPreflightUnavailableError) {
        const response = fail(
          error.message,
          "account_binding",
          "sign_in_unavailable",
        );
        return nativeIntent ? response : new Response(response.body, {
          status: 503,
          headers: response.headers,
        });
      }
      if (
        nativeIntent &&
        message ===
          "Your previous Apple permission is being removed. Please try signing in again shortly."
      ) {
        return fail(message, category, "cleanup_pending");
      }
      if (message === "APPLE_SIGNUP_ROLE_MISMATCH") {
        return failAgreement(
          "account_type_mismatch",
          category,
        );
      }
      if (message === "APPLE_SIGNUP_ROLE_UNAVAILABLE") {
        return failAgreement(
          "sign_in_unavailable",
          category,
        );
      }
      if (/Explicit acceptance of Terms|Invalid OAuth consent/.test(message)) {
        return fail(
          "Please start again and agree to the Terms of Service and Privacy Policy before creating your account.",
          category,
        );
      }
      if (
        /same browser|another browser|OAuth state|OAuth nonce/.test(message)
      ) {
        return fail(
          "This sign-in link has expired or could not be verified. Please start again in the same browser.",
          category,
        );
      }
      return fail(
        "We could not finish Apple sign-in. Please try again. If it continues, contact WeddingWin for help.",
        category,
      );
    }
  };
}
