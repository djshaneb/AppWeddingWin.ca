export type DbPage = {
  data: unknown[] | null;
  count: number | null;
  error: { message: string } | null;
};
export async function completeDatabaseRows(
  name: string,
  key: string,
  page: (from: number, to: number) => PromiseLike<DbPage>,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let offset = 0; offset < 25_000; offset += 500) {
    const result = await page(offset, offset + 499);
    if (result.error) {
      throw new Error(`${name} lookup failed: ${result.error.message}`);
    }
    if (
      !Number.isSafeInteger(result.count) || Number(result.count) < 0 ||
      Number(result.count) > 25_000
    ) {
      throw new Error(`${name} returned an invalid complete count`);
    }
    if (total !== undefined && result.count !== total) {
      throw new Error(`${name} changed during pagination`);
    }
    total = Number(result.count);
    if (
      !Array.isArray(result.data) ||
      result.data.length !== Math.min(500, total - offset)
    ) {
      throw new Error(`${name} returned a partial snapshot`);
    }
    for (const value of result.data) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${name} returned an invalid row`);
      }
      const row = value as Record<string, unknown>;
      const id = String(row[key] || "").trim();
      if (!id || seen.has(id)) {
        throw new Error(`${name} returned a missing or duplicate identity`);
      }
      seen.add(id);
      rows.push(row);
    }
    if (rows.length === total) return rows;
  }
  throw new Error(`${name} exceeded the complete snapshot bound`);
}
