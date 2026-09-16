# Release verification — September 15, 2026

This is an additional verification record, not a replacement for the historical release matrix or physical-device reports. The checks below passed within their stated scope. App Review submission, final privacy declarations and physical build 7 acceptance remain incomplete. Build 4/5/6 records below retain their original scope; the latest build 7 checkpoint is at the end of this document.

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

The simulator exposed a review-modal header overlapping the status bar. The minimal local provider correction was rebuilt and visually verified at **2026-09-15 23:01:33.264 UTC** on **iPhone 17 Pro / iOS 26.5**. The Review test title and Close are fully below the status bar/Dynamic Island; the body and controls remain readable. The exact source hash and build-evidence filename are recorded under `headerCorrection` in the [native UI observations](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build6-sept15/native-review-ui-observations.json). This pass applies to the rebuilt local candidate only: the correction is **not present in uploaded build 6**. The owner approved Store build 7 after this local verification. The subsequent build 7 checkpoint below records its production build and upload progress.

No physical build 6 installation or message/draw push result is verified. Archive validation and Apple processing do not prove phone download availability; the previous iPhone installation failure is not presumed fixed by this feature build.

App Privacy and the remaining device/reviewer/policy gates remain open. A later fresh check corrected the earlier attachment observation: no attachments were uploaded to Feedback Assistant draft `120056018`. The report was subsequently updated with the HTTP 404 findings and submitted as **FB24795843** at 23:40 UTC, without files. The prepared local ZIP `work/app-store-build7-sept15/apple-build7-escalation-attachments-private.zip` contains the earlier build 5 error screenshots and the build 7 installation-result JSON. A local ZIP is not an uploaded attachment. No App Review submission or public release is recorded.


## Approved build 7 archive and submission checkpoint

The owner approved build 7 for the minimal review-modal safe-area correction after the local visual check described above. EAS production build `06659611-a344-4d30-a061-29028052916b` finished at **2026-09-15 23:09:01.429 UTC**. Source commit `e7297c7` and build-number configuration commit `0cae23d` are pushed to GitHub. There is no new diagnostic WebView prop in this source.

The archive was verified at **23:14:54.635 UTC**: `ca.weddingwin.app`, version `1.0.0 (7)`, arm64 iPhoneOS, iPhone/iPad families, iOS 26.0 SDK and minimum iOS 15.1. Strict signature verification passed; the signing certificate matches the embedded Store profile. The archive retains production APNs, `get-task-allow=false`, beta reporting and Sign in with Apple; its profile expires August 29, 2027 and has no device allowlist. IPA SHA-256: `ddce2a20a911753a0c397e10d5c11a887e792191a47283848e6ec281d787cf7b`. See the [build 7 archive record](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/build7-archive-verification.json).

The recorded source hash matches the visually verified header correction, the bundle contains the expected review/safe-area markers and its JavaScript differs from uploaded build 6. These checks support provenance; they are not a reproducible bytecode-to-source comparison or proof of Apple-side download availability, remote credential validity or device notification behavior.

EAS submission `722bb739-c323-4de7-b5b1-b0f0e9d48105` was scheduled at 23:15 UTC. A fresh App Store Connect row shows **1.0.0 (7) Processing**, with creation time 4:15 p.m. in that UI. The upload has reached Apple; **completed processing and internal-group assignment remain unverified at this checkpoint**. The separate version 1.0 draft still selects build 5. No build 7 physical installation or push-delivery pass is claimed.

Apple’s private Notes field was updated with the nonbinding review walkthrough and the controlled couple/vendor and Cedar credentials. A reload and exact DOM comparison confirmed the saved text: **3,636 characters / 3,643 UTF-8 bytes**. Passwords were not displayed or copied into the repository/package. Final access checks on the selected distribution build remain necessary. The completed native review cycle was reset from generation 2 to 3 at **23:06:53.891 UTC**, ready for another controlled test.

The latest case-number Gmail search still found only Apple’s acknowledgement for **102964472775**. The later updated diagnostic report was received as **FB24795843** at 23:40 UTC, without attachments. App Privacy and remaining device/policy gates are open. No App Review submission or public release has occurred.

A subsequent build 7 inspection ran on **Shane’s iPhone 16 Pro / iOS 26.5.2** at **23:17:23–23:17:47 UTC**. Device automation started successfully, resolving the earlier unlock/automation handoff. The helper skipped because the exact build 7 row was absent while Apple processing was underway; **zero Install taps** were made. This is neither an installation failure nor a successful app install. The private result is retained as `work/app-store-build7-sept15/install-inspect7.xcresult`; no raw private contents are copied here.


## Build 7 Apple processing and physical installation result

Apple subsequently completed processing build 7: upload **Complete**, **Ready to Submit**, 90 days of testing, **WeddingWin Internal QA** assigned (Internal, one tester), and What to Test saved with Save disabled. Apple build ID: `221d5f3d-a511-4df3-be32-a982c6489743`. These checks supersede the earlier Processing checkpoint above; they are not App Review submission or approval.

A guarded physical XCTest verified the exact **1.0.0 (7)** row on **Shane’s iPhone 16 Pro / iOS 26.5.2**, tapped Install **once at 23:18:46 UTC**, and accepted the exact standard replacement confirmation **once at 23:20:29 UTC**. That confirmation stated that app data might be lost. At **23:20:49 UTC**, the phone displayed:

> Could not install WeddingWin Canada. The requested app is not available or doesn’t exist.

No Open button appeared, and the error alert was left untouched. **Installation failed.** The helper’s guarded UI actions and error inspection succeeded; this is not a successful WeddingWin test. No physical build 7 app-function or push-acceptance checks could run. The authoritative [installation result](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/iphone-build7-installation-result.json) records the device, OS, build and single-attempt timing.

Build 7 therefore reproduces the earlier TestFlight distribution symptom despite a verified archive, completed Apple processing and correct internal-group assignment. The evidence does not establish the cause, identify another source/signing defect or justify an additional rebuild. Apple received the approved follow-up as [FB24795843](https://feedbackassistant.apple.com/feedback/24795843) on **September 15, 2026 at 23:40 UTC** (4:40 p.m. in the receipt UI). The receipt displays the new HTTP 404 report and correlation key and references case **102964472775**. It was submitted without attachments; the raw trace and ZIP remain local. The private Notes are saved, the version draft still selects build 5, and App Privacy and remaining acceptance/policy gates remain open. No App Review submission or public release occurred.


## Direct development install and foreground startup

A separate local **Apple Development-signed Release** copy of build 7, with embedded JavaScript and the same 75 source files, successfully built, installed and launched on **Shane’s iPhone 16 Pro / iOS 26.5.2**. The native `CFBundleVersion` was verified as **7**, bundle `ca.weddingwin.app`, and runtime process 78961 launched. This is not the App Store-signed/TestFlight distribution binary.

The physical `testDirectInstalledWeddingWinLaunch` smoke run at **23:29:35 UTC** passed **1 test, 0 failed, 0 skipped** (13.193 seconds overall; the test case took 3.093 seconds). WeddingWin was foreground with the signed-in couple home controls for the wedding website builder, vendor search, private messages and sign-out. No notification-retry banner or fatal/Metro error was visible. Prompts were left untouched and no app controls were tapped. See [direct-install verification](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-direct-build7-sept15/direct-install-verification.json); the local result bundle is `work/app-direct-build7-sept15/smoke-ui/native-startup.xcresult`.

This confirms direct installation and native foreground startup on the physical phone. It does **not** verify a fresh login, messages, scans, draw flow, TestFlight delivery or production APNs. The TestFlight build 7 installation failure remains unresolved; neither a distribution root cause nor another necessary code change is established. The later diagnostic follow-up was received as **FB24795843** at 23:40 UTC, without attachments. No App Review submission or public release occurred.


## TestFlight install-data failure captured

A later helper run beginning at host time **23:34:24 UTC** logged **one Install tap and one TestFlight alert** on the iPhone 16 Pro / iOS 26.5.2. The subsequent confirmation helper skipped because its exact-prompt guard did not match. The new alert text was not captured, so this record does not assert whether a replacement prompt appeared.

At authoritative device/server time **23:34:43.492861 UTC**, TestFlight’s install-data request returned **HTTP 404** for App Store app **6806603211**, client-identified **1.0.0 (7)**, numeric build **236341488**. The log reported **Error Downloading Install Data**, **NoProgress**, and null download/install progress. The failure is therefore at installation-data retrieval, before package progress; no package-installation error or app crash was observed in this sequence. The underlying cause remains unconfirmed. This trace alone does not justify app deletion or another rebuild.

The [redacted diagnostic report](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/TESTFLIGHT_INSTALL_DATA_FAILURE_2026-09-15.md) records the evidence and limits. The primary Console trace is retained only in `work/app-store-build7-sept15/testflight-install-data-trace-private.txt` with permissions `600`; raw account/session details are not copied into this package. Current App Store Connect checks show the same accepted internal tester and three builds, plus historical build 4 activity on the iPad (9th generation) / iPadOS 26.1 with 11 sessions. That iPad was unavailable at this checkpoint; the later connected-device comparison is recorded below.

Apple received the approved follow-up as [FB24795843](https://feedbackassistant.apple.com/feedback/24795843) on **September 15, 2026 at 23:40 UTC** (4:40 p.m. in the receipt UI). The receipt displays the new HTTP 404 report and correlation key and references case **102964472775**. It was submitted without attachments; the raw trace and ZIP remain local. App Review submission, public release, final App Privacy and distribution-build acceptance remain open. No app code changed for this investigation.


## Same iPad comparison — September 16, 2026 UTC

The previously successful **iPad (9th generation) / iPadOS 26.1** was reconnected. **One guarded TestFlight build 7 Update** produced the requested-app-unavailable/nonexistent installation alert. The diagnostic test passed by observing the failure; this is not successful WeddingWin installation or app acceptance.

At **2026-09-16 01:05:58.585875 UTC**, the physical-device trace recorded **HTTP 404** for the same TestFlight install-data endpoint, App Store app **6806603211**, numeric build **236341488**. It then reported **Error Downloading Install Data**, with no download/install progress. An older build 5 status job reports `priorInstalledVersion: 4`; this must not be interpreted as successful build 5 installation.

The redacted [diagnostic report](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/TESTFLIGHT_INSTALL_DATA_FAILURE_2026-09-15.md) contains the comparison and private support correlation key. The raw trace remains local at `work/app-store-build7-sept15/ipad-testflight-install-data-trace-private.txt` with permissions `600`; no raw account/session data is copied into the package. The same failure stage on the previously working iPad and the iPhone argues against an iPhone-only problem, but the underlying cause is still unknown. This result does not justify app deletion or another rebuild.

The new iPad evidence was sent to the existing Apple feedback **FB24795843** and receipt-verified at **01:09 UTC on September 16** (6:09 p.m. PDT on September 15), without attachments or private account identifiers. No app code, App Review submission or public release changed during this comparison.


### iPad retry after group reassignment

Build 7 was removed from and readded to the internal QA group; the group and reciprocal build details were reverified. One subsequent guarded Update on the same iPad again failed with **HTTP 404 at 2026-09-16 01:13:41.386387 UTC**, numeric build **236341488**, no Open button and no download/install progress. The diagnostic passed by observing failure. This makes **two iPad Update attempts**, both unsuccessful; no app acceptance pass is implied.

The cumulative private trace is `work/app-store-build7-sept15/ipad-after-group-refresh-trace-private.txt` (600), and the result is `work/app-store-build7-sept15/ipad-update7-after-group-refresh.xcresult`. Exact timestamps, private correlation keys and account/group checks are retained in the private verification JSONs in that directory. Both iPad results are now receipt-verified on FB24795843: the initial result at 01:09 UTC and the post-reassignment result at 01:15 UTC on September 16 (6:09 and 6:15 p.m. PDT on September 15). The second follow-up also includes the membership/Free Apps Agreement checks and package-size estimates. No attachments were uploaded. The underlying cause remains unconfirmed and no app code changed.
