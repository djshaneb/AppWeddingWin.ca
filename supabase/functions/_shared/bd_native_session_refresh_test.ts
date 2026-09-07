import {
  BdNativeSessionRefreshUnavailable,
  resolveBdNativeSessionRefresh,
} from "./bd_native_session_refresh.ts";

const MEMBER_ID = "9900000000000000011";
const TOKEN = "offline-canonical-native-session-token";
const SESSION = {
  user_id: MEMBER_ID,
  token: TOKEN,
  email: "native-refresh@example.invalid",
  cookie: "offline-session-cookie",
};
const USER = {
  user_id: MEMBER_ID,
  email: SESSION.email,
  first_name: "Offline",
  subscription_id: "18",
  active: "2",
};

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function fixture(options: {
  httpStatus?: number;
  body?: unknown;
  fetchError?: boolean;
  matches?: boolean;
  cacheError?: boolean;
} = {}) {
  const fetched: string[] = [];
  const checked: unknown[] = [];
  const events: string[] = [];
  const deps: Parameters<typeof resolveBdNativeSessionRefresh>[1] = {
    fetchMember: (id) => {
      fetched.push(id);
      events.push("member");
      if (options.fetchError) {
        throw new Error(`PRIVATE_UPSTREAM_FAILURE ${TOKEN} ${SESSION.email}`);
      }
      return Promise.resolve({
        response: new Response(null, { status: options.httpStatus || 200 }),
        body: ("body" in options
          ? options.body
          : { status: "success", message: [USER] }) as {
            status?: string;
            message?: unknown;
          },
      });
    },
    matchesIdentity: (session) => {
      checked.push(session);
      events.push("identity");
      if (options.cacheError) {
        throw new Error(`PRIVATE_CACHE_FAILURE ${TOKEN} ${SESSION.cookie}`);
      }
      return Promise.resolve(options.matches ?? true);
    },
  };
  const resolve = (session: unknown = SESSION) =>
    resolveBdNativeSessionRefresh(
      session as Parameters<typeof resolveBdNativeSessionRefresh>[0],
      deps,
    );
  return { resolve, fetched, checked, events };
}

async function assertUnavailable(operation: () => Promise<unknown>) {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(
    caught instanceof BdNativeSessionRefreshUnavailable,
    "uncertain backend result must be typed unavailable, not missing account",
  );
  for (
    const privateValue of [
      TOKEN,
      SESSION.cookie,
      SESSION.email,
      "PRIVATE_UPSTREAM_FAILURE",
      "PRIVATE_CACHE_FAILURE",
    ]
  ) {
    assert(
      !caught.message.includes(privateValue),
      "typed error leaked private backend detail",
    );
  }
}

Deno.test("native session refresh requires fresh member then exact canonical session confirmation", async () => {
  const f = fixture();
  const user = await f.resolve();
  assert(
    user?.user_id === MEMBER_ID && user?.email === USER.email,
    "matching current member not returned",
  );
  assert(
    f.fetched.length === 1 && f.fetched[0] === MEMBER_ID,
    "member lookup not scoped to exact ID",
  );
  assert(
    f.checked.length === 1 && f.checked[0] === SESSION,
    "canonical check did not receive original session",
  );
  assert(
    f.events.join(",") === "member,identity",
    "cache substituted for fresh member proof",
  );
});

Deno.test("native session refresh accepts one array member or one object member", async () => {
  for (const message of [[USER], USER]) {
    const f = fixture({ body: { status: "success", message } });
    const user = await f.resolve();
    assert(user?.user_id === MEMBER_ID, "valid BD envelope rejected");
    assert(f.checked.length === 1, "valid BD result skipped canonical check");
  }
});

Deno.test("native session refresh accepts equivalent canonical numeric IDs without coercing unsafe IDs", async () => {
  for (
    const [sessionId, rowId] of [[12345, "12345"], ["12345", 12345], [
      12345,
      12345,
    ]] as const
  ) {
    const f = fixture({
      body: { status: "success", message: { ...USER, user_id: rowId } },
    });
    const user = await f.resolve({ ...SESSION, user_id: sessionId });
    assert(
      user?.user_id === rowId,
      "canonical numeric/string identity mismatch",
    );
    assert(
      f.fetched[0] === "12345",
      "fetch did not receive canonical ID string",
    );
  }
});

Deno.test("native session refresh accepts BD token omission only with canonical cache confirmation", async () => {
  const f = fixture({
    body: {
      status: "success",
      message: { ...USER, token: undefined, cookie: undefined },
    },
  });
  assert(
    (await f.resolve())?.user_id === MEMBER_ID,
    "BD stripped-token record rejected despite canonical proof",
  );
  const checked = f.checked[0] as typeof SESSION;
  assert(
    checked.token === TOKEN && checked.cookie === SESSION.cookie,
    "stripped API credentials replaced native session proof",
  );
});

Deno.test("native session refresh confirmed empty success means absent and skips canonical cache", async () => {
  const f = fixture({ body: { status: "success", message: [] } });
  assert(
    await f.resolve() === undefined,
    "confirmed absence not distinguished from outage",
  );
  assert(
    f.fetched.length === 1 && f.checked.length === 0,
    "absent website member was authorized by cache",
  );
});

Deno.test("native session refresh accepts only documented active scalar values", async () => {
  for (const active of ["2", 2]) {
    const f = fixture({
      body: { status: "success", message: [{ ...USER, active }] },
    });
    assert(
      (await f.resolve())?.user_id === MEMBER_ID,
      "active member rejected",
    );
    assert(f.checked.length === 1, "active account skipped token confirmation");
  }
});

Deno.test("native session refresh expires every confirmed non-active status without consulting cache", async () => {
  for (const active of ["1", 1, "3", 3, "4", 4, "5", 5, "6", 6]) {
    const f = fixture({
      body: { status: "success", message: [{ ...USER, active }] },
    });
    assert(await f.resolve() === undefined, "inactive member retained session");
    assert(f.checked.length === 0, "inactive member consulted canonical cache");
  }
});

Deno.test("native session refresh treats missing or unknown active status as unavailable, not revoked", async () => {
  for (
    const active of [
      undefined,
      null,
      "",
      "0",
      0,
      "99",
      99,
      "2 ",
      "02",
      true,
      false,
      [2],
      [1],
      {},
      { value: 2 },
    ]
  ) {
    const f = fixture({
      body: { status: "success", message: [{ ...USER, active }] },
    });
    await assertUnavailable(() => f.resolve());
    assert(f.checked.length === 0, "uncertain member status consulted cache");
  }
});

Deno.test("native session refresh canonical token mismatch is rejected without email fallback", async () => {
  const f = fixture({ matches: false });
  assert(
    await f.resolve() === undefined,
    "canonical token mismatch allowed refresh",
  );
  assert(
    f.fetched.length === 1 && f.fetched[0] === MEMBER_ID &&
      f.checked.length === 1,
    "mismatch attempted extra ID or email lookup",
  );
});

Deno.test("native session refresh every failed HTTP response is unavailable even with empty success body", async () => {
  for (const httpStatus of [301, 400, 401, 403, 404, 408, 429, 500, 502, 503]) {
    for (
      const body of [{ status: "success", message: [] }, {
        status: "success",
        message: [USER],
      }, { status: "error", message: "temporarily unavailable" }]
    ) {
      const f = fixture({ httpStatus, body });
      await assertUnavailable(() => f.resolve());
      assert(f.checked.length === 0, "HTTP failure was authorized from cache");
      assert(
        f.fetched.length === 1,
        "HTTP failure attempted a fallback lookup",
      );
    }
  }
});

Deno.test("native session refresh missing JSON and error envelopes are unavailable, not deleted accounts", async () => {
  for (
    const body of [
      undefined,
      null,
      "gateway error",
      [],
      {},
      { message: [] },
      { status: "error", message: [] },
      { status: "ERROR", message: USER },
      { status: "success" },
    ]
  ) {
    const f = fixture({ body });
    await assertUnavailable(() => f.resolve());
    assert(
      f.checked.length === 0,
      "unconfirmed BD response reached canonical check",
    );
  }
});

Deno.test("native session refresh wrong, multiple or malformed member rows are unavailable", async () => {
  for (
    const message of [
      null,
      false,
      "no results",
      {},
      [[]],
      [null],
      [false],
      [{}],
      [USER, USER],
      [USER, null],
      [{ ...USER, user_id: "9999" }],
      { ...USER, user_id: "9999" },
      ...[
        0,
        -1,
        true,
        {},
        [],
        " 123",
        "0123",
        MEMBER_ID + "\n",
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]
        .map((user_id) => ({ ...USER, user_id })),
    ]
  ) {
    const f = fixture({ body: { status: "success", message } });
    await assertUnavailable(() => f.resolve());
    assert(
      f.checked.length === 0,
      "wrong or ambiguous member authorized from cache",
    );
  }
});

Deno.test("native session refresh network exceptions are typed unavailable and never fall back to cache", async () => {
  const f = fixture({ fetchError: true });
  await assertUnavailable(() => f.resolve());
  assert(
    f.fetched.length === 1 && f.checked.length === 0,
    "network error triggered cache-only login",
  );
});

Deno.test("native session refresh canonical cache outages are unavailable rather than wrong credentials", async () => {
  const f = fixture({ cacheError: true });
  await assertUnavailable(() => f.resolve());
  assert(
    f.events.join(",") === "member,identity",
    "cache failure did not follow exact member lookup",
  );
});

Deno.test("native session refresh malformed session input is rejected without any API or cache access", async () => {
  const invalidSessions: unknown[] = [
    null,
    undefined,
    false,
    "session",
    [],
    {},
    { email: SESSION.email, token: TOKEN },
    { user_id: MEMBER_ID },
    ...[
      0,
      -1,
      true,
      {},
      [],
      "",
      " ",
      "0123",
      MEMBER_ID + "\n",
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]
      .map((user_id) => ({ ...SESSION, user_id })),
    ...[null, undefined, "", "   ", 42, {}, []]
      .map((token) => ({ ...SESSION, token })),
  ];
  for (const session of invalidSessions) {
    const f = fixture();
    // Pass directly: fixture's optional parameter intentionally defaults only
    // for normal tests, while this matrix needs an explicit undefined input.
    const result = session === undefined
      ? await resolveBdNativeSessionRefresh(
        undefined as unknown as Parameters<
          typeof resolveBdNativeSessionRefresh
        >[0],
        {
          fetchMember: () => {
            throw new Error("invalid session reached member API");
          },
          matchesIdentity: () => {
            throw new Error("invalid session reached cache");
          },
        },
      )
      : await f.resolve(session);
    assert(result === undefined, "malformed session input was not rejected");
    assert(
      f.fetched.length === 0 && f.checked.length === 0,
      "invalid session reached backend",
    );
  }
});
