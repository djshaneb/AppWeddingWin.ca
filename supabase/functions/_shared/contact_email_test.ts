import { normalizeContactEmail } from "./contact_email.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: RegExp) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!expectedMessage.test(message)) {
      throw new Error(`unexpected rejection: ${message}`);
    }
    return;
  }
  throw new Error("expected operation to reject");
}

Deno.test("contact email accepts and normalizes Apple private relay addresses", () => {
  assertEquals(
    normalizeContactEmail("  Relay.Value@privaterelay.appleid.com  "),
    "relay.value@privaterelay.appleid.com",
    "Apple relay email should remain a valid contact address",
  );
});

Deno.test("contact email preserves normal validation and optional empty values", () => {
  assertEquals(
    normalizeContactEmail(" Person@Example.ca "),
    "person@example.ca",
    "ordinary contact email should normalize",
  );
  assertEquals(
    normalizeContactEmail("", { allowEmpty: true }),
    "",
    "profile updates may omit an email",
  );
  assertThrows(() => normalizeContactEmail("not-an-email"), /valid email/i);
  assertThrows(
    () => normalizeContactEmail("<person@example.ca>"),
    /valid email/i,
  );
});

Deno.test("all signup and profile endpoints use the relay-safe contact validator", async () => {
  for (
    const path of [
      "../bd-couple-signup/index.ts",
      "../bd-vendor-signup/index.ts",
      "../bd-complete-profile/index.ts",
    ]
  ) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    if (!source.includes("normalizeContactEmail")) {
      throw new Error(`${path} must use normalizeContactEmail`);
    }
    if (
      /regular email|real email|relay email cannot|not an Apple private relay/i
        .test(source)
    ) {
      throw new Error(`${path} must not reject Apple private relay addresses`);
    }
  }
});

Deno.test("app never gates access on replacing an Apple relay address", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const profileGate = source.slice(
    source.indexOf("const shouldCompleteProfile"),
    source.indexOf("const usesApplePrivateRelayEmail"),
  );
  const emailValidator = source.slice(
    source.indexOf("function isValidEmail"),
    source.indexOf("function formatWeddingDate"),
  );

  if (profileGate.includes("isApplePrivateRelayEmail")) {
    throw new Error(
      "Apple relay email must not trigger mandatory profile completion",
    );
  }
  if (emailValidator.includes("isApplePrivateRelayEmail")) {
    throw new Error("Apple relay email must pass client email validation");
  }
  if (
    /Use your real email|regular email address|mustReplaceRelayEmail/.test(
      source,
    )
  ) {
    throw new Error(
      "app must not require a personal email in place of Apple relay",
    );
  }
  if (!/Keep Apple email forwarding\s+enabled/.test(source)) {
    throw new Error(
      "app must explain how relay users continue receiving contact email",
    );
  }
});
