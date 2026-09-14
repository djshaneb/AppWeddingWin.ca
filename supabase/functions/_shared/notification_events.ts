import {
  normalizeParticipantIdentity,
  parseChatTimestamp,
  splitParticipantIdentities,
} from "./chat_moderation.ts";

type Row = Record<string, unknown>;
export type MessageSnapshotEvent = {
  event_key: string;
  sender_member_id: string | null;
  thread_token: string;
  occurred_at: string;
  eligible: boolean;
  aliases: string[];
  thread_aliases: string[];
};
export type MessageSnapshotInput = {
  memberId: string;
  memberTokens: string[];
  bdThreads: Row[];
  bdMessages: Row[];
  nativeThreads: Row[];
  nativeMessages: Row[];
  blockedMemberIds: string[];
  blockedParticipantTokens?: string[];
  reportedThreadTokens: string[];
  nowMs: number;
  siteTimeZone?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_ID = /^[1-9][0-9]{0,17}$/;
const THREAD_TOKEN = /^(?:[A-Za-z0-9_-]{16,128}|app:[0-9a-f]{32})$/;
const clean = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const memberId = (value: unknown) =>
  MEMBER_ID.test(clean(value)) ? clean(value) : null;
const identities = (value: unknown) =>
  splitParticipantIdentities(value).map(normalizeParticipantIdentity);
const intersects = (left: string[], right: Set<string>) =>
  left.some((value) => right.has(value));
const deleted = (value: unknown) =>
  identities(value).includes("(deleted member)");
const closed = (row: Row | undefined) => {
  const status = clean(row?.thread_status ?? row?.status).toLowerCase();
  return status === "0" || status === "closed" || Boolean(row?.closed_at);
};

function timestamp(value: unknown, input: MessageSnapshotInput): string {
  const raw = clean(value);
  const parts = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw) ||
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
      .exec(raw);
  if (!parts) {
    throw new Error("Incoming notification message has an invalid timestamp");
  }
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day || check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second
  ) {
    throw new Error("Incoming notification message has an invalid timestamp");
  }
  const parsed = parseChatTimestamp(
    raw,
    input.siteTimeZone || "America/Toronto",
  );
  if (!Number.isFinite(parsed) || parsed > input.nowMs + 5 * 60_000) {
    throw new Error("Incoming notification message has an invalid timestamp");
  }
  return new Date(parsed).toISOString();
}

type NativeThread = {
  row: Row;
  token: string;
  bdToken: string;
  otherId: string | null;
};
type BdThread = {
  row: Row;
  token: string;
  mine: string[];
  other: string[];
  otherId: string | null;
  native?: NativeThread;
};
type Candidate = {
  event: MessageSnapshotEvent;
  unread: boolean;
  incoming: boolean;
  nativeRow?: Row;
  nativeThread?: NativeThread;
};

/** No I/O. Callers must supply complete, authoritative row sets. */
export function buildMessageSnapshot(input: MessageSnapshotInput): {
  events: MessageSnapshotEvent[];
  unreadCount: number;
} {
  if (!MEMBER_ID.test(input.memberId) || !Number.isFinite(input.nowMs)) {
    throw new Error("Invalid notification snapshot principal or clock");
  }
  const mine = new Set(
    [input.memberId, ...input.memberTokens].map(normalizeParticipantIdentity)
      .filter(Boolean),
  );
  const blockedIds = new Set(input.blockedMemberIds);
  const blockedTokens = new Set(
    (input.blockedParticipantTokens || []).map(normalizeParticipantIdentity),
  );
  const reported = new Set(input.reportedThreadTokens);
  const nativeThreads = new Map<string, NativeThread>();
  const nativeByBd = new Map<string, NativeThread>();
  for (const row of input.nativeThreads) {
    const a = clean(row.member_a_bd_user_id),
      b = clean(row.member_b_bd_user_id);
    if (a !== input.memberId && b !== input.memberId) continue;
    const token = clean(row.thread_token), bdToken = clean(row.bd_thread_token);
    if (
      !THREAD_TOKEN.test(token) || (bdToken && !THREAD_TOKEN.test(bdToken)) ||
      !memberId(a) || !memberId(b) || a === b || nativeThreads.has(token)
    ) throw new Error("Ambiguous native notification thread");
    const thread = {
      row,
      token,
      bdToken,
      otherId: memberId(a === input.memberId ? b : a),
    };
    nativeThreads.set(token, thread);
    if (bdToken) {
      if (nativeByBd.has(bdToken)) {
        throw new Error("Ambiguous native notification thread mapping");
      }
      nativeByBd.set(bdToken, thread);
    }
  }

  const bdThreads = new Map<string, BdThread>();
  const allBdThreads = new Map<string, Row>();
  for (const row of input.bdThreads) {
    const token = clean(row.thread_token);
    if (!THREAD_TOKEN.test(token) || allBdThreads.has(token)) {
      throw new Error("Missing or repeated BD notification thread identity");
    }
    allBdThreads.set(token, row);
    const owner = identities(row.thread_owner),
      responders = identities(row.thread_responders);
    const ownerId = memberId(row.owner_user_id),
      responderId = memberId(row.responder_user_id);
    const ownerMatch = intersects(owner, mine),
      responderMatch = intersects(responders, mine);
    const ownedByMe = ownerMatch || ownerId === input.memberId;
    const answeredByMe = responderMatch || responderId === input.memberId;
    if (!ownedByMe && !answeredByMe) continue;
    if (
      ownedByMe === answeredByMe ||
      (ownerMatch && ownerId && ownerId !== input.memberId) ||
      (responderMatch && responderId && responderId !== input.memberId)
    ) {
      throw new Error("Contradictory BD notification participant identity");
    }
    const other = ownedByMe ? responders : owner;
    let otherId = ownedByMe ? responderId : ownerId;
    const native = nativeByBd.get(token);
    if (native) {
      if (otherId && native.otherId && otherId !== native.otherId) {
        throw new Error("Contradictory notification thread participants");
      }
      otherId ||= native.otherId;
    }
    bdThreads.set(token, {
      row,
      token,
      mine: ownedByMe ? owner : responders,
      other,
      otherId,
      native,
    });
  }

  const candidates = new Map<string, Candidate>();
  const nativeMessages = new Map<string, Candidate>();
  const nativeByBdId = new Map<string, Candidate>();
  const key = (kind: "native" | "bd", id: string) =>
    `chat:${input.memberId}:${kind}:${id}`;
  for (const row of input.nativeMessages) {
    const thread = nativeThreads.get(clean(row.thread_token));
    if (!thread) continue;
    const sender = clean(row.sender_bd_user_id);
    if (sender === input.memberId) continue;
    const id = clean(row.id).toLowerCase();
    if (!UUID.test(id) || nativeMessages.has(id)) {
      throw new Error(
        "Missing or repeated native notification message identity",
      );
    }
    const senderId = memberId(sender);
    const incoming = Boolean(senderId && senderId === thread.otherId);
    const unread = row.read_at === null || row.read_at === undefined;
    const bdThread = thread.bdToken
      ? allBdThreads.get(thread.bdToken)
      : undefined;
    const unavailable = closed(thread.row) || closed(bdThread) ||
      Boolean(
        thread.bdToken && (!bdThread || !bdThreads.has(thread.bdToken)),
      ) ||
      reported.has(thread.token) || reported.has(thread.bdToken) ||
      Boolean(senderId && blockedIds.has(senderId)) ||
      intersects(bdThreads.get(thread.bdToken)?.other || [], blockedTokens) ||
      deleted(sender);
    const eventKey = key("native", id);
    const candidate: Candidate = {
      event: {
        event_key: eventKey,
        sender_member_id: incoming ? senderId : null,
        thread_token: thread.token,
        occurred_at: timestamp(row.created_at, input),
        eligible: incoming && unread && !unavailable,
        aliases: [eventKey],
        thread_aliases: [
          thread.token,
          ...(thread.bdToken && bdThreads.has(thread.bdToken)
            ? [thread.bdToken]
            : []),
        ],
      },
      unread,
      incoming,
      nativeRow: row,
      nativeThread: thread,
    };
    candidates.set(eventKey, candidate);
    nativeMessages.set(id, candidate);
    const bdId = clean(row.bd_message_id);
    if (bdId) {
      if (nativeByBdId.has(bdId)) {
        throw new Error("Repeated native-to-BD message mapping");
      }
      nativeByBdId.set(bdId, candidate);
    }
  }

  const seenBdIds = new Set<string>();
  for (const row of input.bdMessages) {
    const thread = bdThreads.get(clean(row.thread_token));
    if (!thread) continue;
    const owner = identities(row.message_owner);
    const ownedByMe = intersects(owner, mine) ||
      intersects(owner, new Set(thread.mine));
    const otherSide = new Set([
      ...thread.other,
      ...(thread.otherId ? [thread.otherId] : []),
    ]);
    const incoming = owner.length > 0 && owner.every((value) =>
      otherSide.has(value)
    ) && !ownedByMe;
    if (ownedByMe) continue;
    const id = clean(row.message_id);
    if (!id || seenBdIds.has(id)) {
      throw new Error("Missing or repeated BD notification message identity");
    }
    seenBdIds.add(id);
    const eventKey = key("bd", id);
    const sender = incoming ? thread.otherId : null;
    const unread = clean(row.message_status) === "0";
    const unavailable = closed(thread.row) || closed(thread.native?.row) ||
      reported.has(thread.token) ||
      Boolean(thread.native && reported.has(thread.native.token)) ||
      Boolean(sender && blockedIds.has(sender)) ||
      intersects(owner, blockedTokens) ||
      intersects(thread.other, blockedTokens) || deleted(row.message_owner) ||
      thread.other.some((value) => value === "(deleted member)");
    const candidate: Candidate = {
      event: {
        event_key: eventKey,
        sender_member_id: sender,
        thread_token: thread.token,
        occurred_at: timestamp(row.created_at ?? row.bd_created_at, input),
        eligible: incoming && unread && !unavailable,
        aliases: [eventKey],
        thread_aliases: [
          thread.token,
          ...(thread.native ? [thread.native.token] : []),
        ],
      },
      unread,
      incoming,
    };
    const tokenMatch = nativeMessages.get(
      clean(row.message_token).toLowerCase(),
    );
    const idMatch = nativeByBdId.get(id);
    if (tokenMatch && idMatch && tokenMatch !== idMatch) {
      throw new Error("Conflicting native-to-BD message aliases");
    }
    const mirror = tokenMatch || idMatch;
    const exactParticipants = Boolean(
      mirror?.nativeThread &&
        memberId(thread.row.owner_user_id) &&
        memberId(thread.row.responder_user_id) &&
        [clean(thread.row.owner_user_id), clean(thread.row.responder_user_id)]
            .sort().join(":") ===
          [
            clean(mirror.nativeThread.row.member_a_bd_user_id),
            clean(mirror.nativeThread.row.member_b_bd_user_id),
          ].sort().join(":"),
    );
    const mirrorThreadMatches =
      mirror?.nativeThread?.bdToken === thread.token ||
      Boolean(!mirror?.nativeThread?.bdToken && exactParticipants);
    if (
      mirror && mirror.incoming && incoming && sender &&
      mirror.event.sender_member_id === sender && mirrorThreadMatches
    ) {
      // Either source may be read before the other mirror catches up. A read
      // wins, and the immutable native UUID remains the logical event key.
      mirror.unread = mirror.unread && unread;
      mirror.event.eligible = mirror.event.eligible &&
        candidate.event.eligible && mirror.unread;
      mirror.event.occurred_at =
        mirror.event.occurred_at < candidate.event.occurred_at
          ? mirror.event.occurred_at
          : candidate.event.occurred_at;
      mirror.event.aliases.push(eventKey);
      mirror.event.thread_aliases.push(thread.token);
    } else {
      // An exact UUID/ID match with incomplete or contradictory participant
      // evidence is a pending reconciliation, not a second received message.
      // Do not baseline either identity until the mapping can be proved.
      if (mirror) {
        throw new Error(
          "Notification mirror identity is not yet authoritative",
        );
      }
      candidates.set(eventKey, candidate);
    }
  }
  const events = [...candidates.values()].map(({ event }) => ({
    ...event,
    aliases: [...new Set(event.aliases)].sort(),
    thread_aliases: [...new Set(event.thread_aliases)].sort(),
  }))
    .sort((a, b) => a.event_key.localeCompare(b.event_key));
  return {
    events,
    unreadCount: events.filter((event) => event.eligible).length,
  };
}

export type NotificationPayloadEvent = {
  id: string;
  type: "chat_message" | "draw_result" | "vendor_draw_follow_up";
  recipient_member_id: string;
  thread_token?: string | null;
  draw_id?: string | null;
  expires_at: string;
};

export function buildNotificationPayload(
  event: NotificationPayloadEvent,
  nowMs = Date.now(),
) {
  const expiry = Date.parse(event.expires_at);
  if (
    !UUID.test(event.id) || !MEMBER_ID.test(event.recipient_member_id) ||
    !Number.isFinite(expiry) || !Number.isFinite(nowMs) || expiry <= nowMs ||
    expiry > nowMs + 30 * 86_400_000
  ) {
    throw new Error("Invalid notification event payload");
  }
  const base = {
    v: 1 as const,
    event_id: event.id,
    recipient_member_id: event.recipient_member_id,
    expires_at: new Date(expiry).toISOString(),
  };
  if (event.type === "chat_message") {
    if (event.thread_token && !THREAD_TOKEN.test(event.thread_token)) {
      throw new Error("Invalid notification conversation target");
    }
    return {
      title: "New message",
      body: "You have a new private message.",
      data: {
        ...base,
        screen: "chat" as const,
        ...(event.thread_token ? { thread_token: event.thread_token } : {}),
      },
    };
  }
  if (!event.draw_id || !UUID.test(event.draw_id)) {
    throw new Error("Invalid notification draw target");
  }
  if (event.type === "draw_result") {
    return {
      title: "Draw result ready",
      body: "Open WeddingWin to view your draw result and next steps.",
      data: { ...base, screen: "draw_result" as const, draw_id: event.draw_id },
    };
  }
  if (event.type === "vendor_draw_follow_up") {
    return {
      title: "Winner follow-up ready",
      body: "Open WeddingWin to view your winner and follow-up details.",
      data: {
        ...base,
        screen: "vendor_draw_result" as const,
        draw_id: event.draw_id,
      },
    };
  }
  throw new Error("Unsupported notification event type");
}
