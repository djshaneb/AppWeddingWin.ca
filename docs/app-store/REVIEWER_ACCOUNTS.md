# Fictional screenshot accounts

Reconciled September 14, 2026 against source `533821d` (build configuration `58e3438`); account facts below retain their recorded verification scope. These are controlled demonstration identities; the public vendor directory and real members were not renamed.

**September 16 status:** The review mode introduced in build 6 and retained in candidate build 7 uses a separate controlled pair: **Emma and Liam Parker** (member 39086, private plan 18, review.couple@weddingwin.ca) and **Meadow & Pine Florals** (member 39087, private plan 39, review.vendor@weddingwin.ca). Their isolated fixture expires November 14, 2026. Follow [Review test mode](REVIEW_TEST_MODE.md) for simulated entry, verification, explicit Send and authenticated results with no real prize, agreement or email. These accounts do not replace the screenshot identities below. This account inventory does not establish a final-build login or physical push pass; passwords stay in private records.

| Role | Display name | Demo email | Account/email status |
| --- | --- | --- | --- |
| Couple | John and Jane | johnandjane.demo@weddingwin.ca | Confirmed through the received email and normal flow; login and chat status returned HTTP 200 |
| Vendor | Willow & Bloom Floral Studio; contact Alex Morgan | willowandbloom.demo@weddingwin.ca | Dedicated inbox exists; app email update/verification remains pending |
| Ordinary demo vendor | Cedar & Light Photography | hello.cedarandlight@weddingwin.ca | Manually created through Members; normal login/chat status HTTP 200; no mailbox created |

The two inboxes were created using WeddingWin's existing admin → Emails → Email Accounts → Add/Edit Email Addresses sign-in. The hosting account does not expose the Forwarders feature, so these are separate mailboxes, not aliases. Each has the default 1 GB quota and a generated strong password. Access them using cPanel's **Check Email** control; mailbox passwords can be managed there. No existing mailboxes, routing, or DNS settings were changed.

App account names and the isolated couple website's names were updated and checked against protected-field hashes. Account status, fixture isolation, outbound draw-email suppression and historical draw offers were preserved. The couple completed genuine email confirmation through the normal flow. The historical Willow email change was rejected by the account-status guard and is not claimed fixed. Current private review instructions use Cedar and the controlled pair for vendor login; Willow is display-only, so that email issue is not a current login-path blocker.

Cedar & Light Photography is now a verified ordinary demo account (active status 2, existing free chat-enabled plan 17). It is distinct from the preserved private Willow & Bloom fixture. The Members form accepted the demo email without creating a mailbox. No welcome email or billing was added. Ever After Music remains artwork and conversation copy only; no account is provisioned.

## Private access handling

Keep passwords, tokens and private review-contact values out of this repository. Enter verified credentials only in App Store Connect's private sign-in/review fields. The public-looking fictional email addresses below are not proof of a working mailbox or reviewer login.

## Current demo preparation status

- John and Jane: genuine email confirmation complete; normal login and chat status returned HTTP 200.
- Cedar & Light Photography: ordinary demo account created through the normal admin Members flow; normal login and chat status returned HTTP 200. Normal app login/list/read returned the original eight-message conversation. The receiving-flag fix is now deployed as `bd-chat-sync` version 56. Controlled normal authenticated API sends/delivery/read returned HTTP 200 in both directions; both accounts now see ten messages and the original eight are unchanged.
- No Cedar mailbox was created. Its entered demo email is not evidence that an inbox exists or that email delivery works.
- Willow & Bloom: preserved private review fixture; its app email update/verification remains unresolved. Do not treat Cedar's successful account check as proof that Willow's access changed.
- Photos: clean JPEG exports of the unchanged Willow and Cedar artwork, plus the existing couple website photo, uploaded successfully in Media Manager. Profile logo updates and canonical local imports are verified for all three. Normal native refresh returns the Cedar and couple photos; both final chat captures visibly show them.
- Conversation: eight alternating photographer messages were saved through normal website forms, reloaded in order, and returned by normal native reading. The floral display-only fixture is separate from these saved messages. The two-way normal API send test now passes; physical TestFlight messaging remains to be checked.
- Corrected iPad website and both chat captures are ready as branded simulator drafts. All eight messages are visible on iPad, with the latest five visible on iPhone. Apple previews are checked; final physical TestFlight acceptance remains pending.

The earlier PNG acceptance error was resolved by standard JPEG exports; no image-upload issue remains open for these three profiles. See [canonical photo imports](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/demo-avatars-canonical.json) and [normal native refresh](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/demo-avatars-native-refresh.json). The earlier [native send proposal](NATIVE_MESSAGE_PERMISSION_FIX.md) is superseded by the deployed fix and [two-way chat verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/demo-chat-send-verification.json).

<!-- scene06-package-update:start -->
## Display-only draw capture and current refresh

The earlier September 14 scene 06 captures showed the real named Yes/No question in the isolated Willow fixture on both devices. No was used; read-only checks confirmed zero entries, draws and deliveries. The native app was unchanged for those earlier captures. They predate the later prize-summary rollout and are historical previews.

Both scene 06 images are refreshed from the approved natural prize presentation in source `533821d`, with the nonbinding explanation available under Read more. The real raw captures retain build 3 provenance; the same UI was retained at the historical build 4 stage. The fixture entry/message safeguards are unchanged and no warning was painted out of pixels. The [manifest](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/submission/screenshots.json) owns selected images and hashes.

The fixture is display/scan-only. Its Yes option does not create an entry, and it cannot validate winner selection or delivery for App Review. Its recorded expiry is September 21, 2026 at 20:47:37.829 UTC. The Emma/Liam–Meadow & Pine pair provides the separate controlled review-mode path in build 7. Both roles passed API and native simulator checks, and the matching private Notes/credentials are saved and reload-verified in Apple. Verification on the final selected distribution build remains open. Changing screenshot copy or recording a new capture does not provide functional draw-review access. The separate native API sending failure is fixed and verified as described above.

All fourteen branded files across the seven planned scenes per device class are uploaded and Apple previews visually checked. Content Rights Information is saved and verified after reload; final physical TestFlight comparison remains open. See the [policy update](TERMS_POLICY_UPDATE_2026-09-14.md) and [release checklist](RELEASE_READINESS.md).
<!-- scene06-package-update:end -->
