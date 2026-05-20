import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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
type PushTokenRow = {
  id: string;
  bd_member_id: string;
  bd_member_token: string;
  expo_push_token: string;
  last_unread_count: number;
};

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

function firstRow(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdRow) : undefined;
  }
  return message && typeof message === "object" ? (message as BdRow) : undefined;
}

function buildListPath(model: string, params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => search.set(key, String(value)));
  return `/api/v2/${model}/get?${search.toString()}`;
}

async function callBd(path: string) {
  if (!BD_API_KEY) throw new Error("BD_API_KEY is not configured");
  const response = await fetch(`${BD_API_BASE_URL}${path}`, {
    headers: { "X-Api-Key": BD_API_KEY },
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

async function fetchFullBdUserById(userId: string) {
  const fullUser = await callBd(`/api/v2/user/get/${encodeURIComponent(userId)}`);
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return firstRow(fullUser.body.message);
  }
  return undefined;
}

function participantTokens(user: BdRow, bdMemberId: string, bdMemberToken: string) {
  return [...new Set([
    user.token,
    bdMemberToken,
    user.cookie,
    user.user_id,
    bdMemberId,
    user.email,
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

async function listChatThreads(tokens: string[]) {
  const byToken = new Map<string, BdRow>();
  const attempts: string[] = [];

  for (const token of tokens.slice(0, 2)) {
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

  for (const path of attempts) {
    const result = await callBd(path);
    if (!result.response.ok || result.body.status !== "success") continue;

    for (const thread of rowsFromMessage(result.body.message)) {
      if (!threadBelongsToUser(thread, tokens)) continue;
      const key = String(thread.thread_token || thread.thread_id || "");
      if (key) byToken.set(key, thread);
    }
  }

  return [...byToken.values()];
}

async function countUnreadMessages(threads: BdRow[], tokens: string[]) {
  const threadTokens = new Set(
    threads.map((thread) => String(thread.thread_token || "").trim()).filter(Boolean),
  );
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

async function sendExpoPushNotifications(rows: PushTokenRow[], unreadCount: number) {
  if (!rows.length || unreadCount <= 0) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(rows.map((row) => ({
      to: row.expo_push_token,
      sound: "default",
      title: "New WeddingWin message",
      body: unreadCount === 1
        ? "You have a new message."
        : `You have ${unreadCount} new messages.`,
      data: { screen: "chat" },
    }))),
  }).catch(() => undefined);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const { data: tokenRows, error } = await admin
      .from("app_push_tokens")
      .select("id, bd_member_id, bd_member_token, expo_push_token, last_unread_count")
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const byMember = new Map<string, PushTokenRow[]>();
    for (const row of (tokenRows || []) as PushTokenRow[]) {
      if (!row.bd_member_id || !row.expo_push_token) continue;
      const existing = byMember.get(row.bd_member_id) || [];
      existing.push(row);
      byMember.set(row.bd_member_id, existing);
    }

    let checked = 0;
    let notified = 0;

    for (const [bdMemberId, rows] of byMember) {
      const user = await fetchFullBdUserById(bdMemberId);
      if (!user) continue;

      const tokens = participantTokens(user, bdMemberId, rows[0]?.bd_member_token || "");
      const threads = await listChatThreads(tokens);
      const unreadCount = await countUnreadMessages(threads, tokens);
      const rowsToNotify = rows.filter((row) => unreadCount > Number(row.last_unread_count || 0));
      const rowIds = rows.map((row) => row.id).filter(Boolean);

      checked += 1;

      if (rowsToNotify.length) {
        await sendExpoPushNotifications(rowsToNotify, unreadCount);
        notified += rowsToNotify.length;
      }

      if (rowIds.length) {
        await admin
          .from("app_push_tokens")
          .update({
            last_unread_count: unreadCount,
            last_notified_at: rowsToNotify.length ? new Date().toISOString() : undefined,
            updated_at: new Date().toISOString(),
          })
          .in("id", rowIds);
      }
    }

    return jsonResponse({ ok: true, checked, notified });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "Push sweep failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
