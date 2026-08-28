import {
  nativeSessionMatchesCachedBdIdentityValues,
  type BdIdentitySession,
  type CachedBdIdentity,
} from "./bd_identity.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

function assertFalse(value: unknown, message: string) {
  assert(!value, message);
}

Deno.test("cached BD identity rejects forged native refresh secrets", () => {
  const cached: CachedBdIdentity = {
    user_id: "38971",
    token: "issued-token-38971",
    cookie: "issued-cookie-38971",
  };
  const valid: BdIdentitySession = {
    user_id: cached.user_id,
    token: cached.token,
    cookie: cached.cookie,
  };

  assert(
    nativeSessionMatchesCachedBdIdentityValues(valid, cached),
    "the exact cached identity should be accepted",
  );
  assertFalse(
    nativeSessionMatchesCachedBdIdentityValues(
      { ...valid, token: "forged-token-00000" },
      cached,
    ),
    "a forged token must not authenticate even when the user id and cookie match",
  );
  assertFalse(
    nativeSessionMatchesCachedBdIdentityValues(
      { ...valid, token: "forged-token-00000", cookie: "forged-cookie-00000" },
      cached,
    ),
    "arbitrary long token/cookie values must not authorize a victim user id",
  );
  assertFalse(
    nativeSessionMatchesCachedBdIdentityValues(
      { user_id: cached.user_id, cookie: cached.cookie },
      cached,
    ),
    "a cookie without the cached token must fail closed",
  );
});

Deno.test("chat auth rejects a forged session for a cached victim identity", () => {
  const cached: CachedBdIdentity = {
    user_id: "37878",
    token: "issued-token-37878",
    cookie: "issued-cookie-37878",
  };

  assertFalse(
    nativeSessionMatchesCachedBdIdentityValues(
      {
        user_id: cached.user_id,
        email: "victim@example.test",
        token: "attacker-chosen-secret-at-least-16-characters",
        cookie: "attacker-chosen-cookie-at-least-16-characters",
      },
      cached,
    ),
    "chat auth must not accept arbitrary long secrets for a victim user id/email",
  );
});
