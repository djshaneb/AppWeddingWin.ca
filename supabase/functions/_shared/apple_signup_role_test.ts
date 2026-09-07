import {
  appleSignupSubscriptionId,
  assertAppleSignupAccountType,
} from "./apple_signup_role.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("Apple website signup permits only the public vendor and couple plans", () => {
  assert(
    appleSignupSubscriptionId("vendor") === "17",
    "vendor checkout must use plan 17",
  );
  assert(
    appleSignupSubscriptionId("couple") === "18",
    "couple checkout must use plan 18",
  );
  assert(
    appleSignupSubscriptionId("vendor_basic") === "35",
    "basic vendor checkout must use plan 35",
  );
  assert(
    appleSignupSubscriptionId("vendor_show") === "38",
    "Niagara vendor checkout must use plan 38",
  );
  assert(
    appleSignupSubscriptionId("vendor_venue") === "23",
    "venue checkout must use plan 23",
  );
  assert(
    appleSignupSubscriptionId("vendor_multi") === "33",
    "multi-business vendor checkout must use plan 33",
  );
  assert(
    appleSignupSubscriptionId("vendor_venue_multi") === "37",
    "multi-business venue checkout must use plan 37",
  );
  for (
    const invalid of [
      "admin",
      "4",
      "17",
      "18",
      "28",
      "36",
      "vendor_claim",
      "",
      null,
    ]
  ) {
    let rejected = false;
    try {
      appleSignupSubscriptionId(invalid as "vendor");
    } catch {
      rejected = true;
    }
    assert(rejected, "unrecognized account type was mapped to an allowed plan");
  }
});

Deno.test("Apple checkout existing-account protection is non-mutating and plain login is unaffected", () => {
  for (
    const role of [
      "vendor",
      "vendor_basic",
      "vendor_show",
      "vendor_venue",
      "vendor_multi",
      "vendor_venue_multi",
      "couple",
    ] as const
  ) {
    for (
      const plan of [
        "17",
        "18",
        "23",
        "33",
        "35",
        "37",
        "38",
        "10",
        "28",
        "36",
        "4",
        "",
        undefined,
      ]
    ) {
      const member = {
        user_id: "test-member",
        subscription_id: plan,
        active: "2",
      };
      const original = JSON.stringify(member);
      let message = "";
      try {
        assertAppleSignupAccountType(member, role);
      } catch (error) {
        message = (error as Error).message;
      }
      assert(
        message ===
          (plan === appleSignupSubscriptionId(role)
            ? ""
            : "APPLE_SIGNUP_ROLE_MISMATCH"),
        "existing account mismatches were not guarded",
      );
      assert(
        JSON.stringify(member) === original,
        "account guard changed member data",
      );
      assertAppleSignupAccountType(member);
    }
  }
  assertAppleSignupAccountType(undefined, "vendor");
  assertAppleSignupAccountType({}, "couple");
});

Deno.test("Apple direct login checks the existing account before creation and before session issuance", async () => {
  const source = await Deno.readTextFile(
    new URL("./apple_auth.ts", import.meta.url),
  );
  const direct = source.slice(
    source.indexOf("async function makeDirectBdAppleLoginResult("),
    source.indexOf("export async function makeBdAppleLoginResult("),
  );
  const firstGuard = direct.indexOf(
    "assertAppleSignupAccountType(user, args.expectedSignupRole)",
  );
  const create = direct.indexOf("await createBdUserForApple(");
  const secondGuard = direct.lastIndexOf(
    "assertAppleSignupAccountType(user, args.expectedSignupRole)",
  );
  const session = direct.indexOf("await ensureBdSessionCookie(user)");
  assert(
    firstGuard > 0 && firstGuard < create && secondGuard > create &&
      secondGuard < session,
    "account-type guard no longer covers existing members or duplicate-email races before session issuance",
  );
  assert(
    !direct.includes('"/api/v2/user/update"') &&
      !direct.includes("subscription_id:"),
    "direct Apple sign-in unexpectedly mutates the existing membership plan",
  );
});
