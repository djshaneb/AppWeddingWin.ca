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
- `SUPABASE_DEPLOYMENT_PROVENANCE.md` — live migration identifiers, active Edge Function versions, verified backend controls, and the remaining provenance/security gaps.

Supporting attachment:

- `../../assets/app-store/sample-qr-review-vendor-38970.png`
- QR payload: `https://www.weddingwin.ca/qr?vendor_id=38970`

The private/nonpublic vendor review member `38970` now belongs to the isolated review event `app-review-weddingwin-2026-38970`. Its sample QR, fictional prize fixture, scan state, entrant state, and draw state are separate from production event data. Reviewer-fixture email delivery is suppressed, so no draw action should send mail. Immediately before submission, reset the controlled couple account's scan/entry/draw state and reverify the full app flow against the exact uploaded build.

Do not use the legacy `sample-qr-vendor-23608.*` assets for App Review. They refer to a production-side vendor and do not provide the isolation guarantees of the `38970` fixture.

## Current release-configuration snapshot

Verified from the working tree on 2026-08-28:

- `app.json` declares version `1.0.0`, iOS build number `1`, bundle ID `ca.weddingwin.app`, iPad support, Sign in with Apple, the production icon and `ITSAppUsesNonExemptEncryption: false`.
- The unnecessary `UIBackgroundModes: remote-notification` declaration has been removed. The generated local Release Info.plist was inspected and contains only the native QR-camera usage description—no photo-library, microphone, or background-mode declaration. Recheck the store-signed build's final Info.plist and notification entitlements before upload.
- `eas.json` exists. It uses local app-version sourcing, has Simulator and preview profiles, and a production profile with `autoIncrement: true`.
- `app.json` does **not** yet contain `extra.eas.projectId`, and the EAS submit profile has no App Store Connect app ID. The unused blank `extra.googleOAuth.iosClientId` has been removed. Google login uses the system browser and server-held provider credentials; the deployed flow binds a one-time native exchange to PKCE so the callback URL carries an expiring exchange code instead of member/session credentials. Real Google login remains pending on the final physical TestFlight build.
- No authenticated Expo project/owner session, Apple Developer/App Store Connect session, distribution certificate/profile, APNs credential, signed archive, uploaded build, or processed TestFlight build was available for this preparation pass. Store signing and production push verification are blocked until the owner supplies those external credentials/configuration through their secure systems.
- Reviewer passwords and deployment secrets are local-only. `private-reviewer-credentials.md` is ignored by Git and must remain untracked.
- WebView host/navigation, cookie, bridge-origin, and media-capture hardening is implemented in source. Top-frame behavior remains strict: approved WeddingWin/WedWebsite HTTPS pages stay in-app and other HTTPS top-frame destinations leave through the system-browser path. Non-top-frame requests use a separate embedded-content rule that permits only HTTPS and `about:blank` while blocking `http:`, `javascript:`, `data:`, and `file:`. The focused URL-policy suite passes **7/7**, and the fresh Release Simulator run kept the vendor dashboard in-app with its Vimeo iframe visibly embedded instead of opening Safari. No release claim is made from source/local evidence alone; repeat navigation, redirects, pop-ups, cookies, login, and logout in the processed TestFlight build.
- Native chat image sending is intentionally disabled for this release. Reviewer scripts and screenshots must exercise text chat only. Profile/listing images and any historical message media still belong in the privacy/retention inventory where applicable.
- The release migrations and active release-path Supabase Edge Functions listed in `SUPABASE_DEPLOYMENT_PROVENANCE.md`, plus the Brilliant Directories `/app-login` widget and official-rules page, are deployed to the current review backend. Live smoke tests passed native email login without an orphan exchange, explicit website bridge creation/redemption, single-use cleanup, browser-binding/replay rejection, same-sync website close handling, and revised account deletion. Record immutable checksums and repeat from the tagged/TestFlight release before submission.
- Fresh disposable members `38978` and `38979` passed the revised two-participant deletion test. Both message directions delivered before deletion; deleting `38978` removed account-owned data and login, preserved `38979`'s shared history as read-only, closed the conversation, and rejected new sends. Physical Apple revocation, provider/backups, the uploaded build, and owner/legal approval of a finite retention duration or objective criterion remain pending.
- Security/reliability changes replace credential-bearing app-login URLs with short-lived single-use server exchanges, bind native Google completion to PKCE, bind web OAuth completion to the initiating browser, enforce linked-email consistency and the corrected login throttle, centralize push sending with durable bounded retry/`Retry-After`/receipt expiry, make the Expo Go Apple audience an explicit development-only opt-in, immediately flush a newly queued website conversation close during chat sync, and make controlled QR replay idempotent. The matching backend is live and the complete shared Deno suite passes **60/60**; real federated login, APNs delivery, printed-camera behavior, and exact physical TestFlight verification remain required.
- `bd-qr-bingo-sync` v13 is active with JWT verification. A controlled direct replay of the prepared QR fixture returned 200, retained one card/database row, and preserved the original `scanned_at`; this backend result does not replace the pending printed-camera pass.
- Private App Review chat access is service-managed, expiry-gated, and limited to the exact prepared vendor `38970` / couple `38971` pair while the vendor listing remains nonpublic. The migrations and `bd-chat-sync` v38/`bd-chat-status` v26 are live. A controlled round trip passed: app→website text was visible in the authenticated Chrome thread; the supported active-couple website→private-vendor-app reply persisted after reload, mirrored through the database/API, and appeared as an incoming native Simulator bubble. The inactive vendor website send was correctly blocked by Brilliant Directories policy and was not counted as delivered.
- `APP_EMAIL_CHANGE_SECRET` still requires a coordinated rotation: the replacement is absent from live Supabase and Brilliant Directories widget `329` retains the prior hardcoded email-confirmation secret. Perform the two-sided update only with explicit approval for the sensitive paste, and never record the value here.
- The tested source is recorded by local release-candidate tag `v1.0.0-rc.2`. It is not pushed, signed, uploaded, or represented in TestFlight.
- A 13-inch iPad Pro (M5) Simulator Release run passed reviewer-couple `38971` login and the native couple menu. Screenshot assets under `assets/app-store/screenshots/` now include two clean primary iPhone 17 Pro Max RGB PNGs at `1320×2868`, nine accepted-size 6.3-inch iPhone QA captures at `1206×2622`, and one clean iPad RGB PNG at `2064×2752`. Only the two Pro Max images are currently designated as primary iPhone marketing shots; final set selection and App Store Connect upload/preview remain pending.
- The latest current-source Release build completed in **38.2 seconds** and launched successfully on an iPhone 17 Pro Max Simulator running iOS 26.5. The vendor dashboard remained inside the app and its Vimeo player was visibly embedded. This remains local Simulator evidence, not an App Store-signed archive or physical-device pass.

## Submission gate

Do not submit while any row below is Pending, Blocked, Prior snapshot only, or supported only by local release-candidate evidence. Record evidence in `RELEASE_TEST_MATRIX.md` and the private release ticket. The revised deletion and final iPhone Release evidence are meaningful local passes, but neither replaces a processed TestFlight build or physical-device pass.

| Submission gate | Current state | Evidence row(s) |
| --- | --- | --- |
| Processed TestFlight build on physical iPhone and iPad | Blocked | `DIST-01` through `DIST-03`, `DEV-01`, `DEV-12` |
| Real Sign in with Apple and custom server-backed Google OAuth | Blocked | `DEV-02`, `DEV-03` |
| Printed camera QR plus foreground/background/terminated push | Blocked | `DEV-04` through `DEV-08` |
| Native disposable-account deletion across WeddingWin.ca/BD, Supabase/Auth/storage, account-owned data, conversation closure/blocking, recipient-visible retained shared history, push, QR/draw data, and Apple revocation | Revised two-account email path passed live; physical Apple revocation, provider/backup verification, exact TestFlight repeat, and owner/legal retention approval remain | `SIM-08`, `DEV-10` |
| App↔website report/member block, including newly attempted threads | Current conversation and same-sync discovered aliases close on both clients; a BD-only new thread can exist until app sync discovers it | `SIM-05`, `FIX-05` |
| Raffle sponsor/rules/vendor agreement and no-marketing enforcement | Blocked on owner/legal/operations | `CFG-10`, `FIX-09`, `DIST-08` |
| App Privacy answers, public policy, retention, providers, production WebView/network inventory | Blocked on owner/legal/live inventory | `CFG-09`, `CFG-11`, `DIST-05` |
| VoiceOver, Dynamic Type, focus order, and accessible controls on iPhone/iPad | Pending | `SIM-11` |
| Active, private, non-expiring fictional reviewer accounts with safe fixtures | Fixture configured; exact-pair chat access is service-managed and expiring, so operations must keep it active through review. The controlled cross-client text round trip passed; exact-build login/privacy/full-flow evidence remains pending | `FIX-01` through `FIX-06` |
| Exact Supabase/Brilliant Directories backend revision deployed and cross-system tested | Current auth/deletion/push/chat hardening is live and regression-tested, and the controlled reviewer chat round trip has local/live evidence. Immutable checksums and TestFlight repeat remain | `CFG-06` |
| Distribution signing, archive validation, upload, and TestFlight processing | Blocked | `CFG-04`, `DIST-01`, `DIST-02` |

Two backend behaviors still require release verification or an explicit release decision:

- The deployed deletion design preserves shared conversation history for the surviving participant, closes the conversation, and blocks new sends involving the deleted member while deleting account-owned data; a fresh two-participant email test passed. Owner/legal must approve a finite retention period or objective criterion, legal/safety exceptions, and the final user-facing explanation; physical Apple/provider/backup and exact TestFlight testing remain.
- Reporting closes the current website conversation and the app blocks/suppresses the reported member. Same-sync closure of a newly discovered website alias is deployed and controlled app/website tests passed, but an external Brilliant Directories entry point may still create a fresh thread until synchronization discovers and closes it. Do not claim website-wide preventive blocking unless a website-side creation hook is added and verified.

## Authoritative references

- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Review information fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Screenshot upload requirements](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [Age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- [Apple encryption declaration](https://developer.apple.com/documentation/Security/complying-with-encryption-export-regulations)
- [Expo iOS submission](https://docs.expo.dev/submit/ios/)
