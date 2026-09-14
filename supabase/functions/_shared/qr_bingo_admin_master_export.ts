import { adminCsvCell } from "./qr_bingo_admin_data.ts";

export class QrAdminMasterExportError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "invalid_export_request",
  ) {
    super(message);
  }
}

export const MASTER_CONTACT_COLUMNS = [
  { key: "couple_id", label: "Couple account number" },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "wedding_date", label: "Wedding date" },
  { key: "wedding_venue", label: "Wedding venue" },
  { key: "first_accepted_at", label: "First agreement recorded" },
  { key: "last_accepted_at", label: "Latest agreement recorded" },
  { key: "event_keys", label: "QR Bingo events" },
  { key: "rules_versions", label: "Rules versions" },
  { key: "evidence_bases", label: "Agreement evidence" },
] as const;

type Admin = {
  rpc: (
    name: string,
    body: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
const PREFIX = "master_contacts_export_";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const errors: Record<string, [number, string]> = {
  invalid_export_request: [
    400,
    "The master export request is invalid. Start a new download.",
  ],
  export_identity_mismatch: [
    409,
    "This download belongs to a different admin request. Start again.",
  ],
  export_already_completed: [
    409,
    "This download is complete. Start a new download.",
  ],
  export_rate_limited: [
    429,
    "Please wait a minute before starting another master download.",
  ],
  export_unavailable: [
    409,
    "This download has expired or changed. Start a new download.",
  ],
  export_expired: [410, "This download has expired. Start a new download."],
  export_page_gap: [
    409,
    "Part of the download is missing. Start a new download.",
  ],
  export_snapshot_incomplete: [
    409,
    "The complete list could not be verified. Start a new download.",
  ],
  export_incomplete: [
    409,
    "The download is not complete. No file has been released.",
  ],
};
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function whole(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= 2147483647;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) &&
    Number.isFinite(Date.parse(value));
}
function unavailable(): never {
  throw new QrAdminMasterExportError(
    "The complete master export could not be verified. No file has been released.",
    503,
    "export_response_invalid",
  );
}

export async function handleQrAdminMasterExport(
  admin: Admin,
  body: Record<string, unknown>,
) {
  const action = typeof body.action === "string" ? body.action : "";
  const operation = action.startsWith(PREFIX)
    ? action.slice(PREFIX.length)
    : "";
  const operator = body.operator_identity;
  const keys = [
    "action",
    "dataset",
    "operator_identity",
    ...(operation === "start"
      ? ["request_id"]
      : operation === "page"
      ? ["export_id", "cursor"]
      : ["export_id", "expected_row_count"]),
  ];
  if (
    !["start", "page", "complete"].includes(operation) ||
    body.dataset !== "master_contacts" ||
    typeof operator !== "string" || operator !== operator.trim() ||
    operator.length < 3 || operator.length > 160 ||
    /[<>\u0000-\u001f\u007f]/.test(operator) ||
    Object.keys(body).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(body, key))
  ) {
    throw new QrAdminMasterExportError(
      "Enter your admin name and start a new master download.",
    );
  }
  const identity = operation === "start" ? body.request_id : body.export_id;
  if (
    typeof identity !== "string" || !UUID.test(identity) ||
    (operation === "page" &&
      (!whole(body.cursor) || body.cursor % 250 !== 0)) ||
    (operation === "complete" && !whole(body.expected_row_count))
  ) {
    throw new QrAdminMasterExportError(
      "The master export request is invalid. Start a new download.",
    );
  }
  const rpcBody = {
    p_action: operation,
    p_operator_identity: operator,
    ...(operation === "start"
      ? { p_request_id: identity }
      : { p_export_id: identity }),
    ...(operation === "page" ? { p_cursor: body.cursor } : {}),
    ...(operation === "complete"
      ? { p_expected_row_count: body.expected_row_count }
      : {}),
  };
  const { data, error } = await admin.rpc(
    "qr_bingo_master_contacts_export",
    rpcBody,
  );
  if (error) unavailable();
  const value = record(data);
  if (!value) unavailable();
  if (
    value.ok === false && typeof value.code === "string" && errors[value.code]
  ) {
    const [status, message] = errors[value.code];
    throw new QrAdminMasterExportError(message, status, value.code);
  }
  if (
    value.ok !== true || typeof value.export_id !== "string" ||
    !UUID.test(value.export_id) || !whole(value.total) ||
    (operation !== "start" && value.export_id !== identity)
  ) unavailable();
  const envelope = {
    ok: true,
    action,
    dataset: "master_contacts",
    export_id: value.export_id,
    total: value.total,
  };
  if (operation === "start") {
    if (
      value.request_id !== identity || value.page_size !== 250 ||
      !timestamp(value.generated_at) || !timestamp(value.expires_at) ||
      Date.parse(value.expires_at) <= Date.parse(value.generated_at) ||
      Date.parse(value.expires_at) - Date.parse(value.generated_at) > 901000
    ) unavailable();
    return {
      ...envelope,
      request_id: identity,
      columns: MASTER_CONTACT_COLUMNS,
      csv_header: "\ufeff" + MASTER_CONTACT_COLUMNS.map((column) =>
        adminCsvCell(column.label)
      ).join(",") + "\r\n",
      generated_at: value.generated_at,
      expires_at: value.expires_at,
      page_size: 250,
    };
  }
  if (operation === "complete") {
    if (
      value.total !== body.expected_row_count || !timestamp(value.generated_at)
    ) unavailable();
    return {
      ...envelope,
      report: {
        filename: `weddingwin-all-qr-bingo-couples-${
          value.generated_at.slice(0, 10)
        }.csv`,
        mime_type: "text/csv;charset=utf-8",
        row_count: value.total,
        generated_at: value.generated_at,
      },
    };
  }
  if (
    !whole(value.cursor) || value.cursor !== body.cursor ||
    !whole(value.row_count) || value.row_count > 250 ||
    !Array.isArray(value.rows) ||
    value.rows.length !== value.row_count || value.cursor > value.total ||
    value.row_count !== Math.min(250, value.total - value.cursor)
  ) unavailable();
  const next = value.cursor + value.row_count;
  if (
    value.done !== (next === value.total) ||
    value.next_cursor !== (next === value.total ? null : next)
  ) unavailable();
  const ids = new Set<string>();
  const lines = value.rows.map((candidate: unknown) => {
    const row = record(candidate);
    if (
      !row || typeof row.couple_id !== "string" ||
      !/^[1-9][0-9]{0,17}$/.test(row.couple_id) || ids.has(row.couple_id)
    ) unavailable();
    ids.add(row.couple_id);
    for (const column of MASTER_CONTACT_COLUMNS) {
      if (
        typeof row[column.key] !== "string" ||
        String(row[column.key]).length > 50000
      ) unavailable();
    }
    if (!timestamp(row.first_accepted_at) || !timestamp(row.last_accepted_at)) {
      unavailable();
    }
    return MASTER_CONTACT_COLUMNS.map((column) => {
      const text = row[column.key] as string;
      // CSV quoting alone does not preserve long account numbers or leading zeroes.
      // A literal apostrophe keeps contact identifiers textual without Excel formulas.
      return adminCsvCell(
        (column.key === "couple_id" || column.key === "phone") && text
          ? `'${text}`
          : text,
      );
    }).join(",");
  });
  const csv = lines.length ? lines.join("\r\n") + "\r\n" : "";
  const response = {
    ...envelope,
    cursor: value.cursor,
    row_count: value.row_count,
    next_cursor: value.next_cursor,
    done: value.done,
    csv_chunk: csv,
  };
  // Bound the actual JSON transport, including quote/control-character escaping.
  if (new TextEncoder().encode(JSON.stringify(response)).length > 1900000) {
    unavailable();
  }
  return response;
}
