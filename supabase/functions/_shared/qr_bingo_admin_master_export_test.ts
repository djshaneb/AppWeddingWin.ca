import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleQrAdminMasterExport,
  MASTER_CONTACT_COLUMNS,
  QrAdminMasterExportError,
} from "./qr_bingo_admin_master_export.ts";

const requestId = "00000000-0000-4000-8000-000000000001";
const exportId = "00000000-0000-4000-8000-000000000002";
const generated = "2026-09-14T16:00:00.123456+00:00";
const start = {
  action: "master_contacts_export_start",
  dataset: "master_contacts",
  operator_identity: "Offline Admin",
  request_id: requestId,
};
const started = {
  ok: true,
  export_id: exportId,
  request_id: requestId,
  total: 1,
  page_size: 250,
  generated_at: generated,
  expires_at: "2026-09-14T16:15:00.123456+00:00",
};
const page = {
  action: "master_contacts_export_page",
  dataset: "master_contacts",
  operator_identity: "Offline Admin",
  export_id: exportId,
  cursor: 0,
};
const finish = {
  action: "master_contacts_export_complete",
  dataset: "master_contacts",
  operator_identity: "Offline Admin",
  export_id: exportId,
  expected_row_count: 1,
};
const person = {
  couple_id: "123456789012345678",
  name: 'Alex, "Jamie"',
  email: "alex@example.test",
  phone: "00123456789",
  wedding_date: "2027-01-01",
  wedding_venue: "Place\nSecond line",
  first_accepted_at: generated,
  last_accepted_at: generated,
  event_keys: "event-one; event-two",
  rules_versions: "rules-one",
  evidence_bases: "explicit_notice",
};
const paged = {
  ok: true,
  export_id: exportId,
  total: 1,
  cursor: 0,
  row_count: 1,
  next_cursor: null,
  done: true,
  rows: [person],
};
function mock(data: unknown, error: unknown = null) {
  const calls: unknown[] = [];
  return {
    calls,
    admin: {
      rpc: (name: string, body: Record<string, unknown>) => {
        calls.push({ name, body });
        return Promise.resolve({ data, error });
      },
    },
  };
}

Deno.test("master start returns only the fixed CSV contract and uses an unfiltered server snapshot", async () => {
  const db = mock({ ...started, private_payload: "never return" });
  const value = await handleQrAdminMasterExport(db.admin, start);
  assertEquals(db.calls, [{
    name: "qr_bingo_master_contacts_export",
    body: {
      p_action: "start",
      p_operator_identity: "Offline Admin",
      p_request_id: requestId,
    },
  }]);
  assertEquals(value, {
    ok: true,
    action: start.action,
    dataset: "master_contacts",
    export_id: exportId,
    request_id: requestId,
    total: 1,
    columns: MASTER_CONTACT_COLUMNS,
    generated_at: generated,
    expires_at: started.expires_at,
    page_size: 250,
    csv_header: "\ufeff" + MASTER_CONTACT_COLUMNS.map((c) =>
      `"${c.label}"`
    ).join(",") + "\r\n",
  });
});

Deno.test("master request rejects filters, authority injection, unsafe names, malformed cursors and missing fields before RPC", async () => {
  const bad: Record<string, unknown>[] = [
    { ...start, event_key: "event-one" },
    { ...start, search: "Alex" },
    { ...start, vendor_id: "900" },
    { ...start, contact_status: "active" },
    { ...start, verified_admin: true },
    { ...start, dataset: "contacts" },
    { ...start, action: "master_contacts_export_delete" },
    { ...start, request_id: "wrong" },
    { ...start, operator_identity: "ab" },
    { ...start, operator_identity: " Admin " },
    { ...start, operator_identity: "<script>" },
    { ...start, operator_identity: "Admin\nName" },
    { ...page, cursor: "0" },
    { ...page, cursor: 1 },
    { ...page, cursor: -250 },
    { ...page, cursor: 2 ** 53 },
    { ...finish, expected_row_count: -1 },
    { ...finish, expected_row_count: "1" },
  ];
  for (const key of Object.keys(start)) {
    const body: Record<string, unknown> = { ...start };
    delete body[key];
    bad.push(body);
  }
  const db = mock(started);
  for (const body of bad) {
    await assertRejects(
      () => handleQrAdminMasterExport(db.admin, body),
      QrAdminMasterExportError,
    );
  }
  assertEquals(db.calls, []);
});

Deno.test("CSV preserves commas, quotes, multiline cells and contact identifiers without spreadsheet formulas", async () => {
  const value = await handleQrAdminMasterExport(mock(paged).admin, page);
  if (!("csv_chunk" in value)) throw new Error("Expected a CSV page");
  assertEquals(
    value.csv_chunk,
    `"'123456789012345678","Alex, ""Jamie""","alex@example.test","'00123456789","2027-01-01","Place\nSecond line","${generated}","${generated}","event-one; event-two","rules-one","explicit_notice"\r\n`,
  );
  assertEquals("rows" in value, false);
  for (
    const name of [
      "=HYPERLINK(1)",
      "+SUM(1)",
      "@IMPORT(1)",
      "-1+2",
      " \t=NOW()",
    ]
  ) {
    const got = await handleQrAdminMasterExport(
      mock({ ...paged, rows: [{ ...person, name }] }).admin,
      page,
    );
    if (!("csv_chunk" in got)) throw new Error("Expected a CSV page");
    assertStringIncludes(String(got.csv_chunk), `,"'${name}",`);
  }
});

Deno.test("all known lifecycle failures retain useful status while raw DB errors stay private", async () => {
  for (
    const [code, status] of [
      ["export_expired", 410],
      ["export_page_gap", 409],
      ["export_incomplete", 409],
      ["export_rate_limited", 429],
    ] as const
  ) {
    const error = await assertRejects(
      () => handleQrAdminMasterExport(mock({ ok: false, code }).admin, page),
      QrAdminMasterExportError,
    );
    assertEquals(error.status, status);
    assertEquals(error.code, code);
  }
  const db = mock(null, { message: "private table/account dump" });
  const error = await assertRejects(
    () => handleQrAdminMasterExport(db.admin, start),
    QrAdminMasterExportError,
  );
  assertEquals(error.status, 503);
  assertEquals(error.message.includes("private table"), false);
});

Deno.test("invalid snapshot headers cannot begin a file", async () => {
  const bad = [
    null,
    {},
    { ...started, ok: "true" },
    { ...started, total: "1" },
    { ...started, total: -1 },
    { ...started, request_id: exportId },
    { ...started, export_id: "other" },
    { ...started, page_size: 5000 },
    { ...started, generated_at: "now" },
    { ...started, expires_at: generated },
    { ...started, expires_at: "2027-01-01T00:00:00Z" },
  ];
  for (const value of bad) {
    await assertRejects(
      () => handleQrAdminMasterExport(mock(value).admin, start),
      QrAdminMasterExportError,
    );
  }
});

Deno.test("foreign, missing, contradictory and duplicate rows cannot produce partial CSV chunks", async () => {
  const bad = [
    { ...paged, export_id: requestId },
    { ...paged, cursor: 250 },
    { ...paged, row_count: "1" },
    { ...paged, row_count: 0 },
    { ...paged, total: 2 },
    { ...paged, done: false },
    { ...paged, next_cursor: 1 },
    { ...paged, rows: [] },
    { ...paged, total: 2, row_count: 2, rows: [person, person] },
    { ...paged, rows: [{ ...person, phone: 12345 }] },
    { ...paged, rows: [{ ...person, couple_id: "0" }] },
    { ...paged, rows: [{ ...person, last_accepted_at: null }] },
  ];
  for (const value of bad) {
    await assertRejects(
      () => handleQrAdminMasterExport(mock(value).admin, page),
      QrAdminMasterExportError,
    );
  }
});

Deno.test("a complete 250-row middle page and a zero-row export retain contiguous cursor semantics", async () => {
  const rows = Array.from(
    { length: 250 },
    (_, i) => ({ ...person, couple_id: String(1000 + i) }),
  );
  const full = await handleQrAdminMasterExport(
    mock({
      ...paged,
      total: 5001,
      rows,
      row_count: 250,
      done: false,
      next_cursor: 250,
    }).admin,
    page,
  );
  if (!("next_cursor" in full)) throw new Error("Expected a CSV page");
  assertEquals(full.total, 5001);
  assertEquals(full.next_cursor, 250);
  assertEquals(full.done, false);
  const empty = await handleQrAdminMasterExport(
    mock({ ...paged, total: 0, rows: [], row_count: 0 }).admin,
    page,
  );
  if (!("csv_chunk" in empty)) throw new Error("Expected a CSV page");
  assertEquals(empty.csv_chunk, "");
  assertEquals(empty.done, true);
});

Deno.test("only an audited complete response matching the full count can release filename metadata", async () => {
  const completed = {
    ok: true,
    export_id: exportId,
    total: 1,
    generated_at: generated,
  };
  const db = mock(completed);
  const value = await handleQrAdminMasterExport(db.admin, finish);
  if (!("report" in value)) throw new Error("Expected completion metadata");
  assertEquals(value.report, {
    filename: "weddingwin-all-qr-bingo-couples-2026-09-14.csv",
    mime_type: "text/csv;charset=utf-8",
    row_count: 1,
    generated_at: generated,
  });
  assertEquals(db.calls, [{
    name: "qr_bingo_master_contacts_export",
    body: {
      p_action: "complete",
      p_operator_identity: "Offline Admin",
      p_export_id: exportId,
      p_expected_row_count: 1,
    },
  }]);
  for (
    const bad of [{ ...completed, total: 0 }, {
      ...completed,
      export_id: requestId,
    }, { ...completed, generated_at: "bad" }]
  ) {
    await assertRejects(
      () => handleQrAdminMasterExport(mock(bad).admin, finish),
      QrAdminMasterExportError,
    );
  }
});
