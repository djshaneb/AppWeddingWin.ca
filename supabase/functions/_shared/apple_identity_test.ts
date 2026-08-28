import { verifiedAppleEmail } from "./apple_identity.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

function assertThrows(run: () => unknown, expectedMessage: RegExp) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expectedMessage.test(message), `unexpected rejection: ${message}`);
    return;
  }
  throw new Error("expected operation to reject");
}

Deno.test("Apple account linking uses only the signed token email", () => {
  assert(
    verifiedAppleEmail("Verified@Example.test", "verified@example.test") ===
      "Verified@Example.test",
    "matching supplied email should retain the signed token value",
  );
  assert(
    verifiedAppleEmail("", "victim@example.test") === "",
    "an unsigned supplied email must not become an identity attribute",
  );
});

Deno.test("Apple account linking rejects a supplied victim email", () => {
  assertThrows(
    () => verifiedAppleEmail("attacker@example.test", "victim@example.test"),
    /did not match/i,
  );
});
