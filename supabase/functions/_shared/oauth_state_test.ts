import {
  allowedFinalRedirect,
  assertAppleOAuthNonce,
  createSignedAppleOAuthState,
  DEFAULT_OAUTH_FINAL,
  verifySignedAppleOAuthState,
} from "./oauth_state.ts";

const TEST_SECRET = "test-only-oauth-state-secret";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

async function assertRejects(
  run: () => Promise<unknown> | unknown,
  expectedMessage: RegExp,
) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expectedMessage.test(message), `unexpected rejection: ${message}`);
    return;
  }
  throw new Error("expected operation to reject");
}

Deno.test("OAuth redirect allowlist clamps external and deceptive hosts", () => {
  assert(
    allowedFinalRedirect("https://attacker.invalid/steal") ===
      DEFAULT_OAUTH_FINAL,
    "external redirects must use the safe default",
  );
  assert(
    allowedFinalRedirect("https://weddingwin.ca.attacker.invalid/steal") ===
      DEFAULT_OAUTH_FINAL,
    "lookalike hosts must use the safe default",
  );
  assert(
    allowedFinalRedirect("https://www.weddingwin.ca/account?from=apple") ===
      "https://www.weddingwin.ca/account?from=apple",
    "the WeddingWin website should remain allowed",
  );
  assert(
    allowedFinalRedirect("weddingwin://bd-login") === "weddingwin://bd-login",
    "the native login callback should remain allowed",
  );
  assert(
    allowedFinalRedirect("weddingwin://attacker.invalid/path/bd-login") ===
      DEFAULT_OAUTH_FINAL,
    "a deceptive native callback host must use the safe default",
  );
});

Deno.test("signed OAuth state clamps redirect and verifies intact payload", async () => {
  const created = await createSignedAppleOAuthState({
    redirectTo: "https://attacker.invalid/steal",
    secret: TEST_SECRET,
    nonce: "fixed-nonce",
    nowSeconds: 1_000,
  });
  assert(
    created.redirectTo === DEFAULT_OAUTH_FINAL,
    "external redirect was not clamped",
  );

  const verified = await verifySignedAppleOAuthState(
    created.state,
    TEST_SECRET,
    1_001,
  );
  assert(
    verified.p === "apple",
    "verified state did not retain provider binding",
  );
  assert(
    verified.r === DEFAULT_OAUTH_FINAL,
    "verified state did not retain safe redirect",
  );
  assert(verified.n === "fixed-nonce", "verified state did not retain nonce");
  assert(verified.exp === 1_600, "verified state has the wrong expiry");
});

Deno.test("signed OAuth state rejects tampering and expiration", async () => {
  const created = await createSignedAppleOAuthState({
    redirectTo: "https://www.weddingwin.ca/account",
    secret: TEST_SECRET,
    nonce: "fixed-nonce",
    nowSeconds: 2_000,
  });
  const normalized = created.state.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = JSON.parse(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
  );
  decoded.n = "attacker-nonce";
  const tampered = btoa(JSON.stringify(decoded))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  await assertRejects(
    () => verifySignedAppleOAuthState(tampered, TEST_SECRET, 2_001),
    /signature/i,
  );
  await assertRejects(
    () => verifySignedAppleOAuthState(created.state, TEST_SECRET, 2_601),
    /expired/i,
  );
});

Deno.test("OAuth nonce binding rejects a mismatched identity token nonce", () => {
  assertAppleOAuthNonce("expected-nonce", "expected-nonce");
  return assertRejects(
    () => assertAppleOAuthNonce("expected-nonce", "attacker-nonce"),
    /nonce mismatch/i,
  );
});

Deno.test("signed Apple consent survives callback verification and rejects alteration or removal", async () => {
  const consent = {
    acceptedAt: new Date(3_000_000).toISOString(),
    termsVersion: "current-terms",
    privacyVersion: "current-privacy",
  };
  const created = await createSignedAppleOAuthState({
    redirectTo: DEFAULT_OAUTH_FINAL,
    secret: TEST_SECRET,
    nowSeconds: 3_000,
    consent,
  });
  const verified = await verifySignedAppleOAuthState(
    created.state,
    TEST_SECRET,
    3_001,
  );
  assert(
    JSON.stringify(verified.c) === JSON.stringify(consent),
    "signed acceptance was lost",
  );
  const normalized = created.state.replaceAll("-", "+").replaceAll("_", "/");
  const original = JSON.parse(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
  );
  for (const remove of [false, true]) {
    const decoded = structuredClone(original);
    if (remove) delete decoded.c;
    else decoded.c.termsVersion = "attacker-policy";
    const encoded = btoa(JSON.stringify(decoded)).replaceAll("+", "-")
      .replaceAll("/", "_").replaceAll("=", "");
    await assertRejects(
      () => verifySignedAppleOAuthState(encoded, TEST_SECRET, 3_001),
      /signature/i,
    );
  }
  await assertRejects(
    () => verifySignedAppleOAuthState(created.state, TEST_SECRET, 3_601),
    /expired/i,
  );
});

Deno.test("Apple state rejects consent dated outside the authorization attempt", async () => {
  await assertRejects(
    () =>
      createSignedAppleOAuthState({
        redirectTo: DEFAULT_OAUTH_FINAL,
        secret: TEST_SECRET,
        nowSeconds: 5_000,
        consent: {
          acceptedAt: new Date(0).toISOString(),
          termsVersion: "terms",
          privacyVersion: "privacy",
        },
      }),
    /consent/i,
  );
});

Deno.test("Apple signup role is signed and cannot be added, removed or changed in transit", async () => {
  for (
    const role of [
      undefined,
      "vendor",
      "vendor_basic",
      "vendor_show",
      "vendor_venue",
      "vendor_multi",
      "vendor_venue_multi",
      "couple",
    ] as const
  ) {
    const created = await createSignedAppleOAuthState({
      redirectTo: DEFAULT_OAUTH_FINAL,
      secret: TEST_SECRET,
      nowSeconds: 6_000,
      signupRole: role,
    });
    assert(
      (await verifySignedAppleOAuthState(created.state, TEST_SECRET, 6_001))
        .s === role,
      "valid signed signup role did not round trip",
    );
    const normalized = created.state.replaceAll("-", "+").replaceAll("_", "/");
    const original = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    );
    for (
      const altered of [
        undefined,
        "vendor",
        "vendor_basic",
        "vendor_show",
        "vendor_venue",
        "vendor_multi",
        "vendor_venue_multi",
        "couple",
        "admin",
        "17",
        null,
      ]
    ) {
      if (altered === role) continue;
      const changed = structuredClone(original);
      if (altered === undefined) delete changed.s;
      else changed.s = altered;
      const encoded = btoa(JSON.stringify(changed)).replaceAll("+", "-")
        .replaceAll("/", "_").replaceAll("=", "");
      await assertRejects(
        () => verifySignedAppleOAuthState(encoded, TEST_SECRET, 6_001),
        /signature|signup role/i,
      );
    }
  }
});

Deno.test("Apple signup state creation rejects unrecognized account types instead of defaulting", async () => {
  for (
    const value of [
      "admin",
      "paid",
      "17",
      "18",
      "28",
      "36",
      "vendor_claim",
      "",
      null,
    ]
  ) {
    await assertRejects(() =>
      createSignedAppleOAuthState({
        secret: TEST_SECRET,
        redirectTo: DEFAULT_OAUTH_FINAL,
        signupRole: value as "vendor",
      }), /signup role/i);
  }
});
