// bd-chat-sync (rebuilt): the app reads and writes the Supabase chat mirror.
// Sends are written to bd_chat_outbox and pushed to BD in the background, so
// the app responds instantly and never fails on BD's API rate limit.

import {
  activeChatBlocksForMember,
  admin,
  appUnreadCountsForThreads,
  assertChatMemberPairAllowed,
  avatarUrlFromBdUser,
  BD_API_BASE_URL,
  BdRateLimitError,
  type BdRow,
  bdFetchUserById,
  bdFetchUserByProfilePath,
  bdFindUserByParticipant,
  cachedUsersByIds,
  cachedUserTitle,
  callBd,
  chatImageAllowedAt,
  CHAT_IMAGES_DISABLED_NOTICE,
  CHAT_IMAGES_ENABLED,
  ChatImageSharingDisabledError,
  displayNameFromParts,
  ensureThreadBackfilled,
  enqueueCloseOutbox,
  enqueueOutbox,
  filterChatTextForDisplay,
  firstRow,
  flushOutbox,
  getSessionUser,
  hasPrivateAppReviewerAccess,
  imageUrlsFromHtml,
  loadSharedRateLimit,
  markMirrorThreadRead,
  messageIsMineInThread,
  type MirrorMessage,
  type MirrorThread,
  mirrorMessagesForThreads,
  mirrorUnreadOwnerCountsForThreads,
  mirrorThreadByToken,
  mirrorThreadsForUser,
  type NativeSession,
  ChatMemberBlockedError,
  ObjectionableChatContentError,
  CHAT_MEMBER_BLOCKED_NOTICE,
  type ChatMemberBlock,
  type OutboxRow,
  otherParticipantValue,
  otherMemberIdFromBlock,
  participantTokens,
  pendingSendsForThreads,
  persistThreadIdentitiesFromSession,
  privateAppReviewerPairAllowed,
  randomToken,
  rateLimitedNow,
  refreshMirrorIfStale,
  resetRateLimitFlag,
  shortError,
  sharedCacheGet,
  sharedCacheSet,
  stripHtml,
  threadHasParticipant,
  threadIsClosed,
  threadMatchesUser,
  timeValue,
  userSideOfThread,
  upsertChatMemberBlock,
  validateMessage,
  wasRateLimited,
} from "../_shared/bd_chat.ts";
import {
  containsInlineImagePayload,
  filterMessagesAtOrBeforeReport,
  matchingParticipantIdentity,
  sumUnreadOwnerCounts,
  validateChatImageDataUri,
  validateDecodedChatImageDataUri,
} from "../_shared/chat_moderation.ts";
import { recipientCanReceiveChat } from "../_shared/chat_membership.ts";
import {
  EMAIL_CONFIRMATION_NOTICE,
  loadMemberEmailVerification,
  MemberEmailVerificationUnavailableError,
} from "../_shared/member_email_verification.ts";

const CHAT_REPORTED_NOTICE = CHAT_MEMBER_BLOCKED_NOTICE;
const CHAT_PERMISSION_ENDPOINTS = [
  "/api/v2/chat_message_threads/get",
  "/api/v2/chat_message_threads/create",
  "/api/v2/chat_message_threads/update",
  "/api/v2/chat_message_items/get",
  "/api/v2/chat_message_items/create",
  "/api/v2/chat_message_items/update",
  "/api/v2/subscription_types/get",
];

const CHAT_PLAN_CACHE_TTL_MS = 5 * 60_000;

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
  bd_sync_error?: string | null;
  client_message_id?: string | null;
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

class ChatPolicyError extends Error {
  constructor(message: string, readonly status = 403) {
    super(message);
    this.name = "ChatPolicyError";
  }
}

function enabledPlanFlag(value: unknown) {
  return String(value ?? "").trim() === "1";
}

async function chatPlanForUser(user: BdRow) {
  const planId = String(user.subscription_id || "").trim();
  if (!planId) throw new ChatPolicyError("This membership does not have private messaging access.");

  const cacheKey = `bd:chat-plan:${planId}`;
  const cached = await sharedCacheGet<BdRow>(cacheKey);
  if (cached && String(cached.subscription_id || "").trim() === planId) return cached;

  const path = `/api/v2/subscription_types/get/${encodeURIComponent(planId)}`;
  const result = await callBd(path);
  const plan = result.response.ok && result.body.status === "success"
    ? firstRow(result.body.message)
    : undefined;
  if (!plan || String(plan.subscription_id || "").trim() !== planId) {
    throw new ChatPolicyError("This membership's private messaging permissions could not be verified.");
  }
  await sharedCacheSet(cacheKey, plan, CHAT_PLAN_CACHE_TTL_MS);
  return plan;
}

async function assertActiveChatMember(user: BdRow | undefined, label: "account" | "recipient") {
  if (!user?.user_id) {
    throw new ChatPolicyError(
      label === "account"
        ? "This account is not active, so private messages are unavailable."
        : "This member is not currently available for private messages.",
    );
  }
  if (String(user.active ?? "").trim() === "2") return false;
  if (await hasPrivateAppReviewerAccess(user.user_id)) return true;
  throw new ChatPolicyError(
    label === "account"
      ? "This account is not active, so private messages are unavailable."
      : "This member is not currently available for private messages.",
  );
}

async function assertCurrentUserCanSend(user: BdRow) {
  await assertActiveChatMember(user, "account");
  const plan = await chatPlanForUser(user);
  if (!enabledPlanFlag(plan.enable_direct_messages)) {
    throw new ChatPolicyError("Your membership plan does not allow private messages.");
  }
}

async function assertTargetCanReceive(user: BdRow | undefined, currentUser: BdRow) {
  const currentUserIsPrivateReviewer = String(currentUser.active ?? "").trim() !== "2";
  const targetIsPrivateReviewer = await assertActiveChatMember(user, "recipient");
  if (
    (currentUserIsPrivateReviewer || targetIsPrivateReviewer) &&
    !(await privateAppReviewerPairAllowed(currentUser.user_id, user?.user_id))
  ) {
    throw new ChatPolicyError("This private reviewer account can only message its paired reviewer account.");
  }
  const plan = targetIsPrivateReviewer ? undefined : await chatPlanForUser(user!);
  if (!recipientCanReceiveChat(plan, targetIsPrivateReviewer)) {
    throw new ChatPolicyError("This member is not accepting private messages.");
  }
}

async function verifiedChatTargetById(userId: unknown, currentUser: BdRow) {
  const id = String(userId || "").trim();
  if (!id) throw new ChatPolicyError("The message recipient could not be verified.");
  const target = await bdFetchUserById(id);
  if (!target?.user_id || String(target.user_id) !== id) {
    throw new ChatPolicyError("The message recipient could not be verified.");
  }
  await assertTargetCanReceive(target, currentUser);
  return target;
}

async function verifiedChatTargetForThread(
  thread: MirrorThread,
  userTokens: string[],
  userId: string,
  currentUser: BdRow,
) {
  const knownId = otherUserIdForThread(thread, userTokens, userId);
  if (knownId) return await verifiedChatTargetById(knownId, currentUser);

  const participant = otherParticipantValue(thread, userTokens);
  const target = participant ? await bdFindUserByParticipant(participant) : undefined;
  if (!target?.user_id || String(target.user_id) === userId) {
    throw new ChatPolicyError("The message recipient could not be verified.");
  }
  await assertTargetCanReceive(target, currentUser);
  return target;
}

function appImageUrls(value: unknown) {
  return Array.isArray(value) ? value.map((url) => String(url || "").trim()).filter(Boolean) : [];
}

function safeChatImageUrls(value: unknown, createdAt: unknown) {
  if (!chatImageAllowedAt(createdAt)) return [];
  return appImageUrls(value).filter((url) => {
    if (/^data:image\//i.test(url)) {
      try {
        validateChatImageDataUri(url);
        return true;
      } catch {
        return false;
      }
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" &&
        (parsed.hostname === "weddingwin.ca" ||
          parsed.hostname.endsWith(".weddingwin.ca") ||
          parsed.hostname === "managemydirectory.com" ||
          parsed.hostname.endsWith(".managemydirectory.com"));
    } catch {
      return false;
    }
  });
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
  await assertChatMemberPairAllowed(memberA, memberB);
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
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return ((data || []) as AppNativeMessage[]).reverse();
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

function normalizedClientMessageId(value: unknown) {
  const clientMessageId = String(value || "").trim();
  if (!clientMessageId) return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(clientMessageId)) {
    throw new ChatPolicyError("Invalid client message identifier.", 400);
  }
  return clientMessageId;
}

async function existingAppClientMessage(
  token: string,
  userId: unknown,
  clientMessageId: string,
) {
  if (!clientMessageId) return undefined;
  const { data, error } = await admin
    .from("app_native_chat_messages")
    .select("*")
    .eq("thread_token", token)
    .eq("sender_bd_user_id", String(userId || ""))
    .eq("client_message_id", clientMessageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as AppNativeMessage | undefined;
}

async function sendAppMessage(
  token: string,
  userId: unknown,
  content: string,
  imageDataUri = "",
  clientMessageId = "",
) {
  const { clean, image } = validateMessage(content, imageDataUri);
  const existing = await existingAppClientMessage(token, userId, clientMessageId);
  if (existing) return existing;
  const { data, error } = await admin.from("app_native_chat_messages").insert({
    thread_token: token,
    sender_bd_user_id: String(userId || ""),
    message_content: clean,
    image_urls: image ? [image] : [],
    client_message_id: clientMessageId || null,
  }).select("*").single();
  if (error) {
    if (clientMessageId && String(error.code || "") === "23505") {
      const raced = await existingAppClientMessage(token, userId, clientMessageId);
      if (raced) return raced;
    }
    throw new Error(error.message);
  }
  await admin.from("app_native_chat_threads").update({ updated_at: new Date().toISOString() }).eq("thread_token", token);
  return data as AppNativeMessage;
}

async function enqueueIdempotentSend(row: Partial<OutboxRow>, clientMessageId: string) {
  const findExisting = async () => {
    const { data, error } = await admin
      .from("bd_chat_outbox")
      .select("*")
      .eq("kind", "send")
      .eq("message_token", clientMessageId)
      .eq("thread_token", String(row.thread_token || ""))
      .eq("sender_bd_user_id", String(row.sender_bd_user_id || ""))
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as OutboxRow | undefined;
  };

  const existing = await findExisting();
  if (existing) return existing;
  try {
    return await enqueueOutbox({
      ...row,
      kind: "send",
      message_token: clientMessageId,
    });
  } catch (error) {
    const raced = await findExisting();
    if (raced) return raced;
    throw error;
  }
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
  memberA: string,
  memberB: string,
  appThread?: AppNativeThread,
  bdThreadToken = "",
  bdThreadId = "",
  reportCutoff: unknown = new Date().toISOString(),
) {
  const aliases = [...new Set([
    token,
    String(appThread?.thread_token || "").trim(),
    String(appThread?.bd_thread_token || "").trim(),
    bdThreadToken,
  ].filter(Boolean))];
  if (!aliases.length) throw new Error("Conversation token required");
  const cutoffValue = String(reportCutoff || "").trim();
  const cutoffTime = Date.parse(cutoffValue);
  if (!Number.isFinite(cutoffTime)) throw new Error("A valid report cutoff is required");
  const reportedAt = new Date(cutoffTime).toISOString();
  const rows = aliases.map((alias) => ({
    thread_token: alias,
    app_thread_token: String(appThread?.thread_token || "").trim() || null,
    bd_thread_token: String(appThread?.bd_thread_token || bdThreadToken || "").trim() || null,
    reporter_bd_user_id: String(reporterId || ""),
    member_a_bd_user_id: memberA,
    member_b_bd_user_id: memberB,
    status: "reported",
    notice: CHAT_REPORTED_NOTICE,
    reported_at: reportedAt,
  }));
  const { error } = await admin
    .from("app_chat_thread_reports")
    .upsert(rows, { onConflict: "thread_token" });
  if (error) throw new Error(error.message);
  let reportCloseQueued = false;
  if (bdThreadToken) {
    await enqueueCloseOutbox(bdThreadToken, bdThreadId);
    reportCloseQueued = true;
  }
  return reportCloseQueued;
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
    content: filterChatTextForDisplay(stripHtml(message.message_content)),
    image_urls: safeChatImageUrls(imageUrlsFromHtml(message.message_content), message.bd_created_at),
    avatar_url: mine ? ownAvatar : otherAvatar,
    created_at: String(message.bd_created_at || ""),
    delivery_state: "delivered",
    delivery_error: "",
  };
}

function pendingMessageDto(row: OutboxRow, userId: unknown, ownAvatar = "") {
  const deliveryError = String(row.last_error || "");
  const paused = /^Delivery paused:/i.test(deliveryError);
  const failed = Number(row.attempts || 0) >= 10 && !paused;
  return {
    id: `pending:${row.id}`,
    thread_token: String(row.thread_token || ""),
    owner: String(row.owner_identity || row.sender_bd_user_id || ""),
    is_mine: String(row.sender_bd_user_id || "") === String(userId || ""),
    status: 0,
    content: filterChatTextForDisplay(String(row.content || "")),
    image_urls: safeChatImageUrls(row.image_data_uri ? [String(row.image_data_uri)] : [], row.created_at),
    avatar_url: ownAvatar,
    created_at: String(row.created_at || ""),
    delivery_state: failed ? "failed" : "queued",
    delivery_error: deliveryError,
  };
}

function appMessageDto(message: AppNativeMessage, userId: unknown, ownAvatar = "", otherAvatar = "") {
  const mine = String(message.sender_bd_user_id || "") === String(userId || "");
  const deliveryError = String(message.bd_sync_error || "");
  const failed = /^Delivery stopped(?: after \d+ attempts)?:/i.test(deliveryError);
  return {
    id: String(message.id || ""),
    thread_token: String(message.thread_token || ""),
    owner: String(message.sender_bd_user_id || ""),
    is_mine: mine,
    status: message.read_at ? 1 : 0,
    content: filterChatTextForDisplay(String(message.message_content || "")),
    image_urls: safeChatImageUrls(message.image_urls, message.created_at),
    avatar_url: mine ? ownAvatar : otherAvatar,
    created_at: String(message.created_at || ""),
    delivery_state: message.bd_synced_at ? "delivered" : failed ? "failed" : "stored",
    delivery_error: deliveryError,
  };
}

function visibleMirrorMessages(messages: MirrorMessage[], report?: AppChatThreadReport) {
  const beforeCutoff = filterMessagesAtOrBeforeReport(
    messages,
    (message) => message.bd_created_at,
    report?.reported_at,
  );
  return beforeCutoff.filter((message) => {
    const rawContent = String(message.message_content || "");
    const rawText = stripHtml(message.message_content);
    const hasImage = /<img\b/i.test(rawContent) || containsInlineImagePayload(rawContent);
    const visibleImages = safeChatImageUrls(imageUrlsFromHtml(rawContent), message.bd_created_at);
    return !!filterChatTextForDisplay(rawText) || !hasImage || visibleImages.length > 0;
  });
}

function visiblePendingMessages(messages: OutboxRow[], report?: AppChatThreadReport) {
  const beforeCutoff = filterMessagesAtOrBeforeReport(
    messages,
    (message) => message.created_at,
    report?.reported_at,
  );
  return beforeCutoff.filter((message) => {
    const rawText = String(message.content || "").trim();
    const hasImage = !!String(message.image_data_uri || "").trim() || containsInlineImagePayload(rawText);
    const visibleImages = safeChatImageUrls(message.image_data_uri ? [message.image_data_uri] : [], message.created_at);
    return !!filterChatTextForDisplay(rawText) || !hasImage || visibleImages.length > 0;
  });
}

function visibleAppMessages(messages: AppNativeMessage[], report?: AppChatThreadReport) {
  const beforeCutoff = filterMessagesAtOrBeforeReport(
    messages,
    (message) => message.created_at,
    report?.reported_at,
  );
  return beforeCutoff.filter((message) => {
    const rawText = String(message.message_content || "").trim();
    const hasImage = appImageUrls(message.image_urls).length > 0 || containsInlineImagePayload(rawText);
    return !!filterChatTextForDisplay(rawText) || !hasImage || safeChatImageUrls(message.image_urls, message.created_at).length > 0;
  });
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

async function resolveOtherUserIdForThread(
  thread: MirrorThread,
  userTokens: string[],
  userId: string,
) {
  const known = otherUserIdForThread(thread, userTokens, userId);
  if (known) return known;
  const participant = otherParticipantValue(thread, userTokens);
  const other = participant ? await bdFindUserByParticipant(participant) : undefined;
  const otherId = String(other?.user_id || "").trim();
  return otherId && otherId !== userId ? otherId : "";
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
  const appLinkedBdTokenSet = new Set(
    appThreads
      .map((thread) => String(thread.bd_thread_token || "").trim())
      .filter(Boolean),
  );
  const visibleAppThreads = appThreads.filter((thread) => {
    const mirrored = String(thread.bd_thread_token || "").trim();
    return !mirrored || !bdTokenSet.has(mirrored);
  });

  const activeBlocks = await activeChatBlocksForMember(userId);
  const blockByOtherMemberId = new Map<string, ChatMemberBlock>();
  for (const block of activeBlocks) {
    const otherId = otherMemberIdFromBlock(block, userId);
    if (otherId) blockByOtherMemberId.set(otherId, block);
  }
  const blockedUsersById = await cachedUsersByIds([...blockByOtherMemberId.keys()]);
  const blockForBdThread = (thread: MirrorThread) => {
    const knownOtherId = otherUserIdForThread(thread, userTokens, userId);
    const knownBlock = blockByOtherMemberId.get(knownOtherId);
    if (knownBlock) return knownBlock;

    for (const [blockedId, block] of blockByOtherMemberId) {
      const cached = blockedUsersById.get(blockedId);
      if (!cached) continue;
      const blockedTokens = [cached.user_id, cached.token, cached.cookie, cached.email]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      if (threadHasParticipant(thread, blockedTokens)) return block;
    }
    return undefined;
  };
  const blockForAppThread = (thread: AppNativeThread) =>
    blockByOtherMemberId.get(otherAppMemberId(thread, userId));

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
  const [messagesByThread, unreadOwnersByThread, appUnreadByThread] = await Promise.all([
    mirrorMessagesForThreads(threadTokens),
    mirrorUnreadOwnerCountsForThreads(threadTokens),
    appUnreadCountsForThreads(
      visibleAppThreads.map((thread) => thread.thread_token),
      userId,
    ),
  ]);

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
  let reportCloseQueued = false;

  // Repair the rare partial-write case where the report committed but the
  // close-row insert failed. A later read recreates the durable close intent;
  // enqueueCloseOutbox deduplicates any row that is already pending.
  for (const thread of visibleBdThreads) {
    if (reportMap.has(thread.thread_token) && !threadIsClosed(thread)) {
      await enqueueCloseOutbox(thread.thread_token, String(thread.thread_id || ""));
      reportCloseQueued = true;
    }
  }

  // A website user can create a fresh BD token after an older token was
  // reported. Convert every newly observed token for an active blocked pair
  // into a closed report alias and queue a website close exactly once.
  for (const thread of visibleBdThreads) {
    const block = blockForBdThread(thread);
    if (!block || reportMap.has(thread.thread_token)) continue;
    const linkedApp = appThreads.find((row) => String(row.bd_thread_token || "").trim() === thread.thread_token);
    reportCloseQueued = (await recordThreadReport(
      thread.thread_token,
      block.blocked_by_bd_user_id,
      block.member_a_bd_user_id,
      block.member_b_bd_user_id,
      linkedApp,
      thread.thread_token,
      String(thread.thread_id || ""),
      block.created_at,
    )) || reportCloseQueued;
    const blockedReport: AppChatThreadReport = {
      thread_token: thread.thread_token,
      app_thread_token: linkedApp?.thread_token || null,
      bd_thread_token: thread.thread_token,
      status: "reported",
      notice: block.notice || CHAT_REPORTED_NOTICE,
      reported_at: block.created_at,
    };
    reportMap.set(thread.thread_token, blockedReport);
    if (linkedApp?.thread_token) reportMap.set(linkedApp.thread_token, blockedReport);
  }

  for (const thread of visibleAppThreads) {
    const block = blockForAppThread(thread);
    if (!block || reportMap.has(thread.thread_token)) continue;
    const bdToken = String(thread.bd_thread_token || "").trim();
    const bdThread = bdToken
      ? visibleBdThreads.find((row) => row.thread_token === bdToken)
      : undefined;
    reportCloseQueued = (await recordThreadReport(
      thread.thread_token,
      block.blocked_by_bd_user_id,
      block.member_a_bd_user_id,
      block.member_b_bd_user_id,
      thread,
      bdToken,
      String(bdThread?.thread_id || thread.bd_thread_id || ""),
      block.created_at,
    )) || reportCloseQueued;
    const blockedReport: AppChatThreadReport = {
      thread_token: thread.thread_token,
      app_thread_token: thread.thread_token,
      bd_thread_token: thread.bd_thread_token || null,
      status: "reported",
      notice: block.notice || CHAT_REPORTED_NOTICE,
      reported_at: block.created_at,
    };
    reportMap.set(thread.thread_token, blockedReport);
    if (bdToken) reportMap.set(bdToken, blockedReport);
  }

  // Resolve display identities from the users cache (no BD calls).
  const idsToResolve = [
    ...visibleBdThreads.map((thread) => otherUserIdForThread(thread, userTokens, userId)),
    ...visibleAppThreads.map((thread) => otherAppMemberId(thread, userId)),
  ].filter(Boolean);
  const usersById = await cachedUsersByIds(idsToResolve);

  const bdSummaries = visibleBdThreads
    .map((thread) => {
      const token = thread.thread_token;
      const report = reportMap.get(token);
      const mirrorMessages = visibleMirrorMessages(messagesByThread.get(token) || [], report);
      const pending = visiblePendingMessages(pendingByThread.get(token) || [], report);
      // App-created conversations are durable as soon as their BD link is
      // persisted. Keep those linked threads visible before the first message;
      // unrelated historical empty BD rows remain suppressed.
      if (
        !mirrorMessages.length &&
        !pending.length &&
        token !== selectedToken &&
        !appLinkedBdTokenSet.has(token) &&
        !report
      ) return undefined;
      const closed = !!report || threadIsClosed({ thread_status: thread.thread_status });
      const otherId = otherUserIdForThread(thread, userTokens, userId);
      const otherUser = otherId ? usersById.get(otherId) : undefined;
      const last = mirrorMessages[mirrorMessages.length - 1];
      const lastPending = pending[pending.length - 1];
      const lastContent = lastPending
        ? filterChatTextForDisplay(String(lastPending.content || "")) || (safeChatImageUrls(lastPending.image_data_uri ? [lastPending.image_data_uri] : [], lastPending.created_at).length ? "[Image]" : "Tap to start the conversation")
        : filterChatTextForDisplay(stripHtml(last?.message_content)) || (safeChatImageUrls(imageUrlsFromHtml(last?.message_content), last?.bd_created_at).length ? "[Image]" : "Tap to start the conversation");
      const unread = closed ? 0 : sumUnreadOwnerCounts(
        unreadOwnersByThread.get(token) || [],
        (row) => messageIsMineInThread(row, thread, userTokens, userId),
      );
      return {
        id: String(thread.thread_id || token),
        token,
        thread_id: String(thread.thread_id || ""),
        request_uri: String(thread.request_uri || ""),
        title: cachedUserTitle(otherUser) || mirrorThreadTitleFallback(thread),
        avatar_url: otherUser?.avatar_url || "",
        subtitle: closed ? (report?.notice || CHAT_REPORTED_NOTICE) : lastContent,
        updated_at: String(lastPending?.created_at || last?.bd_created_at || report?.reported_at || thread.bd_updated_at || thread.bd_created_at || ""),
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
    const messages = visibleAppMessages(await listAppMessages(thread.thread_token), report);
    const last = messages[messages.length - 1];
    const images = safeChatImageUrls(last?.image_urls, last?.created_at);
    const unread = closed ? 0 : appUnreadByThread.get(thread.thread_token) || 0;
    return {
      id: String(thread.thread_token || ""),
      token: String(thread.thread_token || ""),
      thread_id: String(thread.bd_thread_id || ""),
      request_uri: String(thread.request_uri || ""),
      title: cachedUserTitle(otherUser) || "WeddingWin Member",
      avatar_url: otherUser?.avatar_url || "",
      subtitle: closed
        ? report?.notice || CHAT_REPORTED_NOTICE
        : filterChatTextForDisplay(String(last?.message_content || "").trim()) || (images.length ? "[Image]" : "Tap to start the conversation"),
      updated_at: String(last?.created_at || report?.reported_at || thread.updated_at || thread.created_at || ""),
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
    const messages = appSummary?._messages || visibleAppMessages(
      await listAppMessages(selectedToken).catch(() => []),
      selectedReport,
    );
    messageDtos = messages.map((message) => appMessageDto(message, userId, ownAvatar, otherAvatar));
  } else if (selectedToken) {
    const thread = bdThreads.find((row) => row.thread_token === selectedToken) || await mirrorThreadByToken(selectedToken);
    if (thread) {
      // One-time history pull when a thread is opened the first time.
      await ensureThreadBackfilled(thread);
      const allMirrorMessages =
        (await mirrorMessagesForThreads([selectedToken], 12)).get(selectedToken) || [];
      const mirrorMessages = visibleMirrorMessages(allMirrorMessages, selectedReport);
      const otherId = otherUserIdForThread(thread, userTokens, userId);
      const otherUser = otherId ? (usersById.get(otherId) || (await cachedUsersByIds([otherId])).get(otherId)) : undefined;
      const otherAvatar = otherUser?.avatar_url || "";
      const allPending = pendingByThread.get(selectedToken) ||
        (await pendingSendsForThreads([selectedToken], mirrorMessageTokens)).get(selectedToken) || [];
      const pending = visiblePendingMessages(allPending, selectedReport);
      messageDtos = [
        ...mirrorMessages.map((message) => mirrorMessageDto(message, thread, userTokens, userId, ownAvatar, otherAvatar)),
        ...pending.map((row) => pendingMessageDto(row, userId, ownAvatar)),
      ];

      // App messages queued for this BD thread but not confirmed by BD yet
      // still need to show instantly.
      const linkedApp = appThreads.find((row) => String(row.bd_thread_token || "").trim() === selectedToken);
      if (linkedApp) {
        const appMessages = await listAppMessages(linkedApp.thread_token).catch(() => [] as AppNativeMessage[]);
        const unsynced = visibleAppMessages(
          appMessages.filter((message) => !message.bd_synced_at),
          selectedReport,
        );
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
    appSummaries.reduce((sum, summary) => sum + (summary.closed ? 0 : summary.unread_count), 0);

  return [{
    ok: true,
    threads: allSummaries,
    selected_thread_token: selectedToken,
    selected_thread_reported: selectedClosed,
    report_notice: selectedClosed ? selectedReport?.notice || CHAT_REPORTED_NOTICE : "",
    // Bound every response even when a mirrored website conversation has a
    // long photo history. The current native UI intentionally shows the most
    // recent messages rather than returning an unbounded inline-media payload.
    messages: messageDtos.slice(-12),
    unread_count: unreadTotal,
    chat_images_enabled: CHAT_IMAGES_ENABLED,
    chat_images_notice: CHAT_IMAGES_ENABLED ? "" : CHAT_IMAGES_DISABLED_NOTICE,
    sync_debug: {
      member_id: userId,
      bd_threads: bdThreads.length,
      app_threads: appThreads.length,
      visible_app_threads: visibleAppThreads.length,
    },
  }, reportCloseQueued] as const;
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

    const authenticatedUser = await getSessionUser(session);
    if (!authenticatedUser?.user_id) {
      if (wasRateLimited()) return busyResponse();
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }
    const authenticatedUserId = String(authenticatedUser.user_id || "").trim();
    const user = await bdFetchUserById(authenticatedUserId);
    if (!user?.user_id || String(user.user_id) !== String(authenticatedUser.user_id)) {
      return jsonResponse({ ok: false, error: "Native session expired" }, 401);
    }
    await assertActiveChatMember(user, "account");
    const emailVerification = await loadMemberEmailVerification(user.user_id, user.email);
    if (emailVerification.email_confirmation_required) {
      return jsonResponse({ ok: false, code: "email_confirmation_required", error: EMAIL_CONFIRMATION_NOTICE,
        ...emailVerification }, 428);
    }
    if (action === "send" || action === "open_vendor_profile") {
      await assertCurrentUserCanSend(user);
    }
    const userId = String(user.user_id || "");
    const userTokens = participantTokens(user, session);
    let selectedThread = String(body?.thread_token || "");
    let sendDeliveryState: "stored" | "delivered" | "queued" | "failed" | undefined;
    let sendDeliveryError = "";

    // Keep the mirror fresh (budgeted; max ~2-4 BD calls, shared across all
    // clients via a cross-isolate lock).
    await refreshMirrorIfStale().catch(() => false);

    if (action === "open_vendor_profile") {
      const profilePath = normalizeProfilePath(body?.connect_url || body?.profile_url);
      if (!profilePath) return jsonResponse({ ok: false, error: "Vendor profile URL required" }, 400);

      // Never authorize a cached profile snapshot: resolve the current BD
      // member and current plan policy before opening a conversation.
      const vendor = await bdFetchUserByProfilePath(profilePath).catch((error) => {
        if (error instanceof BdRateLimitError) throw error;
        return undefined;
      });
      if (!vendor?.user_id) return jsonResponse({ ok: false, error: "Vendor profile was not found" }, 404);
      const vendorId = String(vendor.user_id);
      if (vendorId === userId) {
        return jsonResponse({ ok: false, error: "You cannot message your own listing from the app." }, 400);
      }
      await assertTargetCanReceive(vendor, user);
      await assertChatMemberPairAllowed(userId, vendorId);
      const vendorTokens = participantTokens(vendor, {
        user_id: vendor.user_id as string | number,
        token: String(vendor.token || ""),
        cookie: String(vendor.cookie || ""),
        email: String(vendor.email || ""),
      });
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
        selectedThread = appThread.thread_token;
      }
    }

    if (action === "report") {
      const token = String(body?.thread_token || "").trim();
      if (!token) return jsonResponse({ ok: false, error: "Conversation token required" }, 400);
      selectedThread = token;

      if (isAppThread(token)) {
        const appThread = await getAppThread(token, userId);
        const blockedMemberId = otherAppMemberId(appThread, userId);
        const block = await upsertChatMemberBlock(userId, blockedMemberId, token);
        const bdToken = String(appThread.bd_thread_token || "").trim();
        const bdThread = bdToken ? await mirrorThreadByToken(bdToken) : undefined;
        await recordThreadReport(
          token,
          userId,
          appThread.member_a_bd_user_id,
          appThread.member_b_bd_user_id,
          appThread,
          bdToken,
          String(bdThread?.thread_id || ""),
          block.created_at,
        );
        if (bdToken) selectedThread = bdToken;
      } else {
        const thread = await mirrorThreadByToken(token);
        if (!thread || !threadMatchesUser(thread, userTokens, userId)) {
          return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
        }
        const blockedMemberId = await resolveOtherUserIdForThread(thread, userTokens, userId);
        if (!blockedMemberId) {
          return jsonResponse({ ok: false, error: "The other member could not be identified for blocking." }, 409);
        }
        const [memberA, memberB] = sortedMemberIds(userId, blockedMemberId);
        const block = await upsertChatMemberBlock(userId, blockedMemberId, token);
        await recordThreadReport(
          token,
          userId,
          memberA,
          memberB,
          undefined,
          thread.thread_token,
          String(thread.thread_id || ""),
          block.created_at,
        );
      }
      if (!rateLimitedNow()) await flushOutbox(4).catch(() => 0);
    }

    if (action === "send") {
      const token = String(body?.thread_token || "").trim();
      if (!token) return jsonResponse({ ok: false, error: "Conversation token required" }, 400);
      const content = String(body?.message || "");
      const imageDataUri = String(body?.image_data_uri || "");
      let clientMessageId = "";
      try {
        clientMessageId = normalizedClientMessageId(body?.client_message_id);
        if (imageDataUri) await validateDecodedChatImageDataUri(imageDataUri);
        validateMessage(content, imageDataUri);
      } catch (error) {
        if (
          error instanceof ChatPolicyError ||
          error instanceof ChatImageSharingDisabledError ||
          error instanceof ObjectionableChatContentError
        ) throw error;
        throw new ChatPolicyError(
          error instanceof Error ? error.message : "The photo could not be validated.",
          400,
        );
      }
      const effectiveClientMessageId = clientMessageId || randomToken();

      if (isAppThread(token)) {
        const appThread = await getAppThread(token, userId);
        const targetId = otherAppMemberId(appThread, userId);
        await assertChatMemberPairAllowed(userId, targetId);
        await verifiedChatTargetById(targetId, user);
        const reportMap = await listThreadReportsByTokens([token, String(appThread.bd_thread_token || "").trim()]);
        const report = reportMap.get(token) || reportMap.get(String(appThread.bd_thread_token || "").trim());
        if (report) return jsonResponse(chatReportedPayload(report), 423);
        // The database trigger commits a per-message website-delivery outbox
        // row in the same transaction as this message insert.
        await sendAppMessage(
          token,
          userId,
          content,
          imageDataUri,
          effectiveClientMessageId,
        );
        selectedThread = token;
        // App-native messages are durable and visible to the recipient as soon
        // as this insert commits, even if the website mirror is still queued.
        sendDeliveryState = "stored";
        if (!rateLimitedNow()) await flushOutbox(8).catch(() => 0);
      } else {
        const thread = await mirrorThreadByToken(token);
        const reportMap = await listThreadReportsByTokens([token]);
        const report = reportMap.get(token);
        if (report || (thread && threadIsClosed({ thread_status: thread.thread_status }))) {
          return jsonResponse(chatReportedPayload(report), 423);
        }
        if (!thread || !threadMatchesUser(thread, userTokens, userId)) {
          return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
        }
        const target = await verifiedChatTargetForThread(thread, userTokens, userId, user);
        await assertChatMemberPairAllowed(userId, target.user_id);
        // Send as the identity BD already has for the user's side of this
        // thread, so the website renders the message on the correct side even
        // after the user's login token has rotated.
        const ownerIdentity = (() => {
          const side = userSideOfThread(thread, userTokens, userId);
          const sideSource = side === "responder" ? thread.thread_responders : thread.thread_owner;
          const tokenMatch = matchingParticipantIdentity(sideSource, userTokens);
          const firstIdentity = String(sideSource || "").split(",").map((part) => part.trim()).find(Boolean);
          return tokenMatch || firstIdentity || String(session.token || session.cookie || userId);
        })();
        const queuedSend = await enqueueIdempotentSend({
          thread_token: token,
          sender_bd_user_id: userId,
          owner_identity: ownerIdentity,
          content,
          image_data_uri: imageDataUri || null,
        }, effectiveClientMessageId);
        selectedThread = token;

        // Try to push to BD right away; if BD is busy the message stays queued
        // and the background refresh delivers it.
        if (!rateLimitedNow()) await flushOutbox(8).catch(() => 0);
        const { data: deliveryRow } = await admin
          .from("bd_chat_outbox")
          .select("sent_at,attempts,last_error")
          .eq("id", queuedSend.id)
          .maybeSingle();
        const deliveryPaused = /^Delivery paused:/i.test(String(deliveryRow?.last_error || ""));
        sendDeliveryState = deliveryRow?.sent_at
          ? "delivered"
          : Number(deliveryRow?.attempts || 0) >= 10 && !deliveryPaused
            ? "failed"
            : "queued";
        sendDeliveryError = String(deliveryRow?.last_error || "");
      }
    }

    if (action === "read" || action === "send" || action === "open_vendor_profile") {
      const token = action === "open_vendor_profile"
        ? selectedThread.trim()
        : String(body?.thread_token || "").trim();
      let readReceiptQueued = false;
      if (token) {
        try {
          if (isAppThread(token)) {
            const appThread = await getAppThread(token, userId);
            const mirrored = String(appThread.bd_thread_token || "").trim();
            if (mirrored) readReceiptQueued = await markMirrorThreadRead(mirrored, userTokens, userId);
            await markAppRead(token, userId);
          } else {
            const thread = await mirrorThreadByToken(token);
            if (!thread || !threadMatchesUser(thread, userTokens, userId)) {
              return jsonResponse({ ok: false, error: "Conversation was not found for this account." }, 404);
            }
            readReceiptQueued = await markMirrorThreadRead(token, userTokens, userId);
          }
        } catch (error) {
          console.error("Chat mark-read failed", shortError(error));
        }
      }
      if (readReceiptQueued && !rateLimitedNow()) {
        await flushOutbox(4).catch((error) =>
          console.error("Chat read-receipt flush failed", shortError(error))
        );
      }
    }

    const [payload, reportCloseQueued] = await buildChatPayload(user, session, selectedThread);
    // Payload assembly can discover a replacement BD website token for a pair
    // that is already blocked. It durably records the alias and queues the
    // close; flush once more so that close is delivered in this same sync
    // instead of waiting for a later mirror refresh.
    if (reportCloseQueued && !rateLimitedNow()) {
      await flushOutbox(4).catch((error) =>
        console.error("Chat report close flush failed", shortError(error))
      );
    }
    console.info("bd-chat-sync result", {
      action,
      member_id: payload.sync_debug.member_id,
      bd_threads: payload.sync_debug.bd_threads,
      app_threads: payload.sync_debug.app_threads,
      selected_thread: payload.selected_thread_token ? "yes" : "no",
    });
    return jsonResponse(sendDeliveryState
      ? {
          ...payload,
          send_delivery_state: sendDeliveryState,
          send_delivery_error: sendDeliveryError,
        }
      : payload);
  } catch (error) {
    if (error instanceof MemberEmailVerificationUnavailableError) {
      return jsonResponse({ ok: false, code: "email_verification_unavailable", error: error.message, retriable: true }, 503);
    }
    if (error instanceof BdRateLimitError) {
      return busyResponse();
    }
    if (error instanceof ChatPolicyError) {
      return jsonResponse({ ok: false, error: error.message }, error.status);
    }
    if (error instanceof ChatMemberBlockedError) {
      return jsonResponse({
        ok: false,
        error: error.message,
        report_notice: error.message,
        selected_thread_reported: true,
      }, error.status);
    }
    if (error instanceof ObjectionableChatContentError) {
      return jsonResponse({ ok: false, error: error.message, content_filtered: true }, error.status);
    }
    if (error instanceof ChatImageSharingDisabledError) {
      return jsonResponse({
        ok: false,
        error: error.message,
        chat_images_enabled: false,
        chat_images_notice: CHAT_IMAGES_DISABLED_NOTICE,
      }, error.status);
    }
    return jsonResponse({
      ok: false,
      error: "Website chat sync unavailable",
      detail: error instanceof Error ? error.message : String(error),
      required_permissions: CHAT_PERMISSION_ENDPOINTS,
    }, 500);
  }
});
