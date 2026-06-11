import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BD_SITE_TIME_ZONE = Deno.env.get("BD_SITE_TIME_ZONE") || "America/Toronto";
const MAX_IMAGE_DATA_URI_LENGTH = 2_500_000;
const CHAT_PERMISSION_ENDPOINTS = [
  "/api/v2/chat_message_threads/get",
  "/api/v2/chat_message_threads/create",
  "/api/v2/chat_message_threads/update",
  "/api/v2/chat_message_items/get",
  "/api/v2/chat_message_items/create",
  "/api/v2/chat_message_items/update",
];
const CHAT_REPORTED_NOTICE = "Chat Reported: This conversation will remain closed while it's being reviewed.";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type BdEnvelope = { status?: string; message?: unknown; total?: string | number };
type BdRow = Record<string, unknown>;
type NativeSession = { email?: string; user_id?: string | number; token?: string; cookie?: string };
type AppNativeThread = {
  thread_token: string;
  member_a_bd_user_id: string;
  member_b_bd_user_id: string;
  vendor_bd_user_id?: string | null;
  profile_path?: string | null;
  request_uri?: string | null;
  bd_thread_token?: string | null;
  bd_thread_id?: string | null;
  created_at: string;
  updated_at: string;
};
type AppNativeMessage = {
  id: string;
  thread_token: string;
  sender_bd_user_id: string;
  message_content: string;
  image_urls?: unknown;
  read_at?: string | null;
  created_at: string;
};
type AppChatThreadReport = {
  thread_token: string;
  app_thread_token?: string | null;
  bd_thread_token?: string | null;
  status?: string | null;
  notice?: string | null;
  reported_at?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function rows(message: unknown): BdRow[] {
  return Array.isArray(message)
    ? message.filter((row): row is BdRow => row !== null && typeof row === "object")
    : [];
}

function firstRow(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? first as BdRow : undefined;
  }
  return message && typeof message === "object" ? message as BdRow : undefined;
}

function formBody(values: Record<string, string | number>) {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => body.set(key, String(value)));
  return body;
}

async function callBd(path: string, init: RequestInit = {}) {
  if (!BD_API_KEY) throw new Error("BD_API_KEY is not configured");
  const response = await fetch(`${BD_API_BASE_URL}${path}`, {
    ...init,
    headers: { "X-Api-Key": BD_API_KEY, ...(init.headers || {}) },
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

function listPath(model: string, params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => search.set(key, String(value)));
  return `/api/v2/${model}/get?${search.toString()}`;
}

function permissionError(path: string, message: unknown) {
  const reason = typeof message === "string" ? message : "API key permission denied";
  return `${reason}. Enable ${path.split("?")[0]} in BD Admin > Developer Hub > API key permissions.`;
}

function shortError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

function normalizeProfilePath(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, BD_API_BASE_URL);
    const siteHost = new URL(BD_API_BASE_URL).hostname.replace(/^www\./i, "").toLowerCase();
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== siteHost) return "";
    const parts = decodeURIComponent(parsed.pathname || "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (parts.length < 2 || parts[parts.length - 1] !== "connect") return "";
    parts.pop();
    return parts.join("/");
  } catch {
    return "";
  }
}

async function fetchUserById(userId: string | number) {
  const result = await callBd(`/api/v2/user/get/${encodeURIComponent(String(userId))}`);
  return result.response.ok && result.body.status === "success" ? firstRow(result.body.message) : undefined;
}

async function fetchUserByProfilePath(profilePath: string) {
  const clean = profilePath.replace(/^\/+|\/+$/g, "");
  for (const filename of [clean, `/${clean}`]) {
    const result = await callBd(listPath("user", {
      limit: 1,
      property: "filename",
      property_value: filename,
      property_operator: "eq",
    }));
    if (result.response.ok && result.body.status === "success") {
      const user = rows(result.body.message)[0];
      if (user?.user_id) return user;
    }
  }
  return undefined;
}

async function findUserByToken(token: string) {
  if (!token) return undefined;
  if (/^\d+$/.test(token)) return fetchUserById(token);
  const result = await callBd(listPath("user", {
    limit: 1,
    property: "token",
    property_value: token,
    property_operator: "eq",
  }));
  return result.response.ok && result.body.status === "success" ? rows(result.body.message)[0] : undefined;
}

async function findUserByParticipant(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return undefined;
  if (/^\d+$/.test(clean)) return fetchUserById(clean);
  for (const property of ["token", "cookie", "email"]) {
    const result = await callBd(listPath("user", {
      limit: 1,
      property,
      property_value: clean,
      property_operator: "eq",
    }));
    if (result.response.ok && result.body.status === "success") {
      const user = rows(result.body.message)[0];
      if (user?.user_id) return user;
    }
  }
  return undefined;
}

function sessionMatchesUser(session: NativeSession, user: BdRow | undefined) {
  if (!user?.user_id || String(user.user_id) !== String(session.user_id || "")) return false;
  const sessionToken = String(session.token || "").trim();
  const userToken = String(user.token || "").trim();
  const sessionCookie = String(session.cookie || "").trim();
  const userCookie = String(user.cookie || "").trim();
  return (sessionToken && userToken && sessionToken === userToken) ||
    (sessionCookie && userCookie && sessionCookie === userCookie);
}

function sessionCanRefreshUser(session: NativeSession, user: BdRow | undefined) {
  if (sessionMatchesUser(session, user)) return true;
  if (!user?.user_id || String(user.user_id) !== String(session.user_id || "")) return false;

  const sessionEmail = String(session.email || "").trim().toLowerCase();
  const userEmail = String(user.email || "").trim().toLowerCase();
  const hadIssuedSecret =
    String(session.token || "").trim().length >= 16 ||
    String(session.cookie || "").trim().length >= 16;

  return hadIssuedSecret && !!sessionEmail && sessionEmail === userEmail;
}

async function fetchUserBySession(session: NativeSession) {
  const userId = String(session.user_id || "").trim();
  const sessionLookups = [
    ["token", String(session.token || "").trim()],
    ["cookie", String(session.cookie || "").trim()],
  ] as const;

  for (const [property, value] of sessionLookups) {
    if (!value) continue;
    const result = await callBd(listPath("user", {
      limit: 1,
      property,
      property_value: value,
      property_operator: "eq",
    }));
    const user = result.response.ok && result.body.status === "success" ? rows(result.body.message)[0] : undefined;
    if (user?.user_id && String(user.user_id) === userId) return user;
  }

  const user = await fetchUserById(session.user_id);
  return sessionCanRefreshUser(session, user) ? user : undefined;
}

function participantTokens(user: BdRow, session: NativeSession) {
  return [...new Set([user.user_id, session.user_id, user.email, session.email, user.token, session.token, user.cookie, session.cookie]
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function rowHasToken(value: unknown, tokens: string[]) {
  const raw = String(value || "");
  return tokens.some((token) => token && raw.includes(token));
}

function threadHasParticipant(thread: BdRow, tokens: string[]) {
  return rowHasToken(thread.thread_owner, tokens) || rowHasToken(thread.thread_responders, tokens);
}

function splitParticipantValues(value: unknown) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchingParticipantValue(value: unknown, tokens: string[]) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = splitParticipantValues(raw);
  return tokens.find((token) =>
    !!token && (raw === token || parts.includes(token) || raw.includes(token))
  ) || "";
}

function ownerIdentityForThread(thread: BdRow, tokens: string[]) {
  return matchingParticipantValue(thread.thread_owner, tokens) ||
    matchingParticipantValue(thread.thread_responders, tokens) ||
    tokens[0] ||
    "";
}

function threadToken(thread: BdRow | undefined) {
  return String(thread?.thread_token || "").trim();
}

function threadIsClosed(thread: BdRow | undefined) {
  const status = String(thread?.thread_status ?? "").trim().toLowerCase();
  return status === "0" || status === "closed";
}

function timeValue(value: unknown) {
  const raw = String(value || "").trim();
  if (/^\d{14}$/.test(raw)) {
    return new Date(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)) - 1,
      Number(raw.slice(6, 8)),
      Number(raw.slice(8, 10)),
      Number(raw.slice(10, 12)),
      Number(raw.slice(12, 14)),
    ).getTime();
  }
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function collectRecentThreads(tokens: string[], byToken: Map<string, BdRow>, maxPages = 4) {
  let page = "";
  let denied = "";

  for (let index = 0; index < maxPages; index += 1) {
    const params: Record<string, string | number> = {
      limit: 100,
      order_column: "updated_at",
      order_type: "DESC",
    };
    if (page) params.page = page;

    const path = listPath("chat_message_threads", params);
    const result = await callBd(path);
    if (result.response.status === 401 || result.response.status === 403) {
      denied = permissionError(path, result.body.message);
      break;
    }
    if (!result.response.ok || result.body.status !== "success") break;

    for (const thread of rows(result.body.message)) {
      if (!threadHasParticipant(thread, tokens)) continue;
      const key = String(thread.thread_token || thread.thread_id || "");
      if (key) byToken.set(key, thread);
    }

    const current = Number((result.body as BdEnvelope & { current_page?: number }).current_page || index + 1);
    const total = Number((result.body as BdEnvelope & { total_pages?: number }).total_pages || current);
    const next = String((result.body as BdEnvelope & { next_page?: string }).next_page || "").trim();
    if (!next || current >= total) break;
    page = next;
  }

  return denied;
}

async function listThreads(tokens: string[]) {
  const byToken = new Map<string, BdRow>();
  let denied = "";

  const exactTokens = tokens.slice(0, 4);
  for (const token of exactTokens) {
    for (const property of ["thread_owner", "thread_responders"]) {
      const path = listPath("chat_message_threads", {
        limit: 100,
        property,
        property_value: token,
        property_operator: "eq",
        order_column: "updated_at",
        order_type: "DESC",
      });
      const result = await callBd(path);
      if (result.response.status === 401 || result.response.status === 403) {
        denied = permissionError(path, result.body.message);
        continue;
      }
      if (!result.response.ok || result.body.status !== "success") continue;
      for (const thread of rows(result.body.message)) {
        if (!threadHasParticipant(thread, tokens)) continue;
        const key = String(thread.thread_token || thread.thread_id || "");
        if (key) byToken.set(key, thread);
      }
    }
  }

  denied = await collectRecentThreads(tokens, byToken, 10) || denied;

  if (byToken.size === 0 && denied) throw new Error(denied);
  return [...byToken.values()].sort((a, b) =>
    timeValue(b.updated_at || b.created_at) - timeValue(a.updated_at || a.created_at)
  );
}

async function listMessages(thread: string) {
  const result = await callBd(listPath("chat_message_items", {
    limit: 100,
    property: "thread_token",
    property_value: thread,
    property_operator: "eq",
    order_column: "created_at",
    order_type: "ASC",
  }));
  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Chat messages unavailable";
    throw new Error(
      result.response.status === 401 || result.response.status === 403
        ? permissionError("/api/v2/chat_message_items/get", message)
        : message,
    );
  }
  return rows(result.body.message).sort((a, b) =>
    Number(a.message_id || 0) - Number(b.message_id || 0) || timeValue(a.created_at) - timeValue(b.created_at)
  );
}

async function listLatestMessages(thread: string) {
  const result = await callBd(listPath("chat_message_items", {
    limit: 1,
    property: "thread_token",
    property_value: thread,
    property_operator: "eq",
    order_column: "created_at",
    order_type: "DESC",
  }));
  if (!result.response.ok || result.body.status !== "success") return [];
  return rows(result.body.message).sort((a, b) =>
    Number(a.message_id || 0) - Number(b.message_id || 0) || timeValue(a.created_at) - timeValue(b.created_at)
  );
}

function findThreadBetween(threads: BdRow[], ownTokens: string[], otherTokens: string[]) {
  return threads.find((thread) => threadHasParticipant(thread, ownTokens) && threadHasParticipant(thread, otherTokens));
}

function formatNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BD_SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}${value("month")}${value("day")}${value("hour")}${value("minute")}${value("second")}`;
}

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isAppThread(value: unknown) {
  return String(value || "").startsWith("app:");
}

function sortedMemberIds(a: unknown, b: unknown) {
  const ids = [String(a || "").trim(), String(b || "").trim()];
  if (!ids[0] || !ids[1]) throw new Error("Both members are required before a conversation can be opened.");
  return ids.sort((left, right) => left.localeCompare(right));
}

function appThreadIncludesUser(thread: AppNativeThread, userId: unknown) {
  const id = String(userId || "").trim();
  return thread.member_a_bd_user_id === id || thread.member_b_bd_user_id === id;
}

function otherAppMemberId(thread: AppNativeThread, userId: unknown) {
  const id = String(userId || "").trim();
  return thread.member_a_bd_user_id === id ? thread.member_b_bd_user_id : thread.member_a_bd_user_id;
}

function appImageUrls(value: unknown) {
  return Array.isArray(value) ? value.map((url) => String(url || "").trim()).filter(Boolean) : [];
}

function threadReportAliases(token: string, appThread?: AppNativeThread, bdThread?: BdRow) {
  const aliases = new Set<string>();
  const add = (value: unknown) => {
    const clean = String(value || "").trim();
    if (clean) aliases.add(clean);
  };
  add(token);
  add(appThread?.thread_token);
  add(appThread?.bd_thread_token);
  add(threadToken(bdThread));
  return [...aliases];
}

async function listThreadReportsByTokens(tokens: string[]) {
  const uniqueTokens = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))];
  const byToken = new Map<string, AppChatThreadReport>();
  if (!uniqueTokens.length) return byToken;
  const { data, error } = await admin
    .from("app_chat_thread_reports")
    .select("*")
    .in("thread_token", uniqueTokens)
    .neq("status", "resolved")
    .order("reported_at", { ascending: false });
  if (error) throw new Error(error.message);
  for (const report of (data || []) as AppChatThreadReport[]) {
    const aliases = [report.thread_token, report.app_thread_token, report.bd_thread_token]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    for (const alias of aliases) {
      if (!byToken.has(alias)) byToken.set(alias, report);
    }
  }
  return byToken;
}

async function findThreadReport(token: string, appThread?: AppNativeThread, bdThread?: BdRow) {
  const reports = await listThreadReportsByTokens(threadReportAliases(token, appThread, bdThread));
  return threadReportAliases(token, appThread, bdThread).map((alias) => reports.get(alias)).find(Boolean);
}

async function recordThreadReport(
  token: string,
  reporterId: unknown,
  appThread?: AppNativeThread,
  bdThread?: BdRow,
) {
  const aliases = threadReportAliases(token, appThread, bdThread);
  if (!aliases.length) throw new Error("Conversation token required");
  const now = new Date().toISOString();
  const appThreadToken = String(appThread?.thread_token || "").trim() || null;
  const bdThreadToken = String(appThread?.bd_thread_token || threadToken(bdThread) || "").trim() || null;
  const rows = aliases.map((alias) => ({
    thread_token: alias,
    app_thread_token: appThreadToken,
    bd_thread_token: bdThreadToken,
    reporter_bd_user_id: String(reporterId || ""),
    member_a_bd_user_id: appThread?.member_a_bd_user_id || null,
    member_b_bd_user_id: appThread?.member_b_bd_user_id || null,
    status: "reported",
    notice: CHAT_REPORTED_NOTICE,
    reported_at: now,
  }));
  const { error } = await admin
    .from("app_chat_thread_reports")
    .upsert(rows, { onConflict: "thread_token" });
  if (error) throw new Error(error.message);
}

function chatReportedPayload(report?: AppChatThreadReport) {
  return {
    ok: false,
    error: report?.notice || CHAT_REPORTED_NOTICE,
    report_notice: report?.notice || CHAT_REPORTED_NOTICE,
    selected_thread_reported: true,
  };
}

async function getAppThread(token: string, userId: unknown) {
  const { data, error } = await admin.from("app_native_chat_threads").select("*").eq("thread_token", token).limit(1);
  if (error) throw new Error(error.message);
  const thread = (Array.isArray(data) ? data[0] : undefined) as AppNativeThread | undefined;
  if (!thread || !appThreadIncludesUser(thread, userId)) throw new Error("Conversation was not found for this account.");
  return thread;
}

async function listAppThreads(userId: unknown) {
  const id = String(userId || "").trim();
  if (!id) return [];
  const { data, error } = await admin
    .from("app_native_chat_threads")
    .select("*")
    .or(`member_a_bd_user_id.eq.${id},member_b_bd_user_id.eq.${id}`)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []) as AppNativeThread[];
}

async function findAppThread(memberA: string, memberB: string) {
  const { data, error } = await admin
    .from("app_native_chat_threads")
    .select("*")
    .eq("member_a_bd_user_id", memberA)
    .eq("member_b_bd_user_id", memberB)
    .limit(1);
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : undefined) as AppNativeThread | undefined;
}

async function ensureAppThread(currentUser: BdRow, vendor: BdRow, profilePath: string) {
  const [memberA, memberB] = sortedMemberIds(currentUser.user_id, vendor.user_id);
  const existing = await findAppThread(memberA, memberB);
  if (existing) return existing;
  const requestUri = `${BD_API_BASE_URL.replace(/\/+$/, "")}/${profilePath}`;
  const { data, error } = await admin
    .from("app_native_chat_threads")
    .insert({
      thread_token: `app:${randomToken()}`,
      member_a_bd_user_id: memberA,
      member_b_bd_user_id: memberB,
      vendor_bd_user_id: String(vendor.user_id || ""),
      profile_path: profilePath,
      request_uri: requestUri,
    })
    .select("*")
    .single();
  if (!error) return data as AppNativeThread;
  if (String(error.code || "") === "23505") {
    const raced = await findAppThread(memberA, memberB);
    if (raced) return raced;
  }
  throw new Error(error.message);
}

async function listAppMessages(token: string, userId: unknown) {
  const thread = await getAppThread(token, userId);
  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("*")
    .eq("thread_token", token)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return { thread, messages: (data || []) as AppNativeMessage[] };
}

async function latestAppMessage(token: string) {
  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("*")
    .eq("thread_token", token)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : undefined) as AppNativeMessage | undefined;
}

async function countUnreadAppMessages(threads: AppNativeThread[], userId: unknown) {
  const tokens = threads
    .filter((thread) => !String(thread.bd_thread_token || "").trim())
    .map((thread) => thread.thread_token)
    .filter(Boolean);
  if (!tokens.length) return 0;
  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("id")
    .in("thread_token", tokens)
    .neq("sender_bd_user_id", String(userId || ""))
    .is("read_at", null)
    .is("bd_synced_at", null);
  return error || !Array.isArray(data) ? 0 : data.length;
}

async function markAppRead(token: string, userId: unknown) {
  await getAppThread(token, userId);
  const { error } = await admin
    .from("app_native_chat_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_token", token)
    .neq("sender_bd_user_id", String(userId || ""))
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

function validateMessage(content: string, imageDataUri = "") {
  const clean = content.trim();
  const image = imageDataUri.trim();
  if (!clean && !image) throw new Error("Message required");
  if (clean.length > 2000) throw new Error("Message is too long");
  if (image) {
    if (!/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(image)) throw new Error("Unsupported image format");
    if (image.length > MAX_IMAGE_DATA_URI_LENGTH) throw new Error("Image is too large. Please choose a smaller image.");
  }
  return { clean, image };
}

async function sendAppMessage(token: string, userId: unknown, content: string, imageDataUri = "") {
  await getAppThread(token, userId);
  const { clean, image } = validateMessage(content, imageDataUri);
  const { data, error } = await admin.from("app_native_chat_messages").insert({
    thread_token: token,
    sender_bd_user_id: String(userId || ""),
    message_content: clean,
    image_urls: image ? [image] : [],
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data as AppNativeMessage;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|#39|nbsp|amp|lt|gt);/gi, (entity, code) => {
    const normalized = String(code).toLowerCase();
    if (normalized.startsWith("#x")) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    if (normalized.startsWith("#")) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    return ({ quot: "\"", apos: "'", "#39": "'", nbsp: " ", amp: "&", lt: "<", gt: ">" } as Record<string, string>)[normalized] || entity;
  });
}

function stripHtml(value: unknown) {
  return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
}

function imageUrlsFromHtml(value: unknown) {
  const html = String(value || "");
  const urls = new Set<string>();
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const match = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i) || tag.match(/\bsrc\s*=\s*([^\s>]+)/i);
    const src = decodeHtml(match?.[2] || match?.[1] || "").trim();
    if (/^https?:\/\//i.test(src) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) urls.add(src);
  }
  return [...urls];
}

async function sendBdMessage(token: string, content: string, owner: string, imageDataUri = "") {
  const { clean, image } = validateMessage(content, imageDataUri);
  const textHtml = clean ? `<p>${escapeHtml(clean).replace(/\r\n|\r|\n/g, "<br>")}</p>` : "";
  const imageHtml = image ? `<p><img src="${escapeHtml(image)}" alt="Chat image" style="max-width:100%;height:auto;"></p>` : "";
  const result = await callBd("/api/v2/chat_message_items/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      message_token: randomToken(),
      thread_token: token,
      message_status: 0,
      message_owner: owner,
      message_content: `${textHtml}${imageHtml}`,
      created_at: formatNow(),
    }),
  });
  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Message send failed";
    throw new Error(result.response.status === 401 || result.response.status === 403 ? permissionError("/api/v2/chat_message_items/create", message) : message);
  }
  return firstRow(result.body.message);
}

async function fetchThreadByToken(token: string) {
  const result = await callBd(listPath("chat_message_threads", {
    limit: 1,
    property: "thread_token",
    property_value: token,
    property_operator: "eq",
  }));
  return result.response.ok && result.body.status === "success" ? rows(result.body.message)[0] : undefined;
}

async function fetchThreadById(threadId: string) {
  const clean = String(threadId || "").trim();
  if (!clean) return undefined;
  const result = await callBd(listPath("chat_message_threads", {
    limit: 1,
    property: "thread_id",
    property_value: clean,
    property_operator: "eq",
  }));
  return result.response.ok && result.body.status === "success" ? rows(result.body.message)[0] : undefined;
}

function normalizedRequestUri(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, BD_API_BASE_URL);
    return decodeURIComponent(parsed.pathname || "").replace(/^\/+|\/+$/g, "").toLowerCase();
  } catch {
    return raw.replace(/^\/+|\/+$/g, "").toLowerCase();
  }
}

async function resolveThreadForUser(token: string, userTokens: string[], preferredTitle = "", preferredThreadId = "", preferredRequestUri = "") {
  const cleanToken = String(token || "").trim();
  const cleanThreadId = String(preferredThreadId || "").trim();
  if (cleanThreadId) {
    const byId = await fetchThreadById(cleanThreadId).catch(() => undefined);
    if (byId && threadHasParticipant(byId, userTokens)) return byId;
  }

  const direct = cleanToken ? await fetchThreadByToken(cleanToken).catch(() => undefined) : undefined;
  if (direct && threadHasParticipant(direct, userTokens)) return direct;

  const threads = await listThreads(userTokens);
  const tokenMatch = threads.find((thread) =>
    (threadToken(thread) === cleanToken || String(thread.thread_id || "").trim() === cleanToken || String(thread.thread_id || "").trim() === cleanThreadId) &&
    threadHasParticipant(thread, userTokens)
  );
  if (tokenMatch) return tokenMatch;

  const targetRequestUri = normalizedRequestUri(preferredRequestUri);
  if (targetRequestUri) {
    const requestUriMatch = threads.find((thread) =>
      threadHasParticipant(thread, userTokens) &&
      normalizedRequestUri(thread.request_uri) === targetRequestUri
    );
    if (requestUriMatch) return requestUriMatch;
  }

  const targetTitle = normalizedChatTitle(preferredTitle);
  if (!targetTitle) {
    console.info("bd-chat-sync resolve miss", {
      token: safeTokenHint(cleanToken),
      thread_id: cleanThreadId,
      request_uri: targetRequestUri,
      preferred_title: "",
      thread_count: threads.length,
      thread_hints: threads.slice(0, 8).map(safeThreadHint),
    });
    return undefined;
  }

  for (const thread of threads) {
    if (!threadHasParticipant(thread, userTokens)) continue;
    const otherUser = await findOtherUserForThread(thread, userTokens).catch(() => undefined);
    const title = normalizedChatTitle(threadTitle(thread, otherUser));
    if (title && title === targetTitle) return thread;
  }

  console.info("bd-chat-sync resolve miss", {
    token: safeTokenHint(cleanToken),
    thread_id: cleanThreadId,
    request_uri: targetRequestUri,
    preferred_title: targetTitle,
    thread_count: threads.length,
    thread_hints: threads.slice(0, 8).map(safeThreadHint),
  });
  return undefined;
}

async function closeBdThread(thread: BdRow) {
  const token = threadToken(thread);
  if (!token) return;
  const payload: Record<string, string | number> = {
    thread_token: token,
    thread_status: 0,
    updated_at: formatNow(),
  };
  const threadId = String(thread.thread_id || "").trim();
  if (threadId) payload.thread_id = threadId;
  const result = await callBd("/api/v2/chat_message_threads/update", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(payload),
  });
  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Chat thread close failed";
    throw new Error(result.response.status === 401 || result.response.status === 403 ? permissionError("/api/v2/chat_message_threads/update", message) : message);
  }
}

async function createBdThread(owner: string, responder: string, requestUri: string) {
  const createdAt = formatNow();
  const token = randomToken();
  const result = await callBd("/api/v2/chat_message_threads/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      thread_token: token,
      thread_owner: owner,
      thread_responders: responder,
      thread_status: 1,
      request_uri: requestUri,
      created_at: createdAt,
      updated_at: createdAt,
    }),
  });
  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Chat thread create failed";
    throw new Error(result.response.status === 401 || result.response.status === 403 ? permissionError("/api/v2/chat_message_threads/create", message) : message);
  }
  return firstRow(result.body.message) || {
    thread_token: token,
    thread_owner: owner,
    thread_responders: responder,
    request_uri: requestUri,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

async function saveThreadMirror(appToken: string, bdThread: BdRow) {
  const token = threadToken(bdThread);
  if (!token) throw new Error("BD created a chat thread without a thread token.");
  const { error } = await admin.from("app_native_chat_threads").update({
    bd_thread_token: token,
    bd_thread_id: String(bdThread.thread_id || "").trim() || null,
    bd_synced_at: new Date().toISOString(),
    bd_sync_error: null,
  }).eq("thread_token", appToken);
  if (error) throw new Error(error.message);
}

async function markThreadMirrorError(appToken: string, error: unknown) {
  await admin.from("app_native_chat_threads").update({ bd_sync_error: shortError(error) }).eq("thread_token", appToken);
}

async function markMessageMirror(id: string, message: BdRow | undefined) {
  const { error } = await admin.from("app_native_chat_messages").update({
    bd_message_id: String(message?.message_id || message?.message_token || "").trim() || null,
    bd_synced_at: new Date().toISOString(),
    bd_sync_error: null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

async function markMessageMirrorError(id: string, error: unknown) {
  await admin.from("app_native_chat_messages").update({ bd_sync_error: shortError(error) }).eq("id", id);
}

async function mirrorThread(appThread: AppNativeThread, currentUser: BdRow, session: NativeSession, knownThreads?: BdRow[]) {
  const savedToken = String(appThread.bd_thread_token || "").trim();
  if (savedToken) {
    const saved = knownThreads?.find((thread) => threadToken(thread) === savedToken) || await fetchThreadByToken(savedToken).catch(() => undefined);
    if (saved) return saved;
  }

  const otherUser = await fetchUserById(otherAppMemberId(appThread, currentUser.user_id));
  if (!otherUser?.user_id) throw new Error("The other chat member could not be found in BD.");
  const ownTokens = participantTokens(currentUser, session);
  const otherTokens = participantTokens(otherUser, {
    user_id: otherUser.user_id as string | number,
    token: String(otherUser.token || ""),
    cookie: String(otherUser.cookie || ""),
    email: String(otherUser.email || ""),
  });
  const existing = findThreadBetween(knownThreads || await listThreads(ownTokens), ownTokens, otherTokens);
  if (existing) {
    await saveThreadMirror(appThread.thread_token, existing);
    return existing;
  }

  const owner = String(currentUser.token || session.token || currentUser.cookie || session.cookie || currentUser.user_id || "").trim();
  const responder = String(otherUser.token || otherUser.cookie || otherUser.user_id || otherUser.email || "").trim();
  if (!owner || !responder) throw new Error("BD chat participants are missing tokens.");
  const requestUri = String(appThread.request_uri || "").trim() ||
    `${BD_API_BASE_URL.replace(/\/+$/, "")}/${String(appThread.profile_path || "").replace(/^\/+/, "")}`;
  const created = await createBdThread(owner, responder, requestUri);
  await saveThreadMirror(appThread.thread_token, created);
  return created;
}

async function mirrorAppMessages(appThread: AppNativeThread, bdThread: BdRow) {
  const bdToken = threadToken(bdThread);
  if (!bdToken) throw new Error("BD chat thread token is missing.");
  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("*")
    .eq("thread_token", appThread.thread_token)
    .is("bd_synced_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  for (const message of (data || []) as AppNativeMessage[]) {
    try {
      const sender = await fetchUserById(message.sender_bd_user_id);
      const owner = String(sender?.token || sender?.cookie || message.sender_bd_user_id || "").trim();
      const sent = await sendBdMessage(bdToken, String(message.message_content || ""), owner, appImageUrls(message.image_urls)[0] || "");
      await markMessageMirror(message.id, sent);
    } catch (error) {
      await markMessageMirrorError(message.id, error);
      throw error;
    }
  }
}

async function markBdThreadRead(token: string, userTokens: string[]) {
  const messages = await listMessages(token);
  await Promise.all(messages.filter((message) => {
    const owner = String(message.message_owner || "");
    return !userTokens.some((userToken) => userToken && owner.includes(userToken)) && String(message.message_status || "0") === "0";
  }).map((message) => callBd("/api/v2/chat_message_items/update", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ message_id: String(message.message_id || ""), message_status: 1 }),
  }).catch(() => undefined)));
}

function absoluteUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith("/") ? `${BD_API_BASE_URL.replace(/\/+$/, "")}${raw}` : `${BD_API_BASE_URL.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
}

function avatarUrl(user: BdRow | undefined) {
  if (!user) return "";
  return [user.image_main_file, user.logo, user.profile_photo, user.cover_photo]
    .map(absoluteUrl)
    .find((url) => url && !/profile-profile-holder\.(png|jpe?g|webp)$/i.test(url) && !/default.*logo/i.test(url)) || "";
}

function displayName(user: BdRow | undefined) {
  return String(user?.company || "").trim() ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Conversation";
}

function normalizedChatTitle(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeTokenHint(value: unknown) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return `${clean.slice(0, 6)}...${clean.slice(-4)}:${clean.length}`;
}

function safeThreadHint(thread: BdRow) {
  return {
    token: safeTokenHint(threadToken(thread)),
    id: String(thread.thread_id || "").trim(),
    title: String(thread.chat_with_name || thread.thread_title || "").trim().slice(0, 80),
    request_uri: String(thread.request_uri || "").trim().slice(0, 120),
  };
}

function profilePathFromThread(thread: BdRow) {
  const requestUri = String(thread.request_uri || "").trim();
  if (!requestUri) return "";
  try {
    const parsed = new URL(requestUri, BD_API_BASE_URL);
    return decodeURIComponent(parsed.pathname || "").replace(/^\/+|\/+$/g, "");
  } catch {
    return requestUri.replace(/^\/+|\/+$/g, "");
  }
}

async function findOtherUserForThread(thread: BdRow, userTokens: string[]) {
  const participant = otherThreadToken(thread, userTokens);
  const participantUser = await findUserByParticipant(participant).catch(() => undefined);
  if (participantUser?.user_id) return participantUser;
  const profilePath = profilePathFromThread(thread);
  return profilePath ? await fetchUserByProfilePath(profilePath).catch(() => undefined) : undefined;
}

function threadTitle(thread: BdRow, otherUser: BdRow | undefined) {
  const name = displayName(otherUser);
  if (name && name !== "Conversation") return name;
  const rawTitle = String(thread.chat_with_name || thread.thread_title || "").trim();
  if (rawTitle && !/^\d+$/.test(rawTitle) && rawTitle.length < 80) return rawTitle;
  return "WeddingWin Member";
}

function otherThreadToken(thread: BdRow, userTokens: string[]) {
  const owner = String(thread.thread_owner || "");
  if (userTokens.some((token) => token && owner.includes(token))) {
    return splitParticipantValues(thread.thread_responders)[0] || "";
  }
  return splitParticipantValues(owner)[0] || "";
}

function bdMessageDto(message: BdRow, userTokens: string[], ownAvatar = "", otherAvatar = "") {
  const owner = String(message.message_owner || "");
  const mine = userTokens.some((token) => token && owner.includes(token));
  return {
    id: String(message.message_id || message.message_token || ""),
    thread_token: String(message.thread_token || ""),
    owner,
    is_mine: mine,
    status: Number(message.message_status || 0),
    content: stripHtml(message.message_content),
    image_urls: imageUrlsFromHtml(message.message_content),
    avatar_url: mine ? ownAvatar : otherAvatar,
    created_at: String(message.created_at || ""),
  };
}

function appMessageDto(message: AppNativeMessage, userId: unknown, ownAvatar = "", otherAvatar = "") {
  const mine = String(message.sender_bd_user_id || "") === String(userId || "");
  return {
    id: String(message.id || ""),
    thread_token: String(message.thread_token || ""),
    owner: String(message.sender_bd_user_id || ""),
    is_mine: mine,
    status: message.read_at ? 1 : 0,
    content: String(message.message_content || ""),
    image_urls: appImageUrls(message.image_urls),
    avatar_url: mine ? ownAvatar : otherAvatar,
    created_at: String(message.created_at || ""),
  };
}

async function bdThreadDto(thread: BdRow, messages: BdRow[], userTokens: string[], report?: AppChatThreadReport) {
  const last = messages[messages.length - 1];
  const unread = messages.filter((message) => {
    const owner = String(message.message_owner || "");
    return !userTokens.some((token) => token && owner.includes(token)) && String(message.message_status || "0") === "0";
  }).length;
  const otherUser = await findOtherUserForThread(thread, userTokens);
  const closed = !!report || threadIsClosed(thread);
  return {
    id: String(thread.thread_id || thread.thread_token || ""),
    token: String(thread.thread_token || ""),
    thread_id: String(thread.thread_id || ""),
    request_uri: String(thread.request_uri || ""),
    title: threadTitle(thread, otherUser),
    avatar_url: avatarUrl(otherUser),
    subtitle: closed
      ? report?.notice || CHAT_REPORTED_NOTICE
      : stripHtml(last?.message_content) || (imageUrlsFromHtml(last?.message_content).length ? "[Image]" : "Tap to start the conversation"),
    updated_at: String(last?.created_at || thread.updated_at || thread.created_at || ""),
    unread_count: closed ? 0 : unread,
    reported: closed,
    closed,
    report_notice: closed ? report?.notice || CHAT_REPORTED_NOTICE : "",
  };
}

async function appThreadDto(thread: AppNativeThread, messages: AppNativeMessage[], userId: unknown, report?: AppChatThreadReport) {
  const otherUser = await fetchUserById(otherAppMemberId(thread, userId)).catch(() => undefined);
  const last = messages[messages.length - 1] || await latestAppMessage(thread.thread_token).catch(() => undefined);
  const images = appImageUrls(last?.image_urls);
  const closed = !!report;
  return {
    id: String(thread.thread_token || ""),
    token: String(thread.thread_token || ""),
    thread_id: String(thread.bd_thread_id || ""),
    request_uri: String(thread.request_uri || ""),
    title: displayName(otherUser),
    avatar_url: avatarUrl(otherUser),
    subtitle: closed
      ? report?.notice || CHAT_REPORTED_NOTICE
      : String(last?.message_content || "").trim() || (images.length ? "[Image]" : String(thread.request_uri || "No messages yet")),
    updated_at: String(thread.updated_at || thread.created_at || ""),
    unread_count: closed ? 0 : await countUnreadAppMessages([thread], userId),
    reported: closed,
    closed,
    report_notice: closed ? report?.notice || CHAT_REPORTED_NOTICE : "",
  };
}

async function countUnreadBdMessages(threads: BdRow[], userTokens: string[]) {
  const tokens = new Set(threads.map((thread) => threadToken(thread)).filter(Boolean));
  if (!tokens.size) return 0;
  const result = await callBd(listPath("chat_message_items", {
    limit: 100,
    property: "message_status",
    property_value: 0,
    property_operator: "eq",
    order_column: "created_at",
    order_type: "DESC",
  }));
  if (!result.response.ok || result.body.status !== "success") return 0;
  return rows(result.body.message).filter((message) => {
    const owner = String(message.message_owner || "");
    return tokens.has(String(message.thread_token || "")) && !userTokens.some((token) => token && owner.includes(token));
  }).length;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const session = body?.native_session as NativeSession | undefined;
    const action = String(body?.action || "list");
    if (!session?.user_id || (!session?.token && !session?.cookie)) {
      return jsonResponse({ ok: false, error: "Native session required" }, 401);
    }

    const user = await fetchUserBySession(session);
    if (!user?.user_id) return jsonResponse({ ok: false, error: "Native session expired" }, 401);

    const userTokens = participantTokens(user!, session);
    const primaryToken = String(user?.token || session.token || "").trim();
    const ownAvatar = avatarUrl(user);
    let selectedThread = String(body?.thread_token || "");
    let openedBdThread: BdRow | undefined;
    let openedAppThread: AppNativeThread | undefined;

    if (action === "open_vendor_profile") {
      const profilePath = normalizeProfilePath(body?.connect_url || body?.profile_url);
      if (!profilePath) return jsonResponse({ ok: false, error: "Vendor profile URL required" }, 400);
      const vendor = await fetchUserByProfilePath(profilePath);
      if (!vendor?.user_id) return jsonResponse({ ok: false, error: "Vendor profile was not found" }, 404);
      if (String(vendor.user_id) === String(user?.user_id)) {
        return jsonResponse({ ok: false, error: "You cannot message your own listing from the app." }, 400);
      }

      const vendorTokens = participantTokens(vendor, {
        user_id: vendor.user_id as string | number,
        token: String(vendor.token || ""),
        cookie: String(vendor.cookie || ""),
        email: String(vendor.email || ""),
      });
      const existingThreads = await listThreads(userTokens);
      openedBdThread = findThreadBetween(existingThreads, userTokens, vendorTokens);
      if (openedBdThread) {
        selectedThread = threadToken(openedBdThread);
      } else {
        openedAppThread = await ensureAppThread(user!, vendor, profilePath);
        openedBdThread = await mirrorThread(openedAppThread, user!, session, existingThreads).catch(async (error) => {
          await markThreadMirrorError(openedAppThread!.thread_token, error);
          throw error;
        });
        await mirrorAppMessages(openedAppThread, openedBdThread).catch(async (error) => {
          await markThreadMirrorError(openedAppThread!.thread_token, error);
          throw error;
        });
        selectedThread = threadToken(openedBdThread);
      }
    }

    if (action === "report") {
      const token = String(body?.thread_token || "").trim();
      const preferredTitle = String(body?.selected_thread_title || "").trim();
      const preferredThreadId = String(body?.selected_thread_id || "").trim();
      const preferredRequestUri = String(body?.selected_thread_request_uri || "").trim();
      if (!token) return jsonResponse({ ok: false, error: "Conversation token required" }, 400);
      selectedThread = token;

      if (isAppThread(token)) {
        openedAppThread = await getAppThread(token, user!.user_id);
        const savedBdToken = String(openedAppThread.bd_thread_token || "").trim();
        if (savedBdToken) {
          openedBdThread = await fetchThreadByToken(savedBdToken).catch(() => undefined);
        } else {
          openedBdThread = await mirrorThread(openedAppThread, user!, session).catch((error) => {
            console.error("App chat thread mirror before report failed", shortError(error));
            return undefined;
          });
        }
        await recordThreadReport(token, user!.user_id, openedAppThread, openedBdThread);
        if (openedBdThread) {
          await closeBdThread(openedBdThread).catch((error) =>
            console.error("BD chat close after app report failed", shortError(error))
          );
          selectedThread = threadToken(openedBdThread) || token;
        }
      } else {
        openedBdThread = await resolveThreadForUser(token, userTokens, preferredTitle, preferredThreadId, preferredRequestUri);
        if (!openedBdThread || !threadHasParticipant(openedBdThread, userTokens)) {
          return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
        }
        selectedThread = threadToken(openedBdThread) || token;
        await recordThreadReport(token, user!.user_id, undefined, openedBdThread);
        await closeBdThread(openedBdThread).catch((error) =>
          console.error("BD chat close after report failed", shortError(error))
        );
      }
    }

    if (action === "send") {
      const token = String(body?.thread_token || "").trim();
      const preferredTitle = String(body?.selected_thread_title || "").trim();
      const preferredThreadId = String(body?.selected_thread_id || "").trim();
      const preferredRequestUri = String(body?.selected_thread_request_uri || "").trim();
      if (isAppThread(token)) {
        const appThread = await getAppThread(token, user!.user_id);
        const existingReport = await findThreadReport(token, appThread);
        if (existingReport) return jsonResponse(chatReportedPayload(existingReport), 423);
        try {
          const bdThread = await mirrorThread(appThread, user!, session);
          const mirroredReport = await findThreadReport(token, appThread, bdThread);
          if (mirroredReport || threadIsClosed(bdThread)) {
            return jsonResponse(chatReportedPayload(mirroredReport), 423);
          }
          await mirrorAppMessages(appThread, bdThread).catch((error) =>
            console.error("App chat backfill failed", shortError(error))
          );
          selectedThread = threadToken(bdThread);
          await sendBdMessage(
            selectedThread,
            String(body?.message || ""),
            ownerIdentityForThread(bdThread, userTokens) || primaryToken,
            String(body?.image_data_uri || "")
          );
        } catch (error) {
          await markThreadMirrorError(token, error);
          return jsonResponse({
            ok: false,
            error: "Website chat sync unavailable",
            detail: shortError(error),
            required_permissions: CHAT_PERMISSION_ENDPOINTS,
          }, 502);
        }
      } else {
        const bdThread = await resolveThreadForUser(token, userTokens, preferredTitle, preferredThreadId, preferredRequestUri);
        if (!bdThread || !threadHasParticipant(bdThread, userTokens)) {
          return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
        }
        selectedThread = threadToken(bdThread) || token;
        const existingReport = await findThreadReport(token, undefined, bdThread);
        if (existingReport || threadIsClosed(bdThread)) {
          return jsonResponse(chatReportedPayload(existingReport), 423);
        }
        await sendBdMessage(
          selectedThread,
          String(body?.message || ""),
          ownerIdentityForThread(bdThread, userTokens) || primaryToken,
          String(body?.image_data_uri || "")
        );
      }
    }

    if (action === "read" || action === "send") {
      const token = String(body?.thread_token || "");
      if (token) {
        if (isAppThread(token)) {
          const appThread = await getAppThread(token, user!.user_id);
          const mirrored = String(appThread.bd_thread_token || "").trim();
          if (mirrored) await markBdThreadRead(mirrored, userTokens);
          await markAppRead(token, user!.user_id);
        } else {
          await markBdThreadRead(token, userTokens);
        }
      }
    }

    const bdThreads = await listThreads(userTokens);
    if (openedBdThread && !bdThreads.some((thread) => threadToken(thread) === threadToken(openedBdThread))) {
      bdThreads.unshift(openedBdThread);
    }
    const appThreads = await listAppThreads(user!.user_id);
    if (openedAppThread && !appThreads.some((thread) => thread.thread_token === openedAppThread?.thread_token)) {
      appThreads.unshift(openedAppThread);
    }

    for (const appThread of appThreads) {
      const savedBdToken = String(appThread.bd_thread_token || "").trim();
      if (savedBdToken) {
        if (!bdThreads.some((thread) => threadToken(thread) === savedBdToken)) {
          const savedBdThread = await fetchThreadByToken(savedBdToken).catch(() => undefined);
          if (savedBdThread) bdThreads.unshift(savedBdThread);
        }
        continue;
      }
      try {
        const bdThread = await mirrorThread(appThread, user!, session, bdThreads);
        await mirrorAppMessages(appThread, bdThread);
        if (!bdThreads.some((thread) => threadToken(thread) === threadToken(bdThread))) {
          bdThreads.unshift(bdThread);
        }
        appThread.bd_thread_token = threadToken(bdThread);
        appThread.bd_thread_id = String(bdThread.thread_id || "").trim() || null;
      } catch (error) {
        await markThreadMirrorError(appThread.thread_token, error);
        console.error("App chat repair mirror failed", shortError(error));
      }
    }

    const bdTokens = new Set(bdThreads.map((thread) => threadToken(thread)).filter(Boolean));
    const selectedAppToken = isAppThread(selectedThread) ? String(selectedThread || "") : "";
    const visibleAppThreads = appThreads.filter((thread) => {
      const mirrored = String(thread.bd_thread_token || "").trim();
      if (thread.thread_token === selectedAppToken) return !mirrored || !bdTokens.has(mirrored);
      return !mirrored || !bdTokens.has(mirrored);
    });
    const reportTokens = [
      ...bdThreads.map((thread) => threadToken(thread)),
      ...visibleAppThreads.flatMap((thread) => [thread.thread_token, String(thread.bd_thread_token || "").trim()]),
    ];
    const reportMap = await listThreadReportsByTokens(reportTokens);
    const reportForBdThread = (thread: BdRow) => reportMap.get(threadToken(thread));
    const reportForAppThread = (thread: AppNativeThread) =>
      reportMap.get(thread.thread_token) || reportMap.get(String(thread.bd_thread_token || "").trim());
    const bdThreadLatestMessages = new Map<string, BdRow[]>();
    await Promise.all(bdThreads.slice(0, 50).map(async (thread) => {
      const token = threadToken(thread);
      if (!token) return;
      bdThreadLatestMessages.set(token, await listLatestMessages(token).catch(() => []));
    }));
    const choices = [
      ...bdThreads
        .filter((thread) => {
          const token = threadToken(thread);
          return token === selectedThread || !!bdThreadLatestMessages.get(token)?.length;
        })
        .map((thread) => {
          const token = threadToken(thread);
          const last = bdThreadLatestMessages.get(token)?.[0];
          return { token, updated_at: String(last?.created_at || thread.updated_at || thread.created_at || "") };
        }),
      ...visibleAppThreads.map((thread) => ({ token: thread.thread_token, updated_at: String(thread.updated_at || thread.created_at || "") })),
    ].filter((thread) => thread.token).sort((a, b) => timeValue(b.updated_at) - timeValue(a.updated_at));

    const selectedToken = String(selectedThread || choices[0]?.token || "");
    const selectedBdThread = !isAppThread(selectedToken)
      ? bdThreads.find((thread) => threadToken(thread) === selectedToken)
      : undefined;
    const selectedApp = isAppThread(selectedToken) ? await listAppMessages(selectedToken, user!.user_id) : undefined;
    const selectedOtherUser = selectedApp?.thread
      ? await fetchUserById(otherAppMemberId(selectedApp.thread, user!.user_id)).catch(() => undefined)
      : selectedBdThread
        ? await findUserByParticipant(otherThreadToken(selectedBdThread, userTokens)).catch(() => undefined)
        : undefined;
    const otherAvatar = avatarUrl(selectedOtherUser);
    const bdMessages = selectedToken && !isAppThread(selectedToken) ? await listMessages(selectedToken) : [];
    const appMessages = selectedApp?.messages || [];
    const bdSummaries = (await Promise.all(bdThreads.slice(0, 50).map(async (thread) => {
      const token = threadToken(thread);
      const messages = token === selectedToken ? bdMessages : bdThreadLatestMessages.get(token) || [];
      if (!messages.length && token !== selectedToken) return undefined;
      return bdThreadDto(thread, messages, userTokens, reportForBdThread(thread));
    }))).filter((thread): thread is Awaited<ReturnType<typeof bdThreadDto>> => !!thread);
    const appSummaries = await Promise.all(visibleAppThreads.slice(0, 50).map((thread) =>
      appThreadDto(thread, thread.thread_token === selectedToken ? appMessages : [], user!.user_id, reportForAppThread(thread))
    ));
    const selectedReport = selectedBdThread
      ? reportForBdThread(selectedBdThread)
      : selectedApp?.thread
        ? reportForAppThread(selectedApp.thread)
        : reportMap.get(selectedToken);
    const selectedClosed = !!selectedReport || threadIsClosed(selectedBdThread);
    const unreadBdThreads = bdThreads.filter((thread) => !reportForBdThread(thread) && !threadIsClosed(thread));
    const unreadAppThreads = visibleAppThreads.filter((thread) => !reportForAppThread(thread));
    const syncDebug = {
      member_id: String(user!.user_id || ""),
      bd_threads: bdThreads.length,
      app_threads: appThreads.length,
      visible_app_threads: visibleAppThreads.length,
    };

    console.info("bd-chat-sync result", {
      action,
      member_id: syncDebug.member_id,
      bd_threads: syncDebug.bd_threads,
      app_threads: syncDebug.app_threads,
      visible_app_threads: syncDebug.visible_app_threads,
      selected_thread: selectedToken ? "yes" : "no",
    });

    return jsonResponse({
      ok: true,
      threads: [...bdSummaries, ...appSummaries].sort((a, b) => timeValue(b.updated_at) - timeValue(a.updated_at)),
      selected_thread_token: selectedToken,
      selected_thread_reported: selectedClosed,
      report_notice: selectedClosed ? selectedReport?.notice || CHAT_REPORTED_NOTICE : "",
      messages: isAppThread(selectedToken)
        ? appMessages.map((message) => appMessageDto(message, user!.user_id, ownAvatar, otherAvatar))
        : bdMessages.map((message) => bdMessageDto(message, userTokens, ownAvatar, otherAvatar)),
      unread_count: await countUnreadBdMessages(unreadBdThreads, userTokens) + await countUnreadAppMessages(unreadAppThreads, user!.user_id),
      sync_debug: syncDebug,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "Website chat sync unavailable",
      detail: error instanceof Error ? error.message : String(error),
      required_permissions: CHAT_PERMISSION_ENDPOINTS,
    }, 500);
  }
});
