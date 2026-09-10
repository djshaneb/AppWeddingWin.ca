/** Scanner access is separate from the published show/prize-entry hours. */
type ScannerConfig = {
  history_starts_at: string;
  entry_closes_at: string;
  scan_enabled: boolean;
  scan_open_early?: boolean;
  scan_early_access_starts_at?: string | null;
};

const torontoParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function localParts(timestamp: number) {
  return Object.fromEntries(torontoParts.formatToParts(timestamp)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

export function qrBingoScannerOpensAt(historyStartsAt: string): string {
  const showStart = Date.parse(historyStartsAt);
  if (!Number.isFinite(showStart)) throw new Error("Invalid QR Bingo show start.");
  const date = localParts(showStart);
  const midnight = Date.UTC(date.year, date.month - 1, date.day);
  let resolved = midnight;
  // Resolve local midnight using Toronto's offset on that date, including DST.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = localParts(resolved);
    const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day,
      parts.hour, parts.minute, parts.second);
    const next = midnight - (wallClock - resolved);
    if (next === resolved) break;
    resolved = next;
  }
  const result = localParts(resolved);
  if (result.year !== date.year || result.month !== date.month ||
    result.day !== date.day || result.hour !== 0 || result.minute !== 0) {
    throw new Error("Could not resolve the QR Bingo opening time.");
  }
  return new Date(resolved).toISOString();
}

export function qrBingoScanHistoryStartsAt(config: ScannerConfig): string {
  const opening = Date.parse(qrBingoScannerOpensAt(config.history_starts_at));
  const earlyStart = config.scan_early_access_starts_at;
  if (earlyStart == null) return new Date(opening).toISOString();
  const early = Date.parse(earlyStart);
  if (!Number.isFinite(early)) throw new Error("Invalid QR Bingo early-access start.");
  // Keep authorized early progress even after the switch is turned back off.
  return new Date(Math.min(opening, early)).toISOString();
}

export function qrBingoScannerWindowOpen(config: ScannerConfig, now = Date.now()): boolean {
  if (config.scan_enabled !== true || !Number.isFinite(now)) return false;
  const closing = Date.parse(config.entry_closes_at);
  const opening = Date.parse(qrBingoScannerOpensAt(config.history_starts_at));
  return Number.isFinite(closing) && opening < closing && now < closing &&
    (config.scan_open_early === true || now >= opening);
}

export function qrBingoInShowScannedIds(progress: unknown, scanned: readonly string[]): string[] {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return [];
  const response = progress as Record<string, unknown>;
  if (response.status !== "success" || !Array.isArray(response.in_show_scanned)) return [];
  return [...new Set(response.in_show_scanned
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim()).filter((id) => Boolean(id) && scanned.includes(id)))];
}
