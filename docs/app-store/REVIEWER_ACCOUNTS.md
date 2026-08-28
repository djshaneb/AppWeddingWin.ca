# App Review account preparation

Status: **DRAFT CHECKLIST — no passwords belong in this file or in Git.**

Apple requires a demo account that does not expire when login is required. WeddingWin has materially different couple and vendor paths, so provide one private account for each role.

## Current prepared fixture

Private/nonpublic vendor review member `38970` and controlled couple member `38971` are assigned to isolated event `app-review-weddingwin-2026-38970`. Couple `38971` currently displays the first name `App Review`. The event has a dedicated QR payload (`https://www.weddingwin.ca/qr?vendor_id=38970`), fictional prize data, isolated scan/entry/draw state, and suppressed email delivery. The vendor remains inactive/nonpublic so its listing is not intentionally published.

This prepared fixture is not a recorded full-flow pass. Before submission, verify while signed out that the listing is absent from directory results, direct public profile access, search engines, sitemap, featured areas, public event rosters, and marketing feeds. Then verify couple/vendor login, dashboard, native text chat, QR scan, entry, and vendor draw from a clean install of the exact uploaded build. Do not describe a path to Apple until its checkbox below has evidence in the private release ticket.

Use `assets/app-store/sample-qr-review-vendor-38970.png`. Do not supply the legacy `23608` sample for App Review. The official-rules page and backend controls are deployed, but legal/owner approval of the sponsor model, vendor agreement, alternate free-entry operation, and final rules remains required. Production email is fail-closed and the reviewer fixture always suppresses email.

## Credential placeholders

| Role | App Store Connect value |
| --- | --- |
| Couple username | `<APP_REVIEW_COUPLE_EMAIL>` |
| Couple password | `<ENTER_ONLY_IN_APP_STORE_CONNECT>` |
| Couple member ID | `38971` |
| Vendor username | `<APP_REVIEW_VENDOR_EMAIL>` |
| Vendor password | `<ENTER_ONLY_IN_APP_STORE_CONNECT>` |
| Vendor member ID | `38970` |
| Review contact | `<NAME / EMAIL / +COUNTRY_CODE_PHONE>` |

Use unique strong passwords held in the team password manager. Paste them directly into App Store Connect’s encrypted review fields shortly before submission. Do not email them, put them in review-note attachments, commit them, or reuse an owner/admin password.

## Couple account checklist

- [ ] Authentication is active and bypasses no security requirement other users face.
- [ ] Membership/plan is the normal couple plan (`18` in the audited backend).
- [ ] Profile uses the verified fictional display name (`App Review`) plus controlled email/phone, a fictional future wedding date, and no real person's photo/data.
- [ ] Account and any profile are private/nonpublic and excluded from search/indexing.
- [ ] Email confirmation and any account activation are complete.
- [ ] Native session creation works from a clean install.
- [ ] A normal, unreported thread with the vendor review account is visible in both native chat and the website inbox.
- [ ] The account can send text in both directions. Native image sending is intentionally disabled for this release and is not included in the reviewer script.
- [ ] Push token can register on TestFlight and receive generic chat notifications.
- [ ] QR Bingo is available and the sample vendor has not already been scanned when the reviewer starts.
- [ ] If reviewing a vendor draw, the account has fictional name/email/phone/wedding date suitable for sharing with the controlled vendor.
- [ ] Draw entry does not subscribe the account to newsletters or vendor marketing; entry consent covers only draw administration and prize fulfilment.
- [x] A fresh disposable email account was created and passed the working-tree Simulator/backend deletion test (`38975`); its credentials no longer work and were not stored here. Create a new disposable account if App Review requests another destructive test.
- [ ] Repeat deletion against the exact uploaded build. An Apple-linked disposable account must also verify physical-device reauthentication/revocation and provider/backup behavior.

## Vendor account checklist

- [ ] Authentication is active even though the listing is nonpublic.
- [ ] Membership/plan is a production-equivalent vendor plan (`17`, `27`, or `28` in the audited client role logic; use the plan intended for release review).
- [ ] Business name, owner name, email, phone, logo and profile content are fictional/test-safe.
- [ ] Listing is hidden from public directory results, direct public profile browsing, search engines, sitemap, featured sections and marketing feeds. Verify while signed out in a private browser.
- [ ] The private/nonpublic setting does not prevent App Review from opening Vendor Dashboard, native chat, or Vendor Draw Settings.
- [ ] If the reviewer must test QR Bingo vendor tools, the account is present in the test event roster/tag without becoming publicly discoverable.
- [ ] Vendor draw contains a clearly labeled test prize and only fictional entries.
- [ ] Vendor draw rules are accessible before enabling entries.
- [ ] No entrant contact-list export is exposed to the vendor. Only controlled selected-potential-winner contact can be disclosed for verification/fulfilment.
- [ ] Review-fixture email delivery remains suppressed. Production email also remains disabled until its fulfilment path is explicitly configured, approved, and retested.
- [ ] Vendor terms, absence of entrant-list exports, suppressed email, and staff procedures prohibit using draw-entry contact data for marketing unless a separate optional consent is introduced and disclosed.
- [ ] Draw timing and maximum-selection controls permit the documented review flow, or the notes explain why a time-gated action is unavailable.

## Moderation test-state checklist

- [ ] Normal messaging thread is open before review begins.
- [ ] Report is tested last because it intentionally closes a conversation.
- [ ] A reported conversation cannot send from native app or website for either participant.
- [ ] Record the known boundary accurately: reporting closes the current website conversation and the app blocks/suppresses the reported member, but an external website entry point may create a fresh thread until synchronization discovers and closes it. Do not claim preventive website-wide user blocking unless a website-side creation hook is implemented and verified.
- [ ] Staff can see the report, respond within the published moderation timeframe, resolve it, and reset the review data if Apple requests.
- [ ] `info@weddingwin.ca` or the published safety contact is actively monitored during review.

## Operational safeguards

- [ ] Exempt review accounts from routine inactivity cleanup until review completes.
- [ ] Do not exempt them from authorization, privacy, moderation, or data-sharing controls.
- [ ] Disable newsletters/promotional campaigns unless testing them is part of review.
- [ ] Monitor backend availability and test-inbox delivery during the review window.
- [ ] Store a documented reset procedure for messages, QR scans, raffle entries, report/block state and disposable deletion accounts.
- [ ] Obtain an owner/legal/product decision on account deletion removing the complete shared conversation, including the other participant's copy; make the warning, public policy, and implementation agree.
- [ ] Keep reviewer credentials only in the team password manager and App Store Connect's credential fields. Confirm `docs/app-store/private-reviewer-credentials.md` remains ignored and untracked.
- [ ] Re-verify credentials immediately before pressing Submit for Review and daily while in review.
