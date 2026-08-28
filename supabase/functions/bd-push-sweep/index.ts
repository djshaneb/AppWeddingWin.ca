import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  activeChatBlocksForMember,
  cachedUsersByIds,
  otherMemberIdFromBlock,
  rowHasToken,
  threadHasParticipant,
} from "../_shared/bd_chat.ts";
import {
  EXPO_RECEIPT_EXPIRY_MS,
  EXPO_RECEIPT_INITIAL_DELAY_MS,
  nextPushRetry,
  parseRetryAfterMs,
} from "../_shared/push_retry.ts";

const BD_API_BASE_URL = Deno.env.get("BD_API_BASE_URL") ||
  "https://www.weddingwin.ca";
const BD_API_KEY = Deno.env.get("BD_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-WeddingWin-Cron-Secret",
};

type BdEnvelope = {
  status?: string;
  message?: unknown;
  current_page?: string | number;
  total_pages?: string | number;
  next_page?: string | number | null;
};
type BdRow = Record<string, unknown>;
type PushTokenRow = {
  id: string;
  bd_member_id: string;
  bd_member_token: string;
  expo_push_token: string;
  last_unread_count: number;
  last_expo_ticket_id?: string | null;
  last_expo_ticket_at?: string | null;
  expo_receipt_expires_at?: string | null;
  push_retry_count: number;
  push_next_attempt_at?: string | null;
  push_claim_token?: string | null;
  push_registration_generation: number;
};
type ExpoDelivery = {
  row: PushTokenRow;
  accepted: boolean;
  ticketId?: string;
  errorCode?: string;
  errorMessage?: string;
  ambiguous?: boolean;
  retryable?: boolean;
  retryAfterMs?: number;
};
type AppChatThreadReport = {
  thread_token: string;
  app_thread_token?: string | null;
  bd_thread_token?: string | null;
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
    ? message.filter((row): row is BdRow =>
      row !== null && typeof row === "object"
    )
    : [];
}

function firstRow(message: unknown): BdRow | undefined {
  if (Array.isArray(message)) {
    const first = message[0];
    return first && typeof first === "object" ? (first as BdRow) : undefined;
  }
  return message && typeof message === "object"
    ? (message as BdRow)
    : undefined;
}

function buildListPath(model: string, params: Record<string, string | number>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) =>
    search.set(key, String(value))
  );
  return `/api/v2/${model}/get?${search.toString()}`;
}

const BD_PAGE_SIZE = 100;
const BD_MAX_PAGES_PER_LIST = 250;

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

async function listBdRowsPaginated(
  model: string,
  baseParams: Record<string, string | number>,
) {
  const collected: BdRow[] = [];
  const seenPages = new Set<string>();
  let page = "";

  for (let index = 0; index < BD_MAX_PAGES_PER_LIST; index += 1) {
    const params: Record<string, string | number> = {
      ...baseParams,
      limit: BD_PAGE_SIZE,
    };
    if (page) params.page = page;
    const result = await callBd(buildListPath(model, params));
    if (!result.response.ok || result.body.status !== "success") {
      throw new Error(
        `BD ${model} page failed (${result.response.status})`,
      );
    }
    collected.push(...rowsFromMessage(result.body.message));

    const currentPage = Number(result.body.current_page || index + 1);
    const hasExplicitTotal = result.body.total_pages !== undefined &&
      result.body.total_pages !== null &&
      String(result.body.total_pages).trim() !== "";
    const totalPages = Number(result.body.total_pages);
    const nextPage = String(result.body.next_page || "").trim();
    if (
      hasExplicitTotal &&
      (!Number.isFinite(currentPage) || !Number.isFinite(totalPages))
    ) {
      throw new Error(`BD ${model} pagination returned invalid page metadata`);
    }
    if (!nextPage) {
      if (hasExplicitTotal && currentPage < totalPages) {
        throw new Error(
          `BD ${model} pagination omitted next_page before its final page`,
        );
      }
      return collected;
    }
    if (hasExplicitTotal && currentPage >= totalPages) {
      throw new Error(
        `BD ${model} pagination returned next_page after its final page`,
      );
    }
    if (seenPages.has(nextPage)) {
      throw new Error(`BD ${model} pagination repeated page ${nextPage}`);
    }
    seenPages.add(nextPage);
    page = nextPage;
  }

  // Never turn a truncated result into a lower unread baseline. A later sweep
  // can retry after the dependency recovers or the page volume falls.
  throw new Error(
    `BD ${model} exceeded the safe pagination limit (${BD_MAX_PAGES_PER_LIST} pages)`,
  );
}

async function fetchFullBdUserById(userId: string) {
  const fullUser = await callBd(
    `/api/v2/user/get/${encodeURIComponent(userId)}`,
  );
  if (fullUser.response.ok && fullUser.body.status === "success") {
    return firstRow(fullUser.body.message);
  }
  return undefined;
}

function participantTokens(
  user: BdRow,
  bdMemberId: string,
  bdMemberToken: string,
) {
  return [
    ...new Set(
      [
        user.user_id,
        bdMemberId,
        user.email,
        user.token,
        bdMemberToken,
        user.cookie,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

function threadBelongsToUser(thread: BdRow, tokens: string[]) {
  return threadHasParticipant(thread, tokens);
}

function threadToken(thread: BdRow) {
  return String(thread.thread_token || "").trim();
}

function threadIsClosed(thread: BdRow) {
  const status = String(thread.thread_status ?? "").trim().toLowerCase();
  return status === "0" || status === "closed";
}

async function listThreadReportsByTokens(tokens: string[]) {
  const uniqueTokens = [
    ...new Set(tokens.map((token) => token.trim()).filter(Boolean)),
  ];
  const reported = new Set<string>();
  if (!uniqueTokens.length) return reported;
  const { data, error } = await admin
    .from("app_chat_thread_reports")
    .select("thread_token, app_thread_token, bd_thread_token")
    .in("thread_token", uniqueTokens)
    .neq("status", "resolved");
  if (error) throw new Error(`Chat report lookup failed: ${error.message}`);
  for (const report of (data || []) as AppChatThreadReport[]) {
    for (
      const alias of [
        report.thread_token,
        report.app_thread_token,
        report.bd_thread_token,
      ]
    ) {
      const clean = String(alias || "").trim();
      if (clean) reported.add(clean);
    }
  }
  return reported;
}

async function listAllChatThreads() {
  const byToken = new Map<string, BdRow>();
  const rows = await listBdRowsPaginated("chat_message_threads", {
    order_column: "updated_at",
    order_type: "DESC",
  });
  for (const thread of rows) {
    const key = String(thread.thread_token || thread.thread_id || "");
    if (key) byToken.set(key, thread);
  }
  return [...byToken.values()];
}

function chatThreadsForUser(allThreads: BdRow[], tokens: string[]) {
  return allThreads.filter((thread) => threadBelongsToUser(thread, tokens));
}

async function listUnreadMessages() {
  const rows = await listBdRowsPaginated("chat_message_items", {
    property: "message_status",
    property_value: 0,
    property_operator: "eq",
    order_column: "created_at",
    order_type: "DESC",
  });
  const byId = new Map<string, BdRow>();
  rows.forEach((message, index) => {
    const key = String(message.message_id || "").trim() ||
      `${String(message.thread_token || "")}:${
        String(message.created_at || "")
      }:${index}`;
    byId.set(key, message);
  });
  return [...byId.values()];
}

function countUnreadMessages(
  threads: BdRow[],
  tokens: string[],
  unreadMessages: BdRow[],
) {
  const threadTokens = new Set(
    threads.map((thread) => String(thread.thread_token || "").trim()).filter(
      Boolean,
    ),
  );
  if (threadTokens.size === 0) return 0;

  return unreadMessages.filter((message) => {
    const threadToken = String(message.thread_token || "").trim();
    const owner = String(message.message_owner || "");
    const mine = rowHasToken(owner, tokens);
    return threadTokens.has(threadToken) && !mine;
  }).length;
}

async function countUnsyncedNativeUnread(bdMemberId: string) {
  const { data, error } = await admin.rpc(
    "count_weddingwin_unsynced_native_unread",
    { p_bd_member_id: bdMemberId },
  );
  if (error) throw new Error(`Native unread lookup failed: ${error.message}`);
  const count = Number(data || 0);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error("Native unread lookup returned an invalid count");
  }
  return Math.floor(count);
}

async function renewPushClaim(claimToken: string) {
  const { data, error } = await admin.rpc("renew_weddingwin_push_claim", {
    p_claim_token: claimToken,
    p_lease_seconds: 600,
  });
  if (error) throw new Error(`Push claim renewal failed: ${error.message}`);
  return Number(data || 0);
}

async function currentClaimedRows(rows: PushTokenRow[], claimToken: string) {
  if (!rows.length) return [];
  const { data, error } = await admin
    .from("app_push_tokens")
    .select("id, bd_member_id, expo_push_token, push_registration_generation")
    .in("id", rows.map((row) => row.id))
    .eq("enabled", true)
    .eq("push_claim_token", claimToken)
    .gt("push_claim_expires_at", new Date().toISOString());
  if (error) throw new Error(`Push claim validation failed: ${error.message}`);

  const current = new Map(
    (data || []).map((row) => [String(row.id), row]),
  );
  return rows.filter((row) => {
    const live = current.get(row.id);
    return live &&
      String(live.bd_member_id || "") === row.bd_member_id &&
      String(live.expo_push_token || "") === row.expo_push_token &&
      Number(live.push_registration_generation || 0) ===
        Number(row.push_registration_generation || 0);
  });
}

async function updateClaimedPushToken(
  row: PushTokenRow,
  claimToken: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await admin.from("app_push_tokens")
    .update(values)
    .eq("id", row.id)
    .eq("bd_member_id", row.bd_member_id)
    .eq("expo_push_token", row.expo_push_token)
    .eq("push_registration_generation", row.push_registration_generation)
    .eq("enabled", true)
    .eq("push_claim_token", claimToken)
    .gt("push_claim_expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`Claimed push state update failed: ${error.message}`);
  }
  if (data?.id) return true;

  // A concurrent user opt-out/reassignment is a safe zero-row result: the
  // generation trigger invalidated this stale worker and no future retry will
  // target that registration. Any other zero means ownership expired or was
  // lost after Expo saw the request, so fail ambiguously and do not release.
  const { data: live, error: liveError } = await admin.from("app_push_tokens")
    .select(
      "enabled, bd_member_id, expo_push_token, push_registration_generation",
    )
    .eq("id", row.id)
    .maybeSingle();
  if (liveError) {
    throw new Error(`Push registration recheck failed: ${liveError.message}`);
  }
  const registrationChanged = !live ||
    live.enabled !== true ||
    String(live.bd_member_id || "") !== row.bd_member_id ||
    String(live.expo_push_token || "") !== row.expo_push_token ||
    Number(live.push_registration_generation || 0) !==
      Number(row.push_registration_generation || 0);
  if (registrationChanged) return false;
  throw new Error(
    "Push claim was lost while finalizing a delivery; outcome is ambiguous",
  );
}

async function scheduleClaimedPushRetry(
  row: PushTokenRow,
  claimToken: string,
  errorCode: string,
  errorMessage: string,
  retryAfterMs?: number,
  notAfter?: string,
  additionalValues: Record<string, unknown> = {},
) {
  const nowMs = Date.now();
  const retry = nextPushRetry(
    Number(row.push_retry_count || 0),
    nowMs,
    retryAfterMs,
  );
  const notAfterMs = Date.parse(String(notAfter || ""));
  const retryAtMs = Date.parse(retry.nextAttemptAt);
  const nextAttemptAt = Number.isFinite(notAfterMs) && retryAtMs > notAfterMs
    ? new Date(notAfterMs).toISOString()
    : retry.nextAttemptAt;
  return await updateClaimedPushToken(row, claimToken, {
    ...additionalValues,
    push_retry_count: retry.retryCount,
    push_next_attempt_at: nextAttemptAt,
    last_push_error: `${errorCode}: ${errorMessage}`.slice(0, 500),
    updated_at: new Date(nowMs).toISOString(),
  });
}

function expoHttpStatusIsRetryable(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function expoHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN") || "";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function sendExpoPushNotifications(
  rows: PushTokenRow[],
  unreadCount: number,
): Promise<ExpoDelivery[]> {
  if (!rows.length || unreadCount <= 0) return [];

  let response: Response;
  try {
    response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify(rows.map((row) => ({
        to: row.expo_push_token,
        sound: "default",
        badge: unreadCount,
        title: "New WeddingWin message",
        body: unreadCount === 1
          ? "You have a new message."
          : `You have ${unreadCount} new messages.`,
        data: { screen: "chat" },
      }))),
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Expo request failed";
    return rows.map((row) => ({
      row,
      accepted: false,
      errorCode: "ExpoRequestAmbiguous",
      errorMessage: message,
      ambiguous: true,
      retryable: true,
    }));
  }

  if (!response.ok) {
    const message = `Expo push service returned HTTP ${response.status}`;
    const retryable = expoHttpStatusIsRetryable(response.status);
    const retryAfterMs = retryable
      ? parseRetryAfterMs(response.headers.get("Retry-After"))
      : undefined;
    return rows.map((row) => ({
      row,
      accepted: false,
      errorCode: `ExpoHttp${response.status}`,
      errorMessage: message,
      ambiguous: retryable,
      retryable,
      retryAfterMs,
    }));
  }

  const body = await response.json().catch(() => ({})) as {
    data?: Array<
      {
        status?: string;
        id?: string;
        message?: string;
        details?: { error?: string };
      }
    >;
  };
  const tickets = Array.isArray(body.data) ? body.data : [];
  return rows.map((row, index) => {
    const ticket = tickets[index];
    const accepted = ticket?.status === "ok" && typeof ticket.id === "string";
    const rejected = ticket?.status === "error";
    const ambiguous = !accepted && !rejected;
    return {
      row,
      accepted,
      ticketId: accepted ? ticket.id : undefined,
      errorCode: accepted
        ? undefined
        : ambiguous
        ? "ExpoTicketResponseAmbiguous"
        : String(ticket?.details?.error || "ExpoTicketRejected"),
      errorMessage: accepted ? undefined : String(
        ticket?.message || "Expo returned an incomplete push ticket response",
      ),
      ambiguous,
      retryable: ambiguous,
    };
  });
}

async function processExpoReceipts(
  rows: PushTokenRow[],
  claimToken: string,
): Promise<Set<string>> {
  // A row with an accepted ticket must not send another notification until
  // that ticket reaches a receipt outcome (or the receipt retention window
  // expires). This also keeps a newer unread count from overwriting the only
  // ticket identifier we can reconcile.
  const handled = new Set<string>();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const due: PushTokenRow[] = [];
  const deadlineByRowId = new Map<string, string>();
  for (const row of rows) {
    if (!row.last_expo_ticket_id || !row.last_expo_ticket_at) continue;
    handled.add(row.id);

    const ticketAtMs = new Date(row.last_expo_ticket_at).getTime();
    if (!Number.isFinite(ticketAtMs)) {
      await updateClaimedPushToken(row, claimToken, {
        last_expo_ticket_id: null,
        last_expo_ticket_at: null,
        expo_receipt_expires_at: null,
        push_retry_count: 0,
        push_next_attempt_at: null,
        last_push_error:
          "ExpoReceiptInvalidTimestamp: accepted ticket could not be reconciled",
        updated_at: now,
      });
      continue;
    }

    const storedExpiryMs = row.expo_receipt_expires_at
      ? new Date(row.expo_receipt_expires_at).getTime()
      : Number.NaN;
    const expiresAtMs = Number.isFinite(storedExpiryMs)
      ? storedExpiryMs
      : ticketAtMs + EXPO_RECEIPT_EXPIRY_MS;
    if (nowMs >= expiresAtMs) {
      // Expo accepted the ticket, so do not lower the unread baseline and risk
      // sending the same notification twice. Retire only the unreconcilable
      // receipt state; a later unread increase can create a new notification.
      await updateClaimedPushToken(row, claimToken, {
        last_expo_ticket_id: null,
        last_expo_ticket_at: null,
        expo_receipt_expires_at: null,
        push_retry_count: 0,
        push_next_attempt_at: null,
        last_push_error:
          "ExpoReceiptExpired: no delivery receipt arrived within 24 hours",
        updated_at: now,
      });
      continue;
    }
    deadlineByRowId.set(row.id, new Date(expiresAtMs).toISOString());

    const firstReceiptAtMs = ticketAtMs + EXPO_RECEIPT_INITIAL_DELAY_MS;
    if (nowMs < firstReceiptAtMs) {
      await updateClaimedPushToken(row, claimToken, {
        expo_receipt_expires_at: new Date(expiresAtMs).toISOString(),
        push_next_attempt_at: new Date(firstReceiptAtMs).toISOString(),
        updated_at: now,
      });
      continue;
    }
    due.push(row);
  }
  if (!due.length) return handled;

  let response: Response;
  try {
    response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify({ ids: due.map((row) => row.last_expo_ticket_id) }),
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Expo receipt request failed";
    for (const row of due) {
      await scheduleClaimedPushRetry(
        row,
        claimToken,
        "ExpoReceiptRequestAmbiguous",
        message,
        undefined,
        deadlineByRowId.get(row.id),
      );
    }
    return handled;
  }
  if (!response.ok) {
    const retryAfterMs = expoHttpStatusIsRetryable(response.status)
      ? parseRetryAfterMs(response.headers.get("Retry-After"), nowMs)
      : undefined;
    for (const row of due) {
      await scheduleClaimedPushRetry(
        row,
        claimToken,
        `ExpoReceiptHttp${response.status}`,
        `Expo receipt service returned HTTP ${response.status}`,
        retryAfterMs,
        deadlineByRowId.get(row.id),
      );
    }
    return handled;
  }

  const body = await response.json().catch(() => ({})) as {
    data?: Record<
      string,
      { status?: string; message?: string; details?: { error?: string } }
    >;
  };
  const receipts = body.data && typeof body.data === "object" ? body.data : {};
  for (const row of due) {
    const ticketId = row.last_expo_ticket_id || "";
    const receipt = receipts[ticketId];
    if (!receipt || (receipt.status !== "ok" && receipt.status !== "error")) {
      await scheduleClaimedPushRetry(
        row,
        claimToken,
        "ExpoReceiptPending",
        "Expo has not published a definitive delivery receipt yet",
        undefined,
        deadlineByRowId.get(row.id),
      );
      continue;
    }

    if (receipt.status === "ok") {
      await updateClaimedPushToken(row, claimToken, {
        last_expo_ticket_id: null,
        last_expo_ticket_at: null,
        expo_receipt_expires_at: null,
        push_retry_count: 0,
        push_next_attempt_at: null,
        last_push_error: null,
        updated_at: now,
      });
      continue;
    }

    const errorCode = String(
      receipt.details?.error || "UnknownExpoReceiptError",
    );
    const deviceNotRegistered = errorCode === "DeviceNotRegistered";
    const update: Record<string, unknown> = {
      last_unread_count: deviceNotRegistered ? row.last_unread_count : 0,
      last_expo_ticket_id: null,
      last_expo_ticket_at: null,
      expo_receipt_expires_at: null,
      push_retry_count: 0,
      push_next_attempt_at: null,
      last_push_error: `${errorCode}: ${
        String(receipt.message || "Push delivery failed")
      }`.slice(0, 500),
      updated_at: now,
    };
    if (deviceNotRegistered) update.enabled = false;
    await updateClaimedPushToken(row, claimToken, update);
  }

  return handled;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }
  const suppliedCronSecret = request.headers.get("X-WeddingWin-Cron-Secret") ||
    "";
  if (suppliedCronSecret.length < 32) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  // The random secret remains in Supabase Vault. This service-role-only RPC
  // lets the function validate the cron header without duplicating the secret
  // in Edge configuration or exposing a verification function to clients.
  const { data: cronSecretIsValid, error: cronSecretError } = await admin.rpc(
    "verify_weddingwin_push_sweep_secret",
    { p_secret: suppliedCronSecret },
  );
  if (cronSecretError) {
    console.error(
      "Push sweep secret verification failed",
      cronSecretError.message,
    );
    return jsonResponse({
      ok: false,
      error: "Push sweep authorization unavailable",
    }, 503);
  }
  if (cronSecretIsValid !== true) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const claimToken = crypto.randomUUID();
  let claimEstablished = false;
  const ambiguousRowIds = new Set<string>();
  try {
    const { data: tokenRows, error } = await admin.rpc(
      "claim_weddingwin_push_tokens",
      {
        p_claim_token: claimToken,
        p_limit: 100,
        p_lease_seconds: 600,
      },
    );

    if (error) throw error;
    claimEstablished = true;

    const typedRows = (tokenRows || []) as PushTokenRow[];
    const receiptRows = await processExpoReceipts(typedRows, claimToken);
    const byMember = new Map<string, PushTokenRow[]>();
    for (const row of typedRows) {
      if (receiptRows.has(row.id)) continue;
      if (!row.bd_member_id || !row.expo_push_token) continue;
      const existing = byMember.get(row.bd_member_id) || [];
      existing.push(row);
      byMember.set(row.bd_member_id, existing);
    }
    // Every member in this leased batch is evaluated against the same complete
    // unread snapshot instead of each querying only the global newest 100.
    const allThreads = byMember.size ? await listAllChatThreads() : [];
    const unreadMessages = byMember.size ? await listUnreadMessages() : [];
    const cachedMembers = await cachedUsersByIds([...byMember.keys()]);

    let checked = 0;
    let deferred = 0;
    let failed = 0;
    let notified = 0;

    for (const [bdMemberId, rows] of byMember) {
      try {
        const cachedMember = cachedMembers.get(bdMemberId);
        const user = cachedMember
          ? (cachedMember as unknown as BdRow)
          : await fetchFullBdUserById(bdMemberId);
        if (!user) continue;

        const tokens = participantTokens(
          user,
          bdMemberId,
          rows[0]?.bd_member_token || "",
        );
        const threads = chatThreadsForUser(allThreads, tokens);
        const blocks = await activeChatBlocksForMember(bdMemberId);
        const blockedOtherIds = new Set(
          blocks.map((block) => otherMemberIdFromBlock(block, bdMemberId))
            .filter(Boolean),
        );
        const blockedUsers = await cachedUsersByIds([...blockedOtherIds]);
        const blockedThreads = new Set(
          threads.filter((thread) => {
            for (const blockedId of blockedOtherIds) {
              if (threadHasParticipant(thread, [blockedId])) return true;
              const cached = blockedUsers.get(blockedId);
              if (!cached) continue;
              const blockedTokens = [
                cached.user_id,
                cached.token,
                cached.cookie,
                cached.email,
              ]
                .map((value) => String(value || "").trim())
                .filter(Boolean);
              if (threadHasParticipant(thread, blockedTokens)) return true;
            }
            return false;
          }).map((thread) => threadToken(thread)),
        );
        const reportedThreads = await listThreadReportsByTokens(
          threads.map((thread) => threadToken(thread)),
        );
        const bdUnreadCount = countUnreadMessages(
          threads.filter((thread) =>
            !threadIsClosed(thread) &&
            !blockedThreads.has(threadToken(thread)) &&
            !reportedThreads.has(threadToken(thread))
          ),
          tokens,
          unreadMessages,
        );
        const nativeUnreadCount = await countUnsyncedNativeUnread(bdMemberId);
        const unreadCount = bdUnreadCount + nativeUnreadCount;
        const rowsToNotify = rows.filter((row) =>
          unreadCount > Number(row.last_unread_count || 0)
        );
        checked += 1;

        const now = new Date().toISOString();
        if (await renewPushClaim(claimToken) <= 0) {
          throw new Error(
            "Push claim expired before delivery-state evaluation",
          );
        }
        if (rowsToNotify.length) {
          const currentRowsToNotify = await currentClaimedRows(
            rowsToNotify,
            claimToken,
          );
          const deliveries = await sendExpoPushNotifications(
            currentRowsToNotify,
            unreadCount,
          );
          for (const delivery of deliveries) {
            if (delivery.accepted || delivery.ambiguous) {
              ambiguousRowIds.add(delivery.row.id);
            }
          }
          for (const delivery of deliveries) {
            if (delivery.accepted && delivery.ticketId) {
              let persisted = false;
              try {
                persisted = await updateClaimedPushToken(
                  delivery.row,
                  claimToken,
                  {
                    last_unread_count: unreadCount,
                    last_notified_at: now,
                    last_expo_ticket_id: delivery.ticketId,
                    last_expo_ticket_at: now,
                    expo_receipt_expires_at: new Date(
                      Date.parse(now) + EXPO_RECEIPT_EXPIRY_MS,
                    ).toISOString(),
                    push_retry_count: 0,
                    push_next_attempt_at: new Date(
                      Date.parse(now) + EXPO_RECEIPT_INITIAL_DELAY_MS,
                    ).toISOString(),
                    last_push_error: null,
                    updated_at: now,
                  },
                );
              } catch (error) {
                ambiguousRowIds.add(delivery.row.id);
                throw error;
              }
              ambiguousRowIds.delete(delivery.row.id);
              if (persisted) notified += 1;
            } else if (delivery.retryable) {
              let persisted = false;
              try {
                persisted = await scheduleClaimedPushRetry(
                  delivery.row,
                  claimToken,
                  delivery.errorCode || "ExpoRequestAmbiguous",
                  delivery.errorMessage ||
                    "Expo push request should be retried",
                  delivery.retryAfterMs,
                );
              } catch (error) {
                ambiguousRowIds.add(delivery.row.id);
                throw error;
              }
              ambiguousRowIds.delete(delivery.row.id);
              if (persisted) deferred += 1;
            } else {
              const disable = delivery.errorCode === "DeviceNotRegistered";
              const update: Record<string, unknown> = {
                push_retry_count: 0,
                push_next_attempt_at: null,
                last_push_error: `${
                  delivery.errorCode || "ExpoTicketRejected"
                }: ${delivery.errorMessage || "Push ticket rejected"}`.slice(
                  0,
                  500,
                ),
                updated_at: now,
              };
              if (disable) update.enabled = false;
              await updateClaimedPushToken(delivery.row, claimToken, update);
            }
          }
        }

        const rowsWithoutIncrease = rows.filter(
          (row) =>
            unreadCount <= Number(row.last_unread_count || 0) &&
            (unreadCount !== Number(row.last_unread_count || 0) ||
              Number(row.push_retry_count || 0) > 0 ||
              Boolean(row.push_next_attempt_at)),
        );
        if (rowsWithoutIncrease.length) {
          const { error } = await admin.from("app_push_tokens").update({
            last_unread_count: unreadCount,
            push_retry_count: 0,
            push_next_attempt_at: null,
            updated_at: now,
          }).eq("push_claim_token", claimToken)
            .eq("enabled", true)
            .gt("push_claim_expires_at", new Date().toISOString())
            .in("id", rowsWithoutIncrease.map((row) => row.id));
          if (error) {
            throw new Error(`Unread baseline update failed: ${error.message}`);
          }
        }
      } catch (error) {
        failed += 1;
        console.error(
          `Push evaluation failed for member ${bdMemberId}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return jsonResponse({
      ok: failed === 0,
      checked,
      claimed_devices: typedRows.length,
      deferred,
      failed,
      notified,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "Push sweep failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  } finally {
    if (claimEstablished) {
      const { error: releaseError } = await admin.rpc(
        "release_weddingwin_push_claim_except",
        {
          p_claim_token: claimToken,
          p_retain_ids: [...ambiguousRowIds],
        },
      );
      if (releaseError) {
        console.error("Push claim release failed", releaseError.message);
      }
    }
  }
});
