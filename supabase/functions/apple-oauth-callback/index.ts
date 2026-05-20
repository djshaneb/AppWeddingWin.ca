import {
  admin,
  corsHeaders,
  DEFAULT_FINAL,
  errorPage,
  getAppleConfig,
  makeBdAppleLoginRedirect,
  makeAppleClientSecret,
  upsertAppleUser,
  verifyAppleIdentityToken,
} from "../_shared/apple_auth.ts";

const APPLE_RETURN_URL =
  Deno.env.get("APPLE_RETURN_URL") || "https://www.weddingwin.ca/auth/apple-callback";

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const form = await req.formData();
    const code = String(form.get("code") || "");
    const idTokenFromForm = String(form.get("id_token") || "");
    const stateRaw = String(form.get("state") || "");
    const appleError = String(form.get("error") || "");

    if (appleError) return errorPage(`Apple returned: ${appleError}`);
    if (!code && !idTokenFromForm) return errorPage("Missing Apple authorization response.");

    let finalRedirect = DEFAULT_FINAL;
    if (stateRaw) {
      try {
        const parsed = JSON.parse(b64urlDecode(stateRaw));
        if (parsed && typeof parsed.r === "string") finalRedirect = parsed.r;
      } catch {
        // ignore malformed state
      }
    }

    const cfg = await getAppleConfig(admin);
    const clientSecret = await makeAppleClientSecret(cfg, cfg.serviceId);
    let idToken = idTokenFromForm;

    if (!idToken && code) {
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
      idToken = tokenJson.id_token || "";
    }

    const claims = await verifyAppleIdentityToken(idToken, [cfg.serviceId]);
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
    const redirectUrl = await makeBdAppleLoginRedirect({
      appleSub: user.appleSub,
      email: user.email,
      fullName: user.fullName,
      finalRedirect,
    });

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: redirectUrl,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorPage(msg);
  }
});
