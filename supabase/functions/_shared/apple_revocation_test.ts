import {
  type AppleClientConfig,
  type AppleIdentityClaims,
  appleReauthenticationRequired,
  type AppleRevocationDependencies,
  revokeAppleAuthorization,
} from "./apple_revocation.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function assertRejects(run: () => Promise<unknown>, expected: RegExp) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expected.test(message), `unexpected rejection: ${message}`);
    return;
  }
  throw new Error("expected operation to reject");
}

const TEST_CONFIG: AppleClientConfig = {
  serviceId: "ca.weddingwin.web",
  iosBundleId: "ca.weddingwin.app",
  teamId: "TESTTEAM",
  keyId: "TESTKEY",
  privateKey: "test-only-key",
};

function revocationDependencies(options: {
  claims?: AppleIdentityClaims;
  revokeStatus?: number;
} = {}) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const verifiedAudiences: string[][] = [];
  const clientSecretSubjects: string[] = [];
  const claims = options.claims || {
    sub: "apple-subject",
    aud: TEST_CONFIG.iosBundleId,
    iss: "https://appleid.apple.com",
    nonce: "deletion-nonce",
  };

  const dependencies: AppleRevocationDependencies = {
    getConfig: async () => TEST_CONFIG,
    makeClientSecret: async (_config, clientId) => {
      clientSecretSubjects.push(clientId);
      return "test-client-secret";
    },
    verifyIdentityToken: async (_token, audiences) => {
      verifiedAudiences.push(audiences);
      return claims;
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = new URLSearchParams(String(init?.body || ""));
      calls.push({ url, body });
      if (url.endsWith("/auth/token")) {
        return new Response(
          JSON.stringify({
            refresh_token: "test-refresh-token",
            id_token: "test-id-token",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(null, { status: options.revokeStatus || 200 });
    }) as typeof fetch,
  };

  return { calls, clientSecretSubjects, dependencies, verifiedAudiences };
}

Deno.test("native Apple audience excludes the web client and arbitrary extras", async () => {
  const source = await Deno.readTextFile(
    new URL("./apple_auth.ts", import.meta.url),
  );
  const audienceHelper = source.match(
    /export function getNativeAppleAudiences[\s\S]*?\n}/,
  )?.[0] || "";
  assert(
    audienceHelper.includes("const audiences = [cfg.iosBundleId]") &&
      !audienceHelper.includes("cfg.serviceId") &&
      !audienceHelper.includes("APPLE_EXTRA_AUDIENCES"),
    "production native login must accept only the iOS bundle audience",
  );
  assert(
    audienceHelper.includes('Deno.env.get("ALLOW_EXPO_GO_APPLE_AUD")') &&
      audienceHelper.includes('audiences.push("host.exp.Exponent")'),
    "Expo Go must require an explicit development-only opt-in",
  );
});

Deno.test("returning Apple login preserves provider identity metadata", async () => {
  const source = await Deno.readTextFile(
    new URL("./apple_auth.ts", import.meta.url),
  );
  assert(
    source.includes('.select("id, email, display_name")') &&
      source.includes(
        "const resolvedFullName = fullName || profileByApple?.display_name",
      ) &&
      source.includes("apple_sub: appleSub") &&
      source.includes("display_name: resolvedFullName"),
    "a returning Apple login must retain its subject mapping and first-login display name",
  );
});

Deno.test("Apple deletion exchanges and revokes with the exact iOS client", async () => {
  const observed = revocationDependencies();
  await revokeAppleAuthorization({
    authorizationCode: "one-time-code",
    expectedAppleSub: "apple-subject",
    expectedNonce: "deletion-nonce",
    dependencies: observed.dependencies,
  });

  assert(
    observed.calls.map((call) => call.url).join(",") ===
      "https://appleid.apple.com/auth/token,https://appleid.apple.com/auth/revoke",
    "authorization must be exchanged before the resulting refresh token is revoked",
  );
  assert(
    observed.clientSecretSubjects.join(",") === TEST_CONFIG.iosBundleId,
    "the client secret must be scoped to the iOS bundle id",
  );
  assert(
    JSON.stringify(observed.verifiedAudiences) ===
      JSON.stringify([[TEST_CONFIG.iosBundleId]]),
    "the exchanged identity token must accept only the iOS bundle audience",
  );
  for (const call of observed.calls) {
    assert(
      call.body.get("client_id") === TEST_CONFIG.iosBundleId,
      "both Apple requests must use the iOS bundle id",
    );
  }
  assert(
    observed.calls[1].body.get("token") === "test-refresh-token" &&
      observed.calls[1].body.get("token_type_hint") === "refresh_token",
    "Apple must receive the exchanged refresh token for revocation",
  );
});

Deno.test("Apple deletion rejects a mismatched subject or nonce before revocation", async () => {
  const wrongSubject = revocationDependencies({
    claims: {
      sub: "different-subject",
      aud: TEST_CONFIG.iosBundleId,
      iss: "https://appleid.apple.com",
      nonce: "deletion-nonce",
    },
  });
  await assertRejects(
    () =>
      revokeAppleAuthorization({
        authorizationCode: "one-time-code",
        expectedAppleSub: "apple-subject",
        expectedNonce: "deletion-nonce",
        dependencies: wrongSubject.dependencies,
      }),
    /did not match the account/i,
  );
  assert(
    wrongSubject.calls.length === 1,
    "subject mismatch must stop before revocation",
  );

  const wrongNonce = revocationDependencies();
  await assertRejects(
    () =>
      revokeAppleAuthorization({
        authorizationCode: "one-time-code",
        expectedAppleSub: "apple-subject",
        expectedNonce: "different-nonce",
        dependencies: wrongNonce.dependencies,
      }),
    /nonce mismatch/i,
  );
  assert(
    wrongNonce.calls.length === 1,
    "nonce mismatch must stop before revocation",
  );
});

Deno.test("older app deletion remains compatible while Apple revocation still fails closed", async () => {
  const legacy = revocationDependencies();
  await revokeAppleAuthorization({
    authorizationCode: "one-time-code",
    expectedAppleSub: "apple-subject",
    dependencies: legacy.dependencies,
  });
  assert(
    legacy.calls.length === 2,
    "a pre-nonce app build must still be able to revoke access",
  );

  const failedRevoke = revocationDependencies({ revokeStatus: 503 });
  await assertRejects(
    () =>
      revokeAppleAuthorization({
        authorizationCode: "one-time-code",
        expectedAppleSub: "apple-subject",
        dependencies: failedRevoke.dependencies,
      }),
    /revocation failed \(503\)/i,
  );
});

Deno.test("non-Apple deletion skips reauthentication and handler revokes before deleting", async () => {
  assert(
    !appleReauthenticationRequired("", ""),
    "email and Google accounts must not be sent through Apple reauthentication",
  );
  assert(
    appleReauthenticationRequired("apple-subject", ""),
    "an Apple-linked account without a fresh code must request reauthentication",
  );
  assert(
    !appleReauthenticationRequired("apple-subject", "one-time-code"),
    "a supplied Apple authorization code satisfies the reauthentication gate",
  );

  const source = await Deno.readTextFile(
    new URL("../bd-delete-account/index.ts", import.meta.url),
  );
  const revokeIndex = source.indexOf(
    'diagnosticStage = "revoke_apple_authorization"',
  );
  for (
    const destructiveStage of [
      'diagnosticStage = "delete_bd_metadata"',
      'diagnosticStage = "delete_bd_member"',
      'diagnosticStage = "delete_supabase_auth"',
      'diagnosticStage = "purge_app_data"',
    ]
  ) {
    const destructiveIndex = source.indexOf(destructiveStage);
    assert(
      revokeIndex >= 0 && destructiveIndex > revokeIndex,
      `Apple revocation must precede ${destructiveStage}`,
    );
  }
});

Deno.test("iOS deletion reauthentication binds state and nonce before sending the code", async () => {
  const about = await Deno.readTextFile(
    new URL("../../../app/(tabs)/about.tsx", import.meta.url),
  );
  assert(
    about.includes("const appleState = Crypto.randomUUID()") &&
      about.includes("const appleNonce = Crypto.randomUUID()") &&
      about.includes("state: appleState") &&
      about.includes("nonce: appleNonce") &&
      about.includes("credential.state !== appleState") &&
      about.includes("apple_nonce: appleNonce"),
    "the client must bind Apple deletion reauthentication to a fresh state and nonce",
  );
});
