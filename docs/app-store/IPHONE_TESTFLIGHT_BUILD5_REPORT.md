# WeddingWin build 5 — physical iPhone verification in progress

Status recorded September 15, 2026. **Replacement build 5 has finished in EAS and its archive passed signing, production push and SDK 26 checks. The TestFlight submission is waiting in Expo’s free-tier queue; Apple upload/processing, iPhone installation and WeddingWin functional checks are pending.** TestFlight installation and preparation are verified separately from WeddingWin app testing. No App Review submission or public release has occurred.

## Verified preparation and current Apple availability

- Apple's official TestFlight app, version 4.3.1, is installed on the authorized physical iPhone running iOS 17.4.1.
- The separate local XCTest helper passed five preparation tests in runs 02–06: App Store inspection/search; bounded TestFlight accessibility inspection; acquisition of the exact Apple TestFlight result; opening the TestFlight welcome screen; and read-only inspection of WeddingWin's TestFlight listing. These are five helper/preparation passes, not WeddingWin functional passes.
- The acquisition check distinguished the sponsored result from TestFlight using the observed TestFlight title, Apple publisher and acquisition control in the same result cell.
- A fresh authenticated App Store Connect inspection shows WeddingWin builds 2, 3 and 4 as **Expired**. The internal testing group has no available build, and the Add Build picker offers none. This supersedes earlier statements that build 4 is currently available for a new TestFlight installation; the cause of expiry is not established here.
- The existing tester is accepted. No new invitation or invitation resend has been sent during this follow-up.

The helper method names are `testOpenAppStoreAndInspectKnownControls`, `testInspectTestFlightResultAccessibility`, `testAcquireVerifiedAppleTestFlight`, `testOpenTestFlightWelcome` and `testInspectWeddingWinTestFlight`. The separate runner operates installed applications and does not replace WeddingWin with a development build. No WeddingWin functional test has run on this iPhone during this follow-up.

## Approved replacement build

- EAS build ID: `0085d7a8-01a3-4042-8580-790eca0e8b4c`.
- Last observed EAS build state: **FINISHED**. The signed archive passed signature, production push and SDK 26 checks.
- TestFlight submission ID: `7c0c11c2-4705-47a0-bdb6-35eaaeb00f55`; upload is queued. Successful submission and Apple processing are not yet confirmed.
- Intended app identity: WeddingWin Canada, version `1.0.0`, build `5`, bundle `ca.weddingwin.app`.
- Source revision submitted to EAS: `1e45234e527e96e21553ebb48f8943d25902b3fe`.
- The existing production profile automatically incremented `expo.ios.buildNumber` from `4` to `5`. That configuration change is recorded in commit `eb87b3a`.
- Application code and `eas.json` are unchanged for this rebuild. The clean source before this increment matched build 4's application/configuration content; intervening changes recorded documentation and test evidence.

The user approved the replacement build and continued testing. Build completion and archive verification do not establish successful TestFlight submission, Apple processing, installation or app acceptance. Those remaining stages must each be verified.

## Historical iPad evidence and remaining work

The [physical iPad build 4 report](IPAD_TESTFLIGHT_BUILD4_REPORT.md) remains historical evidence for that device and exact build: seven functional UI passes, two controlled automatic new-message deliveries, the first notification's presentation/tap into the expected conversation, and the user's confirmation of the second alert and sound. Current expiry does not erase those observations. They are not build 5 or iPhone test results.

The full [release acceptance matrix](RELEASE_READINESS.md#distribution-build-and-final-testing) remains incomplete. Build 5 still requires successful TestFlight upload/processing and group availability, exact-build iPhone installation, and the authorized app checks. Authentication, messaging/media/moderation, push states and permissions, QR/draw behavior, account deletion, accessibility and resilience must only be marked complete against their actual scoped evidence. No send, deletion, contest entry or terms change is established by the preparation passes above.

## Evidence handling

Local preparation evidence is under `work/iphone15-release-sept15/`, including the standalone `install-ui` harness and run 02–06 results. Raw device, invitation, account and authentication artifacts remain private. This report contains no private device identifiers, email addresses, passwords or invitation links. The coordinating task will update build, installation and test outcomes after they are observed.

### Submission queue observation

At 20:21 UTC on September 15, the authenticated EAS submission page showed **Queued — Free Tier Queue**, with no logs yet and “Waiting for submission process to start.” Submission `7c0c11c2-4705-47a0-bdb6-35eaaeb00f55` is the single existing upload attempt. Apple had not yet received build 5. This is pending external processing, not a successful upload or an app-test result.
