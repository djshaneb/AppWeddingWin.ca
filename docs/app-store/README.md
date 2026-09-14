# WeddingWin App Store release package

Updated September 14, 2026. Status: **release blocked; materials are being prepared**.

Start with the [Apple submission review](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/APPLE-SUBMISSION-REVIEW.md) for the complete audit and the [submission field pack](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/submission/README.md) for copy intended for App Store Connect. The gallery and internal test notes are review materials, not public listing content.

The agreed launch is Canada, free download, English (Canada), iPhone and iPad, seven branded scenes per device class, and manual public release. Fourteen images are prepared: scenes01–07 for each class. The chosen seven-scene inventory is complete; Apple accepts 1–10 per required class. Final submitted-build and Store-preview acceptance remain pending. Scene06 is a nonbinding, display/scan-only synthetic fixture: the actual named Yes/No question was captured on both devices, No was used, and live checks confirmed zero entries, draws and deliveries. It does not establish functional Yes/entry/winner acceptance for App Review. The fresh fixture expires 2026-09-21T20:47:37.829Z (at most seven days); verify or provision appropriately authorized review access for Apple's later review and follow-up. Native app code was unchanged for these captures.

The approved notification changes are implemented, tested, pushed at `faf553fbde1ffb79d9f0d5437e431cf461de4319` and deployed. Current verification passed 946 Deno tests, 633 Node tests, the SQL suites and Expo Doctor18/18. Natural cron returned HTTP200. One direct iPhone push received successful provider ticket/receipt responses; automatic new-event delivery, visible presentation and final TestFlight acceptance remain pending. See [current test results](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/TEST-RESULTS.md).

Local development build1.0.0(3) is separate from the older EAS Store build1.0.0(3), created September2 from source `6840adb`. App Store Connect showed its sign-in screen; its current record and processing status remain unverified. A fresh distribution candidate and exact-build testing are required.

The main open issues are developer sponsorship of vendor promotions, working native message send and reviewer draw access, entry-information and deletion-retention alignment, final privacy/age-rating and operational facts, and the final distribution build. Details and evidence are in the submission review. Remaining app/configuration fixes need explicit permission; the prior notification approval does not cover them.

## Current documents

- [Listing draft](APP_STORE_LISTING.md): customer-facing copy and remaining owner fields.
- [Review notes](APP_REVIEW_NOTES.md): reviewer walkthrough; credentials belong in secure fields.
- [Screenshot plan](SCREENSHOT_SHOT_LIST.md): seven scenes for each device family and old-image exclusions.
- [Public privacy wording proposal](PRIVACY_COPY_ALIGNMENT_DRAFT.md): narrow non-code draft; not published.
- [Privacy draft](APP_PRIVACY_ANSWERS.md): data matrix and unresolved live-inventory decisions.
- [Metadata and age rating](METADATA_COMPLIANCE_CHECKLIST.md): questionnaire drafts and owner decisions.
- [Readiness checklist](RELEASE_READINESS.md): completed, pending and approval-gated work.

Earlier repository test matrices, signing runbooks, dependency reports and deployment records contain historical evidence. Their old build numbers, test counts, deployments and QR instructions must not override this package or be presented as final-build validation. Preserve that history and reconcile applicable checks against the actual release candidate.

## Current behavior

Couples complete contact details and accept the QR Bingo agreement before scanning. During organizer-authorized scanning, an enabled vendor can offer “Enter {vendor}’s draw?” with Yes and No. Yes enters under the prior agreement; No keeps scan progress without entering. Scanning never enters automatically. Authorized early scanning is supported. The entry prompt does not repeat the agreement or introduce another consent step.

Recent source/release work includes confirmation after a saved vendor OFF→ON change, named repeat-scan feedback, card reset support, and an administrator export based on recorded participation evidence. These facts do not replace testing the final processed build.

Public support, privacy, privacy-request, terms and draw-rules pages are reachable. The privacy page still contains older show-only entry wording; a narrow consistency review remains. No live-page change is included in this documentation task.

Historical repository references: [release test matrix](RELEASE_TEST_MATRIX.md), [signing and TestFlight runbook](SIGNING_TESTFLIGHT_RUNBOOK.md), [dependency audit](DEPENDENCY_AUDIT.md), [deployment provenance](SUPABASE_DEPLOYMENT_PROVENANCE.md), [reviewer account procedures](REVIEWER_ACCOUNTS.md), and [earlier privacy policy draft](PRIVACY_POLICY_REPLACEMENT_DRAFT.md). Their dated evidence remains preserved; current readiness is governed by this package.

Canonical package source: [release-documents.md](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/release-documents.md). Repository links above are adapted for this location.
