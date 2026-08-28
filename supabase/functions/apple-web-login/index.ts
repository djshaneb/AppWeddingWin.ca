import {
  admin,
  corsHeaders,
  DEFAULT_FINAL,
  getAppleConfig,
  linkProfileToBdMember,
  makeBdAppleLoginResult,
  upsertAppleUser,
  verifyAppleIdentityToken,
} from "../_shared/apple_auth.ts";
import { allowedFinalRedirect } from "../_shared/oauth_state.ts";

type AppleWebUser = {
  email?: string;
  name?: {
    firstName?: string;
    lastName?: string;
  };
};

function parseAppleUser(value: unknown): AppleWebUser {
  if (!value) return {};
  if (typeof value === "object") return value as AppleWebUser;
  if (typeof value !== "string") return {};

  try {
    return JSON.parse(value) as AppleWebUser;
  } catch {
    return {};
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST required" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const idToken = String(body.id_token || body.idToken || "");
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Missing Apple identity token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalRedirect = allowedFinalRedirect(
      body.final_redirect || body.finalRedirect || DEFAULT_FINAL,
    );
    const appleUser = parseAppleUser(body.user);
    const cfg = await getAppleConfig(admin);
    const claims = await verifyAppleIdentityToken(idToken, [cfg.serviceId]);
    const providedEmail = String(appleUser.email || body.email || claims.email || "");
    const providedName =
      String(body.full_name || body.fullName || "") ||
      [appleUser.name?.firstName, appleUser.name?.lastName].filter(Boolean).join(" ");

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

    return new Response(JSON.stringify(login), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("apple-web-login:error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
