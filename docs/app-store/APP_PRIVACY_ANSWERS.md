# App Privacy answer matrix

Updated September 16, 2026 for candidate build 7. **All seventeen category answers are published in App Store Connect.** After the owner's approval, the controlling agent completed Publish and verified Apple's status: “Published a few seconds ago by Shane Blair.” The saved seventeen-category draft was also reloaded before publication, with all data linked, no Set Up items and no Tracking/Not Linked preview section. All seventeen use **Linked Yes / Tracking No**, with purposes below, based on observed flows, retained fields, the owner's sponsor-use statement and documented provider purposes. This is a supported classification, not absolute verification of every provider's processing. See the [decision evidence and limits](APP_PRIVACY_DECISIONS_2026-09-16.md).

Candidate **1.0.0 (7)** is now installed through TestFlight on iPhone 16 Pro / iOS 26.7. Scoped startup, navigation, login and resume checks passed; the user confirmed a visible message alert and audible sound. Notification tap, badge and draw-push results are not claimed. The user requested no repeated device tests; existing evidence retains its original scope. See the [current iPhone report](IPHONE_TESTFLIGHT_BUILD7_REPORT_2026-09-16.md). Earlier installation failures below or in linked records are historical.

The [build 7 manifest audit](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/PRIVACY_MANIFEST_AUDIT.md) found twelve parseable manifests and consistent required-reason metadata. The app-level collected-data list is empty: an authoring completeness gap against [Apple TN3184](https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest). It is separate from the App Store questionnaire and is not a proven cause of the earlier installation failure. Apple's current Add for Review gate identified App Privacy; this does not establish a manifest-related rejection. No manifest, app configuration or binary is changed by this answer update, and no rebuild is being initiated. The Tracking No classification is based on the evidence below, not inferred from the existing `NSPrivacyTracking=false` value.

## Current answer status — September 16, 2026

The published set adds **Physical Address, Customer Support and Search History** to the fourteen previously saved categories. Purpose, linkage and tracking entry and publication are verified; Device ID has App Functionality only. Historically, on September 15, fourteen category selections persisted but all showed Set Up and Publish was disabled. That historical UI state is superseded.

## Top-level fields

| Field | Published answer |
| --- | --- |
| Does the app collect data? | Yes |
| Privacy Policy URL | https://www.weddingwin.ca/about/privacy — published, text verified and URL saved in App Store Connect |
| Privacy Choices URL | https://www.weddingwin.ca/privacy-request — public request route; URL saved in App Store Connect |
| Data linked to the user | Yes for all seventeen categories |
| Tracking | No for all seventeen categories, based on the scoped evidence and purpose assessment in the decision record; publication verified September 16 |

Account-linked data is not anonymous merely because an export or public screen hides its identifier. Record collection by embedded pages and service providers too. Apple's labels and purposes must match actual use. [Apple App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/)

## Data types

All rows have **Linked Yes / Tracking No**. The controlling agent verified the completed saved draft after reload and the published status after the owner's approval on September 16.

| Apple category | Observed use | Published purposes |
| --- | --- | --- |
| Name | Accounts, profiles, entries and authorised contact sharing | App Functionality; Third-Party Advertising |
| Email Address | Login, verification, messages, draw communications and sponsor outreach | App Functionality; Third-Party Advertising |
| Phone Number | Contact profiles and sponsor wedding-service calls | App Functionality; Third-Party Advertising |
| Physical Address | Explicit saved vendor-contact Address fields in the embedded builder | App Functionality |
| Contacts | Wedding guest lists and RSVP records | App Functionality |
| Other Financial Info | Wedding budgets, actual costs and paid/pending amounts | App Functionality |
| Purchase History | Recorded vendor contracts, payments and paid/owed records | App Functionality |
| Emails or Text Messages | Private conversation content and delivery state | App Functionality |
| Photos or Videos | Profile/listing images and retained chat media | App Functionality |
| Gameplay Content | QR Bingo progress and draw participation state | App Functionality |
| Other User Content | Wedding details, listings, prize terms and consent/eligibility evidence | App Functionality |
| User ID | Account/provider IDs and account-linked message, notification and draw references | App Functionality |
| Device ID | Account-linked push registration and operational device information | App Functionality |
| Product Interaction | Scans/entry actions and provider request/usage statistics | App Functionality; Analytics |
| Customer Support | Persisted user-requested conversation reports and their handling state | App Functionality |
| Search History | Observed Google autocomplete queries, with provider-retained request parameters | App Functionality; Analytics |
| Other Diagnostic Data | Operational delivery status and bounded error/security records | App Functionality |

The owner confirms that general show sponsors receive couples' contact information for wedding-service emails and calls only, with no Facebook, Google or other advertising-audience uploads for that workflow. This establishes direct marketing use that must be classified under Apple's applicable purposes; it must not be labelled only App Functionality. It does not establish that every native/WebView provider is free of tracking or settle other recipients' additional uses. Administrative access to an export does not by itself authorise a new marketing purpose.

The prepared sponsor purpose mapping is **App Functionality plus Third-Party Advertising** for Name, Email Address and Phone Number. This is an inference from Apple's definitions for sponsors promoting their own services; it does not establish WeddingWin's own Developer Advertising or Marketing use. Apple's examples do not expressly decide one-to-one sponsor outreach. The earlier [source supplement](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/PRIVACY_SOURCE_SUPPLEMENT.md) retains its historical unresolved statements; the current decision record supersedes them for this answer preparation.

**Not selected:** Crash Data, Performance Data and Browsing History have no affirmative collection evidence in this bounded source/provider review. Error/delivery records fit Other Diagnostic Data; browser navigation capability does not establish retained external browsing history. No precise device location, microphone/audio or payment-card collection is inferred from address fields, selected photos or an external Eventbrite link. Generic text does not require declaring every sensitive fact someone might type. These decisions use current observed scope rather than requiring an exhaustive proof of absence.

## Deployed builder and supporting source evidence

The following historical observations keep their original dates and limits. Phrases describing earlier unresolved answers are superseded by the current decision matrix; they do not reopen completed classifications or request repeated device tests.

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

The deployed migration schedules daily removal of notification events more than 30 days after creation, cascading their aliases and delivery rows. Delivery eligibility expires sooner: 24 hours for messages and seven days for production draw alerts. Account baselines and push registrations have separate lifecycles. Do not describe all notification data as having a universal 30-day expiry. Source/deployment configuration is verified; this audit did not observe the next retention run or establish backup/provider expiry. See [deployment evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/backend-deployment.json).

### Isolated review records introduced in build 6 and retained in build 7

The controlled reviewer pair uses four separate service-only tables with row-level security and no anonymous/authenticated direct grants. Authenticated endpoints expose only authorized review context/results. They do not create real contest acceptance, entries, winners, claims or email-delivery records. Account identifiers and device references are still linked records even though the names and prize scenario are fictional.

| Record group | Stored data observed in source | Existing draft categories / proposed use |
| --- | --- | --- |
| `review_draw_fixtures` | Assigned account IDs and display names, sample prize text, active state, creation/expiry times and operator note | Name, User ID and Other User Content; proposed App Functionality for controlled access and the review scenario |
| `review_draw_state` | Current cycle generation, enabled/sample-scan/entry flags, simulated draw ID, selection status and verification/update times | Gameplay Content, Product Interaction and User ID; proposed App Functionality for the isolated workflow |
| `review_draw_notices` | Immutable test-result ID, fixture/cycle/draw references, recipient account ID, role/channel and creation time | User ID and Product Interaction; proposed App Functionality for authorized result access and duplicate prevention |
| `review_draw_push_devices` | Existing registered device ID, recipient account ID, fixture and registration generations, opt-in timestamp and enabled flag | Device ID, User ID and Product Interaction; proposed App Functionality for explicit per-device test-alert delivery |

Review alerts also use the existing notification event/delivery records, including delivery status and bounded provider errors (Other Diagnostic Data, proposed App Functionality). The generic push payload carries event/recipient identifiers, a review-mode discriminator, review notice ID and expiry; it contains no message body, entrant contact details or real prize claim. The review opt-in table references the existing push registration; it does not duplicate the Expo token. Proposed linkage is **Yes** for these account/device records. These mappings use already-selected categories and do not add or finalize Apple answers. No new marketing, analytics or tracking use is established by this feature or inferred here.

Review delivery eligibility ends at the earlier of fixture expiry or 24 hours after the test notice. Reset advances the cycle and makes old result links and old opt-ins ineligible; it does **not** delete immutable notice history or the stored device opt-in row. The existing 30-day notification-event cleanup also applies to review events and cascades their delivery rows, but it does not delete the parent review notices, fixture, state or opt-in table. No time-based purge for those four review tables is defined in the inspected migrations. Fixture expiry is an access boundary, not a promised deletion deadline. Deleting a referenced account-cache identity cascades its fixture and dependent review state/notices/device pins; deleting a registered device cascades its pin. Operational deletion timing, backups and provider retention remain to be confirmed rather than assigned an invented deadline.

Sources: [isolated review schema and actions](../../supabase/migrations/20260915223013_add_nonbinding_review_draw_mode.sql), [review device opt-in and notification integration](../../supabase/migrations/20260915223039_isolate_review_draw_notifications.sql), and [existing notification retention](../../supabase/migrations/20260914190037_durable_member_notifications.sql). The [review walkthrough](REVIEW_TEST_MODE.md) distinguishes sample scanning from physical camera testing and requires explicit device opt-in before Send.

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

A reload captured from the native `/home` WKWebView observed WeddingWin/OptimizeCDN, Google Fonts, jsDelivr, Cloudflare/CDNJS, DataTables, Unsplash, a static image from `weddingphotoshare.ca`, and an `accounts.google.com` client script. **No Meta/Facebook requests appeared in that home-only capture.** This result is limited to that page/session and does not prove tracking is absent throughout the app or in the distributed build. The additional search/builder captures below broaden this representative scope. The sponsor direct-contact business use is now confirmed; the remaining provider inventory and purpose, linkage and tracking answers remain unfinished. No raw request URLs, query values, cookies or credentials are recorded here.

Further native captures on September 15 at approximately 22:16–22:17 UTC covered the vendor search and authenticated website-builder entry:

| Native path | Observed requests and UI |
| --- | --- |
| Home vendor search | Entering the non-sensitive city Niagara Falls displayed real Google autocomplete. Requests to `maps.googleapis.com` included `js`, `gen_204`, `AuthenticationService.Authenticate` and `AutocompletionService.GetPredictions`; `maps.gstatic.com` icons also loaded. Selecting Niagara Falls, ON and searching Wedding Venues loaded `wedding_search`, first-party/widget requests and an `images.pexels.com` asset. |
| Website tab | The native Website tab navigated through `wedwebsite.ca`'s `bd-callback` into the authenticated “Welcome John and Jane” dashboard. Observed resources included WedWebsite JavaScript/CSS, Google Fonts, an Unsplash image, and Supabase `bd-sso`, `verify`, `user`, `websites`, `bd_user_links`, `budget_expenses`, `guests` and `vendor_payments` requests. |

No Meta/Facebook requests appeared in these particular captures. These are representative native navigation observations, not an exhaustive app trace; they do not by themselves settle provider retention, purposes, linkage or Apple's tracking classification. No raw query values, tokens or headers are retained in this worksheet.

The [September 16 build 7 diagnostic](BUILD7_WEBVIEW_DIAGNOSTIC_2026-09-16.md) compiled and displayed the authenticated native home and vendor-search WebView in a simulator. Safari attached but exposed no usable request rows or console results, so it added no provider or no-tracking finding. The earlier observations above retain their original scope. The diagnostic session ended and Safari's temporary developer setting was restored; release source/configuration and the Store build were unchanged.

If app-functionality web content or a provider performs Apple's defined tracking, ATT permission must precede it. A website agreement or cookie choice cannot replace ATT. If tracking is absent, record evidence for that conclusion rather than adding a prompt solely because a pixel string exists. [Apple tracking and web-view guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/)

The owner confirms that vendors run their draws independently; general show sponsors are separate contact-sharing recipients, not draw sponsors. Current rules describe Wedding Win as the developer and a limited platform sponsor, and the named vendor as the promotion operator/prize provider. The confirmed independent vendor operation creates a known mismatch requiring reconciliation with Apple's guideline 5.3.1 and the existing wording; it is no longer an unknown business fact. No responsibility is assigned to WeddingWin by this worksheet. See the [current submission review](APPLE_SUBMISSION_REVIEW.md) and [submitted guideline clarification](APP_REVIEW_DRAW_INQUIRY_DRAFT.md).

The business name appears publicly as **Wedding Win Inc.**, and the public support address is **info@weddingwin.ca**. The authenticated App Store record displays **Shane Blair** as seller. The owner confirmed Wedding Win Inc. as copyright holder, and `2026 Wedding Win Inc.` was saved and verified after reload September 15 at 21:46 UTC. Those identity facts do not resolve the confirmed independent vendor operation's mismatch with Apple's developer-sponsorship requirement. [Privacy policy](https://www.weddingwin.ca/about/privacy), [support](https://www.weddingwin.ca/about/contact).

Current privacy completion:

- [x] Prepare seventeen category/purpose/linkage/tracking answers from retained fields, scoped observations and provider documentation; record in [decision evidence](APP_PRIVACY_DECISIONS_2026-09-16.md).
- [x] Verify all seventeen saved answers after reload and publish with the owner's approval. Apple displayed “Published a few seconds ago by Shane Blair”; the seventeen categories are linked to the user.
- [ ] Recheck Add for Review after publication; privacy publication alone does not establish App Review submission.

The earlier retention/deletion and policy records keep their stated limits; they are not new questionnaire blockers or instructions for a blanket retest. Required-reason API metadata is not a replacement for the questionnaire, and the separate empty manifest collection list remains a documented authoring gap. No manifest rebuild is initiated by this work.


## Partial public-route check — September 16

Anonymous, no-cookie requests returned HTTP 200 for the privacy-request, contact and draw-rules pages. The privacy-request email route and About → Delete Account instructions were visible; no request was sent and no staff fulfilment or actual deletion was tested. The join and show pages were inspected in the existing signed-in Chrome vendor session: join advertises a free vendor profile through checkout 17, and the show page links to Eventbrite tickets for a physical event. Inspected native top-frame policy routes the third-party HTTPS link to the external browser. No physical tap or purchase was performed. See [exact routes and limits](PUBLIC_ROUTE_CHECK_2026-09-16.md).

At that earlier route-check checkpoint, these observations did not finalize declarations or establish staff fulfilment. The current answer matrix now records the classification decision; it does not expand the historical route check's scope.

### Owner clarification — September 16

The owner confirms that vendors run their draws independently. General show sponsors receive couples' contact information for wedding-service emails and calls only; they do not upload that information to Facebook, Google or other advertising audiences. These are facts about the business workflow, not verification of every recipient's systems or every native/WebView provider. General show sponsorship does not make those businesses draw sponsors. The current matrix represents both account-linked functionality and sponsor promotion, with Tracking No as the evidence-based classification described in the decision record.

Independent vendor operation is a known mismatch needing reconciliation with [Apple guideline 5.3.1](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries). The owner-approved [guideline clarification](APP_REVIEW_DRAW_INQUIRY_DRAFT.md) was sent through Apple's Suggest a guideline change form, with receipt verified September 16 at 02:07:06 UTC. This confirms delivery only: no case ID, promised response or app-specific clearance was provided. No responsibility is assigned to WeddingWin or to general show sponsors by inference, and no public rules, app configuration or Apple answers were changed by this clarification.
