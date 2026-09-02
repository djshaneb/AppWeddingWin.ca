# App Store metadata and compliance checklist

Status: **CODE-OWNED CHECKLIST FINAL — owner/App Store Connect decisions and release evidence remain open.**

## Proposed product-page metadata

| Field | Draft | Action |
| --- | --- | --- |
| App name | `WeddingWin` | Confirm trademark/name availability in App Store Connect. |
| Subtitle | `Wedding planning, connected` | 27 characters; owner approval required. |
| Bundle ID | `ca.weddingwin.app` | Already declared in Expo config; register the exact explicit App ID in Apple Developer. |
| SKU | **Owner decision required** | Set once in App Store Connect; it is not customer-visible and cannot be changed later. Record the chosen value in the private release ticket, not as a repository placeholder. |
| Primary language | English (Canada) | Confirm storefront/localization plan. |
| Primary category | Lifestyle | Owner confirmation. |
| Secondary category | Business | Owner confirmation; appropriate to the vendor path. |
| Version | `1.0.0` | Matches current Expo config. |
| Build number | `3` in `app.json` | EAS generated and submitted production build `1.0.0 (3)`; confirm Apple processing before selecting it for TestFlight or submission. |
| Support URL | `https://www.weddingwin.ca/about/contact` | Page is public, but add visible support email, phone and legal address as required for the chosen territories. |
| Marketing URL | `https://www.weddingwin.ca/` | Optional; confirm final branding/content. |
| Privacy URL | `https://www.weddingwin.ca/about/privacy` | Revise per `PRIVACY_POLICY_AMENDMENTS.md` before submission. |
| Privacy Choices URL | **Owner publication required** | Publish a public mobile request page that works without login. The current `/account/deleteaccount` route redirects signed-out users to login and is not ready for this field. Signed-in deletion remains About → Delete Account; physical Apple/provider/backup/exact-build verification remains Pending `DEV-10`. |
| Copyright | **Owner/legal decision required** | Enter the confirmed rights-holder name and year; do not infer the legal entity from branding or source strings. |
| Price | Free | WeddingWin account and app features are free, with no paid membership, subscription, or in-app purchase. Event admission is separate: advance general admission is free only while its allocation remains, VIP admission is paid, and anyone without an advance general ticket must purchase admission at the door. Inventory any ticket/payment flow reachable from the final app without describing the whole website as payment-free. |
| Availability | Canada initially | Owner/legal confirmation; privacy law, service terms, and support coverage must cover every selected territory. |

Suggested keyword draft (verify App Store Connect’s 100-byte limit):

```text
wedding planning,vendors,venues,Canada,private chat,QR bingo,wedding shows
```

Suggested description draft:

```text
WeddingWin brings Canadian wedding planning, vendor discovery and wedding-show tools together in one app.

For couples:
• Find wedding vendors and venues
• Build and manage your WeddingWin wedding website
• Keep private vendor conversations together
• Scan participating booths with QR Bingo at supported wedding shows
• Track participating booth visits with QR Bingo
• Optionally enter an open vendor draw after scanning; scanning alone never enters

For wedding professionals:
• Open your WeddingWin vendor dashboard
• Reply to private messages from couples
• Configure your booth prize and manage your vendor draw
• Use the free vendor tools available in your WeddingWin account

Camera access is requested only for QR scanning. A scan records booth-visit progress; any vendor-draw entry is a separate optional action under the displayed rules. Vendor draws are available only to eligible couples attending the wedding show who visit the named vendor's booth and scan its QR code. The QR entry replaces a paper ballot. Couples who choose to enter expressly agree that their provided contact and wedding details may go to that specific named vendor for draw administration and that vendor's wedding-related offers or promotions. General admission is free when obtained in advance while the free allocation remains; VIP admission is paid; anyone without an advance general-admission ticket must purchase admission at the door; paid admission never adds another chance or improves odds; and no purchase from the named vendor is required. Native private-message image sending is disabled in this release.
```

Before using this description, make every feature available in the submitted build and remove any claim that is not true for all intended users/territories.

## Export compliance

Current technical evidence:

- The client uses HTTPS/TLS and Apple/Google authentication through standard platform/network libraries.
- No proprietary encryption implementation is imported by audited app source.
- `expo-crypto` exists as a dependency, but no app-source import was found in the audit snapshot.
- Backend vendor-draw fulfilment signing uses Web Crypto/RSA on Supabase; this server-side cryptography is not shipped as an iOS binary implementation.
- The Expo config currently declares `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`.

Draft decision:

- [ ] **OWNER/LEGAL CONFIRMATION:** Verify the final binary and every linked third-party library use only exempt encryption, such as standard OS HTTPS/authentication, and do not provide non-exempt/proprietary crypto functionality.
- [ ] If confirmed, retain the current `ITSAppUsesNonExemptEncryption: false` setting and answer the corresponding App Store Connect export question consistently.
- [ ] If not confirmed, set it to `true`, complete Apple’s encryption questions, and upload any required documentation/compliance code.
- [ ] Retain the written classification decision and review it when dependencies or security features change.

Apple’s documentation says the Info.plist Boolean is `NO` when the app does not use encryption or uses only encryption exempt from documentation. This is a compliance classification, not a code-only conclusion.

Reference: [Complying with encryption export regulations](https://developer.apple.com/documentation/Security/complying-with-encryption-export-regulations)

## Age-rating draft

Complete Apple’s current questionnaire from the final build; do not manually guess the displayed rating.

| Questionnaire capability/content | Draft response | Reason / gate |
| --- | --- | --- |
| Messaging and Chat | **Yes** | Users directly exchange private text. Native image sending is disabled in this release. |
| User-Generated Content | **Yes, conservatively** | Vendors provide public listing/profile content and users provide private messages. Direct messages are also covered separately by Messaging and Chat. |
| Social Media | No | No feed/reposting/likes/social amplification was found. |
| Unrestricted Web Access | **No only after verification** | WebView host/navigation, bridge-origin, tracking-script, and cookie controls are implemented in source. Focused URL tests pass **7/7**, and the local Release Simulator kept the vendor dashboard in-app with its Vimeo HTTPS iframe embedded. Top-frame policy remains strict: unrelated HTTPS routes through the system browser; only HTTPS and `about:blank` subframes may remain embedded; `http:`, `javascript:`, `data:`, and `file:` subframes are blocked. Against the exact TestFlight build, verify redirects/pop-ups cannot bypass these rules and required external links still use the intended system-browser path. Source/local configuration alone is not final release evidence. |
| Contests | **Yes — owner/legal confirmation required** | After a booth scan, an open vendor draw can present a separate optional entry flow. Wedding Win Inc. is the app developer and limited platform sponsor of the in-app workflow; the named vendor remains the vendor-promotion sponsor, contest operator, and prize provider. Official rules and the Apple non-sponsor disclaimer must be accessible in-app. Confirm this narrow dual-role model truthfully reflects operations and satisfies Apple Guideline 5.3.1 before submission. |
| Gambling | No | The vendor draws involve no wagering, stake, purchase from the named vendor, or real-money gaming. Show admission is separate from the vendor draw, and paid VIP or door admission never buys another chance or improves odds. Random selection alone does not make the flow gambling. Confirm this classification for every launch territory. |
| Simulated Gambling | No | No casino/wager simulation found. |
| Loot Boxes | No | None found. |
| Advertising | **No only after verification** | Meta Pixel and every other advertising/tracking request must be fully removed from all in-app reachable pages/subresources and absent in an exact-TestFlight network capture. Otherwise answer accurately and implement any required consent/ATT before transmission. |
| Parental Controls | No | None found. |
| Age Assurance | No, subject to Apple's current questionnaire | Vendor-draw entrants affirm age of majority and other eligibility conditions, but the app does not provide a general identity/age-verification system. Answer any contest-specific age questions separately and truthfully. |
| Profanity, sexual content, violence, drugs, weapons, medical/wellness | None in developer-provided content, subject to final content audit | User messages can be abusive; moderation remains required regardless of rating. |

- [ ] **OWNER/LEGAL CONFIRMATION:** Set the minimum account age and ensure the app and public terms enforce the same value.
- [ ] Let App Store Connect calculate the rating from truthful answers; review regional variations.
- [ ] Do not select the Kids category.

References: [Age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and [App Review Guidelines 2.3.6](https://developer.apple.com/app-store/review/guidelines/).

## QR Bingo and optional vendor-draw boundary

Apple Guideline 5.3.1 says sweepstakes and contests offered in an app must be sponsored by the app developer. The intended narrow model makes Wedding Win Inc. the app developer and limited platform sponsor of the in-app workflow for entry recording, duplicate controls, randomization, audit, and notices. The named vendor remains the vendor-promotion sponsor, contest operator, and prize provider and is solely responsible for lawful terms, eligibility and winner-release decisions, the skill-testing question, prize restrictions, taxes, claims, disputes, and timely fulfilment. Wedding Win is not the named vendor-promotion sponsor/operator/prize provider, does not supply, guarantee, insure, or fulfil that vendor prize, and remains responsible for its own technology, privacy, security, administrative conduct, and non-waivable duties. Owner/legal must confirm that these words reflect the actual operational role and satisfy Guideline 5.3.1; wording alone cannot create a role the business does not perform.

### Required release model

1. QR Bingo records booth visits and card progress: signed-in account, event, matched vendor, scan time, duplicate state, and completion/progress. A scan itself never creates a draw entry.
2. If that vendor has enabled a draw, the app may show a separate optional offer after the scan. The couple must open Official Rules version `2026-09-01-in-person-entry`, confirm age-of-majority, residency, and exclusion eligibility, expressly accept the named-vendor draw-and-marketing disclosure, and affirmatively enter. Declining leaves only the booth-visit record.
3. Vendor draws are available only to eligible couples attending the wedding show. The couple must visit the named vendor's booth, scan its QR code, and separately choose whether to enter; the QR entry is the digital replacement for a paper ballot. General admission is free when obtained in advance while the free allocation remains; VIP admission is paid; anyone without an advance general-admission ticket must purchase admission at the door; paid admission never creates another chance or improves odds; and no purchase from the named vendor is required.
4. Before entry, the app must conspicuously display the named vendor, prize/description, approximate CAD value or maximum savings, eligible region, closing and draw times, odds basis, one-valid-entry-per-eligible-couple/vendor limit, skill-testing-question requirement, official rules, Wedding Win Inc. app-developer/limited-platform-sponsor-of-the-in-app-workflow/technical-administrator role, named-vendor promotion-sponsor/contest-operator/prize-provider responsibilities, Apple non-sponsor disclaimer, and the exact disclosure: name, email address, phone number if provided, wedding date if provided, and entry/consent evidence go only to the displayed named vendor for this draw and that vendor's wedding-related offers or promotions. A percentage-off prize must identify the qualifying service or package, discount rate, maximum dollar savings, expiry, booking requirements, exclusions, and approximate maximum CAD value.
5. Entry under `2026-09-01-in-person-entry` must include the entrant's affirmative named-vendor marketing consent. The report must be restricted to the exact vendor and event, mark that included consent, prevent cross-vendor access, and exclude every legacy entry until the entrant gives fresh current-version consent.
6. Vendor settings remain closed until the vendor supplies the required prize or percentage-discount details, opens and accepts Official Rules version `2026-09-01-in-person-entry` and the vendor obligations, and enables the draw. Material terms lock after the first entry.
7. The authenticated vendor dashboard may provide an exact-vendor/event entrant-administration CSV containing Event, Vendor, Participant Reference, Name, Email, Phone, Wedding Date, Entered At, Entry Method, Rules Version, Entrant Eligibility Attested, Selection Status, and Marketing Consent. A current entry's Entry Method must be `QR scan opt-in`; any retained legacy value is historical audit data, not a current route. The report-generation audit stores operational metadata rather than CSV contents or entrant identifiers.
8. Random selection produces only a potential winner. The vendor verification UI requires the vendor to confirm eligibility, administer and record the mathematical skill-testing answer, obtain and record any required winner release, and then confirm or disqualify that person. Fulfilment notices and prize-claim controls remain blocked until verification is complete. Production verified-winner notices then use the configured vendor/couple delivery channels and are not unconditionally suppressed; outbound-email suppression remains limited to the isolated fictional App Review fixture. The named vendor is solely responsible for lawful and accurate terms, eligibility and winner-release decisions, the skill test, prize restrictions, taxes, claims, disputes, and timely fulfilment; Wedding Win operates only the technical controls and audit record and remains responsible for its own technology, privacy, security, administrative conduct, and non-waivable duties.

Required checks:

- [ ] Exact native/API tests prove scan, duplicate, and progress remain independent from entry; decline creates no entry; affirmative opt-in creates one idempotent entry only after an accepted in-show scan for that exact vendor; direct entry without that scan is rejected; and one couple cannot receive another chance for the same vendor draw.
- [ ] Vendor settings, `2026-09-01-in-person-entry` acceptance, enable/disable, entry count, exact named-vendor/event entrant CSV, cross-vendor denial, legacy-entry fresh consent, included named-vendor marketing-consent marker, metadata-only report audit, material-term lock, potential-winner selection, vendor-verification UI, confirm/disqualify actions, and fulfilment-notice controls pass with isolated fictional data in both app and website.
- [ ] Public rules, the retired-route notice, privacy policy, vendor terms, App Review notes, and every in-app disclosure use the same in-show booth-visit/scan/optional-entry flow, digital-paper-ballot description, developer/platform/vendor roles, accurate admission/no-extra-chance wording, one-valid-entry-per-eligible-couple/vendor limit, eligibility/skill-test/winner-release requirements, named-vendor draw-administration and wedding-related-marketing fields/purpose, fresh current-version consent for legacy entries, vendor prize responsibility, and Apple disclaimer.
- [ ] A controlled production fixture proves verified-winner email is sent through each configured vendor/couple channel without unconditional suppression. The isolated App Review fixture separately proves fictional data, no real prize, and outbound-email suppression.
- [ ] Owner/legal confirms the narrow Wedding Win app-developer/limited-platform-sponsor role reflects the actual in-app workflow and satisfies Apple Guideline 5.3.1 while leaving vendor-promotion legality, eligibility/release/skill-test decisions, prize/tax/claim obligations, and fulfilment with the named vendor.
- [ ] Qualified promotions/privacy counsel reviews the complete flow and terms for every launch territory.

Reference: [App Review Guidelines 5.3](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries)

## Other App Store Connect fields

- [ ] App content rights: confirm Wedding Win owns/licenses every logo, stock image, vendor image, profile asset, sound, screenshot and website content shown in-app.
- [ ] Advertising identifier: answer No if the final binary/site does not use IDFA; otherwise implement ATT and accurate privacy answers.
- [ ] In-app purchases: source has no StoreKit flow, and WeddingWin accounts and app features are free. Event admission is separate: advance general admission is free only while its allocation remains, VIP admission is paid, and admission at the door is paid when no advance general-admission ticket was obtained. Verify the exact submitted app and every reachable embedded page expose no paid membership, subscription, upgrade, or in-app purchase; inventory and accurately disclose every embedded or external ticket checkout, payment provider, and payment-data flow in App Review and App Privacy answers.
- [ ] Sign in with Apple capability is enabled on the App ID and distribution profile; the one-time website app-login exchange is deployed; Hide My Email never triggers a personal-email access gate; every outbound account/vendor-contact sender is registered for Apple Private Email Relay with verified SPF/DKIM and physical delivery evidence; and the production backend rejects Expo Go's shared Apple audience unless an explicitly temporary development environment opts in.
- [ ] The Google system-browser flow's PKCE/one-time native exchange and browser-bound OAuth-attempt migration/functions are deployed together; controlled missing/mismatched-cookie and replay tests pass; production server credentials/redirect allowlist are approved; and real first/returning/cancel/error paths pass on TestFlight without member/session credentials in callback URLs or logs.
- [ ] Push Notifications capability/APNs key is enabled on the App ID and distribution profile; the deployed centralized sweep worker, ticket/receipt tracking, durable bounded retry/`Retry-After`, and finite receipt-expiry controls pass on a physical TestFlight device. Confirm token lifecycle and ambiguous-network/no-duplicate behavior rather than inferring device delivery from backend tests.
- [x] `extra.eas.projectId` links current source to `@blair.shane/weddingwin-app`.
- [x] `submit.production.ios.ascAppId` points to the owner-controlled WeddingWin Canada record, build number `3` is recorded, and the signed App Store binary contains the linked Expo project. The unused blank `extra.googleOAuth.iosClientId` has been removed; verify the server-held Google credentials and redirect allowlist rather than reintroducing it.
- [ ] The signed build-3 IPA contains the packaged required-reason manifest for UserDefaults, file timestamps, system boot time, and disk space, and its signature verifies. Confirm that Apple processes this exact upload without a privacy-manifest validation error. Final App Privacy answers and production network inventory remain separate gates.
- [x] Apple/Expo owner authentication and distribution credentials are available through secure systems. Signed App Store build `1.0.0 (3)` passed artifact inspection and EAS Submit reports success; Apple processing, TestFlight assignment, and physical installation/testing remain open.
- [ ] Privacy policy, terms, QR Bingo vendor-draw rules, support, and account-deletion/privacy-request URLs are final, HTTPS, mobile-friendly and available without broken auth/CAPTCHA. Confirm `/qr-bingo-free-entry` is only a retired-route notice, exposes no submission form, and sends users to the in-show QR flow.
- [ ] Content moderation meets Guideline 1.2: filtering, report, app-side member block, timely response and published contact information. The same-sync website-close flush is deployed and controlled tests pass; document that an external website entry point may still create a fresh thread before sync, or implement and verify website-side prevention before claiming a website-wide user block.
- [ ] Account deletion meets Guideline 5.1.1(v); under `DEV-10`, prove account-owned data deletion plus conversation closure/blocking and recipient-visible read-only shared history. Obtain owner/legal approval for the finite retention duration/criterion, exceptions, and published wording.
- [ ] Data collection and deletion match App Privacy answers and the public policy.
- [ ] App review primary/additional credentials and sample QR are prepared. Service-only, expiring chat access is deployed for the exact private vendor `38970` ↔ couple `38971` pair without publishing the vendor. The controlled app→website and supported active-couple website→private-vendor-app text round trip passed; inactive-vendor website sending is correctly blocked. Exact-build account/privacy checks and the TestFlight repeat remain before final reviewer instructions are submitted.
- [ ] Finalize the iPhone set. Two `1320×2868` opaque RGB PNGs are dimensionally eligible candidates, but they use the fictional `App Review` fixture and are not processed-TestFlight captures; recheck every visible string and recapture if necessary. The nine `1206×2622` files remain QA evidence and include explicit do-not-upload states listed in `SCREENSHOT_SHOT_LIST.md`.
- [ ] Replace the current `2064×2752` iPad capture. Although its dimensions are accepted, it shows a narrow phone-like layout and a partial gray overlay/spinner artifact. Complete full iPad testing, capture an actual final iPad set, then inspect iPhone/iPad previews in App Store Connect. App preview video is optional.
- [ ] Availability, price, tax category, release method and countries/regions are selected.
- [ ] If distributed in the EU, complete Digital Services Act trader-status/contact requirements.
- [ ] Select manual release for version 1.0.0 so production can be released after final approval checks.
- [ ] Confirm no beta/debug language, tunnel URLs, placeholder content or dormant undocumented feature remains.
- [ ] Complete accessibility information truthfully after VoiceOver, larger text, contrast and motion testing.
- [ ] Complete the coordinated `APP_EMAIL_CHANGE_SECRET` rotation across live Supabase and the website during one explicitly approved sensitive-value update. Keep exact live locations/state and both values in the private security ticket; never store a secret value in Git or submission notes.
