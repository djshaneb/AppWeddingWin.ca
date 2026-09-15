export type QrBingoPrizeEditStatus = {
  prize_editable: boolean;
  prize_edit_deadline_at: string | null;
  prize_edit_timezone: string | null;
  prize_details_locked: boolean;
  prize_details_lock_reason:
    | "sent"
    | "sending"
    | "unconfirmed"
    | "deadline"
    | "unavailable"
    | "synthetic_fixture"
    | null;
};
const reasons = new Set([
  "sent",
  "sending",
  "unconfirmed",
  "deadline",
  "unavailable",
  "synthetic_fixture",
]);
const unavailable = (): QrBingoPrizeEditStatus => ({
  prize_editable: false,
  prize_edit_deadline_at: null,
  prize_edit_timezone: null,
  prize_details_locked: true,
  prize_details_lock_reason: "unavailable",
});
/** The database owns time-zone conversion and wall-clock enforcement. Never
 * infer permission from a vendor entry/draw timestamp or a stale app clock. */
export function parseQrBingoPrizeEditStatus(
  value: unknown,
  context: {
    event_key: string;
    vendor_bingo_id: string;
    vendor_bd_user_id: string;
    event_revision: number;
  },
): QrBingoPrizeEditStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return unavailable();
  }
  const row = value as Record<string, unknown>;
  if (
    row.event_key !== context.event_key ||
    row.vendor_bingo_id !== context.vendor_bingo_id ||
    row.vendor_bd_user_id !== context.vendor_bd_user_id
  ) return unavailable();
  const reason = row.prize_details_lock_reason;
  const locked = reason !== null;
  if (locked && (typeof reason !== "string" || !reasons.has(reason))) {
    return unavailable();
  }
  if (row.prize_editable !== !locked || row.prize_details_locked !== locked) {
    return unavailable();
  }
  const rawDeadline = row.prize_edit_deadline_at;
  const timezone = row.prize_edit_timezone;
  const deadline = typeof rawDeadline === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(
        rawDeadline,
      ) &&
      Number.isFinite(Date.parse(rawDeadline))
    ? rawDeadline
    : null;
  if (deadline) {
    if (
      row.event_revision !== context.event_revision ||
      typeof timezone !== "string"
    ) return unavailable();
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
        new Date(deadline),
      );
    } catch {
      return unavailable();
    }
  } else if (
    !locked || reason === "deadline" || rawDeadline !== null ||
    timezone !== null
  ) return unavailable();
  return {
    prize_editable: !locked,
    prize_edit_deadline_at: deadline,
    prize_edit_timezone: deadline ? timezone as string : null,
    prize_details_locked: locked,
    prize_details_lock_reason:
      reason as QrBingoPrizeEditStatus["prize_details_lock_reason"],
  };
}
