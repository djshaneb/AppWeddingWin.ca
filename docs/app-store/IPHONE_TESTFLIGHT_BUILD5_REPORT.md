# WeddingWin build 5 — physical iPhone installation blocked

Status recorded September 15, 2026, updated through the later iOS 27 device checks and user-reported manual retry. **Build 5 finished in EAS, passed archive checks, uploaded successfully and was processed and assigned to internal QA by Apple. Three instrumented attempts failed—twice on an iPhone 15 running iOS 17.4.1 and once on an iPhone 16 Pro—with “The requested app is not available or doesn’t exist.” After the iPhone 15 updated to iOS 27.0, the user reported one additional manual attempt as “could not install”; its complete alert text has not been captured. The newer phone was using the verified tester account; its existing development build 3 remains installed. The latest automated inventories, taken before that manual retry, showed build 5 installed on neither phone. No successful installation or build 5 iPhone functional test has been reported or verified.** TestFlight preparation passes are separate from app acceptance. No App Review submission or public release has occurred.

## Verified preparation and current Apple availability

- At the initial preparation checks, Apple's official TestFlight app, version 4.3.1, was installed on the authorized iPhone 15 running iOS 17.4.1. The later iOS 27 change is recorded separately below.
- The separate local XCTest helper passed five preparation tests in runs 02–06: App Store inspection/search; bounded TestFlight accessibility inspection; acquisition of the exact Apple TestFlight result; opening the TestFlight welcome screen; and read-only inspection of WeddingWin's TestFlight listing. These are five helper/preparation passes, not WeddingWin functional passes.
- The acquisition check distinguished the sponsored result from TestFlight using the observed TestFlight title, Apple publisher and acquisition control in the same result cell.
- Before the replacement upload, a fresh authenticated App Store Connect inspection showed WeddingWin builds 2, 3 and 4 as **Expired**, with no available internal group build or Add Build choice. This supersedes earlier statements that build 4 is currently available for a new TestFlight installation; the cause of expiry is not established here. Build 5's verified assignment below resolves that group-availability blocker.
- The existing tester is accepted. No new invitation or invitation resend has been sent during this follow-up.

The helper method names are `testOpenAppStoreAndInspectKnownControls`, `testInspectTestFlightResultAccessibility`, `testAcquireVerifiedAppleTestFlight`, `testOpenTestFlightWelcome` and `testInspectWeddingWinTestFlight`. The separate runner operates installed applications and does not replace WeddingWin with a development build. No WeddingWin functional test has run on this iPhone during this follow-up.

## Approved replacement build

- EAS build ID: `0085d7a8-01a3-4042-8580-790eca0e8b4c`.
- Last observed EAS build state: **FINISHED**. The signed archive passed signature, production push and SDK 26 checks.
- TestFlight submission ID: `7c0c11c2-4705-47a0-bdb6-35eaaeb00f55`; EAS submission state **FINISHED** at `2026-09-15T20:40:36.901Z`.
- Authenticated Apple UI verified at 20:45 UTC: build 5 is **Complete / Ready to Submit**, with **90 days** remaining. What to Test is saved, and the build is assigned to the existing **WeddingWin Internal QA** group; Apple shows **1 group / 1 internal tester**.
- After both phones failed, an authenticated Apple refresh after 21:12 UTC still showed build 5 **Complete / Ready to Submit**, **90 days**, and the WeddingWin Internal QA group with **1 invite**; the installs field displayed a dash. This does not establish an install.
- Intended app identity: WeddingWin Canada, version `1.0.0`, build `5`, bundle `ca.weddingwin.app`.
- Source revision submitted to EAS: `1e45234e527e96e21553ebb48f8943d25902b3fe`.
- The existing production profile automatically incremented `expo.ios.buildNumber` from `4` to `5`. That configuration change is recorded in commit `eb87b3a`.
- Application code and `eas.json` are unchanged for this rebuild. The clean source before this increment matched build 4's application/configuration content; intervening changes recorded documentation and test evidence.

The user approved the replacement build and continued testing. Build completion, archive verification, upload, Apple processing and group assignment are verified. They do not establish iPhone installation or app acceptance, which must be verified separately. Apple's Ready to Submit state is not an App Review submission.

## Independent artifact and signing audit

A read-only audit found no packaging, source, compatibility, signing or upload mismatch that presently justifies another rebuild. The JavaScript bundle is identical to build 4, the compiled executable/framework code matches after excluding signature data, signatures verify, and the main app configuration differs only by the approved build number. Apple shows the binary **Validated** and internal testing available for 90 days. The exact App Store provisioning profile is **Active**, expires August 29, 2027, and matches the app; the portal lists the distribution certificate with the same expiration. A fresh portal certificate download was blocked, so no new portal-to-archive fingerprint match is claimed. Detailed evidence is in the private local `work/app-store-build5-sept15/build5-independent-audit.md`.

The cause remains unconfirmed. No app code/configuration, signing asset or new build was changed for this audit. A further rebuild requires new evidence of a fixable artifact/signing problem or an Apple request; repeating the same validated payload is not currently justified.

## Verified iPhone 15 installation blocker

TestFlight displayed WeddingWin Canada `1.0.0 (5)`, **90 days**, and Install. The two actual Install taps produced the same alert:

> Could not install WeddingWin Canada.
> The requested app is not available or doesn’t exist.

| Check | Verified outcome |
| --- | --- |
| Run 09, approximately 20:47 UTC | First verified build 5 Install tap; TestFlight displayed the error above. Screenshot: `work/app-store-build5-sept15/testflight-install-prompt-private.png`. |
| Run 10 | Retry guard skipped because the prior alert was already absent. No Install tap occurred; this is neither an installation attempt nor a functional pass. |
| Run 11, approximately 20:50 UTC | Second actual Install tap after rechecking the account and current listing; the same error appeared. Run 10 did not perform a refresh or Install tap. Screenshot: `work/app-store-build5-sept15/testflight-install-retry-error-private.png`. |
| Scoped inventory, 20:50:34 UTC | The exact `ca.weddingwin.app` query returned no installed app. |

The five initial preparation passes in runs 02–06 remain the recorded preparation count. Subsequent listing inspection/refresh and the two Install attempts are procedural checks, not additional WeddingWin functional passes. A successful automation tap does not turn the resulting failed installation into a product pass.

Read-only account checks at 20:49 UTC showed developer membership renewal on November 28, 2026, the Program License Agreement accepted August 29, 2026, and the Apple Developer Agreement accepted November 28, 2025. App Store Connect showed the **Free Apps Agreement Active**, effective August 29 through November 27, 2026. No agreement changes were made; the release remains free and Canada-only.

An account/team distribution issue is a possible explanation, **not a confirmed cause**. In a [similar Apple Developer Forums report](https://developer.apple.com/forums/thread/841482), an App Store Connect engineer recommended contacting support with App IDs and Team ID. That other case does not diagnose this one. After the second phone reproduced the issue and the independent audit found no justified rebuild, the user explicitly approved sending the report. Apple Developer Support accepted the report at approximately **21:17:50 UTC** and issued a case confirmation. The submitted report includes both phones’ failures and the audit findings. The form had no attachment input: **installation-error screenshots have not been transmitted**. The message requested a way to attach them, and the confirmation email is being checked for that route. The private local case record retains the case identifier. Opening a support case does not establish the installation failure’s cause.

## Verified iPhone 16 Pro installation blocker

The alternative connected device is an iPhone 16 Pro running iOS 26.5.2, with Developer Mode enabled and TestFlight 4.3.1 installed. Its initial scoped inventory showed WeddingWin `1.0.0 (3)`, marked `builtByDeveloper: true`. TestFlight initially showed only the previously tested **“weddingwin3 / Build Removed”** listing under a different Media & Purchases account. The initial inspection was skipped by an authentication/agreement guard; subsequent account navigation checks are preparation evidence, not WeddingWin functional passes.

The user explicitly approved switching Media & Purchases after the confirmation explained its effects on the App Store, Apple Music and Apple TV. The user completed authentication directly; automation entered no credentials. At 21:09 UTC, `work/app-store-build5-sept15/other-phone-account-signin-status-private.png` verified the approved tester account in Media & Purchases while **the main iCloud account remained unchanged**. The verified initial TestFlight account screenshot is `work/app-store-build5-sept15/other-phone-testflight-settings-private.png`.

After the switch, TestFlight displayed WeddingWin Canada `1.0.0 (5)`, **90 days**, and Install, captured in `work/app-store-build5-sept15/other-phone-build5-listing-private.png`.

| Check | Verified outcome |
| --- | --- |
| Run 14 | Skipped before tapping because Install was not hittable. This was not an installation attempt. |
| Runs 15–16, approximately 21:11 UTC | One actual installation attempt: run 15 tapped Install and opened the existing-app replacement confirmation; run 16 accepted that confirmation as part of the same attempt. TestFlight displayed “Could not install WeddingWin Canada. The requested app is not available or doesn’t exist.” Screenshot: `work/app-store-build5-sept15/other-phone-replacement-result-private.png`. |
| Scoped inventory, 21:11:57 UTC | Exact bundle `ca.weddingwin.app` remained `1.0.0 (3)`, `builtByDeveloper: true`. Build 5 was not installed. Evidence: `work/app-store-build5-sept15/other-phone-postfailure-inventory-private.json`. |

The existing development app was retained. These instrumented checks establish **three installation attempts: two on iPhone 15 and one on iPhone 16 Pro**. The additional user-reported manual attempt after the iPhone 15 OS update is separate evidence, described below. There are no build 5 iPhone functional test results.

## Later iOS 27 check and user-reported retry

Read-only checks confirmed the same iPhone 15 now runs **iOS 27.0 (24A437)**, with Developer Mode enabled and pairing/tunnel connected. Its earlier saved details reported iOS 17.4.1 (21E236). The latest exact app inventories showed no `ca.weddingwin.app` on that phone, while the iPhone 16 Pro still had `1.0.0 (3)`, `builtByDeveloper: true`. These inventory checks preceded the manual retry reported below. Local evidence is `work/app-store-build5-sept15/jacqueline-current-details-check-private.json`, `jacqueline-current-inventory-check-private.json` and `shane-current-inventory-check-private.json` in the same directory.

One prepared-helper check after the OS change failed before UI automation initialized: **“Timed out while enabling automation mode.”** It performed no Install tap and is not another installation attempt or WeddingWin functional failure. The log also recorded a DeviceSupport-directory warning; installed Xcode reports 26.6 (17F113). The cause of that automation failure is unconfirmed and does not establish the TestFlight installation failure's cause. No settings/account changes or repeated helper execution followed. Evidence: `work/app-store-build5-sept15/jacqueline-ios27-check-private.json` and `jacqueline-ios27-install-run01.xcresult` in the same directory.

The user subsequently retried Install manually on the updated iPhone 15 and answered **“could not install.”** This is one additional **user-reported** attempt on iOS 27.0. No new alert screenshot or complete error text has been captured, so it must not be described as a newly verified occurrence of the earlier full error. No follow-up Apple communication has been sent for this new observation; a local draft awaits authorization. Build 5 physical-device acceptance remains incomplete.

## Historical iPad evidence and remaining work

The [physical iPad build 4 report](IPAD_TESTFLIGHT_BUILD4_REPORT.md) remains historical evidence for that device and exact build: seven functional UI passes, two controlled automatic new-message deliveries, the first notification's presentation/tap into the expected conversation, and the user's confirmation of the second alert and sound. Current expiry does not erase those observations. They are not build 5 or iPhone test results.

The full [release acceptance matrix](RELEASE_READINESS.md#distribution-build-and-final-testing) remains incomplete. Build 5 installation failed on both iPhones, so the authorized build 5 app checks have not started. Authentication, messaging/media/moderation, push states and permissions, QR/draw behavior, account deletion, accessibility and resilience must only be marked complete against their actual scoped evidence. No in-app message send, deletion, contest entry or terms change is established by the preparation passes above.

## Evidence handling

Local preparation evidence is under `work/iphone15-release-sept15/`, including the standalone `install-ui` harness and run 02–06 results. Installation error screenshots, the sent support-report text, the private case record and the independent audit are under `work/app-store-build5-sept15/`. Raw device, invitation, account and authentication artifacts remain private. This report contains no private device identifiers, email addresses, passwords or invitation links.

### Submission queue history

At 20:21 UTC on September 15, the authenticated EAS submission page showed **Queued — Free Tier Queue**, with no logs yet and “Waiting for submission process to start.” Apple had not yet received build 5 at that observation. The same single submission `7c0c11c2-4705-47a0-bdb6-35eaaeb00f55` later reached **FINISHED** at 20:40:36.901 UTC. Apple processing and internal group assignment were verified at 20:45 UTC, superseding the queue and group-availability blockers. The same TestFlight installation error was subsequently reproduced on both physical iPhones. Upload and group availability are verified; physical installation remains blocked.
