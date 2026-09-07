import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { callBd } from "./apple_auth.ts";
import {
  type AppleLoginPreflightArgs,
  AppleLoginPreflightUnavailableError,
  requireAppleLoginPreflight,
} from "./apple_login_preflight.ts";

export async function preflightAppleAccountLogin(
  args: AppleLoginPreflightArgs,
) {
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
  const lookup = async (property: "user_id" | "email", value: string) => {
    const query = new URLSearchParams({
      property,
      property_operator: "eq",
      property_value: value,
      limit: "2",
    });
    const { response, body } = await callBd(`/api/v2/user/get?${query}`, {
      signal: deadline,
    });
    if (
      !response.ok || body.status !== "success" ||
      !Array.isArray(body.message) || body.message.length > 1
    ) {
      throw new AppleLoginPreflightUnavailableError();
    }
    const metadata = body as Record<string, unknown>;
    const totalMatches = metadata.total === body.message.length ||
      metadata.total === String(body.message.length);
    // A truncated/inconsistent success envelope is not proof of absence or of
    // one unique account. BD may include informational cursor strings even on
    // its final page. Only an explicit matching total makes those harmless;
    // without it, a nonempty cursor still means completeness is unproven.
    // This query requests the first two exact matches and never follows cursors.
    if (
      (metadata.total !== undefined && !totalMatches) ||
      [metadata.next_page, metadata.prev_page].some((cursor) =>
        cursor != null && cursor !== "" &&
        (!totalMatches || typeof cursor !== "string")
      ) ||
      (metadata.current_page !== undefined &&
        ![0, 1, "0", "1"].includes(metadata.current_page as never)) ||
      (metadata.total_pages !== undefined &&
        ![0, 1, "0", "1"].includes(metadata.total_pages as never))
    ) throw new AppleLoginPreflightUnavailableError();
    return body.message;
  };
  return await requireAppleLoginPreflight(args, {
    membersByEmail: (email) => lookup("email", email),
    memberById: async (id) => (await lookup("user_id", id))[0] || null,
    authUserById: async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error && error.status !== 404) {
        throw new AppleLoginPreflightUnavailableError();
      }
      return data.user;
    },
    hasProfileByAppleSubject: async (subject) => {
      const { data, error } = await admin.from("profiles").select("id")
        .eq("apple_sub", subject).limit(1).maybeSingle();
      if (error) throw new AppleLoginPreflightUnavailableError();
      return !!data;
    },
    hasAuthUserByEmail: async (email) => {
      // GoTrue's supported admin API is paginated; unlike a profile email, this
      // is authoritative Auth ownership. The shared deadline bounds all pages.
      for (let page = 1; page <= 1000; page++) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (error) throw new AppleLoginPreflightUnavailableError();
        if (
          data.users.some((user) => user.email?.trim().toLowerCase() === email)
        ) return true;
        if (data.users.length < 200) return false;
      }
      throw new AppleLoginPreflightUnavailableError();
    },
  });
}
