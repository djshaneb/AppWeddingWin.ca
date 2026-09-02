# Signing and TestFlight runbook

Status: **PREVIOUS PRODUCTION BUILD/UPLOAD VALIDATED — the `2026-09-01-in-person-entry` source delta requires a replacement build before physical TestFlight and submission.**

The repository is an Expo managed app with no committed `ios/` directory. `app.json` links `@blair.shane/weddingwin-app` through `extra.eas.projectId`, and the submit profile is linked to the exact `WeddingWin Canada` App Store Connect record for `ca.weddingwin.app`. The recorded 2026-08-29 local Release and production EAS build `1.0.0 (2)` passed their documented build, signing, upload, and Simulator checks, and Apple processed build 2 as `Validated`/`Ready to Submit`. Those artifacts predate the current `2026-09-01-in-person-entry` role/rules/vendor-verification/named-vendor contact-sharing-and-marketing delta. Repeat the clean local build/tests and create, inspect, upload, and physically test a replacement signed build; do not describe build 2 as current-source evidence.

## Current signing state (2026-08-29)

The current working-tree configuration has:

- app version `1.0.0`, iOS build number `2`, and bundle ID `ca.weddingwin.app`;
- `ITSAppUsesNonExemptEncryption: false`, iPad support, Sign in with Apple, the QR-camera purpose string, no native photo-library purpose string, and the production icon in `app.json`;
- no `UIBackgroundModes: remote-notification` declaration; both the generated local Release and signed IPA were verified to contain no background mode, photo-library purpose string, or microphone purpose string;
- local app-version sourcing and production `autoIncrement: true` in `eas.json`;
- organization-owned EAS project linkage for `@blair.shane/weddingwin-app` through `extra.eas.projectId`, plus the verified numeric `submit.production.ios.ascAppId` for the exact `ca.weddingwin.app` record. The former blank `extra.googleOAuth.iosClientId` field has been removed. Google login uses the system browser and server-backed start/callback functions, so verify those production credentials and redirects rather than adding a client ID that the app does not read;
- required-reason privacy-manifest declarations for UserDefaults, file timestamps, system boot time, and disk space. The signed IPA contains the packaged declarations and Apple accepted the upload without a privacy-manifest validation error.

The updated Apple agreement is accepted. Push Notifications and Sign in with Apple are enabled on the explicit App ID. EAS holds a matching Apple Distribution certificate, active App Store profile, App Store Connect API key, and dedicated team-scoped APNs key configured for sandbox and production. The decoded build-2 profile and signed IPA contain the exact application identifier, production APNs, Sign in with Apple, and the matching distribution certificate. Build `1.0.0 (2)` is processed in TestFlight and assigned to the manual `WeddingWin Internal QA` group, but it predates the `2026-09-01-in-person-entry` delta. Release evidence is therefore **blocked on a replacement build, its exact physical-device pass, and the nontechnical submission gates**. Browser-bound OAuth/PKCE/replay controls are deployed and backend-tested, but real Google login is still pending on the replacement TestFlight build and approved production provider configuration; it does not depend on the unused blank `iosClientId` field. The exact live migration/function inventory is in `SUPABASE_DEPLOYMENT_PROVENANCE.md`. Store credentials in Apple/Expo/EAS/server secure systems or the team password manager; never add them to the repository.

## Recommended choice: EAS Build + EAS Submit

EAS is the cleaner default for this project because it generates the native project, can manage the Apple distribution certificate/provisioning profile, records builds, supplies the Expo project ID required by push-token registration, and uploads the same store-signed artifact to TestFlight.

Choose local Xcode instead when the owner requires all signing/build operations to stay on this Mac, is comfortable maintaining generated iOS native files, and accepts more manual credential/provisioning work. Both routes still require a paid Apple Developer Program team and App Store Connect access.

## Phase 0 — owner prerequisites

- [ ] Enrol the owner/legal-confirmed developer entity in the paid Apple Developer Program. Do not infer the entity from branding or source strings.
- [x] Accept every current agreement in Apple Developer and App Store Connect.
- [x] Confirm the Account Holder/Admin can create identifiers, certificates, APNs keys and App Store Connect apps.
- [ ] Decide who owns the Expo organization/project; avoid linking production to an individual contractor account.
- [x] Preserved the earlier production-build source at commit `f7f4c90` and tag `v1.0.0-rc.3`; EAS built it as build `2`, and the older `v1.0.0-rc.2` tag remains unmoved.
- [ ] Commit and tag the tested `2026-09-01-in-person-entry` source, deploy and inventory its matching backend/widget/legal surfaces, then create a replacement build number. Do not move or reuse the historical tags/build.
- [ ] Use a password manager. Do not put an Apple password, app-specific password, `.p8` key, certificate, provisioning profile, reviewer password, Supabase service key or Expo token in Git.
- [ ] Complete the coordinated `APP_EMAIL_CHANGE_SECRET` rotation across Supabase and the website during one explicitly approved sensitive-value update. Keep the exact live location/state and both values only in the private security ticket; never record a secret value in Git or submission material.

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
   - Name: WeddingWin Canada
   - Primary language: English (Canada)
   - Bundle ID: `ca.weddingwin.app`
   - SKU: immutable internal release value
   - User access: Full Access, as selected during setup
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

- [x] Record the actual generated iOS build number `2` in `app.json` and the release evidence. App Store Connect accepted it as `1.0.0 (2)`.
- [ ] Obtain owner/legal approval for the current `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` classification and answer App Store Connect consistently.
- [x] Link the organization-owned `extra.eas.projectId` in source.
- [ ] The signed binary contains the exact Expo project link. A physical TestFlight install must still prove production push-token registration.
- [x] Add `submit.production.ios.ascAppId` after the App Store Connect app record exists.
- [ ] Confirm the Google OAuth start/callback functions use the approved production provider credentials and redirect allowlist. Do not reintroduce an unused `extra.googleOAuth.iosClientId`. Do not claim Google login works until the exact TestFlight build passes on a physical iPhone.
- [x] The signed IPA entitlements contain production APNs and Sign in with Apple, with `get-task-allow` absent/false.
- [x] The signed IPA preserves the opaque icon, QR-camera purpose string, no native photo-library permission declaration, URL scheme, exact bundle ID, version/build, and iPad support.
- [x] The signed IPA Info.plist contains no `UIBackgroundModes`, photo-library purpose, or microphone purpose declaration. Visible foreground/background/terminated notification behavior must still pass on hardware.
- [x] Deploy current `bd-complete-profile`, `bd-couple-signup`, `bd-vendor-signup`, and `bd-chat-sync` together. Recorded live versions are 18, 12, 9, and 39 respectively; all retained JWT verification and rejected unauthenticated probes with `401`. The 71/71 source regressions pass and a fresh v39 app↔website text round trip passed. Relay delivery and the silent-empty-thread path still need exact TestFlight/physical confirmation.
- [ ] Before declaring Tracking = No, fully remove Meta Pixel and every other tracker from all in-app reachable pages/subresources and prove absence in an exact-TestFlight network capture. Otherwise implement any required consent/ATT and accurate tracking disclosure before transmission.
- [ ] Verify WeddingWin account/app features remain free with no paid membership, subscription, or in-app purchase. Separately inventory paid VIP admission, door admission, and any ticket/payment flow reachable from the app or website, including whether WeddingWin receives purchase or payment data.
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

Recorded production evidence:

- EAS build: `ed4826b7-3fcb-43c8-93cf-480cd7057739` (`https://expo.dev/accounts/blair.shane/projects/weddingwin-app/builds/ed4826b7-3fcb-43c8-93cf-480cd7057739`).
- Build source commit: `f7f4c90`; app version/build: `1.0.0 (2)`.
- Downloaded IPA SHA-256: `5f93f2422e07b4dbd337d55296d909d011c3b572edba00c72c9c465c592025be`.
- EAS submission: `13173e9a-e78d-491f-ae70-84375f03924f`; Apple binary state `Validated`, version state `Ready to Submit`.

Build acceptance checks:

- [x] Build status succeeded and artifact is an App Store `.ipa`, not a Simulator or ad-hoc build.
- [x] Bundle identifier is `ca.weddingwin.app`.
- [x] Version/build match the release record as `1.0.0 (2)` and Apple accepted the build number.
- [x] Signed iPhone and iPad app icons are opaque and visually match the production icon.
- [x] The signed IPA contains the configured UserDefaults, file-timestamp, system-boot-time, and disk-space required-reason entries; its signature verifies and Apple reported no required-reason/signature rejection.
- [x] Distribution entitlements contain production APNs and Sign in with Apple.
- [ ] No Expo dev client/menu, localhost/tunnel URL, debug configuration or test secret is present.

## Phase 4 — upload to TestFlight

Upload the successful EAS build:

```bash
npx eas-cli@latest submit --platform ios --profile production
```

Alternatively, `npx testflight` can initialize, sign, build and submit interactively, but explicit build/submit steps are easier to audit for the first release.

In App Store Connect:

- [x] Processing completed with binary state `Validated` and version state `Ready to Submit`; no unresolved upload warning/error is recorded.
- [x] App Store Connect shows encryption `No`, matching `ITSAppUsesNonExemptEncryption: false`; owner/legal approval of the classification remains separate.
- [ ] Add/verify Beta App Description, Feedback Email, and Contact Information. “What to Test” is saved for build 2.
- [x] Build 2 is assigned to the manual `WeddingWin Internal QA` group and the existing account-holder tester is invited. Automatic distribution is off.
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
- [ ] Printed `sample-qr-review-vendor-38970.png` scans in normal/low light; duplicate and invalid QR handling; isolated review state is reset before the run. Backend replay protection remains present in the currently deployed `bd-qr-bingo-sync` v44. The original one-row/unchanged-timestamp live proof was recorded against historical v13 and must not be treated as current-deployment or exact-build camera evidence.
- [ ] Couple QR scan/progress, duplicate handling, and card-completion messaging state clearly that a scan records the booth visit only and never creates a draw entry automatically.
- [ ] After scanning the isolated review vendor, verify the separate optional offer: No Thanks creates no entry; entry remains disabled until Official Rules version `2026-09-01-in-person-entry` is opened, all age/residency/exclusion confirmations are checked, and the entrant expressly agrees that Wedding Win may share name, email address, phone number if provided, wedding date if provided, and entry/consent evidence with vendor `38970` for this draw and that vendor's wedding-related offers or promotions. Declining the offer leaves only the booth-visit record. Affirmative entry is idempotent. In production, entry is available only after the eligible couple attends the show, visits the named vendor's booth, and scans its QR code; the QR entry replaces a paper ballot. Each eligible couple may receive only one valid entry per named vendor draw. General admission is free when obtained in advance while the free allocation remains; VIP admission is paid; anyone without an advance general ticket must purchase admission at the door; paid admission never creates another chance or improves odds; and no purchase from the named vendor is required. Confirm the isolated fixture emulates the booth scan without changing production event data.
- [ ] Verify vendor `38970` can open Draw, accept Official Rules version `2026-09-01-in-person-entry`, enable/disable the fictional prize, persist settings, see entry count, download the authenticated exact-vendor/event entrant-administration CSV, and select at most one potential winner. Confirm the CSV headers are Event, Vendor, Participant Reference, Name, Email, Phone, Wedding Date, Entered At, Entry Method, Rules Version, Entrant Eligibility Attested, Selection Status, and Marketing Consent; Entry Method is `QR scan opt-in`; values are fictional; Marketing Consent is `Yes - named vendor draw entry and wedding-related marketing`; another vendor cannot retrieve the report; and a legacy entry is absent until fresh current-version consent. Confirm the report audit records metadata rather than CSV contents or entrant identifiers.
- [ ] After random selection, verify Vendor verification required blocks notices and claims until the vendor independently verifies eligibility, attests that it obtained the entrant declaration/release outside Wedding Win, enters the correct math skill answer, records a nonblank evidence note stating date, method, and non-sensitive reference, and then confirms or disqualifies the potential winner. Verify Wedding Win records that vendor attestation only and does not perform or certify the vendor's eligibility, release, or prize-fulfilment work. Confirm the material-term lock, suppressed review-fixture email, and no-real-prize state. In a separate controlled production fixture, confirm a verified winner sends through each configured vendor/couple delivery channel and is not unconditionally suppressed.
- [ ] Verify all draw screens/rules state the named vendor is the vendor-promotion sponsor, contest operator, and prize provider solely responsible for lawful terms, eligibility and winner-release decisions, the mathematical skill-testing question, prize restrictions, percentage-discount terms and maximum savings where applicable, taxes, claims, disputes, and fulfilment; Wedding Win Inc. is the app developer, limited platform sponsor of the in-app workflow, and technical administrator for entry recording, duplicate controls, randomization, audit, and notices, is not the named vendor-promotion sponsor/operator/prize provider, and remains responsible for its own technology, privacy, security, administrative conduct, and non-waivable duties; and Apple is not a sponsor or participant. Owner/legal must confirm that narrow platform-sponsor role reflects actual operations and satisfies Apple Guideline 5.3.1.
- [ ] Repeat the prepared exact reviewer-pair text round trip on TestFlight. A fresh post-deployment v39 pass recorded app→website visibility in authenticated Chrome and the supported active-couple website→private-vendor-app reply after native refresh. The website briefly showed its generic missing-page placeholder after sending, but the reply persisted and a same-URL reload restored the normal thread. Service-only, expiring pair access is deployed through migrations `20260828221025` and `20260828221307`, `bd-chat-sync` v39, and `bd-chat-status` v26. The inactive vendor website send is correctly blocked and must not be treated as delivered. Confirm image-send UI/media permission remains disabled in this release.
- [ ] Chat report closes the current website conversation and the app blocks/suppresses the reported member. Same-sync closure of a newly discovered alias is deployed and controlled app/website tests passed; repeat on TestFlight, test an external website fresh-thread attempt, and record the remaining pre-sync limitation. Do not claim preventive website-wide blocking without a website-side creation hook.
- [ ] Foreground, background and force-quit push delivery through the centralized sweep worker; tap routes to chat; badge clears; payload contains no private text; accepted Expo tickets and later receipts/errors are recorded; invalid-device tokens disable; retry/backoff and ambiguous-network behavior do not create an unacceptable duplicate. Backend retry controls are deployed, but this row requires APNs and a physical TestFlight build.
- [ ] Vendor dashboard, restored Draw tools, and text chat in isolated event `app-review-weddingwin-2026-38970`; confirm only fictional entry/selection/contact data appears, the participant download is exact-vendor/event scoped, each included entrant explicitly accepted version `2026-09-01-in-person-entry`, named-vendor marketing consent is marked included, cross-vendor access fails, outbound email is suppressed, and no real prize can be fulfilled.
- [ ] Confirm private/nonpublic vendor `38970` can authenticate and use its documented dashboard/native-text-chat/draw paths only with paired couple `38971` while remaining absent from public directory/search/profile/event/marketing surfaces. Pair authorization is service-only and expiry-gated; keep it active for the review window. Native chat and the local Release dashboard/Vimeo embedding passed, but restored-draw, signed-out privacy, and exact TestFlight verification remain required.
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
