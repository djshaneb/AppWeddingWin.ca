# WeddingWin App Store submission package

Status: **DRAFT — nothing in this folder has been submitted to App Store Connect.**

Prepared: 2026-08-28

App: WeddingWin 1.0.0
Bundle ID: `ca.weddingwin.app`

This folder is an owner-facing preparation pack. Replace every `<PLACEHOLDER>` and resolve every `OWNER CONFIRMATION` or `LEGAL CONFIRMATION` item before copying anything into App Store Connect.

## Files

- `APP_PRIVACY_ANSWERS.md` — proposed App Privacy answers based on the native app, Supabase functions, WeddingWin.ca web traffic, and current public privacy policy.
- `PRIVACY_POLICY_AMENDMENTS.md` — concrete changes needed in the public privacy policy before submission.
- `PRIVACY_POLICY_REPLACEMENT_DRAFT.md` — concrete replacement-policy text with explicit publication blockers for unknown production and legal facts.
- `APP_REVIEW_NOTES.md` — draft reviewer notes and gated-flow instructions.
- `REVIEWER_ACCOUNTS.md` — checklist for private, non-expiring couple and vendor review accounts.
- `SCREENSHOT_SHOT_LIST.md` — iPhone and iPad capture plan.
- `METADATA_COMPLIANCE_CHECKLIST.md` — product-page, age-rating, export-compliance, raffle, and other submission fields.
- `SIGNING_TESTFLIGHT_RUNBOOK.md` — recommended EAS route and local Xcode alternative.
- `DEPENDENCY_AUDIT.md` — working-tree Expo dependency/doctor remediation, residual build-tool advisories, and the release decision that must be repeated on the tag.
- `RELEASE_TEST_MATRIX.md` — release gates, current evidence, blocked states, and the required Simulator, TestFlight, website, and physical-device passes.

Supporting attachment:

- `../../assets/app-store/sample-qr-review-vendor-38970.png`
- QR payload: `https://www.weddingwin.ca/qr?vendor_id=38970`

The private/nonpublic vendor review member `38970` now belongs to the isolated review event `app-review-weddingwin-2026-38970`. Its sample QR, fictional prize fixture, scan state, entrant state, and draw state are separate from production event data. Reviewer-fixture email delivery is suppressed, so no draw action should send mail. Immediately before submission, reset the controlled couple account's scan/entry/draw state and reverify the full app flow against the exact uploaded build.

Do not use the legacy `sample-qr-vendor-23608.*` assets for App Review. They refer to a production-side vendor and do not provide the isolation guarantees of the `38970` fixture.

## Current release-configuration snapshot

Verified from the working tree on 2026-08-28:

- `app.json` declares version `1.0.0`, iOS build number `1`, bundle ID `ca.weddingwin.app`, iPad support, Sign in with Apple, the production icon and `ITSAppUsesNonExemptEncryption: false`.
- `eas.json` exists. It uses local app-version sourcing, has Simulator and preview profiles, and a production profile with `autoIncrement: true`.
- `app.json` does **not** yet contain `extra.eas.projectId`, and the EAS submit profile has no App Store Connect app ID. `extra.googleOAuth.iosClientId` is empty, but the current app does not read that field: Google login uses the system browser plus the `google-oauth-start`/callback backend and server-held provider credentials. Treat the empty field as dead configuration to remove or document, not proof that Google login is broken. Real Google login remains pending on the final TestFlight build.
- No authenticated Expo project/owner session, Apple Developer/App Store Connect session, distribution certificate/profile, APNs credential, signed archive, uploaded build, or processed TestFlight build was available for this preparation pass. Store signing and production push verification are blocked until the owner supplies those external credentials/configuration through their secure systems.
- Reviewer passwords and deployment secrets are local-only. `private-reviewer-credentials.md` is ignored by Git and must remain untracked.
- WebView host/navigation, cookie, bridge-origin, and media-capture hardening is implemented in source. No release claim is made from source alone; inspect the exact tagged code and re-test allowed WeddingWin routes, off-domain links, redirects, pop-ups, cookies, login, and logout in the processed TestFlight build.
- Native chat image sending is intentionally disabled for this release. Reviewer scripts and screenshots must exercise text chat only. Profile/listing images and any historical message media still belong in the privacy/retention inventory where applicable.
- The release migrations, Supabase Edge Functions, Brilliant Directories widgets, and official-rules page have been deployed to the current review backend. Record immutable source/backend revisions and repeat smoke tests after the release commit/tag; the current live deployment is not yet TestFlight provenance.
- Current working-tree Release verification passed the complete email-account deletion path on an iPhone 17 Pro Simulator using fresh disposable member `38975`: confirmation, success alert, logged-out role chooser, missing Brilliant Directories member, rejected subsequent login, and zero residual identity-cache, push, Edge-profile, chat, and raffle rows. The active `bd-delete-account` deployment is version 3 with JWT verification enabled. This does not satisfy physical-device or Sign in with Apple deletion testing.
- A 13-inch iPad Pro (M5) Simulator Release run passed reviewer-couple `38971` login and the native couple menu. Screenshot assets under `assets/app-store/screenshots/` now include two clean primary iPhone 17 Pro Max RGB PNGs at `1320×2868`, nine accepted-size 6.3-inch iPhone QA captures at `1206×2622`, and one clean iPad RGB PNG at `2064×2752`. Only the two Pro Max images are currently designated as primary iPhone marketing shots; final set selection and App Store Connect upload/preview remain pending.

## Submission gate

Do not submit while any row below is Pending, Blocked, Prior snapshot only, or supported only by working-tree evidence. Record evidence in `RELEASE_TEST_MATRIX.md` and the private release ticket. The current deletion and iPad results are working-tree Simulator evidence; they do not replace an immutable tagged build, processed TestFlight build, or physical-device pass.

| Submission gate | Current state | Evidence row(s) |
| --- | --- | --- |
| Processed TestFlight build on physical iPhone and iPad | Blocked | `DIST-01` through `DIST-03`, `DEV-01`, `DEV-12` |
| Real Sign in with Apple and custom server-backed Google OAuth | Blocked | `DEV-02`, `DEV-03` |
| Printed camera QR plus foreground/background/terminated push | Blocked | `DEV-04` through `DEV-08` |
| Native disposable-account deletion across WeddingWin.ca/BD, Supabase/Auth/storage, shared conversations/media, push, QR/draw data, and Apple revocation | Email-account Simulator/backend path passed; physical Apple revocation, backup/provider retention, and shared-conversation policy decision remain | `SIM-08`, `DEV-10` |
| App↔website report/member block, including newly attempted threads | Partially implemented; full cross-client/new-thread retest pending | `SIM-05`, `FIX-05` |
| Raffle sponsor/rules/vendor agreement and no-marketing enforcement | Blocked on owner/legal/operations | `CFG-10`, `FIX-09`, `DIST-08` |
| App Privacy answers, public policy, retention, providers, production WebView/network inventory | Blocked on owner/legal/live inventory | `CFG-09`, `CFG-11`, `DIST-05` |
| VoiceOver, Dynamic Type, focus order, and accessible controls on iPhone/iPad | Pending | `SIM-11` |
| Active, private, non-expiring fictional reviewer accounts with safe fixtures | Fixture configured; exact-build login/privacy/full-flow evidence pending | `FIX-01` through `FIX-06` |
| Exact Supabase/Brilliant Directories backend revision deployed and cross-system tested | Live changes deployed; immutable revision and final smoke-test evidence pending | `CFG-06` |
| Distribution signing, archive validation, upload, and TestFlight processing | Blocked | `CFG-04`, `DIST-01`, `DIST-02` |

Two backend behaviors require an explicit release decision even if functional testing passes:

- Account deletion currently purges the complete shared conversation record, including the other participant's copy. Owner/legal/product must approve that behavior and the UI/policy must describe it accurately, or the implementation must change before release.
- Reporting closes the current website conversation and the app blocks/suppresses the reported member. A person may still be able to create a fresh thread from an external Brilliant Directories website entry point until synchronization discovers and closes it. Do not claim website-wide preventive user blocking unless a website-side creation hook is added and verified.

## Authoritative references

- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Review information fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Screenshot upload requirements](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [Age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- [Apple encryption declaration](https://developer.apple.com/documentation/Security/complying-with-encryption-export-regulations)
- [Expo iOS submission](https://docs.expo.dev/submit/ios/)
