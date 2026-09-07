import { equalAppleSecret } from "../_shared/apple_grant_lifecycle.ts";
import {
  appleGrantPrivateConfig,
  runStoredAppleRevocations,
} from "../_shared/apple_grant_store.ts";

Deno.serve(async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required." }), {
      status: 405,
      headers,
    });
  }
  try {
    const secrets = await appleGrantPrivateConfig();
    if (
      !await equalAppleSecret(
        request.headers.get("X-WeddingWin-Apple-Worker-Secret") || "",
        secrets.apple_revocation_worker_secret,
      )
    ) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers,
      });
    }
    return new Response(JSON.stringify(await runStoredAppleRevocations()), {
      status: 200,
      headers,
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Account and Apple permission cleanup will retry." }),
      { status: 503, headers },
    );
  }
});
