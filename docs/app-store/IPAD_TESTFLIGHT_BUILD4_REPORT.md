# WeddingWin build 4 — physical iPad verification

Checked 15 September 2026 UTC using the installed TestFlight app, WeddingWin Canada 1.0.0 (4), on an iPad (9th generation) running iPadOS 26.1. A separately signed XCTest runner controlled the installed app; it did not replace the TestFlight app.

## Verified

- TestFlight displayed build 4 and Open. A scoped device inventory independently confirmed the installed bundle and version.
- Seven functional UI tests passed, with no functional failures: signed-out role/login navigation; About and tab navigation; signed-out lifecycle; native email login as John and Jane; inbox sorting/close; signed-in background/resume; and notification tap into the expected vendor conversation.
- Login registered the iPad for push delivery. Initial synchronization suppressed 15 historical message events and created no deliveries for those events.
- One controlled message from Cedar & Light Photography to John and Jane was sent through the normal authenticated messaging API at 05:14:49 UTC. The sender received a successful delivery response.
- The scheduled notification worker detected that new message and created one event and one device delivery, with one send attempt. No manual sweep or direct notification send was used for this message.
- Expo returned a successful receipt, checked at 05:18:01 UTC.
- WeddingWin's **New message** notification was visibly present in the physical iPad's Notification Center with the expected generic body, **You have a new private message.**
- The automated tap test identified the sole WeddingWin notification, tapped it once, and verified that the installed app opened **Cedar & Light Photography** with the chat input and conversation navigation present. Live screen inspection also confirmed the newly sent message in that conversation.

## Second message and sound check

The user was not watching the first alert and did not hear it. A read-only inspection then showed **Settings → Notifications → Screen Sharing: Notifications Off**. No notification preferences were changed. The Mac's QuickTime live-preview Close control was selected before a second test. This setting is a plausible explanation for the earlier observation, but a causal relationship was not established.

After the user confirmed readiness to watch and listen, a second distinct Cedar message was sent through the normal API at 05:27:33 UTC. It generated one event and one delivery with one attempt through the scheduled worker. Expo returned receipt `ok`, checked at 05:28:29 UTC. The user then explicitly confirmed: **“I saw the alert and heard a sound.”** Visible alert presentation and physical sound are therefore confirmed by the observer for that second message. This was a separate deliberate test message, not a retry of the first.

## Remaining limits

These checks verify two real new-message deliveries to the couple's account, visible presentation and sound on the second, and the correct tap destination on the first. They do not complete the full notification matrix. Foreground, precisely controlled background and terminated delivery, vendor-role delivery, notification permission denial/re-enabling, account switching, token changes, blocked senders, icon badge behavior and draw-result notifications remain to be accepted. XCTest confirmed WeddingWin was backgrounded before the second send, but did not continuously observe its state at delivery. Historical-message suppression and one delivery per test message are useful evidence but do not substitute for every duplicate-prevention scenario.

The iPhone still needs final-build physical testing. Full authentication, media, moderation, account-deletion, draw, accessibility and resilience acceptance also remains pending. App Review submission and public release have not occurred.

## Evidence and test interpretation

Local evidence is under `work/app-store-finish-sept14/`: `ipad-test-results.json`, the run 01/02/04/05/08 result bundles, `ipad-message-push-preflight.json`, `ipad-message-push-probe.json`, `ipad-push-provider-receipt.json`, `ipad-message-sound-preflight.json`, `ipad-message-sound-probe.json`, and `ipad-sound-provider-receipt.json`.

The credential-free preparation run deliberately skipped its guarded login test. The first transient-banner matcher skipped because it did not identify iPadOS's combined-label notification container; the later Notification Center tap passed. These skips are not counted as functional passes or delivery failures. Settings navigation diagnostics and runner setup errors are reported separately from app behavior.

Raw login/test artifacts remain local and private. No passwords, notification tokens, private review-contact details or unrelated device content are included in this report.
