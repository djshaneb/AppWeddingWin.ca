import {
  filterMessagesAtOrBeforeReport,
  containsInlineImagePayload,
  isChatImageSharingEnabled,
  isMessageVisibleAtReportCutoff,
  matchingParticipantIdentity,
  participantValueMatchesIdentities,
  participantValuesMatch,
  parseChatTimestamp,
  runDurableClose,
  stripInlineImagePayloads,
} from "./chat_moderation.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("participant authorization uses exact normalized identities", () => {
  assert(participantValueMatchesIdentities("abc, Member@Example.com", ["member@example.com"]), "email should match case-insensitively");
  assert(participantValueMatchesIdentities("abc, 123", ["123"]), "exact comma-delimited id should match");
  assert(!participantValueMatchesIdentities("abc, 1234", ["123"]), "numeric prefix must not authorize");
  assert(!participantValueMatchesIdentities("token-abcdef", ["abcdef"]), "token substring must not authorize");
  assert(matchingParticipantIdentity("first, canonical-token", ["canonical-token"]) === "canonical-token", "matching side identity should be returned");
  assert(participantValuesMatch("first, Member@Example.com", "member@example.com"), "participant sides should compare exactly");
});

Deno.test("chat image sharing fails closed unless explicitly enabled", () => {
  assert(!isChatImageSharingEnabled(undefined), "missing environment flag must be off");
  assert(!isChatImageSharingEnabled("0"), "zero must be off");
  assert(!isChatImageSharingEnabled("false"), "false must be off");
  assert(isChatImageSharingEnabled("1"), "one should explicitly enable the feature");
  assert(isChatImageSharingEnabled("true"), "true should explicitly enable the feature");
  const payload = "data:image/png;base64,QUJDRA==";
  assert(containsInlineImagePayload(payload), "inline image payload should be detected");
  assert(stripInlineImagePayloads(`before ${payload} after`) === "before  after", "inline image bytes should be stripped from display text");
});

Deno.test("report cutoff preserves history and suppresses later messages", () => {
  const cutoff = "2026-08-28T18:00:00.000Z";
  const rows = [
    { id: "before", created_at: "2026-08-28T17:59:59.999Z" },
    { id: "equal", created_at: cutoff },
    { id: "after", created_at: "2026-08-28T18:00:00.001Z" },
  ];
  const visible = filterMessagesAtOrBeforeReport(rows, (row) => row.created_at, cutoff);
  assert(visible.map((row) => row.id).join(",") === "before,equal", "only post-report messages should be hidden");
  assert(!isMessageVisibleAtReportCutoff("not-a-date", cutoff), "malformed message dates should fail closed");
});

Deno.test("BD wall-clock timestamps are compared in the site timezone", () => {
  assert(
    parseChatTimestamp("20260828140000", "America/Toronto") === Date.parse("2026-08-28T18:00:00.000Z"),
    "summer BD timestamp should observe EDT",
  );
  assert(
    isMessageVisibleAtReportCutoff("20260828135959", "2026-08-28T18:00:00.000Z"),
    "pre-report BD history should remain visible",
  );
  assert(
    !isMessageVisibleAtReportCutoff("20260828140001", "2026-08-28T18:00:00.000Z"),
    "post-report BD messages should be hidden",
  );
});

Deno.test("durable close enqueues before delivery and acknowledges success", async () => {
  const calls: string[] = [];
  const result = await runDurableClose(
    async () => {
      calls.push("enqueue");
      return { id: "row-1" };
    },
    async () => {
      calls.push("deliver");
    },
    async () => {
      calls.push("mark-sent");
    },
  );
  assert(result.delivered, "successful delivery should be acknowledged");
  assert(calls.join(",") === "enqueue,deliver,mark-sent", "close ordering must be durable");
});

Deno.test("failed close remains pending for retry", async () => {
  const calls: string[] = [];
  const result = await runDurableClose(
    async () => {
      calls.push("enqueue");
      return { id: "row-2" };
    },
    async () => {
      calls.push("deliver");
      throw new Error("BD unavailable");
    },
    async () => {
      calls.push("mark-sent");
    },
  );
  assert(!result.delivered, "network failure should leave the outbox row pending");
  assert(calls.join(",") === "enqueue,deliver", "failed delivery must not be marked sent");
});
