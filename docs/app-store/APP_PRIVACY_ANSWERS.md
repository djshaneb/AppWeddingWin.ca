# App Privacy draft matrix

Updated September 14, 2026. **Internal submission worksheet; not submitted to Apple.** This covers native features, embedded WeddingWin/website-builder pages and their service providers. Observed collection is separated from purposes and provider practices that still need confirmation.

The approved notification changes are implemented and deployed. Development-signed iPhone version 1.0.0 (3), source `faf553f`, is installed. Local verification and a direct push-provider receipt passed; visible phone behavior, automatic new-message/draw delivery and final TestFlight acceptance remain pending. These testing limits do not remove implemented collection from the inventory. See [verification evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/verification-summary.json).

## Top-level fields

| Field | Draft |
| --- | --- |
| Does the app collect data? | Yes |
| Privacy Policy URL | https://www.weddingwin.ca/about/privacy — public and app-specific; wording alignment noted below |
| Privacy Choices URL | https://www.weddingwin.ca/privacy-request — public request route |
| Data linked to the user | Yes for the account, contact, messages, QR, consent and push records below |
| Tracking | Unresolved until the final production network/provider inventory is complete; do not infer No from native code alone |

Account-linked data is not anonymous merely because an export or public screen hides its identifier. Record collection by embedded pages and service providers too. Apple's labels and purposes must match actual use. [Apple App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/)

## Data types

| Apple category | Observed use | Draft purpose / remaining decision |
| --- | --- | --- |
| Name | Accounts, profiles, messages, vendor entries and authorised exports | App Functionality; review any marketing use |
| Email Address | Login, verification, contact, draw communications and exports | App Functionality; classify actual vendor/developer marketing use |
| Phone Number | QR contact profile and other member/contact fields | App Functionality; classify any authorised marketing use |
| Physical Address | Profile/address fields, such as city, province and postal code | App Functionality; confirm exactly retained fields |
| Emails or Text Messages | Private conversation content and delivery state | App Functionality |
| Photos or Videos | Profile/listing images and retained chat media; new chat-photo sending is capability-gated | App Functionality; verify enabled production upload routes and provider handling |
| Other User Content | Wedding details, listings, reports, prize terms and consent/eligibility evidence | App Functionality; review actual additional purposes |
| User ID | Account/provider identifiers and account-linked message, notification and draw references | App Functionality; generic push text does not make routing identifiers anonymous |
| Device ID | Existing account-linked push token/device information | App Functionality; do not infer tracking from the token alone |
| Product Interaction | Scans, card progress, entry state and retained feature interaction | App Functionality; Analytics only if actually used that way; assess QR gameplay state against Gameplay Content too |
| Customer Support | Contact requests and support records where retained | Confirm collection and applicable disclosure before final answers |
| Crash Data / Performance Data / Other Diagnostic Data | Potential retained server/device error, security or performance records | Select the specific types actually retained, their linkage and purposes; the umbrella word “Diagnostics” is not a completed answer |

The exact Apple purpose for the named vendor's own marketing must be confirmed from actual use; do not label it only App Functionality by default. Likewise, administrative access to an export does not by itself authorise a new marketing purpose.

Confirm search/browsing-history retention, website analytics/advertising, ticket purchase history, checkout data and location derived from IP addresses before omitting those categories. Inspect the embedded builder's guest/RSVP and budget records against Contacts, Other Financial Info and other specifically requested fields; their full retention and classification are not established by this audit. Free app features do not prove that no paid event-ticket flow is reachable. Do not select precise device location, microphone/audio or address-book Contacts solely because users provide a city, phone number or selected photo. Generic free-form text does not require declaring every possible sensitive fact a user might type.

## Implemented notification collection

Current source retains recipient/sender account references, message aliases or draw references, event times, suppression state, device-registration generation, delivery attempts/status, provider ticket, receipt status and bounded error codes. Notification event history does not copy message bodies, contact details or push tokens; tokens remain in the separate registration table.

Message and draw alerts use generic visible text. Their delivery payload includes event/account routing identifiers and a conversation or draw destination. The draw result is read through an authenticated endpoint after the existing verification and explicit notice-send controls. Provider processing still belongs in the inventory even though the lock-screen text omits private conversation and winner contact details.

The deployed migration schedules daily removal of notification events more than 30 days after creation, cascading their aliases and delivery rows. Delivery eligibility expires sooner: 24 hours for messages and seven days for draw alerts. Account baselines and push registrations have separate lifecycles. Do not describe all notification data as having a universal 30-day expiry. Source/deployment configuration is verified; this audit did not observe the next retention run or establish backup/provider expiry. See [deployment evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/push-test-2026-09-14/backend-deployment.json).

## Current flow facts

- QR camera images are decoded on device. The scanner transmits matched vendor/account/event information rather than uploaded camera frames.
- Contact details and the QR Bingo agreement come before scanning. The agreement receipt is recorded server-side. A profile alone is not proof that someone accepted it.
- During organiser-authorised scanning, an enabled vendor can display the simple Yes/No entry prompt. Yes records that named vendor entry under the prior agreement; No retains scan progress without entering. No second agreement form is presented in the prompt.
- Vendor access is scoped to authorised entries for that vendor. Scanning by itself does not share an entrant list with that vendor.
- The administrator master export uses recorded participation evidence, deduplicates accounts across eligible events and excludes known QA data. It is protected administrative access, not a vendor-wide contact list. Export data is snapshotted temporarily; the snapshot expires and scheduled cleanup removes expired snapshot data.
- A card reset resets current scans and vendor entries while preserving relevant historical records. It is not account deletion and does not erase agreement history.
- Account deletion is available in About. Conversations close and account-owned active data is removed or disabled as applicable; shared recipient history and limited audit/security/legal records may remain under the retention policy. Do not promise universal immediate erasure.
- Current message/draw push processing retains the operational records described above. Implementation/deployment evidence and outstanding physical/TestFlight tests are separate from disclosure of that collection.
- Chat photos, where enabled, use the user-selected system-picker item. Technical file checks do not constitute automated moderation of image meaning. Report/block controls and retention still apply.

## Public-policy alignment and final evidence

The public policy is live. A fresh September 14 read confirms its September 1 text still describes QR entry as show-only and refers to an older draw-specific acknowledgement. Align those passages with the September 11 authorised scanning policy and agreement-before-scan/simple Yes/No behavior. The rules also require vendor-specific disclosures in the entry flow that the simple native modal does not show. The [unpublished wording proposal](PRIVACY_COPY_ALIGNMENT_DRAFT.md) does not resolve every rules issue. Preserve truthful sharing and retention; no replacement is published by this document.

A fresh public HTML read found Meta Pixel bootstrap code on the privacy and draw-rules pages. This establishes website code presence, **not** transmission or tracking in the final app. The native WebView uses a private session and disables shared/third-party cookies, but allows JavaScript and HTTPS subframes. No ATT implementation was found in inspected native source/config.

If app-functionality web content or a provider performs Apple's defined tracking, ATT permission must precede it. A website agreement or cookie choice cannot replace ATT. If tracking is absent, record evidence for that conclusion rather than adding a prompt solely because a pixel string exists. [Apple tracking and web-view guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/)

The public policy/rules assign vendor-draw sponsorship to the vendor and expressly exclude Wedding Win. This conflicts with Apple's developer-sponsorship requirement for sweepstakes/contests unless the actual operating arrangement and promotion classification establish an appropriate resolution. It is an owner decision, not a cosmetic copy change. See the [privacy and age audit](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/package-review/privacy-and-age-audit.md).

The business name appears publicly as **Wedding Win Inc.** The public support address is **info@weddingwin.ca**. These are public-page observations, not proof of App Store seller ownership. [Privacy policy](https://www.weddingwin.ca/about/privacy), [support](https://www.weddingwin.ca/about/contact).

Before submitting:

- [ ] Complete the exact-build and embedded-page network/provider inventory.
- [ ] Approve data purposes, linked status, any tracking answer and associated consent requirements.
- [ ] Reconcile ticket, search, support, diagnostic and media data with actual production use.
- [ ] Approve operational retention/deletion handling and any public-policy alignment.
- [ ] Verify public privacy-request access and end-to-end account deletion on the selected build.
- [ ] Compare final App Store answers with the selected signed archive's privacy report/manifests and actual production settings. Required-reason API entries in `app.json` alone are not a complete data-collection declaration.

Canonical package source: [privacy-draft-matrix.md](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/outputs/app-store-launch-2026-09-14/privacy-draft-matrix.md). Repository links above are adapted for this location.
