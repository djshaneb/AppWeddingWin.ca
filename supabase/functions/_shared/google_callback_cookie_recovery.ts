import { readOAuthBindingCookie, sha256Base64Url } from "./oauth_attempt.ts";

const PARAMETER = "ww_callback_cookie_check";
const PURPOSE = "google-callback-cookie-confirmation";
const TTL_SECONDS = 60;
const encoder = new TextEncoder();

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-")
    .replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.charCodeAt(0),
  );
}

/** Call only after the original OAuth state has passed signature/expiry checks. */
export async function retryGoogleCallbackCookieOnce(
  request: Request,
  options: { backendUrl: string; signingSecret: string; stateExpiresAt: number },
): Promise<Response | null> {
  const url = new URL(request.url);
  const markers = url.searchParams.getAll(PARAMETER);
  url.searchParams.delete(PARAMETER);
  const query = url.searchParams.toString();
  const now = Math.floor(Date.now() / 1000);
  const invalid = () => new Error("Invalid Google sign-in state continuation.");
  if (!options.signingSecret) throw invalid();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(options.signingSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );

  if (markers.length) {
    // A continuation is never retried, including when its cookie is still
    // absent. Redemption below must independently require the original binding.
    try {
      if (markers.length !== 1 || !/^[A-Za-z0-9_-]{1,1024}$/.test(markers[0])) {
        throw invalid();
      }
      const { h, ...payload } = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(decode(markers[0])),
      );
      if (
        typeof h !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(h) ||
        payload.purpose !== PURPOSE || !Number.isInteger(payload.exp) ||
        payload.exp <= now || payload.exp > now + TTL_SECONDS ||
        payload.exp > options.stateExpiresAt ||
        payload.q !== await sha256Base64Url(query) ||
        !await crypto.subtle.verify(
          "HMAC", key, decode(h), encoder.encode(JSON.stringify(payload)),
        )
      ) throw invalid();
      return null;
    } catch {
      throw invalid();
    }
  }

  if (readOAuthBindingCookie(request, "google")) return null;
  const exp = Math.min(now + TTL_SECONDS, options.stateExpiresAt);
  if (!Number.isInteger(exp) || exp <= now) throw invalid();
  const payload = { purpose: PURPOSE, q: await sha256Base64Url(query), exp };
  const signature = await crypto.subtle.sign(
    "HMAC", key, encoder.encode(JSON.stringify(payload)),
  );
  const target = new URL("/functions/v1/google-oauth-callback", options.backendUrl);
  if (target.protocol !== "https:" || target.username || target.password) {
    throw invalid();
  }
  target.search = query;
  target.searchParams.set(PARAMETER, encode(encoder.encode(JSON.stringify({
    ...payload, h: encode(new Uint8Array(signature)),
  }))));
  // This only re-requests the callback. It does not set/rotate a cookie, create
  // an attempt, or authorize a login. Browser binding remains mandatory.
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
