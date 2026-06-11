import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CHAT_INBOX_PATH = "/account/chat_messages";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
type AppNativeThread = {
  thread_token: string;
  member_a_bd_user_id: string;
  member_b_bd_user_id: string;
  bd_thread_token?: string | null;
};
type AppChatThreadReport = {
  thread_token: string;
  app_thread_token?: string | null;
  bd_thread_token?: string | null;
};

function chatPermissionError(path: string, message: unknown) {
  const endpoint = path.split("?")[0];
  const reason = typeof message === "string" ? message : "API key permission denied";
  return `${reason}. Enable ${endpoint} in BD Admin > Developer Hub > API key permissions.`;
}

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

function rowsFromMessage(message: unknown): BdRow[] {
  return Array.isArray(message)
    ? message.filter((row): row is BdRow => row !== null && typeof row === "object")
    : [];
}

function buildListPath(model: string, params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => search.set(key, String(value)));
  return `/api/v2/${model}/get?${search.toString()}`;
}

function unwrapBdUser(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdRow) : undefined;
  }

  return message && typeof message === "object" ? (message as BdRow) : undefined;
}

function nativeSessionMatchesBdUser(session: NativeSession, user: BdRow | undefined) {
  if (!user?.user_id || String(user.user_id) !== String(session.user_id || "")) {
    return false;
  }

  const sessionToken = String(session.token || "").trim();
  const userToken = String(user.token || "").trim();
  const sessionCookie = String(session.cookie || "").trim();
  const userCookie = String(user.cookie || "").trim();
  return (sessionToken && userToken && sessionToken === userToken) ||
    (sessionCookie && userCookie && sessionCookie === userCookie);
}

function nativeSessionCanRefreshBdUser(session: NativeSession, user: BdRow | undefined) {
  if (nativeSessionMatchesBdUser(session, user)) return true;
  if (!user?.user_id || String(user.user_id) !== String(session.user_id || "")) {
    return false;
  }

  const sessionEmail = String(session.email || "").trim().toLowerCase();
  const userEmail = String(user.email || "").trim().toLowerCase();
  const hadIssuedSecret =
    String(session.token || "").trim().length >= 16 ||
    String(session.cookie || "").trim().length >= 16;

  return hadIssuedSecret && !!sessionEmail && sessionEmail === userEmail;
}

async function callBd(path: string, init: RequestInit = {}) {
  if (!BD_API_KEY) {
    throw new Error("BD_API_KEY is not configured");
  }

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

async function fetchBdUserByNativeSession(session: NativeSession) {
  const userId = String(session.user_id || "").trim();
  const sessionLookups = [
    ["token", String(session.token || "").trim()],
    ["cookie", String(session.cookie || "").trim()],
  ] as const;

  for (const [property, value] of sessionLookups) {
    if (!value) continue;
    const result = await callBd(buildListPath("user", {
      limit: 1,
      property,
      property_value: value,
      property_operator: "eq",
    }));
    const user = result.response.ok && result.body.status === "success"
      ? rowsFromMessage(result.body.message)[0]
      : undefined;
    if (user?.user_id && String(user.user_id) === userId) return user;
  }

  const user = await fetchFullBdUserById(session.user_id);
  return nativeSessionCanRefreshBdUser(session, user) ? user : undefined;
}

function participantTokens(user: BdRow, session: NativeSession) {
  return [...new Set([
    user.user_id,
    session.user_id,
    user.email,
    session.email,
    user.token,
    session.token,
    user.cookie,
    session.cookie,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function rowIncludesToken(rowValue: unknown, tokens: string[]) {
  const value = String(rowValue || "");
  return tokens.some((token) => token && value.includes(token));
}

function threadBelongsToUser(thread: BdRow, tokens: string[]) {
  return (
    rowIncludesToken(thread.thread_owner, tokens) ||
    rowIncludesToken(thread.thread_responders, tokens)
  );
}

function threadToken(thread: BdRow) {
  return String(thread.thread_token || "").trim();
}

function threadIsClosed(thread: BdRow) {
  const status = String(thread.thread_status ?? "").trim().toLowerCase();
  return status === "0" || status === "closed";
}

async function listThreadReportsByTokens(tokens: string[]) {
  const uniqueTokens = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))];
  const byToken = new Map<string, AppChatThreadReport>();
  if (!uniqueTokens.length) return byToken;
  const { data, error } = await admin
    .from("app_chat_thread_reports")
    .select("thread_token, app_thread_token, bd_thread_token")
    .in("thread_token", uniqueTokens)
    .neq("status", "resolved");
  if (error) return byToken;
  for (const report of (data || []) as AppChatThreadReport[]) {
    for (const alias of [report.thread_token, report.app_thread_token, report.bd_thread_token]) {
      const clean = String(alias || "").trim();
      if (clean && !byToken.has(clean)) byToken.set(clean, report);
    }
  }
  return byToken;
}

async function listChatThreads(tokens: string[]) {
  const byToken = new Map<string, BdRow>();
  const attempts: string[] = [];

  for (const token of tokens.slice(0, 4)) {
    attempts.push(
      buildListPath("chat_message_threads", {
        limit: 100,
        property: "thread_owner",
        property_value: token,
        property_operator: "eq",
        order_column: "updated_at",
        order_type: "DESC",
      }),
      buildListPath("chat_message_threads", {
        limit: 100,
        property: "thread_responders",
        property_value: token,
        property_operator: "eq",
        order_column: "updated_at",
        order_type: "DESC",
      }),
    );
  }

  let permissionError = "";
  for (const path of attempts) {
    const result = await callBd(path);
    const message = result.body.message;
    if (result.response.status === 401 || result.response.status === 403) {
      permissionError = chatPermissionError(path, message);
      continue;
    }
    if (!result.response.ok || result.body.status !== "success") continue;

    for (const thread of rowsFromMessage(message)) {
      if (!threadBelongsToUser(thread, tokens)) continue;
      const key = String(thread.thread_token || thread.thread_id || "");
      if (key) byToken.set(key, thread);
    }
  }

  if (byToken.size === 0 && permissionError) {
    throw new Error(permissionError);
  }

  return [...byToken.values()].sort((a, b) =>
    String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")),
  );
}

async function countUnreadMessages(threads: BdRow[], tokens: string[], ignoredThreadToken = "") {
  const threadTokens = new Set(
    threads.map((thread) => String(thread.thread_token || "").trim()).filter(Boolean),
  );
  if (ignoredThreadToken) threadTokens.delete(ignoredThreadToken);
  if (threadTokens.size === 0) return 0;

  const result = await callBd(
    buildListPath("chat_message_items", {
      limit: 100,
      property: "message_status",
      property_value: 0,
      property_operator: "eq",
      order_column: "created_at",
      order_type: "DESC",
    }),
  );

  if (!result.response.ok || result.body.status !== "success") return 0;

  return rowsFromMessage(result.body.message).filter((message) => {
    const threadToken = String(message.thread_token || "").trim();
    const owner = String(message.message_owner || "");
    const mine = tokens.some((token) => token && owner.includes(token));
    return threadTokens.has(threadToken) && !mine;
  }).length;
}

function isAppNativeThreadToken(value: unknown) {
  return String(value || "").startsWith("app:");
}

async function listAppThreadsForUser(currentUserId: string | number) {
  const id = String(currentUserId || "").trim();
  if (!id) return [];

  const { data, error } = await admin
    .from("app_native_chat_threads")
    .select("thread_token, member_a_bd_user_id, member_b_bd_user_id, bd_thread_token")
    .or(`member_a_bd_user_id.eq.${id},member_b_bd_user_id.eq.${id}`)
    .limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as AppNativeThread[];
}

async function countUnreadAppMessages(
  threads: AppNativeThread[],
  currentUserId: string | number,
  ignoredThreadToken = "",
) {
  const threadTokens = threads
    .filter((thread) => !String(thread.bd_thread_token || "").trim())
    .map((thread) => thread.thread_token)
    .filter(Boolean);
  const activeThreadToken = isAppNativeThreadToken(ignoredThreadToken) ? ignoredThreadToken : "";
  const countableTokens = activeThreadToken
    ? threadTokens.filter((threadToken) => threadToken !== activeThreadToken)
    : threadTokens;
  if (countableTokens.length === 0) return 0;

  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("id")
    .in("thread_token", countableTokens)
    .neq("sender_bd_user_id", String(currentUserId || ""))
    .is("read_at", null)
    .is("bd_synced_at", null);
  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}

async function sendExpoPushNotifications(bdMemberId: string, unreadCount: number) {
  const { data: rows, error } = await admin
    .from("app_push_tokens")
    .select("id, expo_push_token, last_unread_count")
    .eq("bd_member_id", bdMemberId)
    .eq("enabled", true);

  if (error || !rows?.length) return;

  const rowsToNotify = rows.filter((row) => unreadCount > Number(row.last_unread_count || 0));
  const allIds = rows.map((row) => row.id).filter(Boolean);

  if (unreadCount <= 0) {
    if (allIds.length) {
      await admin
        .from("app_push_tokens")
        .update({ last_unread_count: 0, updated_at: new Date().toISOString() })
        .in("id", allIds);
    }
    return;
  }

  if (!rowsToNotify.length) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(rowsToNotify.map((row) => ({
      to: row.expo_push_token,
      sound: "default",
      title: "New WeddingWin message",
      body: unreadCount === 1
        ? "You have a new message."
        : `You have ${unreadCount} new messages.`,
      data: { screen: "chat" },
    }))),
  }).catch(() => undefined);

  await admin
    .from("app_push_tokens")
    .update({
      last_unread_count: unreadCount,
      last_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", rowsToNotify.map((row) => row.id).filter(Boolean));
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
    const activeThreadToken = String(body?.active_thread_token || "").trim();

    if (!nativeSession?.user_id || (!nativeSession?.token && !nativeSession?.cookie)) {
      return jsonResponse({ ok: false, error: "Native session required" }, 401);
    }

    const user = await fetchBdUserByNativeSession(nativeSession);
    if (!user?.user_id) {
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }

    const tokens = participantTokens(user!, nativeSession);
    let threads: BdRow[] = [];
    let appThreads: AppNativeThread[] = [];
    let bdSyncDetail = "";
    let appSyncDetail = "";

    try {
      threads = await listChatThreads(tokens);
    } catch (error) {
      bdSyncDetail = error instanceof Error ? error.message : String(error);
    }
    try {
      appThreads = await listAppThreadsForUser(nativeSession.user_id);
    } catch (error) {
      appSyncDetail = error instanceof Error ? error.message : String(error);
    }

    const syncDetail = bdSyncDetail || appSyncDetail;
    const bdThreadTokens = new Set(
      threads.map((thread) => String(thread.thread_token || "").trim()).filter(Boolean),
    );
    const visibleAppThreads = appThreads.filter((thread) => {
      const mirroredToken = String(thread.bd_thread_token || "").trim();
      return !mirroredToken || !bdThreadTokens.has(mirroredToken);
    });
    const reportMap = await listThreadReportsByTokens([
      ...threads.map((thread) => threadToken(thread)),
      ...visibleAppThreads.flatMap((thread) => [
        thread.thread_token,
        String(thread.bd_thread_token || "").trim(),
      ]),
    ]);
    const openBdThreads = threads.filter((thread) => !threadIsClosed(thread) && !reportMap.has(threadToken(thread)));
    const openAppThreads = visibleAppThreads.filter((thread) => {
      const mirroredToken = String(thread.bd_thread_token || "").trim();
      return !reportMap.has(thread.thread_token) && (!mirroredToken || !reportMap.has(mirroredToken));
    });
    const bdUnreadCount = bdSyncDetail ? 0 : await countUnreadMessages(openBdThreads, tokens, activeThreadToken);
    const appUnreadCount = appSyncDetail
      ? 0
      : await countUnreadAppMessages(openAppThreads, nativeSession.user_id, activeThreadToken);
    const unreadCount = bdUnreadCount + appUnreadCount;
    if (!activeThreadToken) {
      await sendExpoPushNotifications(String(nativeSession.user_id), unreadCount);
    }

    return jsonResponse({
      ok: true,
      unread_count: unreadCount,
      total_count: threads.length + visibleAppThreads.length,
      sync_available: !syncDetail,
      sync_detail: syncDetail,
      latest_label:
        unreadCount > 0
          ? `${unreadCount} new message${unreadCount === 1 ? "" : "s"} waiting`
          : syncDetail
            ? "Open website messages"
            : "No new messages",
      inbox_path: CHAT_INBOX_PATH,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "Website chat status unavailable",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
