import {
  qrBingoScannerOpensAt,
  qrBingoScannerWindowOpen,
} from "./qr_bingo_scan_schedule.ts";

export const QR_ENTRY_ACCESS_POLICY_VERSION = "2026-09-11-vendor-enabled-entry";
export const QR_ENTRY_ACCESS_POLICY_DISCLOSURE =
  "Vendor draw entry is available while QR Bingo scanning is open and this vendor’s draw is on, until the published entry closing time. A scan during this authorized period may qualify before the wedding show. This entry-access update replaces any earlier requirement to visit the vendor booth at the wedding show; all other prize, eligibility, contact-sharing, marketing, and winner-selection terms remain unchanged.";
export const QR_PRIOR_BOOTH_SENTENCE =
  "By entering, I confirm that I visited this vendor booth in person at the wedding show and scanned its QR code.";
export const QR_CURRENT_SCAN_SENTENCE =
  "By entering, I confirm that I scanned this vendor’s QR code during authorized QR Bingo scanning.";

/** Original immutable offer text remains stored. Only the organizer’s current,
 * server-applied access policy changes this one eligibility sentence. */
export function qrBingoEffectiveEntryDisclosure(
  original: unknown,
): string | null {
  if (
    typeof original !== "string" ||
    original.split(QR_PRIOR_BOOTH_SENTENCE).length !== 2
  ) return null;
  return original.replace(QR_PRIOR_BOOTH_SENTENCE, QR_CURRENT_SCAN_SENTENCE);
}

/** The website alone supplies qualifying proof. Legacy in-show proof is a
 * fallback only when the new field is absent, never when it is malformed. */
export function qrBingoVendorDrawScannedIds(
  progress: unknown,
  scanned: readonly string[],
): string[] {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return [];
  }
  const response = progress as Record<string, unknown>;
  const field = Object.hasOwn(response, "vendor_draw_scanned")
    ? response.vendor_draw_scanned
    : response.in_show_scanned;
  if (response.status !== "success" || !Array.isArray(field)) return [];
  return [
    ...new Set(
      field.filter((id): id is string => typeof id === "string")
        .map((id) => id.trim()).filter((id) =>
          Boolean(id) && scanned.includes(id)
        ),
    ),
  ];
}

type EntryConfig = Parameters<typeof qrBingoScannerWindowOpen>[0] & {
  vendor_draws_enabled: boolean;
};
export function qrBingoEntryOpensAt(config: EntryConfig): string {
  const automaticOpening = qrBingoScannerOpensAt(config.history_starts_at);
  const opening = config.scan_open_early && config.scan_early_access_starts_at
    ? new Date(
      Math.min(
        Date.parse(automaticOpening),
        Date.parse(config.scan_early_access_starts_at),
      ),
    ).toISOString()
    : automaticOpening;
  return opening;
}

export function qrBingoEntryReadiness(
  config: EntryConfig,
  enabled: boolean,
  setupReady: boolean,
  isolatedFixture: boolean,
  now = Date.now(),
) {
  const opening = qrBingoEntryOpensAt(config);
  const closed = !Number.isFinite(now) ||
    now >= Date.parse(config.entry_closes_at);
  const status = !enabled
    ? "disabled"
    : closed
    ? "closed"
    : config.vendor_draws_enabled !== true ||
        (!isolatedFixture && config.scan_enabled !== true)
    ? "paused"
    : !setupReady
    ? "incomplete"
    : isolatedFixture || qrBingoScannerWindowOpen(config, now)
    ? "open"
    : "scheduled";
  const messages = {
    disabled: "Your draw is off. Turn it on and save to accept entries.",
    closed: "Entry for this draw has closed. Existing entries are preserved.",
    paused: "Your draw is saved. Entry is currently paused by the organizer.",
    incomplete:
      "Complete and save the prize details and current agreement before accepting entries.",
    scheduled:
      "Your draw is saved and ready. Couples can enter when QR Bingo scanning opens.",
    open:
      "Your draw is ready. Eligible couples who scan your QR code can choose Yes to enter.",
  };
  return {
    entry_setup_ready: setupReady,
    entry_open: status === "open",
    entry_status: status,
    entry_opens_at: opening,
    entry_closes_at: config.entry_closes_at,
    entry_status_message: messages[status],
  };
}
