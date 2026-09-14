import {
  buildMessageSnapshot,
  buildNotificationPayload,
  type MessageSnapshotInput,
} from "./notification_events.ts";

const NOW = Date.parse("2026-09-14T20:00:00Z");
const NATIVE = "app:11111111111111111111111111111111";
const BD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";
const CREATED = "2026-09-14T19:55:00.000Z";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}
function rejects(run: () => unknown) {
  let failed = false;
  try {
    run();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("Expected invalid snapshot to fail closed");
}
function input(): MessageSnapshotInput {
  return {
    memberId: "1",
    memberTokens: ["one@example.test", "my-token"],
    nowMs: NOW,
    bdThreads: [{
      thread_token: BD,
      thread_owner: "one@example.test",
      thread_responders: "two@example.test",
      owner_user_id: "1",
      responder_user_id: "2",
      thread_status: "1",
    }],
    bdMessages: [],
    nativeThreads: [{
      thread_token: NATIVE,
      bd_thread_token: BD,
      member_a_bd_user_id: "1",
      member_b_bd_user_id: "2",
    }],
    nativeMessages: [],
    blockedMemberIds: [],
    blockedParticipantTokens: [],
    reportedThreadTokens: [],
  };
}
function native(id = UUID) {
  return {
    id,
    thread_token: NATIVE,
    sender_bd_user_id: "2",
    read_at: null,
    created_at: CREATED,
    bd_message_id: null,
  };
}
function website(id = "100") {
  return {
    message_id: id,
    message_token: "website-generated-token",
    thread_token: BD,
    message_owner: "two@example.test",
    message_status: "0",
    created_at: "20260914155500",
  };
}
function mirrored(): MessageSnapshotInput {
  const value = input();
  value.nativeMessages = [native()];
  value.bdMessages = [{ ...website(), message_token: UUID }];
  return value;
}

Deno.test("new identity survives an unchanged unread total", () => {
  const before = input();
  before.nativeMessages = [native()];
  const after = input();
  after.nativeMessages = [{ ...native(), read_at: CREATED }, native(UUID2)];
  const a = buildMessageSnapshot(before), b = buildMessageSnapshot(after);
  equal([a.unreadCount, b.unreadCount], [1, 1]);
  equal(
    b.events.filter((event) =>
      !a.events.some((prior) => prior.event_key === event.event_key)
    ).map((event) => event.event_key),
    [`chat:1:native:${UUID2}`],
  );
});
Deno.test("read identities remain in the complete seen snapshot", () => {
  const value = input();
  value.bdMessages = [{ ...website(), message_status: "1" }];
  const snapshot = buildMessageSnapshot(value);
  equal(snapshot.events.length, 1);
  equal(snapshot.events[0].eligible, false);
  equal(snapshot.unreadCount, 0);
});
Deno.test("outgoing messages and unrelated threads never become incoming events", () => {
  const value = input();
  value.nativeMessages = [{ ...native(), sender_bd_user_id: "1" }, {
    ...native(UUID2),
    thread_token: "unrelated00000000",
  }];
  value.bdMessages = [{ ...website(), message_owner: "ONE@example.test" }, {
    ...website("101"),
    thread_token: "unrelated00000000",
  }];
  equal(buildMessageSnapshot(value), { events: [], unreadCount: 0 });
});
Deno.test("BD participant identity can prove an uncached opposite-side sender", () => {
  const value = input();
  value.nativeThreads = [];
  delete value.bdThreads[0].responder_user_id;
  value.bdMessages = [website()];
  const event = buildMessageSnapshot(value).events[0];
  equal(event.sender_member_id, null);
  equal(event.eligible, true);
});
Deno.test("unknown and mixed opposite-side message owners are retained silently", () => {
  const value = input();
  value.bdMessages = [
    { ...website(), message_owner: "stranger@example.test" },
    {
      ...website("101"),
      message_owner: "two@example.test,stranger@example.test",
    },
  ];
  const snapshot = buildMessageSnapshot(value);
  equal(snapshot.events.length, 2);
  equal(snapshot.unreadCount, 0);
});
Deno.test("BD 14-digit wallclock converts from Toronto into UTC", () => {
  const value = input();
  value.bdMessages = [website()];
  equal(buildMessageSnapshot(value).events[0].occurred_at, CREATED);
});
Deno.test("ISO timestamp offsets and fractions are preserved correctly", () => {
  const value = input();
  value.nativeMessages = [{
    ...native(),
    created_at: "2026-09-14T15:55:00.123456-04:00",
  }];
  equal(
    buildMessageSnapshot(value).events[0].occurred_at,
    "2026-09-14T19:55:00.123Z",
  );
});
for (
  const time of [
    "20260230000000",
    "2026-02-30T00:00:00Z",
    "not-a-date",
    "",
    "2026-09-14T21:00:00Z",
  ]
) {
  Deno.test(`invalid or future message time rejects: ${time || "empty"}`, () => {
    const value = input();
    value.nativeMessages = [{ ...native(), created_at: time }];
    rejects(() => buildMessageSnapshot(value));
  });
}
Deno.test("exact native UUID mirrors produce one stable event with both identities and routes", () => {
  const snapshot = buildMessageSnapshot(mirrored());
  equal(snapshot.unreadCount, 1);
  equal(snapshot.events.length, 1);
  equal(snapshot.events[0].event_key, `chat:1:native:${UUID}`);
  equal(snapshot.events[0].aliases, ["chat:1:bd:100", `chat:1:native:${UUID}`]);
  equal(snapshot.events[0].thread_aliases, [NATIVE, BD].sort());
});
Deno.test("explicit stored BD message ID also reconciles a mirror", () => {
  const value = input();
  value.nativeMessages = [{ ...native(), bd_message_id: "100" }];
  value.bdMessages = [website()];
  equal(buildMessageSnapshot(value).unreadCount, 1);
  equal(buildMessageSnapshot(value).events.length, 1);
});
Deno.test("UUID mirror before thread mapping saves dedupes using exact authoritative participants", () => {
  const value = mirrored();
  value.nativeThreads[0].bd_thread_token = null;
  equal(buildMessageSnapshot(value).events.length, 1);
  equal(buildMessageSnapshot(value).unreadCount, 1);
});
Deno.test("an unlinked thread with only email guesses cannot reconcile a UUID", () => {
  const value = mirrored();
  value.nativeThreads[0].bd_thread_token = null;
  delete value.bdThreads[0].owner_user_id;
  rejects(() => buildMessageSnapshot(value));
});

for (
  const mode of [
    "unknown participants",
    "different sender",
    "different thread",
  ] as const
) {
  Deno.test(`known native UUID waits for authoritative mirror proof: ${mode}`, () => {
    const value = mirrored();
    value.nativeThreads[0].bd_thread_token = null;
    if (mode === "unknown participants") {
      delete value.bdThreads[0].owner_user_id;
      delete value.bdThreads[0].responder_user_id;
    }
    if (mode === "different sender") {
      value.bdThreads[0].responder_user_id = "3";
    }
    if (mode === "different thread") {
      value.nativeThreads[0].bd_thread_token = "other-authoritative-thread";
    }
    rejects(() => buildMessageSnapshot(value));
  });
}

for (const mode of ["blocked", "closed", "reported"] as const) {
  Deno.test(`proven mirror before thread mapping remains silent when ${mode}`, () => {
    const value = mirrored();
    value.nativeThreads[0].bd_thread_token = null;
    if (mode === "blocked") {
      value.blockedParticipantTokens = ["two@example.test"];
    }
    if (mode === "closed") value.bdThreads[0].thread_status = "closed";
    if (mode === "reported") value.reportedThreadTokens = [BD];
    const snapshot = buildMessageSnapshot(value);
    equal(snapshot.events.length, 1);
    equal(snapshot.unreadCount, 0);
  });
}
Deno.test("matching content and timestamp do not merge independent messages", () => {
  const value = mirrored();
  value.bdMessages[0].message_token = "no-match";
  equal(buildMessageSnapshot(value).events.length, 2);
});
for (const source of ["native", "website"] as const) {
  Deno.test(`a read ${source} mirror prevents duplicate unread notification`, () => {
    const value = mirrored();
    if (source === "native") value.nativeMessages[0].read_at = CREATED;
    else value.bdMessages[0].message_status = "1";
    equal(buildMessageSnapshot(value).events.length, 1);
    equal(buildMessageSnapshot(value).unreadCount, 0);
  });
}
Deno.test("conflicting UUID and stored ID aliases fail closed", () => {
  const value = mirrored();
  value.nativeMessages.push({ ...native(UUID2), bd_message_id: "100" });
  rejects(() => buildMessageSnapshot(value));
});
for (
  const moderation of [
    "member block",
    "email block",
    "native report",
    "BD report",
    "native closed",
    "BD closed",
    "deleted sender",
  ] as const
) {
  Deno.test(`${moderation} suppresses incoming notifications`, () => {
    const value = mirrored();
    if (moderation === "member block") value.blockedMemberIds = ["2"];
    if (moderation === "email block") {
      value.blockedParticipantTokens = ["TWO@example.test"];
    }
    if (moderation === "native report") value.reportedThreadTokens = [NATIVE];
    if (moderation === "BD report") value.reportedThreadTokens = [BD];
    if (moderation === "native closed") {
      value.nativeThreads[0].closed_at = CREATED;
    }
    if (moderation === "BD closed") value.bdThreads[0].thread_status = "0";
    if (moderation === "deleted sender") {
      value.nativeMessages = [];
      value.bdMessages[0].message_owner = "(deleted member)";
    }
    equal(buildMessageSnapshot(value).unreadCount, 0);
  });
}
Deno.test("linked native messages stay silent if website membership disappears", () => {
  const value = input();
  value.nativeMessages = [native()];
  value.bdThreads[0].thread_owner = "stranger";
  value.bdThreads[0].owner_user_id = "3";
  equal(buildMessageSnapshot(value).unreadCount, 0);
});
for (
  const corrupt of [
    "native duplicate",
    "native missing ID",
    "BD duplicate",
    "BD missing ID",
    "native ambiguous members",
    "BD contradictory identity",
    "ambiguous native mapping",
    "bad thread route",
  ]
) {
  Deno.test(`invalid source identity rejects: ${corrupt}`, () => {
    const value = mirrored();
    if (corrupt === "native duplicate") value.nativeMessages.push(native());
    if (corrupt === "native missing ID") value.nativeMessages[0].id = "";
    if (corrupt === "BD duplicate") value.bdMessages.push(website());
    if (corrupt === "BD missing ID") value.bdMessages[0].message_id = "";
    if (corrupt === "native ambiguous members") {
      value.nativeThreads[0].member_b_bd_user_id = "1";
    }
    if (corrupt === "BD contradictory identity") {
      value.bdThreads[0].owner_user_id = "3";
    }
    if (corrupt === "ambiguous native mapping") {
      value.nativeThreads.push({
        ...value.nativeThreads[0],
        thread_token: "app:22222222222222222222222222222222",
      });
    }
    if (corrupt === "bad thread route") {
      value.bdThreads[0].thread_token = "https://evil.test";
    }
    rejects(() => buildMessageSnapshot(value));
  });
}
Deno.test("payload carries only account-bound routing and generic notification text", () => {
  const result = buildNotificationPayload({
    id: UUID,
    type: "chat_message",
    recipient_member_id: "1",
    thread_token: NATIVE,
    expires_at: "2026-09-15T20:00:00Z",
  }, NOW);
  equal(result.data, {
    v: 1,
    event_id: UUID,
    recipient_member_id: "1",
    expires_at: "2026-09-15T20:00:00.000Z",
    screen: "chat",
    thread_token: NATIVE,
  });
  if (
    /email|message_content|sender_member|token=|https:/.test(
      JSON.stringify(result),
    )
  ) throw new Error("Unexpected private content in notification");
});
for (
  const [type, screen] of [["draw_result", "draw_result"], [
    "vendor_draw_follow_up",
    "vendor_draw_result",
  ]] as const
) {
  Deno.test(`${type} routes to its authenticated result destination`, () => {
    const result = buildNotificationPayload({
      id: UUID,
      type,
      recipient_member_id: "1",
      draw_id: UUID2,
      expires_at: "2026-09-15T20:00:00Z",
    }, NOW);
    equal(result.data.screen, screen);
    equal("draw_id" in result.data ? result.data.draw_id : undefined, UUID2);
  });
}
for (
  const change of [
    { id: "not-uuid" },
    { recipient_member_id: "0" },
    { expires_at: "2026-09-14T20:00:00Z" },
    { expires_at: "2026-12-01T00:00:00Z" },
    { expires_at: "invalid" },
    { thread_token: "https://evil.test" },
  ]
) {
  Deno.test(`payload rejects malformed binding or route: ${JSON.stringify(change)}`, () => {
    rejects(() =>
      buildNotificationPayload({
        id: UUID,
        type: "chat_message",
        recipient_member_id: "1",
        thread_token: BD,
        expires_at: "2026-09-15T20:00:00Z",
        ...change,
      }, NOW)
    );
  });
}
Deno.test("draw payload requires a valid draw ID", () => {
  rejects(() =>
    buildNotificationPayload({
      id: UUID,
      type: "draw_result",
      recipient_member_id: "1",
      expires_at: "2026-09-15T20:00:00Z",
    }, NOW)
  );
});
