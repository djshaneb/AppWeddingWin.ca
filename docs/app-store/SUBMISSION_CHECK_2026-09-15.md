# App Review submission check — September 15, 2026

After the age-rating setup, the owner asked whether WeddingWin could be sent to Apple and what remained. The live version 1.0 draft was checked in App Store Connect.

## Saved build selection

The draft still selected build 4. The initial Add for Review action showed a Newer Build Available notice, which was cancelled. The build 4 association was removed from the version (the uploaded build was not deleted), build **1.0.0 (5)** was selected, and Save was clicked. Reloading the page confirmed build 5 remained selected. This is a version-metadata change, not a rebuild or App Review submission. The existing manual-release selection was retained.

## Apple's validation result

Add for Review on the saved build 5 draft returned **Unable to Add for Review** with these required items:

1. Copyright information is required.
2. Content Rights Information must be set up in App Information.
3. An Admin must provide the app's privacy practices in App Privacy.

The page additionally repeated that Copyright was required. No age-rating, screenshot or build-selection error was reported in this check. This is the Store form's validation result, not proof that all app behavior, policy or reviewer-access requirements are complete.

The owner subsequently confirmed Wedding Win Inc. as copyright holder and explicitly confirmed permission to use vendor content. At 21:46 UTC, copyright `2026 Wedding Win Inc.` and Content Rights Information (“Yes, this app has the necessary rights to its third-party content.”) were saved and verified after reload. This permission was not inferred from public profiles. App Privacy still requires the actual app/WebView and provider inventory; no unknown answer was filled as No.

## Recheck after ownership and rights were saved

At 21:49 UTC, Add for Review was run again on the saved build 5 draft. **The only reported validation error was that an Admin must provide the app’s privacy practices in App Privacy.** The copyright and Content Rights Information errors were gone. Build 5 remained selected and manual release was unchanged. No App Review submission occurred; this form validation does not close functional reviewer access, testing or the remaining policy facts.

## Unpublished App Privacy draft

Fourteen confirmed data types were selected and saved: Name, Email Address, Phone Number, Contacts, Other Financial Info, Purchase History, Emails or Text Messages, Photos or Videos, Gameplay Content, Other User Content, User ID, Device ID, Product Interaction and Other Diagnostic Data. The three additions were supported by read-only checks of the deployed demo guest-list, budget and vendor-payment UI; all fourteen selections persisted after reload. Each still shows **Set Up**, no purpose/linkage/tracking questionnaire is finalized, and Publish is disabled. Broader categories and actual provider uses remain under review; the App Privacy submission blocker is not resolved. See the [privacy worksheet](APP_PRIVACY_ANSWERS.md) for the limited Chrome traffic observation and the remaining native WebView verification.

## Review/testing work at the earlier draft check

At that earlier check, the John/Jane–Willow synthetic screenshot fixture is deliberately display-only. Source guards prevent turning it into an entry/winner fixture through an ordinary settings toggle. Existing source supports an ordinary isolated app-review fixture for a different controlled couple/vendor pair; a new controlled couple with Cedar is a setup candidate requiring provisioning, current-rule/prize acceptance and live verification. It had not been provisioned or proven in that check; the later build 6 section records the separately implemented and tested nonbinding mode. Existing external-email suppression must be respected, and the private walkthrough/QR must match the eventual functional access.

Build 5 installation remains unresolved on the two tested iPhones. The successful build 4 iPad tests and independent artifact audit remain valid historical evidence, not a successful build 5 phone install. Apple support case details remain in the private local case record. No new installation attempt, push, draw action, App Review submission or public release occurred during this check.

A later September 15 device check found the iPhone 15 on iOS 27; its earlier installation-error evidence was recorded on iOS 17.4.1. A bounded local helper attempt timed out enabling UI automation before its test ran, with **zero Install taps**. This does not add a TestFlight installation attempt or alter the existing failure counts.

## Local WebView inspection checkpoint

With the owner-approved single WebView inspection prop, an initial simulator build made with `CODE_SIGNING_ALLOWED=NO` displayed a generic startup notification retry banner. Rebuilding the same source with normal simulator ad-hoc signing cleared the banner while preserving John and Jane’s authenticated session; the exact Keychain OSStatus was not captured. No production code or Store build changed.

A native `/home` WKWebView reload captured ordinary site/CDN/font/image resources and the Google account client script, with no Meta/Facebook request in that home-only capture. This is limited native-page evidence, not a complete tracking determination or build 5 TestFlight pass. The additional search/builder captures below broaden the representative scope; inspection is now paused pending the business-use answer, and the unpublished App Privacy setup and other submission gates remain open. The [privacy worksheet](APP_PRIVACY_ANSWERS.md) records the scoped resource inventory.

At approximately 22:16–22:17 UTC, additional native captures verified Google autocomplete during a Niagara Falls vendor search, the Wedding Venues results page, and Website-tab navigation through the builder callback into John and Jane’s authenticated dashboard. Observed traffic included Google Maps services, the search page’s first-party/widget and Pexels resources, and builder resources plus its Supabase authentication and website/guest/budget/vendor-payment reads. No Meta/Facebook requests appeared in these captures. Raw query values, tokens and headers were not retained. This representative trace does not finalize provider retention or tracking declarations; see the scoped inventory in the privacy worksheet.

After inspection, the app returned to native home with John and Jane signed in and no retry banner. Safari Web Inspector was closed, “Show features for web developers” was restored to its original Off state and verified, and the private reviewer research tab was closed. The unpublished App Privacy draft remains open for continued setup.

## Later build 6 TestFlight checkpoint

Build 6 finished at 22:49:49.924 UTC, passed the signed-archive checks and completed EAS upload at 22:51:27.899 UTC. A fresh App Store Connect check then confirmed upload complete, Ready to Submit, 90 days of testing, WeddingWin Internal QA assigned (Internal, one tester) and saved What to Test. The Apple build ID is `f3a21a26-9d34-46eb-ad8d-43893847858b`. This processing status is not App Review submission or a new version-draft build-selection check. The earlier saved build 5 selection above remains the last recorded version-draft selection in this document.

The separate nonbinding review pair completed its API flow and was reset afterward; the original screenshot fixture remains unchanged. Both native simulator review-role logins, couple No/Yes persistence, vendor selection/verification/explicit Send and both authenticated result views passed. Ordinary John and Jane home lacked the review link, and simulator push opt-in correctly required a physical device. Physical build 6 installation, message/draw pushes, final App Privacy answers, remaining policy/reviewer checks and the unsubmitted Apple feedback follow-up remain pending. See the [build 6 verification record](RELEASE_VERIFICATION_2026-09-15.md#build-6-archive-upload-and-apple-processing). No App Review submission or public release occurred.

The subsequent physical inspection runner timed out enabling automation before its test started, with zero Install taps. The phone-unlock handoff remains pending; existing TestFlight install-failure counts are unchanged. The simulator exposed a review-header/status-bar overlap. The local provider correction was rebuilt and visually verified at 23:01:33 UTC on iPhone 17 Pro / iOS 26.5: the title/Close clear the status bar/Dynamic Island and the body controls remain readable. It is not in uploaded build 6. The owner subsequently approved Store build 7; its subsequent archive/upload checkpoint is recorded below.


## Build 7 and private Notes checkpoint

Approved production build **1.0.0 (7)**, EAS `06659611-a344-4d30-a061-29028052916b`, finished at **23:09:01.429 UTC**. Its archive passed strict signature/certificate/profile, device-family, SDK and production-APNs checks and includes the locally verified review-header correction. Source/configuration is pushed through `0cae23d`. EAS submission `722bb739-c323-4de7-b5b1-b0f0e9d48105` was scheduled at 23:15 UTC; the fresh App Store Connect row now shows **1.0.0 (7) Processing**. The upload has reached Apple, while completed processing and internal-group assignment remain open. See the [archive record](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/build7-archive-verification.json) and [build 7 verification](RELEASE_VERIFICATION_2026-09-15.md#approved-build-7-archive-and-submission-checkpoint).

Apple’s private Notes field now contains the controlled review-pair walkthrough and credentials, plus Cedar access. A reload and exact DOM comparison confirmed the saved text, **3,636 characters / 3,643 UTF-8 bytes**. No passwords were displayed or copied into the package. The public credential-free draft is version-neutral. This saved-field check does not replace final sign-in, draw or notification checks on the selected distribution build.

The version 1.0 draft **still selects build 5**. Manual release remains required. Physical installation/testing, App Privacy and remaining policy gates are open. Feedback Assistant draft `120056018` has the updated build 5/7 report saved, with no attachments uploaded and no submission; the latest support-case search found only Apple’s acknowledgement. No App Review submission or public release occurred.

At 23:17:23–23:17:47 UTC, the build 7 inspection helper ran successfully on Shane’s iPhone 16 Pro / iOS 26.5.2. It skipped because the exact build 7 TestFlight row was not yet present during Apple processing, with zero Install taps. The earlier phone-unlock/automation handoff is resolved; installation and functional checks remain open.


## Final build 7 distribution checkpoint

Build 7 is now upload **Complete** and **Ready to Submit** in Apple, with 90 days of testing, WeddingWin Internal QA assigned (Internal, one tester) and What to Test saved. Apple build ID: `221d5f3d-a511-4df3-be32-a982c6489743`.

The exact build 7 row was verified on Shane’s iPhone 16 Pro / iOS 26.5.2. One Install tap at **23:18:46 UTC** and one standard replacement confirmation at **23:20:29 UTC** produced the same failure, observed at **23:20:49 UTC**: **“Could not install WeddingWin Canada. The requested app is not available or doesn’t exist.”** No Open button appeared. The automation worked; **WeddingWin installation failed before app-function or push testing could begin**. See [installation evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/iphone-build7-installation-result.json). Archive and Apple-processing checks do not identify another defect that would justify another rebuild.

Private reviewer Notes remain saved and verified. The version draft still selects build 5; App Privacy, physical acceptance, remaining policy gates and the unsubmitted Apple feedback follow-up remain open. No App Review submission or public release occurred.
