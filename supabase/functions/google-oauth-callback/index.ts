import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;
const DEFAULT_FINAL = "https://www.weddingwin.ca/";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("invalid id_token");
  return JSON.parse(b64urlDecode(part));
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{background:#0b0b0c;color:#e5e5e7;font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{text-align:center;padding:32px;max-width:480px}.spinner{width:32px;height:32px;border:3px solid #2a2a2e;border-top-color:#d4af37;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.err{color:#ff6b6b;font-family:monospace;font-size:12px;word-break:break-all;margin-top:16px;text-align:left}</style>
</head><body><div class="card">${body}</div></body></html>`;
}

function errorPage(message: string): Response {
  const body = `<div style="color:#ff6b6b;font-weight:600;margin-bottom:12px">Sign-in failed</div><div>${message}</div><div style="margin-top:24px"><a href="${DEFAULT_FINAL}" style="color:#d4af37">Go back</a></div>`;
  return new Response(htmlPage("Sign-in failed", body), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function getConfig(): Promise<{ id: string; secret: string }> {
  const { data, error } = await admin
    .from("admin_config")
    .select("key, value")
    .in("key", ["google_client_id", "google_client_secret"]);
  if (error) throw new Error(`config read failed: ${error.message}`);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const id = map.get("google_client_id");
  const secret = map.get("google_client_secret");
  if (!id || !secret) throw new Error("google credentials not configured");
  return { id, secret };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) return errorPage(`Google returned: ${oauthError}`);
    if (!code) return errorPage("Missing authorization code.");

    let finalRedirect = DEFAULT_FINAL;
    if (stateRaw) {
      try {
        const parsed = JSON.parse(b64urlDecode(stateRaw));
        if (parsed && typeof parsed.r === "string") finalRedirect = parsed.r;
      } catch {
        // ignore malformed state, fall back to default
      }
    }

    const { id: clientId, secret: clientSecret } = await getConfig();

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return errorPage(`Token exchange failed: ${text.slice(0, 300)}`);
    }

    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) return errorPage("Google did not return an ID token.");

    const claims = decodeJwtPayload(tokenJson.id_token) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
      sub?: string;
      aud?: string;
      iss?: string;
    };

    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
      return errorPage("Invalid token issuer.");
    }
    if (claims.aud !== clientId) {
      return errorPage("Token audience mismatch.");
    }
    if (!claims.email) return errorPage("Google account has no email.");

    const email = claims.email;

    let userId: string | null = null;
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return errorPage(`listUsers failed: ${listErr.message}`);
    const existing = list.users.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );

    if (existing) {
      userId = existing.id;
      const md = existing.user_metadata || {};
      await admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: {
          ...md,
          full_name: md.full_name || claims.name || "",
          name: md.name || claims.name || "",
          avatar_url: md.avatar_url || claims.picture || "",
          picture: md.picture || claims.picture || "",
          provider: "google",
        },
      });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: claims.name || "",
          name: claims.name || "",
          avatar_url: claims.picture || "",
          picture: claims.picture || "",
          provider: "google",
        },
      });
      if (createErr || !created.user) {
        return errorPage(`createUser failed: ${createErr?.message ?? "unknown"}`);
      }
      userId = created.user.id;
    }

    if (!userId) return errorPage("Could not establish user.");

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: finalRedirect },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return errorPage(`generateLink failed: ${linkErr?.message ?? "no link"}`);
    }

    const verifyRes = await fetch(linkData.properties.action_link, {
      redirect: "manual",
      headers: { "User-Agent": "WeddingWinOAuthBridge/1.0" },
    });

    const verifyLocation = verifyRes.headers.get("location") || "";
    if (!verifyLocation) {
      return errorPage(
        `Supabase verify did not redirect (status ${verifyRes.status}). Body: ${(await verifyRes.text()).slice(0, 300)}`
      );
    }

    let parsedVerify: URL;
    try {
      parsedVerify = new URL(verifyLocation);
    } catch {
      return errorPage(`Verify returned invalid Location: ${verifyLocation.slice(0, 300)}`);
    }

    const hash = parsedVerify.hash.replace(/^#/, "");
    const queryError =
      parsedVerify.searchParams.get("error_description") ||
      parsedVerify.searchParams.get("error");

    if (!hash || !hash.includes("access_token")) {
      const detail = queryError
        ? `Supabase rejected the sign-in: ${queryError}`
        : `Supabase verify produced no tokens. Redirect was: ${verifyLocation.slice(0, 300)}`;
      return errorPage(detail);
    }

    const finalUrl = new URL(finalRedirect);
    finalUrl.hash = hash;

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: finalUrl.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorPage(msg);
  }
});
