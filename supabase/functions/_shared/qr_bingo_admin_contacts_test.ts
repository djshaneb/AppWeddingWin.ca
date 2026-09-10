import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleQrAdminContactMutation,
  parseQrAdminContactMutation,
  QrAdminContactError,
} from "./qr_bingo_admin_contacts.ts";
import {
  handleQrAdminData,
  parseQrAdminDataRequest,
  QrAdminDataError,
} from "./qr_bingo_admin_data.ts";

const add = {
  action: "contact_add",
  dataset: "contacts",
  event_key: "offline-admin-test",
  couple_id: "701",
  expected_version: 0,
  request_id: "00000000-0000-4000-8000-000000000001",
  operator_identity: "Offline Admin",
  name: "Alex & Jamie",
  email: "Alex@example.test",
  phone: "555-010-7001",
  wedding_date: "2028-02-29",
  wedding_venue: "Test Venue",
  verified_couple: { id: "701", subscription_id: "18", active: "2" },
};
const remove = {
  action: "contact_remove",
  dataset: "contacts",
  event_key: add.event_key,
  couple_id: "701",
  expected_version: 3,
  request_id: "00000000-0000-4000-8000-000000000002",
  operator_identity: "Offline Admin",
};
function mutationDb(result: unknown, error: unknown = null) {
  const calls: unknown[] = [];
  return {
    calls,
    db: {
      rpc(name: string, args: unknown) {
        calls.push({ name, args });
        return { data: result, error };
      },
    },
  };
}
const success = (
  body: typeof add | typeof remove,
  extra: Record<string, unknown> = {},
) => ({
  ok: true,
  action: body.action,
  dataset: "contacts",
  event_key: body.event_key,
  couple_id: body.couple_id,
  request_id: body.request_id,
  version: body.expected_version + 1,
  removed: body.action === "contact_remove",
  replayed: false,
  ...extra,
});

Deno.test("admin contact Add validates flat fields, exact genuine member proof and normalized contact", () => {
  const parsed = parseQrAdminContactMutation(add);
  assertEquals(parsed.email, "alex@example.test");
  assertEquals(parsed.name, "Alex & Jamie");
  assertEquals(parsed.verified_couple, add.verified_couple);
  const minimal = parseQrAdminContactMutation({
    ...add,
    wedding_date: "",
    wedding_venue: "",
  });
  assertEquals(minimal.wedding_date, "");
});
Deno.test("admin contact Add rejects blog, inactive, mismatched, missing and injected proof", () => {
  for (
    const proof of [
      null,
      undefined,
      {},
      { ...add.verified_couple, subscription_id: "4" },
      { ...add.verified_couple, active: "1" },
      { ...add.verified_couple, id: "702" },
      { ...add.verified_couple, admin: true },
    ]
  ) {
    assertThrows(
      () => parseQrAdminContactMutation({ ...add, verified_couple: proof }),
      QrAdminContactError,
    );
  }
});
Deno.test("contact mutation rejects extra fields, other datasets, scope tricks and stale tokens", () => {
  for (
    const extra of [
      { dataset: "entries" },
      { couple_id: "701 OR true" },
      { event_key: "../private" },
      { expected_version: "0" },
      { expected_version: -1 },
      { request_id: "bad" },
      { consent: true },
      { contact: {} },
      { operator_identity: "<admin>" },
    ]
  ) {
    assertThrows(
      () => parseQrAdminContactMutation({ ...add, ...extra }),
      QrAdminContactError,
    );
  }
  assertThrows(
    () => parseQrAdminContactMutation({ ...remove, expected_version: 0 }),
    QrAdminContactError,
  );
});
Deno.test("contact fields reject relay, invalid dates, HTML/control, overlimits and venue without date", () => {
  for (
    const extra of [
      { email: "hidden@privaterelay.appleid.com" },
      { email: "x@example.test,other@example.test" },
      { name: "WeddingWin Couple" },
      { name: "<b>Alex</b>" },
      { name: "x".repeat(161) },
      { phone: "123" },
      { phone: "1".repeat(81) },
      { phone: "555\n0101234" },
      { wedding_date: "2027-02-29" },
      { wedding_date: "1899-12-31" },
      { wedding_date: "", wedding_venue: "Venue" },
      { wedding_venue: "x".repeat(201) },
    ]
  ) {
    assertThrows(
      () => parseQrAdminContactMutation({ ...add, ...extra }),
      QrAdminContactError,
    );
  }
});
Deno.test("remove/restore require only existing profile identity and reject contact or member proof changes", () => {
  assertEquals(parseQrAdminContactMutation(remove).verified_couple, null);
  assertEquals(
    parseQrAdminContactMutation({ ...remove, action: "contact_restore" })
      .action,
    "contact_restore",
  );
  for (
    const extra of [{ email: "edit@example.test" }, {
      verified_couple: add.verified_couple,
    }, { name: "New name" }]
  ) {
    assertThrows(
      () => parseQrAdminContactMutation({ ...remove, ...extra }),
      QrAdminContactError,
    );
  }
});
Deno.test("handler makes exactly one scoped audited RPC, never normal save or entry operations", async () => {
  const mock = mutationDb(success(add));
  const result = await handleQrAdminContactMutation(mock.db, add);
  assertEquals(result.request_id, add.request_id);
  assertEquals(mock.calls.length, 1);
  const call = mock.calls[0] as { name: string; args: Record<string, unknown> };
  assertEquals(call.name, "manage_qr_bingo_admin_contact");
  assertEquals(call.args.p_verified_couple, add.verified_couple);
  assertEquals(call.args.p_contact, {
    name: add.name,
    email: "alex@example.test",
    phone: add.phone,
    wedding_date: add.wedding_date,
    wedding_venue: add.wedding_venue,
  });
});
Deno.test("invalid mutation never reaches database; replay success preserves original metadata", async () => {
  const mock = mutationDb(success(remove, { replayed: true }));
  await assertRejects(
    () => handleQrAdminContactMutation(mock.db, { ...remove, name: "sneaky" }),
    QrAdminContactError,
  );
  assertEquals(mock.calls.length, 0);
  assertEquals(
    (await handleQrAdminContactMutation(mock.db, remove)).replayed,
    true,
  );
});
Deno.test("handler preserves meaningful conflict/not-found responses and hides backend errors", async () => {
  for (
    const [code, status] of [
      ["contact_exists", 409],
      ["contact_removed", 409],
      ["contact_conflict", 409],
      ["request_conflict", 409],
      ["contact_state_conflict", 409],
      ["contact_not_found", 404],
      ["event_unavailable", 422],
    ] as const
  ) {
    const error = await assertRejects(
      () =>
        handleQrAdminContactMutation(
          mutationDb({ ok: false, code, current_version: 7 }).db,
          remove,
        ),
      QrAdminContactError,
    );
    assertEquals(error.status, status);
    assertEquals(error.code, code);
    assertEquals(error.current_version, 7);
  }
  const error = await assertRejects(
    () =>
      handleQrAdminContactMutation(
        mutationDb(null, { code: "private", message: "secret details" }).db,
        remove,
      ),
    QrAdminContactError,
  );
  assertEquals(error.status, 503);
  assert(!error.message.includes("secret"));
});
Deno.test("handler rejects wrong record/action/request or malformed result without falsely confirming", async () => {
  for (
    const delta of [
      { action: "contact_restore" },
      { dataset: "entries" },
      { event_key: "other" },
      { couple_id: "702" },
      { request_id: add.request_id },
      { version: "4" },
      { version: 999 },
      { removed: false },
      { removed: "true" },
      { replayed: undefined },
    ]
  ) {
    const error = await assertRejects(
      () =>
        handleQrAdminContactMutation(
          mutationDb(success(remove, delta)).db,
          remove,
        ),
      QrAdminContactError,
    );
    assertEquals(error.code, "contact_result_unconfirmed");
  }
});
Deno.test("only Contacts accepts explicit contact status filters; legacy calls default active", () => {
  const base = { dataset: "contacts", event_key: add.event_key };
  assertEquals(parseQrAdminDataRequest(base).contact_status, "active");
  for (const status of ["active", "removed", "all"]) {
    assertEquals(
      parseQrAdminDataRequest({ ...base, contact_status: status })
        .contact_status,
      status,
    );
  }
  for (const dataset of ["entries", "winners", "scans"]) {
    assertThrows(
      () =>
        parseQrAdminDataRequest({ ...base, dataset, contact_status: "all" }),
      QrAdminDataError,
    );
  }
  for (const status of [true, [], "hidden", null]) {
    assertThrows(
      () => parseQrAdminDataRequest({ ...base, contact_status: status }),
      QrAdminDataError,
    );
  }
});
Deno.test("contact list uses new scoped read RPC and retains explicit removal/source/version metadata", async () => {
  const mock = mutationDb({
    total: 1,
    rows: [{
      couple_id: "701",
      name: add.name,
      version: 4,
      removed: true,
      removed_at: "2026-09-08T12:00:00Z",
      source: "admin",
      secret: "not returned",
    }],
  });
  const result = await handleQrAdminData(mock.db, {
    action: "data_list",
    dataset: "contacts",
    event_key: add.event_key,
    contact_status: "removed",
  });
  assert("rows" in result);
  assertEquals(result.contact_status, "removed");
  assertEquals(result.rows?.[0].removed, true);
  assertEquals(result.rows?.[0].source, "admin");
  assertEquals(result.rows?.[0].secret, undefined);
  assertEquals(
    (mock.calls[0] as { name: string }).name,
    "read_qr_bingo_admin_contacts",
  );
});
Deno.test("unverified contact-list state fails closed and other datasets keep original reader", async () => {
  for (
    const delta of [{ removed: undefined }, { source: "unknown" }, {
      version: 0,
    }]
  ) {
    const mock = mutationDb({
      total: 1,
      rows: [{
        couple_id: "701",
        version: 1,
        removed: false,
        source: "couple",
        ...delta,
      }],
    });
    await assertRejects(
      () =>
        handleQrAdminData(mock.db, {
          action: "data_list",
          dataset: "contacts",
          event_key: add.event_key,
        }),
      QrAdminDataError,
    );
  }
  const mock = mutationDb({ total: 0, rows: [] });
  await handleQrAdminData(mock.db, {
    action: "data_list",
    dataset: "winners",
    event_key: add.event_key,
  });
  assertEquals(
    (mock.calls[0] as { name: string }).name,
    "read_qr_bingo_admin_data",
  );
});
Deno.test("HMAC/replay authorization remains before every new mutation handler", () => {
  const source = Deno.readTextFileSync(
    new URL("../bd-qr-bingo-admin/index.ts", import.meta.url),
  );
  assert(
    source.indexOf("await requireSignedAdminRequest(request, rawBody)") <
      source.indexOf("await handleQrAdminContactMutation("),
  );
  assert(source.includes("consume_qr_bingo_admin_nonce"));
  assert(source.includes('"x-ww-signature"'));
});
