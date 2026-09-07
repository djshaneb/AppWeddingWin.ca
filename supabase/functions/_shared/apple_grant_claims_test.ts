import type { AppleClaims } from "./apple_auth.ts";
import { verifiedAppleEmail } from "./apple_identity.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function same(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function rejects(action: () => unknown) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}

let adapter: Promise<typeof import("./apple_grant_store.ts")> | undefined;
function resolver() {
  if (!adapter) {
    adapter = (async () => {
      const previousUrl = Deno.env.get("SUPABASE_URL");
      const previousKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      Deno.env.set("SUPABASE_URL", "https://claims-fixture.example.invalid");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "claims-fixture-service-role");
      try {
        return await import("./apple_grant_store.ts");
      } finally {
        if (previousUrl === undefined) Deno.env.delete("SUPABASE_URL");
        else Deno.env.set("SUPABASE_URL", previousUrl);
        if (previousKey === undefined) {
          Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
        } else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", previousKey);
      }
    })();
  }
  return adapter.then((module) => module.resolveAppleGrantClaims);
}

const verified: AppleClaims = {
  iss: "https://appleid.apple.com",
  aud: "invalid.example.apple-fixture",
  sub: "claims-fixture-apple-subject",
  nonce: "claims-fixture-nonce",
  email: "apple-claims-fixture@example.invalid",
  email_verified: true,
};
const withoutEmail: AppleClaims = {
  iss: verified.iss,
  aud: verified.aud,
  sub: verified.sub,
  nonce: verified.nonce,
};
const defaults = { expectedNonce: verified.nonce, requireVerifiedEmail: true };

Deno.test("Apple claims recovery accepts a verified redeemed email missing from the device token", async () => {
  const resolve = await resolver();
  for (const email_verified of [true, "true"] as const) {
    const result = resolve({
      ...defaults,
      original: withoutEmail,
      redeemed: { ...verified, email_verified },
    });
    same(result.source, "redeemed");
    same(result.claims.email, verified.email);
    assert([true, "true"].includes(result.claims.email_verified!));
    same(result.claims.sub, verified.sub);
    same(result.claims.aud, verified.aud);
    same(result.claims.nonce, verified.nonce);
  }
});

Deno.test("Apple claims recovery repairs a missing verification flag only with matching redeemed proof", async () => {
  const resolve = await resolver();
  const result = resolve({
    ...defaults,
    original: { ...verified, email_verified: undefined },
    redeemed: verified,
  });
  same(result.source, "redeemed");
  same(result.claims.email, verified.email);
  assert([true, "true"].includes(result.claims.email_verified!));
});

Deno.test("Apple claims recovery preserves original verified email when redeemed token omits it", async () => {
  const resolve = await resolver();
  for (const redeemed of [undefined, withoutEmail]) {
    const result = resolve({ ...defaults, original: verified, redeemed });
    same(result.source, "original");
    same(result.claims.email, verified.email);
    assert([true, "true"].includes(result.claims.email_verified!));
  }
});

Deno.test("Apple claims recovery accepts matching signed emails case-insensitively", async () => {
  const resolve = await resolver();
  const result = resolve({
    ...defaults,
    original: verified,
    redeemed: { ...verified, email: `  ${verified.email!.toUpperCase()}  ` },
  });
  same(result.source, "both");
  same(result.claims.email?.trim().toLowerCase(), verified.email);
});

Deno.test("Apple claims recovery rejects conflicting signed emails regardless of proof source", async () => {
  const resolve = await resolver();
  for (const requireVerifiedEmail of [true, false]) {
    for (const email_verified of [true, undefined]) {
      rejects(() =>
        resolve({
          ...defaults,
          requireVerifiedEmail,
          original: verified,
          redeemed: {
            ...verified,
            email: "different-fixture@example.invalid",
            email_verified,
          },
        })
      );
    }
  }
});

Deno.test("Apple claims recovery never overrides an explicitly unverified fresh-account claim", async () => {
  const resolve = await resolver();
  for (const email_verified of [false, "false"] as const) {
    rejects(() =>
      resolve({
        ...defaults,
        original: { ...verified, email_verified },
        redeemed: verified,
      })
    );
    rejects(() =>
      resolve({
        ...defaults,
        original: verified,
        redeemed: { ...verified, email_verified },
      })
    );
  }
});

Deno.test("Apple claims recovery requires a verified email for first enrollment", async () => {
  const resolve = await resolver();
  for (
    const original of [
      withoutEmail,
      { ...verified, email: "   " },
      { ...verified, email_verified: undefined },
    ]
  ) {
    for (const redeemed of [undefined, withoutEmail]) {
      rejects(() => resolve({ ...defaults, original, redeemed }));
    }
  }
});

Deno.test("Apple claims recovery rejects subject, audience, or issuer substitution", async () => {
  const resolve = await resolver();
  for (
    const mismatch of [
      { sub: "different-apple-subject" },
      { aud: "invalid.example.other-client" },
      { iss: "https://issuer.example.invalid" },
    ]
  ) {
    for (const requireVerifiedEmail of [true, false]) {
      rejects(() =>
        resolve({
          ...defaults,
          requireVerifiedEmail,
          original: verified,
          redeemed: { ...verified, ...mismatch },
        })
      );
    }
  }
});

Deno.test("Apple claims recovery rejects a missing or wrong nonce on either bound token", async () => {
  const resolve = await resolver();
  for (const nonce of [undefined, "different-fixture-nonce"]) {
    rejects(() =>
      resolve({
        ...defaults,
        original: { ...verified, nonce },
        redeemed: verified,
      })
    );
    rejects(() =>
      resolve({
        ...defaults,
        original: verified,
        redeemed: { ...verified, nonce },
      })
    );
  }
});

Deno.test("Apple claims recovery permits a refresh response without a new nonce requirement", async () => {
  const resolve = await resolver();
  const result = resolve({
    original: verified,
    redeemed: { ...verified, nonce: undefined },
    requireVerifiedEmail: true,
  });
  same(result.claims.email, verified.email);
  same(result.source, "both");
});

Deno.test("Apple claims recovery preserves email-less enrolled-owner identity", async () => {
  const resolve = await resolver();
  const result = resolve({
    ...defaults,
    requireVerifiedEmail: false,
    original: withoutEmail,
    redeemed: withoutEmail,
  });
  same(result.source, "none");
  same(result.claims.sub, verified.sub);
  assert(!result.claims.email);
});

Deno.test("Apple claims recovery does not invent new email proof for explicitly unverified enrolled owners", async () => {
  const resolve = await resolver();
  for (const email_verified of [false, "false"] as const) {
    const result = resolve({
      ...defaults,
      requireVerifiedEmail: false,
      original: { ...verified, email_verified },
      redeemed: { ...verified, email_verified },
    });
    same(result.source, "none");
    same(result.claims.sub, verified.sub);
    assert(![true, "true"].includes(result.claims.email_verified!));
  }
});

Deno.test("Apple claims recovery does not use supplied request email as identity proof", async () => {
  const resolve = await resolver();
  const result = resolve({
    ...defaults,
    original: withoutEmail,
    redeemed: verified,
  });
  rejects(() =>
    verifiedAppleEmail(
      result.claims.email,
      "untrusted-body@example.invalid",
    )
  );
  same(verifiedAppleEmail(undefined, verified.email), "");
});

Deno.test("Apple claims recovery does not mutate either signed input", async () => {
  const resolve = await resolver();
  const original = Object.freeze({ ...withoutEmail });
  const redeemed = Object.freeze({ ...verified });
  const before = JSON.stringify({ original, redeemed });
  resolve({ ...defaults, original, redeemed });
  same(JSON.stringify({ original, redeemed }), before);
});
