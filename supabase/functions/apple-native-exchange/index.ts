import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { createAppleNativeExchangeHandler } from "../_shared/apple_native_exchange.ts";
import { validateStoredAppleNativeSession } from "../_shared/apple_native_exchange_store.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);
const handleExchange = createAppleNativeExchangeHandler({
  validateSession: validateStoredAppleNativeSession,
  redeem: async ({ codeHash, codeChallenge, provider }) => {
    const { data, error } = await admin.rpc("redeem_native_auth_exchange", {
      p_code_hash: codeHash,
      p_code_challenge: codeChallenge,
      p_provider: provider,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error("Apple login exchange unavailable");
    return data;
  },
});
Deno.serve(handleExchange);
