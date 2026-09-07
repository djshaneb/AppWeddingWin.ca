import { googleOAuthErrorResponse } from "./google_oauth_error.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test("verified native Google failure returns a readable error without a session", async () => {
  const response = googleOAuthErrorResponse(
    "OAuth sign-in must be completed in the same browser where it was started.",
    "weddingwin://bd-login",
  );
  assert(
    response.status === 302,
    "must close the auth browser using the native callback",
  );
  const url = new URL(response.headers.get("Location")!);
  assert(
    url.protocol === "weddingwin:" && url.hostname === "bd-login",
    "wrong callback",
  );
  assert(
    url.searchParams.get("error") === "google_sign_in_failed",
    "missing error",
  );
  assert(
    url.searchParams.get("error_description")?.includes(
      "tap Sign in with Google again",
    ),
    "missing recovery instructions",
  );
  assert(
    [...url.searchParams.keys()].length === 2,
    "must not return a session, token or exchange code",
  );
  assert(await response.text() === "", "must not expose raw HTML");
  assert(
    response.headers.get("Cache-Control") === "no-store",
    "must not cache OAuth responses",
  );
});

Deno.test("cancelled Google authorization returns cancellation to the app", () => {
  const response = googleOAuthErrorResponse(
    "Google returned: access_denied",
    "weddingwin://bd-login",
  );
  const url = new URL(response.headers.get("Location")!);
  assert(
    url.searchParams.get("error") === "access_denied",
    "incorrect cancellation code",
  );
  assert(
    url.searchParams.get("error_description")?.includes("cancelled"),
    "incorrect cancellation message",
  );
});

Deno.test("untrusted Google return URLs never redirect", async () => {
  for (
    const target of [
      null,
      "",
      "not a url",
      "https://evil.example/bd-login",
      "https://www.weddingwin.ca/",
      "weddingwin://bd-login/",
      "weddingwin://evil/bd-login",
      "weddingwin://bd-login/extra",
      "weddingwin://bd-login:123",
      "weddingwin://user:password@bd-login",
      "weddingwin://bd-login?exchange_code=bad",
      "weddingwin://bd-login#bad",
    ]
  ) {
    const response = googleOAuthErrorResponse(
      "Invalid Google sign-in state.",
      target,
    );
    assert(
      response.status === 400 && !response.headers.has("Location"),
      `unsafe redirect: ${target}`,
    );
    assert(
      response.headers.get("Content-Type") === "text/plain; charset=utf-8",
      "fallback must be plaintext",
    );
    assert(!(await response.text()).includes("<"), "fallback contains HTML");
  }
});

Deno.test("Google errors do not expose internal provider diagnostics", async () => {
  const secret = "provider-private-debug-value";
  for (const target of [null, "weddingwin://bd-login"]) {
    const response = googleOAuthErrorResponse(
      `Token exchange failed: ${secret}`,
      target,
    );
    assert(
      !(response.headers.get("Location") || "").includes(secret),
      "private detail in callback",
    );
    assert(!(await response.text()).includes(secret), "private detail in body");
  }
});

Deno.test("callback enables native error redirect only after signed state verification", async () => {
  const source = await Deno.readTextFile(
    new URL("../google-oauth-callback/index.ts", import.meta.url),
  );
  const verify = source.indexOf("state = await verifyGoogleState(stateRaw)");
  const trusted = source.indexOf("verifiedReturnUrl = finalRedirect");
  const redeem = source.indexOf("await redeemOAuthLoginAttempt", trusted);
  assert(
    verify > 0 && trusted > verify && redeem > trusted,
    "state must be verified before enabling error redirect and still redeemed",
  );
  assert(
    source.includes("let verifiedReturnUrl: string | null = null"),
    "unverified requests must not redirect",
  );
  assert(
    source.includes(
      "googleOAuthErrorResponse(message, verifiedReturnUrl, corsHeaders)",
    ),
    "handler must use the tested response helper",
  );
});
