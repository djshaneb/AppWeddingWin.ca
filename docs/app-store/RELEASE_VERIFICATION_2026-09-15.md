# Release verification — September 15, 2026

This is an additional verification record, not a replacement for the historical release matrix or physical-device reports. The checks below passed within their stated scope. App Review submission, final privacy declarations and physical build 6 acceptance remain incomplete. Build 4/5 records below are historical; the latest build 6 checkpoint is at the end of this document.

## Source and simulator provenance

The independent automated checks ran in the clean release checkout at `3b4d0d9`. The native UI observations used an owner-approved local diagnostic worktree from `9feabcb`, containing the same application code as build 5 plus one inspection-only prop on the main WebView: `webviewDebuggingEnabled={true}`. No production application code, configuration or backend data was changed for this pass.

The diagnostic app is Release configuration, version `1.0.0 (5)`, bundle `ca.weddingwin.app`, running on the iPhone 17 Pro simulator. It is not the App Store-signed binary or a physical TestFlight installation. The temporary worktree and generated native files were not committed or uploaded.

An initial diagnostic build with signing disabled showed a generic notification retry banner. Rebuilding the same source with normal simulator ad-hoc signing removed the banner and retained John and Jane's authenticated session. The corrected app passed strict signature verification and has the expected bundle identifier, bound Info.plist and sealed resources. The underlying Keychain OSStatus was not captured. This observation does not establish a defect in the production build.

## Existing automated checks

All commands exited successfully. No new tests were created and the independent test run left the checkout clean.

| Command or suite | Result |
| --- | --- |
| `npm run test:notifications` | 56 JavaScript, 17 notification SQL and 5 cron SQL checks passed |
| `npm run test:session-expiry` | 14 checks passed |
| Focused Deno notification and messaging suites listed below | 127 checks passed |

The independent run totals **219 passed, zero failed and zero skipped**. Its scope includes incoming-message identity changes without unread-count changes, historical-message suppression, native/website duplicate prevention, exact authenticated destinations, blocked accounts, token rollover, account switching, durable delivery and receipt handling, vendor messaging permissions, chat moderation and session recovery.

The focused Deno command used `deno test --node-modules-dir=none --no-lock --allow-read --allow-env` with these existing files under `supabase/functions/_shared/`:

- `notification_events_test.ts`
- `notification_delivery_test.ts`
- `notification_snapshot_test.ts`
- `push_reliability_test.ts`
- `bd_push_pagination_test.ts`
- `chat_membership_test.ts`
- `chat_moderation_test.ts`
- `chat_image_sharing_ui_test.ts`
- `chat_moderation_migration_test.ts`

A separate release-check command chain also completed with exit code 0:

```text
npm run typecheck
npm run test:draw-entry
npm run test:card-reset
npm run test:master-contacts
npm run test:draw-reset
npm run test:session-expiry
npm run test:contact-email
```

These commands provide additional source/fixture verification, not production mutations or live end-to-end evidence. The repeated session-expiry suite is already included in the 219-check count and is not counted again. No combined total is claimed for the additional command chain.

`npm run lint` also exited 0, with seven warnings and no errors. The warnings concern two unused declarations and five Hook dependency declarations in `app/(tabs)/index.tsx`; no automatic fixes or application edits were applied.

Startup error handling was also inspected: an empty pending-notification store returns `idle` and hides the retry banner; malformed saved data recovers; a genuine destination failure retains its intent for retry. A storage-read exception is currently caught by the same broad notification error handler, even before a pending intent is known. No separate reproducible production failure was found, and no source change was made.

## Native simulator observations

| Flow | Observed result and limit |
| --- | --- |
| Couple home and session | John and Jane signed in; normal home controls displayed with no notification error banner after the corrected diagnostic build launched |
| Inbox | Saved conversations loaded |
| Private conversation | Cedar & Light Photography's saved conversation and message composer loaded; no new message was sent |
| Report/block interface | Confirmation opened and Cancel returned successfully; no report or block was submitted |
| Photo picker | iOS private photo picker opened and cancelled; no attachment was selected or sent |
| QR Bingo | Event loaded with the isolated Willow & Bloom card and 0/1 scanned. The simulator camera cannot establish a physical QR-scan pass. No scan or entry was created. |
| Bingo contact editor | Existing name, contact email, required phone and optional wedding fields loaded. Cancel returned to native home without saving changes. |
| About | Support, Privacy Policy, Privacy Request, Terms, official draw rules and Delete account controls were present. No deletion or support message was submitted. |
| Vendor search and website builder | Previously observed native vendor search, real location autocomplete, venue results and authenticated website-builder bridge are recorded in the [submission check](SUBMISSION_CHECK_2026-09-15.md) and [scoped privacy observation](APP_PRIVACY_ANSWERS.md#scoped-native-webview-diagnostic-observation) |

These are representative simulator UI checks. They do not prove successful new-message delivery, photo upload, report enforcement, production push delivery or the full device/accessibility matrix.

## Remaining boundaries

This pass sent no new messages or push notifications, created no real draw entries, performed no production resets or contact exports, and did not finalize or publish App Privacy answers. The corresponding automated suites used existing local fixtures. No account was deleted.

Physical build 5 installation remains blocked. The owner has additionally reported that installation still fails on the phone running iOS 27.0; the separate [iPhone TestFlight build 5 report](IPHONE_TESTFLIGHT_BUILD5_REPORT.md) records the device investigation and its evidence limits. A reported retry is not a successful installation or a passed app test.

Earlier successful physical TestFlight build 4 tests, including two message notifications on iPad, remain documented in the [iPad report](IPAD_TESTFLIGHT_BUILD4_REPORT.md). They are not relabelled as build 5 phone evidence. Functional draw-review access remained open at that earlier checkpoint and was subsequently implemented/tested as recorded below. The remaining physical acceptance checks and final privacy/provider declarations stay open in [release readiness](RELEASE_READINESS.md).

The September 15 case-number search in the authorized WeddingWin Gmail account still returned only Apple's acknowledgement for case 102964472775. No substantive support answer was present in that search. A follow-up describing the owner's iOS 27 retry is prepared locally; no additional message has been sent.

The screenshot fixture cannot provide a full functional draw review: test participation is excluded from authenticated result delivery, as well as real prize notices. The separately approved implementation below provides functional review testing without changing those screenshot-fixture guards or production draw rules.

## Approved build 6 review workflow — later September 15 verification

Source commit `fd088ee` adds a server-authorized, explicitly nonbinding review workflow. It has separate state and notice tables, exact private account pairs, expiry, authenticated results, vendor-only reset and per-device test-notification opt-in. It does not create real consent, entries, winners, prize claims or email records. The original John and Jane / Willow screenshot fixture remains unchanged. See [review test instructions](REVIEW_TEST_MODE.md).

`npm run verify` completed with exit code 0, including lint, TypeScript, Expo dependency/doctor checks, the edge suites, production audit and the existing native/SQL flow suites. Lint still reports the seven previously recorded warnings and no errors. The full edge run passed 1,052 checks; two subsequently added executable endpoint-dispatch checks also passed. Final native review plus notification-intent checks passed 31 tests, including the defensive rejection of mixed production/review notification routes. The review-specific SQL suites passed 14 state-machine and 14 notification checks. Production notification SQL was independently rerun with both new migrations applied: all 17 checks passed. These overlapping runs are not presented as a unique combined test total.

The two approved migrations and three function updates were deployed to the WeddingWin App Backend after a dry-run limited to those migrations. The existing gateway settings were preserved: QR endpoints use their internal signed/native authentication; the push worker retains JWT verification. No seeds, roles, signing credentials or unrelated functions were changed.

A new private couple/vendor pair completed real email/password authentication. Live endpoint testing then passed context access for both roles, vendor-on, sample scan, No without entry, explicit Yes, selection, rejection of an incorrect sample answer, simulated verification, explicit Send, idempotent Send, recipient-only result access and vendor reset. Wrong-role actions, real entry requests from review accounts, stale generations, old results and an invalid session were rejected. The sample cycle was reset afterward. No device was opted in during this API test, so no push or email was sent; this is not physical push-delivery evidence.

### Build 6 archive, upload and Apple processing

EAS production build `c750818b-7cf5-45e0-a5ba-854e9df048ac` finished at **2026-09-15 22:49:49.924 UTC**. The signed archive passed strict signature verification: bundle `ca.weddingwin.app`, version `1.0.0 (6)`, iPhone/iPad device families, iOS 26.0 SDK, minimum iOS 15.1, production APNs entitlement, `get-task-allow=false`, beta reporting enabled and a Store distribution profile without a device allowlist. The profile expires August 29, 2027. See the [archive record](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build6-sept15/build6-archive-verification.json).

EAS submission `da4139f7-a52b-40ab-a0c7-f1cbb897d71e` finished at **22:51:27.899 UTC** and identifies that exact build. See the [redacted upload record](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build6-sept15/eas-submission-status-redacted.json). A subsequent fresh App Store Connect check independently confirmed build 6 upload complete and **Ready to Submit**, 90 days of testing, and assignment to **WeddingWin Internal QA** (Internal, one tester). What to Test was saved. Apple's build identifier is `f3a21a26-9d34-46eb-ad8d-43893847858b`. This does not mean the app was submitted to App Review, and it does not establish which build is selected in the separate version draft. See the [fresh Apple observation](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build6-sept15/app-store-connect-build6-observation.json).

Post-deployment verification matched all 28 downloaded function/dependency files to the deployment manifest. The four review tables have RLS and no anonymous/authenticated grants; 12 reviewed functions use invoker security. Security warnings were unchanged; new-object advisor findings were informational RLS-without-policy and unused-index notices. A read-only check after the live API cycle found zero production entries, draws, acceptances or email deliveries for the private pair; two isolated notices/events, zero deliveries/device opt-ins, and generation 2 reset/off. See [deployment and isolation evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build6-sept15/postdeploy/verification-summary.json).

### Later native simulator and physical-runner checkpoint

The build 6 native simulator checks completed the following observed paths, recorded in the [native UI observations](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build6-sept15/native-review-ui-observations.json):

| Check | Observed result |
| --- | --- |
| Ordinary account isolation | John and Jane's ordinary home did not show the review link |
| Review account authentication | Both new private couple and vendor accounts signed in successfully with email/password |
| Couple No/Yes | No preserved the unentered state; Yes changed it to Entered, which persisted across role switches |
| Vendor workflow | Selection, simulated checks plus answer 12, Verify and explicit Send completed and saved |
| Authenticated result views | View test result succeeded for both vendor and couple |
| Notification opt-in | Simulator correctly showed the physical-device-required guard; no physical push result is claimed |

The physical build 6 inspection runner failed **before its test started**, with “Timed out while enabling automation mode.” It made **zero Install taps**. The owner has been asked to unlock the phone; that handoff remains pending at this checkpoint. This is an automation-preparation failure, not a new TestFlight installation attempt or failure. The private runner result is retained locally as `work/app-store-build6-sept15/install-inspect6-result-private.json`; its raw contents are not copied into this package.

The simulator exposed a review-modal header overlapping the status bar. The minimal local provider correction was rebuilt and visually verified at **2026-09-15 23:01:33.264 UTC** on **iPhone 17 Pro / iOS 26.5**. The Review test title and Close are fully below the status bar/Dynamic Island; the body and controls remain readable. The exact source hash and build-evidence filename are recorded under `headerCorrection` in the [native UI observations](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build6-sept15/native-review-ui-observations.json). This pass applies to the rebuilt local candidate only: the correction is **not present in uploaded build 6**. The owner approved Store build 7 after this local verification. Its production build and upload have not yet started.

No physical build 6 installation or message/draw push result is verified. Archive validation and Apple processing do not prove phone download availability; the previous iPhone installation failure is not presumed fixed by this feature build.

App Privacy and the remaining device/reviewer/policy gates remain open. Apple Feedback Assistant has the approved report and two original error screenshots attached; its final upload-consent dialog awaits the owner's action-time confirmation, so that report has not yet been submitted. No App Review submission or public release is recorded.
