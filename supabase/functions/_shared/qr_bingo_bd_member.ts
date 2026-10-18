export class QrBdMemberLookupUnavailableError extends Error {
  readonly status = 503;
  readonly code = "member_lookup_unavailable";
  constructor() {
    super("WeddingWin is busy. Please try again in a moment.");
    this.name = "QrBdMemberLookupUnavailableError";
  }
}

type BdEnvelope = { status?: string; message?: unknown };
type CallBd = (path: string) => Promise<{ response: Response; body: BdEnvelope }>;

export async function fetchQrBdMember(userId: string | number, callBd: CallBd) {
  let result: Awaited<ReturnType<CallBd>>;
  try {
    result = await callBd(
      `/api/v2/user/get/${encodeURIComponent(String(userId))}?include_tags=1`,
    );
  } catch {
    throw new QrBdMemberLookupUnavailableError();
  }
  // An upstream outage is not evidence that a valid app session has expired.
  // Fail closed without sending a 401 that would sign the attendee out.
  if (!result.response.ok || result.body.status !== "success") {
    throw new QrBdMemberLookupUnavailableError();
  }
  const message = result.body.message;
  if (Array.isArray(message)) {
    if (message.length === 0) return undefined;
    if (message.length !== 1 || !message[0] || typeof message[0] !== "object") {
      throw new QrBdMemberLookupUnavailableError();
    }
    return message[0] as Record<string, unknown>;
  }
  if (message && typeof message === "object") {
    return message as Record<string, unknown>;
  }
  throw new QrBdMemberLookupUnavailableError();
}
