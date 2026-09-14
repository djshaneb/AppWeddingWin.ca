import { parseRetryAfterMs } from "./push_retry.ts";

export type PushOutcome = {
  status: "ticketed" | "delivered" | "retry" | "failed" | "ambiguous";
  ticketId?: string;
  errorCode?: string;
  retryAfterMs?: number;
};

type ExpoRecord = {
  status?: string;
  id?: string;
  details?: { error?: string };
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function classifyExpoTicket(
  status: number,
  body: unknown,
  retryAfter: string | null,
): PushOutcome {
  // Only a definitive rejection can be retried. A timeout, server failure,
  // malformed response, or interrupted request may already have delivered.
  if (status === 429) {
    return {
      status: "retry",
      errorCode: "ExpoHttp429",
      retryAfterMs: parseRetryAfterMs(retryAfter),
    };
  }
  if (status === 408 || status >= 500) {
    return { status: "ambiguous", errorCode: `ExpoHttp${status}` };
  }
  if (status < 200 || status >= 300) {
    return { status: "failed", errorCode: `ExpoHttp${status}` };
  }
  const data = object(body)?.data;
  const ticket =
    (Array.isArray(data) && data.length === 1 ? object(data[0]) : undefined) as
      | ExpoRecord
      | undefined;
  if (
    ticket?.status === "ok" && typeof ticket.id === "string" && ticket.id.trim()
  ) {
    return { status: "ticketed", ticketId: ticket.id };
  }
  if (ticket?.status === "error") {
    const errorCode = String(ticket.details?.error || "ExpoTicketRejected");
    return {
      status: errorCode === "MessageRateExceeded" ? "retry" : "failed",
      errorCode,
    };
  }
  return { status: "ambiguous", errorCode: "ExpoTicketResponseAmbiguous" };
}

export function classifyExpoReceipt(
  status: number,
  body: unknown,
  ticketId: string,
  retryAfter: string | null,
): PushOutcome {
  // Receipt queries are read-only and safe to repeat; never turn an absent
  // receipt into a second send of an accepted ticket.
  if (status < 200 || status >= 300) {
    return {
      status: "ticketed",
      ticketId,
      errorCode: `ExpoReceiptHttp${status}`,
      retryAfterMs: parseRetryAfterMs(retryAfter),
    };
  }
  const receipt = object(object(object(body)?.data)?.[ticketId]) as
    | ExpoRecord
    | undefined;
  if (receipt?.status === "ok") return { status: "delivered", ticketId };
  if (receipt?.status === "error") {
    const errorCode = String(receipt.details?.error || "ExpoReceiptRejected");
    return {
      status: errorCode === "MessageRateExceeded" ? "retry" : "failed",
      errorCode,
    };
  }
  return { status: "ticketed", ticketId, errorCode: "ExpoReceiptPending" };
}

export async function requestExpoPush(
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<PushOutcome> {
  try {
    const response = await fetcher("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify([payload]),
      signal: AbortSignal.timeout(20_000),
    });
    return classifyExpoTicket(
      response.status,
      await response.json().catch(() => null),
      response.headers.get("Retry-After"),
    );
  } catch {
    return { status: "ambiguous", errorCode: "ExpoRequestAmbiguous" };
  }
}

export async function requestExpoReceipt(
  ticketId: string,
  headers: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<PushOutcome> {
  try {
    const response = await fetcher(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: [ticketId] }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    return classifyExpoReceipt(
      response.status,
      await response.json().catch(() => null),
      ticketId,
      response.headers.get("Retry-After"),
    );
  } catch {
    return {
      status: "ticketed",
      ticketId,
      errorCode: "ExpoReceiptRequestUnavailable",
    };
  }
}
