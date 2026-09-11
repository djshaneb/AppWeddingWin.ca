// Execute the real narrow transport function bodies from both Edge mirrors.
// Only network/BD dependencies are replaced; no production account or request
// is used, and the fixtures contain no real credentials or contact data.
const endpointPaths = [
  "../bd-qr-bingo-sync/index.ts",
  "../bd-qr-bingo-vendor-sync/index.ts",
];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function assert(value: unknown, message = "Assertion failed") {
  if (!value) throw new Error(message);
}
async function rejects(operation: () => Promise<unknown>, message: string) {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(message),
      `Unexpected rejection: ${String(error)}`,
    );
    return;
  }
  throw new Error("Unsafe transport operation was accepted");
}
function bodyBetween(
  source: string,
  name: string,
  first: string,
  next: string,
) {
  const from = source.indexOf(`function ${name}(`);
  const to = source.indexOf(`function ${next}`, from);
  assert(from >= 0 && to > from, `Cannot find actual ${name} implementation`);
  const region = source.slice(from, to);
  const begin = region.indexOf(first);
  const end = region.lastIndexOf("}");
  assert(begin >= 0 && end > begin, `Cannot isolate actual ${name} body`);
  return region.slice(begin, end);
}
function cookieFunctions() {
  return {
    cookieHeader: (jar: Map<string, string>) =>
      [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; "),
    getSetCookieHeaders: (headers: Headers) => headers.getSetCookie(),
    appendCookie: (jar: Map<string, string>, values: string[]) => {
      for (const value of values) {
        const [name, content] = value.split(";")[0].split("=");
        jar.set(name, content);
      }
    },
  };
}
for (const path of endpointPaths) {
  const endpoint = path.includes("vendor-sync") ? "vendor-sync" : "sync";
  Deno.test(`${endpoint} signed couple proof still requires the fresh exact couple account`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const start = source.indexOf("const websiteCoupleUser =");
    const end = source.indexOf('if (action === "fixture_context")', start);
    assert(start > 0 && end > start);
    const implementation = new AsyncFunction(
      "websitePrincipal",
      "authenticatedMemberId",
      "fetchFullBdUserById",
      "jsonResponse",
      source.slice(start, end) + "\nreturn { permitted: true };",
    );
    let calls = 0;
    const principal = {
      kind: "couple",
      userId: "37823",
      action: "fixture_context",
    };
    const invoke = (user: unknown) =>
      implementation(principal, "37823", async (memberId: string) => {
        calls++;
        assert(memberId === "37823");
        return user;
      }, (body: unknown, status: number) => ({ body, status }));
    for (
      const user of [undefined, { user_id: "39029", subscription_id: "4" }, {
        user_id: "37823",
        subscription_id: "8",
      }, { user_id: "37823", subscription_id: "" }]
    ) {
      assert(
        (await invoke(user)).status === 403,
        "Invalid couple identity/membership reached the action",
      );
    }
    for (const plan of ["4", "18", 4, 18]) {
      assert(
        (await invoke({ user_id: "37823", subscription_id: plan }))
          .permitted === true,
      );
    }
    assert(
      calls === 8,
      "Every website couple request must use a fresh BD identity check",
    );
  });

  Deno.test(`${endpoint} a tagged couple cannot use a signed vendor principal`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const start = source.indexOf('if (websitePrincipal?.kind === "vendor" &&');
    const end = source.indexOf(
      'if (action === "vendor_dashboard_access")',
      start,
    );
    assert(start > 0 && end > start);
    const implementation = new AsyncFunction(
      "websitePrincipal",
      "user",
      "jsonResponse",
      source.slice(start, end) + "\nreturn { permitted: true };",
    );
    for (const plan of ["4", "18", 4, 18, "", undefined, "0", "vendor"]) {
      const result = await implementation({ kind: "vendor" }, {
        user_id: "39029",
        active: "2",
        tags: [30],
        subscription_id: plan,
      }, (body: unknown, status: number) => ({ body, status }));
      assert(
        result.status === 403,
        "Couple/invalid membership bypassed the vendor role boundary via an event tag",
      );
    }
    const vendor = await implementation({ kind: "vendor" }, {
      subscription_id: "8",
    }, (body: unknown, status: number) => ({ body, status }));
    assert(
      vendor.permitted === true,
      "Role guard should defer actual vendor roster checks to the existing resolver",
    );
  });

  Deno.test(`${endpoint} cookie transport blocks hostile destinations before any network call`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const implementation = new AsyncFunction(
      "url",
      "cookieJar",
      "init",
      "fetch",
      "cookieHeader",
      "getSetCookieHeaders",
      "appendCookie",
      bodyBetween(
        source,
        "fetchWithCookies",
        "const target =",
        "loginWebsiteSession",
      ),
    );
    const functions = cookieFunctions();
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response("ok", { status: 200 }));
    };
    const jar = new Map([["session", "unit-test-cookie-never-production"]]);
    const invoke = (url: string) =>
      implementation(
        url,
        jar,
        {},
        fakeFetch,
        functions.cookieHeader,
        functions.getSetCookieHeaders,
        functions.appendCookie,
      );
    for (
      const url of [
        "http://www.weddingwin.ca/qr",
        "https://weddingwin.ca.attacker.invalid/qr",
        "https://attacker.invalid/qr",
        "https://www.weddingwin.ca:444/qr",
        "https://name:password@www.weddingwin.ca/qr",
        "https://weddingwin.ca/qr",
        "https://sub.www.weddingwin.ca/qr",
      ]
    ) {
      await rejects(
        () => invoke(url),
        "Untrusted WeddingWin session destination",
      );
    }
    assert(calls.length === 0, "A blocked origin received a network request");
    await invoke("https://www.weddingwin.ca/qr");
    assert(calls.length === 1);
    assert(calls[0].init.redirect === "manual");
    assert(
      (calls[0].init.headers as Record<string, string>).Cookie ===
        "session=unit-test-cookie-never-production",
    );
  });

  Deno.test(`${endpoint} a login redirect cannot carry cookies to another origin`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const fetchImpl = new AsyncFunction(
      "url",
      "cookieJar",
      "init",
      "fetch",
      "cookieHeader",
      "getSetCookieHeaders",
      "appendCookie",
      bodyBetween(
        source,
        "fetchWithCookies",
        "const target =",
        "loginWebsiteSession",
      ),
    );
    const loginImpl = new AsyncFunction(
      "session",
      "BD_API_BASE_URL",
      "fetchWithCookies",
      bodyBetween(
        source,
        "loginWebsiteSession",
        "const token =",
        "extractJsonAssignment",
      ).replaceAll("new Map<string, string>()", "new Map()"),
    );
    const functions = cookieFunctions();
    const calls: string[] = [];
    const fakeFetch = (url: string) => {
      calls.push(url);
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://attacker.invalid/collect",
            "set-cookie": "session=unit-test-only; Secure; HttpOnly",
          },
        }),
      );
    };
    const fetchWithCookies = (
      url: string,
      jar: Map<string, string>,
      init: RequestInit = {},
    ) =>
      fetchImpl(
        url,
        jar,
        init,
        fakeFetch,
        functions.cookieHeader,
        functions.getSetCookieHeaders,
        functions.appendCookie,
      );
    await rejects(
      () =>
        loginImpl(
          { user_id: "37823", token: "unit-test-token" },
          "https://www.weddingwin.ca",
          fetchWithCookies,
        ),
      "Untrusted WeddingWin session destination",
    );
    assert(
      calls.length === 1 &&
        calls[0].startsWith("https://www.weddingwin.ca/login/token/"),
      "Redirect target received a network request/cookie",
    );
  });

  Deno.test(`${endpoint} production QR page must match member and session CSRF before using scan history`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const body = bodyBetween(
      source,
      "getQrPage",
      'let bootstrapCsrf = ""',
      "postQrAction",
    )
      .replaceAll("extractJsonAssignment<string>", "extractJsonAssignment")
      .replaceAll("extractJsonAssignment<unknown[]>", "extractJsonAssignment")
      .replaceAll("(vendor): vendor is QrVendor =>", "(vendor) =>");
    const implementation = new AsyncFunction(
      "cookieJar",
      "expectedMemberId",
      "BD_API_BASE_URL",
      "fetchWithCookies",
      "extractJsonAssignment",
      "normalizeVendor",
      body,
    );
    let normalized = 0;
    function extract(html: string, key: string, fallback: unknown) {
      const match = html.match(
        new RegExp(`const\\s+${key}\\s*=\\s*([\\s\\S]*?);`),
      );
      return match ? JSON.parse(match[1]) : fallback;
    }
    async function invoke(memberId: unknown, csrf: unknown, status = 200) {
      const html = `const QR_AUTHENTICATED_MEMBER_ID = ${
        JSON.stringify(memberId)
      };\nconst QR_WEBSITE_CSRF = ${
        JSON.stringify(csrf)
      };\nconst VENDORS = [{"id":"39029"}];\nconst INITIAL_SCANNED = ["39029"];`;
      return await implementation(
        new Map(),
        "37823",
        "https://www.weddingwin.ca",
        async (_url: string, _jar: unknown, init: RequestInit = {}) => init.method === "POST"
          ? new Response(JSON.stringify({ status: "success", authenticated_member_id: "37823", qr_csrf: "a".repeat(64) }), { status: 200 })
          : new Response(html, { status }),
        extract,
        (value: unknown) => {
          normalized++;
          return value;
        },
      );
    }
    for (
      const [member, csrf] of [
        ["37824", "a".repeat(64)],
        ["", "a".repeat(64)],
        [37823, "a".repeat(64)],
        ["37823", ""],
        ["37823", "a".repeat(63)],
        ["37823", "z".repeat(64)],
      ]
    ) {
      await rejects(
        () => invoke(member, csrf),
        "Website scan history does not match the authenticated member",
      );
    }
    assert(
      normalized === 0,
      "Foreign history was parsed before the account/CSRF check",
    );
    const result = await invoke("37823", "a".repeat(64));
    assert(
      normalized === 1 && result.scanned[0] === "39029" &&
        result.requestCsrf === "a".repeat(64),
    );
    await rejects(
      () => invoke("37823", "a".repeat(64), 302),
      "QR Bingo page unavailable",
    );
  });

  Deno.test(`${endpoint} QR session bootstrap rejects bad identity and preserves its cookie and CSRF`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const body = bodyBetween(source, "getQrPage", 'let bootstrapCsrf = ""', "postQrAction")
      .replaceAll("extractJsonAssignment<string>", "extractJsonAssignment")
      .replaceAll("extractJsonAssignment<unknown[]>", "extractJsonAssignment")
      .replaceAll("(vendor): vendor is QrVendor =>", "(vendor) =>");
    const pageImpl = new AsyncFunction("cookieJar", "expectedMemberId", "BD_API_BASE_URL", "fetchWithCookies",
      "extractJsonAssignment", "normalizeVendor", body);
    const fetchImpl = new AsyncFunction("url", "cookieJar", "init", "fetch", "cookieHeader", "getSetCookieHeaders", "appendCookie",
      bodyBetween(source, "fetchWithCookies", "const target =", "loginWebsiteSession"));
    const functions = cookieFunctions();
    const csrf = "a".repeat(64);
    const valid = { status: "success", authenticated_member_id: "37823", qr_csrf: csrf };
    async function invoke(bootstrap: unknown, status = 200, pageCsrf = csrf, expectedId: string | undefined = "37823") {
      const calls: { method: string; cookie: string; origin: string; action: string }[] = [];
      const jar = new Map([["userid", "37823"]]);
      const fakeFetch = async (_url: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        calls.push({ method: init.method || "GET", cookie: headers.get("Cookie") || "",
          origin: headers.get("Origin") || "", action: new URLSearchParams(String(init.body || "")).get("action") || "" });
        if (init.method === "POST") return new Response(JSON.stringify(bootstrap), {
          status, headers: { "Set-Cookie": "__Secure-sessionID5=unit-test-php-session; Secure; HttpOnly" },
        });
        return new Response("unit-test-html", { status: 200 });
      };
      const transport = (url: string, cookies: Map<string, string>, init: RequestInit = {}) => fetchImpl(url, cookies, init, fakeFetch,
        functions.cookieHeader, functions.getSetCookieHeaders, functions.appendCookie);
      const extract = (_html: string, name: string) => name === "QR_AUTHENTICATED_MEMBER_ID" ? "37823"
        : name === "QR_WEBSITE_CSRF" ? pageCsrf : [];
      try {
        const result = await pageImpl(jar, expectedId, "https://www.weddingwin.ca", transport, extract, (v: unknown) => v);
        return { result, calls };
      } catch (error) {
        return { error, calls };
      }
    }
    for (const invalid of [null, {}, { ...valid, status: "error" }, { ...valid, authenticated_member_id: "wrong" },
      { ...valid, authenticated_member_id: 37823 }, { ...valid, qr_csrf: "" }, { ...valid, qr_csrf: "z".repeat(64) }]) {
      const result = await invoke(invalid);
      assert(result.error instanceof Error && result.error.message.includes("could not be initialized") && result.calls.length === 1,
        "Bad bootstrap reached the QR page");
    }
    const rejected = await invoke(valid, 403);
    assert(rejected.error instanceof Error && rejected.calls.length === 1);
    const good = await invoke(valid);
    assert(!good.error && good.result.requestCsrf === csrf && good.calls.length === 2);
    assert(good.calls[0].method === "POST" && good.calls[0].origin === "https://www.weddingwin.ca" && good.calls[0].action === "scanner_session");
    assert(good.calls[1].method === "GET" && good.calls[1].cookie.includes("__Secure-sessionID5=unit-test-php-session"),
      "The bootstrap session cookie did not reach the identity-checked GET");
    const changed = await invoke(valid, 200, "b".repeat(64));
    assert(changed.error instanceof Error && changed.error.message.includes("does not match the authenticated member"),
      "A different GET session CSRF was accepted");
    const vendor = await invoke(valid, 200, csrf, "");
    assert(!vendor.error && vendor.calls.length === 1 && vendor.calls[0].method === "GET",
      "Vendor page loading unexpectedly required a couple bootstrap");
  });

  Deno.test(`${endpoint} token login leaves the exact QR destination to the identity-checked page loader`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const implementation = new AsyncFunction("session", "BD_API_BASE_URL", "fetchWithCookies",
      bodyBetween(source, "loginWebsiteSession", "const token =", "extractJsonAssignment")
        .replaceAll("new Map<string, string>()", "new Map()"));
    async function invoke(destination: string, addCookie = true) {
      const calls: string[] = [];
      const result = await implementation({ token: "unit-test-token" }, "https://www.weddingwin.ca",
        async (url: string, jar: Map<string, string>) => {
          calls.push(url);
          if (addCookie) jar.set("session", "unit-test-cookie");
          return calls.length === 1
            ? new Response(null, { status: 302, headers: { location: destination } })
            : new Response("page", { status: 200 });
        });
      return { calls, result };
    }
    for (const destination of ["/qr", "https://www.weddingwin.ca/qr", "/account/qr", "https://www.weddingwin.ca/account/qr"]) {
      const result = await invoke(destination);
      assert(result.calls.length === 1 && result.result.size === 1,
        "Token login performed the redundant full QR bootstrap GET");
    }
    for (const destination of ["/qr?preview=1", "/qr#section", "/qr/", "/account/qr/", "/account/qr?preview=1", "/login/continue"]) {
      const result = await invoke(destination);
      assert(result.calls.length === 2, "A noncanonical redirect bypassed its normal request handling");
    }
    await rejects(() => invoke("/qr", false), "Website session could not be created");
    assert(source.includes("await getQrPage(cookieJar, authenticatedMemberId)"),
      "Normal couple transport lost the mandatory identity/CSRF check");
  });

  Deno.test(`${endpoint} only normal scans skip the unused pre-save history request`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const start = source.indexOf("const progress = isVendorRaffleAction");
    const end = source.indexOf('\n      }\n\n      if (action === "scan")', start);
    assert(start > 0 && end > start);
    const implementation = new AsyncFunction("action", "isVendorRaffleAction", "page", "getFreshScanned",
      "let scanned, inShowScanned; const cookieJar = new Map();\n" + source.slice(start, end) + "\nreturn {scanned,inShowScanned};");
    let historyReads = 0;
    const fresh = async () => { historyReads++; return { scanned: ["vendor-fresh"], inShowScanned: ["vendor-fresh"] }; };
    const page = { scanned: ["vendor-old", "vendor-old"] };
    const scan = await implementation("scan", false, page, fresh);
    assert(historyReads === 0 && scan.scanned.length === 1 && scan.scanned[0] === "vendor-old" && scan.inShowScanned.length === 0,
      "Normal scan fetched unused history or invented in-show proof");
    for (const action of ["list", "raffle_offer", "raffle_opt_in"]) {
      const result = await implementation(action, false, page, fresh);
      assert(result.inShowScanned[0] === "vendor-fresh", "Draw/list action lost authoritative history");
    }
    assert(historyReads === 3);
    const vendor = await implementation("vendor_raffle_get", true, page, fresh);
    assert(historyReads === 3 && vendor.scanned.length === 0 && vendor.inShowScanned.length === 0);
    const afterWrite = source.slice(source.indexOf('if (scanResult.status !== "success")'), source.indexOf('if (action === "raffle_offer")'));
    assert(afterWrite.includes("const progress = await getFreshScanned(cookieJar, page)") &&
      afterWrite.includes("qrBingoScannerWindowOpen(qrBingoConfig()) &&") &&
      afterWrite.includes("progress.vendorDrawScanned.includes(matchedVendor.id)"),
      "Post-save verification or draw eligibility was weakened");
  });

  Deno.test(`${endpoint} scan rejection diagnostics contain only fixed codes and numeric status`, async () => {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    const start = source.indexOf("const upstreamStatus = Number(scanResult.__http_status || 0)");
    const end = source.indexOf("return jsonResponse({", start);
    assert(start > 0 && end > start);
    const implementation = new AsyncFunction("scanResult", "console", source.slice(start, end));
    const logs: unknown[][] = [];
    const logger = { warn: (...args: unknown[]) => logs.push(args) };
    for (const [input, code, status] of [
      [{ __http_status: 403, error: "Refresh QR Bingo before continuing." }, "website_csrf_rejected", 403],
      [{ __http_status: 503, message: "Your scan could not be saved. Please try again." }, "website_scan_write_failed", 503],
      [{ __http_status: 409, code: "stale_event_config" }, "stale_event_config", 409],
      [{ __http_status: "private-session-token", code: "secret-customer@example.invalid", message: "raw-secret-cookie" }, "scan_failed", 0],
    ] as const) {
      await implementation(input, logger);
      const record = logs.at(-1)!;
      assert(record[0] === "qr_bingo_website_scan_rejected");
      const details = record[1] as Record<string, unknown>;
      assert(Object.keys(details).sort().join(",") === "code,stage,upstream_status" &&
        details.stage === "scan_vendor" && details.code === code && details.upstream_status === status);
    }
    const serialized = JSON.stringify(logs);
    for (const secret of ["private-session-token", "secret-customer@example.invalid", "raw-secret-cookie"])
      assert(!serialized.includes(secret), "Diagnostic log exposed arbitrary response data");
  });
}
