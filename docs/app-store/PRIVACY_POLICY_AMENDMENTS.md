# Privacy Policy amendment checklist

Status: **DRAFT CHECKLIST — owner and legal review required.**

The current public policy at `https://www.weddingwin.ca/about/privacy` is website-oriented and does not precisely describe the iOS app, native chat mirror, Expo push, Supabase tables, QR scans, vendor-draw sharing, or complete account deletion. It also broadly says targeted advertising/ad-network tracking “may” occur. Before submission, publish a dated revision that accurately reflects production behavior.

## Required structural changes

- [ ] Name the legal controller/developer consistently: `Wedding Win Inc.` versus `WeddingWin.ca`. State the legal address and privacy contact. **OWNER/LEGAL CONFIRMATION**
- [ ] State that the policy covers the WeddingWin iOS app, WeddingWin.ca pages embedded in the app, related APIs, QR Bingo, private messaging, and vendor draws.
- [ ] Add an effective date, revision date, and version that matches the consent version used by the release build.
- [ ] Replace broad template language with specific present-tense practices. If advertising or cross-site tracking is not actually used, remove those statements; if it is used, name the categories/vendors and implement the required consent and App Privacy answers.
- [ ] Add a concise table of data category, source, purpose, recipient, retention, and user choice.

## Data categories to describe explicitly

- [ ] Account/contact: name, email, phone, company, role/membership plan, city/province/country/postal code, profile photo and listing/profile information.
- [ ] Wedding planning: wedding date and any other planning/profile details. Wedding date is not automatically Apple “Sensitive Info,” but it is personal information.
- [ ] Authentication: Sign in with Apple/Google claims, Apple stable subject identifier, WeddingWin member ID, Supabase profile ID, session token and cookie. Explain that secrets/session data are protected and are not sold.
- [ ] Private chat: participants, message text, thread/message IDs, timestamps, read/delivery state, delivery errors, reports and conversation closures/blocks; explain app↔website synchronization. Native image sending is disabled in this release; separately describe any retained historical message media.
- [ ] Describe report/block scope accurately: reporting closes the current website conversation and the app suppresses the reported member, but an external website entry point may create a fresh thread until synchronization closes it. Do not promise preventive website-wide blocking unless that hook is added and verified.
- [ ] QR Bingo: decoded vendor ID, scan/progress history, event and vendor identifiers.
- [ ] Vendor draw: vendor prize/settings, entrant member ID, name, email, phone, wedding date, opt-in wording/version/time, winner/draw records, and email-delivery status.
- [ ] Push: Expo push token, device platform, member ID/token linkage, unread count and notification timestamps; state that current push payloads do not contain private message text.
- [ ] Web traffic: actual cookies, local/DOM storage, IP address, user agent/browser data, page/link/search activity, referrer, captcha, analytics, ads/pixels and logs used on WeddingWin.ca pages embedded in the app.
- [ ] Describe the final verified WebView behavior, not source intent: allowed in-app hosts, external/off-domain navigation, redirects/pop-ups, bridge origin, third-party cookies, session storage, login/logout clearing, blocked tracking scripts, and the fact that server-side collection still occurs where disclosed.
- [ ] Support: support emails/contact-form messages and attachments, if retained.
- [ ] Payments: actual current vendor-subscription/payment flow and processor. State whether Wedding Win can access payment-card data. **OWNER CONFIRMATION**

## Collection sources and purposes

- [ ] Explain data received directly from users, from Apple/Google login, from WeddingWin.ca membership/profile records, from device/app events, and from participating vendors.
- [ ] Tie each category to a purpose: authentication/account management, vendor discovery, private messaging, security/fraud prevention, push alerts, QR scan progress, raffle administration/fulfilment, support, analytics, and marketing only where genuinely applicable. Raffle entry is not marketing consent in the release posture.
- [ ] State that camera frames remain on-device for QR decoding and only the matched vendor identifier is sent, if production behavior remains as audited.
- [ ] State that native chat image selection/upload is disabled in this release. If it is re-enabled later, add a separate photo-library collection/retention disclosure and retest permission behavior before release.
- [ ] Explain why phone and wedding date may be disclosed to the selected raffle vendor and that this occurs only for a selected potential winner after a separate, named-vendor opt-in, solely for verification and prize fulfilment.

## Sharing and processors

- [ ] Identify Supabase, Expo push, the WeddingWin.ca directory/hosting platform, Apple, Google, email delivery, payment, captcha, CDN, analytics and advertising providers actually used in production.
- [ ] For each, state what it receives, why, where it processes data, retention/contract controls, and a link to its privacy information where appropriate.
- [ ] Describe the participating vendor as a recipient only of a selected potential winner's disclosed contact/verification data after named-vendor opt-in. State whether the vendor acts independently, jointly, or only on Wedding Win’s instructions. **LEGAL CONFIRMATION**
- [ ] Restrict vendor use contractually and operationally to administration of the named draw and prize fulfilment. The initial release must not treat entry as vendor-marketing consent; any later marketing option must be separate, optional, withdrawable, and reflected in the rules, policy, App Privacy answers, vendor agreement, and deployed UI.
- [ ] Include Apple’s required assurance that third parties receiving user data provide the same or equivalent protection promised by Wedding Win.
- [ ] State whether data is sold or shared for cross-context behavioral advertising under applicable law. **LEGAL CONFIRMATION**

## Retention, deletion, and choices

- [ ] Publish actual retention periods or clear criteria for accounts/profiles, authentication mappings, session logs, messages/retained media, reports/blocks, push tokens, QR scans, raffle entries/draws, support requests, web analytics and backups. No retention periods are currently established by this draft.
- [ ] Explain in-app deletion accurately: a signed-in user chooses About → Delete Account, reviews the permanent-deletion warning, and confirms in the native app. Apple-linked accounts may require Sign in with Apple reauthentication/revocation. A public privacy-request/deletion page remains a supplemental route for people who cannot sign in.
- [ ] Distinguish account deactivation from deletion. Apple requires account deletion, not merely disabling login.
- [ ] State exactly which systems and account-owned records are deleted: WeddingWin.ca member/profile/listing and owned content; Supabase auth/profile and Apple mapping; the deleting member's pending chat outbox/cache data; push tokens; QR scan data; raffle entries/settings/draw data where permitted; and backups on expiry.
- [ ] Disclose the shared-conversation effect accurately. The deployed design closes app/website conversation aliases, blocks new sends involving the deleted member, and preserves shared message history plus report/block evidence as read-only for the surviving participant; a fresh two-participant email-account test passed. Owner/legal must set a finite retention duration or objective criterion, any longer legal/safety holds, and the eventual deletion/de-identification outcome; make the confirmation warning, policy, operations, and exact TestFlight/physical test agree.
- [ ] Explain exceptions that must be retained for fraud, legal, accounting, contest integrity, safety reports, or dispute records, with category and duration.
- [ ] Revoke Sign in with Apple tokens/authorization when applicable and describe the effect of disconnecting Google.
- [ ] Explain that data already disclosed to a participating vendor cannot be “unshared,” but users can request deletion from Wedding Win and, where applicable, the vendor. Do not imply that draw entry creates marketing consent; if a separate future marketing consent exists, explain how to withdraw it.
- [ ] Replace or legally review “This opt-in is final.” It should not imply users waive statutory privacy rights. A safer concept is: entry cannot be withdrawn after the draw deadline where contest law permits, but privacy and marketing rights remain available.
- [ ] Explain how to access, correct, export, object, withdraw consent, disable notifications, and complain. Provide expected response and verification steps.
- [ ] Make the privacy-choices/deletion page publicly accessible without first needing a working login, while requiring identity verification before data changes.

## Children, geography, and legal basis

- [ ] State the minimum account age and the age-of-majority rule for raffle entry. Add an age gate if the official rules require one. **OWNER/LEGAL CONFIRMATION**
- [ ] Confirm the app is not directed to children and describe deletion of inadvertently collected child data.
- [ ] Address Canadian requirements, including PIPEDA and applicable provincial law, and any other storefront territories selected. **LEGAL CONFIRMATION**
- [ ] State international processing/transfers accurately; the current policy references U.S. and other-country servers.
- [ ] For consent, contract, legal obligation, or legitimate-interest bases, map the basis to the actual processing and territory. **LEGAL CONFIRMATION**

## Security and incident handling

- [ ] Describe transport encryption, access control/RLS/service-role access, iOS SecureStore, least-privilege administration, logging, backups and vendor controls without claiming absolute security.
- [ ] Explain whether historical chat images remain stored as encoded image data in Supabase/WeddingWin systems even though native image sending is disabled in this release.
- [ ] Publish an incident-response contact and any legally required breach-notification process.

## Final consistency check

- [ ] Compare the revised policy against App Store Connect App Privacy answers line by line.
- [ ] Compare it against the final Xcode privacy report/privacy manifests and the actual production website network log.
- [ ] Reverify the implemented WebView host/navigation, bridge-origin, tracking-script, and cookie controls on the exact tagged/TestFlight build; source allowlists and cookie flags are not deployment or network-behavior evidence.
- [ ] Verify production push configuration and behavior: Expo project ID, App ID capability, APNs credential, token registration, generic payload content, sign-out/deletion cleanup, and foreground/background/terminated delivery on a physical iPhone.
- [ ] Verify the policy and privacy-choices URLs render without authentication, CAPTCHA failure, broken layout, or placeholder language on iPhone and iPad.
- [ ] Obtain owner approval and qualified legal review before publishing. This checklist is technical preparation, not legal advice.
