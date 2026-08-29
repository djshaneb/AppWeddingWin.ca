import { recipientCanReceiveChat } from "./chat_membership.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

Deno.test("recipient permission prefers the current BD receive field", () => {
  assertEquals(
    recipientCanReceiveChat({
      enable_receiving_chat_messages: "1",
      receive_messages: "0",
      enable_direct_messages: "0",
    }),
    true,
    "the current receive field should take precedence",
  );
});

Deno.test("recipient permission prefers the active direct-message field over stale legacy data", () => {
  assertEquals(
    recipientCanReceiveChat({
      receive_messages: "0",
      enable_direct_messages: "1",
    }),
    true,
    "the live vendor plans must not be rejected by their stale legacy zero",
  );
  assertEquals(
    recipientCanReceiveChat({
      receive_messages: "1",
      enable_direct_messages: "0",
    }),
    false,
    "an active direct-message opt-out must not fall through to legacy data",
  );
});

Deno.test("recipient permission falls back to the legacy receive field", () => {
  assertEquals(
    recipientCanReceiveChat({ receive_messages: "1" }),
    true,
    "legacy-only plan payloads should remain compatible",
  );
  assertEquals(
    recipientCanReceiveChat({}),
    false,
    "a plan with no recognized permission must fail closed",
  );
});

Deno.test("recipient permission preserves explicit current and direct-message opt-outs", () => {
  assertEquals(
    recipientCanReceiveChat({
      enable_receiving_chat_messages: "0",
      receive_messages: "1",
      enable_direct_messages: "1",
    }),
    false,
    "a current-field opt-out must not fall through",
  );
  assertEquals(
    recipientCanReceiveChat({
      receive_messages: "1",
      enable_direct_messages: "0",
    }),
    false,
    "a direct-message opt-out must not fall through",
  );
});

Deno.test("paired private reviewers retain their scoped receive override", () => {
  assertEquals(
    recipientCanReceiveChat(undefined, true),
    true,
    "a validated paired reviewer should not require an active membership plan",
  );
  assertEquals(
    recipientCanReceiveChat({ enable_receiving_chat_messages: "0" }, true),
    true,
    "a validated paired reviewer should preserve the existing plan bypass",
  );
  assertEquals(
    recipientCanReceiveChat(undefined, false),
    false,
    "an unvalidated account must fail closed",
  );
});
