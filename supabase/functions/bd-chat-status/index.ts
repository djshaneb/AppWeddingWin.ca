// bd-chat-status (rebuilt): unread counts come from the Supabase chat mirror.
// The only BD traffic is the shared, budgeted mirror refresh (max ~2-4 calls
// per 20s across ALL clients), so this can never trip BD's rate limit.

import {
  activeChatBlocksForMember,
  admin,
  BdRateLimitError,
  cachedUsersByIds,
  getSessionUser,
  hasPrivateAppReviewerAccess,
  loadSharedRateLimit,
  messageIsMineInThread,
  mirrorMessagesForThreads,
  mirrorThreadsForUser,
  type NativeSession,
  otherMemberIdFromBlock,
  participantTokens,
  refreshMirrorIfStale,
  resetRateLimitFlag,
  threadIsClosed,
  threadHasParticipant,
  wasRateLimited,
} from "../_shared/bd_chat.ts";

const CHAT_INBOX_PATH = "/account/chat_messages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
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

async function countUnreadAppMessages(
  threads: AppNativeThread[],
  currentUserId: string | number,
  ignoredThreadToken = "",
) {
  const threadTokens = threads
    .filter((thread) => !String(thread.bd_thread_token || "").trim())
    .map((thread) => thread.thread_token)
    .filter(Boolean)
    .filter((token) => token !== ignoredThreadToken);
  if (!threadTokens.length) return 0;
  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("id")
    .in("thread_token", threadTokens)
    .neq("sender_bd_user_id", String(currentUserId || ""))
    .is("read_at", null)
    .is("bd_synced_at", null);
  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  resetRateLimitFlag();

  try {
    const body = await request.json().catch(() => ({}));
    const nativeSession = body?.native_session as NativeSession | undefined;
    const activeThreadToken = String(body?.active_thread_token || "").trim();

    if (!nativeSession?.user_id || (!nativeSession?.token && !nativeSession?.cookie)) {
      return jsonResponse({ ok: false, error: "Native session required" }, 401);
    }

    await loadSharedRateLimit();

    const user = await getSessionUser(nativeSession);
    if (!user?.user_id) {
      if (wasRateLimited()) {
        return jsonResponse({ ok: false, error: "Website chat status busy", retriable: true }, 429);
      }
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }
    if (
      String(user.active ?? "").trim() !== "2" &&
      !(await hasPrivateAppReviewerAccess(user.user_id))
    ) {
      return jsonResponse({ ok: false, error: "Active membership required" }, 403);
    }

    // Keep the mirror fresh so new website messages are noticed even when the
    // chat screen is closed (budgeted + cross-isolate locked).
    await refreshMirrorIfStale().catch(() => false);

    const userId = String(nativeSession.user_id);
    const tokens = participantTokens(user, nativeSession);
    const threads = await mirrorThreadsForUser(tokens, userId);
    const appThreads = await listAppThreadsForUser(userId);
    const blocks = await activeChatBlocksForMember(userId);
    const blockedOtherIds = new Set(
      blocks.map((block) => otherMemberIdFromBlock(block, userId)).filter(Boolean),
    );
    const blockedUsers = await cachedUsersByIds([...blockedOtherIds]);
    const bdThreadIsBlocked = (thread: (typeof threads)[number]) => {
      const knownOtherId = [thread.owner_user_id, thread.responder_user_id]
        .map((value) => String(value || "").trim())
        .find((value) => value && value !== userId);
      if (knownOtherId && blockedOtherIds.has(knownOtherId)) return true;
      for (const blockedId of blockedOtherIds) {
        const cached = blockedUsers.get(blockedId);
        if (!cached) continue;
        const blockedTokens = [cached.user_id, cached.token, cached.cookie, cached.email]
          .map((value) => String(value || "").trim())
          .filter(Boolean);
        if (threadHasParticipant(thread, blockedTokens)) return true;
      }
      return false;
    };
    const appThreadIsBlocked = (thread: AppNativeThread) => {
      const otherId = thread.member_a_bd_user_id === userId
        ? thread.member_b_bd_user_id
        : thread.member_a_bd_user_id;
      return blockedOtherIds.has(otherId);
    };

    const bdThreadTokens = new Set(threads.map((thread) => thread.thread_token));
    const visibleAppThreads = appThreads.filter((thread) => {
      const mirroredToken = String(thread.bd_thread_token || "").trim();
      return !mirroredToken || !bdThreadTokens.has(mirroredToken);
    });

    const reportMap = await listThreadReportsByTokens([
      ...threads.map((thread) => thread.thread_token),
      ...visibleAppThreads.flatMap((thread) => [thread.thread_token, String(thread.bd_thread_token || "").trim()]),
    ]);

    const openBdThreads = threads.filter((thread) =>
      !threadIsClosed({ thread_status: thread.thread_status }) &&
      !bdThreadIsBlocked(thread) &&
      !reportMap.has(thread.thread_token) &&
      thread.thread_token !== activeThreadToken
    );
    const openAppThreads = visibleAppThreads.filter((thread) => {
      const mirroredToken = String(thread.bd_thread_token || "").trim();
      return !appThreadIsBlocked(thread) &&
        !reportMap.has(thread.thread_token) &&
        (!mirroredToken || !reportMap.has(mirroredToken));
    });

    const messagesByThread = await mirrorMessagesForThreads(openBdThreads.map((thread) => thread.thread_token));
    let bdUnreadCount = 0;
    for (const thread of openBdThreads) {
      const messages = messagesByThread.get(thread.thread_token) || [];
      bdUnreadCount += messages.filter((message) =>
        !messageIsMineInThread(message, thread, tokens, userId) &&
        String(message.message_status || "0") === "0"
      ).length;
    }
    const appUnreadCount = await countUnreadAppMessages(openAppThreads, userId, activeThreadToken);
    const unreadCount = bdUnreadCount + appUnreadCount;

    return jsonResponse({
      ok: true,
      unread_count: unreadCount,
      total_count: threads.length + visibleAppThreads.length,
      sync_available: true,
      sync_detail: "",
      latest_label: unreadCount > 0
        ? `${unreadCount} new message${unreadCount === 1 ? "" : "s"} waiting`
        : "No new messages",
      inbox_path: CHAT_INBOX_PATH,
    });
  } catch (error) {
    if (error instanceof BdRateLimitError) {
      return jsonResponse({ ok: false, error: "Website chat status busy", retriable: true }, 429);
    }
    return jsonResponse({
      ok: false,
      error: "Website chat status unavailable",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
