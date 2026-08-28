const DEFAULT_BD_TIME_ZONE = "America/Toronto";

export function isChatImageSharingEnabled(value: unknown) {
  return /^(?:1|true)$/i.test(String(value || "").trim());
}

const INLINE_IMAGE_DATA_PATTERN = /data:image\/[^\s<>"']+/gi;

export function containsInlineImagePayload(value: unknown) {
  return /data:image\//i.test(String(value || ""));
}

export function stripInlineImagePayloads(value: unknown) {
  return String(value || "").replace(INLINE_IMAGE_DATA_PATTERN, "").trim();
}

export function normalizeParticipantIdentity(value: unknown) {
  const clean = String(value || "").trim();
  return clean.includes("@") ? clean.toLowerCase() : clean;
}

export function splitParticipantIdentities(value: unknown) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function matchingParticipantIdentity(value: unknown, identities: string[]) {
  const normalized = new Set(
    identities.map(normalizeParticipantIdentity).filter(Boolean),
  );
  return splitParticipantIdentities(value).find((part) =>
    normalized.has(normalizeParticipantIdentity(part))
  ) || "";
}

export function participantValueMatchesIdentities(value: unknown, identities: string[]) {
  return !!matchingParticipantIdentity(value, identities);
}

export function participantValuesMatch(first: unknown, second: unknown) {
  const right = new Set(
    splitParticipantIdentities(second).map(normalizeParticipantIdentity).filter(Boolean),
  );
  return splitParticipantIdentities(first).some((part) =>
    right.has(normalizeParticipantIdentity(part))
  );
}

function wallClockPartsAt(time: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(time));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || "0");
  return Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
}

// BD timestamps use a 14-digit wall-clock value in the site's timezone. Deno
// runs in UTC, so constructing a local Date directly can shift report cutoffs
// by several hours. Iteratively reconcile the wall-clock value with the named
// timezone; this also follows daylight-saving transitions.
export function parseChatTimestamp(value: unknown, timeZone = DEFAULT_BD_TIME_ZONE) {
  const raw = String(value || "").trim();
  if (/^\d{14}$/.test(raw)) {
    const targetWallClock = Date.UTC(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)) - 1,
      Number(raw.slice(6, 8)),
      Number(raw.slice(8, 10)),
      Number(raw.slice(10, 12)),
      Number(raw.slice(12, 14)),
    );
    let candidate = targetWallClock;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const observedWallClock = wallClockPartsAt(candidate, timeZone);
        const adjustment = targetWallClock - observedWallClock;
        candidate += adjustment;
        if (!adjustment) break;
      }
      return candidate;
    } catch {
      return Number.NaN;
    }
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function isMessageVisibleAtReportCutoff(
  createdAt: unknown,
  reportedAt?: unknown,
  timeZone = DEFAULT_BD_TIME_ZONE,
) {
  const cutoffRaw = String(reportedAt || "").trim();
  if (!cutoffRaw) return true;
  const cutoff = parseChatTimestamp(cutoffRaw, timeZone);
  const created = parseChatTimestamp(createdAt, timeZone);
  // An active report with malformed timing data fails closed. Valid records at
  // or before the report remain visible; only later records are suppressed.
  return Number.isFinite(cutoff) && Number.isFinite(created) && created <= cutoff;
}

export function filterMessagesAtOrBeforeReport<T>(
  messages: T[],
  createdAt: (message: T) => unknown,
  reportedAt?: unknown,
  timeZone = DEFAULT_BD_TIME_ZONE,
) {
  return messages.filter((message) =>
    isMessageVisibleAtReportCutoff(createdAt(message), reportedAt, timeZone)
  );
}

export async function runDurableClose<T>(
  enqueue: () => Promise<T>,
  deliver: () => Promise<void>,
  markSent: (row: T) => Promise<void>,
) {
  const row = await enqueue();
  try {
    await deliver();
    await markSent(row);
    return { row, delivered: true as const };
  } catch (error) {
    // Persistence happens before the network request. Any BD or acknowledgement
    // failure leaves the row pending for the normal idempotent outbox retry.
    return { row, delivered: false as const, error };
  }
}
