# iPhone TestFlight build 7 — September 16, 2026

**Submitted — September 16, 2026 at 21:28 UTC:** WeddingWin Canada **1.0.0 (7)** is **Waiting for Review**, verified on Apple's submission receipt. Manual release remains selected; the app is not approved or publicly released. [Submission receipt](SUBMISSION_RECEIPT_2026-09-16.md).

**Current checkpoint — September 16, after the 21:14 UTC message send and the user's notification confirmation:** TestFlight build 7 installation, startup, scoped navigation/login/resume checks, and a visible, audible message notification are verified on Shane's iPhone 16 Pro / iOS 26.7. The user directed us to stop repeating tests, conserve tokens and focus on submission; additional device cases are deferred. App Store Connect sign-in has since been restored. All seventeen App Privacy categories are now published after owner approval, with Linked Yes / Tracking No and purposes recorded in the [privacy decisions](APP_PRIVACY_DECISIONS_2026-09-16.md). Required Store fields are complete; Add for Review passed, and the final submission receipt confirms Waiting for Review.

The user manually installed and opened the app today. At 21:05:59 UTC, the automated TestFlight inspection showed a single WeddingWin Canada app card with **1.0.0 (7) · 90 days** and its **Open** control. The controlling agent independently viewed the saved screenshot. This establishes that the earlier installation failure no longer blocks this phone at this checkpoint; it does not identify the underlying cause of the earlier HTTP 404 errors.

## Verified observations

| Time (UTC) | Observation | Scope |
|---|---|---|
| 21:01 | Automated native startup passed and showed the signed-in couple home. No fatal/Metro error or notification-retry banner was visible. | Initial foreground startup, not a complete navigation or push test. |
| 21:05:59 | TestFlight displayed WeddingWin Canada 1.0.0 (7), 90 days, and Open associated with the single app card. | Distribution build installation independently verified after the user's manual install. |
| 21:07 | The pre-existing test session was signed out successfully; the account was retained. | Sign-out only; no account deletion was performed. |
| 21:07:36 | Two tests passed: About scrolling/tab navigation and signed-out role/login navigation. One home-button lifecycle helper skipped. | The skipped helper is not an app-test pass. |
| 21:10 | John and Jane's couple login passed. | Controlled email-login account. |
| 21:11 | Inbox sorting passed after dismissing iOS Save Password with Not Now. | The first guarded inbox attempt stopped at that system prompt; no password was saved. |
| 21:12:33 | Background/resume passed using a helper that switched to TestFlight and back. | The earlier home-button helper failed to background the app; only the revised helper establishes this result. No app code changed. |
| 21:13:57–21:14:02 | One controlled Cedar & Light Photography (39081) → John and Jane (38971) message, 1876, returned HTTP 200 with `delivery_state: delivered`. The phone's active push registration was generation 32; the old iPad registration was disabled. | This is message-send/backend evidence, not an independent Expo receipt assertion. No duplicate send was performed. |
| User confirmation today | The user confirmed: “yes i heard and seen push message”. | Physical visible alert and audible sound confirmed. The automated banner matcher skipped because no exact container matched; it made no notification tap. Build 7 tap routing, badge and draw pushes remain unverified. |

Only isolated automation helpers were built during these checks. The installed WeddingWin app was not rebuilt or replaced by a development-signed app for this run.

## Evidence

Private artifacts remain local under `/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/`:

- `iphone-sept16-testflight-launch-signed.xcresult`: initial native startup result.
- `iphone-sept16-testflight-version-visible.xcresult`: TestFlight version inspection.
- `iphone-sept16-testflight-open-private.png`: independently viewed TestFlight app card and Open control.
- `iphone-sept16-signedout.xcresult`: signed-out state check.

These private screenshots/results are diagnostic evidence, not public App Store screenshots. Earlier failed or skipped helper attempts retain their original scope; they are not additional app-test passes.

## Local regression checks

The parallel [local regression report](LOCAL_REGRESSION_2026-09-16.md) records **1,280 local checks**: 1,054 Deno tests, 176 focused Node tests and 50 offline PostgreSQL/WASM cases, plus a passing TypeScript check. These checks cover notification identity/routing, push-token rollover, auth/session behavior, vendor messaging permissions and isolated draw flows. They do not replace physical production APNs or real-provider acceptance.

## Submission focus and limits

Additional device tests are deferred at the user's explicit request. Reuse existing scoped evidence, including the earlier iPad build 4 notification-tap result and API/simulator draw checks, with their original build and scope; do not promote them to build 7 tap/badge/draw-push results. The remaining matrix in [release readiness](RELEASE_READINESS.md) records coverage limits, not an instruction to repeat the entire test suite.

App Store Connect is authenticated and the seventeen-category privacy declaration is published. This does not resolve the following separate policy or manifest questions:

- Reconcile the app-level privacy manifest's empty collected-data list with observed collection and the published [privacy decisions](APP_PRIVACY_DECISIONS_2026-09-16.md). No rebuild is initiated by this documentation update.
- Reconcile independently operated vendor draws with Apple's developer-sponsorship requirement and the existing limited-platform-sponsor wording. The delivered guideline clarification is not app-specific clearance.

Earlier operational evidence gaps for deletion/privacy requests, retention, staff handling and reachable purchases retain their recorded scope in the release checklist; no new finding or blanket retest is asserted here.

The later final submission receipt confirms **Waiting for Review** at 21:28 UTC on September 16; no Apple approval or public release is recorded. Public release remains manual and subject to the owner's launch approval. The older installation-failure history remains dated evidence; the installation outcome above supersedes it for this phone today.
