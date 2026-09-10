type Dependencies = {
  secret: () => string;
  sync: (userId: string) => Promise<void>;
  now?: () => number;
};

export function createConfirmedProfileEmailHandler(dependencies: Dependencies) {
  const respond = (body: unknown, status: number) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store" },
  });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);
    try {
      const secret = dependencies.secret();
      if (secret.trim().length < 32) return respond({ ok: false, error: "Email confirmation is temporarily unavailable." }, 503);
      const raw = await request.text();
      if (raw.length > 2048) return respond({ ok: false, error: "Invalid confirmation request." }, 401);
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw); } catch { return respond({ ok: false, error: "Invalid confirmation request." }, 401); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ ok: false, error: "Invalid confirmation request." }, 401);
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const expires = body.expires;
      const signature = typeof body.signature === "string" ? body.signature : "";
      const now = Math.floor((dependencies.now?.() ?? Date.now()) / 1000);
      if (!/^[1-9][0-9]*$/.test(userId) || !Number.isSafeInteger(Number(userId)) ||
        !Number.isSafeInteger(expires) || Number(expires) <= now || Number(expires) > now + 300 ||
        !/^[a-f0-9]{64}$/.test(signature)) return respond({ ok: false, error: "Invalid confirmation request." }, 401);
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const bytes = Uint8Array.from(signature.match(/../g)!, (byte) => parseInt(byte, 16));
      const valid = await crypto.subtle.verify("HMAC", key, bytes,
        new TextEncoder().encode(`sync_verified_email|${userId}|${expires}`));
      if (!valid) return respond({ ok: false, error: "Invalid confirmation request." }, 401);
      await dependencies.sync(userId);
      return respond({ ok: true }, 200);
    } catch {
      return respond({ ok: false, error: "Email confirmation is temporarily unavailable. Please try again." }, 503);
    }
  };
}
