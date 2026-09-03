# App Review notes

Status: **FINAL TEMPLATE — release gates remain open.**

The paste block is under Apple's 4,000-byte limit. Put the primary couple credentials in App Store Connect's sign-in fields. This file contains no password.

Do not paste until:

- [ ] Replace only `[[PRIVATE_VENDOR_CREDENTIALS]]` from the password manager; never save the completed text.
- [ ] Both accounts and non-expiring pair access pass on processed TestFlight.
- [ ] Reset couple `38971`/isolated event; attach `sample-qr-review-vendor-38970.png`.
- [ ] Physical Apple/Google, printed QR, push, and iPad gates pass.
- [ ] On the processed TestFlight build, the iOS system picker selects/cancels correctly without a broad photo-library permission prompt, and attachment upload, app↔website persistence, report/block, and deletion/retention behavior pass on a physical iPhone.
- [ ] Final privacy policy, free-app/paid-admission boundary, vendor-draw rules, and role disclosures are published and verified.
- [ ] Vendor `38970` has reviewed and accepted Official Rules version `2026-09-01-in-person-entry`, including the named-vendor contact-use and marketing responsibilities; the isolated fixture is enabled, reset, contains only fictional contact/profile data, and still suppresses outbound email and any real prize.

```text
WeddingWin connects couples with wedding vendors. App/account features are free with no subscriptions or IAP. Advance general admission is free while allocated tickets remain; VIP is paid; without an advance general ticket, admission must be purchased at the door.

ACCOUNTS
Use the couple account in App Store Connect's sign-in fields. It is member 38971 and displays the fictional name “App Review.”

Additional private vendor account:
[[PRIVATE_VENDOR_CREDENTIALS]]
This is member 38970. Its listing is nonpublic; the account can use its dashboard, draw tools, and private text chat.

COUPLE FLOW
1. Launch WeddingWin, choose Couple, and sign in with the primary account.
2. Use the home screen's vendor-search, message, website, and QR Bingo tools.
3. In Private Messages, open the prepared review-vendor conversation. Tap Attach, use the iOS system picker to choose a fictional photo, and send it. No broad photo-library prompt should appear. The app resizes/re-encodes the image; the server rejects invalid or oversized files. Reporting and retention apply.
4. In QR Bingo, scan the attached QR for vendor 38970. The scan records an isolated booth visit and cannot change production event data. Camera frames are not uploaded.
5. A separate offer appears. Open rules 2026-09-01-in-person-entry; confirm eligibility and explicitly agree that vendor 38970 may receive the fictional name, email, provided phone/wedding date, and consent evidence for this draw and its wedding-related offers or promotions; then Enter. Scanning alone never enters, and declining leaves only the booth-visit record. In production, this in-show QR entry is the digital replacement for a paper ballot and is available only after the eligible couple visits and scans the named vendor's booth. One entry is allowed per eligible couple for that vendor draw. The isolated fixture emulates the booth scan for review, awards no real prize, and sends no email.

VENDOR FLOW
1. Sign out, choose Vendor, and use the additional account above.
2. Open Vendor Dashboard, Private Messages, and Draw.
3. Draw shows settings, count, named-vendor entrant CSV, and potential-winner flow. Accept rules 2026-09-01-in-person-entry if asked. The CSV is exact-vendor/event scoped, uses fictional name/contact/wedding data and consent evidence, and marks the named-vendor marketing consent as included. Legacy entries without fresh current-version consent must be absent. Before confirm/disqualify, independently verify eligibility, attest that the declaration/release was obtained, enter the math answer, and add a dated non-sensitive method/reference note. Wedding Win records the attestation but does not perform that vendor work. Review-fixture notices stay blocked; production verified-winner notices are not suppressed.
4. The prepared conversation mirrors WeddingWin.ca text chat. The active couple can reply from the website and the reply appears in the vendor app.

MESSAGING SAFETY
Use Report last: it closes the conversation, keeps read-only history, removes the composer, and suppresses the member. An external website thread may exist until app sync closes it.

ACCOUNT DELETION
For a disposable account, choose About > Delete Account. Account-owned data is removed and conversations close; approved shared history may remain read-only. Do not delete standing accounts; request one from support.

NOTIFICATIONS AND PERMISSIONS
Notifications are optional and generic. Camera is for QR scanning. Attach uses the iOS selected-item system picker without requesting broad photo-library access. Microphone and background location are unused.

QR BINGO AND VENDOR DRAWS
A scan records progress only; entry is separate and limited to one per eligible couple/vendor across methods. The named vendor sponsors, operates, and fulfils its prize. Wedding Win supplies the technical workflow and remains responsible for its own technology/privacy duties. Apple is not a sponsor.

QR Bingo notice: https://www.weddingwin.ca/qr-bingo-vendor-draw-rules
Support/reset contact: info@weddingwin.ca
```

Photo attachments are controlled by an explicit backend rollout gate. Accepted uploads must pass declared type, strict base64 and full-decode checks, decoded-size and image-dimension limits, and the rollout cutoff. The client re-encodes the selected asset as a resized JPEG before upload. This is not a claim of automated semantic image moderation; the documented report, block, closure, and retention controls still apply.
