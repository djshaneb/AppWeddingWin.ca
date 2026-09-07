import { callBd } from "./apple_auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { createNativeAuthExchange } from "./auth_exchange.ts";
import { validateNativeAppleExchange } from "./apple_native_exchange_validation.ts";

export async function validateStoredAppleNativeSession(
  session: Record<string, unknown>,
  user: Record<string, unknown>,
  profileId: string,
): Promise<boolean> {
  // One shared deadline includes Auth admin reads (which lack an individual
  // abortSignal option). Finish below the native app's 18-second request limit.
  const deadline = AbortSignal.timeout(10_000);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              deadline,
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      },
    },
  );
  return await validateNativeAppleExchange(session, user, profileId, {
    profile: async (id) => {
      const { data, error } = await admin.from("profiles").select(
        "id,bd_member_id",
      ).eq("id", id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if (error) throw new Error("Apple account validation unavailable");
      return data;
    },
    authUser: async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error && error.status !== 404) {
        throw new Error("Apple account validation unavailable");
      }
      return data.user;
    },
    identity: async (id) => {
      const { data, error } = await admin.from("bd_users_cache").select(
        "user_id,token,cookie",
      ).eq("user_id", id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if (error) throw new Error("Apple account validation unavailable");
      return data;
    },
    member: async (id) => {
      const { response, body } = await callBd(
        `/api/v2/user/get/${encodeURIComponent(id)}`,
        { signal: deadline },
      );
      if (!response.ok || body.status !== "success") {
        throw new Error("Apple account validation unavailable");
      }
      if (Array.isArray(body.message)) {
        if (body.message.length === 0) return null;
        if (body.message.length !== 1) {
          throw new Error("Apple account validation unavailable");
        }
        return body.message[0];
      }
      if (!body.message || typeof body.message !== "object") {
        throw new Error("Apple account validation unavailable");
      }
      return body.message;
    },
  });
}

export async function createValidatedAppleNativeExchange(
  args: Parameters<typeof createNativeAuthExchange>[0],
): Promise<string> {
  const user = args.payload.user as Record<string, unknown>;
  const session = args.payload.native_session as Record<string, unknown>;
  const profileId = args.payload.apple_profile_id;
  if (
    args.provider !== "apple" || typeof profileId !== "string" ||
    !await validateStoredAppleNativeSession(session, user, profileId)
  ) {
    throw new Error(
      "Your previous Apple permission is being removed. Please try signing in again shortly.",
    );
  }
  return await createNativeAuthExchange(args);
}
