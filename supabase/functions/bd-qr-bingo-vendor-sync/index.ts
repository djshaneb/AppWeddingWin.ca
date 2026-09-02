import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { nativeSessionMatchesCachedBdIdentity } from "../_shared/bd_identity.ts";
import {
  loadPublishedQrBingoConfig,
  type PublicQrBingoEventConfig,
  publicQrBingoEventConfig,
  type QrBingoEventConfig,
} from "../_shared/qr_bingo_config.ts";
import { parseWinnerVerificationEvidence } from "../_shared/qr_bingo_winner_evidence.ts";
import {
  bdUserHasTag,
  bdUserIsActiveQrBingoVendor,
} from "../_shared/bd_tag_membership.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") ||
  "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const RAFFLE_ADMINISTRATOR = "Wedding Win Inc.";
const PLATFORM_ROLE =
  "Wedding Win Inc. is the app developer, a limited platform sponsor solely for the in-app workflow, and the technical administrator. It provides entry recording, duplicate controls, random-selection, audit, and notice-delivery technology on the named vendor's behalf, but it is not the named vendor-promotion sponsor, contest operator, or prize provider and does not own, supply, insure, guarantee, or fulfill the vendor's prize. Wedding Win Inc. remains responsible for its own technology, privacy and security obligations, negligence, wilful misconduct, representations, and express administrative commitments, subject to all non-waivable law.";
const APPLE_NON_SPONSOR_DISCLAIMER =
  "Apple Inc. is not a sponsor of and is not involved in this promotion, its administration, winner selection, or prize fulfillment.";
const ELIGIBILITY_EXCLUSIONS =
  "Wedding Win Inc., participating prize providers, their employees, and members of those employees' immediate households are not eligible.";
const ODDS_BASIS =
  "Each accepted entry request has an equal chance in random potential-winner selection; eligibility is confirmed by the named vendor after selection.";
const NO_PURCHASE_REQUIRED = true;
const SKILL_TESTING_QUESTION_REQUIRED = true;
const PREVIOUS_CONTACT_SHARING_RULES_VERSION = "2026-09-01-vendor-marketing";
const CONTACT_SHARING_RULES_VERSION = "2026-09-01-in-person-entry";
const NAMED_VENDOR_CONTACT_RULES_VERSIONS = [
  PREVIOUS_CONTACT_SHARING_RULES_VERSION,
  CONTACT_SHARING_RULES_VERSION,
] as const;
const CONTACT_SHARE_SCOPE = "named_vendor_draw_administration";
const QR_PARTICIPATION_NOTICE_VERSION = "2026-09-01-in-person-entry";
const QR_DRAW_EMAIL_SEND_URL = Deno.env.get("QR_DRAW_EMAIL_SEND_URL") ||
  `${BD_API_BASE_URL}/qr-bingo-draw-email-send`;
const MAX_RAFFLE_WINNERS = 3;
const POSTGREST_PAGE_SIZE = 500;
const MAX_COMPLETE_READ_ROWS = 100_000;
const COMPLETE_READ_RETRIES = 3;

const qrBingoConfigContext = new AsyncLocalStorage<QrBingoEventConfig>();

function qrBingoConfig() {
  const config = qrBingoConfigContext.getStore();
  if (!config) {
    throw new Error(
      "Published QR Bingo configuration is not active for this request.",
    );
  }
  return config;
}

function qrPublicConfig(): PublicQrBingoEventConfig | null {
  const config = qrBingoConfigContext.getStore();
  return config ? publicQrBingoEventConfig(config) : null;
}

function qrParticipationNoticeVersion() {
  return `${qrBingoConfig().rules_version}|${QR_PARTICIPATION_NOTICE_VERSION}`;
}

function productionShowScanWindowOpen() {
  const opensAt = new Date(qrBingoConfig().history_starts_at).getTime();
  const closesAt = new Date(qrBingoConfig().entry_closes_at).getTime();
  return Number.isFinite(opensAt) && Number.isFinite(closesAt) &&
    opensAt < closesAt && Date.now() >= opensAt &&
    Date.now() < closesAt;
}

function isEmailTestFixture(
  fixture?: IsolatedRaffleFixture | null,
): fixture is EmailTestRaffleFixture {
  return Boolean(fixture?.event_key.startsWith("email-test-"));
}

function isolatedFixturePurpose(fixture?: IsolatedRaffleFixture | null) {
  return isEmailTestFixture(fixture) ? "email_test" : "app_review";
}

function isolatedFixtureSuppressesOutbound(
  fixture?: IsolatedRaffleFixture | null,
) {
  return Boolean(
    fixture && !isEmailTestFixture(fixture) && fixture.suppress_outbound_email,
  );
}

function isolatedEmailTestRecipient(fixture?: IsolatedRaffleFixture | null) {
  if (
    !isEmailTestFixture(fixture) ||
    new Date(fixture.expires_at).getTime() <= Date.now()
  ) return "";
  const recipient = String(fixture.outbound_recipient_email || "").trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ? recipient : "";
}

function qrDrawEmailsEnabled(fixture?: IsolatedRaffleFixture | null) {
  if (isolatedEmailTestRecipient(fixture)) return true;
  const config = qrBingoConfig();
  return config.email_delivery_mode === "production_verified_fulfillment" &&
    (config.send_vendor_email || config.send_couple_email);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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
  company?: string;
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
  authenticated_couple_bd_user_id?: string;
};
type EmailTestRaffleFixture =
  & Omit<AppReviewRaffleFixture, "suppress_outbound_email">
  & {
    outbound_recipient_email: string;
    send_vendor_email: false;
    send_couple_email: true;
  };
type IsolatedRaffleFixture = AppReviewRaffleFixture | EmailTestRaffleFixture;
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
  vendor_responsibility_acknowledged?: boolean | null;
  vendor_responsibility_disclosure_text?: string | null;
  vendor_responsibility_acknowledged_at?: string | null;
  vendor_responsibility_version?: string | null;
  participant_responsibility_disclosure_text?: string | null;
  max_winners: number;
  exclude_previous_winners: boolean;
  draw_opens_at: string;
  updated_at?: string | null;
};
type VendorOfferSnapshot = {
  event_key: string;
  vendor_bingo_id: string;
  vendor_offer_version: string;
  event_revision?: number | null;
  event_name: string;
  vendor_tag_id?: number | null;
  vendor_bd_user_id: string;
  vendor_name: string;
  enabled: boolean;
  offer_enterable: boolean;
  activation_excluded_as_legacy_qa: boolean;
  history_starts_at?: string | null;
  prize_title: string;
  prize_description: string;
  prize_approx_value_cad?: number | null;
  eligibility_region: string;
  entry_closes_at?: string | null;
  draw_opens_at?: string | null;
  draw_at?: string | null;
  odds_basis: string;
  no_purchase_required: boolean;
  skill_testing_question_required: boolean;
  official_rules_url: string;
  alternate_free_entry_url: string;
  rules_version: string;
  administrator_name: string;
  co_sponsor_name: string;
  prize_provider_name: string;
  vendor_responsibility_disclosure_text: string;
  vendor_responsibility_version: string;
  participant_responsibility_disclosure_text: string;
  max_winners: number;
  exclude_previous_winners: boolean;
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
  consent_share_contact?: boolean;
  draw_administration_contact_share_acknowledged?: boolean;
  draw_administration_contact_share_acknowledged_at?: string;
  draw_administration_contact_share_version?: string;
  draw_administration_contact_share_consent_text?: string;
  vendor_marketing_consent?: boolean;
  vendor_marketing_consent_text?: string;
  vendor_marketing_consented_at?: string;
  no_purchase_required?: boolean;
  skill_testing_question_required?: boolean;
  age_of_majority_attested?: boolean;
  residency_attested?: boolean;
  exclusions_attested?: boolean;
  eligibility_attested_at?: string;
  eligibility_attestation_text?: string;
  prize_provider_name?: string;
  entry_method?: "qr_scan_opt_in" | "alternate_free_entry";
  in_show_scan_verified?: boolean | null;
  in_show_scan_verified_at?: string | null;
  promotion_responsibility_acknowledged?: boolean;
  promotion_disclosure_text?: string;
  promotion_responsibility_acknowledged_at?: string;
  promotion_responsibility_version?: string;
  vendor_offer_version?: string;
  max_winners?: number;
  exclude_previous_winners?: boolean;
};
type RaffleDraw = {
  id: string;
  event_key: string;
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
  skill_question_prompt?: string;
  winner_rules_confirmed_at?: string | null;
  max_winners?: number;
  exclude_previous_winners?: boolean;
};
type DrawEmailChannel = "vendor" | "couple";
type DrawEmailClaim = {
  channel: DrawEmailChannel;
  status: string;
  delivery_key: string;
  claim_token: string;
};

const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  : null;

function jsonResponse(body: unknown, status = 200, includeEventConfig = true) {
  const eventConfig = includeEventConfig ? qrPublicConfig() : null;
  const responseBody =
    eventConfig && body && typeof body === "object" && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>), event_config: eventConfig }
      : body;
  return new Response(JSON.stringify(responseBody), {
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

type PostgrestReadResult<T> = {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
  count?: number | null;
};

async function collectExactPostgrestRows<T>(
  label: string,
  rowKey: (row: T) => string,
  countRows: () => unknown,
  loadPage: (from: number, to: number) => unknown,
) {
  for (let attempt = 1; attempt <= COMPLETE_READ_RETRIES; attempt += 1) {
    const before = await countRows() as PostgrestReadResult<T>;
    if (before.error) throw before.error;
    if (typeof before.count !== "number" || before.count < 0) {
      throw new Error(`${label} exact count was unavailable.`);
    }
    if (before.count > MAX_COMPLETE_READ_ROWS) {
      throw new Error(
        `${label} exceeds the ${MAX_COMPLETE_READ_ROWS}-row safe read limit; no partial result was returned.`,
      );
    }

    const rows: T[] = [];
    while (rows.length < before.count) {
      const page = await loadPage(
        rows.length,
        rows.length + POSTGREST_PAGE_SIZE - 1,
      ) as PostgrestReadResult<T>;
      if (page.error) throw page.error;
      const pageRows = page.data || [];
      if (pageRows.length === 0) break;
      rows.push(...pageRows);
    }

    const after = await countRows() as PostgrestReadResult<T>;
    if (after.error) throw after.error;
    const keys = new Set(rows.map(rowKey));
    if (
      before.count === after.count &&
      rows.length === before.count &&
      keys.size === before.count
    ) {
      return rows;
    }
  }
  throw new Error(
    `${label} changed while it was being read; retry to avoid a partial result.`,
  );
}

async function loadAppReviewRaffleFixture(userIdValue: unknown) {
  const userId = String(userIdValue || "").trim();
  if (!/^\d+$/.test(userId)) return null;
  const db = requireAdmin();
  const { data, error } = await db
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
  if (data) {
    return {
      ...(data as AppReviewRaffleFixture),
      authenticated_couple_bd_user_id:
        String(data.couple_bd_user_id || "") === userId ? userId : undefined,
    };
  }

  const { data: participantRows, error: participantError } = await db
    .from("app_review_raffle_fixture_participants")
    .select("fixture_id")
    .eq("couple_bd_user_id", userId)
    .limit(20);
  if (participantError) {
    // Keep legacy single-couple fixtures working while the additive
    // participant migration is staged.
    if (
      participantError.code === "42P01" || participantError.code === "PGRST205"
    ) {
      return null;
    }
    throw participantError;
  }
  const fixtureIds = (participantRows || []).map((row) =>
    String(row.fixture_id || "")
  ).filter(Boolean);
  if (!fixtureIds.length) return null;
  const { data: participantFixture, error: participantFixtureError } = await db
    .from("app_review_raffle_fixtures")
    .select("*")
    .in("id", fixtureIds)
    .eq("enabled", true)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (participantFixtureError) throw participantFixtureError;
  return participantFixture
    ? {
      ...(participantFixture as AppReviewRaffleFixture),
      authenticated_couple_bd_user_id: userId,
    }
    : null;
}

async function loadEmailTestRaffleFixture(userIdValue: unknown) {
  const userId = String(userIdValue || "").trim();
  if (!/^\d+$/.test(userId)) return null;
  const { data, error } = await requireAdmin()
    .from("qr_bingo_email_test_fixtures")
    .select("*")
    .eq("enabled", true)
    .gt("expires_at", new Date().toISOString())
    .or(`couple_bd_user_id.eq.${userId},vendor_bd_user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  if (error) {
    // Production and App Review remain available while the additive email-test
    // fixture migration is staged.
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw error;
  }
  return data as EmailTestRaffleFixture | null;
}

function isolatedFixtureVendor(fixture: IsolatedRaffleFixture): QrVendor {
  return {
    id: fixture.vendor_bingo_id,
    user_id: fixture.vendor_bd_user_id,
    name: fixture.vendor_name,
  };
}

async function isolatedFixtureScannedIds(
  fixture: IsolatedRaffleFixture,
  authenticatedCoupleBdUserId: string,
) {
  const table = isEmailTestFixture(fixture)
    ? "qr_bingo_email_test_fixture_scans"
    : "app_review_raffle_fixture_scans";
  const { data, error } = await requireAdmin()
    .from(table)
    .select("vendor_bingo_id")
    .eq("fixture_id", fixture.id)
    .eq("couple_bd_user_id", authenticatedCoupleBdUserId);
  if (error) throw error;
  return (data || []).map((row) => String(row.vendor_bingo_id || "")).filter(
    Boolean,
  );
}

async function saveIsolatedFixtureScan(
  fixture: IsolatedRaffleFixture,
  authenticatedCoupleBdUserId: string,
) {
  const table = isEmailTestFixture(fixture)
    ? "qr_bingo_email_test_fixture_scans"
    : "app_review_raffle_fixture_scans";
  const { error } = await requireAdmin()
    .from(table)
    .upsert({
      fixture_id: fixture.id,
      couple_bd_user_id: authenticatedCoupleBdUserId,
      vendor_bingo_id: fixture.vendor_bingo_id,
    }, {
      onConflict: "fixture_id,couple_bd_user_id,vendor_bingo_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

async function isolatedFixtureContext(
  fixture: IsolatedRaffleFixture | null,
  authenticatedBdUserId: string,
) {
  const fixtureCoupleId = fixture
    ? isEmailTestFixture(fixture)
      ? String(fixture.couple_bd_user_id || "")
      : String(fixture.authenticated_couple_bd_user_id || "")
    : "";
  if (!fixture || fixtureCoupleId !== authenticatedBdUserId) {
    return {
      ok: true,
      app_review_fixture: false,
      email_test_fixture: false,
      vendors: [],
      scanned: [],
      scanned_count: 0,
      total_count: 0,
      completed: false,
    };
  }
  const vendor = isolatedFixtureVendor(fixture);
  const scanned = [
    ...new Set(
      await isolatedFixtureScannedIds(fixture, authenticatedBdUserId),
    ),
  ];
  return {
    ok: true,
    app_review_fixture: !isEmailTestFixture(fixture),
    email_test_fixture: isEmailTestFixture(fixture),
    vendors: [vendor],
    scanned,
    scanned_count: scanned.length,
    total_count: 1,
    completed: scanned.includes(vendor.id),
  };
}

function unwrapBdUser(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdRow) : undefined;
  }

  return message && typeof message === "object"
    ? (message as BdRow)
    : undefined;
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

function appendCookie(
  cookieJar: Map<string, string>,
  setCookieHeaders: string[],
) {
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
  if (typeof withHelper.getSetCookie === "function") {
    return withHelper.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeader(cookieJar: Map<string, string>) {
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join(
    "; ",
  );
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
  let nextUrl = `${BD_API_BASE_URL}/login/token/${
    encodeURIComponent(token)
  }/qr`;

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
    company: cleanText(row.company, 180) || undefined,
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

async function postQrAction(
  cookieJar: Map<string, string>,
  params: URLSearchParams,
): Promise<Record<string, unknown> & { __http_status: number }> {
  const config = qrBingoConfig();
  params.set("expected_event_key", config.event_key);
  params.set("expected_config_revision", String(config.revision));
  const response = await fetchWithCookies(`${BD_API_BASE_URL}/qr`, cookieJar, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { ...parsed, __http_status: response.status };
  } catch {
    throw new Error(
      `QR Bingo returned an unexpected response (${response.status}).`,
    );
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
    cleanText(body.consent_version, 80) === qrBingoConfig().rules_version;
}

function vendorResponsibilityDisclosure(vendorName: string) {
  return `${vendorName} confirms the signer is authorized to bind the vendor and accepts the current Official Rules, Wedding Win Terms, and vendor indemnity. The vendor is the named vendor-promotion sponsor, draw operator, and prize provider. It is responsible for accurate offer and prize terms; the correct legal/operating business identity and a working contact route; prize ownership, availability, maximum value or savings, restrictions, all legally required licences, permits, and insurance; taxes; eligibility and duplicate decisions; winner verification, the skill-testing question, releases, notices, delivery, claims, and disputes. It may use contact details from couples who explicitly enter this named draw to administer the draw and send wedding-related offers and promotions. It must identify itself, protect the information, honour unsubscribe and withdrawal requests, and follow applicable privacy and commercial-message requirements. ${PLATFORM_ROLE} These duties do not transfer to Wedding Win Inc. ${APPLE_NON_SPONSOR_DISCLAIMER}`;
}

function vendorAcceptanceSource(value: unknown) {
  const platform = cleanText(value, 20).toLowerCase();
  if (platform === "website" || platform === "web") return "website";
  if (["app", "ios", "android", "native"].includes(platform)) return "app";
  return "";
}

function participantResponsibilityDisclosure(vendorName: string) {
  return `${vendorName} is the named vendor-promotion sponsor, contest operator, and prize provider and is responsible for lawful and accurate offer terms; prize ownership, availability, stated value, restrictions, insurance, taxes, claims, and disputes; entrant eligibility and duplicate-entry decisions; potential-winner verification, the mathematical skill-testing question, any declaration or release, required notices, delivery, and timely fulfillment. ${PLATFORM_ROLE} By entering, I confirm that I visited this vendor booth in person at the wedding show and scanned its QR code. I agree that Wedding Win Inc. may share my name, email address, phone number, wedding date, and entry/consent evidence with ${vendorName}. ${vendorName} may use those details to administer this specific draw and contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time. ${APPLE_NON_SPONSOR_DISCLAIMER}`;
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
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : 0;
}

function raffleMaxWinners(value: unknown) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_RAFFLE_WINNERS
    ? count
    : 1;
}

function validPromotionTime(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

function offerVersionToken(value: unknown) {
  const token = String(value || "").trim();
  if (
    token.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(token) ||
    !Number.isFinite(new Date(token).getTime())
  ) return "";
  return token;
}

function validPromotionWindow(closesAt: string, drawAt: string) {
  const closeTime = new Date(closesAt).getTime();
  const drawTime = new Date(drawAt).getTime();
  return Number.isFinite(closeTime) && Number.isFinite(drawTime) &&
    drawTime >= closeTime;
}

function drawAvailableAt(settings: RaffleSettings) {
  return new Date(Math.max(
    new Date(
      String(settings.entry_closes_at || qrBingoConfig().entry_closes_at),
    ).getTime(),
    new Date(String(settings.draw_at || qrBingoConfig().draw_at)).getTime(),
    new Date(String(settings.draw_opens_at || qrBingoConfig().draw_opens_at))
      .getTime(),
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
    skill_testing_question_required:
      settings.skill_testing_question_required === true,
    prize_provider_name: cleanText(settings.prize_provider_name, 180),
    alternate_free_entry_url: cleanText(settings.alternate_free_entry_url, 500),
    participant_responsibility_disclosure_text: cleanText(
      settings.participant_responsibility_disclosure_text,
      2000,
    ),
    max_winners: raffleMaxWinners(settings.max_winners),
    exclude_previous_winners: settings.exclude_previous_winners !== false,
  });
}

function nonConsentMaterialSettingsFingerprint(
  settings: Partial<RaffleSettings>,
) {
  return JSON.stringify({
    prize_title: cleanText(settings.prize_title, 180),
    prize_description: cleanText(settings.prize_description, 1000),
    prize_approx_value_cad: positiveCadValue(settings.prize_approx_value_cad),
    official_rules_url: cleanText(settings.official_rules_url, 500),
    eligibility_region: cleanText(settings.eligibility_region, 300),
    entry_closes_at: String(settings.entry_closes_at || ""),
    draw_at: String(settings.draw_at || ""),
    draw_opens_at: String(settings.draw_opens_at || ""),
    odds_basis: cleanText(settings.odds_basis, 500),
    no_purchase_required: settings.no_purchase_required === true,
    skill_testing_question_required:
      settings.skill_testing_question_required === true,
    prize_provider_name: cleanText(settings.prize_provider_name, 180),
    alternate_free_entry_url: cleanText(settings.alternate_free_entry_url, 500),
    max_winners: raffleMaxWinners(settings.max_winners),
    exclude_previous_winners: settings.exclude_previous_winners !== false,
  });
}

function isPermittedInPersonEntryRulesTransition(
  current: Partial<RaffleSettings>,
  next: Partial<RaffleSettings>,
) {
  const nextDisclosure = cleanText(
    next.participant_responsibility_disclosure_text,
    2000,
  );
  return cleanText(current.legal_terms_version, 80) ===
      PREVIOUS_CONTACT_SHARING_RULES_VERSION &&
    cleanText(next.legal_terms_version, 80) === CONTACT_SHARING_RULES_VERSION &&
    nextDisclosure.includes(
      "contact me with wedding-related offers and promotions",
    ) &&
    nextDisclosure.includes("unsubscribe from vendor marketing") &&
    nextDisclosure.toLowerCase().includes(
      "visited this vendor booth in person",
    ) &&
    nonConsentMaterialSettingsFingerprint(current) ===
      nonConsentMaterialSettingsFingerprint(next);
}

function absoluteWeddingWinUrl(pathOrUrl: unknown) {
  const value = cleanText(pathOrUrl, 500);
  if (!value) return "";
  try {
    const base = new URL(BD_API_BASE_URL);
    const resolved = new URL(value, `${base.origin}/`);
    const baseHost = base.hostname.toLowerCase().replace(/^www\./, "");
    const resolvedHost = resolved.hostname.toLowerCase().replace(/^www\./, "");
    if (resolved.protocol !== "https:" || resolvedHost !== baseHost) return "";
    return resolved.toString();
  } catch {
    return "";
  }
}

function displayName(user: BdRow | undefined) {
  const name = [
    cleanText(user?.first_name, 80),
    cleanText(user?.last_name, 80),
  ].filter(Boolean).join(" ");
  return name || cleanText(user?.company, 120) || cleanText(user?.email, 120);
}

function phoneForUser(user: BdRow | undefined) {
  return cleanText(
    user?.phone_number || user?.phone || user?.phone2 || user?.mobile_phone,
    80,
  );
}

function qrContactProfile(user: BdRow | undefined) {
  const name = [
    cleanText(user?.first_name, 80),
    cleanText(user?.last_name, 80),
  ].filter(Boolean).join(" ");
  const normalizedName = name.toLowerCase();
  const email = cleanText(user?.email, 254).toLowerCase();
  const phone = phoneForUser(user);
  const phoneDigits = phone.replace(/\D/g, "");
  const missingFields: string[] = [];
  if (
    !name || normalizedName === "weddingwin couple" ||
    normalizedName === "couple"
  ) {
    missingFields.push("name");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missingFields.push("email");
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    missingFields.push("phone number");
  }
  return {
    complete: missingFields.length === 0,
    missing_fields: missingFields,
    profile_edit_url: `${BD_API_BASE_URL}/account/contact`,
  };
}

function weddingDateForUser(user: BdRow | undefined) {
  return cleanText(user?.wedding_date || user?.custom_wedding_date || "", 80);
}

function vendorForCurrentUser(page: QrPage, user: BdRow | undefined) {
  const userId = String(user?.user_id || "").trim();
  const vendor = page.vendors.find((item) =>
    String(item.user_id || "") === userId
  );
  return vendor ? { ...vendor, id: userId, user_id: userId } : null;
}

function hasCurrentQrBingoVendorTag(user: BdRow | undefined) {
  return bdUserHasTag(user, qrBingoConfig().vendor_tag_id);
}

function vendorFromTaggedBdUser(user: BdRow | undefined) {
  const userId = String(user?.user_id || "").trim();
  const isEligibleVendor = bdUserIsActiveQrBingoVendor(
    user,
    qrBingoConfig().vendor_tag_id,
  );
  const name = cleanText(user?.company, 180) || displayName(user);
  if (!userId || !isEligibleVendor || !name) return null;

  return {
    id: userId,
    name,
    company: cleanText(user?.company, 180) || undefined,
    cover_photo: cleanText(user?.image_main_file, 500) || undefined,
    full_filename: cleanText(user?.filename, 500) || undefined,
    user_id: userId,
  } as QrVendor;
}

async function resolveVendorForCurrentUser(
  page: QrPage,
  user: BdRow | undefined,
) {
  const taggedVendor = vendorFromTaggedBdUser(user);
  if (!taggedVendor) return null;

  // The authenticated BD user must currently be active and carry the event's
  // vendor tag. Page metadata may enrich that identity, but cannot authorize
  // an inactive/removed vendor through historical raffle records.
  const pageVendor = vendorForCurrentUser(page, user);
  return pageVendor ? { ...taggedVendor, ...pageVendor } : taggedVendor;
}

async function resolveVendorForRaffleAction(
  page: QrPage,
  user: BdRow | undefined,
  reviewFixture: IsolatedRaffleFixture | null,
  isReviewVendor: boolean,
) {
  if (reviewFixture && isReviewVendor) {
    // The isolated reviewer listing remains inactive/private in BD, but it
    // must still carry the currently published QR Bingo vendor tag. Removing
    // that tag immediately revokes every vendor dashboard action.
    return hasCurrentQrBingoVendorTag(user)
      ? isolatedFixtureVendor(reviewFixture)
      : null;
  }
  return await resolveVendorForCurrentUser(page, user);
}

async function getFreshScanned(cookieJar: Map<string, string>, page: QrPage) {
  const serverScanned = await postQrAction(
    cookieJar,
    new URLSearchParams({ action: "get_scanned" }),
  )
    .catch(() => undefined);
  return Array.isArray(serverScanned?.scanned)
    ? serverScanned.scanned.map((value) => String(value || "").trim()).filter(
      Boolean,
    )
    : page.scanned;
}

async function getSettings(
  vendor: QrVendor,
  eventKey = qrBingoConfig().event_key,
) {
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

async function loadVendorOfferSnapshot(
  eventKey: string,
  vendorId: string,
  version: unknown,
) {
  const token = offerVersionToken(version);
  if (!token) return null;
  const { data, error } = await requireAdmin()
    .from("qr_bingo_vendor_offer_versions")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendorId)
    .eq("vendor_offer_version", token)
    .maybeSingle();
  if (error) throw error;
  return data as VendorOfferSnapshot | null;
}

async function loadCurrentVendorOfferSnapshot(settings: RaffleSettings | null) {
  if (!settings?.updated_at) return null;
  return loadVendorOfferSnapshot(
    settings.event_key,
    settings.vendor_bingo_id,
    settings.updated_at,
  );
}

function offerSnapshotIsEnterable(snapshot: VendorOfferSnapshot | null) {
  return Boolean(
    snapshot?.enabled &&
      snapshot.offer_enterable &&
      !snapshot.activation_excluded_as_legacy_qa &&
      cleanText(snapshot.participant_responsibility_disclosure_text, 2000) &&
      offerVersionToken(snapshot.vendor_offer_version) &&
      raffleMaxWinners(snapshot.max_winners) === Number(snapshot.max_winners) &&
      validPromotionTime(String(snapshot.entry_closes_at || "")) &&
      Date.now() < new Date(String(snapshot.entry_closes_at)).getTime(),
  );
}

async function archivedLegacyEntryIds(eventKey: string, vendorId: string) {
  const db = requireAdmin();
  const rows = await collectExactPostgrestRows<Record<string, unknown>>(
    "Archived QR Bingo entrant records",
    (row) => String(row.entry_id || ""),
    () =>
      db.from("qr_bingo_legacy_qa_archives")
        .select("entry_id", { count: "exact", head: true })
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendorId),
    (from, to) =>
      db.from("qr_bingo_legacy_qa_archives")
        .select("entry_id")
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendorId)
        .order("entry_id", { ascending: true })
        .range(from, to),
  );
  return new Set(rows.map((row) => String(row.entry_id || "")));
}

async function loadVendorDrawRows(
  eventKey: string,
  vendorId: string,
  vendorBdUserId: string,
) {
  const db = requireAdmin();
  return await collectExactPostgrestRows<RaffleDraw>(
    "Vendor QR Bingo draw records",
    (row) => String(row.id || ""),
    () =>
      db.from("qr_bingo_raffle_draws")
        .select("id", { count: "exact", head: true })
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendorId)
        .eq("vendor_bd_user_id", vendorBdUserId),
    (from, to) =>
      db.from("qr_bingo_raffle_draws")
        .select("*")
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendorId)
        .eq("vendor_bd_user_id", vendorBdUserId)
        .order("draw_number", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );
}

async function loadVendorSelectionStateRows(
  eventKey: string,
  vendorId: string,
  vendorBdUserId: string,
) {
  const db = requireAdmin();
  return await collectExactPostgrestRows<Record<string, unknown>>(
    "Vendor QR Bingo entrant selection states",
    (row) => String(row.entry_id || ""),
    () =>
      db.from("qr_bingo_raffle_entry_selection_state")
        .select("entry_id", { count: "exact", head: true })
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendorId)
        .eq("vendor_bd_user_id", vendorBdUserId),
    (from, to) =>
      db.from("qr_bingo_raffle_entry_selection_state")
        .select("entry_id,included,exclusion_reason,updated_at")
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendorId)
        .eq("vendor_bd_user_id", vendorBdUserId)
        .order("entry_id", { ascending: true })
        .range(from, to),
  );
}

async function activeVendorEntryCount(eventKey: string, vendorId: string) {
  const db = requireAdmin();
  const [rows, archivedIds] = await Promise.all([
    collectExactPostgrestRows<Record<string, unknown>>(
      "Vendor QR Bingo entrant identities",
      (row) => String(row.id || ""),
      () =>
        db.from("qr_bingo_raffle_entries")
          .select("id", { count: "exact", head: true })
          .eq("event_key", eventKey)
          .eq("vendor_bingo_id", vendorId),
      (from, to) =>
        db.from("qr_bingo_raffle_entries")
          .select("id")
          .eq("event_key", eventKey)
          .eq("vendor_bingo_id", vendorId)
          .order("id", { ascending: true })
          .range(from, to),
    ),
    archivedLegacyEntryIds(eventKey, vendorId),
  ]);
  return rows.filter((row) => !archivedIds.has(String(row.id || ""))).length;
}

async function activatedVendorOfferExists(eventKey: string, vendorId: string) {
  const { data, error } = await requireAdmin()
    .from("qr_bingo_vendor_offer_versions")
    .select("vendor_offer_version")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendorId)
    .eq("offer_enterable", true)
    .eq("activation_excluded_as_legacy_qa", false)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function alternateEntryClosureStatus(
  eventKey: string,
  vendorId: string,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  return {
    ready: true,
    stale_reason: null,
    fixture_bypass: Boolean(
      isolatedFixture?.enabled && isolatedFixture.event_key === eventKey &&
        isolatedFixture.vendor_bingo_id === vendorId,
    ),
    retired: true,
    event_revision: qrBingoConfig().revision,
  } as const;
}

async function upsertSettings(
  vendor: QrVendor,
  fields: Partial<RaffleSettings>,
  eventKey = qrBingoConfig().event_key,
) {
  const db = requireAdmin();
  const payload = {
    event_key: eventKey,
    vendor_bingo_id: vendor.id,
    vendor_bd_user_id: String(vendor.user_id || ""),
    vendor_name: vendor.name,
    draw_opens_at: qrBingoConfig().draw_opens_at,
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

async function compareAndUpdateSettings(
  vendor: QrVendor,
  expectedUpdatedAt: string,
  fields: Partial<RaffleSettings>,
  eventKey = qrBingoConfig().event_key,
  acceptanceContext?: {
    actorUserId: string;
    source: string;
    authorityToBind: boolean;
  },
) {
  const { data, error } = await requireAdmin().rpc(
    "compare_and_update_qr_bingo_vendor_settings",
    {
      p_event_key: eventKey,
      p_vendor_bingo_id: vendor.id,
      p_expected_updated_at: expectedUpdatedAt,
      p_patch: fields,
      p_authenticated_vendor_bd_user_id: acceptanceContext?.actorUserId ||
        vendor.id,
      p_acceptance_source: acceptanceContext?.source || "",
      p_authority_to_bind: acceptanceContext?.authorityToBind === true,
      p_participant_responsibility_disclosure:
        participantResponsibilityDisclosure(vendor.name),
    },
  );
  if (error) throw error;
  const envelope = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const settings = envelope.settings && typeof envelope.settings === "object"
    ? envelope.settings
    : envelope;
  return settings as RaffleSettings;
}

async function ensureSettings(
  vendor: QrVendor,
  eventKey = qrBingoConfig().event_key,
) {
  const existing = await getSettings(vendor, eventKey);
  if (existing) return existing;
  return upsertSettings(vendor, {
    enabled: false,
    prize_title: "",
    prize_description: "",
    prize_approx_value_cad: null,
    eligibility_region: qrBingoConfig().eligibility_region,
    entry_closes_at: qrBingoConfig().entry_closes_at,
    draw_at: qrBingoConfig().draw_at,
    odds_basis: ODDS_BASIS,
    no_purchase_required: NO_PURCHASE_REQUIRED,
    skill_testing_question_required: SKILL_TESTING_QUESTION_REQUIRED,
    alternate_free_entry_url: qrBingoConfig().alternate_free_entry_url,
    legal_terms_accepted: false,
    legal_terms_version: qrBingoConfig().rules_version,
    official_rules_url: qrBingoConfig().official_rules_url,
    administrator_name: RAFFLE_ADMINISTRATOR,
    co_sponsor_name: "",
    prize_provider_name: vendor.name,
    apple_non_sponsor_acknowledged: false,
    vendor_responsibility_acknowledged: false,
    vendor_responsibility_disclosure_text: "",
    participant_responsibility_disclosure_text:
      participantResponsibilityDisclosure(vendor.name),
    max_winners: 1,
    exclude_previous_winners: true,
  }, eventKey);
}

function isolatedFixtureMatchesSettings(
  settings: RaffleSettings | null,
  fixture?: IsolatedRaffleFixture | null,
) {
  const config = qrBingoConfig();
  return Boolean(
    settings &&
      fixture?.enabled &&
      fixture.event_key !== config.event_key &&
      fixture.event_key === settings.event_key &&
      fixture.vendor_bingo_id === settings.vendor_bingo_id &&
      fixture.vendor_bd_user_id === settings.vendor_bd_user_id &&
      validPromotionTime(fixture.expires_at) &&
      new Date(fixture.expires_at).getTime() > Date.now(),
  );
}

function isSettingsEnterable(
  settings: RaffleSettings | null,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const config = qrBingoConfig();
  const fixtureTerms = isolatedFixtureMatchesSettings(
    settings,
    isolatedFixture,
  );
  const entryClosesAt = String(settings?.entry_closes_at || "");
  const drawOpensAt = String(settings?.draw_opens_at || "");
  const drawAt = String(settings?.draw_at || "");
  const fixtureAllowsEarlyDraw = Boolean(
    fixtureTerms && isolatedFixture?.allow_early_draw === true,
  );
  const scheduleIsValid = validPromotionTime(entryClosesAt) &&
    validPromotionTime(drawOpensAt) &&
    validPromotionTime(drawAt) &&
    (fixtureAllowsEarlyDraw ||
      new Date(drawOpensAt).getTime() >=
        new Date(entryClosesAt).getTime()) &&
    new Date(drawAt).getTime() >= new Date(entryClosesAt).getTime();
  const eventTermsMatch = fixtureTerms
    ? Boolean(cleanText(settings?.eligibility_region, 300))
    : Boolean(
      settings?.event_key === config.event_key &&
        cleanText(settings?.eligibility_region, 300) ===
          config.eligibility_region &&
        new Date(entryClosesAt).getTime() ===
          new Date(config.entry_closes_at).getTime() &&
        new Date(drawOpensAt).getTime() ===
          new Date(config.draw_opens_at).getTime() &&
        new Date(drawAt).getTime() === new Date(config.draw_at).getTime(),
    );
  return Boolean(
    qrPublicConfig()?.vendor_draws_enabled &&
      config.rules_version === CONTACT_SHARING_RULES_VERSION &&
      settings?.enabled &&
      cleanText(settings.vendor_bingo_id, 20) &&
      settings.vendor_bd_user_id === settings.vendor_bingo_id &&
      cleanText(settings.vendor_name, 180) &&
      settings.legal_terms_accepted &&
      settings.legal_terms_version === config.rules_version &&
      settings.legal_terms_accepted_at &&
      settings.rules_viewed_at &&
      settings.apple_non_sponsor_acknowledged &&
      settings.vendor_responsibility_acknowledged === true &&
      cleanText(settings.vendor_responsibility_disclosure_text, 2000) &&
      settings.vendor_responsibility_acknowledged_at &&
      settings.vendor_responsibility_version === config.rules_version &&
      cleanText(settings.participant_responsibility_disclosure_text, 2000) ===
        participantResponsibilityDisclosure(settings.vendor_name) &&
      cleanText(settings.official_rules_url, 500) ===
        config.official_rules_url &&
      cleanText(settings.prize_provider_name, 180) &&
      cleanText(settings.prize_title, 160) &&
      cleanText(settings.prize_description, 1000) &&
      positiveCadValue(settings.prize_approx_value_cad) &&
      scheduleIsValid &&
      eventTermsMatch &&
      cleanText(settings.odds_basis, 500) &&
      settings.no_purchase_required === true &&
      settings.skill_testing_question_required === true &&
      raffleMaxWinners(settings.max_winners) === Number(settings.max_winners),
  );
}

function entryHasNamedVendorContactConsent(
  entry: Partial<RaffleEntry> | null | undefined,
) {
  const consentVersion = cleanText(entry?.consent_version, 80);
  return Boolean(
    entry?.id &&
      offerVersionToken(entry.vendor_offer_version) &&
      entry.consent_share_contact === true &&
      NAMED_VENDOR_CONTACT_RULES_VERSIONS.includes(
        consentVersion as typeof NAMED_VENDOR_CONTACT_RULES_VERSIONS[number],
      ) &&
      entry.rules_viewed_at &&
      entry.apple_non_sponsor_acknowledged === true &&
      entry.contact_share_scope === CONTACT_SHARE_SCOPE &&
      entry.draw_administration_contact_share_acknowledged === true &&
      entry.draw_administration_contact_share_acknowledged_at &&
      entry.draw_administration_contact_share_version === consentVersion &&
      cleanText(
        entry.draw_administration_contact_share_consent_text,
        2000,
      ) &&
      entry.vendor_marketing_consent === true &&
      entry.vendor_marketing_consented_at &&
      cleanText(entry.vendor_marketing_consent_text, 2000) &&
      entry.age_of_majority_attested === true &&
      entry.residency_attested === true &&
      entry.exclusions_attested === true &&
      entry.promotion_responsibility_acknowledged === true &&
      cleanText(entry.promotion_disclosure_text, 2000) &&
      entry.promotion_responsibility_acknowledged_at &&
      entry.promotion_responsibility_version === consentVersion &&
      entry.eligibility_attested_at &&
      cleanText(entry.consent_text, 2000) &&
      cleanText(entry.eligibility_attestation_text, 1000) &&
      cleanText(entry.prize_title, 180) &&
      cleanText(entry.prize_description, 1000) &&
      positiveCadValue(entry.prize_approx_value_cad) &&
      cleanText(entry.official_rules_url, 500) &&
      cleanText(entry.prize_provider_name, 180) &&
      cleanText(entry.eligibility_region, 300) &&
      validPromotionWindow(
        String(entry.entry_closes_at || ""),
        String(entry.draw_at || ""),
      ) &&
      cleanText(entry.odds_basis, 500) &&
      entry.no_purchase_required === true &&
      entry.skill_testing_question_required === true &&
      raffleMaxWinners(entry.max_winners) === Number(entry.max_winners) &&
      typeof entry.exclude_previous_winners === "boolean",
  );
}

function entryHasCurrentConsent(
  entry: Partial<RaffleEntry> | null | undefined,
) {
  return entryHasNamedVendorContactConsent(entry) &&
    entry?.consent_version === qrBingoConfig().rules_version &&
    entry.consent_version === CONTACT_SHARING_RULES_VERSION;
}

function entryHasProductionInPersonProof(
  entry: Partial<RaffleEntry> | null | undefined,
) {
  return entry?.entry_method === "qr_scan_opt_in" &&
    entry.in_show_scan_verified === true &&
    Boolean(entry.in_show_scan_verified_at);
}
function vendorVisibleDraw(
  draw: RaffleDraw,
  isolatedFixture?: IsolatedRaffleFixture | null,
  suppressOutboundEmail = false,
) {
  const status = draw.selection_status || "legacy";
  const emailTestRecipient = isolatedEmailTestRecipient(isolatedFixture);
  const vendorNoticeRequired = !emailTestRecipient &&
    qrBingoConfig().send_vendor_email;
  const coupleNoticeRequired = emailTestRecipient
    ? true
    : qrBingoConfig().send_couple_email;
  const noticeComplete = status === "verified" &&
    (!vendorNoticeRequired || Boolean(draw.vendor_email_sent_at)) &&
    (!coupleNoticeRequired || Boolean(draw.couple_email_sent_at));
  const noticePending = status === "verified" && !noticeComplete;
  const canTestSuppressedNotice = noticePending && suppressOutboundEmail &&
    isolatedFixturePurpose(isolatedFixture) === "app_review";
  return {
    id: draw.id,
    prize_title: draw.prize_title,
    draw_number: draw.draw_number,
    draw_reason: draw.draw_reason,
    drawn_at: draw.drawn_at,
    selection_status: status,
    eligibility_verified_at: draw.eligibility_verified_at,
    skill_question_verified_at: draw.skill_question_verified_at,
    verified_at: draw.verified_at,
    winner_rules_confirmed_at: draw.winner_rules_confirmed_at,
    skill_question_prompt: status === "potential"
      ? cleanText(draw.skill_question_prompt, 300)
      : "",
    vendor_email_sent_at: draw.vendor_email_sent_at,
    couple_email_sent_at: draw.couple_email_sent_at,
    email_error: status === "verified" ? draw.email_error : undefined,
    notice_pending: noticePending,
    notice_complete: noticeComplete,
    can_send_notice: noticePending && !suppressOutboundEmail &&
      qrDrawEmailsEnabled(isolatedFixture),
    can_test_suppressed_notice: canTestSuppressedNotice,
    winner_name: draw.winner_name,
    winner_email: draw.winner_email,
    winner_phone: draw.winner_phone,
    winner_wedding_date: draw.winner_wedding_date,
  };
}

function csvCell(value: unknown) {
  let raw = String(value ?? "").replace(/\u0000/g, "");
  if (/^[\s]*[=+@-]/.test(raw)) raw = `'${raw}`;
  return `"${raw.replace(/"/g, '""')}"`;
}

function reportFilenamePart(value: unknown, fallback: string) {
  const part = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return part || fallback;
}

async function participationReference(
  eventKey: string,
  vendorId: string,
  entryId: string,
) {
  const source = new TextEncoder().encode(
    `weddingwin-participation-report-v1:${eventKey}:${vendorId}:${entryId}`,
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  return `WW-${
    Array.from(digest.slice(0, 6)).map((value) =>
      value.toString(16).padStart(2, "0")
    ).join("").toUpperCase()
  }`;
}

async function countVendorNamedContactEntries(
  vendor: QrVendor,
  eventKey: string,
) {
  const vendorBdUserId = String(vendor.user_id || vendor.id);
  const { count, error } = await requireAdmin()
    .from("qr_bingo_raffle_entries")
    .select("id", { count: "exact", head: true })
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("vendor_bd_user_id", vendorBdUserId)
    .eq("consent_share_contact", true)
    .eq("contact_share_scope", CONTACT_SHARE_SCOPE)
    .in("consent_version", NAMED_VENDOR_CONTACT_RULES_VERSIONS)
    .eq("vendor_marketing_consent", true)
    .eq("draw_administration_contact_share_acknowledged", true)
    .in(
      "draw_administration_contact_share_version",
      NAMED_VENDOR_CONTACT_RULES_VERSIONS,
    );
  if (error) throw error;
  if (typeof count !== "number") {
    throw new Error(
      "Named-vendor contact entrant exact count was unavailable.",
    );
  }
  return count;
}

async function loadVendorEntryPool(
  vendor: QrVendor,
  eventKey: string,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const db = requireAdmin();
  const vendorBdUserId = String(vendor.user_id || vendor.id);
  const settings = await getSettings(vendor, eventKey);
  const excludePreviousWinners = settings?.exclude_previous_winners !== false;
  const entryRows = await collectExactPostgrestRows<RaffleEntry>(
    "Named-vendor contact QR Bingo entrants",
    (row) => String(row.id || ""),
    () =>
      db.from("qr_bingo_raffle_entries")
        .select("id", { count: "exact", head: true })
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendor.id)
        .eq("vendor_bd_user_id", vendorBdUserId)
        .eq("consent_share_contact", true)
        .eq("contact_share_scope", CONTACT_SHARE_SCOPE)
        .in("consent_version", NAMED_VENDOR_CONTACT_RULES_VERSIONS)
        .eq("vendor_marketing_consent", true)
        .eq("draw_administration_contact_share_acknowledged", true)
        .in(
          "draw_administration_contact_share_version",
          NAMED_VENDOR_CONTACT_RULES_VERSIONS,
        ),
    (from, to) =>
      db.from("qr_bingo_raffle_entries")
        .select("*")
        .eq("event_key", eventKey)
        .eq("vendor_bingo_id", vendor.id)
        .eq("vendor_bd_user_id", vendorBdUserId)
        .eq("consent_share_contact", true)
        .eq("contact_share_scope", CONTACT_SHARE_SCOPE)
        .in("consent_version", NAMED_VENDOR_CONTACT_RULES_VERSIONS)
        .eq("vendor_marketing_consent", true)
        .eq("draw_administration_contact_share_acknowledged", true)
        .in(
          "draw_administration_contact_share_version",
          NAMED_VENDOR_CONTACT_RULES_VERSIONS,
        )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );
  const [archivedIds, stateRows, drawRows] = await Promise.all([
    archivedLegacyEntryIds(eventKey, vendor.id),
    loadVendorSelectionStateRows(eventKey, vendor.id, vendorBdUserId),
    loadVendorDrawRows(eventKey, vendor.id, vendorBdUserId),
  ]);
  const controlledFixture = isolatedFixtureMatchesSettings(
    settings,
    isolatedFixture,
  );
  const entries = entryRows.filter((entry) =>
    !archivedIds.has(String(entry.id || "")) &&
    entryHasNamedVendorContactConsent(entry as RaffleEntry)
  );

  const priorWinnerCoupleIds = new Set<string>();
  if (excludePreviousWinners) {
    for (const row of drawRows) {
      if (row.selection_status === "verified") {
        priorWinnerCoupleIds.add(String(row.couple_bd_user_id || ""));
      }
    }
  }

  const stateByEntry = new Map(
    stateRows.map((row) => [String(row.entry_id), row]),
  );
  const drawByEntry = new Map<string, Record<string, unknown>>();
  for (const row of drawRows) {
    const entryId = String(row.entry_id || "");
    const previous = drawByEntry.get(entryId);
    if (
      !previous ||
      Number(row.draw_number || 0) > Number(previous.draw_number || 0)
    ) {
      drawByEntry.set(entryId, row as Record<string, unknown>);
    }
  }
  const selectionInProgress = drawRows.some((row) =>
    String(row.selection_status || "") === "potential"
  );
  const rows = await Promise.all(entries.map(async (entry) => {
    const state = stateByEntry.get(String(entry.id));
    const included = state?.included !== false;
    const selected = drawByEntry.get(String(entry.id));
    const selectionStatus = cleanText(selected?.selection_status, 30) ||
      "not_selected";
    const previousWinner = excludePreviousWinners &&
      priorWinnerCoupleIds.has(String(entry.couple_bd_user_id));
    const currentConsent = entryHasCurrentConsent(entry);
    const productionInPersonProof = entryHasProductionInPersonProof(entry);
    const selectionEligible = currentConsent &&
      (controlledFixture || productionInPersonProof);
    const poolStatus = !currentConsent
      ? "reacceptance_required"
      : !controlledFixture && !productionInPersonProof
      ? "in_person_scan_required"
      : !included
      ? "excluded"
      : selectionStatus === "potential"
      ? "already_selected"
      : selectionStatus === "disqualified"
      ? "disqualified"
      : previousWinner
      ? "previous_winner"
      : "included";
    const poolStatusReason = poolStatus === "reacceptance_required"
      ? "This historical entry remains in the contact list, but the couple must scan this booth and accept the current in-person entry rules before selection."
      : poolStatus === "in_person_scan_required"
      ? "This historical entry remains in the contact list but has no verified in-show booth scan, so it cannot be selected."
      : poolStatus === "excluded"
      ? cleanText(state?.exclusion_reason, 500)
      : poolStatus === "already_selected"
      ? "This entrant is the potential winner currently awaiting review."
      : poolStatus === "disqualified"
      ? "This entrant has a preserved disqualification record and cannot be selected again."
      : poolStatus === "previous_winner"
      ? "This couple already has a verified winner record for this vendor promotion."
      : "";
    return {
      participant_reference: await participationReference(
        eventKey,
        vendor.id,
        entry.id,
      ),
      couple_name: entry.couple_name,
      couple_email: entry.couple_email,
      couple_phone: entry.couple_phone,
      couple_wedding_date: entry.couple_wedding_date,
      entered_at: entry.consented_at || entry.created_at,
      entry_method: entry.entry_method || "qr_scan_opt_in",
      rules_version: entry.consent_version || "",
      included,
      exclusion_reason: included ? "" : cleanText(state?.exclusion_reason, 500),
      pool_status: poolStatus,
      pool_status_reason: poolStatusReason,
      selection_status: selectionStatus,
      previous_winner: previousWinner,
      selection_eligible: selectionEligible,
      in_selection_pool: selectionEligible && poolStatus === "included",
      can_update: selectionEligible && !selectionInProgress &&
        selectionStatus !== "disqualified",
      _entry_id: entry.id,
      _couple_bd_user_id: entry.couple_bd_user_id,
    };
  }));
  const publicRows = rows.map((
    { _entry_id: _entryId, _couple_bd_user_id: _coupleId, ...row },
  ) => row);
  return {
    rows,
    publicRows,
    entry_count: rows.length,
    included_entry_count:
      rows.filter((row) => row.selection_eligible && row.included).length,
    excluded_entry_count:
      rows.filter((row) => row.selection_eligible && !row.included).length,
    eligible_entry_count: rows.filter((row) => row.in_selection_pool).length,
    historical_entry_count: rows.filter((row) => !row.selection_eligible)
      .length,
    selection_in_progress: selectionInProgress,
    can_update_entries: !selectionInProgress,
  };
}

async function vendorRaffleEntriesResponse(
  vendor: QrVendor,
  eventKey: string,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const pool = await loadVendorEntryPool(vendor, eventKey, isolatedFixture);
  return {
    entries: pool.publicRows,
    entry_count: pool.entry_count,
    included_entry_count: pool.included_entry_count,
    excluded_entry_count: pool.excluded_entry_count,
    eligible_entry_count: pool.eligible_entry_count,
    historical_entry_count: pool.historical_entry_count,
    selection_in_progress: pool.selection_in_progress,
    can_update_entries: pool.can_update_entries,
  };
}

async function updateVendorRaffleEntrySelection(
  vendor: QrVendor,
  user: BdRow | undefined,
  body: Record<string, unknown>,
  eventKey: string,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const reference = cleanText(body.participant_reference, 40).toUpperCase();
  const source = vendorAcceptanceSource(body.client_platform);
  if (!/^WW-[0-9A-F]{12}$/.test(reference)) {
    return jsonResponse({
      ok: false,
      error: "A valid participant reference is required.",
    }, 400);
  }
  if (typeof body.included !== "boolean") {
    return jsonResponse({
      ok: false,
      error: "Choose whether this entrant is included in selection.",
    }, 400);
  }
  if (!source) {
    return jsonResponse({
      ok: false,
      error: "A valid app or website update source is required.",
    }, 400);
  }
  const exclusionReason = cleanText(body.exclusion_reason, 500);
  if (body.included === false && !exclusionReason) {
    return jsonResponse({
      ok: false,
      error: "A rules-based exclusion reason is required.",
    }, 400);
  }
  const pool = await loadVendorEntryPool(vendor, eventKey, isolatedFixture);
  const entrant = pool.rows.find((row) =>
    row.participant_reference === reference
  );
  if (!entrant) {
    return jsonResponse({
      ok: false,
      error: "That participant was not found in this vendor draw.",
    }, 404);
  }
  if (!entrant.can_update) {
    return jsonResponse({
      ok: false,
      conflict: true,
      error:
        "This participant cannot be changed while a potential winner is pending or after a preserved disqualification.",
    }, 409);
  }
  const { error } = await requireAdmin().rpc(
    "set_qr_bingo_raffle_entry_selection_state",
    {
      p_entry_id: entrant._entry_id,
      p_event_key: eventKey,
      p_vendor_bingo_id: vendor.id,
      p_vendor_bd_user_id: String(vendor.user_id || user?.user_id || ""),
      p_included: body.included,
      p_exclusion_reason: body.included ? "" : exclusionReason,
      p_actor_bd_user_id: String(user?.user_id || ""),
      p_source: source,
    },
  );
  if (error) {
    const message = cleanText(error.message, 500) ||
      "The participant selection state could not be updated.";
    const status = error.code === "P0002"
      ? 404
      : error.code === "22023"
      ? 400
      : 409;
    return jsonResponse(
      { ok: false, conflict: status === 409, error: message },
      status,
    );
  }
  return jsonResponse({
    ok: true,
    vendor: { id: vendor.id, name: vendor.name },
    message: body.included
      ? "The participant was restored to the selection pool."
      : "The participant was excluded from selection and remains in the contact export.",
    ...await vendorRaffleEntriesResponse(vendor, eventKey, isolatedFixture),
  });
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function secureRandomInteger(minimum: number, maximum: number) {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return minimum + (random[0] % (maximum - minimum + 1));
}

async function newSkillTestingChallenge() {
  const first = secureRandomInteger(11, 29);
  const second = secureRandomInteger(2, 9);
  const third = secureRandomInteger(1, 20);
  const answer = String(first * second + third).toLowerCase();
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = Array.from(saltBytes).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return {
    prompt: `Without assistance, what is (${first} x ${second}) + ${third}?`,
    salt,
    answerHash: await sha256Hex(`${salt}:${answer}`),
  };
}

function participationReportTime(value: unknown) {
  const timestamp = new Date(String(value || ""));
  if (Number.isNaN(timestamp.getTime())) return "";
  timestamp.setUTCSeconds(0, 0);
  return timestamp.toISOString();
}

async function buildVendorParticipationReport(
  vendor: QrVendor,
  eventKey: string,
  requestedByBdUserId: string,
  clientPlatform: string,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const db = requireAdmin();
  const currentConfig = qrBingoConfig();
  if (currentConfig.rules_version !== CONTACT_SHARING_RULES_VERSION) {
    throw new Error(
      "Named-vendor contact exports are unavailable until the current contact-sharing rules are published.",
    );
  }
  const vendorBdUserId = String(vendor.user_id || requestedByBdUserId);
  const rateWindowStart = new Date(Date.now() - 60_000).toISOString();
  const { count: recentReportCount, error: rateError } = await db
    .from("qr_bingo_participation_report_audit")
    .select("id", { count: "exact", head: true })
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .gte("requested_at", rateWindowStart);
  if (rateError) throw rateError;
  if ((recentReportCount || 0) >= 5) {
    return { rate_limited: true, retry_after_seconds: 60 } as const;
  }

  const exactConsentEntryCount = await countVendorNamedContactEntries(
    vendor,
    eventKey,
  );
  if (exactConsentEntryCount > 5000) {
    return {
      rate_limited: false,
      too_large: true,
      maximum_rows: 5000,
    } as const;
  }
  const pool = await loadVendorEntryPool(vendor, eventKey, isolatedFixture);
  if (pool.entry_count > 5000) {
    return {
      rate_limited: false,
      too_large: true,
      maximum_rows: 5000,
    } as const;
  }
  const generatedAt = new Date().toISOString();
  const rows = pool.rows.map((entry) => [
    eventKey,
    vendor.name,
    entry.participant_reference,
    entry.couple_name,
    entry.couple_email,
    entry.couple_phone,
    entry.couple_wedding_date,
    participationReportTime(entry.entered_at),
    entry.entry_method === "alternate_free_entry"
      ? "Alternate free entry"
      : "QR scan opt-in",
    entry.rules_version,
    "Yes",
    entry.selection_status,
    entry.pool_status,
    entry.pool_status_reason,
    "Yes - named vendor draw entry and wedding-related marketing",
  ]);
  const header = [
    "Event",
    "Vendor",
    "Participant Reference",
    "Name",
    "Email",
    "Phone",
    "Wedding Date",
    "Entered At",
    "Entry Method",
    "Rules Version",
    "Entrant Eligibility Attested",
    "Selection Status",
    "Selection Pool Status",
    "Selection Pool Reason",
    "Marketing Consent",
  ];
  const csv = `\uFEFF${
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  }\r\n`;
  const filename = `weddingwin-${reportFilenamePart(eventKey, "event")}-${
    reportFilenamePart(vendor.name, "vendor")
  }-draw-contacts.csv`;
  const platform = ["ios", "website"].includes(clientPlatform)
    ? clientPlatform
    : "unknown";
  const { error: auditError } = await db.from(
    "qr_bingo_participation_report_audit",
  ).insert({
    event_key: eventKey,
    vendor_bingo_id: vendor.id,
    vendor_bd_user_id: vendorBdUserId,
    requested_by_bd_user_id: requestedByBdUserId,
    client_platform: platform,
    row_count: rows.length,
    report_kind: "named_vendor_draw_contacts",
    contains_contact_data: true,
    contact_share_scope: CONTACT_SHARE_SCOPE,
    marketing_consent_included: true,
    rules_version: currentConfig.rules_version,
  });
  if (auditError) throw auditError;

  return {
    rate_limited: false,
    report: {
      filename,
      mime_type: "text/csv;charset=utf-8",
      generated_at: generatedAt,
      row_count: rows.length,
      csv,
      contains_contact_data: true,
      contact_share_scope: CONTACT_SHARE_SCOPE,
      marketing_consent_included: true,
      report_kind: "named_vendor_draw_contacts",
      rules_version: currentConfig.rules_version,
      event_key: eventKey,
      event_revision: currentConfig.revision,
      vendor_bingo_id: vendor.id,
      vendor_bd_user_id: vendorBdUserId,
      vendor_name: vendor.name,
      purpose:
        "Named-vendor draw administration and wedding-related marketing. It contains contact details only for couples who explicitly entered this vendor's draw and accepted the named-vendor marketing terms recorded in each row. Historical rows remain contacts but are not eligible for a new selection without current in-person consent and proof.",
    },
  } as const;
}

async function buildRaffleOffer(
  vendor: QrVendor,
  user: BdRow | undefined,
  eventKey = qrBingoConfig().event_key,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const settings = await getSettings(vendor, eventKey).catch(() => null);
  if (!isSettingsEnterable(settings, isolatedFixture)) return null;
  const snapshot = await loadCurrentVendorOfferSnapshot(settings);
  if (!offerSnapshotIsEnterable(snapshot)) return null;

  const db = requireAdmin();
  const { data: existing, error } = await db
    .from("qr_bingo_raffle_entries")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("couple_bd_user_id", String(user?.user_id || ""))
    .maybeSingle();
  if (error) throw error;
  if (existing?.id) {
    const archivedIds = await archivedLegacyEntryIds(eventKey, vendor.id);
    if (archivedIds.has(String(existing.id))) return null;
  }
  // Legacy entries are deliberately offered the current rules again. Only a
  // fully current, explicitly attested entry suppresses the opt-in offer.
  if (entryHasCurrentConsent(existing as RaffleEntry | null)) return null;

  const appReviewFixture = eventKey.startsWith("app-review-");
  const emailTestFixture = eventKey.startsWith("email-test-");
  return {
    app_review_fixture: appReviewFixture,
    email_test_fixture: emailTestFixture,
    outbound_email_suppressed: appReviewFixture,
    vendor_id: vendor.id,
    vendor_name: snapshot!.vendor_name,
    vendor_business_name: cleanText(vendor.company, 180) ||
      snapshot!.vendor_name,
    vendor_profile_url: absoluteWeddingWinUrl(vendor.full_filename),
    vendor_offer_version: snapshot!.vendor_offer_version,
    prize_count: raffleMaxWinners(snapshot!.max_winners),
    max_winners: raffleMaxWinners(snapshot!.max_winners),
    exclude_previous_winners: snapshot!.exclude_previous_winners !== false,
    prize_title: snapshot!.prize_title,
    prize_description: snapshot!.prize_description,
    prize_approx_value_cad: positiveCadValue(snapshot!.prize_approx_value_cad),
    eligibility_region: snapshot!.eligibility_region,
    entry_opens_at: snapshot!.history_starts_at,
    entry_closes_at: snapshot!.entry_closes_at,
    draw_at: snapshot!.draw_at,
    odds_basis: snapshot!.odds_basis,
    no_purchase_required: snapshot!.no_purchase_required,
    skill_testing_question_required: snapshot!.skill_testing_question_required,
    entry_limit:
      "One valid in-show QR entry per eligible couple per vendor draw.",
    eligibility_exclusions: ELIGIBILITY_EXCLUSIONS,
    terms_url: snapshot!.official_rules_url,
    consent_version: snapshot!.rules_version,
    entrant_share_fields: [
      "name",
      "email",
      "phone",
      "wedding date",
      "entry/consent evidence",
    ],
    administrator_name: snapshot!.administrator_name,
    co_sponsor_name: snapshot!.co_sponsor_name,
    prize_provider_name: snapshot!.prize_provider_name,
    apple_non_sponsor_disclaimer: APPLE_NON_SPONSOR_DISCLAIMER,
    participant_responsibility_disclosure:
      snapshot!.participant_responsibility_disclosure_text,
  };
}

function consentText(snapshot: VendorOfferSnapshot) {
  return `I reviewed and agree to version ${snapshot.rules_version} of the official rules. I authorize Wedding Win Inc. to process my entry, reconcile duplicates and prevent abuse, and share my name, email address, phone number, wedding date, and entry/consent evidence with ${snapshot.vendor_name}. I agree that ${snapshot.vendor_name} may use those details to administer this specific draw and contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time. ${snapshot.participant_responsibility_disclosure_text}`;
}

function drawAdministrationContactShareConsentText(
  snapshot: VendorOfferSnapshot,
) {
  return `I agree that Wedding Win Inc. may share my name, email address, phone number, wedding date, and entry/consent evidence with ${snapshot.vendor_name} to administer this specific draw and record my named-vendor marketing consent.`;
}

function vendorMarketingConsentText(snapshot: VendorOfferSnapshot) {
  return `I agree that ${snapshot.vendor_name} may use my name, email address, phone number, wedding date, and entry/consent evidence to administer this draw and contact me with wedding-related offers and promotions. I may unsubscribe from vendor marketing at any time.`;
}

async function optInToRaffle(
  vendor: QrVendor,
  user: BdRow | undefined,
  body: Record<string, unknown>,
  eventKey = qrBingoConfig().event_key,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const contactProfile = qrContactProfile(user);
  if (!contactProfile.complete) {
    return {
      entered: false,
      profile_incomplete: true,
      code: "profile_incomplete",
      missing_profile_fields: contactProfile.missing_fields,
      profile_edit_url: contactProfile.profile_edit_url,
      message: `Complete your ${
        contactProfile.missing_fields.join(", ")
      } before entering this vendor draw.`,
    };
  }
  const settings = await getSettings(vendor, eventKey);
  const currentSnapshot = await loadCurrentVendorOfferSnapshot(settings);
  const db = requireAdmin();
  const { data: existing, error: existingError } = await db
    .from("qr_bingo_raffle_entries")
    .select("*")
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("couple_bd_user_id", String(user?.user_id || ""))
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    const archivedIds = await archivedLegacyEntryIds(eventKey, vendor.id);
    if (archivedIds.has(String(existing.id))) {
      return {
        entered: false,
        already_entered: true,
        message: "This preserved test entry cannot be reused.",
      };
    }
  }
  if (entryHasCurrentConsent(existing as RaffleEntry | null)) {
    return {
      entered: false,
      already_entered: true,
      message: "You are already entered for this vendor draw.",
    };
  }
  if (!isSettingsEnterable(settings, isolatedFixture)) {
    return { entered: false, message: "This vendor draw is not open yet." };
  }
  if (!offerSnapshotIsEnterable(currentSnapshot)) {
    return {
      entered: false,
      code: "stale_vendor_offer",
      stale_vendor_offer: true,
      message: "This vendor offer changed. Reload it before entering.",
    };
  }
  const suppliedSnapshot = await loadVendorOfferSnapshot(
    eventKey,
    vendor.id,
    body.vendor_offer_version,
  );
  if (
    !suppliedSnapshot ||
    suppliedSnapshot.vendor_offer_version !==
      currentSnapshot!.vendor_offer_version
  ) {
    return {
      entered: false,
      code: "stale_vendor_offer",
      stale_vendor_offer: true,
      message: "This vendor offer changed. Reload it before entering.",
    };
  }
  if (
    Date.now() >= new Date(String(currentSnapshot!.entry_closes_at)).getTime()
  ) {
    return { entered: false, message: "This vendor draw has closed." };
  }
  if (!reviewedCurrentRules(body)) {
    return {
      entered: false,
      rules_required: true,
      message: "Review the current official rules before entering this draw.",
    };
  }
  if (!eligibilityAttested(body)) {
    return {
      entered: false,
      eligibility_required: true,
      message:
        "Confirm the age, residency, and promotion-exclusion eligibility statements before entering.",
    };
  }
  if (body.promotion_responsibility_acknowledged !== true) {
    return {
      entered: false,
      rules_required: true,
      message:
        "Accept the vendor-responsibility and platform-role disclosure before entering.",
    };
  }
  if (body.draw_administration_contact_share_acknowledged !== true) {
    return {
      entered: false,
      rules_required: true,
      message:
        "Confirm that this named vendor may receive your draw-entry contact details for this draw.",
    };
  }
  if (body.vendor_marketing_consent_acknowledged !== true) {
    return {
      entered: false,
      rules_required: true,
      message:
        "Confirm that this named vendor may use your contact details for wedding-related offers and promotions.",
    };
  }
  if (
    typeof body.participant_responsibility_disclosure !== "string" ||
    body.participant_responsibility_disclosure !==
      currentSnapshot!.participant_responsibility_disclosure_text
  ) {
    return {
      entered: false,
      code: "stale_vendor_offer",
      stale_vendor_offer: true,
      message:
        "The participant responsibility disclosure changed. Reload the vendor offer before entering.",
    };
  }

  const acceptedAt = new Date().toISOString();
  const entryPayload = {
    event_key: eventKey,
    vendor_bingo_id: currentSnapshot!.vendor_bingo_id,
    vendor_bd_user_id: currentSnapshot!.vendor_bd_user_id,
    vendor_name: currentSnapshot!.vendor_name,
    vendor_offer_version: currentSnapshot!.vendor_offer_version,
    max_winners: raffleMaxWinners(currentSnapshot!.max_winners),
    exclude_previous_winners:
      currentSnapshot!.exclude_previous_winners !== false,
    couple_bd_user_id: String(user?.user_id || ""),
    couple_name: displayName(user),
    couple_email: cleanText(user?.email, 160),
    couple_phone: phoneForUser(user),
    couple_wedding_date: weddingDateForUser(user),
    consent_share_contact: true,
    contact_share_scope: CONTACT_SHARE_SCOPE,
    consent_text: consentText(currentSnapshot!),
    draw_administration_contact_share_acknowledged: true,
    draw_administration_contact_share_acknowledged_at: acceptedAt,
    draw_administration_contact_share_version: currentSnapshot!.rules_version,
    draw_administration_contact_share_consent_text:
      drawAdministrationContactShareConsentText(currentSnapshot!),
    vendor_marketing_consent: true,
    vendor_marketing_consented_at: acceptedAt,
    vendor_marketing_consent_text: vendorMarketingConsentText(currentSnapshot!),
    entry_method: "qr_scan_opt_in",
    in_show_scan_verified: true,
    in_show_scan_verified_at: acceptedAt,
    promotion_responsibility_acknowledged: true,
    promotion_disclosure_text:
      currentSnapshot!.participant_responsibility_disclosure_text,
    promotion_responsibility_acknowledged_at: acceptedAt,
    promotion_responsibility_version: currentSnapshot!.rules_version,
    consent_version: currentSnapshot!.rules_version,
    consented_at: acceptedAt,
    prize_title: currentSnapshot!.prize_title,
    prize_description: currentSnapshot!.prize_description,
    official_rules_url: currentSnapshot!.official_rules_url,
    rules_viewed_at: acceptedAt,
    administrator_name: currentSnapshot!.administrator_name,
    co_sponsor_name: currentSnapshot!.co_sponsor_name,
    prize_provider_name: currentSnapshot!.prize_provider_name,
    apple_non_sponsor_acknowledged: true,
    prize_approx_value_cad: positiveCadValue(
      currentSnapshot!.prize_approx_value_cad,
    ),
    eligibility_region: currentSnapshot!.eligibility_region,
    entry_closes_at: currentSnapshot!.entry_closes_at,
    draw_at: currentSnapshot!.draw_at,
    odds_basis: currentSnapshot!.odds_basis,
    no_purchase_required: currentSnapshot!.no_purchase_required,
    skill_testing_question_required:
      currentSnapshot!.skill_testing_question_required,
    alternate_free_entry_url: currentSnapshot!.alternate_free_entry_url,
    age_of_majority_attested: true,
    residency_attested: true,
    exclusions_attested: true,
    eligibility_attested_at: acceptedAt,
    eligibility_attestation_text:
      `I have reached the age of majority, reside in ${
        currentSnapshot!.eligibility_region
      }, and am not excluded under the official rules.`,
  };

  if (existing?.id) {
    // `created_at` and the stable entry id are intentionally omitted so the
    // original entry/audit anchor survives explicit re-consent. The database
    // trigger snapshots both acceptances in its append-only consent ledger.
    const { error: updateError } = await db
      .from("qr_bingo_raffle_entries")
      .update(entryPayload)
      .eq("id", existing.id);
    if (updateError) {
      if (
        updateError.code === "23514" &&
        String(updateError.message || "").includes("stale_vendor_offer")
      ) {
        return {
          entered: false,
          code: "stale_vendor_offer",
          stale_vendor_offer: true,
        };
      }
      throw updateError;
    }
    return {
      entered: true,
      reconsented: true,
      message:
        "Your entry now records the current rules and eligibility attestations.",
    };
  }

  const { error } = await db
    .from("qr_bingo_raffle_entries")
    .insert(entryPayload);

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
      return {
        entered: false,
        already_entered: true,
        message: "You are already entered for this vendor draw.",
      };
    }
    if (concurrent?.id) {
      // The database trigger preserves the superseded acceptance before this
      // explicit re-consent updates the operational entry row.
      const { error: updateError } = await db
        .from("qr_bingo_raffle_entries")
        .update(entryPayload)
        .eq("id", concurrent.id);
      if (updateError) {
        if (
          updateError.code === "23514" &&
          String(updateError.message || "").includes("stale_vendor_offer")
        ) {
          return {
            entered: false,
            code: "stale_vendor_offer",
            stale_vendor_offer: true,
          };
        }
        throw updateError;
      }
      return { entered: true, reconsented: true };
    }
    // The identity registry also rejects a second entry for the same email
    // across QR and alternate-free-entry methods. Do not reveal which route
    // was used or any private reconciliation metadata to the client.
    return {
      entered: false,
      already_entered: true,
      message: "You are already entered for this vendor draw.",
    };
  }
  if (error) {
    if (
      error.code === "23514" &&
      String(error.message || "").includes("stale_vendor_offer")
    ) {
      return {
        entered: false,
        code: "stale_vendor_offer",
        stale_vendor_offer: true,
      };
    }
    throw error;
  }
  return { entered: true };
}

async function getVendorRaffleDashboard(
  vendor: QrVendor,
  user?: BdRow,
  eventKey = qrBingoConfig().event_key,
  allowEarlyDraw = false,
  suppressOutboundEmail = false,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const settings = await ensureSettings(vendor, eventKey);
  const entryPool = await loadVendorEntryPool(
    vendor,
    eventKey,
    isolatedFixture,
  );
  const activeEntryCount = await activeVendorEntryCount(eventKey, vendor.id);
  const offerActivated = await activatedVendorOfferExists(eventKey, vendor.id);
  const alternateEntryClosure = await alternateEntryClosureStatus(
    eventKey,
    vendor.id,
    isolatedFixture,
  );

  const draws = await loadVendorDrawRows(
    eventKey,
    vendor.id,
    String(vendor.user_id || vendor.id),
  );

  const activeWinnerCount =
    draws.filter((draw) =>
      draw.selection_status === "potential" ||
      draw.selection_status === "verified"
    ).length;
  const verifiedWinnerCount =
    draws.filter((draw) => draw.selection_status === "verified").length;
  const maxDraws = raffleMaxWinners(settings.max_winners);
  const drawsRemaining = Math.max(0, maxDraws - activeWinnerCount);
  const availableAt = drawAvailableAt(settings);
  const drawTimeOpen = allowEarlyDraw ||
    Date.now() >= new Date(availableAt).getTime();
  const emailTestRecipient = isolatedEmailTestRecipient(isolatedFixture);
  const verifiedNoticePending = draws.some((draw) =>
    draw.selection_status === "verified" &&
    (emailTestRecipient
      ? !draw.couple_email_sent_at
      : (qrBingoConfig().send_vendor_email && !draw.vendor_email_sent_at) ||
        (qrBingoConfig().send_couple_email && !draw.couple_email_sent_at))
  );
  const verifiedNoticeCanSend = verifiedNoticePending &&
    !suppressOutboundEmail &&
    qrDrawEmailsEnabled(isolatedFixture);
  const canTestSuppressedNotice = verifiedNoticePending &&
    suppressOutboundEmail &&
    isolatedFixturePurpose(isolatedFixture) === "app_review";

  return {
    event_key: eventKey,
    event_revision: qrBingoConfig().revision,
    settings: {
      ...settings,
      legal_terms_accepted: Boolean(
        settings.legal_terms_accepted &&
          settings.legal_terms_version === qrBingoConfig().rules_version &&
          settings.rules_viewed_at &&
          settings.apple_non_sponsor_acknowledged,
      ),
    },
    // The dashboard never returns the full entrant list. Draw history contains
    // only the selected person's contact snapshot and is scoped above to this
    // authenticated vendor and event. The separately audited CSV action remains
    // the only way to retrieve all currently consented entrants.
    entries: [],
    entry_count: entryPool.entry_count,
    included_entry_count: entryPool.included_entry_count,
    excluded_entry_count: entryPool.excluded_entry_count,
    eligible_entry_count: entryPool.eligible_entry_count,
    historical_entry_count: entryPool.historical_entry_count,
    selection_in_progress: entryPool.selection_in_progress,
    can_update_entries: entryPool.can_update_entries,
    material_terms_locked: activeEntryCount > 0 || offerActivated,
    draws: draws.map((draw) =>
      vendorVisibleDraw(draw, isolatedFixture, suppressOutboundEmail)
    ),
    draw_opens_at: availableAt,
    entry_closes_at: settings.entry_closes_at ||
      qrBingoConfig().entry_closes_at,
    draw_at: settings.draw_at || qrBingoConfig().draw_at,
    eligibility_region: settings.eligibility_region ||
      qrBingoConfig().eligibility_region,
    odds_basis: settings.odds_basis || ODDS_BASIS,
    no_purchase_required: true,
    skill_testing_question_required: true,
    max_draws: maxDraws,
    draws_remaining: drawsRemaining,
    draw_limit_reached: drawsRemaining <= 0,
    max_winners: maxDraws,
    active_winner_count: activeWinnerCount,
    verified_winner_count: verifiedWinnerCount,
    remaining_winner_slots: drawsRemaining,
    exclude_previous_winners: settings.exclude_previous_winners !== false,
    can_draw: entryPool.eligible_entry_count > 0 &&
      isSettingsEnterable(settings, isolatedFixture) && drawTimeOpen &&
      !entryPool.selection_in_progress && alternateEntryClosure.ready &&
      drawsRemaining > 0,
    alternate_entry_reconciliation: alternateEntryClosure,
    can_send_verified_winner_notice: verifiedNoticeCanSend,
    can_test_suppressed_notice: canTestSuppressedNotice,
    verified_potential_winner_notice_pending: verifiedNoticePending,
    outbound_email_enabled: qrDrawEmailsEnabled(isolatedFixture) &&
      !suppressOutboundEmail,
    app_review_fixture: Boolean(
      eventKey !== qrBingoConfig().event_key &&
        isolatedFixturePurpose(isolatedFixture) === "app_review",
    ),
    email_test_fixture: Boolean(emailTestRecipient),
    outbound_email_suppressed: suppressOutboundEmail,
    terms_url: qrBingoConfig().official_rules_url,
    rules_version: qrBingoConfig().rules_version,
    vendor_responsibility_disclosure: vendorResponsibilityDisclosure(
      vendor.name,
    ),
    rules_current: isSettingsEnterable(
      { ...settings, enabled: true },
      isolatedFixture,
    ),
    administrator_name: RAFFLE_ADMINISTRATOR,
    sponsor_name: vendor.name,
    co_sponsor_name: "",
    prize_provider_name: vendor.name,
    apple_non_sponsor_disclaimer: APPLE_NON_SPONSOR_DISCLAIMER,
  };
}

async function loadQrDrawEmailSigningKey() {
  const { data, error } = await requireAdmin().rpc(
    "get_qr_draw_email_private_key",
  );
  if (error) {
    throw new Error(`QR draw email signing key unavailable: ${error.message}`);
  }

  const pem = typeof data === "string" ? data.trim() : "";
  const encoded = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  if (!encoded || !pem.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      "QR draw email signing key unavailable: RPC returned no PKCS#8 private key.",
    );
  }

  try {
    const bytes = Uint8Array.from(
      atob(encoded),
      (character) => character.charCodeAt(0),
    );
    return await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new Error(
      "QR draw email signing key unavailable: invalid PKCS#8 private key.",
    );
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

async function claimDrawEmailDelivery(
  drawId: string,
  channel: DrawEmailChannel,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const emailTestRecipient = isolatedEmailTestRecipient(isolatedFixture);
  if (emailTestRecipient && channel !== "couple") {
    throw new Error(
      "The isolated email test permits only the allowlisted couple notice.",
    );
  }
  const claimRpc = emailTestRecipient
    ? "claim_verified_qr_bingo_test_draw_email_delivery"
    : "claim_verified_qr_bingo_draw_email_delivery";
  const { data, error } = await requireAdmin().rpc(claimRpc, {
    p_draw_id: drawId,
    p_channel: channel,
    p_lease_seconds: 120,
  });
  if (error) throw error;
  const claim = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const status = claim.claimed === true
    ? "claimed"
    : claim.already_sent === true
    ? "sent"
    : claim.busy === true
    ? "busy"
    : claim.ambiguous === true
    ? "ambiguous"
    : "unavailable";
  return {
    channel,
    status,
    delivery_key: cleanText(claim.delivery_key, 200),
    claim_token: cleanText(claim.claim_token, 80),
  } as DrawEmailClaim;
}

async function finalizeDrawEmailDelivery(
  claim: DrawEmailClaim,
  outcome: "sent" | "retryable_failure" | "ambiguous",
  errorMessage = "",
  providerMessageId = "",
) {
  const { data, error } = await requireAdmin().rpc(
    "finalize_qr_bingo_draw_email_delivery",
    {
      p_delivery_key: claim.delivery_key,
      p_claim_token: claim.claim_token,
      p_outcome: outcome,
      p_provider_message_id: cleanText(providerMessageId, 200),
      p_error: cleanText(errorMessage, 1000),
    },
  );
  if (error) throw error;
  return data;
}

async function sendWebsiteDrawEmails(
  payload: Record<string, string>,
  signingKey: CryptoKey,
) {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const payloadText = JSON.stringify(payload);
  const signature = await rsaSha256Base64(
    `${payloadText}|${expires}`,
    signingKey,
  );
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
    const message = cleanText(
      body.message || `WeddingWin email HTTP ${response.status}`,
      1000,
    );
    return {
      vendor: {
        sent: body.vendor_sent === true,
        error: body.vendor_sent === true ? "" : message,
      },
      couple: {
        sent: body.couple_sent === true,
        error: body.couple_sent === true ? "" : message,
      },
      raw: body,
    };
  }

  return {
    vendor: {
      sent: body.vendor_sent === true,
      error: body.vendor_sent === true
        ? ""
        : "Vendor email delivery was not confirmed.",
    },
    couple: {
      sent: body.couple_sent === true,
      error: body.couple_sent === true
        ? ""
        : "Couple email delivery was not confirmed.",
    },
    raw: body,
  };
}

async function sendDrawEmails(
  vendorUser: BdRow | undefined,
  draw: RaffleDraw,
  signingKey: CryptoKey,
  vendor?: QrVendor,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  if (
    draw.selection_status !== "verified" ||
    !draw.eligibility_verified_at ||
    !draw.skill_question_verified_at ||
    !draw.verified_at
  ) {
    throw new Error(
      "Potential-winner notices are blocked until the vendor confirms the couple meets the draw rules, Wedding Win confirms the answer to the required short math question is correct, and the vendor records the rules/release confirmation.",
    );
  }
  const emailTestRecipient = isolatedEmailTestRecipient(isolatedFixture);
  if (!qrDrawEmailsEnabled(isolatedFixture)) {
    throw new Error(
      "Outbound potential-winner notices are disabled until the production verified-fulfillment delivery mode is explicitly configured.",
    );
  }
  if (emailTestRecipient) {
    const fixture = isolatedFixture as EmailTestRaffleFixture;
    if (
      draw.event_key !== fixture.event_key ||
      draw.vendor_bingo_id !== fixture.vendor_bingo_id ||
      draw.vendor_bd_user_id !== fixture.vendor_bd_user_id ||
      draw.couple_bd_user_id !== fixture.couple_bd_user_id ||
      cleanText(draw.winner_email, 254).toLowerCase() !== emailTestRecipient
    ) {
      throw new Error(
        "The isolated email-test draw does not match its allowlisted fixture.",
      );
    }
  }
  const vendorRequested = emailTestRecipient
    ? false
    : qrBingoConfig().send_vendor_email;
  const coupleRequested = emailTestRecipient
    ? true
    : qrBingoConfig().send_couple_email;
  const vendorAlreadySent = Boolean(draw.vendor_email_sent_at) ||
    !vendorRequested;
  const coupleAlreadySent = Boolean(draw.couple_email_sent_at) ||
    !coupleRequested;
  if (vendorAlreadySent && coupleAlreadySent) {
    return {
      vendor: { sent: true, already_sent: true, error: "" },
      couple: { sent: true, already_sent: true, error: "" },
      error: "",
      complete: true,
    };
  }

  const vendorEmail = cleanText(vendorUser?.email, 160);
  const safePrize = cleanText(draw.prize_title, 200);
  const safeVendorName = cleanText(draw.vendor_name, 160);
  const safePrizeDescription = cleanText(draw.prize_description, 1000) ||
    "Prize details will be provided by the vendor.";
  const safeDrawItem = safePrizeDescription || safePrize ||
    "the booth draw item";
  const safeWinnerPhone = cleanText(draw.winner_phone, 120) || "Not provided";
  const safeWinnerWeddingDate = cleanText(draw.winner_wedding_date, 120) ||
    "Not provided";
  const vendorProfileUrl = absoluteWeddingWinUrl(
    vendor?.full_filename || vendorUser?.filename,
  );
  const profileLine = vendorProfileUrl
    ? `Connect through WeddingWin.ca: ${vendorProfileUrl}`
    : "You can connect with them through WeddingWin.ca.";
  const vendorText = [
    `Your business confirmed eligibility and the rules/release step for this potential winner in ${safeVendorName}'s prize draw, and Wedding Win confirmed the couple's answer to the required short math question was correct.`,
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
    "WeddingWin.ca has informed the verified potential winner that your business may contact them about this prize and, under the terms they accepted when entering, wedding-related offers and promotions.",
    "",
    "Next step",
    "This couple accepted your draw and named-vendor wedding-related marketing terms. Honour unsubscribe requests and protect the information under the Vendor Draw Rules.",
  ].join("\n");
  const coupleText = [
    `Hi ${cleanText(draw.winner_name, 80) || "there"},`,
    "",
    `You were selected as a potential winner in ${safeVendorName}'s prize draw. ${safeVendorName} confirmed that you meet the draw rules and completed the rules/release step, and Wedding Win confirmed your answer to the required short math question was correct.`,
    "",
    "Your draw",
    `Vendor: ${safeVendorName}`,
    `Draw item: ${safeDrawItem}`,
    "",
    "What happens next",
    `${safeVendorName} may contact you about this prize and, under the terms you accepted when entering, wedding-related offers and promotions. You may unsubscribe from vendor marketing at any time. This notice does not itself award the prize.`,
    profileLine,
    "",
    "Why you received this",
    "You entered this vendor's optional prize draw through one of its permitted entry methods.",
    "",
    "WeddingWin.ca",
  ].join("\n");

  const claimOutcomes = await Promise.allSettled([
    vendorAlreadySent
      ? null
      : claimDrawEmailDelivery(draw.id, "vendor", isolatedFixture),
    coupleAlreadySent
      ? null
      : claimDrawEmailDelivery(draw.id, "couple", isolatedFixture),
  ]);
  const claims = claimOutcomes
    .filter((
      outcome,
    ): outcome is PromiseFulfilledResult<DrawEmailClaim | null> =>
      outcome.status === "fulfilled"
    )
    .map((outcome) => outcome.value);
  const claimFailure = claimOutcomes.find((outcome) =>
    outcome.status === "rejected"
  ) as PromiseRejectedResult | undefined;
  if (claimFailure) {
    await Promise.all(
      claims
        .filter((claim): claim is DrawEmailClaim => claim?.status === "claimed")
        .map((claim) =>
          finalizeDrawEmailDelivery(
            claim,
            "retryable_failure",
            "A paired delivery claim failed before any email was sent.",
          )
        ),
    );
    throw claimFailure.reason;
  }
  const claimByChannel = new Map(
    claims.filter((claim): claim is DrawEmailClaim => Boolean(claim)).map((
      claim,
    ) => [claim.channel, claim]),
  );
  const preflightResult = (channel: DrawEmailChannel, alreadySent: boolean) => {
    if (alreadySent) return { sent: true, already_sent: true, error: "" };
    const claim = claimByChannel.get(channel);
    if (claim?.status === "sent") {
      return { sent: true, already_sent: true, error: "" };
    }
    if (
      claim?.status === "claimed" && claim.delivery_key && claim.claim_token
    ) return null;
    if (claim?.status === "ambiguous") {
      return {
        sent: false,
        error:
          "Delivery status is ambiguous and requires administrator reconciliation; it was not resent.",
      };
    }
    if (claim?.status === "busy") {
      return { sent: false, error: "Delivery is already in progress." };
    }
    return {
      sent: false,
      error: "Email delivery could not be claimed safely.",
    };
  };
  let vendorResult = preflightResult("vendor", vendorAlreadySent);
  let coupleResult = preflightResult("couple", coupleAlreadySent);
  const vendorClaim = vendorResult === null
    ? claimByChannel.get("vendor")
    : undefined;
  const coupleClaim = coupleResult === null
    ? claimByChannel.get("couple")
    : undefined;
  const claimed = [vendorClaim, coupleClaim].filter((
    claim,
  ): claim is DrawEmailClaim => Boolean(claim));

  let emailSend: Awaited<ReturnType<typeof sendWebsiteDrawEmails>> | null =
    null;
  let transportError = "";
  try {
    if (claimed.length) {
      emailSend = await sendWebsiteDrawEmails({
        winner_verified: "1",
        draw_id: draw.id,
        event_key: draw.event_key,
        event_config_revision: String(qrBingoConfig().revision),
        delivery_mode: emailTestRecipient
          ? "isolated_verified_email_test"
          : qrBingoConfig().email_delivery_mode,
        email_test_fixture: emailTestRecipient ? "1" : "0",
        fixture_id: isEmailTestFixture(isolatedFixture)
          ? isolatedFixture.id
          : "",
        verification_state: "verified_potential_winner",
        send_vendor: vendorClaim ? "1" : "0",
        send_couple: coupleClaim ? "1" : "0",
        vendor_delivery_key: vendorClaim?.delivery_key || "",
        couple_delivery_key: coupleClaim?.delivery_key || "",
        vendor_to: vendorEmail,
        vendor_subject: qrBingoConfig().vendor_email_subject,
        vendor_text: vendorText,
        couple_to: emailTestRecipient || cleanText(draw.winner_email, 160),
        couple_subject: qrBingoConfig().couple_email_subject,
        couple_text: coupleText,
      }, signingKey);
    }
  } catch (error) {
    transportError =
      cleanText(error instanceof Error ? error.message : String(error), 1000) ||
      "Email delivery failed.";
  }

  for (const claim of claimed) {
    const channelResult = transportError
      ? { sent: false, error: transportError }
      : emailSend?.[claim.channel] ||
        { sent: false, error: "Email delivery was not confirmed." };
    const outcome = transportError
      ? "ambiguous"
      : channelResult.sent
      ? "sent"
      : "retryable_failure";
    try {
      await finalizeDrawEmailDelivery(claim, outcome, channelResult.error);
    } catch (error) {
      const finalizeError = cleanText(
        error instanceof Error ? error.message : String(error),
        1000,
      );
      channelResult.sent = false;
      channelResult.error =
        `Delivery ledger could not be finalized safely: ${finalizeError}`;
    }
    if (claim.channel === "vendor") vendorResult = channelResult;
    else coupleResult = channelResult;
  }

  const errors: string[] = [];
  if (vendorRequested && !vendorResult?.sent) {
    errors.push(`vendor email: ${vendorResult?.error || "not confirmed"}`);
  }
  if (coupleRequested && !coupleResult?.sent) {
    errors.push(`couple email: ${coupleResult?.error || "not confirmed"}`);
  }
  const emailError = errors.join(" | ");
  const { error: updateError } = await requireAdmin()
    .from("qr_bingo_raffle_draws")
    .update({ email_error: emailError })
    .eq("id", draw.id);
  if (updateError) throw updateError;
  return {
    vendor: vendorResult,
    couple: coupleResult,
    error: emailError,
    complete: errors.length === 0,
  };
}

async function drawWinner(
  vendor: QrVendor,
  user: BdRow | undefined,
  reason: string,
  eventKey = qrBingoConfig().event_key,
  allowEarlyDraw = false,
  suppressOutboundEmail = false,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const skillChallenge = await newSkillTestingChallenge();
  const { data, error } = await requireAdmin().rpc(
    "select_qr_bingo_potential_winner",
    {
      p_event_key: eventKey,
      p_vendor_bingo_id: vendor.id,
      p_vendor_bd_user_id: String(vendor.user_id || vendor.id),
      p_drawn_by_bd_user_id: String(user?.user_id || ""),
      p_draw_reason: cleanText(reason, 120) || "initial",
      p_skill_question_prompt: skillChallenge.prompt,
      p_skill_question_salt: skillChallenge.salt,
      p_skill_question_answer_hash: skillChallenge.answerHash,
    },
  );
  if (error) {
    const dashboard = await getVendorRaffleDashboard(
      vendor,
      user,
      eventKey,
      allowEarlyDraw,
      suppressOutboundEmail,
      isolatedFixture,
    );
    return jsonResponse({
      ok: false,
      conflict: true,
      error: cleanText(error.message, 500) ||
        "The potential winner could not be selected safely.",
      ...dashboard,
    }, 409);
  }

  const selection = data && typeof data === "object"
    ? data as Record<string, unknown>
    : {};
  if (selection.ok !== true) {
    const code = cleanText(selection.code, 80);
    const status = code === "draw_not_open"
      ? 403
      : code === "awaiting_verification" ||
          code === "alternate_entry_reconciliation_incomplete" ||
          code === "stale_vendor_offer" || code === "stale_event_config"
      ? 409
      : 400;
    const dashboard = await getVendorRaffleDashboard(
      vendor,
      user,
      eventKey,
      allowEarlyDraw,
      suppressOutboundEmail,
      isolatedFixture,
    );
    return jsonResponse({
      ...selection,
      ok: false,
      error: cleanText(selection.error, 500) ||
        "The potential winner could not be selected safely.",
      ...dashboard,
    }, status);
  }

  const draw = selection.draw && typeof selection.draw === "object"
    ? selection.draw as RaffleDraw
    : null;
  if (!draw?.id) {
    throw new Error("Atomic potential-winner selection returned no draw.");
  }

  const dashboard = await getVendorRaffleDashboard(
    vendor,
    user,
    eventKey,
    allowEarlyDraw,
    suppressOutboundEmail,
    isolatedFixture,
  );
  return jsonResponse({
    ok: true,
    draw: vendorVisibleDraw(
      draw,
      isolatedFixture,
      suppressOutboundEmail,
    ),
    selection_pool_size: Number(selection.eligible_entry_count || 0),
    potential_winner_selected: true,
    verification_required: true,
    message:
      "Potential winner selected. Confirm the couple meets the draw rules, ask them the one short math question shown in the dashboard, enter their answer, and complete the rules/release step before any fulfillment notice or prize claim.",
    ...dashboard,
  });
}

async function reviewPotentialWinner(
  vendor: QrVendor,
  user: BdRow | undefined,
  body: Record<string, unknown>,
  eventKey: string,
  allowEarlyDraw: boolean,
  suppressOutboundEmail: boolean,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const drawId = cleanText(body.draw_id, 80);
  const requestedDecision = cleanText(body.decision, 20).toLowerCase();
  const decision = requestedDecision === "confirm"
    ? "verified"
    : requestedDecision === "disqualify"
    ? "disqualified"
    : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(drawId)
  ) {
    return jsonResponse({
      ok: false,
      error: "A valid potential-winner selection is required.",
    }, 400);
  }
  if (!decision) {
    return jsonResponse(
      { ok: false, error: "Choose confirm or disqualify." },
      400,
    );
  }

  const { data: ownedDraw, error: drawError } = await requireAdmin()
    .from("qr_bingo_raffle_draws")
    .select("id,selection_status")
    .eq("id", drawId)
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("vendor_bd_user_id", String(vendor.user_id || user?.user_id || ""))
    .maybeSingle();
  if (drawError) throw drawError;
  if (!ownedDraw) {
    return jsonResponse({
      ok: false,
      error: "This selection does not belong to the signed-in vendor.",
    }, 403);
  }
  if (ownedDraw.selection_status !== "potential") {
    return jsonResponse({
      ok: false,
      error: "Only a pending potential winner can be reviewed.",
    }, 409);
  }

  const winnerEvidence = decision === "verified"
    ? parseWinnerVerificationEvidence(body.review_notes)
    : null;
  const notes = decision === "disqualified"
    ? cleanText(body.disqualification_reason, 1000)
    : winnerEvidence?.normalized || "";
  if (decision === "disqualified" && !notes) {
    return jsonResponse({
      ok: false,
      error: "Add the disqualification reason.",
    }, 400);
  }
  if (
    decision === "verified" &&
    (
      body.eligibility_confirmed !== true ||
      body.rules_release_confirmed !== true ||
      !cleanText(body.skill_question_answer, 80) ||
      !notes
    )
  ) {
    return jsonResponse({
      ok: false,
      error:
        "Confirm the couple meets the draw rules, enter their answer to the required short math question, confirm the rules/release step, and record valid Date, Method, and Reference evidence.",
    }, 400);
  }

  const reviewer = `vendor:${cleanText(user?.user_id, 80)}:${
    cleanText(vendor.name, 160)
  }`;
  const { error: reviewError } = await requireAdmin().rpc(
    "review_qr_bingo_potential_winner_by_vendor",
    {
      p_draw_id: drawId,
      p_event_key: eventKey,
      p_vendor_bingo_id: vendor.id,
      p_vendor_bd_user_id: String(vendor.user_id || user?.user_id || ""),
      p_decision: decision,
      p_eligibility_confirmed: body.eligibility_confirmed === true,
      p_skill_question_answer: cleanText(body.skill_question_answer, 80),
      p_rules_release_confirmed: body.rules_release_confirmed === true,
      p_reviewed_by: reviewer,
      p_notes: notes,
    },
  );
  if (reviewError) {
    const message = cleanText(reviewError.message, 500);
    const status = /incorrect|answer|required/i.test(message) ? 400 : 409;
    return jsonResponse({
      ok: false,
      error: message || "The potential-winner review could not be recorded.",
    }, status);
  }

  const dashboard = await getVendorRaffleDashboard(
    vendor,
    user,
    eventKey,
    allowEarlyDraw,
    suppressOutboundEmail,
    isolatedFixture,
  );
  return jsonResponse({
    ok: true,
    vendor,
    message: decision === "verified"
      ? "Vendor verification recorded. The potential-winner notices may now be sent for prize fulfillment."
      : "Potential winner disqualified. The audit record was preserved and a replacement may be selected.",
    ...dashboard,
  });
}

async function sendVerifiedWinnerNotice(
  vendor: QrVendor,
  user: BdRow | undefined,
  body: Record<string, unknown>,
  eventKey: string,
  allowEarlyDraw: boolean,
  suppressOutboundEmail: boolean,
  isolatedFixture?: IsolatedRaffleFixture | null,
) {
  const drawId = cleanText(body.draw_id, 80);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(drawId)
  ) {
    return jsonResponse({
      ok: false,
      error: "A valid verified-winner selection is required.",
    }, 400);
  }
  const { data: ownedDraw, error: drawError } = await requireAdmin()
    .from("qr_bingo_raffle_draws")
    .select("*")
    .eq("id", drawId)
    .eq("event_key", eventKey)
    .eq("vendor_bingo_id", vendor.id)
    .eq("vendor_bd_user_id", String(vendor.user_id || user?.user_id || ""))
    .maybeSingle();
  if (drawError) throw drawError;
  if (!ownedDraw) {
    return jsonResponse({
      ok: false,
      error: "This selection does not belong to the signed-in vendor.",
    }, 403);
  }
  if (ownedDraw.selection_status !== "verified") {
    return jsonResponse({
      ok: false,
      error: "Only a verified potential winner can receive a notice.",
    }, 409);
  }
  if (suppressOutboundEmail) {
    const dashboard = await getVendorRaffleDashboard(
      vendor,
      user,
      eventKey,
      allowEarlyDraw,
      true,
      isolatedFixture,
    );
    return jsonResponse({
      ...dashboard,
      ok: true,
      draw: vendorVisibleDraw(ownedDraw as RaffleDraw, isolatedFixture, true),
      suppressed: true,
      suppressed_test_complete: true,
      outbound_email_suppressed: true,
      verified_winner_notice: false,
      email_result: {
        complete: true,
        suppressed: true,
        vendor_sent: false,
        couple_sent: false,
      },
      message:
        "Suppressed test completed. The isolated App Review fixture did not send email and no delivery timestamp was recorded.",
    });
  }
  if (!qrDrawEmailsEnabled(isolatedFixture)) {
    return jsonResponse({
      ok: false,
      outbound_email_disabled: true,
      error:
        "Outbound potential-winner notices are disabled until Wedding Win explicitly enables the production verified-fulfillment delivery mode.",
    }, 503);
  }

  const signingKey = await loadQrDrawEmailSigningKey();
  const emailResult = await sendDrawEmails(
    user,
    ownedDraw as RaffleDraw,
    signingKey,
    vendor,
    isolatedFixture,
  );
  const { data: refreshedDraw, error: refreshedDrawError } =
    await requireAdmin()
      .from("qr_bingo_raffle_draws")
      .select("*")
      .eq("id", drawId)
      .eq("event_key", eventKey)
      .eq("vendor_bingo_id", vendor.id)
      .eq("vendor_bd_user_id", String(vendor.user_id || user?.user_id || ""))
      .single();
  if (refreshedDrawError) throw refreshedDrawError;
  const dashboard = await getVendorRaffleDashboard(
    vendor,
    user,
    eventKey,
    allowEarlyDraw,
    suppressOutboundEmail,
    isolatedFixture,
  );
  if (!emailResult.complete) {
    return jsonResponse({
      ok: false,
      partial_delivery: true,
      error:
        "One or more verified-winner notices were not confirmed. Unconfirmed notices were not marked sent.",
      draw: vendorVisibleDraw(
        refreshedDraw as RaffleDraw,
        isolatedFixture,
        suppressOutboundEmail,
      ),
      email_result: emailResult,
      verified_winner_notice: false,
      ...dashboard,
    }, 502);
  }
  return jsonResponse({
    ok: true,
    draw: vendorVisibleDraw(
      refreshedDraw as RaffleDraw,
      isolatedFixture,
      suppressOutboundEmail,
    ),
    email_result: emailResult,
    verified_winner_notice: true,
    ...dashboard,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const nativeSession = body?.native_session as NativeSession | undefined;
    const action = String(body?.action || "vendor_raffle_get");
    const runtimeConfig = await loadPublishedQrBingoConfig(requireAdmin());
    return await qrBingoConfigContext.run(runtimeConfig, async () => {
      if (action === "alternate_free_entry_offers") {
        return jsonResponse(
          {
            ok: false,
            code: "offsite_entry_retired",
            error:
              "Vendor draws are available only to eligible couples who visit the booth and scan its QR code at the wedding show.",
          },
          410,
          false,
        );
      }

      if (!runtimeConfig.scan_enabled && action === "scan") {
        return jsonResponse({
          ok: false,
          error: "QR Bingo scanning is temporarily disabled.",
        }, 503);
      }
      if (
        !runtimeConfig.vendor_draws_enabled &&
        [
          "raffle_offer",
          "raffle_opt_in",
          "vendor_raffle_update",
          "vendor_raffle_entry_update",
          "vendor_raffle_draw",
          "vendor_raffle_review",
          "vendor_raffle_send_notice",
        ].includes(action)
      ) {
        return jsonResponse({
          ok: false,
          error: "Vendor QR Bingo draws are temporarily disabled.",
        }, 503);
      }

      if (!nativeSession?.user_id || !nativeSession?.token) {
        return jsonResponse(
          { ok: false, error: "Native session required" },
          401,
        );
      }

      if (!await nativeSessionMatchesCachedBdIdentity(nativeSession)) {
        return jsonResponse(
          { ok: false, error: "Native session expired" },
          401,
        );
      }

      if (action === "fixture_context") {
        const fixtureUser = await fetchFullBdUserById(nativeSession.user_id);
        if (
          !fixtureUser?.user_id ||
          String(fixtureUser.user_id) !== String(nativeSession.user_id)
        ) {
          return jsonResponse(
            { ok: false, error: "Native session expired" },
            401,
          );
        }
        const fixture = await loadAppReviewRaffleFixture(
          nativeSession.user_id,
        ) || await loadEmailTestRaffleFixture(nativeSession.user_id);
        return jsonResponse(
          await isolatedFixtureContext(
            fixture,
            String(fixtureUser.user_id),
          ),
        );
      }

      const isVendorRaffleAction = action === "vendor_raffle_get" ||
        action === "vendor_raffle_update" || action === "vendor_raffle_draw" ||
        action === "vendor_raffle_export" ||
        action === "vendor_raffle_review" ||
        action === "vendor_raffle_entries_get" ||
        action === "vendor_raffle_entry_update" ||
        action === "vendor_raffle_send_notice";
      const reviewFixture =
        await loadAppReviewRaffleFixture(nativeSession.user_id) ||
        await loadEmailTestRaffleFixture(nativeSession.user_id);
      const isReviewVendor = Boolean(
        reviewFixture &&
          String(nativeSession.user_id) === reviewFixture.vendor_bd_user_id,
      );
      const isIsolatedReviewVendorAction = Boolean(
        reviewFixture && isReviewVendor && isVendorRaffleAction,
      );

      // Always load the current BD member with tags. Even an isolated fixture
      // vendor must still belong to the currently published QR Bingo roster.
      const user = await fetchFullBdUserById(nativeSession.user_id);
      if (
        !user?.user_id || String(user.user_id) !== String(nativeSession.user_id)
      ) {
        return jsonResponse(
          { ok: false, error: "Native session expired" },
          401,
        );
      }
      const isReviewCouple = Boolean(
        reviewFixture &&
          String(user.user_id) ===
            (isEmailTestFixture(reviewFixture)
              ? reviewFixture.couple_bd_user_id
              : reviewFixture.authenticated_couple_bd_user_id),
      );
      const contactProfile = qrContactProfile(user);
      if (
        ["scan", "raffle_offer", "raffle_opt_in"].includes(action) &&
        !contactProfile.complete
      ) {
        return jsonResponse({
          ok: false,
          code: "profile_incomplete",
          error: `Complete your ${
            contactProfile.missing_fields.join(", ")
          } before continuing with QR Bingo.`,
          missing_profile_fields: contactProfile.missing_fields,
          profile_edit_url: contactProfile.profile_edit_url,
        }, 422);
      }
      if (
        action === "scan" &&
        cleanText(body?.participation_notice_version, 180) !==
          qrParticipationNoticeVersion()
      ) {
        return jsonResponse({
          ok: false,
          code: "participation_notice_required",
          error:
            "Read and accept the current QR Bingo participation notice before scanning.",
          participation_notice_version: qrParticipationNoticeVersion(),
        }, 428);
      }
      if (
        reviewFixture &&
        isReviewCouple &&
        isEmailTestFixture(reviewFixture) &&
        cleanText(user.email, 254).toLowerCase() !==
          isolatedEmailTestRecipient(reviewFixture)
      ) {
        return jsonResponse({
          ok: false,
          error:
            "The isolated email-test account no longer matches its allowlisted recipient.",
        }, 403);
      }
      const cookieJar = isIsolatedReviewVendorAction
        ? new Map<string, string>()
        : isVendorRaffleAction
        ? await loginWebsiteSession(nativeSession).catch(() =>
          new Map<string, string>()
        )
        : await loginWebsiteSession(nativeSession);
      const page = isIsolatedReviewVendorAction
        ? ({ vendors: [], scanned: [] } as QrPage)
        : isVendorRaffleAction
        ? cookieJar.size
          ? await getQrPage(cookieJar).catch(
            () => ({ vendors: [], scanned: [] } as QrPage),
          )
          : ({ vendors: [], scanned: [] } as QrPage)
        : await getQrPage(cookieJar);
      let scanned: string[];
      if (reviewFixture && isReviewCouple) {
        // The review account is a self-contained demonstration event. Never
        // expose the production roster/progress or allow its scan action to
        // reach the production website table.
        page.vendors = [isolatedFixtureVendor(reviewFixture)];
        page.scanned = [];
        scanned = [
          ...new Set(
            await isolatedFixtureScannedIds(
              reviewFixture,
              String(user.user_id),
            ),
          ),
        ];
      } else {
        // `get_scanned` is a couple-only website action. Vendor dashboards
        // authorize against the current BD member tag, never scan history.
        scanned = [
          ...new Set(
            isVendorRaffleAction ? [] : await getFreshScanned(cookieJar, page),
          ),
        ];
      }

      if (action === "scan") {
        const vendorId = String(body?.vendor_id || "").trim();
        const matchedVendor = page.vendors.find((vendor) =>
          vendor.id === vendorId
        );
        if (!matchedVendor) {
          return jsonResponse({ ok: false, error: "Vendor id required" }, 400);
        }

        const isReviewScan = Boolean(
          reviewFixture && isReviewCouple &&
            vendorId === reviewFixture.vendor_bingo_id,
        );
        if (isReviewScan && reviewFixture) {
          await saveIsolatedFixtureScan(reviewFixture, String(user.user_id));
          const freshScanned = [
            ...new Set([...scanned, reviewFixture.vendor_bingo_id]),
          ];
          const raffleOffer = await buildRaffleOffer(
            matchedVendor,
            user,
            reviewFixture.event_key,
            reviewFixture,
          );
          const completed = page.vendors.length > 0 &&
            freshScanned.length >= page.vendors.length;
          return jsonResponse({
            ok: true,
            app_review_fixture: !isEmailTestFixture(reviewFixture),
            email_test_fixture: isEmailTestFixture(reviewFixture),
            outbound_email_suppressed: !isEmailTestFixture(reviewFixture),
            vendors: page.vendors,
            scanned: freshScanned,
            scanned_count: freshScanned.length,
            total_count: page.vendors.length,
            matched_vendor: matchedVendor,
            raffle_offer: raffleOffer,
            completed,
          });
        }

        if (!productionShowScanWindowOpen()) {
          return jsonResponse({
            ok: false,
            code: "show_scan_window_closed",
            error:
              "QR Bingo booth scans are accepted only during the published wedding-show hours.",
          }, 403);
        }

        const scanResult = await postQrAction(
          cookieJar,
          new URLSearchParams({
            action: "scan_vendor",
            vendor_id: vendorId,
            participation_notice_version: qrParticipationNoticeVersion(),
          }),
        );
        if (scanResult.status !== "success") {
          const upstreamStatus = Number(scanResult.__http_status || 0);
          const safeStatus = [409, 422, 428].includes(upstreamStatus)
            ? upstreamStatus
            : 502;
          return jsonResponse({
            ok: false,
            code: cleanText(scanResult.code, 80) || "scan_failed",
            error: String(
              scanResult.message || scanResult.error ||
                "Vendor scan could not be saved.",
            ),
            detail: String(
              scanResult.message || scanResult.error ||
                "Unknown QR Bingo error",
            ),
          }, safeStatus);
        }

        const freshScanned = [
          ...new Set(await getFreshScanned(cookieJar, page)),
        ];
        const raffleOffer = await buildRaffleOffer(matchedVendor, user);
        const completed = page.vendors.length > 0 &&
          freshScanned.length >= page.vendors.length;
        return jsonResponse({
          ok: true,
          vendors: page.vendors,
          scanned: freshScanned,
          scanned_count: freshScanned.length,
          total_count: page.vendors.length,
          matched_vendor: matchedVendor,
          raffle_offer: raffleOffer,
          completed,
        });
      }

      if (action === "raffle_offer") {
        if (
          !(reviewFixture && isReviewCouple) && !productionShowScanWindowOpen()
        ) {
          return jsonResponse({
            ok: false,
            code: "show_entry_window_closed",
            error:
              "Vendor draw entry is available only during the published wedding-show hours.",
          }, 403);
        }
        const vendorId = String(body?.vendor_id || "").trim();
        const vendor = page.vendors.find((item) => item.id === vendorId);
        if (!vendor) {
          return jsonResponse(
            { ok: false, error: "Vendor draw not found." },
            404,
          );
        }
        if (!scanned.includes(vendor.id)) {
          return jsonResponse({
            ok: false,
            error: "Scan this vendor before reviewing its draw.",
          }, 403);
        }
        const raffleEventKey = reviewFixture && isReviewCouple &&
            vendor.id === reviewFixture.vendor_bingo_id
          ? reviewFixture.event_key
          : qrBingoConfig().event_key;
        const raffleOffer = await buildRaffleOffer(
          vendor,
          user,
          raffleEventKey,
          reviewFixture && isReviewCouple &&
            vendor.id === reviewFixture.vendor_bingo_id
            ? reviewFixture
            : null,
        );
        return jsonResponse({
          ok: true,
          raffle_offer: raffleOffer,
          message: raffleOffer
            ? "This vendor draw is available. Entry remains optional."
            : "You are already entered, or this vendor draw is not currently open.",
        });
      }

      if (action === "raffle_opt_in") {
        if (
          !(reviewFixture && isReviewCouple) && !productionShowScanWindowOpen()
        ) {
          return jsonResponse({
            ok: false,
            code: "show_entry_window_closed",
            error:
              "Vendor draw entry is available only during the published wedding-show hours.",
          }, 403);
        }
        const vendorId = String(body?.vendor_id || "").trim();
        const vendor = page.vendors.find((item) => item.id === vendorId);
        if (!vendor) {
          return jsonResponse(
            { ok: false, error: "Vendor draw not found." },
            404,
          );
        }
        if (!scanned.includes(vendor.id)) {
          return jsonResponse({
            ok: false,
            error: "Scan this vendor before entering the draw.",
          }, 403);
        }
        const raffleEventKey = reviewFixture && isReviewCouple &&
            vendor.id === reviewFixture.vendor_bingo_id
          ? reviewFixture.event_key
          : qrBingoConfig().event_key;
        const result = await optInToRaffle(
          vendor,
          user,
          body as Record<string, unknown>,
          raffleEventKey,
          reviewFixture && isReviewCouple &&
            vendor.id === reviewFixture.vendor_bingo_id
            ? reviewFixture
            : null,
        );
        const alreadyEntered = "already_entered" in result &&
          result.already_entered === true;
        const rulesRequired = "rules_required" in result &&
          result.rules_required === true;
        const eligibilityRequired = "eligibility_required" in result &&
          result.eligibility_required === true;
        const staleVendorOffer = "code" in result &&
          result.code === "stale_vendor_offer";
        const refreshedOffer = staleVendorOffer
          ? await buildRaffleOffer(
            vendor,
            user,
            raffleEventKey,
            reviewFixture && isReviewCouple &&
              vendor.id === reviewFixture.vendor_bingo_id
              ? reviewFixture
              : null,
          )
          : undefined;
        return jsonResponse(
          {
            ok: result.entered || alreadyEntered,
            ...result,
            ...(staleVendorOffer ? { raffle_offer: refreshedOffer } : {}),
          },
          staleVendorOffer
            ? 409
            : rulesRequired || eligibilityRequired
            ? 400
            : 200,
        );
      }

      if (action === "vendor_raffle_get") {
        const vendor = await resolveVendorForRaffleAction(
          page,
          user,
          reviewFixture,
          isReviewVendor,
        );
        if (!vendor) {
          return jsonResponse({
            ok: false,
            error: "This account is not on the QR Bingo vendor list.",
          }, 403);
        }
        const dashboard = await getVendorRaffleDashboard(
          vendor,
          user,
          reviewFixture && isReviewVendor
            ? reviewFixture.event_key
            : qrBingoConfig().event_key,
          Boolean(
            reviewFixture && isReviewVendor && reviewFixture.allow_early_draw,
          ),
          Boolean(
            reviewFixture && isReviewVendor &&
              isolatedFixtureSuppressesOutbound(reviewFixture),
          ),
          reviewFixture && isReviewVendor ? reviewFixture : null,
        );
        return jsonResponse({ ok: true, vendor, ...dashboard });
      }

      if (action === "vendor_raffle_export") {
        const vendor = await resolveVendorForRaffleAction(
          page,
          user,
          reviewFixture,
          isReviewVendor,
        );
        if (!vendor) {
          return jsonResponse({
            ok: false,
            error: "This account is not on the QR Bingo vendor list.",
          }, 403);
        }
        const eventKey = reviewFixture && isReviewVendor
          ? reviewFixture.event_key
          : qrBingoConfig().event_key;
        const result = await buildVendorParticipationReport(
          vendor,
          eventKey,
          String(user.user_id || nativeSession.user_id),
          cleanText(body?.client_platform, 20).toLowerCase(),
          reviewFixture && isReviewVendor ? reviewFixture : null,
        );
        if (result.rate_limited) {
          return jsonResponse({
            ok: false,
            error:
              "Too many participation reports were requested. Wait one minute and try again.",
            retry_after_seconds: result.retry_after_seconds,
          }, 429);
        }
        if ("too_large" in result && result.too_large) {
          return jsonResponse({
            ok: false,
            error:
              "This contact list exceeds the 5,000-row secure export limit. Contact Wedding Win for a complete administrative export; no partial file was created.",
            maximum_rows: result.maximum_rows,
          }, 413);
        }
        return jsonResponse({
          ok: true,
          vendor: { id: vendor.id, name: vendor.name },
          report: result.report,
        });
      }

      if (
        action === "vendor_raffle_entries_get" ||
        action === "vendor_raffle_entry_update"
      ) {
        const vendor = await resolveVendorForRaffleAction(
          page,
          user,
          reviewFixture,
          isReviewVendor,
        );
        if (!vendor) {
          return jsonResponse({
            ok: false,
            error: "This account is not on the QR Bingo vendor list.",
          }, 403);
        }
        const eventKey = reviewFixture && isReviewVendor
          ? reviewFixture.event_key
          : qrBingoConfig().event_key;
        if (action === "vendor_raffle_entry_update") {
          return updateVendorRaffleEntrySelection(
            vendor,
            user,
            body as Record<string, unknown>,
            eventKey,
            reviewFixture && isReviewVendor ? reviewFixture : null,
          );
        }
        return jsonResponse({
          ok: true,
          vendor: { id: vendor.id, name: vendor.name },
          ...await vendorRaffleEntriesResponse(
            vendor,
            eventKey,
            reviewFixture && isReviewVendor ? reviewFixture : null,
          ),
        });
      }

      if (action === "vendor_raffle_update") {
        const vendor = await resolveVendorForRaffleAction(
          page,
          user,
          reviewFixture,
          isReviewVendor,
        );
        if (!vendor) {
          return jsonResponse({
            ok: false,
            error: "This account is not on the QR Bingo vendor list.",
          }, 403);
        }
        const enabled = Boolean(body?.enabled);
        const legalTermsAccepted = Boolean(body?.legal_terms_accepted);
        const vendorResponsibilityAcknowledged =
          body?.vendor_responsibility_acknowledged === true;
        const responsibilityDisclosure = vendorResponsibilityDisclosure(
          vendor.name,
        );
        const echoedResponsibilityDisclosure =
          typeof body?.vendor_responsibility_disclosure === "string"
            ? body.vendor_responsibility_disclosure
            : "";
        const acceptanceSource = vendorAcceptanceSource(
          body?.client_platform,
        );
        const acceptingVendorUserId = String(
          user.user_id || nativeSession.user_id,
        );
        const rulesReviewed = reviewedCurrentRules(
          body as Record<string, unknown>,
        );
        const clientSettingsUpdatedAt = cleanText(
          body?.settings_updated_at,
          80,
        );
        const raffleEventKey = reviewFixture && isReviewVendor
          ? reviewFixture.event_key
          : qrBingoConfig().event_key;
        const allowEarlyDraw = Boolean(
          reviewFixture && isReviewVendor && reviewFixture.allow_early_draw,
        );
        const suppressOutboundEmail = Boolean(
          reviewFixture && isReviewVendor &&
            isolatedFixtureSuppressesOutbound(reviewFixture),
        );
        const currentSettings = await ensureSettings(vendor, raffleEventKey);
        if (
          !clientSettingsUpdatedAt ||
          !currentSettings.updated_at ||
          clientSettingsUpdatedAt !== currentSettings.updated_at
        ) {
          const dashboard = await getVendorRaffleDashboard(
            vendor,
            user,
            raffleEventKey,
            allowEarlyDraw,
            suppressOutboundEmail,
            reviewFixture,
          );
          return jsonResponse({
            ok: false,
            conflict: true,
            error:
              "Reload the current draw settings before saving. This prevents one device from overwriting another.",
            vendor,
            ...dashboard,
          }, 409);
        }
        if (
          vendorResponsibilityAcknowledged &&
          echoedResponsibilityDisclosure !== responsibilityDisclosure
        ) {
          const dashboard = await getVendorRaffleDashboard(
            vendor,
            user,
            raffleEventKey,
            allowEarlyDraw,
            suppressOutboundEmail,
            reviewFixture,
          );
          return jsonResponse({
            ok: false,
            conflict: true,
            code: "stale_vendor_responsibility_disclosure",
            error:
              "The vendor responsibility agreement changed. Reload and accept the exact current agreement before saving.",
            vendor,
            ...dashboard,
          }, 409);
        }
        if (
          vendorResponsibilityAcknowledged &&
          (!acceptanceSource || acceptingVendorUserId !== vendor.id)
        ) {
          return jsonResponse({
            ok: false,
            error:
              "A valid authenticated app or website acceptance source is required.",
          }, 400);
        }
        const prizeDescription = cleanText(body?.prize_description, 1000);
        const prizeTitle = cleanText(body?.prize_title, 180) ||
          cleanText(prizeDescription.split(/\r?\n/)[0], 180);
        const prizeApproxValueCad = positiveCadValue(
          body?.prize_approx_value_cad,
        );
        const requestedMaxWinners = body?.max_winners === undefined
          ? raffleMaxWinners(currentSettings.max_winners)
          : Number(body.max_winners);
        if (
          !Number.isInteger(requestedMaxWinners) ||
          requestedMaxWinners < 1 || requestedMaxWinners > MAX_RAFFLE_WINNERS
        ) {
          return jsonResponse({
            ok: false,
            error: "Choose from one through three winners before entries open.",
          }, 400);
        }
        if (
          body?.exclude_previous_winners !== undefined &&
          typeof body.exclude_previous_winners !== "boolean"
        ) {
          return jsonResponse({
            ok: false,
            error:
              "Choose whether previous winners in this vendor promotion are excluded.",
          }, 400);
        }
        const excludePreviousWinners =
          body?.exclude_previous_winners === undefined
            ? currentSettings.exclude_previous_winners !== false
            : body.exclude_previous_winners;
        const entryClosesAt = isReviewVendor
          ? String(
            currentSettings.entry_closes_at || qrBingoConfig().entry_closes_at,
          )
          : qrBingoConfig().entry_closes_at;
        const drawAt = isReviewVendor
          ? String(currentSettings.draw_at || qrBingoConfig().draw_at)
          : qrBingoConfig().draw_at;
        const drawOpensAt = isReviewVendor
          ? String(
            currentSettings.draw_opens_at || qrBingoConfig().draw_opens_at,
          )
          : qrBingoConfig().draw_opens_at;
        const eligibilityRegion = isReviewVendor
          ? String(
            currentSettings.eligibility_region ||
              qrBingoConfig().eligibility_region,
          )
          : qrBingoConfig().eligibility_region;
        const oddsBasis = isReviewVendor
          ? String(currentSettings.odds_basis || ODDS_BASIS)
          : ODDS_BASIS;
        const alternateFreeEntryUrl = isReviewVendor
          ? String(currentSettings.alternate_free_entry_url || "")
          : qrBingoConfig().alternate_free_entry_url;
        if (
          enabled &&
          (!legalTermsAccepted || !vendorResponsibilityAcknowledged ||
            !rulesReviewed || !prizeTitle || !prizeDescription ||
            !prizeApproxValueCad)
        ) {
          return jsonResponse({
            ok: false,
            error:
              "Add prize details and its approximate retail value in CAD, view the current official rules, and explicitly accept the vendor responsibilities before turning this on.",
          }, 400);
        }
        const acceptedAt = legalTermsAccepted && rulesReviewed
          ? currentSettings.legal_terms_version ===
                qrBingoConfig().rules_version && currentSettings.rules_viewed_at
            ? currentSettings.rules_viewed_at
            : new Date().toISOString()
          : null;
        const responsibilityAcceptedAt = legalTermsAccepted && rulesReviewed &&
            vendorResponsibilityAcknowledged
          ? currentSettings.vendor_responsibility_acknowledged === true &&
              currentSettings.vendor_responsibility_version ===
                qrBingoConfig().rules_version &&
              currentSettings.vendor_responsibility_acknowledged_at &&
              cleanText(
                  currentSettings.vendor_responsibility_disclosure_text,
                  2000,
                ) === responsibilityDisclosure
            ? currentSettings.vendor_responsibility_acknowledged_at
            : new Date().toISOString()
          : null;
        const nextMaterialSettings: Partial<RaffleSettings> = {
          ...currentSettings,
          prize_title: prizeTitle,
          prize_description: prizeDescription,
          prize_approx_value_cad: prizeApproxValueCad || null,
          legal_terms_version: qrBingoConfig().rules_version,
          official_rules_url: qrBingoConfig().official_rules_url,
          eligibility_region: eligibilityRegion,
          entry_closes_at: entryClosesAt,
          draw_at: drawAt,
          draw_opens_at: drawOpensAt,
          odds_basis: oddsBasis,
          no_purchase_required: true,
          skill_testing_question_required: true,
          prize_provider_name: vendor.name,
          alternate_free_entry_url: alternateFreeEntryUrl,
          participant_responsibility_disclosure_text:
            participantResponsibilityDisclosure(vendor.name),
          vendor_responsibility_acknowledged: vendorResponsibilityAcknowledged,
          vendor_responsibility_disclosure_text:
            vendorResponsibilityAcknowledged ? responsibilityDisclosure : "",
          vendor_responsibility_acknowledged_at:
            vendorResponsibilityAcknowledged ? responsibilityAcceptedAt : null,
          vendor_responsibility_version: vendorResponsibilityAcknowledged
            ? qrBingoConfig().rules_version
            : "",
          max_winners: requestedMaxWinners,
          exclude_previous_winners: excludePreviousWinners,
        };
        const { data: existingEntryRows, error: entryCountError } =
          await requireAdmin()
            .from("qr_bingo_raffle_entries")
            .select("id")
            .eq("event_key", raffleEventKey)
            .eq("vendor_bingo_id", vendor.id);
        if (entryCountError) throw entryCountError;
        const archivedIds = await archivedLegacyEntryIds(
          raffleEventKey,
          vendor.id,
        );
        const entryCount = (existingEntryRows || []).filter((entry) =>
          !archivedIds.has(String(entry.id || ""))
        ).length;
        const materialTermsLocked = entryCount > 0 ||
          await activatedVendorOfferExists(raffleEventKey, vendor.id);
        const materialTermsChanged =
          materialSettingsFingerprint(currentSettings) !==
            materialSettingsFingerprint(nextMaterialSettings) &&
          !isPermittedInPersonEntryRulesTransition(
            currentSettings,
            nextMaterialSettings,
          );
        if (materialTermsLocked && materialTermsChanged && !enabled) {
          try {
            await compareAndUpdateSettings(
              vendor,
              clientSettingsUpdatedAt,
              {
                enabled: false,
              },
              raffleEventKey,
              {
                actorUserId: acceptingVendorUserId,
                source: acceptanceSource,
                authorityToBind: vendorResponsibilityAcknowledged,
              },
            );
          } catch (error) {
            if (
              error && typeof error === "object" && "code" in error &&
              String(error.code) === "40001"
            ) {
              const dashboard = await getVendorRaffleDashboard(
                vendor,
                user,
                raffleEventKey,
                allowEarlyDraw,
                suppressOutboundEmail,
                reviewFixture,
              );
              return jsonResponse({
                ok: false,
                conflict: true,
                error:
                  "This draw was updated in another tab or browser. Review the latest settings before saving again.",
                vendor,
                ...dashboard,
              }, 409);
            }
            throw error;
          }
          const dashboard = await getVendorRaffleDashboard(
            vendor,
            user,
            raffleEventKey,
            allowEarlyDraw,
            suppressOutboundEmail,
            reviewFixture,
          );
          return jsonResponse({
            ok: true,
            vendor,
            ...dashboard,
            material_terms_locked: true,
          });
        }
        if (materialTermsLocked && materialTermsChanged) {
          return jsonResponse({
            ok: false,
            material_terms_locked: true,
            error:
              "Prize and draw terms cannot change after the first entry. Close this draw and create a separately versioned promotion instead.",
          }, 409);
        }
        try {
          await compareAndUpdateSettings(
            vendor,
            clientSettingsUpdatedAt,
            {
              enabled,
              prize_title: prizeTitle,
              prize_description: prizeDescription,
              prize_approx_value_cad: prizeApproxValueCad || null,
              eligibility_region: eligibilityRegion,
              entry_closes_at: entryClosesAt,
              draw_at: drawAt,
              draw_opens_at: drawOpensAt,
              odds_basis: oddsBasis,
              no_purchase_required: true,
              skill_testing_question_required: true,
              alternate_free_entry_url: alternateFreeEntryUrl,
              max_winners: requestedMaxWinners,
              exclude_previous_winners: excludePreviousWinners,
              legal_terms_accepted: legalTermsAccepted,
              legal_terms_version: qrBingoConfig().rules_version,
              legal_terms_accepted_at: acceptedAt,
              official_rules_url: qrBingoConfig().official_rules_url,
              rules_viewed_at: acceptedAt,
              administrator_name: RAFFLE_ADMINISTRATOR,
              co_sponsor_name: "",
              prize_provider_name: vendor.name,
              apple_non_sponsor_acknowledged: legalTermsAccepted &&
                rulesReviewed,
              vendor_responsibility_acknowledged: legalTermsAccepted &&
                rulesReviewed && vendorResponsibilityAcknowledged,
              vendor_responsibility_disclosure_text:
                legalTermsAccepted && rulesReviewed &&
                  vendorResponsibilityAcknowledged
                  ? responsibilityDisclosure
                  : "",
              vendor_responsibility_acknowledged_at:
                legalTermsAccepted && rulesReviewed &&
                  vendorResponsibilityAcknowledged
                  ? responsibilityAcceptedAt
                  : null,
              vendor_responsibility_version:
                legalTermsAccepted && rulesReviewed &&
                  vendorResponsibilityAcknowledged
                  ? qrBingoConfig().rules_version
                  : "",
            },
            raffleEventKey,
            {
              actorUserId: acceptingVendorUserId,
              source: acceptanceSource,
              authorityToBind: vendorResponsibilityAcknowledged,
            },
          );
        } catch (error) {
          if (
            error && typeof error === "object" && "code" in error &&
            String(error.code) === "40001"
          ) {
            const dashboard = await getVendorRaffleDashboard(
              vendor,
              user,
              raffleEventKey,
              allowEarlyDraw,
              suppressOutboundEmail,
              reviewFixture,
            );
            return jsonResponse({
              ok: false,
              conflict: true,
              error:
                "This draw was updated in another tab or browser. Review the latest settings before saving again.",
              vendor,
              ...dashboard,
            }, 409);
          }
          throw error;
        }
        const dashboard = await getVendorRaffleDashboard(
          vendor,
          user,
          raffleEventKey,
          allowEarlyDraw,
          suppressOutboundEmail,
          reviewFixture,
        );
        return jsonResponse({ ok: true, vendor, ...dashboard });
      }

      if (action === "vendor_raffle_draw") {
        const vendor = await resolveVendorForRaffleAction(
          page,
          user,
          reviewFixture,
          isReviewVendor,
        );
        if (!vendor) {
          return jsonResponse({
            ok: false,
            error: "This account is not on the QR Bingo vendor list.",
          }, 403);
        }
        return drawWinner(
          vendor,
          user,
          String(body?.draw_reason || "initial"),
          reviewFixture && isReviewVendor
            ? reviewFixture.event_key
            : qrBingoConfig().event_key,
          Boolean(
            reviewFixture && isReviewVendor && reviewFixture.allow_early_draw,
          ),
          Boolean(
            reviewFixture && isReviewVendor &&
              isolatedFixtureSuppressesOutbound(reviewFixture),
          ),
          reviewFixture && isReviewVendor ? reviewFixture : null,
        );
      }

      if (action === "vendor_raffle_review") {
        const vendor = await resolveVendorForRaffleAction(
          page,
          user,
          reviewFixture,
          isReviewVendor,
        );
        if (!vendor) {
          return jsonResponse({
            ok: false,
            error: "This account is not on the QR Bingo vendor list.",
          }, 403);
        }
        const eventKey = reviewFixture && isReviewVendor
          ? reviewFixture.event_key
          : qrBingoConfig().event_key;
        return reviewPotentialWinner(
          vendor,
          user,
          body as Record<string, unknown>,
          eventKey,
          Boolean(
            reviewFixture && isReviewVendor && reviewFixture.allow_early_draw,
          ),
          Boolean(
            reviewFixture && isReviewVendor &&
              isolatedFixtureSuppressesOutbound(reviewFixture),
          ),
          reviewFixture && isReviewVendor ? reviewFixture : null,
        );
      }

      if (action === "vendor_raffle_send_notice") {
        const vendor = await resolveVendorForRaffleAction(
          page,
          user,
          reviewFixture,
          isReviewVendor,
        );
        if (!vendor) {
          return jsonResponse({
            ok: false,
            error: "This account is not on the QR Bingo vendor list.",
          }, 403);
        }
        return sendVerifiedWinnerNotice(
          vendor,
          user,
          body as Record<string, unknown>,
          reviewFixture && isReviewVendor
            ? reviewFixture.event_key
            : qrBingoConfig().event_key,
          Boolean(
            reviewFixture && isReviewVendor && reviewFixture.allow_early_draw,
          ),
          Boolean(
            reviewFixture && isReviewVendor &&
              isolatedFixtureSuppressesOutbound(reviewFixture),
          ),
          reviewFixture && isReviewVendor ? reviewFixture : null,
        );
      }

      if (action === "list") {
        const completed = page.vendors.length > 0 &&
          scanned.length >= page.vendors.length;
        return jsonResponse({
          ok: true,
          app_review_fixture: Boolean(
            reviewFixture && !isEmailTestFixture(reviewFixture),
          ),
          email_test_fixture: Boolean(
            reviewFixture && isEmailTestFixture(reviewFixture),
          ),
          vendors: page.vendors,
          scanned,
          scanned_count: scanned.length,
          total_count: page.vendors.length,
          completed,
          profile_complete: contactProfile.complete,
          missing_profile_fields: contactProfile.missing_fields,
          profile_edit_url: contactProfile.profile_edit_url,
          participation_notice_version: qrParticipationNoticeVersion(),
        });
      }

      return jsonResponse(
        { ok: false, error: "Unsupported QR Bingo action" },
        400,
      );
    });
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
    console.error("bd-qr-bingo-vendor-sync request failed", failure);
    return jsonResponse({
      ok: false,
      error: "QR Bingo vendor sync unavailable",
    }, 500);
  }
});
