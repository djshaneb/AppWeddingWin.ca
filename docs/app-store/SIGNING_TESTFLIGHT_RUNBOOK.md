# Signing and TestFlight runbook

Status: **DRAFT RUNBOOK — no App Store distribution archive has been created or uploaded.**

The repository is an Expo managed app with no committed `ios/` directory. `eas.json` now exists, but the release configuration is not linked to an Expo project and the submit profile is not linked to an App Store Connect app. Current working-tree Release builds passed a fresh email-account deletion run on an iPhone 17 Pro Simulator and reviewer-couple login/menu smoke on a 13-inch iPad Pro (M5) Simulator. Simulator signing is not App Store distribution signing, and the final source must be rebuilt after all release changes.

## Current blocked state (2026-08-28)

The current working-tree configuration has:

- app version `1.0.0`, iOS build number `1`, and bundle ID `ca.weddingwin.app`;
- `ITSAppUsesNonExemptEncryption: false`, iPad support, Sign in with Apple, camera/photo purpose strings, and the production icon in `app.json`;
- local app-version sourcing and production `autoIncrement: true` in `eas.json`;
- no `extra.eas.projectId` and no `submit.production.ios.ascAppId`. The empty `extra.googleOAuth.iosClientId` field is not consumed by the shipped custom Google flow; Google login uses the system browser and server-backed start/callback functions. Remove the dead field or document why it remains, and verify the server credentials/redirects rather than adding a client ID that the app does not read.

This preparation environment has no authenticated Expo owner/project session or Apple Developer/App Store Connect session, and no available Apple Distribution certificate, App Store provisioning profile, APNs credential, App Store Connect API key, archive, IPA, or TestFlight build. Production signing, upload, real Sign in with Apple, and push testing are therefore **blocked on owner-controlled credentials and account configuration**. Real Google login is also pending on the final TestFlight build and deployed server OAuth configuration, but it does not depend on the unused blank `iosClientId` field. Store credentials in Apple/Expo/EAS/server secure systems or the team password manager; never add them to the repository.

## Recommended choice: EAS Build + EAS Submit

EAS is the cleaner default for this project because it generates the native project, can manage the Apple distribution certificate/provisioning profile, records builds, supplies the Expo project ID required by push-token registration, and uploads the same store-signed artifact to TestFlight.

Choose local Xcode instead when the owner requires all signing/build operations to stay on this Mac, is comfortable maintaining generated iOS native files, and accepts more manual credential/provisioning work. Both routes still require a paid Apple Developer Program team and App Store Connect access.

## Phase 0 — owner prerequisites

- [ ] Enrol the correct legal entity (`Wedding Win Inc.` if confirmed) in the paid Apple Developer Program.
- [ ] Accept every current agreement in Apple Developer and App Store Connect.
- [ ] Confirm the Account Holder/Admin can create identifiers, certificates, APNs keys and App Store Connect apps.
- [ ] Decide who owns the Expo organization/project; avoid linking production to an individual contractor account.
- [ ] Finish source cleanup, review all changes, commit the tested release, and create a release tag only after final tests. Record commit and tag in the release ticket.
- [ ] Use a password manager. Do not put an Apple password, app-specific password, `.p8` key, certificate, provisioning profile, reviewer password, Supabase service key or Expo token in Git.

## Phase 1 — Apple identifiers and app record

1. In Apple Developer → Certificates, Identifiers & Profiles, create or verify an explicit App ID:
   - Description: `WeddingWin`
   - Bundle ID: `ca.weddingwin.app`
2. Enable capabilities needed by the final binary:
   - Sign in with Apple
   - Push Notifications
3. Confirm the Sign in with Apple configuration uses the correct primary App ID/service configuration and production callback URLs.
4. Create or securely reuse an APNs Auth Key (`.p8`) for the correct team. Record Key ID and Team ID in the secure deployment system, not this repository.
5. In App Store Connect → Apps → `+` → New App, create:
   - Platform: iOS
   - Name: WeddingWin
   - Primary language: English (Canada), if approved
   - Bundle ID: `ca.weddingwin.app`
   - SKU: owner-selected immutable internal value
   - User access: only the release team
6. Record the numeric App Store Connect app ID as `<ASC_APP_ID>`.
7. Prefer an App Store Connect API key with the minimum role needed for upload/submission. Store the issuer ID, key ID and `.p8` securely.

## Phase 2 — finish EAS configuration on a release branch

These commands can link or change release configuration. Run them only after reviewing the release branch, signing in to the organization-owned Expo account, and using the latest supported EAS CLI:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build:configure
```

Expected results:

- Expo project is owned by the intended organization.
- `app.json` receives `extra.eas.projectId`. This is also used by the current notification code when requesting an Expo push token.
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
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "<ASC_APP_ID>"
      }
    }
  }
}
```

Before building:

- [ ] Confirm `ios.buildNumber` is currently `1`, that App Store Connect has not used it, and that production `autoIncrement` will produce the intended submitted number. Record the actual generated number after the build; do not assume it from source.
- [ ] Obtain owner/legal approval for the current `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` classification and answer App Store Connect consistently.
- [ ] Add the organization-owned `extra.eas.projectId` and verify the app can obtain an Expo push token in the signed TestFlight build.
- [ ] Add `submit.production.ios.ascAppId` after the App Store Connect app record exists.
- [ ] Confirm the Google OAuth start/callback functions use the approved production provider credentials and redirect allowlist. Remove or document the unused blank `extra.googleOAuth.iosClientId` field. Do not claim Google login works until the exact TestFlight build passes on a physical iPhone.
- [ ] Confirm the final `ios.entitlements` contains production APNs and Sign in with Apple through generated signing, not a development-only entitlement.
- [ ] Confirm the icon, camera/photo purpose strings, URL scheme, bundle ID, version and iPad support.
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
- the deployed token-registration and push-sweep functions point to the production Supabase project and reject unauthorized registration;
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
- [ ] Privacy manifests/signatures and required-reason API checks produce no upload rejection.
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
- [ ] Real Sign in with Apple, including Hide My Email and returning-user flow.
- [ ] Real Google production OAuth and return to the app.
- [ ] Sign out clears native session, website cookies/cache and server push token.
- [ ] Printed `sample-qr-review-vendor-38970.png` scans in normal/low light; duplicate and invalid QR handling; isolated review state is reset before the run.
- [ ] Couple scan progress and separate vendor-draw opt-in/data-sharing consent.
- [ ] Verify that vendor-draw entry does not subscribe the couple to marketing. Only selected-potential-winner contact may be disclosed to the vendor, solely for verification/prize fulfilment. Reviewer-fixture and production draw email remain suppressed unless a separately approved fulfilment configuration is enabled later.
- [ ] Native text chat app→website and website→app. Confirm image-send UI/media permission remains disabled in this release.
- [ ] Chat report closes the current website conversation and the app blocks/suppresses the reported member. Test an external website fresh-thread attempt and record the known sync-close limitation; do not claim preventive website-wide blocking without a website-side creation hook.
- [ ] Foreground, background and force-quit push delivery; tap routes to chat; badge clears; payload contains no private text.
- [ ] Vendor dashboard and vendor-draw settings/test-only potential-winner flow in isolated event `app-review-weddingwin-2026-38970`; confirm no production entrant data or email delivery.
- [ ] Confirm private/nonpublic vendor `38970` can authenticate and use its documented dashboard/native-text-chat/draw paths while remaining absent from public directory/search/profile/event/marketing surfaces. The fixture is prepared, but this exact-build pass is still required.
- [ ] Account deletion across every data store and Sign in with Apple revocation where applicable. Inspect both sides of a shared conversation and obtain owner/legal/product approval for the current complete-conversation purge.
- [ ] Camera and notifications denied, later enabled, and permanently denied in Settings. Confirm the disabled image-send path never prompts for photo access.
- [ ] iPad layout, keyboard, modals, WebView pages, rotation/window behavior and screenshots.
- [ ] Reverify final WebView hardening: only approved WeddingWin hosts remain in-app, external/off-domain URLs open through the intended system-browser path or are blocked, third-party cookies are disabled unless specifically justified, pop-ups/redirects cannot bypass the policy, and required login/logout flows still work.
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
