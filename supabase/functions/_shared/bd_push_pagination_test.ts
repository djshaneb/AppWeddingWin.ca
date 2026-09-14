import {
  type BdPushListModel,
  type BdPushListResponse,
  listBdRowsPaginated,
} from "./bd_push_pagination.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type FixturePage = {
  response: { ok: boolean; status: number };
  body: Record<string, unknown>;
};

function fixture(
  total: number,
  model: BdPushListModel = "chat_message_threads",
  finalCursor = true,
): FixturePage[] {
  const totalPages = Math.ceil(total / 100);
  const idField = model === "chat_message_threads" ? "thread_id" : "message_id";
  return Array.from({ length: totalPages || 1 }, (_, index) => ({
    response: { ok: true, status: 200 },
    body: {
      status: "success",
      current_page: total === 0 ? 0 : index + 1,
      total_pages: totalPages,
      total: String(total),
      message: Array.from({
        length: Math.min(100, Math.max(0, total - index * 100)),
      }, (_, row) => ({
        [idField]: String(index * 100 + row + 1),
        content: `Synthetic row ${index * 100 + row + 1}`,
      })),
      next_page: total && (index + 1 < totalPages || finalCursor)
        ? `opaque +/=${index + 2}&not-a-page-number`
        : "",
    },
  }));
}

function run(
  pages: Array<FixturePage | Error>,
  model: BdPushListModel = "chat_message_threads",
) {
  let calls = 0;
  const promise = listBdRowsPaginated(
    async (requestPath): Promise<BdPushListResponse> => {
      const url = new URL(requestPath, "https://offline.invalid");
      assert(
        url.pathname === `/api/v2/${model}/get`,
        "the requested collection must be unchanged",
      );
      assert(
        url.searchParams.get("limit") === "100",
        "bounded requested page size",
      );
      assert(
        url.searchParams.get("property") === "synthetic_filter",
        "caller filters must survive every page",
      );
      assert(
        url.searchParams.get("order_type") === "DESC",
        "caller ordering must survive every page",
      );
      if (calls === 0) {
        assert(!url.searchParams.has("page"), "must begin at the first page");
      } else {
        const previous = pages[calls - 1] as FixturePage;
        assert(
          url.searchParams.get("page") === previous.body.next_page,
          "server cursor must survive exactly without synthesis",
        );
      }
      const result = pages[calls++];
      if (result instanceof Error) throw result;
      assert(result, "must not fetch past the validated final page");
      return structuredClone(result);
    },
    model,
    { property: "synthetic_filter", order_type: "DESC" },
    {
      idField: model === "chat_message_threads" ? "thread_id" : "message_id",
    },
  );
  return { promise, calls: () => calls };
}

async function rejected(
  pages: Array<FixturePage | Error>,
  expected: RegExp,
  calls?: number,
) {
  const request = run(pages);
  let error: unknown;
  try {
    await request.promise;
  } catch (caught) {
    error = caught;
  }
  assert(
    error instanceof Error && expected.test(error.message),
    `must reject without returning partial rows: ${String(error)}`,
  );
  if (calls !== undefined) {
    assert(
      request.calls() === calls,
      `expected ${calls} dependency calls, got ${request.calls()}`,
    );
  }
}

for (
  const [model, total, pageCount] of [
    ["chat_message_threads", 1604, 17],
    ["chat_message_items", 1417, 15],
  ] as const
) {
  for (const finalCursor of [false, true]) {
    Deno.test(`push pagination returns complete ${model} ${total}/${pageCount}, final cursor ${finalCursor ? "present" : "absent"}`, async () => {
      const pages = fixture(total, model, finalCursor);
      const request = run(pages, model);
      const rows = await request.promise;
      assert(
        rows.length === total,
        "complete expected snapshot must be returned",
      );
      assert(
        request.calls() === pageCount,
        "no unnecessary request after a proven final page",
      );
      assert(
        JSON.stringify(rows) ===
          JSON.stringify(pages.flatMap((page) => page.body.message)),
        "row data and order must be preserved",
      );
    });
  }
}

Deno.test("push pagination accepts the documented zero-page empty collection", async () => {
  for (const nextPage of [undefined, null, ""]) {
    const pages = fixture(0);
    pages[0].body.next_page = nextPage;
    const request = run(pages);
    assert(
      (await request.promise).length === 0 && request.calls() === 1,
      "empty snapshot completes in one call",
    );
  }
});

Deno.test("push pagination rejects contradictory empty collection shapes", async () => {
  for (
    const patch of [
      { current_page: 1, total_pages: 1 },
      { next_page: "opaque-unexpected" },
      { message: [{ thread_id: "1" }] },
    ]
  ) {
    const pages = fixture(0);
    Object.assign(pages[0].body, patch);
    await rejected(pages, /inconsistent page metadata/, 1);
  }
});

Deno.test("push pagination requires explicit integer page and count metadata", async () => {
  for (const field of ["current_page", "total_pages", "total"]) {
    for (
      const value of [
        undefined,
        null,
        "",
        " ",
        "1.5",
        "1e2",
        -1,
        1.5,
        true,
        [],
        {},
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      const pages = fixture(205);
      pages[0].body[field] = value;
      await rejected(pages, /invalid page metadata/, 1);
    }
  }
});

Deno.test("push pagination rejects missing premature cursor", async () => {
  const pages = fixture(205);
  pages[1].body.next_page = "";
  await rejected(pages, /omitted next_page before its final page/, 2);
});

Deno.test("push pagination rejects repeated cursor before completion", async () => {
  const pages = fixture(205);
  pages[1].body.next_page = pages[0].body.next_page;
  await rejected(pages, /repeated a page cursor/, 2);
});

Deno.test("push pagination does not excuse a repeated cursor on a complete final page", async () => {
  const pages = fixture(205);
  pages[2].body.next_page = pages[1].body.next_page;
  await rejected(pages, /repeated a page cursor/, 3);
});

Deno.test("push pagination rejects malformed cursors even at the final page", async () => {
  for (
    const value of [true, false, {}, [], 0, -1, 1.5, " ", "x".repeat(16_385)]
  ) {
    const pages = fixture(1);
    pages[0].body.next_page = value;
    await rejected(pages, /invalid page metadata/, 1);
  }
});

Deno.test("push pagination rejects total changes while a snapshot is being read", async () => {
  const pages = fixture(205);
  pages[1].body.total = "206";
  await rejected(pages, /totals changed/, 2);
});

Deno.test("push pagination rejects page-total changes while a snapshot is being read", async () => {
  const pages = fixture(205);
  pages[1].body.total_pages = 4;
  await rejected(pages, /totals changed/, 2);
});

Deno.test("push pagination rejects missing, repeated, skipped and out-of-range page numbers", async () => {
  for (const [index, current] of [[0, 0], [0, 2], [1, 1], [1, 3], [2, 4]]) {
    const pages = fixture(205);
    pages[index].body.current_page = current;
    await rejected(pages, /inconsistent page metadata/, index + 1);
  }
});

Deno.test("push pagination rejects a premature final-page declaration", async () => {
  const pages = fixture(205);
  pages[0].body.total_pages = 1;
  await rejected(pages, /inconsistent page metadata/, 1);
});

Deno.test("push pagination rejects a final count mismatch with or without a phantom cursor", async () => {
  for (const finalCursor of [false, true]) {
    const pages = fixture(205, "chat_message_threads", finalCursor);
    (pages[2].body.message as unknown[]).pop();
    await rejected(pages, /row count did not match/, 3);
  }
});

Deno.test("push pagination rejects short or oversized intermediate pages", async () => {
  for (const oversize of [false, true]) {
    const pages = fixture(205);
    const rows = pages[1].body.message as unknown[];
    if (oversize) rows.push({ thread_id: "99999" });
    else rows.pop();
    await rejected(pages, /row count did not match/, 2);
  }
});

Deno.test("push pagination rejects duplicate stable IDs within or across pages", async () => {
  for (const acrossPages of [false, true]) {
    const pages = fixture(205);
    const rows = pages[acrossPages ? 1 : 0].body.message as Record<
      string,
      unknown
    >[];
    rows[1].thread_id = "1";
    await rejected(pages, /missing or repeated row IDs/, acrossPages ? 2 : 1);
  }
});

Deno.test("push pagination rejects missing or non-scalar row identity", async () => {
  for (
    const id of [
      undefined,
      null,
      "",
      " ",
      {},
      [],
      true,
      false,
      0,
      Number.MAX_SAFE_INTEGER + 1,
    ]
  ) {
    const pages = fixture(1);
    (pages[0].body.message as Record<string, unknown>[])[0].thread_id = id;
    await rejected(pages, /missing or repeated row IDs/, 1);
  }
});

Deno.test("push pagination treats numeric and string forms of the same ID as duplicates", async () => {
  const pages = fixture(2);
  (pages[0].body.message as Record<string, unknown>[])[1].thread_id = 1;
  await rejected(pages, /missing or repeated row IDs/, 1);
});

Deno.test("push pagination rejects malformed row containers instead of dropping records", async () => {
  for (const message of [null, {}, "", [null], [false], [[]], ["row"]]) {
    const pages = fixture(1);
    pages[0].body.message = message;
    await rejected(pages, /invalid rows/, 1);
  }
});

Deno.test("push pagination propagates HTTP, BD status and network dependency failures", async () => {
  const httpPages = fixture(205);
  httpPages[1].response = { ok: false, status: 503 };
  await rejected(httpPages, /page failed \(503\)/, 2);
  const statusPages = fixture(205);
  statusPages[1].body.status = "error";
  await rejected(statusPages, /page failed \(200\)/, 2);
  const networkPages: Array<FixturePage | Error> = fixture(205);
  networkPages[1] = new Error("Synthetic network failure");
  await rejected(networkPages, /Synthetic network failure/, 2);
});

Deno.test("push pagination supports exactly 250 complete pages but rejects larger snapshots", async () => {
  const request = run(fixture(25_000));
  assert(
    (await request.promise).length === 25_000 && request.calls() === 250,
    "the documented bound must remain usable",
  );
  await rejected(fixture(25_001), /safe pagination limit \(250 pages\)/, 1);
});

Deno.test("push pagination rejects a caller-supplied starting page or wrong model identity", async () => {
  let calls = 0;
  const caller = () => {
    calls += 1;
    return Promise.resolve(fixture(0)[0]);
  };
  for (
    const [params, idField] of [
      [{ page: "opaque-start" }, "thread_id"],
      [{}, "message_id"],
    ] as const
  ) {
    let rejected = false;
    try {
      await listBdRowsPaginated(caller, "chat_message_threads", params, {
        idField,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "invalid caller scope must reject");
  }
  assert(calls === 0, "invalid request must not reach the dependency");
});
