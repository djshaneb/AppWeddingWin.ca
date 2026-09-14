# App Review notes — ready for review, not submission

Updated September 14, 2026. The Apple-facing draft below is under 4,000 UTF-8 bytes. Do not paste it until the gates below are resolved and the exact processed build and credentials have been verified. Credentials and the owner's review-contact details belong in App Store Connect's secure review fields, not this file.

## Apple-facing draft

WeddingWin helps couples plan their wedding and connect with wedding professionals. It includes private messaging, camera-based QR Bingo, optional vendor draws and account controls, alongside vendor search, profiles and wedding-website tools. Internet access is required for account and website features.

The supplied fictional accounts have distinct roles: John and Jane for the couple walkthrough, Cedar & Light Photography for the ordinary vendor walkthrough, and Willow & Bloom Floral Studio for the isolated draw walkthrough. Credentials are supplied separately in App Store Connect's review information.

1. Sign in as John and Jane. From Home, open Vendor Search and Wedding Website Builder. Open Private Messages to view the sample conversation with Cedar & Light. The conversation menu contains report/block controls.
2. Open QR Bingo. Review the participation agreement and contact information. Display the attached weddingwin-review-vendor-qr.png on another screen or print it, then scan it. The named vendor question offers Yes or No. No keeps scan progress; Yes enters that vendor's draw. Scanning alone never enters a draw, and repeat scans do not create duplicate entries.
3. Sign out and sign in as Cedar & Light to inspect the vendor home, profile tools and sample conversation. Use Willow & Bloom separately to inspect the isolated vendor-draw dashboard.
4. About contains support, privacy, privacy requests, terms, Official Rules and Delete Account. A separate disposable account can be used for completed deletion testing without removing the walkthrough accounts.

The isolated draw example uses fictional data in a separate event, awards no real prize and suppresses external winner delivery. Its test notices are intentional. Production entry availability follows the organizer's scanning period, the vendor's enabled status and the closing time. Winner selection and notice sending are separate vendor actions after the required checks.

Notification permission is optional. Notifications can open the relevant message or verified draw-result screen. Official Rules and Apple's non-sponsor disclaimer are available through About and the QR workflow.

Support: https://www.weddingwin.ca/about/contact
Privacy: https://www.weddingwin.ca/about/privacy
Privacy requests: https://www.weddingwin.ca/privacy-request
Terms: https://www.weddingwin.ca/about/terms
Draw rules: https://www.weddingwin.ca/qr-bingo-vendor-draw-rules

## Internal pre-submission gates — never paste

- **Functionality:** native sending to Cedar still has the documented receiving-flag failure. Saved conversation screenshots prove reading, not sending. The [separate fix proposal](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/native-message-permission-fix.md) is not approved or implemented.
- **Three distinct accounts:** verify John/Jane couple and Cedar ordinary vendor credentials on the exact processed build. Willow remains a separate private fixture; the named nonbinding preview is captured, but full vendor login and functional review access still need verification. Do not present the pending `willowandbloom.demo` inbox address as a verified account login. Enter only verified credentials in secure review fields.
- **Draw access:** the [approved nonbinding preview](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/screenshots/demo-draw-capture-scope.md) now supplies the captured named question and No flow, with zero entries. Scene06 is a nonbinding, display/scan-only synthetic fixture: the actual named Yes/No question was captured on both devices, No was used, and live checks confirmed zero entries, draws and deliveries. It does not establish functional Yes/entry/winner acceptance for App Review. The fresh fixture expires 2026-09-21T20:47:37.829Z (at most seven days); verify or provision appropriately authorized review access for Apple's later review and follow-up. Native app code was unchanged for these captures. A genuinely working isolated review walkthrough, including authorized Yes and later review steps, remains a separate gate. Attach the tested [sample QR](../../assets/app-store/sample-qr-review-vendor-38970.png) only after that final candidate walkthrough is verified; preserve historical offers and acceptance records.
- **Sponsorship and disclosures:** resolve the substantive Apple 5.3.1 sponsorship conflict and the missing pre-entry vendor-specific facts described in the [compliance audit](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/package-review/reviewer-compliance-audit.md). Do not repair either with reviewer wording alone.
- **Notifications:** approved repairs are deployed. Natural cron and one direct phone transport test passed; actual new-event dispatch, visible presentation/taps and production TestFlight acceptance remain open. See [current push evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/TEST-RESULTS.md). Remove the old claim that notifications are unimplemented.
- **Build:** choose the exact newly processed Store distribution build. The development-signed build labelled 1.0.0 (3), and the older EAS Store build with the same label, are different artifacts. Do not substitute simulator or development evidence for TestFlight acceptance.
- **Moderation/deletion:** confirm report/block behavior, report handling, the image rollout and the lawful shared-content retention/deletion policy on the final candidate. Test complete deletion with disposable email and Apple accounts; preserve supplied review access.
- **Payments:** verify any reachable vendor upgrade, membership or digital-service checkout before making a no-paid-features claim. Free download/base profiles do not establish that every account feature is free. Event tickets and physical services are a separate payment question.
- **Package:** fourteen branded scenes are prepared; scene06 is complete as a display-only capture, not full App Review entry validation. Final Store previews, owner review-contact details and exact fixture expiry/access must be checked. See [readiness checklist](RELEASE_READINESS.md) and [demo setup](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/demo-account-setup.md).

After these gates pass, confirm the verified fixture route and attach the tested QR as `weddingwin-review-vendor-qr.png`, then recheck the Apple-facing block against the selected build and its 4,000-byte limit. No submission is authorized by this draft.

Canonical package source: [review-notes-draft.md](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/review-notes-draft.md). Repository links above are adapted for this location.
