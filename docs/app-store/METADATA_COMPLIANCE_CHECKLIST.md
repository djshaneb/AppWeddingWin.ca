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
| Build number | `2` in `app.json` | EAS generated and Apple accepted production build `1.0.0 (2)`; retain the recorded number for this release candidate. |
| Support URL | `https://www.weddingwin.ca/about/contact` | Page is public, but add visible support email, phone and legal address as required for the chosen territories. |
| Marketing URL | `https://www.weddingwin.ca/` | Optional; confirm final branding/content. |
| Privacy URL | `https://www.weddingwin.ca/about/privacy` | Revise per `PRIVACY_POLICY_AMENDMENTS.md` before submission. |
| Privacy Choices URL | **Owner publication required** | Publish a public mobile request page that works without login. The current `/account/deleteaccount` route redirects signed-out users to login and is not ready for this field. Signed-in deletion remains About → Delete Account; physical Apple/provider/backup/exact-build verification remains Pending `DEV-10`. |
| Copyright | **Owner/legal decision required** | Enter the confirmed rights-holder name and year; do not infer the legal entity from branding or source strings. |
| Price | Free | Confirm business model and paid vendor membership handling. |
| Availability | Canada initially | Owner/legal confirmation; raffle rules and privacy law must cover every selected territory. |

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
• Choose whether to enter an individual vendor prize draw after reviewing the prize, rules and data-sharing notice

For wedding professionals:
• Open your WeddingWin vendor dashboard
• Reply to private messages from couples
• Manage a participating booth prize and potential-winner workflow under the official rules

Camera access is requested only for QR scanning. Native private-message image sending is disabled in this release.
```

Before using this description, make every feature available in the submitted build and remove any claim that is not true for all intended users/territories.

## Export compliance

Current technical evidence:

- The client uses HTTPS/TLS and Apple/Google authentication through standard platform/network libraries.
- No proprietary encryption implementation is imported by audited app source.
- `expo-crypto` exists as a dependency, but no app-source import was found in the audit snapshot.
- Backend QR draw signing uses Web Crypto/RSA on Supabase; server-side cryptography is not shipped as an iOS binary implementation.
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
| Contests | **Yes** | QR Bingo includes prize-entry/random winner flows. |
| Gambling | No only if legal confirms no consideration, wagering, purchasable entry, or real-money gaming. | Apple’s definitions and local contest law must be applied to the final rules. |
| Simulated Gambling | No | No casino/wager simulation found. |
| Loot Boxes | No | None found. |
| Advertising | **OWNER CONFIRMATION** | The live site currently requests Meta Pixel. Suppress it server-side for the `WeddingWinApp/1.0` user agent and verify absence on exact TestFlight, or disclose the advertising/tracking behavior and implement required consent/ATT before transmission. |
| Parental Controls | No | None found. |
| Age Assurance | No unless an age gate/verification is added for draws. | Official rules must define eligibility. |
| Profanity, sexual content, violence, drugs, weapons, medical/wellness | None in developer-provided content, subject to final content audit | User messages can be abusive; moderation remains required regardless of rating. |

- [ ] **OWNER/LEGAL CONFIRMATION:** Set minimum account age and contest eligibility (often age of majority) and ensure the app enforces the rules it states.
- [ ] Let App Store Connect calculate the rating from truthful answers; review regional variations.
- [ ] Do not select the Kids category.

References: [Age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and [App Review Guidelines 2.3.6](https://developer.apple.com/app-store/review/guidelines/).

## Raffle / vendor-draw compliance design

Apple Guideline 5.3.1 says sweepstakes and contests must be sponsored by the app developer. Guideline 5.3.2 requires official rules presented in the app and a clear statement that Apple is not a sponsor or involved.

### Recommended model

Use a **developer-sponsored and administered promotion framework only after the legal developer identity is confirmed**:

1. The exact legal entity enrolled as the App Store developer is the sponsor/administrator of every draw offered through the iOS app. Owner/legal must confirm that identity; source strings and the brand name are not sufficient.
2. The named participating vendor is the prize supplier and fulfilment partner—not the sole sponsor—and signs a vendor promotion addendum before enabling entries.
3. Wedding Win controls entry mechanics, consent, eligibility, random selection, records, complaint handling, privacy requirements and rule publication.
4. Each draw has a master official-rules document plus a draw-specific schedule containing vendor, prize and approximate retail value, event, territory, age, opening/closing/draw dates, no-purchase method, odds statement, selection/notification, skill-testing question if legally required, fulfilment, publicity/privacy, disputes, sponsor address and Apple disclaimer.
5. The app displays the prize/data-sharing summary and a durable official-rules link before the user taps Enter Draw. Rules remain accessible from QR Bingo and Vendor Draw Settings. Do not rely on vendor-written text as the legal rules.
6. The rules state clearly: `Apple Inc. is not a sponsor of, responsible for, or involved in this promotion in any manner.` Obtain legal approval for final wording.
7. Vendors receive contact details only for a selected potential winner, solely to verify eligibility and fulfil the named prize. Vendors do not receive the entrant list. Draw entry is not vendor-marketing consent in the initial release.
8. Entry is free and not conditioned on purchase, paid membership, review/rating, app download beyond what Apple permits, or other consideration.

For the initial release, adopt a **no-marketing raffle posture**: draw entry is consent only to administer the named draw and fulfil the prize. Do not include a vendor-marketing checkbox in the same required consent, do not enrol entrants in campaigns, and do not describe exports as lead-generation data. If a separate optional marketing choice is introduced later, it requires its own unticked consent, withdrawal path, policy/official-rules text, App Privacy purpose, vendor controls, and legal review.

If the confirmed App Store developer entity will not be the sponsor/administrator, remove vendor-draw entry/management from the iOS experience (including embedded app web pages) until Apple and legal counsel approve another structure. Relabeling a vendor-run chance draw does not solve Guideline 5.3.1.

Required checks:

- [ ] Qualified Canadian promotions counsel approves sponsorship, rules, privacy, age, territory, winner verification and Québec/other provincial requirements.
- [ ] Developer legal entity in App Store Connect matches the rules’ sponsor identity.
- [ ] Final rules are live, versioned and accessible before entry.
- [ ] Vendor terms require prize availability, lawful description/value, timely fulfilment, privacy limits and indemnity.
- [ ] Test draws and App Review accounts cannot select/contact real entrants.
- [ ] Deployed UI exposes no entrant contact-list export; selected-potential-winner disclosure, suppressed email, vendor terms, and operating procedures do not imply or permit entrant marketing without separate optional consent.
- [ ] Reviewer-fixture email remains suppressed. Production draw email remains disabled until its signed/idempotent fulfilment path, controlled-recipient test, and owner/legal approval are complete.
- [ ] The grand-prize promotion has its own complete official rules; vendor booth draws have specific schedules under the same compliant framework.
- [ ] App Review notes identify the promotion model and attach rules if helpful.

Reference: [App Review Guidelines 5.3](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries)

## Other App Store Connect fields

- [ ] App content rights: confirm Wedding Win owns/licenses every logo, stock image, vendor image, profile asset, sound, screenshot and website content shown in-app.
- [ ] Advertising identifier: answer No if the final binary/site does not use IDFA; otherwise implement ATT and accurate privacy answers.
- [ ] In-app purchases: source has no StoreKit flow. **OWNER CONFIRMATION:** determine whether paid vendor membership, upgrades, or digital services can be bought/managed in the in-app WebView. Resolve Guideline 3.1 requirements before submission.
- [ ] Sign in with Apple capability is enabled on the App ID and distribution profile; the one-time website app-login exchange is deployed; Hide My Email never triggers a personal-email access gate; every outbound account/vendor-contact sender is registered for Apple Private Email Relay with verified SPF/DKIM and physical delivery evidence; and the production backend rejects Expo Go's shared Apple audience unless an explicitly temporary development environment opts in.
- [ ] The Google system-browser flow's PKCE/one-time native exchange and browser-bound OAuth-attempt migration/functions are deployed together; controlled missing/mismatched-cookie and replay tests pass; production server credentials/redirect allowlist are approved; and real first/returning/cancel/error paths pass on TestFlight without member/session credentials in callback URLs or logs.
- [ ] Push Notifications capability/APNs key is enabled on the App ID and distribution profile; the deployed centralized sweep worker, ticket/receipt tracking, durable bounded retry/`Retry-After`, and finite receipt-expiry controls pass on a physical TestFlight device. Confirm token lifecycle and ambiguous-network/no-duplicate behavior rather than inferring device delivery from backend tests.
- [x] `extra.eas.projectId` links current source to `@blair.shane/weddingwin-app`.
- [x] `submit.production.ios.ascAppId` points to the owner-controlled WeddingWin Canada record, build number `2` is recorded, and the signed TestFlight binary contains the linked Expo project. The unused blank `extra.googleOAuth.iosClientId` has been removed; verify the server-held Google credentials and redirect allowlist rather than reintroducing it.
- [x] The signed IPA contains the packaged required-reason manifest for UserDefaults, file timestamps, system boot time, and disk space; its signature verifies and Apple processed the upload without a privacy-manifest validation error. Final App Privacy answers and production network inventory remain separate gates.
- [x] Apple/Expo owner authentication and distribution credentials are available through secure systems. Signed App Store build `1.0.0 (2)` is processed as `Validated`/`Ready to Submit` and assigned to the manual internal QA group; physical installation/testing remains open.
- [ ] Privacy policy, terms, vendor-draw rules, support and account-deletion URLs are final, HTTPS, mobile-friendly and available without broken auth/CAPTCHA.
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
