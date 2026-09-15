# App Privacy draft matrix

Reconciled September 14, 2026 against source `533821d` (build configuration `58e3438`) and [TERMS-POLICY-UPDATE.md](TERMS_POLICY_UPDATE_2026-09-14.md). **Internal submission worksheet; fourteen data-type selections are saved as an unpublished App Store Connect draft.** This covers native features, embedded WeddingWin/website-builder pages and their service providers. Observed collection is separated from purposes and provider practices that still need confirmation.

The approved notification changes are implemented and deployed. Their earlier local verification and direct push-provider receipt passed; visible phone behavior, automatic new-message/draw delivery and final TestFlight acceptance remain pending. The latest candidate `533821d` includes the later policy, couple-screen and approved demo changes. Its production build 4 is finished and archive-verified, with TestFlight upload completed; the earlier development install is not TestFlight evidence. These limits do not remove implemented collection from the inventory. See [notification evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/verification-summary.json) and the [current policy/build record](TERMS_POLICY_UPDATE_2026-09-14.md).

## Saved draft state — September 15, 2026

App Store Connect now saves these fourteen selected data types: Name, Email Address, Phone Number, Contacts, Other Financial Info, Purchase History, Emails or Text Messages, Photos or Videos, Gameplay Content, Other User Content, User ID, Device ID, Product Interaction and Other Diagnostic Data. The latest additions—Contacts, Other Financial Info and Purchase History—were verified against the inspected deployed builder UI; all fourteen selections persisted after reload. Every selected type still shows **Set Up**; no purpose, linkage or tracking questionnaire is finalized, and Publish is disabled. The data types below distinguish those saved selections from additional categories still under review. This is not a published privacy label or a completed App Review requirement.

## Top-level fields

| Field | Draft |
| --- | --- |
| Does the app collect data? | Yes |
| Privacy Policy URL | https://www.weddingwin.ca/about/privacy — published, text verified and URL saved in App Store Connect |
| Privacy Choices URL | https://www.weddingwin.ca/privacy-request — public request route; URL saved in App Store Connect |
| Data linked to the user | Proposed Yes for the account, contact, messages, QR, consent and push records below; not finalized in Apple |
| Tracking | Unresolved until the final production network/provider inventory is complete; do not infer No from native code alone |

Account-linked data is not anonymous merely because an export or public screen hides its identifier. Record collection by embedded pages and service providers too. Apple's labels and purposes must match actual use. [Apple App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/)

## Data types

| Apple category | App Store draft status | Observed use | Proposed purpose / remaining decision |
| --- | --- | --- | --- |
| Name | Selected; Set Up pending | Accounts, profiles, messages, vendor entries and authorised exports | App Functionality; review any marketing use |
| Email Address | Selected; Set Up pending | Login, verification, contact, draw communications and exports | App Functionality; classify actual vendor/developer marketing use |
| Phone Number | Selected; Set Up pending | QR contact profile and other member/contact fields | App Functionality; classify any authorised marketing use |
| Physical Address | Still under review | Profile/address fields, such as city, province and postal code | Confirm exactly retained fields and whether this category applies |
| Contacts | Selected; Set Up pending | Wedding guest lists and RSVP records; manual/CSV guest collection | App Functionality; confirm full retention and additional purposes |
| Other Financial Info | Selected; Set Up pending | Wedding budgets, actual costs and paid/pending amounts | App Functionality; verify complete scope and any additional use |
| Purchase History | Selected; Set Up pending | Manually recorded vendor contracts/payment schedules and paid/owed records | App Functionality; this does not establish card collection or in-app payment processing |
| Emails or Text Messages | Selected; Set Up pending | Private conversation content and delivery state | App Functionality |
| Photos or Videos | Selected; Set Up pending | Profile/listing images and retained chat media; new chat-photo sending is capability-gated | App Functionality; verify enabled production upload routes and provider handling |
| Gameplay Content | Selected; Set Up pending | QR Bingo card progress and draw participation state | App Functionality; verify full scope and any additional use |
| Other User Content | Selected; Set Up pending | Wedding details, listings, reports, prize terms and consent/eligibility evidence | App Functionality; review actual additional purposes |
| User ID | Selected; Set Up pending | Account/provider identifiers and account-linked message, notification and draw references | App Functionality; generic push text does not make routing identifiers anonymous |
| Device ID | Selected; Set Up pending | Existing account-linked push token/device information | App Functionality; do not infer tracking from the token alone |
| Product Interaction | Selected; Set Up pending | Scans, entry actions and retained feature interaction | App Functionality; Analytics only if actually used that way |
| Customer Support | Still under review | Contact requests and support records where retained | Confirm collection and applicable disclosure before final answers |
| Other Diagnostic Data | Selected; Set Up pending | Retained operational delivery status and bounded error/security records | Confirm exact scope, linkage and purposes |
| Crash Data / Performance Data | Still under review | Potential retained crash or performance records | Select only specific types actually retained; neither is established by selecting Other Diagnostic Data |

The exact Apple purpose for the named vendor's own marketing must be confirmed from actual use; do not label it only App Functionality by default. Likewise, administrative access to an export does not by itself authorise a new marketing purpose.

Confirm search/browsing-history retention, website analytics/advertising, ticket purchase history, checkout data and location derived from IP addresses before omitting those categories. The inspected deployed builder supports selecting Contacts, Other Financial Info and Purchase History as described below; full retention, additional purposes and other specifically requested fields remain under review. Free app features do not prove that no paid event-ticket flow is reachable. Do not select precise device location, microphone/audio or address-book Contacts solely because users provide a city, phone number or selected photo. Generic free-form text does not require declaring every possible sensitive fact a user might type.

## Deployed builder and supporting source evidence

A read-only September 15 Chrome inspection of the existing John and Jane demo session verified the following current deployed collection UI. No records were created and nothing was sent. This supports the three saved additions—Contacts, Other Financial Info and Purchase History—and is consistent with the clean local builder checkout at commit `c334452` (September 7); it does not establish wholesale source/deployment parity, complete retention or the boundary with ticket checkout.

| Selected category or provider | Deployed observation and supporting local source |
| --- | --- |
| Contacts | `/guest-list` displayed seven retained QA guests and RSVP responses; the Guests tab exposed Import CSV and an Add Guest form with First Name, Last Name and optional Email. Local source: [RsvpManager.tsx](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/src/components/RsvpManager.tsx) |
| Other Financial Info | `/budget-calculator` displayed a retained total budget, actual final cost and paid/pending amounts. Local source: [budgetService.ts](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/src/services/budgetService.ts) |
| Purchase History | The vendor tab displayed scheduled/paid/still-owed totals, vendor contact fields and a Quick Add Payment form with vendor, title, amount, due date, description, budget-link and recurrence fields. No card or bank-account fields were present in the inspected forms. Local source: [vendorPaymentsService.ts](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/src/services/vendorPaymentsService.ts) |
| Email delivery | Resend integration exists in local [send-email-campaign/index.ts](/Users/shane/Documents/Codex/2026-09-07/co/WeddingWebsitBuilder2/supabase/functions/send-email-campaign/index.ts); no email was sent during this inspection and current provider processing is not verified by these UI observations |

The same local source review identified Turnstile as a challenge provider. A direct public-builder Chrome baseline loaded Google Fonts, Unsplash, a Bolt badge and provider REST resources. These browser observations do not themselves prove native WebView traffic or tracking. The later scoped native home/search/builder captures are recorded below; broader flow coverage, provider retention and final purpose/linkage/tracking answers remain open.

## Implemented notification collection

Current source retains recipient/sender account references, message aliases or draw references, event times, suppression state, device-registration generation, delivery attempts/status, provider ticket, receipt status and bounded error codes. Notification event history does not copy message bodies, contact details or push tokens; tokens remain in the separate registration table.

Message and draw alerts use generic visible text. Their delivery payload includes event/account routing identifiers and a conversation or draw destination. The draw result is read through an authenticated endpoint after the existing verification and explicit notice-send controls. Provider processing still belongs in the inventory even though the lock-screen text omits private conversation and winner contact details.

The deployed migration schedules daily removal of notification events more than 30 days after creation, cascading their aliases and delivery rows. Delivery eligibility expires sooner: 24 hours for messages and seven days for draw alerts. Account baselines and push registrations have separate lifecycles. Do not describe all notification data as having a universal 30-day expiry. Source/deployment configuration is verified; this audit did not observe the next retention run or establish backup/provider expiry. See [deployment evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/backend-deployment.json).

## Current flow facts

- QR camera images are decoded on device. The scanner transmits matched vendor/account/event information rather than uploaded camera frames.
- Contact details and the QR Bingo agreement come before scanning. The agreement receipt is recorded server-side. A profile alone is not proof that someone accepted it.
- During organiser-authorised scanning, an enabled production vendor can display the named Yes/No entry prompt with a short recorded prize summary and value; Read more exposes full conditions and dates. Yes records that named vendor entry under the accepted current agreement; No retains scan progress without entering. No second agreement form is presented in the prompt. The isolated screenshot fixture is display-only and does not provide a working Yes/entry path.
- Vendor draw exports remain scoped to authorised entries for that vendor. Scanning by itself does not share an entrant list. Separately accepted ticket-sharing disclosures cover attending vendors/exhibitors and sponsors, including sponsors without a booth; the policy update did not widen draw exports or create retroactive consent.
- The administrator master export uses recorded participation evidence, deduplicates accounts across eligible events and excludes known QA data. It is protected administrative access, not a vendor-wide contact list. Export data is snapshotted temporarily; the snapshot expires and scheduled cleanup removes expired snapshot data.
- A card reset resets current scans and vendor entries while preserving relevant historical records. It is not account deletion and does not erase agreement history.
- Account deletion is available in About. Conversations close and account-owned active data is removed or disabled as applicable; shared recipient history and limited audit/security/legal records may remain under the retention policy. Do not promise universal immediate erasure.
- Current message/draw push processing retains the operational records described above. Implementation/deployment evidence and outstanding physical/TestFlight tests are separate from disclosure of that collection.
- Chat photos, where enabled, use the user-selected system-picker item. Technical file checks do not constitute automated moderation of image meaning. Report/block controls and retention still apply.

## Public-policy alignment and final evidence

The September 14 Terms, Privacy, rules amendment and ticket provisions are published and their text was verified. The current app displays recorded prize details with expansion while keeping the named Yes/No choice. Those changes supersede the old acknowledgement-wording and missing-prize-detail findings in the [historical wording proposal](PRIVACY_COPY_ALIGNMENT_DRAFT.md). The subsequent couple-screen cleanup removed only an explanatory paragraph; agreement controls, links and prospective acceptance remain. Existing attendance-related wording and early-entry behavior were left unchanged as requested. Publication does not settle the remaining provider, purpose, tracking or retention decisions.

A September 15 inspection of the public privacy page in Chrome observed actual Meta-related requests: `fbevents.js`, `signals/config`, `facebook.com/tr`, and event traffic to the Google Cloud Run host `mpc-prod-27-s6uit34pua-uk.a.run.app`. The Google-hosted event request’s observed initiator chain came from `connect.facebook.net/signals/config`; it is recorded here as part of the observed Meta request chain, not an independently identified provider. The browser requests included identifier/query fields. No raw request URLs, query values or cookies are retained in this worksheet. This establishes browser transmission, **not** native WebView transmission or a final Apple tracking classification.

The native WebView uses a private session and disables shared/third-party cookies, but allows JavaScript and HTTPS subframes. In `app/(tabs)/index.tsx`, `CLOAK_INJECTION` is injected before content loads; its WeddingWin-host branch assigns no-op `fbq`/`_fbq` handlers and attempts to intercept dynamically created `fbevents.js` script sources (lines 1038–1077). That host-specific protection does not apply to WedWebsite. These are attempted controls, not proof that every Meta/provider request is prevented; no ATT implementation was found in inspected native source/config. The scoped native home/search/builder captures below verify representative navigation only; broader flows and embedded frames, provider retention and final collection/tracking classifications remain unverified.

### Scoped native WebView diagnostic observation

The owner approved one local WebView inspection prop for diagnostic access. The initial simulator build used `CODE_SIGNING_ALLOWED=NO` and displayed a generic notification retry banner on startup. Rebuilding the same source with normal simulator ad-hoc signing cleared that banner; John and Jane remained authenticated. The exact Keychain OSStatus was not captured, so this does not establish a specific Keychain error or a production defect. No production code or Store build was changed.

A reload captured from the native `/home` WKWebView observed WeddingWin/OptimizeCDN, Google Fonts, jsDelivr, Cloudflare/CDNJS, DataTables, Unsplash, a static image from `weddingphotoshare.ca`, and an `accounts.google.com` client script. **No Meta/Facebook requests appeared in that home-only capture.** This result is limited to that page/session and does not prove tracking is absent throughout the app or in the distributed build. The additional search/builder captures below broaden this representative scope; inspection is now paused pending the business-use answer, and purpose, linkage and tracking answers remain unfinished. No raw request URLs, query values, cookies or credentials are recorded here.

Further native captures on September 15 at approximately 22:16–22:17 UTC covered the vendor search and authenticated website-builder entry:

| Native path | Observed requests and UI |
| --- | --- |
| Home vendor search | Entering the non-sensitive city Niagara Falls displayed real Google autocomplete. Requests to `maps.googleapis.com` included `js`, `gen_204`, `AuthenticationService.Authenticate` and `AutocompletionService.GetPredictions`; `maps.gstatic.com` icons also loaded. Selecting Niagara Falls, ON and searching Wedding Venues loaded `wedding_search`, first-party/widget requests and an `images.pexels.com` asset. |
| Website tab | The native Website tab navigated through `wedwebsite.ca`'s `bd-callback` into the authenticated “Welcome John and Jane” dashboard. Observed resources included WedWebsite JavaScript/CSS, Google Fonts, an Unsplash image, and Supabase `bd-sso`, `verify`, `user`, `websites`, `bd_user_links`, `budget_expenses`, `guests` and `vendor_payments` requests. |

No Meta/Facebook requests appeared in these particular captures. These are representative native navigation observations, not an exhaustive app trace; they do not by themselves settle provider retention, purposes, linkage or Apple's tracking classification. No raw query values, tokens or headers are retained in this worksheet.

If app-functionality web content or a provider performs Apple's defined tracking, ATT permission must precede it. A website agreement or cookie choice cannot replace ATT. If tracking is absent, record evidence for that conclusion rather than adding a prompt solely because a pixel string exists. [Apple tracking and web-view guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/)

The current rules identify Wedding Win as the developer and a limited platform sponsor for the in-app workflow, and the named vendor as the vendor-promotion sponsor, operator and prize provider. Confirm the actual Store developer entity and arrangement against Apple's developer-sponsorship requirement before submission. The policy update did not resolve this owner/business decision. See the [current submission review](APPLE_SUBMISSION_REVIEW.md).

The business name appears publicly as **Wedding Win Inc.**, and the public support address is **info@weddingwin.ca**. The authenticated App Store record displays **Shane Blair** as seller. The owner confirmed Wedding Win Inc. as copyright holder, and `2026 Wedding Win Inc.` was saved and verified after reload September 15 at 21:46 UTC. The actual developer/contest sponsorship arrangement remains a separate unresolved fact. [Privacy policy](https://www.weddingwin.ca/about/privacy), [support](https://www.weddingwin.ca/about/contact).

Before submitting:

- [ ] Complete the exact-build and embedded-page network/provider inventory.
- [ ] Approve data purposes, linked status, any tracking answer and associated consent requirements.
- [ ] Reconcile ticket, search, support, diagnostic and media data with actual production use.
- [ ] Approve operational retention/deletion handling and determine whether the final provider/purpose inventory requires any further policy update.
- [ ] Verify public privacy-request access and end-to-end account deletion on the selected build.
- [ ] Compare final App Store answers with the selected signed archive's privacy report/manifests and actual production settings. Required-reason API entries in `app.json` alone are not a complete data-collection declaration.
