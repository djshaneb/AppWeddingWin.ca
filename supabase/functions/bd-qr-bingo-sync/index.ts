import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EVENT_KEY = Deno.env.get("QR_BINGO_EVENT_KEY") || "niagara-wedding-show-2026";
const DRAW_OPENS_AT = Deno.env.get("QR_BINGO_DRAW_OPENS_AT") || "2026-10-18T19:00:00.000Z";
const TERMS_URL =
  Deno.env.get("QR_BINGO_RAFFLE_TERMS_URL") ||
  "https://www.weddingwin.ca/qr-bingo-vendor-draw-rules";
const TERMS_VERSION = "2026-05-18";
const BD_EMAIL_FROM = Deno.env.get("BD_EMAIL_FROM") || "hello@weddingwin.ca";
const BD_EMAIL_FROM_NAME = Deno.env.get("BD_EMAIL_FROM_NAME") || "WeddingWin Inc";
const BD_API_KEY_ID = Deno.env.get("BD_API_KEY_ID") || "10";

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
type RaffleSettings = {
  id?: string;
  event_key: string;
  vendor_bingo_id: string;
  vendor_bd_user_id: string;
  vendor_name: string;
  enabled: boolean;
  prize_title: string;
  prize_description: string;
  claim_instructions: string;
  legal_terms_accepted: boolean;
  legal_terms_version: string;
  legal_terms_accepted_at?: string | null;
  draw_opens_at: string;
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
  claim_instructions: string;
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
  const fullUser = await callBd(`/api/v2/user/get/${encodeURIComponent(String(userId))}`);
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return unwrapBdUser(fullUser.body.message);
  }

  return undefined;
}

function nativeSessionMatchesBdUser(session: NativeSession, user: BdRow | undefined) {
  if (!user?.user_id || String(user.user_id) !== String(session.user_id || "")) return false;

  const sessionToken = String(session.token || "").trim();
  const userToken = String(user.token || "").trim();
  if (!sessionToken || !userToken || sessionToken !== userToken) return false;

  const sessionCookie = String(session.cookie || "").trim();
  const userCookie = String(user.cookie || "").trim();
  return !(sessionCookie && userCookie && sessionCookie !== userCookie);
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
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    cover_photo: String(row.cover_photo || "").trim() || undefined,
    full_filename: String(row.full_filename || "").trim() || undefined,
    user_id: String(row.user_id || "").trim() || undefined,
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

function escapeHtml(value: unknown, max = 1200) {
  return cleanText(value, max)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  return page.vendors.find((vendor) => String(vendor.user_id || "") === userId) || null;
}

async function getFreshScanned(cookieJar: Map<string, string>, page: QrPage) {
  const serverScanned = await postQrAction(cookieJar, new URLSearchParams({ action: "get_scanned" }))
    .catch(() => undefined);
  return Array.isArray(serverScanned?.scanned)
    ? serverScanned.scanned.map((value) => String(value || "").trim()).filter(Boolean)
    : page.scanned;
}

async function getSettings(vendor: QrVendor) {
  const db = requireAdmin();
  const { data, error } = await db
    .from("qr_bingo_raffle_settings")
    .select("*")
    .eq("event_key", EVENT_KEY)
    .eq("vendor_bingo_id", vendor.id)
    .maybeSingle();

  if (error) throw error;
  return data as RaffleSettings | null;
}

async function upsertSettings(vendor: QrVendor, fields: Partial<RaffleSettings>) {
  const db = requireAdmin();
  const payload = {
    event_key: EVENT_KEY,
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

async function ensureSettings(vendor: QrVendor) {
  const existing = await getSettings(vendor);
  if (existing) return existing;
  return upsertSettings(vendor, {
    enabled: false,
    prize_title: "",
    prize_description: "",
    claim_instructions: "",
    legal_terms_accepted: false,
    legal_terms_version: TERMS_VERSION,
  });
}

function isSettingsEnterable(settings: RaffleSettings | null) {
  return Boolean(
    settings?.enabled &&
      settings.legal_terms_accepted &&
      cleanText(settings.prize_title, 160)
  );
}

async function buildRaffleOffer(vendor: QrVendor, user: BdRow | undefined) {
  const settings = await getSettings(vendor).catch(() => null);
  if (!isSettingsEnterable(settings)) return null;

  const db = requireAdmin();
  const { data: existing, error } = await db
    .from("qr_bingo_raffle_entries")
    .select("id")
    .eq("event_key", EVENT_KEY)
    .eq("vendor_bingo_id", vendor.id)
    .eq("couple_bd_user_id", String(user?.user_id || ""))
    .maybeSingle();
  if (error) throw error;
  if (existing?.id) return null;

  return {
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    prize_title: settings?.prize_title || "",
    prize_description: settings?.prize_description || "",
    terms_url: TERMS_URL,
    consent_version: TERMS_VERSION,
    share_fields: ["name", "email", "phone", "wedding date"],
  };
}

function consentText(vendorName: string) {
  return `I authorize Wedding Win Inc. to share my name, email, phone number, and wedding date with ${vendorName} for this vendor draw. I understand this opt-in is final.`;
}

async function optInToRaffle(vendor: QrVendor, user: BdRow | undefined) {
  const settings = await getSettings(vendor);
  if (!isSettingsEnterable(settings)) {
    return { entered: false, message: "This vendor draw is not open yet." };
  }

  const db = requireAdmin();
  const entryPayload = {
    event_key: EVENT_KEY,
    vendor_bingo_id: vendor.id,
    vendor_bd_user_id: String(vendor.user_id || ""),
    vendor_name: vendor.name,
    couple_bd_user_id: String(user?.user_id || ""),
    couple_name: displayName(user),
    couple_email: cleanText(user?.email, 160),
    couple_phone: phoneForUser(user),
    couple_wedding_date: weddingDateForUser(user),
    consent_share_contact: true,
    consent_text: consentText(vendor.name),
    consent_version: TERMS_VERSION,
  };

  const { data, error } = await db
    .from("qr_bingo_raffle_entries")
    .insert(entryPayload)
    .select("*")
    .single();

  if (error && error.code === "23505") {
    return { entered: false, already_entered: true, message: "You are already entered for this vendor draw." };
  }
  if (error) throw error;
  return { entered: true, entry: data as RaffleEntry };
}

async function getVendorRaffleDashboard(vendor: QrVendor) {
  const db = requireAdmin();
  const settings = await ensureSettings(vendor);
  const { data: entries, error: entriesError } = await db
    .from("qr_bingo_raffle_entries")
    .select("*")
    .eq("event_key", EVENT_KEY)
    .eq("vendor_bingo_id", vendor.id)
    .order("created_at", { ascending: false });
  if (entriesError) throw entriesError;

  const { data: draws, error: drawsError } = await db
    .from("qr_bingo_raffle_draws")
    .select("*")
    .eq("event_key", EVENT_KEY)
    .eq("vendor_bingo_id", vendor.id)
    .order("draw_number", { ascending: false });
  if (drawsError) throw drawsError;

  return {
    settings,
    entries: (entries || []) as RaffleEntry[],
    draws: (draws || []) as RaffleDraw[],
    draw_opens_at: settings.draw_opens_at,
    can_draw: Date.now() >= new Date(settings.draw_opens_at).getTime(),
    terms_url: TERMS_URL,
  };
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildExports(entries: RaffleEntry[]) {
  const header = ["Name", "Email", "Phone", "Wedding Date", "Opted In At"];
  const rows = entries.map((entry) => [
    entry.couple_name,
    entry.couple_email,
    entry.couple_phone,
    entry.couple_wedding_date,
    entry.consented_at || entry.created_at,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const txt = rows
    .map((row) => [
      `Name: ${row[0]}`,
      `Email: ${row[1]}`,
      `Phone: ${row[2]}`,
      `Wedding Date: ${row[3]}`,
      `Opted In: ${row[4]}`,
    ].join("\n"))
    .join("\n\n");
  return { csv, txt };
}

async function queueBdOutboxEmail(to: string, subject: string, html: string, text: string) {
  if (!to) return { sent: false, error: "Recipient email is missing" };

  const params = new URLSearchParams({
    to_email: to,
    from_email: BD_EMAIL_FROM,
    from_name: BD_EMAIL_FROM_NAME,
    subject,
    html,
    text,
    api_key_id: BD_API_KEY_ID,
    status: "pending",
    digest: "{}",
    params: "{}",
    send_date: new Date().toISOString().replace("T", " ").slice(0, 19),
  });

  const { response, body } = await callBd("/api/v2/email_outbox/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok || body.status !== "success") {
    return { sent: false, error: cleanText(body.message || `BD outbox HTTP ${response.status}`, 1000) };
  }

  const outboxId = body.message && typeof body.message === "object"
    ? cleanText((body.message as BdRow).outbox_id, 80)
    : "";
  return { sent: true, error: "", outbox_id: outboxId };
}

async function sendDrawEmails(vendorUser: BdRow | undefined, draw: RaffleDraw) {
  const vendorEmail = cleanText(vendorUser?.email, 160);
  const safePrize = cleanText(draw.prize_title, 200);
  const safeVendorName = cleanText(draw.vendor_name, 160);
  const vendorText = [
    "Your WeddingWin QR Bingo vendor draw winner has been selected.",
    "",
    `Prize: ${safePrize}`,
    `Winner: ${cleanText(draw.winner_name, 160)}`,
    `Email: ${cleanText(draw.winner_email, 160)}`,
    `Phone: ${cleanText(draw.winner_phone, 120)}`,
    `Wedding date: ${cleanText(draw.winner_wedding_date, 120)}`,
    "",
    "Wedding Win Inc. has also queued the couple's winner notification through Brilliant Directories.",
  ].join("\n");
  const coupleText = [
    `Congratulations! You were selected as the winner for ${safeVendorName}'s WeddingWin QR Bingo draw.`,
    "",
    `Prize: ${safePrize}`,
    cleanText(draw.prize_description, 1000),
    "",
    "How to claim:",
    cleanText(draw.claim_instructions, 1000),
  ].join("\n");
  const vendorHtml = `
    <table width="100%" style="width:100%;">
      <tr><td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#2b2b2b;">
        <p>Your WeddingWin QR Bingo vendor draw winner has been selected.</p>
        <p><strong>Prize:</strong> ${escapeHtml(draw.prize_title, 200)}</p>
        <p><strong>Winner:</strong> ${escapeHtml(draw.winner_name, 160)}<br>
        <strong>Email:</strong> ${escapeHtml(draw.winner_email, 160)}<br>
        <strong>Phone:</strong> ${escapeHtml(draw.winner_phone, 120)}<br>
        <strong>Wedding date:</strong> ${escapeHtml(draw.winner_wedding_date, 120)}</p>
        <p>Wedding Win Inc. has also queued the couple's winner notification through Brilliant Directories.</p>
      </td></tr>
    </table>
  `;
  const coupleHtml = `
    <table width="100%" style="width:100%;">
      <tr><td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#2b2b2b;">
        <p>Congratulations! You were selected as the winner for ${escapeHtml(draw.vendor_name, 160)}'s WeddingWin QR Bingo draw.</p>
        <p><strong>Prize:</strong> ${escapeHtml(draw.prize_title, 200)}</p>
        <p>${escapeHtml(draw.prize_description, 1000)}</p>
        <p><strong>How to claim:</strong><br>${escapeHtml(draw.claim_instructions, 1000)}</p>
      </td></tr>
    </table>
  `;

  const [vendorResult, coupleResult] = await Promise.all([
    queueBdOutboxEmail(vendorEmail, `WeddingWin draw winner: ${safePrize}`, vendorHtml, vendorText),
    queueBdOutboxEmail(draw.winner_email, `You won: ${safePrize}`, coupleHtml, coupleText),
  ]);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  const errors: string[] = [];
  if (vendorResult.sent) updates.vendor_email_sent_at = now;
  else errors.push(`vendor email: ${vendorResult.error}`);
  if (coupleResult.sent) updates.couple_email_sent_at = now;
  else errors.push(`couple email: ${coupleResult.error}`);
  updates.email_error = errors.join(" | ");

  const db = requireAdmin();
  await db.from("qr_bingo_raffle_draws").update(updates).eq("id", draw.id);
  return { vendor: vendorResult, couple: coupleResult, error: updates.email_error };
}

async function drawWinner(vendor: QrVendor, user: BdRow | undefined, reason: string) {
  const db = requireAdmin();
  const settings = await ensureSettings(vendor);
  if (!isSettingsEnterable(settings)) {
    return jsonResponse({ ok: false, error: "Turn on the draw, add the prize, and accept the rules first." }, 400);
  }
  if (Date.now() < new Date(settings.draw_opens_at).getTime()) {
    return jsonResponse({
      ok: false,
      error: "Draw is not open yet.",
      draw_opens_at: settings.draw_opens_at,
    }, 403);
  }

  const { data: entries, error: entriesError } = await db
    .from("qr_bingo_raffle_entries")
    .select("*")
    .eq("event_key", EVENT_KEY)
    .eq("vendor_bingo_id", vendor.id)
    .order("created_at", { ascending: true });
  if (entriesError) throw entriesError;
  if (!entries?.length) return jsonResponse({ ok: false, error: "No couples have opted into this vendor draw yet." }, 400);

  const { data: draws, error: drawsError } = await db
    .from("qr_bingo_raffle_draws")
    .select("*")
    .eq("event_key", EVENT_KEY)
    .eq("vendor_bingo_id", vendor.id)
    .order("draw_number", { ascending: false });
  if (drawsError) throw drawsError;

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
      event_key: EVENT_KEY,
      vendor_bingo_id: vendor.id,
      vendor_bd_user_id: String(vendor.user_id || ""),
      vendor_name: vendor.name,
      entry_id: winner.id,
      couple_bd_user_id: winner.couple_bd_user_id,
      winner_name: winner.couple_name,
      winner_email: winner.couple_email,
      winner_phone: winner.couple_phone,
      winner_wedding_date: winner.couple_wedding_date,
      prize_title: settings.prize_title,
      prize_description: settings.prize_description,
      claim_instructions: settings.claim_instructions,
      draw_number: nextDrawNumber,
      draw_reason: cleanText(reason, 120) || "initial",
      drawn_by_bd_user_id: String(user?.user_id || ""),
    })
    .select("*")
    .single();
  if (drawError) throw drawError;

  const email_result = await sendDrawEmails(user, draw as RaffleDraw);
  const dashboard = await getVendorRaffleDashboard(vendor);
  return jsonResponse({ ok: true, draw, email_result, ...dashboard });
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

    const user = await fetchFullBdUserById(nativeSession.user_id);
    if (!nativeSessionMatchesBdUser(nativeSession, user)) {
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }

    const cookieJar = await loginWebsiteSession(nativeSession);
    const page = await getQrPage(cookieJar);
    const scanned = await getFreshScanned(cookieJar, page);

    if (action === "scan") {
      const vendorId = String(body?.vendor_id || "").trim();
      const matchedVendor = page.vendors.find((vendor) => vendor.id === vendorId);
      if (!matchedVendor) return jsonResponse({ ok: false, error: "Vendor id required" }, 400);

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

      const freshScanned = await getFreshScanned(cookieJar, page);
      const raffleOffer = await buildRaffleOffer(matchedVendor, user);
      return jsonResponse({
        ok: true,
        vendors: page.vendors,
        scanned: freshScanned,
        scanned_count: freshScanned.length,
        total_count: page.vendors.length,
        matched_vendor: matchedVendor,
        raffle_offer: raffleOffer,
        completed: page.vendors.length > 0 && freshScanned.length >= page.vendors.length,
      });
    }

    if (action === "raffle_opt_in") {
      const vendorId = String(body?.vendor_id || "").trim();
      const vendor = page.vendors.find((item) => item.id === vendorId);
      if (!vendor) return jsonResponse({ ok: false, error: "Vendor draw not found." }, 404);
      if (!scanned.includes(vendor.id)) {
        return jsonResponse({ ok: false, error: "Scan this vendor before entering the draw." }, 403);
      }
      const result = await optInToRaffle(vendor, user);
      return jsonResponse({ ok: true, ...result });
    }

    if (action === "vendor_raffle_get") {
      const vendor = vendorForCurrentUser(page, user);
      if (!vendor) {
        return jsonResponse({ ok: false, error: "This account is not on the QR Bingo vendor list." }, 403);
      }
      const dashboard = await getVendorRaffleDashboard(vendor);
      return jsonResponse({ ok: true, vendor, ...dashboard, exports: buildExports(dashboard.entries) });
    }

    if (action === "vendor_raffle_update") {
      const vendor = vendorForCurrentUser(page, user);
      if (!vendor) {
        return jsonResponse({ ok: false, error: "This account is not on the QR Bingo vendor list." }, 403);
      }
      const enabled = Boolean(body?.enabled);
      const legalTermsAccepted = Boolean(body?.legal_terms_accepted);
      const prizeTitle = cleanText(body?.prize_title, 180);
      if (enabled && (!legalTermsAccepted || !prizeTitle)) {
        return jsonResponse({
          ok: false,
          error: "Add a prize and accept the vendor draw rules before turning this on.",
        }, 400);
      }
      const settings = await upsertSettings(vendor, {
        enabled,
        prize_title: prizeTitle,
        prize_description: cleanText(body?.prize_description, 1000),
        claim_instructions: cleanText(body?.claim_instructions, 1000),
        legal_terms_accepted: legalTermsAccepted,
        legal_terms_version: TERMS_VERSION,
        legal_terms_accepted_at: legalTermsAccepted ? new Date().toISOString() : null,
      });
      const dashboard = await getVendorRaffleDashboard(vendor);
      return jsonResponse({ ok: true, vendor, settings, ...dashboard, exports: buildExports(dashboard.entries) });
    }

    if (action === "vendor_raffle_draw") {
      const vendor = vendorForCurrentUser(page, user);
      if (!vendor) {
        return jsonResponse({ ok: false, error: "This account is not on the QR Bingo vendor list." }, 403);
      }
      return drawWinner(vendor, user, String(body?.draw_reason || "initial"));
    }

    if (action === "list") {
      return jsonResponse({
        ok: true,
        vendors: page.vendors,
        scanned,
        scanned_count: scanned.length,
        total_count: page.vendors.length,
        completed: page.vendors.length > 0 && scanned.length >= page.vendors.length,
      });
    }

    return jsonResponse({ ok: false, error: "Unsupported QR Bingo action" }, 400);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "QR Bingo sync unavailable",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
