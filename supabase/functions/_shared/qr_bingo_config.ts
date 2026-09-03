import type { SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";

export const QR_BINGO_EMAIL_MODES = [
  "disabled",
  "production_verified_fulfillment",
] as const;

export type QrBingoEmailMode = typeof QR_BINGO_EMAIL_MODES[number];

export type QrBingoEventConfig = {
  id: string;
  event_key: string;
  revision: number;
  published: boolean;
  event_name: string;
  venue_name: string;
  vendor_tag_id: number;
  history_starts_at: string;
  app_card_enabled: boolean;
  scan_enabled: boolean;
  vendor_draws_enabled: boolean;
  email_delivery_mode: QrBingoEmailMode;
  send_vendor_email: boolean;
  send_couple_email: boolean;
  vendor_email_subject: string;
  couple_email_subject: string;
  rules_version: string;
  official_rules_url: string;
  alternate_free_entry_url: string;
  eligibility_region: string;
  draw_opens_at: string;
  entry_closes_at: string;
  draw_at: string;
  created_at?: string;
  created_by?: string;
};

export type PublicQrBingoEventConfig = Pick<
  QrBingoEventConfig,
  | "event_key"
  | "revision"
  | "published"
  | "event_name"
  | "venue_name"
  | "vendor_tag_id"
  | "history_starts_at"
  | "app_card_enabled"
  | "scan_enabled"
  | "vendor_draws_enabled"
  | "email_delivery_mode"
  | "send_vendor_email"
  | "send_couple_email"
  | "vendor_email_subject"
  | "couple_email_subject"
  | "rules_version"
  | "official_rules_url"
  | "alternate_free_entry_url"
  | "eligibility_region"
  | "draw_opens_at"
  | "entry_closes_at"
  | "draw_at"
>;

function requiredText(row: Record<string, unknown>, key: string) {
  const value = String(row[key] ?? "").trim();
  if (!value) {
    throw new Error(`Published QR Bingo configuration is missing ${key}.`);
  }
  return value;
}

function requiredBoolean(row: Record<string, unknown>, key: string) {
  if (typeof row[key] !== "boolean") {
    throw new Error(`Published QR Bingo configuration has invalid ${key}.`);
  }
  return row[key] as boolean;
}

function requiredPlainText(
  row: Record<string, unknown>,
  key: string,
  maxLength: number,
) {
  const value = requiredText(row, key);
  if (
    [...value].length > maxLength ||
    /[<>\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`Published QR Bingo configuration has invalid ${key}.`);
  }
  return value;
}

function requiredPositiveInteger(row: Record<string, unknown>, key: string) {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Published QR Bingo configuration has invalid ${key}.`);
  }
  return value;
}

function requiredTimestamp(row: Record<string, unknown>, key: string) {
  const value = requiredText(row, key);
  if (!Number.isFinite(new Date(value).getTime())) {
    throw new Error(`Published QR Bingo configuration has invalid ${key}.`);
  }
  return value;
}

function requiredWeddingWinHttpsUrl(
  row: Record<string, unknown>,
  key: string,
) {
  const value = requiredText(row, key);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Published QR Bingo configuration has invalid ${key}.`);
  }
  const hostname = url.hostname.toLowerCase().replace(/[.]$/, "");
  if (
    url.protocol !== "https:" ||
    (hostname !== "weddingwin.ca" && hostname !== "www.weddingwin.ca") ||
    Boolean(url.username || url.password || url.hash) ||
    (url.port !== "" && url.port !== "443") ||
    url.pathname.startsWith("//") ||
    /[\u0000-\u0020\u007f]/u.test(value)
  ) {
    throw new Error(
      `Published QR Bingo configuration requires a WeddingWin HTTPS URL for ${key}.`,
    );
  }
  return value;
}

export function parseQrBingoEventConfig(value: unknown): QrBingoEventConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Published QR Bingo configuration is unavailable.");
  }
  const row = value as Record<string, unknown>;
  const emailDeliveryMode = requiredText(row, "email_delivery_mode");
  if (
    !(QR_BINGO_EMAIL_MODES as readonly string[]).includes(emailDeliveryMode)
  ) {
    throw new Error(
      "Published QR Bingo configuration has invalid email_delivery_mode.",
    );
  }

  const config: QrBingoEventConfig = {
    id: requiredText(row, "id"),
    event_key: requiredText(row, "event_key"),
    revision: requiredPositiveInteger(row, "revision"),
    published: requiredBoolean(row, "published"),
    event_name: requiredText(row, "event_name"),
    venue_name: requiredPlainText(row, "venue_name", 160),
    vendor_tag_id: requiredPositiveInteger(row, "vendor_tag_id"),
    history_starts_at: requiredTimestamp(row, "history_starts_at"),
    app_card_enabled: requiredBoolean(row, "app_card_enabled"),
    scan_enabled: requiredBoolean(row, "scan_enabled"),
    vendor_draws_enabled: requiredBoolean(row, "vendor_draws_enabled"),
    email_delivery_mode: emailDeliveryMode as QrBingoEmailMode,
    send_vendor_email: requiredBoolean(row, "send_vendor_email"),
    send_couple_email: requiredBoolean(row, "send_couple_email"),
    vendor_email_subject: requiredText(row, "vendor_email_subject"),
    couple_email_subject: requiredText(row, "couple_email_subject"),
    rules_version: requiredText(row, "rules_version"),
    official_rules_url: requiredWeddingWinHttpsUrl(row, "official_rules_url"),
    alternate_free_entry_url: requiredWeddingWinHttpsUrl(
      row,
      "alternate_free_entry_url",
    ),
    eligibility_region: requiredText(row, "eligibility_region"),
    draw_opens_at: requiredTimestamp(row, "draw_opens_at"),
    entry_closes_at: requiredTimestamp(row, "entry_closes_at"),
    draw_at: requiredTimestamp(row, "draw_at"),
    created_at: String(row.created_at ?? "").trim() || undefined,
    created_by: String(row.created_by ?? "").trim() || undefined,
  };

  if (!config.published) {
    throw new Error("QR Bingo configuration is not published.");
  }
  if (
    new Date(config.history_starts_at).getTime() >
      new Date(config.entry_closes_at).getTime() ||
    new Date(config.draw_opens_at).getTime() <
      new Date(config.entry_closes_at).getTime() ||
    new Date(config.draw_at).getTime() <
      new Date(config.draw_opens_at).getTime() ||
    new Date(config.entry_closes_at).getTime() >
      new Date(config.draw_at).getTime()
  ) {
    throw new Error("QR Bingo draw time must be at or after entry close.");
  }
  if (
    config.email_delivery_mode === "production_verified_fulfillment" &&
    !config.send_vendor_email &&
    !config.send_couple_email
  ) {
    throw new Error(
      "Enabled QR Bingo email delivery requires at least one recipient channel.",
    );
  }

  return config;
}

export async function loadPublishedQrBingoConfig(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("qr_bingo_event_configs")
    .select("*")
    .eq("published", true)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Published QR Bingo configuration unavailable: ${error.message}`,
    );
  }
  return parseQrBingoEventConfig(data);
}

export function publicQrBingoEventConfig(
  config: QrBingoEventConfig,
): PublicQrBingoEventConfig {
  return {
    event_key: config.event_key,
    revision: config.revision,
    published: config.published,
    event_name: config.event_name,
    venue_name: config.venue_name,
    vendor_tag_id: config.vendor_tag_id,
    history_starts_at: config.history_starts_at,
    app_card_enabled: config.app_card_enabled,
    scan_enabled: config.scan_enabled,
    vendor_draws_enabled: config.vendor_draws_enabled,
    email_delivery_mode: config.email_delivery_mode,
    send_vendor_email: config.send_vendor_email,
    send_couple_email: config.send_couple_email,
    vendor_email_subject: config.vendor_email_subject,
    couple_email_subject: config.couple_email_subject,
    rules_version: config.rules_version,
    official_rules_url: config.official_rules_url,
    alternate_free_entry_url: config.alternate_free_entry_url,
    eligibility_region: config.eligibility_region,
    draw_opens_at: config.draw_opens_at,
    entry_closes_at: config.entry_closes_at,
    draw_at: config.draw_at,
  };
}
