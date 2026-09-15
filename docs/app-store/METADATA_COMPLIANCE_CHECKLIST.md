# Metadata and age-rating draft

Reconciled September 14, 2026 against source `533821d` (build configuration `58e3438`) and [TERMS-POLICY-UPDATE.md](TERMS_POLICY_UPDATE_2026-09-14.md). **Internal submission worksheet. Public fields, URLs, categories, Canada/free and manual release are saved; final age/privacy/content-rights answers remain unfinished.** Approved launch choices are Canada, free download, English (Canada), iPhone/iPad, seven screenshots per class and manual release. Public-facing copy is in [listing-draft.md](APP_STORE_LISTING.md). Unresolved facts and build/test notes stay in this worksheet, not the public description or screenshots.

## Fields requiring completion

| Field | Current position | Remaining action |
| --- | --- | --- |
| App identity | WeddingWin Canada; Apple ID 6806603211; ca.weddingwin.app; SKU WEDDINGWIN-IOS-CA-20260829; seller Shane Blair | Existing authenticated record verified; version 1.0 Prepare for Submission |
| Current release candidate | Production build 4 FINISHED from clean `533821d`; configuration 4 committed as `58e3438` | EAS e73f9773-b079-4b5c-a462-883f56e9fb96; archive verified, upload completed, Apple Validated/Ready to Submit; WeddingWin Internal QA assigned (one tester), What to Test saved; selected/saved for version 1.0; physical installation/acceptance pending |
| Highest uploaded build | App Store Connect shows 1.0.0 (4), Validated/Ready to Submit; SDK 23A339, iPhone/iPad and production push | Assigned to WeddingWin Internal QA (one existing tester); What to Test saved. User asked to install build 4; physical acceptance pending |
| Categories | Lifestyle primary, Business secondary | Saved and verified after reopening App Information |
| Copyright | Public business spelling is Wedding Win Inc. | Owner confirms rights holder and final 2026 copyright entry |
| Review contact | Saved privately in Apple and visually confirmed after reload | No private values recorded in package files |
| Price/territory/language | Free / Canada only / en-CA | Price and country settings saved and verified; 1 available / 174 not available |
| Release option | Manual, saved and verified | Retain manual release; obtain separate launch approval |
| Artwork/content rights | Existing assets and vendor content | Verify rights and review the final seven-scene design |
| Public links | Support/privacy routes checked; September 14 policy pages published and text verified | Recheck final mobile routes and operational privacy/support handling |
| Encryption | Current source sets ITSAppUsesNonExemptEncryption to false | Confirm final binary/dependencies support that classification; no configuration change authorised by this document |

## Age-rating questionnaire

Use the current questionnaire in the live App Store record and save its actual answers/result as evidence. Do not promise a numerical rating before Apple calculates it. Proposed answers below remain subject to the final content and navigation review; unresolved fields are not No answers.

| Capability/content | Draft answer | Evidence or remaining check |
| --- | --- | --- |
| Messaging and Chat | Yes | Private conversations are a core feature |
| User-Generated Content | Yes | Public member/vendor listings and shared wedding content; private messaging is answered separately |
| Social Media | Unresolved | Inspect reachable feeds/discovery, comments, reactions, reviews and sharing. Private messaging alone does not settle this capability |
| Social Media Disabled for Users Under 13 | No affirmative claim supported | No Declared Age Range API/gated social-media implementation found in inspected source; assess applicability in the live questionnaire |
| Contests | Present; select Infrequent or Frequent after availability review | Optional vendor draws exist; record actual frequency/access across events and early access |
| Gambling | Proposed No only after promotion review | No betting/wagering flow identified; confirm whether admission/payment or another required action constitutes consideration or an entry advantage |
| Simulated Gambling | Proposed None | No wagering simulation found |
| Loot Boxes | Proposed No | No randomized virtual-item purchase found |
| Unrestricted Web Access | Proposed No, subject to final navigation tests | Main-frame WeddingWin/builder hosts stay in app; other HTTPS destinations go to the system browser. HTTPS subframes are permitted. Check redirects, pop-ups and embedded browsing |
| Advertising | Unresolved | Owner identifies paid listings, boosts, sponsored placement and embedded ads; a directory listing or tracking pixel alone does not settle this answer |
| Parental Controls | Proposed No | No parental-control system found |
| Age Assurance | Unresolved | QR entry derives an age-of-majority attestation from the pre-scan agreement. No age-range API, birth-date verification or identity check found. Assess this specific-service gate against the live question; do not claim verified age |
| Profanity; horror/fear; alcohol/tobacco/drugs | Frequency review pending | Inspect reachable vendor/editorial/user content, including venue/bar imagery and descriptions |
| Medical/treatment information; health/wellness | Frequency review pending | Inspect reachable advice, vendor categories and editorial content |
| Mature/suggestive themes; sexual content/nudity; graphic sexual content | Frequency review pending | Inspect final imagery and reachable content; the wedding theme does not establish an answer |
| Cartoon/fantasy violence; realistic violence; prolonged graphic violence; guns/weapons | Frequency review pending | No intentional native feature identified; embedded content still needs assessment |
| Kids category | No | This is not a children's app |

The presence of messaging does not establish the whole rating. Current definitions include the separate Social Media capabilities above. Complete every current question and review the resulting Canadian rating. [Apple age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)

Apple's chance-activity screen uses None/Infrequent/Frequent for Contests and Simulated Gambling, and Yes/No for Gambling and Loot Boxes. Confirm the app/EULA minimum age separately from draw eligibility. If the EULA minimum exceeds Apple's calculated rating, use the required higher-rating override. Check both current-OS and earlier-OS displays. [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)

## Promotion and purchase facts

QR Bingo scanning records progress. Optional entry follows a prior agreement and a named vendor Yes/No prompt during authorised scanning, including early access when enabled. Do not reintroduce show-only claims or a second disclosure form in listing/review copy.

The current rules describe Wedding Win as the developer and a limited platform sponsor for the in-app workflow, while the named vendor is the vendor-promotion sponsor, operator and prize provider. Apple's guideline 5.3.1 requires developer sponsorship of sweepstakes/contests; 5.3.2 requires rules and Apple's non-involvement statement in the app. Confirm the real seller/sponsor/operator arrangement and promotion classification before submission. The policy update did not settle this business question. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries)

The approved policy rollout supersedes the older acknowledgement-wording and missing-prize-detail findings. The production Yes/No prompt now contains a short recorded prize summary and value, with full conditions and dates available through Read more. Source `648e60f` removes only the explanatory paragraph from the pre-scan screen; it preserves agreement controls and links. Existing attendance-related wording and early-entry behavior were deliberately left unchanged. See the [published policy update](TERMS_POLICY_UPDATE_2026-09-14.md). The display-only screenshot fixture cannot establish functional entry, winner or notice behavior.

The app download is free; event admission can be paid. Inventory reachable ticketing, vendor subscriptions, promoted placements and other checkout routes. Classify what is purchased and where it is consumed before deciding payment treatment and privacy answers.

The approved notification work is implemented, deployed and locally verified. Natural worker execution and a direct push-provider ticket/receipt passed. Visible banner/sound/tap, automatic new-message/draw-event delivery and production TestFlight acceptance remain open. Keep feature descriptions accurate without presenting pending tests as passed. See [verification evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/verification-summary.json), [historical build evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/eas-build-history.json), the [privacy matrix](APP_PRIVACY_ANSWERS.md) and [release checklist](RELEASE_READINESS.md).

This worksheet does not authorize further code/configuration changes or public release.
