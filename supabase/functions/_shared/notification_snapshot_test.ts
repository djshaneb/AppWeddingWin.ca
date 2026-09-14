import { completeDatabaseRows, type DbPage } from "./notification_snapshot.ts";

const rows = Array.from(
  { length: 1001 },
  (_, index) => ({ id: String(index + 1) }),
);
const good = (from: number, to: number): Promise<DbPage> =>
  Promise.resolve({
    data: rows.slice(from, to + 1),
    count: rows.length,
    error: null,
  });

Deno.test("complete native snapshot reads beyond default 1000-row server limit", async () => {
  const actual = await completeDatabaseRows("fixture", "id", good);
  if (actual.length !== 1001 || actual[1000].id !== "1001") {
    throw new Error("Missing older native history");
  }
});

Deno.test("complete empty native snapshot is valid", async () => {
  const actual = await completeDatabaseRows(
    "fixture",
    "id",
    () => Promise.resolve({ data: [], count: 0, error: null }),
  );
  if (actual.length) throw new Error("Empty snapshot must remain empty");
});

for (
  const mode of [
    "partial",
    "changing count",
    "missing count",
    "duplicate id",
    "missing id",
    "failed read",
    "over cap",
  ] as const
) {
  Deno.test(`native snapshot rejects ${mode} before baseline can advance`, async () => {
    let rejected = false;
    try {
      await completeDatabaseRows("fixture", "id", async (from, to) => {
        const page = await good(from, to);
        if (mode === "partial" && from === 500) {
          page.data = page.data!.slice(0, 100);
        }
        if (mode === "changing count" && from === 500) page.count = 1002;
        if (mode === "missing count") page.count = null;
        if (mode === "duplicate id" && from === 500) {
          page.data![0] = { id: "1" };
        }
        if (mode === "missing id") page.data![0] = {};
        if (mode === "failed read") page.error = { message: "unavailable" };
        if (mode === "over cap") page.count = 25001;
        return page;
      });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Accepted ${mode}`);
  });
}
