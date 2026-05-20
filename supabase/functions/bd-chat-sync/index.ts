const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") || "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type BdEnvelope = {
  status?: string;
  message?: unknown;
  total?: string | number;
};
type BdRow = Record<string, unknown>;
type NativeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};

const CHAT_PERMISSION_ENDPOINTS = [
  "/api/v2/chat_message_threads/get",
  "/api/v2/chat_message_items/get",
  "/api/v2/chat_message_items/create",
  "/api/v2/chat_message_items/update",
];
const MAX_IMAGE_DATA_URI_LENGTH = 2_500_000;
const BD_SITE_TIME_ZONE = Deno.env.get("BD_SITE_TIME_ZONE") || "America/Toronto";

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

function firstRow(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdRow) : undefined;
  }
  return message && typeof message === "object" ? (message as BdRow) : undefined;
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

function buildListPath(model: string, params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => search.set(key, String(value)));
  return `/api/v2/${model}/get?${search.toString()}`;
}

async function fetchFullBdUserById(userId: string | number) {
  const fullUser = await callBd(`/api/v2/user/get/${encodeURIComponent(String(userId))}`);
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return firstRow(fullUser.body.message);
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

function participantTokens(user: BdRow, session: NativeSession) {
  return [...new Set([
    user.token,
    session.token,
    user.cookie,
    session.cookie,
    user.user_id,
    session.user_id,
    user.email,
    session.email,
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
    chatTimeValue(b.updated_at || b.created_at) - chatTimeValue(a.updated_at || a.created_at),
  );
}

async function listMessagesForThread(threadToken: string) {
  const result = await callBd(
    buildListPath("chat_message_items", {
      limit: 100,
      property: "thread_token",
      property_value: threadToken,
      property_operator: "eq",
      order_column: "created_at",
      order_type: "ASC",
    }),
  );

  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string"
      ? result.body.message
      : "Chat messages unavailable";
    throw new Error(
      result.response.status === 401 || result.response.status === 403
        ? chatPermissionError("/api/v2/chat_message_items/get", message)
        : message,
    );
  }

  return rowsFromMessage(result.body.message).sort((a, b) =>
    chatMessageOrderValue(a) - chatMessageOrderValue(b)
  );
}

async function findUserByToken(token: string) {
  if (!token) return undefined;
  const result = await callBd(
    buildListPath("user", {
      limit: 1,
      property: "token",
      property_value: token,
      property_operator: "eq",
    }),
  );
  if (!result.response.ok || result.body.status !== "success") return undefined;
  return rowsFromMessage(result.body.message)[0];
}

function stripHtml(value: unknown) {
  return decodeHtml(String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .trim();
}

function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|#39|nbsp|amp|lt|gt);/gi, (entity, code) => {
    const normalized = String(code).toLowerCase();
    if (normalized.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }
    if (normalized.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }
    switch (normalized) {
      case "quot":
        return "\"";
      case "apos":
      case "#39":
        return "'";
      case "nbsp":
        return " ";
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      default:
        return entity;
    }
  });
}

function extractImageUrls(value: unknown) {
  const html = String(value || "");
  const urls = new Set<string>();
  const imgTagPattern = /<img\b[^>]*>/gi;
  let imgTagMatch: RegExpExecArray | null;

  while ((imgTagMatch = imgTagPattern.exec(html))) {
    const tag = imgTagMatch[0];
    const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i) || tag.match(/\bsrc\s*=\s*([^\s>]+)/i);
    const rawSrc = srcMatch?.[2] || srcMatch?.[1] || "";
    const src = decodeHtml(rawSrc).trim();
    if (/^https?:\/\//i.test(src) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) {
      urls.add(src);
    }
  }

  return [...urls];
}

function absoluteSiteUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${BD_API_BASE_URL.replace(/\/+$/, "")}${raw}`;
  return `${BD_API_BASE_URL.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
}

function memberAvatarUrl(user: BdRow | undefined) {
  if (!user) return "";
  const candidates = [
    user.image_main_file,
    user.logo,
    user.profile_photo,
    user.cover_photo,
  ];
  const url = candidates
    .map(absoluteSiteUrl)
    .find((candidate) =>
      candidate &&
      !/profile-profile-holder\.(png|jpe?g|webp)$/i.test(candidate) &&
      !/default.*logo/i.test(candidate)
    );
  return url || "";
}

function memberDisplayName(user: BdRow | undefined) {
  return String(user?.company || "").trim() ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Conversation";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function chatTimeValue(value: unknown) {
  const raw = String(value || "").trim();
  if (/^\d{14}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6)) - 1;
    const day = Number(raw.slice(6, 8));
    const hour = Number(raw.slice(8, 10));
    const minute = Number(raw.slice(10, 12));
    const second = Number(raw.slice(12, 14));
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function chatMessageOrderValue(message: BdRow) {
  const id = Number(message.message_id || 0);
  return Number.isFinite(id) && id > 0 ? id : chatTimeValue(message.created_at);
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
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}${value("month")}${value("day")}${value("hour")}${value("minute")}${value("second")}`;
}

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownerToken(thread: BdRow, userTokens: string[]) {
  const owner = String(thread.thread_owner || "");
  if (userTokens.some((token) => token && owner.includes(token))) {
    return String(thread.thread_responders || "").split(",")[0]?.trim() || "";
  }
  return owner.split(",")[0]?.trim() || "";
}

function messageDto(
  message: BdRow,
  userTokens: string[],
  ownAvatarUrl = "",
  otherAvatarUrl = "",
) {
  const owner = String(message.message_owner || "");
  const isMine = userTokens.some((token) => token && owner.includes(token));
  const imageUrls = extractImageUrls(message.message_content);
  return {
    id: String(message.message_id || message.message_token || ""),
    thread_token: String(message.thread_token || ""),
    owner,
    is_mine: isMine,
    status: Number(message.message_status || 0),
    content: stripHtml(message.message_content),
    image_urls: imageUrls,
    avatar_url: isMine ? ownAvatarUrl : otherAvatarUrl,
    created_at: String(message.created_at || ""),
  };
}

async function threadDto(thread: BdRow, messages: BdRow[], userTokens: string[]) {
  const last = messages[messages.length - 1];
  const unreadCount = messages.filter((message) => {
    const owner = String(message.message_owner || "");
    const mine = userTokens.some((token) => token && owner.includes(token));
    return !mine && String(message.message_status || "0") === "0";
  }).length;
  const otherToken = ownerToken(thread, userTokens);
  const otherUser = await findUserByToken(otherToken).catch(() => undefined);
  const name = memberDisplayName(otherUser);

  return {
    id: String(thread.thread_id || thread.thread_token || ""),
    token: String(thread.thread_token || ""),
    title: name,
    avatar_url: memberAvatarUrl(otherUser),
    subtitle: stripHtml(last?.message_content) || (extractImageUrls(last?.message_content).length ? "[Image]" : String(thread.request_uri || "No messages yet")),
    updated_at: String(thread.updated_at || thread.created_at || ""),
    unread_count: unreadCount,
  };
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

async function markThreadRead(threadToken: string, userTokens: string[]) {
  const messages = await listMessagesForThread(threadToken);
  await Promise.all(
    messages
      .filter((message) => {
        const owner = String(message.message_owner || "");
        const mine = userTokens.some((token) => token && owner.includes(token));
        return !mine && String(message.message_status || "0") === "0";
      })
      .map((message) =>
        callBd("/api/v2/chat_message_items/update", {
          method: "PUT",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody({
            message_id: String(message.message_id || ""),
            message_status: 1,
          }),
        }).catch(() => undefined)
      ),
  );
}

async function sendMessage(threadToken: string, content: string, userToken: string, imageDataUri = "") {
  const clean = content.trim();
  const imageSrc = imageDataUri.trim();
  if (!clean && !imageSrc) throw new Error("Message required");
  if (clean.length > 2000) throw new Error("Message is too long");
  if (imageSrc) {
    if (!/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(imageSrc)) {
      throw new Error("Unsupported image format");
    }
    if (imageSrc.length > MAX_IMAGE_DATA_URI_LENGTH) {
      throw new Error("Image is too large. Please choose a smaller image.");
    }
  }

  const textHtml = clean ? `<p>${escapeHtml(clean).replace(/\r\n|\r|\n/g, "<br>")}</p>` : "";
  const imageHtml = imageSrc
    ? `<p><img src="${escapeAttribute(imageSrc)}" alt="Chat image" style="max-width:100%;height:auto;"></p>`
    : "";
  const html = `${textHtml}${imageHtml}`;
  const result = await callBd("/api/v2/chat_message_items/create", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      message_token: randomToken(),
      thread_token: threadToken,
      message_status: 0,
      message_owner: userToken,
      message_content: html,
      created_at: formatNow(),
    }),
  });

  if (!result.response.ok || result.body.status !== "success") {
    const message = typeof result.body.message === "string" ? result.body.message : "Message send failed";
    throw new Error(
      result.response.status === 401 || result.response.status === 403
        ? chatPermissionError("/api/v2/chat_message_items/create", message)
        : message,
    );
  }

  return firstRow(result.body.message);
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

    const tokens = participantTokens(user!, nativeSession);
    const primaryToken = String(user?.token || nativeSession.token || "").trim();
    const ownAvatarUrl = memberAvatarUrl(user);

    if (action === "send") {
      await sendMessage(
        String(body?.thread_token || ""),
        String(body?.message || ""),
        primaryToken,
        String(body?.image_data_uri || ""),
      );
    }

    if (action === "read" || action === "send") {
      const threadToken = String(body?.thread_token || "");
      if (threadToken) await markThreadRead(threadToken, tokens);
    }

    const threads = await listChatThreads(tokens);
    const selectedThreadToken = String(body?.thread_token || threads[0]?.thread_token || "");
    const selectedThread = threads.find((thread) =>
      String(thread.thread_token || "") === selectedThreadToken
    );
    const selectedOtherUser = selectedThread
      ? await findUserByToken(ownerToken(selectedThread, tokens)).catch(() => undefined)
      : undefined;
    const selectedOtherAvatarUrl = memberAvatarUrl(selectedOtherUser);
    const selectedMessages = selectedThreadToken
      ? await listMessagesForThread(selectedThreadToken)
      : [];
    const totalUnreadCount = await countUnreadMessages(threads, tokens);
    const threadSummaries = await Promise.all(
      threads.slice(0, 50).map(async (thread) => {
        const threadToken = String(thread.thread_token || "");
        const messages = threadToken === selectedThreadToken ? selectedMessages : [];
        return threadDto(thread, messages, tokens);
      }),
    );

    return jsonResponse({
      ok: true,
      threads: threadSummaries,
      selected_thread_token: selectedThreadToken,
      messages: selectedMessages.map((message) =>
        messageDto(message, tokens, ownAvatarUrl, selectedOtherAvatarUrl)
      ),
      unread_count: totalUnreadCount,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "Website chat sync unavailable",
        detail: error instanceof Error ? error.message : String(error),
        required_permissions: CHAT_PERMISSION_ENDPOINTS,
      },
      500,
    );
  }
});
