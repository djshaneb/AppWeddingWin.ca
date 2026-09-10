export type BdWeddingDateCall = (
  path: string,
  init: RequestInit,
) => Promise<{
  response: { ok: boolean; status?: number };
  body: { status?: string; [key: string]: unknown };
}>;

export class BdWeddingDateSyncError extends Error {
  constructor(public diagnostic: string) {
    super("Your wedding date has not finished syncing. Please try again.");
    this.name = "BdWeddingDateSyncError";
  }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

function dateValue(value: unknown) {
  return String(value ?? "").trim().replace(/^0000-00-00$/, "");
}

function pageCount(value: unknown) {
  if (value === undefined) return undefined;
  if (
    (typeof value !== "number" &&
      !(typeof value === "string" && /^\d+$/.test(value))) ||
    !Number.isSafeInteger(Number(value)) || Number(value) < 0
  ) throw new BdWeddingDateSyncError("bd_date_meta_unbounded_response");
  return Number(value);
}

/** Synchronize only pre-existing wedding_date shadows after the canonical
 * users_data date update. The BD API merges users_meta over physical columns;
 * older MCP writes can therefore hide a successful canonical update.
 * Never creates/deletes metadata or accepts a caller-supplied metadata ID. */
export async function syncExistingBdWeddingDateMetadata(
  callBd: BdWeddingDateCall,
  userId: string,
  weddingDate: string,
) {
  if (!validId(userId) || typeof weddingDate !== "string") {
    throw new BdWeddingDateSyncError("bd_date_meta_invalid_scope");
  }
  const parsedDate = new Date(`${weddingDate}T00:00:00.000Z`);
  if (
    (weddingDate !== "" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(weddingDate) ||
        Number.isNaN(parsedDate.valueOf()) ||
        parsedDate.toISOString().slice(0, 10) !== weddingDate))
  ) throw new BdWeddingDateSyncError("bd_date_meta_invalid_scope");

  const query = new URLSearchParams({ limit: "25" });
  for (
    const [key, value] of [
      ["database", "users_data"],
      ["database_id", userId],
      ["key", "wedding_date"],
    ]
  ) {
    query.append("property[]", key);
    query.append("property_value[]", value);
    query.append("property_operator[]", "=");
  }
  const path = `/api/v2/users_meta/get?${query.toString()}`;
  const readRows = async () => {
    let result;
    try {
      result = await callBd(path, { method: "GET" });
    } catch {
      throw new BdWeddingDateSyncError("bd_date_meta_read_failed");
    }
    // BD uses this exact 404 envelope for an empty, scoped metadata list.
    if (
      result.response.status === 404 && result.body.status === "error" &&
      result.body.message === "users_meta not found"
    ) return [];
    if (!result.response.ok || result.body.status !== "success") {
      throw new BdWeddingDateSyncError(
        result.response.status === 403
          ? "bd_date_meta_permission_denied"
          : "bd_date_meta_read_failed",
      );
    }
    const rows = result.body.message;
    const total = pageCount(result.body.total);
    const currentPage = pageCount(result.body.current_page);
    const totalPages = pageCount(result.body.total_pages);
    const nextPage = result.body.next_page;
    const hasNextPage = typeof nextPage === "string" && nextPage.trim() !== "";
    // BD retains next_page even on its final page. Accept that quirk only when
    // explicit counts prove this is the entire first and only page.
    const explicitCompletePage = Array.isArray(rows) && total === rows.length &&
      currentPage === 1 && totalPages === 1;
    // A successful scoped lookup with no stored shadow uses page zero in BD.
    // Accept that exact empty-result shape, not page zero with missing or
    // contradictory totals/cursors. No metadata write is needed in this case.
    const explicitEmptyPage = Array.isArray(rows) && rows.length === 0 &&
      total === 0 && currentPage === 0 && totalPages === 0 && nextPage === "";
    if (
      !Array.isArray(rows) || rows.length > 25 ||
      (total !== undefined && (total !== rows.length || total > 25)) ||
      (currentPage !== undefined && currentPage !== 1 && !explicitEmptyPage) ||
      (totalPages !== undefined &&
        (totalPages > 1 || (rows.length > 0 && totalPages !== 1))) ||
      (nextPage !== undefined && nextPage !== null &&
        typeof nextPage !== "string") ||
      ((rows.length === 25 || hasNextPage) && !explicitCompletePage)
    ) throw new BdWeddingDateSyncError("bd_date_meta_unbounded_response");
    const ids = new Set<string>();
    for (const row of rows) {
      const id = String(row?.meta_id ?? "");
      if (
        !row || typeof row !== "object" || Array.isArray(row) ||
        row.database !== "users_data" || String(row.database_id) !== userId ||
        row.key !== "wedding_date" || !validId(id) || ids.has(id) ||
        !Object.prototype.hasOwnProperty.call(row, "value")
      ) throw new BdWeddingDateSyncError("bd_date_meta_identity_mismatch");
      ids.add(id);
    }
    return rows as Record<string, unknown>[];
  };

  const rows = await readRows();
  const changed = rows.filter((row) => dateValue(row.value) !== weddingDate);
  for (const row of changed) {
    const body = new URLSearchParams({
      meta_id: String(row.meta_id),
      database: "users_data",
      database_id: userId,
      value: weddingDate,
    });
    if (weddingDate === "") body.set("__clear_fields", "value");
    let update;
    try {
      update = await callBd("/api/v2/users_meta/update", {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch {
      throw new BdWeddingDateSyncError("bd_date_meta_update_failed");
    }
    if (!update.response.ok || update.body.status !== "success") {
      throw new BdWeddingDateSyncError(
        update.response.status === 403
          ? "bd_date_meta_permission_denied"
          : "bd_date_meta_update_failed",
      );
    }
  }
  if (changed.length) {
    const readback = await readRows();
    const originalIds = new Set(rows.map((row) => String(row.meta_id)));
    if (
      readback.length !== rows.length ||
      readback.some((row) =>
        !originalIds.has(String(row.meta_id)) ||
        dateValue(row.value) !== weddingDate
      )
    ) throw new BdWeddingDateSyncError("bd_date_meta_readback_mismatch");
  }
}
