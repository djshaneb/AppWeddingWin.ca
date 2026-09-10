import {
  loadQrContactProfile,
  qrContactDirectEmail,
  QrContactError,
  qrContactProfileFromRow,
  qrContactUser,
  qrContactWeddingDate,
  qrContactWeddingVenue,
  saveQrContactProfile,
  syncQrContactWeddingDate,
  validateQrContactSave,
} from "./qr_bingo_contacts.ts";
import {
  adminCsvCell,
  handleQrAdminData,
  parseQrAdminDataRequest,
  QrAdminDataError,
} from "./qr_bingo_admin_data.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const equal = (a: unknown, b: unknown) =>
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${JSON.stringify(a)} != ${JSON.stringify(b)}`,
  );
async function rejects(fn: () => unknown | Promise<unknown>, status: number) {
  try {
    await fn();
  } catch (e) {
    assert(e instanceof QrContactError || e instanceof QrAdminDataError);
    equal(e.status, status);
    return;
  }
  throw new Error("Expected rejection");
}
Deno.test("combined partners first names remain intact through validation and persisted profile loading", () => {
  for (const name of ["Alex & Jamie", "Sam and Jo", "Renée & María-José"]) {
    const stored = { ...row(), name };
    const current = qrContactProfileFromRow(
      "offline-event",
      "701",
      stored,
      user,
    );
    assert(current.complete);
    equal(current.name, name);
    const validated = validateQrContactSave({
      name,
      email: stored.email,
      phone: stored.phone,
      expected_version: 1,
    }, current);
    equal(validated.name, name);
    const contactUser = qrContactUser(user, current);
    equal(
      [contactUser.first_name, contactUser.last_name].filter(Boolean).join(" "),
      name,
    );
    equal(user.first_name, "Test");
  }
});

const user = {
  user_id: "701",
  subscription_id: "18",
  active: "2",
  email: "login@privaterelay.appleid.com",
  first_name: "Test",
  last_name: "Couple",
  phone_number: "555-010-7001",
  wedding_date: "2027-10-18",
  token: "offline-session-token",
};
const row = () => ({
  event_key: "offline-event",
  couple_bd_user_id: "701",
  name: "QR Couple",
  email: "qr@example.test",
  phone: "555-010-7001",
  wedding_date: "2028-02-29",
  version: 1,
  updated_at: "2026-09-07T00:00:00Z",
  date_sync_pending: false,
});
function mockDb(initial: Record<string, unknown> | null = row()) {
  let current = initial;
  const calls: {
    table: string;
    update?: unknown;
    filters: Record<string, unknown>;
  }[] = [];
  const rpcCalls: unknown[] = [];
  let error: Record<string, unknown> | null = null;
  let rpcResult: unknown = { ok: true };
  let rpcError: unknown = null;
  const db = {
    from(table: string) {
      const operation: {
        table: string;
        update?: Record<string, unknown>;
        filters: Record<string, unknown>;
      } = { table, filters: {} };
      calls.push(operation);
      const result = () => {
        if (
          operation.update && current &&
          Object.entries(operation.filters).every(([k, v]) => current![k] === v)
        ) current = { ...current, ...operation.update };
        return { data: current, error };
      };
      const chain = {
        select() {
          return chain;
        },
        eq(k: string, v: unknown) {
          operation.filters[k] = v;
          return chain;
        },
        update(values: Record<string, unknown>) {
          operation.update = values;
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(result());
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return chain;
    },
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rpcResult, error: rpcError });
    },
  };
  return {
    db,
    calls,
    rpcCalls,
    get: () => current,
    set: (r: Record<string, unknown> | null) => {
      current = r;
    },
    setError: (e: Record<string, unknown>) => {
      error = e;
    },
    setRpc: (data: unknown, e: unknown = null) => {
      rpcResult = data;
      rpcError = e;
    },
  };
}
Deno.test("QR contact prefill never accepts relay login email or silently marks unsaved complete", () => {
  const profile = qrContactProfileFromRow("offline-event", "701", null, user);
  equal(profile.email, "");
  assert(!profile.complete);
  assert(profile.missing_fields.includes("email"));
  equal(profile.version, 0);
  const filled = qrContactProfileFromRow("offline-event", "701", null, {
    ...user,
    email: "direct@example.test",
  });
  assert(!filled.complete);
  equal(filled.missing_fields, ["contact details"]);
});
Deno.test("saved QR contact completeness ignores pending account email confirmation", () => {
  const p = qrContactProfileFromRow("offline-event", "701", row(), {
    ...user,
    email_confirmation_required: true,
    pending_email: "pending@example.test",
  });
  assert(p.complete);
  equal(p.email, "qr@example.test");
});
Deno.test("venue is optional, defaults empty on old responses, and never prefills a guessed BD venue", () => {
  equal(
    qrContactProfileFromRow("offline-event", "701", row(), user).wedding_venue,
    "",
  );
  equal(
    qrContactProfileFromRow("offline-event", "701", null, {
      ...user,
      wedding_venue: "Unrelated login field",
    }).wedding_venue,
    "",
  );
  assert(qrContactProfileFromRow("offline-event", "701", row(), user).complete);
});
Deno.test("venue accepts 200 characters and rejects markup, controls, oversized or non-string values", async () => {
  equal(qrContactWeddingVenue("  Americana  Resort  "), "Americana Resort");
  equal(qrContactWeddingVenue("a".repeat(200)), "a".repeat(200));
  for (const value of ["a".repeat(201), "<b>Venue</b>", "Hall\nA", null, 42]) {
    await rejects(() => qrContactWeddingVenue(value), 400);
  }
});
Deno.test("date clear clears venue; old-client omission preserves venue while a date remains", () => {
  const profile = qrContactProfileFromRow("offline-event", "701", {
    ...row(),
    wedding_venue: "Americana Resort",
  }, user);
  const input = {
    name: "Couple Name",
    email: "qr@example.test",
    phone: "5550107001",
    expected_version: 1,
  };
  equal(
    validateQrContactSave(input, profile).wedding_venue,
    "Americana Resort",
  );
  equal(
    validateQrContactSave({ ...input, wedding_date: "2029-03-10" }, profile)
      .wedding_venue,
    "Americana Resort",
  );
  equal(
    validateQrContactSave({ ...input, wedding_venue: "" }, profile)
      .wedding_venue,
    "",
  );
  equal(
    validateQrContactSave({
      ...input,
      wedding_date: "",
      wedding_venue: "Previous venue",
    }, profile).wedding_venue,
    "",
  );
  equal(
    qrContactProfileFromRow("offline-event", "701", {
      ...row(),
      wedding_date: "",
      wedding_venue: "Stale venue",
    }, user).wedding_venue,
    "",
  );
});
Deno.test("venue appears only in QR operational contact object and admin contact or entry columns", async () => {
  const profile = qrContactProfileFromRow("offline-event", "701", {
    ...row(),
    wedding_venue: "Venue & Hall",
  }, user);
  equal(qrContactUser(user, profile).wedding_venue, "Venue & Hall");
  const mock = adminDb({
    total: 1,
    rows: [{
      couple_id: "701",
      wedding_venue: "=Bad formula",
      version: 1,
      source: "couple",
      removed: false,
    }],
  });
  const output = await handleQrAdminData(mock.db, {
    action: "data_export",
    dataset: "contacts",
    event_key: "offline-event",
    operator_identity: "Offline Operator",
  });
  assert("report" in output);
  assert(output.report.csv.includes("Wedding venue"));
  assert(output.report.csv.includes("'=Bad formula"));
  const source = Deno.readTextFileSync(
    new URL("./qr_bingo_contacts.ts", import.meta.url),
  );
  assert(
    !source.slice(
      source.indexOf("export async function syncQrContactWeddingDate"),
    ).includes("wedding_venue"),
  );
});
Deno.test("contact email validation rejects malformed, relay and multiple recipients as structured 400", async () => {
  for (
    const value of [
      "broken",
      "a@example.test,b@example.test",
      "a@example.test\nb@example.test",
      "relay@privaterelay.appleid.com",
      42,
    ]
  ) await rejects(() => qrContactDirectEmail(value), 400);
  equal(qrContactDirectEmail(" Mixed@Example.test "), "mixed@example.test");
});
Deno.test("long valid contact email is retained, not truncated", () => {
  const value = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) +
    ".test";
  equal(qrContactDirectEmail(value), value);
});
Deno.test("QR wedding date uses real ISO calendar dates and supports explicit clear", async () => {
  equal(qrContactWeddingDate("2028-02-29"), "2028-02-29");
  equal(qrContactWeddingDate(""), "");
  for (
    const value of [
      "2027-02-29",
      "2028-13-01",
      "18/10/2027",
      "0000-00-00",
      null,
    ]
  ) await rejects(() => qrContactWeddingDate(value), 400);
});
Deno.test("save contract uses CAS and separates omitted date from explicit clear", async () => {
  const current = qrContactProfileFromRow("offline-event", "701", row(), user);
  const input = {
    name: "Saved Couple",
    email: "saved@example.test",
    phone: "5550107001",
    expected_version: 1,
  };
  const omitted = validateQrContactSave(input, current);
  equal(omitted.wedding_date, current.wedding_date);
  assert(!omitted.sync_date);
  const cleared = validateQrContactSave(
    { ...input, wedding_date: "" },
    current,
  );
  equal(cleared.wedding_date, "");
  assert(cleared.sync_date);
  await rejects(
    () =>
      validateQrContactSave({ ...input, expected_version: undefined }, current),
    409,
  );
  await rejects(
    () => validateQrContactSave({ ...input, couple_id: "999" }, current),
    400,
  );
});
Deno.test("draw contact replacement preserves authenticated identity and login object unchanged", () => {
  const profile = qrContactProfileFromRow("offline-event", "701", row(), user);
  const drawUser = qrContactUser(user, profile);
  equal(drawUser.user_id, user.user_id);
  equal(drawUser.token, user.token);
  equal(drawUser.email, profile.email);
  equal(user.email, "login@privaterelay.appleid.com");
});
Deno.test("profile database reads enforce exact event/couple/version and fail closed", async () => {
  for (
    const invalid of [{ ...row(), event_key: "wrong-event" }, {
      ...row(),
      couple_bd_user_id: "999",
    }, { ...row(), version: 0 }]
  ) {
    await rejects(
      () =>
        loadQrContactProfile(mockDb(invalid).db, "offline-event", "701", user),
      503,
    );
  }
  const mock = mockDb();
  mock.setError({ code: "offline" });
  await rejects(
    () => loadQrContactProfile(mock.db, "offline-event", "701", user),
    503,
  );
});
Deno.test("save RPC binds authenticated member/event and supplies only validated contact fields", async () => {
  const mock = mockDb();
  await saveQrContactProfile(mock.db, "offline-event", "701", user, {
    name: "New Name",
    email: "new@example.test",
    phone: "5550107001",
    wedding_date: "",
    expected_version: 1,
  });
  equal(mock.rpcCalls, [{
    name: "save_qr_bingo_contact_profile_with_venue",
    args: {
      p_event_key: "offline-event",
      p_couple_id: "701",
      p_expected_version: 1,
      p_name: "New Name",
      p_email: "new@example.test",
      p_phone: "5550107001",
      p_wedding_date: "",
      p_sync_date: true,
      p_wedding_venue: "",
    },
  }]);
});
Deno.test("CAS and duplicate identity errors report conflict; DB outage reports retriable 503", async () => {
  const input = {
    name: "New Name",
    email: "new@example.test",
    phone: "5550107001",
    expected_version: 1,
  };
  for (
    const [result, error, status] of [[{ ok: false }, null, 409], [null, {
      code: "23505",
    }, 409], [null, { code: "XX000" }, 503]] as const
  ) {
    const mock = mockDb();
    mock.setRpc(result, error);
    await rejects(
      () => saveQrContactProfile(mock.db, "offline-event", "701", user, input),
      status,
    );
  }
});
Deno.test("date synchronization writes only canonical BD date and clear directive", async () => {
  const mock = mockDb({ ...row(), wedding_date: "", date_sync_pending: true });
  const calls: Record<string, string>[] = [];
  const result = await syncQrContactWeddingDate(
    mock.db,
    qrContactProfileFromRow("offline-event", "701", mock.get(), user),
    user,
    {
      callBd: async (path, init) => {
        if (path.startsWith("/api/v2/users_meta/get?")) {
          return {
            response: { ok: true },
            body: { status: "success", message: [] },
          };
        }
        equal(path, "/api/v2/user/update");
        calls.push(Object.fromEntries(new URLSearchParams(String(init.body))));
        return { response: { ok: true }, body: { status: "success" } };
      },
      fetchUser: async () => ({ user_id: "701", wedding_date: null }),
    },
  );
  equal(calls, [{
    user_id: "701",
    wedding_date: "",
    __clear_fields: "wedding_date",
  }]);
  assert(!result.date_sync_pending);
  equal(user.email, "login@privaterelay.appleid.com");
});
Deno.test("date synchronization does not mark readback mismatch successful", async () => {
  const mock = mockDb({ ...row(), date_sync_pending: true });
  await rejects(
    () =>
      syncQrContactWeddingDate(
        mock.db,
        qrContactProfileFromRow("offline-event", "701", mock.get(), user),
        user,
        {
          callBd: async () => ({
            response: { ok: true },
            body: { status: "success", message: [] },
          }),
          fetchUser: async () => ({
            user_id: "701",
            wedding_date: "2020-01-01",
          }),
        },
      ),
    503,
  );
  assert(mock.get()?.date_sync_pending);
});
Deno.test("date sync diagnostics identify provider rejection without exposing raw provider messages", async () => {
  const mock = mockDb({ ...row(), date_sync_pending: true });
  try {
    await syncQrContactWeddingDate(
      mock.db,
      qrContactProfileFromRow("offline-event", "701", mock.get(), user),
      user,
      {
        callBd: async () => ({
          response: { ok: false, status: 403 },
          body: { status: "error", message: "private provider details" },
        }),
        fetchUser: async () => undefined,
      },
    );
    throw new Error("Expected pending sync");
  } catch (error) {
    assert(error instanceof QrContactError);
    equal(error.diagnostic, "bd_update_http_403");
    assert(!error.message.includes("private provider"));
  }
});
Deno.test("older date sync repairs a newer version even if newer version already cleared its flag", async () => {
  const mock = mockDb({ ...row(), date_sync_pending: true });
  let calls = 0;
  let bdDate = "";
  const result = await syncQrContactWeddingDate(
    mock.db,
    qrContactProfileFromRow("offline-event", "701", mock.get(), user),
    user,
    {
      callBd: async (_path, init) => {
        if (_path.startsWith("/api/v2/users_meta/get?")) {
          return {
            response: { ok: true },
            body: { status: "success", message: [] },
          };
        }
        calls++;
        bdDate = new URLSearchParams(String(init.body)).get("wedding_date")!;
        if (calls === 1) {
          mock.set({
            ...row(),
            version: 2,
            wedding_date: "2029-03-01",
            date_sync_pending: false,
          });
        }
        return { response: { ok: true }, body: { status: "success" } };
      },
      fetchUser: async () => ({ user_id: "701", wedding_date: bdDate }),
    },
  );
  equal(calls, 2);
  equal(bdDate, "2029-03-01");
  equal(result.version, 2);
  assert(!result.date_sync_pending);
});
Deno.test("admin filters and CSV cells reject bad scope and neutralize spreadsheet formulas", async () => {
  for (
    const fields of [{ event_key: "../private" }, { vendor_id: "0 or 1=1" }, {
      page_size: 101,
    }, { search: "<script>" }]
  ) {
    await rejects(() =>
      parseQrAdminDataRequest({
        dataset: "contacts",
        event_key: "offline-event",
        ...fields,
      }), 400);
  }
  equal(adminCsvCell(' =HYPERLINK("evil")'), '"\' =HYPERLINK(""evil"")"');
  equal(adminCsvCell("a,b"), '"a,b"');
});
function adminDb(data: unknown, auditError: unknown = null) {
  const audits: unknown[] = [];
  const rpc: unknown[] = [];
  return {
    audits,
    rpc,
    db: {
      rpc(name: string, args: unknown) {
        rpc.push({ name, args });
        return Promise.resolve({ data, error: null });
      },
      from() {
        const chain = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          gte() {
            return Promise.resolve({ count: 0, error: null });
          },
          insert(row: unknown) {
            audits.push(row);
            return Promise.resolve({ error: auditError });
          },
        };
        return chain;
      },
    },
  };
}
Deno.test("admin list uses bounded paging and strips non-allowlisted data", async () => {
  const mock = adminDb({
    total: 101,
    rows: [{
      couple_id: "701",
      name: "Couple",
      email: "qr@example.test",
      private_token: "never-export",
      version: 1,
      source: "couple",
      removed: false,
    }],
  });
  const result = await handleQrAdminData(mock.db, {
    action: "data_list",
    dataset: "contacts",
    event_key: "offline-event",
    page: 2,
    page_size: 50,
  });
  assert("rows" in result);
  assert(!JSON.stringify(result).includes("private_token"));
  assert(result.has_more);
  equal(mock.audits.length, 0);
  equal((mock.rpc[0] as { args: unknown }).args, {
    p_event_key: "offline-event",
    p_vendor_id: "",
    p_search: "",
    p_offset: 50,
    p_limit: 50,
    p_contact_status: "active",
  });
});
Deno.test("admin exports require operator, audit before output, and reject partial/oversized CSV", async () => {
  const body = {
    action: "data_export",
    dataset: "contacts",
    event_key: "offline-event",
    operator_identity: "Offline Operator",
  };
  const mock = adminDb({
    total: 1,
    rows: [{
      name: "=FORMULA()",
      email: "qr@example.test",
      version: 1,
      source: "couple",
      removed: false,
    }],
  });
  const result = await handleQrAdminData(mock.db, body);
  assert("report" in result);
  assert(result.report.csv.includes("'=FORMULA()"));
  equal(mock.audits.length, 1);
  await rejects(
    () =>
      handleQrAdminData(adminDb({ total: 0, rows: [] }).db, {
        ...body,
        operator_identity: "",
      }),
    400,
  );
  await rejects(
    () => handleQrAdminData(adminDb({ total: 5001, rows: [] }).db, body),
    413,
  );
  await rejects(
    () => handleQrAdminData(adminDb({ total: 1, rows: [] }).db, body),
    413,
  );
  await rejects(
    () =>
      handleQrAdminData(
        adminDb({ total: 0, rows: [] }, { code: "offline" }).db,
        body,
      ),
    503,
  );
});
Deno.test("only signed website scan export path may submit metadata-only local audit", async () => {
  const mock = adminDb(null);
  equal(
    await handleQrAdminData(mock.db, {
      action: "data_export_audit",
      dataset: "scans",
      event_key: "offline-event",
      row_count: 2,
      operator_identity: "Offline Operator",
    }),
    { ok: true },
  );
  equal(mock.rpc.length, 0);
  equal(mock.audits.length, 1);
  await rejects(
    () =>
      handleQrAdminData(mock.db, {
        action: "data_export_audit",
        dataset: "contacts",
        event_key: "offline-event",
        row_count: 2,
        operator_identity: "Offline Operator",
      }),
    400,
  );
});
Deno.test("endpoint ordering authenticates data exports and returns contact actions before website fetch", () => {
  const admin = Deno.readTextFileSync(
    new URL("../bd-qr-bingo-admin/index.ts", import.meta.url),
  );
  assert(
    admin.indexOf("await requireSignedAdminRequest(") <
      admin.indexOf("await handleQrAdminData("),
  );
  for (const name of ["bd-qr-bingo-sync", "bd-qr-bingo-vendor-sync"]) {
    const source = Deno.readTextFileSync(
      new URL(`../${name}/index.ts`, import.meta.url),
    );
    const handler = source.slice(
      source.indexOf("const isContactProfileAction"),
    );
    assert(
      handler.indexOf("if (isContactProfileAction)") <
        handler.indexOf("await getQrPage("),
    );
    assert(!handler.includes("loadMemberEmailVerification"));
    assert(
      handler.includes("qrContactUser(user, bingoContactProfile!") ||
        handler.includes("qrContactUser(user,bingoContactProfile!"),
    );
  }
});
