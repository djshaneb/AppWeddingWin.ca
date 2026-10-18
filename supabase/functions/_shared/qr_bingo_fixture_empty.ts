import type { SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";

type WebsiteFixturePrincipal = { kind?: string; userId?: string } | null;

export async function websiteFixtureContextIsConfirmedEmpty(
  principal: WebsiteFixturePrincipal,
  action: string,
  admin: SupabaseClient,
) {
  // Call only after website HMAC, expiry, body hash and nonce validation.
  // This shortcut reveals no member data and authorizes no scan or draw action.
  const userId = principal?.userId || "";
  if (principal?.kind !== "couple" || action !== "fixture_context" ||
    !/^[1-9][0-9]{0,17}$/.test(userId) || ["38970", "38971"].includes(userId)) {
    return false;
  }
  try {
    // Include disabled, expired and superseded assignments: every fixture
    // participant must retain the existing fresh member and fixture checks.
    const results = await Promise.all([
      admin.from("app_review_raffle_fixtures").select("id")
        .or(`couple_bd_user_id.eq.${userId},vendor_bd_user_id.eq.${userId}`).limit(1),
      admin.from("app_review_raffle_fixture_participants").select("fixture_id")
        .eq("couple_bd_user_id", userId).limit(1),
      admin.from("qr_bingo_email_test_fixtures").select("id")
        .or(`couple_bd_user_id.eq.${userId},vendor_bd_user_id.eq.${userId}`).limit(1),
    ]);
    return results.every((result) =>
      !result.error && Array.isArray(result.data) && result.data.length === 0
    );
  } catch {
    // An unknown assignment keeps the original checks; it never grants absence.
    return false;
  }
}
