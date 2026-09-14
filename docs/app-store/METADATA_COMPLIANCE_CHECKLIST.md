# Metadata and age-rating draft

Updated September 14, 2026. **Internal submission worksheet; not saved in App Store Connect.** Approved launch choices are Canada, free download, English (Canada), iPhone/iPad, seven screenshots per class and manual release. Public-facing copy is in [listing-draft.md](APP_STORE_LISTING.md). Unresolved facts and build/test notes stay in this worksheet, not the public description or screenshots.

## Fields requiring completion

| Field | Current position | Remaining action |
| --- | --- | --- |
| App identity | WeddingWin; bundle ca.weddingwin.app; existing Store record previously named WeddingWin Canada | Confirm current seller-owned record, display name and SKU without creating a duplicate |
| Current local/device build | Development-signed 1.0.0 (3), source `faf553f`; installed and launched on the iPhone | This is not a processed App Store/TestFlight release candidate |
| Historical Store build | EAS reports a finished Store build 1.0.0 (3), September 2, source `6840adb` | Predates current changes; verify highest uploaded/processed build in App Store Connect and select a fresh approved candidate with an accepted build number |
| Categories | Lifestyle primary, Business secondary are draft defaults | Preserve existing record values until verified |
| Copyright | Public business spelling is Wedding Win Inc. | Owner confirms rights holder and final 2026 copyright entry |
| Review contact | Not established by this audit | Owner supplies name, email and telephone securely |
| Price/territory/language | Free / Canada / en-CA | Apply to the existing Store record as preparation proceeds |
| Release option | Manual | Retain manual release after approval; do not publish automatically |
| Artwork/content rights | Existing assets and vendor content | Verify rights and review the final seven-scene design |
| Public links | Support, privacy, privacy-request, terms and rules reachable | Recheck final mobile routes and align stale privacy QR wording |
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

The public policy/rules assign sponsorship solely to each vendor and expressly exclude Wedding Win as sponsor. Apple's guideline 5.3.1 requires developer sponsorship of sweepstakes/contests; 5.3.2 requires rules and Apple's non-involvement statement in the app. Confirm the real seller/sponsor/operator arrangement and promotion classification before submission. A cosmetic wording change is not evidence of a changed operating arrangement. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries)

The live privacy policy retains show-only/older acknowledgement language, while the rules require vendor-specific information in the entry flow that the current simple modal omits. Resolve the actual disclosure placement without silently weakening rules or expanding the requested Yes/No prompt. See the [unpublished wording proposal](PRIVACY_COPY_ALIGNMENT_DRAFT.md) and [privacy and age audit](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/package-review/privacy-and-age-audit.md).

The app download is free; event admission can be paid. Inventory reachable ticketing, vendor subscriptions, promoted placements and other checkout routes. Classify what is purchased and where it is consumed before deciding payment treatment and privacy answers.

The approved notification work is implemented, deployed and locally verified. Natural worker execution and a direct push-provider ticket/receipt passed. Visible banner/sound/tap, automatic new-message/draw-event delivery and production TestFlight acceptance remain open. Keep feature descriptions accurate without presenting pending tests as passed. See [verification evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/verification-summary.json), [historical build evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/eas-build-history.json), the [privacy matrix](APP_PRIVACY_ANSWERS.md) and [release checklist](RELEASE_READINESS.md).

This worksheet does not authorize further code/configuration changes or public release.

Canonical package source: [metadata-age-rating-draft.md](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/metadata-age-rating-draft.md). Repository links above are adapted for this location.
