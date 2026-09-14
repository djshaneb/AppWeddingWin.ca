# App Store release readiness — September 14, 2026

**Release remains blocked by the sponsorship/rules questions, native chat and reviewer access failures, incomplete privacy/retention decisions and final distribution-build acceptance.** See the [complete Apple submission review](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/APPLE-SUBMISSION-REVIEW.md). Notification repairs are pushed and deployed, natural cron completes successfully, and one direct iPhone test received an Expo ticket and receipt `ok`; final live-event and physical acceptance remain pending. Pre-fix test matrices and runbooks remain historical evidence.

## Scope and approval

- [x] Launch choices recorded: Canada, free, English (Canada), retain iPhone/iPad, seven branded scenes per class, manual launch.
- [x] Documentation preparation authorised.
- [x] Explicit “yes” received for the scoped notification code/configuration changes. This approval excludes unrelated private-reviewer authentication, fixture renaming and nullable vendor SEND changes.
- [x] Approved notification additions implemented, locally tested and deployed. Natural-cron completion and a single direct phone transport test passed; live new-event dispatch and physical presentation acceptance remain pending.
- [x] Notification source revision `faf553fbde1ffb79d9f0d5437e431cf461de4319` pushed to `codex/app-store-preparation`, excluding unrelated App Store documentation edits. Development verification app recorded as 1.0.0 (3); final Store distribution build selection remains pending.
- [ ] Prepare uploads and testing as the agreed plan progresses; present the completed package before submission.
- [ ] Obtain the user's go-ahead for the manual public launch.

## Prepared or checked

- [x] Human-readable listing, review notes, seven-scene capture plan, privacy/age-rating drafts and owner fields prepared.
- [x] Existing screenshot dimensions and representative images reviewed: no complete approved set exists.
- [x] iPhone and iPad support verified in current configuration.
- [x] Public support, privacy, privacy-request, terms and draw-rules URLs checked for reachability.
- [x] Public spelling Wedding Win Inc. and support email info@weddingwin.ca directly evidenced.
- [x] Current QR copy describes prior agreement, authorised early scanning, a simple named Yes/No choice and no automatic entry.
- [x] Historical test/build reports identified; they are not marked as final-build passes.
- [x] Clean baseline `7feee06` passed `npm run verify` on September 14: 843 Deno tests, 577 Node tests and SQL migration suites. Evidence: output `verification-baseline.json` and `verify-baseline.log`. This is **baseline-before-notification-work**, not proof that the live push failure is fixed or a processed TestFlight build passed.
- [x] Approved notification candidate passed full verification: 946 Deno tests, 633 Node tests (including 56 notification tests), 17 notification SQL tests and the existing SQL suites. Expo Doctor passed 18/18; lint reported zero errors and seven warnings. See [current test report](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/TEST-RESULTS.md) and [full verification log](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/full-verify.log).
- [x] Five additional restricted-role SQL cases passed for the subsequent cron timeout correction, which changes only the job's HTTP response wait from 5,000 to 180,000 milliseconds.
- [x] Both approved migrations and all five scoped Edge functions deployed ACTIVE; all 28 downloaded source files match, existing JWT settings are preserved and unsigned endpoint requests are rejected. The baseline suppressed all 28 historical message identities and queued zero deliveries. See [deployment summary](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/backend-deployment.json).
- [x] Natural 19:39 UTC cron run returned HTTP 200, `ok:true`, one member checked, two devices claimed, zero failures and zero notifications. Live new-message/draw dispatch is a separate pending check.
- [x] Updated WeddingWin 1.0.0 (3) Release build, development-signed, installed in place at 19:38:08–19:38:16 UTC and launched at 19:38:27–19:38:30 UTC. App/helper source matches the reviewed source. Actual simulator Home/About/inbox/Cedar conversation smoke checks passed.
- [x] Fresh phone registration at 19:38:32 UTC identifies Sound Of Harmony (23608). One targeted direct test at 19:39:24 UTC received Expo ticket `ok` and receipt `ok` at 19:39:42 UTC. See [single-device transport](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/single-device-transport.json).
- [ ] Confirm the visible banner, sound and tapping with the user and complete the physical permission/state matrix. iPhone Mirroring displays “iCloud Signed Out” and cannot supply visual confirmation; provider receipt success is not a presentation observation.

## Demo preparation update

- [x] Couple demo email confirmed through the genuinely received email and normal flow; normal login and chat status returned HTTP 200.
- [ ] Vendor demo inbox exists, but the app email update/verification request rejects the private vendor account status. The email update remains unresolved.
- [x] Standard JPEG exports resolved the earlier image acceptance failure. Willow and Cedar artwork plus the existing couple photo uploaded successfully and imported as canonical profile logos; identities, status and plans were preserved.
- [x] Ordinary Cedar & Light demo account created without a mailbox, welcome email or billing; normal login/chat status HTTP 200. The private Willow fixture remains separate.
- [x] Eight alternating photographer messages were saved through normal website forms, reloaded in order, and returned by normal app login/list/read.
- [ ] Native SEND still returns HTTP 403 from the receiving-flag compatibility issue; scoped code approval is pending.
- [x] Normal app refresh returned canonical Cedar and couple photos with all eight messages; both final scene04 captures visibly show them. The iPhone and iPad branded renders passed visual review.

- [x] Fourteen branded drafts prepared and source/output hashes checked: iPhone and iPad scenes01–07. Scenes06/07 use existing build3; earlier captures retain build2 provenance. Final TestFlight, content-rights and Store-preview acceptance remain pending.
- [x] The iPad03 capture blocker is resolved; the current confirmed-email capture and branded draft replace the old-email reference.
- [x] Both named scene06 prompts captured after the [approved demo-only backend change](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/screenshots/demo-draw-capture-scope.md). Scene06 is a nonbinding, display/scan-only synthetic fixture: the actual named Yes/No question was captured on both devices, No was used, and live checks confirmed zero entries, draws and deliveries. It does not establish functional Yes/entry/winner acceptance for App Review. The fresh fixture expires 2026-09-21T20:47:37.829Z (at most seven days); verify or provision appropriately authorized review access for Apple's later review and follow-up. Native app code was unchanged for these captures. Rejected old-name and needs-attention captures remain excluded and preserved as evidence.

## Current release blockers

- **Developer sponsorship:** current public rules and app text exclude Wedding Win from vendor-promotion sponsorship, while Apple5.3.1 requires developer sponsorship. Confirm the actual developer entity and operating arrangement; wording alone cannot resolve this. See [reviewer/compliance audit](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/package-review/reviewer-compliance-audit.md).
- **Account deletion and operations:** resolve retained shared-message content against Apple's deletion guidance; confirm report response procedures, any reachable paid digital upgrades, and image/content rights. See the same audit and [screenshot review](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/package-review/screenshots-build-audit.md).
- **Privacy and age rating:** inspect final production app/WebView traffic and provider collection, linkage and purposes. Complete current social-media and age-assurance questions and any terms-based age override. Meta Pixel code in public HTML is not a determination that the app tracks users. See [privacy/age audit](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/package-review/privacy-and-age-audit.md).
- The conversation receiving-flag issue was independently reproduced against the unchanged function. Review the [narrow native message-permission fix](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/native-message-permission-fix.md). The user approval question is pending; no code permission has been received and no fix is claimed.

- **Historical pre-fix push failure:** the original audit found repeated HTTP 500 pagination errors and no successful response in its retained window; rolling snapshots produced different counts. Approved repairs and the scoped scheduler timeout correction are deployed; natural cron now returns HTTP 200 successfully. Live new-message/draw-event delivery and full physical acceptance remain open.
- The updated development-signed app is installed and launched, and its fresh registration identifies Sound Of Harmony. A single direct Expo test has ticket and receipt `ok`; visible alert/sound/badge/tap behavior still needs confirmation. This test did not exercise the worker's new-message or draw-event path. Final TestFlight/production APNs acceptance remains unverified.
- EAS history shows the latest finished Store build is 1.0.0 (3), created September 2, 2026 from older source `6840adb`. App Store Connect processing is not currently verified. See the output `eas-build-history.json`; this historical build is not the current candidate.
- A new Store distribution candidate, Apple processing and exact-build physical TestFlight checks remain incomplete. The installed development-signed 1.0.0 (3) is separate from the older Store build with the same displayed version/build number.
- Final screenshot approval and Store previews, metadata owner fields and privacy-copy consistency remain incomplete. App Store Connect presented its sign-in screen during this audit; current seller, agreements, review contact, highest uploaded build and live settings are unverified. The private Willow reviewer fixture still needs working draw access; Cedar home/read success does not verify it.
- Public rules still describe vendor-specific prize/value/dates/odds information being presented before entry, while the current native Yes/No prompt omits those details. The September 14 public-page and source checks confirm this mismatch. Resolve it without silently weakening rules or expanding the user-requested simple prompt; any app/config change needs explicit code approval. The privacy wording draft is not proof of complete rules alignment.

## Finish before final build selection

- [ ] Verify the existing Store record/name/categories; obtain missing copyright, review contact and account-owned facts from the owner.
- [x] Scope, obtain permission for, implement and locally verify the notification changes.
- [ ] Obtain separate approval before any remaining unrelated code/config fixes; the notification approval does not cover them.
- [ ] Run the complete release checks against the frozen candidate; record command, result, date and source revision.
- [ ] Audit archive entitlements, signing, privacy manifest, capabilities and encryption classification.
- [ ] Upload the approved code/config candidate and wait for Apple processing; select the exact processed build.
- [ ] Verify reviewer accounts, current proof/access requirements, expiry and sample QR without publishing credentials.
- [ ] Align the public privacy page's old show-only/old-acknowledgement wording with current behavior, and record a resolution for the separate rules/entry-information mismatch. Preserve the simple Yes/No requirement; code/config changes retain their approval gate.
- [ ] Finalise actual privacy data types/purposes, tracking/provider inventory, retention handling and age-rating questionnaire.

## Final-build acceptance

Record device, OS, build, date and result for each flow. A prior simulator, development install or earlier TestFlight build does not complete this stage.

| Flow | Status |
| --- | --- |
| Couple/vendor email sign-in, relaunch, sign-out and recovery | Pending exact-build evidence |
| Apple/Google sign-in, cancellation and return to app | Pending exact-build evidence |
| Couple home, vendor search and website builder | Pending exact-build evidence |
| Private text chat, refresh, report/block; photos only where enabled | Couple email confirmed; eight website-saved messages and Cedar/couple photos verified by native read. Native SEND HTTP 403 remains; scoped fix approval, report/block and final-build evidence pending |
| Message push delivery and permission states | Local checks and natural cron HTTP 200 passed; 28 historical identities suppressed with zero deliveries. Updated phone installed; direct test ticket/receipt `ok`. Live new-message dispatch, visible banner/sound/tap and full physical state matrix pending |
| Draw notices, token rollover and notification destinations | Approved, implemented and locally tested; backend deployed and source/auth checked. Live draw-event dispatch, physical routing/state tests and TestFlight/production acceptance pending |
| Printed QR permissions, scanning, agreement, No/Yes, repeat scan and already-entered behavior | Pending exact-build evidence |
| Fresh progress after authorised reset; no duplicate entry | Pending exact-build evidence |
| Vendor save OFF→ON confirmation, failure and stale-response suppression | Pending exact-build evidence |
| Vendor entries, selection/verification and notice safeguards | Pending exact-build evidence |
| About links, public privacy request and disposable-account deletion | Pending exact-build evidence |
| Offline/slow network, interruption, keyboard and accessibility checks | Pending exact-build evidence |
| Full iPad layout/web views/modals/camera and overlay cleanup | Pending exact-build evidence |

## Artwork, submission and manual launch

- [x] Complete the seven-scene screenshot inventory on both device classes. All14 opaque branded PNGs pass source/hash/dimension checks. This completes the chosen count, not the remaining functional, rights or distribution-build gates.
- [ ] Confirm every chosen screenshot accurately represents the final submitted app and refresh any affected scenes after approved changes.
- [ ] Apply the chosen branding, captions and licensed/fictional content; inspect privacy and visual quality.
- [ ] Validate dimensions, opacity and final visual quality.
- [ ] Populate the existing Store record and inspect every scaled preview after upload.
- [ ] Enter credentials and App Review contact details through secure Store fields; verify all notes against the chosen build.
- [ ] Present the completed submission package to the user for the agreed review checkpoint before submission.
- [ ] Resolve any Apple review feedback; code/config changes still follow the explicit approval gate.
- [ ] After Apple approval, reconfirm support readiness and get the user's go-ahead before manual public launch.

## Public links

- Support: https://www.weddingwin.ca/about/contact
- Privacy: https://www.weddingwin.ca/about/privacy
- Privacy requests: https://www.weddingwin.ca/privacy-request
- Terms: https://www.weddingwin.ca/about/terms
- Draw rules: https://www.weddingwin.ca/qr-bingo-vendor-draw-rules

Reachability is complete; content consistency and final-build behavior are separate checks. The scoped backend deployment is recorded above; no App Store upload, submission or public release is claimed by preparing these files.

Demo photo evidence: [canonical imports](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/demo-avatars-canonical.json) and [normal app refresh](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/demo-avatars-native-refresh.json). The refresh operation sent zero messages.

Canonical package source: [release-readiness-checklist.md](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/release-readiness-checklist.md). Repository links above are adapted for this location.
