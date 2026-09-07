import {
  nativeSignupErrorMessage,
  NativeSignupIntentError,
  nativeSignupRoleFromBody,
  nativeSignupRoleFromQuery,
  nativeSignupSubscriptionId,
  parseNativeSignupBody,
} from "./native_signup_intent.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function rejects(run: () => unknown) {
  let rejected = false;
  try {
    run();
  } catch (error) {
    rejected = error instanceof NativeSignupIntentError;
  }
  assert(rejected, "invalid signup intent was accepted");
}

Deno.test("native signup intent is optional, explicit, and limited to vendor17 or couple18", () => {
  assert(
    nativeSignupRoleFromBody({}) === undefined &&
      nativeSignupRoleFromQuery(new URLSearchParams("subscription_id=17")) ===
        undefined,
    "ordinary login was mistaken for explicit signup",
  );
  for (const role of ["vendor", "couple"] as const) {
    const plan = nativeSignupSubscriptionId(role);
    assert(
      nativeSignupRoleFromBody({ signup_role: role, subscription_id: plan }) ===
        role,
      "native signup role lost",
    );
    assert(
      nativeSignupRoleFromQuery(
        new URLSearchParams({ signup_role: role, subscription_id: plan }),
      ) === role,
      "OAuth signup role lost",
    );
    assert(
      nativeSignupRoleFromBody({ signup_role: role }) === role,
      "canonical role requires duplicate plan field",
    );
    for (const bad of ["4", "35", "38", "", role === "vendor" ? "18" : "17"]) {
      rejects(() =>
        nativeSignupRoleFromBody({ signup_role: role, subscription_id: bad })
      );
      rejects(() =>
        nativeSignupRoleFromQuery(
          new URLSearchParams({ signup_role: role, subscription_id: bad }),
        )
      );
    }
  }
  for (
    const invalid of [
      null,
      false,
      17,
      "",
      "17",
      "admin",
      "vendor_show",
      "vendor_venue",
      "Vendor",
    ]
  ) {
    rejects(() => nativeSignupRoleFromBody({ signup_role: invalid }));
    rejects(() =>
      nativeSignupRoleFromQuery(
        new URLSearchParams({ signup_role: String(invalid) }),
      )
    );
  }
});

Deno.test("native signup rejects duplicate fields in JSON and query strings including escaped key names", () => {
  for (
    const text of [
      '{"signup_role":"vendor","signup_role":"couple"}',
      '{"signup_role":"vendor","signup_\\u0072ole":"vendor"}',
      '{"subscription_id":"17","subscription_id":"18"}',
      '{"signup_role":"vendor","subscription_id":"17","subscription_\\u0069d":"17"}',
    ]
  ) rejects(() => parseNativeSignupBody(text));
  for (
    const query of [
      "signup_role=vendor&signup_role=couple",
      "signup_role=vendor&signup_role=vendor",
      "signup_role=vendor&subscription_id=17&subscription_id=18",
    ]
  ) {
    rejects(() => nativeSignupRoleFromQuery(new URLSearchParams(query)));
  }
  const body = parseNativeSignupBody(
    '{"client_context":{"signup_role":"couple"},"name":"A \\"signup_role\\": string", "signup_role":"vendor", "subscription_id":"17"}',
  );
  assert(
    nativeSignupRoleFromBody(body) === "vendor",
    "nested data or quoted display text was misread as a duplicate top-level field",
  );
  for (
    const text of [
      "[]",
      "null",
      '"test"',
      '{"token":"private-token"',
      "{".repeat(70_000),
    ]
  ) rejects(() => parseNativeSignupBody(text));
});

Deno.test("native account-type mismatch uses actionable copy without claiming an account was converted", () => {
  const message = nativeSignupErrorMessage("APPLE_SIGNUP_ROLE_MISMATCH");
  assert(
    message.includes("Sign in to your existing account") &&
      message.includes("has not been changed") && !message.includes("APPLE_"),
    "mismatch error is not user-friendly",
  );
});

Deno.test("native Apple validates signup intent before provider or account operations and forwards the guard", async () => {
  const source = await Deno.readTextFile(
    new URL("../apple-native-login/index.ts", import.meta.url),
  );
  assert(
    source.indexOf("nativeSignupRoleFromBody(body)") <
        source.indexOf("await getAppleConfig(admin)") &&
      source.includes("expectedSignupRole: signupRole"),
    "native signup intent was lost before the account guard",
  );
});
