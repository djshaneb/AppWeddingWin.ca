import {
  hasQrBingoWebsiteProof,
  resolveWebsiteSigningSecret,
  verifyQrBingoWebsiteRequest,
  type WebsiteAuthDependencies,
  WebsiteAuthenticationError,
} from "./qr_bingo_website_auth.ts";

// Independent test vectors: no production credentials and no signing helper
// imported from the implementation under review.
const NOW = 1_788_577_000;
const SECRET = "disposable-unit-test-only-website-hmac-key-2026";
const SCOPE = "weddingwin:qr-bingo:vendor-website:v1";
const COUPLE_SCOPE = "weddingwin:qr-bingo:couple-website:v1";
const KEY_CONTEXT = "weddingwin:qr-bingo:website-key:v1";
const ACTIONS = [
  "vendor_dashboard_access",
  "vendor_raffle_get",
  "vendor_raffle_update",
  "vendor_raffle_draw",
  "vendor_raffle_replace",
  "vendor_raffle_export",
  "vendor_raffle_review",
  "vendor_raffle_entries_get",
  "vendor_raffle_entry_update",
  "vendor_raffle_send_notice",
];
type Body = Record<string, unknown>;
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
}
function bytesHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
async function digest(value: string) {
  return bytesHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
async function hmac(keyValue: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}
async function vector(options: {
  action?: string;
  member?: string;
  expires?: string;
  nonce?: string;
  scope?: string;
  secret?: string;
  keyContext?: string;
  rawBody?: string;
  body?: Body;
  directMasterKey?: boolean;
} = {}) {
  const action = options.action ?? "vendor_raffle_get";
  const member = options.member ?? "39029";
  const expires = options.expires ?? String(NOW + 30);
  const nonce = options.nonce ?? "f2f09e6a7a12423a998ea2ca48dc37c4";
  const scope = options.scope ?? SCOPE;
  const body = options.body ?? {
    action,
    website_member_id: member,
    client_platform: "website",
    prize_description: "50% off photography\nMaximum $500 — café 💐",
  };
  const rawBody = options.rawBody ?? JSON.stringify(body);
  const bodyHash = await digest(rawBody);
  const secret = options.secret ?? SECRET;
  const signingKey = options.directMasterKey
    ? secret
    : await hmac(secret, options.keyContext ?? KEY_CONTEXT);
  const signature = await hmac(
    signingKey,
    [scope, member, action, expires, nonce, bodyHash].join("\n"),
  );
  const headers = new Headers({
    "content-type": "application/json",
    "x-ww-website-scope": scope,
    "x-ww-website-member": member,
    "x-ww-website-expires": expires,
    "x-ww-website-nonce": nonce,
    "x-ww-website-body-sha256": bodyHash,
    "x-ww-website-signature": signature,
  });
  return { headers, body, rawBody };
}
function request(headers: Headers, rawBody: string, method = "POST") {
  return new Request(
    "https://example.invalid/functions/v1/bd-qr-bingo-vendor-sync",
    {
      method,
      headers,
      ...(method === "POST" ? { body: rawBody } : {}),
    },
  );
}
function dependencies(
  options: {
    secret?: string;
    secretError?: boolean;
    nonceError?: boolean;
    rejectNonce?: boolean;
  } = {},
) {
  const seen = new Set<string>();
  const observations = { loads: 0, consumed: [] as [string, string][] };
  const deps: WebsiteAuthDependencies = {
    nowSeconds: () => NOW,
    loadSecret: async () => {
      observations.loads++;
      if (options.secretError) {
        throw new Error("private upstream information must not escape");
      }
      return options.secret ?? SECRET;
    },
    consumeNonce: async (nonce, expiry) => {
      observations.consumed.push([nonce, expiry]);
      if (options.nonceError) {
        throw new Error("private replay storage information must not escape");
      }
      if (seen.has(nonce) || options.rejectNonce) return false;
      seen.add(nonce);
      return true;
    },
  };
  return { deps, observations };
}
async function denied(operation: () => Promise<unknown>, status = 401) {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof WebsiteAuthenticationError,
      "Expected controlled authentication error",
    );
    equal(error.status, status);
    assert(
      !error.message.includes("private"),
      "Upstream details leaked through the auth boundary",
    );
    return;
  }
  throw new Error("Unauthorised website request was accepted");
}

for (const action of ACTIONS) {
  Deno.test(`website independent vector authenticates only the signed member for ${action}`, async () => {
    const value = await vector({ action });
    const { deps, observations } = dependencies();
    equal(
      await verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      ),
      { userId: "39029", action, kind: "vendor" },
    );
    equal(observations.consumed, [[
      "website-vendor:f2f09e6a7a12423a998ea2ca48dc37c4",
      new Date((NOW + 30) * 1000).toISOString(),
    ]]);
  });
}

Deno.test("website proof detection includes partial headers and explicit identity without minting native identity", () => {
  const partialHeaders: Record<string, string>[] = [
    { "x-ww-website-member": "39029" },
    { "x-ww-website-unknown": "x" },
  ];
  for (const headers of partialHeaders) {
    assert(hasQrBingoWebsiteProof(request(new Headers(headers), "{}"), {}));
  }
  assert(
    hasQrBingoWebsiteProof(request(new Headers(), "{}"), {
      website_member_id: "39029",
    }),
  );
  assert(
    !hasQrBingoWebsiteProof(request(new Headers(), "{}"), {
      native_session: { user_id: "39029", token: "test-only" },
    }),
  );
});

Deno.test("website rejects every missing signature header and duplicate values", async () => {
  const value = await vector();
  for (
    const name of [...value.headers.keys()].filter((name) =>
      name.startsWith("x-ww-website-")
    )
  ) {
    for (const duplicate of [false, true]) {
      const headers = new Headers(value.headers);
      if (duplicate) headers.append(name, headers.get(name)!);
      else headers.delete(name);
      const { deps, observations } = dependencies();
      await denied(() =>
        verifyQrBingoWebsiteRequest(
          request(headers, value.rawBody),
          value.rawBody,
          value.body,
          deps,
        )
      );
      equal(observations.consumed.length, 0);
    }
  }
});

Deno.test("website rejects one-field header or exact-byte body tampering before consuming nonce", async () => {
  const value = await vector();
  const mutations = [
    ["scope", "weddingwin:qr-bingo:admin:v1"],
    ["member", "39030"],
    ["expires", String(NOW + 31)],
    ["nonce", "00000000000000000000000000000000"],
    ["body-sha256", "0".repeat(64)],
    ["signature", "0".repeat(64)],
  ];
  for (const [name, replacement] of mutations) {
    const headers = new Headers(value.headers);
    headers.set(`x-ww-website-${name}`, replacement);
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      )
    );
    equal(observations.consumed.length, 0);
  }
  for (
    const rawBody of [
      value.rawBody + " ",
      value.rawBody.replace("$500", "$900"),
      value.rawBody.replace("café", "cafe"),
    ]
  ) {
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(value.headers, rawBody),
        rawBody,
        value.body,
        deps,
      )
    );
    equal(observations.consumed.length, 0);
  }
});

Deno.test("website rejects client-native identities and mismatched signed principals", async () => {
  for (
    const body of [
      { action: "vendor_raffle_get", website_member_id: "39030" },
      { action: "vendor_raffle_get", website_member_id: 39029 },
      {
        action: "vendor_raffle_get",
        website_member_id: "39029",
        native_session: null,
      },
      {
        action: "vendor_raffle_get",
        website_member_id: "39029",
        native_session: { user_id: "39030", token: "test-only" },
      },
    ]
  ) {
    const value = await vector({ body });
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      )
    );
    equal(observations, { loads: 0, consumed: [] });
  }
});

Deno.test("website rejects freshly signed admin, couple and unknown actions", async () => {
  for (
    const action of [
      "public_config",
      "publish",
      "fixture_context",
      "scan",
      "list",
      "raffle_offer",
      "raffle_opt_in",
      "alternate_free_entry_offers",
      "vendor_raffle_delete",
      "Vendor_raffle_get",
      "vendor_raffle_get ",
    ]
  ) {
    const value = await vector({ action });
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      )
    );
    equal(observations, { loads: 0, consumed: [] });
  }
});

Deno.test("website rejects noncanonical member and expiry fields even when signed", async () => {
  for (
    const member of [
      "0",
      "-1",
      "+39029",
      "039029",
      "39029.0",
      "39029e0",
      "39029,39030",
      "9".repeat(19),
    ]
  ) {
    const value = await vector({ member });
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      )
    );
    equal(observations.consumed.length, 0);
  }
  for (
    const expires of [
      String(NOW),
      String(NOW - 1),
      String(NOW + 61),
      `0${NOW + 30}`,
      `${NOW + 30}.0`,
      "Infinity",
      "999999999999999999999",
    ]
  ) {
    const value = await vector({ expires });
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      )
    );
    equal(observations.consumed.length, 0);
  }
  for (const expires of [String(NOW + 1), String(NOW + 60)]) {
    const value = await vector({ expires });
    const { deps } = dependencies();
    assert(
      await verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      ),
    );
  }
});

Deno.test("website rejects key-domain confusion, direct master signatures and wrong secrets", async () => {
  for (
    const options of [
      { directMasterKey: true },
      { keyContext: "weddingwin:qr-bingo:admin-key:v1" },
      { secret: "another-disposable-unit-test-secret-not-production" },
    ]
  ) {
    const value = await vector(options);
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      )
    );
    equal(observations.consumed.length, 0);
  }
  const value = await vector();
  value.headers.set(
    "x-ww-website-signature",
    await hmac(
      SECRET,
      `${NOW}.${value.headers.get("x-ww-website-nonce")}.${value.rawBody}`,
    ),
  );
  const { deps, observations } = dependencies();
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(value.headers, value.rawBody),
      value.rawBody,
      value.body,
      deps,
    )
  );
  equal(observations.consumed.length, 0);
});

Deno.test("website single-use consumption rejects replay and permits only one concurrent request", async () => {
  const value = await vector();
  const { deps, observations } = dependencies();
  const attempt = () =>
    verifyQrBingoWebsiteRequest(
      request(value.headers, value.rawBody),
      value.rawBody,
      value.body,
      deps,
    );
  const results = await Promise.allSettled(Array.from({ length: 12 }, attempt));
  equal(results.filter((result) => result.status === "fulfilled").length, 1);
  equal(results.filter((result) => result.status === "rejected").length, 11);
  equal(observations.consumed.length, 12);
  await denied(attempt);
});

Deno.test("website secret and nonce dependency failures are closed and sanitized", async () => {
  for (
    const options of [
      { secretError: true },
      { secret: "" },
      { secret: "short" },
      { secret: "x".repeat(4097) },
      { nonceError: true },
      { rejectNonce: true },
    ]
  ) {
    const value = await vector();
    const { deps, observations } = dependencies(options);
    await denied(
      () =>
        verifyQrBingoWebsiteRequest(
          request(value.headers, value.rawBody),
          value.rawBody,
          value.body,
          deps,
        ),
      options.rejectNonce ? 401 : 503,
    );
    if (!options.nonceError && !options.rejectNonce) {
      equal(observations.consumed.length, 0);
    }
  }
});

Deno.test("website rejects non-POST and oversized UTF-8 bodies before secret loading", async () => {
  const value = await vector();
  const { deps, observations } = dependencies();
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(value.headers, value.rawBody, "GET"),
      value.rawBody,
      value.body,
      deps,
    )
  );
  const oversized = await vector({
    body: {
      action: "vendor_raffle_get",
      website_member_id: "39029",
      description: "💐".repeat(32769),
    },
  });
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(oversized.headers, oversized.rawBody),
      oversized.rawBody,
      oversized.body,
      deps,
    )
  );
  equal(observations, { loads: 0, consumed: [] });
});

for (
  const action of ["fixture_context", "scan", "raffle_offer", "raffle_opt_in"]
) {
  Deno.test(`couple website proof uses separate principal and nonce scope for ${action}`, async () => {
    const value = await vector({
      scope: COUPLE_SCOPE,
      member: "37823",
      action,
    });
    const { deps, observations } = dependencies();
    equal(
      await verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      ),
      {
        userId: "37823",
        action,
        kind: "couple",
      },
    );
    assert(observations.consumed[0][0].startsWith("website-couple:"));
  });
}

Deno.test("couple proof cannot authorize any vendor or admin action even with a fresh signature", async () => {
  for (
    const action of [
      ...ACTIONS,
      "publish",
      "list",
      "alternate_free_entry_offers",
      "fixture_scan",
    ]
  ) {
    const value = await vector({
      scope: COUPLE_SCOPE,
      member: "37823",
      action,
    });
    const { deps, observations } = dependencies();
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      )
    );
    equal(observations, { loads: 0, consumed: [] });
  }
});

Deno.test("couple transport token is body-bound, optional for fixtures and prohibited for vendor proof", async () => {
  const transportToken = "unit-test-canonical-transport-only-not-auth";
  const body = {
    action: "scan",
    website_member_id: "37823",
    website_session_token: transportToken,
  };
  const value = await vector({
    scope: COUPLE_SCOPE,
    member: "37823",
    action: "scan",
    body,
  });
  const { deps } = dependencies();
  equal(
    await verifyQrBingoWebsiteRequest(
      request(value.headers, value.rawBody),
      value.rawBody,
      value.body,
      deps,
    ),
    {
      userId: "37823",
      action: "scan",
      kind: "couple",
      transportToken,
    },
  );
  const tampered = JSON.stringify({
    ...body,
    website_session_token: "different-test-transport-token",
  });
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(value.headers, tampered),
      tampered,
      JSON.parse(tampered),
      dependencies().deps,
    )
  );
  const vendor = await vector({
    body: {
      action: "vendor_raffle_get",
      website_member_id: "39029",
      website_session_token: transportToken,
    },
  });
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(vendor.headers, vendor.rawBody),
      vendor.rawBody,
      vendor.body,
      dependencies().deps,
    )
  );
  for (
    const token of [
      null,
      123,
      "",
      "short",
      "x".repeat(513),
      "contains whitespace token",
      "newline\nsecretvalue",
    ]
  ) {
    const invalid = await vector({
      scope: COUPLE_SCOPE,
      member: "37823",
      action: "scan",
      body: { ...body, website_session_token: token },
    });
    await denied(() =>
      verifyQrBingoWebsiteRequest(
        request(invalid.headers, invalid.rawBody),
        invalid.rawBody,
        invalid.body,
        dependencies().deps,
      )
    );
  }
});

Deno.test("vendor signatures cannot be repurposed for couple scope and couple replay stays single-use", async () => {
  const value = await vector({
    scope: COUPLE_SCOPE,
    member: "37823",
    action: "scan",
  });
  const { deps, observations } = dependencies();
  const wrongScope = new Headers(value.headers);
  wrongScope.set("x-ww-website-scope", SCOPE);
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(wrongScope, value.rawBody),
      value.rawBody,
      value.body,
      deps,
    )
  );
  equal(observations.consumed.length, 0);
  await verifyQrBingoWebsiteRequest(
    request(value.headers, value.rawBody),
    value.rawBody,
    value.body,
    deps,
  );
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(value.headers, value.rawBody),
      value.rawBody,
      value.body,
      deps,
    )
  );
  equal(observations.consumed.length, 2);
  assert(
    observations.consumed.every(([nonce]) =>
      nonce.startsWith("website-couple:")
    ),
  );
});

Deno.test("website signing key follows established admin environment precedence without consulting Vault", async () => {
  let vaultCalls = 0;
  const otherSecret = "different-disposable-vault-test-secret-do-not-use";
  const loadVault = async () => {
    vaultCalls++;
    return otherSecret;
  };
  equal(await resolveWebsiteSigningSecret(`  ${SECRET}\n`, loadVault), SECRET);
  equal(vaultCalls, 0);
  const value = await vector();
  const deps = dependencies().deps;
  deps.loadSecret = () =>
    resolveWebsiteSigningSecret(`\t${SECRET} `, loadVault);
  equal(
    await verifyQrBingoWebsiteRequest(
      request(value.headers, value.rawBody),
      value.rawBody,
      value.body,
      deps,
    ),
    {
      userId: "39029",
      action: "vendor_raffle_get",
      kind: "vendor",
    },
  );
  equal(vaultCalls, 0);
  const wrongVector = await vector({ secret: otherSecret });
  await denied(() =>
    verifyQrBingoWebsiteRequest(
      request(wrongVector.headers, wrongVector.rawBody),
      wrongVector.rawBody,
      wrongVector.body,
      deps,
    )
  );
  equal(vaultCalls, 0);
});

Deno.test("website blank environment falls back to trimmed Vault key exactly once", async () => {
  for (const environment of [undefined, "", " \t\n"]) {
    let vaultCalls = 0;
    const loadVault = async () => {
      vaultCalls++;
      return ` \n${SECRET}\t `;
    };
    equal(await resolveWebsiteSigningSecret(environment, loadVault), SECRET);
    equal(vaultCalls, 1);
    const value = await vector();
    const deps = dependencies().deps;
    deps.loadSecret = () => resolveWebsiteSigningSecret(environment, loadVault);
    assert(
      await verifyQrBingoWebsiteRequest(
        request(value.headers, value.rawBody),
        value.rawBody,
        value.body,
        deps,
      ),
    );
    equal(vaultCalls, 2);
  }
});

Deno.test("website nonblank invalid environment fails closed instead of silently using a working Vault key", async () => {
  for (const environment of ["short", " x ", "x".repeat(4097)]) {
    let vaultCalls = 0;
    const { deps, observations } = dependencies();
    deps.loadSecret = () =>
      resolveWebsiteSigningSecret(environment, async () => {
        vaultCalls++;
        return SECRET;
      });
    const value = await vector();
    await denied(
      () =>
        verifyQrBingoWebsiteRequest(
          request(value.headers, value.rawBody),
          value.rawBody,
          value.body,
          deps,
        ),
      503,
    );
    equal(vaultCalls, 0);
    equal(observations.consumed.length, 0);
  }
});

Deno.test("website Vault failure or malformed value stays sanitized at the verification boundary", async () => {
  for (const value of [null, undefined, 42, {}, "", "short"]) {
    const { deps, observations } = dependencies();
    deps.loadSecret = () =>
      resolveWebsiteSigningSecret(undefined, async () => value);
    const signed = await vector();
    await denied(
      () =>
        verifyQrBingoWebsiteRequest(
          request(signed.headers, signed.rawBody),
          signed.rawBody,
          signed.body,
          deps,
        ),
      503,
    );
    equal(observations.consumed.length, 0);
  }
  const { deps, observations } = dependencies();
  deps.loadSecret = () =>
    resolveWebsiteSigningSecret(" ", async () => {
      throw new Error("private credential store diagnostics");
    });
  const signed = await vector();
  await denied(
    () =>
      verifyQrBingoWebsiteRequest(
        request(signed.headers, signed.rawBody),
        signed.rawBody,
        signed.body,
        deps,
      ),
    503,
  );
  equal(observations.consumed.length, 0);
});
