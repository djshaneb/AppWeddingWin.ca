import { completeDatabaseRows } from "../_shared/notification_snapshot.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listBdRowsPaginated } from "../_shared/bd_push_pagination.ts";
import {
  buildMessageSnapshot,
  buildNotificationPayload,
} from "../_shared/notification_events.ts";
import {
  type PushOutcome,
  requestExpoPush,
  requestExpoReceipt,
} from "../_shared/notification_delivery.ts";
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
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
      }),
  },
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
  total?: string | number;
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

async function callBd(path: string) {
  if (!BD_API_KEY) throw new Error("BD_API_KEY is not configured");
  const response = await fetch(`${BD_API_BASE_URL}${path}`, {
    headers: { "X-Api-Key": BD_API_KEY },
    signal: AbortSignal.timeout(20_000),
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

async function cachedMember(id: string): Promise<BdRow> {
  if (!/^\d+$/.test(id)) {
    throw new Error("Invalid notification member identity");
  }
  const { data, error } = await admin.from("bd_users_cache")
    .select("user_id,token,cookie,email").eq("user_id", id).maybeSingle();
  if (error || !data) {
    throw new Error("Notification member identity unavailable");
  }
  return data;
}

function memberTokens(member: BdRow): string[] {
  return [member.user_id, member.token, member.cookie, member.email]
    .map((value) => String(value || "").trim()).filter(Boolean);
}

async function moderationSnapshot(memberId: string) {
  const blocks = await completeDatabaseRows(
    "Chat block",
    "id",
    (from, to) =>
      admin
        .from("app_chat_member_blocks").select(
          "id,member_a_bd_user_id,member_b_bd_user_id",
          { count: "exact" },
        )
        .eq("status", "active").or(
          `member_a_bd_user_id.eq.${memberId},member_b_bd_user_id.eq.${memberId}`,
        )
        .order("id").range(from, to),
  );
  const blockedMemberIds = blocks.map((row) =>
    String(row.member_a_bd_user_id) === memberId
      ? String(row.member_b_bd_user_id)
      : String(row.member_a_bd_user_id)
  );
  const blockedParticipantTokens: string[] = [...blockedMemberIds];
  for (const id of blockedMemberIds) {
    blockedParticipantTokens.push(...memberTokens(await cachedMember(id)));
  }
  const reports = await completeDatabaseRows(
    "Chat report",
    "id",
    (from, to) =>
      admin
        .from("app_chat_thread_reports").select(
          "id,thread_token,app_thread_token,bd_thread_token",
          { count: "exact" },
        )
        .neq("status", "resolved").order("id").range(from, to),
  );
  const reportedThreadTokens = reports.flatMap(
    (row) => [row.thread_token, row.app_thread_token, row.bd_thread_token],
  )
    .map((value) => String(value || "").trim()).filter(Boolean);
  return { blockedMemberIds, blockedParticipantTokens, reportedThreadTokens };
}

async function nativeSnapshot(memberId: string) {
  const nativeThreads = await completeDatabaseRows(
    "Native chat thread",
    "id",
    (from, to) =>
      admin
        .from("app_native_chat_threads")
        .select(
          "id,thread_token,bd_thread_token,member_a_bd_user_id,member_b_bd_user_id",
          { count: "exact" },
        )
        .or(
          `member_a_bd_user_id.eq.${memberId},member_b_bd_user_id.eq.${memberId}`,
        ).order("id").range(from, to),
  );
  const nativeMessages: BdRow[] = [];
  for (let index = 0; index < nativeThreads.length; index += 100) {
    const tokens = nativeThreads.slice(index, index + 100).map((row) =>
      String(row.thread_token)
    );
    nativeMessages.push(
      ...await completeDatabaseRows(
        "Native chat message",
        "id",
        (from, to) =>
          admin
            .from("app_native_chat_messages")
            .select(
              "id,thread_token,sender_bd_user_id,read_at,created_at,bd_message_id,bd_synced_at",
              { count: "exact" },
            )
            .in("thread_token", tokens).order("id").range(from, to),
      ),
    );
    if (nativeMessages.length > 25_000) {
      throw new Error("Native message snapshot exceeds its bound");
    }
  }
  return { nativeThreads, nativeMessages };
}

type EventDelivery = {
  id: string;
  event_id: string;
  event_key: string;
  type: "chat_message" | "draw_result" | "vendor_draw_follow_up" |
    "review_draw_result" | "review_vendor_follow_up";
  recipient_member_id: string;
  sender_member_id: string | null;
  thread_token: string | null;
  draw_id: string | null;
  review_notice_id?: string | null;
  expires_at: string;
  status: "claimed" | "ticketed";
  attempt_count: number;
  expo_ticket_id: string | null;
  ticket_at: string | null;
  receipt_expires_at: string | null;
};

async function refreshEventBdSnapshot(
  input: Parameters<typeof buildMessageSnapshot>[0],
  event: ReturnType<typeof buildMessageSnapshot>["events"][number],
  readBd: typeof callBd,
) {
  const prefix = `chat:${input.memberId}:bd:`;
  const ids = [
    ...new Set(
      [event.event_key, ...event.aliases].filter((key) =>
        key.startsWith(prefix)
      ).map((key) => key.slice(prefix.length)),
    ),
  ];
  let bdMessages = [...input.bdMessages];
  let bdThreads = [...input.bdThreads];
  const nativeThread = input.nativeThreads.find((row) =>
    String(row.thread_token) === event.thread_token
  );
  const knownThreadAliases = new Set([
    event.thread_token,
    ...event.thread_aliases,
    String(nativeThread?.bd_thread_token || ""),
  ]);
  const threadTokens = new Set(
    input.bdThreads.filter((row) =>
      knownThreadAliases.has(String(row.thread_token))
    ).map((row) => String(row.thread_token)),
  );
  if (!ids.length && !threadTokens.size) return input;
  for (const id of ids) {
    const previous = bdMessages.find((row) => String(row.message_id) === id);
    if (!previous) {
      throw new Error(
        "Notification website alias is absent from its complete snapshot",
      );
    }
    const current = await listBdRowsPaginated(readBd, "chat_message_items", {
      property: "message_id",
      property_value: id,
      property_operator: "eq",
      order_column: "message_id",
      order_type: "ASC",
    }, { idField: "message_id" });
    if (
      current.length > 1 ||
      current.some((row) =>
        String(row.message_id) !== id ||
        row.thread_token !== previous.thread_token
      )
    ) {
      throw new Error("Notification message identity changed before send");
    }
    threadTokens.add(String(previous.thread_token));
    // A removed website message must not resurrect an unread native mirror.
    bdMessages = bdMessages.map((row) =>
      String(row.message_id) === id
        ? current[0] || { ...previous, message_status: "1" }
        : row
    );
  }
  for (const token of threadTokens) {
    const previous = bdThreads.find((row) =>
      String(row.thread_token) === token
    );
    if (!previous) {
      throw new Error(
        "Notification thread is absent from its complete snapshot",
      );
    }
    const current = await listBdRowsPaginated(readBd, "chat_message_threads", {
      property: "thread_token",
      property_value: token,
      property_operator: "eq",
      order_column: "thread_id",
      order_type: "ASC",
    }, { idField: "thread_id" });
    if (
      current.length > 1 || current.some((row) => row.thread_token !== token)
    ) throw new Error("Notification thread identity changed before send");
    bdThreads = bdThreads.map((row) =>
      String(row.thread_token) === token
        ? current[0]
          ? { ...previous, ...current[0] }
          : { ...previous, thread_status: "closed" }
        : row
    );
  }
  return { ...input, bdMessages, bdThreads };
}

async function finalizeDelivery(
  delivery: EventDelivery,
  claimToken: string,
  outcome: PushOutcome | { status: "canceled"; errorCode: string },
) {
  const now = Date.now();
  let nextAttemptAt: string | null = null;
  let finalStatus = outcome.status;
  if (finalStatus === "retry" && delivery.attempt_count >= 16) {
    finalStatus = "failed";
  }
  if (finalStatus === "retry" || finalStatus === "ticketed") {
    const after = "retryAfterMs" in outcome ? outcome.retryAfterMs : undefined;
    nextAttemptAt = finalStatus === "ticketed" && delivery.status !== "ticketed"
      ? new Date(now + EXPO_RECEIPT_INITIAL_DELAY_MS).toISOString()
      : nextPushRetry(delivery.attempt_count, now, after).nextAttemptAt;
    const deadline = Date.parse(
      finalStatus === "ticketed"
        ? delivery.receipt_expires_at ||
          new Date(now + EXPO_RECEIPT_EXPIRY_MS).toISOString()
        : delivery.expires_at,
    );
    if (Date.parse(nextAttemptAt) > deadline) {
      nextAttemptAt = new Date(deadline).toISOString();
    }
  }
  const { data, error } = await admin.rpc(
    "finalize_weddingwin_notification_delivery",
    {
      p_delivery_id: delivery.id,
      p_claim_token: claimToken,
      p_status: finalStatus,
      p_expo_ticket_id: "ticketId" in outcome ? outcome.ticketId || null : null,
      p_error_code: outcome.errorCode || null,
      p_next_attempt_at: nextAttemptAt,
    },
  );
  if (error) {
    throw new Error(
      `Notification delivery finalization failed: ${error.message}`,
    );
  }
  return data === true;
}

async function dispatchDeviceEvents(
  row: PushTokenRow,
  claimToken: string,
  snapshotInput: Parameters<typeof buildMessageSnapshot>[0],
  budget: { remaining: number; deadline: number; bdCalls: number },
  readBd: typeof callBd,
) {
  if (budget.remaining <= 0 || Date.now() > budget.deadline - 25_000) {
    return { notified: 0, deferred: 0, checked: false };
  }
  const { data, error } = await admin.rpc(
    "claim_weddingwin_notification_deliveries",
    {
      p_device_id: row.id,
      p_registration_generation: row.push_registration_generation,
      p_claim_token: claimToken,
      p_limit: 1,
    },
  );
  if (error || !Array.isArray(data)) {
    throw new Error("Notification delivery claim failed");
  }
  const snapshot = buildMessageSnapshot(snapshotInput);
  let notified = 0;
  let deferred = 0;
  for (const delivery of data as EventDelivery[]) {
    budget.remaining -= 1;
    if (delivery.status === "ticketed") {
      const expired = !delivery.receipt_expires_at ||
        Date.parse(delivery.receipt_expires_at) <= Date.now();
      const outcome: PushOutcome = expired || !delivery.expo_ticket_id
        ? { status: "ambiguous", errorCode: "ExpoReceiptExpired" }
        : await requestExpoReceipt(delivery.expo_ticket_id, expoHeaders());
      await finalizeDelivery(delivery, claimToken, outcome);
      if (outcome.errorCode === "DeviceNotRegistered") {
        await updateClaimedPushToken(row, claimToken, {
          enabled: false,
          last_push_error: "DeviceNotRegistered",
        });
      }
      if (outcome.status === "ticketed" || outcome.status === "retry") {
        deferred += 1;
      }
      continue;
    }
    if (delivery.recipient_member_id !== row.bd_member_id) {
      throw new Error("Notification recipient mismatch");
    }
    if (delivery.type === "chat_message") {
      const previousEvent = snapshot.events.find((event) =>
        event.event_key === delivery.event_key ||
        event.aliases.includes(delivery.event_key)
      );
      if (!previousEvent?.eligible) {
        await finalizeDelivery(delivery, claimToken, {
          status: "canceled",
          errorCode: "MessageNoLongerEligible",
        });
        continue;
      }
      const freshBd = await refreshEventBdSnapshot(
        snapshotInput,
        previousEvent,
        readBd,
      );
      const moderation = await moderationSnapshot(row.bd_member_id);
      const native = await nativeSnapshot(row.bd_member_id);
      const currentSnapshot = buildMessageSnapshot({
        ...freshBd,
        ...moderation,
        ...native,
        nowMs: Date.now(),
      });
      const currentEvent = currentSnapshot.events.find((event) =>
        event.event_key === delivery.event_key ||
        event.aliases.includes(delivery.event_key)
      );
      if (!currentEvent?.eligible) {
        await finalizeDelivery(delivery, claimToken, {
          status: "canceled",
          errorCode: "MessageNoLongerEligible",
        });
        continue;
      }
    }
    if (
      await renewPushClaim(claimToken) <= 0 ||
      !(await currentClaimedRows([row], claimToken)).length
    ) break;
    const content = buildNotificationPayload({
      id: delivery.event_id,
      type: delivery.type,
      recipient_member_id: delivery.recipient_member_id,
      thread_token: delivery.thread_token,
      draw_id: delivery.draw_id,
      review_notice_id: delivery.review_notice_id,
      expires_at: delivery.expires_at,
    });
    const { data: begun, error: beginError } = await admin.rpc(
      "begin_weddingwin_notification_delivery",
      {
        p_delivery_id: delivery.id,
        p_claim_token: claimToken,
      },
    );
    if (beginError) {
      throw new Error(
        `Notification send reservation failed: ${beginError.message}`,
      );
    }
    if (begun !== true) continue;
    delivery.attempt_count += 1;
    const outcome = await requestExpoPush({
      to: row.expo_push_token,
      sound: "default",
      badge: snapshot.unreadCount,
      ...content,
    }, expoHeaders());
    const finalized = await finalizeDelivery(delivery, claimToken, outcome);
    if (outcome.status === "ticketed" && finalized) {
      notified += 1;
      await updateClaimedPushToken(row, claimToken, {
        last_notified_at: new Date().toISOString(),
        last_push_error: null,
      });
    }
    if (outcome.status === "retry") deferred += 1;
    if (outcome.errorCode === "DeviceNotRegistered") {
      await updateClaimedPushToken(row, claimToken, {
        enabled: false,
        last_push_error: "DeviceNotRegistered",
      });
    }
  }
  return { notified, deferred, checked: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }
  const secret = request.headers.get("X-WeddingWin-Cron-Secret") || "";
  if (secret.length < 32) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  const { data: authorized, error: authorizationError } = await admin.rpc(
    "verify_weddingwin_push_sweep_secret",
    { p_secret: secret },
  );
  if (authorizationError) {
    return jsonResponse({
      ok: false,
      error: "Push sweep authorization unavailable",
    }, 503);
  }
  if (authorized !== true) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const claimToken = crypto.randomUUID();
  let claimEstablished = false;
  const checkedRowIds = new Set<string>();
  const deadline = Date.now() + 150_000;
  try {
    const { data, error } = await admin.rpc("claim_weddingwin_push_tokens", {
      p_claim_token: claimToken,
      p_limit: 100,
      p_lease_seconds: 600,
    });
    if (error || !Array.isArray(data)) {
      throw new Error("Push device claim failed");
    }
    claimEstablished = true;
    const typedRows = data as PushTokenRow[];
    const receiptRows = await processExpoReceipts(typedRows, claimToken);
    for (const id of receiptRows) checkedRowIds.add(id);
    const byMember = new Map<string, PushTokenRow[]>();
    for (const row of typedRows) {
      if (receiptRows.has(row.id)) continue;
      if (!/^\d+$/.test(row.bd_member_id) || !row.expo_push_token) continue;
      byMember.set(row.bd_member_id, [
        ...byMember.get(row.bd_member_id) || [],
        row,
      ]);
    }
    const snapshotStartedAt = new Date().toISOString();
    const budget = { remaining: 100, deadline, bdCalls: 0 };
    const snapshotBdCall = (path: string) => {
      if (Date.now() > deadline - 25_000) {
        throw new Error("Notification snapshot exceeded its time budget");
      }
      if (budget.bdCalls >= 80) {
        throw new Error("Notification website read budget exhausted");
      }
      budget.bdCalls += 1;
      return callBd(path);
    };
    // Include read messages in the seen snapshot. A later read/unread toggle
    // is not a newly received message and cannot create a notification.
    const bdThreads = byMember.size
      ? await listBdRowsPaginated(snapshotBdCall, "chat_message_threads", {
        order_column: "thread_id",
        order_type: "ASC",
      }, { idField: "thread_id" })
      : [];
    const bdMessages = byMember.size
      ? await listBdRowsPaginated(snapshotBdCall, "chat_message_items", {
        order_column: "message_id",
        order_type: "ASC",
      }, { idField: "message_id" })
      : [];
    const identities = byMember.size
      ? await completeDatabaseRows(
        "Chat thread identity",
        "thread_token",
        (from, to) =>
          admin
            .from("bd_chat_threads").select(
              "thread_token,owner_user_id,responder_user_id",
              { count: "exact" },
            )
            .order("thread_token").range(from, to),
      )
      : [];
    const identityByThread = new Map(
      identities.map((row) => [String(row.thread_token), row]),
    );
    const threads = bdThreads.map((row) => ({
      ...row,
      ...identityByThread.get(String(row.thread_token)),
    }));
    let checked = 0;
    let notified = 0;
    let deferred = 0;
    let failed = 0;
    let baselinesCreated = 0;
    for (const [memberId, rows] of byMember) {
      if (Date.now() > deadline - 25_000 || budget.bdCalls >= 78) break;
      try {
        const member = await cachedMember(memberId);
        const native = await nativeSnapshot(memberId);
        const moderation = await moderationSnapshot(memberId);
        const snapshotInput = {
          memberId,
          memberTokens: memberTokens(member),
          bdThreads: threads,
          bdMessages,
          ...native,
          ...moderation,
          nowMs: Date.now(),
          siteTimeZone: Deno.env.get("BD_SITE_TIME_ZONE") || "America/Toronto",
        };
        const snapshot = buildMessageSnapshot(snapshotInput);
        const { data: recorded, error: recordError } = await admin.rpc(
          "record_weddingwin_notification_snapshot",
          {
            p_member_id: memberId,
            p_events: snapshot.events,
            p_snapshot_complete: true,
            p_snapshot_started_at: snapshotStartedAt,
          },
        );
        if (recordError || recorded?.ok !== true) {
          throw new Error(
            `Notification snapshot storage failed: ${
              recordError?.message || "not complete"
            }`,
          );
        }
        if (recorded.baseline_created) baselinesCreated += 1;
        checked += 1;
        for (const row of rows) {
          const result = await dispatchDeviceEvents(
            row,
            claimToken,
            snapshotInput,
            budget,
            snapshotBdCall,
          );
          if (result.checked) checkedRowIds.add(row.id);
          notified += result.notified;
          deferred += result.deferred;
          await updateClaimedPushToken(row, claimToken, {
            last_unread_count: snapshot.unreadCount,
          });
        }
      } catch (error) {
        failed += 1;
        console.error(
          `Push evaluation failed for member ${memberId}`,
          error instanceof Error ? error.message : "Unknown failure",
        );
      }
    }
    return jsonResponse({
      ok: failed === 0,
      checked,
      claimed_devices: typedRows.length,
      notified,
      deferred,
      failed,
      baselines_created: baselinesCreated,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: "Push sweep failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  } finally {
    if (claimEstablished) {
      const { error } = await admin.rpc(
        "release_weddingwin_notification_claim",
        { p_claim_token: claimToken, p_checked_ids: [...checkedRowIds] },
      );
      if (error) console.error("Push claim release failed", error.message);
    }
  }
});
