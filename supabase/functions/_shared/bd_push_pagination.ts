export type BdPushListRow = Record<string, unknown>;
export type BdPushListModel = "chat_message_threads" | "chat_message_items";
export type BdPushListResponse = {
  response: { ok: boolean; status: number };
  body: unknown;
};
export type BdPushListCaller = (path: string) => Promise<BdPushListResponse>;

const PAGE_SIZE = 100;
const MAX_PAGES = 250;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function count(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^\d+$/.test(value.trim()))
  ) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function cursor(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" && value.trim() && value.length <= 16_384) {
    // The cursor is opaque. Preserve the exact server value, including its
    // encoding, rather than decoding it or constructing a page number.
    return value;
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null;
}

function rowId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null;
}

/**
 * Read a complete BD snapshot before it can affect notification state.
 * BD can emit an unused cursor after its final page; only validated page/count
 * completion permits ignoring it. A moving or inconsistent snapshot rejects.
 */
export async function listBdRowsPaginated(
  callBd: BdPushListCaller,
  model: BdPushListModel,
  baseParams: Record<string, string | number>,
  options: { idField: "thread_id" | "message_id" },
): Promise<BdPushListRow[]> {
  const expectedId = model === "chat_message_threads"
    ? "thread_id"
    : "message_id";
  if (
    !["chat_message_threads", "chat_message_items"].includes(model) ||
    options.idField !== expectedId ||
    Object.hasOwn(baseParams, "page")
  ) throw new Error("Invalid BD push pagination request");

  const collected: BdPushListRow[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let page = "";
  let expectedTotal: number | undefined;
  let expectedPages: number | undefined;

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(baseParams)) {
      params.set(key, String(value));
    }
    params.set("limit", String(PAGE_SIZE));
    if (page) params.set("page", page);
    const result = await callBd(`/api/v2/${model}/get?${params.toString()}`);
    if (
      !result.response.ok || !record(result.body) ||
      result.body.status !== "success"
    ) {
      throw new Error(`BD ${model} page failed (${result.response.status})`);
    }
    const body = result.body;
    const currentPage = count(body.current_page);
    const totalPages = count(body.total_pages);
    const total = count(body.total);
    const nextPage = cursor(body.next_page);
    if (
      currentPage === null || totalPages === null || total === null ||
      nextPage === null
    ) {
      throw new Error(`BD ${model} pagination returned invalid page metadata`);
    }
    if (!Array.isArray(body.message) || !body.message.every(record)) {
      throw new Error(`BD ${model} pagination returned invalid rows`);
    }
    const rows = body.message as BdPushListRow[];
    if (
      expectedTotal !== undefined &&
      (total !== expectedTotal || totalPages !== expectedPages)
    ) {
      throw new Error(
        `BD ${model} pagination totals changed during the snapshot`,
      );
    }
    expectedTotal = total;
    expectedPages = totalPages;

    // BD's documented empty collection has no page 1 or next cursor.
    if (
      total === 0 && index === 0 && currentPage === 0 && totalPages === 0 &&
      rows.length === 0 && !nextPage
    ) {
      return [];
    }
    if (totalPages > MAX_PAGES || total > MAX_PAGES * PAGE_SIZE) {
      throw new Error(
        `BD ${model} exceeded the safe pagination limit (${MAX_PAGES} pages)`,
      );
    }
    if (
      total === 0 || currentPage !== index + 1 || currentPage > totalPages ||
      totalPages !== Math.ceil(total / PAGE_SIZE)
    ) {
      throw new Error(
        `BD ${model} pagination returned inconsistent page metadata`,
      );
    }

    const expectedRows = Math.min(PAGE_SIZE, total - index * PAGE_SIZE);
    if (rows.length !== expectedRows) {
      throw new Error(
        `BD ${model} pagination row count did not match its page metadata`,
      );
    }
    for (const row of rows) {
      const id = Object.hasOwn(row, options.idField)
        ? rowId(row[options.idField])
        : null;
      if (id === null || seenIds.has(id)) {
        throw new Error(
          `BD ${model} pagination returned missing or repeated row IDs`,
        );
      }
      seenIds.add(id);
      collected.push(row);
    }
    if (nextPage && seenCursors.has(nextPage)) {
      throw new Error(`BD ${model} pagination repeated a page cursor`);
    }
    if (currentPage === totalPages) {
      if (collected.length !== total || seenIds.size !== total) {
        throw new Error(
          `BD ${model} pagination final count did not match its total`,
        );
      }
      return collected;
    }
    if (!nextPage) {
      throw new Error(
        `BD ${model} pagination omitted next_page before its final page`,
      );
    }
    seenCursors.add(nextPage);
    page = nextPage;
  }

  throw new Error(
    `BD ${model} exceeded the safe pagination limit (${MAX_PAGES} pages)`,
  );
}
