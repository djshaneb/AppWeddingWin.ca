# WeddingWin privacy policy publication candidate

Status: **CODE-OWNED COPY FINAL — NOT PUBLISHABLE UNTIL EVERY REQUIRED CELL IN THE FOUR SCHEDULES IS COMPLETED AND APPROVED.**

The prose below reflects the audited iOS release behavior. Unknown legal-entity, territory, age, tracking, provider, payment, international-processing, and retention facts are intentionally isolated in four schedules. Do not guess them, delete the warning labels, or publish competing tracking variants. Owner/legal must replace each required cell with one verified statement, then remove this status paragraph.

## Publication schedule 1 — identity, scope, and choices

| Required fact | Publication value |
| --- | --- |
| Effective date and last updated date | **OWNER/LEGAL REQUIRED** |
| Legal controller/developer name | **OWNER/LEGAL REQUIRED — confirm the App Store Connect entity, website operator, and draw documents use the same correct identity** |
| Legal mailing address | **OWNER/LEGAL REQUIRED** |
| Privacy email | **OWNER REQUIRED — must be monitored** |
| Public privacy-request URL | **OWNER REQUIRED — must work without login on mobile; `/account/deleteaccount` currently redirects signed-out users to login** |
| Support email/URL | **OWNER REQUIRED — `info@weddingwin.ca` and the current support page are candidates, not an invented legal designation** |
| Minimum account age and child-data response | **OWNER/LEGAL REQUIRED** |
| App/storefront territories and governing privacy regimes | **OWNER/LEGAL REQUIRED** |
| Payment/purchase behavior reachable in the submitted app | **OWNER REQUIRED — identify the processor and whether WeddingWin receives payment or purchase data** |
| QR Bingo draw sponsor/administrator, vendor role, territories, age, and official-rules version | **OWNER/LEGAL REQUIRED — must match App Store developer identity, deployed consent, vendor agreement, and live rules** |

## Publication schedule 2 — tracking, analytics, and additional recipients

Replace the next cell with exactly one verified, owner/legal-approved present-tense statement after an exact-build production network/cookie audit. If tracking occurs, name every affected data type, partner, purpose, consent/ATT control, and withdrawal/opt-out method. If it does not occur, confirm the statement covers embedded WeddingWin.ca pages and subresources, not only native dependencies.

| Required fact | Publication value |
| --- | --- |
| Tracking, sale/share, analytics, and advertising practice | **OWNER/LEGAL REQUIRED — the live site currently requests Meta Pixel from `connect.facebook.net` (pixel ID `1947515779077331`). Preferred v1 path is server-side suppression for the `WeddingWinApp/1.0` user-agent tag plus exact-TestFlight network proof. Otherwise publish the tracking data types, Meta/other partners, purposes, consent/ATT control, and opt-out method.** |
| Email delivery provider, data, region, and role | **OWNER REQUIRED** |
| Payment provider, data, region, and role | **OWNER REQUIRED or “not reachable/collected in the submitted app” after verification** |
| CDN, captcha, embedded media, analytics, advertising, support, and logging providers | **OWNER REQUIRED — list each production recipient or state the verified absence of that category** |
| Processing/storage countries and transfer safeguards | **OWNER/LEGAL REQUIRED** |
| Selected-prize-vendor privacy role and request handoff | **LEGAL REQUIRED — independent, joint, or processor role must match the vendor agreement and operations** |

## Publication schedule 3 — retention and deletion

Each value must be a finite duration or an objective criterion that production operations and backup handling enforce. Identify any narrower legal, safety, fraud, tax, contest, or dispute exception and the eventual deletion or de-identification outcome.

| Data category | Approved retention period or criterion |
| --- | --- |
| Account, profile/listing, and authentication mappings | **OWNER/LEGAL REQUIRED** |
| Session tokens, cookies, and one-time login attempts/exchanges | **OWNER/SECURITY REQUIRED** |
| Private messages, retained historical media, and delivery records | **OWNER/LEGAL REQUIRED — include surviving participant's read-only shared history after one account is deleted** |
| Reports, blocks, moderation, fraud, and security records | **OWNER/LEGAL REQUIRED** |
| Push tokens, tickets, receipts, retries, and errors | **OWNER/SECURITY REQUIRED** |
| QR scan/progress records | **OWNER/LEGAL REQUIRED** |
| Draw entries, consent evidence, potential-winner, fulfilment, and audit/tax records | **OWNER/LEGAL REQUIRED** |
| Support requests | **OWNER/LEGAL REQUIRED** |
| Web/API, analytics, and diagnostic logs | **OWNER/SECURITY REQUIRED for each production log system** |
| Payment, billing, and tax records | **OWNER/LEGAL REQUIRED or verified not applicable** |
| Backups and legal holds | **OWNER/SECURITY/LEGAL REQUIRED — include backup expiry and hold-release handling** |

## Publication schedule 4 — provider and feature verification

| Release fact | Required sign-off |
| --- | --- |
| Camera frames stay on device; only decoded vendor ID is transmitted | **RELEASE OWNER — exact TestFlight/physical QR pass** |
| Native chat image upload remains disabled; historical/profile media inventory is complete | **RELEASE OWNER** |
| Generic push contains no message text; token lifecycle works on physical TestFlight | **RELEASE OWNER** |
| Signed-in deletion and physical Apple revocation match this policy | **RELEASE OWNER** |
| WebView scripts, cookies, redirects, embeds, and recipients match schedule 2 | **RELEASE OWNER** |
| Draw UI, rules, vendor terms, email, and operations enforce selected-potential-winner-only sharing and no marketing | **OWNER/LEGAL/OPERATIONS** |

---

# WeddingWin Privacy Policy

The effective date, controller, contact information, territories, minimum age, and other release-specific facts are stated in the publication schedules above. In this policy, “WeddingWin,” “we,” “us,” and “our” mean the controller identified there.

## 1. Scope

This policy applies to the WeddingWin iOS app, WeddingWin.ca pages displayed in the app, related account and API services, private messaging, QR Bingo, vendor prize draws, notifications, and support interactions. It explains what information we process, why we use it, who receives it, how long we keep it, and the choices available to you.

## 2. Information we process

### Account, profile, and authentication information

We process information used to create and operate a couple or vendor account, such as name, email address, phone number, company or display name, role or membership plan, wedding date, city, province or state, country, postal code, profile/listing content, and profile or listing images. The fields available depend on the account type and feature used.

If you sign in with Apple or Google, we receive the identity information the provider makes available under your settings. This can include your name, email address or Apple private-relay address, profile image, and a stable provider identifier. We use it to authenticate you and link the provider identity to your WeddingWin account.

The app and our services also process WeddingWin member identifiers, Supabase profile identifiers, session tokens or cookies, consent time and policy version, and short-lived login-attempt or exchange records. The iOS app protects current session information using secure device storage.

### Private messages and safety information

When you use private messaging, we process message text, participants, thread and message identifiers, timestamps, read and delivery state, and delivery errors. Conversations synchronize between the iOS app and WeddingWin.ca so participants can see the same text history in either client.

Native chat image selection and upload are disabled in this release. Profile/listing images and historical message media that were previously stored may still be processed according to the retention schedule.

If you report or block a conversation, we process the reporter, participants, reason and moderation state needed to close or review the conversation and protect users. Reporting closes the current conversation and suppresses the reported member in the app. A conversation created through an external website entry point can exist until synchronization discovers and closes it; this is not a promise of preventive website-wide blocking.

### QR Bingo and prize draws

The app uses the camera on your device to decode a participating vendor's QR code. Camera frames are not uploaded in the audited release. We receive the decoded vendor identifier with the signed-in account and retain vendor, event, scan time, duplicate state, and completion/progress information.

Scanning a code does not enter you in a prize draw. If you separately choose to enter a named vendor draw after reviewing its notice and official rules, we process your member ID, name, email, phone number, wedding date, vendor and event identifiers, consent wording/version/time, entry state, and potential-winner, verification, and fulfilment records.

The in-app release does not give a vendor an entrant contact list. Only if an entrant is selected as a potential winner may the disclosed name, email, phone number, wedding date, entry/consent time, and necessary verification information be provided to the named vendor, solely to verify eligibility and fulfil the prize. Draw entry is not consent to newsletters, lead generation, behavioural advertising, or other vendor marketing.

The sponsor/administrator, vendor role, eligibility, no-purchase method, dates, territory, skill-testing requirement where applicable, prize, odds, verification, and Apple non-involvement statement are governed by the official rules identified in publication schedule 1.

### Push notifications

If you enable notifications, we process an Expo push token, device platform, WeddingWin member linkage, enabled state, unread/notification time, delivery ticket and receipt state, retry state, and delivery errors. Expo and Apple Push Notification service receive the routing information and a generic new-message alert. The audited payload does not contain private message text.

You can change notification permission in iOS Settings. Signing out attempts to unregister the current device token. Account deletion removes or disables account-associated tokens from active systems, subject to the retention and backup schedule.

### Embedded website, device, and log information

Some WeddingWin.ca features open inside an embedded browser. The audited iOS configuration uses private/incognito WebView storage, restricts top-frame navigation, and disables third-party cookies. First-party session cookies or local storage may still be used during a session, and HTTPS embedded content can contact the recipients identified in publication schedule 2. Any analytics, advertising, or tracking requests—and the control that prevents or obtains consent for them—must be stated accurately in that schedule.

When the app requests our websites or APIs, the services receive operational data such as IP address, user agent or device/browser information, requested page or endpoint, referrer where supplied, date/time, session or account identifiers, response state, and security or error information. The final analytics, advertising, embedded-provider, and tracking practices are stated in publication schedule 2.

### Support and payment information

If you contact support, we process the contact details, message, attachments, and account or technical information you choose to provide so we can respond and maintain the service.

The submitted app's verified payment and purchase behavior, including any outside processor and whether WeddingWin receives card or purchase data, is stated in publication schedule 1. An outside processor also handles information under its own privacy policy.

## 3. Why we use information

We use information to:

- create, authenticate, secure, and support accounts;
- provide vendor discovery, profiles/listings, wedding-planning tools, and personalized account content;
- synchronize and deliver private messages and generic notifications;
- prevent abuse, investigate reports, enforce blocks, and protect the service;
- record QR Bingo progress and administer a draw a user separately chooses to enter;
- verify a potential winner and fulfil a prize under the official rules;
- diagnose errors, maintain reliability, prevent fraud, and comply with law; and
- respond to support and privacy requests.

Any analytics, advertising, marketing, tracking, or sale/share use is limited to the verified statement in publication schedule 2. Draw-entry data is not used for vendor marketing in this release.

## 4. When we disclose information

We disclose only the information reasonably needed for the stated purpose:

| Recipient | Information and purpose |
| --- | --- |
| WeddingWin.ca and its directory/hosting platform | Account, profile/listing, session, messaging, QR, draw, and web-request data needed to provide website and membership features |
| Supabase | Account/profile links, authentication mappings, messages and retained media, reports/blocks, push registration, QR/draw records, backend functions, security, and deletion workflows |
| Expo and Apple Push Notification service | Push token, routing/platform information, generic notification payload, and delivery state |
| Apple and Google | Authentication requests and related provider identifiers; each provider also processes information under its own policy |
| Selected prize vendor | Only a selected potential winner's disclosed contact, consent, and verification information for eligibility verification and prize fulfilment; no entrant list and no marketing use in this release |
| Support, email, payment, CDN, captcha, embedded-media, analytics, advertising, and logging providers | Only as identified, with data and purpose, in publication schedules 1 and 2 |
| Authorities, courts, professional advisers, or transaction counterparties | Information reasonably necessary to comply with law, protect rights or safety, prevent fraud, establish or defend claims, or complete a lawful business transaction with appropriate safeguards |

The selected vendor's legal privacy role, downstream request process, and contractual restrictions are stated in publication schedule 2. Information already delivered to a vendor cannot be technically recalled from the vendor's systems, but we will explain how to direct or coordinate a valid request.

## 5. Retention

We retain each category only for the period or objective criterion in publication schedule 3, then delete or de-identify it unless a narrower legal, safety, fraud, tax, contest-integrity, accounting, or dispute obligation requires longer retention. Any hold is limited to the information and period reasonably needed and is released when the reason ends.

Shared messages and moderation evidence can remain as read-only history for the surviving participant after the other participant deletes an account. The schedule states the finite duration or criterion, exceptions, backup expiry, and eventual deletion or de-identification for that history.

## 6. Account deletion and privacy choices

A signed-in iOS user can choose **About → Delete Account**, review the warning, and confirm. An Apple-linked account may be asked to reauthenticate so WeddingWin can validate and revoke the Apple authorization. A person who cannot sign in can use the public privacy-request URL in publication schedule 1; identity verification may be required before we change account data.

The deletion process removes the WeddingWin login, profile or vendor listing, provider mapping, push tokens, QR/draw records, pending account-owned chat work/cache, and other account-owned app data from active systems where permitted. It closes related conversations and blocks new sends. It does not erase the other participant's copy of shared messages; that history and necessary moderation evidence can remain read-only under the published retention schedule. Limited contest, safety, fraud, accounting, legal-hold, and backup records may remain only as the schedules explain.

Subject to applicable law, you may request access, correction, deletion, or a copy of your information; withdraw consent where processing depends on consent; object to or restrict certain uses; opt out of marketing or tracking where applicable; disable notifications; and complain to the relevant privacy regulator. The controller may need to verify identity and may explain a lawful exception. A privacy request does not create marketing consent and does not waive statutory rights merely because a draw deadline has passed.

## 7. Security

We use safeguards appropriate to the nature of the information, including encrypted transport, authenticated server requests, access controls, protected device credential storage, and controls intended to limit administrative/service access. No system is perfectly secure. Contact the privacy address in publication schedule 1 if you believe your account or information is at risk.

## 8. International processing

WeddingWin and the providers identified in publication schedule 2 may process information outside the province or country where you live. The schedule states the actual processing/storage regions and applicable transfer safeguards. Information can be subject to the laws and lawful access requests of those places.

## 9. Children

WeddingWin is not directed to children below the minimum account age stated in publication schedule 1. The same schedule states how to contact us about information provided by a child. Prize-draw age and residency requirements are stated in the applicable official rules and can be different from the minimum account age.

## 10. Changes to this policy

We may update this policy to reflect product, legal, or operational changes. We will post the revised policy with a new last-updated date and provide additional notice or obtain consent when law requires it.

## 11. Contact

The legal controller, mailing address, privacy email, public privacy-request URL, and support contact are listed in publication schedule 1.

---

## Final publication gate

- [ ] Every **OWNER/LEGAL/SECURITY/RELEASE REQUIRED** cell is replaced with verified public wording; this status/gate material is removed or converted into the completed public schedules.
- [ ] Exact TestFlight/network evidence matches the tracking, provider, payment, camera, media, push, WebView, and deletion statements.
- [ ] Retention periods have operational deletion/de-identification and backup controls behind them.
- [ ] App Store Privacy answers match this policy and the signed binary privacy report.
- [ ] Draw consent, official rules, vendor agreement, entry/export/email controls, and operations match the selected-potential-winner-only, fulfilment-only, no-marketing statements.
- [ ] The policy and public privacy-request URL render without login, broken layout, placeholder text, or consent conflicts on iPhone and iPad.
- [ ] Qualified privacy and promotions counsel approves the final text for every launch territory.

This publication candidate is product/privacy preparation, not legal advice.
