import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import {
  createOAuthLoginAttempt,
  prepareOAuthBinding,
} from "../_shared/oauth_attempt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_LOGIN_SECRET = Deno.env.get("APP_LOGIN_SECRET") || "";
const GOOGLE_CALLBACK_URL =
  Deno.env.get("GOOGLE_CALLBACK_URL") ||
  "https://www.weddingwin.ca/auth/google-callback";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function b64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function allowedFinalRedirect(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (url.protocol === "https:" && host === "weddingwin.ca") return url.toString();
    if (
      url.protocol === "weddingwin:" &&
      (url.hostname.toLowerCase() === "bd-login" || url.pathname.replace(/\/+$/, "").endsWith("/bd-login"))
    ) {
      return url.toString();
    }
  } catch {
    // Fall through to the safe website default.
  }
  return "https://www.weddingwin.ca/";
}

async function signState(payload: Record<string, unknown>) {
  if (!APP_LOGIN_SECRET) throw new Error("APP_LOGIN_SECRET is not configured");
  const payloadText = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_LOGIN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadText),
  );
  return b64url(JSON.stringify({
    ...payload,
    h: b64urlBytes(new Uint8Array(signature)),
  }));
}

function requestedSubscriptionId(value: string | null): string {
  return value === "17" ? "17" : "18";
}

function consentFromUrl(url: URL) {
  if (
    url.searchParams.get("accepted_terms") !== "1" ||
    url.searchParams.get("accepted_privacy") !== "1"
  ) {
    return null;
  }

  return {
    acceptedAt: url.searchParams.get("accepted_at") || new Date().toISOString(),
    termsVersion: url.searchParams.get("terms_version") || "",
    privacyVersion: url.searchParams.get("privacy_version") || "",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const finalRedirect = allowedFinalRedirect(
      url.searchParams.get("redirect_to") || "https://www.weddingwin.ca/",
    );
    const requestedCodeChallenge = String(url.searchParams.get("code_challenge") || "").trim();
    const nativeRedirect = finalRedirect.startsWith("weddingwin:");
    if (nativeRedirect && !/^[A-Za-z0-9_-]{43,128}$/.test(requestedCodeChallenge)) {
      return new Response(JSON.stringify({ error: "A valid native PKCE code challenge is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const stateCodeChallenge = requestedCodeChallenge || b64urlBytes(crypto.getRandomValues(new Uint8Array(32)));
    const subscriptionId = requestedSubscriptionId(url.searchParams.get("subscription_id"));
    const consent = consentFromUrl(url);

    const { data, error } = await admin
      .from("admin_config")
      .select("key, value")
      .eq("key", "google_client_id")
      .maybeSingle();

    if (error || !data?.value) {
      return new Response(
        JSON.stringify({ error: "google_client_id not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = data.value;
    const nonce = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const statePayload = {
      r: finalRedirect,
      n: nonce,
      s: subscriptionId,
      c: consent,
      p: stateCodeChallenge,
      exp: expiresAt,
    };
    const state = await signState(statePayload);
    const binding = prepareOAuthBinding(req, "google");
    await createOAuthLoginAttempt({
      admin,
      provider: "google",
      state,
      bindingSecret: binding.bindingSecret,
      expiresAtSeconds: expiresAt,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: GOOGLE_CALLBACK_URL,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      include_granted_scopes: "true",
      prompt: "select_account",
      state,
      nonce,
    });

    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: googleUrl,
        "Cache-Control": "no-store",
        "Set-Cookie": binding.setCookie,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
