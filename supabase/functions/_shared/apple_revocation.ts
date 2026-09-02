export type AppleClientConfig = {
  serviceId: string;
  iosBundleId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
};

export type AppleIdentityClaims = {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  aud: string;
  iss: string;
  nonce?: string;
};

type AppleTokenPayload = {
  refresh_token?: string;
  id_token?: string;
  error?: string;
};

export type AppleRevocationDependencies = {
  getConfig: () => Promise<AppleClientConfig>;
  makeClientSecret: (
    config: AppleClientConfig,
    clientId: string,
  ) => Promise<string>;
  verifyIdentityToken: (
    token: string,
    audiences: string[],
  ) => Promise<AppleIdentityClaims>;
  fetch: typeof fetch;
};

export function appleReauthenticationRequired(
  appleSub: string,
  authorizationCode: string,
): boolean {
  return Boolean(appleSub.trim() && !authorizationCode.trim());
}

export async function revokeAppleAuthorization(args: {
  authorizationCode: string;
  expectedAppleSub: string;
  expectedNonce?: string;
  dependencies: AppleRevocationDependencies;
}) {
  const authorizationCode = args.authorizationCode.trim();
  const expectedAppleSub = args.expectedAppleSub.trim();
  const expectedNonce = String(args.expectedNonce || "").trim();
  if (!authorizationCode) {
    throw new Error("Apple authorization code is required.");
  }
  if (!expectedAppleSub) throw new Error("Apple account subject is required.");

  const dependencies = args.dependencies;
  const cfg = await dependencies.getConfig();
  const clientId = cfg.iosBundleId.trim();
  if (!clientId) throw new Error("Apple iOS bundle id is not configured.");
  const clientSecret = await dependencies.makeClientSecret(cfg, clientId);

  const tokenResponse = await dependencies.fetch(
    "https://appleid.apple.com/auth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: authorizationCode,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
      }),
    },
  );
  const tokenJson = await tokenResponse.json().catch(
    () => ({}),
  ) as AppleTokenPayload;
  if (!tokenResponse.ok || !tokenJson.refresh_token || !tokenJson.id_token) {
    throw new Error(
      `Apple authorization exchange failed (${
        tokenJson.error || tokenResponse.status
      }).`,
    );
  }

  // This is a native reauthentication code, so only the iOS bundle audience
  // is valid. The web Services ID must not be accepted for account deletion.
  const claims = await dependencies.verifyIdentityToken(tokenJson.id_token, [
    clientId,
  ]);
  if (claims.sub !== expectedAppleSub) {
    throw new Error(
      "Apple confirmation did not match the account being deleted.",
    );
  }
  // New app builds bind deletion reauthentication to a fresh nonce. The nonce
  // remains optional server-side so an already-installed release can still
  // delete its account while users update.
  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw new Error("OAuth nonce mismatch.");
  }

  const revokeResponse = await dependencies.fetch(
    "https://appleid.apple.com/auth/revoke",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: tokenJson.refresh_token,
        token_type_hint: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );
  if (!revokeResponse.ok) {
    throw new Error(
      `Apple authorization revocation failed (${revokeResponse.status}).`,
    );
  }
}
