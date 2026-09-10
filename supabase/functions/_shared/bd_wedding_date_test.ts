import {
  BdWeddingDateSyncError,
  syncExistingBdWeddingDateMetadata,
} from "./bd_wedding_date.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
}
const meta = (id = "701", value = "2027-06-12") => ({
  meta_id: id,
  database: "users_data",
  database_id: "42",
  key: "wedding_date",
  value,
});
function harness(
  options: {
    rows?: Record<string, unknown>[];
    readStatus?: number;
    missing?: boolean;
    total?: number;
    updateStatus?: number;
    ignoreWrite?: boolean;
    foreignReadback?: boolean;
    pagination?: Record<string, unknown>;
  } = {},
) {
  let rows = options.rows ?? [meta()];
  const writes: Record<string, string>[] = [];
  let reads = 0;
  return {
    rows: () => rows,
    writes,
    reads: () => reads,
    call: async (path: string, init: RequestInit) => {
      if (init.method === "GET") {
        reads++;
        const url = new URL(path, "https://offline.invalid");
        equal(url.pathname, "/api/v2/users_meta/get");
        equal(url.searchParams.getAll("property[]"), [
          "database",
          "database_id",
          "key",
        ]);
        equal(url.searchParams.getAll("property_value[]"), [
          "users_data",
          "42",
          "wedding_date",
        ]);
        equal(url.searchParams.getAll("property_operator[]"), ["=", "=", "="]);
        equal(url.searchParams.get("limit"), "25");
        if (options.missing) {
          return {
            response: { ok: false, status: 404 },
            body: { status: "error", message: "users_meta not found" },
          };
        }
        if (options.readStatus) {
          return {
            response: { ok: false, status: options.readStatus },
            body: { status: "error", message: "private upstream body" },
          };
        }
        return {
          response: { ok: true, status: 200 },
          body: {
            status: "success",
            message: structuredClone(rows),
            total: options.total ?? rows.length,
            ...options.pagination,
          },
        };
      }
      equal(path, "/api/v2/users_meta/update");
      equal(init.method, "PUT");
      const body = Object.fromEntries(new URLSearchParams(String(init.body)));
      writes.push(body);
      equal(body.database, "users_data");
      equal(body.database_id, "42");
      assert(rows.some((row) => row.meta_id === body.meta_id));
      if (options.updateStatus) {
        return {
          response: { ok: false, status: options.updateStatus },
          body: { status: "error", message: "private upstream body" },
        };
      }
      if (!options.ignoreWrite) {
        rows = rows.map((row) =>
          row.meta_id === body.meta_id ? { ...row, value: body.value } : row
        );
      }
      if (options.foreignReadback) rows[0].database = "list_seo";
      return {
        response: { ok: true, status: 200 },
        body: { status: "success" },
      };
    },
  };
}
async function rejects(fn: () => Promise<unknown>, diagnostic: string) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof BdWeddingDateSyncError);
    equal(error.diagnostic, diagnostic);
    assert(!error.message.includes("private"));
    return;
  }
  throw new Error("Expected rejection");
}

Deno.test("BD date shadow clear preserves exact existing rows and uses explicit value clear", async () => {
  const h = harness();
  await syncExistingBdWeddingDateMetadata(h.call, "42", "");
  equal(h.writes, [{
    meta_id: "701",
    database: "users_data",
    database_id: "42",
    value: "",
    __clear_fields: "value",
  }]);
  equal(h.rows(), [meta("701", "")]);
  equal(h.reads(), 2);
});
Deno.test("BD date shadow set updates all bounded same-member duplicate shadows without other fields", async () => {
  const h = harness({ rows: [meta("701"), meta("702", "2029-01-02")] });
  await syncExistingBdWeddingDateMetadata(h.call, "42", "2028-02-29");
  equal(h.writes.length, 2);
  assert(
    h.writes.every((row) =>
      row.value === "2028-02-29" && Object.keys(row).length === 4
    ),
  );
});
for (
  const options of [{ rows: [] }, { missing: true }, {
    rows: [meta("701", "2028-02-29")],
  }]
) {
  Deno.test(`BD date shadow missing/already matching never creates or deletes ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    await syncExistingBdWeddingDateMetadata(h.call, "42", "2028-02-29");
    equal(h.writes, []);
    equal(h.reads(), 1);
  });
}
for (
  const row of [
    { ...meta(), database: "list_seo" },
    { ...meta(), database_id: "43" },
    { ...meta(), key: "email" },
    { ...meta(), meta_id: "0" },
  ]
) {
  Deno.test(`BD date shadow refuses cross-resource response ${JSON.stringify(row)}`, async () => {
    const h = harness({ rows: [row] });
    await rejects(
      () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
      "bd_date_meta_identity_mismatch",
    );
    equal(h.writes, []);
  });
}
Deno.test("BD date shadow refuses truncated or duplicate-ID lists before writes", async () => {
  for (
    const options of [{ total: 26 }, { total: 2 }, { rows: [meta(), meta()] }]
  ) {
    const h = harness(options);
    await rejects(
      () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
      options.total
        ? "bd_date_meta_unbounded_response"
        : "bd_date_meta_identity_mismatch",
    );
    equal(h.writes, []);
  }
});
for (const status of [403, 404, 500]) {
  Deno.test(`BD date shadow ${status} read failure stops without retry or mutation`, async () => {
    const h = harness({ readStatus: status });
    await rejects(
      () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
      status === 403
        ? "bd_date_meta_permission_denied"
        : "bd_date_meta_read_failed",
    );
    equal(h.writes, []);
    equal(h.reads(), 1);
  });
  Deno.test(`BD date shadow ${status} update failure stops without retry or exposing provider text`, async () => {
    const h = harness({ updateStatus: status });
    await rejects(
      () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
      status === 403
        ? "bd_date_meta_permission_denied"
        : "bd_date_meta_update_failed",
    );
    equal(h.writes.length, 1);
    equal(h.reads(), 1);
  });
}
Deno.test("BD date shadow ignored clear stays pending rather than claiming success", async () => {
  const h = harness({ ignoreWrite: true });
  await rejects(
    () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
    "bd_date_meta_readback_mismatch",
  );
});
Deno.test("BD date shadow readback identity is rechecked", async () => {
  const h = harness({ foreignReadback: true });
  await rejects(
    () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
    "bd_date_meta_identity_mismatch",
  );
});
Deno.test("BD date shadow invalid member/date never reaches provider", async () => {
  for (
    const [id, date] of [["0", ""], ["42 or 1=1", ""], ["42", "2027-02-29"], [
      "42",
      "2027-99-99",
    ]]
  ) {
    let calls = 0;
    await rejects(() =>
      syncExistingBdWeddingDateMetadata(
        async () => {
          calls++;
          throw new Error("Must not call");
        },
        id,
        date,
      ), "bd_date_meta_invalid_scope");
    equal(calls, 0);
  }
});

Deno.test("BD date shadow transport errors stay sanitized and retriable", async () => {
  await rejects(() =>
    syncExistingBdWeddingDateMetadata(
      async () => {
        throw new Error("private upstream details");
      },
      "42",
      "",
    ), "bd_date_meta_read_failed");
  const h = harness();
  await rejects(() =>
    syncExistingBdWeddingDateMetadata(
      async (path, init) => {
        if (init.method === "PUT") throw new Error("private upstream details");
        return await h.call(path, init);
      },
      "42",
      "",
    ), "bd_date_meta_update_failed");
});

Deno.test("BD date shadow accepts the live last-page next_page quirk only with complete counts", async () => {
  const h = harness({
    pagination: {
      total: "1",
      current_page: 1,
      total_pages: 1,
      next_page: "opaque-next-page",
    },
  });
  await syncExistingBdWeddingDateMetadata(h.call, "42", "");
  equal(h.writes.length, 1);
});

Deno.test("BD date shadow refuses non-first, contradictory and malformed pagination before writes", async () => {
  for (
    const pagination of [
      { current_page: 2 },
      { current_page: 0 },
      { current_page: null },
      { current_page: "unknown" },
      { total_pages: 2 },
      { total_pages: 0 },
      { total: false },
      { next_page: ["opaque"] },
      { next_page: "opaque" },
      {
        total: undefined,
        current_page: 1,
        total_pages: 1,
        next_page: "opaque",
      },
      { current_page: 1, total_pages: undefined, next_page: "opaque" },
    ]
  ) {
    const h = harness({ pagination });
    await rejects(
      () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
      "bd_date_meta_unbounded_response",
    );
    equal(h.writes, []);
  }
});

Deno.test("BD date shadow full 25-row response requires matching total and first-only-page proof", async () => {
  const rows = Array.from(
    { length: 25 },
    (_, index) => meta(String(701 + index), "2028-02-29"),
  );
  for (
    const pagination of [
      {},
      { total: undefined },
      { current_page: 1 },
      { total_pages: 1 },
      { total: undefined, current_page: 1, total_pages: 1 },
    ]
  ) {
    const h = harness({ rows, pagination });
    await rejects(
      () => syncExistingBdWeddingDateMetadata(h.call, "42", "2028-02-29"),
      "bd_date_meta_unbounded_response",
    );
    equal(h.writes, []);
  }
  const h = harness({
    rows,
    pagination: {
      total: "25",
      current_page: 1,
      total_pages: 1,
      next_page: "opaque",
    },
  });
  await syncExistingBdWeddingDateMetadata(h.call, "42", "2028-02-29");
  equal(h.writes, []);
});

Deno.test("BD date shadow accepts the live no-shadow zero-page envelope without creating metadata", async () => {
  // Exact successful list shape observed for the affected member, containing
  // no member identifiers, contact details, credentials or production rows.
  const h = harness({
    rows: [],
    pagination: {
      total: 0,
      current_page: 0,
      total_pages: 0,
      next_page: "",
      prev_page: "",
    },
  });
  await syncExistingBdWeddingDateMetadata(h.call, "42", "2028-02-29");
  equal(h.reads(), 1);
  equal(h.writes, []);
});

Deno.test("BD date shadow page zero still rejects rows, missing totals and inconsistent cursors", async () => {
  for (
    const options of [
      {
        rows: [meta()],
        pagination: {
          total: 1,
          current_page: 0,
          total_pages: 0,
          next_page: "",
        },
      },
      {
        rows: [],
        pagination: {
          total: undefined,
          current_page: 0,
          total_pages: 0,
          next_page: "",
        },
      },
      {
        rows: [],
        pagination: {
          total: 0,
          current_page: 0,
          total_pages: undefined,
          next_page: "",
        },
      },
      {
        rows: [],
        pagination: {
          total: 0,
          current_page: 0,
          total_pages: 1,
          next_page: "",
        },
      },
      {
        rows: [],
        pagination: {
          total: 0,
          current_page: 0,
          total_pages: 0,
          next_page: "opaque",
        },
      },
      {
        rows: [],
        pagination: {
          total: 0,
          current_page: 0,
          total_pages: 0,
          next_page: undefined,
        },
      },
    ]
  ) {
    const h = harness(options);
    await rejects(
      () => syncExistingBdWeddingDateMetadata(h.call, "42", ""),
      "bd_date_meta_unbounded_response",
    );
    equal(h.writes, []);
  }
});
