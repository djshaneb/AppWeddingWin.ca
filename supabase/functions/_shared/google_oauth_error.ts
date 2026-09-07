/** Only pass a return URL obtained from successfully verified signed state. */
export function googleOAuthErrorResponse(
  message: string,
  verifiedReturnUrl: string | null,
  headers: Record<string, string> = {},
): Response {
  const cancelled = message === "Google returned: access_denied";
  const interrupted = /same browser|sign-in state|authorization code/i.test(
    message,
  );
  const description = cancelled
    ? "Google sign-in was cancelled. You can try again when you're ready."
    : interrupted
    ? "Your Google sign-in was interrupted or expired. Please close this window and tap Sign in with Google again."
    : "Google sign-in could not be completed. Please try again.";
  const responseHeaders = {
    ...headers,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (verifiedReturnUrl) {
    try {
      const target = new URL(verifiedReturnUrl);
      // Exact native callback only. Never redirect based on raw request input,
      // provider error text, or an unverified/expired state payload.
      if (
        target.protocol === "weddingwin:" && target.hostname === "bd-login" &&
        target.pathname === "" &&
        !target.username && !target.password && !target.port &&
        !target.search && !target.hash
      ) {
        target.searchParams.set(
          "error",
          cancelled ? "access_denied" : "google_sign_in_failed",
        );
        target.searchParams.set("error_description", description);
        return new Response(null, {
          status: 302,
          headers: { ...responseHeaders, Location: target.toString() },
        });
      }
    } catch {
      // Fail closed to a readable, non-redirecting response.
    }
  }
  // Supabase rewrites GET text/html to text/plain. Do not expose HTML source
  // or internal provider/database diagnostics in this fallback.
  return new Response(
    `Google sign-in failed\n\n${description}\n\nReturn to WeddingWin to try again.`,
    {
      status: 400,
      headers: {
        ...responseHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
}
