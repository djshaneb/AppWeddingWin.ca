import jpeg from "npm:jpeg-js@0.4.4";

const DEFAULT_BD_TIME_ZONE = "America/Toronto";

export function isChatImageSharingEnabled(value: unknown) {
  return /^(?:1|true)$/i.test(String(value || "").trim());
}

export type ChatImageDeliveryPolicy =
  | "text"
  | "image"
  | "pause"
  | "quarantine";

export function chatImageDeliveryPolicy(
  hasImage: boolean,
  hasText: boolean,
  createdAfterCutoff: boolean,
  imagesEnabled: boolean,
): ChatImageDeliveryPolicy {
  if (!hasImage) return "text";
  if (!createdAfterCutoff) return hasText ? "text" : "quarantine";
  return imagesEnabled ? "image" : "pause";
}

const INLINE_IMAGE_DATA_PATTERN = /data:image\/[^\s<>"']+/gi;

export function containsInlineImagePayload(value: unknown) {
  return /data:image\//i.test(String(value || ""));
}

export function stripInlineImagePayloads(value: unknown) {
  return String(value || "").replace(INLINE_IMAGE_DATA_PATTERN, "").trim();
}

export function sumUnreadOwnerCounts<T extends { unread_count: unknown }>(
  rows: T[],
  isMine: (row: T) => boolean,
) {
  return rows
    .filter((row) => !isMine(row))
    .reduce((sum, row) => sum + Math.max(0, Number(row.unread_count || 0)), 0);
}

export const CHAT_IMAGE_MAX_DECODED_BYTES = 240_000;
export const CHAT_IMAGE_MAX_DIMENSION = 1_600;
export const CHAT_IMAGE_MAX_PIXELS = 2_560_000;

function chatImageHasExpectedSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return false;
}

export function validateChatImageDataUri(value: unknown) {
  const image = String(value || "").trim();
  if (!image) return "";

  const match = image.match(/^data:(image\/jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("Unsupported image format");

  const mimeType = match[1].toLowerCase();
  const encoded = match[2];
  const maxEncodedLength = Math.ceil(CHAT_IMAGE_MAX_DECODED_BYTES / 3) * 4;
  if (encoded.length > maxEncodedLength || encoded.length % 4 !== 0) {
    throw new Error("Image is too large or invalid. Please choose a smaller image.");
  }

  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    throw new Error("Unsupported image format");
  }
  if (!decoded || decoded.length > CHAT_IMAGE_MAX_DECODED_BYTES) {
    throw new Error("Image is too large or invalid. Please choose a smaller image.");
  }

  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (!chatImageHasExpectedSignature(mimeType, bytes)) {
    throw new Error("The selected file does not match its image type.");
  }
  return image;
}

export async function validateDecodedChatImageDataUri(value: unknown) {
  const image = validateChatImageDataUri(value);
  if (!image) return "";

  const match = image.match(/^data:(image\/jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("Unsupported image format");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));

  try {
    const decoded = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: false,
      tolerantDecoding: false,
      maxResolutionInMP: CHAT_IMAGE_MAX_PIXELS / 1_000_000,
      maxMemoryUsageInMB: 32,
    });
    const width = Number(decoded.width || 0);
    const height = Number(decoded.height || 0);
    if (
      width < 1 ||
      height < 1 ||
      width > CHAT_IMAGE_MAX_DIMENSION ||
      height > CHAT_IMAGE_MAX_DIMENSION ||
      width * height > CHAT_IMAGE_MAX_PIXELS
    ) {
      throw new Error("Photo dimensions are too large. Please choose a smaller photo.");
    }
  } catch (error) {
    if (error instanceof Error && /dimensions are too large/i.test(error.message)) throw error;
    throw new Error("The selected file could not be decoded as a supported photo.");
  }
  return image;
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
