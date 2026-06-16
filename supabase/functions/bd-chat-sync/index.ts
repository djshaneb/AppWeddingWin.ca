// bd-chat-sync (rebuilt): the app reads and writes the Supabase chat mirror.
// Sends are written to bd_chat_outbox and pushed to BD in the background, so
// the app responds instantly and never fails on BD's API rate limit.

import {
  admin,
  avatarUrlFromBdUser,
  BD_API_BASE_URL,
  BdRateLimitError,
  type BdRow,
  bdFetchUserByProfilePath,
  cachedUsersByIds,
  cachedUserTitle,
  displayNameFromParts,
  ensureThreadBackfilled,
  enqueueOutbox,
  flushOutbox,
  getSessionUser,
  imageUrlsFromHtml,
  loadSharedRateLimit,
  markMirrorThreadRead,
  messageIsMineInThread,
  type MirrorMessage,
  type MirrorThread,
  mirrorMessagesForThreads,
  mirrorThreadByToken,
  mirrorThreadsForUser,
  type NativeSession,
  type OutboxRow,
  participantTokens,
  pendingSendsForThreads,
  persistThreadIdentitiesFromSession,
  randomToken,
  rateLimitedNow,
  refreshMirrorIfStale,
  resetRateLimitFlag,
  shortError,
  stripHtml,
  threadHasParticipant,
  threadIsClosed,
  threadMatchesUser,
  timeValue,
  userSideOfThread,
  validateMessage,
  wasRateLimited,
} from "../_shared/bd_chat.ts";

const CHAT_REPORTED_NOTICE = "Chat Reported: This conversation will remain closed while it's being reviewed.";
const CHAT_PERMISSION_ENDPOINTS = [
  "/api/v2/chat_message_threads/get",
  "/api/v2/chat_message_threads/create",
  "/api/v2/chat_message_threads/update",
  "/api/v2/chat_message_items/get",
  "/api/v2/chat_message_items/create",
  "/api/v2/chat_message_items/update",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
  bd_synced_at?: string | null;
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

function busyResponse() {
  return jsonResponse({
    ok: false,
    error: "Messages are busy right now. Please try again in a moment.",
    retriable: true,
  }, 429);
}

function isAppThread(value: unknown) {
  return String(value || "").startsWith("app:");
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

function appImageUrls(value: unknown) {
  return Array.isArray(value) ? value.map((url) => String(url || "").trim()).filter(Boolean) : [];
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

// ---------------------------------------------------------------------------
// App-side (Supabase-only) threads
// ---------------------------------------------------------------------------

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

async function ensureAppThread(currentUser: BdRow, vendor: { user_id: unknown }, profilePath: string) {
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

async function listAppMessages(token: string) {
  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("*")
    .eq("thread_token", token)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as AppNativeMessage[];
}

async function markAppRead(token: string, userId: unknown) {
  const { error } = await admin
    .from("app_native_chat_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_token", token)
    .neq("sender_bd_user_id", String(userId || ""))
    .is("read_at", null);
  if (error) throw new Error(error.message);
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

async function sendAppMessage(token: string, userId: unknown, content: string, imageDataUri = "") {
  const { clean, image } = validateMessage(content, imageDataUri);
  const { data, error } = await admin.from("app_native_chat_messages").insert({
    thread_token: token,
    sender_bd_user_id: String(userId || ""),
    message_content: clean,
    image_urls: image ? [image] : [],
  }).select("*").single();
  if (error) throw new Error(error.message);
  await admin.from("app_native_chat_threads").update({ updated_at: new Date().toISOString() }).eq("thread_token", token);
  return data as AppNativeMessage;
}

async function enqueueAppThreadMirror(appThread: AppNativeThread, senderId: unknown) {
  const { data } = await admin
    .from("bd_chat_outbox")
    .select("id")
    .eq("kind", "mirror_app_thread")
    .eq("app_thread_token", appThread.thread_token)
    .is("sent_at", null)
    .limit(1);
  if (Array.isArray(data) && data.length) return;
  await enqueueOutbox({
    kind: "mirror_app_thread",
    thread_token: appThread.thread_token,
    app_thread_token: appThread.thread_token,
    sender_bd_user_id: String(senderId || ""),
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

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

async function recordThreadReport(
  token: string,
  reporterId: unknown,
  appThread?: AppNativeThread,
  bdThreadToken = "",
  bdThreadId = "",
) {
  const aliases = [...new Set([
    token,
    String(appThread?.thread_token || "").trim(),
    String(appThread?.bd_thread_token || "").trim(),
    bdThreadToken,
  ].filter(Boolean))];
  if (!aliases.length) throw new Error("Conversation token required");
  const now = new Date().toISOString();
  const rows = aliases.map((alias) => ({
    thread_token: alias,
    app_thread_token: String(appThread?.thread_token || "").trim() || null,
    bd_thread_token: String(appThread?.bd_thread_token || bdThreadToken || "").trim() || null,
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
  if (bdThreadToken) {
    await enqueueOutbox({ kind: "close", thread_token: bdThreadToken, payload: { thread_id: bdThreadId } });
  }
}

function chatReportedPayload(report?: AppChatThreadReport) {
  return {
    ok: false,
    error: report?.notice || CHAT_REPORTED_NOTICE,
    report_notice: report?.notice || CHAT_REPORTED_NOTICE,
    selected_thread_reported: true,
  };
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

function mirrorMessageDto(
  message: MirrorMessage,
  thread: MirrorThread | undefined,
  userTokens: string[],
  userId: string,
  ownAvatar = "",
  otherAvatar = "",
) {
  const owner = String(message.message_owner || "");
  const mine = messageIsMineInThread(message, thread, userTokens, userId);
  return {
    id: String(message.message_id || message.message_token || ""),
    thread_token: String(message.thread_token || ""),
    owner,
    is_mine: mine,
    status: Number(message.message_status || 0),
    content: stripHtml(message.message_content),
    image_urls: imageUrlsFromHtml(message.message_content),
    avatar_url: mine ? ownAvatar : otherAvatar,
    created_at: String(message.bd_created_at || ""),
  };
}

function pendingMessageDto(row: OutboxRow, userId: unknown, ownAvatar = "") {
  return {
    id: `pending:${row.id}`,
    thread_token: String(row.thread_token || ""),
    owner: String(row.owner_identity || row.sender_bd_user_id || ""),
    is_mine: String(row.sender_bd_user_id || "") === String(userId || ""),
    status: 0,
    content: String(row.content || ""),
    image_urls: row.image_data_uri ? [String(row.image_data_uri)] : [],
    avatar_url: ownAvatar,
    created_at: String(row.created_at || ""),
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

function mirrorThreadTitleFallback(thread: MirrorThread) {
  const raw = thread.raw || {};
  const rawTitle = String((raw as Record<string, unknown>).chat_with_name || (raw as Record<string, unknown>).thread_title || "").trim();
  if (rawTitle && !/^\d+$/.test(rawTitle) && rawTitle.length < 80) return rawTitle;
  return "WeddingWin Member";
}

function otherUserIdForThread(thread: MirrorThread, userTokens: string[], userId: string) {
  const viewerIsOwner = userSideOfThread(thread, userTokens, userId) !== "responder";
  const primary = viewerIsOwner ? thread.responder_user_id : thread.owner_user_id;
  const secondary = viewerIsOwner ? thread.owner_user_id : thread.responder_user_id;
  const primaryClean = String(primary || "").trim();
  if (primaryClean && primaryClean !== userId) return primaryClean;
  const secondaryClean = String(secondary || "").trim();
  if (secondaryClean && secondaryClean !== userId) return secondaryClean;
  return "";
}

// ---------------------------------------------------------------------------
// Payload assembly (Supabase only; zero BD calls except optional backfill)
// ---------------------------------------------------------------------------

async function buildChatPayload(
  user: BdRow,
  session: NativeSession,
  requestedThread: string,
) {
  const userId = String(user.user_id || "");
  const userTokens = participantTokens(user, session);
  const ownAvatar = avatarUrlFromBdUser(user);

  const bdThreads = await mirrorThreadsForUser(userTokens, userId);
  await persistThreadIdentitiesFromSession(bdThreads, userTokens, userId);
  const appThreads = await listAppThreads(userId);
  const bdTokenSet = new Set(bdThreads.map((thread) => thread.thread_token));
  const visibleAppThreads = appThreads.filter((thread) => {
    const mirrored = String(thread.bd_thread_token || "").trim();
    return !mirrored || !bdTokenSet.has(mirrored);
  });

  // If the app asked for an app:* thread that has since been mirrored to a BD
  // thread we know about, follow it.
  let selectedToken = String(requestedThread || "").trim();
  if (isAppThread(selectedToken)) {
    const appThread = appThreads.find((thread) => thread.thread_token === selectedToken);
    const mirrored = String(appThread?.bd_thread_token || "").trim();
    if (mirrored && bdTokenSet.has(mirrored)) selectedToken = mirrored;
  }

  const visibleBdThreads = bdThreads.slice(0, 50);
  const threadTokens = visibleBdThreads.map((thread) => thread.thread_token);
  const messagesByThread = await mirrorMessagesForThreads(threadTokens);

  const mirrorMessageTokens = new Set<string>();
  for (const list of messagesByThread.values()) {
    for (const message of list) {
      const token = String(message.message_token || "").trim();
      if (token) mirrorMessageTokens.add(token);
    }
  }
  const pendingByThread = await pendingSendsForThreads(threadTokens, mirrorMessageTokens);

  const reportMap = await listThreadReportsByTokens([
    ...threadTokens,
    ...visibleAppThreads.flatMap((thread) => [thread.thread_token, String(thread.bd_thread_token || "").trim()]),
  ]);

  // Resolve display identities from the users cache (no BD calls).
  const idsToResolve = [
    ...visibleBdThreads.map((thread) => otherUserIdForThread(thread, userTokens, userId)),
    ...visibleAppThreads.map((thread) => otherAppMemberId(thread, userId)),
  ].filter(Boolean);
  const usersById = await cachedUsersByIds(idsToResolve);

  const bdSummaries = visibleBdThreads
    .map((thread) => {
      const token = thread.thread_token;
      const mirrorMessages = messagesByThread.get(token) || [];
      const pending = pendingByThread.get(token) || [];
      if (!mirrorMessages.length && !pending.length && token !== selectedToken) return undefined;
      const report = reportMap.get(token);
      const closed = !!report || threadIsClosed({ thread_status: thread.thread_status });
      const otherId = otherUserIdForThread(thread, userTokens, userId);
      const otherUser = otherId ? usersById.get(otherId) : undefined;
      const last = mirrorMessages[mirrorMessages.length - 1];
      const lastPending = pending[pending.length - 1];
      const lastContent = lastPending
        ? String(lastPending.content || "") || "[Image]"
        : stripHtml(last?.message_content) || (imageUrlsFromHtml(last?.message_content).length ? "[Image]" : "Tap to start the conversation");
      const unread = closed ? 0 : mirrorMessages.filter((message) =>
        !messageIsMineInThread(message, thread, userTokens, userId) &&
        String(message.message_status || "0") === "0"
      ).length;
      return {
        id: String(thread.thread_id || token),
        token,
        thread_id: String(thread.thread_id || ""),
        request_uri: String(thread.request_uri || ""),
        title: cachedUserTitle(otherUser) || mirrorThreadTitleFallback(thread),
        avatar_url: otherUser?.avatar_url || "",
        subtitle: closed ? (report?.notice || CHAT_REPORTED_NOTICE) : lastContent,
        updated_at: String(lastPending?.created_at || last?.bd_created_at || thread.bd_updated_at || thread.bd_created_at || ""),
        unread_count: unread,
        reported: closed,
        closed,
        report_notice: closed ? report?.notice || CHAT_REPORTED_NOTICE : "",
      };
    })
    .filter((summary): summary is NonNullable<typeof summary> => !!summary);

  const appSummaries = await Promise.all(visibleAppThreads.slice(0, 50).map(async (thread) => {
    const report = reportMap.get(thread.thread_token) || reportMap.get(String(thread.bd_thread_token || "").trim());
    const closed = !!report;
    const otherUser = usersById.get(otherAppMemberId(thread, userId));
    const messages = await listAppMessages(thread.thread_token);
    const last = messages[messages.length - 1];
    const images = appImageUrls(last?.image_urls);
    const unread = closed ? 0 : messages.filter((message) =>
      String(message.sender_bd_user_id) !== userId && !message.read_at
    ).length;
    return {
      id: String(thread.thread_token || ""),
      token: String(thread.thread_token || ""),
      thread_id: String(thread.bd_thread_id || ""),
      request_uri: String(thread.request_uri || ""),
      title: cachedUserTitle(otherUser) || "WeddingWin Member",
      avatar_url: otherUser?.avatar_url || "",
      subtitle: closed
        ? report?.notice || CHAT_REPORTED_NOTICE
        : String(last?.message_content || "").trim() || (images.length ? "[Image]" : "Tap to start the conversation"),
      updated_at: String(last?.created_at || thread.updated_at || thread.created_at || ""),
      unread_count: unread,
      reported: closed,
      closed,
      report_notice: closed ? report?.notice || CHAT_REPORTED_NOTICE : "",
      _messages: messages,
    };
  }));

  const allSummaries = [
    ...bdSummaries,
    ...appSummaries.map(({ _messages: _ignored, ...summary }) => summary),
  ].sort((a, b) => timeValue(b.updated_at) - timeValue(a.updated_at));

  if (!selectedToken) selectedToken = String(allSummaries[0]?.token || "");

  // Selected thread messages.
  let messageDtos: ReturnType<typeof mirrorMessageDto>[] = [];
  let selectedReport = reportMap.get(selectedToken);
  let selectedClosed = !!selectedReport;
  if (selectedToken && isAppThread(selectedToken)) {
    const appSummary = appSummaries.find((summary) => summary.token === selectedToken);
    const otherUser = usersById.get(otherAppMemberId(
      appThreads.find((thread) => thread.thread_token === selectedToken) || ({} as AppNativeThread),
      userId,
    ));
    const otherAvatar = otherUser?.avatar_url || "";
    const messages = appSummary?._messages || await listAppMessages(selectedToken).catch(() => []);
    messageDtos = messages.map((message) => appMessageDto(message, userId, ownAvatar, otherAvatar));
  } else if (selectedToken) {
    const thread = bdThreads.find((row) => row.thread_token === selectedToken) || await mirrorThreadByToken(selectedToken);
    if (thread) {
      // One-time history pull when a thread is opened the first time.
      await ensureThreadBackfilled(thread);
      const refreshed = thread.backfilled_at ? messagesByThread.get(selectedToken) : undefined;
      const mirrorMessages = refreshed && refreshed.length
        ? refreshed
        : (await mirrorMessagesForThreads([selectedToken])).get(selectedToken) || [];
      const otherId = otherUserIdForThread(thread, userTokens, userId);
      const otherUser = otherId ? (usersById.get(otherId) || (await cachedUsersByIds([otherId])).get(otherId)) : undefined;
      const otherAvatar = otherUser?.avatar_url || "";
      const pending = pendingByThread.get(selectedToken) ||
        (await pendingSendsForThreads([selectedToken], mirrorMessageTokens)).get(selectedToken) || [];
      messageDtos = [
        ...mirrorMessages.map((message) => mirrorMessageDto(message, thread, userTokens, userId, ownAvatar, otherAvatar)),
        ...pending.map((row) => pendingMessageDto(row, userId, ownAvatar)),
      ];

      // App messages queued for this BD thread but not confirmed by BD yet
      // still need to show instantly.
      const linkedApp = appThreads.find((row) => String(row.bd_thread_token || "").trim() === selectedToken);
      if (linkedApp) {
        const appMessages = await listAppMessages(linkedApp.thread_token).catch(() => [] as AppNativeMessage[]);
        const unsynced = appMessages.filter((message) => !message.bd_synced_at);
        messageDtos = [
          ...messageDtos,
          ...unsynced.map((message) => appMessageDto(message, userId, ownAvatar, otherAvatar)),
        ];
      }
      selectedClosed = selectedClosed || threadIsClosed({ thread_status: thread.thread_status });
      selectedReport = selectedReport || reportMap.get(thread.thread_token);
    }
  }

  const unreadTotal =
    bdSummaries.reduce((sum, summary) => sum + (summary.closed ? 0 : summary.unread_count), 0) +
    await countUnreadAppMessages(
      visibleAppThreads.filter((thread) => !reportMap.get(thread.thread_token)),
      userId,
    );

  return {
    ok: true,
    threads: allSummaries,
    selected_thread_token: selectedToken,
    selected_thread_reported: selectedClosed,
    report_notice: selectedClosed ? selectedReport?.notice || CHAT_REPORTED_NOTICE : "",
    messages: messageDtos,
    unread_count: unreadTotal,
    sync_debug: {
      member_id: userId,
      bd_threads: bdThreads.length,
      app_threads: appThreads.length,
      visible_app_threads: visibleAppThreads.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  resetRateLimitFlag();

  try {
    const body = await request.json().catch(() => ({}));
    const session = body?.native_session as NativeSession | undefined;
    const action = String(body?.action || "list");
    if (!session?.user_id || (!session?.token && !session?.cookie)) {
      return jsonResponse({ ok: false, error: "Native session required" }, 401);
    }

    await loadSharedRateLimit();

    const user = await getSessionUser(session);
    if (!user?.user_id) {
      if (wasRateLimited()) return busyResponse();
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }
    const userId = String(user.user_id || "");
    const userTokens = participantTokens(user, session);
    let selectedThread = String(body?.thread_token || "");

    // Keep the mirror fresh (budgeted; max ~2-4 BD calls, shared across all
    // clients via a cross-isolate lock).
    await refreshMirrorIfStale().catch(() => false);

    if (action === "open_vendor_profile") {
      const profilePath = normalizeProfilePath(body?.connect_url || body?.profile_url);
      if (!profilePath) return jsonResponse({ ok: false, error: "Vendor profile URL required" }, 400);

      // Vendor from cache first, BD as fallback.
      let vendorId = "";
      let vendorTokens: string[] = [];
      const { data: cachedVendor } = await admin
        .from("bd_users_cache")
        .select("*")
        .or(`filename.eq.${profilePath},filename.eq./${profilePath}`)
        .limit(1);
      if (Array.isArray(cachedVendor) && cachedVendor[0]?.user_id) {
        const vendor = cachedVendor[0];
        vendorId = String(vendor.user_id);
        vendorTokens = [vendor.user_id, vendor.token, vendor.cookie, vendor.email]
          .map((value: unknown) => String(value || "").trim()).filter(Boolean);
      } else {
        const vendor = await bdFetchUserByProfilePath(profilePath).catch((error) => {
          if (error instanceof BdRateLimitError) throw error;
          return undefined;
        });
        if (!vendor?.user_id) return jsonResponse({ ok: false, error: "Vendor profile was not found" }, 404);
        vendorId = String(vendor.user_id);
        vendorTokens = participantTokens(vendor, {
          user_id: vendor.user_id as string | number,
          token: String(vendor.token || ""),
          cookie: String(vendor.cookie || ""),
          email: String(vendor.email || ""),
        });
      }
      if (vendorId === userId) {
        return jsonResponse({ ok: false, error: "You cannot message your own listing from the app." }, 400);
      }

      const existingThreads = await mirrorThreadsForUser(userTokens, userId);
      const existing = existingThreads.find((thread) =>
        String(thread.owner_user_id || "") === vendorId ||
        String(thread.responder_user_id || "") === vendorId ||
        threadHasParticipant(thread, vendorTokens)
      );
      if (existing) {
        selectedThread = existing.thread_token;
      } else {
        const appThread = await ensureAppThread(user, { user_id: vendorId }, profilePath);
        await enqueueAppThreadMirror(appThread, userId);
        if (!rateLimitedNow()) await flushOutbox(6).catch(() => 0);
        const refreshed = await getAppThread(appThread.thread_token, userId);
        selectedThread = String(refreshed.bd_thread_token || "").trim() || appThread.thread_token;
      }
    }

    if (action === "report") {
      const token = String(body?.thread_token || "").trim();
      if (!token) return jsonResponse({ ok: false, error: "Conversation token required" }, 400);
      selectedThread = token;

      if (isAppThread(token)) {
        const appThread = await getAppThread(token, userId);
        const bdToken = String(appThread.bd_thread_token || "").trim();
        const bdThread = bdToken ? await mirrorThreadByToken(bdToken) : undefined;
        await recordThreadReport(token, userId, appThread, bdToken, String(bdThread?.thread_id || ""));
        if (bdToken) selectedThread = bdToken;
      } else {
        const thread = await mirrorThreadByToken(token);
        if (!thread || !threadMatchesUser(thread, userTokens, userId)) {
          return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
        }
        await recordThreadReport(token, userId, undefined, thread.thread_token, String(thread.thread_id || ""));
      }
      if (!rateLimitedNow()) await flushOutbox(4).catch(() => 0);
    }

    if (action === "send") {
      const token = String(body?.thread_token || "").trim();
      if (!token) return jsonResponse({ ok: false, error: "Conversation token required" }, 400);
      const content = String(body?.message || "");
      const imageDataUri = String(body?.image_data_uri || "");
      validateMessage(content, imageDataUri);

      if (isAppThread(token)) {
        const appThread = await getAppThread(token, userId);
        const reportMap = await listThreadReportsByTokens([token, String(appThread.bd_thread_token || "").trim()]);
        const report = reportMap.get(token) || reportMap.get(String(appThread.bd_thread_token || "").trim());
        if (report) return jsonResponse(chatReportedPayload(report), 423);
        await sendAppMessage(token, userId, content, imageDataUri);
        await enqueueAppThreadMirror(appThread, userId);
        selectedThread = token;
      } else {
        const thread = await mirrorThreadByToken(token);
        const reportMap = await listThreadReportsByTokens([token]);
        const report = reportMap.get(token);
        if (report || (thread && threadIsClosed({ thread_status: thread.thread_status }))) {
          return jsonResponse(chatReportedPayload(report), 423);
        }
        if (thread && !threadMatchesUser(thread, userTokens, userId)) {
          return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
        }
        // Send as the identity BD already has for the user's side of this
        // thread, so the website renders the message on the correct side even
        // after the user's login token has rotated.
        const ownerIdentity = thread
          ? (() => {
            const side = userSideOfThread(thread, userTokens, userId);
            const sideSource = side === "responder" ? thread.thread_responders : thread.thread_owner;
            const parts = String(sideSource || "").split(",").map((part) => part.trim()).filter(Boolean);
            const tokenMatch = parts.find((part) =>
              userTokens.some((value) => value && (part === value || part.includes(value) || value.includes(part)))
            );
            return tokenMatch || parts[0] || String(session.token || session.cookie || userId);
          })()
          : String(user.token || session.token || user.cookie || session.cookie || userId || "");
        await enqueueOutbox({
          kind: "send",
          thread_token: token,
          sender_bd_user_id: userId,
          owner_identity: ownerIdentity,
          message_token: randomToken(),
          content,
          image_data_uri: imageDataUri || null,
        });
        selectedThread = token;
      }

      // Try to push to BD right away; if BD is busy the message stays queued
      // and the background refresh delivers it.
      if (!rateLimitedNow()) await flushOutbox(8).catch(() => 0);
    }

    if (action === "read" || action === "send") {
      const token = String(body?.thread_token || "").trim();
      if (token) {
        try {
          if (isAppThread(token)) {
            const appThread = await getAppThread(token, userId);
            const mirrored = String(appThread.bd_thread_token || "").trim();
            if (mirrored) await markMirrorThreadRead(mirrored, userTokens, userId);
            await markAppRead(token, userId);
          } else {
            await markMirrorThreadRead(token, userTokens, userId);
          }
        } catch (error) {
          console.error("Chat mark-read failed", shortError(error));
        }
      }
    }

    const payload = await buildChatPayload(user, session, selectedThread);
    console.info("bd-chat-sync result", {
      action,
      member_id: payload.sync_debug.member_id,
      bd_threads: payload.sync_debug.bd_threads,
      app_threads: payload.sync_debug.app_threads,
      selected_thread: payload.selected_thread_token ? "yes" : "no",
    });
    return jsonResponse(payload);
  } catch (error) {
    if (error instanceof BdRateLimitError) {
      return busyResponse();
    }
    return jsonResponse({
      ok: false,
      error: "Website chat sync unavailable",
      detail: error instanceof Error ? error.message : String(error),
      required_permissions: CHAT_PERMISSION_ENDPOINTS,
    }, 500);
  }
});
