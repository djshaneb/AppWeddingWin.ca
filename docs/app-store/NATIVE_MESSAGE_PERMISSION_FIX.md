# Vendor message permission compatibility fix — deployed and verified

Updated September 14, 2026. The approved fix is in source `533821d` and deployed as **bd-chat-sync version 56**. The earlier proposal and native SEND HTTP 403 blocker are superseded by the implementation and live checks below.

## Cause and change

Cedar & Light Photography uses an ordinary vendor account and an existing chat-enabled plan. Its plan response supplies `enable_direct_messages: "1"` with `enable_receiving_chat_messages: null`. The earlier helper interpreted the present null field as an explicit refusal and rejected sending.

The helper now treats a null or missing receiving override as unspecified and falls back to the direct-message setting. Explicit receiving 1/0 still takes precedence. Unknown nonempty values and an explicit empty string remain denied. The validated private-reviewer pair behavior is unchanged. No membership plan, account permission or authentication bypass was used to make the test pass.

| Input | Current result |
| --- | --- |
| Direct messaging 1; receiving field absent or null | Allowed |
| Receiving field explicitly 1 | Allowed |
| Receiving field explicitly 0, empty or unknown | Denied |
| Missing plan | Denied |

## Verification

The current full suite passed **1,034 Deno tests, 655 Node tests and all SQL suites**, including message-permission regression coverage. See [verification result](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/full-verify-result.json).

After deployment, one controlled message was sent in each direction between John and Jane and Cedar & Light through the normal authenticated app API. Both requests returned HTTP 200 with delivered state. New messages 1872 and 1873 appeared once in both accounts; each account reads ten messages, and all original eight messages are unchanged. The iPad app also displayed both new messages with the correct sender side and Delivered status. See [send/read evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/demo-chat-send-verification.json).

This confirms the reproduced API permission failure is fixed. It does not complete physical TestFlight messaging, report/block/photo checks or push testing. The two demo accounts have no active push registrations or baselines, so these sends cannot verify automatic push delivery. Physical notification display, sound, badge and tapping remain open; iPhone Mirroring is unavailable because its screen reports iCloud signed out. No system iCloud changes are part of this work.

The original eight-message screenshot conversation remains accurate as an earlier saved state. The extra two test messages are documented in [photographer conversation](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/photographer-conversation-copy.md). No real vendor booking or payment was created.
