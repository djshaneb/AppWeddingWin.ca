# WeddingWin policy and prize update — September 14, 2026

The user-authorized prize, disclosure, ticket-sharing and liability changes are implemented and published. This record supersedes the selected findings in the earlier terms consistency review; it does not declare the entire App Store release ready.

## Latest package and build follow-through

The approved natural demo-prize presentation and receiving-flag chat fix are in source `533821d`; build configuration 4 is committed as `58e3438`. Both scene 06 images were recaptured from the real interface, retaining actual raw build 3 provenance. The same interface is in build 4, and all fourteen branded images are uploaded to Apple in scene order 01–07 for each device class; all previews were visually checked. The nonbinding explanation remains under Read more and fixture entry/message safeguards are unchanged. See [capture results](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/screenshots/draw-capture-results.md).

Current full verification passed **1,034 Deno tests, 655 Node tests and all SQL suites**. The chat fix is deployed as `bd-chat-sync` version 56. Normal authenticated API sends/delivery/read passed in both directions (1872/1873); both accounts see ten messages and the original eight are unchanged. The iPad app also displayed both new messages with correct sender side and Delivered status. The demo accounts have no active push registrations or baselines, so this does not establish automatic or physical push delivery. See [verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/full-verify-result.json) and [chat evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/demo-chat-send-verification.json).

EAS production build 4 (`e73f9773-b079-4b5c-a462-883f56e9fb96`) has finished from clean `533821d`. Its signed archive is verified with iPhoneOS 26.0 SDK / Xcode 2600, production push entitlement, `get-task-allow: false`, and iPhone/iPad support. TestFlight upload completed at 2026-09-15 04:15:04 UTC; Apple processing has completed (Validated/Ready to Submit); build 4 is assigned to WeddingWin Internal QA (one existing tester), with What to Test saved. Build 4 selection for version 1.0 is saved and verified after reload. Physical installation and acceptance remain pending. See [archive verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-finish-sept14/build4-archive-verification.json).

App Store Connect is authenticated. Public listing fields/URLs, Canada-only free availability, Lifestyle/Business categories and manual release are saved. Private reviewer contact, sign-in credentials and private notes including vendor credentials were saved and persisted after reload; no private values are recorded in files. The sample QR attachment is uploaded, processed and persisted, and build 4 is selected/saved for version 1.0 with manual release retained. Copyright, final privacy/age/content-rights answers and functional reviewer draw access remain open. No App Review submission or public release is claimed. The sections below retain the earlier policy rollout's original evidence and test counts.

## Later couple-screen cleanup

At the user’s request, removed the explanatory paragraph about updated terms, the vendor prize deadline and liability from the native and website couple pre-scan screens. The vendor terms already contain these details. The agreement controls, linked policies and acceptance behavior are unchanged. This small display change passed 51 focused tests and TypeScript checks; the cleaner iPhone and iPad simulator layouts were visually verified. The physical development build succeeded and installed after the iPhone reconnected. Automatic launch was blocked by the phone’s lock; the user can unlock and open WeddingWin. The earlier full-suite results and successful phone installation below describe the preceding policy release.

## Current behavior

- Vendors may change their prize title, description and value before **11:00 a.m. on the wedding-show date in the show's local time zone**. Niagara's current deadline is October 18, 2026 at 11:00 a.m. America/Toronto (15:00 UTC). Saves at or after the deadline are rejected by the database. Existing earlier winner-notice locks remain effective.
- The couple's named Yes/No choice includes a short recorded prize summary and value. Read more exposes full recorded conditions and dates; the rules remain accessible. Verbal explanations supplement the written offer. Existing entrants retain their recorded prize terms.
- Ticket disclosures cover all vendors/exhibitors at the show and all its sponsors, including sponsors without a booth. This concerns information supplied for tickets under the applicable accepted registration/checkout disclosure. It does not widen a vendor's draw-entrant export or retroactively create consent. No still declines that named draw.
- Terms, rules and ticket provisions use stronger releases, hold-harmless wording, indemnities and liability limits to the extent permitted by law. They preserve non-waivable rights, fraud/wilful-misconduct exceptions and Wedding Win's accountability for personal information. This is not a promise of immunity or a legal opinion about enforceability.
- Early-entry behavior and the existing attendance-related text were left unchanged as instructed. The earlier difference in that wording is not represented as resolved.

## Acceptance and historical evidence

General Terms and Privacy versions are 2026-09-14. The base draw Rules ID remains 2026-09-01-in-person-entry with the prospective amendment and QR notice 2026-09-14-showday-prize-lock.

The new QR notice requires actual explicit first acceptance. A previous receipt, local cache, scan or draw cannot silently accept it. Existing vendors can expressly accept the exact responsibility amendment even when their offer is already activated; the system records fresh acceptance and an immutable new offer, retaining old evidence. The amendment cannot smuggle in prize, identity or schedule changes.

Live before/after digests matched for all 6 participation receipts, 111 offer versions, 8 entries, 4 draws and 18 settings rows. No live agreement was accepted, draw entered, winner selected or message sent during this rollout. A read-only demo-account check confirmed that the new notice was not already accepted, an explicitly false acceptance request was rejected with HTTP 428, and an unsigned list request was rejected with HTTP 401.

## Publication and validation

Published four policy pages, the Apple web sign-in policy version fields, QR widget 258 and vendor dashboard widget 328. Applied these three migrations:

- 20260915005744_enforce_vendor_prize_edit_deadline
- 20260915010147_require_explicit_showday_prize_notice
- 20260915010928_allow_exact_showday_responsibility_amendment

QR endpoints are ACTIVE at versions 76/77; all 36 deployed source copies match the reviewed source and JWT settings are preserved. Fifteen functions carrying signup-policy validation received only the two version-string changes, preserving each function's previously deployed authentication code. Those downloaded source copies also match exactly; unrelated local authentication differences were excluded.

Full `npm run verify` passed: **1,032 Deno tests, 653 Node tests and all SQL suites**. Focused SQL coverage includes 70 cases across the cutoff, explicit notice, supported synthetic setup and exact vendor amendment. Expo checks passed; lint has zero errors and seven existing warnings. Installed Firefox passed compact/expanded views at 320, 390 and 768 px, long text, reachable 44 px controls and Tab/Shift-Tab focus containment. Public policy pages return 200 and match the reviewed text. A final rendered-page check caught and corrected a duplicate script wrapper in the vendor widget deployment; all 38 inline vendor-page scripts now parse successfully and the vendor script matches the repository. The anonymous QR page requires sign-in and does not expose its authenticated widget.

The new native source was built, installed and launched on the connected iPhone as **1.0.0 (3), development-signed**. iPhone and iPad simulator agreement layouts were visually checked and remained unchecked. Native source SHA256: d95242a58405ace4a3e2c5c5f25d768f0ab8d0a5066dcaa3ed5e3f3ddecdad7e. This is not a new TestFlight/App Store upload or proof of final distribution-build acceptance.

## App Store follow-through

Both scene 06 replacements are now selected; their earlier versions remain historical previews. The approved display-only capture does not establish functional Yes/entry/winner access. The receiving-flag sending failure is fixed and verified through the normal API. Remaining sponsorship, functional draw-review access, privacy/retention/declarations, physical notification and final TestFlight checks are listed in the current Apple submission review. No App Review submission or public release occurred.

Evidence is retained in `work/terms-policy-update-sept14/` at the task workspace: full-verify-ui-followup-result.json, deployed-source-verification.json, history-preservation.json, public-render-check.json, migration-formatting-note.json, native-device-artifact.json, backend-report.md, legal-report.md, ui-browser-qa/REPORT.md and the deployment logs.
