# Draft App Review notes

Status: **DRAFT — replace placeholders and revalidate the exact uploaded build.**

The text under “Conditional App Store Connect template” is not yet paste-ready. Replace every pending marker only from evidence recorded against the exact uploaded build. Apple permits up to 4000 bytes. Enter the primary account in the dedicated sign-in fields and put only the second account in Notes. Never store reviewer passwords in this repository.

## Internal verification record

The final local release-candidate source was exercised as a Release build in an iPhone 17 Pro Max Simulator running iOS 26.5. Earlier iPhone/iPad preparation runs supplied additional controlled cross-client evidence. The following native flows passed:

- Launch, role selection, email authentication and native couple/vendor menus.
- Native private-chat thread list and conversation UI.
- App-to-website and website-to-app text-message synchronization using the controlled reviewer pair. The website→app leg used the supported direction—active couple website to private/nonpublic vendor app—and rendered as an incoming native Simulator bubble.
- Chat report/close behavior on app and website, preserved blocked history, and no app composer. A BD-only external entry point can still create a thread until app sync discovers and closes it.
- Trusted QR payload matching, duplicate handling without state mutation, wrong-host rejection, QR scan progress, and vendor-draw surfaces. The final production build contains no emulation control. Separately, a controlled live direct replay against `bd-qr-bingo-sync` v13 returned 200 with one card/database row and the original scan timestamp unchanged.
- App icon installation and release-bundle launch.
- One-time website dashboard bridging and the embedded vendor dashboard without an unexpected Safari/Google launch; after the top-frame/subframe policy fix, the dashboard remained in-app and its Vimeo player was visibly embedded.
- Account deletion confirmation/cancel plus a live two-account backend deletion-preservation test.
- The latest generated iOS Release Info.plist was inspected and exposes only the native QR-camera usage description; no photo-library, microphone, or background-mode declaration remains.

These items are current local/backend release-candidate evidence but are **not equivalent to final TestFlight/physical-device verification**. Before submission, record a physical pass for Apple login, Google login, printed camera QR scanning, push in foreground/background/terminated states, Apple-linked deletion, iPad layout, and the final legally approved raffle rules.

### Local Release evidence

- Earlier disposable member `38975` verified the confirmation/success/logout flow and exposed two defects: the About screen could send a stale legacy JWT, and Brilliant Directories child metadata was removed after its parent. Both were fixed. The subsequently hardened preservation/redaction implementation is now active as `bd-delete-account` version 7 with JWT verification; the earlier complete shared-chat purge is superseded.
- Fresh disposable members `38978` and `38979` passed the deployed revised flow: bidirectional messages were visible before deletion; deleting `38978` removed its login/account-owned records, preserved `38979`'s read-only shared history, closed the thread, and caused new sends to return 423. Both fixtures and residual artifacts were then cleaned up.
- On a 13-inch iPad Pro (M5) Simulator, the Release app passed reviewer-couple `38971` login and native couple-menu rendering. The account's displayed first name is `App Review`.
- The controlled reviewer chat round trip passed without recording message content here: app→website text was visible in the authenticated Chrome thread; the active-couple website reply persisted after reload, was present in the database/API mirror, and appeared as an incoming native bubble in the private/nonpublic vendor app. An attempted inactive-vendor website send was correctly blocked by Brilliant Directories policy and was not counted as delivered.
- The focused WebView URL-policy suite passes **7/7**. Top-frame routing remains unchanged, while only HTTPS and `about:blank` subframes are allowed to remain embedded; `http:`, `javascript:`, `data:`, and `file:` subframes fail closed. The fresh current-source Release build completed in **38.2 seconds** on iPhone 17 Pro Max Simulator, iOS 26.5, and visibly retained the Vimeo iframe inside the vendor dashboard.
- Screenshot assets under `assets/app-store/screenshots/` include two clean primary iPhone 17 Pro Max marketing shots at `1320×2868` (`pro-max-01-couple-menu.png` and `pro-max-02-about.png`), nine 6.3-inch iPhone QA captures at `1206×2622`, and one clean iPad candidate at `2064×2752`. Do not describe more than the two Pro Max images as approved primary marketing shots.

These are local/live review-environment results, not evidence from a processed TestFlight build. The deployed backend includes revised deletion preservation, one-time website app-login exchange, browser-bound/replay-resistant OAuth attempts, PKCE-bound Google native exchange, linked-email consistency/login-throttle hardening, durable Expo retry/receipt expiry, production rejection of the Expo Go Apple audience unless explicitly enabled for development, same-sync website-close flushing, service-only expiring private-reviewer pair access, and idempotent controlled QR replay. The shared Deno suite passes **60/60**. The latest Release build passed on iPhone 17 Pro Max Simulator, iOS 26.5. Physical federated login/push/printed-QR, signing, TestFlight, provider/backups, and full iPad/accessibility rows remain. The iPad pass covers login/menu portrait smoke only.

## Reviewer setup state and blockers

Do not paste the draft below until all of these are resolved:

- Private/nonpublic vendor member `38970` and couple member `38971` are assigned to isolated review event `app-review-weddingwin-2026-38970`. A service-role-only, expiring chat allowlist restricts access to the exact reviewer pair; migrations `20260828221025` and `20260828221307` plus `bd-chat-sync` v38 and `bd-chat-status` v26 are live. This keeps the vendor listing nonpublic. The controlled app↔website text round trip passes in the supported directions, and the local Release vendor dashboard stayed in-app with Vimeo visibly embedded. Signed-out privacy, scan, opt-in, draw, exact uploaded-build verification, and a repeat from the processed TestFlight build still require recorded evidence.
- Use only `assets/app-store/sample-qr-review-vendor-38970.png` for review. Do not attach the legacy `23608` sample, which refers to a production-side vendor.
- The revised deletion flow passed a fresh two-participant email-account live test. Physical Sign in with Apple revocation, provider/backup handling, exact TestFlight repeat, and an owner/legal finite retention duration or criterion remain pending.
- Reporting closes the current website conversation and blocks/suppresses the reported member in the app. Same-sync closure of a newly discovered replacement website alias is deployed and tested. A fresh thread may still be created through an external website entry point before synchronization discovers it; do not describe this as website-wide preventive blocking.
- The one-time `/app-login` exchange, browser-bound OAuth attempts with replay rejection, Google PKCE native exchange, durable Expo ticket/receipt/retry worker, private-reviewer pair restriction, and production rejection of Expo Go's Apple audience are deployed and regression-tested. The controlled reviewer chat round trip also passed live/local; repeat it from the exact processed TestFlight build. Real Apple/Google identity-provider login and APNs delivery still require the exact physical TestFlight build.
- Native chat image sending is intentionally disabled for this release. Reviewer notes and fixtures must describe text chat only.
- Make vendor use of entrant data contractually and technically limited to draw administration and prize fulfilment. Entry is not consent to marketing.
- The official-rules page and draw controls are live, but qualified legal/owner approval of the rules, sponsor model, alternate free-entry operation, and vendor agreement remains a submission blocker. Production draw email is fail-closed and the review fixture always suppresses email.

## Release evidence required before finalizing notes

| Evidence | Current state | Release-ticket field |
| --- | --- | --- |
| Release commit/tag and deployed backend revision | The current auth/deletion/push/OAuth/chat backend is live and versioned in `SUPABASE_DEPLOYMENT_PROVENANCE.md`. The tested source is recorded by local tag `v1.0.0-rc.2`. Nothing has been pushed, signed, or represented in TestFlight. Record the commit and deployment checksums privately before submission. | `<COMMIT / TAG / BACKEND REVISION>` |
| Processed TestFlight build number and EAS/App Store Connect build ID | Pending | `<BUILD NUMBER / BUILD IDS>` |
| Physical iPhone/iPad Apple and Google login | Pending | `<TESTER / UTC DATE / DEVICES / EVIDENCE>` |
| Printed QR and foreground/background/terminated push | Pending | `<TESTER / UTC DATE / DEVICE / EVIDENCE>` |
| App↔website moderation and reviewer chat | Controlled current-thread closure passed and expiring exact-pair reviewer access is deployed. App→website visibility and the supported active-couple website→private-vendor-app reply passed, including reload persistence, database/API mirroring, and the incoming native bubble. Inactive-vendor website sending was correctly rejected. The documented pre-sync external-new-thread window and exact TestFlight repeat remain. | `<TESTER / UTC DATE / ACCOUNTS / EVIDENCE>` |
| Disposable cross-system deletion, including Apple revocation where applicable | Members `38978`/`38979` passed revised account-only deletion plus closed/blocked conversation and retained recipient history; Apple/physical/provider/backup and TestFlight repeats remain | `<TESTER / UTC DATE / DISPOSABLE ACCOUNT IDS / EVIDENCE>` |
| Reviewer-account privacy, safe draw data, rules, and support coverage | Pending | `<OWNER / LEGAL / OPERATIONS APPROVAL>` |
| Final WebView navigation/cookie hardening | Working-tree pass / TestFlight pending: focused URL tests **7/7**; fresh 38.2-second Release build kept the vendor dashboard in-app with Vimeo embedded; top-frame policy unchanged and unsafe subframes blocked | `<TESTER / UTC DATE / BUILD / NETWORK-LOG EVIDENCE>` |

## Conditional App Store Connect template

```text
WeddingWin connects engaged couples with wedding vendors and provides private messaging and QR Bingo features for participating wedding shows.

REVIEW ACCOUNTS
Primary couple account (also entered in the Sign-in required fields):
Username: <APP_REVIEW_COUPLE_EMAIL>
Password: <ENTER_ONLY_IN_APP_STORE_CONNECT>

Additional private vendor account:
Username: <APP_REVIEW_VENDOR_EMAIL>
Password: <ENTER_ONLY_IN_APP_STORE_CONNECT>

Account verification: <REPLACE AFTER FIX-01 THROUGH FIX-05 PASS: fictional data, active/non-expiring access, signed-out privacy, and controlled test data>

COUPLE FLOW
1. Launch the app and choose Couple.
2. Log in with the couple review account.
3. The home menu contains Website Builder, Vendor Search, Private Messages, and QR Bingo Scanner.
4. Vendor Search shows WeddingWin.ca profiles; a profile’s messaging action opens native chat.
5. Open Private Messages and confirm the controlled reviewer conversation is visible. The verified cross-client round-trip steps use the private vendor app and active couple website account as described in Vendor Flow below. Image sending is disabled in this release.
6. <AFTER FIX-07/DEV-04 PASS, INSERT THE VERIFIED PRINTED-QR STEPS FOR https://www.weddingwin.ca/qr?vendor_id=38970. STATE THAT IT USES THE ISOLATED REVIEW EVENT.>
7. <INSERT THE ISOLATED DRAW FLOW ONLY AFTER FIX-09 AND LEGAL/OWNER APPROVAL PASS.>

VENDOR FLOW
1. Launch the app, choose Vendor, and sign in with the private vendor reviewer account.
2. <INSERT THE VERIFIED DASHBOARD STEPS ONLY AFTER FIX-02 PASSES.>
3. Open Private Messages and the controlled conversation while the active couple account's website thread is open in an authenticated browser. Send fictional text from the vendor app and confirm it appears in the website thread. Reply from the active couple website and confirm the reply remains after website reload and appears as an incoming native vendor-app bubble. The inactive vendor website account cannot send by Brilliant Directories policy; that rejected path is not the website→app direction.
4. <INSERT VENDOR DRAW STEPS ONLY AFTER FIX-02 AND FIX-09 PASS; OTHERWISE STATE THAT THE FEATURE IS DISABLED FOR REVIEW.>

CHAT SAFETY
Reporting a conversation closes it on the website and blocks/suppresses the reported member in the app. Existing history remains read-only and the app removes the composer. A fresh thread created solely through an external website entry point may exist until the next app synchronization discovers and closes it; this is not preventive website-wide blocking. Ask the reviewer to test Report only with the disposable moderation fixture and provide the monitored reset contact.

ACCOUNT DELETION
With a disposable signed-in account, choose About → Delete Account, review the warning, and confirm Delete Account. An Apple-linked account may require Apple confirmation for revocation. Without a native session, current source opens the public request URL. Public logged-out/mobile-route verification: <PENDING>. Contact us for a fresh disposable account.
Current verification: disposable members `38978` and `38979` passed the deployed two-participant deletion behavior, including account-owned cleanup, login rejection, closed/blocked conversation, preserved recipient history, and rejected new sends. The final Release app's confirmation/cancel UI also passed on iPhone 17 Pro Max Simulator. Physical Sign in with Apple revocation, provider/backup retention, exact uploaded-build verification, and an owner/legal retention duration remain pending under `DEV-10`; do not describe those as complete.

PERMISSIONS
<REPLACE AFTER DEV-04 THROUGH DEV-08 PASS WITH THE EXACT VERIFIED CAMERA AND PUSH BEHAVIOR. PHOTO ATTACHMENTS ARE DISABLED IN THIS RELEASE.>

RAFFLE / DRAW INFORMATION
<INSERT ONLY AFTER LEGAL/OWNER APPROVAL: no-purchase method, sponsor/administrator, Apple non-involvement, rules URL https://www.weddingwin.ca/qr-bingo-vendor-draw-rules, territory/age, and draw-data purpose. State that review-fixture email is suppressed.>

Backend/account availability confirmation: <PENDING OWNER/OPERATIONS CONFIRMATION FOR THE FULL REVIEW WINDOW>
Review/reset contact:
<REVIEW_CONTACT_NAME>
<REVIEW_CONTACT_EMAIL>
<REVIEW_CONTACT_PHONE_IN_INTERNATIONAL_FORMAT>
```

## Required attachments / setup

- [ ] Attach `assets/app-store/sample-qr-review-vendor-38970.png` or a one-page PDF containing it.
- [ ] Verify event `app-review-weddingwin-2026-38970` remains isolated and the `38971` couple account's scan/entry/draw state is reset.
- [ ] Verify vendor `38970` remains absent from signed-out public directory/profile/search surfaces while its review-only dashboard, native text chat, and draw controls work in the exact build.
- [x] A normal, unreported text conversation between the two accounts was verified in the app, authenticated website thread, and database/API mirror. Recheck/reset it before submission. Do not ask reviewers to attach an image; image sending is disabled.
- [ ] Seed a separate disposable conversation if Apple needs to test report/block without destroying the normal messaging example.
- [ ] Confirm reviewer-fixture and production draw email remain suppressed in the release configuration. If email is later enabled, use only controlled inboxes until the signed/idempotent production fulfilment path is approved and retested.
- [ ] Verify the vendor cannot export the entrant contact list; only selected-potential-winner contact may be disclosed for verification/fulfilment, and no email, vendor term, or staff operation treats entry as marketing consent.
- [ ] Replace the moderation sentence with the exact behavior of the final deployed build. State the external website fresh-thread limitation unless a website-side prevention hook has been added and verified.
- [ ] Replace the raffle sponsorship sentence only after legal/owner approval and publication of final official rules.
- [x] Preserve the historical disposable email-account evidence and the revised two-participant `38978`/`38979` test record; abandoned fixture `38974` was cleaned up.
- [ ] Complete physical Sign in with Apple revocation, provider/backup checks, owner/legal retention approval, and the immutable uploaded-build deletion pass.
- [ ] Enter an international-format telephone number in App Review contact information.
