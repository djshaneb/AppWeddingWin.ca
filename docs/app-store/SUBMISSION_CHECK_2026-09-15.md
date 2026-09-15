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

The owner was asked to confirm the copyright holder and permission to display third-party content. App Privacy still requires the actual app/WebView and provider inventory; no unknown answer was filled as No.

## Remaining review/testing work

The current John/Jane–Willow synthetic screenshot fixture is deliberately display-only. Source guards prevent turning it into an entry/winner fixture through an ordinary settings toggle. Existing source supports an ordinary isolated app-review fixture for a different controlled couple/vendor pair; a new controlled couple with Cedar is a setup candidate requiring provisioning, current-rule/prize acceptance and live verification. It has not been provisioned or proven in this check. Existing external-email suppression must be respected, and the private walkthrough/QR must match the eventual functional access.

Build 5 installation remains unresolved on the two tested iPhones. The successful build 4 iPad tests and independent artifact audit remain valid historical evidence, not a successful build 5 phone install. Apple support case details remain in the private local case record. No new installation attempt, push, draw action, App Review submission or public release occurred during this check.
