# App Store release readiness — September 14, 2026

Reconciled against source `533821d` (build configuration `58e3438`) and [TERMS-POLICY-UPDATE.md](TERMS_POLICY_UPDATE_2026-09-14.md). **All fourteen screenshot images are uploaded and Apple previews checked; the documents are prepared; public listing fields and release settings are saved. Submission remains on hold for functional draw-review access, remaining declarations/business decisions and distribution-build acceptance.** Build 4 is finished and archive-verified; TestFlight upload completed at 2026-09-15 04:15:04 UTC. No App Review submission or public release is recorded.

## Prepared and verified

- [x] Owner's launch choices recorded: Canada, free download, English (Canada), iPhone/iPad, seven branded scenes per class and manual public release.
- [x] Public listing fields separated from private review notes and internal checklists. Field lengths pass; no build or test-account commentary appears in the public text.
- [x] All fourteen branded screenshot files are uploaded and Apple previews checked, including both refreshed scene 06 images with approved natural fictional prize copy. Raw captures retain their actual build 3 provenance; the same scene UI is in build 4. Source/output hashes, dimensions and selected files are recorded in the [manifest](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/submission/screenshots.json). Apple shows 7/10 images in the 6.9-inch iPhone slot and 7/10 in the 13-inch iPad slot, in exact 01–07 order. Their previews were visually checked. Final physical TestFlight comparison remains pending.
- [x] John and Jane, Cedar & Light Photography and Willow & Bloom Floral Studio are used consistently. Profile photos and the eight-message sample conversation were saved and verified through normal app reads. The iPad website-builder capture was completed.
- [x] Approved notification changes implemented and deployed. Local verification passed; natural cron returned HTTP 200; one direct iPhone test received Expo ticket and receipt `ok`. Those checks did not establish automatic new-event delivery or visible physical notification behavior.
- [x] Approved prize/policy changes implemented and published: recorded prize summary with full-detail expansion, 11 a.m. event-local cutoff, separate ticket-sharing scope, prospective acceptance and preservation of historical evidence. Public pages return HTTP 200 and match the reviewed text.
- [x] The couple-screen explanatory paragraph was removed in `648e60f`. Agreement controls, linked policies, receipt version and separate Yes/No entry were preserved. Vendor prize and responsibility guidance remains in the vendor flow and terms.
- [x] Current full verification passed **1,034 Deno tests, 655 Node tests and all SQL suites**. Earlier policy-specific and display-cleanup evidence is retained in the update record. See [full verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/full-verify-result.json).
- [x] Current development-signed 1.0.0 (3) built and installed on the connected iPhone. The cleanup build's automatic launch was blocked by the phone lock. iPhone/iPad simulator layouts were visually checked. This is not a new Store upload or TestFlight result.

The earlier claim that the native prompt omitted recorded prize details and the old privacy-acknowledgement wording finding are superseded by the completed policy rollout. Existing attendance-related text and early-entry behavior were left unchanged as the owner requested; that difference is not marked resolved.

## Review access and functional gaps

- [x] The receiving-flag fix is deployed as `bd-chat-sync` version 56. Controlled normal authenticated API sends in both directions returned HTTP 200 with delivered/read results (messages 1872/1873). Both accounts see ten messages and the original eight are unchanged. See [two-way chat verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/demo-chat-send-verification.json). Physical TestFlight messaging remains to be checked. These demo accounts have no active push registrations/baselines, so the message check does not verify automatic push.
- [ ] Resolve the private vendor email-update/access issue if that account remains part of the review path. Couple email verification and ordinary Cedar login/read success do not verify the separate Willow account's full capabilities.
- [ ] Supply and test functional draw review access. The existing Willow fixture is display/scan-only: it can show the named prize prompt and No path, but cannot complete Yes entry, winner selection or notice delivery. Its recorded expiry is September 21, 2026 at 20:47:37.829 UTC. Do not submit the fixture as proof that those operations work.
- [ ] Verify the final account roles, sample QR, contact requirements and access duration on the submitted build. Verify the walkthrough's deletion instructions: deletion occurs after the other checks and removes the signed-in account. Arrange any needed follow-up access without promising an unprovided extra account. Enter credentials only in private Store fields.
- [ ] Update the private reviewer walkthrough if functional access replaces the current display-only fixture. The current [review notes](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/submission/review-notes.txt) explicitly describe that limitation.

## Owner, policy and Store decisions

- [ ] Confirm the Store developer/seller entity and the actual contest sponsorship arrangement. Current terms call Wedding Win the developer and limited platform sponsor for the app workflow, and the named vendor the vendor-promotion sponsor/operator/prize provider. The relationship to Apple's developer-sponsorship requirement remains unresolved; the policy update did not change the business arrangement.
- [ ] Complete production app/WebView and provider inventory, data types, purposes, linkage and tracking answers. Meta Pixel code in HTML alone does not establish tracking. See the [privacy worksheet](APP_PRIVACY_ANSWERS.md).
- [ ] Resolve shared-message retention/deletion handling, verify the privacy-request route and account-deletion behavior, and confirm staff report-response procedures.
- [ ] Confirm content/image rights and classify reachable ticket purchases, paid vendor plans, promoted placements and other digital upgrades. Free download is not proof that every feature or event is free.
- [ ] Complete the live age-rating questionnaire and confirm any applicable age override, categories and content-rights answers. See the [age-rating worksheet](METADATA_COMPLIANCE_CHECKLIST.md).
- [x] Authenticated Store record verified: WeddingWin Canada, Apple ID 6806603211, bundle ca.weddingwin.app, seller Shane Blair, active Free Apps Agreement, version 1.0 Prepare for Submission. Public fields/URLs, Lifestyle/Business categories, Canada-only free availability and manual release are saved. Build 4 is now Validated/Ready to Submit and assigned to WeddingWin Internal QA (one existing tester); What to Test is saved. Build 4 is selected and saved for version 1.0, confirmed after reload. See [Store verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-connect-readiness-2026-09-14.md).
- [ ] Confirm the copyright holder and final entry. Complete age-rating, content-rights and data-collection declarations and applicable remaining Store fields.
- [x] Private review contact was saved in App Store Connect and visually confirmed after reload. No private values are included in files. Sign-in credentials, private notes including vendor credentials, and the processed sample QR attachment are also saved and persisted after reload. This does not establish functional Yes/entry/winner access.

## Distribution build and final testing

- [ ] Obtain any required approval for remaining code/configuration fixes; document preparation does not authorize unrelated changes.
- [x] Started production build 4 from clean app source `533821d` using auto-increment; configuration 4 is committed/pushed as `58e3438`.
- [x] EAS build `e73f9773-b079-4b5c-a462-883f56e9fb96` finished. Archive verified: iPhoneOS 26.0 / Xcode 2600, production push entitlement, `get-task-allow: false`, iPhone/iPad. See [archive evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/build4-archive-verification.json).
- [x] Verified bundle/build identity, signing, production push, SDK, device families and archive encryption flag.
- [ ] Complete final privacy-manifest/required-reason API and actual provider/dependency reconciliation.
- [x] TestFlight upload completed at 2026-09-15 04:15:04 UTC (EAS submission 11bdeaf9-679b-450a-82c1-9971011c3eb4).
- [x] Apple processed build 4 as Validated/Ready to Submit; SDK/device/push properties match the archive checks.
- [x] Assigned build 4 to the existing WeddingWin Internal QA group (one tester) and saved What to Test.
- [ ] Confirm the user has installed build 4 and complete physical checks. Build 4 is selected/saved for version 1.0, and Save was disabled after reload. Physical checks remain pending.
- [ ] Run the final acceptance checks below and retain device, OS, build, date and result. Earlier simulator checks, development installs and provider receipts do not complete this stage.

| Flow | Remaining exact-build evidence |
| --- | --- |
| Couple/vendor email, Apple and Google sign-in; cancellation, recovery, relaunch, sign-out and account switching | Full physical TestFlight check |
| Couple home, vendor search, profiles and wedding website builder | Full physical TestFlight check |
| Private messages, refresh, enabled photo sending, report and block | Normal API send/delivery/read passed in both directions; complete physical TestFlight messaging and moderation checks |
| Message push | New-message dispatch; foreground/background/closed behavior; banner, sound, badge, tapping; permission denial/re-enabling; blocked senders and duplicate prevention |
| Draw notifications and routing | Real authorised test events through verification and explicit Send; token changes, sign-in routing and final production APNs behavior |
| QR permissions, current agreement, printed scanning, Yes/No, repeat scans and already-entered state | Functional review access and complete exact-build check |
| Couple/vendor resets and scoped exports | Fresh progress, preserved history, no duplicate entry and correct contact scope |
| Vendor draw | OFF→ON confirmation; prize save/deadline; entries, selection, verification and notice safeguards |
| About, support, privacy request and deletion | Current links, operational handling and deletion after other walkthrough checks |
| Display and resilience | iPad layout, camera/modals, large text, VoiceOver, keyboard, loading/errors, interruptions and offline/slow network |

## Artwork, submission and manual launch

- [x] Both scene 06 images recaptured with the approved natural prize presentation and full-details control. Current files are selected; previous captures remain historical evidence. See [capture results](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/screenshots/draw-capture-results.md).
- [x] Uploaded all fourteen selected images, seven per device class, in exact 01–07 order; visually inspected all Apple previews and confirmed persistence after reload for both device classes (including iPhone 6.5-inch inheritance). Existing hash/dimension/opacity validation remains recorded.
- [ ] Complete final physical TestFlight comparison and the content-rights declaration.
- [ ] Recheck public feature claims, private walkthrough, credentials, review contact, privacy answers and age rating against the exact selected build.
- [ ] Present the completed submission candidate for the agreed review checkpoint and submit with manual release selected when approved.
- [ ] Resolve Apple's review feedback. After Apple approval, obtain the owner's separate launch approval, then verify public installation, login and notifications.

## Evidence and public links

Current policy/source/build evidence: [TERMS-POLICY-UPDATE.md](TERMS_POLICY_UPDATE_2026-09-14.md). Notification implementation/deployment evidence: [test report](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/TEST-RESULTS.md), [deployment summary](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/backend-deployment.json) and [direct-device transport](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/single-device-transport.json). Historical Store build: [EAS history](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/eas-build-history.json). Earlier `package-review/` reports retain their original dates; use this checklist and the policy-update record where their findings have been superseded.

- Support: https://www.weddingwin.ca/about/contact
- Privacy: https://www.weddingwin.ca/about/privacy
- Privacy requests: https://www.weddingwin.ca/privacy-request
- Terms: https://www.weddingwin.ca/about/terms
- Draw rules: https://www.weddingwin.ca/qr-bingo-vendor-draw-rules
