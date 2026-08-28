import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bdFindUserByParticipant,
  CHAT_MEMBER_BLOCKED_NOTICE,
  enqueueCloseOutbox,
  markOutboxSent,
  mirrorThreadByToken,
  otherParticipantValue,
  participantTokens,
  threadHasParticipant,
  upsertChatMemberBlock,
} from "../_shared/bd_chat.ts";
import { runDurableClose } from "../_shared/chat_moderation.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BD_SITE_TIME_ZONE = Deno.env.get("BD_SITE_TIME_ZONE") || "America/Toronto";
const CHAT_REPORTED_NOTICE = CHAT_MEMBER_BLOCKED_NOTICE;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type BdEnvelope = { status?: string; message?: unknown };
type BdRow = Record<string, unknown>;
type NativeSession = { email?: string; user_id?: string | number; token?: string; cookie?: string };
type AppNativeThread = {
  thread_token: string;
  member_a_bd_user_id: string;
  member_b_bd_user_id: string;
  bd_thread_token?: string | null;
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

function listPath(model: string, params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => search.set(key, String(value)));
  return `/api/v2/${model}/get?${search.toString()}`;
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

async function fetchUserById(userId: string | number) {
  const result = await callBd(`/api/v2/user/get/${encodeURIComponent(String(userId))}`);
  return result.response.ok && result.body.status === "success" ? firstRow(result.body.message) : undefined;
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

function sessionMatchesUser(session: NativeSession, user: BdRow | undefined) {
  if (!user?.user_id || String(user.user_id) !== String(session.user_id || "")) return false;
  const sessionToken = String(session.token || "").trim();
  const userToken = String(user.token || "").trim();
  const sessionCookie = String(session.cookie || "").trim();
  const userCookie = String(user.cookie || "").trim();
  return (sessionToken && userToken && sessionToken === userToken) ||
    (sessionCookie && userCookie && sessionCookie === userCookie);
}

async function fetchUserBySession(session: NativeSession) {
  const userId = String(session.user_id || "").trim();
  if (!userId) return undefined;
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

  const user = await fetchUserById(userId);
  return sessionMatchesUser(session, user) ? user : undefined;
}

function threadToken(thread: BdRow | undefined) {
  return String(thread?.thread_token || "").trim();
}

function appThreadIncludesUser(thread: AppNativeThread, userId: unknown) {
  const id = String(userId || "").trim();
  return thread.member_a_bd_user_id === id || thread.member_b_bd_user_id === id;
}

async function getAppThread(token: string, userId: unknown) {
  const { data, error } = await admin
    .from("app_native_chat_threads")
    .select("*")
    .eq("thread_token", token)
    .limit(1);
  if (error) throw new Error(error.message);
  const thread = (Array.isArray(data) ? data[0] : undefined) as AppNativeThread | undefined;
  if (!thread || !appThreadIncludesUser(thread, userId)) throw new Error("Conversation was not found for this account.");
  return thread;
}

async function getAppThreadByBdToken(token: string, userId: unknown) {
  const { data, error } = await admin
    .from("app_native_chat_threads")
    .select("*")
    .eq("bd_thread_token", token)
    .limit(1);
  if (error) throw new Error(error.message);
  const thread = (Array.isArray(data) ? data[0] : undefined) as AppNativeThread | undefined;
  return thread && appThreadIncludesUser(thread, userId) ? thread : undefined;
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
    throw new Error(message);
  }
}

function reportAliases(token: string, appThread?: AppNativeThread, bdThread?: BdRow) {
  return [...new Set([
    token,
    appThread?.thread_token,
    appThread?.bd_thread_token,
    threadToken(bdThread),
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

async function recordReport(
  token: string,
  reporterId: unknown,
  memberA: string,
  memberB: string,
  appThread?: AppNativeThread,
  bdThread?: BdRow,
  reportedAt = new Date().toISOString(),
) {
  const aliases = reportAliases(token, appThread, bdThread);
  if (!aliases.length) throw new Error("Conversation token required");
  const appThreadToken = String(appThread?.thread_token || "").trim() || null;
  const bdThreadToken = String(appThread?.bd_thread_token || threadToken(bdThread) || "").trim() || null;
  const { error } = await admin
    .from("app_chat_thread_reports")
    .upsert(aliases.map((alias) => ({
      thread_token: alias,
      app_thread_token: appThreadToken,
      bd_thread_token: bdThreadToken,
      reporter_bd_user_id: String(reporterId || ""),
      member_a_bd_user_id: memberA,
      member_b_bd_user_id: memberB,
      status: "reported",
      notice: CHAT_REPORTED_NOTICE,
      reported_at: reportedAt,
    })), { onConflict: "thread_token" });
  if (error) throw new Error(error.message);
}

async function resolveBlockedMemberId(
  reporterId: unknown,
  userTokens: string[],
  token: string,
  appThread?: AppNativeThread,
  bdThread?: BdRow,
) {
  const reporter = String(reporterId || "").trim();
  if (appThread) {
    return appThread.member_a_bd_user_id === reporter
      ? appThread.member_b_bd_user_id
      : appThread.member_a_bd_user_id;
  }

  const mirror = await mirrorThreadByToken(token);
  const knownIds = [mirror?.owner_user_id, mirror?.responder_user_id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const knownOther = knownIds.find((value) => value !== reporter);
  if (knownOther) return knownOther;

  const participant = otherParticipantValue(mirror || bdThread || {}, userTokens);
  const otherUser = participant ? await bdFindUserByParticipant(participant) : undefined;
  const otherId = String(otherUser?.user_id || "").trim();
  if (!otherId || otherId === reporter) {
    throw new Error("The other member could not be identified, so a durable member block was not created.");
  }
  return otherId;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const session = body?.native_session as NativeSession | undefined;
    const token = String(body?.thread_token || "").trim();
    if (!session?.user_id || (!session?.token && !session?.cookie)) {
      return jsonResponse({ ok: false, error: "Native session required" }, 401);
    }
    if (!token) return jsonResponse({ ok: false, error: "Conversation token required" }, 400);

    const user = await fetchUserBySession(session);
    if (!user?.user_id) return jsonResponse({ ok: false, error: "Native session expired" }, 401);

    const userTokens = participantTokens(user!, session);
    let selectedThreadToken = token;
    let appThread: AppNativeThread | undefined;
    let bdThread: BdRow | undefined;

    if (token.startsWith("app:")) {
      appThread = await getAppThread(token, user!.user_id);
      const mirrored = String(appThread.bd_thread_token || "").trim();
      if (mirrored) bdThread = await fetchThreadByToken(mirrored);
    } else {
      bdThread = await fetchThreadByToken(token);
      if (!bdThread || !threadHasParticipant(bdThread, userTokens)) {
        return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
      }
      appThread = await getAppThreadByBdToken(token, user!.user_id);
    }

    const reporterId = String(user!.user_id);
    const blockedMemberId = await resolveBlockedMemberId(
      reporterId,
      userTokens,
      token,
      appThread,
      bdThread,
    );
    const memberIds = [reporterId, blockedMemberId].sort((left, right) => left < right ? -1 : 1);
    const block = await upsertChatMemberBlock(reporterId, blockedMemberId, token);
    await recordReport(
      token,
      reporterId,
      memberIds[0],
      memberIds[1],
      appThread,
      bdThread,
      block.created_at,
    );
    let websiteCloseQueued = false;
    let websiteCloseDelivered = false;
    const knownBdThreadToken = String(
      threadToken(bdThread || {}) || appThread?.bd_thread_token || "",
    ).trim();
    if (bdThread && knownBdThreadToken) {
      const closeResult = await runDurableClose(
        () => enqueueCloseOutbox(knownBdThreadToken, String(bdThread?.thread_id || "")),
        () => closeBdThread(bdThread!),
        (row) => markOutboxSent(row.id),
      );
      websiteCloseQueued = true;
      websiteCloseDelivered = closeResult.delivered;
      if (!closeResult.delivered) {
        console.error("BD chat close queued for retry", {
          thread_token: knownBdThreadToken,
          error: closeResult.error instanceof Error
            ? closeResult.error.message
            : String(closeResult.error),
        });
      }
      selectedThreadToken = knownBdThreadToken;
    } else if (knownBdThreadToken) {
      // The mirrored BD lookup can fail transiently. The token saved on the
      // app-native thread is still authoritative enough to durably queue the
      // close; the sync retry path will look the thread up again later.
      await enqueueCloseOutbox(knownBdThreadToken, "");
      websiteCloseQueued = true;
      selectedThreadToken = knownBdThreadToken;
    }

    return jsonResponse({
      ok: true,
      selected_thread_token: selectedThreadToken,
      selected_thread_reported: true,
      member_blocked: true,
      blocked_member_bd_user_id: blockedMemberId,
      report_notice: CHAT_REPORTED_NOTICE,
      website_close_queued: websiteCloseQueued,
      website_close_delivered: websiteCloseDelivered,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "Chat report failed.",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
