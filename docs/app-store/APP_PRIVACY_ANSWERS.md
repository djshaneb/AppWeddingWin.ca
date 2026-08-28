# Draft App Store Privacy answers

Status: **DRAFT — do not publish until the owner confirmations are resolved.**

Apple defines collection as transmitting data off-device and retaining it beyond servicing the request in real time. It also says data collected through app web views must be declared. The answers below therefore cover native WeddingWin features, Supabase, WeddingWin.ca pages shown in the private WebView, and service providers.

## Top-level answers

| App Store Connect question | Draft answer |
| --- | --- |
| Do you or your third-party partners collect data from this app? | **Yes** |
| Privacy Policy URL | `https://www.weddingwin.ca/about/privacy` |
| User Privacy Choices URL | Use a confirmed public, mobile-friendly privacy-request page. The deployed backend and current source expose signed-in deletion at About → Delete Account. Fresh disposable email members passed the current account-owned deletion plus closed/blocked conversations and preserved recipient history. Physical Sign in with Apple revocation, provider/backups, public-route access, retention approval, and the exact uploaded build remain Pending `DEV-10`. `https://www.weddingwin.ca/account/deleteaccount` is only a supplemental route for people who cannot sign in. |
| Is data used for tracking? | **OWNER CONFIRMATION REQUIRED.** Native source contains no advertising SDK or IDFA use. The release WebView source blocks the Meta Pixel, restricts hosts/navigation, and disables third-party cookies, but the public WeddingWin.ca policy says the site may use targeted advertising, ad networks, third-party tracking cookies, and web beacons. Source controls do not establish what the final website scripts collect. Inventory the exact TestFlight build's production pages, cookies, redirects, and recipients. If they combine app/WebView data with third-party data for advertising or measurement, answer Yes for the affected types and implement required consent/ATT. Do not publish “No” solely from the native package list or intended cookie settings. |

## Recommended data types

The conservative draft below is supported by current code and current public website disclosures. Each listed type should be marked **Linked to the User: Yes** because it is stored with an account/member ID, session, device token, thread, raffle entry, cookie, or other identifiable profile information. Mark **Used for Tracking: No** only after the website tracking inventory confirms that answer.

| Apple data type | Select? | What WeddingWin collects | Purposes to select | Linked? | Tracking? |
| --- | --- | --- | --- | --- | --- |
| Contact Info → Name | **Yes** | Couple/vendor first and last name, display/company name, raffle entrant and winner name | App Functionality; Product Personalization. **Do not select Developer’s Advertising or Marketing for raffle data under the required no-marketing release posture.** | Yes | Owner confirmation |
| Contact Info → Email Address | **Yes** | Account/auth email, Apple/Google email, raffle contact/winner email, email-delivery recipient | App Functionality; Product Personalization. **Do not select Developer’s Advertising or Marketing for raffle data under the required no-marketing release posture.** | Yes | Owner confirmation |
| Contact Info → Phone Number | **Yes** | Member profile phone; vendor-draw opt-in and winner contact | App Functionality. **Do not select Developer’s Advertising or Marketing for raffle data under the required no-marketing release posture.** | Yes | Owner confirmation |
| Contact Info → Physical Address | **Yes, conservatively** | WeddingWin.ca profile/member fields include city, province/state, country, and postal/ZIP code, and the public policy says it collects addresses. | App Functionality; Product Personalization | Yes | Owner confirmation |
| User Content → Emails or Text Messages | **Yes** | Private app↔website message contents, sender/recipient/thread, timestamps, read/delivery state | App Functionality | Yes | No, unless production site scripts repurpose chat data |
| User Content → Photos or Videos | **Yes, conservatively** | Profile/avatar/vendor listing images where user-provided, plus any historical message media retained from earlier behavior. Native chat image sending is intentionally disabled in this release. | App Functionality | Yes | No, unless production site scripts repurpose them |
| User Content → Other User Content | **Yes** | Wedding date; vendor prize title/description; profile/listing content; message report/closure records; QR scan/raffle consent text and draw records | App Functionality; Product Personalization where profile/listing data changes what is shown | Yes | Owner confirmation |
| Identifiers → User ID | **Yes** | Brilliant Directories member ID/token/cookie, Supabase UUID/profile ID, Apple subject ID, chat thread/message IDs, raffle/vendor IDs | App Functionality; Product Personalization | Yes | Owner confirmation |
| Identifiers → Device ID | **Yes, conservatively** | Expo push token tied to member ID and device platform; unique web cookie identifiers described in the public policy | App Functionality. Add Analytics/Marketing only if production web scripts use it that way. | Yes | Owner confirmation |
| Search History | **Yes** | WeddingWin.ca states it collects searches performed on the site; vendor search is available through the app WebView | App Functionality; Product Personalization; Analytics only if retained and analyzed | Yes | Owner confirmation |
| Usage Data → Product Interaction | **Yes** | QR booth scans and progress, raffle entry/draw activity; the website policy states pages visited and links clicked may be collected | App Functionality; Analytics if retained for analysis; Product Personalization if it changes recommendations/results | Yes | Owner confirmation |
| Diagnostics → Other Diagnostic Data | **OWNER CONFIRMATION** | Supabase/website request logs may retain IP address, user agent, server errors, timestamps, and delivery errors. Select if retained beyond servicing a request. | App Functionality and/or Analytics, matching actual use | Usually yes if stored with account/session | Owner confirmation |
| Usage Data → Advertising Data | **OWNER CONFIRMATION** | Select only if ads are actually displayed or ad impressions/clicks from WebView pages are retained. The current public policy says this may occur. | Third-Party Advertising and/or Developer’s Advertising or Marketing; Analytics as applicable | Determine from vendor | Determine from vendor |
| Browsing History | **Usually No** | WeddingWin’s own pages are part of the app experience. Select only if the app or an embedded third party retains off-site content viewed inside the app. External pages that open in Safari do not by themselves make WeddingWin collect browsing history. | Match actual purpose | Determine | Determine |
| Sensitive Info | **No for wedding date alone** | Apple’s Sensitive Info examples cover areas such as racial/ethnic data, sexual orientation, pregnancy/childbirth, disability, beliefs, political opinion, genetics, and biometrics. A wedding date is better represented as Other User Content. Select Sensitive Info if current website/profile forms collect any of Apple’s listed categories through the app. | Match actual purpose | Yes if selected | Determine |
| Payment Info | **OWNER CONFIRMATION** | Native source does not collect card/bank data. The public policy says professional payment information may be collected. If payment is entered with an outside processor and Wedding Win never receives it, Apple says it need not be declared; otherwise select it. | App Functionality | Yes | No unless repurposed |
| Purchase History | **OWNER CONFIRMATION** | Select if vendor membership/subscription or other purchases made on WeddingWin.ca are retained and accessible through the app. | App Functionality; Analytics/Personalization only if actually used that way | Yes | Determine |
| Customer Support | **OWNER CONFIRMATION** | The app exposes email support and the site exposes a contact form. Select if submissions are retained with user identity and do not satisfy every optional-disclosure criterion. | App Functionality | Usually yes | No |

Do not select Health, Fitness, Contacts, Precise Location, Coarse Location, Audio Data, Gameplay Content, Credit Info, Other Financial Info, Hands, Head, or Environment Scanning based on the audited native flows. Revisit if the production website collects them through pages reachable in the app.

## Source-observed data-flow inventory — production verification pending

The active authentication, deletion, push-delivery, and chat-close migrations/Edge Functions recorded in `SUPABASE_DEPLOYMENT_PROVENANCE.md`, plus the Brilliant Directories `/app-login` widget and official-rules page, are deployed to the review backend and have targeted live smoke evidence. The inventory below is not proof that every provider, retention behavior, and user flow has been exercised in production/TestFlight; reconcile it with immutable deployment provenance, production network/database/provider evidence, and exact-build testing before publishing.

### Accounts and authentication

- Email/password signup sends first name, email, password, role/plan, consent timestamp and policy versions to WeddingWin.ca. Couple profile completion also sends wedding date and can send phone number.
- Sign in with Apple/Google provides identity claims. Supabase profiles can retain email, display name, avatar URL, linked WeddingWin member ID, and Apple’s stable subject identifier.
- Native login/member/session objects include account role, member ID, profile/company/contact/location fields, member token, and cookie. Member/session data and the Expo push token are cached in iOS SecureStore.
- The deployed flow replaces reusable credential-bearing app-login URLs with hashed, short-lived, single-use server exchanges. Native Google completion is additionally bound to a PKCE challenge/verifier; web Apple/Google completion is bound to a secure host-only initiating-browser cookie; and the app redirect carries only the expiring exchange code. Exchange/attempt rows temporarily retain the minimum login completion state until redemption or expiry and are purged on their schedules. Controlled missing/mismatched-cookie, atomic redemption, expiry, replay, and empty-table tests passed; exact TestFlight federated-login verification remains.
- The current Apple verifier accepts Expo Go's shared `host.exp.Exponent` audience only when `ALLOW_EXPO_GO_APPLE_AUD=1` is explicitly set for development. Production must leave that opt-in disabled and verify the WeddingWin audience on the deployed endpoint and signed build.
- Passwords are authentication credentials and should be described in the public policy and security controls, but App Store Connect has no separate password data type.

### Private messages and retained media

- Private message text, sender/recipient member IDs, thread IDs/tokens, timestamps, read state, delivery state/errors, and report/closure records are retained in WeddingWin.ca and/or Supabase mirror/outbox tables.
- Native chat image sending is intentionally disabled for this release and the app must not expose its selection/upload control. Inventory and disclose profile/listing images and any historical message media that remain retained or visible; do not describe new native image collection as enabled.
- Report data identifies the reporter and both conversation participants.

### QR Bingo and vendor draws

- A camera frame is used on-device to decode a QR value. The audited native flow sends the matched vendor ID and account session, not the raw camera image.
- WeddingWin.ca stores scanned vendor IDs and completion/progress state tied to the couple account.
- Vendor draw settings retain vendor ID/name, prize title/description, accepted rules version/time, draw availability, and timestamps.
- After a separate affirmative opt-in, Wedding Win stores the couple member ID, name, email, phone, wedding date, consent wording/version/time, vendor/event IDs, winner selection, and delivery status.
- The deployed release posture does not expose the full entrant contact list to the vendor. Contact details are disclosed only for a selected potential winner, for eligibility verification and prize fulfilment, after the entrant's named-vendor consent. This intentional disclosure must be explicit in the entry notice, privacy policy, vendor agreement, and official rules.
- For release, that disclosure is limited to administering the named draw and fulfilling its prize. Entry is not vendor-marketing consent. Do not select Developer’s Advertising or Marketing for these raffle fields, enrol entrants in campaigns, or describe exports as leads. If implementation, vendor terms, or operations still permit marketing, that is a release blocker—not permission to publish the no-marketing answers.
- Reviewer-fixture email is always suppressed. Production draw email is fail-closed and must remain disabled until a verified fulfilment configuration, idempotency control, controlled-recipient test, and owner/legal approval are recorded.

### Push notifications

- The deployed schema/functions store an Expo push token, device platform, member ID/token, unread count, enabled state, notification timestamps, Expo ticket ID/time, bounded retry count/next-attempt time, finite receipt deadline, and the most recent delivery error in Supabase.
- The deployed backend removes push sending from the chat-status request path and centralizes it in the scheduled sweep worker. The worker records accepted Expo tickets, later checks receipts, honors `Retry-After`, persists bounded retry state for retryable/ambiguous outcomes, expires missing receipts, clears successful tickets/errors, and disables tokens reported as `DeviceNotRegistered`. A ticket is not proof of APNs/device delivery; physical TestFlight delivery remains required.
- The source push payload is generic (“new message”) and does not include private message text. The backend retry/receipt controls are deployed and regression-tested, but APNs signing, token lifecycle on signed hardware, possible ambiguous-network duplicate behavior, and foreground/background/terminated delivery have not been verified on a physical TestFlight device.
- Sign-out attempts to unregister the token and deletes the on-device copy. Account deletion must also remove/disable every server-side token.
- End-to-end production collection/delivery cannot be verified until `extra.eas.projectId`, the App ID push capability, an APNs credential, and a signed TestFlight build are configured. The backend is deployed; token registration, delivery, sign-out, and deletion still require a physical iPhone.

### Account deletion

- Current source and deployed backend expose About → Delete Account, a destructive confirmation, Apple-token signature/audience/subject verification, and possible Apple reauthentication/revocation for a signed-in Apple-linked account. No completed physical-device Apple-revocation/provider-backup test is claimed; that scope remains Pending `DEV-10`.
- If no native session exists, the app may open the public deletion/request route. That fallback is for people who cannot use the signed-in flow; it is not the only deletion mechanism.
- Earlier disposable member `38975` led to stale legacy-JWT and Brilliant Directories child-metadata-order fixes. Its complete chat purge is superseded by the preservation behavior below.
- The deployed deletion migration deletes account-owned identity/profile/cache/push/QR/draw/outbox data, marks related app and website conversations closed, creates an active pair block against the deleted member, and deliberately preserves shared thread/message/report records so the surviving participant retains read-only history and moderation evidence. Fresh disposable members `38978` and `38979` passed this two-participant behavior, including login rejection and 423 send rejection after deletion.
- Before submission, repeat both participants against the immutable uploaded build and test physical Apple-linked, couple, and vendor cases. Verify provider storage, Apple identity/revocation, retained media/object storage, email systems, closure/block enforcement, legal/safety records, and backup expiry beyond the inspected live tables.
- Owner/legal must approve and publish a finite retention duration or objective criterion for preserved shared messages, reports, and blocks, together with any legal/safety exceptions and eventual deletion or de-identification. Do not describe retained recipient history as indefinite, and do not imply that the counterpart's copy is deleted.
- App Store privacy answers and the public policy must describe any legally retained contest, safety, fraud, tax, or backup records precisely. Do not call deactivation or a queued request immediate deletion.

### WebView, cookies, and web traffic

- The release source uses an incognito WebView with restricted WeddingWin/WedWebsite top-frame hosts, third-party cookies disabled, exact OAuth/bridge origin checks, and Meta Pixel blocking. Unrelated top-frame HTTPS routes through the system browser; a distinct non-top-frame rule keeps HTTPS and `about:blank` iframes embedded while blocking `http:`, `javascript:`, `data:`, and `file:` subframes. The focused source tests pass **7/7**, and the local Release Simulator kept the vendor dashboard in-app with Vimeo visibly embedded. Do not describe those controls as shipped until the exact tagged TestFlight build and network log verify navigation, redirects/pop-ups, embedded recipients, cookies, login/logout, and actual data recipients.
- Incognito mode does not remove the need to disclose server-side collection. The live policy says the website may collect IP address, browser/language, access time, cookies, referring address, pages viewed, links clicked, searches, ad interactions, and web-beacon activity.
- **OWNER CONFIRMATION:** inventory actual production scripts and network recipients on every in-app page. The current policy’s broad “may” language is not enough to answer Apple’s tracking questions accurately.

## Service-provider / recipient inventory

Include these in the policy with purpose, data received, retention, safeguards, and location:

- WeddingWin.ca / its directory platform: membership, profile, website sessions/cookies, vendor listings, QR scans, private messages, email delivery.
- Supabase: profiles/Apple mapping, chat mirror/outbox/reports, push-token registry, raffle settings/entries/draws, Edge Function logs.
- Expo push service: push token, platform/routing metadata, generic notification payload.
- Apple: Sign in with Apple authentication data and APNs delivery. Data collected by Apple itself is not WeddingWin’s App Privacy disclosure, but WeddingWin must disclose what it receives/retains.
- Google: Google OAuth authentication data. Confirm whether any Google SDK/script inside WeddingWin.ca also performs analytics or advertising.
- Participating vendor: only after explicit named-vendor raffle opt-in and potential-winner selection, the selected person's contact details and wedding date for eligibility verification and prize fulfilment; no entrant-list access or marketing use under the release posture.
- **OWNER CONFIRMATION:** payment processor, email provider, hosting/CDN, analytics, advertising, spam/captcha, customer-support, and logging vendors used by the production website.

## Required owner/legal confirmations before publishing

- Confirm whether any WeddingWin.ca page shown in-app loads analytics, advertising, retargeting, social pixels, cross-site identifiers, or third-party cookies. Record vendor, script, data, purpose, retention, and whether linked/tracking.
- Verify WebView hardening on the exact release: approved top-frame hosts, off-domain top-level links, HTTPS/`about:blank` iframe behavior, blocked insecure/active-content subframes, server/client redirects, pop-ups/new windows, custom schemes, third-party cookies, login/logout, and cache/storage clearing. A source-code allowlist or cookie flag alone is insufficient.
- Confirm actual IP/user-agent/log retention and use.
- Confirm whether Wedding Win receives professional card/payment data or only a payment processor does.
- Confirm and enforce that raffle vendors receive only selected-potential-winner contact data and may use it only to verify eligibility and fulfil the named prize. If the business later wants marketing, do not reuse entry consent: add a separate optional consent and withdrawal path, update the policy/rules/vendor agreement and App Privacy purposes, and obtain legal approval before enabling it.
- Confirm whether member location/address, demographics, interests, reviews, public posts, website-builder data, and support requests are reachable/collected through the in-app WebView.
- Confirm retention periods and deletion behavior for every database and backup.
- Re-run this inventory against the exact TestFlight build and production web pages immediately before publishing App Privacy answers.
