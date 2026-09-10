export class QrAdminDataError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
const FIELDS = {
  contacts: [
    ["couple_id", "Couple ID"],
    ["name", "Name"],
    ["email", "Contact email"],
    ["phone", "Phone"],
    ["wedding_date", "Wedding date"],
    ["wedding_venue", "Wedding venue"],
    ["version", "Version"],
    ["updated_at", "Updated at"],
    ["source", "Source"],
    ["removed", "Removed from list"],
    ["removed_at", "Removed at"],
  ],
  entries: [
    ["id", "Entry ID"],
    ["vendor_id", "Vendor ID"],
    ["vendor_name", "Vendor"],
    ["couple_id", "Couple ID"],
    ["name", "Name"],
    ["email", "Contact email"],
    ["phone", "Phone"],
    ["wedding_date", "Wedding date"],
    ["wedding_venue", "Wedding venue"],
    ["entered_at", "Entered at"],
    ["consent_version", "Rules version"],
    ["marketing_consent", "Marketing consent"],
    ["selection_status", "Selection status"],
  ],
  winners: [
    ["id", "Draw ID"],
    ["vendor_id", "Vendor ID"],
    ["vendor_name", "Vendor"],
    ["couple_id", "Couple ID"],
    ["name", "Name at selection"],
    ["email", "Contact email at selection"],
    ["phone", "Phone at selection"],
    ["wedding_date", "Wedding date at selection"],
    ["draw_number", "Draw number"],
    ["drawn_at", "Drawn at"],
    ["selection_status", "Selection status"],
    ["prize_title", "Prize"],
  ],
} as const;
export function adminCsvCell(value: unknown) {
  let text = String(value ?? "").replace(/[\u0000\u007f]/g, "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function parseQrAdminDataRequest(body: Record<string, unknown>) {
  const dataset = String(body.dataset || "");
  const event_key = typeof body.event_key === "string" ? body.event_key : "";
  const vendor_id = typeof body.vendor_id === "string" ? body.vendor_id : "";
  const search = typeof body.search === "string" ? body.search.trim() : "";
  const page = body.page === undefined ? 1 : Number(body.page);
  const page_size = body.page_size === undefined ? 50 : Number(body.page_size);
  const operator_identity = typeof body.operator_identity === "string"
    ? body.operator_identity.trim()
    : "";
  const contact_status = body.contact_status === undefined
    ? "active"
    : body.contact_status;
  if (
    !["contacts", "entries", "winners", "scans"].includes(dataset) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event_key) || event_key.length > 100 ||
    (vendor_id && !/^[1-9][0-9]{0,19}$/.test(vendor_id)) ||
    search.length > 120 || /[<>\u0000-\u001f\u007f]/.test(search) ||
    !Number.isSafeInteger(page) || page < 1 || page > 10000 ||
    !Number.isSafeInteger(page_size) || page_size < 1 || page_size > 100 ||
    operator_identity.length > 160 ||
    /[<>\u0000-\u001f\u007f]/.test(operator_identity) ||
    (dataset === "contacts"
      ? !["active", "removed", "all"].includes(String(contact_status)) ||
        typeof contact_status !== "string"
      : body.contact_status !== undefined)
  ) throw new QrAdminDataError("Choose a valid dataset, event and page.");
  return {
    dataset,
    event_key,
    vendor_id,
    search,
    page,
    page_size,
    operator_identity,
    contact_status: contact_status as "active" | "removed" | "all",
  };
}
export async function auditQrAdminDataExport(
  db: any,
  filter: ReturnType<typeof parseQrAdminDataRequest>,
  rowCount: number,
) {
  if (
    filter.operator_identity.length < 3 || !Number.isSafeInteger(rowCount) ||
    rowCount < 0 || rowCount > 5000
  ) {
    throw new QrAdminDataError(
      "Add the operator name or work email before downloading.",
    );
  }
  const { count, error: rateError } = await db.from(
    "qr_bingo_admin_data_export_audit",
  ).select("id", { head: true, count: "exact" })
    .eq("operator_identity", filter.operator_identity).gte(
      "created_at",
      new Date(Date.now() - 60000).toISOString(),
    );
  if (rateError) {
    throw new QrAdminDataError("Export audit is temporarily unavailable.", 503);
  }
  if ((count || 0) >= 5) {
    throw new QrAdminDataError(
      "Please wait a minute before downloading another list.",
      429,
    );
  }
  const { error } = await db.from("qr_bingo_admin_data_export_audit").insert({
    event_key: filter.event_key,
    dataset: filter.dataset,
    vendor_id: filter.vendor_id,
    operator_identity: filter.operator_identity,
    row_count: rowCount,
  });
  if (error) {
    throw new QrAdminDataError(
      "Export audit could not be saved. No download was created.",
      503,
    );
  }
}
export async function handleQrAdminData(
  db: any,
  body: Record<string, unknown>,
) {
  const filter = parseQrAdminDataRequest(body);
  if (body.action === "data_export_audit") {
    if (filter.dataset !== "scans") {
      throw new QrAdminDataError(
        "Only the authenticated website scan export uses this audit action.",
      );
    }
    await auditQrAdminDataExport(db, filter, Number(body.row_count));
    return { ok: true };
  }
  if (filter.dataset === "scans") {
    throw new QrAdminDataError(
      "Open the wedding-show scan list in the website admin plugin.",
    );
  }
  const exporting = body.action === "data_export";
  const args: Record<string, unknown> = {
    p_event_key: filter.event_key,
    p_vendor_id: filter.vendor_id,
    p_search: filter.search,
    p_offset: exporting ? 0 : (filter.page - 1) * filter.page_size,
    p_limit: exporting ? 5001 : filter.page_size,
  };
  const contactList = filter.dataset === "contacts";
  if (contactList) args.p_contact_status = filter.contact_status;
  else args.p_dataset = filter.dataset;
  const { data, error } = await db.rpc(
    contactList ? "read_qr_bingo_admin_contacts" : "read_qr_bingo_admin_data",
    args,
  );
  if (
    error || !data || !Array.isArray(data.rows) ||
    !Number.isSafeInteger(data.total)
  ) {
    throw new QrAdminDataError(
      "QR Bingo data is temporarily unavailable.",
      503,
    );
  }
  const columns = FIELDS[filter.dataset as keyof typeof FIELDS].map((
    [key, label],
  ) => ({ key, label }));
  const rows = data.rows.map((row: Record<string, unknown>) => {
    if (
      contactList && (typeof row.removed !== "boolean" ||
        !["admin", "couple"].includes(String(row.source)) ||
        !Number.isSafeInteger(row.version) || Number(row.version) < 1)
    ) {
      throw new QrAdminDataError(
        "Contact-list state could not be verified. Reload and try again.",
        503,
      );
    }
    return Object.fromEntries(
      columns.map((
        { key },
      ) => [key, key === "removed_at" ? row[key] ?? null : row[key] ?? ""]),
    );
  });
  if (exporting) {
    if (data.total > 5000 || rows.length !== data.total) {
      throw new QrAdminDataError(
        "This list exceeds the 5,000-row download limit. Narrow the filters; no partial file was created.",
        413,
      );
    }
    await auditQrAdminDataExport(db, filter, rows.length);
    const csv = "\uFEFF" + [
      columns.map(({ label }) => adminCsvCell(label)).join(","),
      ...rows.map((row: Record<string, unknown>) =>
        columns.map(({ key }) => adminCsvCell(row[key])).join(",")
      ),
    ].join("\r\n") + "\r\n";
    return {
      ok: true,
      dataset: filter.dataset,
      event_key: filter.event_key,
      ...(contactList ? { contact_status: filter.contact_status } : {}),
      report: {
        filename: `weddingwin-${filter.event_key}-${filter.dataset}.csv`,
        mime_type: "text/csv;charset=utf-8",
        csv,
        row_count: rows.length,
        generated_at: new Date().toISOString(),
      },
    };
  }
  return {
    ok: true,
    dataset: filter.dataset,
    event_key: filter.event_key,
    ...(contactList ? { contact_status: filter.contact_status } : {}),
    columns,
    rows,
    total: data.total,
    page: filter.page,
    page_size: filter.page_size,
    has_more: filter.page * filter.page_size < data.total,
  };
}
