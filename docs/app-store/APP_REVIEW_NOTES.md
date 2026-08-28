# Draft App Review notes

Status: **DRAFT — replace placeholders and revalidate the exact uploaded build.**

The text under “Conditional App Store Connect template” is not yet paste-ready. Replace every pending marker only from evidence recorded against the exact uploaded build. Apple permits up to 4000 bytes. Enter the primary account in the dedicated sign-in fields and put only the second account in Notes. Never store reviewer passwords in this repository.

## Internal verification record

An earlier preparation snapshot was exercised as a Release build in an iPhone 17 Pro simulator running iOS 26.5. The following native flows were observed in that prior QA:

- Launch, role selection, email authentication and native couple/vendor menus.
- Native private-chat thread list and conversation UI.
- App-to-website and website-to-app text-message synchronization using controlled test accounts.
- Chat report/close behavior for one reported conversation; this did not prove durable member-level blocking across all app and website entry points.
- QR payload matching through emulated URL input, QR scan progress, and vendor-draw surfaces.
- App icon installation and release-bundle launch.

These items are **not current release evidence and are not equivalent to final TestFlight/physical-device verification**. Before submission, rebuild the exact tagged source and record a fresh pass for Apple login, Google login, printed camera QR scanning, push in foreground/background/terminated states, complete account deletion, iPad layout, report-and-user-block behavior, and the final legally approved raffle rules.

### Current working-tree Release evidence

- On an iPhone 17 Pro Simulator, fresh disposable email member `38975` completed About → Delete Account. QA observed the confirmation UI, `Account deleted` success alert, and logged-out role chooser. Backend verification found the Brilliant Directories user missing, subsequent email login rejected with HTTP 401, and zero remaining identity-cache, push, Edge-profile, chat, and raffle rows.
- The first deletion attempt exposed two defects: the About screen could send a stale legacy JWT that the Edge Function rejected, and Brilliant Directories child metadata was being removed after its parent. Both were fixed; `bd-delete-account` version 3 is the active deployment with `verify_jwt=true`, and the full fresh-account test passed. Residual Supabase rows from abandoned disposable member `38974` were also purged.
- On a 13-inch iPad Pro (M5) Simulator, the Release app passed reviewer-couple `38971` login and native couple-menu rendering. The account's displayed first name is `App Review`.
- Screenshot assets under `assets/app-store/screenshots/` include two clean primary iPhone 17 Pro Max marketing shots at `1320×2868` (`pro-max-01-couple-menu.png` and `pro-max-02-about.png`), nine 6.3-inch iPhone QA captures at `1206×2622`, and one clean iPad candidate at `2064×2752`. Do not describe more than the two Pro Max images as approved primary marketing shots.

These results are current working-tree evidence, not evidence from a committed/tagged or processed TestFlight build. The email-account deletion pass does not cover Sign in with Apple revocation, physical-device behavior, backups, or every external provider. The iPad pass covers login/menu portrait smoke only, not the full iPad layout/accessibility matrix. Before submission, repeat required rows against the immutable uploaded build and complete physical Apple/Google login, printed camera QR, push in every state, VoiceOver, moderation, privacy/legal, and raffle-rule approval.

## Reviewer setup state and blockers

Do not paste the draft below until all of these are resolved:

- Private/nonpublic vendor member `38970` and couple member `38971` are assigned to isolated review event `app-review-weddingwin-2026-38970`. The fixture has a dedicated sample QR, fictional prize data, no production entrants, and suppressed email delivery. Couple `38971` passed working-tree Release login/menu on the iPad Simulator; vendor login/dashboard, signed-out privacy, native text chat, scan, opt-in, draw, and exact uploaded-build verification still require recorded evidence.
- Use only `assets/app-store/sample-qr-review-vendor-38970.png` for review. Do not attach the legacy `23608` sample, which refers to a production-side vendor.
- The final account-deletion function and purge migrations are deployed, and the fresh disposable email-account Simulator/backend path passed. Physical Sign in with Apple deletion/revocation, provider/backup retention, and the complete tagged-build repeat remain pending. The current purge removes the entire shared conversation, including the other participant's copy; owner/legal/product must approve and disclose that behavior or require an implementation change.
- Report/block hardening is deployed. Reporting closes the current website conversation and blocks/suppresses the reported member in the app. A fresh thread may still be created through an external website entry point until synchronization discovers and closes it; do not describe this as website-wide preventive blocking.
- Native chat image sending is intentionally disabled for this release. Reviewer notes and fixtures must describe text chat only.
- Make vendor use of entrant data contractually and technically limited to draw administration and prize fulfilment. Entry is not consent to marketing.
- The official-rules page and draw controls are live, but qualified legal/owner approval of the rules, sponsor model, alternate free-entry operation, and vendor agreement remains a submission blocker. Production draw email is fail-closed and the review fixture always suppresses email.

## Release evidence required before finalizing notes

| Evidence | Current state | Release-ticket field |
| --- | --- | --- |
| Release commit/tag and deployed backend revision | Backend deployed; commit/tag provenance pending | `<COMMIT / TAG / BACKEND REVISION>` |
| Processed TestFlight build number and EAS/App Store Connect build ID | Pending | `<BUILD NUMBER / BUILD IDS>` |
| Physical iPhone/iPad Apple and Google login | Pending | `<TESTER / UTC DATE / DEVICES / EVIDENCE>` |
| Printed QR and foreground/background/terminated push | Pending | `<TESTER / UTC DATE / DEVICE / EVIDENCE>` |
| App↔website moderation, including current-thread close and external new-thread attempts | Pending | `<TESTER / UTC DATE / ACCOUNTS / EVIDENCE>` |
| Disposable cross-system deletion, including Apple revocation where applicable | Email member `38975` passed on working-tree iPhone Simulator/backend; Apple/physical/tagged-build repeat pending | `<TESTER / UTC DATE / DISPOSABLE ACCOUNT IDS / EVIDENCE>` |
| Reviewer-account privacy, safe draw data, rules, and support coverage | Pending | `<OWNER / LEGAL / OPERATIONS APPROVAL>` |
| Final WebView navigation/cookie hardening | Pending | `<TESTER / UTC DATE / BUILD / NETWORK-LOG EVIDENCE>` |

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
5. <AFTER FIX-04/SIM-04 PASS, INSERT THE VERIFIED CONTROLLED TEXT-CHAT STEPS. IMAGE SENDING IS DISABLED IN THIS RELEASE.>
6. <AFTER FIX-07/DEV-04 PASS, INSERT THE VERIFIED PRINTED-QR STEPS FOR https://www.weddingwin.ca/qr?vendor_id=38970. STATE THAT IT USES THE ISOLATED REVIEW EVENT.>
7. <INSERT THE ISOLATED DRAW FLOW ONLY AFTER FIX-09 AND LEGAL/OWNER APPROVAL PASS.>

VENDOR FLOW
1. <INSERT THE VERIFIED PRIVATE VENDOR LOGIN STEPS ONLY AFTER FIX-02 PASSES.>
2. <INSERT THE VERIFIED DASHBOARD STEPS ONLY AFTER FIX-02 PASSES.>
3. <INSERT THE VERIFIED NATIVE CHAT STEPS ONLY AFTER FIX-02 AND SIM-04 PASS.>
4. <INSERT VENDOR DRAW STEPS ONLY AFTER FIX-02 AND FIX-09 PASS; OTHERWISE STATE THAT THE FEATURE IS DISABLED FOR REVIEW.>

CHAT SAFETY
<REPLACE AFTER SIM-05 PASSES WITH THE EXACT APP/WEBSITE REPORT-AND-BLOCK BEHAVIOR.> Ask the reviewer to test Report after normal messaging, and provide the monitored reset contact. Do not claim that the external website prevents creation of every fresh thread unless a website-side creation hook has been implemented and verified.

ACCOUNT DELETION
With a disposable signed-in account, choose About → Delete Account, review the warning, and confirm Delete Account. An Apple-linked account may require Apple confirmation for revocation. Without a native session, current source opens the public request URL. Public logged-out/mobile-route verification: <PENDING>. Contact us for a fresh disposable account.
Working-tree verification: fresh disposable email member `38975` passed the native confirmation/success/logout flow and post-delete Brilliant Directories/Supabase checks on an iPhone 17 Pro Simulator. Physical Sign in with Apple revocation, provider/backup retention, and exact uploaded-build verification remain pending under `DEV-10`; do not describe those as complete.
Open product/legal decision: deletion currently purges the complete shared conversation record, including the counterpart's copy. Do not present that consequence to reviewers or users until the UI warning and published policy match the approved behavior.

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
- [ ] Seed one normal, unreported text conversation between the two accounts. Do not ask reviewers to attach an image; image sending is disabled.
- [ ] Seed a separate disposable conversation if Apple needs to test report/block without destroying the normal messaging example.
- [ ] Confirm reviewer-fixture and production draw email remain suppressed in the release configuration. If email is later enabled, use only controlled inboxes until the signed/idempotent production fulfilment path is approved and retested.
- [ ] Verify the vendor cannot export the entrant contact list; only selected-potential-winner contact may be disclosed for verification/fulfilment, and no email, vendor term, or staff operation treats entry as marketing consent.
- [ ] Replace the moderation sentence with the exact behavior of the final deployed build. State the external website fresh-thread limitation unless a website-side prevention hook has been added and verified.
- [ ] Replace the raffle sponsorship sentence only after legal/owner approval and publication of final official rules.
- [x] Verify the fresh disposable email-account deletion path on the working-tree iPhone Simulator/backend; member `38975` passed and abandoned fixture `38974` was cleaned up.
- [ ] Repeat deletion on the immutable uploaded build and complete physical Sign in with Apple revocation, provider/backup-retention, and shared-conversation policy verification.
- [ ] Enter an international-format telephone number in App Review contact information.
