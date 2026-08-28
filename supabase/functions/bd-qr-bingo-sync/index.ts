import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { nativeSessionMatchesCachedBdIdentity } from "../_shared/bd_identity.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EVENT_KEY = Deno.env.get("QR_BINGO_EVENT_KEY") || "niagara-wedding-show-2026";
const DRAW_OPENS_AT = Deno.env.get("QR_BINGO_DRAW_OPENS_AT") || "2026-10-18T19:00:00.000Z";
const TERMS_URL =
  Deno.env.get("QR_BINGO_RAFFLE_TERMS_URL") ||
  "https://www.weddingwin.ca/qr-bingo-vendor-draw-rules";
const TERMS_VERSION = "2026-08-28";
const RAFFLE_ADMINISTRATOR = "Wedding Win Inc.";
const APPLE_NON_SPONSOR_DISCLAIMER =
  "Apple Inc. is not a sponsor of and is not involved in this promotion, its administration, winner selection, or prize fulfillment.";
const GRAND_PRIZE_ENABLED = Deno.env.get("QR_BINGO_GRAND_PRIZE_ENABLED") === "true";
const GRAND_PRIZE_TITLE = Deno.env.get("QR_BINGO_GRAND_PRIZE_TITLE")?.trim() || "";
const GRAND_PRIZE_DESCRIPTION = Deno.env.get("QR_BINGO_GRAND_PRIZE_DESCRIPTION")?.trim() || "";
const GRAND_PRIZE_PROVIDER = Deno.env.get("QR_BINGO_GRAND_PRIZE_PROVIDER")?.trim() || "";
const GRAND_PRIZE_APPROX_VALUE_CAD = Number(Deno.env.get("QR_BINGO_GRAND_PRIZE_APPROX_VALUE_CAD") || 0);
const ELIGIBILITY_REGION =
  Deno.env.get("QR_BINGO_ELIGIBILITY_REGION")?.trim() ||
  "Ontario, Canada residents who have reached the age of majority";
const ELIGIBILITY_EXCLUSIONS =
  "Wedding Win Inc., participating prize providers, their employees, and members of those employees' immediate households are not eligible.";
const ENTRY_CLOSES_AT = Deno.env.get("QR_BINGO_ENTRY_CLOSES_AT") || DRAW_OPENS_AT;
const DRAW_AT = Deno.env.get("QR_BINGO_DRAW_AT") || DRAW_OPENS_AT;
const GRAND_PRIZE_ENTRY_CLOSES_AT = Deno.env.get("QR_BINGO_GRAND_PRIZE_ENTRY_CLOSES_AT") || ENTRY_CLOSES_AT;
const GRAND_PRIZE_DRAW_AT = Deno.env.get("QR_BINGO_GRAND_PRIZE_DRAW_AT") || DRAW_AT;
const ODDS_BASIS = "Odds depend on the number of eligible entries received; each eligible entry has an equal chance.";
const NO_PURCHASE_REQUIRED = true;
const SKILL_TESTING_QUESTION_REQUIRED = true;
const ALTERNATE_FREE_ENTRY_URL = Deno.env.get("QR_BINGO_ALTERNATE_FREE_ENTRY_URL")?.trim() || "";
const QR_DRAW_EMAIL_SEND_URL =
  Deno.env.get("QR_DRAW_EMAIL_SEND_URL") ||
  `${BD_API_BASE_URL}/qr-bingo-draw-email-send`;
const QR_DRAW_EMAIL_DELIVERY_MODE = Deno.env.get("QR_BINGO_DRAW_EMAIL_DELIVERY_MODE")?.trim() || "disabled";
const QR_DRAW_EMAILS_ENABLED = QR_DRAW_EMAIL_DELIVERY_MODE === "production_verified_fulfillment";
const QR_BINGO_VENDOR_TAG_ID = Deno.env.get("QR_BINGO_VENDOR_TAG_ID")?.trim() || "30";
const MAX_RAFFLE_DRAWS_PER_VENDOR = 1;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type BdEnvelope = {
  status?: string;
  message?: unknown;
};
type BdRow = Record<string, unknown>;
type NativeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};
type QrVendor = {
  id: string;
  name: string;
  cover_photo?: string;
  full_filename?: string;
  user_id?: string;
};
type QrPage = {
  vendors: QrVendor[];
  scanned: string[];
};
type AppReviewRaffleFixture = {
  id: string;
  event_key: string;
  couple_bd_user_id: string;
  vendor_bd_user_id: string;
  vendor_bingo_id: string;
  vendor_name: string;
  vendor_qr_payload: string;
  enabled: boolean;
  allow_early_draw: boolean;
  suppress_outbound_email: boolean;
  expires_at: string;
};
type RaffleSettings = {
  id?: string;
  event_key: string;
  vendor_bingo_id: string;
  vendor_bd_user_id: string;
  vendor_name: string;
  enabled: boolean;
  prize_title: string;
  prize_description: string;
  prize_approx_value_cad?: number | null;
  eligibility_region?: string | null;
  entry_closes_at?: string | null;
  draw_at?: string | null;
  odds_basis?: string | null;
  no_purchase_required?: boolean | null;
  skill_testing_question_required?: boolean | null;
  alternate_free_entry_url?: string | null;
  legal_terms_accepted: boolean;
  legal_terms_version: string;
  legal_terms_accepted_at?: string | null;
  official_rules_url?: string | null;
  rules_viewed_at?: string | null;
  administrator_name?: string | null;
  co_sponsor_name?: string | null;
  prize_provider_name?: string | null;
  apple_non_sponsor_acknowledged?: boolean | null;
  draw_opens_at: string;
  updated_at?: string | null;
};
type RaffleEntry = {
  id: string;
  event_key: string;
  vendor_bingo_id: string;
  vendor_bd_user_id: string;
  vendor_name: string;
  couple_bd_user_id: string;
  couple_name: string;
  couple_email: string;
  couple_phone: string;
  couple_wedding_date: string;
  consented_at: string;
  created_at: string;
  prize_title?: string;
  prize_description?: string;
  prize_approx_value_cad?: number;
  eligibility_region?: string;
  entry_closes_at?: string;
  draw_at?: string;
  odds_basis?: string;
  alternate_free_entry_url?: string;
  official_rules_url?: string;
  consent_version?: string;
  consent_text?: string;
  rules_viewed_at?: string;
  apple_non_sponsor_acknowledged?: boolean;
  contact_share_scope?: string;
  no_purchase_required?: boolean;
  skill_testing_question_required?: boolean;
  age_of_majority_attested?: boolean;
  residency_attested?: boolean;
  exclusions_attested?: boolean;
  eligibility_attested_at?: string;
  eligibility_attestation_text?: string;
  prize_provider_name?: string;
};
type RaffleDraw = {
  id: string;
  entry_id: string;
  vendor_bingo_id: string;
  vendor_bd_user_id: string;
  vendor_name: string;
  couple_bd_user_id: string;
  winner_name: string;
  winner_email: string;
  winner_phone: string;
  winner_wedding_date: string;
  prize_title: string;
  prize_description: string;
  selection_status?: "legacy" | "potential" | "verified" | "disqualified";
  eligibility_verified_at?: string | null;
  skill_question_verified_at?: string | null;
  verified_at?: string | null;
  draw_number: number;
  draw_reason: string;
  drawn_at: string;
  vendor_email_sent_at?: string | null;
  couple_email_sent_at?: string | null;
  email_error?: string;
};

const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function requireAdmin() {
  if (!admin) throw new Error("Supabase service role is not configured");
  return admin;
}

async function loadAppReviewRaffleFixture(userIdValue: unknown) {
  const userId = String(userIdValue || "").trim();
  if (!/^\d+$/.test(userId)) return null;
  const { data, error } = await requireAdmin()
    .from("app_review_raffle_fixtures")
    .select("*")
    .eq("enabled", true)
    .gt("expires_at", new Date().toISOString())
    .or(`couple_bd_user_id.eq.${userId},vendor_bd_user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  if (error) {
    // Production QR Bingo remains available during a staged deployment where
    // the additive review-fixture migration has not landed yet.
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw error;
  }
  return data as AppReviewRaffleFixture | null;
}

function appReviewFixtureVendor(fixture: AppReviewRaffleFixture): QrVendor {
  return {
    id: fixture.vendor_bingo_id,
    user_id: fixture.vendor_bd_user_id,
    name: fixture.vendor_name,
  };
}

async function appReviewFixtureScannedIds(fixture: AppReviewRaffleFixture) {
  const { data, error } = await requireAdmin()
    .from("app_review_raffle_fixture_scans")
    .select("vendor_bingo_id")
    .eq("fixture_id", fixture.id)
    .eq("couple_bd_user_id", fixture.couple_bd_user_id);
  if (error) throw error;
  return (data || []).map((row) => String(row.vendor_bingo_id || "")).filter(Boolean);
}

async function saveAppReviewFixtureScan(fixture: AppReviewRaffleFixture) {
  const { error } = await requireAdmin()
    .from("app_review_raffle_fixture_scans")
    .upsert({
      fixture_id: fixture.id,
      couple_bd_user_id: fixture.couple_bd_user_id,
      vendor_bingo_id: fixture.vendor_bingo_id,
    }, {
      onConflict: "fixture_id,couple_bd_user_id,vendor_bingo_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

function unwrapBdUser(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdRow) : undefined;
  }

  return message && typeof message === "object" ? (message as BdRow) : undefined;
}

async function callBd(path: string, init: RequestInit = {}) {
  if (!BD_API_KEY) throw new Error("BD_API_KEY is not configured");

  const response = await fetch(`${BD_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": BD_API_KEY,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: BdEnvelope;

  try {
    body = JSON.parse(text);
  } catch {
    body = { status: "error", message: text };
  }

  return { response, body };
}

async function fetchFullBdUserById(userId: string | number) {
  const fullUser = await callBd(
    `/api/v2/user/get/${encodeURIComponent(String(userId))}?include_tags=1`,
  );
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return unwrapBdUser(fullUser.body.message);
  }

  return undefined;
}

function appendCookie(cookieJar: Map<string, string>, setCookieHeaders: string[]) {
  for (const header of setCookieHeaders) {
    const firstPart = header.split(";")[0]?.trim();
    if (!firstPart) continue;
    const splitAt = firstPart.indexOf("=");
    if (splitAt <= 0) continue;
    cookieJar.set(firstPart.slice(0, splitAt), firstPart.slice(splitAt + 1));
  }
}

function getSetCookieHeaders(headers: Headers) {
  const withHelper = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withHelper.getSetCookie === "function") return withHelper.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeader(cookieJar: Map<string, string>) {
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchWithCookies(
  url: string,
  cookieJar: Map<string, string>,
  init: RequestInit = {},
) {
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      ...(cookieJar.size ? { Cookie: cookieHeader(cookieJar) } : {}),
      ...(init.headers || {}),
    },
  });
  appendCookie(cookieJar, getSetCookieHeaders(response.headers));
  return response;
}

async function loginWebsiteSession(session: NativeSession) {
  const token = String(session.token || "").trim();
  if (!token) throw new Error("Native session token missing");

  const cookieJar = new Map<string, string>();
  let nextUrl = `${BD_API_BASE_URL}/login/token/${encodeURIComponent(token)}/qr`;

  for (let i = 0; i < 5; i += 1) {
    const response = await fetchWithCookies(nextUrl, cookieJar);
    if (![301, 302, 303, 307, 308].includes(response.status)) break;

    const location = response.headers.get("location");
    if (!location) break;
    nextUrl = new URL(location, nextUrl).toString();
  }

  if (!cookieJar.size) {
    throw new Error("Website session could not be created for QR Bingo.");
  }

  return cookieJar;
}

function extractJsonAssignment<T>(html: string, name: string, fallback: T): T {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?);`);
  const match = html.match(pattern);
  if (!match?.[1]) return fallback;

  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return fallback;
  }
}

function normalizeVendor(value: unknown): QrVendor | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const userId = String(row.user_id || "").trim();
  const id = userId || String(row.id || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    cover_photo: String(row.cover_photo || "").trim() || undefined,
    full_filename: String(row.full_filename || "").trim() || undefined,
    user_id: userId || undefined,
  };
}

async function getQrPage(cookieJar: Map<string, string>) {
  const response = await fetchWithCookies(`${BD_API_BASE_URL}/qr`, cookieJar);
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`QR Bingo page unavailable (${response.status}).`);
  }
  if (/Please Log In/i.test(html)) {
    throw new Error("Website session expired before QR Bingo loaded.");
  }

  const vendors = extractJsonAssignment<unknown[]>(html, "VENDORS", [])
    .map(normalizeVendor)
    .filter((vendor): vendor is QrVendor => Boolean(vendor));
  const scanned = extractJsonAssignment<unknown[]>(html, "INITIAL_SCANNED", [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return { vendors, scanned };
}

async function postQrAction(cookieJar: Map<string, string>, params: URLSearchParams) {
  const response = await fetchWithCookies(`${BD_API_BASE_URL}/qr`, cookieJar, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await response.text();

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`QR Bingo returned an unexpected response (${response.status}).`);
  }
}

function cleanText(value: unknown, max = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function reviewedCurrentRules(body: Record<string, unknown>) {
  return body.rules_viewed === true &&
    body.apple_non_sponsor_acknowledged === true &&
    cleanText(body.consent_version, 80) === TERMS_VERSION;
}

function eligibilityAttested(body: Record<string, unknown>) {
  return body.age_of_majority_attested === true &&
    body.residency_attested === true &&
    body.exclusions_attested === true;
}

function validHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function positiveCadValue(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

function validPromotionTime(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

function validPromotionWindow(closesAt: string, drawAt: string) {
  const closeTime = new Date(closesAt).getTime();
  const drawTime = new Date(drawAt).getTime();
  return Number.isFinite(closeTime) && Number.isFinite(drawTime) && drawTime >= closeTime;
}

function drawAvailableAt(settings: RaffleSettings) {
  return new Date(Math.max(
    new Date(String(settings.entry_closes_at || ENTRY_CLOSES_AT)).getTime(),
    new Date(String(settings.draw_at || DRAW_AT)).getTime(),
    new Date(String(settings.draw_opens_at || DRAW_OPENS_AT)).getTime(),
  )).toISOString();
}

function materialSettingsFingerprint(settings: Partial<RaffleSettings>) {
  return JSON.stringify({
    prize_title: cleanText(settings.prize_title, 180),
    prize_description: cleanText(settings.prize_description, 1000),
    prize_approx_value_cad: positiveCadValue(settings.prize_approx_value_cad),
    legal_terms_version: cleanText(settings.legal_terms_version, 80),
    official_rules_url: cleanText(settings.official_rules_url, 500),
    eligibility_region: cleanText(settings.eligibility_region, 300),
    entry_closes_at: String(settings.entry_closes_at || ""),
    draw_at: String(settings.draw_at || ""),
    draw_opens_at: String(settings.draw_opens_at || ""),
    odds_basis: cleanText(settings.odds_basis, 500),
    no_purchase_required: settings.no_purchase_required === true,
    skill_testing_question_required: settings.skill_testing_question_required === true,
    prize_provider_name: cleanText(settings.prize_provider_name, 180),
    alternate_free_entry_url: cleanText(settings.alternate_free_entry_url, 500),
  });
}

function grandPrizeIsConfigured() {
  return Boolean(
    GRAND_PRIZE_ENABLED &&
      GRAND_PRIZE_TITLE &&
      GRAND_PRIZE_DESCRIPTION &&
      GRAND_PRIZE_PROVIDER &&
      positiveCadValue(GRAND_PRIZE_APPROX_VALUE_CAD) &&
      ELIGIBILITY_REGION &&
      validPromotionWindow(GRAND_PRIZE_ENTRY_CLOSES_AT, GRAND_PRIZE_DRAW_AT) &&
      validHttpsUrl(ALTERNATE_FREE_ENTRY_URL) &&
      TERMS_URL,
  );
}

function absoluteWeddingWinUrl(pathOrUrl: unknown) {
  const value = cleanText(pathOrUrl, 500);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${BD_API_BASE_URL.replace(/\/$/, "")}/${value.replace(/^\/+/, "")}`;
}

function displayName(user: BdRow | undefined) {
  const name = [
    cleanText(user?.first_name, 80),
    cleanText(user?.last_name, 80),
  ].filter(Boolean).join(" ");
  return name || cleanText(user?.company, 120) || cleanText(user?.email, 120);
}

function phoneForUser(user: BdRow | undefined) {
  return cleanText(user?.phone_number || user?.phone || user?.phone2 || user?.mobile_phone, 80);
}

function weddingDateForUser(user: BdRow | undefined) {
  return cleanText(user?.wedding_date || user?.custom_wedding_date || "", 80);
}

function vendorForCurrentUser(page: QrPage, user: BdRow | undefined) {
  const userId = String(user?.user_id || "").trim();
  const vendor = page.vendors.find((item) => String(item.user_id || "") === userId);
  return vendor ? { ...vendor, id: userId, user_id: userId } : null;
}

function isActiveBdUser(user: BdRow | undefined) {
  return String(user?.active ?? "").trim() === "2";
}

function containsBdTag(value: unknown, expectedTagId: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsBdTag(item, expectedTagId));
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of ["tag_id", "tagId", "id"]) {
      if (String(row[key] || "").trim() === expectedTagId) return true;
    }
    return Object.entries(row).some(([key, item]) =>
      key === expectedTagId || containsBdTag(item, expectedTagId)
    );
  }
  return String(value || "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .includes(expectedTagId);
}

function vendorFromTaggedBdUser(user: BdRow | undefined) {
  const userId = String(user?.user_id || "").trim();
  const hasVendorTag = [user?.tags, user?.member_tags, user?.tag_ids, user?.user_tags]
    .some((value) => containsBdTag(value, QR_BINGO_VENDOR_TAG_ID));
  const name = cleanText(user?.company, 180) || displayName(user);
  if (!userId || !isActiveBdUser(user) || !hasVendorTag || !name) return null;

  return {
    id: userId,
    name,
    cover_photo: cleanText(user?.image_main_file, 500) || undefined,
    full_filename: cleanText(user?.filename, 500) || undefined,
    user_id: userId,
  } as QrVendor;
}

async function resolveVendorForCurrentUser(page: QrPage, user: BdRow | undefined) {
  const taggedVendor = vendorFromTaggedBdUser(user);
  if (!taggedVendor) return null;

  // The authenticated BD user must currently be active and carry the event's
  // vendor tag. Page metadata may enrich that identity, but cannot authorize
  // an inactive/removed vendor through historical raffle records.
  const pageVendor = vendorForCurrentUser(page, user);
  return pageVendor ? { ...taggedVendor, ...pageVendor } : taggedVendor;
}

async function getFreshScanned(cookieJar: Map<string, string>, page: QrPage) {
  const serverScanned = await postQrAction(cookieJar, new URLSearchParams({ action: "get_scanned" }))
    .catch(() => undefined);
  return Array.isArray(serverScanned?.scanned)
    ? serverScanned.scanned.map((value) => String(value || "").trim()).filter(Boolean)
    : page.scanned;
}

async function getSettings(vendor: QrVendor, eventKey = EVENT_KEY) {
  const db = requireAdmin();
  const { data, error } = await db
    .from("qr_bingo_raffle_settings")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .maybeSingle();

  if (error) throw error;
  return data as RaffleSettings | null;
}

async function upsertSettings(vendor: QrVendor, fields: Partial<RaffleSettings>, eventKey = EVENT_KEY) {
  const db = requireAdmin();
  const payload = {
    event_key: eventKey,
    vendor_bingo_id: vendor.id,
    vendor_bd_user_id: String(vendor.user_id || ""),
    vendor_name: vendor.name,
    draw_opens_at: DRAW_OPENS_AT,
    updated_at: new Date().toISOString(),
    ...fields,
  };
  const { data, error } = await db
    .from("qr_bingo_raffle_settings")
    .upsert(payload, { onConflict: "event_key,vendor_bingo_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as RaffleSettings;
}

async function ensureSettings(vendor: QrVendor, eventKey = EVENT_KEY) {
  const existing = await getSettings(vendor, eventKey);
  if (existing) return existing;
  return upsertSettings(vendor, {
    enabled: false,
    prize_title: "",
    prize_description: "",
    prize_approx_value_cad: null,
    eligibility_region: ELIGIBILITY_REGION,
    entry_closes_at: ENTRY_CLOSES_AT,
    draw_at: DRAW_AT,
    odds_basis: ODDS_BASIS,
    no_purchase_required: NO_PURCHASE_REQUIRED,
    skill_testing_question_required: SKILL_TESTING_QUESTION_REQUIRED,
    alternate_free_entry_url: ALTERNATE_FREE_ENTRY_URL,
    legal_terms_accepted: false,
    legal_terms_version: TERMS_VERSION,
    official_rules_url: TERMS_URL,
    administrator_name: RAFFLE_ADMINISTRATOR,
    co_sponsor_name: RAFFLE_ADMINISTRATOR,
    prize_provider_name: vendor.name,
    apple_non_sponsor_acknowledged: false,
  }, eventKey);
}

function isSettingsEnterable(settings: RaffleSettings | null) {
  return Boolean(
    settings?.enabled &&
      settings.legal_terms_accepted &&
      settings.legal_terms_version === TERMS_VERSION &&
      settings.rules_viewed_at &&
      settings.apple_non_sponsor_acknowledged &&
      cleanText(settings.official_rules_url, 500) &&
      cleanText(settings.prize_provider_name, 180) &&
      cleanText(settings.prize_title, 160) &&
      cleanText(settings.prize_description, 1000) &&
      positiveCadValue(settings.prize_approx_value_cad) &&
      cleanText(settings.eligibility_region, 300) &&
      validPromotionTime(String(settings.entry_closes_at || "")) &&
      validPromotionTime(String(settings.draw_at || "")) &&
      new Date(String(settings.draw_at)).getTime() >= new Date(String(settings.entry_closes_at)).getTime() &&
      cleanText(settings.odds_basis, 500) &&
      settings.no_purchase_required === true &&
      settings.skill_testing_question_required === true
      && validHttpsUrl(cleanText(settings.alternate_free_entry_url, 500))
  );
}

function entryHasCurrentConsent(entry: Partial<RaffleEntry> | null | undefined) {
  return Boolean(
    entry?.id &&
      entry.consent_version === TERMS_VERSION &&
      entry.rules_viewed_at &&
      entry.apple_non_sponsor_acknowledged === true &&
      entry.contact_share_scope === "selected_potential_winner_only" &&
      entry.age_of_majority_attested === true &&
      entry.residency_attested === true &&
      entry.exclusions_attested === true &&
      entry.eligibility_attested_at &&
      cleanText(entry.consent_text, 2000) &&
      cleanText(entry.eligibility_attestation_text, 1000) &&
      cleanText(entry.prize_title, 180) &&
      cleanText(entry.prize_description, 1000) &&
      positiveCadValue(entry.prize_approx_value_cad) &&
      cleanText(entry.official_rules_url, 500) &&
      cleanText(entry.prize_provider_name, 180) &&
      cleanText(entry.eligibility_region, 300) &&
      validPromotionWindow(String(entry.entry_closes_at || ""), String(entry.draw_at || "")) &&
      cleanText(entry.odds_basis, 500) &&
      validHttpsUrl(cleanText(entry.alternate_free_entry_url, 500)) &&
      entry.no_purchase_required === true &&
      entry.skill_testing_question_required === true
  );
}

async function buildRaffleOffer(vendor: QrVendor, user: BdRow | undefined, eventKey = EVENT_KEY) {
  const settings = await getSettings(vendor, eventKey).catch(() => null);
  if (!isSettingsEnterable(settings)) return null;
  if (Date.now() >= new Date(String(settings?.entry_closes_at)).getTime()) return null;

  const db = requireAdmin();
  const { data: existing, error } = await db
    .from("qr_bingo_raffle_entries")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("couple_bd_user_id", String(user?.user_id || ""))
    .maybeSingle();
  if (error) throw error;
  // Legacy entries are deliberately offered the current rules again. Only a
  // fully current, explicitly attested entry suppresses the opt-in offer.
  if (entryHasCurrentConsent(existing as RaffleEntry | null)) return null;

  return {
    app_review_fixture: eventKey !== EVENT_KEY,
    outbound_email_suppressed: eventKey !== EVENT_KEY,
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    prize_title: settings?.prize_title || "",
    prize_description: settings?.prize_description || "",
    prize_approx_value_cad: positiveCadValue(settings?.prize_approx_value_cad),
    eligibility_region: settings?.eligibility_region || ELIGIBILITY_REGION,
    entry_closes_at: settings?.entry_closes_at || ENTRY_CLOSES_AT,
    draw_at: settings?.draw_at || DRAW_AT,
    odds_basis: settings?.odds_basis || ODDS_BASIS,
    no_purchase_required: true,
    skill_testing_question_required: true,
    alternate_free_entry_url: settings?.alternate_free_entry_url || ALTERNATE_FREE_ENTRY_URL,
    eligibility_exclusions: ELIGIBILITY_EXCLUSIONS,
    terms_url: TERMS_URL,
    consent_version: TERMS_VERSION,
    potential_winner_share_fields: ["name", "email", "phone", "wedding date"],
    administrator_name: RAFFLE_ADMINISTRATOR,
    co_sponsor_name: RAFFLE_ADMINISTRATOR,
    prize_provider_name: vendor.name,
    apple_non_sponsor_disclaimer: APPLE_NON_SPONSOR_DISCLAIMER,
  };
}

function consentText(vendorName: string) {
  return `I reviewed version ${TERMS_VERSION} of the official rules and authorize Wedding Win Inc. to use my entry data only to administer this draw. My contact information may be shared with ${vendorName} only if I am selected as a potential winner, solely for verification and prize fulfillment, and not for marketing. Wedding Win Inc. administers and co-sponsors the in-app draw; ${vendorName} supplies and fulfills its prize. ${APPLE_NON_SPONSOR_DISCLAIMER}`;
}

async function optInToRaffle(
  vendor: QrVendor,
  user: BdRow | undefined,
  body: Record<string, unknown>,
  eventKey = EVENT_KEY,
) {
  const settings = await getSettings(vendor, eventKey);
  const db = requireAdmin();
  const { data: existing, error: existingError } = await db
    .from("qr_bingo_raffle_entries")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("couple_bd_user_id", String(user?.user_id || ""))
    .maybeSingle();
  if (existingError) throw existingError;
  if (entryHasCurrentConsent(existing as RaffleEntry | null)) {
    return { entered: false, already_entered: true, message: "You are already entered for this vendor draw." };
  }
  if (!isSettingsEnterable(settings)) {
    return { entered: false, message: "This vendor draw is not open yet." };
  }
  if (Date.now() >= new Date(String(settings?.entry_closes_at)).getTime()) {
    return { entered: false, message: "This vendor draw has closed." };
  }
  if (!reviewedCurrentRules(body)) {
    return { entered: false, rules_required: true, message: "Review the current official rules before entering this draw." };
  }
  if (!eligibilityAttested(body)) {
    return { entered: false, eligibility_required: true, message: "Confirm the age, residency, and promotion-exclusion eligibility statements before entering." };
  }

  const acceptedAt = new Date().toISOString();
  const entryPayload = {
    event_key: eventKey,
    vendor_bingo_id: vendor.id,
    vendor_bd_user_id: String(vendor.user_id || ""),
    vendor_name: vendor.name,
    couple_bd_user_id: String(user?.user_id || ""),
    couple_name: displayName(user),
    couple_email: cleanText(user?.email, 160),
    couple_phone: phoneForUser(user),
    couple_wedding_date: weddingDateForUser(user),
    consent_share_contact: true,
    contact_share_scope: "selected_potential_winner_only",
    consent_text: consentText(vendor.name),
    consent_version: TERMS_VERSION,
    consented_at: acceptedAt,
    prize_title: settings?.prize_title || "",
    prize_description: settings?.prize_description || "",
    official_rules_url: TERMS_URL,
    rules_viewed_at: acceptedAt,
    administrator_name: RAFFLE_ADMINISTRATOR,
    co_sponsor_name: RAFFLE_ADMINISTRATOR,
    prize_provider_name: vendor.name,
    apple_non_sponsor_acknowledged: true,
    prize_approx_value_cad: positiveCadValue(settings?.prize_approx_value_cad),
    eligibility_region: settings?.eligibility_region || ELIGIBILITY_REGION,
    entry_closes_at: settings?.entry_closes_at || ENTRY_CLOSES_AT,
    draw_at: settings?.draw_at || DRAW_AT,
    odds_basis: settings?.odds_basis || ODDS_BASIS,
    no_purchase_required: true,
    skill_testing_question_required: true,
    alternate_free_entry_url: settings?.alternate_free_entry_url || ALTERNATE_FREE_ENTRY_URL,
    age_of_majority_attested: true,
    residency_attested: true,
    exclusions_attested: true,
    eligibility_attested_at: acceptedAt,
    eligibility_attestation_text: `I have reached the age of majority, reside in ${settings?.eligibility_region || ELIGIBILITY_REGION}, and am not excluded under the official rules.`,
  };

  if (existing?.id) {
    // `created_at` and the stable entry id are intentionally omitted from the
    // update so the original entry/audit anchor survives explicit re-consent.
    const { data: updated, error: updateError } = await db
      .from("qr_bingo_raffle_entries")
      .update(entryPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return {
      entered: true,
      reconsented: true,
      entry: updated as RaffleEntry,
      message: "Your entry now records the current rules and eligibility attestations.",
    };
  }

  const { data, error } = await db
    .from("qr_bingo_raffle_entries")
    .insert(entryPayload)
    .select("*")
    .single();

  if (error && error.code === "23505") {
    const { data: concurrent, error: concurrentError } = await db
      .from("qr_bingo_raffle_entries")
      .select("*")
      .eq("event_key", eventKey)
      .eq("vendor_bingo_id", vendor.id)
      .eq("couple_bd_user_id", String(user?.user_id || ""))
      .maybeSingle();
    if (concurrentError) throw concurrentError;
    if (entryHasCurrentConsent(concurrent as RaffleEntry | null)) {
      return { entered: false, already_entered: true, message: "You are already entered for this vendor draw." };
    }
    if (concurrent?.id) {
      const { data: updated, error: updateError } = await db
        .from("qr_bingo_raffle_entries")
        .update(entryPayload)
        .eq("id", concurrent.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      return { entered: true, reconsented: true, entry: updated as RaffleEntry };
    }
  }
  if (error) throw error;
  return { entered: true, entry: data as RaffleEntry };
}

async function grandPrizeState(user: BdRow | undefined, completed: boolean) {
  const configured = grandPrizeIsConfigured();
  const db = requireAdmin();
  const { data: existing, error } = await db
    .from("qr_bingo_grand_prize_entries")
    .select("id, consented_at")
    .eq("event_key", EVENT_KEY)
    .eq("couple_bd_user_id", String(user?.user_id || ""))
    .maybeSingle();
  if (error) throw error;

  return {
    grand_prize_available: configured,
    grand_prize_entry_confirmed: Boolean(existing?.id),
    grand_prize_offer: configured && completed && !existing?.id && Date.now() < new Date(GRAND_PRIZE_ENTRY_CLOSES_AT).getTime()
      ? {
          prize_title: GRAND_PRIZE_TITLE,
          prize_description: GRAND_PRIZE_DESCRIPTION,
          prize_approx_value_cad: positiveCadValue(GRAND_PRIZE_APPROX_VALUE_CAD),
          eligibility_region: ELIGIBILITY_REGION,
          entry_closes_at: GRAND_PRIZE_ENTRY_CLOSES_AT,
          draw_at: GRAND_PRIZE_DRAW_AT,
          odds_basis: ODDS_BASIS,
          no_purchase_required: true,
          skill_testing_question_required: true,
          alternate_free_entry_url: ALTERNATE_FREE_ENTRY_URL,
          eligibility_exclusions: ELIGIBILITY_EXCLUSIONS,
          prize_provider_name: GRAND_PRIZE_PROVIDER,
          administrator_name: RAFFLE_ADMINISTRATOR,
          sponsor_name: RAFFLE_ADMINISTRATOR,
          terms_url: TERMS_URL,
          consent_version: TERMS_VERSION,
          apple_non_sponsor_disclaimer: APPLE_NON_SPONSOR_DISCLAIMER,
        }
      : null,
  };
}

async function optInToGrandPrize(
  user: BdRow | undefined,
  completed: boolean,
  body: Record<string, unknown>,
) {
  if (!grandPrizeIsConfigured()) {
    return jsonResponse({
      ok: false,
      error: "Grand-prize entry is not open until the prize and official rules are configured.",
    }, 503);
  }
  if (!completed) {
    return jsonResponse({ ok: false, error: "Scan every current-event vendor before entering the grand-prize draw." }, 403);
  }
  if (Date.now() >= new Date(GRAND_PRIZE_ENTRY_CLOSES_AT).getTime()) {
    return jsonResponse({ ok: false, error: "Grand-prize entry has closed.", entry_closes_at: GRAND_PRIZE_ENTRY_CLOSES_AT }, 403);
  }
  if (!reviewedCurrentRules(body)) {
    return jsonResponse({ ok: false, rules_required: true, error: "Review the current official rules before entering." }, 400);
  }
  if (!eligibilityAttested(body)) {
    return jsonResponse({ ok: false, eligibility_required: true, error: "Confirm the age, residency, and promotion-exclusion eligibility statements before entering." }, 400);
  }

  const db = requireAdmin();
  const acceptedAt = new Date().toISOString();
  const consent = `I reviewed version ${TERMS_VERSION} of the official rules and voluntarily enter the ${GRAND_PRIZE_TITLE}. My entry data may be used only for administration, verification, and prize fulfillment, not marketing. Wedding Win Inc. administers and sponsors this in-app promotion; ${GRAND_PRIZE_PROVIDER} supplies or fulfills the prize. ${APPLE_NON_SPONSOR_DISCLAIMER}`;
  const { data, error } = await db
    .from("qr_bingo_grand_prize_entries")
    .insert({
      event_key: EVENT_KEY,
      couple_bd_user_id: String(user?.user_id || ""),
      couple_name: displayName(user),
      couple_email: cleanText(user?.email, 160),
      couple_phone: phoneForUser(user),
      couple_wedding_date: weddingDateForUser(user),
      prize_title: GRAND_PRIZE_TITLE,
      prize_description: GRAND_PRIZE_DESCRIPTION,
      prize_approx_value_cad: positiveCadValue(GRAND_PRIZE_APPROX_VALUE_CAD),
      eligibility_region: ELIGIBILITY_REGION,
      entry_closes_at: GRAND_PRIZE_ENTRY_CLOSES_AT,
      draw_at: GRAND_PRIZE_DRAW_AT,
      odds_basis: ODDS_BASIS,
      no_purchase_required: true,
      skill_testing_question_required: true,
      alternate_free_entry_url: ALTERNATE_FREE_ENTRY_URL,
      age_of_majority_attested: true,
      residency_attested: true,
      exclusions_attested: true,
      eligibility_attested_at: acceptedAt,
      eligibility_attestation_text: `I have reached the age of majority, reside in ${ELIGIBILITY_REGION}, and am not excluded under the official rules.`,
      official_rules_url: TERMS_URL,
      rules_version: TERMS_VERSION,
      rules_viewed_at: acceptedAt,
      consent_text: consent,
      consented_at: acceptedAt,
      administrator_name: RAFFLE_ADMINISTRATOR,
      sponsor_name: RAFFLE_ADMINISTRATOR,
      prize_provider_name: GRAND_PRIZE_PROVIDER,
      apple_non_sponsor_acknowledged: true,
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    return jsonResponse({ ok: true, already_entered: true, grand_prize_entry_confirmed: true });
  }
  if (error) throw error;
  return jsonResponse({ ok: true, entered: true, entry: data, grand_prize_entry_confirmed: true });
}

async function getVendorRaffleDashboard(
  vendor: QrVendor,
  user?: BdRow,
  eventKey = EVENT_KEY,
  allowEarlyDraw = false,
  suppressOutboundEmail = false,
) {
  const db = requireAdmin();
  const settings = await ensureSettings(vendor, eventKey);
  const { count: entryCount, error: entriesError } = await db
    .from("qr_bingo_raffle_entries")
    .select("id", { count: "exact", head: true })
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id);
  if (entriesError) throw entriesError;

  const { data: draws, error: drawsError } = await db
    .from("qr_bingo_raffle_draws")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .order("draw_number", { ascending: false });
  if (drawsError) throw drawsError;

  const drawCount = (draws || []).filter((draw) =>
    draw.selection_status === "potential" || draw.selection_status === "verified"
  ).length;
  const maxDraws = MAX_RAFFLE_DRAWS_PER_VENDOR;
  const drawsRemaining = Math.max(0, maxDraws - drawCount);
  const availableAt = drawAvailableAt(settings);
  const drawTimeOpen = allowEarlyDraw || Date.now() >= new Date(availableAt).getTime();
  const verifiedNoticePending = (draws || []).some((draw) =>
    draw.selection_status === "verified" && (!draw.vendor_email_sent_at || !draw.couple_email_sent_at)
  );
  const verifiedNoticeCanSend = verifiedNoticePending && !suppressOutboundEmail && QR_DRAW_EMAILS_ENABLED;

  return {
    settings: {
      ...settings,
      legal_terms_accepted: Boolean(
        settings.legal_terms_accepted &&
          settings.legal_terms_version === TERMS_VERSION &&
          settings.rules_viewed_at &&
          settings.apple_non_sponsor_acknowledged,
      ),
    },
    // Entrant contact data is not exposed or exportable. Only the selected
    // potential winner appears in draw history for verification/fulfillment.
    entries: [],
    entry_count: entryCount || 0,
    material_terms_locked: (entryCount || 0) > 0,
    draws: (draws || []) as RaffleDraw[],
    draw_opens_at: availableAt,
    entry_closes_at: settings.entry_closes_at || ENTRY_CLOSES_AT,
    draw_at: settings.draw_at || DRAW_AT,
    eligibility_region: settings.eligibility_region || ELIGIBILITY_REGION,
    odds_basis: settings.odds_basis || ODDS_BASIS,
    no_purchase_required: true,
    skill_testing_question_required: true,
    max_draws: maxDraws,
    draws_remaining: drawsRemaining,
    draw_limit_reached: drawsRemaining <= 0,
    can_draw: isSettingsEnterable(settings) && drawTimeOpen && (drawsRemaining > 0 || verifiedNoticeCanSend),
    can_send_verified_winner_notice: verifiedNoticeCanSend,
    verified_potential_winner_notice_pending: verifiedNoticePending,
    outbound_email_enabled: QR_DRAW_EMAILS_ENABLED && !suppressOutboundEmail,
    app_review_fixture: eventKey !== EVENT_KEY,
    outbound_email_suppressed: suppressOutboundEmail,
    terms_url: TERMS_URL,
    rules_version: TERMS_VERSION,
    rules_current: isSettingsEnterable({ ...settings, enabled: true }),
    administrator_name: RAFFLE_ADMINISTRATOR,
    co_sponsor_name: RAFFLE_ADMINISTRATOR,
    prize_provider_name: vendor.name,
    apple_non_sponsor_disclaimer: APPLE_NON_SPONSOR_DISCLAIMER,
  };
}

async function loadQrDrawEmailSigningKey() {
  const { data, error } = await requireAdmin().rpc("get_qr_draw_email_private_key");
  if (error) {
    throw new Error(`QR draw email signing key unavailable: ${error.message}`);
  }

  const pem = typeof data === "string" ? data.trim() : "";
  const encoded = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  if (!encoded || !pem.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("QR draw email signing key unavailable: RPC returned no PKCS#8 private key.");
  }

  try {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    return await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new Error("QR draw email signing key unavailable: invalid PKCS#8 private key.");
  }
}

async function rsaSha256Base64(payload: string, signingKey: CryptoKey) {
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function sendWebsiteDrawEmails(
  payload: Record<string, string>,
  signingKey: CryptoKey,
) {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const payloadText = JSON.stringify(payload);
  const signature = await rsaSha256Base64(`${payloadText}|${expires}`, signingKey);
  const params = new URLSearchParams({
    ww_qr_draw_email_action: "send_draw",
    payload: payloadText,
    expires: String(expires),
    signature,
  });

  const response = await fetch(QR_DRAW_EMAIL_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { ok: false, message: text };
  }

  if (!response.ok || body.ok !== true) {
    const message = cleanText(body.message || `WeddingWin email HTTP ${response.status}`, 1000);
    return {
      vendor: { sent: body.vendor_sent === true, error: body.vendor_sent === true ? "" : message },
      couple: { sent: body.couple_sent === true, error: body.couple_sent === true ? "" : message },
      raw: body,
    };
  }

  return {
    vendor: {
      sent: body.vendor_sent !== false,
      error: body.vendor_sent === false ? "Vendor email could not be sent." : "",
    },
    couple: {
      sent: body.couple_sent !== false,
      error: body.couple_sent === false ? "Couple email could not be sent." : "",
    },
    raw: body,
  };
}

async function sendDrawEmails(
  vendorUser: BdRow | undefined,
  draw: RaffleDraw,
  signingKey: CryptoKey,
  vendor?: QrVendor,
) {
  if (
    draw.selection_status !== "verified" ||
    !draw.eligibility_verified_at ||
    !draw.skill_question_verified_at ||
    !draw.verified_at
  ) {
    throw new Error("Potential-winner fulfillment notices are blocked until Wedding Win verifies eligibility and the skill-testing answer.");
  }
  if (!QR_DRAW_EMAILS_ENABLED) {
    throw new Error("Outbound potential-winner notices are disabled until the production verified-fulfillment delivery mode is explicitly configured.");
  }
  const vendorAlreadySent = Boolean(draw.vendor_email_sent_at);
  const coupleAlreadySent = Boolean(draw.couple_email_sent_at);
  if (vendorAlreadySent && coupleAlreadySent) {
    return {
      vendor: { sent: true, already_sent: true, error: "" },
      couple: { sent: true, already_sent: true, error: "" },
      error: "",
    };
  }

  const vendorEmail = cleanText(vendorUser?.email, 160);
  const safePrize = cleanText(draw.prize_title, 200);
  const safeVendorName = cleanText(draw.vendor_name, 160);
  const safePrizeDescription = cleanText(draw.prize_description, 1000) || "Prize details will be provided by the vendor.";
  const safeDrawItem = safePrizeDescription || safePrize || "the booth draw item";
  const safeWinnerPhone = cleanText(draw.winner_phone, 120) || "Not provided";
  const safeWinnerWeddingDate = cleanText(draw.winner_wedding_date, 120) || "Not provided";
  const vendorProfileUrl = absoluteWeddingWinUrl(vendor?.full_filename || vendorUser?.filename);
  const profileLine = vendorProfileUrl
    ? `Connect through WeddingWin.ca: ${vendorProfileUrl}`
    : "You can connect with them through WeddingWin.ca.";
  const vendorText = [
    "Wedding Win has verified this QR Bingo booth draw potential winner's eligibility and skill-testing answer.",
    "",
    "Winner details",
    `Name: ${cleanText(draw.winner_name, 160)}`,
    `Email: ${cleanText(draw.winner_email, 160)}`,
    `Phone: ${safeWinnerPhone}`,
    `Wedding date: ${safeWinnerWeddingDate}`,
    "",
    "Draw record",
    "Prize details are included below for your reference.",
    safeDrawItem,
    "",
    "Couple notification",
    "WeddingWin.ca has informed the verified potential winner that your business may contact them solely to verify and fulfill the prize.",
    "",
    "Next step",
    "Use these details only to verify or fulfill this prize. Marketing use is prohibited without separate consent.",
  ].join("\n");
  const coupleText = [
    `Hi ${cleanText(draw.winner_name, 80) || "there"},`,
    "",
    `You were selected as a potential winner in ${safeVendorName}'s draw. Wedding Win verified your eligibility and skill-testing answer.`,
    "",
    "Your draw",
    `Vendor: ${safeVendorName}`,
    `Draw item: ${safeDrawItem}`,
    "",
    "What happens next",
    `${safeVendorName} may contact you only to verify and arrange this prize's fulfillment. This notice does not itself award the prize.`,
    profileLine,
    "",
    "Why you received this",
    "You opted in after scanning this vendor's QR code at the wedding show.",
    "",
    "WeddingWin.ca",
  ].join("\n");

  let emailSend;
  try {
    emailSend = await sendWebsiteDrawEmails({
      winner_verified: "1",
      event_key: EVENT_KEY,
      delivery_mode: QR_DRAW_EMAIL_DELIVERY_MODE,
      verification_state: "verified_potential_winner",
      send_vendor: vendorAlreadySent ? "0" : "1",
      send_couple: coupleAlreadySent ? "0" : "1",
      vendor_to: vendorEmail,
      vendor_subject: "WeddingWin QR Bingo: Verified Potential Winner Contact",
      vendor_text: vendorText,
      couple_to: cleanText(draw.winner_email, 160),
      couple_subject: "QR Bingo potential-winner verification complete",
      couple_text: coupleText,
    }, signingKey);
  } catch (error) {
    const message = cleanText(error instanceof Error ? error.message : String(error), 1000) || "Email delivery failed.";
    emailSend = {
      vendor: { sent: false, error: message },
      couple: { sent: false, error: message },
    };
  }
  const vendorResult = vendorAlreadySent
    ? { sent: true, already_sent: true, error: "" }
    : emailSend.vendor;
  const coupleResult = coupleAlreadySent
    ? { sent: true, already_sent: true, error: "" }
    : emailSend.couple;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  const errors: string[] = [];
  if (!vendorAlreadySent) {
    if (vendorResult.sent) updates.vendor_email_sent_at = now;
    else errors.push(`vendor email: ${vendorResult.error}`);
  }
  if (!coupleAlreadySent) {
    if (coupleResult.sent) updates.couple_email_sent_at = now;
    else errors.push(`couple email: ${coupleResult.error}`);
  }
  updates.email_error = errors.join(" | ");

  const db = requireAdmin();
  const { error: updateError } = await db.from("qr_bingo_raffle_draws").update(updates).eq("id", draw.id);
  if (updateError) throw updateError;
  return { vendor: vendorResult, couple: coupleResult, error: updates.email_error };
}

async function drawWinner(
  vendor: QrVendor,
  user: BdRow | undefined,
  reason: string,
  eventKey = EVENT_KEY,
  allowEarlyDraw = false,
  suppressOutboundEmail = false,
) {
  const db = requireAdmin();
  const settings = await ensureSettings(vendor, eventKey);
  if (!isSettingsEnterable(settings)) {
    return jsonResponse({ ok: false, error: "Turn on the draw, add the prize, and accept the rules first." }, 400);
  }
  const availableAt = drawAvailableAt(settings);
  if (!allowEarlyDraw && Date.now() < new Date(availableAt).getTime()) {
    return jsonResponse({
      ok: false,
      error: "Draw is not open yet.",
      draw_opens_at: availableAt,
    }, 403);
  }

  const { data: entries, error: entriesError } = await db
    .from("qr_bingo_raffle_entries")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("consent_version", TERMS_VERSION)
    .eq("age_of_majority_attested", true)
    .eq("residency_attested", true)
    .eq("exclusions_attested", true)
    .order("created_at", { ascending: true });
  if (entriesError) throw entriesError;
  if (!entries?.length) return jsonResponse({ ok: false, error: "No couples have opted into this vendor draw yet." }, 400);

  const { data: draws, error: drawsError } = await db
    .from("qr_bingo_raffle_draws")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .order("draw_number", { ascending: false });
  if (drawsError) throw drawsError;
  const existingDraw = (draws || [])[0] as RaffleDraw | undefined;
  if (existingDraw?.selection_status === "potential") {
    const dashboard = await getVendorRaffleDashboard(vendor, user, eventKey, allowEarlyDraw, suppressOutboundEmail);
    return jsonResponse({
      ok: false,
      awaiting_verification: true,
      error: "A potential winner has already been selected. Wedding Win must verify eligibility and the skill-testing answer before any fulfillment notice or prize claim.",
      draw: existingDraw,
      ...dashboard,
    }, 409);
  }
  if (
    existingDraw?.selection_status === "verified" &&
    (!existingDraw.vendor_email_sent_at || !existingDraw.couple_email_sent_at)
  ) {
    if (suppressOutboundEmail) {
      const dashboard = await getVendorRaffleDashboard(vendor, user, eventKey, allowEarlyDraw, true);
      return jsonResponse({
        ok: true,
        draw: existingDraw,
        message: "The isolated App Review fixture never sends outbound email.",
        ...dashboard,
      });
    }
    if (!QR_DRAW_EMAILS_ENABLED) {
      return jsonResponse({
        ok: false,
        outbound_email_disabled: true,
        error: "Outbound potential-winner notices are disabled until Wedding Win explicitly enables the production verified-fulfillment delivery mode.",
      }, 503);
    }
    const signingKey = await loadQrDrawEmailSigningKey();
    const email_result = await sendDrawEmails(user, existingDraw, signingKey, vendor);
    const dashboard = await getVendorRaffleDashboard(vendor, user, eventKey, allowEarlyDraw, suppressOutboundEmail);
    return jsonResponse({ ok: true, draw: existingDraw, email_result, verified_winner_notice: true, ...dashboard });
  }

  const maxDraws = MAX_RAFFLE_DRAWS_PER_VENDOR;
  const activeSelectionCount = (draws || []).filter((draw) =>
    draw.selection_status === "potential" || draw.selection_status === "verified"
  ).length;
  if (activeSelectionCount >= maxDraws) {
    return jsonResponse({
      ok: false,
      error: "The single potential-winner selection for this promotion has already been used.",
      max_draws: maxDraws,
      draws_remaining: 0,
      draw_limit_reached: true,
    }, 400);
  }

  const priorEntryIds = new Set((draws || []).map((draw) => String(draw.entry_id)));
  const unusedEntries = entries.filter((entry) => !priorEntryIds.has(String(entry.id)));
  const eligible = unusedEntries.length ? unusedEntries : entries;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const winner = eligible[random[0] % eligible.length] as RaffleEntry;
  const nextDrawNumber = Number(draws?.[0]?.draw_number || 0) + 1;

  const { data: draw, error: drawError } = await db
    .from("qr_bingo_raffle_draws")
    .insert({
      event_key: eventKey,
      vendor_bingo_id: vendor.id,
      vendor_bd_user_id: String(vendor.user_id || ""),
      vendor_name: vendor.name,
      entry_id: winner.id,
      couple_bd_user_id: winner.couple_bd_user_id,
      winner_name: winner.couple_name,
      winner_email: winner.couple_email,
      winner_phone: winner.couple_phone,
      winner_wedding_date: winner.couple_wedding_date,
      prize_title: winner.prize_title || settings.prize_title,
      prize_description: winner.prize_description || settings.prize_description,
      prize_approx_value_cad: positiveCadValue(winner.prize_approx_value_cad || settings.prize_approx_value_cad),
      eligibility_region: winner.eligibility_region || settings.eligibility_region || ELIGIBILITY_REGION,
      entry_closes_at: winner.entry_closes_at || settings.entry_closes_at || ENTRY_CLOSES_AT,
      scheduled_draw_at: winner.draw_at || settings.draw_at || DRAW_AT,
      odds_basis: winner.odds_basis || settings.odds_basis || ODDS_BASIS,
      no_purchase_required: true,
      skill_testing_question_required: true,
      official_rules_url: winner.official_rules_url || TERMS_URL,
      rules_version: winner.consent_version || TERMS_VERSION,
      administrator_name: RAFFLE_ADMINISTRATOR,
      co_sponsor_name: RAFFLE_ADMINISTRATOR,
      prize_provider_name: vendor.name,
      apple_non_sponsor_disclaimer: APPLE_NON_SPONSOR_DISCLAIMER,
      alternate_free_entry_url: winner.alternate_free_entry_url || settings.alternate_free_entry_url || ALTERNATE_FREE_ENTRY_URL,
      selection_status: "potential",
      draw_number: nextDrawNumber,
      draw_reason: cleanText(reason, 120) || "initial",
      drawn_by_bd_user_id: String(user?.user_id || ""),
    })
    .select("*")
    .single();
  if (drawError) throw drawError;

  const dashboard = await getVendorRaffleDashboard(vendor, user, eventKey, allowEarlyDraw, suppressOutboundEmail);
  return jsonResponse({
    ok: true,
    draw,
    potential_winner_selected: true,
    verification_required: true,
    message: "Potential winner selected. No fulfillment notice or prize claim is allowed until Wedding Win verifies eligibility and the skill-testing answer.",
    ...dashboard,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const nativeSession = body?.native_session as NativeSession | undefined;
    const action = String(body?.action || "list");

    if (!nativeSession?.user_id || !nativeSession?.token) {
      return jsonResponse({ ok: false, error: "Native session required" }, 401);
    }

    if (!await nativeSessionMatchesCachedBdIdentity(nativeSession)) {
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }

    // BD v2 intentionally strips token/cookie fields, so it is used only to
    // confirm the cached identity still maps to an existing member.
    const user = await fetchFullBdUserById(nativeSession.user_id);
    if (!user?.user_id || String(user.user_id) !== String(nativeSession.user_id)) {
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }
    const reviewFixture = await loadAppReviewRaffleFixture(user.user_id);
    const isReviewCouple = Boolean(
      reviewFixture && String(user.user_id) === reviewFixture.couple_bd_user_id,
    );
    const isReviewVendor = Boolean(
      reviewFixture && String(user.user_id) === reviewFixture.vendor_bd_user_id,
    );

    const isVendorRaffleAction = action === "vendor_raffle_get" ||
      action === "vendor_raffle_update" || action === "vendor_raffle_draw";
    const cookieJar = isVendorRaffleAction
      ? await loginWebsiteSession(nativeSession).catch(() => new Map<string, string>())
      : await loginWebsiteSession(nativeSession);
    const page = isVendorRaffleAction
      ? cookieJar.size
        ? await getQrPage(cookieJar).catch(() => ({ vendors: [], scanned: [] } as QrPage))
        : ({ vendors: [], scanned: [] } as QrPage)
      : await getQrPage(cookieJar);
    if (reviewFixture && isReviewCouple) {
      const reviewVendor = appReviewFixtureVendor(reviewFixture);
      page.vendors = [
        ...page.vendors.filter((vendor) => vendor.id !== reviewVendor.id),
        reviewVendor,
      ];
    }
    // `get_scanned` is a couple-only website action. Vendor dashboards resolve
    // against VENDORS, the tag-30 BD API response, or existing raffle history.
    const productionScanned = isVendorRaffleAction ? [] : await getFreshScanned(cookieJar, page);
    const reviewScanned = reviewFixture && isReviewCouple
      ? await appReviewFixtureScannedIds(reviewFixture)
      : [];
    const scanned = [...new Set([...productionScanned, ...reviewScanned])];

    if (action === "scan") {
      const vendorId = String(body?.vendor_id || "").trim();
      const matchedVendor = page.vendors.find((vendor) => vendor.id === vendorId);
      if (!matchedVendor) return jsonResponse({ ok: false, error: "Vendor id required" }, 400);

      const isReviewScan = Boolean(
        reviewFixture && isReviewCouple && vendorId === reviewFixture.vendor_bingo_id,
      );
      if (isReviewScan && reviewFixture) {
        await saveAppReviewFixtureScan(reviewFixture);
        const freshScanned = [...new Set([...scanned, reviewFixture.vendor_bingo_id])];
        const raffleOffer = await buildRaffleOffer(matchedVendor, user, reviewFixture.event_key);
        const completed = page.vendors.length > 0 && freshScanned.length >= page.vendors.length;
        const grandPrize = await grandPrizeState(user, completed);
        return jsonResponse({
          ok: true,
          app_review_fixture: true,
          outbound_email_suppressed: true,
          vendors: page.vendors,
          scanned: freshScanned,
          scanned_count: freshScanned.length,
          total_count: page.vendors.length,
          matched_vendor: matchedVendor,
          raffle_offer: raffleOffer,
          completed,
          ...grandPrize,
        });
      }

      const scanResult = await postQrAction(
        cookieJar,
        new URLSearchParams({ action: "scan_vendor", vendor_id: vendorId }),
      );
      if (scanResult.status !== "success") {
        return jsonResponse({
          ok: false,
          error: "Vendor scan could not be saved.",
          detail: String(scanResult.message || scanResult.error || "Unknown QR Bingo error"),
        }, 502);
      }

      const freshScanned = [...new Set([
        ...await getFreshScanned(cookieJar, page),
        ...reviewScanned,
      ])];
      const raffleOffer = await buildRaffleOffer(matchedVendor, user);
      const completed = page.vendors.length > 0 && freshScanned.length >= page.vendors.length;
      const grandPrize = await grandPrizeState(user, completed);
      return jsonResponse({
        ok: true,
        vendors: page.vendors,
        scanned: freshScanned,
        scanned_count: freshScanned.length,
        total_count: page.vendors.length,
        matched_vendor: matchedVendor,
        raffle_offer: raffleOffer,
        completed,
        ...grandPrize,
      });
    }

    if (action === "raffle_opt_in") {
      const vendorId = String(body?.vendor_id || "").trim();
      const vendor = page.vendors.find((item) => item.id === vendorId);
      if (!vendor) return jsonResponse({ ok: false, error: "Vendor draw not found." }, 404);
      if (!scanned.includes(vendor.id)) {
        return jsonResponse({ ok: false, error: "Scan this vendor before entering the draw." }, 403);
      }
      const raffleEventKey = reviewFixture && isReviewCouple && vendor.id === reviewFixture.vendor_bingo_id
        ? reviewFixture.event_key
        : EVENT_KEY;
      const result = await optInToRaffle(vendor, user, body as Record<string, unknown>, raffleEventKey);
      const alreadyEntered = "already_entered" in result && result.already_entered === true;
      const rulesRequired = "rules_required" in result && result.rules_required === true;
      const eligibilityRequired = "eligibility_required" in result && result.eligibility_required === true;
      return jsonResponse(
        { ok: result.entered || alreadyEntered, ...result },
        rulesRequired || eligibilityRequired ? 400 : 200,
      );
    }

    if (action === "grand_prize_opt_in") {
      const completed = page.vendors.length > 0 && scanned.length >= page.vendors.length;
      return optInToGrandPrize(user, completed, body as Record<string, unknown>);
    }

    if (action === "vendor_raffle_get") {
      const vendor = reviewFixture && isReviewVendor
        ? appReviewFixtureVendor(reviewFixture)
        : await resolveVendorForCurrentUser(page, user);
      if (!vendor) {
        return jsonResponse({ ok: false, error: "This account is not on the QR Bingo vendor list." }, 403);
      }
      const dashboard = await getVendorRaffleDashboard(
        vendor,
        user,
        reviewFixture && isReviewVendor ? reviewFixture.event_key : EVENT_KEY,
        Boolean(reviewFixture && isReviewVendor && reviewFixture.allow_early_draw),
        Boolean(reviewFixture && isReviewVendor && reviewFixture.suppress_outbound_email),
      );
      return jsonResponse({ ok: true, vendor, ...dashboard });
    }

    if (action === "vendor_raffle_update") {
      const vendor = reviewFixture && isReviewVendor
        ? appReviewFixtureVendor(reviewFixture)
        : await resolveVendorForCurrentUser(page, user);
      if (!vendor) {
        return jsonResponse({ ok: false, error: "This account is not on the QR Bingo vendor list." }, 403);
      }
      const enabled = Boolean(body?.enabled);
      const legalTermsAccepted = Boolean(body?.legal_terms_accepted);
      const rulesReviewed = reviewedCurrentRules(body as Record<string, unknown>);
      const clientSettingsUpdatedAt = cleanText(body?.settings_updated_at, 80);
      const raffleEventKey = reviewFixture && isReviewVendor ? reviewFixture.event_key : EVENT_KEY;
      const allowEarlyDraw = Boolean(reviewFixture && isReviewVendor && reviewFixture.allow_early_draw);
      const suppressOutboundEmail = Boolean(reviewFixture && isReviewVendor && reviewFixture.suppress_outbound_email);
      const currentSettings = await ensureSettings(vendor, raffleEventKey);
      if (
        clientSettingsUpdatedAt &&
        currentSettings.updated_at &&
        clientSettingsUpdatedAt !== currentSettings.updated_at
      ) {
        const dashboard = await getVendorRaffleDashboard(vendor, user, raffleEventKey, allowEarlyDraw, suppressOutboundEmail);
        return jsonResponse({
          ok: false,
          conflict: true,
          error: "This draw was updated in another tab or browser. Review the latest settings before saving again.",
          vendor,
          ...dashboard,
        }, 409);
      }
      const prizeDescription = cleanText(body?.prize_description, 1000);
      const prizeTitle = cleanText(body?.prize_title, 180) || cleanText(prizeDescription.split(/\r?\n/)[0], 180);
      const prizeApproxValueCad = positiveCadValue(body?.prize_approx_value_cad);
      const entryClosesAt = isReviewVendor ? String(currentSettings.entry_closes_at || ENTRY_CLOSES_AT) : ENTRY_CLOSES_AT;
      const drawAt = isReviewVendor ? String(currentSettings.draw_at || DRAW_AT) : DRAW_AT;
      const drawOpensAt = isReviewVendor ? String(currentSettings.draw_opens_at || DRAW_OPENS_AT) : DRAW_OPENS_AT;
      const eligibilityRegion = isReviewVendor ? String(currentSettings.eligibility_region || ELIGIBILITY_REGION) : ELIGIBILITY_REGION;
      const oddsBasis = isReviewVendor ? String(currentSettings.odds_basis || ODDS_BASIS) : ODDS_BASIS;
      const alternateFreeEntryUrl = isReviewVendor
        ? String(currentSettings.alternate_free_entry_url || "")
        : ALTERNATE_FREE_ENTRY_URL;
      if (enabled && !validHttpsUrl(alternateFreeEntryUrl)) {
        return jsonResponse({
          ok: false,
          error: "Entries cannot open until Wedding Win configures a live alternate free entry route.",
        }, 503);
      }
      if (enabled && (!legalTermsAccepted || !rulesReviewed || !prizeTitle || !prizeDescription || !prizeApproxValueCad)) {
        return jsonResponse({
          ok: false,
          error: "Add prize details and its approximate retail value in CAD, view the current official rules, and explicitly accept them before turning this on.",
        }, 400);
      }
      const acceptedAt = legalTermsAccepted && rulesReviewed
        ? currentSettings.legal_terms_version === TERMS_VERSION && currentSettings.rules_viewed_at
          ? currentSettings.rules_viewed_at
          : new Date().toISOString()
        : null;
      const nextMaterialSettings: Partial<RaffleSettings> = {
        ...currentSettings,
        prize_title: prizeTitle,
        prize_description: prizeDescription,
        prize_approx_value_cad: prizeApproxValueCad || null,
        legal_terms_version: TERMS_VERSION,
        official_rules_url: TERMS_URL,
        eligibility_region: eligibilityRegion,
        entry_closes_at: entryClosesAt,
        draw_at: drawAt,
        draw_opens_at: drawOpensAt,
        odds_basis: oddsBasis,
        no_purchase_required: true,
        skill_testing_question_required: true,
        prize_provider_name: vendor.name,
        alternate_free_entry_url: alternateFreeEntryUrl,
      };
      const { count: entryCount, error: entryCountError } = await requireAdmin()
        .from("qr_bingo_raffle_entries")
        .select("id", { count: "exact", head: true })
        .eq("event_key", raffleEventKey)
        .eq("vendor_bingo_id", vendor.id);
      if (entryCountError) throw entryCountError;
      const materialTermsChanged = materialSettingsFingerprint(currentSettings) !== materialSettingsFingerprint(nextMaterialSettings);
      if ((entryCount || 0) > 0 && materialTermsChanged && !enabled) {
        const { error: disableError } = await requireAdmin()
          .from("qr_bingo_raffle_settings")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("id", currentSettings.id);
        if (disableError) throw disableError;
        const dashboard = await getVendorRaffleDashboard(vendor, user, raffleEventKey, allowEarlyDraw, suppressOutboundEmail);
        return jsonResponse({ ok: true, vendor, ...dashboard, material_terms_locked: true });
      }
      if ((entryCount || 0) > 0 && materialTermsChanged) {
        return jsonResponse({
          ok: false,
          material_terms_locked: true,
          error: "Prize and draw terms cannot change after the first entry. Close this draw and create a separately versioned promotion instead.",
        }, 409);
      }
      const settings = await upsertSettings(vendor, {
        enabled,
        prize_title: prizeTitle,
        prize_description: prizeDescription,
        prize_approx_value_cad: prizeApproxValueCad || null,
        eligibility_region: eligibilityRegion,
        entry_closes_at: entryClosesAt,
        draw_at: drawAt,
        odds_basis: oddsBasis,
        no_purchase_required: true,
        skill_testing_question_required: true,
        alternate_free_entry_url: alternateFreeEntryUrl,
        legal_terms_accepted: legalTermsAccepted,
        legal_terms_version: TERMS_VERSION,
        legal_terms_accepted_at: acceptedAt,
        official_rules_url: TERMS_URL,
        rules_viewed_at: acceptedAt,
        administrator_name: RAFFLE_ADMINISTRATOR,
        co_sponsor_name: RAFFLE_ADMINISTRATOR,
        prize_provider_name: vendor.name,
        apple_non_sponsor_acknowledged: legalTermsAccepted && rulesReviewed,
      }, raffleEventKey);
      const dashboard = await getVendorRaffleDashboard(vendor, user, raffleEventKey, allowEarlyDraw, suppressOutboundEmail);
      return jsonResponse({ ok: true, vendor, ...dashboard });
    }

    if (action === "vendor_raffle_draw") {
      const vendor = reviewFixture && isReviewVendor
        ? appReviewFixtureVendor(reviewFixture)
        : await resolveVendorForCurrentUser(page, user);
      if (!vendor) {
        return jsonResponse({ ok: false, error: "This account is not on the QR Bingo vendor list." }, 403);
      }
      return drawWinner(
        vendor,
        user,
        String(body?.draw_reason || "initial"),
        reviewFixture && isReviewVendor ? reviewFixture.event_key : EVENT_KEY,
        Boolean(reviewFixture && isReviewVendor && reviewFixture.allow_early_draw),
        Boolean(reviewFixture && isReviewVendor && reviewFixture.suppress_outbound_email),
      );
    }

    if (action === "list") {
      const completed = page.vendors.length > 0 && scanned.length >= page.vendors.length;
      const grandPrize = await grandPrizeState(user, completed);
      return jsonResponse({
        ok: true,
        vendors: page.vendors,
        scanned,
        scanned_count: scanned.length,
        total_count: page.vendors.length,
        completed,
        ...grandPrize,
      });
    }

    return jsonResponse({ ok: false, error: "Unsupported QR Bingo action" }, 400);
  } catch (error) {
    const failure = error instanceof Error
      ? { name: error.name, message: error.message }
      : error && typeof error === "object"
      ? {
          code: "code" in error ? String(error.code || "") : "",
          message: "message" in error ? String(error.message || "") : "",
          details: "details" in error ? String(error.details || "") : "",
          hint: "hint" in error ? String(error.hint || "") : "",
        }
      : { message: String(error) };
    console.error("bd-qr-bingo-sync request failed", failure);
    return jsonResponse({
      ok: false,
      error: "QR Bingo sync unavailable",
    }, 500);
  }
});
