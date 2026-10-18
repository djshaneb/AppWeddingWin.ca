import type { WebsitePrincipal } from "./qr_bingo_website_auth.ts";

export class WebsiteMemberSnapshotError extends Error {
  readonly status = 403;
  readonly code = "website_member_snapshot_invalid";
  constructor() {
    super("Your website account could not be verified. Please refresh QR Bingo.");
    this.name = "WebsiteMemberSnapshotError";
  }
}

const FIELD_LIMITS = {
  user_id: 18, active: 1, subscription_id: 2,
  first_name: 500, last_name: 500, email: 320,
  phone_number: 160, phone: 160, wedding_date: 40,
} as const;
const encoder = new TextEncoder();

// The caller must complete website signature, body hash, expiry and nonce
// verification first. Native and vendor requests always keep their BD lookup.
export function verifiedWebsiteCoupleMember(
  principal: WebsitePrincipal | null,
  body: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (principal?.kind !== "couple") return undefined;
  if (!Object.prototype.hasOwnProperty.call(body, "website_member_snapshot")) return undefined;
  const value = body.website_member_snapshot;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebsiteMemberSnapshotError();
  const row = value as Record<string, unknown>;
  const expectedKeys = ["version", ...Object.keys(FIELD_LIMITS)];
  if (row.version !== 1 || Object.keys(row).length !== expectedKeys.length ||
    Object.keys(row).some((key) => !expectedKeys.includes(key))) throw new WebsiteMemberSnapshotError();
  for (const [key, maximumBytes] of Object.entries(FIELD_LIMITS)) {
    const text = row[key];
    if (typeof text !== "string" || encoder.encode(text).length > maximumBytes || text.includes("\u0000")) {
      throw new WebsiteMemberSnapshotError();
    }
  }
  if (!/^[1-9][0-9]{0,17}$/.test(row.user_id as string) ||
    row.user_id !== principal.userId || row.active !== "2" ||
    !["4", "18"].includes(row.subscription_id as string)) throw new WebsiteMemberSnapshotError();
  const member: Record<string, unknown> = {};
  for (const key of Object.keys(FIELD_LIMITS)) member[key] = row[key];
  return member;
}
