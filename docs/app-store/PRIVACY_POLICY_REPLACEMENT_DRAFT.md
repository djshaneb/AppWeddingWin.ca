# WeddingWin privacy policy — replacement draft

Status: **OWNER/LEGAL WORKING DRAFT — NOT PUBLICATION COPY.**

This is a concrete replacement for the generic policy currently published at `https://www.weddingwin.ca/about/privacy`. It is based on the audited iOS source and backend schema/functions, but the repository cannot establish every production vendor, deployment, script, contract, retention interval, or legal conclusion. Unbracketed present-tense text is proposed policy language based on source-observed behavior; it is not evidence that the behavior has been deployed or live-tested. Bracketed text deliberately prevents unsupported claims from being published.

## Unresolved owner/legal input inventory

Do not publish this draft until every row has a named owner, decision, source of truth, and approval date in the private release ticket. No retention period, address, provider, legal role, or tracking conclusion should be inferred from the repository.

| Decision area | Still required |
| --- | --- |
| Policy identity and contacts | Effective/updated dates; exact controller/legal entity; legal mailing address; privacy/security email; public privacy-request URL; optional privacy phone; support URL/email. |
| Production data/provider inventory | Exact WeddingWin.ca, Supabase, Expo/APNs, email, payment, CDN, captcha, analytics, advertising, support, logging, backup, and other providers; fields, purposes, countries, contracts, and actual production configuration. |
| Tracking/advertising | Final TestFlight/WebView network and cookie audit; choose one tracking section; identify any partner/data/purpose/consent/ATT path or substantiate a no-tracking answer. WebView hardening alone does not decide this. |
| Payments and membership | Whether WeddingWin receives payment/card/bank data; processor; retained transaction fields; billing/tax/fraud/entitlement purposes; in-app-purchase implications. |
| Raffle legal model | Sponsor/administrator identity; vendor recipient/controller role; vendor agreement; official rules; territory, age, no-purchase method, dates, skill question, fulfilment, Apple disclaimer, marketing prohibition, withdrawal/deletion treatment, and required record retention. |
| Retention and deletion | Validated period or objective criterion for every category and backup; deletion/anonymization scope; other-participant message history; safety/legal holds; contest/tax records; provider/caches/email effects; Apple revocation and Google disconnect behavior. |
| Privacy rights/legal basis | Applicable Canadian/provincial and other-territory rights, legal bases, verification, response/appeal timing, regulator links, and complaint process. |
| Security and incidents | Production access/RLS/service-role controls, admin access, logs, backups, vendor controls, incident process, and security contact. |
| International processing | Actual processing/storage countries and any required transfer/Québec disclosures or safeguards. |
| Children and eligibility | Minimum account age, draw eligibility/age gate, and treatment of inadvertently collected child data. |
| Release verification | Final deployed backend revision; physical/TestFlight Apple/Google login, push, printed QR, deletion; app↔website report/block; WebView host/cookie behavior; public policy/privacy-choice rendering. |

---

## Privacy Policy

**Effective date:** [OWNER: YYYY-MM-DD]

**Last updated:** [OWNER: YYYY-MM-DD]

WeddingWin is operated by **[LEGAL: confirm whether the contracting entity is Wedding Win Inc.; insert full legal name]** (“WeddingWin,” “we,” “us,” or “our”). This policy explains how we collect, use, disclose, retain, and protect personal information when you use:

- the WeddingWin iOS app;
- WeddingWin.ca pages displayed in the app or in a browser;
- private messaging between the app and WeddingWin.ca;
- QR Bingo and vendor prize draws; and
- related accounts, support, notifications, and services.

**Privacy contact:** [OWNER: privacy email]

**Mailing address:** [OWNER: complete legal mailing address]

If a feature presents a more specific notice or consent, that notice applies in addition to this policy.

### 1. Information we collect

The exact information depends on whether you use WeddingWin as a couple, vendor, or visitor.

| Category | Examples | How we receive it | Why we use it |
| --- | --- | --- | --- |
| Account and contact information | Name, email address, phone number, company name, account role or membership plan | You provide it; WeddingWin.ca membership records; Apple or Google sign-in | Create and secure accounts, authenticate users, provide the appropriate couple or vendor experience, communicate about the service, and support users |
| Profile and listing information | Profile photo, vendor logo/images, vendor listing content, city, province/state, country, postal/ZIP code | You or an authorized account administrator provides it | Publish or display the profile/listing as selected by the account owner, support vendor discovery, and personalize account features |
| Wedding-planning information | Wedding date and other planning details entered in a profile or draw entry | A couple provides it | Provide planning features, determine event or draw eligibility where applicable, and contact or share with a selected vendor only as described at entry |
| Authentication and identifiers | WeddingWin member ID, Supabase user/profile ID, Sign in with Apple subject identifier, session token/cookie, thread/message IDs, vendor/event IDs | Generated by WeddingWin or received from Apple, Google, WeddingWin.ca, or Supabase | Maintain sessions, link records across app and website, prevent unauthorized access, synchronize features, and diagnose account problems |
| Private messages and retained media | Participants, message text, timestamps, delivery/read state, delivery errors, reports, conversation block/closure records, and any historical message media | Users send messages or reports in the app or website | Deliver and synchronize private messaging, show unread status, enforce app-side blocks, investigate reports, and maintain service integrity. Native image sending is disabled in this release. |
| Push-notification information | Expo push token, device platform, linked member ID, enabled status, unread count, and notification timestamps | Generated when a user permits notifications | Register the device and send service notifications such as a generic alert that a new private message is available |
| QR Bingo information | Decoded vendor ID, event/vendor identifiers, scan status, completion/progress, and timestamps | A couple scans a participating vendor QR code | Validate event participation and show QR Bingo progress |
| Vendor prize-draw information | Vendor/prize description, entrant member ID, name, email, phone, wedding date, selected vendor, consent wording/version/time, winner/draw records, and delivery status | Vendor creates a prize; couple separately chooses to enter | Administer the draw, enforce entry rules, select and notify a winner, share the disclosed contact fields with the selected vendor as stated at entry, keep draw-integrity records, and handle disputes |
| Website and app-WebView information | IP address, user agent/browser and language, access time, session cookies, local/DOM storage, referring address, pages or links used, searches, server/API requests, and error/security logs | Automatically from the device, browser, embedded WeddingWin.ca pages, and service providers | Deliver and secure the website/app experience, retain sessions, process requests, troubleshoot errors, prevent abuse, and [OWNER: add analytics/advertising purposes only if confirmed by the production inventory] |
| Support information | Contact-form or email content, attachments, account identifiers, and troubleshooting details | You provide it to support | Respond to requests, resolve issues, and document support outcomes |
| Payment and membership information | [OWNER: identify membership or transaction records retained by WeddingWin and whether any card/bank data reaches WeddingWin] | [OWNER: identify processor and source] | [OWNER: describe billing, tax, fraud, and account-entitlement purposes] |

We do not receive the live camera image used to scan a QR code in the audited iOS flow. The device decodes the code, and the matched vendor identifier is sent to WeddingWin. Native chat image selection and upload are disabled in this release. Profile/listing images and any historical message media must still be covered by the final inventory and retention schedule.

**Production verification required:** The release owner must confirm those camera/photo statements remain true in the submitted build and that no reachable WeddingWin.ca page uploads additional media.

### 2. Sign in with Apple and Google

If you sign in through Apple or Google, we receive the identity information that provider makes available under your settings, which may include your name, email address, profile image, and a stable account identifier. We use it to authenticate you and link the provider identity to your WeddingWin account. Apple may provide a private relay email address if you choose to hide your email.

Apple and Google process information under their own terms and privacy policies. [OWNER: add direct links to the provider policies used in production and identify any additional Google scopes before publication.]

### 3. Private messages, reports, and blocks

The current source is designed to synchronize private messaging across the iOS app and WeddingWin.ca. Message text, participants, timestamps, read/delivery state, identifiers, and any retained historical message media may be stored in the WeddingWin.ca directory system and/or WeddingWin’s Supabase environment so that the same conversation is available in both places. Native image sending is disabled in this release. **[RELEASE OWNER: verify the final deployed storage/synchronization paths and provider access before publishing this as present-tense production behavior.]**

Messages are intended for the participants, but authorized WeddingWin personnel and service providers may access them when reasonably necessary to deliver the service, investigate abuse or security incidents, respond to a report, comply with law, or protect users and WeddingWin. Access must be limited to personnel with an operational need.

The deployed moderation path records the reporter, conversation, participants, report time, and moderation status; it closes the current website conversation and blocks/suppresses the reported member in the app. A fresh thread may still be created through an external Brilliant Directories website entry point until synchronization discovers and closes it. **[RELEASE BLOCKER: record final app↔website evidence and either publish this narrower behavior accurately or implement and verify a website-side creation block before claiming preventive member-level blocking.]**

Do not use WeddingWin messages for emergencies or send highly sensitive information that is not needed for wedding planning.

### 4. Push notifications

The source is designed so that, after notification permission, WeddingWin stores an Expo push token linked to the WeddingWin member ID/device platform and sends a generic new-message payload through Expo and Apple Push Notification service. **[RELEASE BLOCKER: no production physical-device delivery pass is recorded. Verify the final payload templates, token lifecycle, providers, and foreground/background/terminated delivery before converting this to present-tense production language.]**

You can change notification permission in iOS Settings. Signing out attempts to unregister the current token; account deletion must remove or disable all server-side tokens associated with the account.

**[RELEASE BLOCKER: link the production Expo project, enable the App ID push capability, provision APNs credentials, and verify token registration/cleanup plus foreground, background, and terminated delivery on a physical iPhone before publication.]**

### 5. QR Bingo

The current source is designed to let a signed-in couple scan a URL/QR code assigned to a participating vendor, validate the vendor identifier, and store scan/progress information with the couple’s account. A QR scan is designed not to enter the couple into a vendor prize draw by itself; draw entry requires the separate consent described below. **[RELEASE OWNER: verify the deployed roster, storage, duplicate/invalid handling, and separation from draw entry before publishing this as present-tense behavior.]**

### 6. Vendor prize draws and disclosure to vendors

A participating vendor may supply a prize and configure draw information. When a couple chooses to enter a specific vendor’s draw, the entry screen must identify that vendor, the disclosed fields, the purpose, and the applicable official rules. For the initial release, draw entry does not include vendor-marketing consent.

The deployed release posture keeps the entrant list under WeddingWin control and discloses **name, email address, phone number, wedding date, and entry/consent time only for a selected potential winner** to the applicable vendor, solely for eligibility verification and prize fulfilment after named-vendor consent. Entry must not be treated as consent to newsletters, lead nurturing, advertising, or other vendor marketing. Reviewer-fixture email is suppressed, and production draw email is fail-closed until a verified fulfilment configuration is explicitly enabled. **[LEGAL/RELEASE OWNER: confirm that the deployed UI, access controls, email path, vendor agreement, and actual operations enforce these limits before publishing them as present-tense behavior.]**

**[LEGAL: confirm the recipient relationship.]** State whether each vendor is an independent controller/business, a joint controller, or a processor acting only on WeddingWin’s instructions. The vendor agreement should require privacy and security protections at least equivalent to those promised here, prohibit unauthorized reuse, set a deletion schedule, and provide a way to honor privacy requests.

Once information has been delivered to a vendor, WeddingWin cannot technically recall that copy. The final policy/vendor agreement must explain whether WeddingWin forwards or coordinates valid requests and how users contact the named vendor. A privacy request may not invalidate a completed draw entry or records that law requires WeddingWin to retain. **[LEGAL: determine and verify the exact process and exceptions for each draw territory.]**

The final official rules and entry screen must govern eligibility, deadlines, prize fulfilment, and draw mechanics. [LEGAL: state that Wedding Win Inc. sponsors/administers each iOS-accessible draw and that Apple is not a sponsor only after this operating model and rules are approved.]

### 7. Cookies, embedded website pages, analytics, and advertising

The app source displays some WeddingWin.ca pages in an embedded browser. Those pages may use session cookies and local/DOM storage for login, security, and feature operation. The release source restricts in-app hosts/navigation, routes external HTTPS out of the WebView, checks bridge/OAuth origins, blocks the Meta Pixel, and disables third-party cookies. **[RELEASE BLOCKER: inspect and test the exact tagged TestFlight build. Confirm allowed hosts, redirects, pop-ups, custom schemes, bridge behavior, cookie behavior, login/logout, and actual network recipients before describing the final configuration.]** Server-side requests and records still require disclosure even if the final WebView is incognito and third-party cookies are disabled.

**Choose exactly one version after a production network/cookie audit; delete the other before publication:**

- **No tracking/advertising version:** WeddingWin does not use information collected from this app to track users across apps or websites owned by other companies, sell personal information, or share it for cross-context behavioural advertising. [OWNER/LEGAL: publish only if the live script, cookie, CDN, captcha, email, and advertising inventory supports every part of this statement.]
- **Tracking/advertising version:** WeddingWin and the following partners use [OWNER/LEGAL: exact data types] for [OWNER/LEGAL: exact advertising, attribution, or cross-site measurement purposes]: [OWNER/LEGAL: each partner and direct policy link]. We request any consent required by iOS and applicable law before enabling it, and explain how to withdraw consent here: [OWNER/LEGAL: withdrawal link]. [OWNER/LEGAL: complete and align App Store privacy answers and ATT implementation.]

Proposed release restriction: private message contents and retained historical chat media must not be used for advertising. **[OWNER: confirm contractually and operationally before converting this to a present-tense policy statement.]**

### 8. When we disclose information

We disclose personal information only as described in this policy and the notice shown when it is collected:

| Recipient | Information | Purpose |
| --- | --- | --- |
| WeddingWin.ca directory/hosting platform | Account, profile/listing, session, messaging, QR, draw, and web-request data as required by each feature | Provide the website, membership, vendor directory, messaging, event, and draw functions |
| Supabase | Account/profile links, Apple identifier mapping, chat/messages/retained media, reports/blocks, push registration, QR/draw records, API/security logs | Authentication, database/storage, synchronization, backend functions, security, and deletion workflows |
| Expo and Apple Push Notification service | Device push token and notification payload | Deliver notifications that a user has enabled |
| Apple and Google | Authentication request and related identifiers; app/account interaction governed by the provider | Provide federated sign-in and platform services |
| Selected prize vendor | Selected potential winner's name, email, phone, wedding date, consent/entry time, and verification information | Verify eligibility and fulfil the named prize; no entrant-list access or marketing use in the initial release [LEGAL/OWNER: verify contract and operations] |
| [OWNER: email delivery provider] | Recipient email and message/transaction metadata | Deliver account, draw, or support email |
| [OWNER: payment provider] | [OWNER: exact fields] | Process vendor membership/payment where applicable |
| [OWNER: CDN, captcha, analytics, advertising, support, logging, and other providers] | [OWNER: exact fields] | [OWNER: exact purposes] |
| Authorities, courts, advisers, or transaction counterparties | Information reasonably necessary for the request or event | Comply with law, protect rights/safety, establish or defend claims, prevent fraud, or complete a corporate transaction subject to appropriate safeguards |

Proposed contract statement: service providers process information only for authorized purposes and use appropriate privacy and security protections. **[OWNER/LEGAL: publish this only after confirming the contracts actually impose those obligations.]**

### 9. Retention

The final policy must state, and production operations must enforce, a validated retention period or objective criterion for each category, followed by deletion or de-identification subject to specifically disclosed backups and legal obligations. No such periods are established by this draft; the release owner must replace every bracket below before publication.

| Category | Publication-ready retention statement required |
| --- | --- |
| Account/profile/listing and authentication mapping | [OWNER/LEGAL: while the account is active, then delete within X days of a verified request, except specified records retained for Y] |
| Session tokens/cookies | [OWNER/SECURITY: until expiry, logout/revocation, or X days, whichever occurs first] |
| Private message text/retained media and delivery records | [OWNER/LEGAL: active-account/thread period plus X; state that the current purge removes the complete shared conversation, including the counterpart's copy, or change the implementation] |
| Reports, blocks, and safety/security records | [OWNER/LEGAL: X years or defined case-closure criterion; explain any longer safety/fraud hold] |
| Push tokens and notification metadata | [OWNER: until logout, token invalidation, account deletion, or X days without activity; notification logs X days] |
| QR Bingo scan/progress | [OWNER: event end plus X days/months] |
| Prize entries, consent evidence, draw and winner records | [LEGAL/TAX: X years after draw/fulfilment, based on contest, tax, limitation, and audit requirements] |
| Support requests | [OWNER/LEGAL: X months/years after closure] |
| Web/API analytics, security, and error logs | [OWNER/SECURITY: separate exact period for each log system] |
| Billing/tax records | [LEGAL/ACCOUNTING: statutory period and jurisdiction] |
| Backups | [OWNER/SECURITY: rolling X-day backup cycle; isolate after deletion and remove on expiry unless a legal hold applies] |

Legal holds, fraud/security investigations, accounting/tax duties, contest integrity, or unresolved claims may require limited information to be retained longer. The final policy must identify the affected categories and the legal/operational criterion; it should not use this exception to retain all account data indefinitely.

### 10. Account deletion and privacy choices

The current iOS source and deployed backend expose **About → Delete Account**, a permanent-deletion warning, and native confirmation. The backend verifies Apple token signature, audience, and subject, and may request Sign in with Apple confirmation/revocation for an Apple-linked account. A person who cannot sign in must be able to request deletion or exercise another privacy right at **[OWNER: public privacy-request URL and privacy email]**. The public route supplements the in-app deletion flow; it does not replace it. **[RELEASE BLOCKER: no physical-device destructive cross-system/Apple-revocation pass is recorded. Do not change these observations into a completed-deletion claim until DEV-10 evidence exists.]**

The deployed deletion workflow is intended to permanently delete the WeddingWin login/profile or vendor listing and associated app data, including messages/retained media, push tokens, and raffle data, subject only to specifically disclosed legal/safety retention. It currently purges the entire shared conversation record, including the other participant's copy. Deactivation alone does not satisfy this commitment. **[RELEASE BLOCKER: owner/legal/product must approve or change the shared-conversation behavior; then test disposable accounts against every WeddingWin.ca and Supabase store, object storage, email system, provider mapping, cache, and backup and replace “intended to” with the exact tested result and evidence-backed retention exceptions.]**

The final policy must state:

- that the current implementation removes the other participant's shared conversation copy, if that behavior is approved; otherwise describe the corrected behavior;
- how display names or required transaction/draw records are anonymized;
- how Sign in with Apple authorization/token revocation is handled and how Google is disconnected;
- which records remain under a legal hold and for how long;
- when active systems and backups complete deletion; and
- how a user requests deletion from a vendor that already received a draw entry.

Subject to applicable law, users may request access, correction, deletion, or a copy of their information; withdraw consent where processing depends on consent; object to or restrict certain uses; disable notifications; opt out of marketing; and complain to the relevant privacy regulator. [LEGAL: adapt the rights, appeal process, verification method, response times, and regulator links to Canada/provinces and every selected App Store territory.]

### 11. Security

The source includes safeguards such as encrypted transport, server-side authorization, and protected on-device credential storage. Proposed final policy language must describe only the administrative, technical, and physical controls actually operated in production and must not promise absolute security. [OWNER/SECURITY: verify production row-level policies, administrator access, service-role handling, logging, backups, incident response, and vendor controls before publishing specific examples.]

If you believe your account or information is at risk, contact [OWNER: security/privacy email].

### 12. International processing

WeddingWin and its providers may process information outside the province or country where a user lives, including **[OWNER: list actual processing/storage countries for WeddingWin.ca, Supabase, Expo, email, payments, support, analytics, and backups]**. Foreign courts, law-enforcement, or regulatory authorities may be able to access information under local law. [LEGAL: add applicable transfer mechanisms and Québec/other provincial disclosures if relevant.]

### 13. Children and draw eligibility

The final policy and product must define whether WeddingWin is directed to children and the minimum account age: **[LEGAL: minimum app/account age]**. [OWNER/LEGAL: confirm the enforced signup/eligibility behavior, response to inadvertently collected child data, and privacy contact before publishing child-directedness or deletion claims.] Contact: [OWNER: privacy email].

Prize-draw eligibility, including minimum age and residency, is stated in the applicable official rules. [LEGAL: confirm age-of-majority requirements and whether an age gate is necessary for each territory.]

### 14. Changes to this policy

We may update this policy to reflect product, legal, or operational changes. We will post the revised policy with a new “Last updated” date and provide additional notice or obtain consent when required by law. Material changes do not apply retroactively in a way that reduces rights without any consent required by law.

### 15. Contact us

For privacy questions or requests, contact:

**[OWNER/LEGAL: exact legal entity name]**
[OWNER/LEGAL: legal mailing address]
[OWNER: privacy email]
[OWNER: public privacy-request URL]
[OWNER: privacy phone, if offered]

For ordinary app support, use [OWNER: support URL/email].

---

## Publication gate

Do not paste this draft onto the live site until all of the following are true:

- every bracketed item is resolved and both unused tracking variants are removed;
- the actual production script/cookie/provider inventory matches the policy and App Store privacy answers;
- deletion, report/block, raffle sharing, push payloads, and camera/photo behavior are re-tested in the final release backend/build;
- retention intervals have operational deletion jobs or documented manual controls behind them;
- provider contracts and vendor draw agreements support the sharing/security statements;
- official draw rules and the policy use the same sponsor, data recipient, purpose, withdrawal, and retention language;
- draw entry, absence of entrant-list exports, selected-potential-winner disclosure, suppressed email, vendor terms, and actual operations are limited to verification/prize fulfilment and do not treat entry as marketing consent;
- a qualified privacy/contest lawyer has reviewed the final text for every launch territory; and
- the public Privacy Policy and Privacy Choices URLs work without login on iPhone and iPad.

This draft is product/privacy preparation, not legal advice.
