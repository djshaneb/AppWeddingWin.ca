# Signing and TestFlight runbook

Status: **CODE-OWNED RUNBOOK FINAL — owner account setup, signing, upload, and TestFlight evidence remain open.**

The repository is an Expo managed app with no committed `ios/` directory. `app.json` now links `@blair.shane/weddingwin-app` through `extra.eas.projectId`, while the submit profile is not yet linked to an App Store Connect app. The fresh current-source local Release build completed in **38.2 seconds** and launched on an iPhone 17 Pro Max Simulator, iOS 26.5; its generated Info.plist was inspected and contains only the native QR-camera usage description, with no photo-library, microphone, or background-mode declaration. Reviewer login/bridge/dashboard, visibly embedded Vimeo playback without a Safari escape, the controlled private reviewer-pair text round trip, QR/deletion-confirmation, and icon checks passed in the recorded local flow. A fresh two-account deletion-preservation test passed against the live backend, and reviewer login/menu passed on a 13-inch iPad Pro (M5) Simulator. Simulator signing is not App Store distribution signing, so the processed TestFlight build still requires a complete physical pass.

## Current blocked state (2026-08-29)

The current working-tree configuration has:

- app version `1.0.0`, iOS build number `1`, and bundle ID `ca.weddingwin.app`;
- `ITSAppUsesNonExemptEncryption: false`, iPad support, Sign in with Apple, the QR-camera purpose string, no native photo-library purpose string, and the production icon in `app.json`;
- no `UIBackgroundModes: remote-notification` declaration; the generated local Release Info.plist was verified to contain no background mode, photo-library purpose string, or microphone purpose string, and the final signed archive must preserve that posture;
- local app-version sourcing and production `autoIncrement: true` in `eas.json`;
- organization-owned EAS project linkage for `@blair.shane/weddingwin-app` through `extra.eas.projectId`, but no `submit.production.ios.ascAppId` yet. The former blank `extra.googleOAuth.iosClientId` field has been removed. Google login uses the system browser and server-backed start/callback functions, so verify those production credentials and redirects rather than adding a client ID that the app does not read;
- source-level required-reason privacy-manifest declarations for UserDefaults, file timestamps, system boot time, and disk space. These declarations still require generated archive inspection together with every dependency manifest and Apple's upload validation.

The EAS link is recorded in source, but this preparation record still contains no Apple Distribution certificate, App Store provisioning profile, APNs credential, App Store Connect API key, archive, IPA, or TestFlight build. Production signing, upload, real Sign in with Apple, and push testing are therefore **blocked on owner-controlled Apple configuration and exact-build evidence**. Browser-bound OAuth/PKCE/replay controls are deployed and backend-tested, but real Google login is still pending on the final TestFlight build and approved production provider configuration; it does not depend on the unused blank `iosClientId` field. The exact live migration/function inventory is in `SUPABASE_DEPLOYMENT_PROVENANCE.md`. Store credentials in Apple/Expo/EAS/server secure systems or the team password manager; never add them to the repository.

## Recommended choice: EAS Build + EAS Submit

EAS is the cleaner default for this project because it generates the native project, can manage the Apple distribution certificate/provisioning profile, records builds, supplies the Expo project ID required by push-token registration, and uploads the same store-signed artifact to TestFlight.

Choose local Xcode instead when the owner requires all signing/build operations to stay on this Mac, is comfortable maintaining generated iOS native files, and accepts more manual credential/provisioning work. Both routes still require a paid Apple Developer Program team and App Store Connect access.

## Phase 0 — owner prerequisites

- [ ] Enrol the owner/legal-confirmed developer entity in the paid Apple Developer Program. Do not infer the entity from branding or source strings.
- [ ] Accept every current agreement in Apple Developer and App Store Connect.
- [ ] Confirm the Account Holder/Admin can create identifiers, certificates, APNs keys and App Store Connect apps.
- [ ] Decide who owns the Expo organization/project; avoid linking production to an individual contractor account.
- [x] Finalized and reviewed the complete source and created local release commit/tag `v1.0.0-rc.2`. Record it in the private release ticket before any separate push; no corresponding signed/TestFlight build is currently recorded.
- [ ] Use a password manager. Do not put an Apple password, app-specific password, `.p8` key, certificate, provisioning profile, reviewer password, Supabase service key or Expo token in Git.
- [ ] With explicit approval for the sensitive paste, rotate `APP_EMAIL_CHANGE_SECRET` atomically across live Supabase and Brilliant Directories widget `329`; Supabase currently lacks the replacement while widget `329` retains the prior hardcoded value. Never record either value in the repository or release ticket.

## Phase 1 — Apple identifiers and app record

1. In Apple Developer → Certificates, Identifiers & Profiles, create or verify an explicit App ID:
   - Description: `WeddingWin`
   - Bundle ID: `ca.weddingwin.app`
2. Enable capabilities needed by the final binary:
   - Sign in with Apple
   - Push Notifications
3. Confirm the Sign in with Apple configuration uses the correct primary App ID/service configuration and production callback URLs.
4. Configure **Sign in with Apple for Email Communication**. Register every WeddingWin/vendor-contact outbound sender domain, subdomain, or individual address; verify SPF and DKIM; and retain delivery/bounce evidence. Route required vendor-contact mail through a registered WeddingWin-controlled sender or in-app messaging because an unregistered vendor domain can bounce at Apple's relay. The app accepts Apple's private relay address and must never require a personal email to unlock app access.
5. Create or securely reuse an APNs Auth Key (`.p8`) for the correct team. Record Key ID and Team ID in the secure deployment system, not this repository.
6. In App Store Connect → Apps → `+` → New App, create:
   - Platform: iOS
   - Name: WeddingWin
   - Primary language: English (Canada), if approved
   - Bundle ID: `ca.weddingwin.app`
   - SKU: owner-selected immutable internal value
   - User access: only the release team
7. Record the numeric App Store Connect app ID in the private release ticket.
8. Prefer an App Store Connect API key with the minimum role needed for upload/submission. Store the issuer ID, key ID and `.p8` securely.

## Phase 2 — finish EAS configuration on a release branch

The project is already linked. Verify the organization/project before changing build configuration; do not rerun `eas init` unless the release owner intentionally wants to relink it:

```bash
npx eas-cli@latest login
npx eas-cli@latest project:info
npx eas-cli@latest build:configure
```

Expected results:

- [x] Expo project `@blair.shane/weddingwin-app` is linked in current source.
- [x] `app.json` contains `extra.eas.projectId`. The current notification code uses it when requesting an Expo push token.
- The existing `eas.json` is reviewed and retained or deliberately updated; do not overwrite profiles blindly.
- Bundle ID remains exactly `ca.weddingwin.app`.

Review a production profile equivalent to:

```json
{
  "cli": {
    "appVersionSource": "local"
  },
  "build": {
    "production": {
      "distribution": "store",
      "autoIncrement": true
    }
  }
}
```

After the App Store record exists, add `submit.production.ios.ascAppId` with the actual numeric ID from the private release ticket. Do not commit a guessed/example ID.

Before building:

- [ ] Confirm `ios.buildNumber` is currently `1`, that App Store Connect has not used it, and that production `autoIncrement` will produce the intended submitted number. Record the actual generated number after the build; do not assume it from source.
- [ ] Obtain owner/legal approval for the current `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` classification and answer App Store Connect consistently.
- [x] Link the organization-owned `extra.eas.projectId` in source.
- [ ] Verify the signed TestFlight binary contains that exact project link and can obtain the production Expo push token.
- [ ] Add `submit.production.ios.ascAppId` after the App Store Connect app record exists.
- [ ] Confirm the Google OAuth start/callback functions use the approved production provider credentials and redirect allowlist. Do not reintroduce an unused `extra.googleOAuth.iosClientId`. Do not claim Google login works until the exact TestFlight build passes on a physical iPhone.
- [ ] Confirm the final `ios.entitlements` contains production APNs and Sign in with Apple through generated signing, not a development-only entitlement.
- [ ] Confirm the icon, QR-camera purpose string, absence of a native photo-library permission declaration while image sending is disabled, URL scheme, bundle ID, version and iPad support.
- [ ] Inspect the generated Info.plist and confirm it does not reintroduce `UIBackgroundModes: remote-notification`; visible foreground/background/terminated notification behavior must still pass on hardware.
- [ ] Deploy current `bd-complete-profile`, `bd-couple-signup`, `bd-vendor-signup`, and `bd-chat-sync` together, record their versions/checksums, and smoke-test relay-safe contact handling, app-originated transactional reply email, silent empty-thread opens, and current/legacy recipient-plan fallback. The 71/71 source tests do not make these four changes live.
- [ ] Resolve live Meta Pixel traffic before declaring tracking=No: preferably suppress it server-side for the `WeddingWinApp/1.0` user agent and prove absence in an exact-TestFlight network capture; otherwise implement required consent/ATT and accurate tracking disclosure before transmission.
- [ ] Store production environment variables/secrets in EAS project secrets, never in app-bundled `extra` if secret.

## Phase 3 — credentials and production build

Inspect/create EAS credentials:

```bash
npx eas-cli@latest credentials --platform ios
```

Let EAS create or securely reuse:

- Apple Distribution certificate.
- App Store provisioning profile for `ca.weddingwin.app`.
- Push Notifications and Sign in with Apple capability linkage.

Production push is not ready merely because `expo-notifications` is installed. Before accepting the build, verify all of the following:

- the Expo project ID in the binary matches the intended production EAS project;
- the explicit Apple App ID has Push Notifications enabled and the distribution profile contains the correct `aps-environment` entitlement;
- EAS/Expo has a valid APNs key for the correct Apple team and bundle ID;
- the deployed token-registration and `bd-push-sweep` v8 functions point to the production Supabase project and reject unauthorized registration; migration `20260828214927` supplies durable bounded retry, `Retry-After`, and receipt expiry;
- sign-out and account deletion disable every token associated with the member; and
- a real iPhone receives generic, non-message-content notifications in foreground, background, and terminated states, and tapping routes to the expected conversation.

Build the store artifact:

```bash
npx eas-cli@latest build --platform ios --profile production
```

Record:

- EAS build URL/ID.
- Git commit and tag.
- App version and build number.
- Xcode and iOS SDK version used by EAS.
- Distribution certificate/profile identifiers and expiry dates, not private key material.

Build acceptance checks:

- [ ] Build status succeeded and artifact is an App Store `.ipa`, not a Simulator or ad-hoc build.
- [ ] Bundle identifier is `ca.weddingwin.app`.
- [ ] Version/build match the release record and build number is unused.
- [ ] App icon has no alpha issue.
- [ ] The generated archive contains the configured UserDefaults, file-timestamp, system-boot-time, and disk-space required-reason entries plus dependency manifests; signatures and Apple's required-reason checks produce no warning/rejection.
- [ ] Distribution entitlements contain production APNs and Sign in with Apple.
- [ ] No Expo dev client/menu, localhost/tunnel URL, debug configuration or test secret is present.

## Phase 4 — upload to TestFlight

Upload the successful EAS build:

```bash
npx eas-cli@latest submit --platform ios --profile production
```

Alternatively, `npx testflight` can initialize, sign, build and submit interactively, but explicit build/submit steps are easier to audit for the first release.

In App Store Connect:

- [ ] Wait for processing and resolve every warning/error.
- [ ] Answer export-compliance questions consistently with the binary and Info.plist.
- [ ] Add Beta App Description, Feedback Email, Contact Information and “What to Test.”
- [ ] Add the build to an internal testing group. Internal testers must be App Store Connect users.
- [ ] If using external testers, create an external group and submit the first build for TestFlight Beta App Review.

Apple currently allows up to 100 internal App Store Connect testers and 10,000 external testers; the first external build may require review.

## Phase 5 — physical TestFlight test matrix

Do not substitute a locally installed development build for this phase. Install the processed build from TestFlight.

Minimum hardware:

- Current physical iPhone supported by the deployment target.
- One smaller/older supported iPhone if available.
- Physical iPad because `supportsTablet` is enabled.

Required flows:

- [ ] Fresh install, upgrade and reinstall.
- [ ] Couple and vendor email login; wrong password; password reset.
- [ ] Real Sign in with Apple, including Hide My Email, app access without entering a personal email, relay delivery of every required account/vendor-contact email from SPF/DKIM-authenticated registered senders, returning-user flow, one-time website app-login exchange, and production rejection of Expo Go's shared audience (`ALLOW_EXPO_GO_APPLE_AUD` unset/disabled).
- [ ] Real Google production OAuth and PKCE-bound one-time return/exchange to the app. Browser binding, missing/mismatched-cookie rejection, expiry, and replay rejection already have controlled backend evidence; repeat them through the real provider and confirm callback URLs/logs contain no member/session credentials.
- [ ] Sign out clears native session, website cookies/cache and server push token.
- [ ] Printed `sample-qr-review-vendor-38970.png` scans in normal/low light; duplicate and invalid QR handling; isolated review state is reset before the run. Backend replay idempotency is already live and verified through JWT-protected `bd-qr-bingo-sync` v13 (one row and unchanged original timestamp), but this does not prove camera permission, optics, or exact-build behavior.
- [ ] Couple scan progress and separate vendor-draw opt-in/data-sharing consent.
- [ ] Verify that vendor-draw entry does not subscribe the couple to marketing. Only selected-potential-winner contact may be disclosed to the vendor, solely for verification/prize fulfilment. Reviewer-fixture and production draw email remain suppressed unless a separately approved fulfilment configuration is enabled later.
- [ ] Repeat the prepared exact reviewer-pair text round trip on TestFlight. The local/live pass recorded app→website visibility in authenticated Chrome and the supported active-couple website→private-vendor-app reply after reload, in the database/API mirror, and as an incoming native Simulator bubble. Service-only, expiring pair access is deployed through migrations `20260828221025` and `20260828221307`, `bd-chat-sync` v38, and `bd-chat-status` v26. The inactive vendor website send is correctly blocked and must not be treated as delivered. Confirm image-send UI/media permission remains disabled in this release.
- [ ] Chat report closes the current website conversation and the app blocks/suppresses the reported member. Same-sync closure of a newly discovered alias is deployed and controlled app/website tests passed; repeat on TestFlight, test an external website fresh-thread attempt, and record the remaining pre-sync limitation. Do not claim preventive website-wide blocking without a website-side creation hook.
- [ ] Foreground, background and force-quit push delivery through the centralized sweep worker; tap routes to chat; badge clears; payload contains no private text; accepted Expo tickets and later receipts/errors are recorded; invalid-device tokens disable; retry/backoff and ambiguous-network behavior do not create an unacceptable duplicate. Backend retry controls are deployed, but this row requires APNs and a physical TestFlight build.
- [ ] Vendor dashboard and vendor-draw settings/test-only potential-winner flow in isolated event `app-review-weddingwin-2026-38970`; confirm no production entrant data or email delivery.
- [ ] Confirm private/nonpublic vendor `38970` can authenticate and use its documented dashboard/native-text-chat/draw paths only with paired couple `38971` while remaining absent from public directory/search/profile/event/marketing surfaces. Pair authorization is service-only and expiry-gated; keep it active for the review window. Native chat and the local Release dashboard/Vimeo embedding passed, but draw, signed-out privacy, and exact TestFlight verification remain required.
- [ ] Account deletion across every data store and Sign in with Apple revocation where applicable. Verify account-owned data is removed, conversations are closed/blocked, the surviving participant retains read-only shared history/moderation evidence, and owner/legal has approved the finite retention duration/criterion and exceptions.
- [ ] Camera and notifications denied, later enabled, and permanently denied in Settings. Confirm the disabled image-send path never prompts for photo access.
- [ ] iPad layout, keyboard, modals, WebView pages, rotation/window behavior and screenshots.
- [ ] Reverify final WebView hardening. The focused source suite passes **7/7** and the local Release dashboard stayed in-app with Vimeo visibly embedded. Top-frame routing is unchanged: only approved WeddingWin/WedWebsite HTTPS hosts remain in-app and unrelated HTTPS uses the system-browser path. Non-top-frame navigation may stay embedded only for HTTPS and `about:blank`; `http:`, `javascript:`, `data:`, and `file:` subframes must remain blocked. On TestFlight, also verify third-party cookies remain disabled, redirects/pop-ups cannot bypass either rule, and required login/logout flows still work.
- [ ] Airplane mode, slow network, API timeout/rate limit and backend recovery.
- [ ] Review device/system logs for crashes, fatal exceptions, privacy/entitlement errors and repeated network/auth failures.

## Phase 6 — App Store submission

- [ ] Complete all files in this preparation package.
- [ ] Publish accurate App Privacy answers and final policy URLs.
- [ ] Complete age rating, content rights, export compliance, pricing/availability and territorial legal fields.
- [ ] Upload iPhone and iPad screenshots from the exact final build.
- [ ] Enter App Review contact and non-expiring review credentials.
- [ ] Paste finalized Review Notes and attach the sample QR.
- [ ] Select the processed TestFlight build for version 1.0.0.
- [ ] Use manual release for the first version unless the owner explicitly chooses otherwise.
- [ ] Add for Review, verify the draft submission, then Submit for Review.
- [ ] Keep backend, test accounts, rules and support contact active for the entire review window.

## Local Xcode alternative

Use a clean release worktree/copy; Expo prebuild changes the project and may regenerate native files:

```bash
npx expo prebuild --platform ios --clean
open ios/*.xcworkspace
```

In Xcode:

1. Select the application target → Signing & Capabilities.
2. Select the paid Wedding Win team and verify automatic signing or an explicit App Store profile.
3. Confirm bundle ID, version/build, Sign in with Apple, Push Notifications, production entitlements and Release configuration.
4. Select `Any iOS Device (arm64)` / generic device—not a Simulator.
5. Product → Archive.
6. Organizer → Validate App.
7. Resolve every validation issue, then Distribute App → App Store Connect → Upload.
8. Continue with TestFlight processing and the same physical test matrix above.

The temporary XcodeBuildMCP/Expo project used for Simulator QA is not automatically a release archive source. If reused, first prove its bundle phase, paths, configuration, entitlements, privacy manifests, signing and embedded JavaScript all come from the tagged release.

References:

- [Expo EAS iOS submission](https://docs.expo.dev/submit/ios/)
- [Expo TestFlight guide](https://docs.expo.dev/submit/testflight/)
- [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)
- [Apple upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
