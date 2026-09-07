import { createAppleNativeExchangeHandler } from "./apple_native_exchange.ts";
import { sha256Base64Url } from "./oauth_attempt.ts";

const URL =
  "https://backend.example.invalid/functions/v1/apple-native-exchange";
const CODE = "C".repeat(43);
const VERIFIER = "v".repeat(64);
const TOKEN = "offline-member-session-token";
const PROFILE_ID = "fa1151a0-0000-4000-8000-000000000007";
const VALID_PAYLOAD = {
  apple_profile_id: PROFILE_ID,
  user: { id: PROFILE_ID, email: "apple-native@example.invalid" },
  native_session: {
    user_id: "9900000000000000011",
    token: TOKEN,
    subscription_id: "18",
  },
};

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function post(
  body: unknown = { code: CODE, code_verifier: VERIFIER },
  contentType = "application/json",
) {
  return new Request(URL, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

function raw(body: string, contentType = "application/json") {
  return new Request(URL, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

type Entry = {
  provider: "apple" | "google";
  codeChallenge: string;
  expiresAt: number;
  payload: unknown;
  consumed: boolean;
};

/** Model the database's atomic compare-and-consume, never a production client. */
async function fixture(options: {
  provider?: "apple" | "google";
  payload?: unknown;
  expired?: boolean;
  error?: boolean;
  verifier?: string;
  sessionState?: "valid" | "deleted" | "recreated" | "token_changed";
  validationError?: boolean;
} = {}) {
  let now = 1_000_000;
  const entries = new Map<string, Entry>();
  const hash = await sha256Base64Url(CODE);
  entries.set(hash, {
    provider: options.provider || "apple",
    codeChallenge: await sha256Base64Url(options.verifier || VERIFIER),
    expiresAt: options.expired ? now - 1 : now + 300_000,
    payload: "payload" in options
      ? options.payload
      : structuredClone(VALID_PAYLOAD),
    consumed: false,
  });
  const calls: {
    codeHash: string;
    codeChallenge: string;
    provider: "apple";
  }[] = [];
  const validations: {
    session: Record<string, unknown>;
    user: Record<string, unknown>;
    profileId: string;
    consumed: boolean;
  }[] = [];
  const handler = createAppleNativeExchangeHandler({
    redeem: (args) => {
      calls.push(args);
      if (options.error) {
        throw new Error(
          `PRIVATE_DATABASE_FAILURE ${TOKEN} ${CODE} refresh_token=DO_NOT_LEAK`,
        );
      }
      const entry = entries.get(args.codeHash);
      if (
        !entry || entry.provider !== args.provider ||
        entry.codeChallenge !== args.codeChallenge || entry.expiresAt <= now ||
        entry.consumed
      ) {
        return Promise.resolve(null);
      }
      entry.consumed = true;
      return Promise.resolve(entry.payload);
    },
    validateSession: (session, user, profileId) => {
      validations.push({
        session,
        user,
        profileId,
        consumed: entries.get(hash)?.consumed === true,
      });
      if (options.validationError) {
        throw new Error(
          `PRIVATE_SESSION_LOOKUP_FAILURE ${TOKEN} ${PROFILE_ID}`,
        );
      }
      return Promise.resolve(
        !options.sessionState || options.sessionState === "valid",
      );
    },
  });
  return {
    handler,
    calls,
    validations,
    entries,
    hash,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function assertFailure(response: Response, status: number) {
  assert(
    response.status === status,
    `expected ${status}, received ${response.status}`,
  );
  assert(
    response.headers.get("cache-control") === "no-store",
    "failure can be cached",
  );
  assert(
    response.headers.get("referrer-policy") === "no-referrer",
    "failure missing no-referrer",
  );
  assert(!response.headers.get("location"), "exchange failure redirected");
  const text = await response.text();
  const body = JSON.parse(text);
  assert(
    body.ok === false && typeof body.error === "string",
    "failure did not fail explicitly",
  );
  for (
    const secret of [
      TOKEN,
      CODE,
      VERIFIER,
      "PRIVATE_DATABASE_FAILURE",
      "PRIVATE_SESSION_LOOKUP_FAILURE",
      "DO_NOT_LEAK",
    ]
  ) {
    assert(!text.includes(secret), "failure leaked a credential or raw error");
  }
  assert(
    !("native_session" in body) && !("user" in body),
    "failure returned account data",
  );
}

Deno.test("Apple native exchange hashes code and verifier and hard-codes Apple provider", async () => {
  const f = await fixture();
  const response = await f.handler(post());
  assert(response.status === 200, "valid exchange failed");
  const body = await response.json();
  assert(
    body.ok === true && body.user.email === VALID_PAYLOAD.user.email,
    "user missing",
  );
  assert(
    body.native_session.token === TOKEN &&
      body.native_session.user_id === VALID_PAYLOAD.native_session.user_id,
    "native session missing",
  );
  assert(
    f.calls.length === 1 && f.calls[0].provider === "apple",
    "wrong provider sent to store",
  );
  assert(
    f.calls[0].codeHash === await sha256Base64Url(CODE),
    "raw or incorrect code hash sent",
  );
  assert(
    f.calls[0].codeChallenge === await sha256Base64Url(VERIFIER),
    "raw or incorrect verifier sent",
  );
  assert(
    f.validations.length === 1 && f.validations[0].consumed,
    "session was not checked after atomic redemption",
  );
  assert(
    f.validations[0].profileId === PROFILE_ID &&
      f.validations[0].session.token === TOKEN &&
      f.validations[0].session.user_id ===
        VALID_PAYLOAD.native_session.user_id &&
      f.validations[0].user.id === PROFILE_ID,
    "validation did not receive the exact server-stored identity and session",
  );
  assert(
    response.headers.get("cache-control") === "no-store",
    "session response cacheable",
  );
  assert(
    response.headers.get("referrer-policy") === "no-referrer",
    "session response may leak referrer",
  );
  assert(
    !response.headers.get("location") && !response.headers.get("set-cookie"),
    "exchange created browser auth state",
  );
});

Deno.test("Apple native exchange emits only fixed top-level response fields", async () => {
  const f = await fixture({
    payload: {
      ...VALID_PAYLOAD,
      ok: false,
      redirect_to: "https://attacker.invalid/",
      refresh_token: "SHOULD_NOT_LEAK",
      apple_identity_token: "SHOULD_NOT_LEAK",
      access_token: "SHOULD_NOT_LEAK",
      debug: { private: "SHOULD_NOT_LEAK" },
    },
  });
  const response = await f.handler(post());
  const text = await response.text();
  const body = JSON.parse(text);
  assert(
    response.status === 200 && body.ok === true,
    "stored payload overwrote success result",
  );
  assert(
    Object.keys(body).sort().join(",") === "native_session,ok,user",
    "unapproved top-level fields emitted",
  );
  assert(
    !text.includes("SHOULD_NOT_LEAK") && !text.includes("attacker.invalid"),
    "stored metadata escaped",
  );
  assert(
    !("apple_profile_id" in body),
    "internal profile binding escaped response",
  );
});

Deno.test("Apple native exchange denies deleted, recreated and token-changed accounts after redemption", async () => {
  for (
    const sessionState of ["deleted", "recreated", "token_changed"] as const
  ) {
    const f = await fixture({ sessionState });
    await assertFailure(await f.handler(post()), 410);
    assert(
      f.calls.length === 1 && f.validations.length === 1,
      `${sessionState} account was not checked exactly once`,
    );
    assert(
      f.validations[0].consumed && f.entries.get(f.hash)?.consumed,
      "current account check happened before code consumption",
    );
    await assertFailure(await f.handler(post()), 410);
    assert(f.validations.length === 1, "replay revalidated a consumed session");
  }
});

Deno.test("Apple native exchange fails closed when the current account lookup is unavailable", async () => {
  const f = await fixture({ validationError: true });
  await assertFailure(await f.handler(post()), 500);
  assert(
    f.calls.length === 1 && f.validations.length === 1 &&
      f.validations[0].consumed,
    "lookup outage did not follow atomic redemption",
  );
  await assertFailure(await f.handler(post()), 410);
  assert(
    f.validations.length === 1,
    "lookup outage made consumed code reusable",
  );
});

Deno.test("Apple native exchange rejects missing or malformed internal profile before validation", async () => {
  const { apple_profile_id: _profile, ...withoutProfile } = VALID_PAYLOAD;
  const invalidPayloads = [
    withoutProfile,
    ...[null, "", "not-a-uuid", " " + PROFILE_ID, PROFILE_ID + "\n", 42, {}, []]
      .map((apple_profile_id) => ({ ...VALID_PAYLOAD, apple_profile_id })),
  ];
  for (const payload of invalidPayloads) {
    const f = await fixture({ payload });
    await assertFailure(await f.handler(post()), 410);
    assert(
      f.entries.get(f.hash)?.consumed === true,
      "invalid stored payload was not atomically consumed",
    );
    assert(
      f.validations.length === 0,
      "invalid internal profile reached account validator",
    );
  }
});

Deno.test("Apple native exchange never accepts a client-supplied internal profile binding", async () => {
  const f = await fixture();
  await assertFailure(
    await f.handler(
      post({
        code: CODE,
        code_verifier: VERIFIER,
        apple_profile_id: PROFILE_ID,
      }),
    ),
    400,
  );
  assert(
    f.calls.length === 0 && f.validations.length === 0,
    "client profile binding reached backend",
  );
});

Deno.test("Apple native exchange consumes a valid code exactly once", async () => {
  const f = await fixture();
  assert((await f.handler(post())).status === 200, "first redemption failed");
  await assertFailure(await f.handler(post()), 410);
  assert(
    f.entries.get(f.hash)?.consumed === true,
    "valid code not marked consumed",
  );
});

Deno.test("Apple native exchange racing requests allow only one success", async () => {
  const f = await fixture();
  const results = await Promise.all(
    Array.from({ length: 12 }, () => f.handler(post())),
  );
  assert(
    results.filter((response) => response.status === 200).length === 1,
    "concurrent code reuse succeeded",
  );
  for (
    const response of results.filter((response) => response.status !== 200)
  ) await assertFailure(response, 410);
});

Deno.test("Apple native exchange verifier mismatch does not consume the valid row", async () => {
  const f = await fixture();
  await assertFailure(
    await f.handler(post({ code: CODE, code_verifier: "z".repeat(64) })),
    410,
  );
  assert(
    f.entries.get(f.hash)?.consumed === false,
    "bad verifier consumed valid exchange",
  );
  assert(
    (await f.handler(post())).status === 200,
    "correct verifier failed after mismatch",
  );
});

Deno.test("Apple native exchange cannot consume Google-provider exchange", async () => {
  const f = await fixture({ provider: "google" });
  await assertFailure(await f.handler(post()), 410);
  assert(f.calls[0]?.provider === "apple", "provider was not fixed");
  assert(
    f.entries.get(f.hash)?.consumed === false,
    "Google exchange was consumed",
  );
  await assertFailure(
    await f.handler(
      post({ code: CODE, code_verifier: VERIFIER, provider: "google" }),
    ),
    400,
  );
  assert(f.calls.length === 1, "caller-selected provider reached store");
});

Deno.test("Apple native exchange treats missing and expired codes as unavailable", async () => {
  const expired = await fixture({ expired: true });
  await assertFailure(await expired.handler(post()), 410);
  assert(
    expired.entries.get(expired.hash)?.consumed === false,
    "expired row was consumed",
  );
  const f = await fixture();
  await assertFailure(
    await f.handler(post({ code: "N".repeat(43), code_verifier: VERIFIER })),
    410,
  );
  f.advance(300_000);
  await assertFailure(await f.handler(post()), 410);
});

Deno.test("Apple native exchange rejects malformed code and verifier without store access", async () => {
  const f = await fixture();
  for (
    const code of [
      "",
      "a".repeat(42),
      "a".repeat(44),
      "a".repeat(42) + "=",
      "a".repeat(42) + "+",
      CODE + "\n",
      " " + CODE,
      42,
      {},
      [],
    ]
  ) {
    await assertFailure(
      await f.handler(post({ code, code_verifier: VERIFIER })),
      400,
    );
  }
  for (
    const verifier of [
      "",
      "a".repeat(42),
      "a".repeat(129),
      "a".repeat(42) + "+",
      VERIFIER + "\n",
      " " + VERIFIER,
      VERIFIER + " ",
      42,
      {},
      [],
    ]
  ) {
    await assertFailure(
      await f.handler(post({ code: CODE, code_verifier: verifier })),
      400,
    );
  }
  assert(f.calls.length === 0, "invalid PKCE reached redemption store");
});

Deno.test("Apple native exchange accepts the RFC7636 verifier boundaries and permitted characters", async () => {
  for (
    const verifier of ["a".repeat(43), "a".repeat(128), "A.z_~9-".repeat(9)]
  ) {
    const f = await fixture({ verifier });
    assert(
      (await f.handler(post({ code: CODE, code_verifier: verifier })))
        .status === 200,
      "valid RFC7636 verifier rejected",
    );
  }
});

Deno.test("Apple native exchange rejects non-JSON, unknown keys, non-objects and oversized bodies", async () => {
  const f = await fixture();
  for (
    const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "text/html",
    ]
  ) {
    await assertFailure(await f.handler(post(undefined, contentType)), 400);
  }
  for (
    const body of [null, [], "value", 42, {}, { code: CODE }, {
      code_verifier: VERIFIER,
    }, {
      code: CODE,
      code_verifier: VERIFIER,
      redirect_to: "https://attacker.invalid/",
    }]
  ) {
    await assertFailure(await f.handler(post(body)), 400);
  }
  for (
    const body of [
      "{",
      '{"code":',
      JSON.stringify({ code: CODE, code_verifier: VERIFIER }) +
      " ".repeat(4096),
    ]
  ) {
    await assertFailure(await f.handler(raw(body)), 400);
  }
  assert(f.calls.length === 0, "malformed JSON reached store");
});

Deno.test("Apple native exchange rejects duplicate JSON fields including escaped duplicates", async () => {
  const f = await fixture();
  const bodies = [
    `{"code":"${CODE}","code":"${CODE}","code_verifier":"${VERIFIER}"}`,
    `{"code":"${CODE}","code_verifier":"${VERIFIER}","code_verifier":"${VERIFIER}"}`,
    `{"code":"${CODE}","co\\u0064e":"${CODE}","code_verifier":"${VERIFIER}"}`,
    `{"code":"${CODE}","code_verifier":"${VERIFIER}","code_\\u0076erifier":"${VERIFIER}"}`,
  ];
  for (const body of bodies) {
    await assertFailure(await f.handler(raw(body)), 400);
  }
  assert(f.calls.length === 0, "ambiguous duplicate JSON reached store");
});

Deno.test("Apple native exchange valid escaped JSON keys and JSON media charset work", async () => {
  const f = await fixture();
  const response = await f.handler(
    raw(
      `{"co\\u0064e":"${CODE}","code_verifier":"${VERIFIER}"}`,
      "application/json; charset=utf-8",
    ),
  );
  assert(response.status === 200, "unambiguous valid JSON rejected");
});

Deno.test("Apple native exchange refuses incomplete or invalid stored account/session payloads", async () => {
  for (
    const payload of [
      null,
      {},
      [],
      "unexpected",
      { user: {} },
      { ...VALID_PAYLOAD, user: { email: "" } },
      { ...VALID_PAYLOAD, user: { email: "   " } },
      { ...VALID_PAYLOAD, user: { email: 42 } },
      { ...VALID_PAYLOAD, native_session: null },
      { ...VALID_PAYLOAD, native_session: { token: TOKEN } },
      { ...VALID_PAYLOAD, native_session: { user_id: "123", token: "   " } },
      { ...VALID_PAYLOAD, native_session: { user_id: "123", token: {} } },
      ...[0, -1, "0", " ", "-1", {}, [], true, 1.5, Number.MAX_SAFE_INTEGER + 1]
        .map((user_id) => ({
          ...VALID_PAYLOAD,
          native_session: { user_id, token: TOKEN },
        })),
    ]
  ) {
    const f = await fixture({ payload });
    await assertFailure(await f.handler(post()), 410);
  }
});

Deno.test("Apple native exchange returns safe failure for private dependency errors", async () => {
  const f = await fixture({ error: true });
  await assertFailure(await f.handler(post()), 500);
  assert(
    f.entries.get(f.hash)?.consumed === false,
    "dependency error consumed exchange",
  );
});

Deno.test("Apple native exchange handles preflight and rejects other methods without store access", async () => {
  const f = await fixture();
  const preflight = await f.handler(new Request(URL, { method: "OPTIONS" }));
  assert(preflight.status === 204, "preflight rejected");
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    await assertFailure(await f.handler(new Request(URL, { method })), 405);
  }
  assert(f.calls.length === 0, "non-POST request reached store");
});
