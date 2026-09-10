import { normalizeContactEmail } from "./contact_email.ts";
import {
  BdWeddingDateSyncError,
  syncExistingBdWeddingDateMetadata,
} from "./bd_wedding_date.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function harness(options: {
  ignoreDateUpdate?: boolean;
  nullAfterClear?: boolean;
  zeroAfterClear?: boolean;
  omitDateReadback?: boolean;
  rejectUpdate?: boolean;
  sessionMatches?: boolean;
  shadowDate?: string;
  rejectShadowUpdate?: boolean;
} = {}) {
  const source = await Deno.readTextFile(
    new URL("../bd-complete-profile/index.ts", import.meta.url),
  );
  const module = await import(
    `data:application/typescript,${
      encodeURIComponent(`
    type BdNativeSession = any;
    export default function(deps: any) {
      const { buildBdNativeSession, callBd, corsHeaders, ensureBdSessionCookie,
        fetchBdUserByEmail, fetchFullBdUserById, nativeSessionMatchesBdUser,
        sanitizeBdUser, applyLinkedAuthEmail, AuthEmailConflictError,
        AuthEmailSyncError, preflightLinkedAuthEmail, normalizeContactEmail,
        loadMemberEmailVerification, MemberEmailVerificationUnavailableError,
        requireConfirmedAuthEmailChange, BdWeddingDateSyncError,
        syncExistingBdWeddingDateMetadata, fetch, console } = deps;
      let handler: any;
      const Deno = { env: { get: (name: string) => name === "APP_EMAIL_CHANGE_SECRET"
        ? "offline-test-only-not-a-credential".repeat(2) : undefined },
        serve: (fn: any) => { handler = fn; } };
      ${source.replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*/g, "")}
      return { handler, cleanWeddingDate };
    }
  `)
    }`
  );
  const member: Record<string, unknown> = {
    user_id: "42",
    email: "couple@example.invalid",
    first_name: "Test Couple",
    wedding_date: "2027-10-18",
    phone_number: "5555550123",
    active: "2",
  };
  const updates: URLSearchParams[] = [];
  let shadowDate = options.shadowDate;
  const metadataUpdates: URLSearchParams[] = [];
  const confirmations: URLSearchParams[] = [];
  let pendingEmail: string | null = null;
  let authWrites = 0;
  class SyncError extends Error {}
  const api = module.default({
    normalizeContactEmail,
    BdWeddingDateSyncError,
    syncExistingBdWeddingDateMetadata,
    buildBdNativeSession: (user: any) => ({
      user_id: user.user_id,
      token: "offline-session",
    }),
    corsHeaders: {},
    ensureBdSessionCookie: async (user: any) => user,
    fetchFullBdUserById: async () => {
      const readback = { ...member };
      if (shadowDate !== undefined) readback.wedding_date = shadowDate;
      if (options.omitDateReadback && updates.length) {
        delete readback.wedding_date;
      }
      return readback;
    },
    fetchBdUserByEmail: async () => undefined,
    nativeSessionMatchesBdUser: () => options.sessionMatches !== false,
    sanitizeBdUser: (user: any, email: string) => ({ ...user, email }),
    AuthEmailConflictError: SyncError,
    AuthEmailSyncError: SyncError,
    MemberEmailVerificationUnavailableError: SyncError,
    preflightLinkedAuthEmail: async () => ({}),
    applyLinkedAuthEmail: async () => {
      authWrites++;
    },
    requireConfirmedAuthEmailChange: () => {},
    loadMemberEmailVerification: async () => ({
      email_confirmation_required: Boolean(pendingEmail),
      pending_email: pendingEmail,
      email_verification_status: pendingEmail ? "pending" : "none",
    }),
    callBd: async (path: string, init: RequestInit) => {
      if (path.startsWith("/api/v2/users_meta/get?")) {
        assert(init.method === "GET", "Metadata reads are read-only");
        return {
          response: { ok: true, status: 200 },
          body: {
            status: "success",
            message: shadowDate === undefined ? [] : [{
              meta_id: "701",
              database: "users_data",
              database_id: "42",
              key: "wedding_date",
              value: shadowDate,
            }],
          },
        };
      }
      if (path === "/api/v2/users_meta/update") {
        assert(init.method === "PUT", "Only existing metadata may be updated");
        const body = new URLSearchParams(String(init.body));
        assert(
          body.get("meta_id") === "701" &&
            body.get("database") === "users_data" &&
            body.get("database_id") === "42",
          "Metadata identity must remain scoped",
        );
        metadataUpdates.push(body);
        if (options.rejectShadowUpdate) {
          return {
            response: { ok: false, status: 403 },
            body: { status: "error" },
          };
        }
        const value = body.get("value");
        if (value || body.get("__clear_fields") === "value") {
          shadowDate = value || "";
        }
        return {
          response: { ok: true, status: 200 },
          body: { status: "success" },
        };
      }
      assert(
        path === "/api/v2/user/update" && init.method === "PUT",
        "Only the expected BD profile update is mocked",
      );
      const body = new URLSearchParams(String(init.body));
      updates.push(body);
      if (options.rejectUpdate) {
        return {
          response: { ok: false, status: 502 },
          body: { status: "error", message: "Offline failure" },
        };
      }
      for (const [key, value] of body) {
        if (key === "__clear_fields" || key === "user_id") continue;
        if (key === "wedding_date" && options.ignoreDateUpdate) continue;
        // Match the BD contract: blank alone is ignored. Both field= and the
        // exact __clear_fields directive are required to clear this column.
        if (
          value ||
          (key === "wedding_date" &&
            body.get("__clear_fields") === "wedding_date")
        ) {
          member[key] = value;
          if (key === "wedding_date" && !value) {
            if (options.nullAfterClear) member[key] = null;
            if (options.zeroAfterClear) member[key] = "0000-00-00";
          }
        }
      }
      return {
        response: { ok: true, status: 200 },
        body: { status: "success" },
      };
    },
    fetch: async (url: string, init: RequestInit) => {
      assert(
        url === "https://www.weddingwin.ca/verify-email-change-app",
        "No external network calls are allowed",
      );
      const body = new URLSearchParams(String(init.body));
      assert(
        body.get("ww_email_change_action") === "request_app",
        "Only verification requests are mocked",
      );
      pendingEmail = body.get("new_email");
      confirmations.push(body);
      return new Response(
        JSON.stringify({ ok: true, message: "Offline confirmation queued" }),
      );
    },
    console: { error: () => {} },
  });
  return {
    member,
    updates,
    metadataUpdates,
    confirmations,
    api,
    authWrites: () => authWrites,
    async save(
      profile: Record<string, unknown>,
      session = { user_id: "42", token: "offline-session" },
    ) {
      const response = await api.handler(
        new Request("https://example.invalid/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ native_session: session, profile }),
        }),
      );
      return { status: response.status, data: await response.json() };
    },
  };
}

Deno.test("wedding-date save writes the website countdown's canonical BD column and reads it back", async () => {
  const h = await harness();
  const result = await h.save({ wedding_date: "2028-02-29" });
  assert(result.status === 200 && result.data.ok, "Valid leap day must save");
  assert(
    h.updates[0].get("wedding_date") === "2028-02-29",
    "Must write wedding_date, not metadata",
  );
  assert(
    !h.updates[0].has("__clear_fields"),
    "Normal update must not clear fields",
  );
  assert(
    h.member.wedding_date === result.data.user.wedding_date,
    "Response must use the BD readback",
  );
});

Deno.test("profile date set and clear repair an existing metadata shadow before returning success", async () => {
  for (const date of ["", "2028-02-29"]) {
    const h = await harness({ shadowDate: "2027-06-12" });
    const result = await h.save({ wedding_date: date });
    assert(
      result.status === 200 && result.data.user.wedding_date === date,
      "Merged API readback must reflect saved date",
    );
    assert(
      h.member.wedding_date === date,
      "Physical countdown date must also match",
    );
    assert(
      h.metadataUpdates.length === 1,
      "Only the existing scoped shadow changes",
    );
    assert(
      h.member.email === "couple@example.invalid",
      "Date synchronization cannot change account email",
    );
  }
});

Deno.test("metadata permission failure is retriable and prevents email-change confirmation", async () => {
  const h = await harness({
    shadowDate: "2027-06-12",
    rejectShadowUpdate: true,
  });
  const result = await h.save({
    wedding_date: "",
    email: "new@example.invalid",
  });
  assert(
    result.status === 503 && !result.data.ok,
    "Do not claim complete save or bypass missing permission",
  );
  assert(
    h.confirmations.length === 0 && h.authWrites() === 0,
    "No email confirmation or Auth write after incomplete date sync",
  );
});

Deno.test("explicit blank date sends both BD clear wire fields and returns an explicit blank", async () => {
  const h = await harness();
  const result = await h.save({ wedding_date: "" });
  assert(
    result.status === 200 && result.data.user.wedding_date === "",
    "Clear must be visible in the response",
  );
  assert(
    h.updates[0].has("wedding_date") && h.updates[0].get("wedding_date") === "",
    "Empty field must remain on the wire",
  );
  assert(
    h.updates[0].get("__clear_fields") === "wedding_date",
    "Only the date may be cleared",
  );
  assert(
    h.member.phone_number === "5555550123",
    "Blank or omitted phone must not be cleared implicitly",
  );
});

for (const representation of ["nullAfterClear", "zeroAfterClear"] as const) {
  Deno.test(`BD ${representation} after explicit clear is returned as an empty date`, async () => {
    const h = await harness({ [representation]: true });
    const result = await h.save({ wedding_date: "" });
    assert(
      result.status === 200 && result.data.user.wedding_date === "",
      "Never revive cached dates from a null/zero-date response",
    );
  });
}

Deno.test("omitted wedding date leaves the existing date untouched", async () => {
  const h = await harness();
  const result = await h.save({ first_name: "Updated Couple", phone: "" });
  assert(
    result.status === 200 && h.member.wedding_date === "2027-10-18",
    "Omitted date must not mean clear",
  );
  assert(
    !h.updates[0].has("wedding_date") && !h.updates[0].has("__clear_fields"),
    "No date directive for unrelated edits",
  );
});

Deno.test("clear and new email save clear the date first but keep the existing email until proof", async () => {
  const h = await harness();
  const result = await h.save({
    wedding_date: "",
    email: "new@example.invalid",
  });
  assert(
    result.status === 200 && result.data.email_confirmation_required,
    "New email must remain pending",
  );
  assert(
    result.data.user.wedding_date === "" && h.member.wedding_date === "",
    "Date clear must persist during the email branch",
  );
  assert(
    !h.updates[0].has("email") && h.member.email === "couple@example.invalid",
    "Never update email before proof",
  );
  assert(
    h.confirmations.length === 1 && h.authWrites() === 0,
    "Only a confirmation request is allowed before email proof",
  );
});

Deno.test("new email with no date does not clear the countdown", async () => {
  const h = await harness();
  const result = await h.save({ email: "new@example.invalid" });
  assert(
    result.status === 200 && result.data.user.wedding_date === "2027-10-18",
    "Email changes must retain the date when omitted",
  );
  assert(
    !h.updates[0].has("wedding_date") && !h.updates[0].has("__clear_fields"),
    "No implicit date mutation",
  );
});

Deno.test("normal save rejects a silent BD date-update failure instead of claiming synchronization", async () => {
  const h = await harness({ ignoreDateUpdate: true });
  const result = await h.save({ wedding_date: "2028-02-29" });
  assert(
    result.status !== 200 && !result.data.ok,
    "Ignored BD date update must not be reported as successful",
  );
  assert(
    h.authWrites() === 0 && h.confirmations.length === 0,
    "Readback failure stops later operations",
  );
});

Deno.test("missing date field in BD readback is not evidence that a clear succeeded", async () => {
  const h = await harness({ omitDateReadback: true });
  const result = await h.save({ wedding_date: "" });
  assert(
    result.status !== 200 && !result.data.ok,
    "Absent readback must not be treated as a saved blank",
  );
  assert(h.authWrites() === 0, "Missing readback stops later synchronization");
});

Deno.test("email-change branch verifies the date before sending a confirmation", async () => {
  const h = await harness({ ignoreDateUpdate: true });
  const result = await h.save({
    wedding_date: "",
    email: "new@example.invalid",
  });
  assert(
    result.status !== 200 && !result.data.ok,
    "Failed date clear must be reported",
  );
  assert(
    h.confirmations.length === 0,
    "Do not send email after ignored profile update",
  );
});

Deno.test("BD rejects an update without returning a saved profile", async () => {
  const h = await harness({ rejectUpdate: true });
  const result = await h.save({ wedding_date: "2028-02-29" });
  assert(
    result.status === 502 && !result.data.ok,
    "Provider update failure must propagate safely",
  );
});

Deno.test("invalid calendar days and unsupported formats fail before any BD mutation", async () => {
  for (
    const wedding_date of [
      "2027-02-29",
      "2028-04-31",
      "2028-13-01",
      "2028-00-10",
      "2028-02-00",
      "0000-00-00",
      "1899-12-31",
      "03/04/2028",
      "2028-2-9",
      "2028-02-29junk",
    ]
  ) {
    const h = await harness();
    const result = await h.save({ wedding_date });
    assert(
      result.status === 400 && h.updates.length === 0,
      `Invalid date must fail before a write: ${wedding_date}`,
    );
  }
});

Deno.test("non-string wedding dates cannot be coerced into a valid date or a clear", async () => {
  for (const wedding_date of [null, false, 0, 20280229, ["2028-02-29"], {}]) {
    const h = await harness();
    const result = await h.save({ wedding_date });
    assert(
      result.status === 400 && h.updates.length === 0,
      "Non-string input must fail without writes",
    );
  }
});

Deno.test("caller-provided clear lists cannot clear unrelated profile fields", async () => {
  const h = await harness();
  const result = await h.save({
    wedding_date: "",
    __clear_fields: "email,phone_number",
    _clear_fields: ["email"],
  });
  assert(
    result.status === 200 &&
      h.updates[0].get("__clear_fields") === "wedding_date",
    "Clear list is fixed on the server",
  );
  assert(
    h.member.email === "couple@example.invalid" &&
      h.member.phone_number === "5555550123",
    "Unrelated fields remain intact",
  );
});

Deno.test("invalid native sessions cannot clear wedding dates", async () => {
  const h = await harness({ sessionMatches: false });
  const result = await h.save({ wedding_date: "" });
  assert(
    result.status === 401 && h.updates.length === 0,
    "Session ownership must precede all date writes",
  );
});
