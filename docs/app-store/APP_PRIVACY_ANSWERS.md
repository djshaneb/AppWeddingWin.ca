# App Store Privacy answer guide

Status: **CODE-OWNED GUIDANCE FINAL — App Store Connect answers remain blocked on the owner/live-inventory decisions below.**

This guide covers native features, WeddingWin.ca pages displayed in the app, Supabase, and service providers. Apple treats data retained after a request—including data collected in a web view—as collected. Reconcile every answer with the exact processed TestFlight build and production network log before publishing.

## Top-level answers

| App Store Connect question | Answer / gate |
| --- | --- |
| Do you or your third-party partners collect data from this app? | **Yes.** |
| Privacy Policy URL | Use `https://www.weddingwin.ca/about/privacy` only after the replacement policy is published and verified on signed-out iPhone/iPad browsers. The current public page is not sufficient for this release. |
| User Privacy Choices URL | **Owner must publish a public, mobile-friendly request page that works without login.** The existing `/account/deleteaccount` route redirects signed-out users to login, so it is not ready for this field. Signed-in deletion remains available at About → Delete Account. |
| Is data used for tracking? | **Do not answer No.** Native source has no advertising SDK/IDFA use and disables third-party cookies, but the live site currently requests Meta Pixel from `connect.facebook.net` (pixel ID `1947515779077331`). The client-side interception in source is not proof the request is prevented early enough in the submitted WebView. Preferred v1 resolution: suppress Meta Pixel server-side whenever the `WeddingWinApp/1.0` user-agent tag is present, then prove absence in an exact-TestFlight network capture. Otherwise select tracking for each affected type, identify Meta/other partners and purposes, and implement required consent/ATT before data is sent. |

## Code-backed selections

The release behavior supports the selections below. Mark each selected type **Linked to the User: Yes** because it is associated with an account, member ID, session, thread, push token, QR record, or draw record. Use **App Functionality** as the purpose unless the row says otherwise. Do not select advertising/marketing for raffle data; the implemented release posture limits it to draw administration and prize fulfilment.

| Apple data type | Why it is collected | Purpose additions |
| --- | --- | --- |
| Contact Info → Name | Account/profile/display/company name and selected-potential-winner name | Product Personalization only where the name/profile changes the experience |
| Contact Info → Email Address | Account/auth email, federated-login email, and selected-potential-winner contact | None |
| Contact Info → Phone Number | Member profile and selected-potential-winner contact | None |
| Contact Info → Physical Address | Member/profile location fields can include city, province/state, country, and postal/ZIP code | Product Personalization only if used to tailor results |
| User Content → Emails or Text Messages | Private message text plus participant/thread/delivery state | None |
| User Content → Photos or Videos | User-provided profile/listing images and any retained historical message media; native chat image sending is disabled | None |
| User Content → Other User Content | Wedding date, profile/listing content, prize details, reports/blocks, consent records, and draw records | Product Personalization only where profile data changes results |
| Identifiers → User ID | WeddingWin member ID/token/cookie, Supabase profile ID, Apple subject, thread/message/vendor/event IDs | Product Personalization only where used to tailor the account experience |
| Identifiers → Device ID | Expo push token associated with the member and device platform | None |
| Usage Data → Product Interaction | QR scan/progress, raffle entry/draw actions, and retained interaction state | Analytics only if production actually analyzes it |

## Confirm before selecting or omitting

| Apple data type / purpose | Required evidence |
| --- | --- |
| Search History | Confirm whether in-app vendor searches are retained. The current website policy says searches may be collected; select if true in production. |
| Usage Data → Advertising Data | Select only if in-app pages display ads or retain impressions/clicks. Name the provider and purpose. |
| Diagnostics → Crash Data, Performance Data, Other Diagnostic Data | Inventory Expo, Supabase, website, CDN, device, and support/error logs; determine which IP, user-agent, request, error, timing, and account fields persist. |
| Purchases → Purchase History | Confirm whether vendor memberships, subscriptions, or other purchases are retained and reachable through the app. |
| Financial Info → Payment Info | Confirm the production payment flow. If an outside processor collects it and WeddingWin never receives it, follow Apple's processor exception; otherwise select it. |
| User Content → Customer Support | Confirm whether app email and embedded contact-form submissions are retained with identity and whether Apple's optional-disclosure exception applies. |
| Browsing History | Usually omit for WeddingWin's own pages. Select if WeddingWin or an embedded partner retains off-site content viewed in the app. |
| Sensitive Info | Wedding date alone is Other User Content, not Apple's Sensitive Info. Select only if reachable forms collect one of Apple's sensitive categories. |
| Analytics, Product Personalization, Advertising/Marketing purposes | Select per data type only when the production use—not a policy's broad “may” language—supports it. |
| Tracking | The live site currently requests Meta Pixel. A No answer requires verified server-side suppression for the app user agent plus an exact-TestFlight network capture showing no tracking requests. Otherwise disclose tracking and implement required consent/ATT before transmission. “No IDFA” and disabled third-party cookies are not enough. |

Do not select Health, Fitness, Contacts, Precise Location, Coarse Location, Audio Data, Gameplay Content, Credit Info, Other Financial Info, Hands, Head, or Environment Scanning based on the audited release flows. Revisit this list if a production website page reachable inside the app collects any of them.

## Data-flow facts the public policy must match

### Accounts and authentication

- Email/password signup transmits name, email, password, role/plan, consent time, and policy versions. Couple profile completion can transmit wedding date and phone.
- Apple/Google sign-in supplies provider identity claims. WeddingWin can retain email, display name, avatar URL, provider subject, WeddingWin member ID, and Supabase profile ID.
- The app caches member/session data and the Expo push token in iOS secure storage. Server login exchanges are short-lived and single use. Passwords are credentials, but App Store Connect has no separate password type.

### Messaging and moderation

- WeddingWin.ca and/or Supabase retain message text, participants, thread/message identifiers, timestamps, read/delivery state, delivery errors, and report/closure records.
- Native image sending is disabled. Profile/listing images and retained historical message media still require disclosure and retention treatment.
- Reporting records the reporter and participants, closes the current conversation, and suppresses the reported member in the app. A new thread created through an external website entry point can exist until app synchronization discovers and closes it; do not claim a preventive website-wide block.

### QR Bingo and draws

- QR camera frames remain on device for decoding. The matched vendor identifier and signed-in session—not the camera image—are sent to WeddingWin.
- Scan/progress records are tied to the couple, event, and vendor. Scanning does not itself create a draw entry.
- A separate opt-in stores the entrant member ID, name, email, phone, wedding date, consent text/version/time, vendor/event IDs, and draw/winner state.
- Vendors do not receive the entrant list. Only a selected potential winner's disclosed contact and verification fields may be shared for eligibility verification and prize fulfilment. Entry is not marketing consent. Reviewer-fixture email is suppressed; production email is fail-closed until explicitly approved and enabled.

### Push notifications

- Supabase stores the Expo push token, platform, member linkage, enabled state, notification/ticket/receipt timestamps, retry state, and delivery errors. Expo and Apple receive routing data and a generic new-message payload; private message text is not included.
- Sign-out attempts to unregister the current token. Account deletion removes or disables account-associated tokens. Physical TestFlight verification of registration, rotation, foreground/background/terminated delivery, and deletion cleanup is still required.

### Account deletion

- Signed-in users choose About → Delete Account and confirm. An Apple-linked account may require Apple reauthentication for revocation.
- The deployed design removes the login, profile or vendor listing, authentication mapping, push tokens, QR/draw records, pending account-owned chat work/cache, and other account-owned app data where permitted.
- Related conversations close and reject new sends. Shared messages and moderation evidence remain read-only for the surviving participant. Owner/legal must set and publish a finite duration or objective retention criterion, exceptions, backup handling, and eventual deletion or de-identification.
- A live two-account email test passed this design; physical Apple revocation, provider/backups, and exact TestFlight repetition remain release gates.

### Embedded website and providers

- The app uses an incognito WebView, restricts top-frame navigation, disables third-party cookies, and contains client-side Meta Pixel interception. The live site nevertheless loads `connect.facebook.net/en_US/fbevents.js` with pixel ID `1947515779077331`; client interception, incognito mode, and cookie settings do not prove the request is stopped. Prefer server-side suppression for the `WeddingWinApp/1.0` user-agent tag and verify it from the exact TestFlight build. HTTPS subresources such as an embedded Vimeo player may also contact third parties.
- At minimum, inventory WeddingWin.ca/directory hosting, Supabase, Expo, APNs, Apple, Google, email delivery, payments, CDN, captcha, embedded media, analytics, advertising, support, and backups. For each, record data, purpose, country/region, retention, contract role, and privacy link.

## Final App Store Connect gate

- [x] Current source declares required-reason API entries for UserDefaults, file timestamps, system boot time, and disk space.
- [x] Signed build `1.0.0 (2)` contains the packaged required-reason privacy manifest for UserDefaults, file timestamps, system boot time, and disk space; the signature verifies and Apple processed the upload without a privacy-manifest validation error. This does not replace the App Privacy data-collection answers above.
- [ ] Production network/cookie/provider inventory completed against the exact TestFlight build, including proof that Meta Pixel is server-side suppressed for `WeddingWinApp/1.0` or a complete tracking/ATT disclosure path.
- [ ] Tracking answer and every purpose approved; App Privacy answers match any ATT/consent implementation.
- [ ] Public policy and public privacy-request URL published and tested signed out.
- [ ] Retention schedule and deletion exceptions approved and operational.
- [ ] Payment, support, diagnostics, search, analytics, ads, and embedded-provider decisions recorded.
- [ ] Raffle recipient/purpose remains selected-potential-winner-only, fulfilment-only, and no-marketing in UI, rules, vendor terms, operations, and answers.
- [ ] App Store Connect answers compared with the signed binary privacy report and final website network log.

References: [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) and [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).
