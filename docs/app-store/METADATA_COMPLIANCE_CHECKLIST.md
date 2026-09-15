# Metadata and age-rating worksheet

Reconciled September 14, 2026 against source `533821d` (build configuration `58e3438`) and [TERMS-POLICY-UPDATE.md](TERMS_POLICY_UPDATE_2026-09-14.md); age rating updated September 15. **Internal submission worksheet. Public fields, URLs, categories, Canada/free, manual release and the age rating are saved; final privacy/content-rights answers remain unfinished.** Approved launch choices are Canada, free download, English (Canada), iPhone/iPad, seven screenshots per class and manual release. Public-facing copy is in [listing-draft.md](APP_STORE_LISTING.md). Unresolved facts and build/test notes stay in this worksheet, not the public description or screenshots.

## Fields requiring completion

| Field | Current position | Remaining action |
| --- | --- | --- |
| App identity | WeddingWin Canada; Apple ID 6806603211; ca.weddingwin.app; SKU WEDDINGWIN-IOS-CA-20260829; seller Shane Blair | Existing authenticated record verified; version 1.0 Prepare for Submission |
| Current release candidate | Production build 4 FINISHED from clean `533821d`; configuration 4 committed as `58e3438` | EAS e73f9773-b079-4b5c-a462-883f56e9fb96; archive verified, upload completed, Apple Validated/Ready to Submit; WeddingWin Internal QA assigned (one tester), What to Test saved; selected/saved for version 1.0; physical iPad installation and seven functional UI tests verified; two automatic message deliveries verified; first tap passed and second alert/sound user-confirmed; full acceptance incomplete; [iPad installation evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/submission/apple-draft-verification.json) |
| Highest uploaded build | App Store Connect shows 1.0.0 (4), Validated/Ready to Submit; SDK 23A339, iPhone/iPad and production push | Assigned to WeddingWin Internal QA (one existing tester); What to Test saved. Physical iPad installation and seven functional UI tests verified; two automatic message deliveries verified; first tap passed and second alert/sound user-confirmed; full acceptance incomplete |
| Categories | Lifestyle primary, Business secondary | Saved and verified after reopening App Information |
| Copyright | Public business spelling is Wedding Win Inc. | Owner confirms rights holder and final 2026 copyright entry |
| Review contact | Saved privately in Apple and visually confirmed after reload | No private values recorded in package files |
| Price/territory/language | Free / Canada only / en-CA | Price and country settings saved and verified; 1 available / 174 not available |
| Release option | Manual, saved and verified | Retain manual release; obtain separate launch approval |
| Artwork/content rights | Existing assets and vendor content | Verify rights and review the final seven-scene design |
| Public links | Support/privacy routes checked; September 14 policy pages published and text verified | Recheck final mobile routes and operational privacy/support handling |
| Encryption | Current source sets ITSAppUsesNonExemptEncryption to false | Confirm final binary/dependencies support that classification; no configuration change authorised by this document |

## Age-rating questionnaire

Completed, saved and verified after reload in App Store Connect on September 15, 2026 at 21:32 UTC. Apple calculated **13+**; the owner-authorized override is **18+**, and the country details explicitly list Canada under 18+. Apple's earlier-than-OS-26 global display is **17+**. The [saved questionnaire and supporting evidence](AGE_RATING_2026-09-15.md) records the individual answers, public-content review and override.

The saved answers include UGC, social media and messaging; no parental controls, age assurance or unrestricted web access; owner-confirmed no advertising; infrequent alcohol references, medical information, mature themes and non-explicit sexual content/nudity; wellness topics present; and frequent contests. Social media is assessed under Apple's broad public review/gallery discovery definition. Contests are prominent, repeated QR/draw interactions during events; event availability remains limited. Gambling, simulated gambling, loot boxes, profanity, horror, graphic sexual content and all violence categories are absent in the recorded answers.

The Store rating does not implement age verification or change draw eligibility, existing policies or app code. Remaining promotion, privacy and content-rights requirements below remain open. See [Apple's age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and [higher-rating guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).

## Promotion and purchase facts

QR Bingo scanning records progress. Optional entry follows a prior agreement and a named vendor Yes/No prompt during authorised scanning, including early access when enabled. Do not reintroduce show-only claims or a second disclosure form in listing/review copy.

The current rules describe Wedding Win as the developer and a limited platform sponsor for the in-app workflow, while the named vendor is the vendor-promotion sponsor, operator and prize provider. Apple's guideline 5.3.1 requires developer sponsorship of sweepstakes/contests; 5.3.2 requires rules and Apple's non-involvement statement in the app. Confirm the real seller/sponsor/operator arrangement and promotion classification before submission. The policy update did not settle this business question. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries)

The approved policy rollout supersedes the older acknowledgement-wording and missing-prize-detail findings. The production Yes/No prompt now contains a short recorded prize summary and value, with full conditions and dates available through Read more. Source `648e60f` removes only the explanatory paragraph from the pre-scan screen; it preserves agreement controls and links. Existing attendance-related wording and early-entry behavior were deliberately left unchanged. See the [published policy update](TERMS_POLICY_UPDATE_2026-09-14.md). The display-only screenshot fixture cannot establish functional entry, winner or notice behavior.

The app download is free; event admission can be paid. Inventory reachable ticketing, vendor subscriptions, promoted placements and other checkout routes. Classify what is purchased and where it is consumed before deciding payment treatment and privacy answers.

The approved notification work is implemented, deployed and locally verified. Natural worker execution and a direct push-provider ticket/receipt passed. Automatic delivery of two separate controlled messages passed on TestFlight build 4, with one delivery attempt and successful receipt each. The first notification’s physical Notification Center presentation/tap passed; the user separately confirmed seeing the second alert and hearing sound. Exact delivery-time app state, home-icon badge, draw-event dispatch and the remaining acceptance matrix are unverified. See [physical iPad build 4 report](IPAD_TESTFLIGHT_BUILD4_REPORT.md). Keep feature descriptions accurate without presenting pending tests as passed. See [verification evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/verification-summary.json), [historical build evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/eas-build-history.json), the [privacy matrix](APP_PRIVACY_ANSWERS.md) and [release checklist](RELEASE_READINESS.md).

This worksheet does not authorize further code/configuration changes or public release.
