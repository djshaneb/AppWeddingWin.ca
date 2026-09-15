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

## Remaining review/testing work

The current John/Jane–Willow synthetic screenshot fixture is deliberately display-only. Source guards prevent turning it into an entry/winner fixture through an ordinary settings toggle. Existing source supports an ordinary isolated app-review fixture for a different controlled couple/vendor pair; a new controlled couple with Cedar is a setup candidate requiring provisioning, current-rule/prize acceptance and live verification. It has not been provisioned or proven in this check. Existing external-email suppression must be respected, and the private walkthrough/QR must match the eventual functional access.

Build 5 installation remains unresolved on the two tested iPhones. The successful build 4 iPad tests and independent artifact audit remain valid historical evidence, not a successful build 5 phone install. Apple support case details remain in the private local case record. No new installation attempt, push, draw action, App Review submission or public release occurred during this check.

A later September 15 device check found the iPhone 15 on iOS 27; its earlier installation-error evidence was recorded on iOS 17.4.1. A bounded local helper attempt timed out enabling UI automation before its test ran, with **zero Install taps**. This does not add a TestFlight installation attempt or alter the existing failure counts.

## Local WebView inspection checkpoint

With the owner-approved single WebView inspection prop, an initial simulator build made with `CODE_SIGNING_ALLOWED=NO` displayed a generic startup notification retry banner. Rebuilding the same source with normal simulator ad-hoc signing cleared the banner while preserving John and Jane’s authenticated session; the exact Keychain OSStatus was not captured. No production code or Store build changed.

A native `/home` WKWebView reload captured ordinary site/CDN/font/image resources and the Google account client script, with no Meta/Facebook request in that home-only capture. This is limited native-page evidence, not a complete tracking determination or build 5 TestFlight pass. The additional search/builder captures below broaden the representative scope; inspection is now paused pending the business-use answer, and the unpublished App Privacy setup and other submission gates remain open. The [privacy worksheet](APP_PRIVACY_ANSWERS.md) records the scoped resource inventory.

At approximately 22:16–22:17 UTC, additional native captures verified Google autocomplete during a Niagara Falls vendor search, the Wedding Venues results page, and Website-tab navigation through the builder callback into John and Jane’s authenticated dashboard. Observed traffic included Google Maps services, the search page’s first-party/widget and Pexels resources, and builder resources plus its Supabase authentication and website/guest/budget/vendor-payment reads. No Meta/Facebook requests appeared in these captures. Raw query values, tokens and headers were not retained. This representative trace does not finalize provider retention or tracking declarations; see the scoped inventory in the privacy worksheet.

After inspection, the app returned to native home with John and Jane signed in and no retry banner. Safari Web Inspector was closed, “Show features for web developers” was restored to its original Off state and verified, and the private reviewer research tab was closed. The unpublished App Privacy draft remains open for continued setup.
