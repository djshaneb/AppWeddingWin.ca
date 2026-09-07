import { sha256Base64Url } from "./oauth_attempt.ts";

type ExchangeDependencies = {
  redeem: (
    args: { codeHash: string; codeChallenge: string; provider: "apple" },
  ) => Promise<unknown>;
  validateSession: (
    session: Record<string, unknown>,
    user: Record<string, unknown>,
    profileId: string,
  ) => Promise<boolean>;
};
const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};
const INVALID =
  "Apple login exchange is invalid or expired. Please start again.";

export function isAppleNativeMemberId(
  value: unknown,
): value is string | number {
  return typeof value === "string"
    ? /^[1-9][0-9]{0,18}$/.test(value) && !/\s/.test(value)
    : typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function createAppleNativeExchangeHandler(deps: ExchangeDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: HEADERS });
    }
    if (request.method !== "POST") {
      return Response.json({ ok: false, error: "Method not allowed" }, {
        status: 405,
        headers: HEADERS,
      });
    }
    let body: Record<string, unknown>;
    try {
      if (
        request.headers.get("content-type")?.split(";")[0].trim()
          .toLowerCase() !== "application/json"
      ) {
        throw new Error("invalid");
      }
      const text = await request.text();
      if (text.length > 4096) throw new Error("invalid");
      body = JSON.parse(text);
      if (
        !body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) =>
          key !== "code" && key !== "code_verifier"
        ) ||
        typeof body.code !== "string" || body.code.length !== 43 ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.code) ||
        typeof body.code_verifier !== "string" ||
        body.code_verifier.trim() !== body.code_verifier ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier)
      ) {
        throw new Error("invalid");
      }
      // The only accepted values are two strings, so every string token followed
      // by ':' is a top-level key. Count decoded keys, including JSON escapes.
      const seen = new Set<string>();
      for (const match of text.matchAll(/"(?:\\.|[^"\\])*"/g)) {
        if (!/^\s*:/.test(text.slice(match.index! + match[0].length))) continue;
        const key = JSON.parse(match[0]);
        if (seen.has(key)) throw new Error("invalid");
        seen.add(key);
      }
      if (seen.size !== 2) throw new Error("invalid");
    } catch {
      return Response.json({ ok: false, error: INVALID }, {
        status: 400,
        headers: HEADERS,
      });
    }
    try {
      const result = await deps.redeem({
        codeHash: await sha256Base64Url(body.code as string),
        codeChallenge: await sha256Base64Url(body.code_verifier as string),
        provider: "apple",
      });
      const payload = result as Record<string, unknown> | null;
      const user = payload?.user as Record<string, unknown> | undefined;
      const session = payload?.native_session as
        | Record<string, unknown>
        | undefined;
      const profileId = payload?.apple_profile_id;
      if (
        !user || typeof user.email !== "string" || !user.email.trim() ||
        !isAppleNativeMemberId(session?.user_id) ||
        typeof session?.token !== "string" ||
        !session.token.trim() || typeof profileId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          profileId,
        )
      ) {
        return Response.json({ ok: false, error: INVALID }, {
          status: 410,
          headers: HEADERS,
        });
      }
      // The atomic RPC only checks one-time PKCE/expiry. Recheck the exact
      // currently existing account after redemption, never return its stale
      // snapshot merely because the exchange was created within five minutes.
      if (!await deps.validateSession(session, user, profileId)) {
        return Response.json({ ok: false, error: INVALID }, {
          status: 410,
          headers: HEADERS,
        });
      }
      return Response.json({ ok: true, user, native_session: session }, {
        status: 200,
        headers: HEADERS,
      });
    } catch {
      return Response.json({
        ok: false,
        error: "Apple login exchange is unavailable. Please try again.",
      }, { status: 500, headers: HEADERS });
    }
  };
}
