# App Store Privacy answer guide

Status: **CODE-OWNED GUIDANCE FINAL — App Store Connect answers remain blocked on the owner/live-inventory decisions below.**

This guide covers native features, WeddingWin.ca pages displayed in the app, Supabase, and service providers. Apple treats data retained after a request—including data collected in a web view—as collected. Reconcile every answer with the exact processed TestFlight build and production network log before publishing.

## Top-level answers

| App Store Connect question | Answer / gate |
| --- | --- |
| Do you or your third-party partners collect data from this app? | **Yes.** |
| Privacy Policy URL | Use `https://www.weddingwin.ca/about/privacy` only after the replacement policy is published and verified on signed-out iPhone/iPad browsers. The current public page is not sufficient for this release. |
| User Privacy Choices URL | **Owner must publish a public, mobile-friendly request page that works without login.** The existing `/account/deleteaccount` route redirects signed-out users to login, so it is not ready for this field. Signed-in deletion remains available at About → Delete Account. |
| Is data used for tracking? | Answer **No only after** Meta Pixel and every other tracking request are fully removed from all pages and subresources reachable in the app, and an exact-TestFlight network capture proves no tracking transmission occurs. If any tracking remains, disclose each affected data type, partner, and purpose and implement any required consent/ATT before transmission. Native source having no IDFA SDK and disabling third-party cookies is not sufficient evidence by itself. |

## Code-backed selections

The release behavior supports the selections below. Mark each selected type **Linked to the User: Yes** because it is associated with an account, member ID, session, thread, push token, QR progress record, or optional vendor-draw entry. Use **App Functionality** as the purpose unless the row says otherwise.

| Apple data type | Why it is collected | Purpose additions |
| --- | --- | --- |
| Contact Info → Name | Account/profile/display/company name and optional vendor-draw entrant name; a new entrant's name is disclosed to the specific named vendor under explicit named-vendor draw-and-marketing consent | Product Personalization only where the name/profile changes the experience; also select the accurate Advertising/Marketing or Other Purpose classification for the named vendor's wedding-related marketing after owner/legal review |
| Contact Info → Email Address | Account/auth email, federated-login email, and optional vendor-draw entrant contact; a new entrant's email is disclosed to the specific named vendor under explicit named-vendor draw-and-marketing consent | Select the accurate Advertising/Marketing or Other Purpose classification for the named vendor's wedding-related marketing after owner/legal review |
| Contact Info → Phone Number | Member profile contact information and optional vendor-draw entrant phone; when provided for a new entry, it is disclosed to the specific named vendor under explicit named-vendor draw-and-marketing consent | Select the accurate Advertising/Marketing or Other Purpose classification for the named vendor's wedding-related marketing after owner/legal review |
| Contact Info → Physical Address | Member/profile location fields can include city, province/state, country, and postal/ZIP code | Product Personalization only if used to tailor results |
| User Content → Emails or Text Messages | Private message text plus participant/thread/delivery state | None |
| User Content → Photos or Videos | User-provided profile/listing images and private-message photo attachments selected by the user; retained message media is linked to the participants/thread and governed by the message/media retention schedule | None |
| User Content → Other User Content | Wedding date, profile/listing content, reports/blocks, vendor prize details, draw consent, and eligibility attestations; a current-version draw entry can disclose the provided wedding date to the exact named vendor | Product Personalization only where profile data changes results; also select the accurate Advertising/Marketing or Other Purpose classification for the named vendor's wedding-related marketing after owner/legal review |
| Identifiers → User ID | WeddingWin member ID/token/cookie, Supabase profile ID, Apple subject, thread/message/vendor/event/entry/draw IDs | Product Personalization only where used to tailor the account experience |
| Identifiers → Device ID | Expo push token associated with the member and device platform | None |
| Usage Data → Product Interaction | QR scan/progress, optional draw offer/entry state, and retained interaction state | Analytics only if production actually analyzes it |

## Confirm before selecting or omitting

| Apple data type / purpose | Required evidence |
| --- | --- |
| Search History | Confirm whether in-app vendor searches are retained. The current website policy says searches may be collected; select if true in production. |
| Usage Data → Advertising Data | Select only if in-app pages display ads or retain impressions/clicks. Name the provider and purpose. |
| Diagnostics → Crash Data, Performance Data, Other Diagnostic Data | Inventory Expo, Supabase, website, CDN, device, and support/error logs; determine which IP, user-agent, request, error, timing, and account fields persist. |
| Purchases → Purchase History | WeddingWin accounts and app features are free, but advance VIP admission and door admission are paid. Omit only after confirming the submitted app does not collect, receive, link, or expose ticket-purchase history. Do not treat “no in-app purchase” as proof that this data type is absent. |
| Financial Info → Payment Info | Omit only after confirming neither the submitted app nor any embedded WeddingWin page collects or receives payment-card or payment-account data. Inventory the provider and data flow for paid VIP and door admission even if checkout opens outside the app or the provider handles card data directly. |
| User Content → Customer Support | Confirm whether app email and embedded contact-form submissions are retained with identity and whether Apple's optional-disclosure exception applies. |
| Browsing History | Usually omit for WeddingWin's own pages. Select if WeddingWin or an embedded partner retains off-site content viewed in the app. |
| Sensitive Info | Wedding date alone is Other User Content, not Apple's Sensitive Info. Select only if reachable forms collect one of Apple's sensitive categories. |
| Analytics, Product Personalization, Advertising/Marketing, and Other Purposes | Select per data type based on actual production use. The current contract affirmatively shares current-version entrant contact and wedding details with the exact named vendor for that vendor's wedding-related offers or promotions, so the final App Store purpose selections must disclose that use; owner/legal must choose Apple's applicable category. |
| Tracking | A No answer requires Meta Pixel and every other tracker to be fully absent from all in-app reachable pages/subresources, plus an exact-TestFlight network capture showing no tracking requests. Otherwise disclose tracking and implement required consent/ATT before transmission. “No IDFA” and disabled third-party cookies are not enough. |

Do not select Health, Fitness, Contacts, Precise Location, Coarse Location, Audio Data, Gameplay Content, Credit Info, Other Financial Info, Hands, Head, or Environment Scanning based on the audited release flows. Revisit this list if a production website page reachable inside the app collects any of them.

## Data-flow facts the public policy must match

### Accounts and authentication

- Email/password signup transmits name, email, password, role/plan, consent time, and policy versions. Couple profile completion can transmit wedding date and phone.
- Apple/Google sign-in supplies provider identity claims. WeddingWin can retain email, display name, avatar URL, provider subject, WeddingWin member ID, and Supabase profile ID.
- The app caches member/session data and the Expo push token in iOS secure storage. Server login exchanges are short-lived and single use. Passwords are credentials, but App Store Connect has no separate password type.

### Messaging and moderation

- WeddingWin.ca and/or Supabase retain message text, participants, thread/message identifiers, timestamps, read/delivery state, delivery errors, and report/closure records.
- When the backend rollout gate allows attachments, the user taps Attach and iOS presents its system picker. The app receives only the item the user selects and does not request broad photo-library access for this flow. It resizes and re-encodes the selection as a bounded JPEG; the backend checks the declared type, strict base64 and full decode, decoded size, image dimensions, and rollout cutoff before accepting it.
- Photo attachments are linked to the participants/thread and remain subject to the same report, block, conversation-closure, account-deletion, and approved finite message/media retention rules. These controls do not constitute automated semantic image moderation, which must not be claimed in App Store answers or reviewer notes.
- Reporting records the reporter and participants, closes the current conversation, and suppresses the reported member in the app. A new thread created through an external website entry point can exist until app synchronization discovers and closes it; do not claim a preventive website-wide block.

### QR Bingo booth visits and optional vendor draws

- QR camera frames remain on device for decoding. The matched vendor identifier and signed-in session—not the camera image—are sent to WeddingWin.
- Scan/progress records are tied to the couple, event, and vendor. A scan records the booth visit only; it never creates a draw entry automatically.
- If that vendor has enabled a draw, the app presents a separate optional opt-in after the in-show booth scan. The couple must open Official Rules version `2026-09-01-in-person-entry`, affirm eligibility, and expressly agree that the displayed named vendor may receive the provided contact details for draw administration and that vendor's wedding-related offers or promotions before choosing to enter. Declining leaves only the booth-visit record. The QR entry is the digital replacement for a paper ballot; vendor draws are available only to eligible couples attending the wedding show who visit and scan the named vendor's booth. General admission is free when obtained in advance while the free allocation remains; VIP admission is paid; anyone without an advance general-admission ticket must purchase admission at the door; and paid admission never creates an extra entry or improves the odds. No purchase from the named vendor is required.
- An entry can retain the couple's name, email, phone if provided, wedding date if provided, vendor/event identifiers, server-recorded in-show scan verification state and time, prize and material terms, rules/consent version and time, eligibility attestations, and the exact named-vendor marketing disclosure accepted by the entrant. For every entry made or explicitly re-consented under version `2026-09-01-in-person-entry`, the entrant agrees that Wedding Win may disclose the name, email, provided phone and wedding date, and entry/consent evidence to that one displayed vendor for draw administration and that vendor's wedding-related offers or promotions. The vendor may download those fields in an authenticated, exact-vendor/event CSV, and the report marks that the named-vendor marketing consent is included. It is not a cross-vendor contact list, and a legacy entry remains excluded until the entrant gives fresh current-version consent. Wedding Win does not send vendor marketing merely because the entrant entered; the named vendor is responsible for its own communications and unsubscribe or withdrawal handling. The report-generation audit stores operational metadata rather than the CSV contents or entrant identifiers.
- A selected-potential-winner audit can additionally retain the vendor's eligibility and outside-platform declaration/release attestations, the skill-answer result and time, and a nonblank evidence note stating date, method, and non-sensitive reference. Each eligible couple may receive only one valid entry per named vendor draw. In production, verified winner notices follow the configured vendor/couple channels and are not suppressed; unconditional outbound-email suppression is limited to the isolated fictional App Review fixture.
- The named vendor is the vendor-promotion sponsor, contest operator, and prize provider and is solely responsible for lawful and accurate terms, eligibility and winner-release decisions, administering the mathematical skill-testing question, prize restrictions, taxes, claims, disputes, and timely fulfilment. Wedding Win Inc. is the app developer, limited platform sponsor of the in-app workflow, and technical administrator for entry recording, duplicate controls, randomization, audit, and notices; it is not the named vendor-promotion sponsor, operator, or prize provider and does not supply, guarantee, insure, or fulfil that vendor prize. Wedding Win remains responsible for its own technology, privacy, security, representations, administrative conduct, and non-waivable duties. Apple does not sponsor or participate.
- Vendor draw settings require the vendor to review and accept Official Rules version `2026-09-01-in-person-entry`, including its contact-use and marketing responsibilities, before entries can open. A percentage-off prize must state the qualifying service or package, discount rate, maximum savings, expiry, booking requirements, exclusions, and approximate maximum CAD value. After random selection and before confirm/disqualify, the vendor must independently verify eligibility, attest that it obtained the entrant declaration/release outside Wedding Win, enter the correct mathematical skill-testing answer, and record a nonblank evidence note stating date, method, and non-sensitive reference. For that eligibility/release/fulfilment work, Wedding Win records the vendor's attestation only; it does not perform or certify the work. Fulfilment notices and prize-claim controls stay blocked until the vendor completes these requirements.

### Push notifications

- Supabase stores the Expo push token, platform, member linkage, enabled state, notification/ticket/receipt timestamps, retry state, and delivery errors. Expo and Apple receive routing data and a generic new-message payload; private message text is not included.
- Sign-out attempts to unregister the current token. Account deletion removes or disables account-associated tokens. Physical TestFlight verification of registration, rotation, foreground/background/terminated delivery, and deletion cleanup is still required.

### Account deletion

- Signed-in users choose About → Delete Account and confirm. An Apple-linked account may require Apple reauthentication for revocation.
- The deployed design removes the login, profile or vendor listing, authentication mapping, push tokens, QR records, optional draw entries/settings where account-owned, pending account-owned chat work/cache, and other account-owned app data where permitted. Draw records needed for another participant, fulfilment, disputes, fraud, legal holds, or an approved retention obligation require the specific treatment and finite retention rule stated in the public policy.
- Related conversations close and reject new sends. Shared messages and moderation evidence remain read-only for the surviving participant. Owner/legal must set and publish a finite duration or objective retention criterion, exceptions, backup handling, and eventual deletion or de-identification.
- A live two-account email test passed this design; physical Apple revocation, provider/backups, and exact TestFlight repetition remain release gates.

### Embedded website and providers

- The app uses an incognito WebView, restricts top-frame navigation, disables third-party cookies, and contains client-side Meta Pixel interception. Those controls do not prove a server-provided tracking script is stopped before transmission. A Tracking = No answer requires Meta Pixel and every other tracker to be fully removed from every in-app reachable page/subresource and verified from the exact TestFlight build. HTTPS subresources such as an embedded Vimeo player may still contact operational third parties.
- At minimum, inventory WeddingWin.ca/directory hosting, Supabase, Expo, APNs, Apple, Google, email delivery, ticket/payment providers, CDN, captcha, embedded media, analytics, advertising, support, and backups. Record whether paid-admission checkout is embedded, external, or door-only and whether WeddingWin receives purchase or payment data. For each actual recipient, record data, purpose, country/region, retention, contract role, and privacy link.

## Final App Store Connect gate

- [x] Current source declares required-reason API entries for UserDefaults, file timestamps, system boot time, and disk space.
- [x] Signed build `1.0.0 (2)` contains the packaged required-reason privacy manifest for UserDefaults, file timestamps, system boot time, and disk space; the signature verifies and Apple processed the upload without a privacy-manifest validation error. This does not replace the App Privacy data-collection answers above.
- [ ] Production network/cookie/provider inventory completed against the exact TestFlight build, including proof that Meta Pixel and every other tracker are fully absent from all in-app reachable pages/subresources, or a complete tracking/ATT disclosure path.
- [ ] Tracking answer and every purpose approved; App Privacy answers match any ATT/consent implementation.
- [ ] Public policy and public privacy-request URL published and tested signed out.
- [ ] Retention schedule and deletion exceptions approved and operational.
- [ ] Photos or Videos disclosure, backend-gate state, and message/media retention agree with the submitted build; physical TestFlight system-picker selection/cancel, confirmation that no broad library prompt appears, upload, persistence, report/block, and deletion checks pass on an iPhone.
- [ ] Free app/account features, paid VIP/door admission, any ticket/payment-provider data flow, support, diagnostics, search, analytics, ads, and embedded-provider decisions are recorded without describing the whole reachable website as payment-free.
- [ ] QR scanning itself remains booth-visit progress only; a vendor-draw entry is available only after the eligible couple attends the show, visits the named vendor's booth, scans its QR code, and separately opts in. Verify new entries carry server-stamped `in_show_scan_verified` state/time, direct or mismatched-vendor entry is rejected, and historical rows remain identified without being converted into current entries. Verify the digital-paper-ballot description, one-valid-entry-per-eligible-couple limit, vendor settings, `2026-09-01-in-person-entry` acceptance, explicit named-vendor draw-and-marketing disclosure, authenticated exact-vendor/event contact CSV with included-consent marker and fresh-consent filtering for legacy entries, potential-winner selection/vendor-verification UI, production verified-notice delivery, App Review email suppression, retention/deletion, accurate admission terms, developer/platform/vendor roles, and Apple disclaimer all match the deployed app/backend and public terms.
- [ ] App Store Connect answers compared with the signed binary privacy report and final website network log.

References: [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) and [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).
