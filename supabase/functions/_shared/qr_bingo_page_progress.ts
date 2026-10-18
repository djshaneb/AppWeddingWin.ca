export type QrPageProgress = {
  scanned: string[];
  inShowScanned: string[];
  vendorDrawScanned: string[];
};

// The caller first verifies the freshly fetched website member and CSRF.
// A partial, legacy, fixture or differently-versioned page cannot supply proof.
export function parseQrPageProgress(
  value: {
    eventConfig: unknown;
    fixture: unknown;
    scanned: unknown;
    inShowScanned: unknown;
    vendorDrawScanned: unknown;
  },
  vendorIds: string[],
  expectedEventKey: string,
  expectedRevision: number,
): QrPageProgress | undefined {
  const event = value.eventConfig;
  if (!event || typeof event !== "object" || Array.isArray(event) ||
    value.fixture !== false || !expectedEventKey ||
    !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
    (event as Record<string, unknown>).event_key !== expectedEventKey ||
    (event as Record<string, unknown>).revision !== expectedRevision) return undefined;
  const canonicalId = (id: unknown): id is string =>
    typeof id === "string" && /^[1-9][0-9]{0,19}$/.test(id);
  if (!vendorIds.length || !vendorIds.every(canonicalId) ||
    new Set(vendorIds).size !== vendorIds.length) return undefined;
  const roster = new Set(vendorIds);
  const validIds = (ids: unknown): ids is string[] =>
    Array.isArray(ids) && ids.length <= roster.size &&
    ids.every((id) => canonicalId(id) && roster.has(id)) &&
    new Set(ids).size === ids.length;
  if (!validIds(value.scanned) || !validIds(value.inShowScanned) ||
    !validIds(value.vendorDrawScanned)) return undefined;
  const scanned = new Set(value.scanned);
  const draw = new Set(value.vendorDrawScanned);
  if (!value.inShowScanned.every((id) => scanned.has(id) && draw.has(id)) ||
    !value.vendorDrawScanned.every((id) => scanned.has(id))) return undefined;
  return {
    scanned: value.scanned,
    inShowScanned: value.inShowScanned,
    vendorDrawScanned: value.vendorDrawScanned,
  };
}
