import { createAppleNativeStartHandler } from "./apple_native_oauth.ts";
import { readOAuthBindingCookie, sha256Base64Url } from "./oauth_attempt.ts";
import { verifySignedAppleOAuthState } from "./oauth_state.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policy_consent.ts";

const START = "https://backend.example.invalid/functions/v1/apple-native-start";
const RETURN = "weddingwin://bd-apple-return";
const CALLBACK = "https://www.weddingwin.ca/auth/apple-callback";
const SECRET = "offline-apple-native-start-secret-never-production";
const NOW = Date.parse("2026-09-06T23:40:00.000Z");
const CHALLENGE = "A".repeat(43);

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function params(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    return_to: RETURN,
    code_challenge: CHALLENGE,
    ...overrides,
  });
}

function signup(role = "couple", overrides: Record<string, string> = {}) {
  return params({
    signup_role: role,
    accepted_terms: "1",
    accepted_privacy: "1",
    terms_version: CURRENT_TERMS_VERSION,
    privacy_version: CURRENT_PRIVACY_VERSION,
    accepted_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  });
}

function fixture(
  options: { configError?: boolean; attemptError?: boolean } = {},
) {
  const attempts: {
    state: string;
    bindingSecret: string;
    expiresAtSeconds: number;
  }[] = [];
  let configReads = 0;
  const handler = createAppleNativeStartHandler({
    secret: SECRET,
    returnUrl: CALLBACK,
    now: () => NOW,
    getServiceId: () => {
      configReads++;
      if (options.configError) throw new Error("PRIVATE_CONFIG_DO_NOT_LEAK");
      return Promise.resolve("ca.weddingwin.web.test");
    },
    createAttempt: (attempt) => {
      if (options.attemptError) throw new Error("PRIVATE_ATTEMPT_DO_NOT_LEAK");
      attempts.push(attempt);
      return Promise.resolve();
    },
  });
  const request = (query = params(), headers: HeadersInit = {}) =>
    handler(new Request(`${START}?${query}`, { headers }));
  return { handler, request, attempts, configReads: () => configReads };
}

async function assertInvalid(query: URLSearchParams) {
  const f = fixture();
  const response = await f.request(query);
  assert(response.status === 400, `invalid start accepted: ${query}`);
  assert(!response.headers.get("location"), "invalid start redirected");
  assert(f.attempts.length === 0, "invalid request stored an OAuth attempt");
  assert(f.configReads() === 0, "invalid request read Apple credentials");
  assert(
    response.headers.get("cache-control") === "no-store",
    "invalid start is cacheable",
  );
}

Deno.test("Apple native start binds exact app return, S256 challenge and browser attempt", async () => {
  const f = fixture();
  const challenge = await sha256Base64Url(
    "verifier-for-native-apple-".repeat(3),
  );
  const response = await f.request(params({ code_challenge: challenge }));
  assert(
    response.status === 302,
    "valid login did not start Apple authorization",
  );
  const destination = new URL(response.headers.get("location") || "");
  assert(
    destination.origin === "https://appleid.apple.com",
    "authorization host changed",
  );
  assert(
    destination.searchParams.get("client_id") === "ca.weddingwin.web.test",
    "wrong service client",
  );
  assert(
    destination.searchParams.get("redirect_uri") === CALLBACK,
    "callback changed",
  );
  assert(
    destination.searchParams.get("scope") === "name email",
    "required scopes missing",
  );
  assert(
    destination.searchParams.get("response_mode") === "form_post",
    "unsafe callback mode",
  );
  assert(
    destination.searchParams.get("response_type") === "code",
    "wrong response type",
  );
  const state = destination.searchParams.get("state") || "";
  const verified = await verifySignedAppleOAuthState(state, SECRET, NOW / 1000);
  assert(
    verified.p === "apple" && verified.r === RETURN,
    "wrong state provider or destination",
  );
  assert(verified.native?.returnTo === RETURN, "native destination not signed");
  assert(
    verified.native?.codeChallenge === challenge,
    "PKCE challenge not signed",
  );
  assert(
    !verified.c && !verified.s,
    "login fabricated signup agreement or role",
  );
  assert(
    destination.searchParams.get("nonce") === verified.n,
    "provider nonce differs from signed state",
  );
  assert(
    f.attempts.length === 1 && f.attempts[0].state === state,
    "attempt was not persisted",
  );
  assert(
    f.attempts[0].expiresAtSeconds === verified.exp,
    "attempt and state expire differently",
  );
  assert(verified.exp === NOW / 1000 + 600, "unexpected state lifetime");
  const cookie = response.headers.get("set-cookie") || "";
  const parsedCookie = readOAuthBindingCookie(
    new Request(START, { headers: { cookie } }),
    "apple",
  );
  assert(
    parsedCookie === f.attempts[0].bindingSecret,
    "browser cookie is not bound to attempt",
  );
  for (const flag of ["Secure", "HttpOnly", "SameSite=None", "Path=/"]) {
    assert(cookie.includes(flag), `binding cookie missing ${flag}`);
  }
  assert(
    response.headers.get("cache-control") === "no-store",
    "authorization response is cacheable",
  );
  assert(
    response.headers.get("referrer-policy") === "no-referrer",
    "state may leak in referrer",
  );
});

Deno.test("Apple native signup signs only the selected role and current explicit consent", async () => {
  for (const role of ["vendor", "couple"]) {
    const f = fixture();
    const response = await f.request(signup(role));
    assert(response.status === 302, `${role} signup rejected`);
    const state = await verifySignedAppleOAuthState(
      f.attempts[0].state,
      SECRET,
      NOW / 1000,
    );
    assert(state.s === role, "signup role changed");
    assert(
      state.c?.termsVersion === CURRENT_TERMS_VERSION,
      "wrong terms version",
    );
    assert(
      state.c?.privacyVersion === CURRENT_PRIVACY_VERSION,
      "wrong privacy version",
    );
    assert(
      state.c?.acceptedAt === new Date(NOW).toISOString(),
      "consent was not server timestamped",
    );
  }
});

Deno.test("Apple native start rejects alternative or decorated return URLs", async () => {
  for (
    const returnTo of [
      "https://www.weddingwin.ca/account/home",
      "https://attacker.invalid/",
      "weddingwin://bd-login",
      "weddingwin:///bd-apple-return",
      `${RETURN}/`,
      `${RETURN}?code=stolen`,
      `${RETURN}#fragment`,
      "weddingwin://user:password@bd-apple-return",
      ` ${RETURN}`,
      `${RETURN}\n`,
    ]
  ) await assertInvalid(params({ return_to: returnTo }));
});

Deno.test("Apple native start rejects missing or malformed PKCE and return fields", async () => {
  for (
    const value of [
      "",
      "A".repeat(42),
      "A".repeat(44),
      "+".repeat(43),
      "A".repeat(42) + "=",
      CHALLENGE + "\n",
      " " + CHALLENGE,
    ]
  ) {
    await assertInvalid(params({ code_challenge: value }));
  }
  for (const field of ["return_to", "code_challenge"]) {
    const query = params();
    query.delete(field);
    await assertInvalid(query);
  }
});

Deno.test("Apple native start rejects every duplicate or unknown query field", async () => {
  for (const field of Array.from(signup().keys())) {
    const query = signup();
    query.append(field, query.get(field) || "");
    await assertInvalid(query);
  }
  for (
    const field of [
      "redirect_to",
      "provider",
      "native",
      "nonce",
      "state",
      "code_verifier",
      "subscription_id",
    ]
  ) {
    const query = params();
    query.set(field, "attacker-controlled");
    await assertInvalid(query);
  }
});

Deno.test("Apple native signup rejects unsupported roles and incomplete agreement", async () => {
  for (
    const role of [
      "",
      "admin",
      "vendor_show",
      "vendor_basic",
      "Couple",
      " couple",
      "couple\n",
    ]
  ) {
    await assertInvalid(signup(role));
  }
  for (
    const field of [
      "accepted_terms",
      "accepted_privacy",
      "terms_version",
      "privacy_version",
      "accepted_at",
    ]
  ) {
    const query = signup();
    query.delete(field);
    await assertInvalid(query);
  }
  for (const field of ["accepted_terms", "accepted_privacy"]) {
    for (const value of ["", "0", "true", "yes"]) {
      await assertInvalid(signup("couple", { [field]: value }));
    }
  }
  await assertInvalid(signup("couple", { terms_version: "2020-01-01" }));
  await assertInvalid(signup("couple", { privacy_version: "2020-01-01" }));
});

Deno.test("Apple native login never accepts consent without an explicit signup role", async () => {
  const all = signup();
  all.delete("signup_role");
  await assertInvalid(all);
  for (
    const field of [
      "accepted_terms",
      "accepted_privacy",
      "terms_version",
      "privacy_version",
      "accepted_at",
    ]
  ) {
    const query = params();
    query.set(field, signup().get(field) || "");
    await assertInvalid(query);
  }
});

Deno.test("Apple native signup rejects stale, future and malformed acceptance timestamps", async () => {
  for (
    const date of [
      "",
      "not-a-date",
      "NaN",
      "Infinity",
      new Date(NOW).toUTCString(),
      new Date(NOW - 600_001).toISOString(),
      new Date(NOW + 30_001).toISOString(),
    ]
  ) await assertInvalid(signup("couple", { accepted_at: date }));
  for (const offset of [-600_000, 0, 30_000]) {
    const f = fixture();
    const response = await f.request(
      signup("couple", { accepted_at: new Date(NOW + offset).toISOString() }),
    );
    assert(
      response.status === 302,
      `valid timestamp boundary rejected: ${offset}`,
    );
  }
});

Deno.test("Apple native start refuses non-GET methods without side effects", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const f = fixture();
    const response = await f.handler(
      new Request(`${START}?${params()}`, { method }),
    );
    assert(response.status === 405, `${method} accepted`);
    assert(
      f.configReads() === 0 && f.attempts.length === 0,
      "wrong method touched backend",
    );
  }
});

Deno.test("Apple native start dependency errors return only a safe fixed app failure", async () => {
  for (const options of [{ configError: true }, { attemptError: true }]) {
    const f = fixture(options);
    const response = await f.request();
    assert(response.status === 302, "backend error did not return to the app");
    const location = response.headers.get("location") || "";
    const destination = new URL(location);
    assert(
      `${destination.protocol}//${destination.host}${destination.pathname}` ===
        RETURN,
      "failure redirected outside app",
    );
    assert(
      destination.searchParams.get("provider") === "apple",
      "failure lost provider binding",
    );
    assert(
      destination.searchParams.get("error") === "sign_in_unavailable",
      "failure was not explicit",
    );
    assert(
      !destination.searchParams.has("code") &&
        !destination.searchParams.has("state"),
      "failure included success state",
    );
    const text = location + await response.text();
    assert(
      !text.includes("PRIVATE_") && !text.includes(SECRET),
      "private dependency error leaked",
    );
    assert(!response.headers.get("set-cookie"), "failed start set auth state");
  }
});

Deno.test("Apple native start produces independent signed states while preserving browser binding", async () => {
  const f = fixture();
  const first = await f.request();
  const cookie = first.headers.get("set-cookie") || "";
  const second = await f.request(params(), { cookie });
  assert(
    second.status === 302 && f.attempts.length === 2,
    "second valid start failed",
  );
  assert(
    f.attempts[0].state !== f.attempts[1].state,
    "attempt state was reused",
  );
  assert(
    f.attempts[0].bindingSecret === f.attempts[1].bindingSecret,
    "existing browser binding was discarded",
  );
});

Deno.test("Apple native signed challenge cannot be edited and expired state cannot be verified", async () => {
  const f = fixture();
  await f.request();
  const original = f.attempts[0].state;
  const padded = original.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - original.length % 4) % 4);
  const payload = JSON.parse(atob(padded));
  payload.native.codeChallenge = "B".repeat(43);
  const tampered = btoa(JSON.stringify(payload)).replaceAll("+", "-")
    .replaceAll("/", "_").replaceAll("=", "");
  for (
    const [state, now] of [[tampered, NOW / 1000], [
      original,
      NOW / 1000 + 601,
    ]] as const
  ) {
    let rejected = false;
    try {
      await verifySignedAppleOAuthState(state, SECRET, now);
    } catch {
      rejected = true;
    }
    assert(rejected, "tampered or expired native state was accepted");
  }
});
