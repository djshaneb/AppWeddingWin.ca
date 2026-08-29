# Privacy policy publication checklist

Status: **CODE-OWNED CHECKLIST FINAL — publication remains blocked on owner/legal/live-system facts.**

Use `PRIVACY_POLICY_REPLACEMENT_DRAFT.md` as the publication candidate. Its code-backed prose is complete; unresolved facts are isolated in four schedules. Do not patch the current generic website policy with selected paragraphs or publish either tracking variant speculatively.

## Why the current public page must be replaced

The live `https://www.weddingwin.ca/about/privacy` page is website-oriented and does not adequately cover the iOS app, Supabase, native/website chat synchronization, Expo/APNs push, QR scans, vendor-draw sharing, or current account deletion. It broadly describes targeted advertising and third-party tracking, and the live site currently requests Meta Pixel from `connect.facebook.net` (pixel ID `1947515779077331`). The native WebView uses the `WeddingWinApp/1.0` user-agent tag, incognito mode, disabled third-party cookies, and client-side interception, but none of those facts alone proves the pixel request is prevented. App Store Privacy answers cannot be made consistent until exact-build traffic is inventoried and one accurate tracking path is implemented.

The existing `https://www.weddingwin.ca/account/deleteaccount` route redirects signed-out users to login. It is not ready to serve as the public privacy-choices URL.

## Owner/legal completion

- [ ] Confirm the exact legal controller/developer identity, mailing address, monitored privacy contact, support contact, effective date, minimum account age, launch territories, and applicable privacy regimes.
- [ ] Publish a mobile-friendly privacy-request page that is reachable without login while still verifying identity before changing data.
- [ ] Approve the finite duration or objective criterion for every category in publication schedule 3, including surviving-participant message history, moderation records, draw/contest records, logs, backups, and legal holds.
- [ ] Confirm payment/purchase behavior reachable in the submitted app and whether WeddingWin receives payment or purchase information.
- [ ] Decide the prize-vendor privacy role and request handoff; make the vendor agreement support the selected-potential-winner-only, verification/fulfilment-only, no-marketing promise.
- [ ] Confirm the draw developer/sponsor/administrator identity, rules, territory, age, no-purchase method, dates, skill question, prize, vendor role, and Apple non-involvement language.
- [ ] Obtain qualified privacy and promotions counsel review for every launch territory. The repository materials are technical preparation, not legal advice.

## Release-owner evidence

- [ ] Audit exact TestFlight traffic for every embedded WeddingWin page and subresource: scripts, first/third-party cookies, local storage, redirects, Vimeo/other embeds, analytics, ads, captcha, CDN, email, support, payment, logging, IP/user-agent retention, and recipients.
- [ ] Preferred v1 path: suppress Meta Pixel server-side whenever the `WeddingWinApp/1.0` user-agent tag is present, then capture exact-TestFlight evidence that no Meta/tracking request occurs before or after page load.
- [ ] If server-side suppression is not used or does not pass, implement required consent/ATT before tracking data is sent and disclose the affected data types, partners, purposes, linking, and tracking in App Store Connect and the policy.
- [ ] Replace the tracking/advertising schedule with one present-tense answer and make App Store Privacy, website notices, provider contracts, and the implemented suppression or consent path agree.
- [ ] Verify physical printed-QR behavior: camera frames stay on device and only the decoded/matched vendor identifier is transmitted.
- [ ] Verify native image upload remains unavailable and inventory profile/listing images plus retained historical message media.
- [ ] Verify physical TestFlight push token registration/rotation, generic payload with no message text, foreground/background/terminated delivery, sign-out cleanup, invalid-token handling, and deletion cleanup.
- [ ] Verify exact-build signed-in deletion, physical Apple reauthentication/revocation, Google/provider handling, all active stores, shared read-only history, report/block records, email systems, object storage, and backup expiry.
- [ ] Verify the public policy and privacy-request URLs work signed out on iPhone and iPad without a broken layout, redirect loop, CAPTCHA failure, stale copy, or unresolved schedule label.

## Final consistency review

- [ ] Compare each App Store Privacy data type, purpose, linked/tracking choice, and privacy URL against the completed policy.
- [ ] Compare the policy against the signed binary privacy report and production network log.
- [ ] Compare deletion wording in About, policy, support scripts, backend operations, and reviewer notes. It must say related conversations close while shared history may remain read-only for the other participant under the approved retention schedule.
- [ ] Compare QR/draw wording across entry UI, official rules, privacy notice, vendor agreement, email templates, App Review notes, and operations. Entry must remain separate from scanning and must not become marketing consent.
- [ ] Confirm the completed policy is versioned, dated, archived, and linked from the submitted app before review.

No publication or deployment is performed by this checklist.
